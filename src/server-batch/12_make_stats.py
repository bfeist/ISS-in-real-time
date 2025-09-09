import os
import json
import re
import csv
from datetime import datetime
from collections import defaultdict, Counter
from dotenv import load_dotenv
import pycountry

# Load environment variables from .env file
load_dotenv(dotenv_path=".env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER").strip('"')

if not WEB_ASSETS_FOLDER:
    print("Error: WEB_ASSETS_FOLDER environment variable not set!")
    exit(1)

COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"
IMAGES_FOLDER = WEB_ASSETS_FOLDER + "earth_photography/"
YOUTUBE_JSON = WEB_ASSETS_FOLDER + "videoYt.json"
IA_VIDEOS_JSON = WEB_ASSETS_FOLDER + "videoIa.json"
DATA_AVAILABILITY_CSV = WEB_ASSETS_FOLDER + "data_availability.csv"


def analyze_comm():
    """Analyze communication transcripts and return statistics"""

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

    # Convert to full language names
    languages_dict = {}
    for lang, count in word_counts.items():
        lang_obj = pycountry.languages.get(alpha_2=lang)
        full_lang = lang_obj.name if lang_obj else lang
        languages_dict[full_lang] = count

    return {
        "total_days_with_transcripts": comm_days,
        "total_days_with_vv_transcripts": vv_days,
        "total_utterances": total_utterances,
        "avg_utterances_per_day": round(avg_utterances_per_day, 2),
        "total_words": total_words,
        "total_languages": len(languages),
        "languages": languages_dict,
        "channels": channel_word_counts,
    }


def extract_mission_from_id(photo_id):
    """Extract mission number from photo ID (e.g., 'ISS002E8426' -> 'ISS002')"""
    match = re.match(r"(ISS\d+)", photo_id)
    return match.group(1) if match else "Unknown"


def extract_year_from_date(date_taken):
    """Extract year from ISO date string"""
    try:
        return datetime.fromisoformat(date_taken.replace("Z", "")).year
    except:
        return None


def analyze_photos():
    """Analyze all earth photography JSON files and return statistics"""

    total_photos = 0
    total_days_with_photos = 0
    photos_by_mission = Counter()
    photos_by_year = Counter()
    photos_by_month = Counter()
    photos_per_day = []
    earliest_date = None
    latest_date = None

    # Track unique days that have photos
    days_with_photos = set()

    print(f"Scanning directory: {IMAGES_FOLDER}")

    if not os.path.exists(IMAGES_FOLDER):
        print(f"Error: Directory {IMAGES_FOLDER} does not exist!")
        return {"error": f"Directory {IMAGES_FOLDER} does not exist!"}

    # Walk through the directory structure
    for root, dirs, files in os.walk(IMAGES_FOLDER):
        for file in files:
            if file.endswith(".json") and "images-manifest_" in file:
                file_path = os.path.join(root, file)

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    if not isinstance(data, list):
                        continue

                    # Extract date from filename (e.g., "images-manifest_2001-06-28.json")
                    date_match = re.search(
                        r"images-manifest_(\d{4}-\d{2}-\d{2})\.json", file
                    )
                    if date_match:
                        file_date = date_match.group(1)
                        days_with_photos.add(file_date)

                    daily_photo_count = len(data)
                    total_photos += daily_photo_count
                    photos_per_day.append(daily_photo_count)

                    # Analyze each photo in the manifest
                    for photo in data:
                        if isinstance(photo, dict):
                            # Extract mission info
                            photo_id = photo.get("ID", "")
                            mission = extract_mission_from_id(photo_id)
                            photos_by_mission[mission] += 1

                            # Extract date info
                            date_taken = photo.get("dateTaken", "")
                            if date_taken:
                                try:
                                    dt = datetime.fromisoformat(
                                        date_taken.replace("Z", "")
                                    )
                                    year = dt.year
                                    month = dt.month

                                    photos_by_year[year] += 1
                                    photos_by_month[month] += 1

                                    # Track earliest and latest dates
                                    if earliest_date is None or dt < earliest_date:
                                        earliest_date = dt
                                    if latest_date is None or dt > latest_date:
                                        latest_date = dt

                                except:
                                    pass

                except (json.JSONDecodeError, IOError) as e:
                    print(f"Error reading {file_path}: {e}")
                    continue

    total_days_with_photos = len(days_with_photos)

    # Calculate statistics
    avg_photos_per_day = (
        sum(photos_per_day) / len(photos_per_day) if photos_per_day else 0
    )
    max_photos_per_day = max(photos_per_day) if photos_per_day else 0
    min_photos_per_day = min(photos_per_day) if photos_per_day else 0

    coverage_percentage = 0
    if earliest_date and latest_date:
        total_days_in_range = (latest_date - earliest_date).days + 1
        coverage_percentage = (total_days_with_photos / total_days_in_range) * 100

    # Sort missions by name (ISS001, ISS002, etc.)
    sorted_missions = dict(sorted(photos_by_mission.items(), key=lambda x: x[0]))

    sorted_years = dict(sorted(photos_by_year.items()))

    month_names = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ]

    months_dict = {}
    for month in range(1, 13):
        months_dict[month_names[month - 1]] = photos_by_month[month]

    # Most productive missions
    most_productive_mission = None
    if photos_by_mission:
        most_productive_mission = max(photos_by_mission.items(), key=lambda x: x[1])

    # Most productive year
    most_productive_year = None
    if photos_by_year:
        most_productive_year = max(photos_by_year.items(), key=lambda x: x[1])

    # Most productive month
    most_productive_month = None
    if photos_by_month:
        most_productive_month = max(photos_by_month.items(), key=lambda x: x[1])
        month_name = month_names[most_productive_month[0] - 1]
        most_productive_month = (month_name, most_productive_month[1])

    return {
        "total_photos": total_photos,
        "total_days_with_photos": total_days_with_photos,
        "avg_photos_per_day": round(avg_photos_per_day, 2),
        "max_photos_per_day": max_photos_per_day,
        "min_photos_per_day": min_photos_per_day,
        "date_range": {
            "start": earliest_date.strftime("%Y-%m-%d") if earliest_date else None,
            "end": latest_date.strftime("%Y-%m-%d") if latest_date else None,
        },
        "coverage_percentage": round(coverage_percentage, 2),
        "missions": sorted_missions,
        "years": sorted_years,
        "months": months_dict,
        "most_productive_mission": (
            most_productive_mission[0] if most_productive_mission else None
        ),
        "most_productive_year": (
            most_productive_year[0] if most_productive_year else None
        ),
        "most_productive_month": (
            most_productive_month[0] if most_productive_month else None
        ),
    }


