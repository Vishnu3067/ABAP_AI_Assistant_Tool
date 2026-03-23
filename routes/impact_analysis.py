"""
routes/impact_analysis.py — Impact Analysis (Where-Used) Tool

Flow:
  1. Fetch the complete where-used list for the given artifact.
  2. For each unique dependent object (up to MAX_DEEP_FETCH objects),
     fetch its source code from the same SAP system.
  3. Feed everything to an AI agentic loop that:
     - Understands what the user wants to change / delete.
     - Analyses each dependent object to explain HOW it uses the artifact.
     - Produces a human-readable impact report with risk levels.
"""
from __future__ import annotations

import json
from typing import List

import requests
from fastapi import APIRouter, HTTPException

from core.config import (
    SAP_URL_D59, SAP_URL_S59, IMPACT_ARTIFACT_TYPES, ANALYSIS_TOOLS,
    OPENAI_MODEL, openai_client, MAX_FETCHED_CHARS, _SYSTEM_URL_MAP,
)
from core.models import ImpactAnalysisRequest
from core.sap_client import get_session, fetch_whereused, fetch_source, fetch_reviewable_source, resolve_url
from core.ai_client import truncate_source

router = APIRouter()

# How many dependent objects to fetch source for (too many = context overflow)
MAX_DEEP_FETCH = 8


def _obj_type_label(raw: str) -> str:
    """Map raw OData caller_type codes → human readable label.

    Actual values returned by the where-used OData endpoint:
      OC   = Class instance (ABAP Objects class)
      P    = Program / report
      REPS = Include program
      INTF = Interface
      FUNC = Function Module
      DDLS = CDS View
      TABL = Table
      STRU = Structure
      DTEL = Data Element
      DOMA = Domain
      CLAS = Class (alternate)
    """
    _MAP = {
        "OC":   "Class",
        "OM":   "Class Method",
        "CLAS": "Class",
        "P":    "Report/Program",
        "PROG": "Report/Program",
        "REPS": "Include",
        "INTF": "Interface",
        "FUNC": "Function Module",
        "DDLS": "CDS View",
        "TABL": "Table",
        "STRU": "Structure",
        "DTEL": "Data Element",
        "DOMA": "Domain",
    }
    return _MAP.get(raw, raw)


def _friendly_to_fetch_type(label: str) -> str | None:
    """Map friendly label → fetch_source compatible type. Returns None if not fetchable."""
    _FETCH = {
        "Class":           "Class",
        "Class Method":    "Class",
        "Function Module": "Function Module",
        "Report/Program":  "Report/Program",
        "Include":         "Include",
        "Interface":       "Interface",
        "CDS View":        "CDS View",
    }
    return _FETCH.get(label)


