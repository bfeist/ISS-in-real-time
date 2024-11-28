import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

S3_FOLDER = os.getenv("S3_FOLDER")
COMM_S3 = S3_FOLDER + "comm/"


def collect_available_dates(comm_dir):
    available_dates = []
    for year in os.listdir(comm_dir):
        year_path = os.path.join(comm_dir, year)
        if os.path.isdir(year_path):
            for month in os.listdir(year_path):
                month_path = os.path.join(year_path, month)
                if os.path.isdir(month_path):
                    for day in os.listdir(month_path):
                        day_path = os.path.join(month_path, day)
                        if os.path.isdir(day_path):
                            date_str = f"{year}-{month}-{day}"
                            available_dates.append(date_str)
    return available_dates


if __name__ == "__main__":
    available_dates = collect_available_dates(COMM_S3)
    output_json = os.path.join(S3_FOLDER, "available_dates.json")
    with open(output_json, "w") as f:
        json.dump(available_dates, f, indent=4)
    print(f"Available dates have been saved to {output_json}")
