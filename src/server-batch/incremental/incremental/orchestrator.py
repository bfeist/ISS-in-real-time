"""
Orchestrator module - Main orchestration for pipeline execution.

This module ties together script running, resource management, and state tracking
to execute pipelines in the correct order with proper dependency management.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Callable

from .config import Settings
from .models import (
    GpuTaskType,
    PipelineConfig,
    RunType,
    StageConfig,
    Status,
    TriggerSource,
    WorkItem,
)
from .resources import ResourceManager
from .script_runner import ScriptResult, ScriptRunner
from .state import StateDatabase, ZipFileTracker

logger = logging.getLogger(__name__)


def _resolve_script_path(script: str, server_batch_dir) -> str:
    """Resolve a script path relative to server_batch_dir."""
    from pathlib import Path

    full_path = Path(server_batch_dir) / script
    return str(full_path)


@dataclass
class OrchestratorResult:
    """Result of running pipelines through the orchestrator."""

    success: bool
    pipelines_run: int
    stages_run: int
    items_processed: int
    items_failed: int
    duration_seconds: float
    errors: list[str] = field(default_factory=list)


@dataclass
class StageResult:
    """Result of running a single stage."""

    success: bool
    items_processed: int
    items_failed: int
    duration_seconds: float
    errors: list[str] = field(default_factory=list)


class Orchestrator:
    """
    Main orchestrator that coordinates pipeline execution.

    Responsibilities:
    - Sort pipelines by dependency order
    - Execute stages in order within each pipeline
    - Manage GPU resources for GPU-requiring stages
    - Track state and progress
    - Handle graceful shutdown
    """

    def __init__(
        self,
        settings: Settings,
        state_db: StateDatabase,
        zip_tracker: ZipFileTracker,
    ):
        """
        Initialize the orchestrator.

        Args:
            settings: Application settings
            state_db: State database for tracking progress
            zip_tracker: ZIP file tracker for archive-based stages
        """
        self.settings = settings
        self.state_db = state_db
        self.zip_tracker = zip_tracker

        # Use server-batch's venv Python for running scripts
        import sys

        server_batch_venv_python = (
            settings.paths.server_batch_dir
            / ".venv"
            / ("Scripts" if sys.platform == "win32" else "bin")
            / ("python.exe" if sys.platform == "win32" else "python")
        )

        self.script_runner = ScriptRunner(
            python_executable=(
                str(server_batch_venv_python)
                if server_batch_venv_python.exists()
                else None
            )
        )
        self.resource_manager = ResourceManager(
            ollama_host=settings.gpu.ollama_host,
        )
        self._shutdown = False
        self._current_pipeline: str | None = None
        self._current_stage: str | None = None
        self._completed_stages: dict[str, set[str]] = (
            {}
        )  # pipeline_id -> set of completed stage_ids
        self._completed_pipelines: set[str] = (
            set()
        )  # pipelines that completed successfully
        self._skipped_pipelines: set[str] = (
            set()
        )  # pipelines explicitly skipped via --skip flag

    async def run_pipelines(
        self,
        pipeline_ids: list[str] | None = None,
        since: date | None = None,
        until: date | None = None,
        force: bool = False,
        dry_run: bool = False,
        on_progress: Callable[[str, str, str], None] | None = None,
    ) -> OrchestratorResult:
        """
        Run pipelines with the specified configuration.

        Args:
            pipeline_ids: List of pipeline IDs to run, or None for all enabled pipelines
            since: Start date filter for work items
            until: End date filter for work items
            force: If True, reprocess already-complete items
            dry_run: If True, simulate execution without making changes
            on_progress: Callback for progress updates (pipeline, stage, message)

        Returns:
            OrchestratorResult with execution summary
        """
        start_time = datetime.now()
        errors: list[str] = []
        pipelines_run = 0
        stages_run = 0
        total_items_processed = 0
        total_items_failed = 0

        try:
            # Get pipelines to run and track which are skipped
            all_enabled = self._get_pipelines_to_run(None)
            pipelines = self._get_pipelines_to_run(pipeline_ids)

            # Track which pipelines are being skipped (enabled but not in run list)
            if pipeline_ids is not None:
                running_ids = {p.id for p in pipelines}
                self._skipped_pipelines = {
                    p.id for p in all_enabled if p.id not in running_ids
                }
            else:
                self._skipped_pipelines = set()

            if not pipelines:
                logger.warning("No pipelines to run")
                return OrchestratorResult(
                    success=True,
                    pipelines_run=0,
                    stages_run=0,
                    items_processed=0,
                    items_failed=0,
                    duration_seconds=0.0,
                )

            # Sort by dependency order
            sorted_pipelines = self._topological_sort_pipelines(pipelines)
            logger.info(
                f"Running {len(sorted_pipelines)} pipelines: "
                f"{[p.id for p in sorted_pipelines]}"
            )

            # Execute each pipeline
            for pipeline in sorted_pipelines:
                if self._shutdown:
                    logger.info("Shutdown requested, stopping pipeline execution")
                    break

                self._current_pipeline = pipeline.id
                self._notify_progress(
                    on_progress, pipeline.id, "", f"Starting pipeline: {pipeline.name}"
                )

                # Check cross-pipeline dependencies
                if not self._check_pipeline_dependencies(pipeline):
                    msg = f"Pipeline {pipeline.id} dependencies not satisfied, skipping"
                    logger.warning(msg)
                    errors.append(msg)
                    continue

                # Run pipeline stages
                pipeline_success = True
                for stage in pipeline.stages:
                    if self._shutdown:
                        break

                    self._current_stage = stage.id
                    self._notify_progress(
                        on_progress,
                        pipeline.id,
                        stage.id,
                        f"Starting stage: {stage.name}",
                    )

                    # Check stage dependencies
                    if not self._check_stage_dependencies(pipeline, stage):
                        msg = f"Stage {stage.id} dependencies not satisfied, skipping"
                        logger.warning(msg)
                        continue

                    # Discover work items
                    work_items = await self._discover_work_items(
                        pipeline, stage, since, until, force
                    )

                    if not work_items:
                        logger.info(f"No work items for stage {stage.id}")
                        self._notify_progress(
                            on_progress,
                            pipeline.id,
                            stage.id,
                            "No items to process",
                        )
                        # Mark as completed so dependencies are satisfied
                        if pipeline.id not in self._completed_stages:
                            self._completed_stages[pipeline.id] = set()
                        self._completed_stages[pipeline.id].add(stage.id)
                        continue

                    logger.info(
                        f"Found {len(work_items)} work items for stage {stage.id}"
                    )

                    if dry_run:
                        logger.info(f"[DRY RUN] Would process {len(work_items)} items")
                        self._notify_progress(
                            on_progress,
                            pipeline.id,
                            stage.id,
                            f"[DRY RUN] Would process {len(work_items)} items",
                        )
                        # Track as "completed" for dependency checking in dry-run
                        if pipeline.id not in self._completed_stages:
                            self._completed_stages[pipeline.id] = set()
                        self._completed_stages[pipeline.id].add(stage.id)
                        continue

                    # Execute the stage
                    stage_result = await self._run_stage(
                        pipeline,
                        stage,
                        work_items,
                        force=force,
                        dry_run=dry_run,
                        on_progress=on_progress,
                    )

                    stages_run += 1
                    total_items_processed += stage_result.items_processed
                    total_items_failed += stage_result.items_failed
                    errors.extend(stage_result.errors)

                    # Track completed stage for dependency checking
                    if stage_result.success:
                        if pipeline.id not in self._completed_stages:
                            self._completed_stages[pipeline.id] = set()
                        self._completed_stages[pipeline.id].add(stage.id)

                    if not stage_result.success:
                        pipeline_success = False
                        # Check if stage has stop_on_error (default True for safety)
                        if getattr(stage, "stop_on_error", True):
                            logger.error(f"Stage {stage.id} failed, stopping pipeline")
                            break

                    self._notify_progress(
                        on_progress,
                        pipeline.id,
                        stage.id,
                        f"Completed: {stage_result.items_processed} processed, "
                        f"{stage_result.items_failed} failed",
                    )

                pipelines_run += 1
                self._current_pipeline = None
                self._current_stage = None

                if pipeline_success:
                    self._completed_pipelines.add(
                        pipeline.id
                    )  # Track for dependency checking
                    self._notify_progress(
                        on_progress, pipeline.id, "", "Pipeline completed successfully"
                    )
                else:
                    self._notify_progress(
                        on_progress, pipeline.id, "", "Pipeline completed with errors"
                    )

        except Exception as e:
            logger.exception(f"Orchestrator error: {e}")
            errors.append(str(e))

        duration = (datetime.now() - start_time).total_seconds()

        return OrchestratorResult(
            success=len(errors) == 0,
            pipelines_run=pipelines_run,
            stages_run=stages_run,
            items_processed=total_items_processed,
            items_failed=total_items_failed,
            duration_seconds=duration,
            errors=errors,
        )

    async def _run_stage(
        self,
        pipeline: PipelineConfig,
        stage: StageConfig,
        work_items: list[WorkItem],
        force: bool = False,
        dry_run: bool = False,
        on_progress: Callable[[str, str, str], None] | None = None,
    ) -> StageResult:
        """
        Execute a single stage with its work items.

        Args:
            pipeline: The pipeline containing this stage
            stage: The stage configuration
            work_items: Work items to process
            force: Whether to force reprocessing
            dry_run: Whether this is a dry run
            on_progress: Progress callback

        Returns:
            StageResult with execution summary
        """
        start_time = datetime.now()
        errors: list[str] = []
        items_processed = 0
        items_failed = 0
        gpu_acquired = False

        try:
            # Acquire GPU if needed
            if stage.requires_gpu:
                gpu_task_type = self._get_gpu_task_type(stage)
                logger.info(f"Acquiring GPU for stage {stage.id} ({gpu_task_type})")
                self._notify_progress(
                    on_progress, pipeline.id, stage.id, "Waiting for GPU..."
                )

                try:
                    await self.resource_manager.acquire_gpu(
                        gpu_task_type, ollama_model=stage.ollama_model
                    )
                    gpu_acquired = True
                    logger.info(f"GPU acquired for stage {stage.id}")
                except Exception as e:
                    msg = f"Failed to acquire GPU for stage {stage.id}: {e}"
                    logger.error(msg)
                    return StageResult(
                        success=False,
                        items_processed=0,
                        items_failed=len(work_items),
                        duration_seconds=0.0,
                        errors=[msg],
                    )

            # Process work items
            for i, work_item in enumerate(work_items):
                if self._shutdown:
                    logger.info("Shutdown requested, stopping stage execution")
                    break

                # Log activity
                self.state_db.log_activity(
                    level="INFO",
                    message=f"Processing {work_item.item_id}",
                    pipeline_id=pipeline.id,
                    stage_id=stage.id,
                )

                # Build command arguments
                args = self._expand_args_template(
                    stage.args_template,
                    work_item=work_item,
                    force=force,
                    dry_run=dry_run,
                )
                logger.info(f"Running {stage.script} with args: {args}")

                self._notify_progress(
                    on_progress,
                    pipeline.id,
                    stage.id,
                    f"Processing item {i + 1}/{len(work_items)}: {work_item.item_id}",
                )

                # Run the script
                try:
                    script_path = _resolve_script_path(
                        stage.script, self.settings.paths.server_batch_dir
                    )
                    # Set environment variables for scripts
                    # Ensure trailing slash for folder paths (scripts expect it)
                    web_assets = str(self.settings.paths.web_data_root)
                    if not web_assets.endswith(("/", "\\")):
                        web_assets += "/"
                    script_env = {
                        "WEB_ASSETS_FOLDER": web_assets,
                        "WEB_DATA_ROOT": web_assets,
                        "RAW_FOLDER": str(self.settings.paths.raw_folder),
                        "RAW_AUDIO_FOLDER": str(self.settings.paths.raw_audio_folder),
                        "PYTHONIOENCODING": "utf-8",  # Fix Unicode output issues
                    }
                    result = await self.script_runner.run(
                        script_path=script_path,
                        args=args,
                        timeout_minutes=stage.timeout_minutes,
                        env=script_env,
                    )

                    if result.success:
                        items_processed += 1

                        # Mark ZIP file as processed if applicable
                        zip_file = work_item.metadata.get("zip_file")
                        if zip_file:
                            self.zip_tracker.mark_processed(stage.id, zip_file)

                        logger.info(
                            f"Successfully processed {work_item.item_id} "
                            f"in {result.duration_seconds:.1f}s"
                        )
                    else:
                        items_failed += 1
                        # Try multiple sources for error info
                        error_msg = (
                            result.error_message
                            or result.stderr
                            or result.stdout
                            or f"Exit code {result.exit_code}"
                        )
                        errors.append(f"{work_item.item_id}: {error_msg[:200]}")

                        # Mark ZIP file as errored if applicable
                        zip_file = work_item.metadata.get("zip_file")
                        if zip_file:
                            self.zip_tracker.mark_error(stage.id, zip_file, error_msg)

                        logger.error(
                            f"Failed to process {work_item.item_id}: {error_msg}"
                        )

                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    items_failed += 1
                    error_msg = str(e)
                    errors.append(f"{work_item.item_id}: {error_msg}")

                    logger.exception(f"Exception processing {work_item.item_id}: {e}")

        finally:
            # Release GPU if acquired
            if gpu_acquired:
                logger.info(f"Releasing GPU for stage {stage.id}")
                await self.resource_manager.release_gpu()

        duration = (datetime.now() - start_time).total_seconds()

        return StageResult(
            success=items_failed == 0,
            items_processed=items_processed,
            items_failed=items_failed,
            duration_seconds=duration,
            errors=errors,
        )

    async def _discover_work_items(
        self,
        pipeline: PipelineConfig,
        stage: StageConfig,
        since: date | None,
        until: date | None,
        force: bool,
    ) -> list[WorkItem]:
        """
        Discover work items that need processing for a stage.

        For now, this creates a single work item per stage. The actual
        discovery logic depends on the stage type:
        - Batch stages: single work item
        - Incremental stages with dates: could split by date range
        - ZIP-based stages: one item per unprocessed ZIP

        Args:
            pipeline: The pipeline configuration
            stage: The stage configuration
            since: Start date filter
            until: End date filter
            force: Whether to include already-complete items

        Returns:
            List of work items to process
        """
        # For comm.download, always run - the script discovers new ZIPs from IA
        # The download script handles the discovery and only downloads what's missing
        if "download" in stage.id.lower() and "comm" in pipeline.id.lower():
            return [
                WorkItem(
                    item_type="zip_discovery",
                    item_id=f"{pipeline.id}:{stage.id}",
                    pipeline_id=pipeline.id,
                    stage_id=stage.id,
                    metadata={"description": "Check IA for new ZIP files"},
                )
            ]

        # For comm.corpus or comm.transcribe, discover dates from unprocessed zips
        if "comm" in pipeline.id.lower() and stage.id in (
            "corpus",
            "transcribe",
            "web",
        ):
            # For web stage, include recently processed zips to ensure we generate assets
            # even if transcription happened in a previous run
            include_processed = stage.id == "web"
            zip_dates = self._discover_dates_from_zips(
                include_processed=include_processed
            )
            if zip_dates:
                # Use date range from zips
                min_date = min(zip_dates)
                max_date = max(zip_dates)
                return [
                    WorkItem(
                        item_type="date_range",
                        item_id=f"{min_date}_to_{max_date}",
                        pipeline_id=pipeline.id,
                        stage_id=stage.id,
                        metadata={
                            "since_date": min_date,
                            "until_date": max_date,
                            "dates": zip_dates,
                        },
                    )
                ]
            elif not force:
                logger.info(f"No unprocessed ZIP dates for {stage.id}")
                return []

        # Default: single work item for the stage
        item_id = since.isoformat() if since else "full"
        return [
            WorkItem(
                item_type="full" if not since else "date",
                item_id=item_id,
                pipeline_id=pipeline.id,
                stage_id=stage.id,
            )
        ]

    def _discover_dates_from_zips(self, include_processed: bool = False) -> list[str]:
        """
        Discover dates from ZIP files that need processing.

        Looks at the processed and unprocessed ZIP file lists to determine
        which dates have new audio data to process.
        """
        import re
        from pathlib import Path

        # Get raw audio folder from settings
        raw_audio_folder = self.settings.paths.raw_audio_folder
        if not raw_audio_folder:
            logger.warning("RAW_AUDIO_FOLDER not configured")
            return []

        sg_folder = Path(raw_audio_folder) / "InternetArchive_space_to_grounds"
        if not sg_folder.exists():
            logger.warning(f"Space-to-ground folder not found: {sg_folder}")
            return []

        # Get processed zips
        processed = self.zip_tracker.get_processed()
        skipped = self.zip_tracker.get_skipped()
        errors = (
            self.zip_tracker.get_error_filenames()
        )  # Gets just filenames, not error msgs

        if include_processed:
            # If including processed, only ignore skipped and errors
            ignored = skipped | errors
        else:
            ignored = processed | skipped | errors

        logger.debug(
            f"Found {len(processed)} processed, {len(skipped)} skipped, {len(errors)} error zips"
        )

        # Find all zip files and check which are unprocessed AND recently modified
        # Only process ZIPs modified in the last 24 hours (recently downloaded)
        import time

        now = time.time()
        one_day_ago = now - (24 * 60 * 60)

        dates = set()
        date_pattern = re.compile(r"(\d{2})-(\d{2})-(\d{2})")

        for zip_file in sg_folder.glob("*.zip"):
            if zip_file.name in ignored:
                continue  # Already processed/skipped/errored

            # Check if file was modified recently (within last 30 days)
            # This prevents picking up ancient unprocessed files when we only care about new data
            mtime = zip_file.stat().st_mtime
            if mtime < (now - (30 * 24 * 60 * 60)):
                logger.debug(f"Skipping old unprocessed ZIP: {zip_file.name}")
                continue

            match = date_pattern.match(zip_file.name)
            if match:
                month, day, year = match.groups()
                # Convert to YYYY-MM-DD format
                full_year = f"20{year}"
                date_str = f"{full_year}-{month}-{day}"
                dates.add(date_str)

        logger.info(f"Found {len(dates)} recently downloaded ZIP dates")
        return sorted(dates)

    def _expand_args_template(
        self,
        template: str,
        work_item: WorkItem,
        force: bool,
        dry_run: bool,
    ) -> list[str]:
        """
        Expand template variables in argument string.

        Template variables:
        - {since_date}: Work item date or range start (with flag removed if empty)
        - {until_date}: Work item date or range end (with flag removed if empty)
        - {overwrite_flag}: --overwrite if force=True
        - {dry_run_flag}: --dry-run if dry_run=True
        - {recent_60_days}: Date 60 days ago (YYYY-MM-DD)
        - {recent_180_days}: Date 180 days ago (YYYY-MM-DD)

        Args:
            template: Argument template string
            work_item: The work item being processed
            force: Whether force mode is enabled
            dry_run: Whether dry run mode is enabled

        Returns:
            Expanded argument list
        """
        import re
        from datetime import timedelta

        if not template:
            return []

        expanded = template
        today = date.today()

        # Dynamic date expansions for incremental ranges
        expanded = expanded.replace(
            "{recent_60_days}", (today - timedelta(days=60)).isoformat()
        )
        expanded = expanded.replace(
            "{recent_180_days}", (today - timedelta(days=180)).isoformat()
        )

        # Date expansions - use metadata if available
        target_date = work_item.metadata.get("target_date")
        since_date = work_item.metadata.get("since_date")
        until_date = work_item.metadata.get("until_date")

        # Handle --flag {placeholder} patterns - remove the flag if value is empty
        if since_date:
            expanded = expanded.replace("{since_date}", str(since_date))
        elif target_date:
            expanded = expanded.replace("{since_date}", str(target_date))
        else:
            # Remove the entire "--start-date {since_date}" pattern
            expanded = re.sub(r"--start-date\s+\{since_date\}", "", expanded)
            expanded = expanded.replace("{since_date}", "")

        if until_date:
            expanded = expanded.replace("{until_date}", str(until_date))
        elif target_date:
            expanded = expanded.replace("{until_date}", str(target_date))
        else:
            # Remove the entire "--end-date {until_date}" pattern
            expanded = re.sub(r"--end-date\s+\{until_date\}", "", expanded)
            expanded = expanded.replace("{until_date}", "")

        # Flag expansions
        if force:
            expanded = expanded.replace("{overwrite_flag}", "--overwrite")
            expanded = expanded.replace("{force_flag}", "--force")
        else:
            expanded = expanded.replace("{overwrite_flag}", "")
            expanded = expanded.replace("{force_flag}", "")

        if dry_run:
            expanded = expanded.replace("{dry_run_flag}", "--dry-run")
        else:
            expanded = expanded.replace("{dry_run_flag}", "")

        # Split into args, filtering empty strings
        return [arg for arg in expanded.split() if arg]

    def _get_pipelines_to_run(
        self, pipeline_ids: list[str] | None
    ) -> list[PipelineConfig]:
        """Get the list of pipelines to run."""
        # Get all enabled pipelines from settings
        all_pipelines = [p for p in self.settings.pipelines.values() if p.enabled]

        if pipeline_ids is None:
            return all_pipelines

        # Filter to requested pipelines
        pipeline_map = {p.id: p for p in all_pipelines}
        result = []
        for pid in pipeline_ids:
            if pid in pipeline_map:
                result.append(pipeline_map[pid])
            else:
                logger.warning(f"Pipeline {pid} not found or not enabled")

        return result

    def _topological_sort_pipelines(
        self, pipelines: list[PipelineConfig]
    ) -> list[PipelineConfig]:
        """
        Sort pipelines by dependency order using topological sort.

        Args:
            pipelines: List of pipelines to sort

        Returns:
            Sorted list with dependencies first
        """
        pipeline_map = {p.id: p for p in pipelines}
        visited: set[str] = set()
        result: list[PipelineConfig] = []

        def visit(pid: str) -> None:
            if pid in visited:
                return
            visited.add(pid)

            pipeline = pipeline_map.get(pid)
            if pipeline:
                # Visit dependencies first
                for dep_id in pipeline.depends_on:
                    if dep_id in pipeline_map:
                        visit(dep_id)
                result.append(pipeline)

        for p in pipelines:
            visit(p.id)

        return result

    def _check_pipeline_dependencies(self, pipeline: PipelineConfig) -> bool:
        """
        Check if all pipeline dependencies are satisfied.

        Args:
            pipeline: The pipeline to check

        Returns:
            True if all dependencies are satisfied
        """
        for dep_id in pipeline.depends_on:
            # If the dependency pipeline was explicitly skipped, ignore this dependency
            if dep_id in self._skipped_pipelines:
                logger.debug(
                    f"Ignoring pipeline dependency {dep_id} " f"because it was skipped"
                )
                continue

            # Check if dependency pipeline completed in this run
            if dep_id not in self._completed_pipelines:
                logger.warning(
                    f"Pipeline {pipeline.id} depends on {dep_id} "
                    f"which has not completed successfully in this run"
                )
                return False
        return True

    def _check_stage_dependencies(
        self, pipeline: PipelineConfig, stage: StageConfig
    ) -> bool:
        """
        Check if all stage dependencies are satisfied.

        For now, we assume dependencies are satisfied during the same run.
        In a more sophisticated implementation, we'd track stage completion
        in the database.

        Args:
            pipeline: The pipeline containing the stage
            stage: The stage to check

        Returns:
            True if all dependencies are satisfied
        """
        # For within-pipeline dependencies, we track which stages have
        # completed in this run using _completed_stages
        for dep_id in stage.depends_on_stages:
            if dep_id not in self._completed_stages.get(pipeline.id, set()):
                logger.warning(
                    f"Stage {stage.id} depends on stage {dep_id} "
                    f"which has not completed in this run"
                )
                return False

        # Check cross-pipeline dependencies
        for dep in stage.cross_dependencies:
            dep_pipeline_id = dep.get("pipeline")
            dep_stage_id = dep.get("stage")
            if dep_pipeline_id and dep_stage_id:
                # If the dependency pipeline was explicitly skipped, ignore this dependency
                if dep_pipeline_id in self._skipped_pipelines:
                    logger.debug(
                        f"Ignoring cross-dependency {dep_pipeline_id}:{dep_stage_id} "
                        f"because {dep_pipeline_id} was skipped"
                    )
                    continue

                if dep_stage_id not in self._completed_stages.get(
                    dep_pipeline_id, set()
                ):
                    logger.warning(
                        f"Stage {stage.id} depends on {dep_pipeline_id}:{dep_stage_id} "
                        f"which has not completed in this run"
                    )
                    return False

        return True

    def _get_gpu_task_type(self, stage: StageConfig) -> GpuTaskType:
        """Determine the GPU task type for a stage."""
        # Try to infer from stage configuration or script name
        script_lower = stage.script.lower()

        if "whisper" in script_lower or "transcri" in script_lower:
            return GpuTaskType.WHISPERX
        elif "llm" in script_lower or "ollama" in script_lower:
            return GpuTaskType.OLLAMA
        elif "embed" in script_lower:
            return GpuTaskType.EMBEDDING

        # Default based on stage's gpu_task_type if specified
        return stage.gpu_task_type or GpuTaskType.OTHER

    def _notify_progress(
        self,
        callback: Callable[[str, str, str], None] | None,
        pipeline: str,
        stage: str,
        message: str,
    ) -> None:
        """Notify progress if callback is provided."""
        if callback:
            try:
                callback(pipeline, stage, message)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")

    async def shutdown(self) -> None:
        """
        Initiate graceful shutdown.

        This will:
        - Set the shutdown flag to stop processing new items
        - Wait for current operations to complete
        - Release any held resources
        """
        logger.info("Orchestrator shutdown requested")
        self._shutdown = True

        # Log the shutdown
        if self._current_pipeline:
            self.state_db.log_activity(
                level="WARNING",
                message="Shutdown requested - stopping after current item",
                pipeline_id=self._current_pipeline,
                stage_id=self._current_stage or "",
            )

        # Shutdown resource manager
        await self.resource_manager.shutdown()

        logger.info("Orchestrator shutdown complete")

    @property
    def is_shutting_down(self) -> bool:
        """Check if shutdown has been requested."""
        return self._shutdown

    async def get_status(self) -> dict:
        """
        Get current orchestrator status.

        Returns:
            Dictionary with current status information
        """
        return {
            "shutting_down": self._shutdown,
            "current_pipeline": self._current_pipeline,
            "current_stage": self._current_stage,
            "resource_status": await self.resource_manager.get_status(),
        }
