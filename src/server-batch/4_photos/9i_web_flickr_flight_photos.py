"""
NASA ISS Flickr Flight Photos Web Processor

This script processes AI-classified flight photos from Flickr albums and generates
web-ready JSON manifests organized by date for the ISS Real-Time application.

Input: Flight photos from RAW_FOLDER/photos_flickr/albums_categorized_photos/*_flight.json
Output: Daily JSON files in WEB_ASSETS_FOLDER/photos_flickr/YYYY/MM/photos-manifest_YYYY-MM-DD.json

Features:
- Extracts dates from photo descriptions and validates against dateTaken metadata
- Processes Flickr URLs for different image sizes (small, med, large)
- Generates sourceUrl links to original Flickr photos
- Organizes output by date with year/month folder structure
- Handles various date formats found in human-written photo descriptions
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

print(f"🔧 Configuration:")
print(f"   Input folder (flight photos): {INPUT_FOLDER}")
print(f"   Output folder (web assets): {OUTPUT_FOLDER}")


def extract_date_from_description(description: str) -> Optional[datetime]:
    """
    Extract date from photo description using various regex patterns
    
    Common patterns in ISS photo descriptions:
    - ISS015-E-34417 (12 Oct. 2007) --- Astr...
    - ISS020-E-006429 (25 Dec 2009) --- ...
    - ISS013-E-54654 (9/15/06) --- ...
    - ISS025-E-009876 (12-25-2010) --- ...
    
    Args:
        description: The photo description text
        
    Returns:
        datetime object if date found, None otherwise
    """
    if not description:
        return None
    
    # Pattern 1: "12 Oct. 2007" or "12 Oct 2007"
    pattern1 = r'\((\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{4})\)'
    match1 = re.search(pattern1, description, re.IGNORECASE)
    if match1:
        day, month_name, year = match1.groups()
        month_map = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
        }
        month = month_map.get(month_name.lower())
        if month:
            try:
                return datetime(int(year), month, int(day))
            except ValueError:
                pass
    
    # Pattern 2: "9/15/06" or "9/15/2006"
    pattern2 = r'\((\d{1,2})/(\d{1,2})/(\d{2,4})\)'
    match2 = re.search(pattern2, description)
    if match2:
        month, day, year = match2.groups()
        # Handle 2-digit years
        if len(year) == 2:
            year_int = int(year)
            if year_int >= 90:  # Assume 1990s
                year = str(1900 + year_int)
            else:  # Assume 2000s
                year = str(2000 + year_int)
        try:
            return datetime(int(year), int(month), int(day))
        except ValueError:
            pass
    
    # Pattern 3: "12-25-2010" or "12-25-10"
    pattern3 = r'\((\d{1,2})-(\d{1,2})-(\d{2,4})\)'
    match3 = re.search(pattern3, description)
    if match3:
        month, day, year = match3.groups()
        # Handle 2-digit years
        if len(year) == 2:
            year_int = int(year)
            if year_int >= 90:  # Assume 1990s
                year = str(1900 + year_int)
            else:  # Assume 2000s
                year = str(2000 + year_int)
        try:
            return datetime(int(year), int(month), int(day))
        except ValueError:
            pass
    
    # Pattern 4: "25 Dec 2009" without parentheses
    pattern4 = r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{4})'
    match4 = re.search(pattern4, description, re.IGNORECASE)
    if match4:
        day, month_name, year = match4.groups()
        month_map = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
        }
        month = month_map.get(month_name.lower())
        if month:
            try:
                return datetime(int(year), month, int(day))
            except ValueError:
                pass
    
    return None


def extract_nasa_id_from_description(description: str) -> Optional[str]:
    """
    Extract NASA ID from photo description
    
    Common patterns:
    - ISS015-E-34417
    - jsc2023e052795
    - S134-E-007890
    
    Args:
        description: The photo description text
        
    Returns:
        NASA ID if found, None otherwise
    """
    if not description:
        return None
    
    # Pattern 1: ISS###-E-##### format
    pattern1 = r'(ISS\d{3}-E-\d{5,6})'
    match1 = re.search(pattern1, description, re.IGNORECASE)
    if match1:
        return match1.group(1).upper()
    
    # Pattern 2: S###-E-##### format (Shuttle missions)
    pattern2 = r'(S\d{3}-E-\d{5,6})'
    match2 = re.search(pattern2, description, re.IGNORECASE)
    if match2:
        return match2.group(1).upper()
    
    # Pattern 3: jsc####e###### format
    pattern3 = r'(jsc\d{4}e\d{6})'
    match3 = re.search(pattern3, description, re.IGNORECASE)
    if match3:
        return match3.group(1).lower()
    
    return None


def determine_correct_date(date_taken_str: str, description: str) -> Tuple[datetime, str]:
    """
    Determine the correct date by comparing dateTaken from JSON with description date
    
    Logic:
    - If dateTaken is within 3 days of description date, use dateTaken (accurate to seconds)
    - If dateTaken is way off or missing, use description date at midnight
    - Add dateSource field to track which method was used
    
    Args:
        date_taken_str: ISO datetime string from photo metadata
        description: Photo description text
        
    Returns:
        Tuple of (final_datetime, date_source)
    """
    description_date = extract_date_from_description(description)
    
    # Try to parse the dateTaken from the JSON
    date_taken = None
    if date_taken_str:
        try:
            # Handle various ISO formats
            if date_taken_str.endswith('Z'):
                date_taken = datetime.fromisoformat(date_taken_str[:-1])
            else:
                date_taken = datetime.fromisoformat(date_taken_str)
        except ValueError:
            try:
                # Try other common formats
                date_taken = datetime.strptime(date_taken_str, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                pass
    
    # If we have both dates, compare them
    if date_taken and description_date:
        time_diff = abs((date_taken.date() - description_date.date()).days)
        if time_diff <= 3:
            # Use dateTaken as it's accurate to seconds and close to description date
            return date_taken, "metadata_validated"
        else:
            # Use description date at midnight as dateTaken is too far off
            return description_date, "description_date_override"
    
    # If we only have dateTaken, use it
    if date_taken:
        return date_taken, "metadata_only"
    
    # If we only have description date, use it at midnight
    if description_date:
        return description_date, "description_only"
    
    # Fallback to current date (should rarely happen)
    return datetime.now(), "fallback_current"


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
            urls["medUrl"] = f"{base_path}_z.jpg"    # Large size  
            urls["largeUrl"] = f"{base_path}_b.jpg"  # Extra large size
    
    return urls


def create_flickr_source_url(photo: Dict, owner_nsid: str = "nasahqphoto") -> str:
    """
    Create a Flickr source URL that can be opened in a new window
    
    Args:
        photo: Photo object from Flickr API
        owner_nsid: Flickr user NSID (NASA HQ Photos by default)
        
    Returns:
        Full Flickr URL to the photo page
    """
    photo_id = photo.get("id", "")
    if photo_id:
        return f"{FLICKR_WEB_BASE_URL}/{owner_nsid}/{photo_id}"
    return ""


def process_photo(photo: Dict) -> Optional[Dict]:
    """
    Process a single photo from flight album and create web-ready output
    
    Args:
        photo: Photo object from AI-classified flight album
        
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
    nasa_id = extract_nasa_id_from_description(description)
    if not nasa_id:
        # Try title as fallback
        title = ""
        if isinstance(photo.get("title"), dict):
            title = photo["title"].get("_content", "")
        elif isinstance(photo.get("title"), str):
            title = photo["title"]
        nasa_id = extract_nasa_id_from_description(title)
    
    # Skip photos without NASA ID
    if not nasa_id:
        return None
    
    # Get the correct date
    date_taken_str = photo.get("datetaken", "")
    final_date, date_source = determine_correct_date(date_taken_str, description)
    
    # Extract Flickr URLs
    flickr_urls = extract_flickr_urls(photo)
    
    # Create source URL
    source_url = create_flickr_source_url(photo)
    
    # Build the output object
    output_photo = {
        "nasaId": nasa_id,
        "dateTaken": final_date.isoformat() + "Z",
        "dateSource": date_source,
        "smallUrl": flickr_urls["smallUrl"],
        "medUrl": flickr_urls["medUrl"],
        "largeUrl": flickr_urls["largeUrl"],
        "description": description,
        "sourceUrl": source_url
    }
    
    return output_photo


