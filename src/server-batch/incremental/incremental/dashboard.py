"""
Rich Live dashboard for real-time pipeline monitoring.

Provides a terminal-based dashboard with:
- Pipeline status grid
- GPU status panel
- Activity log
- Current stage indicator
"""

import threading
from collections import deque
from datetime import datetime
from typing import Optional

from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.text import Text

from .config import Settings
from .models import GpuTaskType, Status


# Status emoji mapping
STATUS_ICONS = {
    Status.PENDING: "⬜",
    Status.PROCESSING: "🟨",
    Status.COMPLETE: "✅",
    Status.FAILED: "❌",
    Status.SKIPPED: "⏭️",
}

# Status color mapping
STATUS_COLORS = {
    Status.PENDING: "white",
    Status.PROCESSING: "yellow",
    Status.COMPLETE: "green",
    Status.FAILED: "red",
    Status.SKIPPED: "dim",
}

# Log level colors
LOG_COLORS = {
    "info": "cyan",
    "success": "green",
    "warning": "yellow",
    "error": "red",
    "debug": "dim",
}


class PipelineStatus:
    """Tracks status of a single pipeline stage."""

    def __init__(self, pipeline_id: str, stage_id: str) -> None:
        self.pipeline_id = pipeline_id
        self.stage_id = stage_id
        self.status = Status.PENDING
        self.message = ""
        self.updated_at: Optional[datetime] = None


class GpuStatus:
    """Tracks current GPU state."""

    def __init__(self) -> None:
        self.task_type = GpuTaskType.NONE
        self.model: Optional[str] = None
        self.status = "idle"
        self.memory_used: Optional[str] = None
        self.memory_total: Optional[str] = None


class ActivityLogEntry:
    """A single activity log entry."""

    def __init__(self, message: str, level: str = "info") -> None:
        self.message = message
        self.level = level
        self.timestamp = datetime.now()


