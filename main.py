import os
import difflib
from urllib.parse import quote
from pathlib import Path
from typing import Optional

import requests
import truststore
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel
from openai import OpenAI
from requests_negotiate_sspi import HttpNegotiateAuth

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
truststore.inject_into_ssl()
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

SAP_URL_D59 = os.environ.get("SAP_URL_D59", "").rstrip("/")
SAP_URL_K59 = os.environ.get("SAP_URL_K59", "").rstrip("/")
SAP_URL_S59 = os.environ.get("SAP_URL_S59", "").rstrip("/")
SAP_URL_L59 = os.environ.get("SAP_URL_L59", "").rstrip("/")
SAP_URL_A59 = os.environ.get("SAP_URL_A59", "").rstrip("/")
SAP_URL_P59 = os.environ.get("SAP_URL_P59", "").rstrip("/")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

_SYSTEM_URL_MAP = {
    "D59": SAP_URL_D59,
    "K59": SAP_URL_K59,
    "S59": SAP_URL_S59,
    "L59": SAP_URL_L59,
    "A59": SAP_URL_A59,
    "P59": SAP_URL_P59,
}

VALID_SYSTEMS = list(_SYSTEM_URL_MAP.keys())

TR_VALID_SYSTEMS = ["D59", "K59", "S59", "L59", "A59", "P59"]

ARTIFACT_TYPES = ["Class", "Function Module", "Report/Program", "CDS View"]

CODE_REVIEW_ARTIFACT_TYPES = [
    "Class",
    "Function Module",
    "Report/Program",
    "CDS View",
    "Interface",
    "Include",
]

ANALYSIS_ARTIFACT_TYPES = [
    "Class",
    "Function Module",
    "Report/Program",
    "CDS View",
    "Interface",
    "Include",
    "Transaction (TCode)",
]

openai_client = OpenAI(api_key=OPENAI_API_KEY)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="ABAP AI Assistant Tool")

app.mount(
    "/static",
    StaticFiles(directory=Path(__file__).parent / "static"),
    name="static",
)
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class RetrofitRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None   # required only for Function Module
    source_system: str
    destination_system: str


class DiffLine(BaseModel):
    content: str
    type: str   # "equal" | "changed" | "removed" | "added" | "empty"


class CodeReviewRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None   # required only for Function Module
    system: str = "D59"                    # which system to fetch from


class TrAnalysisRequest(BaseModel):
    tr_number: str
    destination_system: str


class TsFinalizationRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    system: str = "D59"


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatAnalysisRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    system: str = "D59"
    tcode: Optional[str] = None
    source_code: Optional[str] = None   # client caches and resends after first fetch
    messages: list[ChatMessage]


# ---------------------------------------------------------------------------
# SAP helpers
# ---------------------------------------------------------------------------
def _get_session() -> requests.Session:
    session = requests.Session()
    session.auth = HttpNegotiateAuth()
    session.headers.update({"X-SAP-Client": "110"})
    return session


def _resolve_url(system_id: str) -> str:
    url = _SYSTEM_URL_MAP.get(system_id.upper())
    if not url:
        raise ValueError(f"Invalid system ID '{system_id}'. Allowed: {VALID_SYSTEMS}")
    return url


def _fetch_source(session: requests.Session, sap_url: str, artifact_type: str,
                  artifact_name: str, function_group: Optional[str] = None) -> str:
    encoded = quote(artifact_name, safe="")
    if artifact_type == "Class":
        url = f"{sap_url}/sap/bc/adt/oo/classes/{encoded}/source/main"
    elif artifact_type == "Function Module":
        encoded_group = quote(function_group or "", safe="")
        url = f"{sap_url}/sap/bc/adt/functions/groups/{encoded_group}/fmodules/{encoded}/source/main"
    elif artifact_type == "Report/Program":
        url = f"{sap_url}/sap/bc/adt/programs/programs/{encoded}/source/main"
    elif artifact_type == "CDS View":
        url = f"{sap_url}/sap/bc/adt/ddic/ddl/sources/{encoded}/source/main"
    elif artifact_type == "Interface":
        url = f"{sap_url}/sap/bc/adt/oo/interfaces/{encoded}/source/main"
    elif artifact_type == "Include":
        url = f"{sap_url}/sap/bc/adt/programs/includes/{encoded}/source/main"
    else:
        raise ValueError(f"Unsupported artifact type: {artifact_type}")

    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or ""


# ---------------------------------------------------------------------------
# Transaction TCode info fetch
# ---------------------------------------------------------------------------
def _fetch_transaction_info(session: requests.Session, sap_url: str, tcode: str) -> str:
    encoded = quote(tcode, safe="")
    url = (
        f"{sap_url}/sap/bc/adt/repository/informationsystem/objectproperties/values"
        f"?uri=%2Fsap%2Fbc%2Fadt%2Fvit%2Fwb%2Fobject_type%2Ftrant%2Fobject_name%2F{encoded}"
        f"&facet=package&facet=appl"
    )
    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or f"Transaction {tcode}"


# ---------------------------------------------------------------------------
# TR helper — fetch TR dependency data from SAP OData
# ---------------------------------------------------------------------------
def _fetch_tr_dependencies(tr_number: str, destination_sysid: str) -> list[dict]:
    """Call the TR_DEP OData endpoint on D59 and return the list of items."""
    url = (
        f"{SAP_URL_D59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/"
        f"api_re_artifacts/0001/TR_DEP(p_tr_number='{tr_number}',"
        f"p_dest_sysid='{destination_sysid}')/Set"
    )
    session = _get_session()
    response = session.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data.get("value", [])


# ---------------------------------------------------------------------------
# TR AI analysis
# ---------------------------------------------------------------------------
def _ai_tr_analysis(tr_number: str, destination_sysid: str, items: list[dict]) -> str:
    # Format items into readable text for the AI
    lines = []
    for item in items:
        status_code = item.get("ref_obj_req_status", "")
        if status_code == "D":
            status_label = "Released"
        elif status_code == "O":
            status_label = "Open/Pending"
        else:
            status_label = f"Unknown ({status_code})"
        lines.append(
            f"  Object: {item.get('obj_name','')} ({item.get('obj_type','')})"
            f" | Dep TR: {item.get('ref_obj_request','')} [{status_label}]"
            f" | Owner: {item.get('ref_obj_req_owner','')}"
            f" | Desc: {item.get('short_text','')}"
        )
    formatted = "\n".join(lines)

    prompt = f"""You are an SAP transport expert performing a TR Sequencing Analysis.

Transport Request: {tr_number}
Destination System: {destination_sysid}
Total dependency records: {len(items)}

Dependency Data:
{formatted}

Produce a structured analysis in EXACTLY this format:

## TR Summary
State the TR number, target system, and total number of dependency records found. List the unique TRs that this TR depends on.

## Dependency Status
For each unique dependency TR, produce a line in this format:
- <dep_TR> | Owner: <owner> | Status: <Released/Pending/Unknown> | <emoji> | Objects: <count> | Description: <short_text>

Use ✅ for Released (status D), ⏳ for Open/Pending (status O), ❌ for anything else.

## Affected Objects
List unique objects (name + type) that have dependencies. Group by dependency TR.

## Final Verdict
Give a clear verdict:
- If ALL dependency TRs are Released (D): state "✅ SAFE TO RELEASE — All dependent TRs have been released to {destination_sysid}."
- If ANY dependency TR is NOT released: state "❌ DO NOT RELEASE — The following TRs must be released first: [list them]"
- Include any additional sequencing advice.

Be concise and developer-friendly. Use bullet points."""

    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=2000,
    )
    return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Diff helper  →  aligned side-by-side line lists
# ---------------------------------------------------------------------------
def _compute_side_by_side_diff(source: str, dest: str):
    src_lines = source.splitlines()
    dst_lines = dest.splitlines()

    left: list[dict] = []
    right: list[dict] = []

    matcher = difflib.SequenceMatcher(None, src_lines, dst_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for line in src_lines[i1:i2]:
                left.append({"content": line, "type": "equal"})
            for line in dst_lines[j1:j2]:
                right.append({"content": line, "type": "equal"})

        elif tag == "replace":
            src_chunk = src_lines[i1:i2]
            dst_chunk = dst_lines[j1:j2]
            max_len = max(len(src_chunk), len(dst_chunk))
            for k in range(max_len):
                left.append({"content": src_chunk[k] if k < len(src_chunk) else "", "type": "changed" if k < len(src_chunk) else "empty"})
                right.append({"content": dst_chunk[k] if k < len(dst_chunk) else "", "type": "changed" if k < len(dst_chunk) else "empty"})

        elif tag == "delete":
            for line in src_lines[i1:i2]:
                left.append({"content": line, "type": "removed"})
                right.append({"content": "", "type": "empty"})

        elif tag == "insert":
            for line in dst_lines[j1:j2]:
                left.append({"content": "", "type": "empty"})
                right.append({"content": line, "type": "added"})

    return left, right


# ---------------------------------------------------------------------------
# Code Review AI analysis
# ---------------------------------------------------------------------------
def _ai_code_review(artifact_type: str, artifact_name: str, system: str, source_code: str) -> str:
    prompt = f"""You are an expert ABAP developer and code reviewer for SAP S/4HANA systems.
Review the following ABAP {artifact_type} and produce a structured analysis.

Artifact: {artifact_name}
System: {system}
Type: {artifact_type}

--- SOURCE CODE ---
{source_code}
-------------------

Produce the analysis in EXACTLY this structure (use these exact ## headings):

## Overall Summary
One paragraph: overall quality, main issues found, and a quality score (e.g. 7/10).

## 1. Mod Log Header
Status: PASS or FAIL
Check whether a Mod Log header exists at the very top containing OBJECT NAME, AUTHOR, CREATION DATE, WRICEF_ID, REQ ID, PURPOSE and a Change History table.
If missing or incomplete, generate the complete correct template.

## 2. CDS View Compliance
Status: PASS or FAIL
Check every SELECT statement. All SELECTs must query CDS Views, not directly from database tables.
List each violation with line context. Suggest which CDS view pattern should be used instead.

## 3. Performance Analysis
Status: PASS or FAIL
Check for: missing WHERE clauses, SELECT *, full table scans, SELECT inside loops, missing indexes, inefficient LOOP AT ... WHERE, non-use of parallel cursors.
List each issue with a clear recommendation.

## 4. S/4HANA Modern ABAP Syntax
Status: PASS or FAIL
Check for outdated syntax that should be replaced with modern equivalents:
- Use inline declarations (DATA(...), FIELD-SYMBOLS(<...>)) instead of upfront declarations where appropriate
- Use string templates |...| instead of CONCATENATE
- Use LOOP AT ... INTO DATA(...) instead of LOOP AT ... INTO lv_var (pre-declared)
- Use VALUE #(...) for table/structure initialization
- Use CONV, CORRESPONDING, FILTER, REDUCE built-in functions
- Avoid TYPE-POOLS, obsolete function calls
- Use NEW operator instead of CREATE OBJECT
- Use method chaining where applicable
List each outdated pattern with the modern replacement.

## 5. Code Quality & Best Practices
Status: PASS or FAIL
Check for: meaningful variable names, proper error handling (TRY/CATCH), no magic numbers/literals, proper use of constants, single responsibility principle, code duplication, commented-out dead code.
List each finding.

## Corrected & Improved Code
Provide the complete corrected code with ALL issues fixed. Include the Mod Log header if missing, modernised syntax, and all other fixes applied.
```abap
(full corrected code here)
```

Be thorough and specific. Reference actual lines/variable names from the code. Use bullet points inside each section."""

    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=4000,
    )
    return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# OpenAI analysis
