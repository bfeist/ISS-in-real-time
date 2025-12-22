# ISSiRT Incremental Update System

Orchestrates all data processing pipelines for the ISS Real-Time website. Runs scripts in dependency order, tracks processing state in SQLite, and handles GPU resource coordination.

## Pipelines

| Pipeline      | Description                                            | GPU              |
| ------------- | ------------------------------------------------------ | ---------------- |
| articles      | NASA blog articles                                     | -                |
| comm          | ISS audio comms (download → corpus → transcribe → web) | WhisperX, Ollama |
| flights       | Station flights, supply missions, crew arrivals        | -                |
| photos_earth  | Earth photography from NASA EOL                        | -                |
| photos_flickr | JSC Flickr photos with AI classification               | Ollama           |
| clouds        | Cloud cover availability data                          | -                |
| eva           | EVA (spacewalk) information                            | -                |
| ephemera      | Ephemera and orbit count                               | -                |
| stats         | Data availability and aggregated stats                 | -                |

## Quick Start

```bash
cd src/server-batch/incremental

# Install dependencies
uv sync

# Initialize state database
uv run python -m incremental init

# Check status
uv run python -m incremental status

# List pipelines
uv run python -m incremental list-pipelines

# Dry run (preview what would run)
uv run python -m incremental run --dry-run

# Run all pipelines
uv run python -m incremental run

# Run specific pipeline
uv run python -m incremental run --pipeline flights

# Run with date constraints
uv run python -m incremental run --pipeline articles --since 2024-12-01
```

## Configuration

- **settings.yaml** - Global settings (paths, GPU config, scheduling)
- **pipelines.yaml** - Pipeline definitions and stage configurations
- **.env** - Environment-specific overrides (API keys, paths)

## Dependencies

Defined in `pipelines.yaml`. View with:

```bash
uv run python -m incremental graph
```

Key dependencies:

- `eva` depends on `flights`
- `stats` depends on `articles`, `flights`, `photos_earth`, `clouds`, `ephemera`
- Stage dependencies within `comm`: download → corpus → transcribe → web
