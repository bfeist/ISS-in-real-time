"""
NASA ISS Flickr Flight Photos Web Processor

This script processes AI-classified flight photos from Flickr albums and generates
web-r    # NASA ID pattern - matches NASA photo IDs with specific prefixes and formats
    # Examples: iss067e253397, jsc2023e052795, JSC2013-E-076217, nhq202111080001, jsc2021e044353_alt,
    # iss071e581260_alt, iss068-s-002, S135-E-007551, S101-E-5087, iss001-323-009, s72-46967, jsc2000-03028, ISS014-E-10236, STS119-E-006764, sts119e006764, STS119-S-002
    NASA_ID_PATTERN = re.compile(
        r"^((?:iss\d+(?:e\d+|-\d+-\d+|-s-\d+|-E-\d+)(?:_alt)?)|(?:jsc\d+(?:e\d+|-e-\d+|-\d+)(?:_alt)?)|nhq\d+|s\d+(?:e\d+|-e-\d+)|s\d{2}-\d{4,5}|sts\d+(?:e\d+|-e-\d+|-s-\d+))\s*",
        re.IGNORECASE,
    )ON manifests organized by date for the ISS Real-Time application.

Input: Flight photos from RAW_FOLDER/photos_flickr/albums_categorized_photos/*_flight.json
Output: Daily JSON files in WEB_ASSETS_FOLDER/photos_flickr/YYYY/MM/photos-manifest_YYYY-MM-DD.json

Features:
- Extracts dates from photo descriptions and validates against dateTaken metadata
- Processes Flickr URLs for different image sizes (small, med, large)
- Generates sourceUrl links to original Flickr photos with correct album context
- Organizes output by date with year/month folder structure
- Handles various date formats found in human-written photo descriptions
- Allows photos without NASA IDs (sets nasaId to None instead of rejecting)
- Provides comprehensive statistics for date sources and NASA ID extraction
- Overwrites existing output files completely on each run (no merging)
"""

import os
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv
from typing import Dict, List, Optional, Tuple

# Load environment variables
load_dotenv(dotenv_path="../../../.env")

# Configuration
RAW_FOLDER = os.getenv("RAW_FOLDER")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")

# Input folder: AI-classified flight photos
INPUT_FOLDER = (
    os.path.join(RAW_FOLDER, "photos_flickr", "albums_categorized_photos")
    if RAW_FOLDER
    else None
)

# Output folder: Web assets for photos
OUTPUT_FOLDER = (
    os.path.join(WEB_ASSETS_FOLDER, "photos_flickr") if WEB_ASSETS_FOLDER else None
)

# Flickr base URLs for different image sizes
FLICKR_BASE_URL = "https://live.staticflickr.com"
FLICKR_WEB_BASE_URL = "https://www.flickr.com/photos"

# Global statistics tracking for date sources
DATE_SOURCE_STATS = {
    "dateTaken_property": 0,
    "description_date_override": 0,
    "description_only": 0,
    "none_returned": 0,
}

# Global statistics tracking for NASA ID sources
NASA_ID_STATS = {
    "extracted_from_description": 0,
    "extracted_from_title": 0,
    "no_id_available": 0,
}

print(f"🔧 Configuration:")
print(f"   Input folder (flight photos): {INPUT_FOLDER}")
print(f"   Output folder (web assets): {OUTPUT_FOLDER}")


def extract_date_from_description(description: str) -> Optional[datetime]:
    """
    Extract date from photo description using dateutil.parser for robust parsing

    This function ONLY extracts dates from parentheses in ISS photo descriptions.
    If no date is found in parentheses, returns None (no fallback patterns).

    Supported patterns (in parentheses only):
    - ISS015-E-34417 (12 Oct. 2007) --- Astronaut...
    - ISS020-E-006429 (25 Dec 2009) --- ...
    - ISS01-323-010 (8 November 2000) --- Early film...
    - ISS013-E-54654 (9/15/06) --- ...
    - ISS025-E-009876 (12-25-2010) --- ...

    Args:
        description: The photo description text

    Returns:
        datetime object if date found in parentheses, None otherwise
    """
    if not description:
        return None

    # Import here to avoid issues if not available
    from dateutil import parser as date_parser

    # Extract date from parentheses ONLY (no fallback patterns)
    parentheses_match = re.search(r"\(([^)]+)\)", description)
    if parentheses_match:
        date_str = parentheses_match.group(1).strip()
        try:
            return date_parser.parse(date_str)
        except (ValueError, TypeError):
            pass

    # No fallback - return None if no date found in parentheses
    return None


