import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from internetarchive import download, search_items
from tqdm import tqdm  # Install via `pip install tqdm`
from dotenv import load_dotenv

load_dotenv(dotenv_path="../../../.env")

# Determine destination directories
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


def normalize_filename(name: str) -> str:
    """
    Normalize filenames by:
    - Removing leading underscores
    - Padding single-digit months/days with leading zeros (e.g., 5-3-24 -> 05-03-24)
    - Converting 4-digit years to 2-digit years (e.g., 2024 -> 24)
    """
    import re

    cleaned = name.lstrip("_")

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


creators = [
    "creator:(Houston Audio Control Room)",
    "creator:(john.l.stoll@nasa.gov)",
    "creator:(Expedition 62 ACR Collection)",
    "creator:(Johnson Space Center)",
    "creator:(Beth Weissinger)",
]

all_results = []
for creator in creators:
    search = search_items(creator)
    all_results.extend(list(search))

# Filter identifiers for "Space-to" or "Space to" results
space_to_grounds = [
    result["identifier"]
    for result in all_results
    if "Space-to" in result["identifier"] or "Space to" in result["identifier"]
]

# Filter identifiers for "Dragon" results
dragon_to_grounds = [
    result["identifier"]
    for result in all_results
    if "Dragon" in result["identifier"] or "CST" in result["identifier"]
]


# Define a function for downloading an item
def download_item(identifier, base_path: Path):
    try:
        destDir = base_path
        destDir.mkdir(parents=True, exist_ok=True)
        normalized_identifier = normalize_filename(identifier)
        # if this zip file already exists, skip it
        existing_candidates = {
            destDir / f"{identifier}",
            destDir / f"{identifier}.zip",
            destDir / f"{normalized_identifier}",
            destDir / f"{normalized_identifier}.zip",
        }
        if any(path.exists() for path in existing_candidates):
            return
        before_download_paths = {path.resolve() for path in destDir.glob("*.zip")}
        before_normalized_names = {
            normalize_filename(path.name) for path in destDir.glob("*.zip")
        }
        download(
            identifier,
            destdir=str(destDir),
            no_directory=True,
            ignore_existing=True,
            glob_pattern="*.zip",
        )
        # Rename any newly downloaded zip files that begin with underscores
        for file_path in destDir.glob("*.zip"):
            resolved_path = file_path.resolve()
            if resolved_path in before_download_paths:
                continue

            normalized_name = normalize_filename(file_path.name)

            if normalized_name in before_normalized_names:
                # A file with the normalized name already exists; remove the duplicate download.
                if file_path.exists():
                    file_path.unlink()
                continue

            normalized_path = file_path.with_name(normalized_name)
            if normalized_path.exists() and normalized_path.resolve() != resolved_path:
                # Target file exists but wasn't tracked previously; treat as duplicate.
                if file_path.exists():
                    file_path.unlink()
                continue

            if normalized_name != file_path.name:
                file_path.rename(normalized_path)

            before_normalized_names.add(normalized_name)
    except Exception as e:
        print(f"Error downloading {identifier}: {e}")


# Download space_to_grounds in parallel with a progress bar
with ThreadPoolExecutor(
    max_workers=3
) as executor:  # Adjust max_workers based on your requirements
    # Initialize tqdm progress bar
    with tqdm(
        total=len(space_to_grounds), desc="Downloading Space-to-Ground items"
    ) as pbar:
        futures = {
            executor.submit(download_item, item, issSpaceToGroundsBasePath): item
            for item in space_to_grounds
        }

        for future in as_completed(futures):
            item = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"Failed to download {item}: {e}")
            finally:
                # Update the progress bar after each completed download
                pbar.update(1)

# Download dragon_to_grounds in parallel with a progress bar
with ThreadPoolExecutor(
    max_workers=3
) as executor:  # Adjust max_workers based on your requirements
    # Initialize tqdm progress bar
    with tqdm(
        total=len(dragon_to_grounds), desc="Downloading Dragon-to-Ground items"
    ) as pbar:
        futures = {
            executor.submit(download_item, item, issDragonCommBasePath): item
            for item in dragon_to_grounds
        }

        for future in as_completed(futures):
            item = futures[future]
            try:
                future.result()
            except Exception as e:
                print(f"Failed to download {item}: {e}")
            finally:
                # Update the progress bar after each completed download
                pbar.update(1)
