"""SQLite authority and ZIP replacement tests; no mission data is modified."""

import importlib.util
import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import Mock, patch

import requests

COMM_DIR = Path(__file__).resolve().parents[1] / "1_comm"
sys.path.insert(0, str(COMM_DIR))
from log_db import COMM_LOG_DB_NAME, CommTranscriptionLog


class CommDownloadTests(unittest.TestCase):
    def setUp(self):
        storage = tempfile.TemporaryDirectory()
        self.addCleanup(storage.cleanup)
        self.root = Path(storage.name)
        self.db_path = self.root / COMM_LOG_DB_NAME
        self.filename = "05-03-24_Space-to-Grounds.zip"

    def pending_names(self):
        with CommTranscriptionLog(self.root) as log:
            return log.zips_by_status(["pending"], latest_only=True)

    def is_completed(self):
        with CommTranscriptionLog(self.root) as log:
            return log.latest_entry_for_zip(self.filename).status == "completed"

    def seed_completed(self):
        with CommTranscriptionLog(self.root) as log:
            log.mark_zip_completed(self.filename, "2024-05-03", "SG", version=2)

    def load_downloader(self):
        spec = importlib.util.spec_from_file_location(
            "comm_downloader_test", COMM_DIR / "1a_download_collection_IA_zips.py"
        )
        module = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"RAW_AUDIO_FOLDER": str(self.root / "audio")}):
            spec.loader.exec_module(module)
        module.TRACKING_DIR = self.root
        return module

    def response(self, chunks, size=None):
        response = Mock()
        response.headers = {"content-length": str(size)} if size is not None else {}
        response.iter_content.return_value = iter(chunks)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    def test_successful_replacement_resets_entire_date_and_preserves_other_dates_and_skips(self):
        self.seed_completed()
        with CommTranscriptionLog(self.root) as log:
            log.record_corpus_status("2024-05-03", "completed", prompt_path=self.root / "prompt.txt")
            log.mark_zip_completed(self.filename, "2024-05-03", "SG", version=1)
            log.mark_zip_completed("05-03-24_Dragon.zip", "2024-05-03", "AG", version=2)
            log.mark_zip_skipped("05-03-24_skipped.zip", "2024-05-03", "SG", version=2)
            log.mark_zip_completed("05-04-24.zip", "2024-05-04", "SG", version=2)
        downloader = self.load_downloader()
        path = downloader.issSpaceToGroundsBasePath / self.filename
        path.write_bytes(b"bad")
        with patch.object(downloader.requests, "get", return_value=self.response([b"complete"], 8)), redirect_stdout(StringIO()):
            downloader.download_file("https://example.test/comm.zip", path, 8)
        self.assertEqual(path.read_bytes(), b"complete")
        self.assertFalse(path.with_suffix(".zip.part").exists())
        with CommTranscriptionLog(self.root) as log:
            self.assertIn("2024-05-03", log.corpus_dates_by_status(["completed"]))
            for entry in log.iter_zip_entries():
                if entry.date == "2024-05-03" and entry.status != "skipped":
                    self.assertEqual(entry.status, "pending")
                    self.assertIsNone(entry.transcribed_at)
            self.assertIn("05-04-24.zip", log.zips_by_status(["completed"]))
        with closing(sqlite3.connect(self.db_path)) as conn:
            row = conn.execute(
                "SELECT last_status, last_transcribed_at FROM comm_transcription_day_log WHERE date = ?",
                ("2024-05-03",),
            ).fetchone()
        self.assertEqual(row, ("pending", None))
        self.assertIn(self.filename, self.pending_names())
        # A new completion must supersede older pending transcription versions.
        self.seed_completed()
        self.assertNotIn(self.filename, self.pending_names())

    def test_failed_downloads_leave_completion_unchanged(self):
        self.seed_completed()
        downloader = self.load_downloader()
        path = downloader.issSpaceToGroundsBasePath / self.filename
        path.write_bytes(b"old")

        def interrupted():
            yield b"com"
            raise requests.ConnectionError("disconnected")

        http_error = self.response([])
        http_error.raise_for_status.side_effect = requests.HTTPError("404")
        for response, error in (
            (http_error, requests.HTTPError),
            (self.response([b"bad"], 3), ValueError),
            (self.response([b"bad"], 8), ValueError),
            (self.response(interrupted(), 8), requests.ConnectionError),
        ):
            with self.subTest(error=error), patch.object(downloader.requests, "get", return_value=response), redirect_stdout(StringIO()):
                with self.assertRaises(error):
                    downloader.download_file("https://example.test/comm.zip", path, 8)
                self.assertEqual(path.read_bytes(), b"old")
                self.assertTrue(self.is_completed())

    def test_matching_and_new_downloads_do_not_reset_completed_dates(self):
        self.seed_completed()
        downloader = self.load_downloader()
        path = downloader.issSpaceToGroundsBasePath / self.filename
        path.write_bytes(b"complete")
        with patch.object(downloader.requests, "get") as get, redirect_stdout(StringIO()):
            downloader.download_file("unused", path, 8)
        get.assert_not_called()
        path.unlink()
        with patch.object(downloader.requests, "get", return_value=self.response([b"complete"], 8)), redirect_stdout(StringIO()):
            downloader.download_file("https://example.test/comm.zip", path, 8)
        self.assertTrue(self.is_completed())

    def test_dry_run_does_not_reset_completed_date(self):
        self.seed_completed()
        downloader = self.load_downloader()
        path = downloader.issSpaceToGroundsBasePath / self.filename
        path.write_bytes(b"bad")
        response = Mock()
        response.content = f'<files><file name="{self.filename}"><size>8</size></file></files>'.encode()
        with (
            patch.object(downloader, "collections_xml", ["example"]),
            patch.object(downloader, "skipped_log_path", self.root / "skipped.txt"),
            patch.object(downloader.requests, "get", return_value=response),
            patch("sys.argv", ["download", "--dry-run"]),
            redirect_stdout(StringIO()),
        ):
            downloader.main()
        self.assertEqual(path.read_bytes(), b"bad")
        self.assertTrue(self.is_completed())


if __name__ == "__main__":
    unittest.main()
