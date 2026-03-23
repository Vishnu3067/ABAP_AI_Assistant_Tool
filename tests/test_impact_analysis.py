"""
test_impact_analysis.py — Diagnose the Impact Analysis (Where-Used) feature.

Run from the FASTAPI_AI_Tool root:
  python tests/test_impact_analysis.py

What this checks:
  1. SAP_URL_S59 is set in .env
  2. The where-used OData URL is reachable (tries both sap-client=100 and 110)
  3. Prints the raw response so we can see what the server actually returns
  4. Exercises the full fetch_whereused() helper
"""

import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import truststore
truststore.inject_into_ssl()

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

import os
import requests
from urllib.parse import quote
from requests_negotiate_sspi import HttpNegotiateAuth

SAP_URL_S59 = os.environ.get("SAP_URL_S59", "").rstrip("/")
SAP_URL_D59 = os.environ.get("SAP_URL_D59", "").rstrip("/")

# ── Test parameters ───────────────────────────────────────────────────────────
TEST_OBJECT_NAME = "/SHL/CL_FLOG_RTRN_WORKLST_UTIL"
TEST_OBJECT_TYPE_FRIENDLY = "Class"
TEST_OBJECT_TYPE_ADT      = "CLAS"     # short code accepted by the OData endpoint

def ok(msg):   print(f"  \u2705 {msg}")
def fail(msg): print(f"  \u274c {msg}")
def info(msg): print(f"  \u2139\ufe0f  {msg}")
def sep():     print("-" * 70)


def try_whereused_url(session, label, url):
    print(f"\n[{label}]")
    info(f"URL: {url}")
    try:
        resp = session.get(url, timeout=60)
        info(f"HTTP Status  : {resp.status_code}")
        info(f"Content-Type : {resp.headers.get('Content-Type', '(none)')}")
        info(f"Body (first 500 chars): {resp.text[:500]!r}")

        if resp.status_code != 200:
            fail(f"Non-200 response.")
            return False, None

        try:
            data = resp.json()
        except Exception as e:
            fail(f"Response is NOT valid JSON: {e}")
            return False, None

        records = data.get("value", [])
        ok(f"Valid JSON. Records in 'value': {len(records)}")
        if records:
            info(f"First record keys: {list(records[0].keys())}")
            info(f"First record: {json.dumps(records[0], indent=2)[:400]}")
        else:
            info("'value' array is empty — no where-used entries found for this object.")
        return True, records

    except requests.exceptions.ConnectionError as e:
        fail(f"Connection error: {e}")
        return False, None
    except Exception as e:
        fail(f"Unexpected error: {type(e).__name__}: {e}")
        return False, None


