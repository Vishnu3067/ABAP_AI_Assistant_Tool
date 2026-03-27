# ABAP AI Assistant Tool

A browser-based web application built with **FastAPI** that empowers SAP ABAP developers to analyse, compare, review, and document ABAP artifacts — without needing Eclipse, SE80, or SAP GUI.

The tool connects to multiple SAP systems via **Windows SSPI (Kerberos) authentication** and uses an **OpenAI-powered AI API** to deliver intelligent analysis, structured reports, and code improvements.

> All custom ABAP objects in this SAP landscape follow the naming convention: `/SHL/`

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Retrofit Tool** | Side-by-side diff comparison of an ABAP artifact across two SAP systems with AI-powered change analysis |
| 2 | **AI DRAD** | Search the artifact catalog, fetch live ABAP source from H94/K94, compare two objects side-by-side, and generate AI-merged code |
| 3 | **Naming Convention Assistant** | Ask natural-language questions about the S/4HANA naming convention standards; AI answers with the correct system prefix pre-injected |
| 4 | **Code Review / Optimization** | Automated review against coding standards: Mod Log compliance, CDS-first architecture, performance, and modern ABAP syntax |
| 5 | **TS Finalization** | Generate a complete, structured Technical Specification document from live source code |
| 6 | **Reusable Artifacts** | Discover pre-approved, reusable `/SHL/` classes and function modules from the organisation's catalog |
| 7 | **Analysis / Summarization** | AI chat assistant to explain any ABAP artifact in plain language — purpose, logic flow, dependencies |
| 8 | **Impact Analysis (Where-Used)** | Identify all objects that depend on a given artifact before making changes; AI risk assessment included |
| 9 | **TR Sequencing Analyser** | Verify all Transport Request dependencies are released to the target system before releasing your own TR |

---

## Project Structure

```
FASTAPI_AI_Tool/
├── main.py               # FastAPI application entry point — registers all routers
├── requirements.txt      # Python dependencies
├── .env                  # Environment variables (SAP URLs, OpenAI key) — not committed
├── context.txt           # Detailed feature documentation and AI behaviour rules
├── core/
│   ├── config.py         # Centralised config (paths, env vars, system lists)
│   ├── models.py         # Pydantic request/response models
│   ├── ai_client.py      # Shared NVIDIA AI call helper
│   ├── sap_client.py     # SAP ADT REST client (D59-P59 systems)
│   ├── drad_search.py    # BM25+TF-IDF artifact search over artefacts.xlsx
│   ├── drad_fetch.py     # SAP OData fetch from ZSB_MAIN_DEPENDENT_V2 (H94/K94)
│   └── naming_conv.py    # DOCX-based Q&A with NVIDIA AI + system prefix injection
├── routes/
│   ├── retrofit.py       # /api/retrofit
│   ├── review.py         # /api/code-review
│   ├── ts.py             # /api/ts-finalization
│   ├── reusable.py       # /api/reusable-artifacts
│   ├── chat.py           # /api/chat-analysis
│   ├── impact.py         # /api/impact-analysis
│   ├── tr_seq.py         # /api/tr-sequencing
│   ├── drad.py           # /api/drad/* (AI DRAD tool)
│   └── naming_conv.py    # /api/naming-conv/ask
├── tests/
│   ├── test_drad.py      # 33 tests — AI DRAD endpoints + module unit tests
│   └── test_naming_conv.py # 15 tests — Naming Convention endpoint + module
├── templates/
│   └── index.html        # Single-page Jinja2 UI template
└── static/
    ├── app.js            # Frontend JavaScript (tab switching, API calls, rendering)
    └── style.css         # Styling for the web UI
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend framework | [FastAPI](https://fastapi.tiangolo.com/) |
| WSGI server | Uvicorn |
| Templating | Jinja2 |
| SAP authentication | `requests-negotiate-sspi` (Windows Kerberos/SSPI) |
| SSL trust store | `truststore` (uses Windows system certificate store) |
| AI / LLM | OpenAI Python SDK (`gpt-4o-mini` by default, configurable) |
| Config management | `python-dotenv` |
| Excel reading | `openpyxl` (AI DRAD artifact catalog) |
| Frontend | Vanilla HTML / CSS / JavaScript |

---

## SAP Systems Supported

| System ID | Role |
|-----------|------|
| `D59` | Development |
| `K59` | Quality / Test |
| `S59` | Sandbox |
| `L59` | Business / LAT |
| `A59` | Additional environment |
| `P59` | Production |

> The TR Sequencing Analyser always fetches dependency data from **D59** and checks release status against the chosen destination system.

### AI DRAD Systems

| System ID | Role |
|-----------|------|
| `H94` | Source/reference system (RFC: NONE) |
| `K94` | Target system (RFC: TRUSTING@K94_0020183341) |

> To add more systems, extend `_RFC_MAPPING` in `core/drad_fetch.py`.

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NVIDIA_API_KEY` | — | API key for NVIDIA AI endpoint |
| `NVIDIA_API_URL` | — | NVIDIA AI base URL |
| `SAP_D59_URL` … `SAP_P59_URL` | — | SAP ADT base URLs per system |
| `DRAD_API_URL` | `https://sapash94.europe.shell.com:8694/…/ZSB_MAIN_DEPENDENT_V2/main` | OData endpoint for ABAP source fetch |
| `DRAD_EXCEL_PATH` | `../AI-DRAD/artefacts.xlsx` | Path to artifact catalog Excel file |
| `DRAD_DOCX_PATH` | `../AI-DRAD/S4HANA-Naming Convention Standards-v1.0 3.docx` | Path to naming convention DOCX |

