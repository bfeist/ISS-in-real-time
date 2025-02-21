import os


def main():
    # Define paths
    base_dir = os.path.dirname(__file__)
    processed_file = os.path.join(
        base_dir, "src", "server-batch", "ia_zips_processed.txt"
    )
    raw_dir = os.path.join(base_dir, "_raw", "comm_transcripts_aacs")

    # Read the processed zips
    with open(processed_file, "r") as f:
        zips = [line.strip() for line in f if line.strip()]

    missing = []
    for zip_name in zips:
        folder_name = os.path.splitext(zip_name)[0]  # remove .zip
        folder_path = os.path.join(raw_dir, folder_name)
        if not os.path.isdir(folder_path):
            missing.append(zip_name)

    # Print results
    if missing:
        print("Zips without corresponding raw folder:")
        for name in missing:
            print(name)
    else:
        print("All zips have corresponding raw folders.")


if __name__ == "__main__":
    main()
