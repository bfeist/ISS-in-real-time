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


def wayback_urljoin(base_wayback_url, relative_url):
    """
    Join a relative URL with a Wayback Machine base URL.
    Handles special Wayback flags like mp_, id_, etc. that break standard urljoin.
    
    This is used as a fallback when standard urljoin produces incomplete URLs.
    
    Args:
        base_wayback_url: Full Wayback URL (e.g., https://web.archive.org/web/20150906060142mp_/http://www.nasa.gov/page.html)
        relative_url: Relative URL to join (e.g., /other/page.html)
    
    Returns:
        Full Wayback URL
    """
    # Check if it's a Wayback URL
    if "web.archive.org/web/" in base_wayback_url:
        # Extract timestamp (with optional flags like mp_, id_, etc.) and original URL
        # Pattern: /web/TIMESTAMPflags_/ORIGINAL_URL or /web/TIMESTAMP/ORIGINAL_URL
        match = re.search(r'/web/(\d+)(?:[a-z_]+)?/(.+)', base_wayback_url)
        if match:
            timestamp = match.group(1)
            original_url = match.group(2)
            
            # Parse the original URL to get its base
            parsed_original = urlparse(original_url)
            original_base = f"{parsed_original.scheme}://{parsed_original.netloc}"
            
            # If relative_url starts with /, join it with the original domain
            if relative_url.startswith('/'):
                full_original_url = original_base + relative_url
            elif relative_url.startswith('http'):
                # Already absolute
                full_original_url = relative_url
            else:
                # Relative to current path
                original_path = parsed_original.path
                original_dir = '/'.join(original_path.split('/')[:-1])
                full_original_url = original_base + original_dir + '/' + relative_url
            
            # Construct the Wayback URL (without flags for cleaner URLs)
            return f"https://web.archive.org/web/{timestamp}/{full_original_url}"
    
    # If not a Wayback URL, use standard urljoin
    return urljoin(base_wayback_url, relative_url)

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

# File extensions to capture
FILE_EXTS = (".pdf", ".docx", ".doc")

# Year page URLs (2005-2014)
YEAR_PAGE_URLS = {
    # 2005: "http://www.nasa.gov/mission_pages/station/timelines/2005_timelines_main.html",
    # 2006: "http://www.nasa.gov/mission_pages/station/timelines/2006_timelines_main.html",
    2007: "http://www.nasa.gov/mission_pages/station/timelines/2007_timelines_main.html",
    2008: "http://www.nasa.gov/mission_pages/station/timelines/2008_timelines_main.html",
    2009: "http://www.nasa.gov/mission_pages/station/timelines/2009_timelines_main.html",
    2010: "http://www.nasa.gov/mission_pages/station/timelines/2010_timelines_main.html",
    2011: "http://www.nasa.gov/mission_pages/station/timelines/2011_timelines_main.html",
    2012: "http://www.nasa.gov/mission_pages/station/timelines/2012_timelines_main.html",
    2013: "http://www.nasa.gov/mission_pages/station/timelines/2013_timelines_main.html",
    2014: "http://www.nasa.gov/content/2014-international-space-station-timelines",
}


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


def find_best_snapshot(snapshots, prefer_year=2015):
    """Find the best snapshot - prefer latest from prefer_year"""
    if not snapshots:
        return None

    # Sort by timestamp (descending) to get the latest
    snapshots.sort(key=lambda x: x[0], reverse=True)

    # Try to find a snapshot from prefer_year
    for timestamp, original_url, status in snapshots:
        if timestamp.startswith(str(prefer_year)):
            print(f"📅 Selected {prefer_year} snapshot: {timestamp}")
            return (timestamp, original_url, status)

    # If no prefer_year snapshot, take the latest available
    if snapshots:
        latest = snapshots[0]
        print(f"📅 No {prefer_year} snapshot found, using latest: {latest[0]}")
        return latest

    return None


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


