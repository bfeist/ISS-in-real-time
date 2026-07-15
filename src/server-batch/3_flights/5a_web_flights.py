from bs4 import BeautifulSoup
import re
import pprint
from dotenv import load_dotenv
import requests
import os
import json
import time
from dateutil import parser

load_dotenv(dotenv_path="../../../.env")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")

# Allowed table headings
allowed_headings = {"Completed", "Current", "Replacement/Rescue"}


# New helper function for date extraction
def extract_date(date_str):
    """
    Extract and parse date from various formats, including complex Wikipedia formats.
    Returns an ISO 8601 formatted date string.
    """
    # Check for ISO format in parentheses like: ( 2022-04-27UTC07:52:55Z )
    iso_match = re.search(
        r"\(\s*(\d{4}-\d{2}-\d{2}UTC\d{2}:\d{2}:\d{2}Z)\s*\)", date_str
    )
    if iso_match:
        # Extract the ISO-like format and standardize it
        iso_date = iso_match.group(1)
        iso_date = iso_date.replace("UTC", "T")
        if not iso_date.endswith("Z"):
            iso_date += "Z"
        return iso_date

    try:
        # Remove extra information in parentheses to avoid confusion
        cleaned_str = re.sub(r"\([^)]*\)", "", date_str)
        cleaned_str = cleaned_str.replace("UTC", "").strip()
        extracted_date_iso = parser.parse(cleaned_str).isoformat()
        extracted_date_iso = extracted_date_iso.replace("+00:00", "Z")
        if not extracted_date_iso.endswith("Z"):
            extracted_date_iso += "Z"
        return extracted_date_iso
    except Exception as e:
        print(f"Error parsing date '{date_str}': {e}")
        return date_str


# Helper function to convert Wikimedia URLs
def convert_wikimedia_url(url):
    if url.startswith("//"):
        url = "https:" + url
    if "/thumb/" in url:
        try:
            base, rest = url.split("/thumb/", 1)
            parts = rest.split("/")
            if len(parts) >= 4:
                if base.endswith("/commons"):
                    return f"{base}/{parts[0]}/{parts[1]}/{parts[2]}"
                else:
                    return f"{base}/commons/{parts[0]}/{parts[1]}/{parts[2]}"
        except Exception:
            pass
    return url


# Names/keywords that are never a crew member (organizations, roles, etc.).
invalid_crew_names = {
    "roscosmos",
    "nasa",
    "esa",
    "jaxa",
    "csa",
    "cnsa",
    "expedition",
    "commander",
    "pilot",
    "flight engineer",
    "mission specialist",
    "none",
    "tbd",
    "unassigned",
}

# Map the space-agency / organization link found in a crew cell to a country
# name. Wikipedia removed the per-astronaut flag images from newer mission
# pages (e.g. SpaceX Crew-9/10/11, Soyuz MS-26), so the agency link is now the
# most reliable nationality signal on those pages. Older pages and Axiom
# missions still carry flag images, which take precedence (see
# extract_nationality). Country names must match the values in
# src/utils/countries.ts so the UI can resolve a flag URL.
ORG_TO_NATIONALITY = {
    "nasa": "United States",
    "roscosmos": "Russia",
    "jaxa": "Japan",
    "csa": "Canada",
    "isro": "India",
    "hso": "Hungary",
    "cnsa": "China",
    "asi": "Italy",
    "esa": "European Union",
}


def is_valid_crew_name(name):
    """Check if a name is valid (not an organization, expedition, etc.)."""
    if not name:
        return False
    name_lower = name.lower().strip()
    # Check against invalid names using word boundaries to avoid false matches
    # like "none" in "Kononenko".
    for invalid in invalid_crew_names:
        if re.search(r"\b" + re.escape(invalid) + r"\b", name_lower):
            return False
    # Valid crew names typically have at least a first and last name.
    return len(name_lower) > 2


def extract_crew_name(cell):
    """Return the first valid astronaut name link in a crew cell.

    On every page format the astronaut link comes first, before any agency
    link (NASA, Roscosmos, ...). Flag-image links have empty text and are
    skipped by is_valid_crew_name.
    """
    for link in cell.find_all("a"):
        potential_name = link.get_text(strip=True)
        if is_valid_crew_name(potential_name):
            return potential_name
    return ""


