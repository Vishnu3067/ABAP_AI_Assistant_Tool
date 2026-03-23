from core.ai_client import call_ai, truncate_source
from core.config import MAX_REVIEW_CHARS, MAX_DIFF_CHARS


def ai_tr_analysis(tr_number: str, destination_sysid: str, items: list[dict]) -> str:
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

    return call_ai([{"role": "user", "content": prompt}], temperature=0.2)


def ai_code_review(artifact_type: str, artifact_name: str, system: str, source_code: str,
                   resolved_types: dict | None = None) -> str:
    source_code = truncate_source(source_code, MAX_REVIEW_CHARS)

    # Build a verified data-source type block so the AI doesn't guess
    if resolved_types:
        known_lines = []
        for name, typ in sorted(resolved_types.items()):
            if typ != "Unknown":
                known_lines.append(f"  - {name}: {typ}")
        unknown = [name for name, typ in resolved_types.items() if typ == "Unknown"]
        if unknown:
            known_lines.append(f"  - (unresolved — type could not be determined): {', '.join(sorted(unknown))}")
        verified_block = (
            "\nVERIFIED DATA SOURCE TYPES (resolved live against SAP ADT — treat these as ground truth):\n"
            + "\n".join(known_lines)
            + "\n\nIMPORTANT: Use ONLY the above list when making CDS View Compliance judgements. "
            "Do NOT guess or infer types from object names. "
            "Only flag a SELECT as a direct-table violation if its FROM target is listed as 'Table' above."
            " Objects listed as 'CDS View' are fully compliant."
        )
    else:
        verified_block = ""

    prompt = f"""You are an expert ABAP developer and code reviewer for SAP S/4HANA systems.
Review the following ABAP {artifact_type} and produce a structured analysis.

Artifact: {artifact_name}
System: {system}
Type: {artifact_type}
{verified_block}
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

## Corrected Code Snippets
For each FAIL section above, provide only the specific corrected code snippets — the fixed portion with enough surrounding context to locate it (do NOT output the entire program). Format each snippet as:

**Fix for [issue name]:**
```abap
(corrected snippet here)
```

If the Mod Log header is missing, output the complete correct header template as one snippet.
Be thorough and specific. Reference actual lines/variable names from the code. Use bullet points inside each section."""

    return call_ai([{"role": "user", "content": prompt}], temperature=0.2, max_tokens=8192)


def ai_retrofit_analysis(artifact_type: str, artifact_name: str,
                         src_id: str, dst_id: str,
                         source_code: str, dest_code: str) -> str:
    source_code = truncate_source(source_code, MAX_DIFF_CHARS)
    dest_code   = truncate_source(dest_code,   MAX_DIFF_CHARS)
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

    return call_ai([{"role": "user", "content": prompt}], temperature=0.2)


def ai_ts_finalization(artifact_type: str, artifact_name: str, system: str, source_code: str) -> str:
    source_code = truncate_source(source_code, MAX_REVIEW_CHARS)
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

    return call_ai([{"role": "user", "content": prompt}], temperature=0.2)