---

## API Endpoints

### `GET /`
Renders the main single-page HTML UI.

---

### `GET /api/drad/systems`
Returns the list of SAP system IDs available in the artifact catalog.

**Response:**
```json
{ "systems": ["H94", "K94"] }
```

---

### `POST /api/drad/search`
Searches the artifact catalog (artefacts.xlsx) using BM25 + TF-IDF hybrid scoring.

**Request body:**
```json
{ "description": "goods receipt posting", "top_k": 15 }
```

**Response:**
```json
{
  "matches": [
    { "system_no": "H94", "object_name": "/DS1/R_GR_POST", "description": "...", "score": 0.87 }
  ],
  "total": 1,
  "message": "Found 1 match"
}
```

---

### `POST /api/drad/fetch`
Fetches live ABAP source for 1–10 selected artifacts from the SAP OData service.
- **1 artifact** → `mode: "view"` — code accordion, no AI
- **2 artifacts** → `mode: "compare"` — side-by-side panels + AI diff summary + Generate Code button
- **3–10 artifacts** → `mode: "view"` — code accordion list

**Request body:**
```json
{
  "selected": [
    { "system_no": "H94", "object_name": "/DS1/R_GR_POST" },
    { "system_no": "K94", "object_name": "/DS1/R_GR_POST" }
  ]
}
```

**Response:**
```json
{
  "mode": "compare",
  "artifacts": [
    { "object_name": "/DS1/R_GR_POST", "system_no": "H94", "sections": [...], "error": null }
  ],
  "fetch_summary": { "requested": 2, "succeeded": 2, "failed": 0 },
  "ai_analysis": "## Diff Summary\n..."
}
```

---

### `POST /api/drad/generate-code`
Generates AI-merged ABAP code from exactly two compared artifacts.

**Request body:**
```json
{
  "artifacts": [
    { "object_name": "/DS1/R_GR_POST", "system_no": "H94", "sections": [...], "error": null },
    { "object_name": "/DS1/R_GR_POST", "system_no": "K94", "sections": [...], "error": null }
  ]
}
```

**Response:**
```json
{
  "generated_code": "REPORT /DS1/R_GR_POST.\n...",
  "system_1": "H94",
  "system_2": "K94",
  "artifact_1": "/DS1/R_GR_POST",
  "artifact_2": "/DS1/R_GR_POST"
}
```

