import os
import time
import xml.etree.ElementTree as ET
from urllib.parse import urljoin

import qbittorrentapi
import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path="../../../.env")

IA_ROOT_PATH = "https://archive.org/download/"
COLLECTIONS = [
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
]

QBITTORRENT_HOST = os.getenv("QBITTORRENT_HOST")
QBITTORRENT_USERNAME = os.getenv("QBITTORRENT_USERNAME")
QBITTORRENT_PASSWORD = os.getenv("QBITTORRENT_PASSWORD")
QBITTORRENT_SAVE_PATH = os.getenv("QBITTORRENT_SAVE_PATH", "/data/Downloads/torrents")

SESSION_WAIT_SECONDS = 2
METADATA_WAIT_TIMEOUT = 60  # seconds to wait for metadata


def normalize_filename(filename: str) -> str:
    """
    Normalize filenames by:
    - Padding single-digit months/days with leading zeros (e.g., 5-3-24 -> 05-03-24)
    - Converting 4-digit years to 2-digit years (e.g., 2024 -> 24)
    """
    import re

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
    return re.sub(date_pattern, pad_date, filename)


def is_space_to_ground(filename: str) -> bool:
    """Determine if a file is a space-to-ground zip."""
    cleaned_filename = filename.lstrip("_")
    return (
        "Space-to-Ground" in cleaned_filename or "Space to Ground" in cleaned_filename
    )


def is_dragon_comm(filename: str) -> bool:
    """Determine if a file is a Dragon or CST communication zip."""
    cleaned_filename = filename.lstrip("_")
    return "Dragon" in cleaned_filename or "CST" in cleaned_filename


def fetch_collection_xml(collection: str) -> ET.Element:
    xml_url = f"{IA_ROOT_PATH}{collection}/{collection}_files.xml"
    response = requests.get(xml_url, timeout=60)
    response.raise_for_status()
    return ET.fromstring(response.content)


def find_collection_torrent(root: ET.Element) -> str | None:
    for file_elem in root.findall(".//file"):
        name = file_elem.get("name")
        if name and name.endswith(".torrent"):
            return name
    return None


def collect_desired_zip_names(root: ET.Element) -> set[str]:
    desired = set()
    for file_elem in root.findall(".//file"):
        name = file_elem.get("name")
        if not name or not name.endswith(".zip"):
            continue

        basename = os.path.basename(name)
        desired.add(basename)
        desired.add(normalize_filename(basename))
    return desired


def _normalize_torrent_label(name: str) -> str:
    base, _ = os.path.splitext(name.strip())
    return base.lower()


def torrent_name_matches(torrent_name: str, candidate_names: set[str]) -> bool:
    if not torrent_name:
        return False

    normalized_name = _normalize_torrent_label(torrent_name)
    for candidate in candidate_names:
        normalized_candidate = _normalize_torrent_label(candidate)
        if normalized_name == normalized_candidate:
            return True
        if normalized_name.startswith(normalized_candidate):
            return True
        if normalized_candidate.startswith(normalized_name):
            return True
    return False


