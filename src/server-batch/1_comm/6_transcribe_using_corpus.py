#!/usr/bin/env python3
"""Transcription-first pipeline that reuses full-file WhisperX outputs."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import shutil
import sys
import threading
import wave
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from concurrent.futures import ThreadPoolExecutor, as_completed

import whisperx  # type: ignore
from dotenv import load_dotenv
from pydub import AudioSegment  # type: ignore
from rich.console import Console
from rich.logging import RichHandler


# ---------------------------------------------------------------------------
# Constants & Configuration
# ---------------------------------------------------------------------------

MODEL_TYPE = "large-v3"
DEVICE = "cuda"
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
BATCH_SIZE = 32
CHUNK_LENGTH = 30
FRAME_DURATION_SECONDS = 0.02
MIN_WAIT_BLOCKS = 10
PRE_ROLL_BLOCKS = 2
POST_ROLL_BLOCKS = MIN_WAIT_BLOCKS
AAC_BITRATE = "96k"
CACHE_SUFFIX = ".transcription.json"
ALIGNMENT_CACHE_SUFFIX = ".alignment.json"
PROMPT_ROOT_SUBPATH = "prompt_context"

ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
TRACKING_DIR = Path(__file__).parent.parent
CURRENT_IA_ZIP_WAVS_WORKING = Path("F:/tempF/iss_working/current_ia_zip_wavs")

IA_ZIPS_PROCESSED_TRACKING_FILE = TRACKING_DIR / "ia_zips_processed.txt"
IA_ZIPS_IN_PROGRESS_TRACKING_FILE = TRACKING_DIR / "ia_zips_in_progress.txt"
IA_SKIP_ZIPS_TRACKING_FILE = TRACKING_DIR / "ia_skip_zips.txt"
IA_ZIPS_ERRORS_TRACKING_FILE = TRACKING_DIR / "ia_zips_errors.txt"

ZIP_PENDING_GRACE_PERIOD = dt.timedelta(minutes=10)

file_lock = threading.RLock()
exit_event = threading.Event()
immediate_exit_event = threading.Event()
stdout_silence_lock = threading.RLock()

console = Console()
logger = logging.getLogger("transcription-first")


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class SilenceConfig:
    frame_duration_seconds: float = FRAME_DURATION_SECONDS
    min_gap_blocks: int = MIN_WAIT_BLOCKS
    pre_roll_blocks: int = PRE_ROLL_BLOCKS
    post_roll_blocks: int = POST_ROLL_BLOCKS

    @property
    def silence_threshold(self) -> float:
        return self.frame_duration_seconds * self.min_gap_blocks

    @property
    def pre_roll(self) -> float:
        return self.frame_duration_seconds * self.pre_roll_blocks

    @property
    def post_roll(self) -> float:
        return self.frame_duration_seconds * self.post_roll_blocks


@dataclass
class Interval:
    index: int
    start: float
    end: float
    words: List[Dict[str, object]]

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass
class TranscriptionArtifacts:
    language: str
    detected_language: str
    final_segments: List[Dict[str, object]]
    source_segments: List[Dict[str, object]]
    alignment_segments: List[Dict[str, object]]
    translation_segments: Optional[List[Dict[str, object]]] = None
    prompt_text: str = ""


@dataclass
class WhisperResources:
    base_model: object
    align_models: Dict[str, Tuple[object, Dict[str, object]]]
    _align_lock: threading.RLock = field(default_factory=threading.RLock)

    @classmethod
    def load(
        cls, device: str, model_type: str, compute_type: str
    ) -> "WhisperResources":
        console.log(
            f"Loading WhisperX base model '{model_type}' on {device} ({compute_type})"
        )
        base_model = whisperx.load_model(
            model_type,
            device,
            compute_type=compute_type,
        )
        return cls(base_model=base_model, align_models={})

    def get_alignment_model(self, language: str) -> Tuple[object, Dict[str, object]]:
        language = language or "en"
        key = language.lower()
        with self._align_lock:
            if key not in self.align_models:
                console.log(f"Loading alignment model for language '{key}'")
                align_model, metadata = whisperx.load_align_model(
                    language=key, device=DEVICE
                )
                self.align_models[key] = (align_model, metadata)
            return self.align_models[key]


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class FilenameParseError(Exception):
    """Raised when a WAV filename cannot be parsed."""


class ZipPendingDownloadError(Exception):
    """Raised when a zip file appears to still be downloading."""


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def configure_logging(debug: bool = False) -> None:
    handler = RichHandler(console=console, show_level=True, show_time=True)
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(message)s",
        handlers=[handler],
    )
    logger.setLevel(logging.DEBUG if debug else logging.INFO)


def load_environment(env_path: Path | None = None) -> None:
    env_path = env_path or ROOT_ENV_PATH
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_tracking_file(file_path: Path) -> List[str]:
    with file_lock:
        if file_path.exists():
            return [line.strip() for line in file_path.read_text().splitlines() if line]
    return []


def add_to_tracking_file(file_path: Path, item: str) -> None:
    with file_lock:
        items = set(read_tracking_file(file_path))
        if item not in items:
            items.add(item)
            file_path.write_text("\n".join(sorted(items)))


def remove_from_tracking_file(file_path: Path, item: str) -> None:
    with file_lock:
        if not file_path.exists():
            return
        items = [line.strip() for line in file_path.read_text().splitlines() if line]
        if item in items:
            items.remove(item)
            file_path.write_text("\n".join(items))


def read_skip_list(file_path: Path) -> List[str]:
    return read_tracking_file(file_path)


def zip_likely_in_progress(zip_path: Path) -> bool:
    try:
        stat_info = zip_path.stat()
    except OSError:
        return False
    if stat_info.st_size == 0:
        return True
    last_modified = dt.datetime.fromtimestamp(stat_info.st_mtime)
    return dt.datetime.now() - last_modified <= ZIP_PENDING_GRACE_PERIOD


def parse_wav_filename(
    filename: str, downlink_number: Optional[int] = None
) -> Tuple[str, str]:
    import re

    basename = os.path.splitext(filename)[0]
    patterns = [
        # Pattern 1: 0000000000_SYNC_SG4_2024-01-08_02_09_04_by_servername_desc
        r"^\d+_SYNC_(SG\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 2: 0000000000_1_SG4_DUP_2024-07-02_13_56_41_by_ui_startdate_desc
        r"^\d+_\d+_(SG\d+)_DUP_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 3: 0000000038_SYNC_SG_2_2015-10-13_12_09_27_by_ui_duration_desc.wav
        r"^\d+_SYNC_SG_(\d)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 4: 0000000140_Channel_15_2015-12-18_20_41_59_by_ui_startdate_asc.wav
        r"^\d+_Channel_(\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 5: 2022-03-30-08-30-42-019-Recorder.wav
        r"^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-Recorder$",
        # Pattern 6: 0000000019_DG_1_2021-04-23_02_24_01_by_ui_startdate_utc_asc.wav
        r"^\d+_(DG)_(\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 7: 0000000018_CST_AG-1_2024-05-06_18_53_37_by_ui_startdate_desc.wav
        r"^\d+_(?:CST_)?(AG-\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 8: 0000000012_DG-1_2021-11-11_18_26_36_by_ui_startdate_desc.wav
        r"^\d+_(DG-\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 9: 0000000013_CST_AG-2__2024-09-04_09_36_01_by_ui_startdate_desc.wav
        r"^\d+_(?:CST_)?(AG-\d+)__(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 10: Handle any other AG/DG patterns with multiple underscores
        r"^\d+_(?:CST_)?([AD]G-\d+)_{1,10}(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
        # Pattern 11: 0000000000_DG2_2020-05-27_07_52_42_by_ui_startdate_desc.wav
        r"^\d+_(DG\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    ]

    try:
        for pattern in patterns:
            match = re.match(pattern, basename)
            if not match:
                continue

            # Pattern 5: recorder style
            if pattern.endswith("-Recorder$") and len(match.groups()) == 0:
                parts = basename.split("-")
                if len(parts) >= 7:
                    date_part = f"{parts[0]}-{parts[1]}-{parts[2]}"
                    time_part = f"{parts[3]}{parts[4]}{parts[5]}"
                    date_time = f"{date_part}T{time_part}"
                    sg_channel = str(downlink_number) if downlink_number else "0"
                    sg_channel_descriptor = f"1_SG_{sg_channel}"
                    return date_time, sg_channel_descriptor
                continue

            # Pattern 11 (DG with number attached)
            if "DG\\d+" in pattern:
                channel_str = match.group(1)
                channel_type = re.sub(r"(DG)(\\d+)", r"1_\\1_\\2", channel_str)
                date_part = match.group(2)
                hour = match.group(3)
                minute = match.group(4)
                second = match.group(5)
                date_time = f"{date_part}T{hour}{minute}{second}"
                return date_time, channel_type

            # Patterns with double underscores / variable underscores
            if "__" in pattern or "_{1,10}" in pattern:
                channel_type = match.group(1).replace("-", "_")
                channel_type = f"1_{channel_type}"
                date_part = match.group(2)
                hour = match.group(3)
                minute = match.group(4)
                second = match.group(5)
                date_time = f"{date_part}T{hour}{minute}{second}"
                return date_time, channel_type

            # AG/DG with dashes
            if "AG-" in pattern or "DG-" in pattern:
                channel_type = match.group(1).replace("-", "_")
                channel_type = f"1_{channel_type}"
                date_part = match.group(2)
                hour = match.group(3)
                minute = match.group(4)
                second = match.group(5)
                date_time = f"{date_part}T{hour}{minute}{second}"
                return date_time, channel_type

            if "_(DG)_" in pattern:
                channel_type = f"1_{match.group(1)}_{match.group(2)}"
                date_part = match.group(3)
                hour = match.group(4)
                minute = match.group(5)
                second = match.group(6)
                date_time = f"{date_part}T{hour}{minute}{second}"
                return date_time, channel_type

            # Patterns 1-4 for SG
            sg_key = match.group(1)
            if sg_key == "14":
                sg_channel = "1"
            elif sg_key == "15":
                sg_channel = "2"
            elif sg_key == "16":
                sg_channel = "3"
            elif sg_key == "17":
                sg_channel = "4"
            else:
                sg_channel = str(downlink_number) if downlink_number else sg_key[-1]

            date_part = match.group(2)
            hour = match.group(3)
            minute = match.group(4)
            second = match.group(5)
            date_time = f"{date_part}T{hour}{minute}{second}"
            sg_channel_descriptor = f"1_SG_{sg_channel}"
            return date_time, sg_channel_descriptor
    except Exception as exc:
        logger.error("Error parsing filename %s: %s", filename, exc)
        raise FilenameParseError(f"Error parsing filename: {exc}") from exc

    raise FilenameParseError(
        f"Unable to parse filename '{filename}'. No pattern matched."
    )


def unzip_ia_zip_wavs(zip_path: Path, destination_dir: Path, zip_type: str) -> None:
    if not zipfile.is_zipfile(zip_path):
        if zip_likely_in_progress(zip_path):
            raise ZipPendingDownloadError(str(zip_path))
        add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, zip_path.name)
        raise zipfile.BadZipFile(f"{zip_path} is not a valid zip archive")

    filename = zip_path.name
    parts = [filename[0:2], filename[3:5], filename[6:8]]
    zip_date = f"20{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for file_info in zip_ref.infolist():
            if not file_info.filename.lower().endswith(".wav"):
                continue
            original_name = os.path.basename(file_info.filename)
            folder_suffix = os.path.dirname(file_info.filename)[-1:]
            downlink = None
            if (
                zip_type == "SG"
                and folder_suffix.isdigit()
                and int(folder_suffix) in range(1, 5)
            ):
                downlink = int(folder_suffix)
            try:
                date_time, descriptor = parse_wav_filename(original_name, downlink)
            except FilenameParseError as exc:
                logger.critical("Critical filename error in %s: %s", zip_path.name, exc)
                add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, zip_path.name)
                add_to_tracking_file(IA_SKIP_ZIPS_TRACKING_FILE, zip_path.name)
                raise

            file_date = date_time.split("T")[0]
            if file_date != zip_date:
                logger.warning(
                    "Date mismatch between %s and %s (zip %s); skipping",
                    file_date,
                    zip_date,
                    zip_path.name,
                )
                continue

            new_file_name = f"{date_time}-{descriptor}_IA.wav"
            destination_file_path = destination_dir / new_file_name
            counter = 1
            base_name = destination_file_path.stem
            while destination_file_path.exists():
                destination_file_path = destination_dir / f"{base_name}_{counter}.wav"
                counter += 1

            with zip_ref.open(file_info) as source_file:
                with open(destination_file_path, "wb") as target_file:
                    shutil.copyfileobj(source_file, target_file)


def ensure_mono_wav(input_wav_path: Path) -> Optional[Path]:
    try:
        with wave.open(str(input_wav_path), "rb") as wf:
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            frame_rate = wf.getframerate()
    except Exception as exc:
        logger.warning("wave.open failed for %s: %s", input_wav_path, exc)
        n_channels = 0
        sample_width = 2
        frame_rate = 0

    need_conversion = n_channels != 1 or frame_rate != 32000
    if not need_conversion:
        return input_wav_path

    try:
        audio = AudioSegment.from_file(input_wav_path)
        audio = audio.set_channels(1)
        audio = audio.set_frame_rate(32000)
        converted_path = input_wav_path.with_name(f"{input_wav_path.stem}_mono32.wav")
        audio.export(converted_path, format="wav")
        return converted_path
    except Exception as exc:
        logger.error("Mono conversion failed for %s: %s", input_wav_path, exc)
        return None


@contextmanager
def suppress_stdout_stderr():
    with stdout_silence_lock:
        with open(os.devnull, "w") as devnull:
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            try:
                sys.stdout = devnull
                sys.stderr = devnull
                yield
            finally:
                sys.stdout = old_stdout
                sys.stderr = old_stderr


def build_initial_prompt(
    comm_datetime: dt.datetime, descriptor: str, prompt_root: Path
) -> str:
    prompt_dir = prompt_root / comm_datetime.strftime("%Y/%m/%d")
    prompt_file = prompt_dir / "prompt.txt"
    if prompt_file.exists():
        prompt_text = prompt_file.read_text(encoding="utf-8").strip()
    else:
        prompt_text = ""
        json_fallback = prompt_dir / "prompt_input.json"
        if json_fallback.exists():
            try:
                data = json.loads(json_fallback.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    prompt_candidates = []
                    if "prompt" in data:
                        prompt_candidates.append(str(data["prompt"]))
                    if "segments" in data and isinstance(data["segments"], Sequence):
                        prompt_candidates.extend(
                            str(item)
                            for item in data["segments"]
                            if isinstance(item, (str, dict))
                        )
                    prompt_text = "\n".join(prompt_candidates).strip()
                elif isinstance(data, list):
                    prompt_text = "\n".join(str(item) for item in data)
            except json.JSONDecodeError as exc:
                logger.warning("Failed to parse %s: %s", json_fallback, exc)

    channel_hint = f"Channel: {descriptor.replace('_', ' ')}"
    if prompt_text:
        return f"{prompt_text}\n\n{channel_hint}"
    return channel_hint


def transcribe_full_wav(
    wav_path: Path,
    descriptor: str,
    start_time: dt.datetime,
    prompt_text: str,
    resources: WhisperResources,
    cache_dir: Path,
    force: bool,
) -> TranscriptionArtifacts:
    cache_file = cache_dir / f"{wav_path.stem}{CACHE_SUFFIX}"
    if cache_file.exists() and not force:
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            return TranscriptionArtifacts(
                language=cached["language"],
                detected_language=cached.get("detected_language", cached["language"]),
                final_segments=cached["final_segments"],
                source_segments=cached["source_segments"],
                alignment_segments=cached["alignment_segments"],
                translation_segments=cached.get("translation_segments"),
                prompt_text=cached.get("prompt_text", ""),
            )
        except Exception as exc:
            logger.warning("Failed to load cache %s: %s", cache_file, exc)

    with suppress_stdout_stderr():
        audio = whisperx.load_audio(str(wav_path))

    logger.debug("Transcribing %s", wav_path.name)
    with suppress_stdout_stderr():
        result = resources.base_model.transcribe(
            audio,
            batch_size=BATCH_SIZE,
            chunk_length=CHUNK_LENGTH,
            condition_on_previous_text=False,
            beam_size=2,
            best_of=2,
            temperature=0,
            initial_prompt=prompt_text,
            word_timestamps=True,
        )

    detected_language = result.get("language", "en") or "en"
    align_model, metadata = resources.get_alignment_model(detected_language)
    with suppress_stdout_stderr():
        alignment = whisperx.align(
            result["segments"],
            align_model,
            metadata,
            audio,
            device=DEVICE,
            return_char_alignments=False,
        )

    translation_segments: Optional[List[Dict[str, object]]] = None
    final_segments = result["segments"]
    if detected_language != "en":
        logger.debug(
            "Detected language %s for %s; running translation",
            detected_language,
            wav_path,
        )
        with suppress_stdout_stderr():
            translation_result = resources.base_model.transcribe(
                audio,
                batch_size=BATCH_SIZE,
                chunk_length=CHUNK_LENGTH,
                condition_on_previous_text=False,
                beam_size=2,
                best_of=2,
                temperature=0,
                task="translate",
                word_timestamps=True,
            )
        translation_segments = translation_result["segments"]
        final_segments = translation_segments

    artifacts = TranscriptionArtifacts(
        language="en" if translation_segments else detected_language,
        detected_language=detected_language,
        final_segments=final_segments,
        source_segments=result["segments"],
        alignment_segments=alignment["segments"],
        translation_segments=translation_segments,
        prompt_text=prompt_text,
    )

    cache_payload = {
        "language": artifacts.language,
        "detected_language": artifacts.detected_language,
        "final_segments": artifacts.final_segments,
        "source_segments": artifacts.source_segments,
        "alignment_segments": artifacts.alignment_segments,
        "translation_segments": artifacts.translation_segments,
        "prompt_text": artifacts.prompt_text,
    }
    ensure_directory(cache_file.parent)
    cache_file.write_text(json.dumps(cache_payload, ensure_ascii=False, indent=2))

    return artifacts


def flatten_words(
    alignment_segments: List[Dict[str, object]],
) -> List[Dict[str, object]]:
    words: List[Dict[str, object]] = []
    for segment in alignment_segments:
        for word in segment.get("words", []):
            if word is None:
                continue
            start = word.get("start")
            end = word.get("end")
            if start is None or end is None:
                continue
            words.append(word)
    words.sort(key=lambda w: w.get("start", 0.0))
    return words


def derive_alignment_intervals(
    alignment_segments: List[Dict[str, object]],
    audio_duration: float,
    silence_cfg: SilenceConfig,
) -> List[Interval]:
    words = flatten_words(alignment_segments)
    if not words:
        return []

    intervals: List[Interval] = []
    current_words: List[Dict[str, object]] = []
    current_start: Optional[float] = None
    last_end: Optional[float] = None
    idx = 0

    for word in words:
        start = float(word.get("start", 0.0))
        end = float(word.get("end", start))
        if current_start is None:
            current_start = start
            last_end = end
            current_words = [word]
            continue

        gap = start - (last_end or start)
        if gap >= silence_cfg.silence_threshold:
            interval_start = max(current_start - silence_cfg.pre_roll, 0.0)
            interval_end = min(
                (last_end or current_start) + silence_cfg.post_roll, audio_duration
            )
            intervals.append(
                Interval(
                    index=idx,
                    start=interval_start,
                    end=interval_end,
                    words=current_words.copy(),
                )
            )
            idx += 1
            current_start = start
            current_words = [word]
        else:
            current_words.append(word)
        last_end = max(last_end or end, end)

    if current_start is not None and last_end is not None:
        interval_start = max(current_start - silence_cfg.pre_roll, 0.0)
        interval_end = min(last_end + silence_cfg.post_roll, audio_duration)
        intervals.append(
            Interval(
                index=idx,
                start=interval_start,
                end=interval_end,
                words=current_words.copy(),
            )
        )

    return intervals


def slice_segments_to_interval(
    segments: List[Dict[str, object]],
    interval_start: float,
    interval_end: float,
) -> List[Dict[str, object]]:
    sliced: List[Dict[str, object]] = []
    for seg in segments:
        seg_start = float(seg.get("start", 0.0))
        seg_end = float(seg.get("end", seg_start))
        if seg_end <= interval_start or seg_start >= interval_end:
            continue
        clipped_start = max(seg_start, interval_start)
        clipped_end = min(seg_end, interval_end)
        new_seg = {
            key: value
            for key, value in seg.items()
            if key not in {"start", "end", "words"}
        }
        new_seg["start"] = clipped_start - interval_start
        new_seg["end"] = max(clipped_end - interval_start, 0.0)
        words = []
        for word in seg.get("words", []):
            w_start = word.get("start")
            w_end = word.get("end")
            if w_start is None or w_end is None:
                continue
            if w_end <= interval_start or w_start >= interval_end:
                continue
            clipped_word = {k: v for k, v in word.items() if k not in {"start", "end"}}
            clipped_word["start"] = max(w_start, interval_start) - interval_start
            clipped_word["end"] = max(min(w_end, interval_end) - interval_start, 0.0)
            words.append(clipped_word)
        if words:
            new_seg["words"] = words
            text = "".join(word.get("word", "") for word in words)
            if text.strip():
                new_seg["text"] = text.strip()
        sliced.append(new_seg)
    return sliced


def render_utterances(
    audio_segment: AudioSegment,
    transcription: TranscriptionArtifacts,
    intervals: List[Interval],
    descriptor: str,
    start_time: dt.datetime,
    output_root: Path,
) -> List[Path]:
    outputs: List[Path] = []
    for interval in intervals:
        if interval.duration <= 0:
            continue
        start_ms = int(interval.start * 1000)
        end_ms = int(interval.end * 1000)
        utterance_audio = audio_segment[start_ms:end_ms]
        if utterance_audio.frame_count() == 0:
            logger.debug("Skipping empty interval %s", interval)
            continue

        utterance_start_time = start_time + dt.timedelta(seconds=interval.start)
        file_stub = utterance_start_time.isoformat().split(".")[0].replace(":", "")
        base_filename = f"{file_stub}-{descriptor}_IA"

        year = str(utterance_start_time.year)
        month = str(utterance_start_time.month).zfill(2)
        day = str(utterance_start_time.day).zfill(2)
        dated_directory = output_root / year / month / day
        ensure_directory(dated_directory)

        aac_path = dated_directory / f"{base_filename}.aac"
        utterance_audio.export(
            aac_path, format="adts", codec="aac", bitrate=AAC_BITRATE
        )
        logger.debug("Wrote AAC %s", aac_path)

        segments = slice_segments_to_interval(
            transcription.final_segments, interval.start, interval.end
        )
        if not segments:
            logger.warning(
                "Interval %s produced no transcript segments for %s",
                interval.index,
                aac_path,
            )

        payload = {
            "segments": segments,
            "language": transcription.language,
            "detectedLanguage": transcription.detected_language,
            "descriptor": descriptor,
            "filename": aac_path.name,
            "utteranceTime": utterance_start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "model": MODEL_TYPE,
            "modelrunner": "whisperx",
            "prompt": transcription.prompt_text,
            "transcriptionServerCreateTime": dt.datetime.utcnow().isoformat(),
        }
        if transcription.translation_segments is not None:
            payload["origLangSegments"] = slice_segments_to_interval(
                transcription.source_segments, interval.start, interval.end
            )
        else:
            payload["language"] = transcription.language

        json_path = dated_directory / f"{base_filename}.json"
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        outputs.append(json_path)
    return outputs


def derive_prompt_root(raw_folder: str | None) -> Path:
    explicit_prompt_root = os.getenv("PROMPT_CONTEXT_ROOT")
    if explicit_prompt_root:
        return Path(explicit_prompt_root)
    if not raw_folder:
        raise RuntimeError(
            "RAW_FOLDER environment variable is not defined and PROMPT_CONTEXT_ROOT is unset"
        )
    return Path(raw_folder) / PROMPT_ROOT_SUBPATH


def prepare_audio_segment(wav_path: Path) -> AudioSegment:
    return AudioSegment.from_file(wav_path)


def extract_zip_date(zip_name: str) -> dt.datetime:
    try:
        month = int(zip_name[0:2])
        day = int(zip_name[3:5])
        year = int("20" + zip_name[6:8])
        return dt.datetime(year, month, day)
    except Exception:
        return dt.datetime.max


def process_wav_file(
    wav_path: Path,
    descriptor: str,
    start_time: dt.datetime,
    resources: WhisperResources,
    prompt_root: Path,
    silence_cfg: SilenceConfig,
    output_root: Path,
    cache_dir: Path,
    force: bool,
) -> None:
    prompt_text = build_initial_prompt(start_time, descriptor, prompt_root)
    transcription = transcribe_full_wav(
        wav_path,
        descriptor,
        start_time,
        prompt_text,
        resources,
        cache_dir,
        force,
    )
    audio_segment = prepare_audio_segment(wav_path)
    intervals = derive_alignment_intervals(
        transcription.alignment_segments,
        audio_segment.duration_seconds,
        silence_cfg,
    )
    if not intervals:
        logger.warning("No speech detected in %s", wav_path.name)
        return
    render_utterances(
        audio_segment,
        transcription,
        intervals,
        descriptor,
        start_time,
        output_root,
    )


def process_zip_file(
    zip_file: str,
    zip_folder: Path,
    zip_type: str,
    resources: WhisperResources,
    prompt_root: Path,
    silence_cfg: SilenceConfig,
    output_root: Path,
    force: bool,
    workers: int,
) -> None:
    if exit_event.is_set() or immediate_exit_event.is_set():
        logger.info("Exit requested before processing %s", zip_file)
        return

    add_to_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, zip_file)
    zip_path = zip_folder / zip_file
    working_dir = CURRENT_IA_ZIP_WAVS_WORKING / f"{zip_path.stem}_wavs"

    if working_dir.exists():
        shutil.rmtree(working_dir)
    ensure_directory(working_dir)

    processed_successfully = False
    try:
        unzip_ia_zip_wavs(zip_path, working_dir, zip_type)

        wav_files = sorted(working_dir.glob("*.wav"))
        cache_dir = working_dir / "cache"
        if force and cache_dir.exists():
            shutil.rmtree(cache_dir)
        ensure_directory(cache_dir)

        if force and wav_files:
            day_dirs: set[Path] = set()
            for wav in wav_files:
                try:
                    start_time_str = wav.stem[:17]
                    start_time = dt.datetime.strptime(start_time_str, "%Y-%m-%dT%H%M%S")
                except ValueError:
                    continue
                day_dirs.add(
                    output_root
                    / str(start_time.year)
                    / str(start_time.month).zfill(2)
                    / str(start_time.day).zfill(2)
                )
            for day_dir in day_dirs:
                if day_dir.exists():
                    logger.debug("Force enabled: removing existing output %s", day_dir)
                    shutil.rmtree(day_dir)

        def _process_single_wav(wav_file: Path) -> None:
            if exit_event.is_set() or immediate_exit_event.is_set():
                raise RuntimeError("Exit requested")
            wav_local = ensure_mono_wav(wav_file) or wav_file
            try:
                start_time_str = wav_local.stem[:17]
                start_time_local = dt.datetime.strptime(
                    start_time_str, "%Y-%m-%dT%H%M%S"
                )
                descriptor_local = wav_local.stem[18:-3]
            except ValueError as exc:
                logger.error("Failed to parse WAV name %s: %s", wav_local.name, exc)
                return
            try:
                process_wav_file(
                    wav_local,
                    descriptor_local,
                    start_time_local,
                    resources,
                    prompt_root,
                    silence_cfg,
                    output_root,
                    cache_dir,
                    force,
                )
            except RuntimeError as exc:
                if str(exc) == "Exit requested":
                    raise
                logger.error("Runtime error processing %s: %s", wav_local.name, exc)
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Error processing %s: %s", wav_local.name, exc)

        if workers > 1 and len(wav_files) > 1:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {
                    executor.submit(_process_single_wav, wav): wav for wav in wav_files
                }
                for future in as_completed(futures):
                    future.result()
        else:
            for wav in wav_files:
                _process_single_wav(wav)

        processed_successfully = True
    except ZipPendingDownloadError:
        logger.info("%s appears to be downloading; will retry later", zip_file)
    except zipfile.BadZipFile as exc:
        logger.error("Failed to unzip %s: %s", zip_file, exc)
        add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, zip_file)
    except RuntimeError as exc:
        if str(exc) == "Exit requested":
            logger.info("Exit requested during %s; partial progress saved", zip_file)
        else:
            logger.error("Runtime error while processing %s: %s", zip_file, exc)
    finally:
        if processed_successfully:
            add_to_tracking_file(IA_ZIPS_PROCESSED_TRACKING_FILE, zip_file)
        remove_from_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, zip_file)


def gather_zip_files(folder: Path) -> List[str]:
    return [f for f in os.listdir(folder) if f.lower().endswith(".zip")]


def sort_zips_oldest_first(zips: Iterable[str]) -> List[str]:
    return sorted(zips, key=extract_zip_date)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transcription-first ISS comm processing pipeline"
    )
    parser.add_argument(
        "--zip",
        action="append",
        dest="zips",
        help="Specific zip filename to process (can be provided multiple times)",
    )
    parser.add_argument(
        "--include-ag",
        action="store_true",
        help="Process AG/DG zips in addition to SG",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Only process this many zips per category",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess outputs even if they already exist",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of concurrent WAV workers sharing the WhisperX model",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(debug=args.debug)
    load_environment(ROOT_ENV_PATH)

    raw_folder = os.getenv("RAW_FOLDER")
    if not raw_folder:
        logger.error("RAW_FOLDER environment variable is not defined")
        return 1

    comm_raw = Path(raw_folder) / "comm_transcripts_aacs/"
    ensure_directory(comm_raw)

    prompt_root = derive_prompt_root(raw_folder)

    raw_audio_folder = os.getenv("RAW_AUDIO_FOLDER")
    ia_zip_sg_folder: Optional[Path]
    ia_zip_ag_folder: Optional[Path]
    if raw_audio_folder:
        raw_audio_path = Path(raw_audio_folder)
        ia_zip_sg_folder = raw_audio_path / "InternetArchive_space_to_grounds"
        ia_zip_ag_folder = raw_audio_path / "InternetArchive_dragon_cst_to_grounds"

    working_dir_override = os.getenv("IA_ZIP_WORK_DIR")
    global CURRENT_IA_ZIP_WAVS_WORKING
    if working_dir_override:
        CURRENT_IA_ZIP_WAVS_WORKING = Path(working_dir_override)
    elif raw_audio_folder:
        CURRENT_IA_ZIP_WAVS_WORKING = Path(raw_audio_folder) / "current_ia_zip_wavs"

    if not ia_zip_sg_folder or not ia_zip_sg_folder.exists():
        logger.error(
            "Space-to-Ground zip folder not found. Set RAW_AUDIO_FOLDER or IA_ZIP_SG_FOLDER"
        )
        return 1

    resources = WhisperResources.load(DEVICE, MODEL_TYPE, COMPUTE_TYPE)
    silence_cfg = SilenceConfig()

    skip_list = set(read_skip_list(IA_SKIP_ZIPS_TRACKING_FILE))

    sg_zips = args.zips if args.zips else gather_zip_files(ia_zip_sg_folder)
    sg_zips = [z for z in sg_zips if z not in skip_list]
    sg_zips = sort_zips_oldest_first(sg_zips)
    if args.limit:
        sg_zips = sg_zips[: args.limit]

    ag_zips: List[str] = []
    if args.include_ag and ia_zip_ag_folder and ia_zip_ag_folder.exists():
        ag_zips = gather_zip_files(ia_zip_ag_folder)
        ag_zips = [z for z in ag_zips if z not in skip_list]
        ag_zips = sort_zips_oldest_first(ag_zips)
        if args.limit:
            ag_zips = ag_zips[: args.limit]

    logger.info("Processing %d SG zips (oldest -> newest)", len(sg_zips))
    workers = max(1, args.workers)

    for zip_file in sg_zips:
        if exit_event.is_set() or immediate_exit_event.is_set():
            break
        process_zip_file(
            zip_file,
            ia_zip_sg_folder,
            "SG",
            resources,
            prompt_root,
            silence_cfg,
            comm_raw,
            args.force,
            workers,
        )

    if args.include_ag:
        logger.info("Processing %d AG/DG zips (oldest -> newest)", len(ag_zips))
        for zip_file in ag_zips:
            if exit_event.is_set() or immediate_exit_event.is_set():
                break
            process_zip_file(
                zip_file,
                ia_zip_ag_folder,
                "AG",
                resources,
                prompt_root,
                silence_cfg,
                comm_raw,
                args.force,
                workers,
            )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logger.warning("Interrupted by user.")
        sys.exit(130)
