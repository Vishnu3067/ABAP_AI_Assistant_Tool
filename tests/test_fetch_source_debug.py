"""
test_fetch_source_debug.py — Trace the full route logic to find why status != 'ok'.

Runs retrieve_top_methods against real S59 catalog then calls fetch_source
for each top match so we see exactly what type/name/error occurs.

Run from the FASTAPI_AI_Tool root:
  python tests/test_fetch_source_debug.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import truststore
truststore.inject_into_ssl()

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

import requests
from requests_negotiate_sspi import HttpNegotiateAuth

from core.config import SAP_URL_S59, SAP_URL_D59, MAX_FETCHED_CHARS
from core.sap_client import fetch_odata_all_pages, fetch_source
from core.rag import retrieve_top_methods
from core.ai_client import truncate_source

QUESTION = "give me a reusable code for calling an API"

def get_session(client="110") -> requests.Session:
    s = requests.Session()
    s.auth = HttpNegotiateAuth()
    s.headers.update({"X-SAP-Client": client})
    return s

def main():
    session = get_session("110")

    print("1) Fetching catalog from S59...")
    s59_headers = {"X-SAP-Client": "100"}
    url_class = f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/api_re_artifacts/0001/Artifacts_Class?sap-client=100"
    url_fm    = f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/api_re_artifacts/0001/Artifacts_FM?sap-client=100"

    class_records = fetch_odata_all_pages(session, url_class, SAP_URL_S59, headers=s59_headers, timeout=30)
    fm_records    = fetch_odata_all_pages(session, url_fm,    SAP_URL_S59, headers=s59_headers, timeout=30)
    print(f"   Classes: {len(class_records)},  FMs: {len(fm_records)}")

    print(f"\n2) Running RAG for: '{QUESTION}'")
    top_methods = retrieve_top_methods({"value": class_records}, {"value": fm_records}, QUESTION, top_k=5)
    print(f"   {len(top_methods)} matches")
    for i, m in enumerate(top_methods[:5]):
        print(f"   [{i+1}] type={m['type']!r}  name={m['name']!r}  method={m.get('method','')!r}")

    print("\n3) Attempting fetch_source for each top-3 unique artifact (D59, client=110 — current route code)")
    seen = set()
    for m in top_methods[:3]:
        if m["name"] in seen:
            continue
        seen.add(m["name"])
        print(f"\n   fetch_source(D59, type={m['type']!r}, name={m['name']!r})")
        try:
            code = fetch_source(session, SAP_URL_D59, m["type"], m["name"])
            code = truncate_source(code, MAX_FETCHED_CHARS)
            print(f"   ✅ OK — {len(code)} chars")
        except requests.HTTPError as e:
            sc = e.response.status_code if e.response is not None else "?"
            print(f"   ❌ HTTPError {sc} — {e.response.text[:300] if e.response is not None else ''}")
        except Exception as e:
            print(f"   ❌ Exception: {type(e).__name__}: {e}")

    print("\n4) Same but S59, client=110")
    seen = set()
    for m in top_methods[:3]:
        if m["name"] in seen:
            continue
        seen.add(m["name"])
        print(f"\n   fetch_source(S59, type={m['type']!r}, name={m['name']!r})")
        try:
            code = fetch_source(session, SAP_URL_S59, m["type"], m["name"])
            code = truncate_source(code, MAX_FETCHED_CHARS)
            print(f"   ✅ OK — {len(code)} chars")
        except requests.HTTPError as e:
            sc = e.response.status_code if e.response is not None else "?"
            print(f"   ❌ HTTPError {sc} — {e.response.text[:300] if e.response is not None else ''}")
        except Exception as e:
            print(f"   ❌ Exception: {type(e).__name__}: {e}")

if __name__ == "__main__":
    main()
