import requests
import getpass
import time
import pandas as pd
from datetime import datetime, timedelta
from urllib.parse import quote
import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

# Constants
LOGIN_URL = "https://www.space-track.org/ajaxauth/login"
API_BASE_URL = "https://www.space-track.org/basicspacedata/query"
NORAD_ID = 25544  # ISS NORAD ID

EPHEMERA_S3 = os.getenv("S3_FOLDER") + "ephemera/"
AVAILABLE_DATES_S3 = os.getenv("S3_FOLDER") + "/available_dates.json"


# Function to create an authenticated session
def create_session(username, password):
    session = requests.Session()
    login_payload = {"identity": username, "password": password}
    headers = {"User-Agent": "ISS_TLE_Retriever/1.0"}

    response = session.post(LOGIN_URL, data=login_payload, headers=headers)

    if response.status_code == 200:
        # Attempt to verify authentication
        try:
            response_json = response.json()
            if "error" in response_json:
                raise Exception(f"Login failed: {response_json['error']}")
            else:
                print("Successfully logged in to Space-Track.org")
                return session
        except ValueError:
            # If response is not JSON, perform a fallback check
            if "logout" in response.text.lower():
                print("Successfully logged in to Space-Track.org")
                return session
            else:
                raise Exception("Login failed. Please check your credentials.")
    else:
        raise Exception(f"Login request failed with status code {response.status_code}")


# Function to fetch TLE data for a specific date range
def fetch_tle(session, start_date, end_date, norad_id=NORAD_ID, limit=1000):
    """
    Fetch TLE data for a specific NORAD ID between start_date and end_date.

    Parameters:
        session (requests.Session): Authenticated session.
        start_date (str): Start date in YYYY-MM-DD format.
        end_date (str): End date in YYYY-MM-DD format.
        norad_id (int): NORAD ID of the object (25544 for ISS).
        limit (int): Maximum number of records per request.

    Returns:
        list: List of TLE records.
    """
    all_tle = []
    step = limit  # Number of records per request
    max_retries = 3
    retry_delay = 5  # seconds

    # Encode the 'orderby' parameter to handle spaces
    orderby = "orderby/EPOCH asc"
    orderby_encoded = orderby.replace(" ", "%20")  # Replace space with '%20'

    # Construct the query string with proper encoding
    query = (
        f"/class/tle/EPOCH/{start_date}--{end_date}/NORAD_CAT_ID/{norad_id}/"
        f"{orderby_encoded}/limit/{step}/format/json"
    )

    # Ensure the query is properly URL-encoded
    # Note: Only specific parts that may contain special characters are encoded
    # The rest of the URL structure remains unchanged
    # For more complex encoding, consider using urllib.parse functions

    url = f"{API_BASE_URL}{query}"
    print(f"Fetching TLE data from {start_date} to {end_date}...")
    print(f"Request URL: {url}")  # Debug: Display the constructed URL

    retries = 0
    while retries < max_retries:
        response = session.get(url)

        if response.status_code == 200:
            try:
                tle_batch = response.json()
                if not tle_batch:
                    print("No more records found in this date range.")
                    break
                all_tle.extend(tle_batch)
                print(f"Retrieved {len(tle_batch)} records.")
                break  # Successful retrieval
            except ValueError:
                print("Failed to parse JSON response.")
                retries += 1
                time.sleep(retry_delay)
        else:
            print(f"Failed to fetch TLE data: {response.status_code} - {response.text}")
            retries += 1
            time.sleep(retry_delay)

    if retries == max_retries:
        raise Exception("Exceeded maximum retries for fetching TLE data.")

    return all_tle


# Function to retrieve all TLE data from start_year to present
def get_all_tle(session, start_year=2015, norad_id=NORAD_ID):
    """
    Retrieve all TLE data for the specified NORAD ID starting from start_year to present.

    Parameters:
        session (requests.Session): Authenticated session.
        start_year (int): Year to start fetching data from.
        norad_id (int): NORAD ID of the object (25544 for ISS).

    Returns:
        pd.DataFrame: DataFrame containing all TLE records.
    """
    all_tle = []
    current_date = datetime(start_year, 1, 1)
    end_date = datetime.now()

    # Define batch size (e.g., 1 month)
    batch_delta = timedelta(days=30)

    while current_date < end_date:
        batch_end_date = current_date + batch_delta
        if batch_end_date > end_date:
            batch_end_date = end_date

        start_str = current_date.strftime("%Y-%m-%d")
        end_str = batch_end_date.strftime("%Y-%m-%d")

        try:
            tle_batch = fetch_tle(session, start_str, end_str, norad_id)
            all_tle.extend(tle_batch)
        except Exception as e:
            print(f"Error fetching data for {start_str} to {end_str}: {e}")
            # Optionally, continue to next batch or halt
            # Here, we'll continue
            continue

        current_date = batch_end_date + timedelta(days=1)  # Avoid overlapping

        # Respect API rate limits
        time.sleep(1)

    # Convert to DataFrame for easier handling
    df = pd.DataFrame(all_tle)
    return df


def save_monthly_tle(tle_df, output_file):
    tle_df = tle_df[["EPOCH", "TLE_LINE1", "TLE_LINE2"]]
    tle_df.loc[:, "EPOCH"] = pd.to_datetime(tle_df["EPOCH"])
    tle_df = tle_df.rename(
        columns={
            "EPOCH": "epoch",
            "TLE_LINE1": "tle_line1",
            "TLE_LINE2": "tle_line2",
        }
    )
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    tle_df.to_json(
        output_file,
        orient="records",
        date_format="iso",
        indent=4,
        force_ascii=False,
    )
    print(f"Saved TLE data to {output_file}")


# Main function
def main():
    print("Space-Track.org ISS TLE Data Retriever")
    print("--------------------------------------")

    # Retrieve username and password from environment variables
    username = os.getenv("SPACETRACK_USERNAME")
    password = os.getenv("SPACETRACK_PASSWORD")

    available_dates = []
    if os.path.exists(AVAILABLE_DATES_S3):
        with open(AVAILABLE_DATES_S3, "r") as f:
            available_dates = json.load(f)

    required_months = set()
    for available_date in available_dates:
        date_str = available_date["date"]
        year, month, day = date_str.split("-")
        required_months.add(f"{year}-{month}")

    required_months = sorted(required_months)

    try:
        # Create an authenticated session
        session = create_session(username, password)

        # Fetch TLE data for required months
        for month_str in required_months:
            year, month = month_str.split("-")
            output_file = os.path.join(EPHEMERA_S3, year, f"{year}-{month}.json")
            if os.path.exists(output_file):
                print(
                    f"Ephemera file for {year}-{month} already exists. Skipping API call."
                )
                continue

            # Include one day before and after the month
            start_date_dt = datetime(int(year), int(month), 1) - timedelta(days=1)
            start_date = start_date_dt.strftime("%Y-%m-%d")
            end_date_dt = (
                datetime(int(year), int(month), 1) + timedelta(days=32)
            ).replace(day=1)
            end_date_dt += timedelta(days=1)
            end_str = end_date_dt.strftime("%Y-%m-%d")

            tle_batch = fetch_tle(session, start_date, end_str, NORAD_ID)
            if not tle_batch:
                print(f"No TLE data available for {year}-{month}")
                continue

            tle_df = pd.DataFrame(tle_batch)
            save_monthly_tle(tle_df, output_file)
            time.sleep(1)  # Respect API rate limits

    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    main()