class Dashboard:
    """
    Rich Live dashboard for monitoring pipeline execution.

    Provides real-time updates of:
    - Pipeline and stage status grid
    - GPU resource utilization
    - Activity log
    - Current execution stage

    Example:
        dashboard = Dashboard(settings)
        dashboard.start()

        dashboard.update_pipeline_status("comm", "transcribe", Status.PROCESSING, "File 3/10")
        dashboard.update_gpu_status(GpuTaskType.WHISPERX, None, "active")
        dashboard.log_activity("Started transcription batch")

        dashboard.stop()
    """

    def __init__(
        self,
        settings: Settings,
        refresh_rate: Optional[float] = None,
    ) -> None:
        """
        Initialize the dashboard.

        Args:
            settings: Application settings containing dashboard configuration
            refresh_rate: Override refresh rate in seconds (default from settings)
        """
        self.settings = settings
        self.refresh_rate = refresh_rate or settings.dashboard.refresh_rate_seconds
        self.max_log_entries = settings.dashboard.activity_log_lines
        self.show_gpu_status = settings.dashboard.show_gpu_status

        # State tracking
        self._pipeline_statuses: dict[str, dict[str, PipelineStatus]] = {}
        self._gpu_status = GpuStatus()
        self._activity_log: deque[ActivityLogEntry] = deque(maxlen=self.max_log_entries)
        self._current_stage: Optional[str] = None
        self._current_pipeline: Optional[str] = None

        # Rich components
        self._console = Console()
        self._live: Optional[Live] = None
        self._progress = Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        )

        # Control flags
        self._running = False
        self._paused = False
        self._lock = threading.Lock()

        # Initialize pipeline statuses from settings
        self._init_pipeline_statuses()

    def _init_pipeline_statuses(self) -> None:
        """Initialize pipeline status tracking from settings."""
        for pipeline_id, pipeline_config in self.settings.pipelines.items():
            self._pipeline_statuses[pipeline_id] = {}
            for stage in pipeline_config.stages:
                self._pipeline_statuses[pipeline_id][stage.id] = PipelineStatus(
                    pipeline_id, stage.id
                )

    def _create_layout(self) -> Layout:
        """Create the dashboard layout structure."""
        layout = Layout(name="root")

        # Split into header and body
        layout.split(
            Layout(name="header", size=3),
            Layout(name="body"),
            Layout(name="footer", size=3),
        )

        # Split body into main content and sidebar
        layout["body"].split_row(
            Layout(name="main", ratio=2),
            Layout(name="sidebar", ratio=1),
        )

        # Split main into pipeline grid and current stage
        layout["main"].split(
            Layout(name="pipelines", ratio=3),
            Layout(name="current_stage", size=5),
        )

        # Split sidebar into GPU status and activity log
        if self.show_gpu_status:
            layout["sidebar"].split(
                Layout(name="gpu_status", size=8),
                Layout(name="activity_log"),
            )
        else:
            layout["sidebar"].split(
                Layout(name="activity_log"),
            )

        return layout

    def _render_header(self) -> Panel:
        """Render the dashboard header."""
        title = Text()
        title.append("🚀 ", style="bold")
        title.append("Pipeline Dashboard", style="bold cyan")
        title.append(" | ", style="dim")
        title.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), style="dim")

        if self._paused:
            title.append(" | ", style="dim")
            title.append("⏸ PAUSED", style="bold yellow")

        return Panel(title, style="blue")

    def _render_pipeline_grid(self) -> Panel:
        """Render the pipeline status grid."""
        table = Table(
            title="Pipeline Status",
            expand=True,
            show_header=True,
            header_style="bold magenta",
        )

        # Add pipeline column
        table.add_column("Pipeline", style="cyan", no_wrap=True)

        # Collect all unique stage IDs across pipelines
        all_stages: set[str] = set()
        for stages in self._pipeline_statuses.values():
            all_stages.update(stages.keys())

        # Sort stages for consistent display
        sorted_stages = sorted(all_stages)

        # Add stage columns
        for stage_id in sorted_stages:
            table.add_column(stage_id, justify="center")

        # Add rows for each pipeline
        for pipeline_id in sorted(self._pipeline_statuses.keys()):
            stages = self._pipeline_statuses[pipeline_id]
            row = [pipeline_id]

            for stage_id in sorted_stages:
                if stage_id in stages:
                    status = stages[stage_id]
                    icon = STATUS_ICONS.get(status.status, "❓")
                    color = STATUS_COLORS.get(status.status, "white")
                    cell = Text(icon, style=color)
                    row.append(cell)
                else:
                    row.append(Text("—", style="dim"))

            table.add_row(*row)

        return Panel(table, title="📊 Pipelines", border_style="blue")

    def _render_current_stage(self) -> Panel:
        """Render the current executing stage panel."""
        content = Text()

        if self._current_pipeline and self._current_stage:
            content.append("▶ ", style="bold green")
            content.append(f"{self._current_pipeline}", style="bold cyan")
            content.append(" → ", style="dim")
            content.append(f"{self._current_stage}", style="bold yellow")

            # Get status message if available
            if self._current_pipeline in self._pipeline_statuses:
                stages = self._pipeline_statuses[self._current_pipeline]
                if self._current_stage in stages:
                    status = stages[self._current_stage]
                    if status.message:
                        content.append("\n")
                        content.append(f"  {status.message}", style="dim")
        else:
            content.append("⏳ ", style="dim")
            content.append("Waiting for next stage...", style="dim")

        return Panel(content, title="🎯 Current Stage", border_style="green")

    def _render_gpu_status(self) -> Panel:
        """Render the GPU status panel."""
        content = Text()

        gpu = self._gpu_status

        # Task type indicator
        if gpu.task_type == GpuTaskType.NONE:
            content.append("💤 ", style="dim")
            content.append("GPU Idle\n", style="dim")
        elif gpu.task_type == GpuTaskType.WHISPERX:
            content.append("🎙️ ", style="bold yellow")
            content.append("WhisperX Active\n", style="bold yellow")
        elif gpu.task_type == GpuTaskType.OLLAMA:
            content.append("🤖 ", style="bold cyan")
            content.append("Ollama Active\n", style="bold cyan")

        # Model info
        if gpu.model:
            content.append(f"  Model: ", style="dim")
            content.append(f"{gpu.model}\n", style="white")

        # Status
        content.append(f"  Status: ", style="dim")
        status_color = "green" if gpu.status == "active" else "dim"
        content.append(f"{gpu.status}\n", style=status_color)

        # Memory if available
        if gpu.memory_used and gpu.memory_total:
            content.append(f"  Memory: ", style="dim")
            content.append(f"{gpu.memory_used}/{gpu.memory_total}", style="magenta")

        return Panel(content, title="🎮 GPU Status", border_style="magenta")

    def _render_activity_log(self) -> Panel:
        """Render the activity log panel."""
        content = Text()

        if not self._activity_log:
            content.append("No activity yet...", style="dim italic")
        else:
            for i, entry in enumerate(self._activity_log):
                if i > 0:
                    content.append("\n")

                # Timestamp
                time_str = entry.timestamp.strftime("%H:%M:%S")
                content.append(f"[{time_str}] ", style="dim")

                # Level indicator
                level_color = LOG_COLORS.get(entry.level, "white")
                level_icon = {
                    "info": "ℹ️",
                    "success": "✅",
                    "warning": "⚠️",
                    "error": "❌",
                    "debug": "🔍",
                }.get(entry.level, "•")

                content.append(f"{level_icon} ", style=level_color)
                content.append(entry.message, style=level_color)

        return Panel(
            content,
            title="📜 Activity Log",
            border_style="cyan",
        )

    def _render_footer(self) -> Panel:
        """Render the footer with keyboard shortcuts."""
        shortcuts = Text()
        shortcuts.append("Keyboard: ", style="dim")
        shortcuts.append("[q]", style="bold cyan")
        shortcuts.append(" Quit  ", style="dim")
        shortcuts.append("[p]", style="bold cyan")
        shortcuts.append(" Pause/Resume  ", style="dim")
        shortcuts.append("[r]", style="bold cyan")
        shortcuts.append(" Refresh", style="dim")

        return Panel(shortcuts, style="dim")

    def _render(self) -> Layout:
        """Render the complete dashboard."""
        layout = self._create_layout()

        with self._lock:
            layout["header"].update(self._render_header())
            layout["pipelines"].update(self._render_pipeline_grid())
            layout["current_stage"].update(self._render_current_stage())
            if self.show_gpu_status:
                layout["gpu_status"].update(self._render_gpu_status())
            layout["activity_log"].update(self._render_activity_log())
            layout["footer"].update(self._render_footer())

        return layout

    def update_pipeline_status(
        self,
        pipeline_id: str,
        stage_id: str,
        status: Status,
        message: str = "",
    ) -> None:
        """
        Update the status of a pipeline stage.

        Args:
            pipeline_id: ID of the pipeline
            stage_id: ID of the stage within the pipeline
            status: New status for the stage
            message: Optional status message
        """
        with self._lock:
            if pipeline_id not in self._pipeline_statuses:
                self._pipeline_statuses[pipeline_id] = {}

            if stage_id not in self._pipeline_statuses[pipeline_id]:
                self._pipeline_statuses[pipeline_id][stage_id] = PipelineStatus(
                    pipeline_id, stage_id
                )

            pipeline_status = self._pipeline_statuses[pipeline_id][stage_id]
            pipeline_status.status = status
            pipeline_status.message = message
            pipeline_status.updated_at = datetime.now()

            # Update current stage if processing
            if status == Status.PROCESSING:
                self._current_pipeline = pipeline_id
                self._current_stage = stage_id

    def update_gpu_status(
        self,
        task_type: GpuTaskType,
        model: Optional[str] = None,
        status: str = "idle",
        memory_used: Optional[str] = None,
        memory_total: Optional[str] = None,
    ) -> None:
        """
        Update the GPU status display.

        Args:
            task_type: Type of GPU task currently running
            model: Model name if applicable (e.g., Ollama model)
            status: Status string (e.g., "active", "idle", "loading")
            memory_used: GPU memory in use (e.g., "4.2 GB")
            memory_total: Total GPU memory (e.g., "8 GB")
        """
        with self._lock:
            self._gpu_status.task_type = task_type
            self._gpu_status.model = model
            self._gpu_status.status = status
            self._gpu_status.memory_used = memory_used
            self._gpu_status.memory_total = memory_total

    def log_activity(self, message: str, level: str = "info") -> None:
        """
        Add an entry to the activity log.

        Args:
            message: Log message text
            level: Log level - "info", "success", "warning", "error", "debug"
        """
        with self._lock:
            self._activity_log.append(ActivityLogEntry(message, level))

    def set_current_stage(
        self, pipeline_id: Optional[str], stage_id: Optional[str]
    ) -> None:
        """
        Set the currently executing stage.

        Args:
            pipeline_id: ID of the current pipeline (None to clear)
            stage_id: ID of the current stage (None to clear)
        """
        with self._lock:
            self._current_pipeline = pipeline_id
            self._current_stage = stage_id

    def start(self) -> None:
        """Start the live dashboard display."""
        if self._running:
            return

        self._running = True
        self._live = Live(
            self._render(),
            console=self._console,
            refresh_per_second=1 / self.refresh_rate,
            screen=True,
        )
        self._live.start()

        # Start keyboard input handling in background
        self._start_keyboard_handler()

    def stop(self) -> None:
        """Stop the live dashboard display."""
        if not self._running:
            return

        self._running = False
        if self._live:
            self._live.stop()
            self._live = None

    def pause(self) -> None:
        """Pause dashboard updates."""
        with self._lock:
            self._paused = True

    def resume(self) -> None:
        """Resume dashboard updates."""
        with self._lock:
            self._paused = False

    def toggle_pause(self) -> None:
        """Toggle pause state."""
        with self._lock:
            self._paused = not self._paused

    def refresh(self) -> None:
        """Force a dashboard refresh."""
        if self._live and not self._paused:
            self._live.update(self._render())

    def _start_keyboard_handler(self) -> None:
        """Start background thread for keyboard input handling."""

        def handle_keyboard() -> None:
            try:
                import sys

                if sys.platform == "win32":
                    import msvcrt

                    while self._running:
                        if msvcrt.kbhit():
                            key = (
                                msvcrt.getch().decode("utf-8", errors="ignore").lower()
                            )
                            self._handle_key(key)
                else:
                    import select
                    import termios
                    import tty

                    old_settings = termios.tcgetattr(sys.stdin)
                    try:
                        tty.setraw(sys.stdin.fileno())
                        while self._running:
                            if select.select([sys.stdin], [], [], 0.1)[0]:
                                key = sys.stdin.read(1).lower()
                                self._handle_key(key)
                    finally:
                        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
            except Exception:
                # Silently handle keyboard input errors
                pass

        thread = threading.Thread(target=handle_keyboard, daemon=True)
        thread.start()

    def _handle_key(self, key: str) -> None:
        """Handle a keyboard input."""
        if key == "q":
            self.stop()
        elif key == "p":
            self.toggle_pause()
        elif key == "r":
            self.refresh()

    @property
    def is_running(self) -> bool:
        """Check if the dashboard is currently running."""
        return self._running

    @property
    def is_paused(self) -> bool:
        """Check if the dashboard is currently paused."""
        return self._paused

    def __enter__(self) -> "Dashboard":
        """Context manager entry."""
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        self.stop()
