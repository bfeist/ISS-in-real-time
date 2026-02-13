"""
State management for the incremental update system.

This module provides:
- StateDatabase: SQLite-based state tracking for pipelines and dates
- ZipFileTracker: Text file-based tracking for ZIP files (preserves legacy format)
"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator, Optional

from .models import (
    ActivityLogEntry,
    DateWatermark,
    ErrorLogEntry,
    MonitorState,
    PipelineRun,
    RunType,
    Status,
    TriggerSource,
    ZipStatus,
)


class ZipFileTracker:
    """
    Interface for reading/writing ia_zips_*.txt files.

    Preserves the existing text file format used by transcription scripts.
    Thread-safe with file locking for concurrent access.
    """

    def __init__(self, server_batch_dir: Path):
        self.base_dir = Path(server_batch_dir)
        self.processed_file = self.base_dir / "ia_zips_processed.txt"
        self.in_progress_file = self.base_dir / "ia_zips_in_progress.txt"
        self.errors_file = self.base_dir / "ia_zips_errors.txt"
        self.skip_file = self.base_dir / "ia_skip_zips.txt"
        self._lock = threading.Lock()

    def _read_file(self, path: Path) -> set[str]:
        """Read lines from a text file as a set."""
        if not path.exists():
            return set()
        with open(path, "r", encoding="utf-8") as f:
            return {line.strip() for line in f if line.strip()}

    def _append_to_file(self, path: Path, value: str) -> None:
        """Append a value to a text file atomically."""
        with self._lock:
            with open(path, "a", encoding="utf-8") as f:
                f.write(f"{value}\n")

    def _remove_from_file(self, path: Path, value: str) -> None:
        """Remove a value from a text file."""
        with self._lock:
            if not path.exists():
                return
            lines = self._read_file(path)
            # Handle both plain filenames and filename|error format
            lines = {l for l in lines if not l.startswith(value)}
            lines.discard(value)
            with open(path, "w", encoding="utf-8") as f:
                for line in sorted(lines):
                    f.write(f"{line}\n")

    # --- Read operations ---

    def get_processed(self) -> set[str]:
        """Get all successfully processed ZIP filenames."""
        return self._read_file(self.processed_file)

    def get_in_progress(self) -> set[str]:
        """Get all currently processing ZIP filenames."""
        return self._read_file(self.in_progress_file)

    def get_errors(self) -> set[str]:
        """Get all failed ZIP filenames (may include error messages)."""
        return self._read_file(self.errors_file)

    def get_error_filenames(self) -> set[str]:
        """Get just the filenames from errors (strip error messages)."""
        errors = self.get_errors()
        return {e.split("|")[0] for e in errors}

    def get_skipped(self) -> set[str]:
        """Get all manually skipped ZIP filenames."""
        return self._read_file(self.skip_file)

    def get_status(self, filename: str) -> ZipStatus:
        """Get the status of a specific ZIP file."""
        error_entry = None
        for e in self.get_errors():
            if e.startswith(filename):
                parts = e.split("|", 1)
                if len(parts) > 1:
                    error_entry = parts[1]
                break

        return ZipStatus(
            filename=filename,
            is_processed=filename in self.get_processed(),
            is_in_progress=filename in self.get_in_progress(),
            is_error=filename in self.get_error_filenames(),
            is_skipped=filename in self.get_skipped(),
            error_message=error_entry,
        )

    def get_unprocessed(self, available_zips: set[str]) -> set[str]:
        """
        Get ZIPs that need processing.

        Args:
            available_zips: Set of all available ZIP filenames from IA

        Returns:
            ZIPs that are not processed, skipped, in progress, or errored
        """
        processed = self.get_processed()
        skipped = self.get_skipped()
        in_progress = self.get_in_progress()
        errors = self.get_error_filenames()

        return available_zips - processed - skipped - in_progress - errors

    # --- Write operations ---

    def mark_in_progress(self, filename: str) -> None:
        """Mark a ZIP as currently processing."""
        self._append_to_file(self.in_progress_file, filename)

    def mark_processed(self, filename: str) -> None:
        """Mark a ZIP as successfully processed."""
        self._remove_from_file(self.in_progress_file, filename)
        self._remove_from_file(self.errors_file, filename)
        self._append_to_file(self.processed_file, filename)

    def mark_error(self, filename: str, error_msg: Optional[str] = None) -> None:
        """Mark a ZIP as failed."""
        self._remove_from_file(self.in_progress_file, filename)
        # Include error message in the entry if provided
        entry = f"{filename}|{error_msg}" if error_msg else filename
        self._append_to_file(self.errors_file, entry)

    def mark_skipped(self, filename: str) -> None:
        """Mark a ZIP as manually skipped."""
        self._remove_from_file(self.in_progress_file, filename)
        self._remove_from_file(self.errors_file, filename)
        self._append_to_file(self.skip_file, filename)

    def clear_in_progress(self) -> None:
        """Clear all in-progress markers (for recovery after crash)."""
        if self.in_progress_file.exists():
            self.in_progress_file.unlink()

    def retry_error(self, filename: str) -> None:
        """Move a ZIP from errors back to unprocessed state."""
        self._remove_from_file(self.errors_file, filename)

    # --- Dashboard info ---

    def get_summary(self) -> dict[str, int]:
        """Get summary counts for dashboard display."""
        return {
            "processed": len(self.get_processed()),
            "in_progress": len(self.get_in_progress()),
            "errors": len(self.get_error_filenames()),
            "skipped": len(self.get_skipped()),
        }


class StateDatabase:
    """
    Central state management for the incremental update system.

    Uses SQLite with WAL mode for concurrent access.
    Thread-safe through SQLite's internal locking.
    """

    SCHEMA_VERSION = 1

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self._local = threading.local()
        self._write_lock = threading.Lock()
        self._ensure_schema()

    @property
    def _conn(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, "conn"):
            self._local.conn = sqlite3.connect(
                str(self.db_path),
                check_same_thread=False,
                timeout=30.0,
            )
            self._local.conn.row_factory = sqlite3.Row
            # Enable WAL mode for better concurrency
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA busy_timeout=30000")
        return self._local.conn

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Cursor]:
        """Context manager for write transactions."""
        with self._write_lock:
            cursor = self._conn.cursor()
            try:
                yield cursor
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def _ensure_schema(self) -> None:
        """Create database schema if it doesn't exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        with self._transaction() as cursor:
            # Schema version tracking
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                )
            """
            )

            # Check if we need to initialize
            cursor.execute("SELECT version FROM schema_version LIMIT 1")
            row = cursor.fetchone()
            if row is None:
                self._create_tables(cursor)
                cursor.execute(
                    "INSERT INTO schema_version (version) VALUES (?)",
                    (self.SCHEMA_VERSION,),
                )

    def _create_tables(self, cursor: sqlite3.Cursor) -> None:
        """Create all database tables."""
        # Pipelines registry
        cursor.execute(
            """
            CREATE TABLE pipelines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                config_hash TEXT NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        # Pipeline stages
        cursor.execute(
            """
            CREATE TABLE pipeline_stages (
                pipeline_id TEXT NOT NULL,
                stage_id TEXT NOT NULL,
                stage_order INTEGER NOT NULL,
                script_path TEXT NOT NULL,
                timeout_minutes INTEGER DEFAULT 60,
                requires_gpu BOOLEAN DEFAULT FALSE,
                gpu_task_type TEXT,
                ollama_model TEXT,
                PRIMARY KEY (pipeline_id, stage_id)
            )
        """
        )

        # Pipeline runs
        cursor.execute(
            """
            CREATE TABLE pipeline_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pipeline_id TEXT NOT NULL,
                stage_id TEXT NOT NULL,
                run_type TEXT NOT NULL,
                started_at TIMESTAMP NOT NULL,
                completed_at TIMESTAMP,
                status TEXT NOT NULL,
                trigger_source TEXT,
                work_items_requested INTEGER DEFAULT 0,
                work_items_processed INTEGER DEFAULT 0,
                work_items_failed INTEGER DEFAULT 0,
                work_items_skipped INTEGER DEFAULT 0,
                exit_code INTEGER,
                pid INTEGER,
                hostname TEXT,
                error_message TEXT,
                error_traceback TEXT
            )
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_runs_lookup 
            ON pipeline_runs(pipeline_id, stage_id, started_at DESC)
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_runs_status 
            ON pipeline_runs(status, started_at DESC)
        """
        )

        # Date watermarks
        cursor.execute(
            """
            CREATE TABLE date_watermarks (
                pipeline_id TEXT NOT NULL,
                stage_id TEXT NOT NULL,
                date TEXT NOT NULL,
                status TEXT NOT NULL,
                queued_at TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                output_hash TEXT,
                output_path TEXT,
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                next_retry_at TIMESTAMP,
                last_error TEXT,
                last_error_at TIMESTAMP,
                last_run_id INTEGER,
                PRIMARY KEY (pipeline_id, stage_id, date)
            )
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_date_wm_status 
            ON date_watermarks(status, date)
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_date_wm_pending 
            ON date_watermarks(pipeline_id, stage_id, status) 
            WHERE status IN ('pending', 'failed')
        """
        )

        # Monitor state
        cursor.execute(
            """
            CREATE TABLE monitor_state (
                monitor_id TEXT PRIMARY KEY,
                monitor_type TEXT NOT NULL,
                last_check_at TIMESTAMP,
                last_check_status TEXT,
                last_check_duration_ms INTEGER,
                last_new_items_at TIMESTAMP,
                content_hash TEXT,
                cached_data_json TEXT,
                cache_expires_at TIMESTAMP,
                consecutive_failures INTEGER DEFAULT 0,
                last_error TEXT
            )
        """
        )

        # Global watermarks for fast lookups
        cursor.execute(
            """
            CREATE TABLE global_watermarks (
                pipeline_id TEXT NOT NULL,
                stage_id TEXT NOT NULL,
                watermark_type TEXT NOT NULL,
                watermark_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (pipeline_id, stage_id, watermark_type)
            )
        """
        )

        # Activity log for dashboard
        cursor.execute(
            """
            CREATE TABLE activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pipeline_id TEXT,
                stage_id TEXT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                details_json TEXT
            )
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_activity_recent 
            ON activity_log(timestamp DESC)
        """
        )

        # Error log
        cursor.execute(
            """
            CREATE TABLE error_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pipeline_id TEXT,
                stage_id TEXT,
                work_item_type TEXT,
                work_item_id TEXT,
                run_id INTEGER,
                error_type TEXT NOT NULL,
                error_message TEXT NOT NULL,
                error_traceback TEXT,
                context_json TEXT,
                resolved_at TIMESTAMP,
                resolution_type TEXT,
                resolution_notes TEXT
            )
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_error_log_unresolved 
            ON error_log(pipeline_id, occurred_at DESC) 
            WHERE resolved_at IS NULL
        """
        )
        cursor.execute(
            """
            CREATE INDEX idx_error_log_recent 
            ON error_log(occurred_at DESC)
        """
        )

    # ─────────────────────────────────────────────────────────────
    # DATE WATERMARK OPERATIONS
    # ─────────────────────────────────────────────────────────────

    def get_date_status(
        self, pipeline_id: str, stage_id: str, target_date: date
    ) -> Optional[Status]:
        """Get processing status for a specific date."""
        cursor = self._conn.execute(
            """
            SELECT status FROM date_watermarks
            WHERE pipeline_id = ? AND stage_id = ? AND date = ?
        """,
            (pipeline_id, stage_id, target_date.isoformat()),
        )
        row = cursor.fetchone()
        return Status(row["status"]) if row else None

    def get_date_watermark(
        self, pipeline_id: str, stage_id: str, target_date: date
    ) -> Optional[DateWatermark]:
        """Get full watermark info for a date."""
        cursor = self._conn.execute(
            """
            SELECT * FROM date_watermarks
            WHERE pipeline_id = ? AND stage_id = ? AND date = ?
        """,
            (pipeline_id, stage_id, target_date.isoformat()),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_date_watermark(row)

    def _row_to_date_watermark(self, row: sqlite3.Row) -> DateWatermark:
        """Convert a database row to DateWatermark."""
        return DateWatermark(
            pipeline_id=row["pipeline_id"],
            stage_id=row["stage_id"],
            date=date.fromisoformat(row["date"]),
            status=Status(row["status"]),
            queued_at=self._parse_timestamp(row["queued_at"]),
            started_at=self._parse_timestamp(row["started_at"]),
            completed_at=self._parse_timestamp(row["completed_at"]),
            output_hash=row["output_hash"],
            output_path=row["output_path"],
            retry_count=row["retry_count"] or 0,
            max_retries=row["max_retries"] or 3,
            next_retry_at=self._parse_timestamp(row["next_retry_at"]),
            last_error=row["last_error"],
            last_run_id=row["last_run_id"],
        )

    @staticmethod
    def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
        """Parse ISO timestamp from database."""
        if value is None:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

    def get_last_complete_date(self, pipeline_id: str, stage_id: str) -> Optional[date]:
        """Get the most recent date that completed successfully."""
        # First check global watermark for O(1) lookup
        cursor = self._conn.execute(
            """
            SELECT watermark_value FROM global_watermarks
            WHERE pipeline_id = ? AND stage_id = ? AND watermark_type = 'last_complete_date'
        """,
            (pipeline_id, stage_id),
        )
        row = cursor.fetchone()
        if row:
            return date.fromisoformat(row["watermark_value"])

        # Fallback to scanning watermarks
        cursor = self._conn.execute(
            """
            SELECT MAX(date) as last_date FROM date_watermarks
            WHERE pipeline_id = ? AND stage_id = ? AND status = 'complete'
        """,
            (pipeline_id, stage_id),
        )
        row = cursor.fetchone()
        return (
            date.fromisoformat(row["last_date"]) if row and row["last_date"] else None
        )

    def get_pending_dates(
        self,
        pipeline_id: str,
        stage_id: str,
        since: Optional[date] = None,
        until: Optional[date] = None,
        include_failed: bool = True,
        limit: Optional[int] = None,
    ) -> list[date]:
        """Get dates that need processing."""
        statuses = ["pending"]
        if include_failed:
            statuses.append("failed")

        query = """
            SELECT date FROM date_watermarks
            WHERE pipeline_id = ? AND stage_id = ? 
            AND status IN ({})
        """.format(
            ",".join("?" * len(statuses))
        )

        params: list[Any] = [pipeline_id, stage_id, *statuses]

        if since:
            query += " AND date >= ?"
            params.append(since.isoformat())
        if until:
            query += " AND date <= ?"
            params.append(until.isoformat())

        # For failed items, check retry eligibility
        if include_failed:
            query += " AND (status = 'pending' OR (status = 'failed' AND retry_count < max_retries))"

        query += " ORDER BY date ASC"

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        cursor = self._conn.execute(query, params)
        return [date.fromisoformat(row["date"]) for row in cursor.fetchall()]

    def mark_date_pending(
        self, pipeline_id: str, stage_id: str, target_date: date
    ) -> None:
        """Queue a date for processing."""
        now = datetime.now().isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                INSERT INTO date_watermarks (pipeline_id, stage_id, date, status, queued_at)
                VALUES (?, ?, ?, 'pending', ?)
                ON CONFLICT (pipeline_id, stage_id, date) DO UPDATE SET
                    status = 'pending',
                    queued_at = ?
            """,
                (pipeline_id, stage_id, target_date.isoformat(), now, now),
            )

    def mark_date_processing(
        self,
        pipeline_id: str,
        stage_id: str,
        target_date: date,
        run_id: Optional[int] = None,
    ) -> None:
        """Mark a date as currently being processed."""
        now = datetime.now().isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE date_watermarks 
                SET status = 'processing', started_at = ?, last_run_id = ?
                WHERE pipeline_id = ? AND stage_id = ? AND date = ?
            """,
                (now, run_id, pipeline_id, stage_id, target_date.isoformat()),
            )

    def mark_date_complete(
        self,
        pipeline_id: str,
        stage_id: str,
        target_date: date,
        output_hash: Optional[str] = None,
        output_path: Optional[str] = None,
    ) -> None:
        """Mark a date as successfully processed."""
        now = datetime.now().isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE date_watermarks 
                SET status = 'complete', completed_at = ?, output_hash = ?, output_path = ?,
                    last_error = NULL, next_retry_at = NULL
                WHERE pipeline_id = ? AND stage_id = ? AND date = ?
            """,
                (
                    now,
                    output_hash,
                    output_path,
                    pipeline_id,
                    stage_id,
                    target_date.isoformat(),
                ),
            )

            # Update global watermark
            cursor.execute(
                """
                INSERT INTO global_watermarks (pipeline_id, stage_id, watermark_type, watermark_value, updated_at)
                VALUES (?, ?, 'last_complete_date', ?, ?)
                ON CONFLICT (pipeline_id, stage_id, watermark_type) DO UPDATE SET
                    watermark_value = MAX(watermark_value, excluded.watermark_value),
                    updated_at = excluded.updated_at
            """,
                (pipeline_id, stage_id, target_date.isoformat(), now),
            )

    def mark_date_failed(
        self,
        pipeline_id: str,
        stage_id: str,
        target_date: date,
        error: str,
        schedule_retry: bool = True,
    ) -> None:
        """Mark a date as failed with optional retry scheduling."""
        now = datetime.now()

        with self._transaction() as cursor:
            # Get current retry count
            cursor.execute(
                """
                SELECT retry_count, max_retries FROM date_watermarks
                WHERE pipeline_id = ? AND stage_id = ? AND date = ?
            """,
                (pipeline_id, stage_id, target_date.isoformat()),
            )
            row = cursor.fetchone()

            retry_count = (row["retry_count"] or 0) + 1 if row else 1
            max_retries = row["max_retries"] or 3 if row else 3

            # Calculate next retry time with exponential backoff
            next_retry = None
            if schedule_retry and retry_count <= max_retries:
                delay_minutes = min(
                    5 * (2 ** (retry_count - 1)), 60
                )  # 5, 10, 20, 40, 60 min
                next_retry = (now + timedelta(minutes=delay_minutes)).isoformat()

            cursor.execute(
                """
                UPDATE date_watermarks 
                SET status = 'failed', 
                    last_error = ?, 
                    last_error_at = ?,
                    retry_count = ?,
                    next_retry_at = ?
                WHERE pipeline_id = ? AND stage_id = ? AND date = ?
            """,
                (
                    error,
                    now.isoformat(),
                    retry_count,
                    next_retry,
                    pipeline_id,
                    stage_id,
                    target_date.isoformat(),
                ),
            )

    # ─────────────────────────────────────────────────────────────
    # RUN TRACKING
    # ─────────────────────────────────────────────────────────────

    def start_run(
        self,
        pipeline_id: str,
        stage_id: str,
        run_type: RunType = RunType.MANUAL,
        trigger_source: TriggerSource = TriggerSource.CLI,
        work_items_requested: int = 0,
    ) -> int:
        """Record the start of a pipeline run. Returns run ID."""
        import os
        import socket

        now = datetime.now().isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                INSERT INTO pipeline_runs 
                (pipeline_id, stage_id, run_type, started_at, status, trigger_source,
                 work_items_requested, pid, hostname)
                VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)
            """,
                (
                    pipeline_id,
                    stage_id,
                    run_type.value,
                    now,
                    trigger_source.value,
                    work_items_requested,
                    os.getpid(),
                    socket.gethostname(),
                ),
            )
            return cursor.lastrowid or 0

    def update_run_progress(
        self,
        run_id: int,
        items_processed: int,
        items_failed: int = 0,
        items_skipped: int = 0,
    ) -> None:
        """Update run progress counters."""
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE pipeline_runs 
                SET work_items_processed = ?,
                    work_items_failed = ?,
                    work_items_skipped = ?
                WHERE id = ?
            """,
                (items_processed, items_failed, items_skipped, run_id),
            )

    def complete_run(
        self,
        run_id: int,
        status: str,
        exit_code: int = 0,
        error_message: Optional[str] = None,
        error_traceback: Optional[str] = None,
    ) -> None:
        """Record run completion."""
        now = datetime.now().isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE pipeline_runs 
                SET completed_at = ?, status = ?, exit_code = ?,
                    error_message = ?, error_traceback = ?
                WHERE id = ?
            """,
                (now, status, exit_code, error_message, error_traceback, run_id),
            )

    def get_run(self, run_id: int) -> Optional[PipelineRun]:
        """Get a specific run by ID."""
        cursor = self._conn.execute(
            """
            SELECT * FROM pipeline_runs WHERE id = ?
        """,
            (run_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_pipeline_run(row)

    def _row_to_pipeline_run(self, row: sqlite3.Row) -> PipelineRun:
        """Convert database row to PipelineRun."""
        return PipelineRun(
            id=row["id"],
            pipeline_id=row["pipeline_id"],
            stage_id=row["stage_id"],
            run_type=RunType(row["run_type"]),
            started_at=datetime.fromisoformat(row["started_at"]),
            completed_at=self._parse_timestamp(row["completed_at"]),
            status=row["status"],
            trigger_source=(
                TriggerSource(row["trigger_source"])
                if row["trigger_source"]
                else TriggerSource.CLI
            ),
            work_items_requested=row["work_items_requested"] or 0,
            work_items_processed=row["work_items_processed"] or 0,
            work_items_failed=row["work_items_failed"] or 0,
            work_items_skipped=row["work_items_skipped"] or 0,
            exit_code=row["exit_code"],
            pid=row["pid"],
            hostname=row["hostname"],
            error_message=row["error_message"],
            error_traceback=row["error_traceback"],
        )

    def get_active_runs(self) -> list[PipelineRun]:
        """Get currently running pipeline stages."""
        cursor = self._conn.execute(
            """
            SELECT * FROM pipeline_runs WHERE status = 'running'
            ORDER BY started_at DESC
        """
        )
        return [self._row_to_pipeline_run(row) for row in cursor.fetchall()]

    def get_recent_runs(
        self, pipeline_id: Optional[str] = None, limit: int = 20
    ) -> list[PipelineRun]:
        """Get recent runs, optionally filtered by pipeline."""
        if pipeline_id:
            cursor = self._conn.execute(
                """
                SELECT * FROM pipeline_runs 
                WHERE pipeline_id = ?
                ORDER BY started_at DESC LIMIT ?
            """,
                (pipeline_id, limit),
            )
        else:
            cursor = self._conn.execute(
                """
                SELECT * FROM pipeline_runs 
                ORDER BY started_at DESC LIMIT ?
            """,
                (limit,),
            )
        return [self._row_to_pipeline_run(row) for row in cursor.fetchall()]

    def cancel_stale_runs(self, stale_threshold_minutes: int = 60) -> int:
        """Mark runs that have been 'running' too long as 'cancelled'."""
        cutoff = (
            datetime.now() - timedelta(minutes=stale_threshold_minutes)
        ).isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE pipeline_runs 
                SET status = 'cancelled', 
                    completed_at = CURRENT_TIMESTAMP,
                    error_message = 'Cancelled: stale run detected'
                WHERE status = 'running' AND started_at < ?
            """,
                (cutoff,),
            )
            return cursor.rowcount

    # ─────────────────────────────────────────────────────────────
    # ACTIVITY LOG
    # ─────────────────────────────────────────────────────────────

    def log_activity(
        self,
        level: str,
        message: str,
        pipeline_id: Optional[str] = None,
        stage_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """Add an entry to the activity log."""
        with self._transaction() as cursor:
            cursor.execute(
                """
                INSERT INTO activity_log (pipeline_id, stage_id, level, message, details_json)
                VALUES (?, ?, ?, ?, ?)
            """,
                (
                    pipeline_id,
                    stage_id,
                    level,
                    message,
                    json.dumps(details) if details else None,
                ),
            )

            # Cleanup old entries (keep last 1000)
            cursor.execute(
                """
                DELETE FROM activity_log 
                WHERE id NOT IN (
                    SELECT id FROM activity_log ORDER BY timestamp DESC LIMIT 1000
                )
            """
            )

    def get_recent_activity(self, limit: int = 50) -> list[ActivityLogEntry]:
        """Get recent activity log entries."""
        cursor = self._conn.execute(
            """
            SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?
        """,
            (limit,),
        )

        entries = []
        for row in cursor.fetchall():
            entries.append(
                ActivityLogEntry(
                    id=row["id"],
                    timestamp=datetime.fromisoformat(row["timestamp"]),
                    pipeline_id=row["pipeline_id"],
                    stage_id=row["stage_id"],
                    level=row["level"],
                    message=row["message"],
                    details=(
                        json.loads(row["details_json"]) if row["details_json"] else None
                    ),
                )
            )
        return entries

    # ─────────────────────────────────────────────────────────────
    # ERROR LOG
    # ─────────────────────────────────────────────────────────────

    def log_error(
        self,
        error_type: str,
        error_message: str,
        pipeline_id: Optional[str] = None,
        stage_id: Optional[str] = None,
        work_item_type: Optional[str] = None,
        work_item_id: Optional[str] = None,
        run_id: Optional[int] = None,
        error_traceback: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> int:
        """Log an error. Returns error log ID."""
        with self._transaction() as cursor:
            cursor.execute(
                """
                INSERT INTO error_log 
                (pipeline_id, stage_id, work_item_type, work_item_id, run_id,
                 error_type, error_message, error_traceback, context_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    pipeline_id,
                    stage_id,
                    work_item_type,
                    work_item_id,
                    run_id,
                    error_type,
                    error_message,
                    error_traceback,
                    json.dumps(context) if context else None,
                ),
            )
            return cursor.lastrowid or 0

    def get_unresolved_errors(
        self, pipeline_id: Optional[str] = None, limit: int = 50
    ) -> list[ErrorLogEntry]:
        """Get unresolved errors."""
        if pipeline_id:
            cursor = self._conn.execute(
                """
                SELECT * FROM error_log 
                WHERE resolved_at IS NULL AND pipeline_id = ?
                ORDER BY occurred_at DESC LIMIT ?
            """,
                (pipeline_id, limit),
            )
        else:
            cursor = self._conn.execute(
                """
                SELECT * FROM error_log 
                WHERE resolved_at IS NULL
                ORDER BY occurred_at DESC LIMIT ?
            """,
                (limit,),
            )

        return [self._row_to_error_log(row) for row in cursor.fetchall()]

    def _row_to_error_log(self, row: sqlite3.Row) -> ErrorLogEntry:
        """Convert database row to ErrorLogEntry."""
        return ErrorLogEntry(
            id=row["id"],
            occurred_at=datetime.fromisoformat(row["occurred_at"]),
            pipeline_id=row["pipeline_id"],
            stage_id=row["stage_id"],
            work_item_type=row["work_item_type"],
            work_item_id=row["work_item_id"],
            run_id=row["run_id"],
            error_type=row["error_type"],
            error_message=row["error_message"],
            error_traceback=row["error_traceback"],
            context=json.loads(row["context_json"]) if row["context_json"] else None,
            resolved_at=self._parse_timestamp(row["resolved_at"]),
            resolution_type=row["resolution_type"],
            resolution_notes=row["resolution_notes"],
        )

    def resolve_error(
        self,
        error_id: int,
        resolution_type: str,
        resolution_notes: Optional[str] = None,
    ) -> None:
        """Mark an error as resolved."""
        now = datetime.now().isoformat()
        with self._transaction() as cursor:
            cursor.execute(
                """
                UPDATE error_log 
                SET resolved_at = ?, resolution_type = ?, resolution_notes = ?
                WHERE id = ?
            """,
                (now, resolution_type, resolution_notes, error_id),
            )

    # ─────────────────────────────────────────────────────────────
    # MONITOR STATE
    # ─────────────────────────────────────────────────────────────

    def get_monitor_state(self, monitor_id: str) -> Optional[MonitorState]:
        """Get cached monitor state."""
        cursor = self._conn.execute(
            """
            SELECT * FROM monitor_state WHERE monitor_id = ?
        """,
            (monitor_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        return MonitorState(
            monitor_id=row["monitor_id"],
            monitor_type=row["monitor_type"],
            last_check_at=self._parse_timestamp(row["last_check_at"]),
            last_check_status=row["last_check_status"],
            last_check_duration_ms=row["last_check_duration_ms"],
            last_new_items_at=self._parse_timestamp(row["last_new_items_at"]),
            content_hash=row["content_hash"],
            cached_data=(
                json.loads(row["cached_data_json"]) if row["cached_data_json"] else None
            ),
            cache_expires_at=self._parse_timestamp(row["cache_expires_at"]),
            consecutive_failures=row["consecutive_failures"] or 0,
            last_error=row["last_error"],
        )

    def update_monitor_state(
        self,
        monitor_id: str,
        monitor_type: str,
        check_status: str,
        check_duration_ms: int,
        content_hash: Optional[str] = None,
        cached_data: Optional[dict[str, Any]] = None,
        cache_ttl_minutes: int = 60,
        has_new_items: bool = False,
        error: Optional[str] = None,
    ) -> None:
        """Update monitor state after a check."""
        now = datetime.now()
        cache_expires = (
            (now + timedelta(minutes=cache_ttl_minutes)).isoformat()
            if cached_data
            else None
        )

        with self._transaction() as cursor:
            cursor.execute(
                """
                INSERT INTO monitor_state 
                (monitor_id, monitor_type, last_check_at, last_check_status, 
                 last_check_duration_ms, content_hash, cached_data_json, cache_expires_at,
                 consecutive_failures, last_error, last_new_items_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (monitor_id) DO UPDATE SET
                    last_check_at = excluded.last_check_at,
                    last_check_status = excluded.last_check_status,
                    last_check_duration_ms = excluded.last_check_duration_ms,
                    content_hash = COALESCE(excluded.content_hash, content_hash),
                    cached_data_json = COALESCE(excluded.cached_data_json, cached_data_json),
                    cache_expires_at = COALESCE(excluded.cache_expires_at, cache_expires_at),
                    consecutive_failures = CASE 
                        WHEN excluded.last_check_status = 'success' THEN 0 
                        ELSE consecutive_failures + 1 
                    END,
                    last_error = excluded.last_error,
                    last_new_items_at = CASE
                        WHEN ? THEN excluded.last_check_at
                        ELSE last_new_items_at
                    END
            """,
                (
                    monitor_id,
                    monitor_type,
                    now.isoformat(),
                    check_status,
                    check_duration_ms,
                    content_hash,
                    json.dumps(cached_data) if cached_data else None,
                    cache_expires,
                    0 if check_status == "success" else 1,
                    error,
                    now.isoformat() if has_new_items else None,
                    has_new_items,
                ),
            )

    # ─────────────────────────────────────────────────────────────
    # STATISTICS
    # ─────────────────────────────────────────────────────────────

    def get_pipeline_stats(self, pipeline_id: str) -> dict[str, Any]:
        """Get statistics for a pipeline."""
        cursor = self._conn.execute(
            """
            SELECT 
                COUNT(*) FILTER (WHERE status = 'complete') as complete,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                MIN(date) FILTER (WHERE status = 'complete') as first_complete,
                MAX(date) FILTER (WHERE status = 'complete') as last_complete
            FROM date_watermarks
            WHERE pipeline_id = ?
        """,
            (pipeline_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else {}

    def get_overall_stats(self) -> dict[str, Any]:
        """Get overall system statistics."""
        cursor = self._conn.execute(
            """
            SELECT 
                (SELECT COUNT(*) FROM pipeline_runs WHERE status = 'running') as active_runs,
                (SELECT COUNT(*) FROM date_watermarks WHERE status = 'pending') as pending_dates,
                (SELECT COUNT(*) FROM date_watermarks WHERE status = 'failed') as failed_dates,
                (SELECT COUNT(*) FROM error_log WHERE resolved_at IS NULL) as unresolved_errors
        """
        )
        row = cursor.fetchone()
        return dict(row) if row else {}
