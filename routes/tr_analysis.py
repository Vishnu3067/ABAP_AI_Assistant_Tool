import requests
from fastapi import APIRouter, HTTPException

from core.config import VALID_SYSTEMS, TR_VALID_SYSTEMS, SAP_URL_S59
from core.models import TrAnalysisRequest
from core.sap_client import fetch_tr_dependencies
from core.prompts import ai_tr_analysis

router = APIRouter()


@router.post("/api/tr-analysis")
async def tr_analysis(payload: TrAnalysisRequest):
    dest_id = payload.destination_system.upper()
    tr_num  = payload.tr_number.upper().strip()

    if dest_id not in TR_VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid destination system '{dest_id}'. Allowed: {TR_VALID_SYSTEMS}")
    if not tr_num:
        raise HTTPException(400, "TR number is required.")
    if not SAP_URL_S59:
        raise HTTPException(500, "SAP_URL_S59 is not configured in .env.")

    try:
        items = fetch_tr_dependencies(tr_num, dest_id)
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
        analysis = ai_tr_analysis(tr_num, dest_id, items)
    except Exception as e:
        raise HTTPException(500, f"AI analysis error: {str(e)[:300]}")

    return {
        "tr_number": tr_num,
        "destination_system": dest_id,
        "items": items,
        "analysis": analysis,
    }
