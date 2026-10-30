"""Offline regression tests: temporary files, in-memory SQLite and fake scripts.

Run from incremental/: python -m unittest discover -s tests -v
"""

import asyncio
import io
import os
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, patch

from click.testing import CliRunner
from rich.console import Console
from rich.text import Text

from incremental.cli import main
from incremental.config import PathsConfig, Settings, load_pipelines
from incremental.models import GpuTaskType, PipelineConfig, StageConfig, Status, WorkItem
from incremental.orchestrator import Orchestrator, OrchestratorResult
from incremental.planning import build_execution_plan
from incremental.resources import ResourceManager
from incremental.script_runner import ScriptResult, ScriptRunner
from incremental.state import StateDatabase, ZipFileTracker

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "1_comm"))
from log_db import CommTranscriptionLog


def stage(sid="build", **kwargs):
    return StageConfig(id=sid, name=sid, script=f"{sid}.py", **kwargs)


def pipeline(pid, stages=None, **kwargs):
    return PipelineConfig(id=pid, name=pid, stages=stages or [stage()], **kwargs)


def script_result(success=True):
    return ScriptResult(
        success,
        0 if success else 1,
        "",
        "",
        0.01,
        error_message=None if success else "script failed",
    )


class PlanningTests(unittest.TestCase):
    def test_cross_stage_dependencies_order_pipelines_and_stages(self):
        downstream = pipeline(
            "comm",
            [
                stage("web", depends_on_stages=["corpus"]),
                stage("corpus", cross_dependencies=[{"pipeline": "articles", "stage": "build"}]),
            ],
        )
        config = {"comm": downstream, "articles": pipeline("articles")}
        plan = build_execution_plan(config)
        self.assertEqual([p.id for p in plan], ["articles", "comm"])
        self.assertEqual([s.id for s in plan[1].stages], ["corpus", "web"])
        self.assertEqual([s.id for s in downstream.stages], ["web", "corpus"])

    def test_partial_update_does_not_automatically_run_omitted_pipelines(self):
        config = {"source": pipeline("source"), "stats": pipeline("stats", depends_on=["source"])}
        self.assertEqual([p.id for p in build_execution_plan(config, ["stats"])], ["stats"])
        self.assertEqual(build_execution_plan(config, []), [])

    def test_cycles_and_unknown_references_fail_before_execution(self):
        cases = [
            {"a": pipeline("a", depends_on=["b"]), "b": pipeline("b", depends_on=["a"])},
            {
                "a": pipeline(
                    "a",
                    [
                        stage("one", depends_on_stages=["two"]),
                        stage("two", depends_on_stages=["one"]),
                    ],
                )
            },
            {"a": pipeline("a", depends_on=["typo"])},
            {"a": pipeline("a", [stage(depends_on_stages=["typo"])])},
            {
                "a": pipeline(
                    "a", [stage(cross_dependencies=[{"pipeline": "b", "stage": "typo"}])]
                ),
                "b": pipeline("b"),
            },
            {"a": pipeline("a", [stage(cross_dependencies=[{"pipeline": "b"}])])},
            {"a": pipeline("a", [stage("same"), stage("same")])},
        ]
        for config in cases:
            with self.subTest(config=config), self.assertRaises(ValueError):
                build_execution_plan(config)

    def test_disabled_stages_are_not_executed_or_counted_as_dependencies(self):
        config = {"a": pipeline("a", [stage("off", enabled=False), stage("on")])}
        self.assertEqual([s.id for s in build_execution_plan(config)[0].stages], ["on"])
        config["a"].stages[1].depends_on_stages = ["off"]
        with self.assertRaisesRegex(ValueError, "disabled stage"):
            build_execution_plan(config)

    def test_unknown_selection_and_disabled_prerequisite_are_errors(self):
        with self.assertRaisesRegex(ValueError, "Unknown or disabled"):
            build_execution_plan({}, ["typo"])
        with self.assertRaisesRegex(ValueError, "disabled pipeline"):
            build_execution_plan(
                {"a": pipeline("a", depends_on=["b"]), "b": pipeline("b", enabled=False)}
            )

    def test_repository_plan_preserves_existing_default_script_order(self):
        configured = load_pipelines(Path(__file__).resolve().parents[1])
        original = [
            (p.id, s.id, s.script, s.args_template)
            for p in configured.values()
            if p.enabled
            for s in p.stages
            if s.enabled
        ]
        planned = [
            (p.id, s.id, s.script, s.args_template)
            for p in build_execution_plan(configured)
            for s in p.stages
        ]
        self.assertEqual(planned, original)
        self.assertEqual(len(planned), 25)

    def test_comm_transcribe_enables_transcript_output(self):
        configured = load_pipelines(Path(__file__).resolve().parents[1])
        transcribe = next(s for s in configured["comm"].stages if s.id == "transcribe")
        self.assertIn("--see-transcriptions", transcribe.args_template.split())

    def test_entire_comm_runs_after_independent_work_and_before_aggregation(self):
        configured = load_pipelines(Path(__file__).resolve().parents[1])
        batches = build_execution_plan(configured)
        stages = [(p.id, s.id) for p in batches for s in p.stages]
        self.assertEqual(len(stages), 25)
        self.assertEqual(len(set(stages)), 25)
        self.assertLess(stages.index(("photos_flickr", "ai_classify")), stages.index(("comm", "download")))
        self.assertLess(stages.index(("ephemera", "orbits")), stages.index(("comm", "download")))
        self.assertEqual(stages[-7:], [
            ("comm", "download"), ("comm", "corpus"),
            ("comm", "transcribe"), ("comm", "web"),
            ("aggregation", "availability"), ("aggregation", "first_comm"),
            ("aggregation", "stats"),
        ])
        self.assertEqual([s.id for s in configured["comm"].stages],
                         ["download", "corpus", "transcribe", "web"])

    def test_partial_comm_update_keeps_all_comm_stages_and_omits_photos(self):
        configured = load_pipelines(Path(__file__).resolve().parents[1])
        batches = build_execution_plan(configured, ["comm"])
        self.assertEqual([(p.id, s.id) for p in batches for s in p.stages], [
            ("comm", "download"), ("comm", "corpus"),
            ("comm", "transcribe"), ("comm", "web"),
        ])

    def test_comm_and_its_consumers_follow_independent_pipelines(self):
        config = {
            "comm": pipeline("comm", [stage("corpus"), stage("transcribe", gpu_task_type=GpuTaskType.WHISPERX)]),
            "consumer": pipeline("consumer", [stage(cross_dependencies=[{"pipeline": "comm", "stage": "transcribe"}])]),
            "stats": pipeline("stats", depends_on=["consumer"]),
            "photos": pipeline("photos"),
        }
        batches = build_execution_plan(config)
        self.assertEqual([p.id for p in batches], ["photos", "comm", "consumer", "stats"])

    def test_partial_selection_runs_whole_comm_after_selected_photos(self):
        configured = load_pipelines(Path(__file__).resolve().parents[1])
        plan = build_execution_plan(configured, ["comm", "photos_flickr"])
        self.assertEqual([p.id for p in plan], ["photos_flickr", "comm"])
        self.assertEqual([s.id for s in plan[-1].stages],
                         ["download", "corpus", "transcribe", "web"])


class ExecutionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.settings = Settings(
            paths=PathsConfig(server_batch_dir=root, raw_audio_folder=root / "audio"),
            pipelines={
                "source": pipeline("source"),
                "stats": pipeline("stats", depends_on=["source"]),
            },
        )
        self.db = StateDatabase(Path(":memory:"))
        self.addCleanup(self.db._conn.close)
        self.runner = Orchestrator(self.settings, self.db, ZipFileTracker(root))
        self.runner.script_runner.run = AsyncMock(return_value=script_result())
        self.runner.resource_manager.acquire_gpu = AsyncMock()
        self.runner.resource_manager.release_gpu = AsyncMock()
        self.runner.resource_manager.shutdown = AsyncMock()

    def configure_comm_last_update(self):
        self.settings.pipelines = {
            "comm": pipeline("comm", [
                stage("download"),
                stage("corpus", requires_gpu=True, gpu_task_type=GpuTaskType.STRATA, strata_model="iq3_s", depends_on_stages=["download"]),
                stage("transcribe", requires_gpu=True, gpu_task_type=GpuTaskType.WHISPERX, depends_on_stages=["corpus"]),
                stage("web", depends_on_stages=["transcribe"]),
            ]),
            "photos": pipeline("photos", [stage("classify", requires_gpu=True, gpu_task_type=GpuTaskType.STRATA, strata_model="iq3_s")]),
            "stats": pipeline("stats", depends_on=["comm", "photos"]),
        }

        async def discover(pipeline, stage, *args):
            return [WorkItem(item_type="full", item_id="full", pipeline_id=pipeline.id, stage_id=stage.id)]

        self.runner._discover_work_items = AsyncMock(side_effect=discover)

    async def test_whole_comm_runs_last_and_counts_each_pipeline_once(self):
        self.configure_comm_last_update()
        result = await self.runner.run_pipelines()
        self.assertTrue(result.success)
        self.assertEqual(result.pipelines_run, 3)
        self.assertEqual(result.stages_run, 6)
        self.assertEqual([Path(c.kwargs["script_path"]).stem for c in self.runner.script_runner.run.call_args_list],
                         ["classify", "download", "corpus", "transcribe", "web", "build"])
        self.assertEqual(self.runner._completed_pipelines, {"comm", "photos", "stats"})
        self.runner.resource_manager.shutdown.assert_awaited_once()

    async def test_failed_corpus_blocks_transcription_and_aggregation(self):
        self.configure_comm_last_update()
        self.runner.script_runner.run.side_effect = [script_result(), script_result(), script_result(False)]
        statuses = []
        result = await self.runner.run_pipelines(on_stage_status=lambda *event: statuses.append(event))
        self.assertFalse(result.success)
        self.assertEqual(result.pipelines_run, 2)
        self.assertEqual(self.runner._completed_pipelines, {"photos"})
        self.assertEqual(self.runner.script_runner.run.await_count, 3)
        self.assertIn(("comm", "transcribe", Status.SKIPPED), statuses)
        self.assertIn(("comm", "web", Status.SKIPPED), statuses)
        self.assertIn(("stats", "build", Status.SKIPPED), statuses)

    async def test_cleanup_failure_fails_the_update(self):
        self.runner.resource_manager.shutdown.side_effect = RuntimeError("unload failed")
        result = await self.runner.run_pipelines()
        self.assertFalse(result.success)
        self.assertIn("Failed to release GPU resources: unload failed", result.errors)

    async def test_failed_transcription_blocks_web_and_aggregation(self):
        self.configure_comm_last_update()
        self.runner.script_runner.run.side_effect = [script_result(), script_result(), script_result(), script_result(False)]
        result = await self.runner.run_pipelines()
        self.assertFalse(result.success)
        self.assertEqual(self.runner._completed_pipelines, {"photos"})
        self.assertEqual(self.runner.script_runner.run.await_count, 4)
        self.runner.resource_manager.shutdown.assert_awaited_once()

    async def test_success_records_stage_attempts_without_inventing_date_watermarks(self):
        result = await self.runner.run_pipelines()
        self.assertTrue(result.success)
        self.assertEqual(result.stages_run, 2)
        records = self.db.get_recent_runs()
        self.assertEqual(len(records), 2)
        self.assertTrue(all(r.is_success and r.work_items_processed == 1 for r in records))
        self.assertEqual(self.db.get_active_runs(), [])
        self.assertEqual(self.db.get_pipeline_stats("source")["complete"], 0)

    async def test_failed_prerequisite_blocks_aggregation_but_not_independent_work(self):
        self.settings.pipelines["independent"] = pipeline("independent")
        self.runner.script_runner.run.side_effect = [script_result(False), script_result()]
        statuses = []
        result = await self.runner.run_pipelines(
            on_stage_status=lambda *event: statuses.append(event)
        )
        self.assertFalse(result.success)
        self.assertEqual(result.pipelines_run, 2)
        self.assertEqual(result.items_failed, 1)
        self.assertNotIn("stats", self.runner._completed_pipelines)
        self.assertIn(("source", "build", Status.FAILED), statuses)
        self.assertIn(("stats", "build", Status.SKIPPED), statuses)
        self.assertIn(("independent", "build", Status.COMPLETE), statuses)
        self.assertEqual(len(self.db.get_unresolved_errors()), 1)

    async def test_failed_cross_dependency_does_not_mark_pipeline_successful(self):
        self.settings.pipelines["consumer"] = pipeline(
            "consumer",
            [
                stage("download"),
                stage("build", cross_dependencies=[{"pipeline": "source", "stage": "build"}]),
            ],
        )
        self.settings.pipelines["stats"].depends_on = ["consumer"]
        self.runner.script_runner.run.side_effect = [script_result(False), script_result()]
        result = await self.runner.run_pipelines()
        self.assertFalse(result.success)
        self.assertNotIn("consumer", self.runner._completed_pipelines)
        self.assertNotIn("stats", self.runner._completed_pipelines)
        self.assertEqual(self.runner.script_runner.run.await_count, 2)

    async def test_failure_keeps_exception_after_long_traceback_in_state(self):
        traceback = "Traceback (most recent call last):\n" + "  stack frame\n" * 30
        traceback += "RuntimeError: Failed to download NASA article"
        failed = script_result(False)
        failed.error_message = None
        failed.stderr = traceback
        self.runner.script_runner.run.return_value = failed
        result = await self.runner.run_pipelines(["source"])
        self.assertIn(traceback, result.errors[0])
        self.assertIn(traceback, self.db.get_recent_runs()[0].error_message)
        self.assertIn(traceback, self.db.get_unresolved_errors()[0].error_message)

    async def test_reused_runner_does_not_remember_previous_success(self):
        self.assertTrue((await self.runner.run_pipelines()).success)
        self.runner.script_runner.run.reset_mock()
        self.runner.script_runner.run.return_value = script_result(False)
        self.assertFalse((await self.runner.run_pipelines()).success)
        self.assertEqual(self.runner.script_runner.run.await_count, 1)
        self.assertEqual(self.runner._completed_pipelines, set())

    async def test_selected_pipeline_uses_existing_omitted_outputs(self):
        result = await self.runner.run_pipelines(pipeline_ids=["stats"])
        self.assertTrue(result.success)
        self.assertEqual(self.runner.script_runner.run.await_count, 1)

    async def test_dry_run_has_no_execution_gpu_or_database_records(self):
        result = await self.runner.run_pipelines(dry_run=True)
        self.assertTrue(result.success)
        self.runner.script_runner.run.assert_not_awaited()
        self.runner.resource_manager.acquire_gpu.assert_not_awaited()
        self.assertEqual(self.db.get_recent_runs(), [])
        self.assertEqual(self.db.get_recent_activity(), [])
        self.runner.resource_manager.shutdown.assert_not_awaited()

    async def test_invalid_plan_starts_no_scripts(self):
        self.settings.pipelines["stats"].depends_on = ["typo"]
        self.assertFalse((await self.runner.run_pipelines()).success)
        self.runner.script_runner.run.assert_not_awaited()

    async def test_empty_selection_runs_nothing(self):
        self.assertTrue((await self.runner.run_pipelines(pipeline_ids=[])).success)
        self.runner.script_runner.run.assert_not_awaited()

    async def test_date_bounds_are_forwarded_to_supported_templates(self):
        source = self.settings.pipelines["source"]
        source.stages[
            0
        ].args_template = "--start-date {since_date} --end-date {until_date} {force_flag}"
        await self.runner.run_pipelines(
            ["source"], since=date(2024, 1, 2), until=date(2024, 1, 4), force=True
        )
        self.assertEqual(
            self.runner.script_runner.run.call_args.kwargs["args"],
            ["--start-date", "2024-01-02", "--end-date", "2024-01-04", "--force"],
        )

    async def test_reversed_date_bounds_start_no_scripts(self):
        result = await self.runner.run_pipelines(since=date(2024, 2, 1), until=date(2024, 1, 1))
        self.assertFalse(result.success)
        self.runner.script_runner.run.assert_not_awaited()

    async def test_recent_processed_zips_remain_available_for_transcription_repairs(self):
        folder = self.settings.paths.raw_audio_folder / "InternetArchive_space_to_grounds"
        folder.mkdir(parents=True)
        for filename in ("09-01-24.zip", "09-02-24.zip", "09-03-24.zip"):
            (folder / filename).touch()
        with CommTranscriptionLog(self.settings.paths.server_batch_dir) as log:
            log.mark_zip_completed("09-01-24.zip", "2024-09-01", "SG", version=2)
            log.mark_zip_skipped("09-03-24.zip", "2024-09-03", "SG", version=2)
        comm = pipeline("comm", [stage("corpus"), stage("transcribe")])
        corpus = await self.runner._discover_work_items(comm, comm.stages[0], None, None, False)
        transcribe = await self.runner._discover_work_items(comm, comm.stages[1], None, None, False)
        self.assertEqual(corpus[0].item_id, "comm:missing_corpuses")
        self.assertEqual(corpus[0].metadata, {"since_date": None, "until_date": None})
        self.assertEqual(transcribe[0].metadata["dates"], ["2024-09-01", "2024-09-02"])

    async def test_pending_date_overrides_old_text_status_and_modification_window(self):
        folder = self.settings.paths.raw_audio_folder / "InternetArchive_dragon_cst_to_grounds"
        folder.mkdir(parents=True)
        filename = "09-01-24_Dragon-to-Grounds.zip"
        path = folder / filename
        path.touch()
        os.utime(path, (0, 0))
        root = self.settings.paths.server_batch_dir
        for text_file in ("ia_zips_processed.txt", "ia_zips_errors.txt", "ia_skip_zips.txt"):
            (root / text_file).write_text(filename + "\n")
        with CommTranscriptionLog(root) as log:
            log.mark_zip_completed(filename, "2024-09-01", "AG", version=2)
            log.mark_date_pending("2024-09-01")
        comm = pipeline("comm", [stage("transcribe"), stage("web")])
        for configured in comm.stages:
            items = await self.runner._discover_work_items(comm, configured, None, None, False)
            self.assertEqual(items[0].metadata["dates"], ["2024-09-01"])

    async def test_corpus_discovery_uses_cache_check_and_explicit_bounds_not_zip_status(self):
        configured = stage(
            "corpus", args_template="--zip-dates --start-date {since_date} --end-date {until_date} {force_flag}"
        )
        comm = pipeline("comm", [configured])
        with patch.object(self.runner, "_discover_dates_from_zips", side_effect=AssertionError("ZIP status used")):
            items = await self.runner._discover_work_items(comm, configured, None, None, False)
            self.assertEqual(self.runner._expand_args_template(configured.args_template, items[0], False, False), ["--zip-dates"])
            items = await self.runner._discover_work_items(
                comm, configured, date(2024, 1, 2), date(2024, 1, 4), False
            )
        self.assertEqual(
            self.runner._expand_args_template(configured.args_template, items[0], False, False),
            ["--zip-dates", "--start-date", "2024-01-02", "--end-date", "2024-01-04"],
        )

    async def test_old_unmarked_pending_zips_do_not_trigger_historical_backfill(self):
        folder = self.settings.paths.raw_audio_folder / "InternetArchive_space_to_grounds"
        folder.mkdir(parents=True)
        filename = "04-04-12_Space-to-Grounds.zip"
        path = folder / filename
        path.touch()
        os.utime(path, (0, 0))
        with CommTranscriptionLog(self.settings.paths.server_batch_dir) as log:
            log.mark_zip_pending(filename, "2012-04-04", "SG", version=2)
        self.assertEqual(self.runner._discover_dates_from_zips(include_processed=True), [])

    async def test_transcription_receives_only_exact_selected_dates_in_bounded_batches(self):
        configured = stage("transcribe", args_template="--start-date {since_date} --end-date {until_date} --see-transcriptions {force_flag}")
        comm = pipeline("comm", [configured])
        with patch.object(self.runner, "_discover_dates_from_zips", return_value=["2012-04-04", "2026-10-25"]):
            items = await self.runner._discover_work_items(comm, configured, None, None, False)
        self.assertEqual(
            self.runner._expand_args_template(configured.args_template, items[0], False, False),
            ["--see-transcriptions", "--date", "2012-04-04", "--date", "2026-10-25"],
        )
        dates = [f"2024-{month:02d}-{day:02d}" for month in range(1, 13) for day in range(1, 29)]
        with patch.object(self.runner, "_discover_dates_from_zips", return_value=dates):
            items = await self.runner._discover_work_items(comm, configured, None, None, False)
        self.assertTrue(all(len(item.metadata["dates"]) <= 128 for item in items))
        self.assertEqual([value for item in items for value in item.metadata["dates"]], dates)

    async def test_comm_range_is_intersected_with_requested_dates(self):
        comm = pipeline("comm", [stage("web")])
        with patch.object(
            self.runner,
            "_discover_dates_from_zips",
            return_value=["2024-01-01", "2024-01-03", "2024-01-05"],
        ):
            items = await self.runner._discover_work_items(
                comm, comm.stages[0], date(2024, 1, 2), date(2024, 1, 4), False
            )
            self.assertEqual(items[0].metadata["dates"], ["2024-01-03"])
            items = await self.runner._discover_work_items(
                comm, comm.stages[0], date(2025, 1, 1), None, True
            )
            self.assertEqual(
                items, []
            )  # Never turn an empty bounded range into an unrestricted run.

    async def test_gpu_failure_is_recorded_and_cannot_run_scripts(self):
        self.settings.pipelines["source"].stages[0].requires_gpu = True
        self.runner.resource_manager.acquire_gpu.side_effect = RuntimeError("GPU unavailable")
        self.assertFalse((await self.runner.run_pipelines()).success)
        self.runner.script_runner.run.assert_not_awaited()
        self.assertEqual(self.db.get_recent_runs()[0].status, "failed")
        self.assertEqual(len(self.db.get_unresolved_errors()), 1)

    async def test_completed_corpus_skips_model_load_and_allows_downstream_stages(self):
        configured = self.settings.pipelines["source"].stages[0]
        configured.requires_gpu = True
        configured.gpu_task_type = GpuTaskType.STRATA
        configured.work_check_args = ["--check-work"]
        check = script_result()
        check.json_output = {"needs_work": False}
        self.runner.script_runner.run.side_effect = [check, script_result()]

        result = await self.runner.run_pipelines()

        self.assertTrue(result.success)
        self.assertIn("stats", self.runner._completed_pipelines)
        self.runner.resource_manager.acquire_gpu.assert_not_awaited()
        self.runner.resource_manager.release_gpu.assert_not_awaited()
        calls = self.runner.script_runner.run.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0].kwargs["args"], ["--check-work"])
        self.assertTrue(calls[1].kwargs["script_path"].endswith("build.py"))
        source_run = next(r for r in self.db.get_recent_runs() if r.pipeline_id == "source")
        self.assertEqual(source_run.work_items_processed, 0)

    async def test_corpus_model_load_follows_successful_work_check_with_same_date_and_force_args(self):
        configured = self.settings.pipelines["source"].stages[0]
        configured.requires_gpu = True
        configured.gpu_task_type = GpuTaskType.STRATA
        configured.work_check_args = ["--check-work"]
        configured.args_template = "--start-date {since_date} --end-date {until_date} {force_flag}"

        async def run_script(**kwargs):
            result = script_result()
            if "--check-work" in kwargs["args"]:
                self.runner.resource_manager.acquire_gpu.assert_not_awaited()
                result.json_output = {"needs_work": True}
            else:
                self.runner.resource_manager.acquire_gpu.assert_awaited_once()
            return result

        self.runner.script_runner.run.side_effect = run_script
        result = await self.runner.run_pipelines(
            ["source"], since=date(2024, 1, 2), until=date(2024, 1, 4), force=True
        )

        self.assertTrue(result.success)
        expected_args = ["--start-date", "2024-01-02", "--end-date", "2024-01-04", "--force"]
        calls = self.runner.script_runner.run.call_args_list
        self.assertEqual(calls[0].kwargs["args"], [*expected_args, "--check-work"])
        self.assertEqual(calls[1].kwargs["args"], expected_args)
        self.assertEqual(calls[0].kwargs["env"], calls[1].kwargs["env"])
        self.runner.resource_manager.release_gpu.assert_awaited_once()

    async def test_failed_or_invalid_work_check_fails_without_loading_model(self):
        configured = self.settings.pipelines["source"].stages[0]
        configured.requires_gpu = True
        configured.work_check_args = ["--check-work"]
        for success, output in ((False, None), (True, None), (True, {"needs_work": "false"})):
            check = script_result(success)
            check.json_output = output
            with self.subTest(success=success, output=output):
                self.runner.script_runner.run.reset_mock()
                self.runner.script_runner.run.return_value = check
                result = await self.runner.run_pipelines()
                self.assertFalse(result.success)
                self.runner.script_runner.run.assert_awaited_once()
                self.runner.resource_manager.acquire_gpu.assert_not_awaited()
                self.runner.resource_manager.release_gpu.assert_not_awaited()
                self.assertNotIn("stats", self.runner._completed_pipelines)

    async def test_cancellation_closes_run_and_releases_gpu(self):
        self.settings.pipelines["source"].stages[0].requires_gpu = True
        self.runner.script_runner.run.side_effect = asyncio.CancelledError
        with self.assertRaises(asyncio.CancelledError):
            await self.runner.run_pipelines()
        self.runner.resource_manager.release_gpu.assert_awaited_once()
        self.runner.resource_manager.shutdown.assert_awaited_once()
        self.assertEqual(self.db.get_recent_runs()[0].status, "cancelled")
        self.assertEqual(self.db.get_active_runs(), [])
        self.assertIsNone(self.runner._current_pipeline)

    async def test_shutdown_is_not_success(self):
        self.runner._shutdown = True
        self.assertFalse((await self.runner.run_pipelines()).success)
        self.runner.script_runner.run.assert_not_awaited()

    async def test_gpu_configuration_is_authoritative_and_status_uses_model_fields(self):
        configured = stage("transcribe_name_but_strata", gpu_task_type=GpuTaskType.STRATA)
        self.assertEqual(self.runner._get_gpu_task_type(configured), GpuTaskType.STRATA)
        status = await self.runner.get_status()
        self.assertEqual(status["resource_status"].current_task_type, GpuTaskType.NONE)

    async def test_strata_instance_and_host_are_passed_to_stage_process(self):
        configured = stage("classify", requires_gpu=True,
                           gpu_task_type=GpuTaskType.STRATA,
                           strata_model="iq3_s")
        self.settings.pipelines = {"photos": pipeline("photos", [configured])}
        self.settings.gpu.strata_base_url = "http://example.test:47831/v1"

        async def acquire(*args, **kwargs):
            self.runner.resource_manager._loaded_strata_model = "iq3_s"
            self.runner.resource_manager._loaded_instance_id = "iq3_s:2"

        self.runner.resource_manager.acquire_gpu.side_effect = acquire
        result = await self.runner.run_pipelines()
        self.assertTrue(result.success)
        env = self.runner.script_runner.run.call_args.kwargs["env"]
        self.assertEqual(env["STRATA_BASE_URL"], "http://example.test:47831/v1")
        self.assertEqual(env["STRATA_MODEL"], "iq3_s")
        self.runner.resource_manager.acquire_gpu.assert_awaited_once_with(
            GpuTaskType.STRATA, strata_model="iq3_s"
        )

    def test_cli_rejects_misspellings_instead_of_reporting_success(self):
        for args in (["update", "-p", "typo"], ["update", "--skip", "typo"]):
            with (
                self.subTest(args=args),
                patch("incremental.cli.load_settings", return_value=self.settings),
            ):
                result = CliRunner().invoke(main, [*args, "--dry-run"])
                self.assertNotEqual(result.exit_code, 0)
                self.assertIn("Unknown", result.output)

    def test_cli_dry_run_does_not_open_persistent_database(self):
        with (
            patch("incremental.cli.load_settings", return_value=self.settings),
            patch(
                "incremental.cli.get_state_db", side_effect=AssertionError("persistent DB opened")
            ),
        ):
            result = CliRunner().invoke(main, ["update", "--dry-run"])
        self.assertEqual(result.exit_code, 0, result.output)
        self.assertIn("Would process", result.output)

    def test_cli_activity_preserves_complete_literal_lines_at_normal_brightness(self):
        messages = [
            "2026-10-05T134849-1_SG_2_IA.wav",
            "Original transcript (ru): Москва, станция готова. [red]",
            "Translated transcript (English): Moscow, the station is ready. [red]",
        ]

        async def run_pipelines(**kwargs):
            for message in messages:
                kwargs["on_progress"]("comm", "transcribe", message)
            return OrchestratorResult(True, 1, 1, 1, 0, 0.01)

        for command in ("run", "update"):
            with (
                self.subTest(command=command),
                patch("incremental.cli.load_settings", return_value=self.settings),
                patch.object(Orchestrator, "run_pipelines", side_effect=run_pipelines),
                patch(
                    "incremental.cli.console",
                    Console(file=io.StringIO(), width=40, force_terminal=True, color_system="standard", no_color=False),
                ) as console,
            ):
                result = CliRunner().invoke(main, [command, "--dry-run"])
                self.assertEqual(result.exit_code, 0, result.exception)
                lines = Text.from_ansi(console.file.getvalue()).split("\n")
                for message in messages:
                    matching = [line for line in lines if line.plain.endswith(message)]
                    self.assertTrue(matching, lines)
                    line = matching[0]
                    for offset in (line.plain.index("comm"), line.plain.index("transcribe"), len(line) - len(message)):
                        self.assertFalse(line.get_style_at_offset(console, offset).dim, line)

    def test_unsupported_stage_selection_cannot_silently_run_a_pipeline(self):
        with patch("incremental.cli.load_settings", return_value=self.settings):
            result = CliRunner().invoke(main, ["run", "-p", "source", "-s", "build", "--dry-run"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("--stage is not supported", result.output)


class ResourceManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_releasing_strata_stage_sends_model_unload(self):
        manager = ResourceManager()
        manager._current_task = GpuTaskType.STRATA
        manager._loaded_strata_model = "iq3_s"

        with patch.object(manager, "_unload_strata_model", new_callable=AsyncMock) as unload:
            await manager.release_gpu()

        unload.assert_awaited_once_with()
        self.assertEqual(manager.current_task, GpuTaskType.NONE)


class ScriptRunnerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.script = Path(self.tmp.name) / "fixture.py"
        self.runner = ScriptRunner()

    async def test_real_subprocess_captures_output_and_exit_code(self):
        self.script.write_text(
            "import sys\nprint('ok')\nprint('problem', file=sys.stderr)\nsys.exit(7)\n"
        )
        result = await self.runner.run(self.script)
        self.assertFalse(result.success)
        self.assertEqual(result.exit_code, 7)
        self.assertEqual(result.stdout, "ok")
        self.assertEqual(result.stderr, "problem")
        self.assertIn("code 7", result.error_message)
        self.assertIn("stderr:\nproblem", result.error_message)
        self.assertIn("Recent stdout:\nok", result.error_message)

    async def test_real_subprocess_timeout(self):
        self.script.write_text("import time\ntime.sleep(60)\n")
        result = await self.runner.run(self.script, timeout_minutes=0.005)
        self.assertFalse(result.success)
        self.assertTrue(result.timed_out)

    async def test_cancellation_terminates_the_actual_subprocess(self):
        self.script.write_text("import time\nprint('ready', flush=True)\ntime.sleep(60)\n")
        ready = asyncio.Event()
        original = asyncio.create_subprocess_exec
        processes = []

        async def capture_process(*args, **kwargs):
            process = await original(*args, **kwargs)
            processes.append(process)
            return process

        with patch("asyncio.create_subprocess_exec", side_effect=capture_process):
            task = asyncio.create_task(
                self.runner.run(self.script, on_output=lambda *_: ready.set())
            )
            try:
                await asyncio.wait_for(ready.wait(), timeout=5)
            finally:
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
        self.assertIsNotNone(processes[0].returncode)


if __name__ == "__main__":
    unittest.main()
