"""
routes/ts_creation.py — TS Creation Tool

POST /api/ts-creation/generate    — upload FS .docx, AI fills TS template
POST /api/ts-creation/regenerate  — refine with user feedback
GET  /api/ts-creation/download/{doc_id} — download generated .docx
"""
import io
import uuid
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from core.config import TS_TEMPLATE_PATH
from core.models import TsCreationRegenerateRequest
from core.ts_creation import (
    ask_ai_fill_placeholders,
    docx_to_preview_html,
    extract_fs_text,
    extract_placeholders,
    render_ts_docx,
)

router = APIRouter()

# In-memory sessions: {doc_id: {fs_text, placeholders, values, docx_bytes, fs_filename}}
_sessions: dict = {}

MAX_FS_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/api/ts-creation/generate")
async def ts_creation_generate(fs_file: UploadFile = File(...)):
    if not (fs_file.filename or "").lower().endswith(".docx"):
        raise HTTPException(400, "Only .docx files are accepted.")

    docx_bytes = await fs_file.read()
    if len(docx_bytes) > MAX_FS_BYTES:
        raise HTTPException(413, "File too large. Maximum 20 MB.")

    if not TS_TEMPLATE_PATH.exists():
        raise HTTPException(500, f"TS template not found at: {TS_TEMPLATE_PATH}")

    try:
        fs_text = extract_fs_text(docx_bytes)
    except Exception as e:
        raise HTTPException(400, f"Could not read the uploaded file: {str(e)[:200]}")

    if len(fs_text.strip()) < 50:
        raise HTTPException(400, "The uploaded document appears to be empty or unreadable.")

    try:
        placeholders = extract_placeholders(TS_TEMPLATE_PATH)
    except Exception as e:
        raise HTTPException(500, f"Could not read TS template placeholders: {str(e)[:200]}")

    try:
        filled_values = ask_ai_fill_placeholders(placeholders, fs_text)
    except Exception as e:
        raise HTTPException(500, f"AI generation error: {str(e)[:300]}")

    try:
        rendered_bytes = render_ts_docx(filled_values, TS_TEMPLATE_PATH)
    except Exception as e:
        raise HTTPException(500, f"Failed to render TS document: {str(e)[:200]}")

    try:
        preview_html = docx_to_preview_html(rendered_bytes)
    except Exception as e:
        preview_html = "<p><em>Preview unavailable. Please download the file.</em></p>"

    doc_id = str(uuid.uuid4())
    _sessions[doc_id] = {
        "fs_text": fs_text,
        "placeholders": placeholders,
        "values": filled_values,
        "docx_bytes": rendered_bytes,
        "fs_filename": fs_file.filename or "FS_document.docx",
    }

    return {
        "doc_id": doc_id,
        "preview_html": preview_html,
        "placeholder_count": len(placeholders),
        "fs_filename": fs_file.filename,
    }


@router.post("/api/ts-creation/regenerate")
async def ts_creation_regenerate(payload: TsCreationRegenerateRequest):
    session = _sessions.get(payload.doc_id)
    if not session:
        raise HTTPException(
            404,
            "Session expired or not found. Please upload the FS document again.",
        )

    if not payload.feedback.strip():
        raise HTTPException(400, "Please provide feedback or instructions for the regeneration.")

    try:
        filled_values = ask_ai_fill_placeholders(
            session["placeholders"],
            session["fs_text"],
            feedback=payload.feedback,
            current_values=session["values"],
        )
    except Exception as e:
        raise HTTPException(500, f"AI generation error: {str(e)[:300]}")

    try:
        rendered_bytes = render_ts_docx(filled_values, TS_TEMPLATE_PATH)
    except Exception as e:
        raise HTTPException(500, f"Failed to render TS document: {str(e)[:200]}")

    try:
        preview_html = docx_to_preview_html(rendered_bytes)
    except Exception as e:
        preview_html = "<p><em>Preview unavailable. Please download the file.</em></p>"

    # Update session in place so the same doc_id stays valid
    session["values"] = filled_values
    session["docx_bytes"] = rendered_bytes

    return {
        "doc_id": payload.doc_id,
        "preview_html": preview_html,
    }


@router.get("/api/ts-creation/download/{doc_id}")
async def ts_creation_download(doc_id: str):
    session = _sessions.get(doc_id)
    if not session:
        raise HTTPException(
            404,
            "Session expired. Please generate the TS again before downloading.",
        )

    filename = (
        session.get("fs_filename", "TechnicalSpecification")
        .replace(".docx", "")
        .replace(" ", "_")
    )
    download_name = f"TS_{filename}.docx"

    return StreamingResponse(
        io.BytesIO(session["docx_bytes"]),
        media_type=(
            "application/vnd.openxmlformats-officedocument"
            ".wordprocessingml.document"
        ),
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )
