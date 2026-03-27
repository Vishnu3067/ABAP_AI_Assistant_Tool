"""
tests/test_drad.py
Tests for AI-DRAD: search, fetch, and generate-code endpoints.
Covers happy paths, missing data, invalid inputs, and edge cases.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import pandas as pd

from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

SAMPLE_EXCEL_DATA = pd.DataFrame({
    "system_no":   ["H94", "K94", "H94"],
    "object_name": ["/DS1/R_TEST1", "/DS1/R_TEST2", "ZMASS_DOWNLOAD"],
    "description": [
        "Vietnam print program for CCM invoices",
        "Egypt print program for CCM output",
        "Mass download of reports and classes",
    ],
})

MOCK_SAP_RESPONSE = {
    "d": {
        "results": [
            {
                "report_name": "/DS1/R_TEST1",
                "line_value": "REPORT /DS1/R_TEST1.\nWRITE 'Hello'.",
                "to_Child": {
                    "results": [
                        {"dep_object": "/DS1/R_TEST1_TOP", "line_value": "DATA: lv_x TYPE i."}
                    ]
                },
            }
        ]
    }
}


# ---------------------------------------------------------------------------
# /api/drad/systems
# ---------------------------------------------------------------------------

class TestDradSystems:
    def test_returns_systems_when_excel_exists(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        with patch("routes.drad.DRAD_EXCEL_PATH", excel_file):
            res = client.get("/api/drad/systems")
        assert res.status_code == 200
        data = res.json()
        assert "systems" in data
        assert "H94" in data["systems"]
        assert "K94" in data["systems"]

    def test_returns_500_when_excel_missing(self, tmp_path):
        missing = tmp_path / "does_not_exist.xlsx"
        with patch("routes.drad.DRAD_EXCEL_PATH", missing):
            res = client.get("/api/drad/systems")
        assert res.status_code == 500
        assert "not found" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# /api/drad/search
# ---------------------------------------------------------------------------

class TestDradSearch:
    def test_returns_matches_for_valid_description(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        with patch("routes.drad.DRAD_EXCEL_PATH", excel_file):
            res = client.post("/api/drad/search", json={"description": "Egypt CCM print"})
        assert res.status_code == 200
        data = res.json()
        assert "matches" in data
        assert isinstance(data["matches"], list)

    def test_returns_empty_for_unrelated_query(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        with patch("routes.drad.DRAD_EXCEL_PATH", excel_file):
            res = client.post("/api/drad/search", json={"description": "zzz xyz unrelated term"})
        assert res.status_code == 200
        assert res.json()["matches"] == []

    def test_rejects_empty_description(self):
        res = client.post("/api/drad/search", json={"description": ""})
        assert res.status_code == 400

    def test_rejects_whitespace_description(self):
        res = client.post("/api/drad/search", json={"description": "   "})
        assert res.status_code == 400

    def test_returns_500_when_excel_missing(self, tmp_path):
        missing = tmp_path / "no_file.xlsx"
        with patch("routes.drad.DRAD_EXCEL_PATH", missing):
            res = client.post("/api/drad/search", json={"description": "test"})
        assert res.status_code == 500

    def test_match_fields_present(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        with patch("routes.drad.DRAD_EXCEL_PATH", excel_file):
            res = client.post("/api/drad/search", json={"description": "Vietnam CCM print program"})
        data = res.json()
        if data["matches"]:
            first = data["matches"][0]
            assert "system_no" in first
            assert "object_name" in first
            assert "description" in first
            assert "score" in first


# ---------------------------------------------------------------------------
# /api/drad/fetch
# ---------------------------------------------------------------------------

class TestDradFetch:
    def test_rejects_empty_selection(self):
        res = client.post("/api/drad/fetch", json={"selected_items": []})
        assert res.status_code == 400

    def test_rejects_more_than_10_items(self):
        items = [{"system_no": "H94", "object_name": f"/DS1/R_TEST{i}"} for i in range(11)]
        res = client.post("/api/drad/fetch", json={"selected_items": items})
        assert res.status_code == 400

    def test_view_mode_for_single_item(self):
        with patch("routes.drad.fetch_artifact_code") as mock_fetch:
            mock_fetch.return_value = {
                "object_name": "/DS1/R_TEST1",
                "system_no": "H94",
                "sections": [{"label": "/DS1/R_TEST1", "code": "WRITE 'x'.", "is_main": True}],
                "error": None,
            }
            res = client.post("/api/drad/fetch", json={
                "selected_items": [{"system_no": "H94", "object_name": "/DS1/R_TEST1"}]
            })
        assert res.status_code == 200
        data = res.json()
        assert data["mode"] == "view"

    def test_compare_mode_for_two_items(self):
        def mock_fetch(system_no, object_name):
            return {
                "object_name": object_name,
                "system_no": system_no,
                "sections": [{"label": object_name, "code": f"WRITE '{system_no}'.", "is_main": True}],
                "error": None,
            }

        with patch("routes.drad.fetch_artifact_code", side_effect=mock_fetch), \
             patch("routes.drad._build_diff_analysis", return_value="## Overview\nThey differ."):
            res = client.post("/api/drad/fetch", json={
                "selected_items": [
                    {"system_no": "H94", "object_name": "/DS1/R_TEST1"},
                    {"system_no": "K94", "object_name": "/DS1/R_TEST2"},
                ]
            })
        assert res.status_code == 200
        data = res.json()
        assert data["mode"] == "compare"
        assert data["ai_analysis"] is not None

    def test_view_mode_for_three_items(self):
        def mock_fetch(system_no, object_name):
            return {
                "object_name": object_name,
                "system_no": system_no,
                "sections": [{"label": object_name, "code": "WRITE 'x'.", "is_main": True}],
                "error": None,
            }

        with patch("routes.drad.fetch_artifact_code", side_effect=mock_fetch):
            res = client.post("/api/drad/fetch", json={
                "selected_items": [
                    {"system_no": "H94", "object_name": "/DS1/R_A"},
                    {"system_no": "K94", "object_name": "/DS1/R_B"},
                    {"system_no": "H94", "object_name": "/DS1/R_C"},
                ]
            })
        assert res.status_code == 200
        data = res.json()
        assert data["mode"] == "view"

    def test_returns_502_when_all_fail(self):
        with patch("routes.drad.fetch_artifact_code") as mock_fetch:
            mock_fetch.return_value = {
                "object_name": "/DS1/R_TEST1",
                "system_no": "H94",
                "sections": [],
                "error": "Connection failed",
            }
            res = client.post("/api/drad/fetch", json={
                "selected_items": [{"system_no": "H94", "object_name": "/DS1/R_TEST1"}]
            })
        assert res.status_code == 502

    def test_partial_failures_do_not_block(self):
        def mock_fetch(system_no, object_name):
            if system_no == "H94":
                return {"object_name": object_name, "system_no": system_no,
                        "sections": [{"label": object_name, "code": "WRITE 'x'.", "is_main": True}], "error": None}
            return {"object_name": object_name, "system_no": system_no, "sections": [], "error": "Not found"}

        with patch("routes.drad.fetch_artifact_code", side_effect=mock_fetch):
            res = client.post("/api/drad/fetch", json={
                "selected_items": [
                    {"system_no": "H94", "object_name": "/DS1/R_GOOD"},
                    {"system_no": "K94", "object_name": "/DS1/R_BAD"},
                ]
            })
        assert res.status_code == 200
        data = res.json()
        assert data["fetch_summary"]["failed"][0]["system_no"] == "K94"


# ---------------------------------------------------------------------------
# /api/drad/generate-code
# ---------------------------------------------------------------------------

class TestDradGenerateCode:
    def test_requires_exactly_two_artifacts(self):
        res = client.post("/api/drad/generate-code", json={
            "artifacts": [{"system_no": "H94", "object_name": "/DS1/R_X", "code": "x"}]
        })
        assert res.status_code == 400

    def test_rejects_empty_codes(self):
        res = client.post("/api/drad/generate-code", json={
            "artifacts": [
                {"system_no": "H94", "object_name": "/DS1/R_X", "code": ""},
                {"system_no": "K94", "object_name": "/DS1/R_Y", "code": "   "},
            ]
        })
        assert res.status_code == 400

    def test_successful_generation(self):
        with patch("routes.drad.call_ai", return_value="## Code for H94\n```abap\nWRITE 'x'.\n```"):
            res = client.post("/api/drad/generate-code", json={
                "artifacts": [
                    {"system_no": "H94", "object_name": "/DS1/R_X", "code": "WRITE 'H94 code'."},
                    {"system_no": "K94", "object_name": "/DS1/R_Y", "code": "WRITE 'K94 code'."},
                ]
            })
        assert res.status_code == 200
        data = res.json()
        assert "generated_code" in data
        assert data["system_1"] == "H94"
        assert data["system_2"] == "K94"

    def test_ai_failure_returns_500(self):
        with patch("routes.drad.call_ai", side_effect=Exception("AI down")):
            res = client.post("/api/drad/generate-code", json={
                "artifacts": [
                    {"system_no": "H94", "object_name": "/DS1/R_X", "code": "WRITE 'x'."},
                    {"system_no": "K94", "object_name": "/DS1/R_Y", "code": "WRITE 'y'."},
                ]
            })
        assert res.status_code == 500


# ---------------------------------------------------------------------------
# drad_search module unit tests
# ---------------------------------------------------------------------------

class TestDradSearchModule:
    def test_search_returns_ranked_results(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        from core.drad_search import search_artefacts
        results = search_artefacts(excel_file, "Vietnam CCM print program")
        assert isinstance(results, list)
        # top result should be the Vietnam CCM one
        if results:
            assert "/DS1/R_TEST1" in results[0]["object_name"] or "vietnam" in results[0]["description"].lower()

    def test_search_returns_empty_for_nonsense(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        from core.drad_search import search_artefacts
        results = search_artefacts(excel_file, "xkcd 12345 zzz")
        assert results == []

    def test_raises_file_not_found(self, tmp_path):
        from core.drad_search import search_artefacts
        with pytest.raises(FileNotFoundError):
            search_artefacts(tmp_path / "missing.xlsx", "test")

    def test_get_available_systems_returns_list(self, tmp_path):
        excel_file = tmp_path / "artefacts.xlsx"
        SAMPLE_EXCEL_DATA.to_excel(excel_file, index=False)

        from core.drad_search import get_available_systems
        systems = get_available_systems(excel_file)
        assert "H94" in systems
        assert "K94" in systems

    def test_get_available_systems_returns_empty_for_missing(self, tmp_path):
        from core.drad_search import get_available_systems
        result = get_available_systems(tmp_path / "missing.xlsx")
        assert result == []


# ---------------------------------------------------------------------------
# drad_fetch module unit tests
# ---------------------------------------------------------------------------

class TestDradFetchModule:
    def test_get_rfc_destination_known_system(self):
        from core.drad_fetch import get_rfc_destination
        dest = get_rfc_destination("K94")
        assert dest == "TRUSTING@K94_0020183341"

    def test_get_rfc_destination_h94(self):
        from core.drad_fetch import get_rfc_destination
        dest = get_rfc_destination("H94")
        assert dest == "NONE"

    def test_get_rfc_destination_unknown_raises(self):
        from core.drad_fetch import get_rfc_destination
        with pytest.raises(ValueError, match="no configured RFC destination"):
            get_rfc_destination("ZZZ99")

    def test_fetch_returns_error_for_unknown_system(self):
        from core.drad_fetch import fetch_artifact_code
        result = fetch_artifact_code("ZZZ99", "/DS1/R_TEST")
        assert result["error"] is not None
        assert "RFC destination" in result["error"] or "configured" in result["error"]

    def test_extract_sections_normal_response(self):
        from core.drad_fetch import _extract_sections
        sections = _extract_sections(MOCK_SAP_RESPONSE, "/DS1/R_TEST1")
        assert len(sections) >= 1
        assert sections[0]["is_main"] is True
        assert "/DS1/R_TEST1" in sections[0]["label"]
        assert len(sections) == 2  # main + 1 child

    def test_extract_sections_empty_response(self):
        from core.drad_fetch import _extract_sections
        sections = _extract_sections({"d": {"results": []}}, "/DS1/R_TEST")
        assert sections == []

    def test_fetch_returns_error_on_connection_fail(self):
        import requests
        from core.drad_fetch import fetch_artifact_code
        with patch("core.drad_fetch._get_session") as mock_sess:
            session = MagicMock()
            session.get.side_effect = requests.exceptions.ConnectionError("refused")
            mock_sess.return_value = session

            result = fetch_artifact_code("H94", "/DS1/R_TEST")
        assert result["error"] is not None
        assert "connect" in result["error"].lower() or "connection" in result["error"].lower()

    def test_fetch_returns_error_on_timeout(self):
        import requests
        from core.drad_fetch import fetch_artifact_code
        with patch("core.drad_fetch._get_session") as mock_sess:
            session = MagicMock()
            session.get.side_effect = requests.exceptions.Timeout()
            mock_sess.return_value = session

            result = fetch_artifact_code("H94", "/DS1/R_TEST")
        assert result["error"] is not None
        assert "time" in result["error"].lower()

    def test_fetch_returns_not_found_when_no_sections(self):
        from core.drad_fetch import fetch_artifact_code
        with patch("core.drad_fetch._get_session") as mock_sess:
            session = MagicMock()
            resp = MagicMock()
            resp.status_code = 200
            resp.json.return_value = {"d": {"results": []}}
            session.get.return_value = resp
            mock_sess.return_value = session

            result = fetch_artifact_code("H94", "/DS1/R_NOTEXIST")
        assert result["error"] is not None
        assert "not found" in result["error"].lower()
