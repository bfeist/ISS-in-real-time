#!/usr/bin/env python3
"""Stage 1: Extract & normalize IA comm archives for the v3 pipeline."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import logging
import os
import shutil
import subprocess
import sys
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from dotenv import load_dotenv
from rich.console import Console
from rich.logging import RichHandler

SCRIPT_DIR = Path(__file__).resolve().parent
PARENT_DIR = SCRIPT_DIR.parent
ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"

if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from log_db import parse_zip_metadata  # noqa: E402
from filename_patterns import (  # noqa: E402
    FilenameParseError,
    ParsedWavName,
    parse_wav_filename,
)

# ---------------------------------------------------------------------------
# Constants & configuration defaults
# ---------------------------------------------------------------------------

TRACKING_DIR = SCRIPT_DIR.parent
DEFAULT_STAGE1_OUTPUT_DIRNAME = "1_comm_raw_m4a"
STAGE1_MARKER_PREFIX = "_stage1_extract"
STAGE1_IN_PROGRESS_SUFFIX = "in-progress"
STAGE1_DONE_SUFFIX = "done"
STAGE1_ERROR_SUFFIX = "error"
STAGE1_BAD_ZIPS_LOG = TRACKING_DIR / "stage1_bad_zips.csv"
ZIP_PENDING_GRACE_PERIOD = dt.timedelta(minutes=10)
DEFAULT_AAC_BITRATE = "128k"
DEFAULT_AAC_SAMPLE_RATE = 32_000
DEFAULT_MAX_WORKERS = max(1, min(8, os.cpu_count() or 4))

IA_ZIPS_PROCESSED_TRACKING_FILE = TRACKING_DIR / "ia_zips_processed.txt"
IA_ZIPS_IN_PROGRESS_TRACKING_FILE = TRACKING_DIR / "ia_zips_in_progress.txt"
IA_SKIP_ZIPS_TRACKING_FILE = TRACKING_DIR / "ia_skip_zips.txt"
IA_ZIPS_ERRORS_TRACKING_FILE = TRACKING_DIR / "ia_zips_errors.txt"

ZIP_KIND_DEFAULT_TYPE = {
    "SG": "Space-to-Grounds",
    "AG": "Dragon-to-Grounds",
}

console = Console()
logger = logging.getLogger("stage1_extract")
file_lock = threading.RLock()

# ---------------------------------------------------------------------------
# Dataclasses & custom errors
# ---------------------------------------------------------------------------


class ConfigError(RuntimeError):
    """Raised when the environment configuration is incomplete."""


@dataclass(frozen=True)
class Stage1Config:
    stage1_root: Path
    working_root: Path
    sources: list[tuple[Path, str]]
    audio_bitrate: str
    audio_sample_rate: int
    max_workers: int


@dataclass(frozen=True)
class ZipJob:
    name: str
    folder: Path
    source_kind: str
    date_hint: dt.date | None

    @property
    def path(self) -> Path:
        return self.folder / self.name

    @property
    def stem(self) -> str:
        return Path(self.name).stem


class ZipPendingDownloadError(Exception):
    """Raised when a zip appears to still be downloading."""


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


def append_bad_zip_record(zip_iso_date: str, zip_filename: str, message: str) -> None:
    with file_lock:
        exists = STAGE1_BAD_ZIPS_LOG.exists()
        with STAGE1_BAD_ZIPS_LOG.open("a", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="|")
            if not exists:
                writer.writerow(
                    ["zip_iso_date", "zip_filename", "error_message", "logged_at_iso"]
                )
            writer.writerow([zip_iso_date, zip_filename, message, iso_utc_now()])


def _ffmpeg_executable() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise RuntimeError("ffmpeg executable not found on PATH")
    return exe


def _convert_wav_to_m4a(
    wav_path: Path,
    m4a_path: Path,
    *,
    bitrate: str,
    sample_rate: int,
) -> None:
    ensure_directory(m4a_path.parent)
    cmd = [
        _ffmpeg_executable(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(wav_path),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-c:a",
        "aac",
        "-b:a",
        bitrate,
        "-movflags",
        "+faststart",
        str(m4a_path),
    ]
    subprocess.run(cmd, check=True)


def zip_likely_in_progress(zip_path: Path) -> bool:
    try:
        stat_info = zip_path.stat()
    except OSError:
        return False
    if stat_info.st_size == 0:
        return True
    last_modified = dt.datetime.fromtimestamp(stat_info.st_mtime)
    return dt.datetime.now() - last_modified <= ZIP_PENDING_GRACE_PERIOD


def get_zip_date_key(zip_filename: str) -> str:
    date_fragment = zip_filename[:8]
    try:
        month = date_fragment[:2]
        day = date_fragment[3:5]
        year = date_fragment[6:8]
        return f"20{year}-{month}-{day}"
    except Exception:  # pragma: no cover - defensive fallback
        return "unknown"


def infer_date_hint(zip_name: str) -> dt.date | None:
    date_key = get_zip_date_key(zip_name)
    if date_key == "unknown":
        return None
    try:
        return dt.date.fromisoformat(date_key)
    except ValueError:
        return None


def _dedupe_target_path(base_dir: Path, filename: str) -> Path:
    candidate = base_dir / filename
    if not candidate.exists():
        return candidate

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    counter = 1
    while True:
        deduped = base_dir / f"{stem}_{counter}{suffix}"
        if not deduped.exists():
            return deduped
        counter += 1


def _prepare_working_dir(base: Path) -> None:
    if base.exists():
        shutil.rmtree(base)
    ensure_directory(base)


def _marker_path(output_dir: Path, marker_name: str) -> Path:
    return output_dir / marker_name


def _write_marker(path: Path, message: str) -> None:
    path.write_text(message, encoding="utf-8")


def stage1_marker_name(zip_stem: str, suffix: str) -> str:
    return f"{STAGE1_MARKER_PREFIX}.{zip_stem}.{suffix}"


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


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------


def process_wav_file(
    wav_path: Path,
    output_dir: Path,
    *,
    force: bool,
    bitrate: str,
    sample_rate: int,
) -> str:
    """Transcode a single WAV to the shared Stage 1 output directory."""

    parsed: ParsedWavName = parse_wav_filename(wav_path.name)
    output_basename = f"{parsed.iso_start}-{parsed.channel_descriptor}_IA.m4a"
    output_path = output_dir / output_basename

    if force and output_path.exists():
        output_path.unlink()

    if not output_path.exists():
        _convert_wav_to_m4a(
            wav_path,
            output_path,
            bitrate=bitrate,
            sample_rate=sample_rate,
        )

    return output_basename


def process_zip_archive(
    zip_path: Path,
    output_dir: Path,
    *,
    force: bool,
    working_dir: Path,
    bitrate: str,
    sample_rate: int,
    max_workers: int,
) -> list[str]:
    if not zipfile.is_zipfile(zip_path):
        if zip_likely_in_progress(zip_path):
            raise ZipPendingDownloadError(f"{zip_path.name} still being written")
        raise zipfile.BadZipFile(f"{zip_path} is not a valid zip archive")

    ensure_directory(output_dir)
    _prepare_working_dir(working_dir)
    extracted_items: list[ExtractedWav] = []
    skipped_members: list[str] = []
    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            for member in archive.infolist():
                if member.is_dir():
                    continue
                if not member.filename.lower().endswith(".wav"):
                    continue

                ensure_directory(working_dir)
                base_name = os.path.basename(member.filename)
                target_path = _dedupe_target_path(working_dir, base_name)

                try:
                    with archive.open(member, "r") as source, target_path.open(
                        "wb"
                    ) as target:
                        shutil.copyfileobj(source, target)
                except zipfile.BadZipFile as exc:
                    skipped_members.append(member.filename)
                    target_path.unlink(missing_ok=True)
                    logger.error(
                        "CRC error extracting %s from %s: %s; skipping entry",
                        member.filename,
                        zip_path.name,
                        exc,
                    )
                    continue
                except Exception as exc:  # pragma: no cover - defensive catch-all
                    skipped_members.append(member.filename)
                    target_path.unlink(missing_ok=True)
                    logger.error(
                        "Failed to extract %s from %s: %s; skipping entry",
                        member.filename,
                        zip_path.name,
                        exc,
                    )
                    continue

                extracted_items.append(
                    ExtractedWav(path=target_path, zip_relative_path=member.filename)
                )

        if not extracted_items:
            if skipped_members:
                skipped_unique = sorted(set(skipped_members))
                raise RuntimeError(
                    "No WAV files extracted from %s; %d entrie(s) failed integrity checks: %s"
                    % (
                        zip_path.name,
                        len(skipped_unique),
                        ", ".join(skipped_unique),
                    )
                )
            raise RuntimeError(f"No WAV files found in {zip_path.name}")

        if skipped_members:
            skipped_unique = sorted(set(skipped_members))
            logger.warning(
                "Skipped %d corrupt or unreadable WAV entrie(s) from %s: %s",
                len(skipped_unique),
                zip_path.name,
                ", ".join(skipped_unique),
            )

        worker_count = min(max_workers, len(extracted_items)) or 1
        logger.debug(
            "Converting %d WAV(s) from %s using %d worker(s)",
            len(extracted_items),
            zip_path.name,
            worker_count,
        )

        def _convert(index: int, item: ExtractedWav) -> tuple[int, str]:
            try:
                entry = process_wav_file(
                    item.path,
                    output_dir,
                    force=force,
                    bitrate=bitrate,
                    sample_rate=sample_rate,
                )
                return index, entry
            finally:
                item.path.unlink(missing_ok=True)

        indexed_results: list[tuple[int, str]] = []
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = [
                executor.submit(_convert, idx, item)
                for idx, item in enumerate(extracted_items)
            ]
            for future in futures:
                indexed_results.append(future.result())

        indexed_results.sort(key=lambda pair: pair[0])
        return [entry for _, entry in indexed_results]
    finally:
        shutil.rmtree(working_dir, ignore_errors=True)


@dataclass
class ExtractedWav:
    path: Path
    zip_relative_path: str


def process_zip_job(
    job: ZipJob,
    *,
    config: Stage1Config,
    force: bool,
    erase: bool,
) -> bool:
    zip_path = job.path
    try:
        zip_iso_date, parsed_type = parse_zip_metadata(job.name)
    except ValueError as exc:
        message = f"Unable to parse metadata for {job.name}: {exc}"
        logger.error(message)
        append_bad_zip_record("unknown", job.name, str(exc))
        add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, job.name)
        return False

    fallback_type = ZIP_KIND_DEFAULT_TYPE.get(job.source_kind, job.source_kind)
    zip_type_label = parsed_type if parsed_type != "unknown" else fallback_type

    date_output_dir = (
        config.stage1_root / zip_iso_date[:4] / zip_iso_date[5:7] / zip_iso_date[8:10]
    )
    ensure_directory(date_output_dir)

    zip_stem = job.stem
    in_progress_marker = _marker_path(
        date_output_dir,
        stage1_marker_name(zip_stem, STAGE1_IN_PROGRESS_SUFFIX),
    )
    done_marker = _marker_path(
        date_output_dir,
        stage1_marker_name(zip_stem, STAGE1_DONE_SUFFIX),
    )
    error_marker = _marker_path(
        date_output_dir,
        stage1_marker_name(zip_stem, STAGE1_ERROR_SUFFIX),
    )

    if not force and done_marker.exists():
        logger.info("Skipping %s; stage1 already completed", job.name)
        return True

    if error_marker.exists():
        error_marker.unlink()

    if erase:
        try:
            for filename in expected_stage1_outputs(zip_path):
                (date_output_dir / filename).unlink(missing_ok=True)
        except zipfile.BadZipFile:
            # The main processing path will surface the invalid archive.
            pass

    _write_marker(in_progress_marker, iso_utc_now())
    add_to_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, job.name)

    working_dir = config.working_root / f"{zip_stem}_stage1"

    try:
        converted_files = process_zip_archive(
            zip_path,
            date_output_dir,
            force=force,
            working_dir=working_dir,
            bitrate=config.audio_bitrate,
            sample_rate=config.audio_sample_rate,
            max_workers=config.max_workers,
        )
        logger.info(
            "Converted %d file(s) from %s (%s) into %s",
            len(converted_files),
            job.name,
            zip_type_label,
            date_output_dir,
        )
        _write_marker(done_marker, iso_utc_now())
        if in_progress_marker.exists():
            in_progress_marker.unlink()
        remove_from_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, job.name)
        add_to_tracking_file(IA_ZIPS_PROCESSED_TRACKING_FILE, job.name)
        success = True
    except ZipPendingDownloadError as exc:
        logger.info("Deferring %s: %s", job.name, exc)
        success = False
        error_marker.write_text(str(exc), encoding="utf-8")
    except subprocess.CalledProcessError as exc:
        message = f"ffmpeg failed for {job.name}: {exc}"
        logger.error(message)
        append_bad_zip_record(zip_iso_date, job.name, message)
        add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, job.name)
        success = False
        error_marker.write_text(message, encoding="utf-8")
    except zipfile.BadZipFile as exc:
        message = str(exc)
        logger.error("Invalid archive %s: %s", job.name, message)
        append_bad_zip_record(zip_iso_date, job.name, message)
        add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, job.name)
        success = False
        error_marker.write_text(message, encoding="utf-8")
    except Exception as exc:  # pragma: no cover - defensive catch-all
        message = f"Unhandled error for {job.name}: {exc}"
        logger.exception(message)
        append_bad_zip_record(zip_iso_date, job.name, message)
        add_to_tracking_file(IA_ZIPS_ERRORS_TRACKING_FILE, job.name)
        success = False
        error_marker.write_text(message, encoding="utf-8")
    finally:
        if in_progress_marker.exists():
            in_progress_marker.unlink()
        remove_from_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, job.name)

    return success


# ---------------------------------------------------------------------------
# Argument parsing and coordination
# ---------------------------------------------------------------------------


def parse_date_arg(value: str) -> dt.date:
    try:
        return dt.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid date '{value}'. Expected format YYYY-MM-DD"
        ) from exc


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stage 1 extractor for the ISS comm transcription v3 pipeline",
    )
    parser.add_argument(
        "--zip",
        action="append",
        dest="zips",
        help="Specific zip filename to process (can be provided multiple times)",
    )
    parser.add_argument("--limit", type=int, help="Only process this many zip archives")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess archives even if a done marker exists",
    )
    parser.add_argument(
        "--erase",
        action="store_true",
        help="Delete existing Stage 1 outputs for each zip before processing",
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
        help="Ignored placeholder to keep CLI parity with legacy script",
    )
    parser.add_argument(
        "--newest-first",
        action="store_true",
        help="Process zip archives in reverse chronological order (newest first)",
    )
    return parser.parse_args(argv)


def filter_jobs_by_date(
    jobs: list[ZipJob],
    *,
    requested_dates: set[dt.date],
    start_date: dt.date | None,
    end_date: dt.date | None,
) -> list[ZipJob]:
    filters_active = bool(requested_dates or start_date or end_date)

    def include(job: ZipJob) -> bool:
        if job.date_hint is None:
            return not filters_active

        if requested_dates and job.date_hint not in requested_dates:
            return False
        if start_date and job.date_hint < start_date:
            return False
        if end_date and job.date_hint > end_date:
            return False
        return True

    return [job for job in jobs if include(job)]


def collect_zip_jobs(
    config: Stage1Config,
    *,
    selected_names: set[str] | None,
    skip_list: set[str],
) -> list[ZipJob]:
    jobs: list[ZipJob] = []
    for source_path, source_kind in config.sources:
        if not source_path.exists():
            logger.debug("Source directory %s is missing; skipping", source_path)
            continue
        for entry in sorted(source_path.iterdir()):
            if not entry.name.lower().endswith(".zip"):
                continue
            if selected_names is not None and entry.name not in selected_names:
                continue
            if entry.name in skip_list:
                continue
            jobs.append(
                ZipJob(
                    name=entry.name,
                    folder=source_path,
                    source_kind=source_kind,
                    date_hint=infer_date_hint(entry.name),
                )
            )
    return jobs


def is_already_processed(job: ZipJob, stage1_root: Path) -> bool:
    try:
        iso_date, _zip_type = parse_zip_metadata(job.name)
    except ValueError:
        return False
    date_output_dir = stage1_root / iso_date[:4] / iso_date[5:7] / iso_date[8:10]
    done_marker = _marker_path(
        date_output_dir,
        stage1_marker_name(job.stem, STAGE1_DONE_SUFFIX),
    )
    return done_marker.exists()


def build_stage1_config() -> Stage1Config:
    raw_folder = os.getenv("RAW_FOLDER")
    if not raw_folder:
        raise ConfigError("RAW_FOLDER environment variable is not defined")

    raw_audio_folder = os.getenv("RAW_AUDIO_FOLDER")
    if not raw_audio_folder:
        raise ConfigError("RAW_AUDIO_FOLDER environment variable is not defined")

    stage1_root = Path(raw_folder) / DEFAULT_STAGE1_OUTPUT_DIRNAME
    ensure_directory(stage1_root)

    raw_audio_path = Path(raw_audio_folder)
    sources = [
        (raw_audio_path / "InternetArchive_space_to_grounds", "SG"),
        (raw_audio_path / "InternetArchive_dragon_cst_to_grounds", "AG"),
    ]

    working_dir_override = os.getenv("IA_ZIP_WORK_DIR")
    if working_dir_override:
        working_root = Path(working_dir_override)
    else:
        working_root = raw_audio_path / "current_ia_zip_wavs"
    ensure_directory(working_root)

    return Stage1Config(
        stage1_root=stage1_root,
        working_root=working_root,
        sources=sources,
        audio_bitrate=DEFAULT_AAC_BITRATE,
        audio_sample_rate=DEFAULT_AAC_SAMPLE_RATE,
        max_workers=DEFAULT_MAX_WORKERS,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: Sequence[str] | None = None) -> int:
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

    try:
        config = build_stage1_config()
    except ConfigError as exc:
        logger.error(str(exc))
        return 1

    logger.info(
        "Using working directory %s for temporary extraction",
        config.working_root,
    )

    selected_names = set(args.zips) if args.zips else None
    skip_entries = set(read_tracking_file(IA_SKIP_ZIPS_TRACKING_FILE))

    jobs = collect_zip_jobs(
        config,
        selected_names=selected_names,
        skip_list=skip_entries,
    )

    if selected_names is not None:
        found = {job.name for job in jobs}
        missing = selected_names - found
        for missing_zip in sorted(missing):
            logger.warning(
                "Requested zip %s not found in source directories", missing_zip
            )

    jobs = filter_jobs_by_date(
        jobs,
        requested_dates=requested_dates,
        start_date=args.start_date,
        end_date=args.end_date,
    )

    if not args.force:
        jobs = [
            job for job in jobs if not is_already_processed(job, config.stage1_root)
        ]

    if not jobs:
        logger.info("No zip archives matched the current filters")
        return 0

    jobs.sort(key=lambda job: (job.date_hint or dt.date.max, job.name))
    if args.newest_first:
        jobs.reverse()

    if args.limit is not None and args.limit > 0:
        jobs = jobs[: args.limit]

    if not jobs:
        logger.info("No zip archives to process after applying the limit")
        return 0

    order_desc = "newest -> oldest" if args.newest_first else "oldest -> newest"
    logger.info("Processing %d zip(s) (%s)", len(jobs), order_desc)

    overall_success = True
    for job in jobs:
        logger.info(
            "Stage 1 processing %s (source=%s)",
            job.name,
            job.source_kind,
        )
        job_success = process_zip_job(
            job,
            config=config,
            force=args.force,
            erase=args.erase,
        )
        overall_success = overall_success and job_success

    return 0 if overall_success else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logger.warning("Interrupted by user.")
        sys.exit(130)
