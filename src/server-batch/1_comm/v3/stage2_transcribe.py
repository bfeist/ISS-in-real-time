#!/usr/bin/env python3
"""Stage 2: Transcribe, align, and diarize Stage 1 artifacts for the v3 pipeline."""

from __future__ import annotations

import argparse
import datetime as dt
import inspect
import json
import logging
import os
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from dotenv import load_dotenv
from rich.console import Console
from rich.logging import RichHandler
from zoneinfo import ZoneInfo

try:
    import whisperx  # type: ignore
except ImportError as exc:  # pragma: no cover - dependency guard
    raise SystemExit(
        "whisperx is required for Stage 2. Install it with 'pip install whisperx'."
    ) from exc

try:
    import torch  # type: ignore
except ImportError:  # pragma: no cover - torch optional for CPU-only setups
    torch = None  # type: ignore

SCRIPT_DIR = Path(__file__).resolve().parent
PARENT_DIR = SCRIPT_DIR.parent
ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"

if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from filename_patterns import FilenameParseError, parse_wav_filename  # noqa: E402
from log_db import parse_zip_metadata  # noqa: E402

# ---------------------------------------------------------------------------
# Constants & defaults
# ---------------------------------------------------------------------------

DEFAULT_STAGE1_DIRNAME = "1_comm_raw_m4a"
DEFAULT_STAGE2_DIRNAME = "2_comm_raw_transcripts"
PROMPT_ROOT_SUBPATH = "prompt_context"
STAGE1_MARKER_PREFIX = "_stage1_extract"
STAGE1_IN_PROGRESS_SUFFIX = "in-progress"
STAGE1_DONE_SUFFIX = "done"
STAGE2_MARKER_PREFIX = "_stage2_transcribe"
STAGE2_IN_PROGRESS_SUFFIX = "in-progress"
STAGE2_DONE_SUFFIX = "done"
STAGE2_ERROR_SUFFIX = "error"
AUDIO_SAMPLE_RATE = 16_000
CENTRAL_TZ = ZoneInfo("America/Chicago")
UTC_TZ = dt.timezone.utc
IA_SKIP_ZIPS_TRACKING_FILE = SCRIPT_DIR.parent / "ia_skip_zips.txt"

console = Console()
logger = logging.getLogger("stage2_transcribe")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def configure_logging(debug: bool = False) -> None:
    handler = RichHandler(console=console, show_level=True, show_time=True)
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(message)s",
        handlers=[handler],
    )
    logger.setLevel(logging.DEBUG if debug else logging.INFO)
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


def iso_utc_now() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def read_tracking_file(file_path: Path) -> list[str]:
    if not file_path.exists():
        return []
    return [
        line.strip()
        for line in file_path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def parse_positive_int(value: Optional[str], default: int, *, minimum: int = 1) -> int:
    try:
        parsed = int(value) if value is not None else default
    except ValueError:
        return default
    return max(parsed, minimum)


def parse_optional_int(value: Optional[str]) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


_STAGE1_OUTPUT_RE = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})T(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})-(?P<descriptor>.+)_IA\.m4a$"
)


def parse_stage1_output_name(filename: str) -> Tuple[str, str]:
    match = _STAGE1_OUTPUT_RE.match(filename)
    if not match:
        raise ValueError(f"Unable to parse Stage 1 filename '{filename}'")
    date_part = match.group("date")
    iso_start = f"{date_part}T{match.group('hour')}{match.group('minute')}{match.group('second')}"
    descriptor = match.group("descriptor")
    return iso_start, descriptor


def ct_and_utc_from_iso(iso_compact: str) -> Tuple[dt.datetime, dt.datetime]:
    naive = dt.datetime.strptime(iso_compact, "%Y-%m-%dT%H%M%S")
    ct_time = naive.replace(tzinfo=CENTRAL_TZ)
    return ct_time, ct_time.astimezone(UTC_TZ)


