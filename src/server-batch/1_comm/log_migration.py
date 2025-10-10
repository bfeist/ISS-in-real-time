"""Helpers to migrate legacy text-based tracking files into the new log database."""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional

try:  # pragma: no cover - import resolution for script vs package usage
    from .log_db import (
        CommTranscriptionLog,
        LOG_STATUS_COMPLETED,
        LOG_STATUS_ERROR,
        LOG_STATUS_IN_PROGRESS,
        LOG_STATUS_SKIPPED,
        parse_zip_metadata,
    )
except ImportError:  # pragma: no cover
    from log_db import (  # type: ignore
        CommTranscriptionLog,
        LOG_STATUS_COMPLETED,
        LOG_STATUS_ERROR,
        LOG_STATUS_IN_PROGRESS,
        LOG_STATUS_SKIPPED,
        parse_zip_metadata,
    )

logger = logging.getLogger(__name__)

LEGACY_FILENAMES = {
    "ia_zips_processed.txt": LOG_STATUS_COMPLETED,
    "ia_zips_in_progress.txt": LOG_STATUS_IN_PROGRESS,
    "ia_skip_zips.txt": LOG_STATUS_SKIPPED,
    "ia_zips_errors.txt": LOG_STATUS_ERROR,
}

STATUS_PRIORITY = {
    LOG_STATUS_COMPLETED: 100,
    LOG_STATUS_SKIPPED: 90,
    LOG_STATUS_ERROR: 80,
    LOG_STATUS_IN_PROGRESS: 70,
}


@dataclass
class LegacyZipRecord:
    zip_name: str
    iso_date: str
    date_obj: dt.date
    zip_type: str
    status: str


def migrate_legacy_tracking_files(
    log: CommTranscriptionLog,
    tracking_dir: Path,
    *,
    version: int = 1,
    transcript_root: Optional[Path] = None,
) -> Dict[str, int]:
    """Populate the SQLite log with data from legacy text tracking files."""

    tracking_dir = Path(tracking_dir)
    inserted = 0
    skipped_lines = 0
    overwritten = 0

    if log.zip_count() > 0:
        logger.info("Existing log entries detected; skipping legacy migration.")
        return {
            "zip_records": 0,
            "blank_days": 0,
            "skipped_lines": 0,
            "overwritten": 0,
            "timestamp_seeded": 0,
            "status": "skipped",
        }

    pending: Dict[str, LegacyZipRecord] = {}

    earliest_space: Optional[dt.date] = None
    latest_space: Optional[dt.date] = None
    space_dates: set[dt.date] = set()

    for filename, status in LEGACY_FILENAMES.items():
        file_path = tracking_dir / filename
        lines = _read_legacy_file(file_path)
        if not lines:
            continue
        for raw_line in lines:
            try:
                iso_date, zip_type = parse_zip_metadata(raw_line)
            except ValueError:
                skipped_lines += 1
                logger.warning("Skipping unparseable legacy entry: %s", raw_line)
                continue

            date_obj = dt.date.fromisoformat(iso_date)

            if "Space-to-Grounds" in zip_type:
                space_dates.add(date_obj)
                if earliest_space is None or date_obj < earliest_space:
                    earliest_space = date_obj
                if latest_space is None or date_obj > latest_space:
                    latest_space = date_obj

            existing = pending.get(raw_line)
            if existing and STATUS_PRIORITY[existing.status] >= STATUS_PRIORITY[status]:
                continue

            if existing:
                overwritten += 1

            pending[raw_line] = LegacyZipRecord(
                zip_name=raw_line,
                iso_date=iso_date,
                date_obj=date_obj,
                zip_type=zip_type,
                status=status,
            )

    if not pending:
        logger.info("No legacy records found; migration skipped.")
        return {
            "zip_records": 0,
            "blank_days": 0,
            "skipped_lines": skipped_lines,
            "overwritten": overwritten,
            "timestamp_seeded": 0,
            "status": "empty",
        }

    transcript_root_path = Path(transcript_root) if transcript_root else None
    transcript_timestamps: Dict[str, Optional[str]] = {}

    def resolve_transcribed_at(iso_date: str) -> Optional[str]:
        if transcript_root_path is None:
            return None
        if iso_date in transcript_timestamps:
            return transcript_timestamps[iso_date]

        try:
            year, month, day = iso_date.split("-")
        except ValueError:
            transcript_timestamps[iso_date] = None
            return None

        csv_path = (
            transcript_root_path / year / month / day / f"_transcript_{iso_date}.csv"
        )

        if not csv_path.exists():
            transcript_timestamps[iso_date] = None
            return None

        try:
            mtime = csv_path.stat().st_mtime
        except OSError:
            logger.warning("Unable to stat transcript CSV: %s", csv_path)
            transcript_timestamps[iso_date] = None
            return None

        timestamp = (
            dt.datetime.fromtimestamp(mtime, tz=dt.timezone.utc)
            .replace(microsecond=0)
            .isoformat()
        )
        if timestamp.endswith("+00:00"):
            timestamp = timestamp[:-6] + "Z"
        transcript_timestamps[iso_date] = timestamp
        return timestamp

    # Insert records sorted by date then name for determinism.
    timestamp_seeded = 0
    for record in sorted(pending.values(), key=lambda r: (r.iso_date, r.zip_name)):
        transcribed_at = None
        if version == 1 and record.status == LOG_STATUS_COMPLETED:
            transcribed_at = resolve_transcribed_at(record.iso_date)
            if transcribed_at:
                timestamp_seeded += 1
        log.record_zip_status(
            record.zip_name,
            record.iso_date,
            record.zip_type,
            record.status,
            version=version,
            transcribed_at=transcribed_at,
            error_message=None,
            commit=False,
        )
        inserted += 1

    log.commit()

    blank_days = 0
    if earliest_space and latest_space:
        log.ensure_day_range(earliest_space, latest_space)
        current = earliest_space
        while current <= latest_space:
            if current not in space_dates:
                log.record_blank_day(
                    current, note="no_space_to_ground_zip", commit=False
                )
                blank_days += 1
            current += dt.timedelta(days=1)
        log.commit()

    logger.info(
        "Migrated %d legacy zip records (%d overwritten updates, %d skipped lines)",
        inserted,
        overwritten,
        skipped_lines,
    )

    if blank_days:
        logger.info(
            "Recorded %d blank day entries spanning %s to %s",
            blank_days,
            earliest_space,
            latest_space,
        )

    if timestamp_seeded:
        logger.info(
            "Seeded %d legacy records with transcript timestamps", timestamp_seeded
        )

    return {
        "zip_records": inserted,
        "blank_days": blank_days,
        "skipped_lines": skipped_lines,
        "overwritten": overwritten,
        "timestamp_seeded": timestamp_seeded,
        "status": "migrated",
    }


def _read_legacy_file(path: Path) -> Iterable[str]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        logger.exception("Failed to read legacy tracking file: %s", path)
        return []
    return [line.strip() for line in lines if line.strip()]
