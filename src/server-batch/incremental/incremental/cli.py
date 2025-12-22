"""
Command-line interface for the incremental update system.

Usage:
    uv run python -m incremental [command] [options]

Commands:
    init        Initialize the state database
    status      Show system status
    run         Run pipelines
    dashboard   Start the live dashboard
    errors      View error log
    retry       Retry failed items
    reset       Reset pipeline state
"""

import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

from . import __version__
from .config import Settings, load_settings, create_default_config_files
from .state import StateDatabase, ZipFileTracker
from .models import Status


console = Console()


def get_settings(ctx: click.Context) -> Settings:
    """Get settings from context, loading if needed."""
    if "settings" not in ctx.obj:
        config_dir = ctx.obj.get("config_dir")
        ctx.obj["settings"] = load_settings(config_dir)
    return ctx.obj["settings"]


def get_state_db(ctx: click.Context) -> StateDatabase:
    """Get state database from context, creating if needed."""
    if "state_db" not in ctx.obj:
        settings = get_settings(ctx)
        ctx.obj["state_db"] = StateDatabase(settings.db_path)
    return ctx.obj["state_db"]


@click.group()
@click.version_option(version=__version__, prog_name="issirt-incremental")
@click.option(
    "--config-dir",
    "-c",
    type=click.Path(exists=False, file_okay=False, path_type=Path),
    default=None,
    help="Configuration directory (default: auto-detect)",
)
@click.option("--debug/--no-debug", default=False, help="Enable debug output")
@click.pass_context
def main(ctx: click.Context, config_dir: Optional[Path], debug: bool) -> None:
    """ISSiRT Incremental Update System

    Orchestrates data pipeline updates for the ISS Real-Time website.
    """
    ctx.ensure_object(dict)
    ctx.obj["config_dir"] = config_dir
    ctx.obj["debug"] = debug


@main.command()
@click.option("--force", is_flag=True, help="Reinitialize even if already exists")
@click.pass_context
def init(ctx: click.Context, force: bool) -> None:
    """Initialize the state database and configuration files."""
    config_dir = ctx.obj.get("config_dir") or Path(__file__).parent.parent

    console.print(f"[bold]Initializing ISSiRT Incremental Update System[/bold]")
    console.print(f"Config directory: {config_dir}")

    # Create default config files
    console.print("\n[dim]Creating configuration files...[/dim]")
    create_default_config_files(config_dir)
    console.print("  ✓ settings.yaml")
    console.print("  ✓ pipelines.yaml")
    console.print("  ✓ .env.example")

    # Initialize database
    settings = load_settings(config_dir)
    console.print(f"\n[dim]Initializing database at {settings.db_path}...[/dim]")

    if settings.db_path.exists() and not force:
        console.print(
            "  [yellow]Database already exists. Use --force to reinitialize.[/yellow]"
        )
    else:
        if settings.db_path.exists():
            settings.db_path.unlink()
        db = StateDatabase(settings.db_path)
        console.print("  ✓ Database initialized")

    console.print("\n[green bold]✓ Initialization complete![/green bold]")
    console.print("\nNext steps:")
    console.print("  1. Copy .env.example to .env and configure paths")
    console.print("  2. Edit pipelines.yaml to match your pipeline scripts")
    console.print("  3. Run: [cyan]uv run python -m incremental status[/cyan]")


@main.command()
@click.option("--pipeline", "-p", help="Show status for specific pipeline")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed status")
@click.pass_context
def status(ctx: click.Context, pipeline: Optional[str], verbose: bool) -> None:
    """Show system status."""
    settings = get_settings(ctx)
    db = get_state_db(ctx)

    # Overall stats
    stats = db.get_overall_stats()

    console.print(
        Panel(
            f"[bold]ISSiRT Incremental Update System[/bold] v{__version__}\n"
            f"Database: {settings.db_path}",
            title="Status",
        )
    )

    # Quick stats table
    stats_table = Table(show_header=False, box=None)
    stats_table.add_column("Metric", style="dim")
    stats_table.add_column("Value", style="bold")
    stats_table.add_row("Active Runs", str(stats.get("active_runs", 0)))
    stats_table.add_row("Pending Dates", str(stats.get("pending_dates", 0)))
    stats_table.add_row("Failed Dates", str(stats.get("failed_dates", 0)))
    stats_table.add_row("Unresolved Errors", str(stats.get("unresolved_errors", 0)))
    console.print(stats_table)

    # Pipeline status
    console.print("\n[bold]Pipelines:[/bold]")
    pipeline_table = Table()
    pipeline_table.add_column("Pipeline", style="cyan")
    pipeline_table.add_column("Status")
    pipeline_table.add_column("Last Run")
    pipeline_table.add_column("Pending")
    pipeline_table.add_column("Failed")

    for pid, pconfig in settings.pipelines.items():
        if pipeline and pid != pipeline:
            continue

        # Get pipeline stats
        pstats = db.get_pipeline_stats(pid)
        recent_runs = db.get_recent_runs(pipeline_id=pid, limit=1)

        status_text = "✓ idle" if pconfig.enabled else "[dim]disabled[/dim]"
        if any(r.is_running for r in recent_runs):
            status_text = "[yellow]● running[/yellow]"
        elif pstats.get("failed", 0) > 0:
            status_text = "[red]✗ has errors[/red]"

        last_run = (
            recent_runs[0].started_at.strftime("%Y-%m-%d %H:%M") if recent_runs else "-"
        )

        pipeline_table.add_row(
            pconfig.name,
            status_text,
            last_run,
            str(pstats.get("pending", 0)),
            str(pstats.get("failed", 0)),
        )

    console.print(pipeline_table)

    # ZIP file tracking status
    zip_tracker = ZipFileTracker(settings.paths.server_batch_dir)
    zip_summary = zip_tracker.get_summary()

    console.print("\n[bold]ZIP File Tracking:[/bold]")
    zip_table = Table(show_header=False, box=None)
    zip_table.add_column("Status", style="dim")
    zip_table.add_column("Count", style="bold")
    zip_table.add_row("Processed", str(zip_summary["processed"]))
    zip_table.add_row("In Progress", str(zip_summary["in_progress"]))
    zip_table.add_row("Errors", str(zip_summary["errors"]))
    zip_table.add_row("Skipped", str(zip_summary["skipped"]))
    console.print(zip_table)

    if verbose:
        # Show recent activity
        console.print("\n[bold]Recent Activity:[/bold]")
        activity = db.get_recent_activity(limit=10)
        for entry in activity:
            level_style = {
                "info": "dim",
                "success": "green",
                "warning": "yellow",
                "error": "red",
            }.get(entry.level, "")
            console.print(
                f"  [{level_style}]{entry.timestamp.strftime('%H:%M:%S')} {entry.message}[/{level_style}]"
            )


@main.command("list-pipelines")
@click.pass_context
def list_pipelines(ctx: click.Context) -> None:
    """List all configured pipelines."""
    settings = get_settings(ctx)

    console.print("[bold]Configured Pipelines:[/bold]\n")

    for pid, pconfig in settings.pipelines.items():
        enabled = "[green]enabled[/green]" if pconfig.enabled else "[dim]disabled[/dim]"
        console.print(f"[cyan bold]{pid}[/cyan bold] - {pconfig.name} ({enabled})")

        if pconfig.depends_on:
            console.print(f"  Depends on: {', '.join(pconfig.depends_on)}")
        if pconfig.monitor:
            console.print(f"  Monitor: {pconfig.monitor}")

        console.print(f"  Stages:")
        for stage in pconfig.stages:
            gpu_info = ""
            if stage.requires_gpu:
                gpu_info = f" [yellow][GPU: {stage.gpu_task_type.value}][/yellow]"
            console.print(f"    • {stage.id}: {stage.name}{gpu_info}")
        console.print()


@main.command("check-sources")
@click.option("--source", "-s", help="Check specific source only")
@click.pass_context
def check_sources(ctx: click.Context, source: Optional[str]) -> None:
    """Check external sources for new data."""
    import asyncio
    from .monitors import get_monitor, get_all_monitors, list_available_sources

    settings = get_settings(ctx)
    cache_dir = settings.paths.cache_dir
    cache_dir.mkdir(parents=True, exist_ok=True)

    async def check_all():
        if source:
            # Check specific source
            monitor = get_monitor(source, cache_dir)
            if not monitor:
                console.print(f"[red]Unknown source: {source}[/red]")
                console.print(f"Available: {', '.join(list_available_sources())}")
                return
            monitors = [monitor]
        else:
            # Check all sources
            monitors = get_all_monitors(cache_dir)

        console.print("[bold]Checking sources for new data...[/bold]\n")

        table = Table(title="Source Check Results")
        table.add_column("Source", style="cyan")
        table.add_column("Has New Data")
        table.add_column("Newest Date")
        table.add_column("Items")
        table.add_column("Details")

        for monitor in monitors:
            async with monitor:
                result = await monitor.check()

            if result.error:
                table.add_row(
                    monitor.name,
                    "[red]Error[/red]",
                    "-",
                    "-",
                    f"[red]{result.error}[/red]",
                )
            else:
                has_new = (
                    "[green]Yes[/green]" if result.has_new_data else "[dim]No[/dim]"
                )
                newest = result.newest_date.isoformat() if result.newest_date else "-"
                count = str(result.item_count) if result.item_count else "-"
                details = (
                    str(result.details.get("message", ""))[:40]
                    if result.details
                    else ""
                )
                table.add_row(monitor.name, has_new, newest, count, details)

        console.print(table)

    asyncio.run(check_all())


@main.command()
@click.option("--pipeline", "-p", multiple=True, help="Run specific pipeline(s)")
@click.option("--stage", "-s", help="Run specific stage only")
@click.option(
    "--since", type=click.DateTime(formats=["%Y-%m-%d"]), help="Process since date"
)
@click.option(
    "--until", type=click.DateTime(formats=["%Y-%m-%d"]), help="Process until date"
)
@click.option("--force", is_flag=True, help="Force reprocess even if complete")
@click.option(
    "--dry-run", is_flag=True, help="Show what would be done without doing it"
)
@click.pass_context
def run(
    ctx: click.Context,
    pipeline: tuple[str, ...],
    stage: Optional[str],
    since: Optional[datetime],
    until: Optional[datetime],
    force: bool,
    dry_run: bool,
) -> None:
    """Run pipeline updates."""
    import asyncio
    from .orchestrator import Orchestrator

    settings = get_settings(ctx)
    db = get_state_db(ctx)
    zip_tracker = ZipFileTracker(settings.paths.server_batch_dir)

    # Determine which pipelines to run
    pipelines_to_run = list(pipeline) if pipeline else None  # None = all enabled

    console.print(
        f"[bold]Running pipelines: {', '.join(pipelines_to_run) if pipelines_to_run else 'all enabled'}[/bold]"
    )
    if dry_run:
        console.print("[yellow]DRY RUN - no changes will be made[/yellow]")

    # Progress callback for console output
    def on_progress(pipeline_id: str, stage_id: str, message: str) -> None:
        console.print(f"  [{pipeline_id}.{stage_id}] {message}")

    # Create orchestrator and run
    orchestrator = Orchestrator(
        settings=settings,
        state_db=db,
        zip_tracker=zip_tracker,
    )

    try:
        result = asyncio.run(
            orchestrator.run_pipelines(
                pipeline_ids=pipelines_to_run,
                since=since.date() if since else None,
                until=until.date() if until else None,
                force=force,
                dry_run=dry_run,
                on_progress=on_progress,
            )
        )

        # Show results
        console.print()
        if result.success:
            console.print("[bold green]✓ Run complete[/bold green]")
        else:
            console.print("[bold red]✗ Run completed with errors[/bold red]")

        console.print(f"  Pipelines: {result.pipelines_run}")
        console.print(f"  Stages: {result.stages_run}")
        console.print(f"  Items processed: {result.items_processed}")
        console.print(f"  Items failed: {result.items_failed}")
        console.print(f"  Duration: {result.duration_seconds:.1f}s")

        if result.errors:
            console.print("\n[bold red]Errors:[/bold red]")
            for err in result.errors[:5]:  # Show first 5
                console.print(f"  • {err}")
            if len(result.errors) > 5:
                console.print(f"  ... and {len(result.errors) - 5} more")

        sys.exit(0 if result.success else 1)

    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted - shutting down...[/yellow]")
        asyncio.run(orchestrator.shutdown())
        sys.exit(130)
    except Exception as e:
        console.print(f"[bold red]Error: {e}[/bold red]")
        if ctx.obj.get("debug"):
            console.print_exception()
        sys.exit(1)


