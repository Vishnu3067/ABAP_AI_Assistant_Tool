import requests
from fastapi import APIRouter, HTTPException

from core.config import VALID_SYSTEMS, CODE_REVIEW_ARTIFACT_TYPES
from core.models import TsFinalizationRequest
from core.sap_client import get_session, resolve_url, fetch_source, fetch_reviewable_source
from core.prompts import ai_ts_finalization

router = APIRouter()


@router.post("/api/ts-finalization")
async def ts_finalization(payload: TsFinalizationRequest):
    system_id = payload.system.upper()
    if system_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid system '{system_id}'. Allowed: {VALID_SYSTEMS}")
    if payload.artifact_type not in CODE_REVIEW_ARTIFACT_TYPES:
        raise HTTPException(400, f"Unsupported artifact type '{payload.artifact_type}'.")
    if payload.artifact_type == "Function Module" and not payload.function_group:
        raise HTTPException(400, "function_group is required for Function Module.")

    sap_url = resolve_url(system_id)
    try:
        source_code = fetch_reviewable_source(
            get_session(), sap_url,
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
        ts_content = ai_ts_finalization(payload.artifact_type, payload.artifact_name, system_id, source_code)
    except Exception as e:
        raise HTTPException(500, f"AI generation error: {str(e)[:300]}")

    return {
        "artifact_name": payload.artifact_name,
        "artifact_type": payload.artifact_type,
        "system": system_id,
        "ts_content": ts_content,
    }