def build_initial_prompt(
    comm_time: dt.datetime, descriptor: str, prompt_root: Path
) -> str:
    prompt_dir = prompt_root / comm_time.strftime("%Y/%m/%d")
    prompt_file = prompt_dir / "prompt.txt"

    prompt_text = ""
    if prompt_file.exists():
        prompt_text = prompt_file.read_text(encoding="utf-8").strip()

    clean_descriptor = descriptor.lstrip("1_").replace("_", " ").replace("-", " ")
    channel_hint = f"Channel: {clean_descriptor}"
    if prompt_text:
        return f"{channel_hint}\n\n{prompt_text}"
    return channel_hint


def marker_name(prefix: str, zip_stem: str, suffix: str) -> str:
    return f"{prefix}.{zip_stem}.{suffix}"


def stage1_marker_path(stage1_dir: Path, zip_stem: str, suffix: str) -> Path:
    return stage1_dir / marker_name(STAGE1_MARKER_PREFIX, zip_stem, suffix)


def stage2_marker_path(stage2_dir: Path, zip_stem: str, suffix: str) -> Path:
    return stage2_dir / marker_name(STAGE2_MARKER_PREFIX, zip_stem, suffix)


def write_marker(path: Path, message: str) -> None:
    path.write_text(message, encoding="utf-8")


def clear_marker(path: Path) -> None:
    path.unlink(missing_ok=True)


def extract_zip_stem(marker_filename: str, *, suffix: str) -> Optional[str]:
    prefix = f"{STAGE1_MARKER_PREFIX}."
    suffix_token = f".{suffix}"
    if not marker_filename.startswith(prefix) or not marker_filename.endswith(
        suffix_token
    ):
        return None
    return marker_filename[len(prefix) : -len(suffix_token)]


def find_zip_path(
    zip_stem: str, sources: Sequence[Tuple[Path, str]]
) -> Tuple[Optional[Path], Optional[str]]:
    matches: list[Tuple[Path, str]] = []
    for folder, kind in sources:
        candidate = folder / f"{zip_stem}.zip"
        if candidate.exists():
            matches.append((candidate, kind))
    if not matches:
        return None, None
    if len(matches) > 1:
        logger.warning(
            "Multiple zip matches for %s: %s; using the first entry",
            zip_stem,
            ", ".join(str(path) for path, _ in matches),
        )
    return matches[0]


def expected_stage1_outputs(zip_path: Path) -> list[str]:
    outputs: list[str] = []
    seen: set[str] = set()
    with zipfile.ZipFile(zip_path, "r") as archive:
        for member in archive.infolist():
            if member.is_dir() or not member.filename.lower().endswith(".wav"):
                continue
            base_name = os.path.basename(member.filename)
            try:
                parsed = parse_wav_filename(base_name)
            except FilenameParseError:
                continue
            candidate = f"{parsed.iso_start}-{parsed.channel_descriptor}_IA.m4a"
            if candidate not in seen:
                seen.add(candidate)
                outputs.append(candidate)
    return outputs


