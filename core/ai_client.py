from core.config import openai_client, OPENAI_MODEL, MAX_PRIMARY_CHARS, MAX_FETCHED_CHARS, MAX_REVIEW_CHARS, MAX_DIFF_CHARS


def truncate_source(code: str, max_chars: int) -> str:
    if len(code) <= max_chars:
        return code
    kept_lines = code[:max_chars].rsplit("\n", 1)[0]
    total_lines = code.count("\n") + 1
    kept_line_count = kept_lines.count("\n") + 1
    omitted = total_lines - kept_line_count
    return (
        kept_lines
        + f"\n\n**** SOURCE TRUNCATED — {omitted} additional lines not shown "
          f"(total {total_lines} lines). The artifact is very large; the analysis "
          f"covers the portion shown above. ****\n"
    )


def call_ai(messages: list, temperature: float = 1.0, top_p: float = 1.0, max_tokens: int = 4096) -> str:
    completion = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        stream=True,
    )
    parts: list[str] = []
    for chunk in completion:
        if not getattr(chunk, "choices", None):
            continue
        content = getattr(chunk.choices[0].delta, "content", None)
        if content:
            parts.append(content)
    return "".join(parts)
