from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request

from core.config import VALID_SYSTEMS, ARTIFACT_TYPES, CODE_REVIEW_ARTIFACT_TYPES, TR_VALID_SYSTEMS, ANALYSIS_ARTIFACT_TYPES, IMPACT_ARTIFACT_TYPES

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {
        "valid_systems": VALID_SYSTEMS,
        "artifact_types": ARTIFACT_TYPES,
        "code_review_artifact_types": CODE_REVIEW_ARTIFACT_TYPES,
        "tr_valid_systems": TR_VALID_SYSTEMS,
        "analysis_artifact_types": ANALYSIS_ARTIFACT_TYPES,
        "impact_artifact_types": IMPACT_ARTIFACT_TYPES,
    })
