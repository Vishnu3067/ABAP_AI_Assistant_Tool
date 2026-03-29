"""
core/dard_fetch.py
AI-DARD: SAP OData fetch module.

Fetches ABAP program source code (main program + child dependencies)
from the ZSB_MAIN_DEPENDENT_V2 OData service using Windows SSPI auth.
"""

from __future__ import annotations

import json
from typing import List

import requests
from requests_negotiate_sspi import HttpNegotiateAuth

from core.config import DARD_API_URL


# RFC destination per system ID — extend this as more systems are onboarded
_RFC_MAPPING: dict[str, str] = {
    "K94": "TRUSTING@K94_0020183341",
    "H94": "NONE",
}


def get_rfc_destination(system_no: str) -> str:
    """
    Return the RFC destination string for the given system.
    Raises ValueError if the system is not yet configured.
    """
    dest = _RFC_MAPPING.get(system_no.upper())
    if dest is None:
        configured = list(_RFC_MAPPING.keys())
        raise ValueError(
            f"System '{system_no}' has no configured RFC destination. "
            f"Currently configured: {configured}. "
            "Please add it to _RFC_MAPPING in core/dard_fetch.py."
        )
    return dest


def get_configured_systems() -> list:
    """Return the list of system IDs that have RFC destinations configured."""
    return list(_RFC_MAPPING.keys())


def _get_session() -> requests.Session:
    """Create a requests session with Windows SSPI/Kerberos authentication."""
    session = requests.Session()
    session.auth = HttpNegotiateAuth()
    session.verify = False  # SAP self-signed certificates
    return session


def _parse_source_json(raw) -> str:
    """Parse source_json field: either a JSON array of line strings or a plain string."""
    if raw is None:
        return ''
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return '\n'.join(str(l) for l in parsed)
        except (json.JSONDecodeError, ValueError):
            return raw  # already plain text
    if isinstance(raw, list):
        return '\n'.join(str(l) for l in raw)
    return str(raw)


def _extract_sections(report_json: dict, fallback_name: str) -> List[dict]:
    """
    Parse OData JSON response into a list of code sections.
    Returns [{label, code, is_main}] where index 0 is the main program
    and the rest are dependent child programs/includes.
    """
    sections = []
    results = report_json.get('d', {}).get('results', [])

    if not results:
        return sections

    for idx, entry in enumerate(results):
        # API returns source_json (JSON array of lines), not plain line_value
        main_code = _parse_source_json(entry.get('source_json') or entry.get('line_value'))
        main_name = (entry.get('report_name') or fallback_name).strip()

        # Strip leading REPORT statement (cosmetic)
        lines = main_code.splitlines()
        if lines and lines[0].strip().upper().startswith('REPORT'):
            main_code = '\n'.join(lines[1:]).lstrip('\n')

        label = main_name if idx == 0 else f"Main Source {idx + 1}"
        sections.append({'label': label, 'code': main_code, 'is_main': idx == 0})

        # Child dependencies / includes
        children = entry.get('to_Child', {}).get('results', [])
        for cidx, child in enumerate(children):
            child_code = _parse_source_json(child.get('source_json') or child.get('line_value'))
            child_name = (child.get('dep_object') or child.get('report_name') or f"Include {cidx + 1}").strip()
            sections.append({'label': child_name, 'code': child_code, 'is_main': False})

    return sections


def fetch_artifact_code(system_no: str, object_name: str) -> dict:
    """
    Fetch source code for a single artifact from the SAP OData service.

    Returns:
        {
            object_name: str,
            system_no: str,
            sections:  [{label, code, is_main}],   # empty on error
            error:     str | None
        }
    """
    try:
        rfc_dest = get_rfc_destination(system_no)
    except ValueError as e:
        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': [],
            'error': str(e),
        }

    if not DARD_API_URL:
        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': [],
            'error': "DARD_API_URL is not configured in .env",
        }

    session = _get_session()
    params = {
        '$expand': 'to_Child',
        # TODO: re-enable rfc_destination filter once SAP OData service supports it
        # '$filter': f"report_name eq '{object_name}' and rfc_destination eq '{rfc_dest}'",
        '$filter': f"report_name eq '{object_name}'",
        '$format': 'json',
    }

    try:
        response = session.get(DARD_API_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        sections = _extract_sections(data, object_name)

        if not sections:
            return {
                'object_name': object_name,
                'system_no': system_no,
                'sections': [],
                'error': f"Artifact '{object_name}' not found in system {system_no}.",
            }

        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': sections,
            'error': None,
        }

    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else '?'
        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': [],
            'error': f"SAP returned HTTP {status} for '{object_name}'.",
        }
    except requests.exceptions.ConnectionError:
        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': [],
            'error': f"Cannot connect to SAP system {system_no}. Check network / VPN.",
        }
    except requests.exceptions.Timeout:
        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': [],
            'error': f"Request timed out while fetching '{object_name}' from {system_no}.",
        }
    except Exception as e:
        return {
            'object_name': object_name,
            'system_no': system_no,
            'sections': [],
            'error': str(e)[:200],
        }