def extract_nationality(cell, mission_name):
    """Determine a crew member's nationality from a crew cell.

    Order of preference:
    1. Flag image alt text (present on older pages and Axiom missions) - most
       accurate because it is per-astronaut.
    2. Space-agency / organization link mapped via ORG_TO_NATIONALITY (newer
       pages that dropped the flag images).
    3. Fallback heuristic based on the mission name.
    """
    # 1. Flag image alt text.
    for link in cell.find_all("a"):
        img = link.find("img")
        if img is not None and img.get("alt"):
            return img.get("alt")

    # 2. Agency / organization link text.
    for link in cell.find_all("a"):
        link_text = link.get_text(strip=True).lower()
        if link_text in ORG_TO_NATIONALITY:
            return ORG_TO_NATIONALITY[link_text]

    # 3. Agency keyword anywhere in the cell text.
    cell_text = cell.get_text(" ", strip=True).lower()
    for org, nationality in ORG_TO_NATIONALITY.items():
        if re.search(r"\b" + re.escape(org) + r"\b", cell_text):
            return nationality

    # 4. Last-resort heuristic from the mission name.
    return "Russia" if "soyuz" in mission_name.lower() else "United States"


def clean_data(x):
    if isinstance(x, str):
        # Clean non-breaking spaces, unusual hyphen characters, and citation references
        cleaned = x.replace("\xa0", " ")  # Explicitly replace \xa0 character
        cleaned = cleaned.replace("\u00a0", " ")  # Also try Unicode representation
        # Replace non-breaking hyphen (U+2011: ‑) with regular hyphen
        cleaned = cleaned.replace("\u2011", "-")
        # Replace em dash (U+2014: —) with regular hyphen
        cleaned = cleaned.replace("\u2014", "-")
        # Replace en dash (U+2013: –) with regular hyphen
        cleaned = cleaned.replace("\u2013", "-")
        cleaned = re.sub(r"\s*\[\s*\d+\s*\]\s*", " ", cleaned).strip()
        return cleaned
    elif isinstance(x, dict):
        return {k: clean_data(v) for k, v in x.items()}
    elif isinstance(x, list):
        return [clean_data(i) for i in x]
    else:
        return x


# First pass: scrape the flights list from Wikipedia
url = "https://en.wikipedia.org/wiki/List_of_human_spaceflights_to_the_International_Space_Station"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}
response = requests.get(url, headers=headers)

# if response status is not 200, raise an error
if response.status_code != 200:
    raise Exception(f"Failed to load page {url}, status code: {response.status_code}")

html = response.text

soup = BeautifulSoup(html, "html.parser")

# Find all tables with the class "wikitable"
tables = soup.find_all("table", class_="wikitable")
data = []