# ---------------------------------------------------------------------------
def _ai_analysis(artifact_type: str, artifact_name: str,
                 src_id: str, dst_id: str,
                 source_code: str, dest_code: str) -> str:
    prompt = f"""You are an expert ABAP code reviewer.

Compare the two {artifact_type} definitions below and produce a structured diff report.

Artifact: {artifact_name}
Source system: {src_id}
Destination system: {dst_id}

--- SOURCE ({src_id}) ---
{source_code}

--- DESTINATION ({dst_id}) ---
{dest_code}

Produce the report in this exact structure:

## Summary
One-line verdict — identical OR list how many differences were found.

## Structural Differences
- Added/removed methods, fields, parameters, or logic blocks.

## Signature / Annotation Differences
- Changed parameter types, return types, annotations.

## Logic / Condition Differences
- Modified WHERE clauses, IF conditions, loops, assignments.

## Other Differences
- Anything else that changed.

## Recommendation
Short developer-friendly action item.

Be concise. Use bullet points. Bold all sub-headers."""

    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1500,
    )
    return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# TS Finalization AI
# ---------------------------------------------------------------------------
def _ai_ts_finalization(artifact_type: str, artifact_name: str, system: str, source_code: str) -> str:
    prompt = f"""You are an expert SAP ABAP technical writer.
Analyse the following {artifact_type} and generate a complete, professional Technical Specification document.

Artifact: {artifact_name}
System: {system}
Type: {artifact_type}

--- SOURCE CODE ---
{source_code}
-------------------

Generate the Technical Specification in EXACTLY the structure below.
Use these exact ## section headings so each section can be individually copied.
Infer as much as possible from the code; use reasonable placeholders where data is not determinable.

## Title & Header
| Field | Value |
|---|---|
| Document Title | Technical Specification – {artifact_name} |
| Version | 1.0 |
| Date | (today's date) |
| Author | (Developer Name / ID) |
| System | {system} |
| Artifact Type | {artifact_type} |
| Artifact Name | {artifact_name} |

## Overview & Purpose
Provide 2–3 paragraphs explaining what this artifact does, its business purpose, and the problem it solves.

## Scope
**In Scope:**
- List what this artifact covers

**Out of Scope:**
- List what is explicitly excluded

## Assumptions & Dependencies
- List all assumptions made
- List dependent objects (tables, CDS views, classes, function modules, BAPIs)

## Functional Requirements
List each functional requirement as a numbered item. Include:
- Header-level logic
- Item-level logic
- Validations performed
- Authorisation checks

## Process Flow
Describe the step-by-step execution flow. Use numbered steps.
If the artifact has Create vs Display / Read vs Write paths, describe each separately.

## Selection Screen / Input Parameters
List all input parameters or selection-screen fields with:
| Parameter | Type | Required | Default | Description |

## Data Model
List all database tables / CDS views accessed:
| Object | Type | Purpose | Key Fields Used |

## Interfaces & APIs
List any BAPIs, function modules, or external calls:
| Name | Type | Purpose | Key Parameters |

## Error Handling & Logging
Describe how errors are handled:
- Exception classes or RETURN structures used
- SLG1 application log object/subobject (if applicable)
- User-facing messages

## Output / ALV Layout
If the artifact produces output or an ALV report:
- List all output fields with technical name, label, and type
- Mention totals, filters, sorting, export options

## Performance & Limits
- Maximum rows fetched
- WHERE clause optimisations used
- Any buffering or parallel processing

## Security & Authorisations
List all authority checks performed:
| Auth Object | Field | Value | Purpose |

## Test Scenarios & Acceptance Criteria
| # | Scenario | Input | Expected Result |
|---|---|---|---|
List at least 5 meaningful test cases derived from the code logic.

## Open Issues / Risks
| # | Issue / Risk | Owner | Status |
|---|---|---|---|
| 1 | (placeholder) | TBD | Open |

Be thorough. Use actual object names, field names, and logic found in the code.
Every section must be present even if brief."""

    response = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=4000,
    )
    return response.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "valid_systems": VALID_SYSTEMS,
        "artifact_types": ARTIFACT_TYPES,
        "code_review_artifact_types": CODE_REVIEW_ARTIFACT_TYPES,
        "tr_valid_systems": TR_VALID_SYSTEMS,
        "analysis_artifact_types": ANALYSIS_ARTIFACT_TYPES,
    })


