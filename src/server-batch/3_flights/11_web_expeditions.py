import time
import requests
from bs4 import BeautifulSoup
import json
import re, os
import datetime  # Added import
from dotenv import load_dotenv
from urllib.parse import urlsplit

# Load environment variables from .env file
load_dotenv(dotenv_path="../../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")


def parse_date(date_str):
    # replace bad string on the nasa website
    date_str = date_str.replace("Sept.", "Sep.").replace(
        "Nov, 21, 2011", "Nov. 21, 2011"
    )
    try:
        return datetime.datetime.strptime(date_str, "%b. %d, %Y").date().isoformat()
    except ValueError:
        try:
            return datetime.datetime.strptime(date_str, "%B %d, %Y").date().isoformat()
        except ValueError:
            return date_str  # Return original string if parsing fails


def get_expedition_patch_url(expedition_number):
    """
    Retrieves the URL of the ISS expedition patch image for a given expedition number.

    Parameters:
        expedition_number (int): The ISS expedition number.

    Returns:
        str or None: The URL of the expedition patch image, or None if not found.
    """

    print(f"Getting patch for Expedition {expedition_number}")

    # Construct possible file titles
    possible_titles = [
        f"File:ISS Expedition {expedition_number} Patch.png",
        f"File:Iss expedition {expedition_number} mission patch.png",
        f"File:ISS Expedition {expedition_number} Patch.svg",
        f"File:Expedition {expedition_number} insignia.svg",
        f"File:ISS Expedition {expedition_number} insignia.png",
        f"File:Expedition {expedition_number} insignia.png",
    ]

    # Wikimedia Commons API endpoint
    api_url = "https://commons.wikimedia.org/w/api.php"
    headers = {"User-Agent": "ISSiRT-Bot/1.0 (https://github.com/bfeist/ISSiRT)"}

    def query(params):
        # Pace Commons requests, including unsuccessful lookups.
        time.sleep(1)
        response = requests.get(api_url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def lookup(titles):
        data = query({
            "action": "query", "titles": "|".join(titles),
            "prop": "imageinfo", "iiprop": "url", "format": "json",
        })
        for page in data.get("query", {}).get("pages", {}).values():
            for info in page.get("imageinfo", []):
                url = info["url"]
                if urlsplit(url).path.lower().endswith((".png", ".svg")):
                    return url
        return None

    patch = lookup(possible_titles)
    if patch:
        return patch

    search_data = query({
        "action": "query", "list": "search",
        "srsearch": f"intitle:'Expedition {expedition_number}'",
        "srnamespace": "6", "format": "json", "srlimit": "5",
    })
    titles = [result["title"] for result in search_data.get("query", {}).get("search", [])]
    return lookup(titles) if titles else None


def scrape_expedition(num):
    url = f"https://www.nasa.gov/mission/expedition-{str(num)}/"
    headers = {"User-Agent": "ISSiRT-Bot/1.0 (https://github.com/bfeist/ISSiRT)"}
    response = requests.get(url, headers=headers, timeout=30)

    # Return None if expedition doesn't exist (404)
    if response.status_code == 404:
        return None

    response.raise_for_status()  # Check for other request errors

    soup = BeautifulSoup(response.content, "html.parser")

    # Extract mission duration
    mission_info = {}
    mission_info["expedition"] = num  # Added expedition number
    search_div = soup.find("main", id="primary")
    if search_div:
        start_label = search_div.find("p", string=re.compile(r"^(start|START|Launch)$"))
        if start_label:
            raw_start = (
                start_label.find_parent("div").find_next_sibling("div").text.strip()
            )
            mission_info["start"] = parse_date(raw_start)
        end_label = search_div.find("p", string=re.compile(r"^(end|END|Landing)$"))
        if end_label:
            raw_end = end_label.find_parent("div").find_next_sibling("div").text.strip()
            parsed_date = parse_date(raw_end)
            if (
                re.fullmatch(r"landing", end_label.get_text().strip(), re.IGNORECASE)
                and parsed_date == raw_end
            ):
                mission_info["end"] = None
            else:
                mission_info["end"] = parsed_date

    # Extract mission highlights (og:description)
    og_description = soup.find("meta", {"property": "og:description"})
    if og_description:
        mission_info["expeditionBlurb"] = og_description["content"].strip()
    else:
        mission_info["expeditionBlurb"] = ""

    return mission_info


def load_and_parse_json(filename):
    """Load and parse the JSON file containing expedition data."""
    with open(filename, "r") as f:
        return json.load(f)


def save_json(data, filename):
    """Save updated data to JSON file."""
    with open(filename, "w") as f:
        json.dump(data, f, indent=4)


def needs_refresh(expedition, today=None):
    """Refresh incomplete and ongoing missions, including missing date keys."""
    required = ("start", "end", "expeditionBlurb")
    if any(not expedition.get(key) for key in required):
        return True
    try:
        end = datetime.date.fromisoformat(expedition["end"])
    except ValueError:
        return True
    return end >= (today or datetime.date.today())


def update_expeditions(loaded_data, patch_checks, today=None):
    """Refresh changing metadata, then discover consecutive new expeditions.

    patch_checks is a persisted mapping of expedition numbers to lookup dates;
    missing patches are retried weekly, independently of NASA metadata refreshes.
    """
    today = today or datetime.date.today()
    records = {exp["expedition"]: dict(exp) for exp in loaded_data}
    latest = max(records, default=0)

    for number, existing in records.items():
        if needs_refresh(existing, today):
            data = scrape_expedition(number)
            if data is not None:
                existing.update(data)
            time.sleep(1)

    number = latest + 1
    while True:
        data = scrape_expedition(number)
        time.sleep(1)
        if data is None:
            break  # Expeditions are sequential; check this number again next run.
        records[number] = data
        number += 1

    for number, record in records.items():
        if record.get("patchUrl"):
            continue
        key = str(number)
        last_check = patch_checks.get(key)
        if last_check and (today - datetime.date.fromisoformat(last_check)).days < 7:
            continue
        patch_checks[key] = today.isoformat()
        try:
            record["patchUrl"] = get_expedition_patch_url(number)
        except (requests.RequestException, ValueError) as error:
            # Patch availability must not prevent publishing new mission dates.
            print(f"Patch lookup failed for Expedition {number}: {error}")
            record.setdefault("patchUrl", None)
            break  # Do not keep contacting Commons when it is failing.

    return [records[number] for number in sorted(records)]


if __name__ == "__main__":
    filename = os.path.join(WEB_ASSETS_FOLDER, "expeditions.json")
    # Keep request bookkeeping out of the public web assets.
    cache_folder = os.path.join(os.path.dirname(__file__), ".cache")
    os.makedirs(cache_folder, exist_ok=True)
    cache_filename = os.path.join(cache_folder, "expedition_patch_checks.json")
    loaded_data = load_and_parse_json(filename)
    patch_checks = load_and_parse_json(cache_filename) if os.path.exists(cache_filename) else {}
    final_expeditions = update_expeditions(loaded_data, patch_checks)
    save_json(final_expeditions, filename)
    save_json(patch_checks, cache_filename)
    print(f"Saved {len(final_expeditions)} total expeditions to expeditions.json")
