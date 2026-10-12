"""GPU handoff tests using HTTP mocks; no models are loaded."""

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


class LMStudioResourceTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        client = AsyncMock()
        client.get.return_value = reply({"models": []})
        client.post.return_value = reply({"instance_id": "gemma-instance"})
        return client

    async def test_load_records_actual_instance_then_release_unloads_it(self):
        client = self.client()
        manager = ResourceManager(context_length=8192)
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            await manager.acquire_gpu(GpuTaskType.LMSTUDIO, "gemma-4-12b-it-qat")
            self.assertEqual(manager.loaded_instance_id, "gemma-instance")
            self.assertEqual(manager.current_task, GpuTaskType.LMSTUDIO)
            load = client.post.call_args
            self.assertTrue(load.args[0].endswith("/api/v1/models/load"))
            self.assertEqual(load.kwargs["json"]["context_length"], 8192)
            await manager.release_gpu()
        self.assertTrue(client.post.call_args.args[0].endswith("/api/v1/models/unload"))
        self.assertEqual(client.post.call_args.kwargs["json"], {"instance_id": "gemma-instance"})
        self.assertIsNone(manager.loaded_lmstudio_model)

    async def test_whisperx_unloads_external_instances_before_acquisition(self):
        client = self.client()
        client.get.return_value = reply({"models": [
            {"loaded_instances": [{"id": "user-model"}, {"id": "other-model"}]}
        ]})
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            await manager.acquire_gpu(GpuTaskType.WHISPERX)
        self.assertEqual(client.post.await_count, 2)
        self.assertEqual(manager.current_task, GpuTaskType.WHISPERX)

    async def test_load_timeout_does_not_claim_gpu_was_acquired(self):
        client = self.client()
        client.post.side_effect = httpx.ReadTimeout("loading timed out")
        manager = ResourceManager()
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            with self.assertRaises(RuntimeError):
                await manager.acquire_gpu(GpuTaskType.LMSTUDIO, "gemma-4-12b-it-qat")
        self.assertEqual(manager.current_task, GpuTaskType.NONE)
        self.assertIsNone(manager.loaded_instance_id)

    async def test_unload_failure_retains_instance_and_blocks_whisperx(self):
        client = self.client()
        manager = ResourceManager()
        manager._loaded_lmstudio_model = "gemma-4-12b-it-qat"
        manager._loaded_instance_id = "gemma-instance"
        manager._current_task = GpuTaskType.LMSTUDIO
        client.post.side_effect = httpx.ConnectError("unavailable")
        with patch("httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value = client
            with self.assertRaises(RuntimeError):
                await manager.release_gpu()
            self.assertEqual(manager.loaded_instance_id, "gemma-instance")
            client.get.return_value = reply({"models": [
                {"loaded_instances": [{"id": "gemma-instance"}]}
            ]})
            with self.assertRaises(httpx.ConnectError):
                await manager.acquire_gpu(GpuTaskType.WHISPERX)
        self.assertNotEqual(manager.current_task, GpuTaskType.WHISPERX)

    def test_real_pipeline_configuration_uses_existing_models(self):
        settings = load_settings()
        corpus = next(s for s in settings.pipelines["comm"].stages if s.id == "corpus")
        classify = next(s for s in settings.pipelines["photos_flickr"].stages if s.requires_gpu)
        self.assertEqual(corpus.gpu_task_type, GpuTaskType.LMSTUDIO)
        self.assertEqual(corpus.lmstudio_model, "gemma-4-12b-it-qat")
        self.assertEqual(classify.lmstudio_model, "qwen3.8-27b")


if __name__ == "__main__":
    unittest.main()
