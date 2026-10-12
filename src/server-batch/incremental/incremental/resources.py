"""
GPU Resource Management Module.

This module manages GPU resources, specifically coordinating between
WhisperX (transcription) and LM Studio (AI inference) to ensure exclusive
access to GPU memory.
"""

import asyncio
import logging
from typing import Optional

from .models import GpuTaskType, GpuStatus

logger = logging.getLogger(__name__)


class ResourceManager:
    """
    Manages exclusive access to GPU between different task types.

    WhisperX requires full VRAM, so any loaded LM Studio model must be
    unloaded before WhisperX tasks can run. This class coordinates
    the loading/unloading of models and provides async-safe access
    to GPU resources.

    Attributes:
        lmstudio_host: The LM Studio native API host URL.
        current_task: The currently active GPU task type.
        loaded_lmstudio_model: The name of the currently loaded LM Studio model.
    """

    def __init__(self, lmstudio_host: str = "http://localhost:1234", context_length: int = 16384):
        """
        Initialize the ResourceManager.

        Args:
            lmstudio_host: The LM Studio API host URL. Defaults to http://localhost:1234.
        """
        self.lmstudio_host = lmstudio_host.rstrip("/").removesuffix("/v1")
        self.context_length = context_length
        self._loaded_instance_id: Optional[str] = None
        self._lock = asyncio.Lock()
        self._current_task: GpuTaskType = GpuTaskType.NONE
        self._loaded_lmstudio_model: Optional[str] = None
        self._last_error: Optional[str] = None

    @property
    def current_task(self) -> GpuTaskType:
        """Get the currently active GPU task type."""
        return self._current_task

    @property
    def loaded_lmstudio_model(self) -> Optional[str]:
        """Get the name of the currently loaded LM Studio model."""
        return self._loaded_lmstudio_model

    @property
    def loaded_instance_id(self) -> Optional[str]:
        """The API identifier assigned by LM Studio to the loaded model."""
        return self._loaded_instance_id

    async def acquire_gpu(
        self, task_type: GpuTaskType, lmstudio_model: Optional[str] = None
    ) -> None:
        """
        Acquire exclusive GPU access for a specific task type.

        This method ensures exclusive access to GPU resources by:
        - Unloading any LM Studio model if acquiring for WhisperX
        - Loading the specified LM Studio model if acquiring for LM Studio tasks

        Args:
            task_type: The type of GPU task to acquire for.
            lmstudio_model: The LM Studio model to load (required for LMSTUDIO task type).

        Raises:
            ValueError: If task_type is LMSTUDIO but no model is specified.
        """
        if task_type == GpuTaskType.LMSTUDIO and not lmstudio_model:
            raise ValueError("lmstudio_model must be specified for LMSTUDIO task type")

        async with self._lock:
            logger.info(f"Acquiring GPU for {task_type.value}")
            self._last_error = None

            if task_type == GpuTaskType.WHISPERX:
                # Also unload models loaded through the UI or by standalone scripts.
                await self._unload_all_models()
                self._current_task = GpuTaskType.WHISPERX

            elif task_type == GpuTaskType.LMSTUDIO:
                # Load the specified LM Studio model if not already loaded
                if self._loaded_lmstudio_model != lmstudio_model:
                    if self._loaded_lmstudio_model:
                        logger.info(
                            f"Switching LM Studio model from '{self._loaded_lmstudio_model}' to '{lmstudio_model}'"
                        )
                        await self._unload_lmstudio_model()
                    await self._load_lmstudio_model(lmstudio_model)
                else:
                    logger.debug(f"LM Studio model '{lmstudio_model}' already loaded")
                self._current_task = GpuTaskType.LMSTUDIO

            elif task_type == GpuTaskType.NONE:
                self._current_task = GpuTaskType.NONE

            logger.info(f"GPU acquired for {task_type.value}")

    async def release_gpu(self) -> None:
        """
        Release GPU access and unload a model owned by an LM Studio stage.

        LM Studio keeps models resident after a request by default. Stage
        boundaries are resource boundaries, so an LM Studio stage explicitly
        unloads its model instance before releasing the GPU for the next stage.
        """
        async with self._lock:
            logger.info(f"Releasing GPU from {self._current_task.value}")
            try:
                if (
                    self._current_task == GpuTaskType.LMSTUDIO
                    and self._loaded_lmstudio_model
                ):
                    await self._unload_lmstudio_model()
            finally:
                self._current_task = GpuTaskType.NONE
            logger.debug("GPU released")

    async def _load_lmstudio_model(self, model: str) -> None:
        """Load using LM Studio's native API; fail the stage if loading fails."""
        import httpx

        try:
            # Only one LLM may occupy VRAM during a pipeline GPU stage.
            await self._unload_all_models()
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(
                    f"{self.lmstudio_host}/api/v1/models/load",
                    json={
                        "model": model,
                        "context_length": self.context_length,
                        "flash_attention": True,
                    },
                )
                response.raise_for_status()
                self._loaded_instance_id = response.json()["instance_id"]
                self._loaded_lmstudio_model = model
                logger.info(f"Loaded LM Studio model: {model}")
        except Exception as exc:
            self._last_error = f"Failed to load LM Studio model {model}: {exc}"
            raise RuntimeError(self._last_error) from exc

    async def _unload_all_models(self) -> None:
        """Free VRAM for WhisperX or another LLM, including external instances."""
        import httpx

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{self.lmstudio_host}/api/v1/models")
            response.raise_for_status()
            for model in response.json()["models"]:
                for instance in model.get("loaded_instances", []):
                    result = await client.post(
                        f"{self.lmstudio_host}/api/v1/models/unload",
                        json={"instance_id": instance["id"]},
                    )
                    result.raise_for_status()
        self._loaded_lmstudio_model = None
        self._loaded_instance_id = None

    async def _unload_lmstudio_model(self) -> None:
        """Unload the owned instance and retain ownership if unloading fails."""
        import httpx

        if not self._loaded_instance_id:
            return
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.lmstudio_host}/api/v1/models/unload",
                    json={"instance_id": self._loaded_instance_id},
                )
                response.raise_for_status()
            self._loaded_lmstudio_model = None
            self._loaded_instance_id = None
        except Exception as exc:
            self._last_error = f"Failed to unload LM Studio model: {exc}"
            raise RuntimeError(self._last_error) from exc

    def get_status(self) -> GpuStatus:
        """
        Get the current GPU resource status.

        Returns:
            GpuStatus: The current status of GPU resources.
        """
        return GpuStatus(
            is_locked=self._current_task != GpuTaskType.NONE,
            current_task_type=self._current_task,
            lmstudio_model_loaded=self._loaded_lmstudio_model,
        )

    async def shutdown(self) -> None:
        """
        Shutdown the resource manager and clean up resources.

        Unloads any loaded LM Studio model and releases GPU resources.
        """
        logger.info("Shutting down ResourceManager")
        async with self._lock:
            if self._loaded_lmstudio_model:
                await self._unload_lmstudio_model()
            self._current_task = GpuTaskType.NONE
        logger.info("ResourceManager shutdown complete")
