"""
Data models for the incremental update system.

This module defines all the data structures used throughout the system
for tracking pipeline state, runs, and work items.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Optional


class Status(Enum):
    """Processing status for work items."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"
    SKIPPED = "skipped"


class RunType(Enum):
    """Type of pipeline run."""

    SCHEDULED = "scheduled"
    MANUAL = "manual"
    RETRY = "retry"
    MONITOR = "monitor"


class GpuTaskType(Enum):
    """Type of GPU task for resource management."""

    NONE = "none"
    WHISPERX = (
        "whisperx"  # Audio transcription - needs full GPU, Ollama must be unloaded
    )
    OLLAMA = "ollama"  # AI inference - needs specific model loaded


class TriggerSource(Enum):
    """What triggered a pipeline run."""

    CLI = "cli"
    CRON = "cron"
    MONITOR = "monitor"
    DASHBOARD = "dashboard"
    API = "api"


@dataclass
class DateWatermark:
    """Processing status for a specific date in a pipeline stage."""

    pipeline_id: str
    stage_id: str
    date: date
    status: Status
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    output_hash: Optional[str] = None
    output_path: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    next_retry_at: Optional[datetime] = None
    last_error: Optional[str] = None
    last_run_id: Optional[int] = None

    def is_retriable(self) -> bool:
        """Check if this item can be retried."""
        return self.status == Status.FAILED and self.retry_count < self.max_retries

    def should_retry_now(self) -> bool:
        """Check if retry is due now."""
        if not self.is_retriable():
            return False
        if self.next_retry_at is None:
            return True
        return datetime.now() >= self.next_retry_at


@dataclass
class PipelineRun:
    """Record of a pipeline execution."""

    id: int
    pipeline_id: str
    stage_id: str
    run_type: RunType
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str = "running"
    trigger_source: TriggerSource = TriggerSource.CLI
    work_items_requested: int = 0
    work_items_processed: int = 0
    work_items_failed: int = 0
    work_items_skipped: int = 0
    exit_code: Optional[int] = None
    pid: Optional[int] = None
    hostname: Optional[str] = None
    error_message: Optional[str] = None
    error_traceback: Optional[str] = None

    @property
    def is_running(self) -> bool:
        """Check if run is still active."""
        return self.status == "running"

    @property
    def is_success(self) -> bool:
        """Check if run completed successfully."""
        return self.status == "success"

    @property
    def duration_seconds(self) -> Optional[float]:
        """Get run duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()


@dataclass
class StageConfig:
    """Configuration for a pipeline stage."""

    id: str
    name: str
    script: str
    timeout_minutes: int = 60
    requires_gpu: bool = False
    gpu_task_type: GpuTaskType = GpuTaskType.NONE
    ollama_model: Optional[str] = None
    depends_on_stages: list[str] = field(default_factory=list)
    cross_dependencies: list[dict[str, str]] = field(default_factory=list)
    args_template: str = ""
    enabled: bool = True


@dataclass
class PipelineConfig:
    """Configuration for a pipeline."""

    id: str
    name: str
    enabled: bool = True
    depends_on: list[str] = field(default_factory=list)
    monitor: Optional[str] = None
    run_strategy: str = "incremental"  # 'incremental', 'full', 'on_change'
    max_concurrent: int = 1
    stages: list[StageConfig] = field(default_factory=list)


@dataclass
class StageStatus:
    """Current status of a pipeline stage."""

    stage_id: str
    stage_name: str
    status: str  # 'idle', 'running', 'error'
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    pending_count: int = 0
    failed_count: int = 0
    current_work_item: Optional[str] = None
    progress_percent: Optional[float] = None


@dataclass
class PipelineStatus:
    """Summary status for a pipeline."""

    pipeline_id: str
    pipeline_name: str
    enabled: bool
    stages: dict[str, StageStatus] = field(default_factory=dict)
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    pending_items: int = 0
    failed_items: int = 0

    @property
    def overall_status(self) -> str:
        """Get overall pipeline status."""
        if not self.enabled:
            return "disabled"
        if any(s.status == "running" for s in self.stages.values()):
            return "running"
        if any(s.status == "error" for s in self.stages.values()):
            return "error"
        if self.pending_items > 0:
            return "pending"
        return "idle"


@dataclass
class MonitorState:
    """State of a source monitor."""

    monitor_id: str
    monitor_type: str
    last_check_at: Optional[datetime] = None
    last_check_status: Optional[str] = None
    last_check_duration_ms: Optional[int] = None
    last_new_items_at: Optional[datetime] = None
    content_hash: Optional[str] = None
    cached_data: Optional[dict[str, Any]] = None
    cache_expires_at: Optional[datetime] = None
    consecutive_failures: int = 0
    last_error: Optional[str] = None

    def is_cache_valid(self) -> bool:
        """Check if cached data is still valid."""
        if self.cached_data is None:
            return False
        if self.cache_expires_at is None:
            return True
        return datetime.now() < self.cache_expires_at


@dataclass
class ActivityLogEntry:
    """Entry in the activity log for dashboard display."""

    id: int
    timestamp: datetime
    pipeline_id: Optional[str]
    stage_id: Optional[str]
    level: str  # 'info', 'warning', 'error', 'success'
    message: str
    details: Optional[dict[str, Any]] = None


@dataclass
class ErrorLogEntry:
    """Detailed error log entry."""

    id: int
    occurred_at: datetime
    pipeline_id: Optional[str]
    stage_id: Optional[str]
    work_item_type: Optional[str]  # 'date', 'zip', 'run'
    work_item_id: Optional[str]
    run_id: Optional[int]
    error_type: str
    error_message: str
    error_traceback: Optional[str] = None
    context: Optional[dict[str, Any]] = None
    resolved_at: Optional[datetime] = None
    resolution_type: Optional[str] = None
    resolution_notes: Optional[str] = None

    @property
    def is_resolved(self) -> bool:
        """Check if error has been resolved."""
        return self.resolved_at is not None


@dataclass
class ZipStatus:
    """Status of a ZIP file in the comm pipeline."""

    filename: str
    is_processed: bool = False
    is_in_progress: bool = False
    is_error: bool = False
    is_skipped: bool = False
    error_message: Optional[str] = None

    @property
    def needs_processing(self) -> bool:
        """Check if this ZIP needs to be processed."""
        return not (
            self.is_processed or self.is_in_progress or self.is_error or self.is_skipped
        )


@dataclass
class GpuStatus:
    """Current GPU resource status."""

    is_locked: bool = False
    current_task_type: GpuTaskType = GpuTaskType.NONE
    current_pipeline: Optional[str] = None
    current_stage: Optional[str] = None
    ollama_model_loaded: Optional[str] = None
    locked_since: Optional[datetime] = None

    @property
    def is_available(self) -> bool:
        """Check if GPU is available."""
        return not self.is_locked


@dataclass
class WorkItem:
    """A unit of work to be processed."""

    item_type: str  # 'date', 'zip', 'album', 'full'
    item_id: str  # Date string, filename, etc.
    pipeline_id: str
    stage_id: str
    priority: int = 0  # Higher = more urgent
    metadata: dict[str, Any] = field(default_factory=dict)

    def __lt__(self, other: "WorkItem") -> bool:
        """Compare by priority (for priority queue)."""
        return self.priority > other.priority  # Higher priority first
