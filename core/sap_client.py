from typing import Optional
from urllib.parse import quote
import json

import requests
try:
    import xmltodict
except ImportError:
    xmltodict = None
from requests_negotiate_sspi import HttpNegotiateAuth

from core.config import _SYSTEM_URL_MAP, VALID_SYSTEMS, SAP_URL_D59, SAP_URL_S59


def get_session() -> requests.Session:
    session = requests.Session()
    session.auth = HttpNegotiateAuth()
    session.headers.update({"X-SAP-Client": "110"})
    return session


def fetch_odata_all_pages(session: requests.Session, url: str,
                           base_url: str, headers: Optional[dict] = None,
                           timeout: int = 30) -> list:
    """Follow OData @odata.nextLink pagination and return all records combined."""
    all_records: list = []
    current_url: Optional[str] = url
    while current_url:
        resp = session.get(current_url, headers=headers or {}, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        records = data.get("value", [])
        all_records.extend(records)
        nxt = data.get("@odata.nextLink")
        if nxt:
            # nextLink may be relative (starts with /) — prepend the base URL
            current_url = (base_url.rstrip("/") + nxt) if nxt.startswith("/") else nxt
        else:
            current_url = None
    return all_records


def resolve_url(system_id: str) -> str:
    url = _SYSTEM_URL_MAP.get(system_id.upper())
    if not url:
        raise ValueError(f"Invalid system ID '{system_id}'. Allowed: {VALID_SYSTEMS}")
    return url


def fetch_source(
    session: requests.Session,
    sap_url: str,
    artifact_type: str,
    artifact_name: str,
    function_group: Optional[str] = None,
) -> str:
    encoded = quote(artifact_name, safe="")

    if artifact_type == "Report/Program":
        # Primary: executable / module pool programs
        resp = session.get(
            f"{sap_url}/sap/bc/adt/programs/programs/{encoded}/source/main", timeout=30
        )
        if resp.status_code == 422:
            # Function pools (SAPL* prefix) have program type 'F' in ABAP and are
            # not accessible via /programs/programs/ in ADT — fall back to includes.
            resp = session.get(
                f"{sap_url}/sap/bc/adt/programs/includes/{encoded}/source/main", timeout=30
            )
        resp.raise_for_status()
        return resp.text or ""

    if artifact_type == "Class":
        url = f"{sap_url}/sap/bc/adt/oo/classes/{encoded}/source/main"
    elif artifact_type == "Function Module":
        encoded_group = quote(function_group or "", safe="")
        url = f"{sap_url}/sap/bc/adt/functions/groups/{encoded_group}/fmodules/{encoded}/source/main"
    elif artifact_type == "CDS View":
        url = f"{sap_url}/sap/bc/adt/ddic/ddl/sources/{encoded}/source/main"
    elif artifact_type == "Interface":
        url = f"{sap_url}/sap/bc/adt/oo/interfaces/{encoded}/source/main"
    elif artifact_type == "Include":
        url = f"{sap_url}/sap/bc/adt/programs/includes/{encoded}/source/main"
    else:
        raise ValueError(f"Unsupported artifact type: {artifact_type}")

    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or ""


def fetch_transaction_info(session: requests.Session, sap_url: str, tcode: str) -> str:
    encoded = quote(tcode, safe="")
    # Primary: direct ADT transaction object (works for both standard and custom transactions)
    resp = session.get(
        f"{sap_url}/sap/bc/adt/vit/wb/object_type/trant/object_name/{encoded}",
        timeout=30,
    )
    if resp.status_code in (404, 422):
        # Fall back to object-properties metadata endpoint
        resp = session.get(
            f"{sap_url}/sap/bc/adt/repository/informationsystem/objectproperties/values"
            f"?uri=%2Fsap%2Fbc%2Fadt%2Fvit%2Fwb%2Fobject_type%2Ftrant%2Fobject_name%2F{encoded}"
            f"&facet=package&facet=appl",
            timeout=30,
        )
    resp.raise_for_status()
    return resp.text or f"Transaction {tcode}"


def fetch_tr_dependencies(tr_number: str, destination_sysid: str) -> list[dict]:
    url = (
        f"{SAP_URL_S59}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/"
        f"api_re_artifacts/0001/TR_DEP(p_tr_number='{tr_number}',"
        f"p_dest_sysid='{destination_sysid}')/Set"
        f"?sap-client=100"
    )
    session = get_session()
    response = session.get(url, headers={"X-SAP-Client": "100"}, timeout=30)
    response.raise_for_status()
    return response.json().get("value", [])


def fetch_table_definition(session: requests.Session, sap_url: str, table_name: str) -> str:
    encoded = quote(table_name, safe="")
    url = f"{sap_url}/sap/bc/adt/ddic/tables/{encoded}/source/main"
    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or ""


def fetch_structure(session: requests.Session, sap_url: str, structure_name: str) -> str:
    encoded = quote(structure_name, safe="")
    url = f"{sap_url}/sap/bc/adt/ddic/structures/{encoded}/source/main"
    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or ""


def fetch_type_info(session: requests.Session, sap_url: str, type_name: str) -> str:
    """Tries Domain first, falls back to Data Element."""
    encoded = quote(type_name, safe="")
    try:
        url = f"{sap_url}/sap/bc/adt/ddic/domains/{encoded}/source/main"
        response = session.get(url, timeout=30)
        response.raise_for_status()
        return response.text or ""
    except requests.HTTPError:
        url = f"{sap_url}/sap/bc/adt/ddic/dataelements/{encoded}"
        response = session.get(url, timeout=30)
        response.raise_for_status()
        return response.text or ""


def fetch_function_group(session: requests.Session, sap_url: str, function_group: str) -> str:
    encoded = quote(function_group, safe="")
    url = f"{sap_url}/sap/bc/adt/functions/groups/{encoded}/source/main"
    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or ""


def fetch_package(session: requests.Session, sap_url: str, package_name: str) -> str:
    url = f"{sap_url}/sap/bc/adt/repository/nodestructure"
    # CSRF token needed for POST
    csrf_resp = session.get(url, headers={"x-csrf-token": "Fetch"}, timeout=15)
    csrf_token = csrf_resp.headers.get("x-csrf-token", "")
    response = session.post(
        url,
        params={"parent_type": "DEVC/K", "parent_name": package_name, "withShortDescriptions": "true"},
        headers={"x-csrf-token": csrf_token},
        timeout=30,
    )
    response.raise_for_status()
    if not response.text.strip():
        return json.dumps({"message": f"Package '{package_name}' exists but contains no objects."})
    if xmltodict:
        parsed = xmltodict.parse(response.text)
        nodes = (
            parsed.get("asx:abap", {}).get("asx:values", {})
            .get("DATA", {}).get("TREE_CONTENT", {})
            .get("SEU_ADT_REPOSITORY_OBJ_NODE", [])
        )
        if isinstance(nodes, dict):
            nodes = [nodes]
        result = [
            {"type": n.get("OBJECT_TYPE"), "name": n.get("OBJECT_NAME"), "description": n.get("DESCRIPTION")}
            for n in (nodes or []) if n.get("OBJECT_NAME")
        ]
        return json.dumps(result)
    return response.text


def search_objects(session: requests.Session, sap_url: str, query: str, max_results: int = 20) -> str:
    encoded_query = quote(query, safe="")
    url = (
        f"{sap_url}/sap/bc/adt/repository/informationsystem/search"
        f"?operation=quickSearch&query={encoded_query}&maxResults={max_results}"
    )
    response = session.get(url, timeout=30)
    response.raise_for_status()
    return response.text or ""


def fetch_program_includes(session: requests.Session, sap_url: str, program_name: str) -> str:
    """
    Fetch the list of includes that belong to a program or module pool.

    Module pools (e.g. SAPMV45A) are split into many includes:
      MV45AF00 — global data (TOP)
      MV45AFxx — FORM routines
      MV45AOxx — PBO modules
      MV45AIxx — PAI modules
    This lets the AI pick which specific includes to fetch instead of loading
    the entire 500k+ program at once.
    """
    url = f"{sap_url}/sap/bc/adt/repository/nodestructure"

    # Fetch CSRF token (required for POST)
    csrf_resp = session.get(url, headers={"x-csrf-token": "Fetch"}, timeout=15)
    csrf_token = csrf_resp.headers.get("x-csrf-token", "")

    # Try PROG/P first (covers both reports and module pools in ADT)
    response = session.post(
        url,
        params={"parent_type": "PROG/P", "parent_name": program_name, "withShortDescriptions": "true"},
        headers={"x-csrf-token": csrf_token},
        timeout=30,
    )
    response.raise_for_status()

    if not response.text.strip():
        return f"No includes found for program '{program_name}'."

    if xmltodict:
        parsed = xmltodict.parse(response.text)
        nodes = (
            parsed.get("asx:abap", {}).get("asx:values", {})
            .get("DATA", {}).get("TREE_CONTENT", {})
            .get("SEU_ADT_REPOSITORY_OBJ_NODE", [])
        )
        if isinstance(nodes, dict):
            nodes = [nodes]

        # Filter to only include nodes (type PROG/I) — skip the program node itself
        includes = [
            {"name": n.get("OBJECT_NAME"), "description": n.get("DESCRIPTION", "")}
            for n in (nodes or [])
            if n.get("OBJECT_TYPE") == "PROG/I" and n.get("OBJECT_NAME")
        ]

        if not includes:
            return f"No includes found for program '{program_name}'."

        lines = [f"Includes for program '{program_name}' ({len(includes)} total):"]
        for inc in includes:
            lines.append(f"  {inc['name']:<40} {inc['description']}")
        return "\n".join(lines)

    return response.text


# Object-type codes used by the where-used OData service.
# These are the short codes the endpoint actually accepts (NOT the ADT slash-codes).
WHEREUSED_TYPE_MAP = {
    "Class":            "CLAS",
    "Function Module":  "FUNC",
    "Report/Program":   "PROG",
    "Include":          "REPS",
    "Interface":        "INTF",
    "CDS View":         "DDLS",
    "Table":            "TABL",
    "Structure":        "STRU",
    "Data Element":     "DTEL",
    "Domain":           "DOMA",
}


def fetch_whereused(
    session: requests.Session,
    sap_url: str,
    object_name: str,
    object_type: str,
) -> list[dict]:
    """
    Call the where-used OData endpoint for any ABAP object.
    Returns the raw list of records from the 'value' array.

    object_type should be a friendly type name (e.g. 'Class', 'Function Module')
    or an ADT type code (e.g. 'CLAS/OC').  If it is a friendly name it is
    mapped to the correct ADT code automatically.
    """
    # Resolve friendly names → ADT type codes
    adt_type = WHEREUSED_TYPE_MAP.get(object_type, object_type)

    encoded_name = quote(object_name, safe="")
    encoded_type = quote(adt_type, safe="")

    url = (
        f"{sap_url}/sap/opu/odata4/shl/api_re_artifacts/srvd_a2x/shl/"
        f"api_re_artifacts/0001/WhereUsed"
        f"(p_objtype='{encoded_type}',p_objname='{encoded_name}')/Set"
        f"?sap-client=100"
    )
    response = session.get(url, headers={"X-SAP-Client": "100"}, timeout=30)
    response.raise_for_status()
    return response.json().get("value", [])

# ── Object-type codes returned by fetch_package → friendly fetch type ─────────
_PACKAGE_OBJ_TYPE_MAP = {
    "CLAS/OC": "Class",
    "PROG/P":  "Report/Program",
    "PROG/I":  "Include",
    "INTF/OI": "Interface",
    "DDLS/DF": "CDS View",
}


def collect_includes_source(
    session: requests.Session,
    sap_url: str,
    program_name: str,
    char_budget: int = 50_000,
) -> str:
    """
    Fetch and concatenate all includes belonging to a program/module pool up to
    char_budget characters. Returns an empty string if no includes are found.
    """
    try:
        inc_list = fetch_program_includes(session, sap_url, program_name)
    except Exception:
        return ""

    include_names = []
    for line in inc_list.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("Includes for") and not stripped.startswith("No includes"):
            parts = stripped.split()
            if parts and len(parts[0]) >= 4:
                include_names.append(parts[0])

    sections: list[str] = []
    total_chars = 0
    for inc_name in include_names:
        if total_chars >= char_budget:
            sections.append(f"\n--- INCLUDE BUDGET REACHED: remaining includes skipped ---")
            break
        try:
            code = fetch_source(session, sap_url, "Include", inc_name)
            section = f"\n--- INCLUDE: {inc_name} ---\n{code}\n---"
            sections.append(section)
            total_chars += len(section)
        except Exception:
            pass

    return "".join(sections)


def fetch_reviewable_source(
    session: requests.Session,
    sap_url: str,
    artifact_type: str,
    artifact_name: str,
    function_group: Optional[str] = None,
    char_budget: int = 60_000,
) -> str:
    """
    Fetch complete source for code review / TS generation, pulling in all
    dependent artifacts automatically:

    - Report/Program  → main source + all includes (up to char_budget)
    - Package         → source of each contained Class/Program/FM/Interface/CDS View
                        (up to 6 objects, up to char_budget total chars)
    - All others      → delegates directly to fetch_source
    """
    if artifact_type == "Report/Program":
        main_source = fetch_source(session, sap_url, "Report/Program", artifact_name)
        sections = [f"--- MAIN PROGRAM: {artifact_name} ---\n{main_source}\n---"]
        remaining_budget = max(0, char_budget - len(main_source))
        if remaining_budget > 5_000:
            includes = collect_includes_source(session, sap_url, artifact_name, remaining_budget)
            if includes:
                sections.append(includes)
        return "\n\n".join(sections)

    if artifact_type == "Package":
        raw = fetch_package(session, sap_url, artifact_name)
        try:
            objects = json.loads(raw)
        except Exception:
            return raw

        MAX_PKG_OBJECTS = 6
        sections: list[str] = []
        total_chars = 0
        fetched = 0

        for obj in objects:
            if fetched >= MAX_PKG_OBJECTS or total_chars >= char_budget:
                remaining = len(objects) - fetched
                if remaining > 0:
                    sections.append(
                        f"--- {remaining} more object(s) in package not fetched "
                        f"(object/budget limit reached) ---"
                    )
                break

            obj_type = obj.get("type", "")
            obj_name = (obj.get("name") or "").strip()
            if not obj_name:
                continue

            try:
                if obj_type == "FUGR":
                    code = fetch_function_group(session, sap_url, obj_name)
                    label = "FUNCTION GROUP"
                else:
                    fetch_type = _PACKAGE_OBJ_TYPE_MAP.get(obj_type)
                    if not fetch_type:
                        continue
                    code = fetch_source(session, sap_url, fetch_type, obj_name)
                    label = fetch_type
                    if fetch_type == "Report/Program":
                        inc_budget = max(0, char_budget - total_chars - len(code) - 10_000)
                        if inc_budget > 5_000:
                            incs = collect_includes_source(session, sap_url, obj_name, inc_budget)
                            if incs:
                                code = code + incs

                section = f"--- {label}: {obj_name} ---\n{code}\n---"
                sections.append(section)
                total_chars += len(section)
                fetched += 1
            except Exception:
                pass

        if not sections:
            return f"Package '{artifact_name}': no fetchable ABAP objects found."
        return "\n\n".join(sections)

    return fetch_source(session, sap_url, artifact_type, artifact_name, function_group)

def _resolve_single_object_type(session, sap_url: str, name: str) -> str:
    """Probe SAP ADT to determine real type of a data source name."""
    encoded = quote(name, safe="")
    checks = [
        (f"{sap_url}/sap/bc/adt/ddic/ddl/sources/{encoded}/source/main", "CDS View"),
        (f"{sap_url}/sap/bc/adt/ddic/tables/{encoded}/source/main",       "Table"),
        (f"{sap_url}/sap/bc/adt/ddic/structures/{encoded}/source/main",   "Structure"),
    ]
    for url, label in checks:
        try:
            r = session.get(url, timeout=8)
            if r.status_code == 200:
                return label
        except Exception:
            pass
    return "Unknown"


def extract_and_resolve_data_sources(
    session,
    sap_url: str,
    source_code: str,
    max_objects: int = 20,
) -> dict:
    """
    Parse FROM clauses in ABAP source, probe ADT to determine whether each
    data source is a CDS View, Table, Structure, or Unknown.
    Returns {NAME: type_label}. Capped at max_objects to avoid too many calls.
    """
    import re
    SKIP = {
        "INNER", "LEFT", "RIGHT", "OUTER", "JOIN", "WHERE", "AS", "CLIENT",
        "SPECIFIED", "BYPASSING", "BUFFER", "UP", "TO", "INTO", "APPENDING",
        "PACKAGE", "SIZE", "DISTINCT", "SINGLE", "COUNT", "SUM", "MIN", "MAX",
        "AVG", "FOR", "ALL", "ENTRIES", "CROSS", "USING", "KEY",
    }
    names = set()
    for m in re.finditer(r'\bFROM\s+([/\$@\w]+)', source_code, re.IGNORECASE):
        candidate = m.group(1).upper().lstrip("@")
        if candidate not in SKIP and len(candidate) > 2 and not candidate.isdigit():
            names.add(candidate)
    resolved = {}
    for name in list(names)[:max_objects]:
        resolved[name] = _resolve_single_object_type(session, sap_url, name)
    return resolved
