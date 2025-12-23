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
uv run issirt-incremental init

# Run all pipelines with live progress display
uv run issirt-incremental update

# Preview what would run (dry-run)
uv run issirt-incremental update --dry-run

# Process only recent data
uv run issirt-incremental update --since 2024-12-01

# Force reprocessing
uv run issirt-incremental update --force
```

## Common Commands

```bash
# View status
uv run issirt-incremental status

# List all pipelines and stages
uv run issirt-incremental list-pipelines

# Run specific pipeline(s)
uv run issirt-incremental run -p flights
uv run issirt-incremental run -p flights -p photos_earth

# Run from a specific stage onward
uv run issirt-incremental run -p photos_flickr -s filter

# Check external sources for new data
uv run issirt-incremental check-sources

# View dependency graph
uv run issirt-incremental graph

# View errors
uv run issirt-incremental errors

# Live dashboard (view-only)
uv run issirt-incremental dashboard

# Live dashboard with auto-run every 15 minutes
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

You can run it directly after `uv sync`:
```bash
uv run issirt-incremental --help
uv run issirt-incremental update
```

Or use the module form (same functionality):
```bash
uv run python -m incremental --help
```
