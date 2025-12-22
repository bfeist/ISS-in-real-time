from dotenv import load_dotenv
import requests
import json
import argparse
from datetime import datetime, timedelta  # Add timedelta import
from collections import defaultdict
import sys
import os  # Add import for os
from concurrent.futures import ThreadPoolExecutor, as_completed
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
    TimeRemainingColumn,
)
from rich.console import Console
from rich.panel import Panel
from rich.live import Live
from rich.table import Table

console = Console()

# Load environment variables from .env file
load_dotenv(dotenv_path="../../../.env")

# Constants
API_ENDPOINT = (
    "https://eol.jsc.nasa.gov/SearchPhotos/PhotosDatabaseAPI/PhotosDatabaseAPI.pl"
)
BASE_URL = "https://eol.jsc.nasa.gov/DatabaseImages"
IMAGES_FOLDER = os.getenv("WEB_ASSETS_FOLDER") + "photos_earth/"

START_DATE = "2000-11-01"
END_DATE = datetime.now().strftime("%Y-%m-%d")

# Load .env file from two directories up
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("NASA_EOL_API_KEY")


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Generate JSON manifest of NASA EOL images. Can process a single date or range of dates."
    )
    parser.add_argument(
        "date",
        type=str,
        nargs="?",
        default=None,
        help="Optional: specific date in YYYY-MM-DD format. If not provided, processes from today (or --start-date if specified) backwards to START_DATE.",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=None,
        help="Start date in YYYY-MM-DD format. Script will process from this date backwards to START_DATE (or --stop-date if provided). Ignored if a specific date is provided.",
    )
    parser.add_argument(
        "--stop-date",
        type=str,
        default=None,
        help="Stop date in YYYY-MM-DD format. Script will stop processing when it reaches this date. Defaults to START_DATE (2000-11-01).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file name. Defaults to manifest_YYYYMMDD.json",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing manifest files instead of skipping them",
    )
    parser.add_argument(
        "--overwrite-legacy",
        action="store_true",
        help="Reprocess existing manifest files that only have legacy fields (ID and dateTaken). Files with additional metadata will be skipped.",
    )
    parser.add_argument(
        "--overwrite-noncorner",
        action="store_true",
        help="Overwrite existing manifest files that don't have corner coordinate data. Files with corner coordinates will be skipped.",
    )
    return parser.parse_args()


def validate_and_format_date(date_str):
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        formatted_date = date_obj.strftime("%Y%m%d")
        iso_date_format = date_obj.strftime("%Y-%m-%d")
        return formatted_date, iso_date_format
    except ValueError:
        print("Error: Date must be in YYYY-MM-DD format.")
        sys.exit(1)


