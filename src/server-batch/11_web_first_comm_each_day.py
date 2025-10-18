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

    Prioritizes "good morning" utterances around 7:30 AM UTC (between 6:00-9:00 AM).
    Falls back to the first utterance after 6:00 AM UTC if no "good morning" is found.
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

            # Look for "good morning" utterances between 6:00 AM and 9:00 AM UTC
            good_morning_utterances = []
            first_after_6am = None

            for utterance in valid_utterances:
                try:
                    # Parse the utterance time (format: YYYY-MM-DD HH:MM:SS)
                    utterance_dt = datetime.strptime(
                        utterance["utteranceTime"], "%Y-%m-%d %H:%M:%S"
                    )
                    hour = utterance_dt.hour

                    # Track first utterance after 6 AM
                    if first_after_6am is None and hour >= 6:
                        first_after_6am = utterance

                    # Look for "good morning" between 6 AM and 9 AM
                    if 6 <= hour < 9:
                        text_lower = utterance["text"].lower()
                        if "good morning" in text_lower:
                            # Calculate how close to 7:30 AM (in minutes from midnight)
                            minutes_from_midnight = (
                                utterance_dt.hour * 60 + utterance_dt.minute
                            )
                            target_minutes = 7 * 60 + 30  # 7:30 AM
                            distance = abs(minutes_from_midnight - target_minutes)
                            good_morning_utterances.append((distance, utterance))
                except (ValueError, AttributeError):
                    # Skip utterances with invalid time format
                    continue

            # Select utterance: prefer "good morning" closest to 7:30 AM, else first after 6 AM
            if good_morning_utterances:
                # Sort by distance to 7:30 AM and pick the closest
                good_morning_utterances.sort(key=lambda x: x[0])
                selected_utterance = good_morning_utterances[0][1]
                print(
                    f"Found 'good morning' for {date_str} at {selected_utterance['utteranceTime']}: '{selected_utterance['text'][:50]}...'"
                )
            elif first_after_6am:
                selected_utterance = first_after_6am
                print(
                    f"No 'good morning' found, using first after 6 AM for {date_str} at {selected_utterance['utteranceTime']}: '{selected_utterance['text'][:50]}...'"
                )
            else:
                # Fallback to the very first utterance if nothing after 6 AM
                selected_utterance = valid_utterances[0]
                print(
                    f"No utterances after 6 AM, using first for {date_str} at {selected_utterance['utteranceTime']}: '{selected_utterance['text'][:50]}...'"
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


def get_dates_with_comm(comm_web_dir, existing_dates=None):
    """Scan the comm directory and return list of dates that have a transcript CSV, skipping dates already in existing_dates."""
    if existing_dates is None:
        existing_dates = set()
    dates_with_comm = []
    for root, dirs, files in os.walk(comm_web_dir):
        # Check if this is a day folder (comm/year/month/day)
        parts = os.path.relpath(root, comm_web_dir).split(os.sep)
        if len(parts) == 3:  # year/month/day
            try:
                year, month, day = parts
                date_str = f"{year}-{month}-{day}"
                if date_str in existing_dates:
                    # Skip this directory and don't recurse further
                    dirs[:] = []
                    continue
            except ValueError:
                pass
        for file in files:
            if file.startswith("_transcript_") and file.endswith(".csv"):
                # Extract date from filename
                date_str = file[len("_transcript_") : -len(".csv")]
                # Validate date format
                try:
                    datetime.strptime(date_str, "%Y-%m-%d")
                    if date_str not in existing_dates:
                        dates_with_comm.append(date_str)
                except ValueError:
                    pass
    dates_with_comm = sorted(set(dates_with_comm))  # unique and sorted
    print(f"Found {len(dates_with_comm)} new dates with comm CSV")
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

    # Get dates with comm data from scanning the comm directory
    existing_dates = set(first_comm_data.keys()) if not override else set()
    dates_with_comm = get_dates_with_comm(comm_web_dir, existing_dates)

    if override:
        # Process all dates when overriding
        dates_to_process = dates_with_comm
        print(
            f"Override mode: Processing all {len(dates_to_process)} dates with comm data..."
        )
    else:
        # dates_with_comm already excludes existing dates
        dates_to_process = dates_with_comm

        if not dates_to_process:
            print(
                "No missing dates to process. All dates already have first comm data."
            )
            return first_comm_data

        # Process only missing dates
        print(
            f"Incremental mode: Processing {len(dates_to_process)} new dates with comm data..."
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
