"""Offline regression tests: temporary files, in-memory SQLite and fake scripts.

Run from incremental/: python -m unittest discover -s tests -v
"""

import asyncio
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, patch

from click.testing import CliRunner

from incremental.cli import main
from incremental.config import PathsConfig, Settings, load_pipelines
from incremental.models import GpuTaskType, PipelineConfig, StageConfig, Status
from incremental.orchestrator import Orchestrator
from incremental.planning import build_execution_plan
from incremental.resources import ResourceManager
from incremental.script_runner import ScriptResult, ScriptRunner
from incremental.state import StateDatabase, ZipFileTracker


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
        self.runner.zip_tracker.processed_file.write_text("09-01-24.zip\n")
        self.runner.zip_tracker.skip_file.write_text("09-03-24.zip\n")
        comm = pipeline("comm", [stage("corpus"), stage("transcribe")])
        corpus = await self.runner._discover_work_items(comm, comm.stages[0], None, None, False)
        transcribe = await self.runner._discover_work_items(comm, comm.stages[1], None, None, False)
        self.assertEqual(corpus[0].metadata["dates"], ["2024-09-02"])
        self.assertEqual(transcribe[0].metadata["dates"], ["2024-09-01", "2024-09-02"])

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

    async def test_cancellation_closes_run_and_releases_gpu(self):
        self.settings.pipelines["source"].stages[0].requires_gpu = True
        self.runner.script_runner.run.side_effect = asyncio.CancelledError
        with self.assertRaises(asyncio.CancelledError):
            await self.runner.run_pipelines()
        self.runner.resource_manager.release_gpu.assert_awaited_once()
        self.assertEqual(self.db.get_recent_runs()[0].status, "cancelled")
        self.assertEqual(self.db.get_active_runs(), [])
        self.assertIsNone(self.runner._current_pipeline)

    async def test_shutdown_is_not_success(self):
        self.runner._shutdown = True
        self.assertFalse((await self.runner.run_pipelines()).success)
        self.runner.script_runner.run.assert_not_awaited()

    async def test_gpu_configuration_is_authoritative_and_status_uses_model_fields(self):
        configured = stage("transcribe_name_but_lmstudio", gpu_task_type=GpuTaskType.LMSTUDIO)
        self.assertEqual(self.runner._get_gpu_task_type(configured), GpuTaskType.LMSTUDIO)
        status = await self.runner.get_status()
        self.assertEqual(status["resource_status"].current_task_type, GpuTaskType.NONE)

    async def test_lmstudio_instance_and_host_are_passed_to_stage_process(self):
        configured = stage("classify", requires_gpu=True,
                           gpu_task_type=GpuTaskType.LMSTUDIO,
                           lmstudio_model="qwen3.8-27b")
        self.settings.pipelines = {"photos": pipeline("photos", [configured])}
        self.settings.gpu.lmstudio_host = "http://example.test:1234"

        async def acquire(*args, **kwargs):
            self.runner.resource_manager._loaded_lmstudio_model = "qwen3.8-27b"
            self.runner.resource_manager._loaded_instance_id = "qwen3.8-27b:2"

        self.runner.resource_manager.acquire_gpu.side_effect = acquire
        result = await self.runner.run_pipelines()
        self.assertTrue(result.success)
        env = self.runner.script_runner.run.call_args.kwargs["env"]
        self.assertEqual(env["LMSTUDIO_HOST"], "http://example.test:1234")
        self.assertEqual(env["LMSTUDIO_MODEL"], "qwen3.8-27b:2")
        self.runner.resource_manager.acquire_gpu.assert_awaited_once_with(
            GpuTaskType.LMSTUDIO, lmstudio_model="qwen3.8-27b"
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

    def test_unsupported_stage_selection_cannot_silently_run_a_pipeline(self):
        with patch("incremental.cli.load_settings", return_value=self.settings):
            result = CliRunner().invoke(main, ["run", "-p", "source", "-s", "build", "--dry-run"])
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("--stage is not supported", result.output)


class ResourceManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_releasing_lmstudio_stage_sends_model_unload(self):
        manager = ResourceManager()
        manager._current_task = GpuTaskType.LMSTUDIO
        manager._loaded_lmstudio_model = "gemma-4-12b-it-qat"

        with patch.object(manager, "_unload_lmstudio_model", new_callable=AsyncMock) as unload:
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
