"""Coordinate Strata inference and WhisperX access to GPU memory."""

import asyncio
import logging
from time import monotonic
from typing import Optional
from urllib.parse import quote

import httpx

from .models import GpuTaskType, GpuStatus

logger = logging.getLogger(__name__)


class ResourceManager:
    """Load Strata models for LLM stages and free their VRAM for WhisperX."""

    def __init__(self, strata_base_url: str = "http://127.0.0.1:47831/v1"):
        self.strata_host = strata_base_url.rstrip("/").removesuffix("/v1")
        self._loaded_instance_id: Optional[str] = None
        self._lock = asyncio.Lock()
        self._current_task = GpuTaskType.NONE
        self._loaded_strata_model: Optional[str] = None
        self._last_error: Optional[str] = None

    @property
    def current_task(self) -> GpuTaskType:
        return self._current_task

    @property
    def loaded_strata_model(self) -> Optional[str]:
        return self._loaded_strata_model

    @property
    def loaded_instance_id(self) -> Optional[str]:
        return self._loaded_instance_id

    async def acquire_gpu(
        self, task_type: GpuTaskType, strata_model: Optional[str] = None
    ) -> None:
        if task_type == GpuTaskType.STRATA and not strata_model:
            raise ValueError("strata_model must be specified for STRATA task type")
        async with self._lock:
            self._last_error = None
            if task_type == GpuTaskType.WHISPERX:
                await self._unload_all_models()
            elif task_type == GpuTaskType.STRATA:
                await self._load_strata_model(strata_model)
            self._current_task = task_type
            logger.info("GPU acquired for %s", task_type.value)

    async def release_gpu(self) -> None:
        async with self._lock:
            try:
                if self._current_task == GpuTaskType.STRATA:
                    await self._unload_strata_model()
            finally:
                self._current_task = GpuTaskType.NONE

    async def _state(self, client) -> dict:
        response = await client.get(f"{self.strata_host}/api/native")
        response.raise_for_status()
        return response.json()

    async def _unload_instance(self, client, instance_id: str) -> None:
        response = await client.post(
            f"{self.strata_host}/api/native/instances/{quote(instance_id, safe='')}/unload",
            json={},
        )
        response.raise_for_status()
        if any(item["id"] == instance_id for item in response.json()["instances"]):
            raise RuntimeError(f"Strata instance {instance_id} is still loaded")
        if instance_id == self._loaded_instance_id:
            self._loaded_strata_model = None
            self._loaded_instance_id = None

    async def _load_strata_model(self, model: str) -> None:
        """Use Strata Control's asynchronous load API and wait for readiness."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                state = await self._state(client)
                ready = next((item for item in state["instances"]
                              if item["model"] == model and item["status"] == "ready"), None)
                for item in state["instances"]:
                    if ready is None or item["id"] != ready["id"]:
                        await self._unload_instance(client, item["id"])
                if ready is None:
                    response = await client.post(
                        f"{self.strata_host}/api/native/operations",
                        json={"kind": "load", "args": {"model": model}},
                    )
                    response.raise_for_status()
                    job = response.json()
                    deadline = monotonic() + 300
                    while job["state"] == "running":
                        if monotonic() >= deadline:
                            cancelled = await client.post(
                                f"{self.strata_host}/api/native/operations/{quote(job['id'], safe='')}/cancel",
                                json={},
                            )
                            cancelled.raise_for_status()
                            raise TimeoutError("Strata model loading timed out")
                        await asyncio.sleep(1)
                        state = await self._state(client)
                        job = next(item for item in state["jobs"] if item["id"] == job["id"])
                    if job["state"] != "done":
                        raise RuntimeError(job.get("error") or f"Strata load {job['state']}")
                    state = await self._state(client)
                    ready = next((item for item in state["instances"]
                                  if item["id"] == job["result"]["instanceId"]
                                  and item["model"] == model and item["status"] == "ready"), None)
                    if ready is None:
                        raise RuntimeError("Strata load finished without a ready model")
                self._loaded_instance_id = ready["id"]
                self._loaded_strata_model = model
        except Exception as exc:
            self._last_error = f"Failed to load Strata model {model}: {exc}"
            raise RuntimeError(self._last_error) from exc

    async def _unload_all_models(self) -> None:
        """Free Strata VRAM, including instances loaded from its UI."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                state = await self._state(client)
            except httpx.ConnectError:
                if self._loaded_instance_id or self._loaded_strata_model:
                    raise
                logger.info("Strata is offline; no tracked model to unload before WhisperX")
                return
            for item in state["instances"]:
                await self._unload_instance(client, item["id"])
            if (await self._state(client))["instances"]:
                raise RuntimeError("Strata still has loaded models; cannot start WhisperX")
        self._loaded_strata_model = None
        self._loaded_instance_id = None

    async def _unload_strata_model(self) -> None:
        if not self._loaded_instance_id:
            return
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                await self._unload_instance(client, self._loaded_instance_id)
        except Exception as exc:
            self._last_error = f"Failed to unload Strata model: {exc}"
            raise RuntimeError(self._last_error) from exc

    def get_status(self) -> GpuStatus:
        return GpuStatus(
            is_locked=self._current_task != GpuTaskType.NONE,
            current_task_type=self._current_task,
            strata_model_loaded=self._loaded_strata_model,
        )

    async def shutdown(self) -> None:
        async with self._lock:
            await self._unload_strata_model()
            self._current_task = GpuTaskType.NONE
