import requests
from bs4 import BeautifulSoup
import json
import re, os
import datetime  # Added import

S3_FOLDER = os.getenv("S3_FOLDER")


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
            mission_info["end"] = parse_date(raw_end)

    # Extract mission highlights
    highlights_section = soup.find("div", class_="tag-mission")
    if highlights_section:
        highlights_text = highlights_section.find_next("p").text.strip()

    mission_info["expeditionBlurb"] = highlights_text

    return mission_info


if __name__ == "__main__":
    expeditions = []
    for i in range(1, 72):
        data = scrape_expedition(i)
        # get patch image url
        data["patchUrl"] = get_expedition_patch_url(i)

        expeditions.append(data)

    # Save the data to a JSON file
    with open(f"{S3_FOLDER}/expeditions.json", "w") as f:
        json.dump(expeditions, f, indent=4)
