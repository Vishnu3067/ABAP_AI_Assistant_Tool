import requests
from fastapi import APIRouter, HTTPException

from core.config import VALID_SYSTEMS, CODE_REVIEW_ARTIFACT_TYPES
from core.models import ChatAnalysisRequest
from core.sap_client import get_session, resolve_url, fetch_source, fetch_transaction_info
from core.agentic import run_agentic_analysis

router = APIRouter()


@router.post("/api/chat-analysis")
async def chat_analysis(payload: ChatAnalysisRequest):
    system_id = payload.system.upper()
    if system_id not in VALID_SYSTEMS:
        raise HTTPException(400, f"Invalid system '{system_id}'. Allowed: {VALID_SYSTEMS}")
    if not payload.messages:
        raise HTTPException(400, "At least one message is required.")

    sap_url = resolve_url(system_id)
    session = get_session()

    source_code = payload.source_code or ""
    if not source_code.strip():
        try:
            if payload.artifact_type == "Transaction (TCode)":
                source_code = fetch_transaction_info(session, sap_url, payload.artifact_name)
            elif payload.artifact_type == "Package":
                # For Package: let the agentic loop fetch via fetch_package tool.
                # Pass an empty source so the AI sees its task is to explore the package.
                source_code = ""
            else:
                if payload.artifact_type not in CODE_REVIEW_ARTIFACT_TYPES:
                    raise HTTPException(400, f"Unsupported artifact type '{payload.artifact_type}'.")
                if payload.artifact_type == "Function Module" and not payload.function_group:
                    raise HTTPException(400, "function_group is required for Function Module.")
                source_code = fetch_source(
                    session, sap_url,
                    payload.artifact_type, payload.artifact_name, payload.function_group
                )
        except HTTPException:
            raise
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else "?"
            if status == 404:
                raise HTTPException(404, f"{payload.artifact_type} '{payload.artifact_name}' not found in {system_id}.")
            if status == 422:
                raise HTTPException(422, (
                    f"SAP could not process the request for {payload.artifact_type} '{payload.artifact_name}' (HTTP 422). "
                    f"Possible causes: the object type is mismatched (e.g. a function group pool entered as Report/Program), "
                    f"or the object is a standard SAP transaction — try selecting 'Transaction (TCode)' as the type."
                ))
            raise HTTPException(500, f"HTTP {status} while fetching from {system_id}.")
        except requests.exceptions.ConnectionError as e:
            raise HTTPException(502, f"Cannot connect to {system_id}. Check SAP URL in .env. Details: {str(e)[:200]}")
        except Exception as e:
            raise HTTPException(500, f"Error fetching artifact: {str(e)[:200]}")

    try:
        reply, fetched_log, extra_ctx = run_agentic_analysis(
            payload.artifact_type, payload.artifact_name,
            system_id, payload.tcode,
            source_code, payload.messages,
            sap_url, session,
        )
    except Exception as e:
        reply = f"⚠️ **AI service error:** {str(e)[:400]}\n\n_You can still continue the conversation once the issue is resolved._"
        fetched_log = []
        extra_ctx = ""

    enriched_source = source_code + ("\n\n" + extra_ctx if extra_ctx else "")

    return {
        "reply": reply,
        "source_code": enriched_source,
        "fetched_artifacts": fetched_log,
    }
