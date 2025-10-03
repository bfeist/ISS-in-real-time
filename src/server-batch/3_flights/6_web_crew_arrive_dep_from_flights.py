#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime
from math import floor
from difflib import SequenceMatcher

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


def parse_crew_name(name):
    """
    Parse a crew member's name into components: first, middle, last, suffix.

    Examples:
    - "William Shepherd" -> ("William", "", "Shepherd", "")
    - "James S. Voss" -> ("James", "S.", "Voss", "")
    - "Frank L. Culbertson Jr." -> ("Frank", "L.", "Culbertson", "Jr.")
    - "Frank L. Culbertson, Jr." -> ("Frank", "L.", "Culbertson", "Jr.")
    - "John 'Jack' Smith" -> ("John", "", "Smith", "")
    - "Sunita 'Suni' Williams" -> ("Sunita", "", "Williams", "")
    - "Jean-François Clervoy" -> ("Jean-François", "", "Clervoy", "")

    Returns:
        tuple: (name_first, name_middle, name_last, name_suffix)
    """
    if not name:
        return ("", "", "", "")

    original_name = name
    name = name.strip()

    # Remove anything in quotes (nicknames) - both single and double quotes
    name = re.sub(r"\s*['\"](.*?)['\"]", "", name)

    # Extract suffix (Jr., Sr., II, III, IV, V)
    # Match suffix with or without comma before it
    suffix_match = re.search(
        r",?\s+(Jr\.?|Sr\.?|II|III|IV|V)\.?\s*$", name, re.IGNORECASE
    )
    name_suffix = ""
    if suffix_match:
        name_suffix = suffix_match.group(1).strip()
        # Normalize suffix format
        if name_suffix.upper() in ["JR", "JR."]:
            name_suffix = "Jr."
        elif name_suffix.upper() in ["SR", "SR."]:
            name_suffix = "Sr."
        else:
            name_suffix = name_suffix.upper()  # For II, III, IV, V
        # Remove suffix from name
        name = name[: suffix_match.start()].strip()

    # Split remaining name into parts
    parts = name.split()

    if len(parts) == 0:
        return ("", "", "", name_suffix)
    elif len(parts) == 1:
        # Only one name part (unusual, but handle it)
        return (parts[0], "", "", name_suffix)
    elif len(parts) == 2:
        # First and last name only
        return (parts[0], "", parts[1], name_suffix)
    else:
        # Three or more parts: first, middle(s), last
        name_first = parts[0]
        name_last = parts[-1]

        # Everything in between is middle name(s)
        middle_parts = parts[1:-1]
        name_middle = " ".join(middle_parts)

        return (name_first, name_middle, name_last, name_suffix)


def normalize_crew_name(name):
    """
    Normalize crew names by removing middle initials and suffixes.
    Returns just "First Last" for comparison purposes.

    Examples:
    - "John A. Doe" -> "John Doe"
    - "Frank L. Culbertson Jr." -> "Frank Culbertson"
    - "Frank L. Culbertson, Jr." -> "Frank Culbertson"
    - "John 'Jack' Smith" -> "John Smith"
    - "Sunita 'Suni' Williams" -> "Sunita Williams"
    """
    name_first, name_middle, name_last, name_suffix = parse_crew_name(name)
    return f"{name_first} {name_last}".strip()


