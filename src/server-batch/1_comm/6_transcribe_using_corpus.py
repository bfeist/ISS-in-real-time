#!/usr/bin/env python3
"""Transcription-first pipeline that reuses full-file WhisperX outputs."""

from __future__ import annotations

import argparse
import datetime as dt
import inspect
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import wave
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from functools import lru_cache

import whisperx  # type: ignore
import webrtcvad  # type: ignore
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
VAD_SAMPLE_RATE = 16000
VAD_AGGRESSIVENESS = int(os.getenv("WHISPER_VAD_MODE", "2"))

INVALID_TRANSCRIPT_MARKERS = [
    " Thank you.",
    "Thank you.",
    " Bye.",
    " ...",
    " Thanks for watching!",
    " Thank you for watching.",
    " Thank you for watching!",
    " Thank you for watching",
    " .",
    " This video is a derivative work of the Touhou Project",
]

ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
TRACKING_DIR = Path(__file__).parent.parent
DEFAULT_WORKING_ROOT = TRACKING_DIR / "current_ia_zip_wavs"
CURRENT_IA_ZIP_WAVS_WORKING = Path(
    os.getenv("IA_ZIP_WORK_DIR", str(DEFAULT_WORKING_ROOT))
)

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
    align_models: Dict[str, Tuple[Optional[object], Optional[Dict[str, object]]]]
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
            cached = self.align_models.get(key)
            if cached is not None:
                align_model, metadata = cached
                if align_model is None or metadata is None:
                    raise AlignmentModelUnavailableError(key)
                return align_model, metadata

            console.log(f"Loading alignment model for language '{key}'")
            try:
                align_model, metadata = whisperx.load_align_model(
                    language_code=key, device=DEVICE
                )
            except ValueError as exc:
                logger.warning(
                    "No default alignment model found for language '%s'; "
                    "falling back to Whisper timestamps",
                    key,
                )
                self.align_models[key] = (None, None)
                raise AlignmentModelUnavailableError(key) from exc

            self.align_models[key] = (align_model, metadata)
            return align_model, metadata


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class FilenameParseError(Exception):
    """Raised when a WAV filename cannot be parsed."""


class ZipPendingDownloadError(Exception):
    """Raised when a zip file appears to still be downloading."""


class AlignmentModelUnavailableError(Exception):
    """Raised when no WhisperX alignment model exists for a language."""

    def __init__(self, language: str):
        super().__init__(f"No alignment model available for language '{language}'")
        self.language = language


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

    # Suppress noisy torio/torchaudio FFmpeg extension warnings on Windows
    logging.getLogger("torio._extension.utils").setLevel(logging.ERROR)
    logging.getLogger("torchaudio._extension.utils").setLevel(logging.ERROR)


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
            return [
                line.strip()
                for line in file_path.read_text(encoding="utf-8").splitlines()
                if line
            ]
    return []


def add_to_tracking_file(file_path: Path, item: str) -> None:
    with file_lock:
        items = set(read_tracking_file(file_path))
        if item not in items:
            items.add(item)
            file_path.write_text("\n".join(sorted(items)), encoding="utf-8")


def remove_from_tracking_file(file_path: Path, item: str) -> None:
    with file_lock:
        if not file_path.exists():
            return
        items = [
            line.strip()
            for line in file_path.read_text(encoding="utf-8").splitlines()
            if line
        ]
        if item in items:
            items.remove(item)
            file_path.write_text("\n".join(items), encoding="utf-8")


def read_skip_list(file_path: Path) -> List[str]:
    return read_tracking_file(file_path)


def get_zip_date_key(zip_filename: str) -> str:
    date_fragment = zip_filename[:8]
    try:
        month = date_fragment[:2]
        day = date_fragment[3:5]
        year = date_fragment[6:8]
        return f"20{year}-{month}-{day}"
    except Exception:
        return "unknown"


def group_zip_entries_by_date(
    entries: List[Tuple[str, Path, str]],
) -> List[Tuple[str, List[Tuple[str, Path, str]]]]:
    sorted_entries = sorted(entries, key=lambda item: extract_zip_date(item[0]))
    grouped: List[Tuple[str, List[Tuple[str, Path, str]]]] = []
    for entry in sorted_entries:
        date_key = get_zip_date_key(entry[0])
        if grouped and grouped[-1][0] == date_key:
            grouped[-1][1].append(entry)
        else:
            grouped.append((date_key, [entry]))
    return grouped


