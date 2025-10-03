import os
import json
import re
import csv
from datetime import datetime
from collections import defaultdict, Counter
from dotenv import load_dotenv
import pycountry

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER").strip('"')

if not WEB_ASSETS_FOLDER:
    print("Error: WEB_ASSETS_FOLDER environment variable not set!")
    exit(1)

COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"
IMAGES_FOLDER = WEB_ASSETS_FOLDER + "photos_earth/"
FLICKR_FOLDER = WEB_ASSETS_FOLDER + "photos_flickr/"
YOUTUBE_JSON = WEB_ASSETS_FOLDER + "videoYt.json"
IA_VIDEOS_JSON = WEB_ASSETS_FOLDER + "videoIa.json"
DATA_AVAILABILITY_CSV = WEB_ASSETS_FOLDER + "data_availability.csv"


def calculate_total_days_since_epoch():
    """Calculate the total number of days from ISS epoch (2000-11-03) to current date

    This is used for coverage calculations to ensure we count ALL possible days
    since the ISS epoch, not just days that appear in the CSV (which may have gaps).
    """
    epoch_date = datetime(2000, 11, 3)
    current_date = datetime.now()
    return (current_date - epoch_date).days + 1  # +1 to include the epoch day itself


def analyze_comm():
    """Analyze communication transcripts and return statistics"""

    total_words = 0
    languages = set()
    word_counts = {}
    channel_word_counts = {}
    vv_days_set = set()  # Track unique days with AG or DG files
    total_utterances = 0  # Track total number of utterances

    # Get day counts from CSV data (consistent with data availability section)
    comm_days_from_csv = 0
    vv_comm_days_from_csv = 0

    if os.path.exists(DATA_AVAILABILITY_CSV):
        try:
            with open(DATA_AVAILABILITY_CSV, "r", encoding="utf-8") as f:
                reader = csv.reader(f, delimiter="|")
                header = next(reader)
                for row in reader:
                    if len(row) >= 3:  # Ensure we have comm and vvComm columns
                        if row[1].strip() == "1":  # comm column
                            comm_days_from_csv += 1
                        if row[2].strip() == "1":  # vvComm column
                            vv_comm_days_from_csv += 1
        except:
            pass

    for root, dirs, files in os.walk(COMM_FOLDER):
        for file in files:
            if file.endswith(".csv"):
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

    # Calculate average utterances per day using CSV-based comm days
    avg_utterances_per_day = (
        total_utterances / comm_days_from_csv if comm_days_from_csv > 0 else 0
    )

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
        "total_days_with_transcripts": comm_days_from_csv,
        "total_days_with_vv_transcripts": vv_comm_days_from_csv,
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
    """Analyze photos using data availability CSV and count photos from JSON files"""

    # Get day counts from CSV data (consistent with data availability section)
    earth_days_from_csv = 0
    flickr_days_from_csv = 0

    if os.path.exists(DATA_AVAILABILITY_CSV):
        try:
            with open(DATA_AVAILABILITY_CSV, "r", encoding="utf-8") as f:
                reader = csv.reader(f, delimiter="|")
                header = next(reader)
                for row in reader:
                    if len(row) >= 9:  # Ensure we have all columns
                        if row[7].strip() == "1":  # earthPhotos column
                            earth_days_from_csv += 1
                        if row[8].strip() == "1":  # flickrPhotos column
                            flickr_days_from_csv += 1
        except:
            pass

    # Initialize stats for each source
    sources = {
        "photos_earth": {
            "total_photos": 0,
            "total_days_with_photos": earth_days_from_csv,
            "photos_per_day": [],
            "earliest_date": None,
            "latest_date": None,
            "days_with_photos": set(),
        },
        "photos_flickr": {
            "total_photos": 0,
            "total_days_with_photos": flickr_days_from_csv,
            "photos_per_day": [],
            "earliest_date": None,
            "latest_date": None,
            "days_with_photos": set(),
        },
    }

    print(f"Scanning directory: {IMAGES_FOLDER}")

    if not os.path.exists(IMAGES_FOLDER):
        print(f"Error: Directory {IMAGES_FOLDER} does not exist!")
        return {"error": f"Directory {IMAGES_FOLDER} does not exist!"}

    # Process images-manifest files
    source = sources["photos_earth"]
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
                        source["days_with_photos"].add(file_date)

                    daily_photo_count = len(data)
                    source["total_photos"] += daily_photo_count
                    source["photos_per_day"].append(daily_photo_count)

                    # Analyze each photo in the manifest
                    for photo in data:
                        if isinstance(photo, dict):
                            # Extract date info
                            date_taken = photo.get("dateTaken", "")
                            if date_taken:
                                try:
                                    dt = datetime.fromisoformat(
                                        date_taken.replace("Z", "")
                                    )

                                    # Track earliest and latest dates
                                    if (
                                        source["earliest_date"] is None
                                        or dt < source["earliest_date"]
                                    ):
                                        source["earliest_date"] = dt
                                    if (
                                        source["latest_date"] is None
                                        or dt > source["latest_date"]
                                    ):
                                        source["latest_date"] = dt

                                except:
                                    pass

                except (json.JSONDecodeError, IOError) as e:
                    print(f"Error reading {file_path}: {e}")
                    continue

    # Don't override the CSV count
    # source["total_days_with_photos"] = len(source["days_with_photos"])

    # Process Flickr photos-manifest files
    print(f"Scanning directory: {FLICKR_FOLDER}")

    if os.path.exists(FLICKR_FOLDER):
        source = sources["photos_flickr"]
        for root, dirs, files in os.walk(FLICKR_FOLDER):
            for file in files:
                if file.endswith(".json") and "photos-manifest_" in file:
                    file_path = os.path.join(root, file)

                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            data = json.load(f)

                        if not isinstance(data, list):
                            continue

                        # Extract date from filename (e.g., "photos-manifest_2001-06-28.json")
                        date_match = re.search(
                            r"photos-manifest_(\d{4}-\d{2}-\d{2})\.json", file
                        )
                        if date_match:
                            file_date = date_match.group(1)
                            source["days_with_photos"].add(file_date)

                        # Count photos for this day
                        day_count = len(data)
                        source["total_photos"] += day_count
                        source["photos_per_day"].append(day_count)

                        # Analyze each photo in the manifest
                        for photo in data:
                            if isinstance(photo, dict):
                                # Extract date info
                                date_taken = photo.get("dateTaken", "")
                                if date_taken:
                                    try:
                                        dt = datetime.fromisoformat(
                                            date_taken.replace("Z", "")
                                        )

                                        # Track earliest and latest dates
                                        if (
                                            source["earliest_date"] is None
                                            or dt < source["earliest_date"]
                                        ):
                                            source["earliest_date"] = dt
                                        if (
                                            source["latest_date"] is None
                                            or dt > source["latest_date"]
                                        ):
                                            source["latest_date"] = dt

                                    except:
                                        pass

                    except (json.JSONDecodeError, IOError) as e:
                        print(f"Error reading {file_path}: {e}")
                        continue

        # Don't override the CSV count
        # source["total_days_with_photos"] = len(source["days_with_photos"])
    else:
        print(f"Flickr photos directory not found: {FLICKR_FOLDER}")

    # Calculate combined stats
    combined_days_with_photos = set()
    combined_photos_per_day = []
    combined_earliest_date = None
    combined_latest_date = None
    combined_total_photos = 0

    # Combined days from CSV - count unique days with either earth or flickr photos
    combined_days_from_csv = 0
    if os.path.exists(DATA_AVAILABILITY_CSV):
        try:
            with open(DATA_AVAILABILITY_CSV, "r", encoding="utf-8") as f:
                reader = csv.reader(f, delimiter="|")
                header = next(reader)
                for row in reader:
                    if len(row) >= 9:  # Ensure we have all columns
                        has_earth = row[7].strip() == "1"  # earthPhotos column
                        has_flickr = row[8].strip() == "1"  # flickrPhotos column
                        if has_earth or has_flickr:
                            combined_days_from_csv += 1
        except:
            pass

    for source_name, source_data in sources.items():
        combined_days_with_photos.update(source_data["days_with_photos"])
        combined_photos_per_day.extend(source_data["photos_per_day"])
        combined_total_photos += source_data["total_photos"]

        if source_data["earliest_date"]:
            if (
                combined_earliest_date is None
                or source_data["earliest_date"] < combined_earliest_date
            ):
                combined_earliest_date = source_data["earliest_date"]
        if source_data["latest_date"]:
            if (
                combined_latest_date is None
                or source_data["latest_date"] > combined_latest_date
            ):
                combined_latest_date = source_data["latest_date"]

    # Calculate total days since ISS epoch for coverage calculations
    total_days_since_epoch = calculate_total_days_since_epoch()

    # Calculate individual source stats
    result = {"sources": {}, "combined": {}}

    for source_name, source_data in sources.items():
        photos_per_day = source_data["photos_per_day"]
        avg_photos_per_day = (
            sum(photos_per_day) / len(photos_per_day) if photos_per_day else 0
        )
        max_photos_per_day = max(photos_per_day) if photos_per_day else 0
        min_photos_per_day = min(photos_per_day) if photos_per_day else 0

        # Use total days since epoch for coverage calculation
        coverage_percentage = (
            source_data["total_days_with_photos"] / total_days_since_epoch
        ) * 100

        result["sources"][source_name] = {
            "total_photos": source_data["total_photos"],
            "total_days_with_photos": source_data["total_days_with_photos"],
            "avg_photos_per_day": round(avg_photos_per_day, 2),
            "max_photos_per_day": max_photos_per_day,
            "min_photos_per_day": min_photos_per_day,
            "date_range": {
                "start": (
                    source_data["earliest_date"].strftime("%Y-%m-%d")
                    if source_data["earliest_date"]
                    else None
                ),
                "end": (
                    source_data["latest_date"].strftime("%Y-%m-%d")
                    if source_data["latest_date"]
                    else None
                ),
            },
            "coverage_percentage": round(coverage_percentage, 2),
        }

    # Calculate combined stats
    avg_photos_per_day = (
        sum(combined_photos_per_day) / len(combined_photos_per_day)
        if combined_photos_per_day
        else 0
    )
    max_photos_per_day = max(combined_photos_per_day) if combined_photos_per_day else 0
    min_photos_per_day = min(combined_photos_per_day) if combined_photos_per_day else 0

    # Use total days since epoch for coverage calculation
    coverage_percentage = (combined_days_from_csv / total_days_since_epoch) * 100

    result["combined"] = {
        "total_photos": combined_total_photos,
        "total_days_with_photos": combined_days_from_csv,  # Use CSV count for consistency
        "avg_photos_per_day": round(avg_photos_per_day, 2),
        "max_photos_per_day": max_photos_per_day,
        "min_photos_per_day": min_photos_per_day,
        "date_range": {
            "start": (
                combined_earliest_date.strftime("%Y-%m-%d")
                if combined_earliest_date
                else None
            ),
            "end": (
                combined_latest_date.strftime("%Y-%m-%d")
                if combined_latest_date
                else None
            ),
        },
        "coverage_percentage": round(coverage_percentage, 2),
    }

    return result