def extract_year_month_from_url(url):
    """
    Extract year and month from various NASA timeline URL formats.
    Examples:
      - 01_2006_tl.html -> (2006, '01')
      - 05_2005_tl.html -> (2005, '05')
      - 9_2012_tl.html -> (2012, '09')
      - /international-space-station-timelines-november-2014/ -> (2014, '11')
    Returns (year, month_num) or (None, None) if not found
    """
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
    
    # Pattern 1: MM_YYYY_tl.html or M_YYYY_tl.html (handles both single and double digit months)
    match = re.search(r"/(\d{1,2})_(\d{4})_tl\.html", url)
    if match:
        month_num = match.group(1).zfill(2)  # Pad single digit with zero
        year = int(match.group(2))
        return (year, month_num)

    # Pattern 2: /timelines/2005/may/
    match = re.search(r"/timelines/(\d{4})/(\w+)/", url)
    if match:
        year = int(match.group(1))
        month_name = match.group(2).lower()
        month_num = month_mapping.get(month_name)
        if month_num:
            return (year, month_num)
    
    # Pattern 3: /international-space-station-timelines-november-2014/
    # or /station-timelines-november-2014/
    match = re.search(r"timelines-([a-z]+)-(\d{4})", url, re.IGNORECASE)
    if match:
        month_name = match.group(1).lower()
        year = int(match.group(2))
        month_num = month_mapping.get(month_name)
        if month_num:
            return (year, month_num)

    return (None, None)


def generate_filename_and_path(wayback_url, original_filename, base_output_dir, year=None, month=None):
    """
    Generate filename and full path with year/month folder structure.
    Returns (full_path, relative_path) or (None, None) if year/month can't be extracted
    
    Args:
        wayback_url: URL to try extracting year/month from
        original_filename: Original filename
        base_output_dir: Base output directory
        year: Year (optional, will try to extract from URL if not provided)
        month: Month number as string (optional, will try to extract from URL if not provided)
    """
    # Extract year and month from the URL if not provided
    if year is None or month is None:
        extracted_year, extracted_month = extract_year_month_from_url(wayback_url)
        if year is None:
            year = extracted_year
        if month is None:
            month = extracted_month

    if year is None or month is None:
        print(f"⚠️ Could not extract year/month from URL: {wayback_url}")
        return (None, None)
    
    # Ensure month is a string
    month_num = str(month) if not isinstance(month, str) else month

    # Create year/month folder structure
    year_month_dir = os.path.join(base_output_dir, str(year), month_num)

    # Clean the filename to be filesystem-safe
    clean_filename = re.sub(r'[<>:"/\\|?*]', "_", original_filename)
    
    # Extract day from filename if possible
    day = None
    
    # Pattern 1: MMDDYYYY format (e.g., "12102007_tl.pdf" for December 10, 2007)
    day_match = re.search(r'(\d{8})_', clean_filename)
    if day_match:
        date_str = day_match.group(1)
        month_in_filename = date_str[0:2]
        day_in_filename = date_str[2:4]
        year_in_filename = date_str[4:8]
        
        # Validate month and day ranges
        month_num = int(month_in_filename)
        day_num = int(day_in_filename)
        
        if 1 <= month_num <= 12 and 1 <= day_num <= 31:
            day = day_in_filename
            print(f"  📅 Extracted date from MMDDYYYY pattern: {year_in_filename}-{month_in_filename}-{day}")
        else:
            day_match = None
    
    if not day_match:
        # Pattern 2: MM_DD_YYYY format (e.g., "05_17_2005_tl.pdf")
        day_match = re.search(r'_(\d{2})_(\d{2})_(\d{4})', clean_filename)
        if day_match:
            month_in_filename = day_match.group(1)
            day_in_filename = day_match.group(2)
            year_in_filename = day_match.group(3)
            # Use the day from the filename
            day = day_in_filename
            print(f"  📅 Extracted date from MM_DD_YYYY pattern: {year_in_filename}-{month_in_filename}-{day}")
    
    if not day_match:
        # Pattern 3: MMDDYY format (e.g., "073105_tl.pdf" for July 31, 2005 or "010514_tl.pdf" for January 5, 2014)
        # Find 6-digit sequences followed by underscore and validate them as dates
        all_six_digit_matches = re.finditer(r'(\d{6})_', clean_filename)
        day_match = None
        
        for match in all_six_digit_matches:
            date_str = match.group(1)
            month_in_filename = date_str[0:2]
            day_in_filename = date_str[2:4]
            year_suffix = date_str[4:6]
            
            # Validate month and day ranges
            month_num = int(month_in_filename)
            day_num = int(day_in_filename)
            
            if 1 <= month_num <= 12 and 1 <= day_num <= 31:
                # Valid date found
                year_in_filename = f"20{year_suffix}"
                day = day_in_filename
                print(f"  📅 Extracted date from MMDDYY pattern: {year_in_filename}-{month_in_filename}-{day}")
                day_match = match
                break  # Use the first valid date found
    
    if not day_match:
        # Pattern 4: MM-DD-YY format with hyphens (e.g., "09-05-07.pdf" for September 5, 2007)
        day_match = re.search(r'(\d{2})-(\d{2})-(\d{2})', clean_filename)
        if day_match:
            month_in_filename = day_match.group(1)
            day_in_filename = day_match.group(2)
            year_suffix = day_match.group(3)
            
            # Validate month and day ranges
            month_num = int(month_in_filename)
            day_num = int(day_in_filename)
            
            if 1 <= month_num <= 12 and 1 <= day_num <= 31:
                year_in_filename = f"20{year_suffix}"
                day = day_in_filename
                print(f"  📅 Extracted date from MM-DD-YY pattern: {year_in_filename}-{month_in_filename}-{day}")
            else:
                day_match = None
    
    if not day_match:
        # Pattern 5: Try to find just MM_DD pattern (e.g., "05_03_tl.pdf")
        day_match = re.search(r'_(\d{2})_(\d{2})', clean_filename)
        if day_match:
            month_in_filename = day_match.group(1)
            day_in_filename = day_match.group(2)
            day = day_in_filename
            print(f"  📅 Extracted date from MM_DD pattern: {month_in_filename}-{day}")
    
    # Ensure month_num is a string
    month_str = str(month_num).zfill(2) if isinstance(month_num, int) else month_num.zfill(2)
    
    # Prepend date in YYYY-MM-DD format to filename
    if day:
        date_prefix = f"{year}-{month_str}-{day}"
        prefixed_filename = f"{date_prefix}__{clean_filename}"
    else:
        # If we can't extract day, just use year and month
        date_prefix = f"{year}-{month_str}"
        prefixed_filename = f"{date_prefix}__{clean_filename}"
        print(f"  ⚠️ Could not extract day from filename, using year-month only")

    # Full path
    full_path = os.path.join(year_month_dir, prefixed_filename)

    # Relative path for logging
    relative_path = os.path.join(str(year), month_str, prefixed_filename)

    return (full_path, relative_path)


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


