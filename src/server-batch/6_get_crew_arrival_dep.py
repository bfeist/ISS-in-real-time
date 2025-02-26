import datetime
import re
from typing import Any, Dict, List
import requests
from bs4 import BeautifulSoup
import json
import os

S3_FOLDER = os.getenv("S3_FOLDER")


# URL of the Wikipedia page containing ISS expeditions data
url = "https://en.wikipedia.org/wiki/List_of_International_Space_Station_expeditions"

# Send a GET request to fetch the raw HTML content
response = requests.get(url)
html_content = response.content

# Parse the HTML content using BeautifulSoup
soup = BeautifulSoup(html_content, "html.parser")

# Find all tables with the class 'wikitable' (which contain the expeditions data)
tables = soup.find_all("table", {"class": "wikitable"})

# Remove the last table as it contains cancelled expeditions
tables = tables[:-1]

expeditions = []

# Iterate over each table found
for table in tables:
    # Get all rows in the table
    rows = table.find_all("tr")
    # Skip the header row
    rows = rows[1:]

    # Process each row
    for row in rows:
        # Get all cells in the row
        cells = row.find_all(["td", "th"])

        # Skip empty rows
        if not cells:
            continue

        # Initialize variables
        expedition_number = None
        mission_patch_url = None
        crew_members = []
        arrival_utc = arrivalFlight = departure_utc = departureFlight = durationDays = (
            None
        )

        # set indexes of different cells depending on row type
        # if cell 0 contains a number, then it's a main expedition row
        if cells[0].get_text(strip=True).isnumeric():
            # Exp 71 is only 2 cells for some reason so we need to handle it separately
            if len(cells) == 2:
                expedition_index = 0
                expedition_patch_img = 1
                crew_index = 1
                arrival_index = None
                arrivalFlight_index = None
                departure_index = None
                departureFlight_index = None
                duration_index = None
            # if both incoming and outgoing are a transfer
            elif "transferred" in cells[3].get_text(strip=True).lower() and (
                "transferred" in cells[4].get_text(strip=True).lower()
            ):
                expedition_index = 0
                expedition_patch_img = 1
                crew_index = 2
                arrival_index = None
                arrivalFlight_index = None
                departure_index = None
                departureFlight_index = None
                duration_index = None
            # incoming crew assignment is a transfer
            elif "transferred" in cells[3].get_text(strip=True).lower():
                # if so, the row has 7 cells
                expedition_index = 0
                expedition_patch_img = 1
                crew_index = 2
                arrival_index = None
                arrivalFlight_index = None
                departure_index = 4
                departureFlight_index = 5
                duration_index = 6
            # outgoing crew assignment is a transfer
            elif "transferred" in cells[5].get_text(strip=True).lower():
                expedition_index = 0
                expedition_patch_img = 1
                crew_index = 2
                arrival_index = 3
                arrivalFlight_index = 4
                departure_index = None
                departureFlight_index = None
                duration_index = None
            # normal row without transfer
            else:
                expedition_index = 0
                expedition_patch_img = 1
                crew_index = 2
                arrival_index = 3
                arrivalFlight_index = 4
                departure_index = 5
                departureFlight_index = 6
                duration_index = 7
        # if cell 0 contains flagicon, then it's a crew-only row
        elif cells[0].find("span", class_="flagicon"):
            # if both incoming and outgoing are a transfer
            if len(cells) == 2:
                expedition_index = None
                expedition_patch_img = None
                crew_index = 0
                arrival_index = None
                arrivalFlight_index = None
                departure_index = None
                departureFlight_index = None
                duration_index = None
            # if the row above this was a transfer to
            elif len(cells) == 3:
                expedition_index = None
                expedition_patch_img = None
                crew_index = 0
                arrival_index = 1
                arrivalFlight_index = 2
                departure_index = None
                departureFlight_index = None
                duration_index = None
            # incoming crew assignment is a transfer
            elif "transferred" in cells[1].get_text(strip=True).lower():
                expedition_index = None
                expedition_patch_img = None
                crew_index = 0
                arrival_index = None
                arrivalFlight_index = None
                departure_index = 2
                departureFlight_index = 3
                duration_index = 4
            # outgoing crew assignment is a transfer
            elif "transferred" in cells[3].get_text(strip=True).lower():
                expedition_index = None
                expedition_patch_img = None
                crew_index = 0
                arrival_index = 1
                arrivalFlight_index = 2
                departure_index = None
                departureFlight_index = None
                duration_index = None
            # if the row above this was a transfer from
            elif len(cells) == 4:
                expedition_index = None
                expedition_patch_img = None
                crew_index = 0
                arrival_index = None
                arrivalFlight_index = None
                departure_index = 1
                departureFlight_index = 2
                duration_index = 3
            # normal row without transfer
            else:
                expedition_index = None
                expedition_patch_img = None
                crew_index = 0
                arrival_index = 1
                arrivalFlight_index = 2
                departure_index = 3
                departureFlight_index = 4
                duration_index = 5

        # Extract data from the cells based on the indexes
        if expedition_index is not None:
            expedition_number = cells[expedition_index].get_text(strip=True)
        if expedition_patch_img is not None:
            img_tag = cells[expedition_patch_img].find("img")
            mission_patch_url = img_tag.get("src")
            if mission_patch_url.startswith("//"):
                mission_patch_url = "https:" + mission_patch_url
        for crew_entry in cells[crew_index].find_all("a", title=True):
            if crew_entry.find_parent("span", class_="flagicon"):
                continue
            name = crew_entry.get_text(strip=True)
            flag_icon = crew_entry.find_previous("span", class_="flagicon")
            nationality = flag_icon.find("img")["alt"] if flag_icon else "Unknown"
            crew_members.append({"name": name, "nationality": nationality})
        if arrival_index is not None:
            # Remove references using regex
            cleaned_text = re.sub(
                r"\[\d+(?:\]\[\d+)*\]", "", cells[arrival_index].get_text(strip=True)
            )
            # remove seconds from times (if any)
            cleaned_text = re.sub(r"(\d{2}:\d{2}):\d{2}", r"\1", cleaned_text)
            if "planned" not in cleaned_text.lower():
                arrival_utc = (
                    datetime.datetime.strptime(
                        cleaned_text, "%d %B %Y%H:%M"
                    ).isoformat()
                    + "Z"
                )
        if arrivalFlight_index is not None:
            arrivalFlight = cells[arrivalFlight_index].get_text(strip=True)

        if departure_index is not None:
            # Remove references using regex
            cleaned_text = re.sub(
                r"\[\d+(?:\]\[\d+)*\]", "", cells[departure_index].get_text(strip=True)
            )
            # remove seconds from times (if any)
            cleaned_text = re.sub(r"(\d{2}:\d{2}):\d{2}", r"\1", cleaned_text)

            if "planned" not in cleaned_text.lower():
                departure_utc = (
                    datetime.datetime.strptime(
                        cleaned_text,
                        "%d %B %Y%H:%M",
                    ).isoformat()
                    + "Z"
                )
        if departureFlight_index is not None:
            departureFlight = cells[departureFlight_index].get_text(strip=True)

        if duration_index is not None:
            durationDays = cells[duration_index].get_text(strip=True)

        # Create a dictionary for the expedition data
        expedition_data = {
            "expedition": expedition_number,
            "missionPatchUrl": mission_patch_url,
            "crew": crew_members,
            "arrivalDate": arrival_utc,
            "arrivalFlight": arrivalFlight,
            "departureDate": departure_utc,
            "departureFlight": departureFlight,
            "durationDays": durationDays,
        }
        expeditions.append(expedition_data)