@main.command()
@click.option("--pipeline", "-p", help="Filter by pipeline")
@click.option("--limit", "-n", default=20, help="Number of errors to show")
@click.option(
    "--unresolved-only", is_flag=True, default=True, help="Show only unresolved errors"
)
@click.pass_context
def errors(
    ctx: click.Context, pipeline: Optional[str], limit: int, unresolved_only: bool
) -> None:
    """View error log."""
    db = get_state_db(ctx)

    error_list = db.get_unresolved_errors(pipeline_id=pipeline, limit=limit)

    if not error_list:
        console.print("[green]No unresolved errors![/green]")
        return

    console.print(f"[bold]Unresolved Errors ({len(error_list)}):[/bold]\n")

    for err in error_list:
        console.print(
            Panel(
                f"[red bold]{err.error_type}[/red bold]: {err.error_message}\n"
                f"[dim]Pipeline: {err.pipeline_id or 'N/A'} | "
                f"Stage: {err.stage_id or 'N/A'} | "
                f"Item: {err.work_item_id or 'N/A'}[/dim]",
                title=f"Error #{err.id} - {err.occurred_at.strftime('%Y-%m-%d %H:%M:%S')}",
            )
        )


@main.command()
@click.option("--pipeline", "-p", required=True, help="Pipeline to retry")
@click.option("--stage", "-s", help="Specific stage to retry")
@click.option("--all", "retry_all", is_flag=True, help="Retry all failed items")
@click.option("--item", help="Specific item ID to retry")
@click.pass_context
def retry(
    ctx: click.Context,
    pipeline: str,
    stage: Optional[str],
    retry_all: bool,
    item: Optional[str],
) -> None:
    """Retry failed items."""
    settings = get_settings(ctx)
    db = get_state_db(ctx)

    if pipeline not in settings.pipelines:
        console.print(f"[red]Unknown pipeline: {pipeline}[/red]")
        return

    console.print(f"[bold]Retrying failed items for: {pipeline}[/bold]")

    # TODO: Implement retry logic
    console.print("[yellow]Not yet implemented[/yellow]")


@main.command()
@click.option("--pipeline", "-p", required=True, help="Pipeline to reset")
@click.option("--stage", "-s", help="Specific stage to reset")
@click.option(
    "--since", type=click.DateTime(formats=["%Y-%m-%d"]), help="Reset from date"
)
@click.option("--confirm", is_flag=True, help="Confirm reset operation")
@click.pass_context
def reset(
    ctx: click.Context,
    pipeline: str,
    stage: Optional[str],
    since: Optional[datetime],
    confirm: bool,
) -> None:
    """Reset pipeline state."""
    settings = get_settings(ctx)

    if pipeline not in settings.pipelines:
        console.print(f"[red]Unknown pipeline: {pipeline}[/red]")
        return

    if not confirm:
        console.print("[yellow]Use --confirm to actually reset state[/yellow]")
        return

    console.print(f"[bold]Resetting state for: {pipeline}[/bold]")

    # TODO: Implement reset logic
    console.print("[yellow]Not yet implemented[/yellow]")