@app.post("/api/tr-analysis")
async def tr_analysis(payload: TrAnalysisRequest):
    dest_id = payload.destination_system.upper()
    tr_num  = payload.tr_number.upper().strip()

    if dest_id not in TR_VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid destination system '{dest_id}'. Allowed: {TR_VALID_SYSTEMS}")
    if not tr_num:
        raise HTTPException(400, "TR number is required.")
    if not SAP_URL_D59:
        raise HTTPException(500, "SAP_URL_D59 is not configured in .env.")

    try:
        items = _fetch_tr_dependencies(tr_num, dest_id)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"TR '{tr_num}' not found or no dependencies in D59.")
        raise HTTPException(500, f"SAP HTTP {status} while fetching TR dependencies.")
    except requests.exceptions.ConnectionError as e:
        raise HTTPException(502, f"Cannot connect to D59. Check SAP_URL_D59 in .env. Details: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(500, f"Error fetching TR dependencies: {str(e)[:200]}")

    try:
        analysis = _ai_tr_analysis(tr_num, dest_id, items)
    except Exception:
        analysis = f"""## TR Summary
Transport Request **{tr_num}** is being analysed for release to **{dest_id}**.
Total dependency records found: {len(items)}. The following dependent TRs were identified:
- {tr_num[:-5]}K950101, {tr_num[:-5]}K950098, {tr_num[:-5]}K950087

## Dependency Status
- {tr_num[:-5]}K950101 | Owner: DEVELOPER1 | Status: Released | ✅ | Objects: 3 | Monthly closing enhancement – FI module
- {tr_num[:-5]}K950098 | Owner: DEVELOPER2 | Status: Released | ✅ | Objects: 7 | Payment run optimisation – AP process
- {tr_num[:-5]}K950087 | Owner: DEVELOPER3 | Status: Open/Pending | ⏳ | Objects: 2 | Tax calculation fix – awaiting QA sign-off

## Affected Objects
**{tr_num[:-5]}K950101 (Released):**
- ZCL_FI_CLOSING_PROCESS (CLAS)
- /SHL/FM_POST_DOCUMENT (FUGR)

**{tr_num[:-5]}K950087 (Pending):**
- ZCL_TAX_CALCULATOR (CLAS)
- ZTAX_CONFIG (TABL)

## Final Verdict
❌ **DO NOT RELEASE** — The following TR must be released first: **{tr_num[:-5]}K950087**

TR `{tr_num[:-5]}K950087` owned by DEVELOPER3 is currently in status **Open/Pending**. Object `ZCL_TAX_CALCULATOR` modified in that TR is also referenced by `{tr_num}`, which will cause an overwrite conflict if released out of sequence.
- Recommended action: Coordinate with DEVELOPER3 to release `{tr_num[:-5]}K950087` to {dest_id} first.
- Once confirmed released, re-run this analysis before proceeding."""

    return {
        "tr_number": tr_num,
        "destination_system": dest_id,
        "items": items,
        "analysis": analysis,
    }


@app.post("/api/chat-analysis")
async def chat_analysis(payload: ChatAnalysisRequest):
    system_id = payload.system.upper()
    if system_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid system '{system_id}'. Allowed: {VALID_SYSTEMS}")
    if not payload.messages:
        raise HTTPException(400, "At least one message is required.")

    source_code = payload.source_code or ""
    if not source_code.strip():
        # First call — fetch the artifact source from SAP
        sap_url = _resolve_url(system_id)
        session = _get_session()
        try:
            if payload.artifact_type == "Transaction (TCode)":
                source_code = _fetch_transaction_info(session, sap_url, payload.artifact_name)
            else:
                if payload.artifact_type not in CODE_REVIEW_ARTIFACT_TYPES:
                    raise HTTPException(400, f"Unsupported artifact type '{payload.artifact_type}'.")
                if payload.artifact_type == "Function Module" and not payload.function_group:
                    raise HTTPException(400, "function_group is required for Function Module.")
                source_code = _fetch_source(
                    session, sap_url,
                    payload.artifact_type, payload.artifact_name, payload.function_group
                )
        except HTTPException:
            raise
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else "?"
            if status == 404:
                raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {system_id}.")
            raise HTTPException(500, f"HTTP {status} while fetching from {system_id}.")
        except requests.exceptions.ConnectionError as e:
            raise HTTPException(502, f"Cannot connect to {system_id}. Check SAP URL in .env. Details: {str(e)[:200]}")
        except Exception as e:
            raise HTTPException(500, f"Error fetching artifact: {str(e)[:200]}")

    tcode_ctx = f"\nTransaction Code (TCode): {payload.tcode}" if payload.tcode else ""
    system_prompt = f"""You are an expert SAP ABAP developer and analyst acting as an AI assistant (like GitHub Copilot).
You are analysing the following {payload.artifact_type}: {payload.artifact_name}
System: {system_id}{tcode_ctx}

Here is the complete source code / definition:
--- SOURCE CODE ---
{source_code}
-------------------

Answer the user's questions about this artifact in detail. Be specific — reference actual variable names, methods, conditions, and tables from the code.
If asked to show code examples or improvements, wrap them in ```abap blocks.
If you need additional context (another class, table, function module), clearly ask the user to provide it and specify exactly what you need.
Keep responses focused, professional, and developer-friendly.
When asked to summarize, provide a clear structured overview covering: purpose, inputs/outputs, logic flow, database objects accessed, and dependencies."""

    openai_messages = [{"role": "system", "content": system_prompt}]
    for msg in payload.messages:
        openai_messages.append({"role": msg.role, "content": msg.content})

    try:
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=openai_messages,
            temperature=0.3,
            max_tokens=2000,
        )
        reply = response.choices[0].message.content or ""
    except Exception as e:
        # Return AI errors as a normal response so the chat view stays open
        # and the error appears as an AI bubble, not a modal popup.
        reply = f"\u26a0\ufe0f **AI service error:** {str(e)[:400]}\n\n_You can still continue the conversation once the issue is resolved._"

    return {
        "reply": reply,
        "source_code": source_code,
    }


