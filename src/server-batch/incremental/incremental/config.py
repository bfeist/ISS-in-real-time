"""
Configuration management for the incremental update system.

Handles loading settings from:
- YAML configuration files
- Environment variables
- .env files
"""

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml
from dotenv import load_dotenv

from .models import GpuTaskType, PipelineConfig, StageConfig


# Default paths relative to the incremental package
DEFAULT_CONFIG_DIR = Path(__file__).parent.parent
DEFAULT_DATA_DIR = DEFAULT_CONFIG_DIR / "data"
DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "incremental.db"


@dataclass
class PathsConfig:
    """Configuration for data paths."""

    server_batch_dir: Path = field(
        default_factory=lambda: Path(__file__).parent.parent.parent
    )
    web_data_root: Path = field(default_factory=lambda: Path("./web_assets"))
    raw_audio_folder: Path = field(default_factory=lambda: Path("./raw/audio"))
    raw_transcribed_folder: Path = field(
        default_factory=lambda: Path("./raw/transcribed")
    )
    photos_folder: Path = field(default_factory=lambda: Path("./raw/photos"))
    cache_dir: Path = field(default_factory=lambda: Path("./cache"))


@dataclass
class GpuConfig:
    """Configuration for GPU resource management."""

    enabled: bool = True
    ollama_host: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.2"
    ollama_keepalive: str = "5m"  # How long Ollama keeps model loaded
    whisperx_device: str = "cuda"
    whisperx_compute_type: str = "float16"


@dataclass
class SchedulingConfig:
    """Configuration for task scheduling."""

    max_concurrent_pipelines: int = 3
    max_concurrent_stages: int = 1  # Per pipeline
    retry_max_attempts: int = 3
    retry_backoff_minutes: list[int] = field(default_factory=lambda: [5, 10, 30, 60])
    stale_run_threshold_minutes: int = 60
    default_timeout_minutes: int = 60


@dataclass
class DashboardConfig:
    """Configuration for the Rich dashboard."""

    refresh_rate_seconds: float = 1.0
    activity_log_lines: int = 15
    show_gpu_status: bool = True
    auto_scroll: bool = True


@dataclass
class Settings:
    """Main settings container."""

    # Database
    db_path: Path = field(default_factory=lambda: DEFAULT_DB_PATH)

    # Paths
    paths: PathsConfig = field(default_factory=PathsConfig)

    # GPU
    gpu: GpuConfig = field(default_factory=GpuConfig)

    # Scheduling
    scheduling: SchedulingConfig = field(default_factory=SchedulingConfig)

    # Dashboard
    dashboard: DashboardConfig = field(default_factory=DashboardConfig)

    # Pipelines (loaded from pipelines.yaml)
    pipelines: dict[str, PipelineConfig] = field(default_factory=dict)

    # Debug mode
    debug: bool = False
    dry_run: bool = False


def expand_env_vars(value: str) -> str:
    """Expand environment variables in a string.

    Supports formats:
    - ${VAR} or $VAR
    - ${VAR:-default} for default values
    """

    def replace_var(match: re.Match[str]) -> str:
        var_expr = match.group(1) or match.group(2)
        if ":-" in var_expr:
            var_name, default = var_expr.split(":-", 1)
            return os.environ.get(var_name, default)
        return os.environ.get(var_expr, match.group(0))

    # Match ${VAR:-default} or ${VAR} or $VAR
    pattern = r"\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)"
    return re.sub(pattern, replace_var, value)


def resolve_path(value: str | Path, base_dir: Path) -> Path:
    """Resolve a path, expanding env vars and making absolute."""
    if isinstance(value, Path):
        str_value = str(value)
    else:
        str_value = value

    expanded = expand_env_vars(str_value)
    path = Path(expanded)

    if not path.is_absolute():
        path = base_dir / path

    return path.resolve()


