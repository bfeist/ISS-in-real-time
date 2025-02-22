import datetime
import re
from typing import Any, Dict, List
import requests
from bs4 import BeautifulSoup
import json
import os

S3_FOLDER = os.getenv("S3_FOLDER")

with open(f"{S3_FOLDER}iss_crew_arr_dep.json", "r", encoding="utf-8") as jsonfile:
    crew_arr_dep_temp = json.load(jsonfile)

# Collect unique nationalities
nationalities = {record["nationality"] for record in crew_arr_dep_temp}

flag_svg_urls = {}

for nationality in nationalities:
    try:
        response = requests.get(
            f"https://restcountries.com/v3.1/name/{nationality}", timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data and isinstance(data, list):
                flag_svg_urls[nationality] = data[0]["flags"]["svg"]
    except Exception as e:
        print(f"Error fetching flag for {nationality}: {e}")

# output the flag urls to a json file in the S3 folder called nationality_flags.json
with open(f"{S3_FOLDER}nationality_flags.json", "w", encoding="utf-8") as jsonfile:
    json.dump(flag_svg_urls, jsonfile, ensure_ascii=False, indent=4)