for table in tables:
    # Look for the immediately preceding heading div
    heading_div = table.find_previous_sibling("div", class_="mw-heading")
    if not heading_div:
        continue
    h2 = heading_div.find("h2")
    if not h2:
        continue
    heading_text = h2.get_text(strip=True)
    if heading_text not in allowed_headings:
        continue  # Skip tables not in the allowed set

    rows = table.find_all("tr")[1:]  # Skip header row in each table
    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 6:
            continue

        # Number (remove the trailing dot)
        number = cols[0].get_text(strip=True).replace(".", "")

        # ISS Flight name
        iss_flight = cols[1].get_text(strip=True)

        # Mission column: contains mission name, patch image, vehicle name, launch date, and time docked
        mission_col = cols[2]

        # Extract mission name and URL from the bold link's <a> tag
        bold_tag = mission_col.find("b")
        mission_a = bold_tag.find("a") if bold_tag and bold_tag.find("a") else None
        mission_name = mission_a.get_text(strip=True) if mission_a else ""
        mission_name_url = (
            mission_a["href"] if mission_a and mission_a.has_attr("href") else ""
        )

        # Mission patch URL from the first image in the mission column
        mission_patch_img = mission_col.find("img")
        mission_patch_url = mission_patch_img["src"] if mission_patch_img else ""
        mission_patch_url = convert_wikimedia_url(mission_patch_url)

        # Vehicle name from the italic tag
        vehicle_tag = mission_col.find("i")
        vehicle_name = vehicle_tag.get_text(strip=True) if vehicle_tag else ""

        # Extract launch date and time docked by searching the text
        mission_text = mission_col.get_text(separator=" ", strip=True)
        launch_date = ""
        time_docked = ""
        launch_match = re.search(r"Launch:\s*(.*?)\s*(Time docked:|$)", mission_text)
        if launch_match:
            launch_date = extract_date(
                launch_match.group(1).split("[")[0].strip()
            ).split("T")[0]
        time_match = re.search(r"Time docked:\s*(.*)", mission_text)
        if time_match:
            time_docked = time_match.group(1).replace("~", "")

        # Crew photo URL from the crew photo column
        crew_photo_col = cols[4]
        crew_photo_img = crew_photo_col.find("img")
        crew_photo_url = crew_photo_img["src"] if crew_photo_img else ""
        crew_photo_url = convert_wikimedia_url(crew_photo_url)

        # Notes column: get text
        notes = cols[5].get_text(separator=" ", strip=True)

        entry = {
            "number": number,
            "iss_flight": iss_flight,
            "mission_name": mission_name,
            "mission_name_url": mission_name_url,
            "mission_patch_url": mission_patch_url,
            "vehicle_name": vehicle_name,
            "launch_date": launch_date,
            "time_docked": time_docked,
            "crew_photo_url": crew_photo_url,
            "notes": notes,
            # placeholders for additional fields (to be filled in second pass)
            "duration": "",
            "spacecraft": "",
            "spacecraft_type": "",
            "crew_launching": [],
            "crew_landing": [],
            "launch_date": "",
            "landing_date": "",
            "infobox_image_url": "",
            "docking_events": [],  # New field to track multiple docking events
            "spacecraft_details": {},  # New field to store all spacecraft details
        }
        data.append(entry)

