import requests
from fastapi import APIRouter, HTTPException

from core.config import VALID_SYSTEMS
from core.models import RetrofitRequest
from core.sap_client import get_session, resolve_url, fetch_source
from core.diff import compute_side_by_side_diff
from core.prompts import ai_retrofit_analysis

router = APIRouter()


@router.post("/api/retrofit")
async def retrofit(payload: RetrofitRequest):
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

    src_url = resolve_url(src_id)
    dst_url = resolve_url(dst_id)

    try:
        source_code = fetch_source(get_session(), src_url, payload.artifact_type,
                                    payload.artifact_name, payload.function_group)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {src_id}.")
        raise HTTPException(500, f"HTTP {status} while fetching from {src_id}.")

    try:
        dest_code = fetch_source(get_session(), dst_url, payload.artifact_type,
                                  payload.artifact_name, payload.function_group)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {dst_id}.")
        raise HTTPException(500, f"HTTP {status} while fetching from {dst_id}.")

    left_lines, right_lines = compute_side_by_side_diff(source_code, dest_code)

    try:
        analysis = ai_retrofit_analysis(
            payload.artifact_type, payload.artifact_name,
            src_id, dst_id, source_code, dest_code
        )
    except Exception as e:
        raise HTTPException(500, f"AI analysis error: {str(e)[:300]}")

    return {
        "artifact_name": payload.artifact_name,
        "artifact_type": payload.artifact_type,
        "source_system": src_id,
        "destination_system": dst_id,
        "left_lines": left_lines,
        "right_lines": right_lines,
        "ai_analysis": analysis,
    }