def save_photos_by_date(photos: List[Dict]) -> Dict[str, int]:
    """
    Save processed photos organized by date in year/month folders
    
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
            if date_taken_str.endswith('Z'):
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
            
            # Check if file already exists and load existing data
            existing_photos = []
            if os.path.exists(output_path):
                try:
                    with open(output_path, "r", encoding="utf-8") as f:
                        existing_data = json.load(f)
                        existing_photos = existing_data if isinstance(existing_data, list) else []
                except Exception as e:
                    print(f"⚠️  Could not load existing file {output_path}: {e}")
            
            # Merge with existing photos (avoid duplicates by nasaId)
            existing_ids = {photo.get("nasaId") for photo in existing_photos if photo.get("nasaId")}
            new_photos = [photo for photo in date_photos if photo.get("nasaId") not in existing_ids]
            
            if new_photos:
                combined_photos = existing_photos + new_photos
                
                # Sort by dateTaken
                combined_photos.sort(key=lambda x: x.get("dateTaken", ""))
                
                # Save the file
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(combined_photos, f, indent=2, ensure_ascii=False)
                
                print(f"✅ Saved {len(new_photos)} new photos to {output_filename} (total: {len(combined_photos)})")
                files_created += 1
                photos_saved += len(new_photos)
            else:
                print(f"ℹ️  No new photos for {date_key} (already have {len(existing_photos)} photos)")
                
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
        
        processed_photo = process_photo(photo)
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
            "files_created": save_stats["files_created"]
        }
    else:
        return {"processed": len(photos), "valid": 0, "saved": 0, "files_created": 0}


def main():
    """
    Main function to process all flight albums and generate web-ready manifests
    """
    print("NASA ISS Flickr Flight Photos Web Processor")
    print("=" * 50)
    
    # Check configuration
    if not INPUT_FOLDER:
        print("❌ INPUT_FOLDER not configured. Check RAW_FOLDER environment variable.")
        return False
    
    if not OUTPUT_FOLDER:
        print("❌ OUTPUT_FOLDER not configured. Check WEB_ASSETS_FOLDER environment variable.")
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
        "total_files_created": 0
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
            
            print(f"✅ Album completed: {album_stats['valid']}/{album_stats['processed']} valid photos, {album_stats['saved']} new photos saved")
            
        except Exception as e:
            print(f"❌ Error processing album {filename}: {e}")
            total_stats["albums_error"] += 1
    
    # Print final statistics
    print(f"\n" + "=" * 50)
    print(f"📊 FINAL STATISTICS")
    print(f"   Albums processed: {total_stats['albums_success']}/{len(flight_albums)}")
    print(f"   Albums with errors: {total_stats['albums_error']}")
    print(f"   Total photos processed: {total_stats['total_photos_processed']}")
    print(f"   Valid photos extracted: {total_stats['total_photos_valid']}")
    print(f"   New photos saved: {total_stats['total_photos_saved']}")
    print(f"   Daily manifest files created/updated: {total_stats['total_files_created']}")
    
    if total_stats["albums_success"] > 0:
        print(f"\n✅ Processing completed successfully!")
        return True
    else:
        print(f"\n❌ No albums processed successfully.")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
