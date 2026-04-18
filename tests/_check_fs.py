"""Quick script to read the real FS and print its content for inspection."""
import io, sys, zipfile, re
from pathlib import Path

fs_path = Path(__file__).parent.parent / "data" / "FS_AMS_AM_E0003_Technical Object as Mandatory field for CreateChange Notification and Maintenance Order Apps.docx"

with open(fs_path, "rb") as f:
    data = f.read()

# Read plain text directly from docx XML (no imports needed)
all_xml = ""
with zipfile.ZipFile(io.BytesIO(data)) as z:
    if "word/document.xml" in z.namelist():
        all_xml = z.read("word/document.xml").decode("utf-8", errors="replace")

# Strip XML tags to get readable text
plain = re.sub(r"<[^>]+>", " ", all_xml)
plain = re.sub(r"\s{2,}", " ", plain).strip()

print(f"Total chars: {len(plain)}")
print("=== FIRST 4000 CHARS ===")
print(plain[:4000])
