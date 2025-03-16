import json
import requests
import os
import re  # newly added import
from urllib.parse import urlparse
from dotenv import load_dotenv  # newly added import
import time  # newly added import

load_dotenv(dotenv_path="../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")


def get_wayback_url(session, original_url):
    """Fetch the full availability response from the Wayback Machine using the cdx/search API."""
    cdx_api = "http://web.archive.org/cdx/search/cdx"
    params = {
        "url": original_url,
        "output": "json",
        "fl": "timestamp,original",
        "filter": "statuscode:200",
        "limit": 1000,  # Increase limit to get more results
        "sort": "reverse",  # Sort by most recent first
    }
    for attempt in range(3):
        try:
            response = session.get(cdx_api, params=params)
            if response.status_code == 200:
                data = response.json()
                for entry in data[1:]:  # Skip the header row
                    timestamp, url = entry
                    if (
                        int(timestamp[:4]) < 2022
                    ):  # Check if the year is older than 2022
                        return f"http://web.archive.org/web/{timestamp}/{url}"
            break
        except requests.RequestException as e:
            print(f"Request failed: {e}")
            if attempt < 2:
                print("Retrying in 5 seconds...")
                time.sleep(5)
    return None


def save_html(url, content):
    """Save the HTML content to a file named after the URL path."""
    parsed_url = urlparse(url)
    filename = parsed_url.path.strip("/").replace(
        "/", "_"
    ) or parsed_url.netloc.replace(".", "_")
    filename = re.sub(r"[^\w\-_\. ]", "_", filename)  # Replace invalid characters
    filename = f"{filename}"

    os.makedirs(os.path.join(RAW_FOLDER, "early_status_rawhtml"), exist_ok=True)
    filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", filename)

    if os.path.exists(filepath):
        print(f"File already exists: {filepath}")
        return

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved: {filepath}")


def fetch_wayback_data(session, json_file):
    """Read the JSON file and fetch Wayback Machine snapshots."""
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    entries = data.get("crew_and_cargo", []) + data.get("spacewalks", [])

    for entry in entries:
        url = entry.get("url")
        if not url:
            continue

        parsed_url = urlparse(url)
        filename = parsed_url.path.strip("/").replace(
            "/", "_"
        ) or parsed_url.netloc.replace(".", "_")
        filename = re.sub(r"[^\w\-_\. ]", "_", filename)  # Replace invalid characters
        filename = f"{filename}"
        filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", filename)

        if os.path.exists(filepath):
            print(f"File already exists: {filepath}")
            continue

        wayback_url = get_wayback_url(session, url)
        if wayback_url:
            print(f"Fetching {wayback_url}...")
            for attempt in range(3):
                try:
                    response = session.get(wayback_url)
                    if response.status_code == 200:
                        save_html(url, response.text)
                        break
                    else:
                        print(f"Failed to retrieve {wayback_url}")
                except requests.RequestException as e:
                    print(f"Request failed: {e}")
                if attempt < 2:
                    print("Retrying in 5 seconds...")
                    time.sleep(5)
            time.sleep(5)  # Pause for 5 seconds
        else:
            print(f"No snapshot found for {url}")


def fetch_incremental_wayback(session, url):
    """Fetch successive snapshots from the Wayback Machine by incrementing the entry number until a non-200 response is returned."""
    match = re.search(r"-(\d{2})(\.html)$", url)
    if not match:
        print(f"URL pattern not recognized: {url}")
        return

    base_part = url[: match.start()]  # part before -XX.html
    entry_number = int(match.group(1))
    suffix = match.group(2)

    while True:
        curr_url = f"{base_part}-{entry_number:02d}{suffix}"
        parsed_url = urlparse(curr_url)
        filename = parsed_url.path.strip("/").replace(
            "/", "_"
        ) or parsed_url.netloc.replace(".", "_")
        filename = re.sub(r"[^\w\-_\. ]", "_", filename)  # Replace invalid characters
        filename = f"{filename}"
        filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", filename)

        if os.path.exists(filepath):
            print(f"File already exists: {filepath}")
            entry_number += 1
            continue

        print(f"Requesting snapshot for {curr_url}...")
        wayback_url = get_wayback_url(session, curr_url)
        if not wayback_url:
            print(f"No snapshot found for {curr_url}")
            break

        for attempt in range(3):
            try:
                response = session.get(wayback_url)
                if response.status_code == 200:
                    save_html(curr_url, response.text)
                    break
                else:
                    print(
                        f"Failed to retrieve snapshot {wayback_url} with status code {response.status_code}"
                    )
            except requests.RequestException as e:
                print(f"Request failed: {e}")
            if attempt < 2:
                print("Retrying in 5 seconds...")
                time.sleep(5)
        entry_number += 1
        time.sleep(5)  # Pause for 5 seconds


if __name__ == "__main__":
    session = requests.Session()
    # First process starting_status_urls.txt incremental fetching
    starting_urls_file = os.path.join(
        RAW_FOLDER, "early_status_urls", "starting_status_urls.txt"
    )
    if os.path.exists(starting_urls_file):
        with open(starting_urls_file, "r", encoding="utf-8") as f:
            starting_urls = [line.strip() for line in f if line.strip()]
        for s_url in starting_urls:
            fetch_incremental_wayback(session, s_url)
    else:
        print(f"Starting URLs file not found: {starting_urls_file}")

    exp_dir = os.path.join(RAW_FOLDER, "early_status_urls")
    # Loop over all JSON files in the early_status_urls directory
    for filename in os.listdir(exp_dir):
        if filename.endswith(".json"):
            json_file = os.path.join(exp_dir, filename)
            fetch_wayback_data(session, json_file)
