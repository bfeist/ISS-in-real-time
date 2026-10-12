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
| comm          | ISS audio comms (download → corpus → transcribe → web) | WhisperX, LM Studio |
| flights       | Station flights, supply missions, crew arrivals, expeditions | -           |
| photos_earth  | Earth photography from NASA EOL                        | -                |
| photos_flickr | JSC Flickr photos with AI classification               | LM Studio           |
| clouds        | Cloud cover availability data                          | -                |
| eva           | EVA (spacewalk) information                            | -                |
| ephemera      | Ephemera and orbit count                               | -                |
| aggregation   | Data availability and aggregated stats                 | -                |

## Other Commands

The flights pipeline refreshes incomplete or ongoing expedition metadata from
NASA and checks consecutive new expedition numbers, stopping at the first 404.
Completed expeditions are skipped. Existing patch URLs are reused; missing patches
are retried at most weekly using a local `3_flights/.cache/` file. Each Commons
lookup uses at most three batched requests, paced one second apart.

```bash
# View status of all pipelines
uv run issirt-incremental status

# List all pipelines and stages
uv run issirt-incremental list-pipelines

# Run specific pipeline with more control (alternative to update)
uv run issirt-incremental run -p flights
# Stage selection is not supported; use -p to select a whole pipeline.

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

LLM stages use the LM Studio server at `http://localhost:1234` (`LMSTUDIO_HOST`
overrides the host). Start it with `lms server start --port 1234` when ready to
run the pipeline. No model needs to be loaded manually.

The corpus stage uses the existing `gemma-4-12b-it-qat` model; Flickr
classification uses the existing `qwen3.8-27b` model. Change `lmstudio_model` in
`pipelines.yaml` to select a different installed model. Standalone scripts accept
`LMSTUDIO_MODEL`; the corpus script also accepts `--model`.

The orchestrator loads models with a 16,384-token context and unloads them at
stage boundaries. It also unloads all LM Studio model instances before WhisperX
starts. Load or unload failures stop the stage rather than proceeding with
uncertain GPU availability. Avoid using LM Studio interactively during GPU stages.

Generation uses LM Studio's [native chat and streaming API](https://lmstudio.ai/docs/developer/rest/chat),
with reasoning disabled and chat storage disabled for these batch requests.
The original three Ollama weights were copied into
`C:\Users\Feist\.lmstudio\models\imported-ollama` before uninstalling Ollama;
the pipeline defaults use the existing newer models above. The SQLite schema's
unused `ollama_model` column is retained for compatibility with existing databases.

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

## Execution guarantees and limits

Before running scripts, the runner validates and orders pipeline and stage
dependencies, including cross-pipeline stage dependencies. Invalid references and
cycles stop the update before scripts run. Failed prerequisites block dependent
work; independent pipelines can continue. Disabled stages are not executed.

Partial updates with `-p` or `--skip` use existing outputs from omitted enabled
pipelines. No extra pipelines are automatically added. Misspelled pipeline names
are errors rather than successful empty updates.

Stage attempts and failures are recorded for `status` and `errors`. The source
scripts still own incremental file/archive completion; the runner does not treat
a batch script's exit code as proof that every date was processed. `retry` and
`reset` remain unimplemented.

`--since` applies where argument templates support dates, including the comm ZIP
date range. Scripts with fixed lookback windows or no date arguments keep their
existing behavior. Dry runs show the currently discoverable work and arguments,
without starting scripts, using the GPU, or writing the persistent database.

See [the architecture guide](../../../ARCHITECTURE.md) for details and validation
limits.

## Offline regression tests

From this directory, after `uv sync`:

```bash
uv run python -m unittest discover -s tests -v
```

These tests use temporary files and in-memory SQLite; they do not download mission
data or contact GPU services. A few fixtures launch short local Python subprocesses
to check exit codes, timeouts, and cancellation.

If a Windows terminal or redirected output cannot encode the Unicode status icons,
use UTF-8 mode, for example:

```bash
uv run python -X utf8 -m incremental update --dry-run
```
