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
| comm          | ISS audio comms (download → corpus → transcribe → web) | WhisperX, Strata |
| flights       | Station flights, supply missions, crew arrivals, expeditions | -           |
| photos_earth  | Earth photography from NASA EOL                        | -                |
| photos_flickr | JSC Flickr photos with AI classification               | Strata           |
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

IQ3_S is the supported quantization. All LLM stages use local Strata with **Qwen3.8-Flash-Next IQ3_S**
(model ID `iq3_s`) at `http://127.0.0.1:47831/v1`. This includes corpus prompt
context, Flickr classification, and the standalone summary scripts under `ai/`.
Start the Strata desktop app before running them.

`STRATA_BASE_URL` and `STRATA_MODEL` override the defaults for standalone scripts;
the corpus script also accepts `--model`. The orchestrator uses `strata_base_url`
and `strata_default_model` from `settings.yaml` (with the same environment
overrides), and passes the selected stage's `strata_model` from `pipelines.yaml`
to its subprocess. Set `STRATA_API_KEY` only if you enable API authentication.

Generation uses Strata's OpenAI-compatible `/v1/chat/completions` endpoint with
streaming and medium reasoning effort (`reasoning_effort: medium`). The pipeline monitor still receives answer,
thinking, token-count, and timing events.

Flickr classification streams each photo's reasoning into the incremental update
log as `Photo <id> / worker <id> REASONING: ...`, then prints `FINAL OUTPUT` and
`CLASSIFICATION` when the response completes. Lines are flushed immediately so
reasoning remains visible while inference runs, including with multiple workers.

The orchestrator uses Strata Control's local `/api/native` API to reuse or load
the stage's model and wait until it is ready. It retains IQ3_S between
photo classification and comm corpus generation, then unloads all native Strata instances
before WhisperX starts. Any retained model is also unloaded when the update ends,
including on failure or cancellation. Failures
stop the stage. If Strata is offline and this run has no tracked Strata model,
WhisperX can start without it. A tracked model, an unload failure, or an
unresponsive Strata server still blocks the handoff. LLM stages require Strata
to be running. Context length and GPU placement use your saved Strata settings.
Avoid running interactive Strata requests during pipeline GPU stages.

WhisperX retries a CUDA failure once after reloading the GPU model. If the reload
or CUDA retry fails, transcription stops with an error; it never switches to CPU.
The script selects Silero for voice activity detection and logs the current WAV
and GPU operation. Failed subprocess reports include the exit code, stderr, and
recent stdout so startup warnings cannot hide a later native crash.

Comm transcription output keeps each WAV filename on one logical line and shows
its transcript after processing. Foreign-language WAVs include both the original
transcript (labeled with the detected language code) and the English translation.
The transcribe stage enables this with `--see-transcriptions` in `pipelines.yaml`.

The corpus stage checks `comm_corpus_log` in `comm_transcription_log.sqlite3`
with `--zip-dates --check-work`, so a run with no corpuses to generate never loads
the model. Existing nonempty corpus files are imported as completed once. Later
runs use database status, without rechecking old metadata or summaries. Missing,
pending, failed, and interrupted database records are eligible for generation;
`--force` also selects completed corpuses. Only actual local ZIP dates are
considered, respecting explicit date bounds, without filling intervening days.
Corpus requests use low reasoning effort. A replaced ZIP resets transcription
status without invalidating its completed corpus.

The incremental corpus stage enables `--show-output`: each digest logs Strata's
`REASONING` and `TEXT` as it streams, labeled with the date, worker, and phase
(`brief` or `prompt`). `FINAL OUTPUT` shows the saved corpus after any refinement
or truncation. Lines are bounded and flushed so they appear during inference;
partial output is also flushed on failure. Use the same flag when running
`5_corpus_initial_prompt_ai_gen.py` directly.

Stages can opt into this preflight with `work_check_args`; the script
receives its normal arguments plus these flags and must exit successfully with
JSON `{"needs_work": true}` or `{"needs_work": false}`.

The SQLite schema's unused `ollama_model` column is retained for compatibility
with existing databases.

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

The update completes the other data pipelines (including Flickr classification),
then runs the entire comm pipeline: download → corpus → transcribe → web.
Aggregation runs afterward so it includes the new transcripts. Partial updates
keep the same pipeline IDs and only run the selected pipelines.

Comm ZIP completion, pending, error, and skip status all come from
`src/server-batch/comm_transcription_log.sqlite3`. Discovery and status displays
use each ZIP's latest transcription-version record. The `ia_zips_processed.txt`,
`ia_zips_in_progress.txt`, `ia_zips_errors.txt`, and `ia_skip_zips.txt` status files
are no longer read or updated by incremental comm runs.
Existing SQLite records are retained; no text-file import is performed.

When the download stage replaces a ZIP whose size differs from Internet Archive's
metadata, it resets that date's non-skipped ZIP records and day summary to
`pending` after the replacement succeeds. Incremental discovers pending ZIPs in
both comm folders even outside the usual 30-day file modification window, so the
next transcription stage retries them without `--force`. This age exception
applies to explicit ZIP replacement invalidations, not unrelated historical
pending rows. Failed downloads and
dry runs leave completion status unchanged.

Historical completions under earlier transcription versions remain completed
unless their latest SQLite record explicitly invalidates them or `--force` is
requested. Transcription receives exact selected dates in bounded batches,
instead of processing intervening dates in a continuous range. Archived text
completion records were reconciled once where SQLite had stale pending status;
the text files remain backups and are not consulted during normal runs.

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
