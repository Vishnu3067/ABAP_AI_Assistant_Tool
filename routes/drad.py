"""
routes/drad.py
AI-DRAD: Artifact search and code fetch routes.

Endpoints:
  GET  /api/drad/systems       - available SAP systems from Excel catalog
  POST /api/drad/search        - search catalog by description
  POST /api/drad/fetch         - fetch source code for selected artifacts
  POST /api/drad/generate-code - AI-generate unified code from exactly 2 artifacts
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core.config import DRAD_EXCEL_PATH, DRAD_API_URL
from core.models import DradSearchRequest, DradFetchRequest, DradGenerateCodeRequest
from core.drad_search import search_artefacts, get_available_systems
from core.drad_fetch import fetch_artifact_code
from core.ai_client import call_ai

router = APIRouter()


@router.get("/api/drad/systems")
async def drad_systems():
    """Return the list of SAP system IDs present in the artefacts catalog."""
    if not DRAD_EXCEL_PATH.exists():
        raise HTTPException(
            500,
            f"Artefacts catalog not found at: {DRAD_EXCEL_PATH}. "
            "Set DRAD_EXCEL_PATH in .env."
        )
    try:
        systems = get_available_systems(DRAD_EXCEL_PATH)
    except Exception as e:
        raise HTTPException(500, f"Failed to load systems: {str(e)[:200]}")
    return {"systems": systems}


@router.post("/api/drad/search")
async def drad_search(payload: DradSearchRequest):
    """
    Search the artefacts catalog using a natural-language description.
    Returns a ranked list of matches (system_no, object_name, description, score).
    """
    if not payload.description.strip():
        raise HTTPException(400, "Description is required.")

    if not DRAD_EXCEL_PATH.exists():
        raise HTTPException(
            500,
            f"Artefacts catalog not found at: {DRAD_EXCEL_PATH}. "
            "Set DRAD_EXCEL_PATH in .env."
        )

    try:
        matches = search_artefacts(DRAD_EXCEL_PATH, payload.description.strip())
    except FileNotFoundError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Search failed: {str(e)[:200]}")

    return {
        "matches": matches,
        "total": len(matches),
        "message": "" if matches else "No matching artefacts found for your description. Try different keywords.",
    }


@router.post("/api/drad/fetch")
async def drad_fetch(payload: DradFetchRequest):
    """
    Fetch source code for the selected artifacts.
    - 1 artifact  : mode = "view"    (code tree + dependent objects)
    - 2 artifacts : mode = "compare" (side-by-side + AI diff analysis)
    - 3+ artifacts: mode = "view"    (code list, no AI comparison)
    """
    if not payload.selected_items:
        raise HTTPException(400, "At least one artefact must be selected.")
    if len(payload.selected_items) > 10:
        raise HTTPException(400, "Cannot fetch more than 10 artefacts at once.")

    results = []
    for item in payload.selected_items:
        result = fetch_artifact_code(item.system_no, item.object_name)
        results.append(result)

    successful = [r for r in results if not r.get('error') and r.get('sections')]
    failed = [r for r in results if r.get('error')]

    # Surface a summary of any failures but don't block the whole response
    fetch_summary = {
        "total_requested": len(payload.selected_items),
        "successful": len(successful),
        "failed": [{"object_name": f["object_name"], "system_no": f["system_no"], "error": f["error"]} for f in failed],
    }

    if not successful and failed:
        raise HTTPException(
            502,
            f"Failed to fetch any code. Errors: "
            + "; ".join(f["error"] for f in failed)
        )

    count = len(payload.selected_items)
    mode = "compare" if count == 2 else "view"

    response_data = {
        "mode": mode,
        "artifacts": results,
        "fetch_summary": fetch_summary,
        "ai_analysis": None,
    }

    # AI diff analysis only when explicitly requested (Retrofit button)
    if payload.do_ai_analysis and len(successful) >= 2:
        try:
            response_data["ai_analysis"] = _build_diff_analysis(successful[0], successful[1])
        except Exception as e:
            response_data["ai_analysis"] = f"AI analysis unavailable: {str(e)[:200]}"

    return response_data


@router.post("/api/drad/generate-code")
async def drad_generate_code(payload: DradGenerateCodeRequest):
    """
    Ask NVIDIA AI to generate optimized ABAP code for both systems
    based on two existing artifact sources. Only valid for exactly 2 artifacts.
    """
    if len(payload.artifacts) != 2:
        raise HTTPException(400, "Exactly 2 artifacts are required for code generation.")

    a1, a2 = payload.artifacts[0], payload.artifacts[1]

    if not a1.code.strip() and not a2.code.strip():
        raise HTTPException(400, "Both artifacts have empty source code — nothing to generate from.")

    target = payload.target_system.strip() if payload.target_system.strip() else a1.system_no

    prompt = f"""You are an expert SAP ABAP developer.
You have source code from two SAP systems for the same (or similar) artifact.

System {a1.system_no} — Artifact: {a1.object_name}
```abap
{a1.code[:5000]}
```

System {a2.system_no} — Artifact: {a2.object_name}
```abap
{a2.code[:5000]}
```

The user wants a single optimized, production-ready version for system **{target}**.
Study both versions, take the best logic from each, and generate improved ABAP code specifically for {target}.
Use modern ABAP syntax (inline declarations, string templates, VALUE #, CORRESPONDING).

## Optimized Code for {target}
```abap
[complete ready-to-use code here]
```

## Key Improvements Made
[bullet points explaining what was improved and why]"""

    try:
        generated = call_ai(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=6000,
        )
    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {str(e)[:300]}")

    return {
        "generated_code": generated,
        "system_1": a1.system_no,
        "system_2": a2.system_no,
        "artifact_1": a1.object_name,
        "artifact_2": a2.object_name,
        "target_system": target,
    }


def _build_diff_analysis(art1: dict, art2: dict) -> str:
    """Internal: Ask AI to compare two fetched artifacts."""
    code1 = "\n".join(s.get('code', '') for s in art1.get('sections', []))[:4000]
    code2 = "\n".join(s.get('code', '') for s in art2.get('sections', []))[:4000]

    same_system = art1['system_no'].upper() == art2['system_no'].upper()

    cross_note = (
        f"IMPORTANT: These artifacts are from DIFFERENT SAP systems "
        f"({art1['system_no']} and {art2['system_no']}). "
        "The codebases will differ significantly because each system has its own "
        "landscape, namespace, and configuration. Focus on business functionality "
        "alignment rather than line-by-line differences."
        if not same_system else
        "Both artifacts are from the same system."
    )

    prompt = f"""You are an expert SAP ABAP developer comparing two artefacts.
{cross_note}

Artifact 1: {art1['object_name']} (System: {art1['system_no']})
```abap
{code1}
```

Artifact 2: {art2['object_name']} (System: {art2['system_no']})
```abap
{code2}
```

Provide a focused comparison:

## Overview
[What each artifact does and their relationship]

## Key Differences
[Most significant code or structural differences]

## Business Purpose Alignment
[Do they serve the same purpose? What's similar, what's different?]

## Recommendation
[Which is better for what use case, or how they complement each other]"""

    return call_ai([{"role": "user", "content": prompt}], temperature=0.2)
