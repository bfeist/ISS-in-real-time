import os
import requests
import xml.etree.ElementTree as ET
from urllib.parse import urljoin
from dotenv import load_dotenv
from tqdm import tqdm
import re

load_dotenv(dotenv_path="../../../.env")

# Base paths for files
issSpaceToGroundsBasePath = os.getenv("IA_ZIP_SG_FOLDER")
issDragonCommBasePath = os.getenv("IA_ZIP_AG_FOLDER")

# Log file for skipped files (one level up from this script)
skipped_log_path = os.path.join(
    os.path.dirname(__file__), "ia_zips_download_skipped_collection.txt"
)

# Create directories if they don't exist
os.makedirs(issSpaceToGroundsBasePath, exist_ok=True)
os.makedirs(issDragonCommBasePath, exist_ok=True)

# XML file URL
ia_root_path = "https://archive.org/download/"
collections_xml = [
    # "Expedition18", # Skipping Expedition 18 as it has no zips but id does have mp3s we could process separately
    # "Expedition19", # doesn't exist
    # "Expedition20", # doesn't have zips
    # "Expedition21", # doesn't exist
    # "Expedition22", # doesn't exist
    # "Expedition23", # doesn't exist
    # "Expedition24", # doesn't exist
    # "Expedition25", # doesn't exist
    # "Expedition26", # doesn't have zips
    # "Expedition27", # doesn't have zips
    "Expedition28",
    "Expedition29",
    "Expedition30",
    "Expedition31",
    "Expedition32",
    "Expedition33",
    "Expedition34",
    "Expedition35",
    "Expedition36",
    "Expedition37",
    "Expedition38",
    "Expedition39",
    "Expedition40",
    "Expedition41",
    "Expedition42",
    "Expedition43",
    "Expedition44",
    "Expedition45",
    "Expedition46",
    "Expedition47",
    "Expedition48",
    "Expedition49",
    "Expedition50",
    "Expedition51",
    "Expedition52",
    "Expedition53",
    "Expedition-64-ACR-Collection",
    "Expedition-65-ACR-Collection",
    "expedition-66-acr-collection",
    "expedition-67-acr-collection",
    "Expedition-71-ACR-Collection",
    "Expedition-72-ACR-Collection",
    "Expedition-73-ACR-Collection",
    "Expedition-74-ACR-Collection",
]


def download_file(url, destination):
    """Download a file with progress bar"""
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get("content-length", 0))

    with open(destination, "wb") as file, tqdm(
        desc=os.path.basename(destination),
        total=total_size,
        unit="B",
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for data in response.iter_content(chunk_size=1024):
            size = file.write(data)
            bar.update(size)

    return destination


def normalize_filename(filename):
    """Convert mm-dd-yyyy format to mm-dd-yy in filenames"""
    # Regular expression to find mm-dd-yyyy patterns
    date_pattern = r"(\d{2})-(\d{2})-(\d{4})"

    # Replace with mm-dd-yy format (keeping only last 2 digits of year)
    return re.sub(
        date_pattern, lambda m: f"{m.group(1)}-{m.group(2)}-{m.group(3)[2:]}", filename
    )


def get_existing_files():
    """Get list of existing files in the destination directories"""
    # Get original filenames
    space_files = {
        f for f in os.listdir(issSpaceToGroundsBasePath) if f.endswith(".zip")
    }
    dragon_files = {f for f in os.listdir(issDragonCommBasePath) if f.endswith(".zip")}

    # Create dictionaries mapping normalized names to original names
    space_normalized = {normalize_filename(f): f for f in space_files}
    dragon_normalized = {normalize_filename(f): f for f in dragon_files}

    return space_normalized, dragon_normalized


def is_space_to_ground(filename):
    """Determine if a file is a space-to-ground zip"""
    # Remove leading underscore for matching
    cleaned_filename = filename.lstrip("_")
    return (
        "Space-to-Ground" in cleaned_filename or "Space to Ground" in cleaned_filename
    )


def is_dragon_comm(filename):
    """Determine if a file is a dragon or CST communication zip"""
    # Remove leading underscore for matching
    cleaned_filename = filename.lstrip("_")
    return "Dragon" in cleaned_filename or "CST" in cleaned_filename


def main():
    # Download and parse XML
    print("Downloading and parsing XML files...")

    for collection in collections_xml:
        xml_url = f"{ia_root_path}{collection}/{collection}_files.xml"
        base_download_url = f"{ia_root_path}{collection}/"

        print(f"Downloading and parsing {collection} XML file...")

        response = requests.get(xml_url)
        root = ET.fromstring(response.content)

        # Get existing files (normalized mapping)
        space_files, dragon_files = get_existing_files()

        # Track missing files
        missing_space_files = []
        missing_dragon_files = []
        skipped_files = []

        # Check for missing files
        print("Checking for missing files...")
        for file_elem in root.findall(".//file"):
            original_filename = file_elem.get("name")
            if not original_filename.endswith(".zip"):
                continue

            # Normalize the filename for comparison
            normalized_filename = normalize_filename(original_filename)

            if is_space_to_ground(original_filename):
                if normalized_filename not in space_files:
                    missing_space_files.append((original_filename, normalized_filename))
                else:
                    # File already exists, log it as skipped
                    skipped_files.append(f"{original_filename}|{collection}")
            elif is_dragon_comm(original_filename):
                if normalized_filename not in dragon_files:
                    missing_dragon_files.append(
                        (original_filename, normalized_filename)
                    )
                else:
                    # File already exists, log it as skipped
                    skipped_files.append(f"{original_filename}|{collection}")

        # Log skipped files
        if skipped_files:
            with open(skipped_log_path, "a", encoding="utf-8") as log_file:
                for skipped_entry in skipped_files:
                    log_file.write(f"{skipped_entry}\n")

        # Print summary of missing files
        print(f"Found {len(missing_space_files)} missing Space-to-Ground files.")
        print(f"Found {len(missing_dragon_files)} missing Dragon/CST files.")
        print(f"Skipped {len(skipped_files)} existing files.")

        # Download missing Space-to-Ground files
        if missing_space_files:
            print("\nDownloading missing Space-to-Ground files:")
            for original, normalized in missing_space_files:
                print(f"  {original} -> {normalized}")

            for original, normalized in missing_space_files:
                file_url = urljoin(base_download_url, original)
                destination = os.path.join(issSpaceToGroundsBasePath, normalized)
                download_file(file_url, destination)

        # Download missing Dragon/CST files
        if missing_dragon_files:
            print("\nDownloading missing Dragon/CST files:")
            for original, normalized in missing_dragon_files:
                print(f"  {original} -> {normalized}")

            for original, normalized in missing_dragon_files:
                file_url = urljoin(base_download_url, original)
                destination = os.path.join(issDragonCommBasePath, normalized)
                download_file(file_url, destination)

    print("\nIncremental download complete!")


if __name__ == "__main__":
    main()
