"""Corpus discovery uses exact ZIP dates and cached corpus validity."""

import importlib.util
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing, redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

COMM_DIR = Path(__file__).resolve().parents[1] / "1_comm"
sys.path.insert(0, str(COMM_DIR))
spec = importlib.util.spec_from_file_location("corpus_discovery", COMM_DIR / "5_corpus_initial_prompt_ai_gen.py")
corpus = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = corpus
spec.loader.exec_module(corpus)


class CorpusDiscoveryTests(unittest.TestCase):
    def setUp(self):
        storage = tempfile.TemporaryDirectory()
        self.addCleanup(storage.cleanup)
        self.root = Path(storage.name)
        self.raw = self.root / "raw"
        self.audio = self.root / "audio"
        self.env_file = self.root / ".env"
        self.env_file.touch()
        tracking = patch.object(corpus, "TRACKING_DIR", self.root / "tracking")
        tracking.start()
        self.addCleanup(tracking.stop)
        env = patch.dict(os.environ, {
            "RAW_FOLDER": str(self.raw), "WEB_ASSETS_FOLDER": str(self.root / "web"),
            "RAW_AUDIO_FOLDER": str(self.audio),
        })
        env.start()
        self.addCleanup(env.stop)

    def zip(self, date, *, dragon=False):
        year, month, day = date.split("-")
        folder = self.audio / (
            "InternetArchive_dragon_cst_to_grounds" if dragon else "InternetArchive_space_to_grounds"
        )
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{month}-{day}-{year[2:]}_comm.zip").touch()

    def prompt(self, date, text="Existing corpus", meta=None):
        folder = self.raw.joinpath("prompt_context", *date.split("-"))
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "prompt.txt").write_text(text, encoding="utf-8")
        if meta is not None:
            (folder / "prompt_meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def run_main(self, *args):
        output = StringIO()
        with redirect_stdout(output):
            result = corpus.main(["--env-file", str(self.env_file), "--zip-dates", *args])
        self.assertEqual(result, 0)
        return output.getvalue()

    def test_sparse_zip_dates_only_generate_missing_corpus_without_filling_range(self):
        self.zip("2012-04-04")
        self.zip("2026-10-25", dragon=True)
        self.zip("2026-10-25")  # SG and Dragon share one daily corpus.
        self.prompt("2012-04-04")
        with patch.object(corpus, "run_sequential", return_value=[]) as run:
            self.run_main()
        self.assertEqual(run.call_args.args[0], ["2026-10-25"])
        self.assertFalse((self.raw / "prompt_context" / "2012" / "04" / "05").exists())

    def test_completed_corpuses_need_no_work_or_strata_client(self):
        self.zip("2012-04-04")
        self.zip("2026-10-25", dragon=True)
        self.prompt("2012-04-04")
        self.prompt("2026-10-25")
        with patch.object(corpus, "run_sequential") as run, patch.object(corpus, "StrataClient") as client:
            self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": False})
            self.run_main()
        run.assert_not_called()
        client.assert_not_called()

    def test_import_reuses_saved_corpuses_despite_old_metadata_and_force_stays_on_zip_dates(self):
        for date in ("2024-01-01", "2024-01-03", "2024-01-05"):
            self.zip(date)
        self.prompt("2024-01-01")
        self.prompt("2024-01-03", " ")
        self.prompt("2024-01-05", "Partial", {"was_terminated": True})
        with patch.object(corpus, "run_sequential", return_value=[]) as run:
            self.run_main()
            self.assertEqual(run.call_args.args[0], ["2024-01-03"])
            self.run_main("--force")
            self.assertEqual(run.call_args.args[0], ["2024-01-01", "2024-01-03", "2024-01-05"])

    def test_explicit_date_bounds_and_empty_selection_never_expand_to_all_days(self):
        for date in ("2024-01-01", "2024-01-03", "2024-01-05"):
            self.zip(date)
        with patch.object(corpus, "run_sequential", return_value=[]) as run:
            self.run_main("--start-date", "2024-01-02", "--end-date", "2024-01-04")
            self.assertEqual(run.call_args.args[0], ["2024-01-03"])
            run.reset_mock()
            self.assertEqual(json.loads(self.run_main("--start-date", "2025-01-01", "--check-work")), {"needs_work": False})
            self.run_main("--start-date", "2025-01-01")
            run.assert_not_called()

    def test_no_local_zips_is_no_work(self):
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": False})

    def test_corpus_worker_constructs_client_with_low_reasoning(self):
        corpus._init_worker({"repo_root": str(self.root), "env_file": str(self.env_file)}, None)
        with patch.object(corpus, "StrataClient") as client, patch.object(corpus, "PromptContextPipeline") as pipeline:
            pipeline.return_value.process_date.return_value = SimpleNamespace(
                skipped=False, characters=10, elapsed_seconds=0.1, prompt_path=self.root / "prompt.txt"
            )
            result = corpus._worker_task("2024-01-01")
        self.assertEqual(result.status, "ok")
        client.assert_called_once_with(reasoning_effort="low")

    def test_sqlite_status_wins_after_initial_import_even_if_files_change(self):
        self.zip("2024-01-01")
        self.prompt("2024-01-01")
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": False})
        # Completion is read from SQLite, rather than re-inspecting the corpus.
        path = self.raw / "prompt_context" / "2024" / "01" / "01" / "prompt.txt"
        path.unlink()
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": False})
        self.prompt("2024-01-01")
        with corpus.CommTranscriptionLog(corpus.TRACKING_DIR) as log:
            log.record_corpus_status("2024-01-01", "pending")
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": True})

    def test_one_time_import_never_overrides_explicit_pending_or_error_status(self):
        self.zip("2024-01-01")
        self.prompt("2024-01-01")
        with corpus.CommTranscriptionLog(corpus.TRACKING_DIR) as log:
            log.record_corpus_status("2024-01-01", "pending")
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": True})
        with corpus.CommTranscriptionLog(corpus.TRACKING_DIR) as log:
            log.record_corpus_status("2024-01-01", "error", error_message="failed")
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": True})

    def test_tracked_worker_records_success_and_failure_and_honors_pending_database_state(self):
        path = self.root / "prompt.txt"
        path.write_text("Saved corpus", encoding="utf-8")
        corpus._init_worker({
            "repo_root": str(self.root), "env_file": str(self.env_file),
            "track_corpuses": True, "tracking_dir": str(corpus.TRACKING_DIR),
        }, None)
        for failure in (False, True):
            with self.subTest(failure=failure), patch.object(corpus, "StrataClient"), patch.object(corpus, "PromptContextPipeline") as pipeline:
                process = pipeline.return_value.process_date
                if failure:
                    process.side_effect = RuntimeError("generation failed")
                else:
                    process.return_value = SimpleNamespace(
                        skipped=False, characters=12, elapsed_seconds=0.1, prompt_path=path,
                    )
                result = corpus._worker_task("2024-01-01")
                self.assertEqual(result.status, "error" if failure else "ok")
                self.assertTrue(process.call_args.kwargs["force"])
                with corpus.CommTranscriptionLog(corpus.TRACKING_DIR) as log:
                    expected = "error" if failure else "completed"
                    self.assertIn("2024-01-01", log.corpus_dates_by_status([expected]))

    def test_dry_run_uses_in_memory_log_without_creating_database(self):
        self.zip("2024-01-01")
        self.prompt("2024-01-01")
        self.run_main("--dry-run")
        self.assertFalse(corpus.TRACKING_DIR.exists())

    def test_corpus_schema_upgrade_preserves_existing_transcription_completion(self):
        with corpus.CommTranscriptionLog(corpus.TRACKING_DIR) as log:
            log.mark_zip_completed("01-01-24.zip", "2024-01-01", "SG", version=2)
        with closing(sqlite3.connect(corpus.TRACKING_DIR / "comm_transcription_log.sqlite3")) as conn, conn:
            conn.execute("DROP TABLE comm_corpus_log")
            conn.execute("UPDATE comm_log_metadata SET value = '1' WHERE key = 'schema_version'")
        self.zip("2024-01-01")
        self.prompt("2024-01-01")
        self.assertEqual(json.loads(self.run_main("--check-work")), {"needs_work": False})
        with corpus.CommTranscriptionLog(corpus.TRACKING_DIR) as log:
            self.assertIn("01-01-24.zip", log.zips_by_status(["completed"], version=2))
            self.assertIn("2024-01-01", log.corpus_dates_by_status(["completed"]))


if __name__ == "__main__":
    unittest.main()