def relative_to(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def json_default(value):  # pragma: no cover - helper for json dumps
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def flush_cuda_cache() -> None:
    if torch is None:
        return
    if torch.cuda.is_available():  # pragma: no cover - GPU dependent
        try:
            torch.cuda.empty_cache()
        except Exception:  # pragma: no cover - defensive guard
            logger.debug("torch.cuda.empty_cache() raised unexpectedly", exc_info=True)


# ---------------------------------------------------------------------------
# Configuration & job modelling
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Stage2Config:
    stage1_root: Path
    stage2_root: Path
    prompt_root: Path
    sources: list[Tuple[Path, str]]
    device: str
    compute_type: str
    batch_size: int
    chunk_length: int
    alignment_device: str
    diarization_device: str
    diarization_min_speakers: Optional[int]
    diarization_max_speakers: Optional[int]
    hf_token: Optional[str]

    @staticmethod
    def from_env() -> "Stage2Config":
        raw_folder = os.getenv("RAW_FOLDER")
        if not raw_folder:
            raise RuntimeError("RAW_FOLDER environment variable is not defined")

        raw_audio_folder = os.getenv("RAW_AUDIO_FOLDER")
        if not raw_audio_folder:
            raise RuntimeError("RAW_AUDIO_FOLDER environment variable is not defined")

        stage1_root = Path(raw_folder) / DEFAULT_STAGE1_DIRNAME
        stage2_root = Path(raw_folder) / DEFAULT_STAGE2_DIRNAME
        prompt_root = derive_prompt_root(raw_folder)

        sources = [
            (Path(raw_audio_folder) / "InternetArchive_space_to_grounds", "SG"),
            (Path(raw_audio_folder) / "InternetArchive_dragon_cst_to_grounds", "AG"),
        ]

        device = os.getenv("WHISPER_DEVICE", "cuda")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
        batch_size = parse_positive_int(os.getenv("WHISPER_BATCH_SIZE"), 16)
        chunk_length = parse_positive_int(os.getenv("WHISPER_CHUNK_LENGTH"), 30)
        alignment_device = os.getenv("WHISPER_ALIGN_DEVICE", device)
        diarization_device = os.getenv("WHISPER_DIARIZATION_DEVICE", device)
        diarization_min = parse_optional_int(
            os.getenv("WHISPER_DIARIZATION_MIN_SPEAKERS")
        )
        diarization_max = parse_optional_int(
            os.getenv("WHISPER_DIARIZATION_MAX_SPEAKERS")
        )
        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")

        ensure_directory(stage2_root)

        return Stage2Config(
            stage1_root=stage1_root,
            stage2_root=stage2_root,
            prompt_root=prompt_root,
            sources=sources,
            device=device,
            compute_type=compute_type,
            batch_size=batch_size,
            chunk_length=chunk_length,
            alignment_device=alignment_device,
            diarization_device=diarization_device,
            diarization_min_speakers=diarization_min,
            diarization_max_speakers=diarization_max,
            hf_token=hf_token,
        )


@dataclass
class Stage2Job:
    zip_name: str
    zip_stem: str
    zip_type: str
    iso_date: str
    stage1_date_dir: Path
    stage2_date_dir: Path
    stage2_output_dir: Path
    expected_audio_files: list[str]
    stage1_done_marker: Path
    stage1_in_progress_marker: Path
    stage2_in_progress_marker: Path
    stage2_done_marker: Path
    stage2_error_marker: Path
    zip_path: Path
    source_kind: Optional[str] = None

    def audio_paths(self) -> List[Path]:
        return [self.stage1_date_dir / name for name in self.expected_audio_files]


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------


def derive_prompt_root(raw_folder: str | None) -> Path:
    explicit = os.getenv("PROMPT_CONTEXT_ROOT")
    if explicit:
        return Path(explicit)
    if not raw_folder:
        raise RuntimeError(
            "RAW_FOLDER environment variable is not defined and PROMPT_CONTEXT_ROOT is unset"
        )
    return Path(raw_folder) / PROMPT_ROOT_SUBPATH


# ---------------------------------------------------------------------------
# WhisperX resource manager
# ---------------------------------------------------------------------------


@lru_cache(maxsize=None)
def _pipeline_supported_transcribe_params(pipeline_cls: type) -> set[str]:
    """Introspect pipeline's transcribe method to determine supported parameters."""
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
    """Call pipeline.transcribe() with only the parameters it actually supports."""
    transcribe_fn = getattr(pipeline, "transcribe", None)
    if not callable(transcribe_fn):
        raise AttributeError(
            f"Pipeline '{type(pipeline).__name__}' does not expose a callable transcribe() method"
        )

    supported_params = _pipeline_supported_transcribe_params(type(pipeline))
    filtered_kwargs = {k: v for k, v in kwargs.items() if k in supported_params}

    dropped_params = sorted(set(kwargs.keys()) - set(filtered_kwargs.keys()))
    if dropped_params:
        logger.debug(
            "Skipping unsupported transcribe kwargs for %s: %s",
            type(pipeline).__name__,
            ", ".join(dropped_params),
        )

    return transcribe_fn(audio, **filtered_kwargs)


class AlignmentModelUnavailableError(RuntimeError):
    """Raised when no alignment model exists for a language."""


@dataclass
class WhisperResources:
    model_type: str = field(
        default_factory=lambda: os.getenv("WHISPER_MODEL_TYPE", "large-v3")
    )
    device: str = field(default_factory=lambda: os.getenv("WHISPER_DEVICE", "cuda"))
    compute_type: str = field(
        default_factory=lambda: os.getenv("WHISPER_COMPUTE_TYPE", "float16")
    )
    alignment_device: str = field(
        default_factory=lambda: os.getenv("WHISPER_ALIGN_DEVICE", "cuda")
    )
    diarization_device: str = field(
        default_factory=lambda: os.getenv("WHISPER_DIARIZATION_DEVICE", "cuda")
    )
    diarization_min_speakers: Optional[int] = None
    diarization_max_speakers: Optional[int] = None
    hf_token: Optional[str] = None
    batch_size: int = 16
    chunk_length: int = 30

    _model: Optional[object] = field(default=None, init=False, repr=False)
    _align_models: Dict[str, Tuple[object, dict]] = field(
        default_factory=dict, init=False, repr=False
    )
    _diarization_pipeline: Optional[object] = field(
        default=None, init=False, repr=False
    )

    def ensure_model(self) -> None:
        if self._model is not None:
            return
        logger.info(
            "Loading WhisperX model '%s' on %s (%s)",
            self.model_type,
            self.device,
            self.compute_type,
        )
        self._model = whisperx.load_model(
            self.model_type,
            self.device,
            compute_type=self.compute_type,
        )

    def transcribe(self, audio, *, initial_prompt: Optional[str]) -> Dict[str, object]:
        self.ensure_model()
        kwargs = {
            "batch_size": self.batch_size,
        }
        if initial_prompt:
            kwargs["initial_prompt"] = initial_prompt
        return transcribe_with_model(self._model, audio, **kwargs)

    def get_alignment_model(self, language_code: str) -> Tuple[object, dict]:
        key = language_code or "en"
        if key in self._align_models:
            return self._align_models[key]
        try:
            logger.debug(
                "Loading alignment model for %s on %s", key, self.alignment_device
            )
            align_model, metadata = whisperx.load_align_model(
                language_code=key,
                device=self.alignment_device,
            )
        except Exception as exc:  # pragma: no cover - handled upstream
            raise AlignmentModelUnavailableError(key) from exc
        self._align_models[key] = (align_model, metadata)
        return align_model, metadata

    def align(
        self,
        segments: Sequence[dict],
        audio,
        language_code: str,
    ) -> Dict[str, object]:
        align_model, metadata = self.get_alignment_model(language_code)
        alignment_result = whisperx.align(
            segments,
            align_model,
            metadata,
            audio,
            device=self.alignment_device,
            return_char_alignments=False,
        )
        return {
            "language": language_code,
            "segments": alignment_result.get("segments", []),
            "word_segments": alignment_result.get("word_segments"),
            "metadata": {
                key: metadata.get(key)
                for key in ("language", "sample_rate", "pad_to", "duration")
                if key in metadata
            },
        }

    def diarize(self, audio_path: Path) -> Dict[str, object] | List[dict]:
        if self._diarization_pipeline is None:
            if not self.hf_token:
                raise RuntimeError(
                    "HF_TOKEN or HUGGINGFACEHUB_API_TOKEN environment variable is required for diarization. "
                    "Visit https://hf.co/settings/tokens to create your access token, "
                    "then accept the terms at https://hf.co/pyannote/speaker-diarization-3.1"
                )
            logger.debug("Loading diarization pipeline on %s", self.diarization_device)
            try:
                self._diarization_pipeline = whisperx.diarize.DiarizationPipeline(
                    device=self.diarization_device,
                    use_auth_token=self.hf_token,
                )
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to load diarization pipeline. Make sure you have:\n"
                    f"1. Set HF_TOKEN environment variable\n"
                    f"2. Accepted terms at https://hf.co/pyannote/speaker-diarization-3.1\n"
                    f"3. Accepted terms at https://hf.co/pyannote/segmentation-3.0\n"
                    f"Original error: {exc}"
                ) from exc
        kwargs: dict[str, object] = {}
        if self.diarization_min_speakers is not None:
            kwargs["min_speakers"] = self.diarization_min_speakers
        if self.diarization_max_speakers is not None:
            kwargs["max_speakers"] = self.diarization_max_speakers
        return self._diarization_pipeline(str(audio_path), **kwargs)


