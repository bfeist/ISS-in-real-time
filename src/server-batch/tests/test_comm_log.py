from __future__ import annotations

import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path
import os

MODULE_ROOT = Path(__file__).resolve().parents[1] / "1_comm"
if str(MODULE_ROOT) not in sys.path:
    sys.path.insert(0, str(MODULE_ROOT))

from log_db import (  # type: ignore  # noqa: E402
    CommTranscriptionLog,
    LOG_STATUS_COMPLETED,
    LOG_STATUS_IN_PROGRESS,
    LOG_STATUS_SKIPPED,
)
from log_migration import migrate_legacy_tracking_files  # type: ignore  # noqa: E402


class CommTranscriptionLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.storage_dir = Path(self.temp_dir.name)

    def test_record_zip_status_and_day_logs(self) -> None:
        log = CommTranscriptionLog(self.storage_dir)
        self.addCleanup(log.close)

        log.record_zip_status(
            "01-01-24_Space-to-Grounds.zip",
            "2024-01-01",
            "Space-to-Grounds",
            LOG_STATUS_COMPLETED,
            version=2,
        )

        completed = log.zips_by_status([LOG_STATUS_COMPLETED], version=2)
        self.assertIn("01-01-24_Space-to-Grounds.zip", completed)

        entry = log.latest_entry_for_zip("01-01-24_Space-to-Grounds.zip")
        self.assertIsNotNone(entry)
        assert entry is not None
        self.assertEqual(entry.status, LOG_STATUS_COMPLETED)
        self.assertEqual(entry.version, 2)

        bounds = log.date_bounds()
        self.assertIsNotNone(bounds)
        assert bounds is not None
        self.assertEqual(bounds[0].isoformat(), "2024-01-01")
        self.assertEqual(bounds[1].isoformat(), "2024-01-01")

        log.ensure_day_range(dt.date(2024, 1, 1), dt.date(2024, 1, 3))
        log.record_blank_day("2024-01-02", note="no_zip")

        missing_days = log.missing_days()
        self.assertEqual(set(missing_days), {"2024-01-02", "2024-01-03"})

    def test_migrate_legacy_tracking_files(self) -> None:
        tracking_dir = self.storage_dir / "tracking"
        tracking_dir.mkdir(parents=True, exist_ok=True)

        (tracking_dir / "ia_zips_processed.txt").write_text(
            "\n".join(
                [
                    "01-01-24_Space-to-Grounds.zip",
                    "01-03-24_Space-to-Grounds.zip",
                ]
            ),
            encoding="utf-8",
        )
        (tracking_dir / "ia_skip_zips.txt").write_text(
            "01-01-24_Space-to-Grounds.zip\n01-04-24_Space-to-Grounds.zip",
            encoding="utf-8",
        )
        (tracking_dir / "ia_zips_in_progress.txt").write_text(
            "01-05-24_Space-to-Grounds.zip",
            encoding="utf-8",
        )
        (tracking_dir / "ia_zips_errors.txt").write_text("\n", encoding="utf-8")

        log = CommTranscriptionLog(self.storage_dir)
        self.addCleanup(log.close)

        transcript_root = self.storage_dir / "web_comm"
        csv_path = transcript_root / "2024" / "01" / "01" / "_transcript_2024-01-01.csv"
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        csv_path.write_text("utterance|file", encoding="utf-8")
        desired_ts = dt.datetime(
            2024, 1, 2, 3, 4, 5, tzinfo=dt.timezone.utc
        ).timestamp()
        os.utime(csv_path, (desired_ts, desired_ts))

        stats = migrate_legacy_tracking_files(
            log,
            tracking_dir,
            version=1,
            transcript_root=transcript_root,
        )
        self.assertEqual(stats["status"], "migrated")
        self.assertEqual(stats["zip_records"], 4)
        self.assertEqual(stats["blank_days"], 1)
        self.assertEqual(stats["timestamp_seeded"], 1)

        completed = log.zips_by_status([LOG_STATUS_COMPLETED], version=1)
        self.assertIn("01-01-24_Space-to-Grounds.zip", completed)
        self.assertIn("01-03-24_Space-to-Grounds.zip", completed)

        seeded_entry = log.latest_entry_for_zip("01-01-24_Space-to-Grounds.zip")
        self.assertIsNotNone(seeded_entry)
        assert seeded_entry is not None
        self.assertEqual(seeded_entry.transcribed_at, "2024-01-02T03:04:05Z")

        unseeded_entry = log.latest_entry_for_zip("01-03-24_Space-to-Grounds.zip")
        self.assertIsNotNone(unseeded_entry)
        assert unseeded_entry is not None
        self.assertIsNone(unseeded_entry.transcribed_at)

        skipped = log.zips_by_status([LOG_STATUS_SKIPPED])
        self.assertIn("01-04-24_Space-to-Grounds.zip", skipped)

        in_progress = log.zips_by_status([LOG_STATUS_IN_PROGRESS])
        self.assertIn("01-05-24_Space-to-Grounds.zip", in_progress)

        missing_days = log.missing_days()
        self.assertEqual(missing_days, ["2024-01-02"])


if __name__ == "__main__":
    unittest.main()
