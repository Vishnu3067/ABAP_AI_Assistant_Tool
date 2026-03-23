import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import truststore; truststore.inject_into_ssl()
from dotenv import load_dotenv; load_dotenv(Path(__file__).parent.parent / ".env")
import os, requests, json
from requests_negotiate_sspi import HttpNegotiateAuth

# Test the fixed fetch_whereused helper for the exact test case from the user
from core.sap_client import fetch_whereused

SAP_S59 = os.environ['SAP_URL_S59'].rstrip('/')
s = requests.Session()
s.auth = HttpNegotiateAuth()
s.headers['X-SAP-Client'] = '100'

test_cases = [
    ('/SHL/CL_APP_LOG',                 'Class'),
    ('/SHL/CL_FLOG_RTRN_WORKLST_UTIL', 'Class'),
    ('/SHL/CL_EMAIL_UTL',              'Class'),
]
print("fetch_whereused() results (with fixed CLAS type code):\n")
for oname, otype in test_cases:
    try:
        records = fetch_whereused(s, SAP_S59, oname, otype)
        print(f"  {oname}: {len(records)} record(s)")
        if records:
            # Show unique caller programs
            callers = list({r.get('caller_prog','?') for r in records})[:5]
            print(f"    Sample callers: {callers}")
    except Exception as e:
        print(f"  {oname}: ERROR — {e}")