def extract_nasa_id_from_description(description: str) -> Optional[str]:
    """
    Extract NASA ID from Flickr photo description text
    Uses the same comprehensive pattern matching as 9g_filter_flickr_against_existing_photos.py

    The pattern looks for NASA photo IDs at the beginning of the description:
    - ISS###-E-##### format (e.g., ISS015-E-34417)
    - S###-E-##### format (Shuttle missions, e.g., S134-E-007890)
    - jsc####e###### format (e.g., jsc2023e052795)
    - nhq##### format (e.g., nhq202111080001)
    - iss###-s-### format (e.g., iss068-s-002)
    - Handles leading/trailing dashes and spaces

    Args:
        description: The photo description text

    Returns:
        NASA ID if found (normalized), None otherwise
    """
    if not description or not isinstance(description, str):
        return None

    # Clean the description: strip whitespace and remove leading non-letter characters
    description = description.strip()
    description = re.sub(r"^[^a-zA-Z]*", "", description)

    # NASA ID pattern - matches NASA photo IDs with specific prefixes and formats
    # Examples: iss067e253397, jsc2023e052795, JSC2013-E-076217, nhq202111080001, jsc2021e044353_alt,
    # iss071e581260_alt, iss068-s-002, S135-E-007551, S101-E-5087, iss001-323-009, s72-46967, jsc2000-03028, ISS014-E-10236, STS119-E-006764, sts119e006764
    NASA_ID_PATTERN = re.compile(
        r"^((?:iss\d+(?:e\d+|-\d+-\d+|-s-\d+|-E-\d+)(?:_alt)?)|(?:jsc\d+(?:e\d+|-e-\d+|-\d+)(?:_alt)?)|nhq\d+|s\d+-e-\d+|s\d{2}-\d{4,5}|sts\d+(?:e\d+|-e-\d+))\s*",
        re.IGNORECASE,
    )

    match = NASA_ID_PATTERN.search(description)
    if match:
        nasa_id = match.group(1).lower()
        # Normalize formatting: convert S###-E-##### to lowercase s###-e-#####
        if nasa_id.startswith("s") and "-e-" in nasa_id:
            return nasa_id
        # Keep ISS format as lowercase with dashes: iss###-e-##### or iss###-s-###
        elif "-" in nasa_id:
            return nasa_id
        # Other formats (jsc, nhq) stay as-is in lowercase
        else:
            return nasa_id

    return None