# ---------------------------------------------------------------------------
# Job discovery & filtering
# ---------------------------------------------------------------------------


def collect_jobs(
    config: Stage2Config,
    *,
    selected_names: Optional[set[str]],
    skip_list: set[str],
) -> list[Stage2Job]:
    jobs: list[Stage2Job] = []
    pattern = f"{STAGE1_MARKER_PREFIX}.*.{STAGE1_DONE_SUFFIX}"
    for marker in sorted(config.stage1_root.rglob(pattern)):
        zip_stem = extract_zip_stem(marker.name, suffix=STAGE1_DONE_SUFFIX)
        if not zip_stem:
            continue
        if (
            selected_names
            and zip_stem not in selected_names
            and f"{zip_stem}.zip" not in selected_names
        ):
            continue
        if zip_stem in skip_list or f"{zip_stem}.zip" in skip_list:
            logger.debug("Skipping %s due to skip list", zip_stem)
            continue

        zip_path, source_kind = find_zip_path(zip_stem, config.sources)
        if not zip_path:
            logger.warning("Unable to locate zip for Stage 1 marker %s", marker)
            continue

        zip_name = zip_path.name
        if (
            selected_names
            and zip_name not in selected_names
            and zip_stem not in selected_names
        ):
            continue

        try:
            iso_date, zip_type = parse_zip_metadata(zip_name)
        except ValueError as exc:
            logger.warning("Skipping %s: %s", zip_name, exc)
            continue

        expected_outputs = expected_stage1_outputs(zip_path)
        if not expected_outputs:
            logger.warning("Zip %s produced no expected Stage 1 outputs", zip_name)
            continue

        stage1_date_dir = marker.parent
        stage2_date_dir = (
            config.stage2_root / iso_date[:4] / iso_date[5:7] / iso_date[8:10]
        )
        stage2_output_dir = stage2_date_dir

        job = Stage2Job(
            zip_name=zip_name,
            zip_stem=zip_stem,
            zip_type=zip_type,
            iso_date=iso_date,
            stage1_date_dir=stage1_date_dir,
            stage2_date_dir=stage2_date_dir,
            stage2_output_dir=stage2_output_dir,
            expected_audio_files=expected_outputs,
            stage1_done_marker=marker,
            stage1_in_progress_marker=stage1_marker_path(
                stage1_date_dir, zip_stem, STAGE1_IN_PROGRESS_SUFFIX
            ),
            stage2_in_progress_marker=stage2_marker_path(
                stage2_date_dir, zip_stem, STAGE2_IN_PROGRESS_SUFFIX
            ),
            stage2_done_marker=stage2_marker_path(
                stage2_date_dir, zip_stem, STAGE2_DONE_SUFFIX
            ),
            stage2_error_marker=stage2_marker_path(
                stage2_date_dir, zip_stem, STAGE2_ERROR_SUFFIX
            ),
            zip_path=zip_path,
            source_kind=source_kind,
        )
        jobs.append(job)

    return jobs


