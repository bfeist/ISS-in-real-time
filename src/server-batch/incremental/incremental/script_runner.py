"""
Script runner module for executing Python scripts as async subprocesses.

This module provides the ScriptRunner class for running batch scripts with:
- Async subprocess execution with streaming output
- Timeout handling with graceful shutdown
- JSON output parsing
- Environment variable injection
- Progress callbacks for dashboard integration
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

# Type alias for output callback
OutputCallback = Callable[[str, str], None]  # (stream: "stdout"|"stderr", line: str)


@dataclass
class ScriptResult:
    """Result of a script execution.

    Attributes:
        success: Whether the script completed successfully (exit code 0).
        exit_code: The process exit code (-1 if not available).
        stdout: Complete captured stdout as a string.
        stderr: Complete captured stderr as a string.
        duration_seconds: How long the script took to run.
        json_output: Parsed JSON output if the script produced JSON on stdout.
        error_message: Human-readable error message if something went wrong.
        timed_out: Whether the script was killed due to timeout.
    """

    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float
    json_output: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    timed_out: bool = False


class ScriptRunner:
    """Runs Python scripts as async subprocesses with streaming output.

    This class handles:
    - Async subprocess execution using asyncio
    - Streaming stdout/stderr with callbacks
    - Timeout handling with graceful SIGTERM then SIGKILL
    - JSON output parsing from script stdout
    - Environment variable injection
    - Cross-platform signal handling (Windows/Unix)

    Example:
        runner = ScriptRunner()
        result = await runner.run(
            script_path=Path("my_script.py"),
            args=["--verbose"],
            timeout_minutes=30,
            cwd=Path("/path/to/workdir"),
        )
        if result.success:
            print("Script completed successfully")
    """

    def __init__(
        self,
        python_executable: Optional[str] = None,
        default_timeout_minutes: float = 60,
    ):
        """Initialize the script runner.

        Args:
            python_executable: Path to Python interpreter. Defaults to sys.executable.
            default_timeout_minutes: Default timeout if not specified per-run.
        """
        self.python_executable = python_executable or sys.executable
        self.default_timeout_minutes = default_timeout_minutes
        self._is_windows = sys.platform == "win32"

    async def run(
        self,
        script_path: Path,
        args: Optional[list[str]] = None,
        timeout_minutes: Optional[float] = None,
        env: Optional[dict[str, str]] = None,
        cwd: Optional[Path] = None,
        on_output: Optional[OutputCallback] = None,
    ) -> ScriptResult:
        """Run a Python script as an async subprocess.

        Args:
            script_path: Path to the Python script to run.
            args: Command-line arguments to pass to the script.
            timeout_minutes: Maximum time to allow the script to run.
                If None, uses default_timeout_minutes.
            env: Additional environment variables to set.
                These are merged with the current environment.
            cwd: Working directory for the subprocess.
                If None, uses the current working directory.
            on_output: Callback function called for each line of output.
                Signature: (stream: "stdout"|"stderr", line: str) -> None
                Useful for real-time progress display.

        Returns:
            ScriptResult with execution details and captured output.
        """
        args = args or []
        timeout_minutes = timeout_minutes or self.default_timeout_minutes
        timeout_seconds = timeout_minutes * 60

        # Build the command
        cmd = [self.python_executable, str(script_path)] + args

        # Build environment
        process_env = os.environ.copy()
        if env:
            process_env.update(env)

        # Track timing
        start_time = time.monotonic()

        # Accumulators for output
        stdout_lines: list[str] = []
        stderr_lines: list[str] = []

        process: Optional[asyncio.subprocess.Process] = None
        timed_out = False
        error_message: Optional[str] = None

        try:
            # Create the subprocess
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(cwd) if cwd else None,
                env=process_env,
            )

            # Stream output with timeout
            try:
                await asyncio.wait_for(
                    self._stream_output(
                        process,
                        stdout_lines,
                        stderr_lines,
                        on_output,
                    ),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                timed_out = True
                error_message = f"Script timed out after {timeout_minutes} minutes"
                await self._terminate_process(process)

            # Get exit code
            exit_code = process.returncode if process.returncode is not None else -1

        except FileNotFoundError:
            error_message = f"Script not found: {script_path}"
            exit_code = -1
        except PermissionError:
            error_message = f"Permission denied: {script_path}"
            exit_code = -1
        except OSError as e:
            error_message = f"OS error running script: {e}"
            exit_code = -1
        except Exception as e:
            error_message = f"Unexpected error: {type(e).__name__}: {e}"
            exit_code = -1

        # Calculate duration
        duration_seconds = time.monotonic() - start_time

        # Join output
        stdout = "\n".join(stdout_lines)
        stderr = "\n".join(stderr_lines)

        # Try to parse JSON output from stdout
        json_output = self._parse_json_output(stdout_lines)

        # Determine success
        success = exit_code == 0 and not timed_out

        return ScriptResult(
            success=success,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr,
            duration_seconds=duration_seconds,
            json_output=json_output,
            error_message=error_message,
            timed_out=timed_out,
        )

    async def _stream_output(
        self,
        process: asyncio.subprocess.Process,
        stdout_lines: list[str],
        stderr_lines: list[str],
        on_output: Optional[OutputCallback],
    ) -> None:
        """Stream stdout and stderr from a process.

        Reads both streams concurrently and calls the output callback
        for each line as it arrives.
        """

        async def read_stream(
            stream: Optional[asyncio.StreamReader],
            stream_name: str,
            lines: list[str],
        ) -> None:
            if stream is None:
                return

            while True:
                try:
                    line_bytes = await stream.readline()
                    if not line_bytes:
                        break

                    # Decode with error handling for malformed output
                    line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
                    lines.append(line)

                    if on_output:
                        try:
                            on_output(stream_name, line)
                        except Exception:
                            # Don't let callback errors break streaming
                            pass
                except Exception:
                    break

        # Read both streams concurrently
        await asyncio.gather(
            read_stream(process.stdout, "stdout", stdout_lines),
            read_stream(process.stderr, "stderr", stderr_lines),
        )

        # Wait for process to complete
        await process.wait()

    async def _terminate_process(
        self,
        process: asyncio.subprocess.Process,
        graceful_timeout: float = 5.0,
    ) -> None:
        """Terminate a process gracefully, then forcefully if needed.

        On Unix: Sends SIGTERM, waits, then SIGKILL if still running.
        On Windows: Uses terminate() then kill() since signals work differently.

        Args:
            process: The process to terminate.
            graceful_timeout: Seconds to wait after SIGTERM before SIGKILL.
        """
        if process.returncode is not None:
            return  # Already terminated

        try:
            if self._is_windows:
                # Windows: terminate() sends CTRL_BREAK_EVENT or TerminateProcess
                process.terminate()
            else:
                # Unix: Send SIGTERM for graceful shutdown
                process.send_signal(signal.SIGTERM)

            # Wait for graceful termination
            try:
                await asyncio.wait_for(process.wait(), timeout=graceful_timeout)
                return
            except asyncio.TimeoutError:
                pass

            # Force kill if still running
            if process.returncode is None:
                process.kill()
                try:
                    await asyncio.wait_for(process.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass  # Process may be stuck, nothing more we can do

        except ProcessLookupError:
            pass  # Process already exited
        except OSError:
            pass  # May fail if process is in weird state

    def _parse_json_output(self, stdout_lines: list[str]) -> Optional[dict[str, Any]]:
        """Parse JSON output from script stdout.

        Scripts can output JSON in two ways:
        1. Last non-empty line is a JSON object
        2. Line starting with "JSON_OUTPUT:" followed by JSON

        Args:
            stdout_lines: List of stdout lines from the script.

        Returns:
            Parsed JSON dict if found and valid, None otherwise.
        """
        if not stdout_lines:
            return None

        # First, look for explicit JSON_OUTPUT marker
        for line in reversed(stdout_lines):
            if line.startswith("JSON_OUTPUT:"):
                json_str = line[len("JSON_OUTPUT:") :].strip()
                try:
                    result = json.loads(json_str)
                    if isinstance(result, dict):
                        return result
                except json.JSONDecodeError:
                    pass
                break

        # Fall back to checking if last non-empty line is JSON
        for line in reversed(stdout_lines):
            line = line.strip()
            if not line:
                continue

            # Check if it looks like a JSON object
            if line.startswith("{") and line.endswith("}"):
                try:
                    result = json.loads(line)
                    if isinstance(result, dict):
                        return result
                except json.JSONDecodeError:
                    pass
            break  # Only check the last non-empty line

        return None


class ScriptRunnerPool:
    """Run multiple scripts with controlled concurrency.

    Useful for running independent scripts in parallel while
    limiting resource usage.

    Example:
        pool = ScriptRunnerPool(max_concurrent=3)
        results = await pool.run_many([
            (Path("script1.py"), ["--arg1"]),
            (Path("script2.py"), ["--arg2"]),
            (Path("script3.py"), ["--arg3"]),
        ])
    """

    def __init__(
        self,
        runner: Optional[ScriptRunner] = None,
        max_concurrent: int = 3,
    ):
        """Initialize the pool.

        Args:
            runner: ScriptRunner instance to use. Creates one if not provided.
            max_concurrent: Maximum number of scripts to run simultaneously.
        """
        self.runner = runner or ScriptRunner()
        self.max_concurrent = max_concurrent
        self._semaphore: Optional[asyncio.Semaphore] = None

    async def run_many(
        self,
        scripts: list[tuple[Path, list[str]]],
        timeout_minutes: Optional[float] = None,
        env: Optional[dict[str, str]] = None,
        cwd: Optional[Path] = None,
    ) -> list[ScriptResult]:
        """Run multiple scripts with controlled concurrency.

        Args:
            scripts: List of (script_path, args) tuples.
            timeout_minutes: Timeout for each individual script.
            env: Environment variables for all scripts.
            cwd: Working directory for all scripts.

        Returns:
            List of ScriptResult in the same order as input scripts.
        """
        self._semaphore = asyncio.Semaphore(self.max_concurrent)

        async def run_with_semaphore(
            script_path: Path,
            args: list[str],
        ) -> ScriptResult:
            async with self._semaphore:  # type: ignore
                return await self.runner.run(
                    script_path=script_path,
                    args=args,
                    timeout_minutes=timeout_minutes,
                    env=env,
                    cwd=cwd,
                )

        tasks = [run_with_semaphore(path, args) for path, args in scripts]
        return await asyncio.gather(*tasks)
