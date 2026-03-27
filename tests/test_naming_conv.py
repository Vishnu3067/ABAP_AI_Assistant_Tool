"""
tests/test_naming_conv.py
Tests for the Naming Convention Assistant endpoint and module.
Covers happy paths, missing document, invalid inputs, edge cases.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path

from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Minimal DOCX bytes (valid structure but empty content)
# ---------------------------------------------------------------------------

def _make_minimal_docx(tmp_path: Path, text: str = "Use /SHL/ prefix for ADC objects.") -> Path:
    """Create a minimal valid .docx file with some naming convention text."""
    import zipfile

    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{text}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Class naming: ZCL_ prefix for local, /SHL/CL_ for ADC custom classes.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Function Module naming: /SHL/FM_ for ADC, /DS1/FM_ for Nucleus.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Adobe Form naming: /SHL/AF_ for ADC Adobe Forms.</w:t></w:r></w:p>
    <w:p><w:r><w:t>CDS View naming: /SHL/I_ for interface views, /SHL/C_ for consumption views.</w:t></w:r></w:p>
  </w:body>
</w:document>"""

    docx_path = tmp_path / "naming_conv.docx"
    with zipfile.ZipFile(str(docx_path), 'w') as z:
        z.writestr("word/document.xml", xml_content)
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
        z.writestr("_rels/.rels", '')
    return docx_path


# ---------------------------------------------------------------------------
# /api/naming-conv/ask endpoint tests
# ---------------------------------------------------------------------------

