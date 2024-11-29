import requests
from bs4 import BeautifulSoup
import json
from itertools import count
import os

S3_FOLDER = os.getenv("S3_FOLDER")

# URL of the Wikipedia page
url = "https://en.wikipedia.org/wiki/List_of_International_Space_Station_spacewalks"

# Send a GET request to fetch the page content
response = requests.get(url)
response.raise_for_status()  # Raise an exception for HTTP errors

# Parse the page content with BeautifulSoup
soup = BeautifulSoup(response.text, "html.parser")

# Find all tables in the page
tables = soup.find_all("table", {"class": "wikitable"})

# List to hold all EVA details
eva_details = []

# Iterate over each table to extract data
for table in tables:
    # Iterate over each row in the table
    for row in table.find_all("tr")[1:]:  # Skip the header row
        cells = row.find_all(["td", "th"])

        if len(cells) == 6:
            # Extract data with improved handling
            number = cells[0].get_text(strip=True)
            mission = cells[1].find("a").get_text(strip=True)
            mission_eva_tag = cells[1].find("small")
            mission_eva_num = (
                int(mission_eva_tag.get_text(strip=True).replace("EVA ", ""))
                if mission_eva_tag
                else None
            )
            crew_links = cells[2].find_all("a")
            crew_counter = count(1)
            crew = [
                {
                    "ev": next(crew_counter),
                    "name": link.get_text(strip=True),
                    "nationality": link.find_previous("img")[
                        "alt"
                    ],  # Assuming the flag image precedes the name
                }
                for link in crew_links
                if link.get_text(strip=True)
            ]
            start_time = cells[3].get_text(strip=True).replace("<br>", " ")
            end_time = cells[4].get_text(strip=True).replace("<br>", " ")
            duration = cells[5].get_text(strip=True)

            # Correctly map the data
            eva = {
                "number": number,
                "mission": mission,
                "mission_eva_num": mission_eva_num,
                "crew": crew,
                "start_time": start_time,
                "end_time": end_time,
                "duration": duration,
            }

        if len(cells) == 7:
            # Extract data with improved handling
            number = cells[0].get_text(strip=True)
            mission = cells[1].find("a").get_text(strip=True)
            mission_eva_tag = cells[1].find("small")
            mission_eva_num = (
                int(mission_eva_tag.get_text(strip=True).replace("EVA ", ""))
                if mission_eva_tag
                else None
            )
            crew_links = cells[2].find_all("a")
            crew_counter = count(1)
            crew = [
                {
                    "ev": next(crew_counter),
                    "name": link.get_text(strip=True),
                    "nationality": link.find_previous("img")[
                        "alt"
                    ],  # Assuming the flag image precedes the name
                }
                for link in crew_links
                if link.get_text(strip=True)
            ]
            groundIVcrew_links = cells[3].find_all("a")
            groundIVcrew = [
                {
                    "name": link.get_text(strip=True),
                    "nationality": link.find_previous("img")["alt"],
                }
                for link in groundIVcrew_links
                if link.get_text(strip=True)
            ]
            start_time = cells[4].get_text(strip=True).replace("<br>", " ")
            end_time = cells[5].get_text(strip=True).replace("<br>", " ")
            duration = cells[6].get_text(strip=True)

            # Correctly map the data
            eva = {
                "number": number,
                "mission": mission,
                "mission_eva_num": mission_eva_num,
                "crew": crew,
                "groundIVcrew": groundIVcrew,
                "start_time": start_time,
                "end_time": end_time,
                "duration": duration,
            }

        elif len(cells) == 1:
            cell = cells[0]

            # if the cell is a divider row, skip it
            if cell.get("bgcolor") == "#ccccff":
                continue

            # Extract the mission name with HTML and remove reference hyperlinks
            description_html = cells[0].decode_contents()
            soup_desc = BeautifulSoup(description_html, "html.parser")

            # Remove all <sup class="reference"> tags
            for sup in soup_desc.find_all("sup", {"class": "reference"}):
                sup.decompose()

            for a in soup_desc.find_all("a", href=True):
                if a["href"].startswith("/wiki/"):
                    a["href"] = f"https://en.wikipedia.org{a['href']}"
                    a["target"] = "_blank"
            description = str(soup_desc)

            eva["description"] = description

            eva_details.append(eva)

            eva = {}
# audit the EVA details removing any planned EVAs. These can be determined by crew being TBD or TBC
eva_details = [
    eva
    for eva in eva_details
    if all([crew["name"] not in ["TBD", "TBC"] for crew in eva["crew"]])
    and eva["start_time"] not in ["TBD", "TBC"]
    and eva["end_time"] not in ["TBD", "TBC"]
    and eva["duration"] not in ["TBC", "TBD"]
]


# Convert the list to a JSON object
eva_json = json.dumps(eva_details, indent=4)

# Write the JSON object to a file in S3_FOLDER
output_path = os.path.join(S3_FOLDER, "eva_details.json")
with open(output_path, "w") as f:
    f.write(eva_json)
