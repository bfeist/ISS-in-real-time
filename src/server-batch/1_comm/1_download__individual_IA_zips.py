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
    """Remove leading underscores from filenames/identifiers."""
    return name.lstrip("_")


creators = ["creator:(Expedition 62 ACR Collection)"]

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
        before_download = {path.name for path in destDir.glob("*.zip")}
        download(
            identifier,
            destdir=str(destDir),
            no_directory=True,
            ignore_existing=True,
            glob_pattern="*.zip",
        )
        # Rename any newly downloaded zip files that begin with underscores
        after_download = {path.name: path for path in destDir.glob("*.zip")}
        new_files = [
            after_download[name]
            for name in after_download.keys()
            if name not in before_download
        ]
        for file_path in new_files:
            normalized_name = normalize_filename(file_path.name)
            if normalized_name == file_path.name:
                continue
            normalized_path = file_path.with_name(normalized_name)
            if normalized_path.exists():
                print(
                    f"Normalized filename {normalized_path.name} already exists. "
                    f"Keeping original name {file_path.name}."
                )
                continue
            file_path.rename(normalized_path)
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
