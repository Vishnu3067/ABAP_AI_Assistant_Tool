"""
test_ts_creation_real_ai.py — End-to-end TS Creation test with the real FS document.

Uses the actual FS file:
  data/FS_AMS_AM_E0003_Technical Object as Mandatory field for
  CreateChange Notification and Maintenance Order Apps.docx

Calls the real AI (not mocked) to generate a TS, then validates that
the AI understood the document correctly by checking for key facts.

Run from the FASTAPI_AI_Tool root:
  python tests/test_ts_creation_real_ai.py
"""

import io
import json
import re
import sys
import zipfile
from pathlib import Path

# Force UTF-8 output so non-ASCII AI values don't crash the terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── Project root on sys.path ─────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

import truststore; truststore.inject_into_ssl()
from dotenv import load_dotenv
load_dotenv(dotenv_path=ROOT / ".env", override=True)

# ── Helpers ───────────────────────────────────────────────────────────────────
PASS = FAIL = 0

def ok(msg):
    global PASS; PASS += 1
    print(f"  [PASS] {msg}")

def fail(msg):
    global FAIL; FAIL += 1
    print(f"  [FAIL] {msg}")

def assert_true(condition, label):
    ok(label) if condition else fail(label)

def sep(): print("-" * 70)

# ── Paths ─────────────────────────────────────────────────────────────────────
FS_FILE   = ROOT / "data" / "FS_AMS_AM_E0003_Technical Object as Mandatory field for CreateChange Notification and Maintenance Order Apps.docx"
TEMPLATE  = ROOT / "data" / "TS_WRICEF ID_Description v1.0 - AITemplate 1.docx"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Read the FS file
# ─────────────────────────────────────────────────────────────────────────────
print("\n[1] Loading real FS document")
sep()

assert_true(FS_FILE.exists(),  f"FS file exists at: {FS_FILE.name}")
assert_true(TEMPLATE.exists(), f"TS template exists at: {TEMPLATE.name}")

with open(FS_FILE, "rb") as f:
    fs_bytes = f.read()

assert_true(len(fs_bytes) > 10_000, f"FS file has substantial content ({len(fs_bytes):,} bytes)")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — extract_fs_text
# ─────────────────────────────────────────────────────────────────────────────
print("\n[2] Extract FS text")
sep()

from core.ts_creation import extract_fs_text

try:
    fs_text = extract_fs_text(fs_bytes)
    assert_true(len(fs_text) > 2000, f"Extracted {len(fs_text):,} chars of FS text")

    # Known facts from the FS
    assert_true("Technical Object" in fs_text,         "Key topic 'Technical Object' found in text")
    assert_true("Notification" in fs_text,             "Key topic 'Notification' found")
    assert_true("Maintenance Order" in fs_text or "work order" in fs_text.lower(),
                "Key topic 'Maintenance Order / work order' found")
    assert_true("WebDynpro" in fs_text or "Webdynpro" in fs_text,
                "Technology 'WebDynpro' mentioned")
    assert_true("/PLMU/CL_FRW_G_FEEDER_FORM" in fs_text or "FEEDER" in fs_text,
                "Feeder class name present in extracted text")
    assert_true("GET_DATA" in fs_text or "mandatory" in fs_text.lower(),
                "Method GET_DATA or 'mandatory' keyword present")
    assert_true("Pranay" in fs_text,                   "Author 'Pranay Dubey' present")

    print(f"\n  First 300 chars of extracted text:")
    print("  " + "\n  ".join(fs_text[:600].splitlines()[:8]))

