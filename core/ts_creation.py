"""
core/ts_creation.py — TS Creation Tool helpers.

Provides:
  - extract_fs_text()        — pull all readable text from an uploaded FS .docx
  - extract_placeholders()   — dynamically find all {{name}} tokens in the TS template
  - ask_ai_fill_placeholders() — call AI to fill placeholders from FS text
  - render_ts_docx()         — render filled template to .docx bytes via docxtpl
  - docx_to_preview_html()   — convert a filled .docx to a styled HTML string for browser preview
"""

import html
import io
import json
import re
import zipfile
from pathlib import Path
from typing import Optional

from docx import Document
from docxtpl import DocxTemplate

from core.ai_client import call_ai

# ── Regex to match clean placeholder names (no XML artefacts) ───────────────
_PLACEHOLDER_RE = re.compile(r"\{\{([A-Za-z0-9_.]+)\}\}")


# ── Extract readable text from an FS .docx ──────────────────────────────────

def extract_fs_text(docx_bytes: bytes) -> str:
    """
    Return all readable text from a .docx file in document body order.
    Paragraphs are labelled with # / ## / ### for headings so the AI
    understands document structure.  Table rows are rendered as
    'cell1 | cell2 | ...' lines.
    """
    doc = Document(io.BytesIO(docx_bytes))
    lines: list[str] = []
    WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    def _para_text(p_elem) -> str:
        return "".join(t.text or "" for t in p_elem.iter(f"{{{WNS}}}t"))

    for elem in doc.element.body:
        local = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        if local == "p":
            text = _para_text(elem).strip()
            if not text:
                continue
            # Detect heading style
            pPr = elem.find(f"{{{WNS}}}pPr")
            style_val = ""
            if pPr is not None:
                pStyle = pPr.find(f"{{{WNS}}}pStyle")
                if pStyle is not None:
                    style_val = pStyle.get(f"{{{WNS}}}val", "")
            if "Heading1" in style_val or style_val == "1":
                lines.append(f"# {text}")
            elif "Heading2" in style_val or style_val == "2":
                lines.append(f"## {text}")
            elif "Heading3" in style_val or style_val == "3":
                lines.append(f"### {text}")
            else:
                lines.append(text)

        elif local == "tbl":
            for row_elem in elem.iter(f"{{{WNS}}}tr"):
                cells = []
                for tc in row_elem.findall(f"{{{WNS}}}tc"):
                    cell_text = "".join(t.text or "" for t in tc.iter(f"{{{WNS}}}t")).strip()
                    cells.append(cell_text)
                row_text = " | ".join(cells)
                if row_text.strip(" |"):
                    lines.append(row_text)

    return "\n".join(lines)


# ── Dynamically extract placeholder names from the TS template ──────────────

def extract_placeholders(template_path: Path) -> list[str]:
    """
    Scan the template XML, strip all XML tags so that split runs
    (e.g. {{ProcessAre}} + {{a}}) merge into {{ProcessArea}}, then
    return the sorted unique list of placeholder names.
    Works dynamically — adding a new {{foo}} to the template is
    automatically picked up on the next request.
    """
    with open(template_path, "rb") as fh:
        raw_bytes = fh.read()

    all_xml = ""
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as z:
        for name in z.namelist():
            if name.endswith(".xml"):
                all_xml += z.read(name).decode("utf-8", errors="replace")

    # Strip all XML tags — adjacent text nodes concatenate, reconstructing
    # any placeholder that Word's spellchecker split across multiple runs
    plain = re.sub(r"<[^>]+>", "", all_xml)

    return sorted(set(_PLACEHOLDER_RE.findall(plain)))


# ── AI: fill placeholder values from FS content ─────────────────────────────

def ask_ai_fill_placeholders(
    placeholders: list[str],
    fs_text: str,
    feedback: str = "",
    current_values: Optional[dict] = None,
) -> dict:
    """
    Call the AI to produce a JSON dict {placeholder_name: value} by
    studying the FS text.  On regeneration, supply the previous values
    and user feedback so the AI updates only what is needed.
    """
    placeholder_list = "\n".join(f"  - {p}" for p in placeholders)

    current_block = ""
    if current_values:
        current_block = (
            "\n\nCurrent placeholder values (keep correct ones, fix the ones "
            "the user has asked to improve):\n"
            + "\n".join(f"  {k}: {v}" for k, v in current_values.items())
        )

    feedback_block = (
        f"\n\nUser's correction instructions:\n{feedback}" if feedback else ""
    )

    prompt = f"""You are an expert SAP ABAP Senior Developer and Technical Specification author.

You have been given a Functional Specification (FS) document and a list of placeholder names
from a Technical Specification (TS) template.

Your job is to read the FS carefully and produce the correct value for each placeholder.
Return ONLY a single JSON object — no markdown fences, no explanations, pure JSON.

Rules:
- Use information explicitly stated in the FS wherever possible.
- If a value cannot be determined from the FS, write "N/A" or a sensible short default.
- Keep values concise but complete. Multi-line values are fine for logic/pseudocode fields.
- For date fields use today's date in DD.MM.YYYY format.
- For Name / EmailID fields use generic placeholders like "Developer Name" / "developer@shell.com".

Placeholders to fill:
{placeholder_list}
{current_block}
{feedback_block}

==== FUNCTIONAL SPECIFICATION ====
{fs_text[:18000]}
==== END ====

Return pure JSON only."""

    raw = call_ai([{"role": "user", "content": prompt}], temperature=0.15, max_tokens=4096)

    # Strip any accidental markdown fences
    clean = raw.strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```[a-z]*\n?", "", clean, flags=re.MULTILINE)
        clean = re.sub(r"\n?```$", "", clean)
    clean = clean.strip()

    try:
        values = json.loads(clean)
        return {p: str(values.get(p, "N/A")) for p in placeholders}
    except Exception:
        # Graceful fallback: return bracketed names so the docx is still generated
        return {p: f"[{p}]" for p in placeholders}


