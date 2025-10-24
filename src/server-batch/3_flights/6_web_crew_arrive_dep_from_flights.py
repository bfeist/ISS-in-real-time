#!/usr/bin/env python3
"""
Process flight data to create crew arrival and departure records.

This script reads the cleaned flights.json file (produced by 5a_web_flights.py)
and matches crew arrivals with their corresponding departures to create a complete
record of each crew member's stay on the ISS.

Key features:
- Uses fuzzy name matching to handle inconsistent name formats across missions
  (e.g., middle initials present/absent, nicknames, transliteration variations)
- Chronologically processes all arrival and departure events
- Handles edge cases like crew exchanges, extended missions, and rescue flights
- Calculates duration of each crew member's stay
- Handles currently onboard crew (no departure yet) by using a far-future departure date

Output format:
- Each record represents one crew member's stay on the ISS
- For completed stays: includes actual arrival and departure dates
- For crew currently onboard: uses departure date of 2099-12-31T23:59:59Z with "TBD" values

Dependencies:
- Requires flights.json from 5a_web_flights.py (contains validated, cleaned crew names)
- Names are already validated and cleaned by 5a, so no additional validation needed
- Fuzzy matching is still required because Wikipedia may have name variations between missions
"""
import json
import os
import re
from datetime import datetime
from difflib import SequenceMatcher

from dotenv import load_dotenv

load_dotenv(dotenv_path="../../../.env")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")

# Canonical first-name forms used when we output crew records so that
# each astronaut/cosmonaut appears with a single consistent name.
NICKNAME_CANONICAL_MAP = {
    "bob": "Robert",
    "chris": "Christopher",
    "dan": "Daniel",
    "dave": "David",
    "doug": "Douglas",
    "jim": "James",
    "joe": "Joseph",
    "matt": "Matthew",
    "mike": "Michael",
    "suni": "Sunita",
    "steve": "Steven",
    "tom": "Thomas",
    "tony": "Anthony",
    "bill": "William",
    "randy": "Randolph",
}

# Groups of first-name spellings that represent the same person but are not
# traditional nicknames (mainly transliteration variants). Used only for
# matching arrivals/departures; we do not override the displayed name with
# these canonical forms.
FIRST_NAME_EQUIVALENCE_GROUPS = [
    {"aleksandr", "alexander"},
    {"sergei", "sergey"},
    {"valeri", "valery"},
    {"yuri", "yury"},
    {"dmitri", "dmitry"},
    {"mikhail", "michael"},
    {"francisco", "frank"},
    {"dominic", "anthony"},
]


def canonicalize_first_name(name_first):
    """Return the canonical display form for a first name."""

    if not name_first:
        return ""

    lookup_key = name_first.lower()
    canonical = NICKNAME_CANONICAL_MAP.get(lookup_key)

    if canonical:
        return canonical

    # Title-case the name to guard against stray lowercase inputs while
    # preserving mixed-case spellings (e.g., McArthur -> Mcarthur would be wrong).
    # We only normalize when the input is all lowercase.
    if name_first.islower():
        return name_first.capitalize()

    return name_first


def first_names_equivalent(name_a, name_b):
    """Check if two first-name spellings should be treated as equivalent."""

    name_a_lower = name_a.lower()
    name_b_lower = name_b.lower()

    if name_a_lower == name_b_lower:
        return True

    for group in FIRST_NAME_EQUIVALENCE_GROUPS:
        if name_a_lower in group and name_b_lower in group:
            return True

    return False


