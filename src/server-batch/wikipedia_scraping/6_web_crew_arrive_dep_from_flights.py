#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime
from math import floor

from dotenv import load_dotenv

load_dotenv(dotenv_path="../../.env")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")


def iso_to_datetime(iso_str):
    """Convert an ISO string (e.g. '2000-10-31T07:52:47Z') into a datetime object."""
    try:
        return datetime.strptime(iso_str, "%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def find_nationality(flight, crew_name):
    """
    Given a flight record and a crew member name, find the nationality
    from either crew_launching or crew_landing lists.
    """
    for member in flight.get("crew_launching", []):
        if member.get("name") == crew_name:
            return member.get("nationality", "")

    for member in flight.get("crew_landing", []):
        if member.get("name") == crew_name:
            return member.get("nationality", "")

    return ""


def main():
    # Construct file paths based on WEB_ASSETS_FOLDER
    input_path = os.path.join(WEB_ASSETS_FOLDER, "flights.json")
    output_path = os.path.join(WEB_ASSETS_FOLDER, "crew_arr_dep.json")

    # Read the enriched flight data
    with open(input_path, "r", encoding="utf-8") as f:
        flights = json.load(f)

    arrivals = {}  # key: crew name, value: dict with arrival info from the flight
    departures = {}  # key: crew name, value: dict with departure info from the flight

    # Process each flight record
    for flight in flights:
        flight_mission = flight.get("mission_name", "")

        # Determine arrival crew using crew_launching list
        if flight.get("crew_launching"):
            arrival_crew = [member["name"] for member in flight["crew_launching"]]
            # Use docking_date_utc with fallback to launch_date_utc
            arrival_date = flight.get(
                "docking_date_utc", flight.get("launch_date_utc", "")
            )
            for crew_name in arrival_crew:
                # Record the first occurrence as the arrival event for the crew member
                if crew_name not in arrivals:
                    arrivals[crew_name] = {
                        "flight": flight,
                        "arrivalFlight": flight_mission,
                        "arrivalDate": arrival_date,
                    }

        # Determine departure crew using crew_landing list
        if flight.get("crew_landing"):
            departure_crew = [member["name"] for member in flight["crew_landing"]]
            # Use undocking_date_utc with fallback to landing_date_utc
            departure_date = flight.get(
                "undocking_date_utc", flight.get("landing_date_utc", "")
            )
            for crew_name in departure_crew:
                if crew_name not in departures:
                    departures[crew_name] = {
                        "flight": flight,
                        "departureFlight": flight_mission,
                        "departureDate": departure_date,
                    }

    # Combine arrivals and departures for crew members with both data points.
    crew_records = []
    for crew_name, arrival_info in arrivals.items():
        if crew_name in departures:
            arr_iso = arrival_info["arrivalDate"]
            dep_iso = departures[crew_name]["departureDate"]
            dt_arr = iso_to_datetime(arr_iso)
            dt_dep = iso_to_datetime(dep_iso)
            if dt_arr and dt_dep:
                duration = (dt_dep - dt_arr).total_seconds() / 86400
                duration_str = f"{duration:.2f}"
            else:
                duration_str = ""
            patch_url = arrival_info["flight"].get("mission_patch_url", "")
            nationality = find_nationality(arrival_info["flight"], crew_name)
            crew_records.append(
                {
                    "name": crew_name,
                    "missionPatchUrl": patch_url,
                    "nationality": nationality,
                    "arrivalDate": arr_iso,
                    "arrivalFlight": arrival_info["arrivalFlight"],
                    "departureDate": dep_iso,
                    "departureFlight": departures[crew_name]["departureFlight"],
                    "durationDays": duration_str,
                }
            )

    # Sort the records by arrival date in ascending order.
    crew_records.sort(
        key=lambda rec: iso_to_datetime(rec["arrivalDate"]) or datetime.min
    )

    # Write the resulting records to the output file.
    with open(output_path, "w", encoding="utf-8") as outf:
        json.dump(crew_records, outf, indent=4)

    print(
        f"{output_path} has been created with crew arrival and departure details, sorted by arrival date."
    )


if __name__ == "__main__":
    main()
