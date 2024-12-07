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

COMM_S3 = os.getenv("S3_FOLDER") + "comm/"
AVAILABLE_DATES_S3 = os.getenv("S3_FOLDER") + "/available_dates.json"

# Remove LANGUAGE_CODES mapping

if __name__ == "__main__":
    # get dates available json in S3 root. Array of strings in format 2022-09-27
    available_dates = []
    if os.path.exists(AVAILABLE_DATES_S3):
        with open(AVAILABLE_DATES_S3, "r") as f:
            available_dates = json.load(f)

    total_words = 0
    days = 0
    languages = set()
    word_counts = {}
    channel_word_counts = {}
    for available_date in available_dates:
        no_data = False
        # print(f"Processing date: {available_date}")
        [year, month, day] = available_date.split("-")
        formatted_date = f"{year}-{month}-{day}"

        # transcript csv path
        transcriptPath = os.path.join(
            COMM_S3,
            year,
            month,
            day,
            f"_transcript_{formatted_date}.csv",
        )

        if not os.path.exists(transcriptPath):
            print(
                f"Transcript for {available_date} does not exist. Skipping reading it call."
            )
            continue

        days += 1
        with open(transcriptPath, "r", encoding="utf-8") as f:
            rows = f.readlines()
            for row in rows:
                time, filename, start, end, language, text, textOriginalLang = (
                    row.strip().split("|")
                )

                if language == "en":
                    word_count = len(text.split())
                else:
                    word_count = len(textOriginalLang.split())
                total_words += word_count

                # look for strings like 1_SG_1 or 1_SG_2 in the filename, the last digit is the channel number
                # filename format is 2019-01-29T020513-1_SG_1_IA.aac
                # use regex to match 1_SG_? and get the last digit
                pattern = re.compile(r"\d+_SG_(\d+)")
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

    # sort languages by word count
    word_counts = dict(
        sorted(word_counts.items(), key=lambda item: item[1], reverse=True)
    )

    print(f"Total days with transcripts: {days:,}")
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
