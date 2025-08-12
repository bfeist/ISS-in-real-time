import os
import json
import csv
import shutil
from datetime import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../../.env")

# This script processes the JSON files in the 'tb_transcribed_aacs' directory that are produced by
# the transcription batch processor. It extracts the relevant data and writes it to a pipe-delimited
# CSV file in the 'comm' directory. It also copies the corresponding AAC files to the 'comm' directory.


COMM_RAW = os.getenv("RAW_FOLDER") + "comm_transcripts_aacs/"
COMM_WEB = os.getenv("WEB_ASSETS_FOLDER") + "comm/"

# Debug: Print the paths being used
print("=== PATH DEBUG ===")
print(f"COMM_RAW: {COMM_RAW}")
print(f"COMM_WEB: {COMM_WEB}")
print("==================")


def is_invalid_utterance(text):
    textStringsIndicateInvalidUtterance = [
        "Thank you.",
        "Bye.",
        "...",
        "Thanks for watching!",
        "Thank you for watching.",
        "Thank you for watching!",
        "This video is a derivative work of the Touhou Project",
        "Mmm.",
        "Hmm.",
        "BOOOOOM",
        "BOOOOOM!",
        "BEEEEEP",
        "BELL RINGS",
        "Beeping.",
        "BEEP",
        "Beep.",
        "Mmmmmmmm.",
        "MMMMMMMM",
    ]
    return text in textStringsIndicateInvalidUtterance


def create_daily_transcript(root_dir, date_str, output_dir):
    # Split the date string into year, month, day
    year, month, day = date_str.split("-")
    dir_path = os.path.join(root_dir, year, month, day)

    print(f"Processing transcripts for {date_str}...")
    print(f"Source directory: {dir_path}")
    print(f"Primary output directory: {output_dir}")

    # Initialize a list to collect data and AAC files to copy
    data_list = []
    aac_files_to_copy = []

    # Loop over JSON files in the directory
    if not os.path.exists(dir_path):
        print(f"Directory does not exist: {dir_path}")
        return date_str

    all_files = os.listdir(dir_path)
    json_files = [f for f in all_files if f.endswith(".json")]
    aac_files = [f for f in all_files if f.endswith(".aac")]

    print(
        f"Found {len(json_files)} JSON files and {len(aac_files)} AAC files in {dir_path}"
    )

    for filename in json_files:
        file_path = os.path.join(dir_path, filename)
        with open(file_path, "r", encoding="utf-8") as f:
            json_data = json.load(f)

            # Extract and correct 'utteranceTime'
            utteranceTime_str = json_data.get("utteranceTime", "")
            # Remove 'Z' at the end
            utteranceTime_str = utteranceTime_str.rstrip("Z")
            # Parse datetime
            local_dt = datetime.strptime(utteranceTime_str, "%Y-%m-%dT%H:%M:%S")
            # Assign 'America/Chicago' timezone
            local_dt = local_dt.replace(tzinfo=ZoneInfo("America/Chicago"))
            # Convert to UTC
            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
            # Get ISO format string and extract time part
            utteranceTime_utc = utc_dt.strftime("%H:%M:%S")

            # Concatenate 'text' from all segments
            segments = json_data.get("segments", [])
            text = " ".join(
                segment.get("text", "").strip().replace("|", " ")
                for segment in segments
            )

            if is_invalid_utterance(text):
                continue

            start = segments[0].get("start", "") if segments else ""
            end = segments[-1].get("end", "") if segments else ""

            # Concatenate 'textOriginalLang' from all origLangSegments
            origLangSegments = json_data.get("origLangSegments", [])
            textOriginalLang = " ".join(
                segment.get("text", "").strip().replace("|", " ")
                for segment in origLangSegments
            )

            # Append to data list
            data_list.append(
                {
                    "utteranceTime": utteranceTime_utc,
                    "filename": filename.replace(
                        ".json", ".aac"
                    ),  # Replace JSON extension with AAC
                    "text": text,
                    "textOriginalLang": textOriginalLang,
                    "start": str(start),
                    "end": str(end),
                    "language": json_data.get("language", "en"),
                }
            )

            # Collect AAC file for batch copying later
            aac_filename = json_data.get("filename", "")
            if aac_filename:
                aac_file_path = os.path.join(dir_path, aac_filename)
                if os.path.exists(aac_file_path):
                    aac_files_to_copy.append((aac_file_path, aac_filename))
                    print(f"Found AAC file: {aac_filename}")
                else:
                    print(f"AAC file not found: {aac_file_path}")
            else:
                print(f"No filename specified in JSON: {filename}")

    # Write the data to a pipe-delimited file
    output_file = os.path.join(
        output_dir, year, month, day, f"_transcript_{date_str}.csv"
    )
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    fieldnames = [
        "utteranceTime",
        "filename",
        "start",
        "end",
        "language",
        "text",
        "textOriginalLang",
    ]

    with open(output_file, "w", encoding="utf-8") as txtfile:
        # txtfile.write('|'.join(fieldnames) + '\n')
        for data in data_list:
            row = [data[field] for field in fieldnames]
            txtfile.write("|".join(row) + "\n")

    # Now copy all AAC files individually
    if aac_files_to_copy:
        dest_dir = os.path.join(output_dir, year, month, day)
        os.makedirs(dest_dir, exist_ok=True)
        print(f"Created destination directory: {dest_dir}")

        # Use individual file copying for reliable results
        import subprocess

        print(f"Copying {len(aac_files_to_copy)} AAC files for {date_str}...")

        # Copy each AAC file individually
        for aac_file_path, aac_filename in aac_files_to_copy:
            dest_file = os.path.join(dest_dir, aac_filename)

            try:
                # Copy to destination
                if not os.path.exists(dest_file):
                    shutil.copy(aac_file_path, dest_file)
                    print(f"Copied {aac_filename} to {dest_dir}")
                else:
                    print(f"File already exists: {aac_filename}")

            except Exception as e:
                print(f"Failed to copy {aac_filename}: {e}")

        print(f"Finished copying AAC files for {date_str}")

    print(f"Transcript for {date_str} has been created: {output_file}")
    print(
        f"Processed {len(data_list)} transcript entries and {len(aac_files_to_copy)} AAC files"
    )
    return date_str


def process_all_transcripts(root_dir, output_dir):
    processed_dates = []
    for year in os.listdir(root_dir):
        year_path = os.path.join(root_dir, year)
        if os.path.isdir(year_path):
            for month in os.listdir(year_path):
                month_path = os.path.join(year_path, month)
                if os.path.isdir(month_path):
                    for day in os.listdir(month_path):
                        day_path = os.path.join(month_path, day)
                        if os.path.isdir(day_path):
                            date_str = f"{year}-{month}-{day}"
                            transcript_exists = os.path.exists(
                                os.path.join(
                                    output_dir,
                                    year,
                                    month,
                                    day,
                                    f"_transcript_{date_str}.csv",
                                )
                            )

                            # Skip only if transcript exists AND there are no SG/DG files
                            if transcript_exists:
                                print(
                                    f"Transcript for {date_str} already exists. Skipping."
                                )
                                continue

                            else:
                                print(f"Processing date: {date_str}")

                            processed_date = create_daily_transcript(
                                root_dir, date_str, output_dir
                            )
                            processed_dates.append(processed_date)
    return processed_dates


if __name__ == "__main__":
    processed_dates = process_all_transcripts(COMM_RAW, COMM_WEB)
    # Save processed dates to a file for use in make_tles.py
    # with open("processed_dates.json", "w") as f:
    #     json.dump(processed_dates, f)
