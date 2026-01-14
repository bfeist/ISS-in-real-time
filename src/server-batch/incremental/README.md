# ISSiRT Incremental Update System

Orchestrates all data processing pipelines for the ISS Real-Time website. Runs scripts in dependency order, tracks processing state in SQLite, and handles GPU resource coordination.

## Quick Start

```bash
cd src/server-batch/incremental

# Install dependencies
uv sync

# Initialize state database (first time only)
uv run issirt-incremental init

# Run all pipelines
uv run issirt-incremental update
```

## The `update` Command

The `update` command is the primary way to run the incremental system. It runs all enabled pipelines in dependency order with live progress output.

```bash
# Run all pipelines
uv run issirt-incremental update

# Preview what would run (no changes made)
uv run issirt-incremental update --dry-run

# Run only specific pipeline(s)
uv run issirt-incremental update -p comm
uv run issirt-incremental update -p comm -p aggregation

# Skip specific pipeline(s)
uv run issirt-incremental update --skip articles
uv run issirt-incremental update -x articles -x photos_flickr

# Process only data since a specific date
uv run issirt-incremental update --since 2024-12-01

# Force reprocessing (ignore previous state)
uv run issirt-incremental update --force

# Combine options
uv run issirt-incremental update --skip articles --dry-run
```

### Options

| Option       | Short | Description                                      |
| ------------ | ----- | ------------------------------------------------ |
| `--pipeline` | `-p`  | Run only specified pipeline(s). Can be repeated. |
| `--skip`     | `-x`  | Skip specified pipeline(s). Can be repeated.     |
| `--since`    |       | Process only data since this date (YYYY-MM-DD)   |
| `--force`    |       | Force reprocessing even if already complete      |
| `--dry-run`  |       | Show what would run without making changes       |

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
| aggregation   | Data availability and aggregated stats                 | -                |

## Other Commands

```bash
# View status of all pipelines
uv run issirt-incremental status

# List all pipelines and stages
uv run issirt-incremental list-pipelines

# Run specific pipeline with more control (alternative to update)
uv run issirt-incremental run -p flights
uv run issirt-incremental run -p photos_flickr -s filter  # Start from specific stage

# Check external sources for new data
uv run issirt-incremental check-sources

# View dependency graph
uv run issirt-incremental graph

# View errors
uv run issirt-incremental errors

# Live dashboard (view-only)
uv run issirt-incremental dashboard

# Live dashboard with auto-run
uv run issirt-incremental dashboard --auto-run --interval 15m
```

## Configuration

- **settings.yaml** - Global settings (paths, GPU config, scheduling)
- **pipelines.yaml** - Pipeline definitions and stage configurations
- **.env** - Environment-specific overrides (API keys, paths)

## Dependencies

Defined in `pipelines.yaml`. View with:

```bash
uv run issirt-incremental graph
```

Key dependencies:

- `eva` depends on `flights`
- `aggregation` depends on `comm`, `articles`, `flights`, `photos_earth`, `photos_flickr`, `clouds`, `eva`, `ephemera`
- Stage dependencies within `comm`: download → corpus → transcribe → web

## CLI Entry Point

The package installs a CLI entry point: `issirt-incremental`

```bash
uv run issirt-incremental --help
uv run issirt-incremental update
```

Or use the module form:

```bash
uv run python -m incremental --help
```
