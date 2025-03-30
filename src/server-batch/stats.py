import os
import json
import csv
import re
import shutil
from datetime import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
import pycountry

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"

# Remove LANGUAGE_CODES mapping

if __name__ == "__main__":
    # loop through the nested folder structure

    total_words = 0
    comm_days = 0
    languages = set()
    word_counts = {}
    channel_word_counts = {}
    vv_days_set = set()  # Track unique days with AG or DG files
    total_utterances = 0  # Track total number of utterances

    for root, dirs, files in os.walk(COMM_FOLDER):
        for file in files:
            if file.endswith(".csv"):
                comm_days += 1

                # Extract date from file path (assumes directory structure contains date)
                date_match = re.search(r"(\d{4}-\d{2}-\d{2})", root)
                file_date = date_match.group(1) if date_match else None

                # Check if this file contains VV communications before reading its content
                vv_file = False
                with open(os.path.join(root, file), "r", encoding="utf-8") as f:
                    rows = f.readlines()
                    for row in rows:
                        total_utterances += 1  # Count each row as one utterance
                        time, filename, start, end, language, text, textOriginalLang = (
                            row.strip().split("|")
                        )

                        # Check if file contains AG or DG and extract date if needed
                        if "_AG_" in filename or "_DG_" in filename:
                            if not file_date:
                                # Extract date from filename if not already found in directory
                                date_match = re.search(r"(\d{4}-\d{2}-\d{2})", filename)
                                if date_match:
                                    vv_days_set.add(date_match.group(1))
                            else:
                                vv_days_set.add(file_date)

                        # Continue with normal word counting
                        if language == "en":
                            word_count = len(text.split())
                        else:
                            word_count = len(textOriginalLang.split())
                        total_words += word_count

                        # look for strings like 1_SG_1 or 1_DG_2 in the filename, the last digit is the channel number
                        # use regex to match 1_XG_? and get the last digit, where X can be any letter
                        pattern = re.compile(r"\d+_\w+G_(\d+)")
                        match = pattern.search(filename)
                        channel = match.group(1) if match else "unknown"

                        if channel in channel_word_counts:
                            channel_word_counts[channel] += word_count
                        else:
                            channel_word_counts[channel] = word_count

                        languages.add(language)
                        if language in word_counts:
                            word_counts[language] += word_count
                        else:
                            word_counts[language] = word_count

    # Update vv_days count from the set
    vv_days = len(vv_days_set)

    # Calculate average utterances per day
    avg_utterances_per_day = total_utterances / comm_days if comm_days > 0 else 0

    # sort languages by word count
    word_counts = dict(
        sorted(word_counts.items(), key=lambda item: item[1], reverse=True)
    )

    print(f"Total days with transcripts: {comm_days:,}")
    print(f"Total days with visiting vehicle transcripts: {vv_days:,}")
    print(f"Total utterances: {total_utterances:,}")
    print(f"Average utterances per day: {avg_utterances_per_day:.2f}")
    print(f"Channel word counts:")
    for channel, count in channel_word_counts.items():
        print(f"{channel}: {count:,}")
    print(f"Total languages: {len(languages):,}")
    print(f"Total words in all transcripts: {total_words:,}")
    print("Word counts per language:")
    for lang, count in word_counts.items():
        lang_obj = pycountry.languages.get(alpha_2=lang)
        full_lang = lang_obj.name if lang_obj else lang
        print(f"{full_lang} ({lang}): {count:,}")
