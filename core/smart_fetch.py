"""
smart_fetch.py — Two-stage pre-filter for large ABAP artifacts.

PROBLEM:
  Standard SAP programs (module pools, reports behind TCodes) can be 200k-500k+
  characters. Sending the entire source to the AI wastes the context window and
  causes empty replies or truncated answers.

SOLUTION — two stages:
  Stage 1: Parse the source locally to extract routine names
           (FORM routines for programs, METHODs for classes)
  Stage 2: Make one small focused AI call — "which of these names are relevant
           to the question?" — and then build a focused source with only those
           routine bodies.

This typically reduces a 500k-char program down to 5-20k of focused, relevant code.
"""

import re

from core.config import openai_client, OPENAI_MODEL
from core.ai_client import truncate_source


# Trigger the two-stage approach when source exceeds this size
LARGE_THRESHOLD = 60_000


# ── Helpers ──────────────────────────────────────────────────────────────────

def is_large(source_code: str) -> bool:
    return len(source_code) > LARGE_THRESHOLD


# ── FORM routine parsing (for Programs / Module Pools) ───────────────────────

def extract_form_names(source_code: str) -> list[str]:
    """Return the names of all FORM routines found in the source code."""
    matches = re.findall(r'^\s*FORM\s+(\S+)', source_code, re.IGNORECASE | re.MULTILINE)
    # Strip trailing dot if present (e.g. "FORM my_routine." → "my_routine")
    return [name.rstrip('.') for name in matches]


def extract_form_body(source_code: str, form_name: str) -> str:
    """Return the complete FORM ... ENDFORM block for the given routine name."""
    pattern = re.compile(
        r'(^\s*FORM\s+' + re.escape(form_name) + r'\b.*?^\s*ENDFORM\s*\.)',
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(source_code)
    return match.group(1).strip() if match else ""


# ── CLASS METHOD parsing (for Classes) ───────────────────────────────────────

def extract_method_names(source_code: str) -> list[str]:
    """Return the names of all METHOD implementations found in the source code."""
    matches = re.findall(r'^\s*METHOD\s+(\S+)\s*\.', source_code, re.IGNORECASE | re.MULTILINE)
    return [name.rstrip('.') for name in matches]


def extract_method_body(source_code: str, method_name: str) -> str:
    """Return the complete METHOD ... ENDMETHOD block for the given method name."""
    pattern = re.compile(
        r'(^\s*METHOD\s+' + re.escape(method_name) + r'\s*\..*?^\s*ENDMETHOD\s*\.)',
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(source_code)
    return match.group(1).strip() if match else ""


# ── Stage 2: AI relevance picker ─────────────────────────────────────────────

def pick_relevant_parts(
    question: str,
    names: list[str],
    artifact_name: str,
    part_type: str,
) -> list[str]:
    """
    Ask the AI which FORM/METHOD names are most relevant to the user's question.
    Returns a filtered list of names (preserving original case).
    Falls back to an empty list on any failure.
    """
    if not names:
        return []

    name_list = "\n".join(f"- {n}" for n in names)
    prompt = (
        f"SAP ABAP artifact: {artifact_name}\n"
        f"Developer question: \"{question}\"\n\n"
        f"These are all {part_type} routines in this artifact:\n\n"
        f"{name_list}\n\n"
        f"Which of these {part_type} names are most relevant to the question?\n"
        f"Reply with ONLY the relevant names, one per line, maximum 10.\n"
        f"If none seem relevant, reply: NONE"
    )

    try:
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=400,
            stream=False,
        )
        reply = (response.choices[0].message.content or "").strip()

        if not reply or "NONE" in reply.upper():
            return []

        # Build a case-insensitive lookup: lowercase → original name
        name_map = {n.lower(): n for n in names}

        selected = []
        for line in reply.splitlines():
            # Strip common list markers (-, •, numbers) and surrounding whitespace
            candidate = line.strip().lstrip("-•0123456789.) ").rstrip(",.")
            if not candidate:
                continue
            original = name_map.get(candidate.lower())
            if original and original not in selected:
                selected.append(original)

        return selected

    except Exception:
        return []


# ── Main entry point ──────────────────────────────────────────────────────────

def smart_prefilter(
    source_code: str,
    question: str,
    artifact_type: str,
    artifact_name: str,
) -> tuple[str, str]:
    """
    For large programs, return a focused source containing only the relevant parts.

    Returns:
        (focused_source, notice)
        - focused_source: the trimmed/focused code to put in the system prompt
        - notice: a short note explaining what was done (for the system prompt)
    """
    if not is_large(source_code):
        return source_code, ""

    total_chars = len(source_code)

    # ── Classes: focus on relevant METHODs ──────────────────────────────────
    if artifact_type == "Class":
        names = extract_method_names(source_code)
        if names:
            relevant = pick_relevant_parts(question, names, artifact_name, "METHOD")
            if relevant:
                bodies = [extract_method_body(source_code, n) for n in relevant]
                focused = "\n\n".join(b for b in bodies if b)
                notice = (
                    f"ℹ️ Smart focus: {artifact_name} has {len(names)} methods ({total_chars:,} chars total). "
                    f"Showing {len(relevant)} relevant method(s): {', '.join(relevant)}"
                )
                return focused, notice

    # ── Programs / Module Pools: focus on relevant FORM routines ────────────
    elif artifact_type in ("Report/Program", "Include"):
        names = extract_form_names(source_code)
        if names:
            relevant = pick_relevant_parts(question, names, artifact_name, "FORM")
            if relevant:
                bodies = [extract_form_body(source_code, n) for n in relevant]
                focused = "\n\n".join(b for b in bodies if b)
                notice = (
                    f"ℹ️ Smart focus: {artifact_name} has {len(names)} FORM routines ({total_chars:,} chars total). "
                    f"Showing {len(relevant)} relevant routine(s): {', '.join(relevant)}"
                )
                return focused, notice

    # ── Fallback: truncate if no structured parsing was possible ─────────────
    truncated = truncate_source(source_code, LARGE_THRESHOLD)
    notice = (
        f"⚠️ Source is large ({total_chars:,} chars) and was truncated to {LARGE_THRESHOLD:,} chars. "
        f"Ask about a specific method or FORM for a focused view."
    )
    return truncated, notice
