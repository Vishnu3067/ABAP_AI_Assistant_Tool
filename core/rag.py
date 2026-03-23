import re
from typing import List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def format_artifacts_to_text(json_data: dict) -> str:
    artifacts: list = []
    if isinstance(json_data, dict):
        artifacts = json_data.get("value", []) or json_data.get("results", [])
    elif isinstance(json_data, list):
        artifacts = json_data
    if not artifacts:
        return ""
    blocks = []
    for i, art in enumerate(artifacts):
        if not isinstance(art, dict):
            continue
        lines = [f"=== Artifact {i+1} ==="]
        for k, v in art.items():
            if v:
                lines.append(f"{k}: {v}")
        lines.append("---")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def rag_retrieve(text: str, query: str, top_k: int = 5,
                 chunk_size: int = 2000, overlap: int = 100) -> List[str]:
    """Fixed-size character chunking. Kept as fallback."""
    chunks: List[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == n:
            break
        start = max(end - overlap, 0)
    if not chunks:
        return []
    vec = TfidfVectorizer(max_features=5000, ngram_range=(1, 2),
                          stop_words="english", lowercase=True)
    matrix = vec.fit_transform(chunks)
    q_vec = vec.transform([query])
    scores = cosine_similarity(q_vec, matrix)[0]
    top_idx = np.argsort(scores)[::-1][:top_k]
    return [chunks[i] for i in top_idx if scores[i] > 0.001]


def retrieve_top_methods(json_classes: dict, json_fms: dict,
                         query: str, top_k: int = 5) -> List[dict]:
    """
    Gold-standard RAG that works directly on the raw OData JSON responses.

    Why this beats text-chunking approaches:
    - OData returns ONE ROW PER PARAMETER, so a method with 4 params = 4 rows.
      Splitting by row inflates multi-param methods; splitting by fixed chars
      mixes ~10 unrelated methods into one TF-IDF document. Both are wrong.
    - The OData field has a TYPO: 'MethodNaame' (double a). Text-based approaches
      rely on the formatted label 'MethodName:' and miss the actual value.
    - Method names like ADD_RECIPIENTS_WITH_EMAILID are never tokenised by
      stop-word-aware TF-IDF because underscores are not whitespace.

    This function:
    1. Groups all rows by (ClassName, MethodName) or (FMName).
    2. Builds ONE rich text document per unique method/FM.
    3. Adds an 'expanded' field that replaces underscores and slashes with spaces
       so 'ADD_RECIPIENTS_WITH_EMAILID' → 'ADD RECIPIENTS WITH EMAILID',
       making individual words directly matchable by TF-IDF.
    4. Runs TF-IDF with no stop-word removal (words like 'email', 'id', 'to'
       are meaningful in SAP context and must not be discarded).

    Returns a list of dicts:
        {'type': 'Class'|'Function Module', 'name': str, 'method': str, 'text': str}
    """
    from collections import defaultdict

    def _records(js: dict) -> list:
        if isinstance(js, dict):
            return js.get("value", []) or js.get("results", [])
        return js or []

    def _expand(name: str) -> str:
        """Replace / and _ with spaces so TF-IDF sees individual word tokens."""
        return re.sub(r'[/_]', ' ', name).strip()

    # ── Group class records by (ClassName, MethodName) ──────────────────────
    class_groups: dict = defaultdict(list)
    for rec in _records(json_classes):
        if not isinstance(rec, dict):
            continue
        cname = rec.get("ClassName", "").strip()
        # SAP OData typo: field is 'MethodNaame' (double a) — handle both spellings
        mname = (rec.get("MethodNaame") or rec.get("MethodName") or "").strip()
        if cname:
            class_groups[(cname, mname)].append(rec)

    # ── Group FM records by FMName ───────────────────────────────────────────
    fm_groups: dict = defaultdict(list)
    for rec in _records(json_fms):
        if not isinstance(rec, dict):
            continue
        fname = rec.get("FMName", "").strip()
        if fname:
            fm_groups[fname].append(rec)

    docs: List[str] = []
    metas: List[dict] = []

    for (cname, mname), rows in class_groups.items():
        r0 = rows[0]
        parts = [
            f"ClassName: {cname}",
            f"ClassExpanded: {_expand(cname)}",
            f"MethodName: {mname}",
            f"MethodExpanded: {_expand(mname)}",
            f"ClassPurpose: {r0.get('ClassPurpose', '')}",
            f"MethodPurpose: {r0.get('MethodPurpose', '')}",
        ]
        for row in rows:
            p = row.get("ParameterName", "")
            t = row.get("ParameterType", "")
            d = row.get("ParameterPurpose", "")
            if p:
                parts.append(f"Param {p} {t} {d}")
        text = "\n".join(parts)
        docs.append(text)
        metas.append({"type": "Class", "name": cname, "method": mname, "text": text})

    for fname, rows in fm_groups.items():
        r0 = rows[0]
        parts = [
            f"FMName: {fname}",
            f"FMExpanded: {_expand(fname)}",
            f"FMPurpose: {r0.get('FMPurpose', '')}",
        ]
        for row in rows:
            p = row.get("FMParameter", "")
            t = row.get("FMParameterType", "")
            d = row.get("FMParameterPurpose", "")
            if p:
                parts.append(f"Param {p} {t} {d}")
        text = "\n".join(parts)
        docs.append(text)
        metas.append({"type": "Function Module", "name": fname, "method": "", "text": text})

    if not docs:
        return []

    vec = TfidfVectorizer(
        max_features=10000,
        ngram_range=(1, 2),
        stop_words=None,          # keep ALL words — 'email', 'id', 'to' are meaningful
        lowercase=True,
        token_pattern=r'[a-zA-Z0-9]+',   # split on _ / spaces — tokenises expanded names
    )
    try:
        matrix = vec.fit_transform(docs)
    except ValueError:
        return metas[:top_k]

    q_vec = vec.transform([query])
    scores = cosine_similarity(q_vec, matrix)[0]

    # ── Name-match bonus ─────────────────────────────────────────────────────
    # TF-IDF alone fails when the query verb ("prepare") coincidentally matches
    # a method name (PREPARE_BATCH_PAYLOAD) while the *correct* method has
    # multiple relevant tokens spread across class + method name ("email" in
    # /SHL/CL_EMAIL_UTL, "recipients" in ADD_RECIPIENTS_WITH_EMAILID).
    #
    # Fix: for each document, count how many query tokens (≥4 chars, not noise)
    # appear directly inside the class name or method name string.  Each hit
    # adds 0.35 to the cosine score — large enough to win over a single-word
    # TF-IDF match but reasonable when multiple names compete.
    _NOISE = {'from', 'with', 'call', 'make', 'that', 'this', 'have', 'will'}
    q_tokens = {t for t in re.findall(r'[a-zA-Z0-9]+', query.lower())
                if len(t) >= 4 and t not in _NOISE}
    for i, meta in enumerate(metas):
        name_str = (meta["name"] + " " + meta.get("method", "")).lower()
        name_toks = set(re.findall(r'[a-zA-Z0-9]+', name_str))
        hits = q_tokens & name_toks
        if hits:
            scores[i] += len(hits) * 0.35

    top_idx = np.argsort(scores)[::-1][:top_k]
    return [metas[i] for i in top_idx if scores[i] > 0.001]


# ── Legacy helpers kept for backwards compatibility ──────────────────────────

def rag_retrieve_by_artifacts(text: str, query: str, top_k: int = 8) -> List[str]:
    """Kept for backwards compat. Prefer retrieve_top_methods for new code."""
    raw_blocks = re.split(r'(?====\s*Artifact\s+\d+\s*===)', text)
    chunks = [b.strip() for b in raw_blocks if b.strip()]
    if len(chunks) < 2:
        return rag_retrieve(text, query, top_k)
    vec = TfidfVectorizer(max_features=5000, ngram_range=(1, 2),
                          stop_words="english", lowercase=True)
    try:
        matrix = vec.fit_transform(chunks)
    except ValueError:
        return rag_retrieve(text, query, top_k)
    q_vec = vec.transform([query])
    scores = cosine_similarity(q_vec, matrix)[0]
    top_idx = np.argsort(scores)[::-1][:top_k]
    return [chunks[i] for i in top_idx if scores[i] > 0.001]


def parse_artifact_matches(rag_chunks: List[str]) -> List[dict]:
    """Kept for backwards compat. Prefer retrieve_top_methods for new code."""
    seen: set = set()
    results: List[dict] = []
    for chunk in rag_chunks:
        for line in chunk.splitlines():
            line = line.strip()
            if not line or line.startswith('===') or line == '---':
                continue
            m = re.match(r'^ClassName:\s*(/[\w/]+)', line, re.I)
            if m:
                name = m.group(1)
                if ("Class", name) not in seen:
                    seen.add(("Class", name))
                    results.append({"type": "Class", "name": name})
                continue
            m = re.match(r'^FMName:\s*(/[\w/]+)', line, re.I)
            if m:
                name = m.group(1)
                if ("Function Module", name) not in seen:
                    seen.add(("Function Module", name))
                    results.append({"type": "Function Module", "name": name})
    return results[:5]
