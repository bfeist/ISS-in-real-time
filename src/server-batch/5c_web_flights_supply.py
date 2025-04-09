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

# Helper function for date extraction
def extract_date(date_str):
    try:
        # Remove citation references and extra spaces
        date_str = re.sub(r'\s*\[\s*\d+\s*\]\s*', ' ', date_str).strip()
        # look for the string "with" and if found, use the part before it for the date
        if "with" in date_str:
            date_str = date_str.split("with")[0].strip()
        extracted_date_iso = parser.parse(date_str).isoformat()
        extracted_date_iso = extracted_date_iso.replace("+00:00", "Z")
        return extracted_date_iso
    except Exception as e:
        print(f"Date parsing error: {e} for string: {date_str}")
        return ""

# Helper function to extract country flag information
def extract_flags(cell):
    flags = []
    flag_imgs = cell.find_all("img")
    for img in flag_imgs:
        if img.has_attr('alt') and img['alt']:
            flags.append(img['alt'].strip())
    return flags

# Helper function to clean text
def clean_text(text):
    # Remove citations and non-breaking spaces
    text = re.sub(r'\s*\[\s*\d+\s*\]\s*', ' ', text)
    text = text.replace("\xa0", " ").replace("\u00a0", " ")
    return text.strip()

# Scrape the uncrewed spaceflights list from Wikipedia
url = "https://en.wikipedia.org/wiki/Uncrewed_spaceflights_to_the_International_Space_Station"
response = requests.get(url)
html = response.text

soup = BeautifulSoup(html, "html.parser")

# Find the wikitable with the flight data
tables = soup.find_all("table", class_="wikitable")
data = []

