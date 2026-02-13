import sys
from pathlib import Path
import os

# Add relevant paths to sys.path
current_dir = Path.cwd()
sys.path.append(str(current_dir))

try:
    from incremental.config import load_settings

    settings = load_settings()
    print(f"RAW_FOLDER resolved to: {settings.paths.raw_folder}")
    print(f"Raw folder exists: {settings.paths.raw_folder.exists()}")

    print("\n--- Pipeline Config ---")
    if "comm" in settings.pipelines:
        print("Comm pipeline found")
        # Check stages env injection logic (simulated)
        print(f"Projected Script Env RAW_FOLDER: {settings.paths.raw_folder}")

except Exception as e:
    print(f"Error loading settings: {e}")
    import traceback

    traceback.print_exc()