def extract_month_page_urls(year_page_snapshot_url, year):
    """
    Extract month page URLs from a year index page.
    Handles both HTML structures:
    - div with id='feature-content' (2014)
    - div with class='box_710_cap' after <!--Body starts Here--> (2005-2013)
    """
    max_attempts = 3

    for attempt in range(max_attempts):
        try:
            if attempt > 0:
                wait_time = attempt * 5 + random.uniform(1, 3)
                print(
                    f"⏳ Year page fetch retry {attempt + 1}/{max_attempts}, waiting {wait_time:.1f}s"
                )
                time.sleep(wait_time)

            print(f"🔍 Extracting month URLs from year page: {year_page_snapshot_url}")

            r = session.get(year_page_snapshot_url, timeout=60)

            if r.status_code == 429:
                print(f"🚫 Rate limited (429), will retry...")
                continue
            elif r.status_code == 503:
                print(f"⚠️ Service unavailable (503), will retry...")
                continue
            elif r.status_code != 200:
                print(f"❌ Failed to fetch year page: HTTP {r.status_code}")
                return []

            soup = BeautifulSoup(r.content, "html.parser")

            # Check if the page is empty or missing content (Wayback wrapper issue)
            # If so, try the raw (id_) version
            if len(r.content) < 15000 and "web.archive.org" in year_page_snapshot_url:
                print(f"⚠️ Page seems incomplete ({len(r.content)} bytes), trying raw version...")
                raw_url = convert_to_raw_url(year_page_snapshot_url)
                if raw_url != year_page_snapshot_url:
                    r_raw = session.get(raw_url, timeout=60)
                    if r_raw.status_code == 200 and len(r_raw.content) > len(r.content):
                        print(f"✓ Raw version has more content ({len(r_raw.content)} bytes), using it")
                        r = r_raw
                        soup = BeautifulSoup(r.content, "html.parser")

            month_urls = []

            # Strategy 1: Try div with id='feature-content' (2014 style)
            feature_content = soup.find("div", id="feature-content")
            if feature_content:
                print(f"✅ Found feature-content div (2014 style)")
                links = feature_content.find_all("a", href=True)
                for link in links:
                    href = link["href"]
                    
                    # Skip javascript links
                    if href.startswith('javascript:'):
                        continue
                    
                    full_url = urljoin(year_page_snapshot_url, href)
                    
                    # Fallback: If urljoin produced an incomplete URL, use wayback_urljoin
                    if full_url.startswith("https://web.archive.org/") and "http" not in full_url[30:]:
                        full_url = wayback_urljoin(year_page_snapshot_url, href)
                    
                    # Filter for timeline links
                    if "timeline" in full_url.lower() or "_tl.html" in full_url.lower():
                        # Skip index pages and anchor links
                        if "index.html" not in full_url.lower() and "#" not in href:
                            month_urls.append(full_url)
                            print(f"  📅 Found month link: {href}")

            # Strategy 2: Try div with class='box_710_cap' (2005-2013 style)
            if not month_urls:
                print(f"🔍 Trying box_710_cap div (2005-2013 style)")
                box_divs = soup.find_all("div", class_="box_710_cap")
                print(f"   Found {len(box_divs)} box_710_cap divs")
                for box_div in box_divs:
                    links = box_div.find_all("a", href=True)
                    print(f"   Found {len(links)} links in box_710_cap div")
                    for link in links:
                        href = link["href"]
                        
                        # Skip javascript links
                        if href.startswith('javascript:'):
                            continue
                        
                        full_url = urljoin(year_page_snapshot_url, href)
                        
                        # Fallback: If urljoin produced an incomplete URL (missing original domain),
                        # use wayback_urljoin to handle special Wayback flags like mp_
                        if full_url.startswith("https://web.archive.org/") and "http" not in full_url[30:]:
                            full_url = wayback_urljoin(year_page_snapshot_url, href)
                        
                        # Filter for timeline links
                        if (
                            "timeline" in full_url.lower()
                            or "_tl.html" in full_url.lower()
                        ):
                            # Skip index pages and anchor links
                            if "index.html" not in full_url.lower() and "#" not in href:
                                month_urls.append(full_url)
                                print(f"  📅 Found month link: {href}")

            # Strategy 3: Fallback - find all links containing timeline keywords
            if not month_urls:
                print(f"🔍 Using fallback: searching all links for timeline patterns")
                all_links = soup.find_all("a", href=True)
                for link in all_links:
                    href = link["href"]
                    
                    # Skip javascript links
                    if href.startswith('javascript:'):
                        continue
                    
                    full_url = urljoin(year_page_snapshot_url, href)
                    
                    # Fallback: If urljoin produced an incomplete URL, use wayback_urljoin
                    if full_url.startswith("https://web.archive.org/") and "http" not in full_url[30:]:
                        full_url = wayback_urljoin(year_page_snapshot_url, href)
                    
                    lower_url = full_url.lower()
                    # Look for timeline-related URLs
                    if (
                        "timeline" in lower_url
                        or "_tl.html" in lower_url
                        or f"/{year}/" in lower_url
                    ):
                        # Avoid year index pages and anchor links
                        if "timelines_main" not in lower_url and "index.html" not in lower_url and "#" not in href:
                            month_urls.append(full_url)
                            print(f"  📅 Found month link (fallback): {href}")

            # Remove duplicates while preserving order
            seen = set()
            unique_month_urls = []
            for url in month_urls:
                if url not in seen:
                    seen.add(url)
                    unique_month_urls.append(url)

            print(
                f"📊 Found {len(unique_month_urls)} unique month page URLs for year {year}"
            )
            return unique_month_urls

        except requests.exceptions.ConnectionError as e:
            print(
                f"💥 Connection error extracting month URLs (attempt {attempt + 1}): {e}"
            )
        except Exception as e:
            print(f"💥 Error extracting month URLs (attempt {attempt + 1}): {e}")

    print(f"❌ Failed to extract month URLs after {max_attempts} attempts")
    return []


