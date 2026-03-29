import os
from pathlib import Path
from openai import OpenAI
import truststore
from dotenv import load_dotenv

truststore.inject_into_ssl()
# .env lives in the project root (one level above this core/ folder)
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env", override=True)

# AI-DARD data files (Excel catalog + naming convention DOCX)
# Bundled inside the project under data/ so the repo is fully self-contained
_DATA_DIR = Path(__file__).parent.parent / "data"
DARD_EXCEL_PATH = Path(os.environ.get("DARD_EXCEL_PATH", str(_DATA_DIR / "artefacts.xlsx")))
DARD_DOCX_PATH  = Path(os.environ.get("DARD_DOCX_PATH",  str(_DATA_DIR / "S4HANA-Naming Convention Standards-v1.0 3.docx")))
DARD_API_URL    = os.environ.get("DARD_API_URL", "https://sapash94.europe.shell.com:8694/sap/opu/odata/sap/ZSB_MAIN_DEPENDENT_V2/main")

SAP_URL_D59 = os.environ.get("SAP_URL_D59", "").rstrip("/")
SAP_URL_K59 = os.environ.get("SAP_URL_K59", "").rstrip("/")
SAP_URL_S59 = os.environ.get("SAP_URL_S59", "").rstrip("/")
SAP_URL_L59 = os.environ.get("SAP_URL_L59", "").rstrip("/")
SAP_URL_A59 = os.environ.get("SAP_URL_A59", "").rstrip("/")
SAP_URL_P59 = os.environ.get("SAP_URL_P59", "").rstrip("/")

NVIDIA_API_KEY  = os.environ.get("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
OPENAI_MODEL    = os.environ.get("OPENAI_MODEL", "openai/gpt-oss-120b")

_SYSTEM_URL_MAP = {
    "D59": SAP_URL_D59,
    "K59": SAP_URL_K59,
    "S59": SAP_URL_S59,
    "L59": SAP_URL_L59,
    "A59": SAP_URL_A59,
    "P59": SAP_URL_P59,
}

VALID_SYSTEMS    = list(_SYSTEM_URL_MAP.keys())
TR_VALID_SYSTEMS = ["D59", "K59", "S59", "L59", "A59", "P59"]

ARTIFACT_TYPES = ["Class", "Function Module", "Report/Program", "CDS View"]

CODE_REVIEW_ARTIFACT_TYPES = [
    "Class",
    "Function Module",
    "Report/Program",
    "CDS View",
    "Interface",
    "Include",
    "Package",
]

ANALYSIS_ARTIFACT_TYPES = [
    "Class",
    "Function Module",
    "Report/Program",
    "CDS View",
    "Interface",
    "Include",
    "Transaction (TCode)",
    "Package",
]

IMPACT_ARTIFACT_TYPES = [
    "Class",
    "Function Module",
    "Report/Program",
    "Include",
    "Interface",
    "CDS View",
    "Table",
    "Structure",
    "Data Element",
]

ANALYSIS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_abap_artifact",
            "description": (
                "Fetch the complete source code of any ABAP artifact from the SAP system. "
                "Use for: Class, Function Module, Report/Program, Include, Interface, CDS View."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "artifact_type": {
                        "type": "string",
                        "enum": ["Class", "Function Module", "Report/Program", "Include", "Interface", "CDS View"],
                    },
                    "artifact_name": {"type": "string", "description": "Exact technical name"},
                    "function_group": {"type": "string", "description": "Required when artifact_type is Function Module"},
                },
                "required": ["artifact_type", "artifact_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_table_definition",
            "description": "Fetch the DDIC definition (fields and types) of a database table.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {"type": "string", "description": "DDIC table name (e.g. MARA, /SHL/MY_TABLE)"},
                },
                "required": ["table_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_structure",
            "description": "Fetch the DDIC definition of a structure (fields, component types).",
            "parameters": {
                "type": "object",
                "properties": {
                    "structure_name": {"type": "string", "description": "DDIC structure name"},
                },
                "required": ["structure_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_type_info",
            "description": "Fetch a DDIC data element or domain definition to understand a type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type_name": {"type": "string", "description": "Data element or domain name"},
                },
                "required": ["type_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_function_group",
            "description": "Fetch all source code of a function group (top include + all FMs inside it).",
            "parameters": {
                "type": "object",
                "properties": {
                    "function_group": {"type": "string", "description": "Function group name"},
                },
                "required": ["function_group"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_package",
            "description": "List all objects inside an ABAP package to understand what it contains.",
            "parameters": {
                "type": "object",
                "properties": {
                    "package_name": {"type": "string", "description": "Package name (e.g. /SHL/MY_PKG)"},
                },
                "required": ["package_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_objects",
            "description": "Search for ABAP objects by name pattern. Use when you need to find the exact name of a class, FM, program, or include.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search term or name pattern (e.g. /SHL/CL_FLOG*)"},
                    "max_results": {"type": "integer", "description": "Max results to return (default 20)", "default": 20},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_transaction",
            "description": "Fetch metadata and properties of an SAP transaction code (TCode) — what program it runs, its package, description, and application area.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tcode": {"type": "string", "description": "Transaction code (e.g. ME21N, /SHL/MYTCODE)"},
                },
                "required": ["tcode"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_program_includes",
            "description": (
                "Fetch the list of all includes belonging to a program or module pool. "
                "Use this when a program is too large to analyse at once. "
                "The list shows include names and descriptions so you can decide which "
                "specific includes to fetch with fetch_abap_artifact."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "program_name": {"type": "string", "description": "Program or module pool name (e.g. SAPMV45A, RMMMPURCHORD)"},
                },
                "required": ["program_name"],
            },
        },
    },
]

# Max chars to feed into the model for each artifact type
MAX_PRIMARY_CHARS          = 80_000   # first call — no conversation history yet
MAX_FOLLOWUP_PRIMARY_CHARS = 40_000   # follow-up calls — history already fills context
MAX_FETCHED_CHARS          = 40_000
MAX_REVIEW_CHARS           = 60_000
MAX_DIFF_CHARS             = 50_000
# Total chars budget across ALL auto-fetched artifacts in one agentic session.
MAX_AGENTIC_CONTEXT_CHARS  = 60_000

openai_client = OpenAI(
    api_key=NVIDIA_API_KEY,
    base_url=NVIDIA_BASE_URL,
)
