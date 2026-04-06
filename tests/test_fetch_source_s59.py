"""
test_fetch_source_s59.py — Diagnose why source fetch returns 0 results.

Tries to fetch /SHL/CL_API_UTL from S59 using both client 110 and 100
so we can see exactly which fails and why.

Run from the FASTAPI_AI_Tool root:
  python tests/test_fetch_source_s59.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import truststore
truststore.inject_into_ssl()

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

import os
import requests
from requests_negotiate_sspi import HttpNegotiateAuth
from urllib.parse import quote

SAP_URL_S59 = os.environ.get("SAP_URL_S59", "").rstrip("/")
SAP_URL_D59 = os.environ.get("SAP_URL_D59", "").rstrip("/")

ARTIFACT_NAME = "/SHL/CL_API_UTL"
ARTIFACT_TYPE = "Class"

def make_session(client: str) -> requests.Session:
    s = requests.Session()
    s.auth = HttpNegotiateAuth()
    s.headers.update({"X-SAP-Client": client})
    return s

def try_fetch(label: str, sap_url: str, client: str):
    print(f"\n{'='*60}")
    print(f"[{label}]  URL={sap_url}  X-SAP-Client={client}")
    if not sap_url:
        print("  ❌ URL not configured in .env — skipping")
        return

    session = make_session(client)
    encoded = quote(ARTIFACT_NAME, safe="")
    url = f"{sap_url}/sap/bc/adt/oo/classes/{encoded}/source/main"
    print(f"  GET {url}")
    try:
        resp = session.get(url, timeout=30)
        print(f"  HTTP {resp.status_code}  ({len(resp.text)} chars)")
        if resp.ok:
            print(f"  ✅ SUCCESS — first 400 chars:")
            print(f"  {resp.text[:400]!r}")
        else:
            print(f"  ❌ FAILED — body:")
            print(f"  {resp.text[:800]}")
    except Exception as e:
        print(f"  ❌ EXCEPTION: {e}")

if __name__ == "__main__":
    print(f"SAP_URL_S59 configured: {'YES' if SAP_URL_S59 else 'NO'}")
    print(f"SAP_URL_D59 configured: {'YES' if SAP_URL_D59 else 'NO'}")

    # Test the four combinations so we can pinpoint the problem
    try_fetch("S59 + client=110 (current bug)", SAP_URL_S59, "110")
    try_fetch("S59 + client=100 (correct)",     SAP_URL_S59, "100")
    try_fetch("D59 + client=110 (old code)",    SAP_URL_D59, "110")
    try_fetch("D59 + client=100",               SAP_URL_D59, "100")

    print(f"\n{'='*60}")
    print("Done.")