def iso_to_datetime(iso_str):
    """Convert an ISO string (e.g. '2000-10-31T07:52:47Z') into a datetime object."""
    try:
        return datetime.strptime(iso_str, "%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


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
    - "Doug Hurley" -> ("Douglas", "", "Hurley", "") - nickname normalized to full name

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

    # Determine name components based on number of parts
    if len(parts) == 0:
        name_first = ""
        name_middle = ""
        name_last = ""
    elif len(parts) == 1:
        # Only one name part (unusual, but handle it)
        name_first = parts[0]
        name_middle = ""
        name_last = ""
    elif len(parts) == 2:
        # First and last name only
        name_first = parts[0]
        name_middle = ""
        name_last = parts[1]
    else:
        # Three or more parts: first, middle(s), last
        name_first = parts[0]
        name_last = parts[-1]

        # Everything in between is middle name(s)
        middle_parts = parts[1:-1]
        name_middle = " ".join(middle_parts)

    # Apply canonicalization so the display name stays consistent
    name_first = canonicalize_first_name(name_first)

    return (name_first, name_middle, name_last, name_suffix)


def normalize_crew_name(name):
    """
    Normalize crew names by removing middle initials and suffixes.
    Returns just "First Last" for comparison purposes.

    This is still needed because Wikipedia may format the same person's name
    differently on different mission pages:
    - "John A. Doe" on one mission vs "John Doe" on another
    - "Frank L. Culbertson Jr." vs "Frank Culbertson"

    Examples:
    - "John A. Doe" -> "John Doe"
    - "Frank L. Culbertson Jr." -> "Frank Culbertson"
    - "Frank L. Culbertson, Jr." -> "Frank Culbertson"
    - "John 'Jack' Smith" -> "John Smith"
    - "Sunita 'Suni' Williams" -> "Sunita Williams"
    """
    name_first, name_middle, name_last, name_suffix = parse_crew_name(name)
    return f"{name_first} {name_last}".strip()


def names_match(name1, name2, threshold=0.85):
    """
    Check if two names match using fuzzy string matching.

    This fuzzy matching is REQUIRED because Wikipedia has inconsistent name formats:
    - Different mission pages may use different name variants
    - Middle initials may be present on one mission, absent on another
    - Nicknames vs full names (Doug vs Douglas, Randy vs Randolph, Jim vs James)
    - Russian transliteration variations (Sergey vs Sergei, Valeri vs Valery)
    - Even though 5a_web_flights.py validates names, it cannot normalize them across
      all missions because each mission page is scraped independently

    Handles variations like:
    - Middle initials present or absent
    - Nicknames vs full names (Doug vs Douglas, Randy vs Randolph, Jim vs James)
    - Minor spelling variations (Sergey vs Sergei, Valeri vs Valery)

    Args:
        name1: First normalized name (first + last)
        name2: Second normalized name (first + last)
        threshold: Similarity threshold (0.0-1.0), default 0.85

    Returns:
        bool: True if names are similar enough to be considered a match
    """
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

    canonical_first1 = canonicalize_first_name(first1)
    canonical_first2 = canonicalize_first_name(first2)

    if first_names_equivalent(canonical_first1, canonical_first2):
        return True

    # Check if one first name is a substring of the other (nickname case)
    # e.g., "suni" in "sunita", "tom" in "thomas"
    first1_lower = canonical_first1.lower()
    first2_lower = canonical_first2.lower()

    if first1_lower in first2_lower or first2_lower in first1_lower:
        return True

    # Check if first names start with same 3+ characters
    # Handles cases like Tom/Thomas, Bill/William, Steve/Steven
    if len(first1_lower) >= 3 and len(first2_lower) >= 3:
        if first1_lower[:3] == first2_lower[:3]:
            return True

    # Use sequence matching for similarity (handles minor spelling differences)
    similarity = SequenceMatcher(None, first1_lower, first2_lower).ratio()

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
                # Names are already validated by 5a_web_flights.py
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
                # Names are already validated by 5a_web_flights.py
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
            best_match_score = 0

            for existing_key in status_tracker.keys():
                if names_match(normalized_name, existing_key):
                    # Calculate match score for tie-breaking
                    score = SequenceMatcher(
                        None, normalized_name.lower(), existing_key.lower()
                    ).ratio()
                    if score > best_match_score:
                        best_match_score = score
                        matched_key = existing_key

            # Record this arrival
            if matched_key is None:
                # Use the normalized name as key for consistency
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

                # Update with the new arrival (keep using the matched key for consistency)
                status_tracker[matched_key] = {"arrival": event, "in_space": True}
        else:
            # This is a departure event - use fuzzy matching to find arrival
            matched_key = None
            best_match_score = 0

            for existing_key in status_tracker.keys():
                if names_match(normalized_name, existing_key):
                    # Calculate match score for tie-breaking
                    score = SequenceMatcher(
                        None, normalized_name.lower(), existing_key.lower()
                    ).ratio()
                    if score > best_match_score:
                        best_match_score = score
                        matched_key = existing_key

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
                    f"WARNING: No arrival found for {crew_name} (normalized: {normalized_name}) departure on {event['date']} - Flight: {event['flightName']}"
                )

    # Handle crew members still in space (no departure yet)
    # Add them to crew_records with a far-future departure date
    still_in_space = [
        (name, data)
        for name, data in status_tracker.items()
        if data.get("in_space", False)
    ]

    if still_in_space:
        # Use a far-future date (2099-12-31) for crew members still onboard
        # This allows the UI to correctly identify them as currently onboard
        far_future_date = "2099-12-31T23:59:59Z"

        for name, data in still_in_space:
            arrival_event = data["arrival"]
            crew_records.append(
                {
                    "name_first": arrival_event["name_first"],
                    "name_middle": arrival_event["name_middle"],
                    "name_last": arrival_event["name_last"],
                    "name_suffix": arrival_event["name_suffix"],
                    "nationality": arrival_event["nationality"],
                    "arrivalDate": arrival_event["date"],
                    "arrivalFlight": arrival_event["flightName"],
                    "departureDate": far_future_date,
                    "departureFlight": "TBD",
                    "durationDays": "TBD",
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
        f"\n{output_path} has been created with crew arrival and departure details, sorted by arrival date."
    )
    print(f"Total crew stays recorded: {len(crew_records)}")
    print(f"Total arrival events: {len(arrival_events)}")
    print(f"Total departure events: {len(departure_events)}")

    # Debug info: Show any crew members still marked as "in space" at the end
    if still_in_space:
        print(
            f"\n[INFO] {len(still_in_space)} crew member(s) currently onboard (added with TBD departure):"
        )
        for name, data in still_in_space[:10]:  # Limit to first 10
            arrival = data["arrival"]
            print(
                f"  - {arrival['name']} (arrived {arrival['date']} on {arrival['flightName']})"
            )

    # Calculate matching efficiency
    matched_departures = len(crew_records)
    unmatched_departures = len([e for e in departure_events]) - matched_departures
    if len(departure_events) > 0:
        match_rate = (matched_departures / len(departure_events)) * 100
        print(
            f"\n[SUCCESS] Matching efficiency: {match_rate:.1f}% ({matched_departures}/{len(departure_events)} departures matched)"
        )

    print(
        f"[SUCCESS] Script completed - check WARNING messages above for data quality issues"
    )


if __name__ == "__main__":
    main()