def extract_pdf_links_from_month_page(month_page_snapshot_url, year=None, month=None):
    """
    Extract PDF links from a month timeline page (2006-2014).
    Handles both HTML structures:
    - Nested under div id='feature-content' (2014, maybe 2013)
    - Within div class='box_710_cap' after <!--Body starts Here--> (2006-2013)
    
    Args:
        month_page_snapshot_url: URL of the month page
        year: Year of the month page (optional, will try to extract from URL)
        month: Month number (optional, will try to extract from URL)
    """
    # Try to extract year/month from the URL if not provided
    if year is None or month is None:
        extracted_year, extracted_month = extract_year_month_from_url(month_page_snapshot_url)
        if year is None:
            year = extracted_year
        if month is None:
            month = extracted_month
    
    max_attempts = 3

    for attempt in range(max_attempts):
        try:
            if attempt > 0:
                wait_time = attempt * 5 + random.uniform(1, 3)
                print(
                    f"⏳ Month page fetch retry {attempt + 1}/{max_attempts}, waiting {wait_time:.1f}s"
                )
                time.sleep(wait_time)

            print(f"🔍 Extracting PDFs from month page: {month_page_snapshot_url}")

            r = session.get(month_page_snapshot_url, timeout=60)

            if r.status_code == 429:
                print(f"🚫 Rate limited (429), will retry...")
                continue
            elif r.status_code == 503:
                print(f"⚠️ Service unavailable (503), will retry...")
                continue
            elif r.status_code != 200:
                print(f"❌ Failed to fetch month page: HTTP {r.status_code}")
                return []

            soup = BeautifulSoup(r.content, "html.parser")

            file_urls = []

            # Strategy 1: Try div with id='feature-content' (2014 style)
            feature_content = soup.find("div", id="feature-content")
            if feature_content:
                print(f"✅ Found feature-content div (2014 style)")
                links = feature_content.find_all("a", href=True)
                for link in links:
                    href = link["href"]
                    full_url = urljoin(month_page_snapshot_url, href)
                    lower_url = full_url.lower()

                    if any(lower_url.endswith(ext) for ext in FILE_EXTS):
                        parsed_url = urlparse(full_url)
                        original_filename = os.path.basename(parsed_url.path)
                        if original_filename:
                            file_urls.append(
                                {
                                    "url": full_url,
                                    "filename": original_filename,
                                    "source_page": month_page_snapshot_url,
                                    "year": year,
                                    "month": month,
                                }
                            )
                            print(f"  📄 Found file: {original_filename}")

            # Strategy 2: Try div with class='box_710_cap' (2005-2013 style)
            if not file_urls:
                print(f"🔍 Trying box_710_cap div (2005-2013 style)")
                box_divs = soup.find_all("div", class_="box_710_cap")
                for box_div in box_divs:
                    links = box_div.find_all("a", href=True)
                    for link in links:
                        href = link["href"]
                        full_url = urljoin(month_page_snapshot_url, href)
                        lower_url = full_url.lower()

                        if any(lower_url.endswith(ext) for ext in FILE_EXTS):
                            parsed_url = urlparse(full_url)
                            original_filename = os.path.basename(parsed_url.path)
                            if original_filename:
                                file_urls.append(
                                    {
                                        "url": full_url,
                                        "filename": original_filename,
                                        "source_page": month_page_snapshot_url,
                                        "year": year,
                                        "month": month,
                                    }
                                )
                                print(f"  📄 Found file: {original_filename}")

            # Strategy 3: Fallback - search all links for PDF files
            if not file_urls:
                print(f"🔍 Using fallback: searching all links for PDF files")
                all_links = soup.find_all("a", href=True)
                for link in all_links:
                    href = link["href"]
                    full_url = urljoin(month_page_snapshot_url, href)
                    lower_url = full_url.lower()

                    if any(lower_url.endswith(ext) for ext in FILE_EXTS):
                        parsed_url = urlparse(full_url)
                        original_filename = os.path.basename(parsed_url.path)
                        if original_filename:
                            file_urls.append(
                                {
                                    "url": full_url,
                                    "filename": original_filename,
                                    "source_page": month_page_snapshot_url,
                                    "year": year,
                                    "month": month,
                                }
                            )
                            print(f"  📄 Found file (fallback): {original_filename}")

            # Strategy 4: Last resort - fetch raw page without Wayback wrapper
            # This is needed for some 2005 pages where the Wayback wrapper interferes
            if not file_urls and "web.archive.org" in month_page_snapshot_url:
                print(f"🔍 Last resort: fetching raw page without Wayback wrapper")
                raw_url = convert_to_raw_url(month_page_snapshot_url)
                if raw_url != month_page_snapshot_url:
                    print(f"   Fetching: {raw_url}")
                    try:
                        r_raw = session.get(raw_url, timeout=60)
                        if r_raw.status_code == 200:
                            soup_raw = BeautifulSoup(r_raw.content, "html.parser")
                            
                            # Extract timestamp and base URL from the Wayback snapshot URL
                            # Format: https://web.archive.org/web/TIMESTAMP/ORIGINAL_URL
                            wayback_match = re.search(r'/web/(\d+)/(.+)', month_page_snapshot_url)
                            if wayback_match:
                                timestamp = wayback_match.group(1)
                                original_base_url = wayback_match.group(2)
                                
                                # Remove any trailing path to get the base domain
                                # e.g., http://www.nasa.gov/mission_pages/station/timelines/12_2005_tl.html
                                # becomes http://www.nasa.gov
                                parsed_base = urlparse(original_base_url)
                                base_domain = f"{parsed_base.scheme}://{parsed_base.netloc}"
                                
                                all_links = soup_raw.find_all("a", href=True)
                                for link in all_links:
                                    href = link["href"]
                                    
                                    # Build the full original URL (before Wayback)
                                    if href.startswith('http'):
                                        original_full_url = href
                                    elif href.startswith('/'):
                                        original_full_url = base_domain + href
                                    else:
                                        # Relative URL, join with original page URL
                                        original_page_path = parsed_base.path
                                        original_page_dir = '/'.join(original_page_path.split('/')[:-1])
                                        original_full_url = base_domain + original_page_dir + '/' + href
                                    
                                    lower_url = original_full_url.lower()
                                    
                                    if any(lower_url.endswith(ext) for ext in FILE_EXTS):
                                        # Construct the Wayback URL
                                        wayback_file_url = f"https://web.archive.org/web/{timestamp}/{original_full_url}"
                                        
                                        parsed_url = urlparse(original_full_url)
                                        original_filename = os.path.basename(parsed_url.path)
                                        if original_filename:
                                            file_urls.append(
                                                {
                                                    "url": wayback_file_url,
                                                    "filename": original_filename,
                                                    "source_page": month_page_snapshot_url,
                                                    "year": year,
                                                    "month": month,
                                                }
                                            )
                                            print(f"  📄 Found file (raw): {original_filename}")
                                print(f"   ✅ Raw page fallback found {len(file_urls)} files")
                            else:
                                print(f"   ❌ Could not parse Wayback URL format")
                        else:
                            print(f"   ❌ Raw page fetch failed: HTTP {r_raw.status_code}")
                    except Exception as e:
                        print(f"   ❌ Raw page fetch error: {e}")

            print(f"📊 Found {len(file_urls)} files on month page")
            return file_urls

        except requests.exceptions.ConnectionError as e:
            print(f"💥 Connection error extracting PDFs (attempt {attempt + 1}): {e}")
        except Exception as e:
            print(f"💥 Error extracting PDFs (attempt {attempt + 1}): {e}")

    print(f"❌ Failed to extract PDFs after {max_attempts} attempts")
    return []


