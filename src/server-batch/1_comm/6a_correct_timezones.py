#!/usr/bin/env python3
"""Correct legacy comm transcript timestamps.

NASA comm transcripts between 2013-11-26 and 2016-03-07 were timestamped in
Central Time but written as though they were UTC; this script shifts them back
to the intended timezone.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional, Sequence
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from rich.console import Console
from rich.logging import RichHandler

CENTRAL_TZ = ZoneInfo("America/Chicago")
UTC_TZ = dt.timezone.utc
ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
# NASA comms produced Central Time-tagged files using UTC between 2013-11-26 and 2016-03-07.
DATE_RANGE_START = dt.date(2013, 11, 26)
DATE_RANGE_END = dt.date(2016, 3, 7)
TIMESTAMP_PREFIX_LEN = len("0000-00-00T000000")
console = Console()


@dataclass(slots=True)
class Correction:
    old_base: str
    new_base: str
    old_aac: Path
    new_aac: Path
    old_json: Path
    new_json: Path
    wrong_dt: dt.datetime
    corrected_dt: dt.datetime


def configure_logging(debug: bool) -> None:
    level = logging.DEBUG if debug else logging.INFO
    handler = RichHandler(
        console=console,
        show_time=False,
        show_level=True,
        show_path=False,
    )
    logging.basicConfig(
        level=level,
        format="%(message)s",
        handlers=[handler],
    )


def load_environment() -> None:
    if ROOT_ENV_PATH.exists():
        load_dotenv(ROOT_ENV_PATH)
    else:
        load_dotenv()


def iter_dates(start: dt.date, end: dt.date) -> Iterable[dt.date]:
    if end < start:
        start, end = end, start
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


def compute_corrected_datetime(timestamp: str) -> tuple[dt.datetime, dt.datetime]:
    wrong_dt = dt.datetime.strptime(timestamp, "%Y-%m-%dT%H%M%S").replace(tzinfo=UTC_TZ)
    central_dt = wrong_dt.astimezone(CENTRAL_TZ)
    offset = central_dt.utcoffset() or dt.timedelta(0)
    dst_delta = central_dt.dst() or dt.timedelta(0)
    offset_hours = offset.total_seconds() / 3600
    dst_hours = dst_delta.total_seconds() / 3600
    logging.debug(
        "Detected Central offset %+g hour(s) for %s (DST delta %+g hour(s))",
        offset_hours,
        timestamp,
        dst_hours,
    )
    corrected_dt = wrong_dt + offset
    return wrong_dt, corrected_dt


def plan_corrections(
    day_dir: Path,
    comm_root: Path,
    current_date: dt.date,
    *,
    cutoff_time: dt.datetime,
) -> list[Correction]:
    corrections: list[Correction] = []
    reserved_aac: set[Path] = set()
    reserved_json: set[Path] = set()
    for json_path in sorted(day_dir.glob("*.json")):
        try:
            json_stat = json_path.stat()
        except FileNotFoundError:
            logging.debug("Skipping %s; missing during scan", json_path.name)
            continue
        json_mtime = dt.datetime.fromtimestamp(json_stat.st_mtime, tz=UTC_TZ)
        if json_mtime > cutoff_time:
            logging.debug(
                "Skipping %s; modified %s within minimum age window",
                json_path.name,
                json_mtime.isoformat(),
            )
            continue
        base = json_path.stem
        if len(base) < TIMESTAMP_PREFIX_LEN:
            logging.debug("Skipping JSON with short name: %s", json_path)
            continue
        try:
            existing = json.loads(json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logging.error("Unable to inspect JSON %s: %s", json_path, exc)
            continue
        if existing.get("timezoneCorrected"):
            logging.debug("Already corrected %s; skipping", json_path.name)
            continue
        timestamp_part = base[:TIMESTAMP_PREFIX_LEN]
        remainder = base[TIMESTAMP_PREFIX_LEN:]
        if remainder.startswith("-"):
            remainder = remainder[1:]
        try:
            wrong_dt, corrected_dt = compute_corrected_datetime(timestamp_part)
        except ValueError:
            logging.debug("Skipping JSON with unexpected timestamp: %s", json_path)
            continue
        if corrected_dt == wrong_dt:
            continue
        new_stub = corrected_dt.strftime("%Y-%m-%dT%H%M%S")
        new_base = f"{new_stub}-{remainder}" if remainder else new_stub
        old_aac = day_dir / f"{base}.aac"
        try:
            old_aac.stat()
        except FileNotFoundError:
            logging.warning("Missing AAC for %s", json_path.name)
            continue
        corrected_date = corrected_dt.date()
        target_dir = (
            comm_root
            / f"{corrected_date:%Y}"
            / f"{corrected_date:%m}"
            / f"{corrected_date:%d}"
        )
        new_aac = target_dir / f"{new_base}.aac"
        new_json = target_dir / f"{new_base}.json"
        if corrected_date != current_date:
            logging.info(
                "Utterance %s shifts from %s to %s",
                json_path.name,
                current_date.isoformat(),
                corrected_date.isoformat(),
            )
        if new_aac in reserved_aac or new_json in reserved_json:
            logging.error(
                "Planned duplicate target detected for %s; skipping",
                json_path.name,
            )
            continue
        reserved_aac.add(new_aac)
        reserved_json.add(new_json)
        corrections.append(
            Correction(
                old_base=base,
                new_base=new_base,
                old_aac=old_aac,
                new_aac=new_aac,
                old_json=json_path,
                new_json=new_json,
                wrong_dt=wrong_dt,
                corrected_dt=corrected_dt,
            )
        )
    return corrections


def apply_corrections(
    corrections: Sequence[Correction],
    *,
    dry_run: bool = False,
) -> bool:
    if not corrections:
        return True
    planned_old_aac: set[Path] = {item.old_aac for item in corrections}
    planned_old_json: set[Path] = {item.old_json for item in corrections}
    for item in corrections:
        if (
            item.new_aac.exists()
            and item.new_aac != item.old_aac
            and item.new_aac not in planned_old_aac
        ):
            logging.error(
                "Target AAC already exists: %s (source %s)",
                item.new_aac,
                item.old_aac,
            )
            return False
        if (
            item.new_json.exists()
            and item.new_json != item.old_json
            and item.new_json not in planned_old_json
        ):
            logging.error(
                "Target JSON already exists: %s (source %s)",
                item.new_json,
                item.old_json,
            )
            return False

    if dry_run:
        target_dirs: set[Path] = {item.new_aac.parent for item in corrections}
        for directory in sorted(target_dirs, key=lambda path: str(path)):
            if not directory.exists():
                logging.info("[dry-run] Would create directory %s", directory)
        for item in corrections:
            logging.info(
                "[dry-run] Would rename %s -> %s and %s -> %s",
                item.old_aac,
                item.new_aac,
                item.old_json,
                item.new_json,
            )
        return True

    prepared_dirs: set[Path] = set()
    for item in corrections:
        if not _apply_single_correction(item, prepared_dirs):
            return False
    return True


def _apply_single_correction(item: Correction, prepared_dirs: set[Path]) -> bool:
    parent_dir = item.new_aac.parent
    if parent_dir not in prepared_dirs:
        parent_dir.mkdir(parents=True, exist_ok=True)
        prepared_dirs.add(parent_dir)

    try:
        original_json = item.old_json.read_text(encoding="utf-8")
        data = json.loads(original_json)
    except (OSError, json.JSONDecodeError) as exc:
        logging.error("Unable to load JSON %s: %s", item.old_json, exc)
        return False

    try:
        uncorrected_time = data["utteranceTime"]
    except KeyError:
        logging.error("JSON %s missing utteranceTime", item.old_json)
        return False

    data["filename"] = item.new_aac.name
    data["timezoneUncorrectedUtteranceTime"] = uncorrected_time
    corrected_at = dt.datetime.now(tz=UTC_TZ).strftime("%Y-%m-%dT%H:%M:%SZ")
    data["timezoneCorrected"] = True
    data["timezoneCorrectedAt"] = corrected_at
    data["utteranceTime"] = item.corrected_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    rendered_json = serialize_json_like(original_json, data)

    backup_path = item.old_json.with_suffix(item.old_json.suffix + ".bak")
    if backup_path.exists():
        logging.error("Backup JSON already exists for %s; aborting", item.old_json)
        return False

    rollback_actions: list[Callable[[], None]] = []
    # Keep paired AAC/JSON operations reversible to avoid mismatched updates.
    try:
        item.old_json.rename(backup_path)
        rollback_actions.append(
            lambda backup=backup_path, target=item.old_json: backup.replace(target)
        )

        item.old_json.write_text(rendered_json, encoding="utf-8")

        item.old_aac.rename(item.new_aac)
        rollback_actions.append(
            lambda source=item.new_aac, target=item.old_aac: source.rename(target)
        )

        item.old_json.rename(item.new_json)
        rollback_actions.append(
            lambda source=item.new_json, target=item.old_json: source.rename(target)
        )
    except Exception:
        logging.exception("Failed while applying correction for %s", item.old_base)
        for action in reversed(rollback_actions):
            try:
                action()
            except Exception:
                logging.error("Rollback failed for %s", item.new_base)
        return False
    else:
        try:
            backup_path.unlink(missing_ok=True)
        except OSError:
            logging.warning("Unable to remove backup JSON %s", backup_path)
        logging.info("Moved %s -> %s", item.old_aac, item.new_aac)
        logging.info("Moved %s -> %s", item.old_json, item.new_json)
        return True


def serialize_json_like(original_text: str, data: dict) -> str:
    trimmed = original_text.rstrip("\n")
    indent = 2 if "\n" in trimmed else None
    trailing_newline = original_text.endswith("\n")
    if indent is None:
        rendered = json.dumps(data, ensure_ascii=False)
    else:
        rendered = json.dumps(data, ensure_ascii=False, indent=2)
    if trailing_newline:
        rendered += "\n"
    return rendered


def process_date(
    date: dt.date,
    comm_root: Path,
    *,
    dry_run: bool,
    min_age: dt.timedelta,
) -> None:
    if date < DATE_RANGE_START or date > DATE_RANGE_END:
        logging.info(
            "Skipping %s outside correction window %s to %s",
            date.isoformat(),
            DATE_RANGE_START.isoformat(),
            DATE_RANGE_END.isoformat(),
        )
        return

    day_dir = comm_root / f"{date:%Y}" / f"{date:%m}" / f"{date:%d}"
    if not day_dir.exists():
        logging.info("No transcripts for %s", date.isoformat())
        return

    reference_time = dt.datetime.now(tz=UTC_TZ)
    cutoff_time = reference_time - min_age
    corrections = plan_corrections(
        day_dir,
        comm_root,
        date,
        cutoff_time=cutoff_time,
    )
    if not corrections:
        logging.info("No files to correct for %s", date.isoformat())
        return

    if apply_corrections(
        corrections,
        dry_run=dry_run,
    ):
        logging.info(
            "Corrected %d file pair(s) for %s",
            len(corrections),
            date.isoformat(),
        )
    else:
        logging.error("Failed to correct files for %s", date.isoformat())


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Correct timezone-shifted comm transcript outputs",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned changes without modifying files",
    )
    parser.add_argument(
        "--min-age-minutes",
        type=int,
        default=10,
        help=(
            "Minimum age in minutes a transcript file must have before processing. "
            "Defaults to %(default)s minutes."
        ),
    )
    parser.add_argument(
        "--start-date",
        type=str,
        help="Inclusive start date (YYYY-MM-DD) for processing window",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        help="Inclusive end date (YYYY-MM-DD) for processing window",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(args.debug)
    load_environment()

    raw_folder = os.getenv("RAW_FOLDER")
    if not raw_folder:
        logging.error("RAW_FOLDER environment variable is not set")
        return 1

    comm_root = Path(raw_folder) / "comm_transcripts_aacs"
    if not comm_root.exists():
        logging.error("Transcript output folder not found: %s", comm_root)
        return 1
    min_age_minutes = max(args.min_age_minutes, 0)
    min_age = dt.timedelta(minutes=min_age_minutes)

    try:
        start_date = (
            dt.date.fromisoformat(args.start_date)
            if args.start_date
            else DATE_RANGE_START
        )
    except ValueError:
        logging.error("Invalid --start-date %s", args.start_date)
        return 2
    try:
        end_date = (
            dt.date.fromisoformat(args.end_date) if args.end_date else DATE_RANGE_END
        )
    except ValueError:
        logging.error("Invalid --end-date %s", args.end_date)
        return 2

    if end_date < start_date:
        logging.debug(
            "Swapping start/end dates %s, %s",
            start_date.isoformat(),
            end_date.isoformat(),
        )
        start_date, end_date = end_date, start_date

    if start_date > DATE_RANGE_END or end_date < DATE_RANGE_START:
        logging.info("Requested date range is outside correction window; nothing to do")
        return 0

    effective_start = max(start_date, DATE_RANGE_START)
    effective_end = min(end_date, DATE_RANGE_END)
    if effective_start != start_date or effective_end != end_date:
        logging.info(
            "Clamped requested date range to %s - %s",
            effective_start.isoformat(),
            effective_end.isoformat(),
        )

    for current_date in iter_dates(effective_start, effective_end):
        process_date(
            current_date,
            comm_root,
            dry_run=args.dry_run,
            min_age=min_age,
        )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logging.warning("Interrupted by user")
        sys.exit(130)