def load_yaml_file(path: Path) -> dict[str, Any]:
    """Load a YAML file, returning empty dict if not found."""
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def parse_stage_config(stage_data: dict[str, Any]) -> StageConfig:
    """Parse a stage configuration from YAML data."""
    gpu_task_type = GpuTaskType.NONE
    if stage_data.get("gpu_task_type"):
        gpu_task_type = GpuTaskType(stage_data["gpu_task_type"])
    elif stage_data.get("requires_gpu"):
        # Default to whisperx if just requires_gpu is set
        gpu_task_type = GpuTaskType.WHISPERX

    return StageConfig(
        id=stage_data["id"],
        name=stage_data.get("name", stage_data["id"]),
        script=stage_data["script"],
        timeout_minutes=stage_data.get("timeout_minutes", 60),
        requires_gpu=stage_data.get("requires_gpu", False),
        gpu_task_type=gpu_task_type,
        ollama_model=stage_data.get("ollama_model"),
        depends_on_stages=stage_data.get("depends_on_stages", []),
        cross_dependencies=stage_data.get("cross_dependencies", []),
        args_template=stage_data.get("args_template", ""),
        enabled=stage_data.get("enabled", True),
    )


def parse_pipeline_config(
    pipeline_id: str, pipeline_data: dict[str, Any]
) -> PipelineConfig:
    """Parse a pipeline configuration from YAML data."""
    stages = [parse_stage_config(s) for s in pipeline_data.get("stages", [])]

    return PipelineConfig(
        id=pipeline_id,
        name=pipeline_data.get("name", pipeline_id),
        enabled=pipeline_data.get("enabled", True),
        depends_on=pipeline_data.get("depends_on", []),
        monitor=pipeline_data.get("monitor"),
        run_strategy=pipeline_data.get("run_strategy", "incremental"),
        max_concurrent=pipeline_data.get("max_concurrent", 1),
        stages=stages,
    )


def load_pipelines(config_dir: Path) -> dict[str, PipelineConfig]:
    """Load pipeline configurations from pipelines.yaml."""
    pipelines_file = config_dir / "pipelines.yaml"
    data = load_yaml_file(pipelines_file)

    pipelines = {}
    for pipeline_id, pipeline_data in data.get("pipelines", {}).items():
        pipelines[pipeline_id] = parse_pipeline_config(pipeline_id, pipeline_data)

    return pipelines


