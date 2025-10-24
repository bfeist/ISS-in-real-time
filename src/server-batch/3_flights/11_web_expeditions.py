import time
import requests
from bs4 import BeautifulSoup
import json
import re, os
import datetime  # Added import
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

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

    for title in possible_titles:
        # Set up parameters to check if the file exists
        params = {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }

        # Make the API request
        response = requests.get(api_url, params=params)
        data = response.json()

        # Extract page information
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            # Check if the page exists and has imageinfo
            if "imageinfo" in page:
                for info in page["imageinfo"]:
                    image_url = info["url"]
                    if image_url.lower().endswith((".png", ".svg")):
                        print(f"{image_url}")
                        return image_url

    print("searching...")

    # If no image was found with the constructed titles, perform a search
    search_params = {
        "action": "query",
        "list": "search",
        "srsearch": f"intitle:'Expedition {expedition_number}'",
        "srnamespace": "6",  # Namespace 6 corresponds to 'File'
        "format": "json",
        "srlimit": "5",
    }

    # Make the search API request
    search_response = requests.get(api_url, params=search_params)
    search_data = search_response.json()

    # Iterate over search results
    for result in search_data.get("query", {}).get("search", []):
        file_title = result["title"]

        # Get image info for the found file
        params["titles"] = file_title
        response = requests.get(api_url, params=params)
        data = response.json()
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            if "imageinfo" in page:
                for info in page["imageinfo"]:
                    image_url = info["url"]
                    if image_url.lower().endswith((".png", ".svg")):
                        print(f"{image_url}")
                        return image_url

    # If no image is found
    return None


def scrape_expedition(num):
    url = f"https://www.nasa.gov/mission/expedition-{str(num)}/"
    response = requests.get(url)
    response.raise_for_status()  # Check for request errors

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


if __name__ == "__main__":
    # Load existing data
    loaded_data = load_and_parse_json(f"{WEB_ASSETS_FOLDER}/expeditions.json")

    # Identify expeditions that need reprocessing (null or empty values)
    needs_reprocessing = []
    for exp in loaded_data:
        if any(value is None or value == "" for value in exp.values()):
            needs_reprocessing.append(exp["expedition"])

    # Process only those that need reprocessing
    expeditions = []
    processed_numbers = set()

    for i in range(1, 74):
        # If this expedition needs reprocessing or doesn't exist in loaded data
        if i in needs_reprocessing or not any(
            e["expedition"] == i for e in loaded_data
        ):
            try:
                data = scrape_expedition(i)
                # get patch image url
                data["patchUrl"] = get_expedition_patch_url(i)

                # If we have existing data, merge it
                if i in needs_reprocessing:
                    original_index = next(
                        idx for idx, e in enumerate(loaded_data) if e["expedition"] == i
                    )
                    loaded_data[original_index] = data
                else:
                    expeditions.append(data)

                processed_numbers.add(i)
                time.sleep(1)
            except Exception as e:
                print(f"Error processing expedition {i}: {str(e)}")

    # Combine new and updated data - include all original data plus any new entries
    final_expeditions = loaded_data + [
        e
        for e in expeditions
        if e["expedition"] not in [x["expedition"] for x in loaded_data]
    ]

    save_json(final_expeditions, f"{WEB_ASSETS_FOLDER}/expeditions.json")
