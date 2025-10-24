import json
import requests
import os
import re  # newly added import
from urllib.parse import urlparse
from dotenv import load_dotenv  # newly added import
import time  # newly added import

load_dotenv(dotenv_path="../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")

sources_filepath = os.path.join(
    RAW_FOLDER, "early_status_rawhtml", "wayback_sources.json"
)
sources = {}  # Dict to collect filename: sourceUrl, to avoid duplicates

# Load existing sources if file exists
if os.path.exists(sources_filepath):
    with open(sources_filepath, "r", encoding="utf-8") as f:
        existing_sources = json.load(f)
        sources = {item["filename"]: item["sourceUrl"] for item in existing_sources}


def get_filename(url):
    """Generate filename from URL."""
    parsed_url = urlparse(url)
    filename = parsed_url.path.strip("/").replace(
        "/", "_"
    ) or parsed_url.netloc.replace(".", "_")
    filename = re.sub(r"[^\w\-_\. ]", "_", filename)  # Replace invalid characters
    filename = f"{filename}"

    if not filename.endswith(".html") and not filename.endswith(".htm"):
        filename += ".html"
    return filename


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
    filename = get_filename(url)

    os.makedirs(os.path.join(RAW_FOLDER, "early_status_rawhtml"), exist_ok=True)
    filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", filename)

    if os.path.exists(filepath):
        print(f"File already exists: {filepath}")
        return None

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved: {filepath}")
    return filename


def fetch_wayback_data(session, json_file):
    """Read the JSON file and fetch Wayback Machine snapshots."""
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    entries = data.get("crew_and_cargo", []) + data.get("spacewalks", [])

    for entry in entries:
        url = entry.get("url")
        if not url:
            continue

        filename = get_filename(url)
        if filename in sources:
            continue  # Already recorded

        filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", filename)

        if os.path.exists(filepath):
            # File exists but not recorded, get wayback_url and record
            wayback_url = get_wayback_url(session, url)
            if wayback_url:
                sources[filename] = wayback_url
                print(f"File exists, added to sources: {filepath}")
            continue

        wayback_url = get_wayback_url(session, url)
        if wayback_url:
            filename = get_filename(url)  # redundant, but keep
            filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", filename)

            if os.path.exists(filepath):  # unlikely, but
                sources[filename] = wayback_url
                print(f"File already exists, added to sources: {filepath}")
                continue

            print(f"Fetching {wayback_url}...")
            for attempt in range(3):
                try:
                    response = session.get(wayback_url)
                    if response.status_code == 200:
                        saved_filename = save_html(url, response.text)
                        # Always record the source, whether file was newly saved or already existed
                        sources[filename] = wayback_url
                        if saved_filename:
                            print(f"Successfully fetched and saved: {filename}")
                        else:
                            print(f"File already existed, source recorded: {filename}")
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

    # Try with zero-padded numbers first
    use_padding = True

    while True:
        # Check both padded and non-padded file patterns before making any requests
        padded_url = f"{base_part}-{entry_number:02d}{suffix}"
        non_padded_url = f"{base_part}-{entry_number}{suffix}"

        # Generate filenames for both patterns
        parsed_padded = urlparse(padded_url)
        padded_filename = parsed_padded.path.strip("/").replace(
            "/", "_"
        ) or parsed_padded.netloc.replace(".", "_")
        padded_filename = re.sub(r"[^\w\-_\. ]", "_", padded_filename)
        padded_filepath = os.path.join(
            RAW_FOLDER, "early_status_rawhtml", padded_filename
        )

        parsed_non_padded = urlparse(non_padded_url)
        non_padded_filename = parsed_non_padded.path.strip("/").replace(
            "/", "_"
        ) or parsed_non_padded.netloc.replace(".", "_")
        non_padded_filename = re.sub(r"[^\w\-_\. ]", "_", non_padded_filename)
        non_padded_filepath = os.path.join(
            RAW_FOLDER, "early_status_rawhtml", non_padded_filename
        )

        # Proceed with fetching
        curr_url = padded_url if use_padding else non_padded_url
        curr_filename = get_filename(curr_url)
        curr_filepath = os.path.join(RAW_FOLDER, "early_status_rawhtml", curr_filename)

        # Check if file already exists before making wayback request
        if os.path.exists(curr_filepath):
            # Need to get wayback URL to record the source
            wayback_url = get_wayback_url(session, curr_url)
            if wayback_url:
                sources[curr_filename] = wayback_url
                print(f"File already exists, added to sources: {curr_filepath}")
            entry_number += 1
            continue

        print(f"Requesting snapshot for {curr_url}...")
        wayback_url = get_wayback_url(session, curr_url)

        # If padded format fails at entry 1, try non-padded
        if not wayback_url and entry_number == 1 and use_padding:
            print(f"No snapshot found for {curr_url}, trying without zero padding...")
            use_padding = False
            curr_url = non_padded_url
            curr_filename = get_filename(curr_url)
            if curr_filename in sources:
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
                    filename = save_html(curr_url, response.text)
                    # Always record the source, whether file was newly saved or already existed
                    sources[curr_filename] = wayback_url
                    if filename:
                        print(f"Successfully fetched and saved: {curr_filename}")
                    else:
                        print(f"File already existed, source recorded: {curr_filename}")
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

    # Write the sources to a JSON file
    sources_list = [{"filename": k, "sourceUrl": v} for k, v in sources.items()]
    with open(sources_filepath, "w", encoding="utf-8") as f:
        json.dump(sources_list, f, indent=4)
    print(f"Sources saved to: {sources_filepath}")