def list_zip_entries(
    folder: Optional[Path],
    zip_type: str,
    selected: Optional[set[str]],
    skip_list: set[str],
) -> List[Tuple[str, Path, str]]:
    if not folder or not folder.exists():
        return []

    entries: List[Tuple[str, Path, str]] = []
    for name in os.listdir(folder):
        if not name.lower().endswith(".zip"):
            continue
        if selected is not None and name not in selected:
            continue
        if name in skip_list:
            continue
        entries.append((name, folder, zip_type))

    return entries


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


def unzip_ia_zip_wavs(
    zip_path: Path,
    destination_dir: Path,
    zip_type: str,
    allow_overwrite: bool = False,
) -> None:
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

            ensure_directory(destination_dir)
            new_file_name = f"{date_time}-{descriptor}_IA.wav"
            destination_file_path = destination_dir / new_file_name
            if allow_overwrite and destination_file_path.exists():
                logger.debug(
                    "Overwriting existing file during unzip: %s", destination_file_path
                )
            elif not allow_overwrite:
                counter = 1
                base_name = destination_file_path.stem
                while destination_file_path.exists():
                    destination_file_path = (
                        destination_dir / f"{base_name}_{counter}.wav"
                    )
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
        temp_converted = input_wav_path.with_name(
            f"{input_wav_path.stem}_mono32_temp.wav"
        )
        audio.export(temp_converted, format="wav")

        backup_path = input_wav_path.with_name(f"{input_wav_path.stem}_orig.wav")
        if backup_path.exists():
            backup_path.unlink()
        try:
            input_wav_path.rename(backup_path)
        except OSError as exc:
            logger.error("Failed to backup original WAV %s: %s", input_wav_path, exc)
            temp_converted.unlink(missing_ok=True)
            return None

        try:
            temp_converted.replace(input_wav_path)
        finally:
            if temp_converted.exists():
                temp_converted.unlink()

        return input_wav_path
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

    # Clean the descriptor to remove prefixes/suffixes and format for display
    clean_descriptor = (
        descriptor.lstrip("1_").rstrip("_IA").replace("_", " ").replace("-", " ")
    )
    channel_hint = f"Channel: {clean_descriptor}"
    if prompt_text:
        return f"{prompt_text}\n\n{channel_hint}"
    return channel_hint


@lru_cache(maxsize=None)
def _pipeline_supported_transcribe_params(pipeline_cls: type) -> set[str]:
    transcribe_fn = getattr(pipeline_cls, "transcribe", None)
    if not callable(transcribe_fn):
        return set()
    try:
        signature = inspect.signature(transcribe_fn)
    except (TypeError, ValueError):
        return set()

    params = set(signature.parameters.keys())
    params.discard("self")
    params.discard("args")
    params.discard("kwargs")
    return params