def fetch_single_api_query(query_config):
    """
    Fetch a single API query and return the results.
    query_config is a dict with: table_prefix, query, return_fields, description
    """
    query = query_config["query"]
    return_fields = query_config["return_fields"]
    description = query_config["description"]

    params = {"query": query, "return": return_fields, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            return {"success": True, "data": data, "description": description}
        else:
            return {"success": False, "data": None, "description": description}
    except (requests.RequestException, json.JSONDecodeError, KeyError) as e:
        return {
            "success": False,
            "data": None,
            "description": description,
            "error": str(e),
        }


def fetch_all_api_data_parallel(formatted_date, progress=None, task_id=None):
    """
    Fetch all nadir and frames data in parallel using ThreadPoolExecutor.
    Makes 10 API calls simultaneously and merges results.
    """
    query_nadir = f"nadir|pdate|eq|{formatted_date}"
    query_frames = f"frames|pdate|eq|{formatted_date}"

    # Define all 10 queries
    queries = [
        # Nadir queries (1-5)
        {
            "id": 1,
            "table_prefix": "nadir",
            "query": query_nadir,
            "return_fields": "images|directory|images|filename|nadir|pdate|nadir|ptime|nadir|mission|nadir|roll|nadir|frame|images|filesize",
            "description": "Nadir Baseline",
            "short_name": "N-Base",
        },
        {
            "id": 2,
            "table_prefix": "nadir",
            "query": query_nadir,
            "return_fields": "nadir|mission|nadir|roll|nadir|frame|images|directory|mlcoord|lat|mlcoord|lon|mlcoord|ul_lat|mlcoord|ul_lon|mlcoord|ur_lat|mlcoord|ur_lon|mlcoord|ll_lat|mlcoord|ll_lon|mlcoord|lr_lat|mlcoord|lr_lon",
            "description": "Nadir MLCoord",
            "short_name": "N-MLCo",
        },
        {
            "id": 3,
            "table_prefix": "nadir",
            "query": query_nadir,
            "return_fields": "nadir|mission|nadir|roll|nadir|frame|images|directory|mlfeat|feat",
            "description": "Nadir ML Features",
            "short_name": "N-MLFt",
        },
        {
            "id": 4,
            "table_prefix": "nadir",
            "query": query_nadir,
            "return_fields": "nadir|mission|nadir|roll|nadir|frame|images|directory|captions|caption",
            "description": "Nadir Captions",
            "short_name": "N-Capt",
        },
        {
            "id": 5,
            "table_prefix": "nadir",
            "query": query_nadir,
            "return_fields": "nadir|mission|nadir|roll|nadir|frame|images|directory|camera|fclt|camera|camera",
            "description": "Nadir Camera",
            "short_name": "N-Cams",
        },
        # Frames queries (6-10)
        {
            "id": 6,
            "table_prefix": "frames",
            "query": query_frames,
            "return_fields": "images|directory|images|filename|frames|pdate|frames|ptime|frames|mission|frames|roll|frames|frame|images|filesize|frames|fclt|frames|camera",
            "description": "Frames Baseline",
            "short_name": "F-Base",
        },
        {
            "id": 7,
            "table_prefix": "frames",
            "query": query_frames,
            "return_fields": "frames|mission|frames|roll|frames|frame|images|directory|mlcoord|lat|mlcoord|lon|mlcoord|ul_lat|mlcoord|ul_lon|mlcoord|ur_lat|mlcoord|ur_lon|mlcoord|ll_lat|mlcoord|ll_lon|mlcoord|lr_lat|mlcoord|lr_lon",
            "description": "Frames MLCoord",
            "short_name": "F-MLCo",
        },
        {
            "id": 8,
            "table_prefix": "frames",
            "query": query_frames,
            "return_fields": "frames|mission|frames|roll|frames|frame|images|directory|frames|feat",
            "description": "Frames Features",
            "short_name": "F-Feat",
        },
        {
            "id": 9,
            "table_prefix": "frames",
            "query": query_frames,
            "return_fields": "frames|mission|frames|roll|frames|frame|images|directory|captions|caption",
            "description": "Frames Captions",
            "short_name": "F-Capt",
        },
        {
            "id": 10,
            "table_prefix": "frames",
            "query": query_frames,
            "return_fields": "frames|mission|frames|roll|frames|frame|images|directory|publicfeatures|features",
            "description": "Frames Public Features",
            "short_name": "F-PubF",
        },
    ]

    # Execute all queries in parallel
    all_data_nadir = {}
    all_data_frames = {}

    # Track status of each query - using colored ASCII characters for consistent spacing
    query_status = {i: "[yellow]·[/yellow]" for i in range(1, 11)}  # Dot for pending

    def update_progress_display():
        """Generate progress display string with status indicators"""
        # Use colored ASCII characters that are guaranteed monospace
        status_parts = [f"{i:2d}:{query_status[i]}" for i in range(1, 11)]
        status_line = " ".join(status_parts)
        return f"[cyan]API Queries: {status_line}"

    with ThreadPoolExecutor(max_workers=10) as executor:
        # Submit all queries
        future_to_query = {
            executor.submit(fetch_single_api_query, query_config): query_config
            for query_config in queries
        }

        # Process results as they complete
        for future in as_completed(future_to_query):
            query_config = future_to_query[future]
            result = future.result()
            query_id = query_config["id"]

            # Update status based on result
            if result["success"] and result["data"]:
                query_status[query_id] = (
                    "[green]✓[/green]"  # Green checkmark for success
                )
                record_count = len(result["data"])
            elif result["success"] and not result["data"]:
                query_status[query_id] = "[dim]0[/dim]"  # Dim zero for no data
                record_count = 0
            else:
                query_status[query_id] = "[red]X[/red]"  # Red X for error
                record_count = 0

            # Update progress display
            if progress and task_id:
                completed = sum(1 for status in query_status.values() if status != "⏳")
                progress.update(
                    task_id, completed=completed, description=update_progress_display()
                )

            # Merge data if successful
            if result["success"] and result["data"]:
                table_prefix = query_config["table_prefix"]

                # Merge into appropriate dataset
                if table_prefix == "nadir":
                    for record in result["data"]:
                        key = (
                            record.get("nadir.mission"),
                            record.get("nadir.roll"),
                            record.get("nadir.frame"),
                            record.get("images.directory"),
                        )
                        if key not in all_data_nadir:
                            all_data_nadir[key] = {}
                        all_data_nadir[key].update(record)
                else:  # frames
                    for record in result["data"]:
                        key = (
                            record.get("frames.mission"),
                            record.get("frames.roll"),
                            record.get("frames.frame"),
                            record.get("images.directory"),
                        )
                        if key not in all_data_frames:
                            all_data_frames[key] = {}
                        all_data_frames[key].update(record)

    # Convert to list format
    nadir_list = list(all_data_nadir.values()) if all_data_nadir else None
    frames_list = list(all_data_frames.values()) if all_data_frames else None

    return nadir_list, frames_list


def process_nadir_data(data):
    # Group records by (mission, roll, frame)
    grouped = defaultdict(dict)

    if not data:
        return grouped

    for record in data:
        mission = record.get("nadir.mission")
        roll = record.get("nadir.roll")
        frame = record.get("nadir.frame")
        pdate = record.get("nadir.pdate")
        ptime = record.get("nadir.ptime")
        directory = record.get("images.directory")
        filename = record.get("images.filename")

        if not all([mission, roll, frame, pdate, ptime, directory, filename]):
            # Skip incomplete records
            continue

        key = (mission, roll, frame)

        # Determine size type from directory (assuming 'large' or 'small' is part of the directory path)
        if "/large/" in directory:
            size_type = "large"
        elif "/small/" in directory:
            size_type = "small"
        else:
            # Unknown size type; skip
            continue

        url = f"{directory}/{filename}"  # Remove base URL

        if size_type in grouped[key]:
            print(
                f"Warning: Duplicate size type '{size_type}' for photo {key}. Overwriting previous entry."
            )

        grouped[key][size_type] = url

        # Set basic fields once per group
        if "pdate" not in grouped[key]:
            grouped[key]["pdate"] = pdate
            grouped[key]["ptime"] = ptime
            grouped[key]["mission"] = mission
            grouped[key]["roll"] = roll
            # Set identifier as missionrollframe
            grouped[key]["ID"] = f"{mission}{roll}{frame}"

        # Add optional metadata fields if available (check on every record, not just first)
        # MLCoord data
        if record.get("mlcoord.lat"):
            grouped[key]["mlcoord.lat"] = record.get("mlcoord.lat")
            grouped[key]["mlcoord.lon"] = record.get("mlcoord.lon")
            grouped[key]["mlcoord.ul_lat"] = record.get("mlcoord.ul_lat")
            grouped[key]["mlcoord.ul_lon"] = record.get("mlcoord.ul_lon")
            grouped[key]["mlcoord.ur_lat"] = record.get("mlcoord.ur_lat")
            grouped[key]["mlcoord.ur_lon"] = record.get("mlcoord.ur_lon")
            grouped[key]["mlcoord.ll_lat"] = record.get("mlcoord.ll_lat")
            grouped[key]["mlcoord.ll_lon"] = record.get("mlcoord.ll_lon")
            grouped[key]["mlcoord.lr_lat"] = record.get("mlcoord.lr_lat")
            grouped[key]["mlcoord.lr_lon"] = record.get("mlcoord.lr_lon")

        # ML Features
        if record.get("mlfeat.feat"):
            grouped[key]["mlfeat.feat"] = record.get("mlfeat.feat")

        # Caption
        if record.get("captions.caption"):
            grouped[key]["captions.caption"] = record.get("captions.caption")

        # Camera data
        if record.get("camera.fclt"):
            grouped[key]["camera.fclt"] = record.get("camera.fclt")
        if record.get("camera.camera"):
            grouped[key]["camera.camera"] = record.get("camera.camera")

    return grouped


# New function to process frames data using "frames." keys
def process_frames_data(data):
    grouped = defaultdict(dict)
    if not data:
        return grouped
    for record in data:
        mission = record.get("frames.mission")
        roll = record.get("frames.roll")
        frame = record.get("frames.frame")
        pdate = record.get("frames.pdate")
        ptime = record.get("frames.ptime")
        directory = record.get("images.directory")
        filename = record.get("images.filename")
        if not all([mission, roll, frame, pdate, ptime, directory, filename]):
            continue
        key = (mission, roll, frame)
        if "/large/" in directory:
            size_type = "large"
        elif "/small/" in directory:
            size_type = "small"
        else:
            continue
        url = f"{directory}/{filename}"
        if size_type in grouped[key]:
            print(
                f"Warning: Duplicate size type '{size_type}' for photo {key} from frames data. Overwriting previous entry."
            )
        grouped[key][size_type] = url

        # Set basic fields once per group
        if "pdate" not in grouped[key]:
            grouped[key]["pdate"] = pdate
            grouped[key]["ptime"] = ptime
            grouped[key]["mission"] = mission
            grouped[key]["roll"] = roll
            # Set identifier as missionrollframe
            grouped[key]["ID"] = f"{mission}{roll}{frame}"

        # Add optional metadata fields if available (check on every record, not just first)
        # MLCoord data
        if record.get("mlcoord.lat"):
            grouped[key]["mlcoord.lat"] = record.get("mlcoord.lat")
            grouped[key]["mlcoord.lon"] = record.get("mlcoord.lon")
            grouped[key]["mlcoord.ul_lat"] = record.get("mlcoord.ul_lat")
            grouped[key]["mlcoord.ul_lon"] = record.get("mlcoord.ul_lon")
            grouped[key]["mlcoord.ur_lat"] = record.get("mlcoord.ur_lat")
            grouped[key]["mlcoord.ur_lon"] = record.get("mlcoord.ur_lon")
            grouped[key]["mlcoord.ll_lat"] = record.get("mlcoord.ll_lat")
            grouped[key]["mlcoord.ll_lon"] = record.get("mlcoord.ll_lon")
            grouped[key]["mlcoord.lr_lat"] = record.get("mlcoord.lr_lat")
            grouped[key]["mlcoord.lr_lon"] = record.get("mlcoord.lr_lon")

        # Features from frames table
        if record.get("frames.feat"):
            grouped[key]["frames.feat"] = record.get("frames.feat")

        # Caption
        if record.get("captions.caption"):
            grouped[key]["captions.caption"] = record.get("captions.caption")

        # Public features
        if record.get("publicfeatures.features"):
            grouped[key]["publicfeatures.features"] = record.get(
                "publicfeatures.features"
            )

        # Camera data from frames table
        if record.get("frames.fclt"):
            grouped[key]["frames.fclt"] = record.get("frames.fclt")
        if record.get("frames.camera"):
            grouped[key]["frames.camera"] = record.get("frames.camera")
    return grouped


def generate_manifest(grouped_data):
    manifest = []

    for key, value in grouped_data.items():
        mission, roll, frame = key
        pdate = value.get("pdate")
        ptime = value.get("ptime")

        # Construct ISO datetime
        try:
            datetime_obj = datetime.strptime(f"{pdate}{ptime}", "%Y%m%d%H%M%S")
            date_taken = datetime_obj.isoformat() + "Z"  # Add "Z" at the end
        except ValueError:
            # If ptime is not complete, handle accordingly
            date_taken = f"{pdate}"

        # Use the stored identifier field if present
        ID = value.get("ID", f"{key[0]}{key[1]}{key[2]}")

        # Start with required fields
        manifest_entry = {
            "ID": ID,
            "dateTaken": date_taken,
        }

        # Add optional MLCoord data if available
        if value.get("mlcoord.lat") and value.get("mlcoord.lon"):
            manifest_entry["lat"] = float(value.get("mlcoord.lat"))
            manifest_entry["lon"] = float(value.get("mlcoord.lon"))

            # Add corner coordinates if all are present
            if all(
                [
                    value.get(f"mlcoord.{corner}_{coord}")
                    for corner in ["ul", "ur", "ll", "lr"]
                    for coord in ["lat", "lon"]
                ]
            ):
                manifest_entry["corners"] = {
                    "ul": {
                        "lat": float(value.get("mlcoord.ul_lat")),
                        "lon": float(value.get("mlcoord.ul_lon")),
                    },
                    "ur": {
                        "lat": float(value.get("mlcoord.ur_lat")),
                        "lon": float(value.get("mlcoord.ur_lon")),
                    },
                    "ll": {
                        "lat": float(value.get("mlcoord.ll_lat")),
                        "lon": float(value.get("mlcoord.ll_lon")),
                    },
                    "lr": {
                        "lat": float(value.get("mlcoord.lr_lat")),
                        "lon": float(value.get("mlcoord.lr_lon")),
                    },
                }

        # Add ML features if available (skip "PAN-" which just means horizon visible)
        if value.get("mlfeat.feat") and value.get("mlfeat.feat") != "PAN-":
            manifest_entry["mlFeat"] = value.get("mlfeat.feat")

        # Add features from frames table if available
        if value.get("frames.feat"):
            manifest_entry["feat"] = value.get("frames.feat")

        # Add caption if available
        if value.get("captions.caption"):
            manifest_entry["caption"] = value.get("captions.caption")

        # Add public features if available
        if value.get("publicfeatures.features"):
            manifest_entry["publicFeatures"] = value.get("publicfeatures.features")

        # Add camera data if available
        # Prefer frames.fclt over camera.fclt (frames is more authoritative for cataloged photos)
        focal_length = value.get("frames.fclt") or value.get("camera.fclt")
        if focal_length:
            manifest_entry["focalLength"] = int(focal_length)

        camera = value.get("frames.camera") or value.get("camera.camera")
        if camera:
            manifest_entry["camera"] = camera

        manifest.append(manifest_entry)

    # Sort entries by time (dateTaken)
    manifest.sort(key=lambda entry: entry["dateTaken"])

    return manifest


def is_legacy_manifest(manifest_file):
    """
    Check if a manifest file contains only legacy fields (ID and dateTaken).
    Returns True if all entries only have ID and dateTaken, False otherwise.
    """
    try:
        with open(manifest_file, "r") as f:
            data = json.load(f)

        if not isinstance(data, list) or len(data) == 0:
            return False

        # Check if all entries only have ID and dateTaken
        legacy_fields = {"ID", "dateTaken"}
        for entry in data:
            entry_fields = set(entry.keys())
            # If entry has any field beyond ID and dateTaken, it's not legacy
            if entry_fields - legacy_fields:
                return False

        return True
    except (IOError, json.JSONDecodeError, KeyError):
        return False


def has_corner_coordinates(manifest_file):
    """
    Check if a manifest file has corner coordinate data for ALL entries.
    Returns True if ALL entries have the 'corners' field, False otherwise.
    """
    try:
        with open(manifest_file, "r") as f:
            data = json.load(f)

        if not isinstance(data, list) or len(data) == 0:
            return False

        # Check if ALL entries have corner coordinates
        for entry in data:
            if "corners" not in entry:
                return False

        return True
    except (IOError, json.JSONDecodeError, KeyError):
        return False


def save_manifest(manifest, output_filename):
    try:
        with open(output_filename, "w") as f:
            json.dump(manifest, f, indent=4)
    except IOError as e:
        console.print(
            f"[bold red]Error writing to file {output_filename}: {e}[/bold red]"
        )
        sys.exit(1)


def main():
    args = parse_arguments()
    images_root = IMAGES_FOLDER

    # Check if a specific date was provided
    if args.date:
        # Process single date
        try:
            specific_date = datetime.strptime(args.date, "%Y-%m-%d")
            dates_to_process = [specific_date]
            console.print(
                f"[bold green]Processing single date: {args.date}[/bold green]"
            )
        except ValueError:
            console.print(
                f"[bold red]Error: Invalid date format '{args.date}'. Use YYYY-MM-DD format.[/bold red]"
            )
            sys.exit(1)
    else:
        # Process range of dates from start_date backwards to stop_date
        # Determine stop date (how far back to go)
        if args.stop_date:
            try:
                start_date = datetime.strptime(args.stop_date, "%Y-%m-%d")
            except ValueError:
                console.print(
                    f"[bold red]Error: Invalid --stop-date format '{args.stop_date}'. Use YYYY-MM-DD format.[/bold red]"
                )
                sys.exit(1)
        else:
            start_date = datetime.strptime(START_DATE, "%Y-%m-%d")

        # Use --start-date if provided, otherwise use today
        if args.start_date:
            try:
                end_date = datetime.strptime(args.start_date, "%Y-%m-%d")
                console.print(
                    f"[bold green]Processing dates from {args.start_date} backwards to {start_date.strftime('%Y-%m-%d')}[/bold green]"
                )
            except ValueError:
                console.print(
                    f"[bold red]Error: Invalid --start-date format '{args.start_date}'. Use YYYY-MM-DD format.[/bold red]"
                )
                sys.exit(1)
        else:
            end_date = datetime.strptime(END_DATE, "%Y-%m-%d")
            console.print(
                f"[bold green]Processing dates from {END_DATE} backwards to {start_date.strftime('%Y-%m-%d')}[/bold green]"
            )

        dates_to_process = []
        current_date = end_date
        while current_date >= start_date:
            dates_to_process.append(current_date)
            current_date -= timedelta(days=1)

    # Statistics tracking
    stats = {"processed": 0, "skipped": 0, "no_data": 0, "total_photos": 0}

    # Create progress display
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TimeRemainingColumn(),
        console=console,
    ) as progress:

        # Overall progress for all dates
        overall_task = progress.add_task(
            f"[bold blue]Processing {len(dates_to_process)} dates...",
            total=len(dates_to_process),
        )

        # Task for API calls within each date
        api_task = progress.add_task("[cyan]Waiting...", total=10, visible=False)

        # Process each date
        for idx, current_date in enumerate(dates_to_process, 1):
            available_date = current_date.strftime("%Y-%m-%d")
            formatted_date = current_date.strftime("%Y%m%d")
            no_data = False

            year = current_date.strftime("%Y")
            month = current_date.strftime("%m")
            day = current_date.strftime("%d")

            # check if the json file for this date already exists
            output_folder = os.path.join(images_root, year, month)
            output_file = os.path.join(
                output_folder, f"images-manifest_{year}-{month}-{day}.json"
            )

            # Update overall progress
            progress.update(
                overall_task,
                description=f"[bold blue]Date {idx}/{len(dates_to_process)}: {available_date}",
                completed=idx - 1,
            )

            if os.path.exists(output_file):
                if args.overwrite:
                    # Overwrite regardless of content
                    pass
                elif args.overwrite_legacy:
                    # Only skip if file has non-legacy fields
                    if not is_legacy_manifest(output_file):
                        console.print(
                            f"[yellow]✓ Manifest for {available_date} already has metadata. Skipping.[/yellow]"
                        )
                        stats["skipped"] += 1
                        progress.update(overall_task, advance=1)
                        continue
                    else:
                        console.print(
                            f"[cyan]↻ Manifest for {available_date} is legacy (ID+dateTaken only). Reprocessing...[/cyan]"
                        )
                elif args.overwrite_noncorner:
                    # Only skip if file has corner coordinate data
                    if has_corner_coordinates(output_file):
                        console.print(
                            f"[yellow]✓ Manifest for {available_date} already has corner coordinates. Skipping.[/yellow]"
                        )
                        stats["skipped"] += 1
                        progress.update(overall_task, advance=1)
                        continue
                    else:
                        console.print(
                            f"[cyan]↻ Manifest for {available_date} has no corner coordinates. Reprocessing...[/cyan]"
                        )
                else:
                    # Skip existing files by default
                    console.print(
                        f"[yellow]✓ Manifest for {available_date} already exists. Skipping. (Use --overwrite, --overwrite-legacy, or --overwrite-noncorner)[/yellow]"
                    )
                    stats["skipped"] += 1
                    progress.update(overall_task, advance=1)
                    continue

            # Make API task visible and reset
            progress.update(api_task, completed=0, visible=True, total=10)
            progress.update(
                api_task, description="[cyan]Fetching all API data in parallel..."
            )

            nadir_data, frames_data = fetch_all_api_data_parallel(
                formatted_date, progress, api_task
            )

            progress.update(api_task, completed=10, visible=False)

            if not nadir_data and not frames_data:
                console.print(
                    f"[yellow]⚠ No data returned from APIs for {available_date}.[/yellow]"
                )
                no_data = True

            if not no_data:
                progress.update(
                    api_task,
                    description="[cyan]Processing photo data...",
                    visible=True,
                    completed=0,
                    total=100,
                )
                grouped_nadir = process_nadir_data(nadir_data)
                progress.update(api_task, advance=50)
                grouped_frames = process_frames_data(frames_data)
                progress.update(api_task, completed=100, visible=False)

                # Create a new merged object instead of updating grouped_nadir directly
                merged = {}
                all_keys = set(grouped_nadir.keys()).union(grouped_frames.keys())
                for key in all_keys:
                    entry_nadir = grouped_nadir.get(key, {})
                    entry_frames = grouped_frames.get(key, {})
                    merged_entry = {}
                    # Merge size types with nadir taking precedence
                    for size in ["small", "large"]:
                        if size in entry_nadir:
                            if (
                                size in entry_frames
                                and entry_frames[size] != entry_nadir[size]
                            ):
                                console.print(
                                    f"[yellow]⚠ Warning: Conflicting {size} URL for photo {entry_nadir.get('ID', f'{key[0]}-{key[1]}-{key[2]}')}. Using nadir value.[/yellow]"
                                )
                            merged_entry[size] = entry_nadir[size]
                        elif size in entry_frames:
                            merged_entry[size] = entry_frames[size]
                    # Merge common fields (pdate, ptime, mission, roll, ID)
                    for field in ["pdate", "ptime", "mission", "roll", "ID"]:
                        merged_entry[field] = entry_nadir.get(
                            field, entry_frames.get(field)
                        )

                    # Merge ALL metadata fields from both sources (with frames taking precedence for duplicates)
                    metadata_fields = [
                        "mlcoord.lat",
                        "mlcoord.lon",
                        "mlcoord.ul_lat",
                        "mlcoord.ul_lon",
                        "mlcoord.ur_lat",
                        "mlcoord.ur_lon",
                        "mlcoord.ll_lat",
                        "mlcoord.ll_lon",
                        "mlcoord.lr_lat",
                        "mlcoord.lr_lon",
                        "mlfeat.feat",
                        "frames.feat",
                        "captions.caption",
                        "publicfeatures.features",
                        "camera.fclt",
                        "camera.camera",
                        "frames.fclt",
                        "frames.camera",
                    ]
                    for field in metadata_fields:
                        if entry_frames.get(field):
                            merged_entry[field] = entry_frames[field]
                        elif entry_nadir.get(field):
                            merged_entry[field] = entry_nadir[field]

                    merged[key] = merged_entry

                if not merged:
                    console.print(
                        f"[yellow]⚠ No valid photo records found for {available_date}.[/yellow]"
                    )
                    no_data = True

            if not no_data:
                manifest = generate_manifest(merged)

                if not manifest:
                    console.print(
                        f"[yellow]⚠ No manifest entries to save for {available_date}.[/yellow]"
                    )
                    no_data = True

            if no_data:
                console.print(
                    f"[yellow]⊘ No data available for {available_date}. Skipping manifest generation.[/yellow]"
                )
                stats["no_data"] += 1
            else:
                # Instead of creating the folder earlier, create destination folder now
                os.makedirs(output_folder, exist_ok=True)
                save_manifest(manifest, output_file)
                console.print(
                    f"[green]✓ Saved manifest with {len(manifest)} photos for {available_date}[/green]"
                )
                stats["processed"] += 1
                stats["total_photos"] += len(manifest)

            # Update overall progress
            progress.update(overall_task, advance=1)

    # Final summary table
    console.print("\n")
    summary_table = Table(
        title="[bold]Processing Summary[/bold]",
        show_header=True,
        header_style="bold magenta",
    )
    summary_table.add_column("Metric", style="cyan", width=30)
    summary_table.add_column("Count", justify="right", style="green")

    summary_table.add_row("Total Dates Checked", str(len(dates_to_process)))
    summary_table.add_row("Manifests Created", str(stats["processed"]))
    summary_table.add_row("Already Existed (Skipped)", str(stats["skipped"]))
    summary_table.add_row("No Data Available", str(stats["no_data"]))
    summary_table.add_row("Total Photos Processed", str(stats["total_photos"]))
    if stats["processed"] > 0:
        avg_photos = stats["total_photos"] / stats["processed"]
        summary_table.add_row("Average Photos per Day", f"{avg_photos:.1f}")

    console.print(summary_table)
    console.print(f"\n[bold green]✓ Processing complete![/bold green]")


if __name__ == "__main__":
    main()
