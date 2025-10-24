"""Persistent logging utilities for ISS comm transcription runs."""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence

__all__ = [
    "COMM_LOG_DB_NAME",
    "COMM_LOG_SCHEMA_VERSION",
    "LOG_STATUS_COMPLETED",
    "LOG_STATUS_ERROR",
    "LOG_STATUS_IN_PROGRESS",
    "LOG_STATUS_PENDING",
    "LOG_STATUS_SKIPPED",
    "LogStatus",
    "ZipLogEntry",
    "CommTranscriptionLog",
    "parse_zip_metadata",
]

COMM_LOG_DB_NAME = "comm_transcription_log.sqlite3"
COMM_LOG_SCHEMA_VERSION = 1

LOG_STATUS_PENDING = "pending"
LOG_STATUS_IN_PROGRESS = "in_progress"
LOG_STATUS_COMPLETED = "completed"
LOG_STATUS_ERROR = "error"
LOG_STATUS_SKIPPED = "skipped"

SUPPORTED_STATUSES = {
    LOG_STATUS_PENDING,
    LOG_STATUS_IN_PROGRESS,
    LOG_STATUS_COMPLETED,
    LOG_STATUS_ERROR,
    LOG_STATUS_SKIPPED,
}


@dataclass(frozen=True)
class LogStatus:
    """Wrapper for status constants."""

    value: str

    def __post_init__(self) -> None:
        if self.value not in SUPPORTED_STATUSES:
            raise ValueError(f"Unsupported log status: {self.value}")

    def __str__(self) -> str:  # pragma: no cover - trivial wrapper
        return self.value


@dataclass(frozen=True)
class ZipLogEntry:
    """Structured representation of a row in comm_transcription_zip_log."""

    zip_name: str
    date: str
    zip_type: str
    status: str
    version: int
    transcribed_at: Optional[str]
    error_message: Optional[str]