def transcribe_with_model(pipeline: object, audio, **kwargs):
    transcribe_fn = getattr(pipeline, "transcribe", None)
    if not callable(transcribe_fn):
        raise AttributeError(
            f"Pipeline '{type(pipeline).__name__}' does not expose a callable transcribe() method"
        )

    supported_params = _pipeline_supported_transcribe_params(type(pipeline))
    filtered_kwargs = {k: v for k, v in kwargs.items() if k in supported_params}
    remapped_params: set[str] = set()

    if "chunk_length" in kwargs and "chunk_length" not in supported_params:
        chunk_length_value = kwargs["chunk_length"]
        if "chunk_size" in supported_params and "chunk_size" not in filtered_kwargs:
            filtered_kwargs["chunk_size"] = chunk_length_value
            logger.debug(
                "Translated chunk_length=%s to chunk_size for %s",
                chunk_length_value,
                type(pipeline).__name__,
            )
            remapped_params.add("chunk_length")

    dropped_params = sorted(
        set(kwargs.keys()) - set(filtered_kwargs.keys()) - remapped_params
    )
    if dropped_params:
        logger.debug(
            "Skipping unsupported transcribe kwargs for %s: %s",
            type(pipeline).__name__,
            ", ".join(dropped_params),
        )

    return transcribe_fn(audio, **filtered_kwargs)


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
        result = transcribe_with_model(
            resources.base_model,
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

    def _attempt_alignment(language_code: str) -> Optional[List[Dict[str, object]]]:
        align_model, metadata = resources.get_alignment_model(language_code)
        with suppress_stdout_stderr():
            alignment_result = whisperx.align(
                result["segments"],
                align_model,
                metadata,
                audio,
                device=DEVICE,
                return_char_alignments=False,
            )
        return alignment_result.get("segments", [])

    alignment_segments: List[Dict[str, object]]
    try:
        alignment_segments = _attempt_alignment(detected_language) or []
    except AlignmentModelUnavailableError:
        logger.warning(
            "Skipping alignment for language '%s' due to missing model",
            detected_language,
        )
        alignment_segments = []
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning(
            "Alignment failed for %s (%s); falling back to Whisper timestamps",
            wav_path.name,
            exc,
        )
        alignment_segments = []

    if not alignment_segments:
        alignment_segments = result["segments"]

    translation_segments: Optional[List[Dict[str, object]]] = None
    final_segments = result["segments"]
    if detected_language != "en":
        logger.debug(
            "Detected language %s for %s; running translation",
            detected_language,
            wav_path,
        )
        with suppress_stdout_stderr():
            translation_result = transcribe_with_model(
                resources.base_model,
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
        alignment_segments=alignment_segments,
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
    cache_file.write_text(
        json.dumps(cache_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

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


def _build_intervals_from_word_entries(
    word_entries: List[Dict[str, object]],
    audio_duration: float,
    silence_cfg: SilenceConfig,
) -> List[Interval]:
    if not word_entries:
        return []

    intervals: List[Interval] = []
    current_words: List[Dict[str, object]] = []
    current_start: Optional[float] = None
    last_end: Optional[float] = None
    idx = 0

    for word in word_entries:
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


def derive_alignment_intervals(
    alignment_segments: List[Dict[str, object]],
    audio_duration: float,
    silence_cfg: SilenceConfig,
    fallback_segments: Optional[List[Dict[str, object]]] = None,
) -> List[Interval]:
    words = flatten_words(alignment_segments)
    if not words and fallback_segments:
        fallback_words: List[Dict[str, object]] = []
        for segment in fallback_segments:
            seg_start = segment.get("start")
            seg_end = segment.get("end")
            if seg_start is None or seg_end is None:
                continue
            try:
                start_val = float(seg_start)
                end_val = float(seg_end)
            except (TypeError, ValueError):
                continue
            fallback_words.append(
                {
                    "start": start_val,
                    "end": end_val,
                    "word": str(segment.get("text", "")).strip(),
                }
            )
        fallback_words.sort(key=lambda item: item.get("start", 0.0))
        if fallback_words:
            logger.debug(
                "Falling back to segment boundaries for interval derivation (%d segment(s))",
                len(fallback_words),
            )
            words = fallback_words

    if not words:
        return []

    return _build_intervals_from_word_entries(words, audio_duration, silence_cfg)


def _prepare_vad_audio(audio_segment: AudioSegment) -> AudioSegment:
    return (
        audio_segment.set_channels(1)
        .set_frame_rate(VAD_SAMPLE_RATE)
        .set_sample_width(2)
    )


def detect_vad_segments(
    audio_segment: AudioSegment, silence_cfg: SilenceConfig
) -> List[Tuple[float, float]]:
    vad = webrtcvad.Vad()
    vad.set_mode(VAD_AGGRESSIVENESS)

    prepared = _prepare_vad_audio(audio_segment)
    raw_data = prepared.raw_data
    bytes_per_sample = prepared.sample_width
    frame_bytes = (
        int(VAD_SAMPLE_RATE * silence_cfg.frame_duration_seconds) * bytes_per_sample
    )
    if frame_bytes <= 0:
        return []

    segments: List[Tuple[float, float]] = []
    in_speech = False
    segment_start = 0.0
    trailing_silence_blocks = 0
    total_frames = len(raw_data) // frame_bytes
    duration_seconds = prepared.duration_seconds

    for frame_idx in range(total_frames):
        offset = frame_idx * frame_bytes
        frame = raw_data[offset : offset + frame_bytes]
        if len(frame) < frame_bytes:
            break
        frame_time = frame_idx * silence_cfg.frame_duration_seconds
        try:
            is_speech = vad.is_speech(frame, VAD_SAMPLE_RATE)
        except Exception:
            is_speech = False

        if is_speech:
            if not in_speech:
                in_speech = True
                segment_start = frame_time
            trailing_silence_blocks = 0
        else:
            if in_speech:
                trailing_silence_blocks += 1
                if trailing_silence_blocks > silence_cfg.min_gap_blocks:
                    segment_end = frame_time - (
                        trailing_silence_blocks * silence_cfg.frame_duration_seconds
                    )
                    segment_end = max(segment_end, segment_start)
                    segments.append((segment_start, min(segment_end, duration_seconds)))
                    in_speech = False
                    trailing_silence_blocks = 0
            else:
                trailing_silence_blocks = 0

    if in_speech:
        segment_end = duration_seconds
        if trailing_silence_blocks:
            segment_end -= (
                min(trailing_silence_blocks, silence_cfg.min_gap_blocks)
                * silence_cfg.frame_duration_seconds
            )
        segment_end = max(segment_end, segment_start)
        segments.append((segment_start, min(segment_end, duration_seconds)))

    return segments


def merge_intervals_with_vad(
    intervals: List[Interval],
    vad_segments: List[Tuple[float, float]],
    audio_duration: float,
    silence_cfg: SilenceConfig,
) -> List[Interval]:
    if not intervals or not vad_segments:
        return intervals

    consumed = [False] * len(intervals)
    merged: List[Interval] = []

    for vad_start, vad_end in vad_segments:
        overlapping_indices = [
            idx
            for idx, interval in enumerate(intervals)
            if not consumed[idx]
            and interval.start < vad_end
            and interval.end > vad_start
        ]
        if not overlapping_indices:
            continue

        cluster_words: List[Dict[str, object]] = []
        cluster_start: Optional[float] = None
        cluster_end: Optional[float] = None

        for idx in overlapping_indices:
            interval = intervals[idx]
            cluster_start = (
                interval.start
                if cluster_start is None
                else min(cluster_start, interval.start)
            )
            cluster_end = (
                interval.end if cluster_end is None else max(cluster_end, interval.end)
            )
            cluster_words.extend(interval.words)
            consumed[idx] = True

        cluster_words.sort(key=lambda w: float(w.get("start", 0.0)))
        merged.append(
            Interval(
                index=len(merged),
                start=max((cluster_start or vad_start), 0.0),
                end=min((cluster_end or vad_end), audio_duration),
                words=cluster_words,
            )
        )

    for idx, interval in enumerate(intervals):
        if consumed[idx]:
            continue
        merged.append(
            Interval(
                index=len(merged),
                start=max(interval.start, 0.0),
                end=min(interval.end, audio_duration),
                words=sorted(interval.words, key=lambda w: float(w.get("start", 0.0))),
            )
        )

    merged.sort(key=lambda item: item.start)
    for idx, interval in enumerate(merged):
        interval.index = idx

    return merged


def _approximate_text_slice(
    raw_text: str,
    segment_start: float,
    segment_end: float,
    clip_start: float,
    clip_end: float,
) -> str:
    text = raw_text.strip()
    if not text:
        return ""

    duration = segment_end - segment_start
    if duration <= 0:
        return text

    start_ratio = max(min((clip_start - segment_start) / duration, 1.0), 0.0)
    end_ratio = max(min((clip_end - segment_start) / duration, 1.0), start_ratio)

    length = len(text)
    if length == 0:
        return ""

    start_idx = min(int(round(start_ratio * length)), length)
    end_idx = min(int(round(end_ratio * length)), length)

    if start_idx == end_idx:
        end_idx = min(end_idx + max(1, int(0.05 * length)), length)

    while start_idx > 0 and not text[start_idx - 1].isspace():
        start_idx -= 1
    while end_idx < length and not text[end_idx - 1 if end_idx > 0 else 0].isspace():
        end_idx += 1
        if end_idx >= length:
            end_idx = length
            break

    trimmed = text[start_idx:end_idx].strip()
    if trimmed:
        return trimmed

    # Fall back to the best-effort slice without whitespace adjustment.
    rough_slice = text[start_idx:end_idx].strip()
    return rough_slice or text


def slice_segments_to_interval(
    segments: List[Dict[str, object]],
    interval_start: float,
    interval_end: float,
    *,
    allow_approximate_text: bool = False,
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
            text = " ".join(word.get("word", "").strip() for word in words)
            text = text.replace("  ", " ")
            if text.strip():
                new_seg["text"] = text.strip()
        elif allow_approximate_text:
            existing_text = str(seg.get("text", ""))
            if existing_text:
                trimmed_text = _approximate_text_slice(
                    existing_text,
                    seg_start,
                    seg_end,
                    clipped_start,
                    clipped_end,
                )
                if trimmed_text:
                    new_seg["text"] = trimmed_text
                elif "text" in new_seg:
                    new_seg.pop("text")
        elif "text" in new_seg and not new_seg.get("words"):
            # Drop text without supporting timestamps when approximation is disabled
            new_seg.pop("text", None)
        sliced.append(new_seg)
    return sliced


def segments_to_text(segments: Optional[Sequence[Dict[str, object]]]) -> str:
    if not segments:
        return ""
    texts = []
    for segment in segments:
        text_value = str(segment.get("text", "")).strip()
        if text_value:
            texts.append(text_value)
    return " ".join(texts).strip()


def _segment_words_to_text(words: Optional[Sequence[Dict[str, object]]]) -> str:
    if not words:
        return ""
    collected: List[str] = []
    for word in words:
        if not isinstance(word, dict):
            continue
        word_text = str(word.get("word", "")).strip()
        if word_text:
            collected.append(word_text)
    return " ".join(collected).strip()


def prune_empty_segments(
    segments: Sequence[Dict[str, object]],
) -> List[Dict[str, object]]:
    cleaned: List[Dict[str, object]] = []
    for segment in segments:
        text_value = str(segment.get("text", "")).strip()
        words_value = _segment_words_to_text(segment.get("words"))
        if not text_value and not words_value:
            continue
        segment_copy = dict(segment)
        if words_value:
            segment_copy["words"] = [
                dict(word)
                for word in segment.get("words", [])
                if isinstance(word, dict) and str(word.get("word", "")).strip()
            ]
        if text_value:
            segment_copy["text"] = text_value
        elif words_value:
            segment_copy["text"] = words_value
        cleaned.append(segment_copy)
    return cleaned


def display_transcription_summary(
    wav_path: Path, transcription: TranscriptionArtifacts
) -> None:
    console.rule(f"[bold cyan]{wav_path.name}")
    console.print(
        f"[bold]Detected language:[/] {transcription.detected_language or 'unknown'}"
    )

    original_text = segments_to_text(transcription.source_segments)
    translated_text = (
        segments_to_text(transcription.translation_segments)
        if transcription.translation_segments is not None
        else segments_to_text(transcription.final_segments)
    )

    language_label = transcription.detected_language or "unknown"

    if transcription.translation_segments is not None:
        if original_text:
            console.print(
                f"[bold]Original transcript ({language_label}):[/]\n{original_text}"
            )
        else:
            console.print(
                f"[bold]Original transcript ({language_label}):[/] [italic]Unavailable[/]"
            )

        if translated_text:
            console.print(
                "[bold]Translated transcript (English):[/]\n" f"{translated_text}"
            )
        else:
            console.print(
                "[bold]Translated transcript (English):[/] [italic]Unavailable[/]"
            )
    else:
        combined_text = translated_text or original_text
        if combined_text:
            console.print(f"[bold]Transcript ({language_label}):[/]\n{combined_text}")
        else:
            console.print(
                f"[bold]Transcript ({language_label}):[/] [italic]Unavailable[/]"
            )


def render_utterances(
    source_wav_path: Path,
    audio_segment: AudioSegment,
    transcription: TranscriptionArtifacts,
    intervals: List[Interval],
    descriptor: str,
    start_time: dt.datetime,
    output_root: Path,
) -> List[Path]:
    outputs: List[Path] = []
    export_jobs: List[dict] = []

    for interval in intervals:
        if interval.duration <= 0:
            continue

        using_translation = transcription.translation_segments is not None

        if using_translation:
            segments = prune_empty_segments(
                slice_segments_to_interval(
                    transcription.translation_segments or [],
                    interval.start,
                    interval.end,
                    allow_approximate_text=True,
                )
            )
            orig_segments = prune_empty_segments(
                slice_segments_to_interval(
                    transcription.alignment_segments,
                    interval.start,
                    interval.end,
                    allow_approximate_text=False,
                )
            )
        else:
            segments = prune_empty_segments(
                slice_segments_to_interval(
                    transcription.alignment_segments,
                    interval.start,
                    interval.end,
                    allow_approximate_text=False,
                )
            )
            orig_segments = []

        if not segments and not using_translation:
            segments = prune_empty_segments(
                slice_segments_to_interval(
                    transcription.final_segments,
                    interval.start,
                    interval.end,
                    allow_approximate_text=False,
                )
            )

        if not segments:
            logger.warning(
                "Interval %s produced no transcript segments for %s",
                interval.index,
                descriptor,
            )
            continue

        utterance_text = segments_to_text(segments)
        if not utterance_text:
            logger.info(
                "Skipping interval %s for %s due to empty transcript content",
                interval.index,
                descriptor,
            )
            continue

        first_text_raw = str(segments[0].get("text", ""))
        candidate_texts = [first_text_raw, first_text_raw.strip()]
        if any(
            marker in candidate
            for candidate in candidate_texts
            if candidate
            for marker in INVALID_TRANSCRIPT_MARKERS
        ):
            logger.info(
                "Skipping interval %s due to invalid transcript text: %s",
                interval.index,
                first_text_raw.strip() or first_text_raw,
            )
            continue

        utterance_start_time = start_time + dt.timedelta(seconds=interval.start)
        file_stub = utterance_start_time.isoformat().split(".")[0].replace(":", "")
        base_filename = f"{file_stub}-{descriptor}"

        year = str(utterance_start_time.year)
        month = str(utterance_start_time.month).zfill(2)
        day = str(utterance_start_time.day).zfill(2)
        dated_directory = output_root / year / month / day
        ensure_directory(dated_directory)

        aac_path = dated_directory / f"{base_filename}.aac"
        if aac_path.exists():
            aac_path.unlink()

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
        if transcription.translation_segments is not None and orig_segments:
            payload["origLangSegments"] = orig_segments
        else:
            payload["language"] = transcription.language

        json_path = dated_directory / f"{base_filename}.json"
        export_jobs.append(
            {
                "start": interval.start,
                "end": interval.end,
                "aac_path": aac_path,
                "json_path": json_path,
                "payload": payload,
                "interval_index": interval.index,
            }
        )

    if not export_jobs:
        return outputs

    ffmpeg_success = export_utterances_with_ffmpeg(source_wav_path, export_jobs)

    if not ffmpeg_success:
        logger.warning("Falling back to in-memory export for %s", source_wav_path.name)
        for job in export_jobs:
            start_ms = int(job["start"] * 1000)
            end_ms = int(job["end"] * 1000)
            utterance_audio = audio_segment[start_ms:end_ms]
            if utterance_audio.frame_count() == 0:
                logger.debug(
                    "Skipping empty interval %s during fallback",
                    job["interval_index"],
                )
                continue
            export_result = utterance_audio.export(
                job["aac_path"],
                format="adts",
                codec="aac",
                bitrate=AAC_BITRATE,
            )
            if hasattr(export_result, "close"):
                export_result.close()

    for job in export_jobs:
        if not job["aac_path"].exists():
            logger.warning(
                "Skipping JSON export for interval %s because %s is missing",
                job["interval_index"],
                job["aac_path"].name,
            )
            continue
        logger.debug("Wrote AAC %s", job["aac_path"])
        job["json_path"].write_text(
            json.dumps(job["payload"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        outputs.append(job["json_path"])

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


def export_utterances_with_ffmpeg(
    source_wav_path: Path,
    jobs: Sequence[dict],
) -> bool:
    if not jobs:
        return True

    filter_parts: List[str] = []
    cmd: List[str] = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source_wav_path),
    ]

    for idx, job in enumerate(jobs):
        start = max(float(job["start"]), 0.0)
        end = max(float(job["end"]), start)
        filter_parts.append(
            f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[a{idx}]"
        )

    cmd.extend(["-filter_complex", ";".join(filter_parts)])

    for idx, job in enumerate(jobs):
        cmd.extend(
            [
                "-map",
                f"[a{idx}]",
                "-c:a",
                "aac",
                "-b:a",
                AAC_BITRATE,
                str(job["aac_path"]),
            ]
        )

    try:
        subprocess.run(cmd, check=True)
    except FileNotFoundError:
        logger.error(
            "ffmpeg executable not found on PATH; falling back to pydub export"
        )
        return False
    except subprocess.CalledProcessError as exc:
        logger.error(
            "ffmpeg export failed for %s (code %s)",
            source_wav_path.name,
            exc.returncode,
        )
        return False

    missing_outputs = [job for job in jobs if not job["aac_path"].exists()]
    if missing_outputs:
        logger.error(
            "ffmpeg completed but %d AAC file(s) missing: %s",
            len(missing_outputs),
            ", ".join(job["aac_path"].name for job in missing_outputs),
        )
        return False

    return True


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
) -> TranscriptionArtifacts:
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
        fallback_segments=transcription.final_segments,
    )
    vad_segments = detect_vad_segments(audio_segment, silence_cfg)
    if vad_segments:
        intervals = merge_intervals_with_vad(
            intervals,
            vad_segments,
            audio_segment.duration_seconds,
            silence_cfg,
        )
    if not intervals:
        logger.warning("No speech detected in %s", wav_path.name)
        return transcription
    render_utterances(
        wav_path,
        audio_segment,
        transcription,
        intervals,
        descriptor,
        start_time,
        output_root,
    )
    return transcription


def process_zip_group(
    date_key: str,
    zip_entries: Sequence[Tuple[str, Path, str]],
    resources: WhisperResources,
    prompt_root: Path,
    silence_cfg: SilenceConfig,
    output_root: Path,
    force: bool,
    see_transcriptions: bool,
) -> bool:
    """Unzip and process every archive belonging to a single date group."""
    if exit_event.is_set() or immediate_exit_event.is_set():
        logger.info("Exit requested before processing group %s", date_key)
        return False

    if not zip_entries:
        logger.warning("No archives provided for group %s", date_key)
        return False

    for zip_file, _, _ in zip_entries:
        add_to_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, zip_file)

    working_dir_name = date_key if date_key != "unknown" else zip_entries[0][0]
    working_dir = CURRENT_IA_ZIP_WAVS_WORKING / f"{working_dir_name}_wavs"
    if working_dir.exists():
        shutil.rmtree(working_dir)
    ensure_directory(working_dir)
    logger.info("Unzipped archives will be staged in %s", working_dir)

    processed_successfully = False

    try:
        for zip_file, zip_folder, zip_type in zip_entries:
            if exit_event.is_set() or immediate_exit_event.is_set():
                raise RuntimeError("Exit requested")
            zip_path = zip_folder / zip_file
            logger.info(
                "Unzipping %s archive %s for group %s", zip_type, zip_file, date_key
            )
            try:
                unzip_ia_zip_wavs(
                    zip_path,
                    working_dir,
                    zip_type,
                    allow_overwrite=True,
                )
                logger.info(
                    "Finished unpacking %s into %s",
                    zip_path,
                    working_dir,
                )
            except ZipPendingDownloadError:
                logger.info(
                    "%s appears to be downloading; postponing group %s",
                    zip_file,
                    date_key,
                )
                raise
            except zipfile.BadZipFile as exc:
                logger.error("Failed to unzip %s: %s", zip_file, exc)
                add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, zip_file)
                raise
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Unexpected error unzipping %s: %s", zip_file, exc)
                raise

        wav_files = sorted(working_dir.glob("*.wav"))
        cache_dir = working_dir / "cache"
        if force and cache_dir.exists():
            shutil.rmtree(cache_dir)
        ensure_directory(cache_dir)

        if force and wav_files:
            day_dirs: set[Path] = set()
            for wav in wav_files:
                try:
                    start_time = dt.datetime.strptime(wav.stem[:17], "%Y-%m-%dT%H%M%S")
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

        for wav_file in wav_files:
            if exit_event.is_set() or immediate_exit_event.is_set():
                raise RuntimeError("Exit requested")

            wav_local = ensure_mono_wav(wav_file) or wav_file
            try:
                start_time_str = wav_local.stem[:17]
                start_time_local = dt.datetime.strptime(
                    start_time_str, "%Y-%m-%dT%H%M%S"
                )
                descriptor_local = wav_local.stem[18:]
            except ValueError as exc:
                logger.error("Failed to parse WAV name %s: %s", wav_local.name, exc)
                continue

            try:
                transcription = process_wav_file(
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
                if see_transcriptions and transcription is not None:
                    display_transcription_summary(wav_local, transcription)
            except RuntimeError as exc:
                if str(exc) == "Exit requested":
                    raise
                logger.error("Runtime error processing %s: %s", wav_local.name, exc)
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Error processing %s: %s", wav_local.name, exc)

            orig_wav_file = wav_local.parent / (wav_local.stem + "_orig.wav")
            if orig_wav_file.exists():
                orig_wav_file.unlink()

        processed_successfully = True
    except ZipPendingDownloadError:
        logger.info("Group %s deferred due to pending download", date_key)
    except RuntimeError as exc:
        if str(exc) == "Exit requested":
            logger.info(
                "Exit requested during group %s; partial progress saved", date_key
            )
        else:
            logger.error("Runtime error while processing group %s: %s", date_key, exc)
    finally:
        if working_dir.exists():
            shutil.rmtree(working_dir)
        for zip_file, _, _ in zip_entries:
            remove_from_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, zip_file)

    if processed_successfully:
        for zip_file, _, _ in zip_entries:
            add_to_tracking_file(IA_ZIPS_PROCESSED_TRACKING_FILE, zip_file)

    return processed_successfully


def parse_date_arg(value: str) -> dt.date:
    try:
        return dt.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid date '{value}'. Expected format YYYY-MM-DD"
        ) from exc


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
        "--limit",
        type=int,
        help="Only process this many date groups",
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
        "--date",
        action="append",
        type=parse_date_arg,
        help="Specific YYYY-MM-DD date to process (can be specified multiple times)",
        dest="dates",
    )
    parser.add_argument(
        "--start-date",
        type=parse_date_arg,
        help="Inclusive start date (YYYY-MM-DD). When used with --end-date, processes EVERY day in the range",
    )
    parser.add_argument(
        "--end-date",
        type=parse_date_arg,
        help="Inclusive end date (YYYY-MM-DD). When used with --start-date, processes EVERY day in the range",
    )
    parser.add_argument(
        "--see-transcriptions",
        action="store_true",
        help="Print original-language and translated Whisper transcripts for each WAV after processing",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(debug=args.debug)
    load_environment(ROOT_ENV_PATH)

    if args.start_date and args.end_date and args.start_date > args.end_date:
        logger.error(
            "Start date %s is after end date %s",
            args.start_date.isoformat(),
            args.end_date.isoformat(),
        )
        return 2

    requested_dates = set(args.dates or [])

    raw_folder = os.getenv("RAW_FOLDER")
    if not raw_folder:
        logger.error("RAW_FOLDER environment variable is not defined")
        return 1

    comm_raw = Path(raw_folder) / "comm_transcripts_aacs/"
    ensure_directory(comm_raw)

    prompt_root = derive_prompt_root(raw_folder)

    raw_audio_folder = os.getenv("RAW_AUDIO_FOLDER")
    ia_zip_sg_folder: Optional[Path] = None
    ia_zip_ag_folder: Optional[Path] = None
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

    ensure_directory(CURRENT_IA_ZIP_WAVS_WORKING)
    logger.info(
        "Using working directory %s for temporary zip extraction",
        CURRENT_IA_ZIP_WAVS_WORKING,
    )

    if not ia_zip_sg_folder or not ia_zip_sg_folder.exists():
        logger.error(
            "Space-to-Ground zip folder not found. Set RAW_AUDIO_FOLDER or IA_ZIP_SG_FOLDER"
        )
        return 1

    resources = WhisperResources.load(DEVICE, MODEL_TYPE, COMPUTE_TYPE)
    silence_cfg = SilenceConfig()

    skip_list = set(read_skip_list(IA_SKIP_ZIPS_TRACKING_FILE))
    selected_names = set(args.zips) if args.zips else None

    sg_entries = list_zip_entries(ia_zip_sg_folder, "SG", selected_names, skip_list)
    ag_entries = list_zip_entries(ia_zip_ag_folder, "AG", selected_names, skip_list)

    combined_entries = sg_entries + ag_entries

    # Combine multi-part archives by grouping every zip that shares a date key.

    if selected_names is not None:
        found_names = {name for name, _, _ in combined_entries}
        missing = selected_names - found_names
        if missing:
            logger.warning("Requested zip(s) not found: %s", ", ".join(sorted(missing)))

    if not combined_entries:
        logger.info("No zip archives to process.")
        return 0

    grouped_entries = group_zip_entries_by_date(combined_entries)

    if requested_dates or args.start_date or args.end_date:
        filtered_entries: List[Tuple[str, List[Tuple[str, Path, str]]]] = []
        skipped_unknown: set[str] = set()
        for date_key, zip_group in grouped_entries:
            try:
                date_value = dt.date.fromisoformat(date_key)
            except ValueError:
                skipped_unknown.add(date_key)
                continue
            if requested_dates and date_value not in requested_dates:
                continue
            if args.start_date and date_value < args.start_date:
                continue
            if args.end_date and date_value > args.end_date:
                continue
            filtered_entries.append((date_key, zip_group))
        if skipped_unknown:
            logger.warning(
                "Skipping %d group(s) with unrecognized date key(s): %s",
                len(skipped_unknown),
                ", ".join(sorted(skipped_unknown)),
            )
        grouped_entries = filtered_entries
        if not grouped_entries:
            logger.info("No zip archives matched the requested date filters.")
            return 0
    if args.limit:
        grouped_entries = grouped_entries[: args.limit]

    logger.info("Processing %d zip group(s) (oldest -> newest)", len(grouped_entries))

    for date_key, zip_group in grouped_entries:
        if exit_event.is_set() or immediate_exit_event.is_set():
            break
        logger.info("Processing %s (%d archive(s))", date_key, len(zip_group))
        success = process_zip_group(
            date_key,
            zip_group,
            resources,
            prompt_root,
            silence_cfg,
            comm_raw,
            args.force,
            args.see_transcriptions,
        )
        if not success:
            logger.warning("Group %s did not complete successfully", date_key)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logger.warning("Interrupted by user.")
        sys.exit(130)
