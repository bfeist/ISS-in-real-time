import os
import json
import csv
import argparse
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

# This script processes the CSV transcript files created by 3_web_comm.py and creates
# a single JSON file with the first communication entry for each date.

COMM_WEB = os.getenv("WEB_ASSETS_FOLDER") + "comm/"
WEB_ASSETS_ROOT = os.getenv("WEB_ASSETS_FOLDER")


def get_first_comm_for_date(comm_web_dir, date_str):
    """Get the first valid communication entry for a specific date from CSV transcript.

    Prioritizes utterances containing 'DPC' or 'good morning' in the first 10 utterances,
    otherwise falls back to the first valid utterance.
    """
    year, month, day = date_str.split("-")
    transcript_file = os.path.join(
        comm_web_dir, year, month, day, f"_transcript_{date_str}.csv"
    )

    if not os.path.exists(transcript_file):
        return None

    print(f"Processing first comm for {date_str}...")

    try:
        with open(transcript_file, "r", encoding="utf-8") as f:
            # Read all lines and parse them
            lines = f.readlines()

            if not lines:
                return None

            # Parse and collect valid utterances
            valid_utterances = []

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                fields = line.split("|")
                if len(fields) < 7:
                    continue

                (
                    utteranceTime,
                    filename,
                    start,
                    end,
                    language,
                    text,
                    textOriginalLang,
                ) = fields

                # Skip if text is empty
                if not text.strip():
                    continue

                valid_utterances.append(
                    {
                        "utteranceTime": utteranceTime,
                        "filename": filename,
                        "start": start,
                        "end": end,
                        "language": language,
                        "text": text,
                        "textOriginalLang": textOriginalLang,
                    }
                )

            if not valid_utterances:
                return None

            # Look for preferred utterances in the first 10 (or all if fewer than 10)
            search_limit = min(10, len(valid_utterances))
            preferred_utterance = None

            for i in range(search_limit):
                utterance = valid_utterances[i]
                text_lower = utterance["text"].lower()

                # Check if text contains "DPC" or "good morning"
                if "dpc" in text_lower or "good morning" in text_lower:
                    preferred_utterance = utterance
                    print(
                        f"Found preferred utterance at position {i + 1} for {date_str}: '{utterance['text'][:50]}...'"
                    )
                    break

            # Use preferred utterance if found, otherwise use the first valid one
            selected_utterance = (
                preferred_utterance if preferred_utterance else valid_utterances[0]
            )

            # Construct relative path to AAC file for web assets
            year, month, day = date_str.split("-")

            result = {
                "filename": selected_utterance["filename"],
                "text": selected_utterance["text"],
            }

            # Only include textOriginalLang if it has a value
            if (
                selected_utterance["textOriginalLang"]
                and selected_utterance["textOriginalLang"].strip()
            ):
                result["textOriginalLang"] = selected_utterance["textOriginalLang"]

            return result

    except (OSError, UnicodeDecodeError) as e:
        print(f"Error reading {transcript_file}: {e}")
        return None


def get_dates_with_comm(web_assets_root):
    """Read data_availability.csv and return list of dates that have comm data."""
    data_availability_file = os.path.join(web_assets_root, "data_availability.csv")

    if not os.path.exists(data_availability_file):
        raise FileNotFoundError(
            f"Required file {data_availability_file} not found. Please run 10_web_data_availability.py first."
        )

    dates_with_comm = []
    try:
        with open(data_availability_file, "r", encoding="utf-8") as f:
            reader = csv.reader(f, delimiter="|")
            # Skip header row
            next(reader, None)

            for row in reader:
                if len(row) >= 2:  # date and comm columns
                    date, has_comm = row[0], row[1]
                    # Check if comm column is '1' (has comm data)
                    if has_comm == "1":
                        dates_with_comm.append(date)
    except (OSError, UnicodeDecodeError) as e:
        raise RuntimeError(f"Error reading {data_availability_file}: {e}")

    print(f"Found {len(dates_with_comm)} dates with comm data")
    return dates_with_comm


def create_first_comm_json(comm_web_dir, output_file, override=False):
    """Create a JSON file with the first communication entry for each date."""
    print("Creating first comm JSON file...")

    # Read existing data if the output file exists and not overriding
    first_comm_data = {}
    if os.path.exists(output_file) and not override:
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                first_comm_data = json.load(f)
            print(f"Loaded existing data: {len(first_comm_data)} dates")
        except (OSError, json.JSONDecodeError) as e:
            print(f"Warning: Could not read existing file {output_file}: {e}")
            print("Starting with empty data...")
            first_comm_data = {}
    elif override:
        print("Override mode: Starting with empty data (will reprocess all dates)")

    # Get dates with comm data from data_availability.csv
    dates_with_comm = get_dates_with_comm(WEB_ASSETS_ROOT)

    if override:
        # Process all dates when overriding
        dates_to_process = dates_with_comm
        print(
            f"Override mode: Processing all {len(dates_to_process)} dates with comm data..."
        )
    else:
        # Filter to only process missing dates
        dates_to_process = [
            date for date in dates_with_comm if date not in first_comm_data
        ]

        if not dates_to_process:
            print(
                "No missing dates to process. All dates already have first comm data."
            )
            return first_comm_data

        # Process only missing dates
        print(
            f"Incremental mode: Processing {len(dates_to_process)} missing dates out of {len(dates_with_comm)} total dates with comm data..."
        )

    for date_str in dates_to_process:
        first_comm = get_first_comm_for_date(comm_web_dir, date_str)
        if first_comm:
            first_comm_data[date_str] = first_comm

    # Write the JSON file
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(first_comm_data, f, indent=2, ensure_ascii=False)

    print(f"First comm JSON file created: {output_file}")
    print(f"Total dates processed: {len(first_comm_data)}")

    return first_comm_data


if __name__ == "__main__":
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Create JSON file with first communication entry for each date"
    )
    parser.add_argument(
        "-o",
        "--override",
        action="store_true",
        help="Override mode: reprocess all dates instead of only adding missing ones",
    )
    args = parser.parse_args()

    output_file = os.path.join(WEB_ASSETS_ROOT, "comm_first.json")
    first_comm_data = create_first_comm_json(
        COMM_WEB, output_file, override=args.override
    )