def load_settings(
    config_dir: Optional[Path] = None,
    env_file: Optional[Path] = None,
) -> Settings:
    """
    Load settings from configuration files and environment.

    Priority (highest to lowest):
    1. Environment variables
    2. .env file
    3. settings.yaml
    4. Default values

    Args:
        config_dir: Directory containing config files (default: incremental/)
        env_file: Path to .env file (default: config_dir/.env)

    Returns:
        Loaded Settings object
    """
    if config_dir is None:
        config_dir = DEFAULT_CONFIG_DIR
    config_dir = Path(config_dir)

    # Load .env files - first project root, then local
    project_root_env = config_dir.parent.parent.parent / ".env"  # ISSiRT/.env
    if project_root_env.exists():
        load_dotenv(project_root_env)

    if env_file is None:
        env_file = config_dir / ".env"
    if env_file.exists():
        load_dotenv(env_file, override=True)

    # Load settings.yaml
    settings_file = config_dir / "settings.yaml"
    yaml_data = load_yaml_file(settings_file)

    # Build paths config
    paths_data = yaml_data.get("paths", {})
    paths = PathsConfig(
        server_batch_dir=resolve_path(
            os.environ.get(
                "ISSIRT_SERVER_BATCH_DIR",
                paths_data.get("server_batch_dir", str(config_dir.parent)),
            ),
            config_dir,
        ),
        web_data_root=resolve_path(
            os.environ.get(
                "WEB_DATA_ROOT", paths_data.get("web_data_root", "./web_assets")
            ),
            config_dir,
        ),
        raw_audio_folder=resolve_path(
            os.environ.get(
                "RAW_AUDIO_FOLDER", paths_data.get("raw_audio_folder", "./raw/audio")
            ),
            config_dir,
        ),
        raw_transcribed_folder=resolve_path(
            os.environ.get(
                "RAW_TRANSCRIBED_FOLDER",
                paths_data.get("raw_transcribed_folder", "./raw/transcribed"),
            ),
            config_dir,
        ),
        photos_folder=resolve_path(
            os.environ.get(
                "PHOTOS_FOLDER", paths_data.get("photos_folder", "./raw/photos")
            ),
            config_dir,
        ),
        cache_dir=resolve_path(
            os.environ.get("ISSIRT_CACHE_DIR", paths_data.get("cache_dir", "./cache")),
            config_dir,
        ),
    )

    # Build GPU config
    gpu_data = yaml_data.get("gpu", {})
    gpu = GpuConfig(
        enabled=_get_bool_env("ISSIRT_GPU_ENABLED", gpu_data.get("enabled", True)),
        ollama_host=os.environ.get(
            "OLLAMA_HOST", gpu_data.get("ollama_host", "http://localhost:11434")
        ),
        ollama_default_model=os.environ.get(
            "OLLAMA_MODEL", gpu_data.get("ollama_default_model", "llama3.2")
        ),
        ollama_keepalive=gpu_data.get("ollama_keepalive", "5m"),
        whisperx_device=os.environ.get(
            "WHISPERX_DEVICE", gpu_data.get("whisperx_device", "cuda")
        ),
        whisperx_compute_type=gpu_data.get("whisperx_compute_type", "float16"),
    )

    # Build scheduling config
    sched_data = yaml_data.get("scheduling", {})
    scheduling = SchedulingConfig(
        max_concurrent_pipelines=int(
            os.environ.get(
                "ISSIRT_MAX_CONCURRENT_PIPELINES",
                sched_data.get("max_concurrent_pipelines", 3),
            )
        ),
        max_concurrent_stages=sched_data.get("max_concurrent_stages", 1),
        retry_max_attempts=sched_data.get("retry_max_attempts", 3),
        retry_backoff_minutes=sched_data.get("retry_backoff_minutes", [5, 10, 30, 60]),
        stale_run_threshold_minutes=sched_data.get("stale_run_threshold_minutes", 60),
        default_timeout_minutes=sched_data.get("default_timeout_minutes", 60),
    )

    # Build dashboard config
    dash_data = yaml_data.get("dashboard", {})
    dashboard = DashboardConfig(
        refresh_rate_seconds=dash_data.get("refresh_rate_seconds", 1.0),
        activity_log_lines=dash_data.get("activity_log_lines", 15),
        show_gpu_status=dash_data.get("show_gpu_status", True),
        auto_scroll=dash_data.get("auto_scroll", True),
    )

    # Database path
    db_path = resolve_path(
        os.environ.get(
            "ISSIRT_STATE_DB_PATH", yaml_data.get("db_path", str(DEFAULT_DB_PATH))
        ),
        config_dir,
    )

    # Load pipelines
    pipelines = load_pipelines(config_dir)

    return Settings(
        db_path=db_path,
        paths=paths,
        gpu=gpu,
        scheduling=scheduling,
        dashboard=dashboard,
        pipelines=pipelines,
        debug=_get_bool_env("ISSIRT_DEBUG", yaml_data.get("debug", False)),
        dry_run=_get_bool_env("ISSIRT_DRY_RUN", yaml_data.get("dry_run", False)),
    )


def _get_bool_env(name: str, default: bool) -> bool:
    """Get a boolean from environment variable."""
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in ("true", "1", "yes", "on")


