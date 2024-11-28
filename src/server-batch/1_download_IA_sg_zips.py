import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from internetarchive import search_items, download
from tqdm import tqdm  # Install via `pip install tqdm`

# issAudioBasePath = r"O:/ISS/Internet_Archive/space_to_grounds/"
issAudioBasePath = r"F:/ISSiRT_assets/_raw/InternetArchive_space_to_grounds/"
search = search_items("creator:(john.l.stoll@nasa.gov)")

# Filter identifiers for "Space-to" or "Space to" results
space_to_grounds = [
    result["identifier"]
    for result in search
    if "Space-to" in result["identifier"] or "Space to" in result["identifier"]
]


# Define a function for downloading an item
def download_item(space_to_ground):
    try:
        destDir = os.path.join(issAudioBasePath)
        if not os.path.exists(destDir):
            os.makedirs(destDir, exist_ok=True)
        # if this zip file already exists, skip it
        if os.path.exists(os.path.join(destDir, f"{space_to_ground}")):
            return
        download(
            space_to_ground,
            destdir=destDir,
            no_directory=True,
            ignore_existing=True,
            glob_pattern="*.zip",
        )
    except Exception as e:
        print(f"Error downloading {space_to_ground}: {e}")


# Download in parallel with a progress bar
with ThreadPoolExecutor(
    max_workers=5
) as executor:  # Adjust max_workers based on your requirements
    # Initialize tqdm progress bar
    with tqdm(
        total=len(space_to_grounds), desc="Downloading Space-to-Ground items"
    ) as pbar:
        futures = {
            executor.submit(download_item, item): item for item in space_to_grounds
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
