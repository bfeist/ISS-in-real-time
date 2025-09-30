import json
import requests
import os
import re
import time
import random
from urllib.parse import quote_plus, urlparse, urljoin
from dotenv import load_dotenv
from bs4 import BeautifulSoup

load_dotenv(dotenv_path="../../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")

# Fallback if env not loaded
if not RAW_FOLDER:
    RAW_FOLDER = "F:/_repos/ISSiRT_assets/_raw/"
    print(f"Warning: Using hardcoded RAW_FOLDER path: {RAW_FOLDER}")

print(f"📂 RAW_FOLDER configured as: {RAW_FOLDER}")

# CDX API endpoints
BASE_CDX = "https://web.archive.org/cdx/search/cdx"
WAYBACK_SNAPSHOT = "https://web.archive.org/web/{timestamp}/{url}"

# Headers for polite requests
HEADERS = {
    "User-Agent": "NASATimelinesScraper/1.0 (+https://github.com/bfeist/ISS-in-real-time; contact: bf@benfeist.com)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# Create a session for connection reuse and better throttling handling
session = requests.Session()
session.headers.update(HEADERS)

# File extensions to capture (from original script)
FILE_EXTS = (".pdf", ".docx", ".doc")


def get_snapshots(target_url, limit=1000, max_year=2015):
    """Get all available snapshots of a URL using CDX API, filtered by year"""
    params = {
        "url": target_url,
        "output": "json",
        "fl": "timestamp,original,statuscode",
        "limit": limit,
        "filter": "statuscode:200",
        # Only get snapshots from max_year and earlier
        "to": f"{max_year}1231235959",  # End of max_year in YYYYMMDDHHMMSS format
    }

    print(f"🔍 Searching CDX for: {target_url} (up to {max_year})")

    # Add anti-throttling retry logic for CDX API
    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            # Add delay before each CDX request to be more polite
            if attempt > 0:
                wait_time = (attempt * 5) + random.uniform(1, 3)
                print(
                    f"⏳ CDX retry {attempt + 1}/{max_attempts}, waiting {wait_time:.1f}s"
                )
                time.sleep(wait_time)

            r = session.get(BASE_CDX, params=params, timeout=60)

            if r.status_code == 429:
                print(f"🚫 CDX rate limited (429), backing off...")
                continue
            elif r.status_code == 503:
                print(f"⚠️ CDX service unavailable (503), backing off...")
                continue

            r.raise_for_status()
            data = r.json()
            # First row is header, skip it
            snapshots = data[1:] if len(data) > 1 else []
            print(f"📊 Found {len(snapshots)} snapshots for {target_url} (≤{max_year})")
            return snapshots

        except requests.exceptions.ConnectionError as e:
            print(f"💥 CDX connection error (attempt {attempt + 1}): {e}")
            if attempt < max_attempts - 1:
                wait_time = (attempt + 1) * 10
                print(f"⏳ Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
        except Exception as e:
            print(f"❌ CDX error (attempt {attempt + 1}): {e}")
            if attempt < max_attempts - 1:
                time.sleep(5)

    print(f"❌ Failed to get snapshots after {max_attempts} attempts")
    return []


def convert_to_raw_url(wayback_url):
    """
    Convert a Wayback Machine URL to raw format for direct file downloads.
    This adds 'id_' before the original URL to get the raw file without wrapper.
    """
    # Check if it's already a Wayback Machine URL
    if "web.archive.org/web/" in wayback_url:
        # Extract timestamp and original URL
        # Format: https://web.archive.org/web/TIMESTAMP/ORIGINAL_URL
        parts = wayback_url.split("/web/")
        if len(parts) >= 2:
            timestamp_and_url = parts[1]
            # Split timestamp from URL (timestamp is first 14 digits)
            if len(timestamp_and_url) >= 14:
                timestamp = timestamp_and_url[:14]
                original_url = timestamp_and_url[15:]  # Skip the '/' after timestamp

                # Construct the raw URL with id_ prefix
                raw_url = f"https://web.archive.org/web/{timestamp}id_/{original_url}"
                print(f"🔄 Converted to raw URL: {raw_url}")
                return raw_url

    # If not a Wayback URL or conversion fails, return original
    return wayback_url


def generate_filename(wayback_url, original_filename):
    """Generate filename with year/month prefix (preserved from original script)"""
    # Month name to number mapping
    month_mapping = {
        "january": "01",
        "february": "02",
        "march": "03",
        "april": "04",
        "may": "05",
        "june": "06",
        "july": "07",
        "august": "08",
        "september": "09",
        "october": "10",
        "november": "11",
        "december": "12",
    }

    # Try to extract year/month from the original URL path
    year_month_prefix = ""
    if "/web/" in wayback_url and "web.archive.org" in wayback_url:
        # Extract the original URL from Wayback Machine format
        parts = wayback_url.split("/")
        if len(parts) > 5:
            original_path = "/".join(parts[5:])
            # Look for year/month pattern in path like "2000/november"
            path_match = re.search(r"/(\d{4})/(\w+)/", original_path)
            if path_match:
                year = path_match.group(1)
                month = path_match.group(2).lower()
                month_num = month_mapping.get(month, month)
                year_month_prefix = f"{year}_{month_num}__"

    # Create the final filename
    if year_month_prefix:
        filename = year_month_prefix + original_filename
    else:
        filename = original_filename

    # Clean the filename to be filesystem-safe
    filename = re.sub(r'[<>:"/\\|?*]', "_", filename)
    return filename


def fetch_with_backoff(url, out_path, max_attempts=6):
    """Fetch URL with exponential backoff and content validation"""
    wait = 1.0

    for attempt in range(1, max_attempts + 1):
        try:
            print(f"📡 Fetching (attempt {attempt}): {url}")
            r = session.get(url, stream=True, timeout=60)

            if r.status_code == 200:
                # Check Content-Type header first
                content_type = r.headers.get("Content-Type", "").lower()

                # If it's HTML but we're expecting a PDF, this is likely a Wayback wrapper
                expected_filename = os.path.basename(out_path).lower()
                if "text/html" in content_type and expected_filename.endswith(".pdf"):
                    print(
                        f"⚠️ Got HTML content for PDF file, this might be a Wayback wrapper"
                    )
                    # Don't return early - still try to save and validate

                # Ensure directory exists
                os.makedirs(os.path.dirname(out_path), exist_ok=True)

                with open(out_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)

                file_size = os.path.getsize(out_path)

                # Quick validation of downloaded content
                if validate_downloaded_content(out_path, expected_filename):
                    print(
                        f"✅ Downloaded valid file: {os.path.basename(out_path)} ({file_size} bytes)"
                    )
                    return True
                else:
                    print(
                        f"❌ Downloaded file failed validation: {os.path.basename(out_path)}"
                    )
                    # Remove invalid file
                    if os.path.exists(out_path):
                        os.remove(out_path)
                    return False

            elif r.status_code == 429 or r.status_code == 503:
                # Rate limited - check for Retry-After header
                ra = r.headers.get("Retry-After")
                if ra and ra.isdigit():
                    sleep_for = int(ra) + 1
                else:
                    sleep_for = wait + random.uniform(0, 1)
                print(f"⏳ Rate-limited (HTTP {r.status_code}); sleeping {sleep_for}s")
                time.sleep(sleep_for)

            else:
                print(f"❌ HTTP {r.status_code} for {url}")
                # For other 4xx/5xx, backoff and retry a few times
                time.sleep(wait + random.uniform(0, 1))

        except requests.RequestException as e:
            print(f"💥 Request error: {e}; backoff {wait}s")
            time.sleep(wait + random.uniform(0, 1))

        wait = min(wait * 2, 60)  # Cap at 60 seconds

    print(f"❌ Failed to fetch {url} after {max_attempts} attempts")
    return False


def validate_downloaded_content(file_path, filename):
    """Validate that downloaded file is the expected format, not HTML"""
    try:
        with open(file_path, "rb") as f:
            header = f.read(1024)  # Read first 1KB

        # Check if it's HTML (Wayback Machine wrapper or error page)
        html_indicators = [
            b"<!DOCTYPE html>",
            b"<html>",
            b"<HTML>",
            b"<title>Internet Archive Wayback Machine</title>",
            b"web.archive.org",
        ]

        for indicator in html_indicators:
            if indicator in header:
                print(f"⚠️ File {filename} contains HTML content: found {indicator}")
                return False

        # Check for PDF magic number
        if filename.lower().endswith(".pdf"):
            if not header.startswith(b"%PDF-"):
                print(f"⚠️ File {filename} is not a valid PDF (missing PDF header)")
                return False
            else:
                print(f"✅ Valid PDF header found for {filename}")

        # Check file size - if it's suspiciously small, it might be an error page
        file_size = os.path.getsize(file_path)
        if file_size < 500:  # Less than 500 bytes is suspicious for these documents
            print(f"⚠️ File {filename} is suspiciously small ({file_size} bytes)")
            return False

        print(f"✅ File {filename} validated ({file_size} bytes)")
        return True

    except Exception as e:
        print(f"❌ Error validating {filename}: {e}")
        return False


def extract_files_from_page(snapshot_url):
    """Extract file URLs from a NASA timeline page with anti-throttling"""
    max_attempts = 3

    for attempt in range(max_attempts):
        try:
            if attempt > 0:
                wait_time = attempt * 5 + random.uniform(1, 3)
                print(
                    f"⏳ Page fetch retry {attempt + 1}/{max_attempts}, waiting {wait_time:.1f}s"
                )
                time.sleep(wait_time)

            print(f"🔍 Extracting files from: {snapshot_url}")

            r = session.get(snapshot_url, timeout=60)

            if r.status_code == 429:
                print(f"🚫 Page rate limited (429), will retry...")
                continue
            elif r.status_code == 503:
                print(f"⚠️ Page service unavailable (503), will retry...")
                continue
            elif r.status_code != 200:
                print(f"❌ Failed to fetch page: HTTP {r.status_code}")
                return []

            soup = BeautifulSoup(r.content, "html.parser")

            file_urls = []
            all_links = soup.find_all("a", href=True)
            print(f"🔎 Found {len(all_links)} total links on page")

            # Debug: show some links to understand the structure
            pdf_links_found = 0
            for link in all_links:
                href = link["href"]
                # Convert relative URLs to absolute
                full_url = urljoin(snapshot_url, href)
                lower_url = full_url.lower()

                # Debug: count PDF links
                if any(lower_url.endswith(ext) for ext in FILE_EXTS):
                    pdf_links_found += 1
                    if pdf_links_found <= 3:  # Show first 3 for debugging
                        print(f"🔗 Found file link: {href}")
                        print(f"    Full URL: {full_url}")

                # Check if it's a file we want
                if any(lower_url.endswith(ext) for ext in FILE_EXTS):
                    # Extract original filename from the path
                    parsed_url = urlparse(full_url)
                    original_filename = os.path.basename(parsed_url.path)

                    if original_filename:
                        # Use the full URL as-is (it should be a Wayback Machine URL already)
                        file_urls.append(
                            {
                                "url": full_url,
                                "filename": original_filename,
                                "source_page": snapshot_url,
                            }
                        )

            print(f"🔎 Found {pdf_links_found} potential file links total")

            print(f"📄 Found {len(file_urls)} files on page")
            return file_urls

        except requests.exceptions.ConnectionError as e:
            print(f"💥 Connection error extracting files (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"💥 Error extracting files (attempt {attempt + 1}): {e}")

    print(f"❌ Failed to extract files after {max_attempts} attempts")
    return []


def normalize_url(url):
    """Normalize URLs to group similar ones together (remove port 80, etc.)"""
    # Remove explicit port 80 from HTTP URLs
    normalized = url.replace(
        "http://spaceflight.nasa.gov:80/", "http://spaceflight.nasa.gov/"
    )
    # Could add more normalizations here if needed
    return normalized


def find_best_snapshot(snapshots):
    """Find the best snapshot for each unique URL - just use the latest 2015 snapshot"""
    print(f"🔍 Selecting best 2015 snapshots from {len(snapshots)} total...")

    # Filter out PDF files - we only want HTML pages that contain links to PDFs
    html_snapshots = []
    for timestamp, original_url, status in snapshots:
        # Skip PDF files and other non-HTML content
        if not (
            original_url.lower().endswith(".pdf")
            or original_url.lower().endswith(".doc")
            or original_url.lower().endswith(".docx")
        ):
            html_snapshots.append((timestamp, original_url, status))

    print(
        f"📋 Filtered to {len(html_snapshots)} HTML pages from {len(snapshots)} total snapshots"
    )

    # Group snapshots by NORMALIZED URL to avoid duplicates like :80 port variations
    url_groups = {}
    for timestamp, original_url, status in html_snapshots:
        normalized_url = normalize_url(original_url)
        if normalized_url not in url_groups:
            url_groups[normalized_url] = []
        url_groups[normalized_url].append((timestamp, original_url, status))

    print(f"📋 After normalization, found {len(url_groups)} unique URL patterns")

    best_snapshots = []

    for normalized_url, url_snapshots in url_groups.items():
        # Sort by timestamp (descending) to get the latest 2015 snapshot
        url_snapshots.sort(key=lambda x: x[0], reverse=True)

        # Take the latest snapshot from 2015
        found_2015 = False
        for timestamp, original_url, status in url_snapshots:
            if timestamp.startswith("2015"):
                best_snapshots.append((timestamp, original_url, status))
                print(f"📅 Selected 2015 snapshot for {normalized_url}: {timestamp}")
                found_2015 = True
                break

        if not found_2015:
            # If no 2015 snapshot, take the latest available
            if url_snapshots:
                latest = url_snapshots[0]
                best_snapshots.append(latest)
                print(
                    f"📅 No 2015 snapshot found for {normalized_url}, using latest: {latest[0]}"
                )

    print(f"\n📋 Selected {len(best_snapshots)} unique snapshots (deduplicated)")
    return best_snapshots


def process_nasa_timelines(
    base_url_pattern, output_dir, per_request_delay=2.0, max_snapshots_per_url=100
):
    """
    Process NASA timeline pages using CDX API

    Args:
        base_url_pattern: URL pattern to search for (can use wildcards)
        output_dir: Directory to save files
        per_request_delay: Delay between requests
        max_snapshots_per_url: Max snapshots to process per URL pattern
    """

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    print(f"🚀 Starting NASA Timeline CDX scraper")
    print(f"📂 Output directory: {output_dir}")
    print(f"⏱️ Request delay: {per_request_delay}s")

    # Get snapshots for the URL pattern (2015 and earlier only)
    snapshots = get_snapshots(
        base_url_pattern, limit=max_snapshots_per_url, max_year=2015
    )

    if not snapshots:
        print("❌ No snapshots found for the given URL pattern")
        return

    # Find the best snapshot for each unique URL instead of processing all
    best_snapshots = find_best_snapshot(snapshots)

    if not best_snapshots:
        print("❌ No good snapshots found after analysis")
        return

    total_files_found = 0
    total_files_downloaded = 0
    total_files_skipped = 0

    print(f"\n🔄 Processing {len(best_snapshots)} selected snapshots...")

    for i, (timestamp, original_url, status) in enumerate(best_snapshots, 1):
        print(
            f"\n📅 [{i}/{len(best_snapshots)}] Processing BEST snapshot from {timestamp}"
        )

        # Construct Wayback Machine URL
        snapshot_url = WAYBACK_SNAPSHOT.format(timestamp=timestamp, url=original_url)

        # Extract files from this snapshot
        file_info_list = extract_files_from_page(snapshot_url)
        total_files_found += len(file_info_list)

        # Download each file
        for file_info in file_info_list:
            file_url = file_info["url"]
            original_filename = file_info["filename"]

            # Generate the expected filename with date prefix
            expected_filename = generate_filename(file_url, original_filename)
            file_path = os.path.join(output_dir, expected_filename)

            # Skip if file already exists
            if os.path.exists(file_path):
                print(f"⏭️ Already exists: {expected_filename}")
                total_files_skipped += 1
                continue

            # Convert Wayback URL to raw file URL (without wrapper)
            raw_file_url = convert_to_raw_url(file_url)
            print(f"📥 Converting to raw URL: {raw_file_url}")

            # Download the file (validation is now done inside fetch_with_backoff)
            success = fetch_with_backoff(raw_file_url, file_path)
            if success:
                total_files_downloaded += 1
            else:
                print(f"❌ Failed to download or validate: {expected_filename}")

            # Respectful delay between file downloads
            time.sleep(per_request_delay + random.uniform(0, 0.5))

        # Delay between page processing
        time.sleep(per_request_delay + random.uniform(0, 0.5))

    print(f"\n📊 Final Summary:")
    print(f"   📄 Total files found: {total_files_found}")
    print(f"   ✅ Files downloaded: {total_files_downloaded}")
    print(f"   ⏭️ Files skipped (already exist): {total_files_skipped}")
    print(
        f"   ❌ Failed downloads: {total_files_found - total_files_downloaded - total_files_skipped}"
    )


def main():
    """Main function to run the scraper with NASA timeline URLs"""

    output_dir = os.path.join(RAW_FOLDER, "station_timelines_wayback_scrape")

    # NASA timeline URL patterns - TEST: just December 2000 first
    url_patterns = [
        # 2000 - Testing with just December first
        "spaceflight.nasa.gov/station/timelines/2000/december/index.html",
    ]

    # Full list (commented out for testing):
    url_patterns = [
        # 2000
        # "spaceflight.nasa.gov/station/timelines/2000/november/index.html",
        # "spaceflight.nasa.gov/station/timelines/2000/december/index.html",
        # 2001
        "spaceflight.nasa.gov/station/timelines/2001/january/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/february/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/march/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/april/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/may/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/june/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/july/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/august/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/september/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/october/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/november/index.html",
        "spaceflight.nasa.gov/station/timelines/2001/december/index.html",
        # 2002
        "spaceflight.nasa.gov/station/timelines/2002/january/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/february/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/march/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/april/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/may/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/june/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/july/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/august/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/september/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/october/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/november/index.html",
        "spaceflight.nasa.gov/station/timelines/2002/december/index.html",
        # 2003
        "spaceflight.nasa.gov/station/timelines/2003/january/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/february/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/march/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/april/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/may/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/june/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/july/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/august/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/september/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/october/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/november/index.html",
        "spaceflight.nasa.gov/station/timelines/2003/december/index.html",
        # 2004
        "spaceflight.nasa.gov/station/timelines/2004/january/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/february/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/march/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/april/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/may/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/june/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/july/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/august/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/september/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/october/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/november/index.html",
        "spaceflight.nasa.gov/station/timelines/2004/december/index.html",
        # 2005 (January through April)
        "spaceflight.nasa.gov/station/timelines/2005/january/index.html",
        "spaceflight.nasa.gov/station/timelines/2005/february/index.html",
        "spaceflight.nasa.gov/station/timelines/2005/march/index.html",
        "spaceflight.nasa.gov/station/timelines/2005/april/index.html",
    ]

    for pattern in url_patterns:
        print(f"\n🎯 Processing URL pattern: {pattern}")
        process_nasa_timelines(
            base_url_pattern=pattern,
            output_dir=output_dir,
            per_request_delay=5.0,  # Much more respectful delay
            max_snapshots_per_url=50,  # Smaller batches to reduce load
        )

        # Respectful delay between different URL patterns
        print(f"⏳ Waiting 10 seconds before next URL pattern to avoid throttling...")
        time.sleep(10.0)


if __name__ == "__main__":
    main()
