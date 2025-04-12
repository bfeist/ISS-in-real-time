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


def normalize_crew_name(name):
    """
    Normalize crew names by removing middle initials and suffixes.
    Examples:
    - "John A. Doe" -> "John Doe"
    - "Frank L. Culbertson Jr." -> "Frank Culbertson"
    - "Frank L. Culbertson, Jr." -> "Frank Culbertson"
    - "John 'Jack' Smith" -> "John Smith"
    - "Sunita 'Suni' Williams" -> "Sunita Williams"
    """
    if not name:
        return name

    # Remove anything in quotes (both single and double quotes)
    # Fix the regex to properly handle quotes within names
    name = re.sub(r"\s*['\"](.*?)['\"]", "", name)

    # First remove suffixes with or without a comma before them
    name = re.sub(r",?\s+(?:Jr\.|Sr\.|II|III|IV|V)\.?$", "", name)

    # Match pattern: First name, optional middle initial(s) with period, Last name
    # For example: "John A. Doe" or "John A.B. Doe"
    pattern = r"^(\w+)(?:\s+[A-Z]\.(?:\s*[A-Z]\.)*)?(\s+\S.*)$"
    match = re.match(pattern, name)

    if match:
        # Combine first name and last name without the middle initial
        return match.group(1) + match.group(2)

    # If pattern doesn't match, remove all punctuation
    name = re.sub(r"[^\w\s]", "", name)

    # Return the name with any extra whitespace trimmed
    return name.strip()


def main():
    # Construct file paths based on WEB_ASSETS_FOLDER
    input_path = os.path.join(WEB_ASSETS_FOLDER, "flights.json")
    output_path = os.path.join(WEB_ASSETS_FOLDER, "crew_arr_dep.json")

    # Read the enriched flight data
    with open(input_path, "r", encoding="utf-8") as f:
        flights = json.load(f)

    # Instead of dictionaries, use lists to store all arrival and departure events
    arrival_events = []  # List of arrival events with crew_name, date, flight info
    departure_events = []  # List of departure events with crew_name, date, flight info

    # Process each flight record
    for flight in flights:
        flight_mission = flight.get("mission_name", "")

        # Determine arrival crew using crew_launching list
        if flight.get("crew_launching"):
            # Get arrival date from docking_events
            arrival_date = ""
            if flight.get("docking_events") and len(flight["docking_events"]) > 0:
                # Use the first docking event's docking_date
                arrival_date = flight["docking_events"][0].get("docking_date", "")

            dt_arrival = iso_to_datetime(arrival_date)

            for member in flight["crew_launching"]:
                crew_name = member.get("name")
                if crew_name and dt_arrival:
                    arrival_events.append(
                        {
                            "name": crew_name,
                            "normalized_name": normalize_crew_name(crew_name),
                            "date": arrival_date,
                            "datetime": dt_arrival,
                            "flight": flight,
                            "flightName": flight_mission,
                            "nationality": member.get("nationality", ""),
                        }
                    )

        # Determine departure crew using crew_landing list
        if flight.get("crew_landing"):
            # Get departure date from docking_events
            departure_date = ""
            if flight.get("docking_events") and len(flight["docking_events"]) > 0:
                # Use the last docking event's undocking_date
                departure_date = flight["docking_events"][-1].get("undocking_date", "")

            dt_departure = iso_to_datetime(departure_date)

            for member in flight["crew_landing"]:
                crew_name = member.get("name")
                if crew_name and dt_departure:
                    departure_events.append(
                        {
                            "name": crew_name,
                            "normalized_name": normalize_crew_name(crew_name),
                            "date": departure_date,
                            "datetime": dt_departure,
                            "flight": flight,
                            "flightName": flight_mission,
                            "nationality": member.get("nationality", ""),
                        }
                    )

    # Sort events chronologically
    arrival_events.sort(key=lambda x: x["datetime"])
    departure_events.sort(key=lambda x: x["datetime"])

    # Match arrivals with corresponding departures
    crew_records = []

    # Force chronological consistency across all data
    # 1. Sort all events by datetime
    all_events_sorted = arrival_events + departure_events
    all_events_sorted.sort(key=lambda x: x["datetime"])

    # 2. Create a dictionary to track crew members and their current status
    status_tracker = {}  # normalized_name -> {'arrival': event, 'in_space': True/False}

    # 3. Process all events chronologically
    for event in all_events_sorted:
        crew_name = event["name"]
        normalized_name = event["normalized_name"]

        # Determine if this is an arrival or departure based on presence in respective lists
        is_arrival = event in arrival_events

        if is_arrival:
            # Record this arrival
            if normalized_name not in status_tracker:
                status_tracker[normalized_name] = {"arrival": event, "in_space": True}
            else:
                # If already in space, close the previous stay with current arrival as departure
                if status_tracker[normalized_name].get("in_space", False):
                    arrival_event = status_tracker[normalized_name]["arrival"]
                    # Calculate duration based on this odd sequence
                    duration = (
                        event["datetime"] - arrival_event["datetime"]
                    ).total_seconds() / 86400

                    # Only create record if dates make sense (positive duration)
                    if duration > 0:
                        crew_records.append(
                            {
                                "name": crew_name,
                                "nationality": arrival_event["nationality"],
                                "arrivalDate": arrival_event["date"],
                                "arrivalFlight": arrival_event["flightName"],
                                "departureDate": event["date"],
                                "departureFlight": event["flightName"],
                                "durationDays": f"{duration:.2f}",
                            }
                        )

                # Update with the new arrival
                status_tracker[normalized_name] = {"arrival": event, "in_space": True}
        else:
            # This is a departure event
            if normalized_name in status_tracker and status_tracker[
                normalized_name
            ].get("in_space", False):
                # Found a matching arrival - create stay record
                arrival_event = status_tracker[normalized_name]["arrival"]
                duration = (
                    event["datetime"] - arrival_event["datetime"]
                ).total_seconds() / 86400

                # Only create record if dates make sense (positive duration)
                if duration > 0:
                    crew_records.append(
                        {
                            "name": crew_name,
                            "nationality": arrival_event["nationality"],
                            "arrivalDate": arrival_event["date"],
                            "arrivalFlight": arrival_event["flightName"],
                            "departureDate": event["date"],
                            "departureFlight": event["flightName"],
                            "durationDays": f"{duration:.2f}",
                        }
                    )

                # Mark crew member as not in space
                status_tracker[normalized_name]["in_space"] = False
            else:
                # No matching arrival found - this is a departure without arrival
                print(
                    f"WARNING: No arrival found for {crew_name} departure on {event['date']}"
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
    print(f"Total crew stays recorded: {len(crew_records)}")


if __name__ == "__main__":
    main()