def process_post2005_timelines(base_output_dir, start_year=2005, end_year=2014):
    """
    Process NASA timeline pages from post-2005 redesign (2005-2014)

    Args:
        base_output_dir: Base directory to save files (will create year/month subdirs)
        start_year: First year to process
        end_year: Last year to process
    """

    # Ensure output directory exists
    os.makedirs(base_output_dir, exist_ok=True)

    print(f"🚀 Starting Post-2005 NASA Timeline CDX scraper")
    print(f"📂 Output directory: {base_output_dir}")
    print(f"📅 Processing years: {start_year} - {end_year}")

    total_files_found = 0
    total_files_downloaded = 0
    total_files_skipped = 0
    total_files_failed = 0

    # Process each year
    for year in range(start_year, end_year + 1):
        if year not in YEAR_PAGE_URLS:
            print(f"⚠️ No URL defined for year {year}, skipping")
            continue

        year_url = YEAR_PAGE_URLS[year]
        print(f"\n{'='*80}")
        print(f"📅 PROCESSING YEAR {year}")
        print(f"{'='*80}")

        # Get snapshots of the year index page
        year_snapshots = get_snapshots(year_url, limit=100, max_year=2015)

        if not year_snapshots:
            print(f"❌ No snapshots found for year {year} index page")
            continue

        # Find the best snapshot (prefer 2015)
        best_year_snapshot = find_best_snapshot(year_snapshots, prefer_year=2015)

        if not best_year_snapshot:
            print(f"❌ No good snapshot found for year {year}")
            continue

        timestamp, original_url, status = best_year_snapshot
        year_page_snapshot_url = WAYBACK_SNAPSHOT.format(
            timestamp=timestamp, url=original_url
        )

        print(f"📄 Using year page snapshot: {year_page_snapshot_url}")

        # Extract month page URLs from the year index
        time.sleep(2.0 + random.uniform(0, 1))  # Be polite before fetching
        month_page_urls = extract_month_page_urls(year_page_snapshot_url, year)

        if not month_page_urls:
            print(f"❌ No month pages found for year {year}")
            continue

        print(f"📊 Found {len(month_page_urls)} month pages for year {year}")

        # Process each month page
        for month_idx, month_page_url in enumerate(month_page_urls, 1):
            print(f"\n  📅 [{month_idx}/{len(month_page_urls)}] Processing month page")

            # The month_page_url might already be a Wayback URL or might be original
            # If it's already a Wayback URL, use it as-is
            # If not, we need to get a snapshot of it
            if "web.archive.org" in month_page_url:
                month_page_snapshot_url = month_page_url
                print(f"  ✅ Already a Wayback URL: {month_page_snapshot_url}")
            else:
                # Get snapshots of this month page
                month_snapshots = get_snapshots(
                    month_page_url, limit=100, max_year=2015
                )

                if not month_snapshots:
                    print(f"  ❌ No snapshots found for month page: {month_page_url}")
                    continue

                # Find best snapshot
                best_month_snapshot = find_best_snapshot(
                    month_snapshots, prefer_year=2015
                )

                if not best_month_snapshot:
                    print(f"  ❌ No good snapshot for month page")
                    continue

                m_timestamp, m_original_url, m_status = best_month_snapshot
                month_page_snapshot_url = WAYBACK_SNAPSHOT.format(
                    timestamp=m_timestamp, url=m_original_url
                )

            print(f"  📄 Using month page: {month_page_snapshot_url}")

            # Extract PDF links from month page
            time.sleep(2.0 + random.uniform(0, 1))  # Be polite
            file_info_list = extract_pdf_links_from_month_page(month_page_snapshot_url)
            total_files_found += len(file_info_list)

            print(f"  📊 Found {len(file_info_list)} files on this month page")

            # Download each file
            for file_idx, file_info in enumerate(file_info_list, 1):
                file_url = file_info["url"]
                original_filename = file_info["filename"]
                file_year = file_info.get("year")
                file_month = file_info.get("month")

                print(
                    f"    [{file_idx}/{len(file_info_list)}] Processing: {original_filename}"
                )

                # Generate filename and path with year/month folders
                file_path, relative_path = generate_filename_and_path(
                    file_url, original_filename, base_output_dir, year=file_year, month=file_month
                )

                if not file_path:
                    print(f"    ⚠️ Could not determine output path, skipping")
                    total_files_failed += 1
                    continue

                # Skip if file already exists
                if os.path.exists(file_path):
                    print(f"    ⏭️ Already exists: {relative_path}")
                    total_files_skipped += 1
                    continue

                # Convert to raw URL if it's a Wayback URL
                raw_file_url = convert_to_raw_url(file_url)

                # Download the file
                success = fetch_with_backoff(raw_file_url, file_path)
                if success:
                    print(f"    ✅ Saved to: {relative_path}")
                    total_files_downloaded += 1
                else:
                    print(f"    ❌ Failed to download: {relative_path}")
                    total_files_failed += 1

                # Respectful delay between file downloads
                time.sleep(2.0 + random.uniform(0, 0.5))

            # Delay between month pages
            time.sleep(3.0 + random.uniform(0, 1))

        # Delay between years
        print(f"\n⏳ Finished year {year}, waiting before next year...")
        time.sleep(5.0 + random.uniform(0, 2))

    print(f"\n{'='*80}")
    print(f"📊 FINAL SUMMARY")
    print(f"{'='*80}")
    print(f"   📄 Total files found: {total_files_found}")
    print(f"   ✅ Files downloaded: {total_files_downloaded}")
    print(f"   ⏭️ Files skipped (already exist): {total_files_skipped}")
    print(f"   ❌ Failed downloads: {total_files_failed}")


def main():
    """Main function to run the post-2005 scraper"""

    output_dir = os.path.join(RAW_FOLDER, "station_timelines_wayback_scrape")

    # Process all years from 2005-2014
    print("� Starting production scrape: Processing years 2005-2014")
    print("=" * 80)
    process_post2005_timelines(
        base_output_dir=output_dir,
        start_year=2005,
        end_year=2014
    )


if __name__ == "__main__":
    main()