def main():
    print("=" * 70)
    print("  Impact Analysis — Where-Used OData Diagnostic Test")
    print("=" * 70)

    # ── Step 1: Config check ─────────────────────────────────────────────────
    print("\n[Config]")
    if not SAP_URL_S59:
        fail("SAP_URL_S59 not set in .env. Cannot continue.")
        sys.exit(1)
    ok(f"SAP_URL_S59 = {SAP_URL_S59}")
    if SAP_URL_D59:
        ok(f"SAP_URL_D59 = {SAP_URL_D59}")
    else:
        info("SAP_URL_D59 not set — will skip source-fetch test")

    # ── Step 2: Session ──────────────────────────────────────────────────────
    print("\n[Session]")
    session = requests.Session()
    session.auth = HttpNegotiateAuth()
    session.headers.update({"X-SAP-Client": "100"})   # S59 = client 100
    ok("Session created with SSPI auth, X-SAP-Client: 100")

    # ── Step 3: Try URL with sap-client=100 ──────────────────────────────────
    sep()
    print("\n[Where-Used: sap-client=100  (expected correct for S59)]")
    encoded_name = quote(TEST_OBJECT_NAME, safe="")
    encoded_type = quote(TEST_OBJECT_TYPE_ADT, safe="")
    base = (
        f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/"
        f"api_re_artifacts/0001/WhereUsed"
        f"(p_objtype='{encoded_type}',p_objname='{encoded_name}')/Set"
    )
    ok100, records100 = try_whereused_url(session, "S59 client=100", base + "?sap-client=100")

    # ── Step 4: Try URL with sap-client=110 (old bug) ────────────────────────
    sep()
    ok110, _ = try_whereused_url(session, "S59 client=110 (old bug path)", base + "?sap-client=110")

    # ── Step 5: Try D59 with client=110 (as MCP server does) ─────────────────
    sep()
    print("\n[Where-Used on D59 — as used in MCP server]")
    if SAP_URL_D59:
        session_d59 = requests.Session()
        session_d59.auth = HttpNegotiateAuth()
        session_d59.headers.update({"X-SAP-Client": "110"})

        encoded_name2 = quote(TEST_OBJECT_NAME, safe="")
        encoded_type2 = quote(TEST_OBJECT_TYPE_ADT, safe="")
        base_d59 = (
            f"{SAP_URL_D59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/"
            f"api_re_artifacts/0001/WhereUsed"
            f"(p_objtype='{encoded_type2}',p_objname='{encoded_name2}')/Set"
        )
        ok_d59, records_d59 = try_whereused_url(session_d59, "D59 client=110", base_d59 + "?sap-client=110")
    else:
        info("SAP_URL_D59 not set — skipping D59 test")
        ok_d59, records_d59 = False, None

    # ── Step 6: Test the helper function itself ───────────────────────────────
    sep()
    print("\n[fetch_whereused() helper — uses sap_client.py]")
    try:
        from core.sap_client import fetch_whereused
        records = fetch_whereused(session, SAP_URL_S59, TEST_OBJECT_NAME, TEST_OBJECT_TYPE_FRIENDLY)
        ok(f"fetch_whereused() returned {len(records)} records")
        if records:
            info(f"First record: {json.dumps(records[0], indent=2)[:400]}")
    except Exception as e:
        fail(f"fetch_whereused() raised: {type(e).__name__}: {e}")
        import traceback; traceback.print_exc()

    # ── Step 6b: Verify route parsing logic (deduplication) ─────────────────
    sep()
    print("\n[Route Parsing Verification — unique_deps deduplication]")
    try:
        from core.sap_client import fetch_whereused
        from routes.impact_analysis import _obj_type_label
        wu = fetch_whereused(session, SAP_URL_S59, TEST_OBJECT_NAME, TEST_OBJECT_TYPE_FRIENDLY)
        seen: set = set()
        unique_deps = []
        for rec in wu:
            name  = (rec.get("caller_prog") or "").strip()
            rtype = (rec.get("caller_type") or "").strip()
            desc  = (rec.get("textline") or "").strip()
            if name and (name, rtype) not in seen:
                seen.add((name, rtype))
                unique_deps.append({"name": name, "raw_type": rtype,
                                    "type": _obj_type_label(rtype), "desc": desc})
        ok(f"{len(wu)} raw records → {len(unique_deps)} unique dependents")
        for d in unique_deps[:5]:
            info(f"  [{d['type']}] {d['name']} — {d['desc']}")
        if len(unique_deps) > 5:
            info(f"  ... and {len(unique_deps) - 5} more")
    except Exception as e:
        fail(f"Parsing verification raised: {type(e).__name__}: {e}")
        import traceback; traceback.print_exc()

    # ── Step 7: Source fetch from D59 ────────────────────────────────────────
    working_records = records_d59 or records100
    if SAP_URL_D59 and working_records:
        sep()
        print("\n[Source Fetch from D59 — first fetchable dependent]")
        session_d59 = requests.Session()
        session_d59.auth = HttpNegotiateAuth()
        session_d59.headers.update({"X-SAP-Client": "110"})

        # Try fetching the primary artifact itself from D59 as a smoke test
        encoded_cls = quote(TEST_OBJECT_NAME, safe="")
        url_src = f"{SAP_URL_D59}/sap/bc/adt/oo/classes/{encoded_cls}/source/main"
        info(f"Fetching: {url_src}")
        try:
            r = session_d59.get(url_src, timeout=20)
            info(f"HTTP Status: {r.status_code}")
            if r.status_code == 200:
                ok(f"Class source fetched — {len(r.text)} chars")
                info(f"First 300 chars: {r.text[:300]!r}")
            else:
                fail(f"Non-200: {r.text[:200]}")
        except Exception as e:
            fail(f"Source fetch error: {e}")

    # ── Summary ───────────────────────────────────────────────────────────────
    sep()
    print("\n[Summary]")
    if ok_d59:
        ok("D59 client=110 works for where-used. The API exists on D59 too.")
        info("ACTION: fetch_whereused() should use SAP_URL_D59 (not S59).")
    if ok100:
        ok("S59 client=100 also works for where-used.")
    if not ok100 and not ok_d59:
        fail("Neither endpoint worked. Check network and OData service activation.")
    if not ok110:
        ok("Confirmed: S59 client=110 fails (HTML login redirect = the original bug).")
    print()


if __name__ == "__main__":
    main()
