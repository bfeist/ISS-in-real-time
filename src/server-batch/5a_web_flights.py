from bs4 import BeautifulSoup
import re
import pprint
from dotenv import load_dotenv
import requests
import os
import json
import time
from dateutil import parser

load_dotenv(dotenv_path="../../.env")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")

# Allowed table headings
allowed_headings = {"Completed", "Current", "Replacement/Rescue"}


# New helper function for date extraction
def extract_date(date_str):
    extracted_date_iso = parser.parse(date_str).isoformat()
    extracted_date_iso = extracted_date_iso.replace("+00:00", "Z")
    return extracted_date_iso


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


# First pass: scrape the flights list from Wikipedia
url = "https://en.wikipedia.org/wiki/List_of_human_spaceflights_to_the_International_Space_Station"
response = requests.get(url)
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
            "mission_duration": "",
            "spacecraft": "",
            "spacecraft_type": "",
            "manufacturer": "",
            "crew_launching": [],
            "crew_landing": [],
            "launch_mass": "",
            "landing_mass": "",
            "launch_date_utc": "",
            "rocket": "",
            "launch_site": "",
            "recovered_by": "",
            "landing_date_utc": "",
            "landing_site": "",
            "infobox_image_url": "",
            "docking_events": [],  # New field to track multiple docking events
        }
        data.append(entry)

# Updated fields_map dictionary - remove docking-related fields
fields_map = {
    "mission duration": "mission_duration",
    "spacecraft": "spacecraft",
    "spacecraft type": "spacecraft_type",
    "manufacturer": "manufacturer",
    "launch mass": "launch_mass",
    "landing mass": "landing_mass",
    "launch date": "launch_date_utc",
    "rocket": "rocket",
    "launch site": "launch_site",
    "recovered by": "recovered_by",
    "landing date": "landing_date_utc",
    "landing site": "landing_site",
}

# Second pass: for each entry, scrape additional fields from the mission page infobox
for entry in data:
    mission_url = entry.get("mission_name_url", "")
    print(f"Processing mission URL: {mission_url}")
    # mission_url = "https://en.wikipedia.org/wiki/SpaceX_Crew-9"  # For testing
    if mission_url:
        # Build full URL if necessary
        if mission_url.startswith("/"):
            mission_url = "https://en.wikipedia.org" + mission_url
        try:
            resp = requests.get(mission_url)
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
                        # Process each data row (skip header row)
                        for row in rows[1:]:
                            cells = row.find_all(["th", "td"])
                            # Process rows with 3 cells: [position, launching crew, landing crew]
                            if len(cells) == 3:
                                position = cells[0].get_text(
                                    separator=" - ", strip=True
                                )
                                launching_cell = cells[1]
                                landing_cell = cells[2]
                                launching_links = launching_cell.find_all("a")
                                landing_links = landing_cell.find_all("a")
                                # Extract nationality and name from each cell
                                if len(launching_links) >= 2:
                                    name = launching_links[1].get_text(strip=True)
                                    nationality = ""
                                    if launching_links[0].find("img"):
                                        nationality = (
                                            launching_links[0]
                                            .find("img")
                                            .get("alt", "")
                                        )

                                elif len(launching_links) == 1:
                                    # this is a mission with no flags. If the lcase of the mission_name contains "soyuz", assum everyone is russian. otherwise, assume everyone is american
                                    name = crew_links[0].get_text(strip=True)
                                    nationality = (
                                        "Russia"
                                        if "soyuz" in entry["mission_name"].lower()
                                        else "United States"
                                    )
                                if name and name.lower() != "none":
                                    launching_entries.append(
                                        {
                                            "name": name,
                                            "position": position,
                                            "nationality": nationality,
                                        }
                                    )

                                if len(landing_links) >= 2:
                                    name = landing_links[1].get_text(strip=True)
                                    nationality = ""
                                    if landing_links[0].find("img"):
                                        nationality = (
                                            landing_links[0].find("img").get("alt", "")
                                        )
                                elif len(landing_links) == 1:
                                    # this is a mission with no flags. If the lcase of the mission_name contains "soyuz", assum everyone is russian. otherwise, assume everyone is american
                                    name = crew_links[0].get_text(strip=True)
                                    nationality = (
                                        "Russia"
                                        if "soyuz" in entry["mission_name"].lower()
                                        else "United States"
                                    )
                                if name and name.lower() != "none":
                                    landing_entries.append(
                                        {
                                            "name": name,
                                            "position": position,
                                            "nationality": nationality,
                                        }
                                    )

                            # Process rows with 2 cells: [position, crew] -> same for launching and landing
                            elif len(cells) == 2:
                                position = cells[0].get_text(
                                    separator=" - ", strip=True
                                )
                                crew_cell = cells[1]
                                crew_links = crew_cell.find_all("a")
                                if len(crew_links) >= 2:
                                    name = crew_links[1].get_text(strip=True)
                                    nationality = ""
                                    if crew_links[0].find("img"):
                                        nationality = (
                                            crew_links[0].find("img").get("alt", "")
                                        )

                                elif len(crew_links) == 1:
                                    # this is a mission with no flags. If the lcase of the mission_name contains "soyuz", assum everyone is russian. otherwise, assume everyone is american
                                    name = crew_links[0].get_text(strip=True)
                                    nationality = (
                                        "Russia"
                                        if "soyuz" in entry["mission_name"].lower()
                                        else "United States"
                                    )

                                if name and name.lower() != "none":
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

            # Pause briefly between requests to be polite to the server
            time.sleep(0.5)
        except Exception as e:
            pass
    # print(f"Processed entry {entry['number']}")

# Sort the data by launch_date ascending
data.sort(key=lambda x: x["launch_date"])


# New: Recursively clean the data values
def clean_data(x):
    if isinstance(x, str):
        # Clean both non-breaking spaces and citation references like [1], [ 2 ], etc.
        cleaned = x.replace("\xa0", " ")  # Explicitly replace \xa0 character
        cleaned = cleaned.replace("\u00a0", " ")  # Also try Unicode representation
        # More flexible regex that handles spaces around the digits
        cleaned = re.sub(r"\s*\[\s*\d+\s*\]\s*", " ", cleaned).strip()
        return cleaned
    elif isinstance(x, dict):
        return {k: clean_data(v) for k, v in x.items()}
    elif isinstance(x, list):
        return [clean_data(i) for i in x]
    else:
        return x


data = clean_data(data)

# Write the enriched data to a new JSON file
output_path = os.path.join(WEB_ASSETS_FOLDER, "flights.json")
with open(output_path, "w", encoding="utf-8") as jsonfile:
    json.dump(data, jsonfile, ensure_ascii=False, indent=4)

print("Flight data has been successfully enriched and extracted to flights.json")