def names_match(name1, name2, threshold=0.80):
    """
    Check if two names match using fuzzy string matching.
    Handles variations like:
    - Middle initials present or absent
    - Nicknames vs full names (Doug vs Douglas, Randy vs Randolph, Jim vs James)
    - Minor spelling variations (Sergey vs Sergei, Valeri vs Valery)

    Args:
        name1: First normalized name (first + last)
        name2: Second normalized name (first + last)
        threshold: Similarity threshold (0.0-1.0), default 0.80

    Returns:
        bool: True if names are similar enough to be considered a match
    """
    # Nickname dictionary based on actual data analysis
    # Maps common nicknames to full names and vice versa
    nickname_map = {
        # Russian transliteration variants
        "aleksandr": "alexander",
        "alexander": "aleksandr",
        "sergei": "sergey",
        "sergey": "sergei",
        "valeri": "valery",
        "valery": "valeri",
        "yuri": "yury",
        "yury": "yuri",
        "mikhail": "michael",
        "michael": "mikhail",
        # English nicknames
        "bob": "robert",
        "robert": "bob",
        "doug": "douglas",
        "douglas": "doug",
        "jim": "james",
        "james": "jim",
        "randy": "randolph",
        "randolph": "randy",
        "tony": "anthony",
        "anthony": "tony",
        "dominic": "tony",  # Special case: Dominic "Tony" Antonelli
        "thomas": "tom",
        "tom": "thomas",
    }

    # Exact match
    if name1 == name2:
        return True

    # Case-insensitive comparison
    name1_lower = name1.lower()
    name2_lower = name2.lower()

    if name1_lower == name2_lower:
        return True

    # Split into first and last names
    parts1 = name1_lower.split()
    parts2 = name2_lower.split()

    # Need at least first and last name in both
    if len(parts1) < 2 or len(parts2) < 2:
        return name1_lower == name2_lower

    # Compare last names - must match exactly (or very closely for spelling variants)
    last1 = parts1[-1]
    last2 = parts2[-1]

    # Exact match on last name
    if last1 != last2:
        # Allow for very close last name matches (e.g., different transliterations)
        last_similarity = SequenceMatcher(None, last1, last2).ratio()
        if last_similarity < 0.90:  # Last names must be very similar
            return False

    # Compare first names with fuzzy matching
    first1 = parts1[0]
    first2 = parts2[0]

    # Check nickname dictionary
    if first1 in nickname_map and nickname_map[first1] == first2:
        return True
    if first2 in nickname_map and nickname_map[first2] == first1:
        return True

    # Check if one first name is a substring of the other (nickname case)
    # e.g., "suni" in "sunita", "tom" in "thomas"
    if first1 in first2 or first2 in first1:
        return True

    # Check if first names start with same 3+ characters
    # Handles cases like Tom/Thomas, Bill/William, Steve/Steven
    if len(first1) >= 3 and len(first2) >= 3:
        if first1[:3] == first2[:3]:
            return True

    # Use sequence matching for similarity (handles minor spelling differences)
    similarity = SequenceMatcher(None, first1, first2).ratio()

    return similarity >= threshold


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
                    name_first, name_middle, name_last, name_suffix = parse_crew_name(
                        crew_name
                    )
                    arrival_events.append(
                        {
                            "name": crew_name,
                            "name_first": name_first,
                            "name_middle": name_middle,
                            "name_last": name_last,
                            "name_suffix": name_suffix,
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
                    name_first, name_middle, name_last, name_suffix = parse_crew_name(
                        crew_name
                    )
                    departure_events.append(
                        {
                            "name": crew_name,
                            "name_first": name_first,
                            "name_middle": name_middle,
                            "name_last": name_last,
                            "name_suffix": name_suffix,
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
            # Find if there's an existing matching entry using fuzzy matching
            matched_key = None
            for existing_key in status_tracker.keys():
                if names_match(normalized_name, existing_key):
                    matched_key = existing_key
                    break

            # Record this arrival
            if matched_key is None:
                status_tracker[normalized_name] = {"arrival": event, "in_space": True}
            else:
                # If already in space, close the previous stay with current arrival as departure
                if status_tracker[matched_key].get("in_space", False):
                    arrival_event = status_tracker[matched_key]["arrival"]
                    # Calculate duration based on this odd sequence
                    duration = (
                        event["datetime"] - arrival_event["datetime"]
                    ).total_seconds() / 86400

                    # Only create record if dates make sense (positive duration)
                    if duration > 0:
                        crew_records.append(
                            {
                                "name_first": arrival_event["name_first"],
                                "name_middle": arrival_event["name_middle"],
                                "name_last": arrival_event["name_last"],
                                "name_suffix": arrival_event["name_suffix"],
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
            # This is a departure event - use fuzzy matching to find arrival
            matched_key = None
            for existing_key in status_tracker.keys():
                if names_match(normalized_name, existing_key):
                    matched_key = existing_key
                    break

            if matched_key and status_tracker[matched_key].get("in_space", False):
                # Found a matching arrival - create stay record
                arrival_event = status_tracker[matched_key]["arrival"]
                duration = (
                    event["datetime"] - arrival_event["datetime"]
                ).total_seconds() / 86400

                # Only create record if dates make sense (positive duration)
                if duration > 0:
                    crew_records.append(
                        {
                            "name_first": arrival_event["name_first"],
                            "name_middle": arrival_event["name_middle"],
                            "name_last": arrival_event["name_last"],
                            "name_suffix": arrival_event["name_suffix"],
                            "nationality": arrival_event["nationality"],
                            "arrivalDate": arrival_event["date"],
                            "arrivalFlight": arrival_event["flightName"],
                            "departureDate": event["date"],
                            "departureFlight": event["flightName"],
                            "durationDays": f"{duration:.2f}",
                        }
                    )

                # Mark crew member as not in space
                status_tracker[matched_key]["in_space"] = False
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