class CommTranscriptionLog:
    """Lightweight SQLite-backed log tracker for ISS comm transcription runs."""

    def __init__(self, storage_dir: Path) -> None:
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.storage_dir / COMM_LOG_DB_NAME
        # Enable URI so we can set connection pragmas via query string if needed later.
        self._connection = sqlite3.connect(str(self.db_path))
        self._connection.row_factory = sqlite3.Row
        self._initialize_schema()

    # ------------------------------------------------------------------
    # Schema management
    # ------------------------------------------------------------------

    def _initialize_schema(self) -> None:
        cur = self._connection.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA foreign_keys=ON;")

        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS comm_transcription_zip_log (
                zip_name TEXT NOT NULL,
                date TEXT NOT NULL,
                zip_type TEXT NOT NULL,
                status TEXT NOT NULL,
                version INTEGER NOT NULL,
                transcribed_at TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (zip_name, version)
            );

            CREATE INDEX IF NOT EXISTS idx_comm_zip_log_date
                ON comm_transcription_zip_log (date, zip_name);

            CREATE TABLE IF NOT EXISTS comm_transcription_day_log (
                date TEXT PRIMARY KEY,
                has_zip INTEGER NOT NULL DEFAULT 0,
                note TEXT,
                last_zip_name TEXT,
                last_status TEXT,
                last_version INTEGER,
                last_transcribed_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS comm_log_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        self._ensure_metadata("schema_version", str(COMM_LOG_SCHEMA_VERSION))
        self._connection.commit()

    def _ensure_metadata(self, key: str, value: str) -> None:
        self._connection.execute(
            """
            INSERT INTO comm_log_metadata (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )

    # ------------------------------------------------------------------
    # Connection helpers
    # ------------------------------------------------------------------

    def close(self) -> None:
        if self._connection is not None:
            self._connection.commit()
            self._connection.close()
            self._connection = None  # type: ignore[assignment]

    def __enter__(self) -> "CommTranscriptionLog":  # pragma: no cover - context helper
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - context helper
        self.close()

    def commit(self) -> None:
        self._connection.commit()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def record_zip_status(
        self,
        zip_name: str,
        date: str,
        zip_type: str,
        status: str,
        *,
        version: int,
        transcribed_at: Optional[str] = None,
        error_message: Optional[str] = None,
        commit: bool = True,
    ) -> None:
        if status not in SUPPORTED_STATUSES:
            raise ValueError(f"Unsupported log status: {status}")

        now = iso_utc_now()
        self._connection.execute(
            """
            INSERT INTO comm_transcription_zip_log (
                zip_name, date, zip_type, status, version, transcribed_at,
                error_message, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(zip_name, version) DO UPDATE SET
                date = excluded.date,
                zip_type = excluded.zip_type,
                status = excluded.status,
                transcribed_at = excluded.transcribed_at,
                error_message = excluded.error_message,
                updated_at = excluded.updated_at
            """,
            (
                zip_name,
                date,
                zip_type,
                status,
                version,
                transcribed_at,
                error_message,
                now,
                now,
            ),
        )
        # Update day summary in tandem.
        self._update_day_summaries(date, zip_name, status, version, transcribed_at)
        if commit:
            self._connection.commit()

    def mark_zip_in_progress(
        self, zip_name: str, date: str, zip_type: str, *, version: int
    ) -> None:
        self.record_zip_status(
            zip_name,
            date,
            zip_type,
            LOG_STATUS_IN_PROGRESS,
            version=version,
            transcribed_at=None,
            error_message=None,
            commit=True,
        )

    def mark_zip_pending(
        self, zip_name: str, date: str, zip_type: str, *, version: int
    ) -> None:
        self.record_zip_status(
            zip_name,
            date,
            zip_type,
            LOG_STATUS_PENDING,
            version=version,
            transcribed_at=None,
            error_message=None,
            commit=True,
        )

    def mark_zip_completed(
        self,
        zip_name: str,
        date: str,
        zip_type: str,
        *,
        version: int,
        transcribed_at: Optional[str] = None,
    ) -> None:
        self.record_zip_status(
            zip_name,
            date,
            zip_type,
            LOG_STATUS_COMPLETED,
            version=version,
            transcribed_at=transcribed_at or iso_utc_now(),
            error_message=None,
            commit=True,
        )

    def mark_zip_error(
        self,
        zip_name: str,
        date: str,
        zip_type: str,
        *,
        version: int,
        error_message: Optional[str] = None,
    ) -> None:
        self.record_zip_status(
            zip_name,
            date,
            zip_type,
            LOG_STATUS_ERROR,
            version=version,
            transcribed_at=None,
            error_message=error_message,
            commit=True,
        )

    def mark_zip_skipped(
        self,
        zip_name: str,
        date: str,
        zip_type: str,
        *,
        version: int,
        note: Optional[str] = None,
    ) -> None:
        self.record_zip_status(
            zip_name,
            date,
            zip_type,
            LOG_STATUS_SKIPPED,
            version=version,
            transcribed_at=None,
            error_message=note,
            commit=True,
        )

    def ensure_day_range(self, start_date: dt.date, end_date: dt.date) -> None:
        if end_date < start_date:
            start_date, end_date = end_date, start_date
        cur = start_date
        now = iso_utc_now()
        while cur <= end_date:
            date_key = cur.isoformat()
            self._connection.execute(
                """
                INSERT INTO comm_transcription_day_log (
                    date, has_zip, created_at, updated_at
                ) VALUES (?, 0, ?, ?)
                ON CONFLICT(date) DO NOTHING
                """,
                (date_key, now, now),
            )
            cur += dt.timedelta(days=1)
        self._connection.commit()

    def record_blank_day(
        self, date: dt.date | str, note: Optional[str] = None, *, commit: bool = True
    ) -> None:
        if isinstance(date, dt.date):
            date_key = date.isoformat()
        else:
            date_key = date
        now = iso_utc_now()
        self._connection.execute(
            """
            INSERT INTO comm_transcription_day_log (
                date, has_zip, note, created_at, updated_at
            ) VALUES (?, 0, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                note = COALESCE(comm_transcription_day_log.note, excluded.note),
                updated_at = excluded.updated_at
            """,
            (date_key, note, now, now),
        )
        if commit:
            self._connection.commit()

    def zips_by_status(
        self, statuses: Sequence[str], *, version: Optional[int] = None
    ) -> set[str]:
        if not statuses:
            return set()
        invalid = set(statuses) - SUPPORTED_STATUSES
        if invalid:
            raise ValueError(f"Unsupported statuses requested: {sorted(invalid)}")
        placeholders = ",".join("?" for _ in statuses)
        params: list[object] = list(statuses)
        query = (
            "SELECT zip_name FROM comm_transcription_zip_log "
            "WHERE status IN (" + placeholders + ")"
        )
        if version is not None:
            query += " AND version = ?"
            params.append(version)
        rows = self._connection.execute(query, params).fetchall()
        return {row[0] for row in rows}

    def latest_entry_for_zip(self, zip_name: str) -> Optional[ZipLogEntry]:
        row = self._connection.execute(
            """
            SELECT zip_name, date, zip_type, status, version, transcribed_at, error_message
            FROM comm_transcription_zip_log
            WHERE zip_name = ?
            ORDER BY version DESC
            LIMIT 1
            """,
            (zip_name,),
        ).fetchone()
        if not row:
            return None
        return ZipLogEntry(
            zip_name=row["zip_name"],
            date=row["date"],
            zip_type=row["zip_type"],
            status=row["status"],
            version=row["version"],
            transcribed_at=row["transcribed_at"],
            error_message=row["error_message"],
        )

    def latest_version_for_zip(self, zip_name: str) -> Optional[int]:
        row = self._connection.execute(
            "SELECT MAX(version) FROM comm_transcription_zip_log WHERE zip_name = ?",
            (zip_name,),
        ).fetchone()
        if row and row[0] is not None:
            return int(row[0])
        return None

    def iter_zip_entries(self) -> Iterable[ZipLogEntry]:
        rows = self._connection.execute(
            """
            SELECT zip_name, date, zip_type, status, version, transcribed_at, error_message
            FROM comm_transcription_zip_log
            ORDER BY date ASC, zip_name ASC, status ASC
            """
        )
        for row in rows:
            yield ZipLogEntry(
                zip_name=row["zip_name"],
                date=row["date"],
                zip_type=row["zip_type"],
                status=row["status"],
                version=row["version"],
                transcribed_at=row["transcribed_at"],
                error_message=row["error_message"],
            )

    def date_bounds(self) -> Optional[tuple[dt.date, dt.date]]:
        row = self._connection.execute(
            "SELECT MIN(date), MAX(date) FROM comm_transcription_zip_log"
        ).fetchone()
        if not row or row[0] is None or row[1] is None:
            return None
        return (dt.date.fromisoformat(row[0]), dt.date.fromisoformat(row[1]))

    def zip_count(self) -> int:
        row = self._connection.execute(
            "SELECT COUNT(*) FROM comm_transcription_zip_log"
        ).fetchone()
        return int(row[0]) if row and row[0] is not None else 0

    def _update_day_summaries(
        self,
        date: str,
        zip_name: str,
        status: str,
        version: int,
        transcribed_at: Optional[str],
    ) -> None:
        now = iso_utc_now()
        has_zip = 0 if zip_name == "" else 1
        self._connection.execute(
            """
            INSERT INTO comm_transcription_day_log (
                date, has_zip, note, last_zip_name, last_status, last_version,
                last_transcribed_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                has_zip = MAX(comm_transcription_day_log.has_zip, excluded.has_zip),
                note = CASE
                    WHEN excluded.has_zip = 1 THEN NULL
                    ELSE COALESCE(comm_transcription_day_log.note, excluded.note)
                END,
                last_zip_name = excluded.last_zip_name,
                last_status = excluded.last_status,
                last_version = excluded.last_version,
                last_transcribed_at = excluded.last_transcribed_at,
                updated_at = excluded.updated_at
            """,
            (
                date,
                has_zip,
                None,
                zip_name,
                status,
                version,
                transcribed_at,
                now,
                now,
            ),
        )

    # ------------------------------------------------------------------
    # Inspection helpers
    # ------------------------------------------------------------------

    def missing_days(self) -> list[str]:
        rows = self._connection.execute(
            """
            SELECT date FROM comm_transcription_day_log
            WHERE has_zip = 0
            ORDER BY date ASC
            """
        ).fetchall()
        return [row[0] for row in rows]


def iso_utc_now() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def parse_zip_metadata(zip_name: str) -> tuple[str, str]:
    """Return (iso_date, zip_type) inferred from a zip filename."""
    stem = zip_name
    if stem.lower().endswith(".zip"):
        stem = stem[:-4]

    # Identify known zip type descriptors.
    known_types = [
        "Space-to-Grounds",
        "Dragon-to-Grounds",
        "CST_Air-to-Grounds",
        "Air-to-Grounds",
        "Dragon_to_Grounds",
        "Space-to-Grounds_1-of-2",
        "Space-to-Grounds_2-of-2",
    ]
    detected_type = "unknown"
    for candidate in known_types:
        if candidate in stem:
            detected_type = candidate
            break

    # Fallback: attempt to split on first underscore.
    if detected_type == "unknown":
        parts = stem.split("_", 1)
        if len(parts) == 2:
            detected_type = parts[1]

    # Parse date prefix (supports MM-DD-YY and MM-DD-YYYY).
    # Some filenames lack an underscore after the date, so we take the first
    # chunk matching MM-DD-YY(YY).
    date_part = None
    for width in (10, 8):  # try YYYY first, then YY
        candidate = stem[:width]
        try:
            if width == 8:
                candidate_fmt = "%m-%d-%y"
            else:
                candidate_fmt = "%m-%d-%Y"
            parsed_date = dt.datetime.strptime(candidate, candidate_fmt).date()
            date_part = parsed_date.isoformat()
            break
        except ValueError:
            continue

    if date_part is None:
        # Fallback: search for pattern anywhere in the string.
        date_part = _extract_date_from_string(stem)

    if not date_part:
        raise ValueError(f"Unable to parse date from zip filename '{zip_name}'")

    return date_part, detected_type


def _extract_date_from_string(text: str) -> Optional[str]:
    for length, fmt in ((10, "%m-%d-%Y"), (8, "%m-%d-%y")):
        for idx in range(0, max(len(text) - length + 1, 1)):
            candidate = text[idx : idx + length]
            try:
                parsed = dt.datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
            return parsed.isoformat()
    return None