def create_default_config_files(config_dir: Path) -> None:
    """Create default configuration files if they don't exist."""
    config_dir.mkdir(parents=True, exist_ok=True)

    # Create settings.yaml
    settings_file = config_dir / "settings.yaml"
    if not settings_file.exists():
        settings_content = """\
# ISSiRT Incremental Update System - Settings
# See 05_CONFIGURATION.md for full documentation

# Database location
db_path: "${ISSIRT_STATE_DB_PATH:-./data/incremental.db}"

# Data paths (can use environment variables)
paths:
  server_batch_dir: "${ISSIRT_SERVER_BATCH_DIR:-.}"
  web_data_root: "${WEB_DATA_ROOT:-./web_assets}"
  raw_audio_folder: "${RAW_AUDIO_FOLDER:-./raw/audio}"
  raw_transcribed_folder: "${RAW_TRANSCRIBED_FOLDER:-./raw/transcribed}"
  photos_folder: "${PHOTOS_FOLDER:-./raw/photos}"
  cache_dir: "./cache"

# GPU configuration
gpu:
  enabled: true
  ollama_host: "${OLLAMA_HOST:-http://localhost:11434}"
  ollama_default_model: "llama3.2"
  ollama_keepalive: "5m"
  whisperx_device: "cuda"
  whisperx_compute_type: "float16"

# Scheduling
scheduling:
  max_concurrent_pipelines: 3
  max_concurrent_stages: 1
  retry_max_attempts: 3
  retry_backoff_minutes: [5, 10, 30, 60]
  stale_run_threshold_minutes: 60
  default_timeout_minutes: 60

# Dashboard
dashboard:
  refresh_rate_seconds: 1.0
  activity_log_lines: 15
  show_gpu_status: true
  auto_scroll: true

# Debug mode
debug: false
dry_run: false
"""
        settings_file.write_text(settings_content)

    # Create pipelines.yaml
    pipelines_file = config_dir / "pipelines.yaml"
    if not pipelines_file.exists():
        pipelines_content = """\
# ISSiRT Pipeline Definitions
# See 02_PIPELINES.md and 05_CONFIGURATION.md for documentation

pipelines:
  # Articles pipeline
  articles:
    name: "NASA Blog Articles"
    enabled: true
    depends_on: []
    monitor: nasa_blog
    run_strategy: incremental
    max_concurrent: 1
    
    stages:
      - id: scrape
        name: "Scrape Articles"
        script: "2_articles/scrape_articles.py"
        timeout_minutes: 30
        args_template: "--since-date {since_date} --json-output"
      
      - id: consolidate
        name: "Consolidate Assets"
        script: "2_articles/consolidate_articles.py"
        timeout_minutes: 30
        depends_on_stages: [scrape]
        args_template: "--start-date {since_date} --end-date {until_date} --json-output"

  # Comm pipeline (audio transcription)
  comm:
    name: "ISS Communications"
    enabled: true
    depends_on: [articles]  # Corpus needs articles
    monitor: internet_archive
    run_strategy: incremental
    max_concurrent: 1
    
    stages:
      - id: download
        name: "Download IA ZIPs"
        script: "1_comm/1a_download_collection_IA_zips.py"
        timeout_minutes: 180
        args_template: "--json-output {dry_run_flag}"
      
      - id: corpus
        name: "Generate AI Corpus"
        script: "1_comm/5_corpus_initial_prompt_ai_gen.py"
        timeout_minutes: 60
        requires_gpu: true
        gpu_task_type: ollama
        ollama_model: "llama3.2"
        depends_on_stages: [download]
        cross_dependencies:
          - pipeline: articles
            stage: consolidate
        args_template: "--start-date {since_date} --end-date {until_date} {overwrite_flag}"
      
      - id: transcribe
        name: "Transcribe Audio"
        script: "1_comm/6_transcribe_using_corpus.py"
        timeout_minutes: 360
        requires_gpu: true
        gpu_task_type: whisperx
        depends_on_stages: [corpus]
        args_template: "--json-output {zip_file_arg}"
      
      - id: web
        name: "Generate Web Assets"
        script: "1_comm/3_web_comm.py"
        timeout_minutes: 60
        depends_on_stages: [transcribe]
        args_template: "--start-date {since_date} --end-date {until_date} --json-output {overwrite_flag}"
"""
        pipelines_file.write_text(pipelines_content)

    # Create .env.example
    env_example = config_dir / ".env.example"
    if not env_example.exists():
        env_content = """\
# ISSiRT Incremental Update System - Environment Variables
# Copy this to .env and customize

# Database path
ISSIRT_STATE_DB_PATH=./data/incremental.db

# Data paths
WEB_DATA_ROOT=/path/to/web_assets
RAW_AUDIO_FOLDER=/path/to/raw/audio
RAW_TRANSCRIBED_FOLDER=/path/to/raw/transcribed
PHOTOS_FOLDER=/path/to/raw/photos

# GPU/AI settings
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
WHISPERX_DEVICE=cuda

# API keys (if needed)
# FLICKR_API_KEY=your_key_here
# NASA_EOL_API_KEY=your_key_here
# SPACETRACK_USER=your_user
# SPACETRACK_PASSWORD=your_password

# Debug mode
ISSIRT_DEBUG=false
ISSIRT_DRY_RUN=false
"""
        env_example.write_text(env_content)

    # Create data directory
    (config_dir / "data").mkdir(exist_ok=True)
