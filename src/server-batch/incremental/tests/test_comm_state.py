"""SQLite authority for incremental comm status."""

import sys
import tempfile
import unittest
from pathlib import Path

from incremental.state import ZipFileTracker

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "1_comm"))
from log_db import CommTranscriptionLog


class CommStateTests(unittest.TestCase):
    def setUp(self):
        storage = tempfile.TemporaryDirectory()
        self.addCleanup(storage.cleanup)
        self.root = Path(storage.name)
        self.tracker = ZipFileTracker(self.root)
        self.filename = "05-03-24_Space-to-Grounds.zip"

    def test_reconcile_archived_completions_without_overriding_replacements_skips_or_errors(self):
        with CommTranscriptionLog(self.root) as log:
            for day, status in ((1, "pending"), (2, "in_progress"), (3, "skipped"), (4, "error"), (5, "completed")):
                log.record_zip_status(f"05-0{day}-24.zip", f"2024-05-0{day}", "SG", status, version=1)
            log.mark_date_pending("2024-05-05")
            restored = log.reconcile_legacy_completions({f"05-0{day}-24.zip" for day in range(1, 6)})
            self.assertEqual(restored, {"05-01-24.zip", "05-02-24.zip"})
            self.assertEqual(log.reconcile_legacy_completions(restored), set())
        self.assertEqual(self.tracker.get_processed(), {"05-01-24.zip", "05-02-24.zip"})
        self.assertEqual(self.tracker.get_replaced(), {"05-05-24.zip"})
        self.assertEqual(self.tracker.get_skipped(), {"05-03-24.zip"})
        self.assertEqual(self.tracker.get_error_filenames(), {"05-04-24.zip"})

    def test_missing_database_ignores_text_files_without_creating_database(self):
        (self.root / "ia_zips_processed.txt").write_text(self.filename)
        self.assertEqual(self.tracker.get_processed(), set())
        self.assertEqual(self.tracker.get_unprocessed({self.filename}), {self.filename})
        self.assertFalse(self.tracker.db_path.exists())

    def test_all_status_reads_use_latest_sqlite_rows_and_ignore_text_files(self):
        with CommTranscriptionLog(self.root) as log:
            for version, status in ((1, "completed"), (2, "pending")):
                log.record_zip_status(self.filename, "2024-05-03", "SG", status, version=version)
            for day, status in ((4, "completed"), (5, "error"), (6, "skipped"), (7, "in_progress")):
                log.record_zip_status(
                    f"05-0{day}-24.zip", f"2024-05-0{day}", "SG", status,
                    version=2, error_message="test" if status == "error" else None,
                )
            log.mark_zip_skipped("05-08-24.zip", "2024-05-08", "SG", version=1)
            log.mark_zip_pending("05-08-24.zip", "2024-05-08", "SG", version=2)
            self.assertNotIn("05-08-24.zip", log.zips_by_status(["skipped"], latest_only=True))
        for filename in ("ia_zips_processed.txt", "ia_zips_errors.txt", "ia_skip_zips.txt"):
            (self.root / filename).write_text(self.filename + "\n")
        self.assertEqual(self.tracker.get_processed(), {"05-04-24.zip"})
        self.assertEqual(self.tracker.get_errors(), {"05-05-24.zip|test"})
        self.assertEqual(self.tracker.get_error_filenames(), {"05-05-24.zip"})
        self.assertEqual(self.tracker.get_skipped(), {"05-06-24.zip"})
        self.assertEqual(self.tracker.get_in_progress(), {"05-07-24.zip"})
        self.assertEqual(self.tracker.get_pending(), {self.filename, "05-08-24.zip"})
        self.assertEqual(self.tracker.get_status("05-05-24.zip").error_message, "test")
        self.assertFalse(self.tracker.get_status(self.filename).is_processed)
        self.assertEqual(self.tracker.get_summary(), {
            "processed": 1, "errors": 1, "skipped": 1, "in_progress": 1, "pending": 2,
        })


if __name__ == "__main__":
    unittest.main()