def analyze_videos():
    """Analyze YouTube and IA videos and return statistics"""

    youtube_stats = {}
    ia_stats = {}

    # YouTube live recordings
    if os.path.exists(YOUTUBE_JSON):
        try:
            with open(YOUTUBE_JSON, "r", encoding="utf-8") as f:
                videos = json.load(f)

            total_videos = len(videos)
            total_duration = 0
            videos_by_year = Counter()

            for v in videos:
                if isinstance(v, dict):
                    # Duration might be int or string
                    duration = v.get("duration", 0)
                    if isinstance(duration, int):
                        total_duration += duration
                    elif isinstance(duration, str) and duration.isdigit():
                        total_duration += int(duration)

                    # Extract year from publishedAt
                    published_at = v.get("publishedAt", "")
                    if published_at:
                        year = published_at[:4]
                        videos_by_year[year] += 1

            youtube_stats = {
                "total_videos": total_videos,
                "total_duration_seconds": total_duration,
                "videos_by_year": dict(sorted(videos_by_year.items())),
            }
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading {YOUTUBE_JSON}: {e}")

    # IA videos
    if os.path.exists(IA_VIDEOS_JSON):
        try:
            with open(IA_VIDEOS_JSON, "r", encoding="utf-8") as f:
                videos = json.load(f)

            total_videos = len(videos)
            videos_by_date = Counter()

            for v in videos:
                if isinstance(v, dict) and "date" in v:
                    videos_by_date[v["date"]] += 1

            ia_stats = {
                "total_videos": total_videos,
                "videos_by_date": dict(sorted(videos_by_date.items())),
            }
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading {IA_VIDEOS_JSON}: {e}")

    return {"youtube": youtube_stats, "ia": ia_stats}


def analyze_data_availability():
    """Analyze data availability across days"""

    if not os.path.exists(DATA_AVAILABILITY_CSV):
        return {}

    data_types = [
        "comm",
        "vvComm",
        "youtube",
        "eva",
        "blog",
        "activitySummary",
        "earthPhotography",
    ]
    counts = {dt: 0 for dt in data_types}
    total_days = 0
    data_per_day = []

    try:
        with open(DATA_AVAILABILITY_CSV, "r", encoding="utf-8") as f:
            reader = csv.reader(f, delimiter="|")
            header = next(reader)
            for row in reader:
                total_days += 1
                day_count = 0
                for i, val in enumerate(row[1:]):  # skip date
                    if val.strip() == "1":
                        counts[data_types[i]] += 1
                        day_count += 1
                data_per_day.append(day_count)

        avg_data_per_day = sum(data_per_day) / len(data_per_day) if data_per_day else 0

        return {
            "total_days": total_days,
            "counts": counts,
            "avg_data_types_per_day": round(avg_data_per_day, 2),
        }
    except (IOError, csv.Error) as e:
        print(f"Error reading {DATA_AVAILABILITY_CSV}: {e}")
        return {}


def main():
    comm_stats = analyze_comm()
    photos_stats = analyze_photos()
    videos_stats = analyze_videos()
    data_stats = analyze_data_availability()

    stats = {
        "comm": comm_stats,
        "photos": photos_stats,
        "videos": videos_stats,
        "data_availability": data_stats,
        "generated_at": datetime.now().isoformat(),
    }

    output_path = os.path.join(WEB_ASSETS_FOLDER, "stats.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print(f"Stats saved to {output_path}")


if __name__ == "__main__":
    main()