for table in tables:
    if "sticky-header" in table.get("class", []):
        rows = table.find_all("tr")[1:]  # Skip header row
        
        for row in rows:
            cols = row.find_all(["td", "th"])
            if len(cols) < 8:  # Ensure we have enough columns
                continue
            
            # Check if this is a module row (has background color)
            is_module = False
            is_failure = False
            
            # Check for background color in row or first cell
            if "style" in row.attrs and "background" in row["style"]:
                bg_style = row["style"]
                if "#CEF" in bg_style:
                    is_module = True
                elif "#FFC7C7" in bg_style or "#FFB" in bg_style:
                    is_failure = True
            elif "style" in cols[0].attrs and "background" in cols[0]["style"]:
                bg_style = cols[0]["style"]
                if "#CEF" in bg_style:
                    is_module = True
                elif "#FFC7C7" in bg_style or "#FFB" in bg_style:
                    is_failure = True
            
            # Extract number
            number = clean_text(cols[0].get_text())
            
            # Extract spacecraft name
            spacecraft_cell = cols[1]
            spacecraft_name = ""
            spacecraft_link = ""
            spacecraft_a = spacecraft_cell.find("a")
            if spacecraft_a and spacecraft_a.has_attr("href"):
                spacecraft_name = clean_text(spacecraft_a.get_text())
                spacecraft_link = spacecraft_a["href"]
            else:
                spacecraft_name = clean_text(spacecraft_cell.get_text())
            
            # Extract country/flag info
            country_cell = cols[2]
            countries = extract_flags(country_cell)
            
            # Extract flight number
            flight_no = clean_text(cols[3].get_text())
            # Replace non-breaking hyphen with standard hyphen
            flight_no = flight_no.replace("‑", "-")
            
            # Extract mission
            mission = clean_text(cols[4].get_text())
            
            # Extract launch vehicle
            launch_vehicle = clean_text(cols[5].get_text())
            
            # Extract launch date
            launch_date_str = clean_text(cols[6].get_text())
            launch_date = extract_date(launch_date_str) if launch_date_str else ""
            
            # Extract docking date(s)
            docking_cell = cols[7]
            docking_text = clean_text(docking_cell.get_text())
            
            # Extract undocking date(s) and duration if available
            undocking_date_utc = ""
            duration = ""
            docking_events = []
            failure_description = ""
            
            if is_failure:
                # For failures, the docking cell contains the failure description
                failure_description = docking_text
                docking_text = ""
            
            if len(cols) > 8:
                undocking_cell = cols[8]
                undocking_text = clean_text(undocking_cell.get_text())
                
                # Get duration if available
                if len(cols) > 9:
                    duration = clean_text(cols[9].get_text())
            else:
                undocking_text = ""
            
            # Special handling for modules - they don't have undocking time
            if is_module:
                undocking_text = ""
                duration = "permanent"
            
            # Check for multiple docking events (we need to handle differently)
            is_multi_docking = False
            rows_to_skip = 0
            
            # Some rows span multiple lines for multiple docking events
            if row.find_next_sibling("tr") and not row.find_next_sibling("tr").find("th"):
                next_row = row.find_next_sibling("tr")
                next_cols = next_row.find_all("td")
                
                # If next row has the same spacecraft but different docking info
                if len(next_cols) >= 3 and not next_cols[0].get_text().strip():
                    is_multi_docking = True
                    
                    # Add the first docking event
                    if docking_text and not (docking_text.lower().startswith("reached") or 
                                           docking_text.lower().startswith("attached")):
                        docking_events.append({
                            "docking_date": extract_date(docking_text) if docking_text else "",
                            "undocking_date": extract_date(undocking_text) if undocking_text else "",
                            "duration": duration
                        })
                    
                    # Process additional docking events from subsequent rows
                    current_row = next_row
                    while current_row and not current_row.find("th"):
                        next_cols = current_row.find_all("td")
                        if len(next_cols) >= 3:
                            add_docking_text = clean_text(next_cols[0].get_text()) if len(next_cols) > 0 else ""
                            add_undocking_text = clean_text(next_cols[1].get_text()) if len(next_cols) > 1 else ""
                            add_duration = clean_text(next_cols[2].get_text()) if len(next_cols) > 2 else ""
                            
                            docking_events.append({
                                "docking_date": extract_date(add_docking_text) if add_docking_text else "",
                                "undocking_date": extract_date(add_undocking_text) if add_undocking_text else "",
                                "duration": add_duration
                            })
                            
                            rows_to_skip += 1
                        
                        current_row = current_row.find_next_sibling("tr")
            
            # For single docking events or rows without proper multi-docking format
            if not is_multi_docking and docking_text:
                if docking_text.lower().startswith("reached") or docking_text.lower().startswith("attached"):
                    # Special case for permanent modules
                    docking_events = [{
                        "docking_date": extract_date(docking_text.split(":", 1)[1].strip()) if ":" in docking_text else "",
                        "undocking_date": "",
                        "duration": "permanent"
                    }]
                else:
                    docking_events = [{
                        "docking_date": extract_date(docking_text) if docking_text else "",
                        "undocking_date": extract_date(undocking_text) if undocking_text else "",
                        "duration": duration
                    }]
            
            # Create entry dictionary
            entry = {
                "number": number,
                "spacecraft_name": spacecraft_name,
                "spacecraft_link": spacecraft_link,
                "countries": countries,
                "flight_no": flight_no,
                "mission": mission,
                "launch_vehicle": launch_vehicle,
                "launch_date": launch_date,
                "docking_events": docking_events,
                "is_module": is_module,
                "is_failure": is_failure
            }
            
            if is_failure:
                entry["failure_description"] = failure_description
            
            data.append(entry)
            
            # Skip rows we've already processed as part of multi-docking events
            for _ in range(rows_to_skip):
                if rows and rows[0] == row:
                    rows.pop(0)

# Clean the data recursively
def clean_data(x):
    if isinstance(x, str):
        # Clean both non-breaking spaces and citation references
        cleaned = x.replace("\xa0", " ")
        cleaned = cleaned.replace("\u00a0", " ")
        cleaned = re.sub(r"\s*\[\s*\d+\s*\]\s*", " ", cleaned).strip()
        return cleaned
    elif isinstance(x, dict):
        return {k: clean_data(v) for k, v in x.items()}
    elif isinstance(x, list):
        return [clean_data(i) for i in x]
    else:
        return x

data = clean_data(data)

# Sort the data by launch_date ascending
data.sort(key=lambda x: x.get("launch_date", ""))

# Write the data to a JSON file
output_path = os.path.join(WEB_ASSETS_FOLDER, "flights_supply.json")
with open(output_path, "w", encoding="utf-8") as jsonfile:
    json.dump(data, jsonfile, ensure_ascii=False, indent=4)

print(f"Uncrewed flight data has been successfully extracted to {output_path}")
