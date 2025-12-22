"""
GPU Resource Management Module.

This module manages GPU resources, specifically coordinating between
WhisperX (transcription) and Ollama (AI inference) to ensure exclusive
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

    WhisperX requires full VRAM, so any loaded Ollama model must be
    unloaded before WhisperX tasks can run. This class coordinates
    the loading/unloading of models and provides async-safe access
    to GPU resources.

    Attributes:
        ollama_host: The Ollama API host URL (for future API use).
        current_task: The currently active GPU task type.
        loaded_ollama_model: The name of the currently loaded Ollama model.
    """

    def __init__(self, ollama_host: str = "http://localhost:11434"):
        """
        Initialize the ResourceManager.

        Args:
            ollama_host: The Ollama API host URL. Defaults to http://localhost:11434.
        """
        self.ollama_host = ollama_host
        self._lock = asyncio.Lock()
        self._current_task: GpuTaskType = GpuTaskType.NONE
        self._loaded_ollama_model: Optional[str] = None
        self._last_error: Optional[str] = None

    @property
    def current_task(self) -> GpuTaskType:
        """Get the currently active GPU task type."""
        return self._current_task

    @property
    def loaded_ollama_model(self) -> Optional[str]:
        """Get the name of the currently loaded Ollama model."""
        return self._loaded_ollama_model

    async def acquire_gpu(
        self, task_type: GpuTaskType, ollama_model: Optional[str] = None
    ) -> None:
        """
        Acquire exclusive GPU access for a specific task type.

        This method ensures exclusive access to GPU resources by:
        - Unloading any Ollama model if acquiring for WhisperX
        - Loading the specified Ollama model if acquiring for Ollama tasks

        Args:
            task_type: The type of GPU task to acquire for.
            ollama_model: The Ollama model to load (required for OLLAMA task type).

        Raises:
            ValueError: If task_type is OLLAMA but no model is specified.
        """
        if task_type == GpuTaskType.OLLAMA and not ollama_model:
            raise ValueError("ollama_model must be specified for OLLAMA task type")

        async with self._lock:
            logger.info(f"Acquiring GPU for {task_type.value}")
            self._last_error = None

            if task_type == GpuTaskType.WHISPERX:
                # WhisperX needs full VRAM - unload any Ollama model
                if self._loaded_ollama_model:
                    logger.info(
                        f"Unloading Ollama model '{self._loaded_ollama_model}' for WhisperX"
                    )
                    await self._unload_ollama_model()
                self._current_task = GpuTaskType.WHISPERX

            elif task_type == GpuTaskType.OLLAMA:
                # Load the specified Ollama model if not already loaded
                if self._loaded_ollama_model != ollama_model:
                    if self._loaded_ollama_model:
                        logger.info(
                            f"Switching Ollama model from '{self._loaded_ollama_model}' to '{ollama_model}'"
                        )
                        await self._unload_ollama_model()
                    await self._load_ollama_model(ollama_model)
                else:
                    logger.debug(f"Ollama model '{ollama_model}' already loaded")
                self._current_task = GpuTaskType.OLLAMA

            elif task_type == GpuTaskType.NONE:
                self._current_task = GpuTaskType.NONE

            logger.info(f"GPU acquired for {task_type.value}")

    async def release_gpu(self) -> None:
        """
        Release GPU access.

        This method releases the GPU lock but does NOT unload any Ollama model.
        The model stays loaded for potential reuse. Use acquire_gpu with a
        different task type to switch resources.
        """
        async with self._lock:
            logger.info(f"Releasing GPU from {self._current_task.value}")
            self._current_task = GpuTaskType.NONE
            logger.debug("GPU released")

    async def _load_ollama_model(self, model: str) -> None:
        """
        Load an Ollama model into GPU memory.

        Uses `ollama run MODEL --keepalive 0` to load the model.
        The --keepalive 0 flag means the model stays loaded indefinitely
        until explicitly stopped.

        Args:
            model: The name of the Ollama model to load.
        """
        logger.info(f"Loading Ollama model: {model}")

        try:
            # Use ollama run with keepalive 0 to load and keep model in memory
            # We send an empty input and close stdin to just trigger the load
            process = await asyncio.create_subprocess_exec(
                "ollama",
                "run",
                model,
                "--keepalive",
                "0",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Send empty input and close stdin to trigger load without waiting for interaction
            stdout, stderr = await process.communicate(input=b"")

            if process.returncode == 0:
                self._loaded_ollama_model = model
                logger.info(f"Successfully loaded Ollama model: {model}")
            else:
                error_msg = stderr.decode().strip() if stderr else "Unknown error"
                self._last_error = f"Failed to load model {model}: {error_msg}"
                logger.error(self._last_error)

        except FileNotFoundError:
            self._last_error = "Ollama executable not found. Is Ollama installed?"
            logger.error(self._last_error)
        except Exception as e:
            self._last_error = f"Error loading Ollama model {model}: {str(e)}"
            logger.error(self._last_error)

    async def _unload_ollama_model(self) -> None:
        """
        Unload the currently loaded Ollama model from GPU memory.

        Uses `ollama stop MODEL` to unload the model.
        """
        if not self._loaded_ollama_model:
            logger.debug("No Ollama model to unload")
            return

        model = self._loaded_ollama_model
        logger.info(f"Unloading Ollama model: {model}")

        try:
            process = await asyncio.create_subprocess_exec(
                "ollama",
                "stop",
                model,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                logger.info(f"Successfully unloaded Ollama model: {model}")
            else:
                error_msg = stderr.decode().strip() if stderr else "Unknown error"
                # Log but don't fail - model might already be unloaded
                logger.warning(f"Ollama stop returned non-zero: {error_msg}")

            # Clear the loaded model regardless of command result
            self._loaded_ollama_model = None

        except FileNotFoundError:
            self._last_error = "Ollama executable not found. Is Ollama installed?"
            logger.error(self._last_error)
            self._loaded_ollama_model = None
        except Exception as e:
            self._last_error = f"Error unloading Ollama model {model}: {str(e)}"
            logger.error(self._last_error)
            # Clear anyway to allow recovery
            self._loaded_ollama_model = None

    def get_status(self) -> GpuStatus:
        """
        Get the current GPU resource status.

        Returns:
            GpuStatus: The current status of GPU resources.
        """
        return GpuStatus(
            current_task=self._current_task,
            loaded_ollama_model=self._loaded_ollama_model,
            last_error=self._last_error,
        )

    async def shutdown(self) -> None:
        """
        Shutdown the resource manager and clean up resources.

        Unloads any loaded Ollama model and releases GPU resources.
        """
        logger.info("Shutting down ResourceManager")
        async with self._lock:
            if self._loaded_ollama_model:
                await self._unload_ollama_model()
            self._current_task = GpuTaskType.NONE
        logger.info("ResourceManager shutdown complete")
