import os
import json
import re
import glob

io_output_path = f"D:/data_processing/IO_nasatv/output"
ia_video_metadata_path = "F:/ISSiRT_assets/_raw/ia_video_metadata"

# Create an index of NASA TV IO responses with nasa_id as key
nasa_id_index = {}
nasatv_files = glob.glob(os.path.join(io_output_path, "*nasatv.json"))
print(f"Found {len(nasatv_files)} NASA TV IO files")

for file_path in nasatv_files:
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)
            if (
                "results" in data
                and "response" in data["results"]
                and "docs" in data["results"]["response"]
            ):
                for doc in data["results"]["response"]["docs"]:
                    if "nasa_id" in doc:
                        nasa_id_index[doc["nasa_id"]] = doc
    except Exception as e:
        print(f"Error loading NASA TV IO file {file_path}: {e}")

print(f"Created index with {len(nasa_id_index)} NASA IDs")

# Define the patterns to match
patterns = [
    r"jsc\d+m\d+",  # matches patterns like jsc2025m000025, jsc2025m000031
    r"iss\d+m\d+",  # matches patterns like iss072m262951539, iss072m262991558
    r"art\d+m\d+",  # matches patterns like art001m1013260513
]

# Compile patterns for efficient matching
compiled_patterns = [re.compile(pattern) for pattern in patterns]

# Initialize counters for matches
first_set_match_count = 0
nasa_tv_match_count = 0
both_match_count = 0

# List all files in the directory
for filename in os.listdir(ia_video_metadata_path):
    if filename.endswith(".json"):
        file_path = os.path.join(ia_video_metadata_path, filename)

        try:
            with open(file_path, "r", encoding="utf-8") as file:
                data = json.load(file)

                for item in data:
                    # Extract the filename from the metadata
                    if "filename" in item:
                        filename = item["filename"]
                        matched = False

                        # Check if the name matches any of our patterns
                        for pattern in compiled_patterns:
                            match = pattern.search(filename)
                            if match:
                                matched_id = match.group(
                                    0
                                )  # Extract the actual matched text (e.g., jsc2025m000025)
                                first_set_match_count += 1
                                matched = True

                                # Check if this also exists in the NASA TV index
                                if matched_id in nasa_id_index:
                                    both_match_count += 1
                                    # print(f"Match found in both datasets: {matched_id}")

                                break
        except Exception as e:
            print(f"Error processing file {filename}: {e}")

# Print the results
print(f"Total matches in the IA metadata: {first_set_match_count}")
print(f"Total matches found in both datasets: {both_match_count}")
print(
    f"Percentage of matches also in NASA TV: {(both_match_count/first_set_match_count)*100 if first_set_match_count > 0 else 0:.2f}%"
)

# now look for DL-1_2022_326_0501_08000_1724952 this is DL-{downlink_number}_{year}_{day_of_year}_{hourminute}_{seconds(first two digits)}_{dalet_number}

# patterns = [
#     r".*DL-\d{1,2}_\d{4}_\d{3}_\d{4}_\d+.*",  # matches patterns like DL-1_2022_326_0501_08000_1724952 with any-length dalet number
# ]
# # Compile patterns for efficient matching
# compiled_patterns = [re.compile(pattern) for pattern in patterns]

# # Initialize a counter for matches
# match_count = 0

# for filename in os.listdir(ia_video_metadata_path):
#     if filename.endswith(".json"):
#         file_path = os.path.join(ia_video_metadata_path, filename)

#         try:
#             with open(file_path, "r", encoding="utf-8") as file:
#                 data = json.load(file)

#                 for item in data:
#                     # Extract the filename from the metadata
#                     if "filename" in item:
#                         filename = item["filename"]

#                     # Check if the name matches any of our patterns
#                     for pattern in compiled_patterns:
#                         if pattern.search(filename):
#                             # print(f"Matching name: {filename}")
#                             match_count += 1
#                             break
#         except Exception as e:
#             print(f"Error processing file {filename}: {e}")

# # Print the total number of matches
# print(f"Total matches: {match_count}")
