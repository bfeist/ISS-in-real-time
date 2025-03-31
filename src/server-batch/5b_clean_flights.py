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


# Function to recursively clean the data values
def clean_data(x):
    if isinstance(x, str):
        # Clean both non-breaking spaces and citation references like [1], [ 2 ], etc.
        cleaned = x.replace("\u00a0", " ")
        # More flexible regex that handles spaces around the digits
        cleaned = re.sub(r"\s*\[\s*\d+\s*\]\s*", " ", cleaned).strip()
        return cleaned
    elif isinstance(x, dict):
        return {k: clean_data(v) for k, v in x.items()}
    elif isinstance(x, list):
        return [clean_data(i) for i in x]
    else:
        return x


def clean_flights_data():
    flights_path = os.path.join(WEB_ASSETS_FOLDER, "flights.json")

    # Read the flights data
    with open(flights_path, "r", encoding="utf-8") as file:
        flights_data = json.load(file)

    # Clean the data
    cleaned_data = clean_data(flights_data)

    # Save the cleaned data back to the file with LF line endings
    with open(flights_path, "w", encoding="utf-8", newline="\n") as file:
        json.dump(cleaned_data, file, indent=2, ensure_ascii=False)

    print(f"Cleaned citation references from flights data and saved to {flights_path}")


if __name__ == "__main__":
    clean_flights_data()