---

### `POST /api/naming-conv/ask`
Answers a natural-language question about the S/4HANA naming convention standards using the DOCX as context. The system prefix (`/SHL/` for ADC, `/DS1/` for Nucleus) is automatically injected into the AI prompt.

**Request body:**
```json
{ "question": "How should I name a custom report?", "system": "ADC" }
```
`system` must be `"ADC"` or `"Nucleus"`.

**Response:**
```json
{ "answer": "Custom reports should be named /SHL/R_...", "question": "...", "system": "ADC" }
```

---

### `POST /api/retrofit`
Fetches an ABAP artifact from two different SAP systems and returns a line-by-line diff plus AI analysis.

**Request body:**
```json
{
  "artifact_name": "ZCL_MY_CLASS",
  "artifact_type": "Class",
  "function_group": null,
  "source_system": "D59",
  "destination_system": "K59"
}
```

**Response:**
```json
{
  "artifact_name": "ZCL_MY_CLASS",
  "artifact_type": "Class",
  "source_system": "D59",
  "destination_system": "K59",
  "left_lines": [{ "content": "...", "type": "equal|changed|removed|empty" }],
  "right_lines": [{ "content": "...", "type": "equal|changed|added|empty" }],
  "ai_analysis": "## Summary\n..."
}
```

**Diff colours:**
- 🟩 Green — line added in destination
- 🟥 Red — line removed from source
- 🟨 Yellow — line changed between systems
- White — identical line

**Supported artifact types:** `Class`, `Function Module`, `Report/Program`, `CDS View`

---

### `POST /api/code-review`
Fetches an ABAP artifact's source code from the specified system and performs a structured AI code review.

**Request body:**
```json
{
  "artifact_name": "/SHL/CL_FI_POSTING",
  "artifact_type": "Class",
  "function_group": null,
  "system": "D59"
}
```

**Response:**
```json
{
  "artifact_name": "/SHL/CL_FI_POSTING",
  "artifact_type": "Class",
  "system": "D59",
  "source_code": "CLASS /SHL/CL_FI_POSTING ...",
  "analysis": "## Overall Summary\n..."
}
```

**Review sections:**
1. Mod Log Header compliance (PASS/FAIL)
2. CDS View compliance — no direct DB table SELECTs (PASS/FAIL)
3. Performance analysis (PASS/FAIL)
4. S/4HANA modern ABAP syntax (PASS/FAIL)
5. Code quality & best practices (PASS/FAIL)
6. Corrected & improved code (full rewritten version)

**Supported artifact types:** `Class`, `Function Module`, `Report/Program`, `CDS View`, `Interface`, `Include`

---

### `POST /api/ts-finalization`
Generates a complete Technical Specification document from live source code.

**Request body:**
```json
{
  "artifact_name": "/SHL/CL_FI_POSTING",
  "artifact_type": "Class",
  "function_group": null,
  "system": "D59"
}
```

**Response:**
```json
{
  "artifact_name": "/SHL/CL_FI_POSTING",
  "artifact_type": "Class",
  "system": "D59",
  "ts_content": "## Title & Header\n..."
}
```

**TS document sections:**
Title & Header, Overview & Purpose, Scope, Assumptions & Dependencies, Functional Requirements, Process Flow, Input Parameters, Data Model, Interfaces & APIs, Error Handling & Logging, Output / ALV Layout, Performance & Limits, Security & Authorisations, Test Scenarios, Open Issues / Risks.

---

### `POST /api/chat-analysis`
Interactive AI chat assistant for deep analysis of any ABAP artifact. Fetches source code on the first call and includes it in all subsequent conversation turns (client caches and resends).

**Request body:**
```json
{
  "artifact_name": "/SHL/CL_FI_POSTING",
  "artifact_type": "Class",
  "function_group": null,
  "system": "D59",
  "tcode": null,
  "source_code": null,
  "messages": [
    { "role": "user", "content": "Explain what this class does." }
  ]
}
```

