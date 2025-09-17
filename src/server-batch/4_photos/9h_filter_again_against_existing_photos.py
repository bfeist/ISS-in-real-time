"""
NASA ISS Photo Cross-Filter: Remove Existing Photos from Flickr Albums

This script filters Flickr photo albums (processed by 9g_make_filtered_list_using_ai.py)
by removing any photos that match NASA photo IDs from multiple existing data sources.

The script:
1. Loads earth photography manifest files on-demand and caches NASA IDs for fast lookups
2. Loads images_nasa_gov.json and photos_manual.json data sources
3. Extracts NASA IDs from Flickr photo descriptions (e.g., "jsc2023e052795" from description text)
4. Filters out any Flickr photos that have matching NASA IDs in any existing photo database
5. Saves filtered results with _flight_filtered suffix
6. Stores extracted NASA ID as separate property in each photo object

Data Sources Filtered Against:
- Earth photography: WEB_ASSETS_FOLDER/earth_photography/YYYY/MM/images-manifest_YYYY-MM-DD.json
- NASA Images.gov: WEB_ASSETS_FOLDER/images_nasa_gov.json
- Manual photos: WEB_ASSETS_FOLDER/photos_manual.json

Directory Structure:
- Flickr albums: RAW_FOLDER/photos_flickr/albums_filtered/*_flight.json
- Output: RAW_FOLDER/photos_flickr/albums_filtered/*_flight_filtered.json
"""

import os
import json
import re
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from dotenv import load_dotenv
import argparse
from typing import Set, Dict, List, Optional

# Load environment variables
load_dotenv(dotenv_path="../../../.env")

RAW_FOLDER = os.getenv("RAW_FOLDER")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")

# Directory paths
EARTH_PHOTOGRAPHY_FOLDER = (
    os.path.join(WEB_ASSETS_FOLDER, "earth_photography") if WEB_ASSETS_FOLDER else None
)
FLICKR_ALBUMS_FOLDER = (
    os.path.join(RAW_FOLDER, "photos_flickr", "albums_filtered") if RAW_FOLDER else None
)

# NASA ID pattern - matches NASA photo IDs with specific prefixes and formats
# Examples: iss067e253397, jsc2023e052795, nhq202111080001, jsc2021e044353_alt, iss071e581260_alt, iss068-s-002
NASA_ID_PATTERN = re.compile(
    r"^((?:iss|jsc)\d+e\d+|nhq\d+|iss\d+-s-\d+)\s*", re.IGNORECASE
)

# Cache for all photo NASA IDs
photo_ids_cache: Dict[str, Set[str]] = {}  # date -> set of NASA IDs
cache_stats = {"hits": 0, "misses": 0, "total_ids_loaded": 0}