def filter_jobs_by_date(
    jobs: list[Stage2Job],
    *,
    requested_dates: set[dt.date],
    start_date: Optional[dt.date],
    end_date: Optional[dt.date],
) -> list[Stage2Job]:
    if not requested_dates and not start_date and not end_date:
        return jobs

    def include(job: Stage2Job) -> bool:
        job_date = dt.date.fromisoformat(job.iso_date)
        if requested_dates and job_date not in requested_dates:
            return False
        if start_date and job_date < start_date:
            return False
        if end_date and job_date > end_date:
            return False
        return True

    return [job for job in jobs if include(job)]


def parse_date_arg(value: str) -> dt.date:
    try:
        return dt.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid date '{value}'. Expected format YYYY-MM-DD"
        ) from exc


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------


def load_audio(audio_path: Path):
    audio = whisperx.load_audio(str(audio_path))
    return audio


def display_transcription_summary(
    audio_path: Path,
    payload: Dict[str, object],
) -> None:
    """Display a summary of transcription results."""
    console.print(f"\n[bold cyan]Transcription Summary: {audio_path.name}[/bold cyan]")

    timing = payload.get("timing", {})
    language_info = payload.get("language", {})

    console.print(f"  Duration: {timing.get('duration', 0):.2f}s")
    console.print(f"  Language: {language_info.get('detected', 'unknown')}")

    segments = payload.get("segments", [])
    translation_segments = payload.get("translationSegments") or []
    console.print(f"  Segments: {len(segments)}")
    if translation_segments:
        console.print(f"  Translation Segments: {len(translation_segments)}")

    # Show alignment info
    alignment = payload.get("alignment", {})
    alignment_meta = alignment.get("metadata", {})
    if alignment_meta.get("fallback"):
        console.print(f"  Alignment: [yellow]{alignment_meta['fallback']}[/yellow]")
    else:
        console.print("  Alignment: [green]✓[/green]")

    # Show diarization info
    diarization = payload.get("diarization", {})
    diarization_segments = diarization.get("segments", [])
    diarization_meta = diarization.get("metadata", {})
    if diarization_meta.get("fallback"):
        console.print(f"  Diarization: [yellow]{diarization_meta['fallback']}[/yellow]")
    elif diarization_segments:
        speakers = set()
        for seg in diarization_segments:
            if isinstance(seg, dict) and "speaker" in seg:
                speakers.add(seg["speaker"])
        console.print(f"  Diarization: [green]✓ ({len(speakers)} speakers)[/green]")
    else:
        console.print("  Diarization: [dim]none[/dim]")

    # Display transcript text
    if segments:
        console.print("\n[bold]Transcript:[/bold]")
        for seg in segments:
            if isinstance(seg, dict):
                text = seg.get("text", "").strip()
                if text:
                    start = seg.get("start", 0)
                    console.print(f"  [{start:7.2f}s] {text}")

    if translation_segments:
        console.print("\n[bold]Translation:[/bold]")
        for seg in translation_segments:
            if isinstance(seg, dict):
                text = seg.get("text", "").strip()
                if text:
                    start = seg.get("start", 0)
                    console.print(f"  [{start:7.2f}s] {text}")

    console.print()


