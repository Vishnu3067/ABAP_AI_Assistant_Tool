from typing import Optional
from pydantic import BaseModel


class RetrofitRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    source_system: str
    destination_system: str


class DiffLine(BaseModel):
    content: str
    type: str  # "equal" | "changed" | "removed" | "added" | "empty"


class CodeReviewRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    system: str = "D59"


class TrAnalysisRequest(BaseModel):
    tr_number: str
    destination_system: str


class TsFinalizationRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    system: str = "D59"


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatAnalysisRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    system: str = "D59"
    tcode: Optional[str] = None
    source_code: Optional[str] = None
    messages: list[ChatMessage]


class ReusableArtifactsRequest(BaseModel):
    question: str


class ImpactAnalysisRequest(BaseModel):
    artifact_name: str
    artifact_type: str
    function_group: Optional[str] = None
    system: str = "D59"
    planned_change: str   # what the user intends to do / delete / modify


# ── AI-DRAD models ────────────────────────────────────────────────────────────

class DradSearchRequest(BaseModel):
    description: str


class DradSelectedItem(BaseModel):
    system_no: str
    object_name: str


class DradFetchRequest(BaseModel):
    selected_items: list[DradSelectedItem]
    do_ai_analysis: bool = False  # True only for Retrofit; plain Fetch Code skips AI


class DradArtifactCode(BaseModel):
    system_no: str
    object_name: str
    code: str


class DradGenerateCodeRequest(BaseModel):
    artifacts: list[DradArtifactCode]
    target_system: str = ""  # Which system to generate code for; defaults to first artifact's system


# ── Naming Convention Assistant models ────────────────────────────────────────

class NamingConvRequest(BaseModel):
    question: str
    system: str   # "ADC" or "Nucleus"

