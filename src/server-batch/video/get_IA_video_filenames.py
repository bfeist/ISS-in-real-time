import requests
import xml.etree.ElementTree as ET
import os
import json
import time
from datetime import datetime
import logging


# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("ia_metadata_fetch.log"), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

# Constants
OUTPUT_DIR = "F:/ISSiRT_assets/_raw/ia_video_metadata"
PROGRESS_FILE = "F:/ISSiRT_assets/_raw/ia_video_metadata/progress.txt"
ITEMS_PER_BATCH = 1000  # Number of items to store per batch file
ROWS_PER_REQUEST = 100  # Number of items to fetch per API request


def ensure_directories():
    """Ensure necessary directories exist"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def search_items_by_uploader(uploader, page=1, rows=ROWS_PER_REQUEST):
    """Search for items by uploader with pagination, sorted by publication date"""
    query = f'uploader:"{uploader}"'
    url = "https://archive.org/advancedsearch.php"
    params = {
        "q": query,
        "fl[]": "identifier",
        "rows": rows,
        "page": page,
        "output": "json",
        "sort[]": "publicdate desc",  # Sort by publication date, newest first
    }
    response = requests.get(url, params=params)
    results = response.json()

    total_results = int(results["response"]["numFound"])
    current_items = [doc["identifier"] for doc in results["response"]["docs"]]

    return current_items, total_results


def get_item_metadata(identifier):
    """Get metadata for a specific item"""
    url = f"https://archive.org/metadata/{identifier}"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        logger.error(f"Failed to get metadata for {identifier}: {response.status_code}")
        return None


def filter_files(files):
    """Filter unwanted files from metadata"""
    return [
        file
        for file in files
        if not (
            file.get("source") == "derivative"
            or file.get("format") == "Metadata"
            or file.get("name") == "__ia_thumb.jpg"
            or ".torrent" in file.get("name", "")
            or "~1~" in file.get("name", "")
            or "storj" in file.get("name", "")
            or ".zip" in file.get("name", "")
        )
    ]


def load_progress():
    """Load progress from file if it exists"""
    processed_items = set()
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            processed_items = set(line.strip() for line in f if line.strip())

    return {
        "processed_items": processed_items,
        "last_page": 0,  # We'll calculate this based on processed items count
        "total_items": 0,
    }


def append_to_progress(identifier):
    """Append an identifier to the progress file"""
    with open(PROGRESS_FILE, "a") as f:
        f.write(f"{identifier}\n")


def save_batch(batch_data, batch_number):
    """Save a batch of metadata to a file"""
    batch_file = f"{OUTPUT_DIR}/metadata_batch_{batch_number}.json"
    with open(batch_file, "w") as f:
        json.dump(batch_data, f, indent=2)
    logger.info(f"Saved batch {batch_number} with {len(batch_data)} items")


def process_item(identifier, processed_items):
    """Process an individual item and return its filtered metadata"""
    # Skip if already processed
    if identifier in processed_items:
        logger.info(f"Skipping already processed item: {identifier}")
        return None

    # Skip if identifier for zips and wavs
    if ".zip" in identifier or ".wav" in identifier:
        logger.info(f"Skipping zip/wav file: {identifier}")
        append_to_progress(identifier)
        return None

    metadata = get_item_metadata(identifier)
    if not metadata:
        logger.warning(f"No metadata found for {identifier}")
        append_to_progress(identifier)  # Mark as processed even if no metadata
        return None

    files = metadata.get("files", [])
    filtered_files = filter_files(files)

    result = []
    for file in filtered_files:
        result.append(
            {
                "filename": file.get("name", ""),
                "date_IA_scanned": datetime.utcnow().isoformat(),
                "IA_metadata": file,
                "identifier": identifier,
                "IO_response": {},
            }
        )

    # Add the item to processed list
    append_to_progress(identifier)

    return result


def main(uploader, resume=True):
    """Main function to process all items from the uploader"""
    ensure_directories()

    # Initialize or load progress
    progress = load_progress()
    processed_items = progress["processed_items"]

    logger.info(f"Already processed {len(processed_items)} items")

    current_batch = []
    batch_number = len(processed_items) // ITEMS_PER_BATCH + 1

    # Get first page to know total results
    items, total_items = search_items_by_uploader(uploader, page=1)
    total_pages = (total_items + ROWS_PER_REQUEST - 1) // ROWS_PER_REQUEST

    logger.info(f"Found {total_items} total items across {total_pages} pages")

    try:
        for page in range(1, total_pages + 1):
            items, _ = search_items_by_uploader(uploader, page=page)
            logger.info(f"Processing page {page}/{total_pages} with {len(items)} items")

            for identifier in items:
                # Skip if already processed
                if identifier in processed_items:
                    continue

                item_data = process_item(identifier, processed_items)
                processed_items.add(identifier)  # Add to in-memory set

                if item_data:
                    current_batch.extend(item_data)
                    logger.info(f"Processed {len(item_data)} file(s) for {identifier}")

                # If batch is large enough, save it
                if len(current_batch) >= ITEMS_PER_BATCH:
                    save_batch(current_batch, batch_number)
                    batch_number += 1
                    current_batch = []

            # Be nice to the API
            time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
    except Exception as e:
        logger.error(f"Error during processing: {e}")
    finally:
        # Save any remaining items
        if current_batch:
            save_batch(current_batch, batch_number)

        logger.info(
            f"Process completed or paused. Processed {len(processed_items)} items"
        )


if __name__ == "__main__":
    uploader = "john.l.stoll@nasa.gov"
    main(uploader, resume=True)
