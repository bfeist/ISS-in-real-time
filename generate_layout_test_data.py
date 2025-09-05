import csv

# Read the CSV file
data_availability = []
with open("f:\_repos\ISSiRT_assets\ISSiRT_web_assets\data_availability.csv", "r") as f:
    reader = csv.DictReader(f, delimiter="|")
    for row in reader:
        data_availability.append(row)

# Define all 32 layout permutations
permutations = [
    # Video layouts (16)
    {"video": True, "comm": True, "eva": True, "article": True, "photo": True},
    {"video": True, "comm": True, "eva": True, "article": True, "photo": False},
    {"video": True, "comm": True, "eva": True, "article": False, "photo": True},
    {"video": True, "comm": True, "eva": True, "article": False, "photo": False},
    {"video": True, "comm": True, "eva": False, "article": True, "photo": True},
    {"video": True, "comm": True, "eva": False, "article": True, "photo": False},
    {"video": True, "comm": True, "eva": False, "article": False, "photo": True},
    {"video": True, "comm": True, "eva": False, "article": False, "photo": False},
    {"video": True, "comm": False, "eva": True, "article": True, "photo": True},
    {"video": True, "comm": False, "eva": True, "article": True, "photo": False},
    {"video": True, "comm": False, "eva": True, "article": False, "photo": True},
    {"video": True, "comm": False, "eva": True, "article": False, "photo": False},
    {"video": True, "comm": False, "eva": False, "article": True, "photo": True},
    {"video": True, "comm": False, "eva": False, "article": True, "photo": False},
    {"video": True, "comm": False, "eva": False, "article": False, "photo": True},
    {"video": True, "comm": False, "eva": False, "article": False, "photo": False},
    # Comm layouts (8) - no video
    {"video": False, "comm": True, "eva": True, "article": True, "photo": True},
    {"video": False, "comm": True, "eva": True, "article": True, "photo": False},
    {"video": False, "comm": True, "eva": True, "article": False, "photo": True},
    {"video": False, "comm": True, "eva": True, "article": False, "photo": False},
    {"video": False, "comm": True, "eva": False, "article": True, "photo": True},
    {"video": False, "comm": True, "eva": False, "article": True, "photo": False},
    {"video": False, "comm": True, "eva": False, "article": False, "photo": True},
    {"video": False, "comm": True, "eva": False, "article": False, "photo": False},
    # Other layouts (8) - no video, no comm
    {"video": False, "comm": False, "eva": True, "article": True, "photo": True},
    {"video": False, "comm": False, "eva": True, "article": True, "photo": False},
    {"video": False, "comm": False, "eva": True, "article": False, "photo": True},
    {"video": False, "comm": False, "eva": True, "article": False, "photo": False},
    {"video": False, "comm": False, "eva": False, "article": True, "photo": True},
    {"video": False, "comm": False, "eva": False, "article": True, "photo": False},
    {"video": False, "comm": False, "eva": False, "article": False, "photo": True},
    {"video": False, "comm": False, "eva": False, "article": False, "photo": False},
]


def get_layout_key(perm):
    parts = []
    if perm["video"]:
        parts.append("video")
    if perm["comm"]:
        parts.append("comm")
    if perm["eva"]:
        parts.append("eva")
    if perm["article"]:
        parts.append("article")
    if perm["photo"]:
        parts.append("photo")
    return "-".join(parts) if parts else "none"


def matches_permutation(row, perm):
    # Check video
    has_video = int(row["youtube"]) == 1
    if has_video != perm["video"]:
        return False

    # Check comm (includes both comm and vvComm)
    has_comm = int(row["comm"]) == 1 or int(row["vvComm"]) == 1
    if has_comm != perm["comm"]:
        return False

    # Check eva
    has_eva = int(row["eva"]) == 1
    if has_eva != perm["eva"]:
        return False

    # Check article (includes both blog and activitySummary)
    has_article = int(row["blog"]) == 1 or int(row["activitySummary"]) == 1
    if has_article != perm["article"]:
        return False

    # Check photo
    has_photo = int(row["earthPhotography"]) == 1
    if has_photo != perm["photo"]:
        return False

    return True


# Find first matching date for each permutation
results = {}

print("Searching for layout permutations...")
for i, perm in enumerate(permutations):
    layout_key = get_layout_key(perm)
    print(f"Looking for {layout_key}...")

    found_date = None
    for row in data_availability:
        if matches_permutation(row, perm):
            found_date = row["date"]
            break

    results[layout_key] = found_date
    if found_date:
        print(f"  Found: {found_date}")
    else:
        print(f"  Not found")

# Output TypeScript object
print("\n// Generated layout test data")
print("const LAYOUT_TEST_DATA: Record<string, string | null> = {")
for layout_key, date in results.items():
    if date:
        print(f'  "{layout_key}": "{date}",')
    else:
        print(f'  "{layout_key}": null,')
print("};")

# Count results
found_count = sum(1 for date in results.values() if date)
print(
    f"\nFound {found_count} out of {len(permutations)} permutations ({len(permutations) - found_count} missing)"
)