@router.post("/api/impact-analysis")
async def impact_analysis(payload: ImpactAnalysisRequest):
    artifact_name   = payload.artifact_name.strip().upper()
    artifact_type   = payload.artifact_type.strip()
    function_group  = (payload.function_group or "").strip() or None
    system_id       = payload.system.upper()
    planned_change  = payload.planned_change.strip()

    if not artifact_name:
        raise HTTPException(400, "Artifact name is required.")
    if not planned_change:
        raise HTTPException(400, "Please describe what you plan to change or delete.")
    if artifact_type not in IMPACT_ARTIFACT_TYPES:
        raise HTTPException(400, f"Unsupported artifact type: {artifact_type}")

    try:
        sap_url = resolve_url(system_id)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if not SAP_URL_S59:
        raise HTTPException(500, "SAP_URL_S59 is not configured in .env (required for where-used lookup).")

    session = get_session()

    # ── 1. Where-Used list — always from S59 (custom OData exists only there) ─
    try:
        wu_records = fetch_whereused(session, SAP_URL_S59, artifact_name, artifact_type)
    except requests.HTTPError as e:
        sc = e.response.status_code if e.response is not None else "?"
        raise HTTPException(502, f"Where-Used lookup failed (HTTP {sc}). Check artifact name / type.")
    except Exception as e:
        raise HTTPException(502, f"Where-Used lookup failed: {str(e)[:200]}")

    if not wu_records:
        return {
            "artifact_name": artifact_name,
            "artifact_type": artifact_type,
            "planned_change": planned_change,
            "system": system_id,
            "where_used_count": 0,
            "unique_deps_count": 0,
            "deep_fetched": [],
            "reply": "",   # frontend renders a dedicated "No Impact Found" card for this case
        }

    # ── 2. Deduplicate + build summary table ────────────────────────────────
    # Actual OData fields: caller_prog, caller_type, caller_include, textline
    # For OM (class method) records: caller_prog = method name, caller_include = class name.
    # We deduplicate on the CLASS name for OM to avoid listing every method separately.
    seen: set = set()
    unique_deps: List[dict] = []
    for rec in wu_records:
        rtype = (rec.get("caller_type") or "").strip()
        if rtype == "OM":
            # Use the class name from caller_include; fall back to caller_prog
            name = (rec.get("caller_include") or rec.get("caller_prog") or "").strip()
            label = "Class"
        else:
            name  = (rec.get("caller_prog") or "").strip()
            label = _obj_type_label(rtype)
        desc  = (rec.get("textline") or "").strip()
        # Skip self-references (the artifact referencing itself)
        if name.upper() == artifact_name.upper():
            continue
        if name and (name, rtype) not in seen:
            seen.add((name, rtype))
            unique_deps.append({
                "name": name,
                "raw_type": rtype,
                "type": label,
                "description": desc,
            })

    # Build a plain-text summary of where-used entries for the prompt
    wu_summary_lines = [f"Total where-used entries: {len(wu_records)} ({len(unique_deps)} unique objects)\n"]
    for i, dep in enumerate(unique_deps[:50], 1):
        desc_part = f" — {dep['description']}" if dep.get("description") else ""
        wu_summary_lines.append(f"  {i:>3}. [{dep['type']}] {dep['name']}{desc_part}")
    if len(unique_deps) > 50:
        wu_summary_lines.append(f"  ... and {len(unique_deps) - 50} more")
    wu_summary = "\n".join(wu_summary_lines)

    # ── 3. Fetch source for top N fetchable dependents — from user-selected system ─
    # Where-used tells us WHAT uses the artifact; the actual code lives in
    # the system the user selected (typically D59 for development).
    deep_fetched: List[dict] = []
    source_blocks: List[str] = []

    for dep in unique_deps:
        if len(deep_fetched) >= MAX_DEEP_FETCH:
            break
        fetch_type = _friendly_to_fetch_type(dep["type"])
        if not fetch_type:
            continue  # skip Tables, DE, Domain — no ABAP source to fetch
        try:
            code = fetch_reviewable_source(session, sap_url, fetch_type, dep["name"])
            code = truncate_source(code, MAX_FETCHED_CHARS)
            source_blocks.append(
                f"--- SOURCE: {dep['type']} '{dep['name']}' ---\n{code}\n---"
            )
            deep_fetched.append({"type": dep["type"], "name": dep["name"], "status": "ok"})
        except requests.HTTPError as e:
            sc = e.response.status_code if e.response is not None else "?"
            deep_fetched.append({"type": dep["type"], "name": dep["name"], "status": f"HTTP {sc}"})
        except Exception as e:
            deep_fetched.append({"type": dep["type"], "name": dep["name"], "status": str(e)[:80]})

    # Optionally fetch the artifact itself for richer context — from user-selected system
    primary_source = ""
    try:
        primary_source = fetch_reviewable_source(session, sap_url, artifact_type, artifact_name, function_group)
        primary_source = truncate_source(primary_source, 20_000)
    except Exception:
        pass

    source_section = "\n\n".join(source_blocks) if source_blocks else "(No source could be fetched for dependents.)"

    # ── 4. AI Impact Analysis ────────────────────────────────────────────────
    primary_section = (
        f"--- PRIMARY ARTIFACT: {artifact_type} '{artifact_name}' ---\n{primary_source}\n---"
        if primary_source else ""
    )

    prompt = f"""You are an expert SAP ABAP developer performing an impact analysis.

ARTIFACT BEING CHANGED:
  Name: {artifact_name}
  Type: {artifact_type}
  Where-used checked in: S59 (custom where-used OData API)
  Source code fetched from: {system_id}

PLANNED CHANGE:
  "{planned_change}"

WHERE-USED LIST:
{wu_summary}

SOURCE CODE OF DEPENDENT OBJECTS (top {MAX_DEEP_FETCH} fetched):
{source_section}

{primary_section}

Your task: Produce a clear, developer-friendly impact analysis report.

Structure your response like this:

## Summary
One paragraph: what {artifact_name} is, what the change involves, and the overall blast radius in plain English.

## Risk Level
State overall risk: 🟢 LOW / 🟡 MEDIUM / 🔴 HIGH — with a one-line justification.

## Affected Objects
For each dependent object that is actually impacted by the planned change:
- **[ObjectType] ObjectName** — explain concisely *how* it uses {artifact_name} and *what* will break or need updating.

If you have source code for an object, reference the exact method calls, field accesses, or usages you can see. Be specific.

## Objects Likely Unaffected
List any objects from the where-used list that appear to be unaffected by this specific change (with brief reason).

## What To Do
Numbered action list: concrete steps the developer must take before/after making the change to avoid breakage.

Keep language simple and practical. Avoid jargon. A junior developer should be able to follow this report.
Do NOT use pipe/markdown tables. Use bullet points."""

    try:
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000,
            stream=False,
        )
        reply = (response.choices[0].message.content or "").strip()
    except Exception as e:
        raise HTTPException(500, f"AI generation error: {str(e)[:300]}")

    return {
        "artifact_name": artifact_name,
        "artifact_type": artifact_type,
        "planned_change": planned_change,
        "system": system_id,
        "where_used_count": len(wu_records),
        "unique_deps_count": len(unique_deps),
        "deep_fetched": deep_fetched,
        "reply": reply,
    }