**Response:**
```json
{
  "reply": "This class is responsible for...",
  "source_code": "CLASS /SHL/CL_FI_POSTING ..."
}
```

**Supported artifact types:** `Class`, `Function Module`, `Report/Program`, `CDS View`, `Interface`, `Include`, `Transaction (TCode)`

---

### `POST /api/tr-analysis`
Analyses all dependencies of a Transport Request and checks their release status against the target system.

**Request body:**
```json
{
  "tr_number": "D59K950123",
  "destination_system": "K59"
}
```

**Response:**
```json
{
  "tr_number": "D59K950123",
  "destination_system": "K59",
  "items": [...],
  "analysis": "## TR Summary\n..."
}
```

**Verdict icons:**
- ✅ Released — safe dependency
- ⏳ Pending — must be released first
- ❌ Unknown / Missing — investigate before releasing

---

## Setup & Installation

### Prerequisites
- Python 3.10+
- Windows machine joined to the SAP domain (required for SSPI/Kerberos authentication)
- Valid SAP credentials (Kerberos ticket via `kinit` or active domain session)
- OpenAI API key (Azure-hosted or OpenAI.com)

### 1. Clone / navigate to the folder
```powershell
cd "Open AI\FASTAPI_AI_Tool"
```

### 2. Create and activate a virtual environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies
```powershell
pip install -r requirements.txt
```

### 4. Configure environment variables
Copy `.env.example` (or create `.env`) and fill in the values:

```ini
# SAP system base URLs (no trailing slash)
SAP_URL_D59=https://d59.example.com:44300
SAP_URL_K59=https://k59.example.com:44300
SAP_URL_S59=https://s59.example.com:44300
SAP_URL_L59=https://l59.example.com:44300
SAP_URL_A59=https://a59.example.com:44300
SAP_URL_P59=https://p59.example.com:44300

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### 5. Run the application
```powershell
python main.py
```
Or with Uvicorn directly:
```powershell
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 6. Open in browser
```
http://127.0.0.1:8000
```

---

## How Authentication Works

The tool uses **Windows SSPI (Negotiate/Kerberos)** via the `requests-negotiate-sspi` library. This means:
- No username/password is stored — authentication uses the currently logged-in Windows domain session.
- The machine running the tool must be on the corporate network (or VPN) with access to the SAP systems.
- The SAP client header `X-SAP-Client: 110` is sent with every request.

---

## SAP ADT REST API Endpoints Used

| Artifact Type | ADT URL Pattern |
|---------------|----------------|
| Class | `/sap/bc/adt/oo/classes/{name}/source/main` |
| Function Module | `/sap/bc/adt/functions/groups/{fg}/fmodules/{name}/source/main` |
| Report / Program | `/sap/bc/adt/programs/programs/{name}/source/main` |
| CDS View | `/sap/bc/adt/ddic/ddl/sources/{name}/source/main` |
| Interface | `/sap/bc/adt/oo/interfaces/{name}/source/main` |
| Include | `/sap/bc/adt/programs/includes/{name}/source/main` |
| TR Dependencies | `/sap/opu/odata4/shl/api_re_artifacts/.../TR_DEP(...)` |

---

## AI Behaviour Rules

1. Always fetch live code from the SAP system before analysing — never guesses or fabricates ABAP code.
2. Responses use structured output: headings, bullet points, and `abap` code blocks.
3. All custom object names in this landscape start with `/SHL/`.
4. Generated code and suggestions are returned in the UI only. The tool **never writes back to SAP**.
5. If a Mod Log is missing or a direct table SELECT is detected, it is flagged proactively.
6. Each AI analysis always ends with a **Recommendation** section.

---

## Dependencies

```
fastapi
uvicorn[standard]
jinja2
python-multipart
openai
requests
requests-negotiate-sspi
truststore
python-dotenv
```

Install with:
```powershell
pip install -r requirements.txt
```
