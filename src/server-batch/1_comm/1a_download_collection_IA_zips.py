import os
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
import xml.etree.ElementTree as ET
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(dotenv_path="../../../.env")

# Base paths for files
issSpaceToGroundsBasePath = None
issDragonCommBasePath = None

raw_audio_base = os.getenv("RAW_AUDIO_FOLDER")
if raw_audio_base:
    raw_audio_path = Path(raw_audio_base)
    issSpaceToGroundsBasePath = raw_audio_path / "InternetArchive_space_to_grounds"
    issDragonCommBasePath = raw_audio_path / "InternetArchive_dragon_cst_to_grounds"

if not issSpaceToGroundsBasePath:
    raise RuntimeError(
        "Neither RAW_AUDIO_FOLDER nor IA_ZIP_SG_FOLDER is configured for Space-to-Ground zips"
    )

if not issDragonCommBasePath:
    raise RuntimeError(
        "Neither RAW_AUDIO_FOLDER nor IA_ZIP_AG_FOLDER is configured for Dragon/CST zips"
    )

issSpaceToGroundsBasePath.mkdir(parents=True, exist_ok=True)
issDragonCommBasePath.mkdir(parents=True, exist_ok=True)

# Log file for skipped files (one level up from this script)
skipped_log_path = Path(__file__).parent / "ia_zips_download_skipped_collection.txt"

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


def download_file(url, destination: Path):
    """Download a file with progress bar"""
    normalized_name = normalize_filename(destination.name)
    destination = destination.with_name(normalized_name)

    if destination.exists():
        print(f"Skipping existing file {destination.name}.")
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get("content-length", 0))

    with destination.open("wb") as file, tqdm(
        desc=destination.name,
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
    """
    Normalize filenames by:
    - Stripping leading underscores
    - Padding single-digit months/days with leading zeros (e.g., 5-3-24 -> 05-03-24)
    - Converting 4-digit years to 2-digit years (e.g., 2024 -> 24)
    """
    cleaned = filename.lstrip("_")

    # Match date patterns: m-d-yy, mm-dd-yy, m-d-yyyy, mm-dd-yyyy
    # Pad single digits and convert 4-digit years to 2-digit
    def pad_date(match):
        month = match.group(1).zfill(2)
        day = match.group(2).zfill(2)
        year = match.group(3)
        # Convert 4-digit year to 2-digit if necessary
        if len(year) == 4:
            year = year[2:]
        return f"{month}-{day}-{year}"

    # Pattern matches 1-2 digit month, 1-2 digit day, 2 or 4 digit year
    date_pattern = r"(\d{1,2})-(\d{1,2})-(\d{2,4})"
    return re.sub(date_pattern, pad_date, cleaned)


def ensure_normalized_file(path: Path) -> Path:
    """Rename a file on disk to its normalized name if needed."""
    normalized_name = normalize_filename(path.name)
    if normalized_name == path.name:
        return path

    normalized_path = path.with_name(normalized_name)
    if normalized_path.exists():
        # A normalized file already exists; keep the current file name to avoid overwrite.
        # print(
        #     f"Normalized filename {normalized_path.name} already exists. "
        #     f"Keeping original name {path.name}."
        # )
        return path

    path.rename(normalized_path)
    return normalized_path


def collect_normalized_files(base_path: Path):
    files = {}
    for file_name in os.listdir(base_path):
        if not file_name.endswith(".zip"):
            continue
        normalized_path = ensure_normalized_file(base_path / file_name)
        normalized_name = normalize_filename(normalized_path.name)
        files[normalized_name] = normalized_path.name
    return files


def get_existing_files():
    """Get list of existing files in the destination directories"""
    space_normalized = collect_normalized_files(issSpaceToGroundsBasePath)
    dragon_normalized = collect_normalized_files(issDragonCommBasePath)

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
            with skipped_log_path.open("a", encoding="utf-8") as log_file:
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
                destination = issSpaceToGroundsBasePath / normalized
                download_file(file_url, destination)

        # Download missing Dragon/CST files
        if missing_dragon_files:
            print("\nDownloading missing Dragon/CST files:")
            for original, normalized in missing_dragon_files:
                print(f"  {original} -> {normalized}")

            for original, normalized in missing_dragon_files:
                file_url = urljoin(base_download_url, original)
                destination = issDragonCommBasePath / normalized
                download_file(file_url, destination)

    print("\nIncremental download complete!")


if __name__ == "__main__":
    main()
