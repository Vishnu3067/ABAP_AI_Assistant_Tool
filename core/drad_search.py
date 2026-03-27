"""
core/drad_search.py
AI-DRAD: Artifact search module.

Reads artefacts.xlsx and ranks rows against a natural-language description
using a BM25 + TF-IDF hybrid scoring approach.
"""

import math
import re
from pathlib import Path
from typing import List

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# Words that carry no search signal
_STOPWORDS = {
    'a','an','and','are','as','at','be','by','can','could','do','for',
    'from','get','give','hello','help','hi','how','i','in','is','it',
    'kindly','me','my','of','on','or','please','show','suggest','tell',
    'that','the','this','to','us','we','what','with','would','you','your',
    'need','want','looking',
}

# Generic SAP/ABAP domain words that appear in almost every document
_GENERIC_TERMS = {
    'program','report','code','object','artefact','artifact','sap','abap',
    'example','sample','script','logic',
}


def _tokenize(text: str) -> list:
    """Split text to lowercase alphanumeric tokens."""
    return re.findall(r'\b[a-zA-Z0-9]+\b', text.lower())


def _load_dataframe(excel_path: Path) -> pd.DataFrame:
    """Load and normalise artefacts Excel file columns."""
    df = pd.read_excel(excel_path, sheet_name=0)
    rename_map = {}
    for col in df.columns:
        lowered = col.lower().strip().replace(' ', '_')
        if 'system' in lowered:
            rename_map[col] = 'system_no'
        elif any(k in lowered for k in ('object', 'artefact', 'artifact')):
            rename_map[col] = 'object_name'
        elif 'desc' in lowered:
            rename_map[col] = 'description'
    df = df.rename(columns=rename_map)
    df = df.fillna('')
    return df


def _compute_bm25(query_tokens: list, doc_tokens: list, avg_dl: float,
                  idf_map: dict, k1: float = 1.5, b: float = 0.75) -> float:
    """Custom BM25 score for a single document."""
    dl = len(doc_tokens)
    freq: dict = {}
    for t in doc_tokens:
        freq[t] = freq.get(t, 0) + 1

    score = 0.0
    for t in query_tokens:
        if t in freq:
            f = freq[t]
            idf = idf_map.get(t, 0.0)
            score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / max(avg_dl, 1)))
    return score


def get_available_systems(excel_path: Path) -> list:
    """Return a sorted list of unique system IDs from the artefacts Excel."""
    try:
        df = _load_dataframe(excel_path)
        return sorted(df['system_no'].dropna().unique().tolist())
    except Exception:
        return []


def search_artefacts(excel_path: Path, description: str, top_k: int = 15) -> List[dict]:
    """
    Search artefacts Excel by natural-language description.
    Returns up to top_k results sorted by relevance score (highest first).
    Each result dict: {system_no, object_name, description, score}
    """
    if not excel_path.exists():
        raise FileNotFoundError(f"Artefacts catalog not found: {excel_path}")

    df = _load_dataframe(excel_path)
    if df.empty:
        return []

    # Build document corpus (one doc per row)
    docs_raw = [
        f"{row.get('object_name', '')} {row.get('description', '')}".lower()
        for _, row in df.iterrows()
    ]
    all_tokens = [_tokenize(d) for d in docs_raw]
    avg_dl = sum(len(t) for t in all_tokens) / max(len(all_tokens), 1)

    # IDF map for BM25
    N = len(docs_raw)
    df_count: dict = {}
    for tokens in all_tokens:
        for t in set(tokens):
            df_count[t] = df_count.get(t, 0) + 1
    idf_map = {
        t: math.log((N - cnt + 0.5) / (cnt + 0.5) + 1)
        for t, cnt in df_count.items()
    }

    # Filter query to meaningful tokens only
    high_df_terms = {t for t, cnt in df_count.items() if cnt > N * 0.5}
    query_tokens = [
        t for t in _tokenize(description)
        if t not in _STOPWORDS
        and t not in _GENERIC_TERMS
        and t not in high_df_terms
        and len(t) >= 2
    ]

    if not query_tokens:
        # Fallback: use all non-stopword tokens without filtering
        query_tokens = [
            t for t in _tokenize(description)
            if t not in _STOPWORDS and len(t) >= 2
        ]
    if not query_tokens:
        return []

    # TF-IDF cosine similarity
    cosine_scores = [0.0] * len(docs_raw)
    try:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
        corpus = docs_raw + [" ".join(query_tokens)]
        tfidf_matrix = vectorizer.fit_transform(corpus)
        cosine_scores = cosine_similarity(tfidf_matrix[-1:], tfidf_matrix[:-1]).flatten().tolist()
    except Exception:
        pass

    results = []
    for i, (tokens, row) in enumerate(zip(all_tokens, df.itertuples(index=False))):
        bm25_raw = _compute_bm25(query_tokens, tokens, avg_dl, idf_map)
        bm25_norm = min(bm25_raw / 10.0, 1.0)
        cosine = float(cosine_scores[i])
        coverage = (
            len(set(query_tokens) & set(tokens)) / len(query_tokens)
            if query_tokens else 0.0
        )

        final_score = 0.55 * bm25_norm + 0.25 * cosine + 0.20 * coverage

        if coverage > 0 and final_score >= 0.05:
            results.append({
                'system_no': str(getattr(row, 'system_no', '')),
                'object_name': str(getattr(row, 'object_name', '')),
                'description': str(getattr(row, 'description', '')),
                'score': round(final_score, 4),
            })

    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:top_k]
