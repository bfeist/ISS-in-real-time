"""Strata GPU handoff tests; no real models are loaded or unloaded."""

import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx

from incremental.config import load_settings
from incremental.models import GpuTaskType
from incremental.resources import ResourceManager


def reply(data):
    response = Mock()
    response.json.return_value = data
    return response


def instance(model="iq3_s", instance_id="strata-instance", status="ready"):
    return {"id": instance_id, "model": model, "status": status}


class StrataResourceTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        client = AsyncMock()
        client.get.return_value = reply({"instances": [], "jobs": []})
        client.post.return_value = reply({"instances": []})
        return client

    async def test_async_load_waits_for_ready_instance_then_release_unloads_it(self):
        client = self.client()
        job = {"id": "job-id", "state": "running"}
        done = {**job, "state": "done", "result": {"instanceId": "strata-instance"}}
        client.post.side_effect = [reply(job), reply({"instances": []})]
        client.get.side_effect = [
            reply({"instances": [], "jobs": []}),
            reply({"instances": [instance()], "jobs": [done]}),
            reply({"instances": [instance()], "jobs": [done]}),
        ]
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory, patch("incremental.resources.asyncio.sleep", new_callable=AsyncMock):
            factory.return_value.__aenter__.return_value = client
            await manager.acquire_gpu(GpuTaskType.STRATA, "iq3_s")
            self.assertEqual(manager.loaded_instance_id, "strata-instance")
            self.assertEqual(manager.current_task, GpuTaskType.STRATA)
            load = client.post.call_args
            self.assertEqual(load.args[0], "http://127.0.0.1:47831/api/native/operations")
            self.assertEqual(load.kwargs["json"], {"kind": "load", "args": {"model": "iq3_s"}})
            await manager.release_gpu()
        self.assertTrue(client.post.call_args.args[0].endswith("/api/native/instances/strata-instance/unload"))
        self.assertIsNone(manager.loaded_strata_model)

    async def test_ready_model_is_reused_and_other_instances_are_unloaded(self):
        client = self.client()
        client.get.return_value = reply({"instances": [instance(), instance("other", "other-id")]})
        client.post.return_value = reply({"instances": [instance()]})
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            await manager.acquire_gpu(GpuTaskType.STRATA, "iq3_s")
        self.assertEqual(manager.loaded_instance_id, "strata-instance")
        self.assertEqual(client.post.await_count, 1)
        self.assertTrue(client.post.call_args.args[0].endswith("/instances/other-id/unload"))

    async def test_photos_and_corpus_share_one_load_before_whisperx_unloads(self):
        client = self.client()
        ready = {"instances": [instance()], "jobs": []}
        client.get.side_effect = [
            reply({"instances": [], "jobs": []}),
            reply(ready),  # Verify the photo classification load completed.
            reply(ready),  # Comm corpus reuses the same instance.
            reply(ready),  # WhisperX handoff finds the retained model.
            reply({"instances": [], "jobs": []}),
        ]
        client.post.side_effect = [
            reply({"state": "done", "result": {"instanceId": "strata-instance"}}),
            reply({"instances": []}),
        ]
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            for _ in range(2):
                await manager.acquire_gpu(GpuTaskType.STRATA, "iq3_s")
                await manager.release_gpu(keep_model=True)
                self.assertEqual(manager.current_task, GpuTaskType.NONE)
                self.assertEqual(manager.loaded_instance_id, "strata-instance")
                self.assertFalse(manager.get_status().is_locked)
            await manager.acquire_gpu(GpuTaskType.WHISPERX)
            self.assertIsNone(manager.loaded_strata_model)
            await manager.release_gpu()
            await manager.shutdown()
        self.assertEqual(client.post.await_count, 2)
        self.assertTrue(client.post.call_args_list[0].args[0].endswith("/operations"))
        self.assertTrue(client.post.call_args_list[1].args[0].endswith("/instances/strata-instance/unload"))

    async def test_shutdown_unloads_retained_model_without_whisperx(self):
        client = self.client()
        client.get.return_value = reply({"instances": [instance()]})
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            await manager.acquire_gpu(GpuTaskType.STRATA, "iq3_s")
            await manager.release_gpu(keep_model=True)
            client.post.assert_not_awaited()
            await manager.shutdown()
        self.assertIsNone(manager.loaded_instance_id)
        self.assertIsNone(manager.loaded_strata_model)
        client.post.assert_awaited_once()

    async def test_whisperx_unloads_external_instances_before_acquisition(self):
        client = self.client()
        client.get.side_effect = [
            reply({"instances": [instance(), instance("other", "other-id")]}),
            reply({"instances": []}),
        ]
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            await manager.acquire_gpu(GpuTaskType.WHISPERX)
        self.assertEqual(client.post.await_count, 2)
        self.assertEqual(manager.current_task, GpuTaskType.WHISPERX)

    async def test_failed_load_does_not_claim_gpu_was_acquired(self):
        for failure in (
            httpx.ReadTimeout("loading timed out"),
            reply({"state": "error", "error": "not installed"}),
            reply({"state": "done", "result": {"instanceId": "missing-instance"}}),
        ):
            client = self.client()
            client.post.side_effect = failure if isinstance(failure, Exception) else None
            client.post.return_value = failure
            manager = ResourceManager()
            with self.subTest(failure=failure), patch("httpx.AsyncClient") as factory:
                factory.return_value.__aenter__.return_value = client
                with self.assertRaises(RuntimeError):
                    await manager.acquire_gpu(GpuTaskType.STRATA, "iq3_s")
            self.assertEqual(manager.current_task, GpuTaskType.NONE)
            self.assertIsNone(manager.loaded_instance_id)

    async def test_load_timeout_cancels_operation(self):
        client = self.client()
        client.post.return_value = reply({"id": "job-id", "state": "running"})
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory, patch("incremental.resources.monotonic", side_effect=[0, 301]):
            factory.return_value.__aenter__.return_value = client
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                await manager.acquire_gpu(GpuTaskType.STRATA, "iq3_s")
        self.assertTrue(client.post.call_args.args[0].endswith("/operations/job-id/cancel"))
        self.assertEqual(manager.current_task, GpuTaskType.NONE)

    async def test_unload_failure_retains_instance_and_blocks_whisperx(self):
        client = self.client()
        manager = ResourceManager()
        manager._loaded_strata_model = "iq3_s"
        manager._loaded_instance_id = "strata-instance"
        manager._current_task = GpuTaskType.STRATA
        client.post.side_effect = httpx.ConnectError("unavailable")
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            with self.assertRaises(RuntimeError):
                await manager.release_gpu()
            self.assertEqual(manager.loaded_instance_id, "strata-instance")
            client.get.return_value = reply({"instances": [instance()]})
            with self.assertRaises(httpx.ConnectError):
                await manager.acquire_gpu(GpuTaskType.WHISPERX)
        self.assertNotEqual(manager.current_task, GpuTaskType.WHISPERX)

    async def test_successful_http_response_must_confirm_unload(self):
        client = self.client()
        client.get.return_value = reply({"instances": [instance()]})
        client.post.return_value = reply({"instances": [instance()]})
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            with self.assertRaisesRegex(RuntimeError, "still loaded"):
                await ResourceManager().acquire_gpu(GpuTaskType.WHISPERX)

    def test_all_real_llm_stages_use_strata_and_same_model(self):
        settings = load_settings()
        self.assertEqual(settings.gpu.strata_base_url, "http://127.0.0.1:47831/v1")
        self.assertEqual(settings.gpu.strata_default_model, "iq3_s")
        stages = [s for p in settings.pipelines.values() for s in p.stages
                  if s.gpu_task_type == GpuTaskType.STRATA]
        self.assertEqual({s.id for s in stages}, {"corpus", "ai_classify"})
        self.assertTrue(all(s.strata_model == "iq3_s" for s in stages))
        corpus = next(s for s in stages if s.id == "corpus")
        self.assertEqual(corpus.work_check_args, ["--check-work"])


if __name__ == "__main__":
    unittest.main()
