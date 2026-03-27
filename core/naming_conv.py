"""
core/naming_conv.py
Naming Convention Assistant: RAG on the DOCX standards document + NVIDIA AI.

Extracts text from the naming conventions DOCX file, then asks the NVIDIA AI
to answer a user question using that document as context.
The correct system prefix (/SHL/ for ADC, /DS1/ for Nucleus) is applied.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

from core.ai_client import call_ai


# Prefix mapping per project/system selection
SYSTEM_PREFIXES: dict[str, str] = {
    "ADC":     "/SHL/",
    "Nucleus": "/DS1/",
}

# Cache so we don't re-parse the DOCX on every request
_doc_cache: dict[str, str] = {}


def _extract_docx_text(docx_path: Path) -> str:
    """
    Extract plain text from a .docx file by reading its word/document.xml.
    Uses a simple caching mechanism to avoid repeated file reads.
    """
    cache_key = str(docx_path)
    if cache_key in _doc_cache:
        return _doc_cache[cache_key]

    if not docx_path.exists():
        raise FileNotFoundError(
            f"Naming convention document not found at: {docx_path}\n"
            "Set DRAD_DOCX_PATH in your .env file to the correct location."
        )

    with zipfile.ZipFile(str(docx_path), 'r') as z:
        with z.open('word/document.xml') as f:
            xml_content = f.read().decode('utf-8', errors='replace')

    # Replace paragraph/line break tags with newlines before stripping tags
    xml_content = re.sub(r'</w:p>', '\n', xml_content)
    xml_content = re.sub(r'<w:br[^/]*/>', '\n', xml_content)

    # Strip all remaining XML tags
    plain = re.sub(r'<[^>]+>', '', xml_content)

    # Clean up whitespace
    plain = re.sub(r'[ \t]+', ' ', plain)
    plain = re.sub(r'\n{3,}', '\n\n', plain)
    plain = plain.strip()

    _doc_cache[cache_key] = plain
    return plain


def answer_naming_question(docx_path: Path, question: str, system: str) -> dict:
    """
    Answer a naming convention question using the DOCX as context and NVIDIA AI.

    Args:
        docx_path: Path to the naming conventions .docx file.
        question:  The user's question.
        system:    "ADC" or "Nucleus" — controls which prefix to use in AI suggestions.

    Returns:
        {answer: str, question: str, system: str}
    """
    try:
        doc_text = _extract_docx_text(docx_path)
    except FileNotFoundError as e:
        return {'answer': str(e), 'question': question, 'system': system}

    prefix = SYSTEM_PREFIXES.get(system, "/SHL/")
    other_prefix = "/DS1/" if prefix == "/SHL/" else "/SHL/"

    # Limit document context to avoid token overflow
    doc_context = doc_text[:10_000]

    prompt = f"""You are an expert SAP ABAP developer and naming convention advisor.

The following is content extracted from the official S/4HANA Naming Convention Standards document:

--- DOCUMENT START ---
{doc_context}
--- DOCUMENT END ---

SYSTEM CONTEXT:
The user is developing for the "{system}" project.
In all example names and suggestions you provide, always use the prefix "{prefix}".
Do NOT use "{other_prefix}" in your suggestions — only "{prefix}".
For example: instead of "{other_prefix}MY_CLASS" write "{prefix}MY_CLASS".

USER QUESTION:
{question}

INSTRUCTIONS:
- Answer using only the document content above as your knowledge source.
- Always use "{prefix}" as the object prefix in all examples and suggestions.
- Structure your answer clearly with headers and bullet points where appropriate.
- Be specific and practical — give concrete naming examples.
- If the document does not address the question, clearly state what information is missing.
- Keep the answer focused and concise."""

    try:
        answer = call_ai(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2048,
        )
    except Exception as e:
        return {
            'answer': f"AI service error: {str(e)[:300]}",
            'question': question,
            'system': system,
        }

    return {'answer': answer, 'question': question, 'system': system}