except Exception as e:
    fail(f"extract_fs_text raised: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — extract_placeholders
# ─────────────────────────────────────────────────────────────────────────────
print("\n[3] Extract TS template placeholders")
sep()

from core.ts_creation import extract_placeholders

placeholders = extract_placeholders(TEMPLATE)
print(f"  {len(placeholders)} placeholders: {placeholders}")
assert_true(len(placeholders) >= 10, f"At least 10 placeholders in template ({len(placeholders)} found)")

# Critical placeholders expected in every TS
for expected in ["RIEFID", "Name", "SolutionOverview", "DevelopmentPurpose",
                 "ProcessArea", "Pseudocode"]:
    assert_true(expected in placeholders, f"  Placeholder '{{{{{expected}}}}}' present")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — AI fills placeholders  (REAL AI CALL)
# ─────────────────────────────────────────────────────────────────────────────
print("\n[4] AI fills placeholders from FS  [REAL AI CALL]")
sep()
print("  Calling AI — this may take 20-60 seconds...")

from core.ts_creation import ask_ai_fill_placeholders

try:
    filled = ask_ai_fill_placeholders(placeholders, fs_text)

    assert_true(isinstance(filled, dict),                 "Returns a dict")
    assert_true(set(filled.keys()) == set(placeholders),  "All placeholder keys present in result")

    # ── Quality checks — AI must understand the FS content ─────────────────
    riefid      = filled.get("RIEFID", "")
    process     = filled.get("ProcessArea", "")
    dev_purpose = filled.get("DevelopmentPurpose", "")
    solution    = filled.get("SolutionOverview", "")
    pseudocode  = filled.get("Pseudocode", "")
    enh_name    = filled.get("Enhancement.name", filled.get("Enhancement", {}).get("name", ""))

    # RIEFID: the FS uses "Defect 3028" not a formal WRICEF ID, so the AI may
    # fill it as "3028", "RIEF-3028", "AMS_AM_E0003", or "N/A" — all valid.
    # Just assert the key is present in the result.
    assert_true("RIEFID" in filled, "RIEFID key is present in AI result")

    # ProcessArea should mention plant maintenance or asset management
    area_lower = process.lower()
    area_ok = any(kw in area_lower for kw in (
        "plant maintenance", "asset management", "pm", "maintenance", "ams", "am"
    ))
    assert_true(area_ok, f"ProcessArea mentions maintenance/asset domain (got: '{process}')")

    # DevelopmentPurpose or SolutionOverview must mention mandatory, technical object, notification
    combined = (dev_purpose + " " + solution).lower()
    assert_true("mandatory" in combined or "technical object" in combined,
                "AI understood the mandatory field requirement")
    assert_true("notification" in combined or "maintenance" in combined or "webdynpro" in combined.replace(" ",""),
                "AI references notifications/WO/WebDynpro in purpose/solution")

    # Many placeholders are CDS-view-specific (acl.*, composite.*, sb.*, etc.)
    # and correctly get N/A for a feeder-class enhancement — so count only the
    # core non-CDS fields when checking that the AI did real work.
    core_keys = [p for p in placeholders if not any(
        p.startswith(pfx) for pfx in ("acl.", "composite.", "consumption.", "ext.", "sb.", "sd.", "vh.", "basic.")
    )]
    meaningful_core = sum(
        1 for k in core_keys
        if len(str(filled.get(k, "")).strip()) > 3 and str(filled.get(k, "")).strip() != "N/A"
    )
    assert_true(
        meaningful_core >= len(core_keys) // 2,
        f"At least half of core placeholders filled with real content ({meaningful_core}/{len(core_keys)} core fields)",
    )

    # Print key values for human review
    print("\n  === AI-generated values (key fields) ===")
    for key in ["RIEFID", "ProcessArea", "TechnicalSpecificationTitle",
                "DevelopmentPurpose", "SolutionOverview", "Pseudocode",
                "Enhancement.name", "Enhancement.BADIName", "Name", "date"]:
        val = filled.get(key, "(not present)")
        preview = str(val)[:120].replace("\n", " ")
        print(f"  {key:35s}: {preview}")

except Exception as e:
    fail(f"ask_ai_fill_placeholders raised: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — render_ts_docx
# ─────────────────────────────────────────────────────────────────────────────
print("\n[5] Render TS docx from AI values")
sep()

from core.ts_creation import render_ts_docx

try:
    docx_bytes = render_ts_docx(filled, TEMPLATE)

    assert_true(isinstance(docx_bytes, bytes), "render_ts_docx returns bytes")
    assert_true(len(docx_bytes) > 50_000,      f"Rendered docx is substantial ({len(docx_bytes):,} bytes)")

    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        names = z.namelist()
    assert_true("word/document.xml" in names, "Contains word/document.xml")

    # No unfilled {{...}} in plain-text XML
    all_xml = ""
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        for n in z.namelist():
            if n.endswith(".xml"):
                all_xml += z.read(n).decode("utf-8", errors="replace")
    plain = re.sub(r"<[^>]+>", "", all_xml)
    leftover = re.findall(r"\{\{([^}]+)\}\}", plain)
    assert_true(len(leftover) == 0, f"No unfilled {{{{...}}}} tokens in rendered docx (found: {leftover[:5]})")

    print(f"  Rendered docx: {len(docx_bytes):,} bytes")

except Exception as e:
    fail(f"render_ts_docx raised: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — docx_to_preview_html
# ─────────────────────────────────────────────────────────────────────────────
print("\n[6] Generate HTML preview")
sep()

from core.ts_creation import docx_to_preview_html

try:
    preview_html = docx_to_preview_html(docx_bytes)

    assert_true(isinstance(preview_html, str),                  "Returns a string")
    assert_true('<div class="ts-doc-preview">' in preview_html, "Has ts-doc-preview wrapper")
    assert_true(len(preview_html) > 5_000,                      f"Preview HTML has substantial content ({len(preview_html):,} chars)")
    assert_true("{{" not in preview_html,                        "No raw {{...}} in HTML output")
    assert_true("<table" in preview_html,                        "Contains at least one table")

    # The AI-filled RIEFID value should appear verbatim in preview
    if riefid and riefid != "N/A" and len(riefid) > 2:
        # Partial match since HTML may escape some chars
        short = riefid[:20]
        assert_true(short in preview_html,
                    f"RIEFID value '{short}' appears in HTML preview")

    print(f"  Preview HTML: {len(preview_html):,} characters")

except Exception as e:
    fail(f"docx_to_preview_html raised: {e}")
    import traceback; traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — FastAPI endpoint  /api/ts-creation/generate  (real AI)
# ─────────────────────────────────────────────────────────────────────────────
print("\n[7] FastAPI endpoint POST /api/ts-creation/generate  [REAL AI CALL]")
sep()

try:
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app, raise_server_exceptions=True)

    fs_filename = FS_FILE.name
    resp = client.post(
        "/api/ts-creation/generate",
        files={
            "fs_file": (
                fs_filename,
                fs_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert_true(resp.status_code == 200,
                f"HTTP 200 from endpoint (got {resp.status_code}: {resp.text[:200]})")

    if resp.status_code == 200:
        data = resp.json()
        assert_true("doc_id" in data,           "Response has doc_id")
        assert_true("preview_html" in data,     "Response has preview_html")
        assert_true("placeholder_count" in data,"Response has placeholder_count")
        assert_true(data["placeholder_count"] == len(placeholders),
                    f"placeholder_count matches template ({data['placeholder_count']})")

        preview = data["preview_html"]
        assert_true('<div class="ts-doc-preview">' in preview, "Preview HTML wrapper present")
        assert_true("{{" not in preview,                        "No raw placeholders in preview")

        doc_id = data["doc_id"]
        print(f"\n  doc_id: {doc_id}")
        print(f"  placeholder_count: {data['placeholder_count']}")

        # ── STEP 8: Regenerate ──────────────────────────────────────────────
        print("\n[8] POST /api/ts-creation/regenerate  [REAL AI CALL]")
        sep()
        print("  Regenerating with correction feedback — calling AI...")

        regen_resp = client.post(
            "/api/ts-creation/regenerate",
            json={
                "doc_id": doc_id,
                "feedback": (
                    "The WRICEF ID should clearly show AMS_AM_E0003. "
                    "The Process Area should say 'Asset Management / Plant Maintenance'. "
                    "The Enhancement name should reflect 'Technical Object as Mandatory Field'."
                ),
            },
        )

        assert_true(regen_resp.status_code == 200,
                    f"HTTP 200 from regenerate (got {regen_resp.status_code})")

        if regen_resp.status_code == 200:
            rdata = regen_resp.json()
            assert_true(rdata.get("doc_id") == doc_id,    "doc_id unchanged after regen")
            assert_true("preview_html" in rdata,           "Regen response has preview_html")

            rpreview = rdata["preview_html"]
            assert_true("{{" not in rpreview, "No raw placeholders in regenerated preview")

            # Check the feedback-requested values appear
            rpreview_lower = rpreview.lower()
            assert_true(
                "e0003" in rpreview_lower or "ams" in rpreview_lower or "am_e0003" in rpreview_lower,
                "Regenerated preview reflects the WRICEF ID correction"
            )
            assert_true(
                "asset management" in rpreview_lower or "plant maintenance" in rpreview_lower,
                "Regenerated preview reflects ProcessArea correction"
            )

        # ── STEP 9: Download ────────────────────────────────────────────────
        print("\n[9] GET /api/ts-creation/download/{doc_id}")
        sep()

        dl_resp = client.get(f"/api/ts-creation/download/{doc_id}")
        assert_true(dl_resp.status_code == 200, f"HTTP 200 from download (got {dl_resp.status_code})")

        if dl_resp.status_code == 200:
            ct = dl_resp.headers.get("content-type", "")
            cd = dl_resp.headers.get("content-disposition", "")
            assert_true("wordprocessingml" in ct, f"Correct Content-Type ({ct})")
            assert_true("attachment" in cd,        f"Content-Disposition = attachment ({cd})")
            assert_true(".docx" in cd,             f"Filename ends with .docx ({cd})")
            try:
                zipfile.ZipFile(io.BytesIO(dl_resp.content))
                ok(f"Downloaded file is a valid .docx ({len(dl_resp.content):,} bytes)")
            except zipfile.BadZipFile:
                fail("Downloaded file is NOT a valid zip/docx")
            print(f"  Download filename: {cd}")
            print(f"  Download size:     {len(dl_resp.content):,} bytes")

except ImportError as e:
    fail(f"Could not import TestClient or app: {e}")
except Exception as e:
    fail(f"Endpoint test raised: {e}")
    import traceback; traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print()
sep()
total = PASS + FAIL
print(f"  Results: {PASS}/{total} passed,  {FAIL} failed")
sep()
sys.exit(0 if FAIL == 0 else 1)