def process_audio_file(
    audio_path: Path,
    *,
    job: Stage2Job,
    config: Stage2Config,
    resources: WhisperResources,
) -> Dict[str, object]:
    iso_start_compact, descriptor = parse_stage1_output_name(audio_path.name)
    ct_start, utc_start = ct_and_utc_from_iso(iso_start_compact)
    prompt = build_initial_prompt(ct_start, descriptor, config.prompt_root)

    audio = load_audio(audio_path)
    duration = float(len(audio)) / float(AUDIO_SAMPLE_RATE) if len(audio) else 0.0

    transcription = resources.transcribe(audio, initial_prompt=prompt)
    language = transcription.get("language") or "unknown"
    detected_language = transcription.get("detected_language") or language
    translation_segments = transcription.get("translation_segments")

    alignment_payload: Dict[str, object]
    try:
        alignment_payload = resources.align(
            transcription.get("segments", []),
            audio,
            detected_language,
        )
        has_alignment = True
    except AlignmentModelUnavailableError:
        logger.info(
            "No alignment model for %s; using Whisper timestamps for %s",
            detected_language,
            audio_path.name,
        )
        alignment_payload = {
            "language": detected_language,
            "segments": transcription.get("segments", []),
            "word_segments": None,
            "metadata": {"fallback": "whisper"},
        }
        has_alignment = False
    except Exception as exc:  # pragma: no cover - robustness path
        logger.warning("Alignment failed for %s: %s", audio_path.name, exc)
        alignment_payload = {
            "language": detected_language,
            "segments": transcription.get("segments", []),
            "word_segments": None,
            "metadata": {"fallback": f"error: {exc}"},
        }
        has_alignment = False

    diarization_segments: List[dict]
    diarization_meta: Dict[str, object]
    try:
        diarization_result = resources.diarize(audio_path)
        if isinstance(diarization_result, dict):
            diarization_segments = diarization_result.get("segments", []) or []
            diarization_meta = {
                key: value
                for key, value in diarization_result.items()
                if key != "segments"
            }
        else:
            diarization_segments = list(diarization_result)  # type: ignore[arg-type]
            diarization_meta = {}
        has_diarization = bool(diarization_segments)
    except Exception as exc:  # pragma: no cover - diarization optional
        logger.warning("Diarization failed for %s: %s", audio_path.name, exc)
        diarization_segments = []
        diarization_meta = {"fallback": f"error: {exc}"}
        has_diarization = False

    payload = {
        "version": 3,
        "zipName": job.zip_name,
        "zipType": job.zip_type,
        "zipDate": job.iso_date,
        "source": {
            "stage1Audio": audio_path.name,
            "stage1RelativePath": relative_to(audio_path, config.stage1_root),
            "stage2RelativePath": relative_to(
                job.stage2_output_dir, config.stage2_root
            ),
            "zipPath": str(job.zip_path),
            "channel": descriptor,
            "sourceKind": job.source_kind,
        },
        "timing": {
            "ctStart": ct_start.isoformat(),
            "utcStart": utc_start.isoformat(),
            "duration": round(duration, 3),
        },
        "prompt": prompt,
        "language": {
            "language": language,
            "detected": detected_language,
        },
        "segments": transcription.get("segments", []),
        "translationSegments": translation_segments,
        "alignment": alignment_payload,
        "diarization": {
            "segments": diarization_segments,
            "metadata": diarization_meta,
        },
        "model": {
            "modelType": resources.model_type,
            "device": resources.device,
            "computeType": resources.compute_type,
        },
    }

    flush_cuda_cache()

    return payload


