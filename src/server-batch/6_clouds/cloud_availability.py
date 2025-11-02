"""Generate a per-day availability list for NASA GIBS cloud layers.

The script fetches the Web Mercator (EPSG:3857) WMTS capabilities document, extracts any layers
that mention clouds and expose a time dimension, and then records which days
are covered by those sources. Results are written to `clouds_available.json`
in the path specified by the `WEB_ASSETS_FOLDER` environment variable. Each
entry in the JSON array is a single-key object whose key is the ISO-8601 date.
The value is either `false` when no cloud layers are available that day or a
list of layer identifiers that have coverage.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, List, Sequence, Tuple

import requests
from dotenv import load_dotenv

# Constants
DEFAULT_START_DATE = date(2000, 11, 1)
CAPABILITIES_URL = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
    "wmts.cgi?service=WMTS&request=GetCapabilities"
)

# Curated list of visible-light imagery layers that include clouds in their scenes.
VISIBLE_CLOUD_LAYER_IDS: Tuple[str, ...] = (
    "MODIS_Terra_CorrectedReflectance_TrueColor",
    "MODIS_Aqua_CorrectedReflectance_TrueColor",
    "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
    "VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1",
    "VIIRS_NOAA21_CorrectedReflectance_BandsM11-I2-I1",
    "MODIS_Terra_CorrectedReflectance_Bands721",
    "MODIS_Aqua_CorrectedReflectance_Bands721",
    "MODIS_Terra_CorrectedReflectance_Bands367",
    "GOES-East_ABI_Band2_Red_Visible_1km",
    "GOES-West_ABI_Band2_Red_Visible_1km",
    "Himawari_AHI_Band3_Red_Visible_1km",
)


@dataclass
class LayerAvailability:
    identifier: str
    title: str
    ranges: Sequence[Tuple[date, date]]


def load_environment() -> str:
    """Load environment variables and return the web assets folder."""
    # Attempt to load from project root if running from repo structure.
    load_dotenv(dotenv_path="../../../.env")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    load_dotenv(dotenv_path=env_path)

    web_assets_folder = os.getenv("WEB_ASSETS_FOLDER")
    if not web_assets_folder:
        raise RuntimeError("WEB_ASSETS_FOLDER is not configured in the environment.")
    return web_assets_folder


def parse_cli_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Fetch NASA GIBS cloud-layer availability and write a per-day manifest."
        )
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=DEFAULT_START_DATE.isoformat(),
        help="Start date (inclusive) in YYYY-MM-DD format. Defaults to 2000-11-01.",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default=date.today().isoformat(),
        help="End date (inclusive) in YYYY-MM-DD format. Defaults to today.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=60,
        help="HTTP timeout in seconds for the capabilities request (default: 60).",
    )
    return parser.parse_args()


def parse_date(text: str, *, label: str) -> date:
    """Parse a date string in several ISO-like formats."""
    cleaned = text.strip()
    if not cleaned:
        raise ValueError(f"{label} may not be empty")

    # Remove trailing Zulu indicator to support full ISO timestamps.
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1]

    formats = ("%Y-%m-%d", "%Y%m%d")
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            pass

    try:
        return datetime.fromisoformat(cleaned).date()
    except ValueError as exc:  # pragma: no cover - unexpected format
        raise ValueError(f"Could not parse {label} '{text}' as a date") from exc


def parse_dimension_value(
    value: str, *, fallback_start: date, fallback_end: date
) -> List[Tuple[date, date]]:
    """Translate a WMTS dimension value into a list of (start, end) date ranges."""
    token = value.strip()
    if not token:
        return []

    parts = token.split("/")

    if len(parts) == 1:
        single = parse_date(parts[0], label="time dimension value")
        return [(single, single)]

    # Handle interval formats such as start/end/P1D. The third part (period)
    # is ignored because we operate on whole days and the WMTS data we care
    # about is published daily.
    start_text = parts[0] or fallback_start.isoformat()
    end_text = parts[1] if len(parts) > 1 and parts[1] else fallback_end.isoformat()

    start_day = parse_date(start_text, label="time dimension start")
    end_day = parse_date(end_text, label="time dimension end")

    if start_day > end_day:
        start_day, end_day = end_day, start_day

    return [(start_day, end_day)]


def fetch_capabilities(timeout: int) -> str:
    """Retrieve the WMTS capabilities document."""
    try:
        response = requests.get(CAPABILITIES_URL, timeout=timeout)
        response.raise_for_status()
        return response.text
    except requests.RequestException as exc:  # pragma: no cover - network failure
        raise RuntimeError(f"Failed to download capabilities: {exc}") from exc


def discover_cloud_layers(
    capabilities_xml: str, *, start: date, end: date
) -> List[LayerAvailability]:
    """Parse the capabilities XML and collect cloud layers with time ranges."""
    from xml.etree import ElementTree as ET

    namespaces = {
        "wmts": "http://www.opengis.net/wmts/1.0",
        "ows": "http://www.opengis.net/ows/1.1",
    }

    root = ET.fromstring(capabilities_xml)
    layers: List[LayerAvailability] = []

    # Build identifier lookup to allow quick access to curated layers.
    layer_lookup = {}
    for layer in root.findall(".//wmts:Layer", namespaces):
        identifier = layer.findtext("ows:Identifier", default="", namespaces=namespaces)
        if identifier:
            layer_lookup[identifier] = layer

    missing_layers: List[str] = []

    for identifier in VISIBLE_CLOUD_LAYER_IDS:
        layer = layer_lookup.get(identifier)
        if layer is None:
            missing_layers.append(identifier)
            continue

        title = layer.findtext("ows:Title", default=identifier, namespaces=namespaces)

        time_dimension = None
        for dimension in layer.findall("wmts:Dimension", namespaces):
            dim_id = dimension.findtext(
                "ows:Identifier", default="", namespaces=namespaces
            )
            if dim_id and dim_id.lower() == "time":
                time_dimension = dimension
                break

        if time_dimension is None:
            continue

        values: List[str] = []
        for tag in ("wmts:Value", "ows:Value"):
            values.extend(
                elem.text
                for elem in time_dimension.findall(tag, namespaces)
                if elem.text
            )

        if not values:
            default_elem = time_dimension.find("wmts:Default", namespaces)
            if default_elem is not None and default_elem.text:
                values.append(default_elem.text)

        if not values:
            continue

        ranges: List[Tuple[date, date]] = []
        for raw in values:
            ranges.extend(
                parse_dimension_value(
                    raw,
                    fallback_start=start,
                    fallback_end=end,
                )
            )

        if ranges:
            layers.append(
                LayerAvailability(
                    identifier=identifier,
                    title=title,
                    ranges=ranges,
                )
            )

    if missing_layers:
        print(
            "Warning: the following visible cloud layers were not found in the capabilities "
            f"document: {', '.join(missing_layers)}"
        )

    return layers


def daterange(start: date, end: date) -> Iterable[date]:
    """Yield each day from start to end inclusive."""
    current = start
    step = timedelta(days=1)
    while current <= end:
        yield current
        current += step


def date_in_ranges(target: date, ranges: Sequence[Tuple[date, date]]) -> bool:
    """Return True if the target date falls inside any of the provided ranges."""
    return any(start <= target <= finish for start, finish in ranges)


def build_availability(
    layers: Sequence[LayerAvailability],
    *,
    start: date,
    end: date,
) -> List[dict]:
    """Create the per-day availability structure for JSON serialization."""
    availability: List[dict] = []

    for day in daterange(start, end):
        iso_day = day.isoformat()
        sources = [
            layer.identifier for layer in layers if date_in_ranges(day, layer.ranges)
        ]
        value = sources if sources else False
        availability.append({iso_day: value})

    return availability


def ensure_output_directory(path: str) -> None:
    """Create the destination directory if it does not already exist."""
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def main() -> None:
    args = parse_cli_args()
    try:
        start_day = parse_date(args.start_date, label="start date")
        end_day = parse_date(args.end_date, label="end date")
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    if start_day > end_day:
        print("Error: start date must be on or before end date.")
        sys.exit(1)

    try:
        web_assets_folder = load_environment()
    except RuntimeError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    output_path = os.path.abspath(
        os.path.join(web_assets_folder, "clouds_available.json")
    )

    try:
        capabilities_xml = fetch_capabilities(args.timeout)
    except RuntimeError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    try:
        layers = discover_cloud_layers(
            capabilities_xml,
            start=start_day,
            end=end_day,
        )
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Error while parsing capabilities: {exc}")
        sys.exit(1)

    if not layers:
        print("Warning: no cloud layers with time dimensions were found.")

    availability = build_availability(layers, start=start_day, end=end_day)

    ensure_output_directory(output_path)
    try:
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(availability, handle, indent=2)
    except OSError as exc:  # pragma: no cover - filesystem failure
        print(f"Error writing {output_path}: {exc}")
        sys.exit(1)

    print(
        f"Saved cloud availability for {len(availability)} days "
        f"covering {len(layers)} cloud layers to {output_path}"
    )


if __name__ == "__main__":
    main()
