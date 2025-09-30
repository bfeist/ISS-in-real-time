from dotenv import load_dotenv
import requests
import json
import argparse
from datetime import datetime, timedelta  # Add timedelta import
from collections import defaultdict
import sys
import os  # Add import for os

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
        help="Optional: specific date in YYYY-MM-DD format. If not provided, processes from today backwards to START_DATE.",
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


def fetch_nadir_api_data(formatted_date):
    """
    Fetch nadir data using a layered approach to get all available metadata.
    Makes multiple queries and merges results by (mission, roll, frame) key.
    """
    all_data = {}

    # Query 1: Baseline - get all photos with basic data + camera
    query = f"nadir|pdate|eq|{formatted_date}"
    return_fields = "images|directory|images|filename|nadir|pdate|nadir|ptime|nadir|mission|nadir|roll|nadir|frame|images|filesize"

    params = {"query": query, "return": return_fields, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            # Store baseline data
            for record in data:
                key = (
                    record.get("nadir.mission"),
                    record.get("nadir.roll"),
                    record.get("nadir.frame"),
                    record.get("images.directory"),
                )
                if key not in all_data:
                    all_data[key] = {}
                all_data[key].update(record)
    except requests.RequestException as e:
        print(f"Error fetching nadir baseline data: {e}")
        return None
    except json.JSONDecodeError:
        print("Error: Failed to parse nadir baseline JSON response.")
        return None

    # Query 2: Get photos with mlcoord data
    return_fields_mlcoord = "nadir|mission|nadir|roll|nadir|frame|images|directory|mlcoord|lat|mlcoord|lon|mlcoord|ul_lat|mlcoord|ul_lon|mlcoord|ur_lat|mlcoord|ur_lon|mlcoord|ll_lat|mlcoord|ll_lon|mlcoord|lr_lat|mlcoord|lr_lon"
    params = {"query": query, "return": return_fields_mlcoord, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("nadir.mission"),
                    record.get("nadir.roll"),
                    record.get("nadir.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # mlcoord not available for these photos

    # Query 3: Get photos with mlfeat data
    return_fields_mlfeat = (
        "nadir|mission|nadir|roll|nadir|frame|images|directory|mlfeat|feat"
    )
    params = {"query": query, "return": return_fields_mlfeat, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("nadir.mission"),
                    record.get("nadir.roll"),
                    record.get("nadir.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # mlfeat not available

    # Query 4: Get photos with captions
    return_fields_captions = (
        "nadir|mission|nadir|roll|nadir|frame|images|directory|captions|caption"
    )
    params = {"query": query, "return": return_fields_captions, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("nadir.mission"),
                    record.get("nadir.roll"),
                    record.get("nadir.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # captions not available

    # Query 5: Get photos with camera data (separate camera table for nadir)
    return_fields_camera = "nadir|mission|nadir|roll|nadir|frame|images|directory|camera|fclt|camera|camera"
    params = {"query": query, "return": return_fields_camera, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("nadir.mission"),
                    record.get("nadir.roll"),
                    record.get("nadir.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # camera data not available

    # Convert back to list format
    if not all_data:
        return None

    return list(all_data.values())


def fetch_frames_api_data(formatted_date):
    """
    Fetch frames data using a layered approach to get all available metadata.
    Makes multiple queries and merges results by (mission, roll, frame) key.
    """
    all_data = {}

    # Query 1: Baseline - get all photos with basic data + camera info from frames table
    query = f"frames|pdate|eq|{formatted_date}"
    return_fields = "images|directory|images|filename|frames|pdate|frames|ptime|frames|mission|frames|roll|frames|frame|images|filesize|frames|fclt|frames|camera"

    params = {"query": query, "return": return_fields, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            # Store baseline data
            for record in data:
                key = (
                    record.get("frames.mission"),
                    record.get("frames.roll"),
                    record.get("frames.frame"),
                    record.get("images.directory"),
                )
                if key not in all_data:
                    all_data[key] = {}
                all_data[key].update(record)
    except requests.RequestException as e:
        print(f"Error fetching frames baseline data: {e}")
        return None
    except json.JSONDecodeError:
        print("Error: Failed to parse frames baseline JSON response.")
        return None

    # Query 2: Get photos with mlcoord data
    return_fields_mlcoord = "frames|mission|frames|roll|frames|frame|images|directory|mlcoord|lat|mlcoord|lon|mlcoord|ul_lat|mlcoord|ul_lon|mlcoord|ur_lat|mlcoord|ur_lon|mlcoord|ll_lat|mlcoord|ll_lon|mlcoord|lr_lat|mlcoord|lr_lon"
    params = {"query": query, "return": return_fields_mlcoord, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("frames.mission"),
                    record.get("frames.roll"),
                    record.get("frames.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # mlcoord not available for these photos

    # Query 3: Get photos with features from frames table
    return_fields_feat = (
        "frames|mission|frames|roll|frames|frame|images|directory|frames|feat"
    )
    params = {"query": query, "return": return_fields_feat, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("frames.mission"),
                    record.get("frames.roll"),
                    record.get("frames.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # feat not available

    # Query 4: Get photos with captions
    return_fields_captions = (
        "frames|mission|frames|roll|frames|frame|images|directory|captions|caption"
    )
    params = {"query": query, "return": return_fields_captions, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("frames.mission"),
                    record.get("frames.roll"),
                    record.get("frames.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # captions not available

    # Query 5: Get photos with publicfeatures
    return_fields_pubfeat = "frames|mission|frames|roll|frames|frame|images|directory|publicfeatures|features"
    params = {"query": query, "return": return_fields_pubfeat, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            for record in data:
                key = (
                    record.get("frames.mission"),
                    record.get("frames.roll"),
                    record.get("frames.frame"),
                    record.get("images.directory"),
                )
                if key in all_data:
                    all_data[key].update(record)
    except (requests.RequestException, json.JSONDecodeError, KeyError):
        pass  # publicfeatures not available

    # Convert back to list format
    if not all_data:
        return None

    return list(all_data.values())


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


def save_manifest(manifest, output_filename):
    try:
        with open(output_filename, "w") as f:
            json.dump(manifest, f, indent=4)
        print(f"Manifest saved to {output_filename}")
    except IOError as e:
        print(f"Error writing to file {output_filename}: {e}")
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
            print(f"Processing single date: {args.date}")
        except ValueError:
            print(f"Error: Invalid date format '{args.date}'. Use YYYY-MM-DD format.")
            sys.exit(1)
    else:
        # Process range of dates from today backwards to START_DATE
        start_date = datetime.strptime(START_DATE, "%Y-%m-%d")
        end_date = datetime.strptime(END_DATE, "%Y-%m-%d")

        dates_to_process = []
        current_date = end_date
        while current_date >= start_date:
            dates_to_process.append(current_date)
            current_date -= timedelta(days=1)
        print(f"Processing dates from {END_DATE} backwards to {START_DATE}")

    # Process each date
    for current_date in dates_to_process:
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

        if os.path.exists(output_file) and not args.overwrite:
            print(
                f"Manifest for {available_date} already exists. Skipping API call. (Use --overwrite to regenerate)"
            )
            continue

        nadir_data = fetch_nadir_api_data(formatted_date)  # Fetch data for the day
        frames_data = fetch_frames_api_data(formatted_date)  # Fetch data for the day

        if not nadir_data and not frames_data:
            print(f"No data returned from APIs for {available_date}.")
            no_data = True

        if not no_data:
            grouped_nadir = process_nadir_data(nadir_data)
            grouped_frames = process_frames_data(frames_data)
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
                            print(
                                f"Warning: Conflicting {size} URL for photo {entry_nadir.get('ID', f'{key[0]}-{key[1]}-{key[2]}')}. Using nadir value."
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
                print(f"No valid photo records found for {available_date}.")
                no_data = True

        if not no_data:
            manifest = generate_manifest(merged)

            if not manifest:
                print(f"No manifest entries to save for {available_date}.")
                no_data = True

        if no_data:
            print(
                f"No data available for {available_date}. Skipping manifest generation."
            )
        else:
            # Instead of creating the folder earlier, create destination folder now
            os.makedirs(output_folder, exist_ok=True)
            save_manifest(manifest, output_file)


if __name__ == "__main__":
    main()
