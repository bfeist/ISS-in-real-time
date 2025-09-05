import os
import json
import re
from datetime import datetime
from collections import defaultdict, Counter
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
IMAGES_FOLDER = WEB_ASSETS_FOLDER + "earth_photography/"


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
        return

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

    # Print statistics
    print("=" * 60)
    print("EARTH PHOTOGRAPHY STATISTICS")
    print("=" * 60)
    print(f"Total photos: {total_photos:,}")
    print(f"Total days with photos: {total_days_with_photos:,}")
    print(f"Average photos per day: {avg_photos_per_day:.2f}")
    print(f"Maximum photos in a single day: {max_photos_per_day:,}")
    print(f"Minimum photos in a single day: {min_photos_per_day:,}")

    if earliest_date and latest_date:
        print(
            f"Date range: {earliest_date.strftime('%Y-%m-%d')} to {latest_date.strftime('%Y-%m-%d')}"
        )
        total_days_in_range = (latest_date - earliest_date).days + 1
        coverage_percentage = (total_days_with_photos / total_days_in_range) * 100
        print(f"Coverage: {coverage_percentage:.2f}% of days in range have photos")

    print("\n" + "=" * 60)
    print("PHOTOS BY ISS MISSION")
    print("=" * 60)

    # Sort missions by name (ISS001, ISS002, etc.)
    sorted_missions = sorted(photos_by_mission.items(), key=lambda x: x[0])
    for mission, count in sorted_missions:
        if mission != "Unknown":
            print(f"{mission}: {count:,} photos")

    if photos_by_mission["Unknown"] > 0:
        print(f"Unknown mission: {photos_by_mission['Unknown']:,} photos")

    print("\n" + "=" * 60)
    print("PHOTOS BY YEAR")
    print("=" * 60)

    sorted_years = sorted(photos_by_year.items())
    for year, count in sorted_years:
        print(f"{year}: {count:,} photos")

    print("\n" + "=" * 60)
    print("PHOTOS BY MONTH")
    print("=" * 60)

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

    for month in range(1, 13):
        count = photos_by_month[month]
        print(f"{month_names[month-1]}: {count:,} photos")

    # Additional insights
    print("\n" + "=" * 60)
    print("ADDITIONAL INSIGHTS")
    print("=" * 60)

    if photos_per_day:
        # Find days with unusually high photo counts (top 1%)
        photos_per_day.sort(reverse=True)
        top_1_percent = max(1, len(photos_per_day) // 100)
        top_days_threshold = (
            photos_per_day[top_1_percent - 1]
            if top_1_percent < len(photos_per_day)
            else photos_per_day[-1]
        )

        print(
            f"Days with {top_days_threshold}+ photos (top 1%): {sum(1 for x in photos_per_day if x >= top_days_threshold)} days"
        )

        # Days with no photos (if we can detect gaps)
        if total_days_in_range:
            days_without_photos = total_days_in_range - total_days_with_photos
            print(f"Days without photos: {days_without_photos:,}")

    # Most productive missions
    if photos_by_mission:
        most_productive_mission = max(photos_by_mission.items(), key=lambda x: x[1])
        print(
            f"Most productive mission: {most_productive_mission[0]} ({most_productive_mission[1]:,} photos)"
        )

    # Most productive year
    if photos_by_year:
        most_productive_year = max(photos_by_year.items(), key=lambda x: x[1])
        print(
            f"Most productive year: {most_productive_year[0]} ({most_productive_year[1]:,} photos)"
        )

    # Most productive month
    if photos_by_month:
        most_productive_month = max(photos_by_month.items(), key=lambda x: x[1])
        month_name = month_names[most_productive_month[0] - 1]
        print(
            f"Most productive month: {month_name} ({most_productive_month[1]:,} photos)"
        )


if __name__ == "__main__":
    if not WEB_ASSETS_FOLDER:
        print("Error: WEB_ASSETS_FOLDER environment variable not set!")
        print("Make sure you have a .env file with WEB_ASSETS_FOLDER defined.")
        exit(1)

    analyze_photos()
