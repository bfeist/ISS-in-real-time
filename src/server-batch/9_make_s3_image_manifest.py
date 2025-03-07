from dotenv import load_dotenv
import requests
import json
import argparse
from datetime import datetime
from collections import defaultdict
import sys
import os  # Add import for os

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

# Constants
API_ENDPOINT = (
    "https://eol.jsc.nasa.gov/SearchPhotos/PhotosDatabaseAPI/PhotosDatabaseAPI.pl"
)
BASE_URL = "https://eol.jsc.nasa.gov/DatabaseImages"
IMAGES_S3 = os.getenv("S3_FOLDER") + "images/"
AVAILABLE_DATES_S3 = os.getenv("S3_FOLDER") + "/available_dates.json"

# Load .env file from two directories up
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("NASA_EOL_API_KEY")


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Generate JSON manifest of NASA EOL images for a given day."
    )
    parser.add_argument("date", type=str, help="Date in YYYY-MM-DD format.")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output JSON file name. Defaults to manifest_YYYYMMDD.json",
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


def fetch_api_data(formatted_date):
    query = f"nadir|pdate|eq|{formatted_date}"
    return_fields = "images|directory|images|filename|nadir|pdate|nadir|ptime|nadir|mission|nadir|roll|nadir|frame|images|filesize"

    params = {"query": query, "return": return_fields, "key": api_key}

    try:
        response = requests.get(API_ENDPOINT, params=params)
        response.raise_for_status()
        data = response.json()

        # if data is not an array, return an empty array. This happens when 'result' = 'SQL found no records that match the specified criteria'
        if not isinstance(data, list):
            return None
        return data
    except requests.RequestException as e:
        print(f"Error fetching data from API: {e}")
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: Failed to parse JSON response from API.")
        sys.exit(1)


def process_data(data):
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

        # Store pdate and ptime once per group
        if "pdate" not in grouped[key]:
            grouped[key]["pdate"] = pdate
            grouped[key]["ptime"] = ptime
            grouped[key]["mission"] = mission
            grouped[key]["roll"] = roll

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

        # Construct ID
        ID = f"{mission}-{roll}-{frame}"

        # Get URLs
        small_url = value.get("small")
        large_url = value.get("large")

        if not small_url or not large_url:
            print(
                f"Warning: Missing small or large URL for photo ID {ID}. Skipping this entry."
            )
            continue

        manifest_entry = {
            "ID": ID,
            "dateTaken": date_taken,
            "smallUrl": small_url,
            "largeUrl": large_url,
        }

        manifest.append(manifest_entry)

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

    images_root = IMAGES_S3  # Define images_root

    # get dates available json in S3 root. Array of strings in format 2022-09-27
    available_dates = []
    if os.path.exists(AVAILABLE_DATES_S3):
        with open(AVAILABLE_DATES_S3, "r") as f:
            available_dates = json.load(f)

    for item in available_dates:
        available_date = item["date"]
        no_data = False
        print(f"Processing date: {available_date}")
        [year, month, day] = available_date.split("-")
        formatted_date = f"{year}{month}{day}"

        # check if the json file for this date already exists
        output_file = os.path.join(
            images_root, year, month, f"images-manifest_{year}-{month}-{day}.json"
        )
        if os.path.exists(output_file):
            print(f"Manifest for {available_date} already exists. Skipping API call.")
            continue

        data = fetch_api_data(formatted_date)  # Fetch data for the day

        if not data:
            print(f"No data returned from API for {available_date}.")
            no_data = True

        if not no_data:
            grouped_data = process_data(data)

            if not grouped_data:
                print(f"No valid photo records found for {available_date}.")
                no_data = True

        if not no_data:
            manifest = generate_manifest(grouped_data)

            if not manifest:
                print(f"No manifest entries to save for {available_date}.")
                no_data = True

        # Define output folder with nested month directory
        output_folder = os.path.join(images_root, year, month)
        os.makedirs(output_folder, exist_ok=True)

        output_file = os.path.join(
            output_folder,
            f"images-manifest_{year}-{month}-{day}.json",  # Use hyphens for the date
        )
        if no_data:
            print(f"No data available for {available_date}. Writing empty manifest.")
            with open(output_file, "w") as f:
                f.write("[]")
        else:
            save_manifest(manifest, output_file)


if __name__ == "__main__":
    main()