def wait_for_metadata(
    client: qbittorrentapi.Client,
    torrent_hash: str,
    timeout: int = METADATA_WAIT_TIMEOUT,
) -> bool:
    """Wait for torrent metadata to be downloaded."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        torrent = client.torrents_info(torrent_hashes=torrent_hash)
        if torrent and torrent[0].state != "metaDL":
            return True
        time.sleep(SESSION_WAIT_SECONDS)
    return False


def connect_to_qbittorrent() -> qbittorrentapi.Client:
    if not all([QBITTORRENT_HOST, QBITTORRENT_USERNAME, QBITTORRENT_PASSWORD]):
        raise RuntimeError(
            "Missing qBittorrent connection information in environment variables."
        )

    client = qbittorrentapi.Client(host=QBITTORRENT_HOST)
    client.auth_log_in(username=QBITTORRENT_USERNAME, password=QBITTORRENT_PASSWORD)
    return client


def ensure_torrent_added(
    client: qbittorrentapi.Client, torrent_url: str, save_path: str
) -> None:
    try:
        client.torrents_add(
            urls=torrent_url, paused=True, save_path=save_path, autoTMM=False
        )
    except qbittorrentapi.Conflict409Error:
        # Torrent already exists (hash conflict).
        print(f"Torrent already present for URL: {torrent_url}")
    except qbittorrentapi.APIError as error:
        raise RuntimeError(f"Failed to add torrent from {torrent_url}: {error}")


def find_matching_torrent(
    client: qbittorrentapi.Client, candidate_names: set[str]
) -> qbittorrentapi.TorrentDictionary | None:
    torrents = client.torrents_info(sort="added_on")
    for torrent in reversed(torrents):
        if torrent_name_matches(torrent.name or "", candidate_names):
            return torrent
    return None


def is_torrent_already_added(
    client: qbittorrentapi.Client, candidate_names: set[str]
) -> bool:
    return find_matching_torrent(client, candidate_names) is not None


def locate_torrent_entry(
    client: qbittorrentapi.Client,
    candidate_names: set[str],
    timeout: int = METADATA_WAIT_TIMEOUT,
) -> qbittorrentapi.TorrentDictionary | None:
    start_time = time.time()
    while time.time() - start_time < timeout:
        match = find_matching_torrent(client, candidate_names)
        if match is not None:
            return match
        time.sleep(SESSION_WAIT_SECONDS)
    return None


def apply_file_selection(
    client: qbittorrentapi.Client,
    torrent: qbittorrentapi.TorrentDictionary,
) -> tuple[list[str], list[str]]:
    files = client.torrents_files(torrent_hash=torrent.hash)
    if not files:
        return [], []

    selected_ids: list[str] = []
    skipped_ids: list[str] = []

    for torrent_file in files:
        basename = os.path.basename(torrent_file.name)
        file_id = str(getattr(torrent_file, "id", getattr(torrent_file, "index", "")))
        if not file_id:
            continue

        # Enable download for all zip files in the torrent
        if basename.endswith(".zip"):
            selected_ids.append(file_id)
        else:
            skipped_ids.append(file_id)

    if selected_ids:
        client.torrents_file_priority(
            torrent_hash=torrent.hash, file_ids=selected_ids, priority=1
        )

    if skipped_ids:
        client.torrents_file_priority(
            torrent_hash=torrent.hash, file_ids=skipped_ids, priority=0
        )

    return selected_ids, skipped_ids


def start_torrent(client: qbittorrentapi.Client, torrent_hash: str) -> None:
    client.torrents_resume(torrent_hashes=torrent_hash)


def process_collection(
    client: qbittorrentapi.Client, collection: str, processed_torrent_hashes: set[str]
) -> None:
    print(f"\nProcessing {collection}...")
    root = fetch_collection_xml(collection)

    torrent_filename = find_collection_torrent(root)
    if not torrent_filename:
        print(f"  No torrent file found for {collection}, skipping.")
        return

    desired_zip_names = collect_desired_zip_names(root)
    if not desired_zip_names:
        print(f"  No zip files found in {collection}, skipping torrent start.")
        return

    torrent_url = urljoin(f"{IA_ROOT_PATH}{collection}/", torrent_filename)
    expected_name = os.path.splitext(torrent_filename)[0]
    candidate_names = {expected_name, torrent_filename}

    torrent_already_exists = is_torrent_already_added(client, candidate_names)

    if torrent_already_exists:
        print(f"  Torrent for {collection} already exists.")
    else:
        ensure_torrent_added(client, torrent_url, QBITTORRENT_SAVE_PATH)

    torrent_entry = locate_torrent_entry(client, candidate_names)
    if not torrent_entry:
        print(f"  Unable to locate torrent entry for {collection}.")
        return

    # Check if we've already processed this torrent hash in this run
    if torrent_entry.hash in processed_torrent_hashes:
        print(
            f"  Torrent already verified in this run (shared with another collection)."
        )
        return

    processed_torrent_hashes.add(torrent_entry.hash)

    if not wait_for_metadata(client, torrent_entry.hash):
        print(f"  Timeout waiting for metadata for {collection}.")
        return

    # Always verify and update file selection
    if torrent_already_exists:
        print(f"  Verifying file selection...")

    selected_ids, skipped_ids = apply_file_selection(client, torrent_entry)
    if not selected_ids:
        print("  No files were selected; torrent will remain paused.")
        return

    # Get the actual files to show what's in this torrent
    files = client.torrents_files(torrent_hash=torrent_entry.hash)
    zip_files = [os.path.basename(f.name) for f in files if f.name.endswith(".zip")]

    print(f"  Torrent contains {len(zip_files)} zip files.")
    print(
        f"  Ensured {len(selected_ids)} zip files are enabled; {len(skipped_ids)} other files are disabled."
    )

    if not torrent_already_exists:
        start_torrent(client, torrent_entry.hash)
        print("  Torrent resumed.")
    else:
        print("  File selection verified/updated for existing torrent.")


def main() -> None:
    try:
        client = connect_to_qbittorrent()
    except qbittorrentapi.LoginFailed as error:
        raise SystemExit(f"Failed to log in to qBittorrent: {error}")

    processed_torrent_hashes = set()

    for collection in COLLECTIONS:
        try:
            process_collection(client, collection, processed_torrent_hashes)
        except Exception as error:
            print(f"Error processing {collection}: {error}")


if __name__ == "__main__":
    main()
