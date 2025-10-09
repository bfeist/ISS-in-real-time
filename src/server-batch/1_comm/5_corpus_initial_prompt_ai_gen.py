"""
Generate AI prompt context for ISS communication transcripts.

This script processes every single day of the ISS mission, from 2000-11-01 to present,
generating AI-friendly prompt context that includes:
- Crew roster information
- Daily activity summaries
- Blog articles and news
- Communication-specific vocabulary

IMPORTANT: This script processes EVERY day in the specified range, even if some days
have missing or incomplete data. The pipeline gracefully handles missing data by:
- Using empty crew lists for dates with no crew data
- Using empty activity summaries for dates with no activity data
- Continuing to process and generate prompts even when data is sparse

Usage:
  # Process all ISS mission days (default behavior)
  python 5_corpus_initial_prompt_ai_gen.py

  # Process specific date range (includes ALL days, even with missing data)
  python 5_corpus_initial_prompt_ai_gen.py --start-date 2020-01-01 --end-date 2020-12-31

  # Process specific dates
  python 5_corpus_initial_prompt_ai_gen.py --date 2020-03-15 --date 2020-04-20
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import multiprocessing as mp
import os
import queue
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

from dotenv import load_dotenv
from rich.console import Console

from prompt_context.config import PromptContextConfig
from prompt_context.ollama import OllamaClient
from prompt_context.pipeline import PromptContextPipeline

# Commonly used ground station names and terminology
CUSTOM_TERMS = [
    "Huntsville",
    "Houston",
    "Moscow",
    "Tsukuba",
    "Munich",
    "space-to-ground",
    "Radio Procedure Language",
]

console = Console()

_worker_settings: Dict[str, object] = {}
_status_queue: Optional[mp.Queue] = None


@dataclass
class WorkerResult:
    date: str
    status: str
    characters: int = 0
    elapsed: float = 0.0
    prompt_path: Optional[str] = None
    error: Optional[str] = None


def _init_worker(settings: Dict[str, object], status_queue: Optional[mp.Queue]) -> None:
    global _worker_settings, _status_queue
    _worker_settings = settings
    _status_queue = status_queue


def _worker_task(date: str) -> WorkerResult:
    global _worker_settings, _status_queue
    settings = _worker_settings
    status_queue = _status_queue
    worker_name = mp.current_process().name

    def send(msg_type: str, payload: Dict[str, object]) -> None:
        if status_queue is not None:
            status_queue.put((msg_type, worker_name, date, payload))

    send("start", {})

    try:
        repo_root = Path(settings["repo_root"])  # type: ignore[index]
        env_file = settings.get("env_file")  # type: ignore[attr-defined]
        custom_terms = settings.get("custom_terms", [])  # type: ignore[attr-defined]
        config = PromptContextConfig(
            repo_root=repo_root,
            env_file=Path(env_file) if env_file else None,
            custom_terms=list(custom_terms) if custom_terms else [],
        )

        ollama_kwargs = {}
        if settings.get("model"):
            ollama_kwargs["default_model"] = settings["model"]
        if settings.get("request_timeout"):
            ollama_kwargs["request_timeout"] = settings["request_timeout"]
        if settings.get("max_retries"):
            ollama_kwargs["max_retries"] = settings["max_retries"]
        if settings.get("retry_backoff"):
            ollama_kwargs["retry_backoff"] = settings["retry_backoff"]

        ollama = OllamaClient(**ollama_kwargs)
        pipeline = PromptContextPipeline(config, ollama)

        def status_callback(stage: str, payload: Dict[str, object]) -> None:
            send("phase", {"stage": stage, **payload})

        def on_event(event: Dict[str, object]) -> None:
            # Capture both thinking and response
            thinking = event.get("thinking")
            response = event.get("response")
            debug = event.get("debug")

            if settings.get("debug_stream"):
                import sys

                if debug:
                    sys.stderr.write(f"[DEBUG] {debug}\n")
                    sys.stderr.flush()
                if thinking:
                    sys.stderr.write(f"[THINKING] {thinking}")
                    sys.stderr.flush()
                if response:
                    sys.stderr.write(f"[RESPONSE] {response}")
                    sys.stderr.flush()

            # Send debug messages
            if isinstance(debug, str) and debug:
                send("stream", {"chunk": debug, "type": "debug"})

            # Send thinking steps
            if isinstance(thinking, str) and thinking:
                send("stream", {"chunk": thinking, "type": "thinking"})

            # Send response chunks
            if isinstance(response, str) and response:
                send("stream", {"chunk": response, "type": "response"})

        result = pipeline.process_date(
            date,
            force=bool(settings.get("force")),
            on_event=on_event,
            status_callback=status_callback,
        )
        if result.skipped:
            send(
                "skipped",
                {
                    "characters": result.characters,
                    "elapsed": result.elapsed_seconds,
                    "prompt_path": str(result.prompt_path),
                },
            )
        else:
            send(
                "done",
                {
                    "characters": result.characters,
                    "elapsed": result.elapsed_seconds,
                    "prompt_path": str(result.prompt_path),
                },
            )
        return WorkerResult(
            date=date,
            status="skipped" if result.skipped else "ok",
            characters=result.characters,
            elapsed=result.elapsed_seconds,
            prompt_path=str(result.prompt_path),
        )
    except Exception as exc:  # pylint: disable=broad-except
        send("error", {"error": str(exc)})
        return WorkerResult(date=date, status="error", error=str(exc))


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pre-compute daily prompt context inputs for every day, including days with missing data"
    )
    parser.add_argument(
        "--date",
        action="append",
        help="Specific YYYY-MM-DD date to process (can be specified multiple times)",
        dest="dates",
    )
    parser.add_argument(
        "--start-date",
        help="Inclusive start date (YYYY-MM-DD). When used with --end-date, processes EVERY day in the range",
    )
    parser.add_argument(
        "--end-date",
        help="Inclusive end date (YYYY-MM-DD). When used with --start-date, processes EVERY day in the range",
    )
    parser.add_argument(
        "--dates-file",
        type=Path,
        help="Path to file containing dates (one per line)",
    )
    parser.add_argument("--env-file", type=Path, help="Override path to .env file")
    parser.add_argument(
        "--all-days",
        action="store_true",
        help="Process all ISS mission days from 2000-11-01 to today (default when no dates specified)",
    )
    parser.add_argument(
        "--model", help="Override default Ollama model (default: qwen3:14b)"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=os.cpu_count() or 2,
        help="Number of parallel workers",
    )
    parser.add_argument(
        "--force", action="store_true", help="Regenerate even if prompt already exists"
    )
    parser.add_argument(
        "--monitor", action="store_true", help="Display Rich live monitor"
    )
    parser.add_argument(
        "--debug-stream",
        action="store_true",
        help="Print streaming chunks to console for debugging",
    )
    parser.add_argument("--dry-run", action="store_true", help="List dates and exit")
    parser.add_argument(
        "--request-timeout",
        type=int,
        default=300,
        help="Ollama request timeout (seconds)",
    )
    parser.add_argument(
        "--max-retries", type=int, default=3, help="Max retries per Ollama request"
    )
    parser.add_argument(
        "--retry-backoff", type=float, default=2.0, help="Retry backoff multiplier"
    )
    return parser.parse_args(argv)


def collect_dates(args: argparse.Namespace, config: PromptContextConfig) -> List[str]:
    dates: set[str] = set()
    if args.dates:
        dates.update(args.dates)
    if args.dates_file and args.dates_file.exists():
        for line in args.dates_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                dates.add(line)
    if args.start_date and args.end_date:
        start = dt.datetime.strptime(args.start_date, "%Y-%m-%d").date()
        end = dt.datetime.strptime(args.end_date, "%Y-%m-%d").date()
        if start > end:
            raise ValueError("start-date must be <= end-date")
        delta = dt.timedelta(days=1)
        current = start
        while current <= end:
            dates.add(current.strftime("%Y-%m-%d"))
            current += delta

    # Process all ISS mission days if explicitly requested or if no dates specified
    if not dates or args.all_days:
        # Default: process every day from ISS mission start to today
        # This ensures all days are processed, even if data is missing for some days
        start = dt.date(2000, 11, 1)  # ISS mission start date
        end = dt.date.today()
        console.print(
            f"[yellow]Processing all ISS mission days: {start} to {end} ({(end - start).days + 1} days total)[/yellow]"
        )
        delta = dt.timedelta(days=1)
        current = start
        while current <= end:
            dates.add(current.strftime("%Y-%m-%d"))
            current += delta

    if not dates:
        raise ValueError(
            "No dates provided. Use --date, --start-date/--end-date, or --all-days to specify dates."
        )

    return sorted(dates)


def discover_ia_sg_dates(env_file: Optional[Path]) -> List[str]:
    if env_file:
        load_dotenv(env_file)
    else:
        load_dotenv()

    folder = os.getenv("IA_ZIP_SG_FOLDER")
    if not folder or not os.path.exists(folder):
        return []

    dates = set()
    for f in os.listdir(folder):
        if f.lower().endswith(".zip"):
            try:
                parts = [f[0:2], f[3:5], f[6:8]]
                date_str = f"20{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
                dt.datetime.strptime(date_str, "%Y-%m-%d")
                dates.add(date_str)
            except (ValueError, IndexError):
                pass
    return sorted(list(dates))


def run_sequential(
    dates: Sequence[str], settings: Dict[str, object], monitor: bool
) -> List[WorkerResult]:
    results: List[WorkerResult] = []

    # If monitor is enabled, use a queue even in sequential mode
    if monitor:
        ctx = mp.get_context("spawn")
        status_queue = ctx.Queue()
        _init_worker(settings, status_queue)

        # Process in a simple loop but monitor via queue in another thread
        import threading

        worker_states: Dict[str, Dict[str, object]] = {}
        completed = 0

        def process_queue():
            nonlocal completed
            console.print("[bold cyan]=== Prompt Context Monitor ===[/bold cyan]")
            console.print(f"[dim]Processing {len(dates)} dates[/dim]\n")

            while completed < len(dates):
                try:
                    msg_type, worker, date, payload = status_queue.get(timeout=0.25)
                    state = worker_states.setdefault(
                        worker,
                        {
                            "stage": "idle",
                            "stream": "",
                            "thinking": "",
                            "response": "",
                            "message": "",
                        },
                    )
                    state["date"] = date

                    if msg_type == "start":
                        console.print(
                            f"[cyan]▶[/cyan] [bold]{date}[/bold] - Starting..."
                        )
                        state["stage"] = "start"
                        state["stream"] = ""
                        state["thinking"] = ""
                        state["response"] = ""
                    elif msg_type == "phase":
                        stage = payload.get("stage", "phase")
                        state["stage"] = stage
                        state["message"] = payload
                        state["stream"] = ""
                        state["thinking"] = ""
                        state["response"] = ""

                        # Print phase changes
                        stage_display = {
                            "crew": "👥 Building crew roster",
                            "brief": "📋 Building daily brief",
                            "prompt": "✨ Generating prompt",
                        }.get(stage, f"⚙️  {stage}")
                        console.print(f"  [blue]{stage_display}[/blue]")

                    elif msg_type == "stream":
                        chunk = payload.get("chunk", "")
                        chunk_type = payload.get("type", "response")

                        if chunk:
                            if chunk_type == "debug":
                                # Print debug messages on their own line
                                console.print(f"[dim cyan]{chunk}[/dim cyan]")
                            elif chunk_type == "thinking":
                                current = state.get("thinking", "")
                                state["thinking"] = current + chunk
                                # Print thinking output as it arrives
                                console.print(f"[yellow]{chunk}[/yellow]", end="")
                            else:
                                current = state.get("response", "")
                                state["response"] = current + chunk
                                # Print response output as it arrives
                                console.print(chunk, end="")

                            state["stage"] = "generating"
                            state["message"] = ""

                    elif msg_type == "done":
                        completed += 1
                        state["stage"] = "done"
                        state["message"] = payload
                        console.print()  # Newline after streaming
                        thinking = state.get("thinking", "")
                        response = state.get("response", "")
                        if thinking:
                            console.print(f"thinking: {thinking}")
                        if response:
                            console.print(f"output: {response}")
                        console.print(
                            f"  [green]✓[/green] Complete: {payload.get('characters')} chars "
                            f"in {payload.get('elapsed', 0):.2f}s"
                        )
                        console.print(f"  [dim]{payload.get('prompt_path')}[/dim]\n")

                    elif msg_type == "error":
                        completed += 1
                        state["stage"] = "error"
                        state["message"] = payload
                        console.print()
                        thinking = state.get("thinking", "")
                        response = state.get("response", "")
                        if thinking:
                            console.print(f"thinking: {thinking}")
                        if response:
                            console.print(f"output: {response}")
                        console.print(f"  [red]✗[/red] Error: {payload.get('error')}\n")

                    elif msg_type == "skipped":
                        completed += 1
                        state["stage"] = "skipped"
                        # No print for skipped days

                except queue.Empty:
                    pass

            console.print(
                f"[bold cyan]=== Completed {completed}/{len(dates)} dates ===[/bold cyan]"
            )

        monitor_thread = threading.Thread(target=process_queue, daemon=True)
        monitor_thread.start()

        for date in dates:
            result = _worker_task(date)
            results.append(result)

        monitor_thread.join(timeout=5)
    else:
        _init_worker(settings, None)
        for date in dates:
            result = _worker_task(date)
            results.append(result)
            if result.status != "skipped":
                console.print(f"Processing {date}")
                console.print(f"[green]Completed {date}[/green]")

    return results


def monitor_loop(status_queue: mp.Queue, total: int) -> Dict[str, WorkerResult]:
    worker_states: Dict[str, Dict[str, object]] = {}
    completed = 0
    results: Dict[str, WorkerResult] = {}

    console.print("[bold cyan]=== Prompt Context Monitor (Parallel) ===[/bold cyan]")
    console.print(f"[dim]Processing {total} dates with multiple workers[/dim]\n")

    while completed < total:
        try:
            msg_type, worker, date, payload = status_queue.get(timeout=0.25)
        except queue.Empty:
            continue

        state = worker_states.setdefault(
            worker,
            {
                "stage": "idle",
                "stream": "",
                "thinking": "",
                "response": "",
                "message": "",
            },
        )
        state["date"] = date

        if msg_type == "start":
            console.print(
                f"[cyan]▶[/cyan] [bold]{date}[/bold] [{worker}] - Starting..."
            )
            state["stage"] = "start"
            state["stream"] = ""
            state["thinking"] = ""
            state["response"] = ""
            state["message"] = ""

        elif msg_type == "phase":
            stage = payload.get("stage", "phase")
            state["stage"] = stage
            state["message"] = payload
            state["stream"] = ""
            state["thinking"] = ""
            state["response"] = ""

            # Print phase changes with worker name
            stage_display = {
                "crew": "👥 Building crew roster",
                "brief": "📋 Building daily brief",
                "prompt": "✨ Generating prompt",
            }.get(stage, f"⚙️  {stage}")
            console.print(f"  [blue][{worker}] {stage_display}[/blue]")

        elif msg_type == "stream":
            chunk = payload.get("chunk", "")
            chunk_type = payload.get("type", "response")

            if chunk:
                if chunk_type == "debug":
                    # Print debug messages on their own line
                    console.print(f"[dim cyan][{worker}] {chunk}[/dim cyan]")
                elif chunk_type == "thinking":
                    current = state.get("thinking", "")
                    state["thinking"] = current + chunk
                    # Print thinking output as it arrives
                    console.print(f"[yellow]{chunk}[/yellow]", end="")
                else:
                    current = state.get("response", "")
                    state["response"] = current + chunk
                    # Print response output as it arrives
                    console.print(chunk, end="")

                state["stage"] = "generating"
                state["message"] = ""

        elif msg_type == "done":
            completed += 1
            state["stage"] = "done"
            state["message"] = payload
            console.print()  # Newline after streaming
            thinking = state.get("thinking", "")
            response = state.get("response", "")
            if thinking:
                console.print(f"thinking: {thinking}")
            if response:
                console.print(f"output: {response}")
            console.print(
                f"  [green]✓[/green] [{worker}] Complete: {payload.get('characters')} chars "
                f"in {payload.get('elapsed', 0):.2f}s"
            )
            console.print(f"  [dim]{payload.get('prompt_path')}[/dim]")
            console.print(f"  [dim]Progress: {completed}/{total}[/dim]\n")

            results[date] = WorkerResult(
                date=date,
                status="ok",
                characters=int(payload.get("characters", 0)),
                elapsed=float(payload.get("elapsed", 0.0)),
                prompt_path=payload.get("prompt_path"),
            )

        elif msg_type == "error":
            completed += 1
            state["stage"] = "error"
            state["message"] = payload
            console.print()
            thinking = state.get("thinking", "")
            response = state.get("response", "")
            if thinking:
                console.print(f"thinking: {thinking}")
            if response:
                console.print(f"output: {response}")
            console.print(f"  [red]✗[/red] [{worker}] Error: {payload.get('error')}")
            console.print(f"  [dim]Progress: {completed}/{total}[/dim]\n")

            results[date] = WorkerResult(
                date=date, status="error", error=str(payload.get("error"))
            )

        elif msg_type == "skipped":
            completed += 1
            state["stage"] = "skipped"
            # No print for skipped days
            results[date] = WorkerResult(
                date=date,
                status="skipped",
                characters=int(payload.get("characters", 0)),
                elapsed=float(payload.get("elapsed", 0.0)),
                prompt_path=payload.get("prompt_path"),
            )

    console.print(f"[bold cyan]=== Completed {completed}/{total} dates ===[/bold cyan]")
    return results


def run_parallel(
    dates: Sequence[str], settings: Dict[str, object], monitor: bool, workers: int
) -> List[WorkerResult]:
    ctx = mp.get_context("spawn")
    status_queue: Optional[mp.Queue] = ctx.Queue() if monitor else None
    with ctx.Pool(
        processes=workers,
        initializer=_init_worker,
        initargs=(settings, status_queue),
    ) as pool:
        async_result = pool.map_async(_worker_task, dates)
        gathered_results: Dict[str, WorkerResult] = {}
        if monitor and status_queue is not None:
            gathered_results = monitor_loop(status_queue, len(dates))
        results = async_result.get()

    if monitor and gathered_results:
        return [gathered_results.get(result.date, result) for result in results]
    return results


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    repo_root = Path(__file__).resolve().parents[3]
    env_file = args.env_file if args.env_file else repo_root / ".env"
    config = PromptContextConfig(
        repo_root=repo_root, env_file=env_file if env_file.exists() else None
    )

    try:
        dates = collect_dates(args, config)
    except ValueError as exc:
        console.print(f"[red]Error:[/red] {exc}")
        return 1

    if args.dry_run:
        console.print("Dry run: the following dates would be processed:")
        for date in dates:
            console.print(f" - {date}")
        return 0

    settings: Dict[str, object] = {
        "repo_root": str(repo_root),
        "env_file": str(env_file) if env_file and env_file.exists() else None,
        "force": args.force,
        "model": args.model,
        "request_timeout": args.request_timeout,
        "max_retries": args.max_retries,
        "retry_backoff": args.retry_backoff,
        "debug_stream": args.debug_stream,
        "custom_terms": CUSTOM_TERMS,
    }

    if args.workers <= 1:
        results = run_sequential(dates, settings, args.monitor)
    else:
        results = run_parallel(dates, settings, args.monitor, args.workers)

    successes = [res for res in results if res.status == "ok"]
    failures = [res for res in results if res.status != "ok"]

    console.print("\n[bold]Summary[/bold]")
    for res in successes:
        console.print(
            f"[green]✓[/green] {res.date}: {res.characters} chars in {res.elapsed:.2f}s ({res.prompt_path})"
        )
    for res in failures:
        console.print(f"[red]✗[/red] {res.date}: {res.error}")

    return 0 if not failures else 2


if __name__ == "__main__":
    mp.freeze_support()
    sys.exit(main())
