"""Filename parsing utilities for the v3 comms pipeline."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedWavName:
    """Metadata extracted from an IA WAV filename."""

    iso_start: str
    channel_descriptor: str


class FilenameParseError(Exception):
    """Raised when an audio filename cannot be understood."""


# Regex patterns adapted from the legacy v2 pipeline with small cleanups.
_PATTERNS = [
    # Pattern 1: 0000000000_SYNC_SG4_2024-01-08_02_09_04_by_servername_desc
    r"^\d+_SYNC_(SG\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 2: 0000000000_1_SG4_DUP_2024-07-02_13_56_41_by_ui_startdate_desc
    r"^\d+_\d+_(SG\d+)_DUP_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 3: 0000000038_SYNC_SG_2_2015-10-13_12_09_27_by_ui_duration_desc
    r"^\d+_SYNC_SG_(\d)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 4: 0000000140_Channel_15_2015-12-18_20_41_59_by_ui_startdate_asc
    r"^\d+_Channel_(\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 5: 2022-03-30-08-30-42-019-Recorder
    r"^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-Recorder$",
    # Pattern 6: 0000000019_DG_1_2021-04-23_02_24_01_by_ui_startdate_utc_asc
    r"^\d+_(DG)_(\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 7: 0000000018_CST_AG-1_2024-05-06_18_53_37_by_ui_startdate_desc
    r"^\d+_(?:CST_)?(AG-\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 8: 0000000012_DG-1_2021-11-11_18_26_36_by_ui_startdate_desc
    r"^\d+_(DG-\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 9: 0000000013_CST_AG-2__2024-09-04_09_36_01_by_ui_startdate_desc
    r"^\d+_(?:CST_)?(AG-\d+)__(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 10: Other AG/DG patterns with repeated underscores
    r"^\d+_(?:CST_)?([AD]G-\d+)_{1,10}(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
    # Pattern 11: 0000000000_DG2_2020-05-27_07_52_42_by_ui_startdate_desc
    r"^\d+_(DG\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_by_.*)?$",
]


def parse_wav_filename(
    filename: str, *, downlink_number: int | None = None
) -> ParsedWavName:
    """Return the local datetime + descriptor encoded in an IA WAV filename."""

    basename = os.path.splitext(filename)[0]

    for pattern in _PATTERNS:
        match = re.match(pattern, basename)
        if not match:
            continue

        # Pattern 5: Recorder naming variant with no capture groups.
        if pattern.endswith("-Recorder$") and len(match.groups()) == 0:
            parts = basename.split("-")
            if len(parts) >= 7:
                date_part = f"{parts[0]}-{parts[1]}-{parts[2]}"
                time_part = f"{parts[3]}{parts[4]}{parts[5]}"
                iso_start = f"{date_part}T{time_part}"
                sg_channel = str(downlink_number) if downlink_number else "0"
                descriptor = f"1_SG_{sg_channel}"
                return ParsedWavName(iso_start, descriptor)
            continue

        if "DG\\d+" in pattern:
            channel_str = match.group(1)
            descriptor = re.sub(r"(DG)(\\d+)", r"1_\\1_\\2", channel_str)
            date_part = match.group(2)
            hour, minute, second = match.group(3), match.group(4), match.group(5)
            iso_start = f"{date_part}T{hour}{minute}{second}"
            return ParsedWavName(iso_start, descriptor)

        if "__" in pattern or "_{1,10}" in pattern:
            descriptor = match.group(1).replace("-", "_")
            descriptor = f"1_{descriptor}"
            date_part = match.group(2)
            hour, minute, second = match.group(3), match.group(4), match.group(5)
            iso_start = f"{date_part}T{hour}{minute}{second}"
            return ParsedWavName(iso_start, descriptor)

        if "AG-" in pattern or "DG-" in pattern:
            descriptor = match.group(1).replace("-", "_")
            descriptor = f"1_{descriptor}"
            date_part = match.group(2)
            hour, minute, second = match.group(3), match.group(4), match.group(5)
            iso_start = f"{date_part}T{hour}{minute}{second}"
            return ParsedWavName(iso_start, descriptor)

        if "_(DG)_" in pattern:
            descriptor = f"1_{match.group(1)}_{match.group(2)}"
            date_part = match.group(3)
            hour, minute, second = match.group(4), match.group(5), match.group(6)
            iso_start = f"{date_part}T{hour}{minute}{second}"
            return ParsedWavName(iso_start, descriptor)

        # SG channel remapping for legacy 14/15/16/17 channel IDs.
        sg_key = match.group(1)
        if sg_key == "14":
            channel = "1"
        elif sg_key == "15":
            channel = "2"
        elif sg_key == "16":
            channel = "3"
        elif sg_key == "17":
            channel = "4"
        else:
            channel = str(downlink_number) if downlink_number else sg_key[-1]

        date_part = match.group(2)
        hour, minute, second = match.group(3), match.group(4), match.group(5)
        iso_start = f"{date_part}T{hour}{minute}{second}"
        descriptor = f"1_SG_{channel}"
        return ParsedWavName(iso_start, descriptor)

    raise FilenameParseError(
        f"Unable to parse filename '{filename}'. No pattern matched."
    )