def determine_correct_date(
    date_taken_str: str, description: str
) -> Tuple[Optional[datetime], str]:
    """
    Determine the correct date by comparing dateTaken from JSON with description date

    Logic:
    - If dateTaken is within 3 days of description date, use dateTaken (accurate to seconds)
    - If dateTaken is way off or missing, use description date at midnight
    - Add dateSource field to track which method was used
    - Updates global DATE_SOURCE_STATS counter

    Args:
        date_taken_str: ISO datetime string from photo metadata
        description: Photo description text

    Returns:
        Tuple of (final_datetime, date_source) - datetime can be None
    """
    global DATE_SOURCE_STATS

    description_date = extract_date_from_description(description)

    # Try to parse the dateTaken from the JSON
    date_taken = None
    if date_taken_str:
        try:
            # Handle various ISO formats
            if date_taken_str.endswith("Z"):
                date_taken = datetime.fromisoformat(date_taken_str[:-1])
            else:
                date_taken = datetime.fromisoformat(date_taken_str)
        except ValueError:
            try:
                # Try other common formats
                date_taken = datetime.strptime(date_taken_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                pass

    # If we have both dates, compare them
    if date_taken and description_date:
        time_diff = abs((date_taken.date() - description_date.date()).days)
        if time_diff <= 3:
            # Use dateTaken as it's accurate to seconds and close to description date
            DATE_SOURCE_STATS["dateTaken_property"] += 1
            return date_taken, "dateTaken_property"
        else:
            # Use description date at midnight as dateTaken is too far off
            DATE_SOURCE_STATS["description_date_override"] += 1
            return description_date, "description_date_override"

    # If we only have dateTaken, use it
    if date_taken:
        DATE_SOURCE_STATS["dateTaken_property"] += 1
        return date_taken, "dateTaken_property"

    # If we only have description date, use it at midnight
    if description_date:
        DATE_SOURCE_STATS["description_only"] += 1
        return description_date, "description_only"

    # Fallback to null if no date found
    DATE_SOURCE_STATS["none_returned"] += 1
    return None, "none_returned"


def extract_flickr_urls(photo: Dict) -> Dict[str, str]:
    """
    Extract Flickr URLs for different sizes from photo data

    Args:
        photo: Photo object from Flickr API

    Returns:
        Dict with small, med, and large URLs (partial paths)
    """
    urls = {"smallUrl": "", "medUrl": "", "largeUrl": ""}

    # Check if photo has sizes data
    sizes = photo.get("sizes", {})
    if isinstance(sizes, dict) and "size" in sizes:
        size_list = sizes["size"]
        if isinstance(size_list, list):
            for size in size_list:
                if isinstance(size, dict):
                    label = size.get("label", "").lower()
                    source = size.get("source", "")

                    # Extract the path part after the base URL
                    if source.startswith(FLICKR_BASE_URL):
                        path = source.replace(FLICKR_BASE_URL + "/", "")

                        # Map Flickr size labels to our output
                        if "small" in label:
                            urls["smallUrl"] = path
                        elif "medium" in label:
                            urls["medUrl"] = path
                        elif "large" in label or "original" in label:
                            urls["largeUrl"] = path

    # Fallback: construct URLs from photo ID and server info if sizes not available
    if not any(urls.values()):
        photo_id = photo.get("id", "")
        server = photo.get("server", "")
        secret = photo.get("secret", "")

        if photo_id and server and secret:
            # Standard Flickr URL pattern
            base_path = f"{server}/{photo_id}_{secret}"
            urls["smallUrl"] = f"{base_path}_m.jpg"  # Medium size
            urls["medUrl"] = f"{base_path}_z.jpg"  # Large size
            urls["largeUrl"] = f"{base_path}_b.jpg"  # Extra large size

    return urls


def create_flickr_source_url(photo: Dict, album_info: Dict) -> str:
    """
    Create a Flickr source URL that can be opened in a new window, including album context

    Args:
        photo: Photo object from Flickr API
        album_info: Album metadata containing owner and album information

    Returns:
        Full Flickr URL to the photo page within its album context
    """
    photo_id = photo.get("id", "")
    if not photo_id:
        return ""

    # Get owner information from album metadata or photo detailed info
    owner_nsid = None

    # First try to get from album photoset_info
    if "photoset_info" in album_info and "owner" in album_info["photoset_info"]:
        owner_nsid = album_info["photoset_info"]["owner"]

    # Fallback to photo detailed_info if available
    if not owner_nsid and "detailed_info" in photo:
        detailed = photo["detailed_info"]
        if isinstance(detailed, dict) and "owner" in detailed:
            owner_info = detailed["owner"]
            if isinstance(owner_info, dict):
                owner_nsid = owner_info.get("nsid")

    # Final fallback to pathalias from photo
    if not owner_nsid:
        owner_nsid = photo.get("pathalias", "nasahqphoto")

    # Get album ID from photoset_info
    album_id = None
    if "photoset_info" in album_info and "id" in album_info["photoset_info"]:
        album_id = album_info["photoset_info"]["id"]

    # Create URL with album context if available
    if album_id:
        return f"{FLICKR_WEB_BASE_URL}/{owner_nsid}/{photo_id}/in/album-{album_id}/"
    else:
        # Fallback to basic photo URL
        return f"{FLICKR_WEB_BASE_URL}/{owner_nsid}/{photo_id}"


def process_photo(photo: Dict, album_info: Dict) -> Optional[Dict]:
    """
    Process a single photo from flight album and create web-ready output

    Args:
        photo: Photo object from AI-classified flight album
        album_info: Album metadata containing photoset_info and other album data

    Returns:
        Processed photo dict or None if invalid
    """
    # Extract description content
    description = ""
    if isinstance(photo.get("description"), dict):
        description = photo["description"].get("_content", "")
    elif isinstance(photo.get("description"), str):
        description = photo["description"]

    # Extract NASA ID from description
    global NASA_ID_STATS

    nasa_id = extract_nasa_id_from_description(description)
    nasa_id_source = ""

    if nasa_id:
        NASA_ID_STATS["extracted_from_description"] += 1
        nasa_id_source = "description"
    else:
        # Try title as fallback
        title = ""
        if isinstance(photo.get("title"), dict):
            title = photo["title"].get("_content", "")
        elif isinstance(photo.get("title"), str):
            title = photo["title"]
        nasa_id = extract_nasa_id_from_description(title)

        if nasa_id:
            NASA_ID_STATS["extracted_from_title"] += 1
            nasa_id_source = "title"

    # If still no NASA ID, set to None (don't reject the photo)
    if not nasa_id:
        NASA_ID_STATS["no_id_available"] += 1
        nasa_id = None
        nasa_id_source = "none"

    # Get the correct date
    date_taken_str = photo.get("datetaken", "")
    final_date, date_source = determine_correct_date(date_taken_str, description)

    # Skip photos without a valid date
    if final_date is None:
        return None

    # Extract Flickr URLs
    flickr_urls = extract_flickr_urls(photo)

    # Create source URL
    source_url = create_flickr_source_url(photo, album_info)

    # Build the output object
    output_photo = {
        "nasaId": nasa_id,
        "nasaIdSource": nasa_id_source,
        "dateTaken": final_date.isoformat() + "Z",
        "dateSource": date_source,
        "smallUrl": flickr_urls["smallUrl"],
        "medUrl": flickr_urls["medUrl"],
        "largeUrl": flickr_urls["largeUrl"],
        "description": description,
        "sourceUrl": source_url,
    }

    return output_photo


def save_photos_by_date(photos: List[Dict]) -> Dict[str, int]:
    """
    Save processed photos organized by date in year/month folders

    Note: This function overwrites existing files completely - no merging with existing data.
    Each run of the script will replace all photos for each date.

    Args:
        photos: List of processed photo dictionaries

    Returns:
        Dict with statistics about saved files
    """
    if not photos:
        return {"files_created": 0, "photos_saved": 0}

    if not OUTPUT_FOLDER:
        print("❌ Output folder not configured")
        return {"files_created": 0, "photos_saved": 0}

    # Group photos by date
    photos_by_date = defaultdict(list)
    for photo in photos:
        try:
            # Parse the dateTaken to get the date
            date_taken_str = photo["dateTaken"]
            if date_taken_str.endswith("Z"):
                date_taken = datetime.fromisoformat(date_taken_str[:-1])
            else:
                date_taken = datetime.fromisoformat(date_taken_str)

            date_key = date_taken.strftime("%Y-%m-%d")
            photos_by_date[date_key].append(photo)
        except (ValueError, KeyError) as e:
            print(f"⚠️  Skipping photo with invalid date: {e}")
            continue

    files_created = 0
    photos_saved = 0

    # Create output files for each date
    for date_key, date_photos in photos_by_date.items():
        try:
            date_obj = datetime.strptime(date_key, "%Y-%m-%d")
            year = date_obj.strftime("%Y")
            month = date_obj.strftime("%m")
            day = date_obj.strftime("%d")

            # Create year/month folder structure
            output_dir = os.path.join(OUTPUT_FOLDER, year, month)
            os.makedirs(output_dir, exist_ok=True)

            # Create filename
            output_filename = f"photos-manifest_{year}-{month}-{day}.json"
            output_path = os.path.join(output_dir, output_filename)

            # Always overwrite existing files - no merging
            if date_photos:
                # Sort photos by dateTaken
                date_photos.sort(key=lambda x: x.get("dateTaken", ""))

                # Always overwrite the file with current photos
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(date_photos, f, indent=2, ensure_ascii=False)

                print(f"✅ Overwrote {output_filename} with {len(date_photos)} photos")
                files_created += 1
                photos_saved += len(date_photos)
            else:
                print(f"⚠️  No photos for {date_key} to save")

        except Exception as e:
            print(f"❌ Error saving photos for {date_key}: {e}")

    return {"files_created": files_created, "photos_saved": photos_saved}


def find_flight_albums() -> List[Path]:
    """
    Find all flight photo album JSON files (ending with _flight.json)

    Returns:
        List of Path objects for flight album files
    """
    if not INPUT_FOLDER or not os.path.exists(INPUT_FOLDER):
        print(f"❌ Input folder not found: {INPUT_FOLDER}")
        return []

    try:
        input_path = Path(INPUT_FOLDER)
        flight_files = list(input_path.glob("*_flight.json"))

        print(f"✅ Found {len(flight_files)} flight album files")
        return flight_files

    except Exception as e:
        print(f"❌ Error scanning input folder: {e}")
        return []


def load_flight_album(file_path: Path) -> Optional[Dict]:
    """
    Load flight album data from JSON file

    Args:
        file_path: Path to the flight album JSON file

    Returns:
        Album data or None if error
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        filename = file_path.name
        total_photos = len(data.get("photos", []))
        print(f"📂 Loaded flight album: {filename} ({total_photos} photos)")
        return data

    except Exception as e:
        print(f"❌ Error loading {file_path}: {e}")
        return None


def process_album(album_data: Dict, filename: str) -> Dict[str, int]:
    """
    Process a single flight album and extract web-ready photos

    Args:
        album_data: Flight album data loaded from JSON
        filename: Original filename for logging

    Returns:
        Dict with processing statistics
    """
    photos = album_data.get("photos", [])
    if not photos:
        print(f"⚠️  No photos found in {filename}")
        return {"processed": 0, "valid": 0, "saved": 0}

    processed_photos = []
    valid_count = 0

    print(f"🚀 Processing {len(photos)} photos from {filename}")

    for i, photo in enumerate(photos):
        if (i + 1) % 50 == 0:  # Progress every 50 photos
            print(f"   Progress: {i + 1}/{len(photos)} photos processed")

        processed_photo = process_photo(photo, album_data)
        if processed_photo:
            processed_photos.append(processed_photo)
            valid_count += 1

    print(f"✅ Processed {valid_count}/{len(photos)} valid photos from {filename}")

    # Save photos organized by date
    if processed_photos:
        save_stats = save_photos_by_date(processed_photos)
        return {
            "processed": len(photos),
            "valid": valid_count,
            "saved": save_stats["photos_saved"],
            "files_created": save_stats["files_created"],
        }
    else:
        return {"processed": len(photos), "valid": 0, "saved": 0, "files_created": 0}


def main():
    """
    Main function to process all flight albums and generate web-ready manifests
    """
    global DATE_SOURCE_STATS, NASA_ID_STATS

    print("NASA ISS Flickr Flight Photos Web Processor")
    print("=" * 50)

    # Reset statistics for this run
    DATE_SOURCE_STATS = {
        "dateTaken_property": 0,
        "description_date_override": 0,
        "description_only": 0,
        "none_returned": 0,
    }

    NASA_ID_STATS = {
        "extracted_from_description": 0,
        "extracted_from_title": 0,
        "no_id_available": 0,
    }

    # Check configuration
    if not INPUT_FOLDER:
        print("❌ INPUT_FOLDER not configured. Check RAW_FOLDER environment variable.")
        return False

    if not OUTPUT_FOLDER:
        print(
            "❌ OUTPUT_FOLDER not configured. Check WEB_ASSETS_FOLDER environment variable."
        )
        return False

    print(f"📁 Input: {INPUT_FOLDER}")
    print(f"📁 Output: {OUTPUT_FOLDER}")

    # Create output directory if it doesn't exist
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    # Find all flight album files
    flight_albums = find_flight_albums()
    if not flight_albums:
        print("❌ No flight albums found to process")
        return False

    # Process each album
    total_stats = {
        "albums_processed": 0,
        "albums_success": 0,
        "albums_error": 0,
        "total_photos_processed": 0,
        "total_photos_valid": 0,
        "total_photos_saved": 0,
        "total_files_created": 0,
    }

    print(f"\n🚀 Processing {len(flight_albums)} flight albums...")

    for i, album_path in enumerate(flight_albums):
        filename = album_path.name
        print(f"\n📸 Album {i+1}/{len(flight_albums)}: {filename}")

        # Load album data
        album_data = load_flight_album(album_path)
        if not album_data:
            total_stats["albums_error"] += 1
            continue

        try:
            # Process the album
            album_stats = process_album(album_data, filename)

            # Update totals
            total_stats["albums_processed"] += 1
            total_stats["albums_success"] += 1
            total_stats["total_photos_processed"] += album_stats["processed"]
            total_stats["total_photos_valid"] += album_stats["valid"]
            total_stats["total_photos_saved"] += album_stats["saved"]
            total_stats["total_files_created"] += album_stats.get("files_created", 0)

            print(
                f"✅ Album completed: {album_stats['valid']}/{album_stats['processed']} valid photos, {album_stats['saved']} photos saved"
            )

        except Exception as e:
            print(f"❌ Error processing album {filename}: {e}")
            total_stats["albums_error"] += 1

    # Print final statistics
    print(f"\n" + "=" * 50)
    print(f"📊 FINAL STATISTICS")
    print(f"   Albums processed: {total_stats['albums_success']}/{len(flight_albums)}")
    print(f"   Albums with errors: {total_stats['albums_error']}")
    print(f"   Total input photos: {total_stats['total_photos_processed']}")
    print(f"   Photos successfully processed: {total_stats['total_photos_valid']}")
    print(
        f"   Photos filtered out: {total_stats['total_photos_processed'] - total_stats['total_photos_valid']} (invalid date or missing data)"
    )
    print(
        f"   Photos saved to manifests (overwritten): {total_stats['total_photos_saved']}"
    )
    print(
        f"   Daily manifest files created/overwritten: {total_stats['total_files_created']}"
    )

    # Print date source statistics
    print(f"\n📅 DATE SOURCE STATISTICS:")
    total_date_attempts = sum(DATE_SOURCE_STATS.values())
    if total_date_attempts > 0:
        print(f"   Total photos with date processing: {total_date_attempts}")
        print(
            f"   Used dateTaken property: {DATE_SOURCE_STATS['dateTaken_property']} ({DATE_SOURCE_STATS['dateTaken_property']/total_date_attempts*100:.1f}%)"
        )
        print(
            f"   Used description date (override): {DATE_SOURCE_STATS['description_date_override']} ({DATE_SOURCE_STATS['description_date_override']/total_date_attempts*100:.1f}%)"
        )
        print(
            f"   Used description date only: {DATE_SOURCE_STATS['description_only']} ({DATE_SOURCE_STATS['description_only']/total_date_attempts*100:.1f}%)"
        )
        print(
            f"   No date found (returned None): {DATE_SOURCE_STATS['none_returned']} ({DATE_SOURCE_STATS['none_returned']/total_date_attempts*100:.1f}%)"
        )
    else:
        print("   No date processing statistics available")

    # Print NASA ID source statistics
    print(f"\n🆔 NASA ID SOURCE STATISTICS:")
    total_nasa_id_attempts = sum(NASA_ID_STATS.values())
    if total_nasa_id_attempts > 0:
        print(f"   Total photos with NASA ID processing: {total_nasa_id_attempts}")
        print(
            f"   NASA ID from description: {NASA_ID_STATS['extracted_from_description']} ({NASA_ID_STATS['extracted_from_description']/total_nasa_id_attempts*100:.1f}%)"
        )
        print(
            f"   NASA ID from title: {NASA_ID_STATS['extracted_from_title']} ({NASA_ID_STATS['extracted_from_title']/total_nasa_id_attempts*100:.1f}%)"
        )
        print(
            f"   No NASA ID found (set to None): {NASA_ID_STATS['no_id_available']} ({NASA_ID_STATS['no_id_available']/total_nasa_id_attempts*100:.1f}%)"
        )
    else:
        print("   No NASA ID processing statistics available")

    if total_stats["albums_success"] > 0:
        print(f"\n✅ Processing completed successfully!")
        return True
    else:
        print(f"\n❌ No albums processed successfully.")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