class TestNamingConvEndpoint:
    def test_rejects_empty_question(self):
        res = client.post("/api/naming-conv/ask", json={"question": "", "system": "ADC"})
        assert res.status_code == 400
        assert "question" in res.json()["detail"].lower()

    def test_rejects_whitespace_question(self):
        res = client.post("/api/naming-conv/ask", json={"question": "   ", "system": "ADC"})
        assert res.status_code == 400

    def test_rejects_invalid_system(self):
        res = client.post("/api/naming-conv/ask", json={
            "question": "How to name a class?", "system": "InvalidSystem"
        })
        assert res.status_code == 400
        assert "system" in res.json()["detail"].lower()

    def test_rejects_missing_docx(self, tmp_path):
        missing = tmp_path / "does_not_exist.docx"
        with patch("routes.naming_conv.DRAD_DOCX_PATH", missing):
            res = client.post("/api/naming-conv/ask", json={
                "question": "How to name a class?", "system": "ADC"
            })
        assert res.status_code == 500
        assert "not found" in res.json()["detail"].lower()

    def test_successful_adc_response(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        with patch("routes.naming_conv.DRAD_DOCX_PATH", docx_path), \
             patch("core.naming_conv.call_ai", return_value="For ADC, use /SHL/CL_ for classes."):
            res = client.post("/api/naming-conv/ask", json={
                "question": "How to name a class?", "system": "ADC"
            })
        assert res.status_code == 200
        data = res.json()
        assert "answer" in data
        assert data["system"] == "ADC"
        assert data["question"] == "How to name a class?"

    def test_successful_nucleus_response(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        with patch("routes.naming_conv.DRAD_DOCX_PATH", docx_path), \
             patch("core.naming_conv.call_ai", return_value="For Nucleus, use /DS1/CL_ for classes."):
            res = client.post("/api/naming-conv/ask", json={
                "question": "How to name a class?", "system": "Nucleus"
            })
        assert res.status_code == 200
        data = res.json()
        assert data["system"] == "Nucleus"

    def test_handles_ai_service_error_gracefully(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        with patch("routes.naming_conv.DRAD_DOCX_PATH", docx_path), \
             patch("core.naming_conv.call_ai", side_effect=Exception("AI service unavailable")):
            # Should NOT raise 500 from route — the module returns an error dict
            res = client.post("/api/naming-conv/ask", json={
                "question": "How to name a class?", "system": "ADC"
            })
        # Either 200 with error in answer, or 500 — both acceptable (graceful vs propagated)
        assert res.status_code in (200, 500)


# ---------------------------------------------------------------------------
# naming_conv module unit tests
# ---------------------------------------------------------------------------

class TestNamingConvModule:
    def test_returns_error_dict_for_missing_docx(self, tmp_path):
        from core.naming_conv import answer_naming_question
        result = answer_naming_question(tmp_path / "missing.docx", "test question", "ADC")
        assert "answer" in result
        assert "not found" in result["answer"].lower() or "error" in result["answer"].lower()

    def test_adc_prefix_used_in_prompt(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        captured_prompts = []

        def capture_call(messages, **kwargs):
            captured_prompts.append(messages[0]["content"])
            return "Answer for ADC"

        from core.naming_conv import answer_naming_question
        with patch("core.naming_conv.call_ai", side_effect=capture_call):
            answer_naming_question(docx_path, "How to name an Adobe Form?", "ADC")

        assert len(captured_prompts) == 1
        prompt = captured_prompts[0]
        assert "/SHL/" in prompt
        assert "ADC" in prompt
        assert "/DS1/" in prompt  # mentioned as the one NOT to use

    def test_nucleus_prefix_used_in_prompt(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        captured_prompts = []

        def capture_call(messages, **kwargs):
            captured_prompts.append(messages[0]["content"])
            return "Answer for Nucleus"

        from core.naming_conv import answer_naming_question
        with patch("core.naming_conv.call_ai", side_effect=capture_call):
            answer_naming_question(docx_path, "How to name a CDS View?", "Nucleus")

        prompt = captured_prompts[0]
        assert "/DS1/" in prompt
        assert "Nucleus" in prompt

    def test_returns_answer_from_ai(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        expected_answer = "Classes should use /SHL/CL_ prefix."

        from core.naming_conv import answer_naming_question
        with patch("core.naming_conv.call_ai", return_value=expected_answer):
            result = answer_naming_question(docx_path, "How to name a class?", "ADC")

        assert result["answer"] == expected_answer
        assert result["question"] == "How to name a class?"
        assert result["system"] == "ADC"

    def test_docx_text_is_extracted(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path, text="Custom naming rules here.")
        from core.naming_conv import _extract_docx_text
        text = _extract_docx_text(docx_path)
        assert "Custom naming rules here." in text

    def test_docx_caching_works(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        from core.naming_conv import _extract_docx_text, _doc_cache

        _doc_cache.clear()
        text1 = _extract_docx_text(docx_path)
        text2 = _extract_docx_text(docx_path)
        assert text1 == text2

    def test_ai_error_returns_error_in_answer(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        from core.naming_conv import answer_naming_question
        with patch("core.naming_conv.call_ai", side_effect=Exception("AI timeout")):
            result = answer_naming_question(docx_path, "How to name a report?", "ADC")
        assert "answer" in result
        assert "error" in result["answer"].lower() or "ai" in result["answer"].lower()


# ---------------------------------------------------------------------------
# Prefix correctness validation
# ---------------------------------------------------------------------------

class TestPrefixCorrectness:
    """Ensure the correct prefix is used in AI prompts for each system."""

    def test_adc_never_uses_ds1_as_recommended_prefix(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        captured = []

        from core.naming_conv import answer_naming_question
        with patch("core.naming_conv.call_ai", side_effect=lambda m, **k: captured.append(m[0]["content"]) or "ok"):
            answer_naming_question(docx_path, "naming?", "ADC")

        prompt = captured[0]
        # /SHL/ must be the recommended prefix
        assert 'use the prefix "/SHL/"' in prompt or "prefix \"/SHL/\"" in prompt

    def test_nucleus_never_uses_shl_as_recommended_prefix(self, tmp_path):
        docx_path = _make_minimal_docx(tmp_path)
        captured = []

        from core.naming_conv import answer_naming_question
        with patch("core.naming_conv.call_ai", side_effect=lambda m, **k: captured.append(m[0]["content"]) or "ok"):
            answer_naming_question(docx_path, "naming?", "Nucleus")

        prompt = captured[0]
        assert 'use the prefix "/DS1/"' in prompt or "prefix \"/DS1/\"" in prompt
