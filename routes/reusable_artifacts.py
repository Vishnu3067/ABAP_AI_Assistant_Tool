from typing import List

import requests
from fastapi import APIRouter, HTTPException

from core.config import SAP_URL_S59, SAP_URL_D59, MAX_FETCHED_CHARS
from core.models import ReusableArtifactsRequest
from core.sap_client import get_session, fetch_source, fetch_odata_all_pages
from core.rag import retrieve_top_methods
from core.ai_client import call_ai, truncate_source

router = APIRouter()


@router.post("/api/reusable-artifacts")
async def reusable_artifacts(payload: ReusableArtifactsRequest):
    question = payload.question.strip()
    if not question:
        raise HTTPException(400, "Question is required.")

    session = get_session()

    if not SAP_URL_S59:
        raise HTTPException(500, "SAP_URL_S59 is not configured in .env.")

    url_class = f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/api_re_artifacts/0001/Artifacts_Class?sap-client=100"
    url_fm    = f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/api_re_artifacts/0001/Artifacts_FM?sap-client=100"

    # S59 uses client 100 — override the default header set by get_session()
    s59_headers = {"X-SAP-Client": "100"}

    try:
        class_records = fetch_odata_all_pages(
            session, url_class, SAP_URL_S59, headers=s59_headers, timeout=30
        )
        json_classes = {"value": class_records}
    except Exception as e:
        raise HTTPException(502, f"Could not fetch reusable classes from S59: {str(e)[:200]}")

    try:
        fm_records = fetch_odata_all_pages(
            session, url_fm, SAP_URL_S59, headers=s59_headers, timeout=30
        )
        json_fms = {"value": fm_records}
    except Exception as e:
        raise HTTPException(502, f"Could not fetch reusable FMs from S59: {str(e)[:200]}")

    # JSON-native grouped retrieval: groups by (ClassName, MethodName) so each
    # TF-IDF document = one unique method with all its params and expanded tokens.
    top_methods = retrieve_top_methods(json_classes, json_fms, question, top_k=5)
    if not top_methods:
        raise HTTPException(404, "No relevant reusable artifacts found for your question.")

    rag_context = "\n\n".join(
        f"[Match {i+1}]\n{m['text']}" for i, m in enumerate(top_methods)
    )

    # Fetch source for the top 3 unique class/FM names only
    artifact_sources: List[dict] = []
    seen_names: set = set()
    for m in top_methods[:3]:
        if m["name"] in seen_names:
            continue
        seen_names.add(m["name"])
        try:
            code = fetch_source(session, SAP_URL_D59, m["type"], m["name"])
            code = truncate_source(code, MAX_FETCHED_CHARS)
            artifact_sources.append({**m, "source": code, "status": "ok"})
        except requests.HTTPError as e:
            sc = e.response.status_code if e.response is not None else "?"
            artifact_sources.append({**m, "source": "", "status": f"HTTP {sc}"})
        except Exception as e:
            artifact_sources.append({**m, "source": "", "status": str(e)[:80]})

    source_block = ""
    for art in artifact_sources:
        if art.get("source"):
            source_block += f"\n\n--- SOURCE: {art['type']} '{art['name']}' ---\n{art['source']}\n---"

    prompt = f"""You are an expert SAP ABAP developer helping find a pre-approved reusable artifact.

Developer's need: "{question}"

Relevant catalog entries (ranked by relevance):
{rag_context}
{source_block if source_block else ""}

Respond in this EXACT short format. Keep the entire response under 250 words (excluding code).
Do NOT use markdown pipe tables (no | col | format). Use bullet points for lists.

## Best Match
- **Name:** <exact class or FM name>
- **Type:** Class / Function Module
- **Method / Entry Point:** <method or FM name>
- **Purpose:** One sentence.
- **Why it fits:** One sentence explaining how it solves the need.

## Ready-to-Use Code
```abap
\" Complete working snippet — copy and paste into your ABAP code
```

## Notes
- Key parameter, prerequisite, or exception to handle (max 3 bullet points)

If no artifact matches, say so clearly in one sentence. Be direct and practical."""

    try:
        reply = call_ai([{"role": "user", "content": prompt}], temperature=0.3)
    except Exception as e:
        raise HTTPException(500, f"AI generation error: {str(e)[:300]}")

    return {
        "question": question,
        "reply": reply,
        "rag_chunks_count": len(top_methods),
        "fetched_artifacts": [
            {"type": a["type"], "name": a["name"],
             "method": a.get("method", ""), "status": a["status"]}
            for a in artifact_sources
        ],
    }
