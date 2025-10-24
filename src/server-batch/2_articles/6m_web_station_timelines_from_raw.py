import os
import re
import shutil
from pathlib import Path
from dotenv import load_dotenv

try:
    from docx2pdf import convert

    DOCX2PDF_AVAILABLE = True
except ImportError:
    DOCX2PDF_AVAILABLE = False
    print("⚠️  docx2pdf not installed. Install with: pip install docx2pdf")

# Load environment variables from .env file
load_dotenv(dotenv_path="../../../.env")

RAW_FOLDER = os.getenv("RAW_FOLDER")
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")


def convert_doc_to_pdf(doc_path, pdf_path):
    """
    Convert a .doc or .docx file to PDF using docx2pdf

    Args:
        doc_path: Path to the source Word document
        pdf_path: Path where the PDF should be saved

    Returns:
        bool: True if conversion succeeded, False otherwise
    """
    if not DOCX2PDF_AVAILABLE:
        print(f"  ❌ docx2pdf not available. Cannot convert Word documents.")
        return False

    try:
        # Create output directory if it doesn't exist
        output_dir = os.path.dirname(pdf_path)
        os.makedirs(output_dir, exist_ok=True)

        # Convert the document
        # docx2pdf works with both .doc and .docx files on Windows
        convert(doc_path, pdf_path)

        if os.path.exists(pdf_path):
            print(f"  ✓ Converted to PDF")
            return True
        else:
            print(f"  ❌ PDF not created at expected location: {pdf_path}")
            return False

    except Exception as e:
        print(f"  ❌ Conversion error: {e}")
        return False


def extract_date_from_filename(filename):
    """
    Extract date from filename in format YYYY-MM-DD or YYYY-MM

    Args:
        filename: The filename to parse (e.g., "2010-01-01__415084main_010110_tl.pdf")

    Returns:
        tuple: (year, month, day) or (None, None, None) if not found
    """
    # Try to match YYYY-MM-DD pattern at the start
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})__", filename)
    if match:
        return match.group(1), match.group(2), match.group(3)

    # Try to match YYYY-MM pattern at the start (for monthly files)
    match = re.match(r"(\d{4})-(\d{2})__", filename)
    if match:
        # Return None for day if it's a monthly file
        return match.group(1), match.group(2), None

    return None, None, None


def process_station_timelines():
    """
    Process station timeline files from raw folder to web assets folder
    - Copy PDFs with renamed format
    - Convert Word docs to PDF then copy
    - Organize into yyyy/mm folder structure
    """
    source_base = os.path.join(RAW_FOLDER, "station_timelines_wayback_scrape")
    target_base = os.path.join(WEB_ASSETS_FOLDER, "station_timelines")

    if not os.path.exists(source_base):
        print(f"❌ Source folder not found: {source_base}")
        return

    print(f"📁 Processing station timelines from: {source_base}")
    print(f"📁 Target folder: {target_base}")
    print("=" * 80)

    stats = {"pdf_copied": 0, "doc_converted": 0, "skipped": 0, "errors": 0}

    # Walk through all year/month folders in the source
    for year_folder in sorted(os.listdir(source_base)):
        year_path = os.path.join(source_base, year_folder)

        if not os.path.isdir(year_path):
            continue

        print(f"\n📅 Processing year: {year_folder}")

        for month_folder in sorted(os.listdir(year_path)):
            month_path = os.path.join(year_path, month_folder)

            if not os.path.isdir(month_path):
                continue

            print(f"  📆 Month: {month_folder}")

            # Process all files in this month
            for filename in sorted(os.listdir(month_path)):
                source_file = os.path.join(month_path, filename)

                if not os.path.isfile(source_file):
                    continue

                # Extract date from filename
                year, month, day = extract_date_from_filename(filename)

                if not year or not month:
                    print(f"    ⚠ Skipping (no date found): {filename}")
                    stats["skipped"] += 1
                    continue

                # Create target directory
                target_dir = os.path.join(target_base, year, month)
                os.makedirs(target_dir, exist_ok=True)

                # Determine target filename
                if day:
                    target_filename = f"{year}_{month}_{day}_station_timeline.pdf"
                else:
                    # For monthly files, use just year and month
                    target_filename = f"{year}_{month}_station_timeline.pdf"

                target_file = os.path.join(target_dir, target_filename)

                # Skip if target already exists
                if os.path.exists(target_file):
                    stats["skipped"] += 1
                    continue

                # Get file extension
                _, ext = os.path.splitext(filename)
                ext = ext.lower()

                # Process based on file type
                if ext == ".pdf":
                    # Simply copy PDF files
                    try:
                        shutil.copy2(source_file, target_file)
                        print(f"    ✓ Copied: {target_filename}")
                        stats["pdf_copied"] += 1
                    except Exception as e:
                        print(f"    ❌ Error copying {filename}: {e}")
                        stats["errors"] += 1

                elif ext in [".doc", ".docx"]:
                    # Convert Word docs to PDF
                    print(f"    🔄 Converting: {filename}")
                    if convert_doc_to_pdf(source_file, target_file):
                        stats["doc_converted"] += 1
                    else:
                        stats["errors"] += 1
                else:
                    print(f"    ⚠ Skipping unknown file type: {filename}")
                    stats["skipped"] += 1

    # Print summary
    print("\n" + "=" * 80)
    print("📊 Summary:")
    print(f"  ✓ PDFs copied: {stats['pdf_copied']}")
    print(f"  ✓ Docs converted: {stats['doc_converted']}")
    print(f"  ⚠ Skipped: {stats['skipped']}")
    print(f"  ❌ Errors: {stats['errors']}")
    print(f"  📝 Total processed: {stats['pdf_copied'] + stats['doc_converted']}")


def main():
    """Main entry point"""
    process_station_timelines()


if __name__ == "__main__":
    main()