# loop through expeditions to make a json output that shows when each crewmember arrived and departed


# Change crew_tracker to store a list of entries per crew member
crew_tracker: Dict[str, List[Dict[str, Any]]] = {}

# Iterate through each crew arrival/departure record
expedition: str = ""
missionPatchUrl: str = ""
for item in expeditions:
    tmp_expedition = item.get("expedition")
    expedition = tmp_expedition if tmp_expedition != None else expedition
    tmp_missionPatchUrl = item.get("missionPatchUrl")
    missionPatchUrl = (
        tmp_missionPatchUrl if tmp_missionPatchUrl != None else missionPatchUrl
    )
    crew = item.get("crew", [])
    arrivalDate = item.get("arrivalDate", "")
    arrivalFlight = item.get("arrivalFlight", "")
    departureDate = item.get("departureDate", "")
    departureFlight = item.get("departureFlight", "")
    durationDays = item.get("durationDays", 0)

    for crew_member in crew:
        name = crew_member.get("name")
        nationality = crew_member.get("nationality", "Unknown")

        new_entry = {
            "name": name,
            "expedition": expedition,
            "missionPatchUrl": missionPatchUrl,
            "nationality": nationality,
            "arrivalDate": arrivalDate,
            "arrivalFlight": arrivalFlight,
            "departureDate": departureDate,
            "departureFlight": departureFlight,
            "durationDays": durationDays,
        }

        if name in crew_tracker:
            last_entry = crew_tracker[name][-1]
            if last_entry.get("departureDate"):
                # Previous trip completed, add new entry
                crew_tracker[name].append(new_entry)
            else:
                # Merge details into the existing trip if they are missing
                last_entry["arrivalDate"] = last_entry.get("arrivalDate") or arrivalDate
                last_entry["arrivalFlight"] = (
                    last_entry.get("arrivalFlight") or arrivalFlight
                )
                last_entry["departureDate"] = (
                    last_entry.get("departureDate") or departureDate
                )
                last_entry["departureFlight"] = (
                    last_entry.get("departureFlight") or departureFlight
                )
                last_entry["durationDays"] = (
                    last_entry.get("durationDays") or durationDays
                )
        else:
            crew_tracker[name] = [new_entry]

# Flatten the crew_tracker dictionary into a list of entries
onboard_crew: List[Dict[str, Any]] = [
    entry for entries in crew_tracker.values() for entry in entries
]

# Sort onboard_crew by expedition
onboard_crew.sort(key=lambda entry: entry.get("expedition") or "")

# Write the data to a JSON file
with open(f"{S3_FOLDER}iss_crew_arr_dep.json", "w", encoding="utf-8") as jsonfile:
    json.dump(onboard_crew, jsonfile, ensure_ascii=False, indent=4)

print(
    "Expedition data has been successfully extracted to json. Requires manual review to fix some of the time values."
)