class AllPhotoIDCache:
    """
    Efficient cache for NASA photo IDs from all sources with on-demand loading
    """

    def __init__(self, earth_photo_folder: str, web_assets_folder: str):
        self.earth_photo_folder = Path(earth_photo_folder)
        self.web_assets_folder = Path(web_assets_folder)
        self.date_cache: Dict[str, Set[str]] = {}
        self.all_ids: Optional[Set[str]] = None
        self.images_nasa_gov_ids: Optional[Set[str]] = None
        self.photos_manual_ids: Optional[Set[str]] = None
        self.stats = {
            "cache_hits": 0,
            "cache_misses": 0,
            "files_loaded": 0,
            "total_ids_loaded": 0,
            "images_nasa_gov_loaded": 0,
            "photos_manual_loaded": 0,
        }

    def get_ids_for_date(self, date_str: str) -> Set[str]:
        """
        Get NASA IDs for a specific date (YYYY-MM-DD format)
        Loads and caches on first access
        """
        if date_str in self.date_cache:
            self.stats["cache_hits"] += 1
            return self.date_cache[date_str]

        # Cache miss - load the file
        self.stats["cache_misses"] += 1
        year, month, day = date_str.split("-")

        manifest_path = (
            self.earth_photo_folder
            / year
            / month
            / f"images-manifest_{year}-{month}-{day}.json"
        )

        ids = set()
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                for item in data:
                    if isinstance(item, dict) and "ID" in item:
                        ids.add(
                            item["ID"].lower()
                        )  # Store lowercase for case-insensitive matching

                self.stats["files_loaded"] += 1
                self.stats["total_ids_loaded"] += len(ids)
                print(f"   📅 Loaded {len(ids)} earth photo IDs for {date_str}")

            except Exception as e:
                print(f"   ⚠️  Error loading earth photography data for {date_str}: {e}")

        self.date_cache[date_str] = ids
        return ids

    def get_ids_for_date_range(self, start_date: str, end_date: str) -> Set[str]:
        """
        Get NASA IDs for a date range (inclusive)
        """
        all_ids = set()
        current = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")

        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            date_ids = self.get_ids_for_date(date_str)
            all_ids.update(date_ids)
            current += timedelta(days=1)

        return all_ids

    def preload_year_month(self, year: int, month: int):
        """
        Preload all earth photography IDs for a given year/month
        Useful when processing albums that span specific time periods
        """
        year_str = str(year)
        month_str = f"{month:02d}"

        month_folder = self.earth_photo_folder / year_str / month_str
        if not month_folder.exists():
            return

        manifest_files = list(month_folder.glob("images-manifest_*.json"))
        print(
            f"   📂 Preloading {len(manifest_files)} earth photography files for {year_str}-{month_str}"
        )

        for manifest_file in manifest_files:
            # Extract date from filename: images-manifest_2023-04-15.json
            filename = manifest_file.name
            if match := re.match(
                r"images-manifest_(\d{4}-\d{2}-\d{2})\.json", filename
            ):
                date_str = match.group(1)
                self.get_ids_for_date(date_str)  # This will cache it

    def get_all_ids(self) -> Set[str]:
        """
        Get all NASA Earth photography IDs loaded into a single set for fast lookup
        Loads all manifest files on first call
        """
        if self.all_ids is not None:
            return self.all_ids

        self.all_ids = set()
        current_year = datetime.now().year

        print(f"   🌍 Preloading all earth photography IDs (2000-{current_year})...")

        for year in range(2000, current_year + 1):
            year_str = str(year)
            year_folder = self.earth_photo_folder / year_str
            if not year_folder.exists():
                continue

            for month in range(1, 13):
                month_str = f"{month:02d}"
                month_folder = year_folder / month_str
                if not month_folder.exists():
                    continue

                manifest_files = list(month_folder.glob("images-manifest_*.json"))
                for manifest_file in manifest_files:
                    try:
                        with open(manifest_file, "r", encoding="utf-8") as f:
                            data = json.load(f)

                        for item in data:
                            if isinstance(item, dict) and "ID" in item:
                                self.all_ids.add(item["ID"].lower())

                        self.stats["files_loaded"] += 1

                    except Exception as e:
                        print(
                            f"   ⚠️  Error loading earth photography data from {manifest_file.name}: {e}"
                        )

        # Load images_nasa_gov IDs
        nasa_gov_ids = self.get_images_nasa_gov_ids()
        self.all_ids.update(nasa_gov_ids)

        # Load photos_manual IDs
        manual_ids = self.get_photos_manual_ids()
        self.all_ids.update(manual_ids)

        self.stats["total_ids_loaded"] = len(self.all_ids)
        print(f"   ✅ Total loaded photo IDs from all sources: {len(self.all_ids)}")
        return self.all_ids

    def get_images_nasa_gov_ids(self) -> Set[str]:
        """
        Get all NASA IDs from images_nasa_gov.json
        """
        if self.images_nasa_gov_ids is not None:
            return self.images_nasa_gov_ids

        self.images_nasa_gov_ids = set()
        images_file = self.web_assets_folder / "images_nasa_gov.json"

        if images_file.exists():
            try:
                with open(images_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if isinstance(data, list):
                    for photo in data:
                        if isinstance(photo, dict):
                            photo_id = photo.get("ID")
                            if photo_id:
                                self.images_nasa_gov_ids.add(photo_id.lower())

                self.stats["images_nasa_gov_loaded"] = len(self.images_nasa_gov_ids)
                print(
                    f"   📸 Loaded {len(self.images_nasa_gov_ids)} NASA Images.gov IDs"
                )

            except Exception as e:
                print(f"   ⚠️  Error loading images_nasa_gov.json: {e}")
        else:
            print(f"   ⚠️  images_nasa_gov.json not found at {images_file}")

        return self.images_nasa_gov_ids

    def get_photos_manual_ids(self) -> Set[str]:
        """
        Get all NASA IDs from photos_manual.json
        """
        if self.photos_manual_ids is not None:
            return self.photos_manual_ids

        self.photos_manual_ids = set()
        manual_file = self.web_assets_folder / "photos_manual.json"

        if manual_file.exists():
            try:
                with open(manual_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                if isinstance(data, list):
                    for photo in data:
                        if isinstance(photo, dict):
                            photo_id = photo.get("ID")
                            if photo_id:
                                self.photos_manual_ids.add(photo_id.lower())

                self.stats["photos_manual_loaded"] = len(self.photos_manual_ids)
                print(f"   📷 Loaded {len(self.photos_manual_ids)} manual photo IDs")

            except Exception as e:
                print(f"   ⚠️  Error loading photos_manual.json: {e}")
        else:
            print(f"   ⚠️  photos_manual.json not found at {manual_file}")

        return self.photos_manual_ids

    def get_stats(self) -> Dict:
        """Return cache statistics"""
        stats = self.stats.copy()
        stats["all_ids_loaded"] = len(self.all_ids) if self.all_ids else 0
        return stats


def extract_nasa_id_from_description(description: str) -> Optional[str]:
    """
    Extract NASA ID from Flickr photo description text

    The pattern looks for any alphanumeric identifier at the beginning of the description
    followed by optional space and opening parenthesis.

    Args:
        description: Full description text from Flickr photo

    Returns:
        NASA ID if found, None otherwise

    Examples:
        "jsc2023e052795 (April 20, 2023) --- Roscosmos cosmonaut..." -> "jsc2023e052795"
        "iss068e012345 Some description text" -> "iss068e012345"
        "ISS010-E-21194 (23 March 2005) --- Cosmonaut Salizhan..." -> "iss010-e-21194"
        "s134e012345 Another description" -> "s134e012345"
        "exp70e001234 Mission description" -> "exp70e001234"
        "jsc2021e044353_alt (date) --- description" -> "jsc2021e044353_alt"
        "iss072e747210(March 18, 2025) --- description" -> "iss072e747210"
        "-iss068e040120 (Jan. 13, 2023) --- ..." -> "iss068e040120"
        "iss068e036296- (Jan. 1, 2022) --- ..." -> "iss068e036296"
        "-iss068e040120 (Jan. 13, 2023) --- ..." -> "iss068e040120"
        "iss068e036296- (Jan. 1, 2022) --- ..." -> "iss068e036296"
    """
    if not description or not isinstance(description, str):
        return None

    # Clean the description: strip whitespace and remove leading non-letter characters
    description = description.strip()
    description = re.sub(r"^[^a-zA-Z]*", "", description)

    match = NASA_ID_PATTERN.search(description)
    return match.group(1).lower() if match else None


def load_flickr_album(album_path: Path) -> Optional[Dict]:
    """
    Load a Flickr album JSON file

    Args:
        album_path: Path to the album JSON file

    Returns:
        Album data dictionary or None if error
    """
    try:
        with open(album_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict) or "photos" not in data:
            print(f"   ❌ Invalid album format: {album_path.name}")
            return None

        return data

    except Exception as e:
        print(f"   ❌ Error loading album {album_path.name}: {e}")
        return None


def filter_album_against_existing_photos(
    album_data: Dict, photo_cache: AllPhotoIDCache
) -> Dict:
    """
    Filter Flickr album to keep only photos with NASA IDs that do not match existing photo databases.
    Removes photos that match existing photo IDs and photos without NASA IDs.

    Args:
        album_data: Flickr album data dictionary
        photo_cache: All photo ID cache

    Returns:
        Dictionary with filtering results
    """
    photos = album_data.get("photos", [])
    filtered_photos = []
    removed_photos = []
    extraction_stats = {"extracted": 0, "no_nasa_id": 0, "matched_existing": 0}

    # Get all existing photo IDs for fast lookup
    all_existing_ids = photo_cache.get_all_ids()

    print(f"   🔍 Processing {len(photos)} photos...")

    for i, photo in enumerate(photos):
        # Show progress every 100 photos
        if (i + 1) % 100 == 0:
            print(f"   📊 Progress: {i + 1}/{len(photos)} photos processed")

        # Extract NASA ID from description
        description_content = ""
        if isinstance(photo.get("description"), dict):
            description_content = photo["description"].get("_content", "")
        elif isinstance(photo.get("description"), str):
            description_content = photo["description"]

        nasa_id = extract_nasa_id_from_description(description_content)

        # If not found in description, try title
        if not nasa_id:
            title_content = ""
            if isinstance(photo.get("title"), dict):
                title_content = photo["title"].get("_content", "")
            elif isinstance(photo.get("title"), str):
                title_content = photo["title"]
            nasa_id = extract_nasa_id_from_description(title_content)

        # Create enhanced photo object with NASA ID
        enhanced_photo = photo.copy()

        if nasa_id:
            enhanced_photo["nasa_id"] = nasa_id
            extraction_stats["extracted"] += 1

            # Check against all existing photo databases
            if nasa_id in all_existing_ids:
                enhanced_photo["removal_reason"] = "matched_existing_photo"
                removed_photos.append(enhanced_photo)
                extraction_stats["matched_existing"] += 1
                print(
                    f"   🚫 Removed photo with NASA ID {nasa_id} (matches existing photo database)"
                )
            else:
                filtered_photos.append(enhanced_photo)
        else:
            enhanced_photo["nasa_id"] = None
            extraction_stats["no_nasa_id"] += 1
            enhanced_photo["removal_reason"] = "no_nasa_id"
            removed_photos.append(enhanced_photo)

    return {
        "filtered_photos": filtered_photos,
        "removed_photos": removed_photos,
        "stats": extraction_stats,
        "original_count": len(photos),
        "filtered_count": len(filtered_photos),
        "removed_count": len(removed_photos),
    }


def save_filtered_album(
    album_data: Dict, output_path: Path, filter_results: Dict
) -> bool:
    """
    Save filtered album data to JSON file

    Args:
        album_data: Original album data
        output_path: Path to save filtered album
        filter_results: Results from filtering process

    Returns:
        True if successful, False otherwise
    """
    try:
        # Create enhanced album data
        filtered_album = album_data.copy()
        filtered_album["photos"] = filter_results["filtered_photos"]

        # Add filtering metadata
        if "metadata" not in filtered_album:
            filtered_album["metadata"] = {}

        filtered_album["metadata"].update(
            {
                "existing_photo_filtered_at": datetime.now().isoformat(),
                "original_photo_count": filter_results["original_count"],
                "existing_filtered_photo_count": filter_results["filtered_count"],
                "existing_removed_photo_count": filter_results["removed_count"],
                "nasa_ids_extracted": filter_results["stats"]["extracted"],
                "photos_removed_no_nasa_id": filter_results["stats"]["no_nasa_id"],
                "photos_matched_existing_db": filter_results["stats"][
                    "matched_existing"
                ],
                "filter_description": "Kept only photos with NASA IDs not matching existing photo databases (earth photography, images_nasa_gov, photos_manual); removed existing photo matches and photos without NASA IDs",
            }
        )

        # Save to file
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(filtered_album, f, indent=2, ensure_ascii=False)

        print(f"   ✅ Saved filtered album: {output_path.name}")
        return True

    except Exception as e:
        print(f"   ❌ Error saving filtered album: {e}")
        return False


def find_flight_albums() -> List[Path]:
    """
    Find all *_flight.json albums in the albums_filtered folder

    Returns:
        List of Path objects for flight albums
    """
    if not FLICKR_ALBUMS_FOLDER or not os.path.exists(FLICKR_ALBUMS_FOLDER):
        print(f"❌ Flickr albums folder not found: {FLICKR_ALBUMS_FOLDER}")
        return []

    albums_folder = Path(FLICKR_ALBUMS_FOLDER)
    flight_albums = list(albums_folder.glob("*_flight.json"))

    # Sort by filename for consistent processing order
    flight_albums.sort(key=lambda x: x.name)

    print(f"✅ Found {len(flight_albums)} flight albums to process")
    return flight_albums


def process_album(album_path: Path, photo_cache: AllPhotoIDCache) -> Dict:
    """
    Process a single flight album and create filtered version

    Args:
        album_path: Path to the flight album JSON file
        photo_cache: All photo ID cache

    Returns:
        Processing results dictionary
    """
    album_name = album_path.name

    # Create output path
    output_name = album_name.replace("_flight.json", "_flight_filtered.json")
    output_path = album_path.parent / output_name

    print(f"\n📸 Processing: {album_name}")

    # Load album data
    album_data = load_flickr_album(album_path)
    if not album_data:
        return {
            "status": "error",
            "album": album_name,
            "error": "Could not load album data",
        }

    original_count = len(album_data.get("photos", []))
    print(f"   📊 Original photos: {original_count}")

    if original_count == 0:
        print(f"   ⚠️  No photos in album, skipping")
        return {"status": "skipped", "album": album_name, "reason": "No photos"}

    # Filter against existing photos
    filter_results = filter_album_against_existing_photos(album_data, photo_cache)

    # Extract photos without NASA IDs for reporting
    no_nasa_id_photos = [
        p
        for p in filter_results["removed_photos"]
        if p.get("removal_reason") == "no_nasa_id"
    ]

    # Save filtered results
    success = save_filtered_album(album_data, output_path, filter_results)

    if success:
        print(
            f"   📊 Results: {filter_results['filtered_count']} kept, {filter_results['removed_count']} removed"
        )
        print(
            f"   📊 NASA IDs: {filter_results['stats']['extracted']} extracted, {filter_results['stats']['matched_existing']} matched existing DB"
        )

        return {
            "status": "success",
            "album": album_name,
            "original_count": filter_results["original_count"],
            "filtered_count": filter_results["filtered_count"],
            "removed_count": filter_results["removed_count"],
            "nasa_ids_extracted": filter_results["stats"]["extracted"],
            "existing_matches": filter_results["stats"]["matched_existing"],
            "no_nasa_id_photos": no_nasa_id_photos,
        }
    else:
        return {
            "status": "error",
            "album": album_name,
            "error": "Could not save filtered album",
        }


def main():
    """
    Main processing function
    """
    print(
        "NASA ISS Photo Cross-Filter: Keep Only Non-Existing NASA Photos from Flickr Albums"
    )
    print("=" * 80)

    # Validate configuration
    if not RAW_FOLDER or not WEB_ASSETS_FOLDER:
        print("❌ Environment variables RAW_FOLDER and WEB_ASSETS_FOLDER must be set")
        return False

    if not EARTH_PHOTOGRAPHY_FOLDER or not os.path.exists(EARTH_PHOTOGRAPHY_FOLDER):
        print(f"❌ Earth photography folder not found: {EARTH_PHOTOGRAPHY_FOLDER}")
        return False

    if not FLICKR_ALBUMS_FOLDER or not os.path.exists(FLICKR_ALBUMS_FOLDER):
        print(f"❌ Flickr albums folder not found: {FLICKR_ALBUMS_FOLDER}")
        return False

    print(f"📁 Earth photography folder: {EARTH_PHOTOGRAPHY_FOLDER}")
    print(f"📁 Web assets folder: {WEB_ASSETS_FOLDER}")
    print(f"📁 Flickr albums folder: {FLICKR_ALBUMS_FOLDER}")

    # Initialize all photo cache
    photo_cache = AllPhotoIDCache(EARTH_PHOTOGRAPHY_FOLDER, WEB_ASSETS_FOLDER)

    # Preload all photo IDs for fast lookup
    print("🌍 Preloading all photo IDs from all sources...")
    all_photo_ids = photo_cache.get_all_ids()
    print(f"✅ Loaded {len(all_photo_ids)} total photo IDs into memory")

    # Find flight albums to process
    flight_albums = find_flight_albums()
    if not flight_albums:
        print("❌ No flight albums found to process")
        return False

    # Process each album
    results = {
        "success": 0,
        "skipped": 0,
        "errors": 0,
        "total_original_photos": 0,
        "total_filtered_photos": 0,
        "total_removed_photos": 0,
        "total_nasa_ids_extracted": 0,
        "total_existing_matches": 0,
        "no_nasa_id_photos": [],
    }

    for i, album_path in enumerate(flight_albums, 1):
        print(f"\n[{i}/{len(flight_albums)}] ", end="")

        result = process_album(album_path, photo_cache)

        if result["status"] == "success":
            results["success"] += 1
            results["total_original_photos"] += result["original_count"]
            results["total_filtered_photos"] += result["filtered_count"]
            results["total_removed_photos"] += result["removed_count"]
            results["total_nasa_ids_extracted"] += result["nasa_ids_extracted"]
            results["total_existing_matches"] += result["existing_matches"]
            results["no_nasa_id_photos"].extend(result["no_nasa_id_photos"])
        elif result["status"] == "skipped":
            results["skipped"] += 1
        else:
            results["errors"] += 1
            print(f"   ❌ Error: {result.get('error', 'Unknown error')}")

    # Final summary
    print(f"\n" + "=" * 80)
    print(f"🏁 PROCESSING COMPLETE")
    print(f"📊 Albums processed: {results['success']}")
    print(f"⏭️  Albums skipped: {results['skipped']}")
    print(f"❌ Albums failed: {results['errors']}")
    print(f"📸 Total original photos: {results['total_original_photos']}")
    print(f"✅ Total filtered photos: {results['total_filtered_photos']}")
    print(f"🚫 Total removed photos: {results['total_removed_photos']}")
    print(f"🔍 Total NASA IDs extracted: {results['total_nasa_ids_extracted']}")
    print(f"📸 Total existing photo matches: {results['total_existing_matches']}")

    if results["total_original_photos"] > 0:
        removal_rate = (
            results["total_removed_photos"] / results["total_original_photos"]
        ) * 100
        print(f"📈 Existing photo removal rate: {removal_rate:.1f}%")

    # Show cache statistics
    cache_stats = photo_cache.get_stats()
    print(f"\n📊 Photo Cache Statistics:")
    print(f"   Cache hits: {cache_stats['cache_hits']}")
    print(f"   Cache misses: {cache_stats['cache_misses']}")
    print(f"   Files loaded: {cache_stats['files_loaded']}")
    print(f"   Total IDs loaded: {cache_stats['total_ids_loaded']}")
    print(f"   NASA Images.gov IDs: {cache_stats['images_nasa_gov_loaded']}")
    print(f"   Manual photo IDs: {cache_stats['photos_manual_loaded']}")
    print(f"   All IDs in memory: {cache_stats['all_ids_loaded']}")

    print(f"\n📁 Filtered albums saved to: {FLICKR_ALBUMS_FOLDER}")

    # Show photos without NASA IDs
    if results["no_nasa_id_photos"]:
        print(
            f"\n📋 Photos without NASA IDs ({len(results['no_nasa_id_photos'])} total):"
        )
        for photo in results["no_nasa_id_photos"]:
            flickr_id = photo.get("id", "Unknown")
            title = (
                photo.get("title", {}).get("_content", "No title")
                if isinstance(photo.get("title"), dict)
                else photo.get("title", "No title")
            )
            description = (
                photo.get("description", {}).get("_content", "No description")
                if isinstance(photo.get("description"), dict)
                else photo.get("description", "No description")
            )
            print(f"   🖼️  ID: {flickr_id}")
            print(f"       Title: {title}")
            print(
                f"       Description: {description[:100]}{'...' if len(description) > 100 else ''}"
            )
            print()

    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Filter Flickr flight albums to keep only photos with NASA IDs not matching existing photo databases (earth photography, images_nasa_gov, photos_manual)"
    )
    args = parser.parse_args()

    success = main()
    exit(0 if success else 1)