def process_job(
    job: Stage2Job,
    *,
    config: Stage2Config,
    resources: WhisperResources,
    force: bool,
    erase: bool,
    see_transcriptions: bool = False,
) -> bool:
    if job.stage1_in_progress_marker.exists():
        logger.info("Skipping %s; Stage 1 still shows as in progress", job.zip_name)
        return False

    if not job.stage1_done_marker.exists():
        logger.info("Skipping %s; Stage 1 not yet marked done", job.zip_name)
        return False

    if erase:
        if job.stage2_output_dir.exists():
            shutil.rmtree(job.stage2_output_dir, ignore_errors=True)
        clear_marker(job.stage2_done_marker)
        clear_marker(job.stage2_error_marker)
        clear_marker(job.stage2_in_progress_marker)

    if job.stage2_done_marker.exists() and not force:
        logger.info("Skipping %s; Stage 2 already complete", job.zip_name)
        return False

    skip_existing_outputs = not force and not erase
    processed_count = 0

    ensure_directory(job.stage2_date_dir)
    ensure_directory(job.stage2_output_dir)

    resuming_from_marker = (
        job.stage2_in_progress_marker.exists() and not erase and not force
    )
    if resuming_from_marker:
        logger.info(
            "Resuming Stage 2 for %s; existing transcripts will be reused",
            job.zip_name,
        )

    write_marker(job.stage2_in_progress_marker, iso_utc_now())

    try:
        for audio_name in job.expected_audio_files:
            audio_path = job.stage1_date_dir / audio_name
            if not audio_path.exists():
                raise FileNotFoundError(f"Expected Stage 1 audio missing: {audio_path}")

            output_path = job.stage2_output_dir / f"{audio_path.stem}.json"

            if skip_existing_outputs and output_path.exists():
                logger.debug(
                    "Skipping %s; found existing transcript %s",
                    audio_path.name,
                    relative_to(output_path, config.stage2_root),
                )
                continue

            payload = process_audio_file(
                audio_path,
                job=job,
                config=config,
                resources=resources,
            )
            output_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2, default=json_default),
                encoding="utf-8",
            )
            processed_count += 1

            if see_transcriptions:
                display_transcription_summary(audio_path, payload)

        clear_marker(job.stage2_error_marker)
        write_marker(job.stage2_done_marker, iso_utc_now())
        logger.info(
            "Completed Stage 2 for %s; processed %d new transcript(s)",
            job.zip_name,
            processed_count,
        )
        return True
    except Exception as exc:  # pragma: no cover - defensive catch-all
        logger.exception("Failed Stage 2 processing for %s: %s", job.zip_name, exc)
        write_marker(job.stage2_error_marker, f"{iso_utc_now()} {exc}")
        return False
    finally:
        clear_marker(job.stage2_in_progress_marker)