def analyze_videos():
    """Analyze YouTube and IA videos and return statistics"""

    # Get video day counts from CSV data (consistent with data availability section)
    video_days_from_csv = 0

    if os.path.exists(DATA_AVAILABILITY_CSV):
        try:
            with open(DATA_AVAILABILITY_CSV, "r", encoding="utf-8") as f:
                reader = csv.reader(f, delimiter="|")
                header = next(reader)
                for row in reader:
                    if len(row) >= 4:  # Ensure we have video column
                        if row[3].strip() == "1":  # video column
                            video_days_from_csv += 1
        except:
            pass

    youtube_stats = {}
    ia_stats = {}

    # YouTube live recordings
    if os.path.exists(YOUTUBE_JSON):
        try:
            with open(YOUTUBE_JSON, "r", encoding="utf-8") as f:
                videos = json.load(f)

            total_videos = len(videos)
            total_duration = 0

            for v in videos:
                if isinstance(v, dict):
                    # Duration might be int or string
                    duration = v.get("duration", 0)
                    if isinstance(duration, int):
                        total_duration += duration
                    elif isinstance(duration, str) and duration.isdigit():
                        total_duration += int(duration)

            youtube_stats = {
                "total_videos": total_videos,
                "total_duration_seconds": total_duration,
            }
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading {YOUTUBE_JSON}: {e}")

    # IA videos
    if os.path.exists(IA_VIDEOS_JSON):
        try:
            with open(IA_VIDEOS_JSON, "r", encoding="utf-8") as f:
                videos = json.load(f)

            total_videos = len(videos)
            total_duration = 0

            for v in videos:
                if isinstance(v, dict):
                    # Duration might be int, float, or string
                    duration = v.get("duration", 0)
                    if isinstance(duration, (int, float)) and duration > 0:
                        total_duration += duration
                    elif (
                        isinstance(duration, str)
                        and duration.replace(".", "").isdigit()
                    ):
                        total_duration += float(duration)

            ia_stats = {
                "total_videos": total_videos,
                "total_duration_seconds": total_duration,
            }
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading {IA_VIDEOS_JSON}: {e}")

    return {
        "youtube": youtube_stats,
        "ia": ia_stats,
        "total_days_with_videos": video_days_from_csv,
    }


def analyze_data_availability():
    """Analyze data availability across days"""

    if not os.path.exists(DATA_AVAILABILITY_CSV):
        return {}

    data_types = [
        "comm",
        "vvComm",
        "video",
        "eva",
        "blog",
        "actSum",
        "earthPhotos",
        "flickrPhotos",
        "timeline",
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
