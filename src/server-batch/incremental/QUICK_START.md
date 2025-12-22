# Quick Start

## Installation

```bash
cd src/server-batch/incremental
uv sync
```

## Setup

```bash
# Copy and edit environment config
cp .env.example .env

# Initialize database
uv run python -m incremental init
```

## Usage

```bash
# Check status
uv run python -m incremental status

# List pipelines
uv run python -m incremental list-pipelines

# Show dependency graph
uv run python -m incremental graph

# Dry run (no changes)
uv run python -m incremental run --dry-run

# Run all pipelines
uv run python -m incremental run

# Run specific pipeline
uv run python -m incremental run --pipeline flights

# Run with date range
uv run python -m incremental run --pipeline articles --since 2024-12-01

# Force reprocess
uv run python -m incremental run --pipeline articles --since 2024-12-01 --force
```

## Scheduled Execution

### Windows Task Scheduler

```
cmd /c "cd /d F:\_repos\ISSiRT\src\server-batch\incremental && uv run python -m incremental run"
```

### Linux/Mac Cron

```bash
0 */4 * * * cd /path/to/src/server-batch/incremental && uv run python -m incremental run
```
