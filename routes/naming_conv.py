"""
routes/naming_conv.py
Naming Convention Assistant route.

POST /api/naming-conv/ask  - answer a naming convention question using NVIDIA AI
"""

from fastapi import APIRouter, HTTPException

from core.config import DARD_DOCX_PATH
from core.models import NamingConvRequest
from core.naming_conv import answer_naming_question, SYSTEM_PREFIXES

router = APIRouter()


@router.post("/api/naming-conv/ask")
async def naming_conv_ask(payload: NamingConvRequest):
    """
    Answer a SAP naming convention question using the official standards document
    as context, powered by NVIDIA AI.

    The system field ("ADC" or "Nucleus") determines which object prefix
    (/SHL/ or /DS1/) is applied to all examples in the AI response.
    """
    if not payload.question.strip():
        raise HTTPException(400, "Question is required.")

    if payload.system not in SYSTEM_PREFIXES:
        valid = list(SYSTEM_PREFIXES.keys())
        raise HTTPException(400, f"System must be one of: {valid}. Got: '{payload.system}'.")

    if not DARD_DOCX_PATH.exists():
        raise HTTPException(
            500,
            f"Naming convention document not found at: {DARD_DOCX_PATH}. "
            "Set DARD_DOCX_PATH in .env to the correct path."
        )

    try:
        result = answer_naming_question(DARD_DOCX_PATH, payload.question.strip(), payload.system)
    except FileNotFoundError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error processing question: {str(e)[:300]}")

    return result