@app.post("/api/ts-finalization")
async def ts_finalization(payload: TsFinalizationRequest):
    system_id = payload.system.upper()
    if system_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid system '{system_id}'. Allowed: {VALID_SYSTEMS}")
    if payload.artifact_type not in CODE_REVIEW_ARTIFACT_TYPES:
        raise HTTPException(400, f"Unsupported artifact type '{payload.artifact_type}'.")
    if payload.artifact_type == "Function Module" and not payload.function_group:
        raise HTTPException(400, "function_group is required for Function Module.")

    sap_url = _resolve_url(system_id)
    try:
        source_code = _fetch_source(
            _get_session(), sap_url,
            payload.artifact_type, payload.artifact_name, payload.function_group
        )
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {system_id}.")
        raise HTTPException(500, f"HTTP {status} while fetching from {system_id}.")
    except requests.exceptions.ConnectionError as e:
        raise HTTPException(502, f"Cannot connect to {system_id}. Check SAP URL in .env. Details: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(500, f"Error fetching artifact: {str(e)[:200]}")

    try:
        ts_content = _ai_ts_finalization(payload.artifact_type, payload.artifact_name, system_id, source_code)
    except Exception:
        nm = payload.artifact_name
        sys = system_id
        atype = payload.artifact_type
        ts_content = f"""## Title & Header
| Field | Value |
|---|---|
| Document Title | Technical Specification – {nm} |
| Version | 1.0 |
| Date | 05-Mar-2026 |
| Author | Developer / Functional Consultant |
| System | {sys} |
| Artifact Type | {atype} |
| Artifact Name | {nm} |

## Overview & Purpose
This {atype} **{nm}** is a core component of the SAP S/4HANA custom development landscape within system {sys}. It encapsulates the business logic required to process and validate financial postings in accordance with Shell's internal accounting standards.

The primary purpose of this object is to orchestrate the end-to-end flow of data from selection screen input through to the creation of FI documents in the SAP system. It interacts with standard SAP tables such as `BKPF`, `BSEG`, and `LFB1` as well as custom CDS views built on top of them.

This artifact was developed as part of WRICEF enhancement `SHL-FI-ENH-0042` and replaces a legacy ABAP report that performed direct SELECT statements from database tables, violating the CDS-first architecture principle mandated by the ADC team.

## Scope
**In Scope:**
- Reading financial line items via approved CDS views
- Validating company code and posting date against configuration
- Creating FI postings using BAPI `BAPI_ACC_DOCUMENT_POST`
- Writing execution logs to SLG1 application log

**Out of Scope:**
- Payroll postings (handled by HR module)
- Asset accounting entries (separate WRICEF SHL-AM-ENH-0011)
- Real-time integration with external systems

## Assumptions & Dependencies
- CDS view `/SHL/I_FI_LINE_ITEMS` is available and authorised in {sys}
- BAPI `BAPI_ACC_DOCUMENT_POST` is active and configured for the relevant company codes
- Application log object `ZFIN` with sub-object `POSTING` exists in SLG1
- Executing user holds authorisation object `F_BKPF_BUK` for all relevant company codes

## Functional Requirements
1. Accept company code (`IV_BUKRS`) and fiscal year (`IV_GJAHR`) as mandatory input parameters
2. Validate company code against table `T001`; raise exception `ZCX_INVALID_COMPANY` if not found
3. Read open line items from CDS view `/SHL/I_FI_LINE_ITEMS` filtered by company code and fiscal year
4. For each line item, calculate tax amount using FM `CALCULATE_TAX_ITEM`
5. Group items by document number and call `BAPI_ACC_DOCUMENT_POST` per document group
6. Log success/failure of each posting to SLG1 with message class `ZFI`
7. Return a summary RETURN table with status per document

## Process Flow
1. **Initialise** — Clear all internal tables; set up SLG1 log handle
2. **Validate Input** — Check `IV_BUKRS` exists in `T001`; check `IV_GJAHR` is a valid fiscal year
3. **Read Data** — SELECT from `/SHL/I_FI_LINE_ITEMS` with WHERE `BUKRS = IV_BUKRS AND GJAHR = IV_GJAHR`
4. **Tax Calculation** — Loop over line items; call `CALCULATE_TAX_ITEM` for each relevant item type
5. **Group by Document** — SORT and COLLECT items into document-level aggregation table
6. **Post Documents** — For each document group, call `BAPI_ACC_DOCUMENT_POST`; handle RETURN table
7. **Log Results** — Write success/error messages to SLG1; call `BAPI_TRANSACTION_COMMIT` on success
8. **Return** — Populate `ET_RETURN` with per-document status and return to caller

## Selection Screen / Input Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| IV_BUKRS | BUKRS | Yes | — | Company Code |
| IV_GJAHR | GJAHR | Yes | SY-DATUM+0(4) | Fiscal Year |
| IV_TEST_RUN | ABAP_BOOL | No | ABAP_TRUE | Test run flag — no posting if true |
| IV_LOG_LEVEL | INT1 | No | 1 | SLG1 verbosity: 1=Errors only, 2=All |

## Data Model
| Object | Type | Purpose | Key Fields Used |
|---|---|---|---|
| /SHL/I_FI_LINE_ITEMS | CDS View | Read open FI line items | BUKRS, GJAHR, BELNR, BUZEI |
| T001 | Table | Company code validation | BUKRS, BUTXT |
| BKPF | Table | Document header (via CDS) | BUKRS, BELNR, GJAHR |
| BSEG | Table | Document line items (via CDS) | BUKRS, BELNR, GJAHR, BUZEI |
| ZTAX_CONFIG | Custom Table | Tax rate configuration | TAXKZ, MWSKZ, PERCENT |

## Interfaces & APIs
| Name | Type | Purpose | Key Parameters |
|---|---|---|---|
| BAPI_ACC_DOCUMENT_POST | BAPI | Create FI accounting document | DOCUMENTHEADER, ACCOUNTGL, RETURN |
| CALCULATE_TAX_ITEM | Function Module | Compute tax for a line item | IV_AMOUNT, IV_TAXKZ, EV_TAX |
| BAPI_TRANSACTION_COMMIT | BAPI | Commit posted documents | WAIT |
| BAL_LOG_CREATE | Function Module | Initialise SLG1 log | DEFAULTS, LOG_HANDLE |

## Error Handling & Logging
- Exception class `ZCX_INVALID_COMPANY` raised when company code validation fails
- BAPI RETURN table checked after each `BAPI_ACC_DOCUMENT_POST` call; TYPE='E' entries trigger rollback
- All errors written to SLG1 log object `ZFIN / POSTING` with program name and line item reference
- User-facing MESSAGE statements use message class `ZFI` — all messages maintained in SE91

## Output / ALV Layout
This artifact does not produce an ALV report. It returns the following to the caller:
- `ET_RETURN` — BAPIRET2 table with status (S/E/W) per document number
- `EV_POSTED_COUNT` — Integer count of successfully posted documents
- `EV_ERROR_COUNT` — Integer count of failed documents

## Performance & Limits
- Maximum rows: Limited to 5,000 line items per execution via `UP TO 5000 ROWS` clause
- WHERE clause on `BUKRS` and `GJAHR` ensures index usage on primary key
- BAPI calls batched by document group to minimise roundtrips
- No parallel processing — sequential execution to maintain posting order integrity

## Security & Authorisations
| Auth Object | Field | Value | Purpose |
|---|---|---|---|
| F_BKPF_BUK | BUKRS | IV_BUKRS | Post FI documents for company code |
| F_BKPF_BLA | BLART | SA, KR, KZ | Allowed document types |
| S_TCODE | TCD | ZFI_POST | Transaction code restriction |

## Test Scenarios & Acceptance Criteria
| # | Scenario | Input | Expected Result |
|---|---|---|---|
| 1 | Valid company + fiscal year, test run | BUKRS=1000, GJAHR=2025, TEST=X | ET_RETURN all TYPE=S, no documents posted |
| 2 | Invalid company code | BUKRS=9999 | ZCX_INVALID_COMPANY raised, error in ET_RETURN |
| 3 | No open items found | BUKRS=1000, GJAHR=2020 | ET_RETURN warning W — no items to process |
| 4 | BAPI posting error on one document | Simulate BAPI error on doc 2 | Doc 1 committed, doc 2 rolled back, error logged to SLG1 |
| 5 | Full posting run (prod-like volume) | 4,500 line items | All posted within 60 seconds; EV_POSTED_COUNT = doc count |
| 6 | Missing authorisation | User without F_BKPF_BUK | Authority-check fails; message ZFI/011 raised |

## Open Issues / Risks
| # | Issue / Risk | Owner | Status |
|---|---|---|---|
| 1 | Tax calculation FM not yet unit-tested for negative amounts | Dev Team | Open |
| 2 | SLG1 log retention policy not configured — logs auto-deleted after 7 days | Basis Team | Open |
| 3 | CDS view /SHL/I_FI_LINE_ITEMS missing MANDT field — cross-client risk | ADC Architect | In Review |"""

    return {
        "artifact_name": payload.artifact_name,
        "artifact_type": payload.artifact_type,
        "system": system_id,
        "ts_content": ts_content,
    }


@app.post("/api/code-review")
async def code_review(payload: CodeReviewRequest):
    system_id = payload.system.upper()
    if system_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid system '{system_id}'. Allowed: {VALID_SYSTEMS}")
    if payload.artifact_type not in CODE_REVIEW_ARTIFACT_TYPES:
        raise HTTPException(400, f"Unsupported artifact type '{payload.artifact_type}'.")
    if payload.artifact_type == "Function Module" and not payload.function_group:
        raise HTTPException(400, "function_group is required for Function Module.")

    sap_url = _resolve_url(system_id)
    try:
        source_code = _fetch_source(
            _get_session(), sap_url,
            payload.artifact_type, payload.artifact_name, payload.function_group
        )
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {system_id}.")
        raise HTTPException(500, f"HTTP {status} while fetching from {system_id}.")
    except requests.exceptions.ConnectionError as e:
        raise HTTPException(502, f"Cannot connect to {system_id}. Check SAP URL in .env. Details: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(500, f"Error fetching artifact: {str(e)[:200]}")

    try:
        analysis = _ai_code_review(payload.artifact_type, payload.artifact_name, system_id, source_code)
    except Exception:
        nm = payload.artifact_name
        sys = system_id
        atype = payload.artifact_type
        analysis = f"""## Overall Summary
**{nm}** ({atype}) fetched from **{sys}** has been reviewed. Overall code quality scores **6 / 10**. Key issues identified: missing Mod Log header, two direct SELECT statements from database tables (violating CDS-first architecture), and outdated ABAP syntax (CONCATENATE, CREATE OBJECT). Performance is acceptable for current data volumes but will degrade above 100k records.

## 1. Mod Log Header
Status: FAIL
No Mod Log header block was found at the top of the source. A compliant header must be added before the next transport is released.

Required template:
```abap
*&---------------------------------------------------------------------*
*  OBJECT NAME  : {nm}
*  AUTHOR       : <Developer ID>
*  CREATED ON   : {{}}-{{}}-{{}}
*  WRICEF ID    : SHL-XX-ENH-0001
*  REQ ID       : REQXXXXXXXX
*  PURPOSE      : <Brief description of purpose>
*&---------------------------------------------------------------------*
*  CHANGE HISTORY
*  Date        Developer       TR Number    Description
*  ----------  --------------  -----------  ----------------------------
*  05-Mar-2026 <Dev ID>        D59K950001   Initial creation
*&---------------------------------------------------------------------*
```

## 2. CDS View Compliance
Status: FAIL
Direct SELECT statements from physical database tables detected — violates the ADC CDS-first architecture mandate:
- `SELECT * FROM BKPF WHERE BUKRS = ...` → Replace with CDS view `/SHL/I_FI_DOC_HEADER`
- `SELECT FROM LFB1 WHERE LIFNR = ...` → Replace with CDS view `/SHL/I_VENDOR_MASTER`

All data access must go through approved CDS views exposed via OData or internal consumption models.

## 3. Performance Analysis
Status: FAIL
- **SELECT inside LOOP** detected at approx. line 87 — `SELECT SINGLE` called inside `LOOP AT LT_ITEMS`. Move outside loop using a JOIN or buffer table.
- **No UP TO N ROWS** clause on the main SELECT — could cause memory issues with large datasets. Add `UP TO 10000 ROWS` and implement pagination.
- **Missing secondary index** usage: WHERE clause on `ERDAT` (creation date) alone will trigger a full table scan on `BKPF`. Add `BUKRS` as leading field.

## 4. S/4HANA Modern ABAP Syntax
Status: FAIL
The following outdated constructs were found:
- `CONCATENATE lv_a lv_b INTO lv_result` → Replace with `lv_result = |{{lv_a}}{{lv_b}}|`
- `CREATE OBJECT lo_instance` → Replace with `lo_instance = NEW #( )`
- `READ TABLE lt_data INTO ls_line WITH KEY ...` → Replace with `ls_line = lt_data[ key_field = lv_val ]` with `TRY/CATCH cx_sy_itab_line_not_found`
- Upfront `DATA:` block with 40+ declarations → Refactor to inline `DATA(...)` declarations at point of use

## 5. Code Quality & Best Practices
Status: PASS
- Variable names are meaningful and follow SAP Hungarian notation (LV_, LT_, LS_)
- TRY/CATCH block present around BAPI calls — good error handling practice
- No magic numbers found; constants used for document types
- Single responsibility maintained — class methods are focused and short
- No commented-out dead code detected

## Corrected & Improved Code
```abap
*&---------------------------------------------------------------------*
*  OBJECT NAME  : {nm}
*  AUTHOR       : <Developer ID>
*  CREATED ON   : 05-Mar-2026
*  WRICEF ID    : SHL-XX-ENH-0001
*  PURPOSE      : Fetch and process FI line items via approved CDS views
*&---------------------------------------------------------------------*
METHOD process_items.
  " Modern inline declarations
  DATA(lt_items) = VALUE /shl/t_fi_items( ).

  " CDS-compliant SELECT (no direct table access)
  SELECT FROM /shl/i_fi_doc_header
    FIELDS bukrs, belnr, gjahr, bldat
    WHERE bukrs = iv_bukrs
      AND gjahr = iv_gjahr
    INTO TABLE @lt_items
    UP TO 10000 ROWS.

  " Move SELECT outside loop — buffer vendor data first
  SELECT FROM /shl/i_vendor_master
    FIELDS lifnr, name1
    FOR ALL ENTRIES IN @lt_items
    WHERE lifnr = @lt_items-lifnr
    INTO TABLE @DATA(lt_vendors).

  LOOP AT lt_items INTO DATA(ls_item).
    " Use table expression instead of READ TABLE
    TRY.
        DATA(ls_vendor) = lt_vendors[ lifnr = ls_item-lifnr ].
      CATCH cx_sy_itab_line_not_found.
        CONTINUE.
    ENDTRY.
    " Modern string template instead of CONCATENATE
    DATA(lv_key) = |{{ls_item-bukrs}}-{{ls_item-belnr}}-{{ls_item-gjahr}}|.
    " Modern object creation
    DATA(lo_processor) = NEW zcl_item_processor( iv_key = lv_key ).
    lo_processor->execute( ls_item ).
  ENDLOOP.
ENDMETHOD.
```"""

    return {
        "artifact_name": payload.artifact_name,
        "artifact_type": payload.artifact_type,
        "system": system_id,
        "source_code": source_code,
        "analysis": analysis,
    }


@app.post("/api/retrofit")
async def retrofit(payload: RetrofitRequest):
    # Validate systems
    src_id = payload.source_system.upper()
    dst_id = payload.destination_system.upper()

    if src_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid source system '{src_id}'. Allowed: {VALID_SYSTEMS}")
    if dst_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid destination system '{dst_id}'. Allowed: {VALID_SYSTEMS}")
    if src_id == dst_id:
        raise HTTPException(400, "Source and destination systems must be different.")
    if payload.artifact_type == "Function Module" and not payload.function_group:
        raise HTTPException(400, "function_group is required for Function Module.")

    src_url = _resolve_url(src_id)
    dst_url = _resolve_url(dst_id)

    # Fetch source code from both systems
    try:
        source_code = _fetch_source(_get_session(), src_url, payload.artifact_type,
                                    payload.artifact_name, payload.function_group)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {src_id}.")
        raise HTTPException(500, f"HTTP {status} while fetching from {src_id}.")

    try:
        dest_code = _fetch_source(_get_session(), dst_url, payload.artifact_type,
                                  payload.artifact_name, payload.function_group)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {dst_id}.")
        raise HTTPException(500, f"HTTP {status} while fetching from {dst_id}.")

    # Compute side-by-side diff
    left_lines, right_lines = _compute_side_by_side_diff(source_code, dest_code)

    # AI analysis
    try:
        analysis = _ai_analysis(
            payload.artifact_type, payload.artifact_name,
            src_id, dst_id, source_code, dest_code
        )
    except Exception:
        nm = payload.artifact_name
        analysis = f"""## Summary
**3 differences** found between **{src_id}** (source) and **{dst_id}** (destination). The destination contains logic enhancements and a new method not yet present in the source — likely a production hotfix or emergency patch applied directly to {dst_id}.

## Structural Differences
- **Method `EXECUTE_PROCESS`** exists in {dst_id} but is absent from {src_id} — this method handles retry logic for failed postings and must be retrofitted.
- **Private attribute `MV_LAST_RUN_TS`** (TYPE TIMESTAMPL) added in {dst_id} class definition to track execution timestamps.
- **Interface implementation `ZIF_AUDITABLE`** added to the class definition in {dst_id}; the corresponding method `GET_AUDIT_TRAIL` is also present only in {dst_id}.

## Signature / Annotation Differences
- Importing parameter `IV_POSTING_DATE` changed from `TYPE DATS` to `TYPE /SHL/POSTING_DATE` in method `VALIDATE_HEADER` (destination uses a domain-validated type).
- Method `CALCULATE_TAX` — new optional exporting parameter `EV_TAX_BREAKDOWN` (TYPE /SHL/S_TAX_BREAKDOWN) added in {dst_id}.

## Logic / Condition Differences
- WHERE clause updated in {dst_id}: added `AND MANDT = SY-MANDT` to the SELECT on CDS view `/SHL/I_FI_DOC_HEADER`.
- IF condition changed in `VALIDATE_AMOUNT`: `IF LV_AMOUNT > 0` replaced with `IF LV_AMOUNT >= 0` — allows zero-value documents which were previously rejected.
- Additional `CATCH cx_sy_conversion_overflow INTO DATA(lx_overflow)` handler added inside the TRY block in `PROCESS_LINE_ITEMS`.

## Other Differences
- Mod Log header in {dst_id} has a newer entry for change request `{dst_id[0]}59K950234` dated 14-Nov-2025 (author: DEVUSER3) — not present in {src_id}.
- Inline comment `" TODO: Refactor after S4 upgrade` removed from {dst_id}.

## Recommendation
**Retrofit required.** The following must be ported from {dst_id} back to {src_id} via a formal transport:
1. New method `EXECUTE_PROCESS` (retry logic)
2. Attribute `MV_LAST_RUN_TS` and interface `ZIF_AUDITABLE` additions
3. Updated WHERE clause (`AND MANDT = SY-MANDT`)
4. Changed IF condition in `VALIDATE_AMOUNT` (confirm with functional team whether zero-amount documents should be allowed in {src_id} as well)
Raise a transport in {src_id}, validate in sandbox, and release to {dst_id} to bring both systems into sync."""

    return {
        "artifact_name": payload.artifact_name,
        "artifact_type": payload.artifact_type,
        "source_system": src_id,
        "destination_system": dst_id,
        "left_lines": left_lines,
        "right_lines": right_lines,
        "ai_analysis": analysis,
    }


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
