"""YouTube transcription pipeline using the corpus-based WhisperX workflow.

This script ingests full YouTube video audio, runs a transcription-first
pipeline that reuses the corpus utilities from the COM transcription flow,
and finally emits pipe-delimited transcript rows matching the legacy format.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

LOGGER = logging.getLogger("youtube-transcription-v2")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_DOWNLOAD_FOLDER = Path(
    os.getenv("YT_DOWNLOAD_FOLDER", "D:/ISSiRT_youtube_videos")
)
DEFAULT_OUTPUT_FOLDER = Path(
    os.getenv("YT_TRANSCRIPT_OUTPUT", "F:/tempF/iss_working/youtube_transcripts")
)
DEFAULT_CACHE_SUBDIR = "cache"
WEB_ASSETS_ENV_VAR = "WEB_ASSETS_FOLDER"
VIDEO_METADATA_FILENAME = "videoYt.json"

# Legacy naming helpers (carried forward for compatibility)
SEGMENT_FILENAME_TEMPLATE = "{timestamp}-{video_id}_segment_{index:04d}_YT.aac"
TRANSCRIPT_FILENAME_SUFFIX = "_transcript.csv"


# ---------------------------------------------------------------------------
# Dynamic import of corpus utilities
# ---------------------------------------------------------------------------


def load_corpus_module():
    """Dynamically load the COM transcription script as a module."""

    script_path = (
        Path(__file__).resolve().parent.parent
        / "1_comm"
        / "6_transcribe_using_corpus.py"
    )
    if not script_path.exists():
        raise FileNotFoundError(
            f"Unable to locate COM transcription script at {script_path}"
        )

    module_name = "transcription_corpus"
    if module_name in sys.modules:
        module = sys.modules[module_name]
    else:
        spec = importlib.util.spec_from_file_location(module_name, script_path)
        if not spec or not spec.loader:
            raise ImportError(f"Unable to import corpus module from {script_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

    return module


# ---------------------------------------------------------------------------
# Helper utilities specific to the YouTube workflow
# ---------------------------------------------------------------------------


def sanitize_filename(filename: str) -> str:
    return (
        filename.strip()
        .replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace("*", "_")
        .replace("?", "_")
        .replace('"', "_")
        .replace("<", "_")
        .replace(">", "_")
        .replace("|", "_")
    )


def sanitize_transcript_text(value: str) -> str:
    return value.replace("|", " ").replace("\n", " ").replace("\r", " ").strip()


def is_numeric(value: str) -> bool:
    try:
        int(value)
        return True
    except ValueError:
        return False


def parse_video_filename(
    filename: str,
) -> tuple[Optional[datetime], Optional[str], Optional[str], Optional[str]]:
    """Extract YouTube metadata embedded in the download filename."""

    stem = Path(filename).stem
    if len(stem) < 32:
        LOGGER.error("Filename too short to parse YouTube metadata: %s", filename)
        return None, None, None, None

    try:
        date_str = stem[:19]
        if stem[19] != "_":
            raise ValueError("Missing separator after date")
        video_id = stem[20:31]
        if len(video_id) != 11:
            raise ValueError("Invalid video identifier length")
        if stem[31] != "_":
            raise ValueError("Missing separator after video identifier")

        remainder = stem[32:]
        if len(remainder) >= 4 and is_numeric(remainder[:3]) and remainder[3] == "_":
            height = remainder[:3]
            title = remainder[4:]
        else:
            height = None
            title = remainder

        start_time = datetime.strptime(date_str, "%Y-%m-%dT%H-%M-%S")
        return start_time, video_id, title, height
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.error("Failed to parse filename '%s': %s", filename, exc)
        return None, None, None, None


def convert_video_to_wav(video_path: Path, output_root: Path) -> Optional[Path]:
    """Convert the MP4 video to a mono WAV suitable for Whisper/VAD."""

    output_root.mkdir(parents=True, exist_ok=True)
    wav_path = output_root / f"{video_path.stem}_audio.wav"

    if wav_path.exists():
        return wav_path

    cmd = [
        "ffmpeg",
        "-i",
        str(video_path),
        "-ac",
        "1",
        "-ar",
        "32000",
        "-y",
        str(wav_path),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except FileNotFoundError:
        LOGGER.error("ffmpeg executable not found on PATH")
        return None
    except subprocess.CalledProcessError as exc:
        LOGGER.error(
            "ffmpeg failed for %s: %s",
            video_path.name,
            exc.stderr.decode("utf-8", "ignore"),
        )
        return None

    return wav_path


def load_video_metadata(web_assets_folder: Path) -> Dict[str, dict]:
    metadata_path = web_assets_folder / VIDEO_METADATA_FILENAME
    if not metadata_path.exists():
        LOGGER.warning("Video metadata file not found at %s", metadata_path)
        return {}

    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.warning("Failed to load video metadata: %s", exc)
        return {}

    result: Dict[str, dict] = {}
    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(value, dict):
                result[str(key)] = value
    elif isinstance(payload, list):
        for entry in payload:
            if isinstance(entry, dict):
                video_id = entry.get("id") or entry.get("videoId")
                if video_id:
                    result[str(video_id)] = entry
    return result


@dataclass
class TranscriptRow:
    utterance_time: str
    filename: str
    start: str
    end: str
    language: str
    text: str
    text_original_lang: str

    def to_pipe_delimited(self) -> str:
        return "|".join(
            [
                self.utterance_time,
                self.filename,
                self.start,
                self.end,
                self.language,
                self.text,
                self.text_original_lang,
            ]
        )


# ---------------------------------------------------------------------------
# Core transcription flow
# ---------------------------------------------------------------------------


def build_transcript_rows(
    corpus: Any,
    transcription,
    intervals,
    start_time: datetime,
    video_id: str,
) -> List[TranscriptRow]:
    rows: List[TranscriptRow] = []
    for index, interval in enumerate(intervals, start=1):
        if interval.duration <= 0:
            continue

        using_translation = transcription.translation_segments is not None

        if using_translation:
            segments = corpus.dedupe_segment_repetitions(
                corpus.slice_segments_to_interval(
                    transcription.translation_segments or [],
                    interval.start,
                    interval.end,
                    allow_approximate_text=True,
                )
            )
            segments = corpus.prune_empty_segments(segments)
            orig_segments = corpus.prune_empty_segments(
                corpus.slice_segments_to_interval(
                    transcription.alignment_segments,
                    interval.start,
                    interval.end,
                    allow_approximate_text=False,
                )
            )
        else:
            segments = corpus.prune_empty_segments(
                corpus.slice_segments_to_interval(
                    transcription.alignment_segments,
                    interval.start,
                    interval.end,
                    allow_approximate_text=False,
                )
            )
            orig_segments = []

        if not segments and not using_translation:
            segments = corpus.prune_empty_segments(
                corpus.slice_segments_to_interval(
                    transcription.final_segments,
                    interval.start,
                    interval.end,
                    allow_approximate_text=False,
                )
            )

        if not segments:
            continue

        utterance_text = corpus.segments_to_text(segments)
        if not utterance_text:
            continue
        if corpus.is_invalid_transcript_text(utterance_text):
            continue

        original_lang_text = ""
        if using_translation and orig_segments:
            original_lang_text = corpus.segments_to_text(orig_segments)

        start_seconds = float(max(interval.start, 0.0))
        end_seconds = float(max(interval.end, start_seconds))

        utterance_datetime = start_time + timedelta(seconds=start_seconds)
        utterance_time_str = utterance_datetime.strftime("%H:%M:%S")
        filename_timestamp = utterance_datetime.strftime("%Y-%m-%dT%H%M%S")
        filename = SEGMENT_FILENAME_TEMPLATE.format(
            timestamp=filename_timestamp,
            video_id=video_id,
            index=index,
        )

        rows.append(
            TranscriptRow(
                utterance_time=utterance_time_str,
                filename=filename,
                start=f"{start_seconds:.2f}",
                end=f"{end_seconds:.2f}",
                language=transcription.language or "en",
                text=sanitize_transcript_text(utterance_text),
                text_original_lang=sanitize_transcript_text(original_lang_text),
            )
        )

    return rows


def process_video(
    corpus: Any,
    video_path: Path,
    output_root: Path,
    cache_root: Path,
    resources,
    silence_cfg,
    prompt_text: str,
    force: bool,
) -> bool:
    LOGGER.info("Processing %s", video_path.name)

    start_time, video_id, title_fragment, _height = parse_video_filename(
        video_path.name
    )
    if not video_id or start_time is None:
        LOGGER.error("Skipping %s due to unparseable filename", video_path.name)
        return False

    if "launch" in video_path.name.lower():
        LOGGER.info("Skipping launch video %s", video_path.name)
        return True

    wav_path = convert_video_to_wav(video_path, output_root)
    if not wav_path:
        LOGGER.error("Failed to generate WAV for %s", video_path.name)
        return False

    cache_dir = cache_root / video_id
    cache_dir.mkdir(parents=True, exist_ok=True)

    try:
        transcription = corpus.transcribe_full_wav(
            wav_path,
            descriptor=sanitize_filename(title_fragment or video_id),
            start_time=start_time,
            prompt_text=prompt_text,
            resources=resources,
            cache_dir=cache_dir,
            force=force,
        )
    except Exception as exc:  # pylint: disable=broad-except
        LOGGER.exception("Transcription failed for %s: %s", video_path.name, exc)
        try:
            wav_path.unlink()
        except FileNotFoundError:
            pass
        return False

    try:
        audio_segment = corpus.prepare_audio_segment(wav_path)
        intervals = corpus.derive_alignment_intervals(
            transcription.alignment_segments,
            audio_segment.duration_seconds,
            silence_cfg,
            fallback_segments=transcription.final_segments,
        )
        vad_segments = corpus.detect_vad_segments(audio_segment, silence_cfg)
        if vad_segments:
            intervals = corpus.merge_intervals_with_vad(
                intervals,
                vad_segments,
                audio_segment.duration_seconds,
                silence_cfg,
            )

        if not intervals:
            LOGGER.warning("No speech detected for %s", video_path.name)
            return False

        rows = build_transcript_rows(
            corpus, transcription, intervals, start_time, video_id
        )
        if not rows:
            LOGGER.warning("No transcript rows emitted for %s", video_path.name)
            return False

        output_root.mkdir(parents=True, exist_ok=True)
        transcript_path = output_root / f"{video_path.stem}{TRANSCRIPT_FILENAME_SUFFIX}"

        with transcript_path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(row.to_pipe_delimited() + "\n")

        LOGGER.info(
            "Saved transcript with %d rows to %s",
            len(rows),
            transcript_path,
        )
        return True
    finally:
        try:
            wav_path.unlink()
        except FileNotFoundError:
            pass


# ---------------------------------------------------------------------------
# Orchestration / CLI
# ---------------------------------------------------------------------------


def discover_videos(folder: Path) -> List[Path]:
    if not folder.exists():
        LOGGER.error("Download folder does not exist: %s", folder)
        return []
    return sorted(folder.glob("*.mp4"))


def filter_videos(
    video_files: Sequence[Path],
    video_id: Optional[str],
    limit: Optional[int],
) -> List[Path]:
    filtered: Iterable[Path] = video_files
    if video_id:
        filtered = [path for path in filtered if path.stem[20:31] == video_id]
    if limit is not None:
        filtered = list(filtered)[:limit]
    else:
        filtered = list(filtered)
    return filtered


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transcribe YouTube videos with WhisperX corpus workflow"
    )
    parser.add_argument("--download-folder", type=Path, default=DEFAULT_DOWNLOAD_FOLDER)
    parser.add_argument("--output-folder", type=Path, default=DEFAULT_OUTPUT_FOLDER)
    parser.add_argument(
        "--cache-subdir",
        type=str,
        default=DEFAULT_CACHE_SUBDIR,
        help="Subdirectory (inside output folder) for Whisper cache files",
    )
    parser.add_argument(
        "--video-id", type=str, help="Process only the specified YouTube video ID"
    )
    parser.add_argument("--limit", type=int, help="Maximum number of videos to process")
    parser.add_argument(
        "--force", action="store_true", help="Force regeneration of cache entries"
    )
    parser.add_argument("--debug", action="store_true", help="Enable verbose logging")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    corpus = load_corpus_module()
    corpus.load_environment()
    corpus.configure_logging(debug=args.debug)

    if WEB_ASSETS_ENV_VAR not in os.environ:
        LOGGER.error("%s environment variable is not set", WEB_ASSETS_ENV_VAR)
        return 1

    download_folder = args.download_folder
    output_folder = args.output_folder
    output_folder.mkdir(parents=True, exist_ok=True)
    cache_root = output_folder / args.cache_subdir
    cache_root.mkdir(parents=True, exist_ok=True)

    video_files = discover_videos(download_folder)
    if not video_files:
        LOGGER.warning("No MP4 files found in %s", download_folder)
        return 0

    video_files = filter_videos(video_files, args.video_id, args.limit)
    if not video_files:
        LOGGER.warning("No videos matched the provided filters")
        return 0

    metadata = load_video_metadata(Path(os.environ[WEB_ASSETS_ENV_VAR]))

    resources = corpus.WhisperResources.load(
        corpus.DEVICE,
        corpus.MODEL_TYPE,
        corpus.COMPUTE_TYPE,
    )
    silence_cfg = corpus.silence_cfg_factory()

    processed = 0
    failed = 0
    skipped_existing = 0

    for video_path in video_files:
        prompt_text = ""
        _start_time, video_id, _title_fragment, _height = parse_video_filename(
            video_path.name
        )
        if video_id and video_id in metadata:
            title = metadata[video_id].get("title") or metadata[video_id].get("name")
            if title:
                prompt_text = f"YouTube video title: {title}"[:200]

        transcript_path = (
            output_folder / f"{video_path.stem}{TRANSCRIPT_FILENAME_SUFFIX}"
        )
        if transcript_path.exists() and not args.force:
            LOGGER.info("Transcript already exists for %s; skipping", video_path.name)
            skipped_existing += 1
            continue

        try:
            succeeded = process_video(
                corpus,
                video_path,
                output_root=output_folder,
                cache_root=cache_root,
                resources=resources,
                silence_cfg=silence_cfg,
                prompt_text=prompt_text,
                force=args.force,
            )
        except Exception as exc:  # pylint: disable=broad-except
            LOGGER.exception(
                "Unexpected failure processing %s: %s", video_path.name, exc
            )
            succeeded = False

        if succeeded:
            processed += 1
        else:
            failed += 1

    LOGGER.critical(
        "YouTube transcription completed. Successful: %d | Failed: %d | Skipped existing: %d",
        processed,
        failed,
        skipped_existing,
    )

    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