# ---------------------------------------------------------------------------
# CLI handling
# ---------------------------------------------------------------------------


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stage 2 transcription for the ISS comm v3 pipeline",
    )
    parser.add_argument(
        "--zip",
        action="append",
        dest="zips",
        help="Specific zip filename (or stem) to process; can be provided multiple times",
    )
    parser.add_argument("--limit", type=int, help="Only process this many zip archives")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess even if a Stage 2 done marker exists",
    )
    parser.add_argument(
        "--erase",
        action="store_true",
        help="Delete existing Stage 2 outputs for each zip before processing",
    )
    parser.add_argument(
        "--date",
        action="append",
        type=parse_date_arg,
        dest="dates",
        help="Specific YYYY-MM-DD date to process (can be provided multiple times)",
    )
    parser.add_argument(
        "--start-date",
        type=parse_date_arg,
        help="Inclusive start date (YYYY-MM-DD) when paired with --end-date",
    )
    parser.add_argument(
        "--end-date",
        type=parse_date_arg,
        help="Inclusive end date (YYYY-MM-DD) when paired with --start-date",
    )
    parser.add_argument(
        "--newest-first",
        action="store_true",
        help="Process in reverse chronological order (newest first)",
    )
    parser.add_argument(
        "--see-transcriptions",
        action="store_true",
        help="Display transcription results after processing each audio file",
    )
    return parser.parse_args(argv)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(debug=args.debug)
    load_environment(ROOT_ENV_PATH)
    try:
        config = Stage2Config.from_env()
    except RuntimeError as exc:
        logger.error(str(exc))
        return 1

    selected_names = set(args.zips) if args.zips else None
    skip_entries = set(read_tracking_file(IA_SKIP_ZIPS_TRACKING_FILE))

    jobs = collect_jobs(
        config,
        selected_names=selected_names,
        skip_list=skip_entries,
    )

    requested_dates = set(args.dates or [])
    jobs = filter_jobs_by_date(
        jobs,
        requested_dates=requested_dates,
        start_date=args.start_date,
        end_date=args.end_date,
    )
    if not jobs:
        logger.info("No Stage 2 jobs matched the current filters")
        return 0
    jobs.sort(key=lambda job: (job.iso_date, job.zip_name))
    if args.newest_first:
        jobs.reverse()

    if args.limit is not None and args.limit > 0:
        jobs = jobs[: args.limit]

    logger.info("Processing %d Stage 2 job(s)", len(jobs))

    resources = WhisperResources(
        model_type=os.getenv("WHISPER_MODEL_TYPE", "large-v3"),
        device=config.device,
        compute_type=config.compute_type,
        alignment_device=config.alignment_device,
        diarization_device=config.diarization_device,
        diarization_min_speakers=config.diarization_min_speakers,
        diarization_max_speakers=config.diarization_max_speakers,
        hf_token=config.hf_token,
        batch_size=config.batch_size,
        chunk_length=config.chunk_length,
    )

    overall_success = True
    for job in jobs:
        logger.info(
            "Stage 2 processing %s (%s)",
            job.zip_name,
            job.zip_type,
        )
        job_success = process_job(
            job,
            config=config,
            resources=resources,
            force=args.force,
            erase=args.erase,
            see_transcriptions=args.see_transcriptions,
        )
        overall_success = overall_success and job_success

    return 0 if overall_success else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        sys.exit(130)
