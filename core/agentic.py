import json
import re
from typing import Optional

import requests

from core.config import openai_client, OPENAI_MODEL, ANALYSIS_TOOLS, MAX_PRIMARY_CHARS, MAX_FOLLOWUP_PRIMARY_CHARS, MAX_FETCHED_CHARS, MAX_AGENTIC_CONTEXT_CHARS
from core.ai_client import truncate_source
from core.smart_fetch import smart_prefilter, is_large
from core.sap_client import (
    fetch_source,
    fetch_table_definition,
    fetch_structure,
    fetch_type_info,
    fetch_function_group,
    fetch_package,
    search_objects,
    fetch_transaction_info,
    fetch_program_includes,
)


def run_agentic_analysis(
    artifact_type: str,
    artifact_name: str,
    system_id: str,
    tcode: Optional[str],
    source_code: str,
    messages: list,
    sap_url: str,
    session: requests.Session,
) -> tuple:
    """
    AI-driven loop: the model can call fetch_abap_artifact() to pull in
    dependent ABAP objects as needed to answer the question.
    Returns (reply_text, fetched_artifacts_log, extra_context_text).
    """
    tcode_ctx = f"\nTransaction Code (TCode): {tcode}" if tcode else ""

    # ── For Transaction (TCode): extract linked program from ADT metadata ───
    # fetch_transaction_info returns XML like:
    #   <transaction ... programName="/SHL/MY_REPORT" ...>
    # or properties containing the ABAP program. Parse it out so the AI
    # knows exactly which program to fetch, rather than having to guess.
    tcode_program_hint = ""
    if artifact_type == "Transaction (TCode)" and source_code.strip().startswith("<"):
        prog_match = re.search(
            r'(?:programName|reportName|program)["\s:=]+([\w/]+)',
            source_code, re.IGNORECASE
        )
        if prog_match:
            tcode_program_hint = prog_match.group(1).strip()

    user_question = messages[-1].content if messages else "Analyse this artifact."

    # Extract the user's question first — smart_prefilter needs it
    # ── Smart two-stage pre-filter ───────────────────────────────────────────
    # For large programs/classes: extract routine names → ask AI which are
    # relevant → return only those bodies instead of the full 500k source.
    if is_large(source_code):
        primary_code, source_notice = smart_prefilter(
            source_code, user_question, artifact_type, artifact_name
        )
    else:
        primary_code = source_code
        source_notice = ""

    # On follow-up turns the conversation history already carries prior context,
    # so apply an additional size cap if the focused source is still large.
    is_followup = len(messages) > 1
    if is_followup and len(primary_code) > MAX_FOLLOWUP_PRIMARY_CHARS:
        primary_code = truncate_source(primary_code, MAX_FOLLOWUP_PRIMARY_CHARS)
        source_notice = source_notice or (
            f"⚠️ Source truncated to {MAX_FOLLOWUP_PRIMARY_CHARS:,} chars for follow-up context efficiency."
        )

    # Fallback: if no smart notice but source was still truncated by truncate_source
    if not source_notice and "SOURCE TRUNCATED" in primary_code:
        source_notice = (
            "⚠️ NOTE: The source above is TRUNCATED. "
            "If the question is about a method/routine not visible, "
            "fetch the relevant include or use fetch_program_includes to see the include list."
        )

    source_notice_text = f"\n{source_notice}" if source_notice else ""

    # Build TCode-specific hint line for the system prompt
    tcode_program_hint_text = (
        f"\nLinked ABAP Program extracted from metadata: {tcode_program_hint}"
        if tcode_program_hint else ""
    )

    system_prompt = f"""You are an expert SAP ABAP developer and analyst.
You are analysing the following {artifact_type}: {artifact_name}
System: {system_id}{tcode_ctx}{tcode_program_hint_text}

The developer's specific question is:
\"{user_question}\"

Here is the primary source code (do NOT fetch this artifact again, it is already loaded):
--- PRIMARY SOURCE CODE: {artifact_name} ---
{primary_code}
-------------------{source_notice_text}

TOOL USE RULES:
- NEVER re-fetch '{artifact_name}' — it is already provided above.
- You CAN and SHOULD fetch any OTHER artifact using the available tools:
  - fetch_abap_artifact — for any class, include, FM, report, interface, or CDS view
  - fetch_program_includes — when the artifact is a Report/Program: ALWAYS call this
    first to get the complete include list, then fetch each relevant include with
    fetch_abap_artifact (type=Include). Do not skip this step.
  - fetch_package — when the artifact type is Package: call this FIRST to list all
    objects in the package, then fetch each relevant object with fetch_abap_artifact
  - fetch_transaction — to look up another TCode's linked program
  - fetch_table_definition / fetch_structure / fetch_type_info — for DDIC lookups
  - search_objects — to find the exact name of an object you need
- Fetch proactively. Do NOT ask the user to supply code — retrieve it yourself.
- If the primary source is empty (Package), start immediately with fetch_package.
- If artifact_type is Transaction (TCode): the primary source above is ADT metadata XML.
  Parse the linked program name from the metadata (or use the hint above if provided),
  then IMMEDIATELY call fetch_program_includes on that program to get its include list,
  then fetch the relevant includes with fetch_abap_artifact (type=Include) to read the
  actual ABAP code before answering.
  Skip this only if the transaction's program is a well-known standard SAP program
  (e.g. SAPLMEGUI, SAPMM06E) — in that case, use your training knowledge instead.

Answer directly and concisely with specific code references."""

    all_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        content = msg.content
        # Truncate long assistant responses in history — they can be thousands of
        # chars and eat the context budget on every subsequent turn.
        if msg.role == "assistant" and len(content) > 3000:
            content = content[:3000] + "\n\n_[previous response truncated for context efficiency]_"
        all_messages.append({"role": msg.role, "content": content})

    fetched_log: list = []
    extra_context_parts: list = []
    accumulated_context_chars = 0
    MAX_ROUNDS = 5
    already_fetched: set = {(artifact_type.lower(), artifact_name.upper())}

    for round_num in range(MAX_ROUNDS):
        # Only disable tools on the very last round — forces a final text answer
        t_choice = "none" if round_num == MAX_ROUNDS - 1 else "auto"

        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=all_messages,
            tools=ANALYSIS_TOOLS,
            tool_choice=t_choice,
            temperature=0.3,
            top_p=1,
            max_tokens=3000,
            stream=False,
        )

        ai_msg = response.choices[0].message

        if not ai_msg.tool_calls:
            reply = (ai_msg.content or "").strip()
            if reply:
                return reply, fetched_log, "\n\n".join(extra_context_parts)
            # Model returned empty content (e.g. after all tools were skipped).
            # Push it to answer explicitly on the next round.
            all_messages.append({
                "role": "user",
                "content": "Please answer my question now based on the primary source code already provided.",
            })
            continue

        all_messages.append({
            "role": "assistant",
            "content": ai_msg.content or None,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in ai_msg.tool_calls
            ],
        })

        for tool_call in ai_msg.tool_calls:
            try:
                args = json.loads(tool_call.function.arguments)
            except Exception:
                args = {}

            tool_name = tool_call.function.name

            # ---- dispatch each tool ----
            if tool_name == "fetch_table_definition":
                t_name = (args.get("table_name") or "").strip()
                dedup_key = ("table", t_name.upper())
                if not t_name:
                    result_text = "Error: table_name not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Table '{t_name}' definition already fetched."
                else:
                    try:
                        result_text = fetch_table_definition(session, sap_url, t_name)
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Table", "name": t_name, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching table '{t_name}': {str(e)[:200]}"
                        fetched_log.append({"type": "Table", "name": t_name, "status": "error"})

            elif tool_name == "fetch_structure":
                s_name = (args.get("structure_name") or "").strip()
                dedup_key = ("structure", s_name.upper())
                if not s_name:
                    result_text = "Error: structure_name not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Structure '{s_name}' already fetched."
                else:
                    try:
                        result_text = fetch_structure(session, sap_url, s_name)
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Structure", "name": s_name, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching structure '{s_name}': {str(e)[:200]}"
                        fetched_log.append({"type": "Structure", "name": s_name, "status": "error"})

            elif tool_name == "fetch_type_info":
                ty_name = (args.get("type_name") or "").strip()
                dedup_key = ("type", ty_name.upper())
                if not ty_name:
                    result_text = "Error: type_name not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Type '{ty_name}' already fetched."
                else:
                    try:
                        result_text = fetch_type_info(session, sap_url, ty_name)
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Type", "name": ty_name, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching type '{ty_name}': {str(e)[:200]}"
                        fetched_log.append({"type": "Type", "name": ty_name, "status": "error"})

            elif tool_name == "fetch_function_group":
                fg_name = (args.get("function_group") or "").strip()
                dedup_key = ("functiongroup", fg_name.upper())
                if not fg_name:
                    result_text = "Error: function_group not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Function group '{fg_name}' already fetched."
                else:
                    try:
                        code = fetch_function_group(session, sap_url, fg_name)
                        code = truncate_source(code, MAX_FETCHED_CHARS)
                        result_text = code
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Function Group", "name": fg_name, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching function group '{fg_name}': {str(e)[:200]}"
                        fetched_log.append({"type": "Function Group", "name": fg_name, "status": "error"})

            elif tool_name == "fetch_package":
                pkg_name = (args.get("package_name") or "").strip()
                dedup_key = ("package", pkg_name.upper())
                if not pkg_name:
                    result_text = "Error: package_name not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Package '{pkg_name}' already fetched."
                else:
                    try:
                        result_text = fetch_package(session, sap_url, pkg_name)
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Package", "name": pkg_name, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching package '{pkg_name}': {str(e)[:200]}"
                        fetched_log.append({"type": "Package", "name": pkg_name, "status": "error"})

            elif tool_name == "search_objects":
                query = (args.get("query") or "").strip()
                max_r = int(args.get("max_results") or 20)
                if not query:
                    result_text = "Error: query not provided."
                else:
                    try:
                        result_text = search_objects(session, sap_url, query, max_r)
                        fetched_log.append({"type": "Search", "name": query, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error searching '{query}': {str(e)[:200]}"
                        fetched_log.append({"type": "Search", "name": query, "status": "error"})

            elif tool_name == "fetch_transaction":
                tcode = (args.get("tcode") or "").strip()
                dedup_key = ("transaction", tcode.upper())
                if not tcode:
                    result_text = "Error: tcode not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Transaction '{tcode}' already fetched."
                else:
                    try:
                        result_text = fetch_transaction_info(session, sap_url, tcode)
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Transaction", "name": tcode, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching transaction '{tcode}': {str(e)[:200]}"
                        fetched_log.append({"type": "Transaction", "name": tcode, "status": "error"})

            elif tool_name == "fetch_program_includes":
                prog_name = (args.get("program_name") or "").strip()
                dedup_key = ("programincludes", prog_name.upper())
                if not prog_name:
                    result_text = "Error: program_name not provided."
                elif dedup_key in already_fetched:
                    result_text = f"Include list for '{prog_name}' already fetched."
                else:
                    try:
                        result_text = fetch_program_includes(session, sap_url, prog_name)
                        already_fetched.add(dedup_key)
                        fetched_log.append({"type": "Program Includes", "name": prog_name, "status": "ok"})
                    except Exception as e:
                        result_text = f"Error fetching includes for '{prog_name}': {str(e)[:200]}"
                        fetched_log.append({"type": "Program Includes", "name": prog_name, "status": "error"})

            else:
                # fetch_abap_artifact — original handler
                a_type = args.get("artifact_type", "Include")
                a_name = (args.get("artifact_name") or "").strip()
                a_fg   = (args.get("function_group") or "").strip() or None

                if not a_name:
                    result_text = "Error: artifact_name was not provided in the tool call."
                    fetched_log.append({"type": a_type, "name": "(unknown)", "status": "error"})
                else:
                    dedup_key = (a_type.lower(), a_name.upper())
                    if dedup_key in already_fetched:
                        result_text = f"{a_type} '{a_name}' has already been fetched. Use the source already provided."
                        fetched_log.append({"type": a_type, "name": a_name, "status": "duplicate (skipped)"})
                    else:
                        try:
                            code = fetch_source(session, sap_url, a_type, a_name, a_fg)
                            code = truncate_source(code, MAX_FETCHED_CHARS)
                            if accumulated_context_chars + len(code) > MAX_AGENTIC_CONTEXT_CHARS:
                                result_text = f"Context budget reached — {a_type} '{a_name}' was not fetched to avoid token overflow."
                                fetched_log.append({"type": a_type, "name": a_name, "status": "skipped (budget)"})
                            else:
                                already_fetched.add(dedup_key)
                                accumulated_context_chars += len(code)
                                result_text = f"Source code of {a_type} '{a_name}':\n\n{code}"
                                extra_context_parts.append(f"[AUTO-FETCHED: {a_type} '{a_name}']\n{code}")
                                fetched_log.append({"type": a_type, "name": a_name, "status": "ok"})
                        except requests.HTTPError as e:
                            sc = e.response.status_code if e.response is not None else "?"
                            result_text = f"HTTP {sc}: {a_type} '{a_name}' could not be fetched."
                            fetched_log.append({"type": a_type, "name": a_name, "status": f"HTTP {sc}"})
                        except Exception as e:
                            result_text = f"Error fetching {a_type} '{a_name}': {str(e)[:200]}"
                            fetched_log.append({"type": a_type, "name": a_name, "status": "error"})

            all_messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result_text,
            })

    # Hard fallback: all rounds exhausted or empty replies.
    # Strip everything down to a minimal clean call — just the question + a short slice of source.
    # This avoids context overflow that caused the empty replies above.
    clean_source = truncate_source(source_code, 30_000)
    clean_messages = [
        {
            "role": "system",
            "content": (
                f"You are an expert SAP ABAP developer. "
                f"Answer the following question about {artifact_type} '{artifact_name}' "
                f"based on the source code below. Be concise and reference actual code.\n\n"
                f"--- SOURCE: {artifact_name} ---\n{clean_source}\n---"
            ),
        },
        {"role": "user", "content": user_question},
    ]
    try:
        final = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=clean_messages,
            temperature=0.3,
            max_tokens=3000,
            stream=False,
        )
        answer = (final.choices[0].message.content or "").strip()
        if answer:
            return answer, fetched_log, "\n\n".join(extra_context_parts)
    except Exception:
        pass

    return (
        "I was unable to generate a response. The artifact may be too large for the model context. "
        "Try asking a more specific question about a particular method or section."
    ), fetched_log, "\n\n".join(extra_context_parts)