# ── Render template → docx bytes ────────────────────────────────────────────

def render_ts_docx(filled_values: dict, template_path: Path) -> bytes:
    """
    Use docxtpl (Jinja2-based) to fill the TS template and return
    the rendered .docx as raw bytes.  docxtpl handles placeholders
    that Word has split across multiple XML runs.

    Flat dot-notation keys (e.g. "Stakeholders.Name") are converted
    to nested dicts ({"Stakeholders": {"Name": ...}}) so Jinja2
    can resolve {{Stakeholders.Name}} correctly.
    """
    # ── Convert flat keys with dots to nested dicts ──────────────────────
    context: dict = {}
    for key, value in filled_values.items():
        if "." in key:
            parent, child = key.split(".", 1)
            if parent not in context or not isinstance(context[parent], dict):
                context[parent] = {}
            context[parent][child] = value
        else:
            context[key] = value

    tpl = DocxTemplate(str(template_path))
    tpl.render(context)
    buf = io.BytesIO()
    tpl.save(buf)
    return buf.getvalue()


# ── Convert a filled .docx to preview HTML ──────────────────────────────────

def docx_to_preview_html(docx_bytes: bytes) -> str:
    """
    Walk the document body in order (preserving paragraph / table
    interleaving) and produce a styled HTML fragment for the browser preview.
    """
    doc = Document(io.BytesIO(docx_bytes))
    WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    parts: list[str] = ['<div class="ts-doc-preview">']

    def _para_text_html(p_elem) -> str:
        """Collect text from a paragraph, turning w:br into <br> tags."""
        result = []
        for node in p_elem.iter():
            local = node.tag.split("}")[-1] if "}" in node.tag else node.tag
            if local == "t":
                result.append(html.escape(node.text or ""))
            elif local == "br":
                result.append("<br>")
        return "".join(result)

    def _heading_level(p_elem) -> int:
        pPr = p_elem.find(f"{{{WNS}}}pPr")
        if pPr is None:
            return 0
        # ── 1. Check standard Word heading style name ──────────────────
        pStyle = pPr.find(f"{{{WNS}}}pStyle")
        if pStyle is not None:
            val = pStyle.get(f"{{{WNS}}}val", "")
            if "Title" in val:
                return -1
            for h in range(1, 7):
                if f"Heading{h}" in val or val == str(h):
                    return h
        # ── 2. Check outline level (reliable for custom-style templates) ─
        outlineLvl = pPr.find(f"{{{WNS}}}outlineLvl")
        if outlineLvl is not None:
            try:
                lvl = int(outlineLvl.get(f"{{{WNS}}}val", "9"))
                if lvl <= 5:           # 0=H1 … 5=H6
                    return lvl + 1
            except ValueError:
                pass
        # ── 3. Large/bold runs treated as H3 ────────────────────────────
        rPrs = p_elem.findall(f".//{{{WNS}}}rPr")
        for rPr in rPrs:
            sz = rPr.find(f"{{{WNS}}}sz")
            b  = rPr.find(f"{{{WNS}}}b")
            if sz is not None:
                try:
                    half_pts = int(sz.get(f"{{{WNS}}}val", "0"))
                    if half_pts >= 40:   # ≥ 20pt → treat as heading
                        return 1 if half_pts >= 56 else (2 if half_pts >= 44 else 3)
                except ValueError:
                    pass
            # Bold paragraph with no obvious size → H4
            if b is not None and sz is None:
                return 0   # neutral; don't force heading for just bold
        return 0

    for elem in doc.element.body:
        local = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        if local == "p":
            text = _para_text_html(elem)
            raw_text = "".join(t.text or "" for t in elem.iter(f"{{{WNS}}}t")).strip()
            if not raw_text:
                parts.append('<div class="ts-spacer"></div>')
                continue
            lvl = _heading_level(elem)
            if lvl == -1:
                parts.append(f'<h1 class="ts-doc-title">{text}</h1>')
            elif 1 <= lvl <= 6:
                parts.append(f'<h{lvl} class="ts-doc-h{lvl}">{text}</h{lvl}>')
            else:
                parts.append(f'<p class="ts-doc-p">{text}</p>')

        elif local == "tbl":
            parts.append('<table class="ts-doc-table"><tbody>')
            rows = list(elem.iter(f"{{{WNS}}}tr"))
            for r_idx, row_elem in enumerate(rows):
                parts.append("<tr>")
                for tc in row_elem.findall(f"{{{WNS}}}tc"):
                    # Each paragraph in the cell becomes a separate line
                    cell_lines = []
                    for p_elem in tc.findall(f"{{{WNS}}}p"):
                        p_parts = []
                        for node in p_elem.iter():
                            local = node.tag.split("}")[-1] if "}" in node.tag else node.tag
                            if local == "t":
                                p_parts.append(html.escape(node.text or ""))
                            elif local == "br":
                                p_parts.append("<br>")
                        line = "".join(p_parts).strip()
                        if line:
                            cell_lines.append(line)
                    cell_html = "<br>".join(cell_lines)
                    tag = "th" if r_idx == 0 else "td"
                    parts.append(f"<{tag} class='ts-doc-cell'>{cell_html}</{tag}>")
                parts.append("</tr>")
            parts.append("</tbody></table>")

    parts.append("</div>")
    return "\n".join(parts)
