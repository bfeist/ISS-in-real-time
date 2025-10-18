#!/usr/bin/env python3
"""Correct legacy comm transcript timestamps recorded in UTC but intended for Central Time."""
"""This error exists in all zip files from 2013-11-26 - 2016-03-07"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence
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
MARKER_CORRECTED = "_corrected_back_utc.txt"
# Originals are copied to this sibling folder before any mutation.
BACKUP_SUFFIX = "_pre_correction_backup"
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
    logging.debug(
        "Detected Central offset %s for %s (DST delta %s)",
        offset,
        timestamp,
        central_dt.dst() or dt.timedelta(0),
    )
    corrected_dt = wrong_dt + offset
    return wrong_dt, corrected_dt


def plan_corrections(
    day_dir: Path,
    comm_root: Path,
    current_date: dt.date,
) -> list[Correction]:
    corrections: list[Correction] = []
    reserved_aac: set[Path] = set()
    reserved_json: set[Path] = set()
    for json_path in sorted(day_dir.glob("*.json")):
        base = json_path.stem
        if len(base) < TIMESTAMP_PREFIX_LEN:
            logging.debug("Skipping JSON with short name: %s", json_path)
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
        if not old_aac.exists():
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
    comm_root: Path,
    backup_root: Path,
    *,
    dry_run: bool = False,
) -> bool:
    if not corrections:
        return True
    for item in corrections:
        if item.new_aac.exists() and item.new_aac != item.old_aac:
            logging.error("Target AAC already exists: %s", item.new_aac)
            return False
        if item.new_json.exists() and item.new_json != item.old_json:
            logging.error("Target JSON already exists: %s", item.new_json)
            return False

    if dry_run:
        backup_candidates = {
            path for item in corrections for path in (item.old_aac, item.old_json)
        }
        for original in sorted(backup_candidates, key=str):
            try:
                relative = original.relative_to(comm_root)
            except ValueError:
                logging.error("Cannot back up %s; not under %s", original, comm_root)
                raise
            destination = backup_root / relative
            logging.info("[dry-run] Would back up %s -> %s", original, destination)
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
    backed_up: set[Path] = set()
    performed: list[tuple[str, Correction]] = []
    try:
        for item in corrections:
            parent_dir = item.new_aac.parent
            if parent_dir not in prepared_dirs:
                parent_dir.mkdir(parents=True, exist_ok=True)
                prepared_dirs.add(parent_dir)
            for original in (item.old_aac, item.old_json):
                if original not in backed_up:
                    backup_original(
                        original,
                        comm_root,
                        backup_root,
                        dry_run=False,
                    )
                    backed_up.add(original)
            old_aac_path = item.old_aac
            new_aac_path = item.new_aac
            item.old_aac.rename(item.new_aac)
            performed.append(("aac", item))

            original_json = item.old_json.read_text(encoding="utf-8")
            data = json.loads(original_json)
            data["filename"] = item.new_aac.name
            data["utteranceTime"] = item.corrected_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            item.old_json.write_text(
                serialize_json_like(original_json, data),
                encoding="utf-8",
            )
            old_json_path = item.old_json
            new_json_path = item.new_json
            item.old_json.rename(item.new_json)
            performed.append(("json", item))
            logging.info("Moved %s -> %s", old_aac_path, new_aac_path)
            logging.info("Moved %s -> %s", old_json_path, new_json_path)
    except Exception:
        logging.exception("Failed while applying corrections")
        for kind, item in reversed(performed):
            try:
                if kind == "json" and item.new_json.exists():
                    item.new_json.rename(item.old_json)
                elif kind == "aac" and item.new_aac.exists():
                    item.new_aac.rename(item.old_aac)
            except Exception:
                logging.error("Rollback failed for %s", item.new_base)
        return False
    return True


def ensure_marker(day_dir: Path, marker_name: str, *, dry_run: bool) -> None:
    marker_path = day_dir / marker_name
    if dry_run:
        logging.info("[dry-run] Would create marker %s", marker_path.name)
    else:
        marker_path.write_text("", encoding="utf-8")


def backup_original(
    source_path: Path,
    comm_root: Path,
    backup_root: Path,
    *,
    dry_run: bool,
) -> None:
    try:
        relative = source_path.relative_to(comm_root)
    except ValueError:
        logging.error("Cannot back up %s; not under %s", source_path, comm_root)
        raise
    destination = backup_root / relative
    if destination.exists():
        return
    if dry_run:
        logging.info("[dry-run] Would back up %s -> %s", source_path, destination)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, destination)
    logging.debug("Backed up %s -> %s", source_path, destination)


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
    backup_root: Path,
    *,
    dry_run: bool,
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

    corrected_marker = day_dir / MARKER_CORRECTED
    if corrected_marker.exists():
        logging.debug("Marker present for %s; skipping", date.isoformat())
        return

    corrections = plan_corrections(day_dir, comm_root, date)
    if not corrections:
        logging.info("No files to correct for %s", date.isoformat())
        ensure_marker(day_dir, MARKER_CORRECTED, dry_run=dry_run)
        return

    if apply_corrections(
        corrections,
        comm_root,
        backup_root,
        dry_run=dry_run,
    ):
        ensure_marker(day_dir, MARKER_CORRECTED, dry_run=dry_run)
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
    backup_root = comm_root.parent / f"{comm_root.name}{BACKUP_SUFFIX}"

    for current_date in iter_dates(DATE_RANGE_START, DATE_RANGE_END):
        process_date(
            current_date,
            comm_root,
            backup_root,
            dry_run=args.dry_run,
        )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logging.warning("Interrupted by user")
        sys.exit(130)
