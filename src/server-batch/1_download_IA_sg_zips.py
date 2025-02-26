import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from internetarchive import search_items, download
from tqdm import tqdm  # Install via `pip install tqdm`

# issAudioBasePath = r"O:/ISS/Internet_Archive/space_to_grounds/"
issSpaceToGroundsBasePath = r"F:/ISSiRT_assets/_raw/InternetArchive_space_to_grounds/"
issDragonCommBasePath = r"F:/ISSiRT_assets/_raw/InternetArchive_dragon_cst_to_grounds/"
search = search_items("creator:(john.l.stoll@nasa.gov)")

# Filter identifiers for "Space-to" or "Space to" results
space_to_grounds = [
    result["identifier"]
    for result in search
    if "Space-to" in result["identifier"] or "Space to" in result["identifier"]
]

# Filter identifiers for "Dragon" results
dragon_to_grounds = [
    result["identifier"]
    for result in search
    if "Dragon" in result["identifier"] or "CST" in result["identifier"]
]


# Define a function for downloading an item
def download_item(identifier, base_path):
    try:
        destDir = os.path.join(base_path)
        if not os.path.exists(destDir):
            os.makedirs(destDir, exist_ok=True)
        # if this zip file already exists, skip it
        if os.path.exists(os.path.join(destDir, f"{identifier}")):
            return
        download(
            identifier,
            destdir=destDir,
            no_directory=True,
            ignore_existing=True,
            glob_pattern="*.zip",
        )
    except Exception as e:
        print(f"Error downloading {identifier}: {e}")


# Download space_to_grounds in parallel with a progress bar
with ThreadPoolExecutor(
    max_workers=5
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
    max_workers=5
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