# Second pass: for each entry, scrape additional fields from the mission page infobox
for entry in data:
    mission_url = entry.get("mission_name_url", "")
    print(f"Processing mission URL: {mission_url}")
    # mission_url = "https://en.wikipedia.org/wiki/SpaceX_Crew-4"  # For testing
    if mission_url:
        # Build full URL if necessary.
        # Wikipedia now returns protocol-relative links (e.g.
        # "//en.wikipedia.org/wiki/SpaceX_Crew-9") in addition to the older
        # root-relative form ("/wiki/SpaceX_Crew-9"). Handle both so the
        # second-pass request does not 404 (which previously wiped out crew,
        # docking, and date data for every flight).
        if mission_url.startswith("//"):
            mission_url = "https:" + mission_url
        elif mission_url.startswith("/"):
            mission_url = "https://en.wikipedia.org" + mission_url
        try:
            resp = requests.get(mission_url, headers=headers)
            if resp.status_code != 200:
                continue
            mission_html = resp.text
            mission_soup = BeautifulSoup(mission_html, "html.parser")
            # Look for the infobox table – using a lambda to check if 'infobox' is in its class list
            infobox = mission_soup.find("table", class_=lambda c: c and "infobox" in c)
            if not infobox:
                continue

            # Extract the image URL from the <span typeof="mw:File..."> element, if available
            img_span = infobox.find(
                "span", attrs={"typeof": lambda x: x and x.startswith("mw:File")}
            )
            if img_span:
                img_tag = img_span.find("img")
                if img_tag and img_tag.get("src"):
                    entry["infobox_image_url"] = convert_wikimedia_url(img_tag["src"])

            # Extract all spacecraft details from infobox rows - more dynamic approach
            rows = infobox.find_all("tr")
            for row in rows:
                header = row.find("th")
                if header and header.get_text(strip=True):
                    header_text = header.get_text(strip=True).lower()
                    header_text = clean_data(
                        header_text
                    )  # Clean header key for Unicode artifacts
                    value_cell = row.find("td")
                    if value_cell:
                        value_text = value_cell.get_text(separator=" ", strip=True)

                        # Store all details in spacecraft_details dictionary
                        entry["spacecraft_details"][header_text] = value_text

                        # Also map specific fields directly to the entry
                        if "mission duration" in header_text:
                            entry["duration"] = value_text
                        elif "spacecraft" in header_text and "type" not in header_text:
                            entry["spacecraft_name"] = value_text
                        elif "spacecraft type" in header_text:
                            entry["spacecraft_type"] = value_text
                        elif "launch date" in header_text:
                            entry["launch_date"] = extract_date(
                                value_text.split("[")[0].strip()
                            )
                        elif "landing date" in header_text:
                            entry["landing_date"] = extract_date(
                                value_text.split("[")[0].strip()
                            )

            # Improved docking events extraction
            docking_events = []

            # Find all infobox headers in the table
            all_headers = infobox.find_all("th", class_="infobox-header")

            # Find the indices of docking-related headers
            docking_indices = []
            next_header_indices = []
            for i, header in enumerate(all_headers):
                header_text = header.get_text(strip=True)
                if "Docking" in header_text:
                    docking_indices.append(i)

            # Process each docking section
            for idx in docking_indices:
                current_event = {}

                # Get the section title (might contain info like "relocation")
                section_title = all_headers[idx].get_text(strip=True)
                if "(relocation)" in section_title.lower():
                    current_event["type"] = "relocation"
                else:
                    current_event["type"] = "docking"

                # Find all rows that belong to this section
                section_rows = []
                header_row = all_headers[idx].parent
                current_row = header_row.next_sibling

                # Continue until we reach the next header or end of table
                while current_row:
                    if hasattr(current_row, "find") and current_row.find(
                        "th", class_="infobox-header"
                    ):
                        break
                    if hasattr(current_row, "find"):
                        section_rows.append(current_row)
                    current_row = current_row.next_sibling

                # Process the rows for this section
                for row in section_rows:
                    if hasattr(row, "find"):  # Make sure it's a tag, not a string
                        row_header = row.find("th", class_="infobox-label")
                        row_data = row.find("td", class_="infobox-data")

                        if row_header and row_data:
                            label = row_header.get_text(strip=True).lower()

                            if "port" in label:
                                current_event["port"] = row_data.get_text(
                                    separator=" ", strip=True
                                )

                            elif "docking date" in label and "undocking" not in label:
                                value = row_data.get_text(separator=" ", strip=True)
                                value = value.replace("(planned)", "").strip()

                                # Improve date extraction
                                try:
                                    if "(" in value:
                                        temp = value.split("(")[1].split(")")[0].strip()
                                        if "UTC" in temp:
                                            temp = temp.replace("UTC", "T").strip()
                                            value = extract_date(temp)
                                        else:
                                            temp = (
                                                value.split("UTC")[0].strip() + " UTC"
                                            )
                                            value = extract_date(temp)
                                    else:
                                        value = extract_date(
                                            value.split("[")[0].strip()
                                        )

                                    current_event["docking_date"] = value
                                except Exception as e:
                                    print(f"Error parsing docking date '{value}': {e}")

                            elif (
                                "undocking date" in label or "undocking" in label
                            ):  # Broaden the match
                                value = row_data.get_text(separator=" ", strip=True)
                                value = value.replace("(planned)", "").strip()

                                # Improve date extraction
                                try:
                                    if "(" in value:
                                        temp = value.split("(")[1].split(")")[0].strip()
                                        if "UTC" in temp:
                                            temp = temp.replace("UTC", "T").strip()
                                            value = extract_date(temp)
                                        else:
                                            temp = (
                                                value.split("UTC")[0].strip() + " UTC"
                                            )
                                            value = extract_date(temp)
                                    else:
                                        value = extract_date(
                                            value.split("[")[0].strip()
                                        )

                                    current_event["undocking_date"] = value
                                except Exception as e:
                                    print(
                                        f"Error parsing undocking date '{value}': {e}"
                                    )

                            elif "time docked" in label:
                                current_event["time_docked"] = row_data.get_text(
                                    separator=" ", strip=True
                                )

                # If we have meaningful docking data, add this event
                if current_event.get("docking_date") or current_event.get(
                    "undocking_date"
                ):
                    # Add event target as ISS if not specified
                    if "target" not in current_event:
                        current_event["target"] = "ISS"
                    docking_events.append(current_event)

            # Add docking events to the entry
            entry["docking_events"] = docking_events

            # Additional extraction: crew launching and landing info from the Crew section
            crew_header = mission_soup.find(
                lambda tag: tag.name in ["h2", "h3"] and "Crew" in tag.get_text()
            )
            if crew_header:
                crew_table = crew_header.find_next("table", class_="wikitable")
                if crew_table:
                    rows = crew_table.find_all("tr")
                    # If there is only one data row (header + one row), ignore the crew table
                    if len(rows) < 3:
                        pass
                    else:
                        launching_entries = []
                        landing_entries = []
                        mission_name = entry["mission_name"]

                        # Process each data row (skip header row).
                        #
                        # Row shapes on the mission page's Crew table:
                        # - 3 cells: [position, launching crew, landing crew].
                        #   Either crew cell may be "None" (e.g. someone who only
                        #   landed because they launched on a different vehicle).
                        # - 2 cells: [position, crew] where the crew cell spans
                        #   both columns, meaning the person both launched and
                        #   landed on this mission.
                        for row in rows[1:]:
                            cells = row.find_all(["th", "td"])

                            if len(cells) == 3:
                                position = cells[0].get_text(
                                    separator=" - ", strip=True
                                )
                                launching_cell = cells[1]
                                landing_cell = cells[2]

                                launch_name = extract_crew_name(launching_cell)
                                if launch_name:
                                    launching_entries.append(
                                        {
                                            "name": launch_name,
                                            "position": position,
                                            "nationality": extract_nationality(
                                                launching_cell, mission_name
                                            ),
                                        }
                                    )

                                # Only process landing crew if the cell isn't "None".
                                if landing_cell.get_text(strip=True).lower() != "none":
                                    land_name = extract_crew_name(landing_cell)
                                    if land_name:
                                        landing_entries.append(
                                            {
                                                "name": land_name,
                                                "position": position,
                                                "nationality": extract_nationality(
                                                    landing_cell, mission_name
                                                ),
                                            }
                                        )

                            elif len(cells) == 2:
                                position = cells[0].get_text(
                                    separator=" - ", strip=True
                                )
                                crew_cell = cells[1]

                                name = extract_crew_name(crew_cell)
                                if name:
                                    nationality = extract_nationality(
                                        crew_cell, mission_name
                                    )
                                    launching_entries.append(
                                        {
                                            "name": name,
                                            "position": position,
                                            "nationality": nationality,
                                        }
                                    )
                                    landing_entries.append(
                                        {
                                            "name": name,
                                            "position": position,
                                            "nationality": nationality,
                                        }
                                    )

                        # Deduplicate entries while preserving order
                        def dedupe(entries):
                            seen = set()
                            result = []
                            for item in entries:
                                key = (item["name"], item["position"])
                                if key not in seen:
                                    seen.add(key)
                                    result.append(item)
                            return result

                        entry["crew_launching"] = dedupe(launching_entries)
                        entry["crew_landing"] = dedupe(landing_entries)

                        if not entry["crew_launching"]:
                            pass
                        if not entry["crew_landing"]:
                            pass

                        # if crew nationality is not available, print an error
                        for crew in entry["crew_launching"]:
                            if not crew["nationality"]:
                                pass
                        for crew in entry["crew_landing"]:
                            if not crew["nationality"]:
                                pass

                        # Print error if both crew_launching and crew_landing arrays are empty
                        if not entry["crew_launching"] and not entry["crew_landing"]:
                            print(
                                f"Error: Flight {entry['number']} ({entry['mission_name']}) has no crew launching or landing information."
                            )

            # Pause briefly between requests to be polite to the server
            time.sleep(0.5)
        except Exception as e:
            # Surface failures instead of silently swallowing them - a silent
            # except here previously hid a broken mission URL that wiped out
            # crew/docking/date data for every flight.
            print(
                f"Error processing mission '{entry.get('mission_name')}' ({mission_url}): {e}"
            )
    # print(f"Processed entry {entry['number']}")

# Sort the data by launch_date ascending
data.sort(key=lambda x: x["launch_date"])


data = clean_data(data)

# Write the enriched data to a new JSON file
output_path = os.path.join(WEB_ASSETS_FOLDER, "flights.json")
with open(output_path, "w", encoding="utf-8") as jsonfile:
    json.dump(data, jsonfile, ensure_ascii=False, indent=4, sort_keys=True)

print("Flight data has been successfully enriched and extracted to flights.json")