@main.command()
@click.option("--auto-run", is_flag=True, help="Automatically trigger runs")
@click.option("--interval", default="15m", help="Auto-run interval (e.g., 15m, 1h)")
@click.pass_context
def dashboard(ctx: click.Context, auto_run: bool, interval: str) -> None:
    """Start the live dashboard."""
    import asyncio
    from .dashboard import Dashboard
    from .orchestrator import Orchestrator

    settings = get_settings(ctx)
    db = get_state_db(ctx)
    zip_tracker = ZipFileTracker(settings.paths.server_batch_dir)

    # Parse interval
    interval_minutes = 15
    if interval.endswith("m"):
        interval_minutes = int(interval[:-1])
    elif interval.endswith("h"):
        interval_minutes = int(interval[:-1]) * 60

    console.print("[bold]Starting dashboard...[/bold]")
    console.print(f"  Auto-run: {'enabled' if auto_run else 'disabled'}")
    if auto_run:
        console.print(f"  Interval: {interval_minutes} minutes")
    console.print("\nPress [bold]q[/bold] to quit, [bold]p[/bold] to pause\n")

    # Create dashboard and orchestrator
    dash = Dashboard(settings)
    orchestrator = Orchestrator(settings, db, zip_tracker)

    # Register pipelines with dashboard
    for pipeline_id, pipeline_config in settings.pipelines.items():
        for stage in pipeline_config.stages:
            dash.update_pipeline_status(pipeline_id, stage.id, Status.PENDING)

    async def run_with_dashboard():
        """Run pipelines with dashboard updates."""

        def on_progress(pipeline_id: str, stage_id: str, message: str) -> None:
            dash.log_activity(f"[{pipeline_id}.{stage_id}] {message}")
            dash.set_current_stage(pipeline_id, stage_id, message)

        try:
            with dash:
                dash.log_activity("Dashboard started", level="success")

                if auto_run:
                    while True:
                        dash.log_activity("Starting automatic run...")
                        result = await orchestrator.run_pipelines(
                            on_progress=on_progress
                        )
                        if result.success:
                            dash.log_activity(
                                f"Run complete: {result.items_processed} items",
                                level="success",
                            )
                        else:
                            dash.log_activity(
                                f"Run failed: {len(result.errors)} errors",
                                level="error",
                            )

                        dash.log_activity(f"Waiting {interval_minutes} minutes...")
                        await asyncio.sleep(interval_minutes * 60)
                else:
                    # Just display status, no auto-run
                    dash.log_activity(
                        "Dashboard in view-only mode (use --auto-run to enable automatic runs)"
                    )
                    while True:
                        await asyncio.sleep(1)

        except KeyboardInterrupt:
            dash.log_activity("Shutting down...", level="warning")
            await orchestrator.shutdown()

    try:
        asyncio.run(run_with_dashboard())
    except KeyboardInterrupt:
        console.print("\n[yellow]Dashboard closed[/yellow]")


@main.command()
@click.pass_context
def graph(ctx: click.Context) -> None:
    """Show dependency graph."""
    settings = get_settings(ctx)

    console.print("[bold]Pipeline Dependency Graph:[/bold]\n")

    for pid, pconfig in settings.pipelines.items():
        deps = pconfig.depends_on if pconfig.depends_on else ["(none)"]
        console.print(f"  {pid}")
        for dep in deps:
            console.print(f"    └── depends on: {dep}")

        for stage in pconfig.stages:
            stage_deps = stage.depends_on_stages if stage.depends_on_stages else []
            cross_deps = stage.cross_dependencies

            if stage_deps or cross_deps:
                console.print(f"    {stage.id}:")
                for sd in stage_deps:
                    console.print(f"      └── after: {sd}")
                for cd in cross_deps:
                    console.print(f"      └── needs: {cd['pipeline']}.{cd['stage']}")


if __name__ == "__main__":
    main()
