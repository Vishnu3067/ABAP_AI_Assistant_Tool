"""
test_reusable_artifacts.py — Quick connectivity test for the Reusable Artifacts API.

Run from the FASTAPI_AI_Tool root:
  python tests/test_reusable_artifacts.py

What this checks:
  1. SAP_URL_S59 is configured in .env
  2. Artifacts_Class endpoint responds and returns JSON
  3. Artifacts_FM endpoint responds and returns JSON
  4. Prints how many artifacts were returned from each endpoint
  5. RAG retrieval debug — compares old chunked vs. new artifact-aware retrieval
"""

import re
import sys
import json
from pathlib import Path

# ── Add project root so core/ imports work ─────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

# ── Load .env from the project root ────────────────────────────────────────
import truststore
truststore.inject_into_ssl()

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

import os
import requests
from requests_negotiate_sspi import HttpNegotiateAuth

SAP_URL_S59 = os.environ.get("SAP_URL_S59", "").rstrip("/")

# ── Helpers ─────────────────────────────────────────────────────────────────

def ok(msg):   print(f"  ✅ {msg}")
def fail(msg): print(f"  ❌ {msg}")
def info(msg): print(f"  ℹ️  {msg}")
def sep():     print("-" * 60)


def test_endpoint(session: requests.Session, label: str, url: str) -> bool:
    print(f"\n[{label}]")
    info(f"URL: {url}")
    try:
        resp = session.get(url, timeout=20)
        info(f"HTTP Status : {resp.status_code}")
        info(f"Content-Type: {resp.headers.get('Content-Type', '(not set)')}")

        if resp.status_code != 200:
            fail(f"Non-200 response. Body (first 500 chars):")
            print(f"    {resp.text[:500]}")
            return False

        # Try parsing as JSON
        try:
            data = resp.json()
        except Exception as e:
            fail(f"Response is NOT valid JSON: {e}")
            info(f"Raw response (first 500 chars): {resp.text[:500]}")
            return False

        # Check OData structure
        if isinstance(data, dict):
            records = data.get("value", data.get("results", []))
            ok(f"Valid JSON response. Records in 'value': {len(records)}")
            if records:
                info(f"First record keys: {list(records[0].keys()) if isinstance(records[0], dict) else '(not a dict)'}")
                info(f"First record sample:")
                sample = {k: v for k, v in list(records[0].items())[:5]} if isinstance(records[0], dict) else records[0]
                for k, v in sample.items():
                    print(f"      {k}: {v}")
            else:
                fail("'value' array is empty — no artifacts found in the catalog.")
            return len(records) > 0
        else:
            fail(f"Unexpected JSON type: {type(data).__name__}")
            return False

    except requests.exceptions.ConnectionError as e:
        fail(f"Connection refused / network error: {e}")
        return False
    except requests.exceptions.Timeout:
        fail("Request timed out (20s). SAP system may be slow or unreachable.")
        return False
    except Exception as e:
        fail(f"Unexpected error: {e}")
        return False


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Reusable Artifacts — S59 API Connectivity Test")
    print("=" * 60)

    # Step 1 — Check config
    print("\n[Config]")
    if not SAP_URL_S59:
        fail("SAP_URL_S59 is not set in .env. Cannot continue.")
        sys.exit(1)
    ok(f"SAP_URL_S59 = {SAP_URL_S59}")

    # Step 2 — Create authenticated session
    print("\n[Session]")
    session = requests.Session()
    session.auth = HttpNegotiateAuth()
    session.headers.update({"X-SAP-Client": "100"})  # S59 uses client 100
    ok("Session created with Windows SSPI (Kerberos/NTLM) auth")

    # Step 3 — Test both endpoints
    base = f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/api_re_artifacts/0001"
    url_class = f"{base}/Artifacts_Class?sap-client=100"
    url_fm    = f"{base}/Artifacts_FM?sap-client=100"

    class_ok = test_endpoint(session, "Artifacts_Class (Classes)", url_class)
    fm_ok    = test_endpoint(session, "Artifacts_FM (Function Modules)", url_fm)

    # Step 4 — RAG retrieval debug (uses the new JSON-native grouped approach)
    if class_ok or fm_ok:
        sep()
        print("\n[RAG Retrieval Debug — retrieve_top_methods]")
        try:
            from core.rag import retrieve_top_methods
            from core.sap_client import fetch_odata_all_pages

            QUERY = "i need to prepare recipients from the email id's"
            info(f"Query: \"{QUERY}\"")

            class_records = fetch_odata_all_pages(session, url_class, SAP_URL_S59,
                                                  headers={"X-SAP-Client": "100"}, timeout=30)
            fm_records    = fetch_odata_all_pages(session, url_fm, SAP_URL_S59,
                                                  headers={"X-SAP-Client": "100"}, timeout=30)
            info(f"Total rows after pagination: {len(class_records)} class, {len(fm_records)} FM")

            top = retrieve_top_methods({"value": class_records}, {"value": fm_records}, QUERY, top_k=5)
            if not top:
                fail("retrieve_top_methods returned NO results — check rag.py")
            else:
                ok(f"Got {len(top)} top method(s):")
                for i, m in enumerate(top):
                    method_label = f" → {m['method']}" if m["method"] else ""
                    print(f"    [{i+1}] {m['type']}: {m['name']}{method_label}")

                # Check if the expected artifact appears
                expected_class  = "/SHL/CL_EMAIL_UTL"
                expected_method = "ADD_RECIPIENTS_WITH_EMAILID"
                found = any(
                    m["name"] == expected_class and m.get("method") == expected_method
                    for m in top
                )
                if found:
                    ok(f"✓ CORRECT — '{expected_class} → {expected_method}' is in the top results!")
                else:
                    fail(f"Expected '{expected_class} → {expected_method}' but it was NOT in top results.")
                    print("\n  Full text of each result for inspection:")
                    for i, m in enumerate(top):
                        print(f"\n  --- Match {i+1}: {m['name']} ---")
                        print(f"  {m['text'][:300]}")

        except Exception as e:
            import traceback
            fail(f"RAG debug failed: {e}")
            traceback.print_exc()

    # Summary
    sep()
    print("\n[Summary]")
    if class_ok and fm_ok:
        ok("Both endpoints reachable and returning data. Reusable Artifacts tool should work.")
    elif not class_ok and not fm_ok:
        fail("Both endpoints failed. Check the SAP_URL_S59 value and whether the OData service is active.")
    else:
        if not class_ok:
            fail("Artifacts_Class failed. Reusable Artifacts tool will raise a 502 error.")
        if not fm_ok:
            fail("Artifacts_FM failed. Reusable Artifacts tool will raise a 502 error.")
    print()


if __name__ == "__main__":
    main()
