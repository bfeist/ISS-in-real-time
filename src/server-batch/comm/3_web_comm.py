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
COMM_WEB2 = os.getenv("WEB_ASSETS_FOLDER2") + "comm/"


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


def copy_to_second_location(source_file, year, month, day, second_output_dir):
    """Copy a file to the second web assets folder with the same directory structure."""
    dest_dir = os.path.join(second_output_dir, year, month, day)
    os.makedirs(dest_dir, exist_ok=True)

    filename = os.path.basename(source_file)
    dest_file = os.path.join(dest_dir, filename)

    if not os.path.exists(dest_file):
        shutil.copy(source_file, dest_file)
        print(f"Copied {filename} to second location: {dest_file}")


def create_daily_transcript(root_dir, date_str, output_dir):
    # Split the date string into year, month, day
    year, month, day = date_str.split("-")
    dir_path = os.path.join(root_dir, year, month, day)

    print(f"Processing transcripts for {date_str}...")

    # Initialize a list to collect data and AAC files to copy
    data_list = []
    aac_files_to_copy = []

    # Loop over JSON files in the directory
    for filename in os.listdir(dir_path):
        if filename.endswith(".json"):
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

    # Now bulk copy all AAC files using subprocess for maximum efficiency
    if aac_files_to_copy:
        dest_dir = os.path.join(output_dir, year, month, day)
        os.makedirs(dest_dir, exist_ok=True)

        dest_dir2 = os.path.join(COMM_WEB2, year, month, day)
        os.makedirs(dest_dir2, exist_ok=True)

        # Use subprocess to copy all AAC files at once (Windows compatible)
        import subprocess

        try:
            # Use Windows copy command to bulk copy all .aac files
            # Copy all .aac files from source to destination 1
            subprocess.run(
                ["cmd", "/c", f'copy "{dir_path}\\*.aac" "{dest_dir}\\" >nul 2>&1'],
                shell=True,
                check=False,
            )

            # Copy all .aac files from source to destination 2
            subprocess.run(
                ["cmd", "/c", f'copy "{dir_path}\\*.aac" "{dest_dir2}\\" >nul 2>&1'],
                shell=True,
                check=False,
            )

            print(f"Bulk copied AAC files for {date_str}")

        except Exception as e:
            print(f"Bulk copy failed, using fallback method: {e}")
            # Fallback to individual copying if bulk copy fails
            for aac_file_path, aac_filename in aac_files_to_copy:
                dest_file1 = os.path.join(dest_dir, aac_filename)
                dest_file2 = os.path.join(dest_dir2, aac_filename)

                if not os.path.exists(dest_file1):
                    shutil.copy(aac_file_path, dest_file1)
                if not os.path.exists(dest_file2):
                    shutil.copy(aac_file_path, dest_file2)

    # Copy CSV file to second location
    copy_to_second_location(output_file, year, month, day, COMM_WEB2)

    print(f"Transcript for {date_str} has been created: {output_file}")
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
