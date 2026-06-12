"""Pure scoring logic — verdict bands, result validation, prompt-input
serialization. No DB, no network (conftest stubs the env Settings needs)."""

import pytest

from app.scoring import gemini

# ── verdict_for (ADR 0017 ladder) ────────────────────────────────────────────


@pytest.mark.parametrize(
    ("score", "verdict"),
    [
        (20, "Strong Apply"),
        (17, "Strong Apply"),
        (16, "Apply"),
        (14, "Apply"),
        (13, "Consider"),
        (10, "Consider"),
        (9, "Unlikely"),
        (6, "Unlikely"),
        (5, "Skip"),
        (1, "Skip"),
    ],
)
def test_verdict_bands(score, verdict):
    assert gemini.verdict_for(score) == verdict


def test_excluded_overrides_any_score():
    assert gemini.verdict_for(20, excluded=True) == "Excluded"
    assert gemini.verdict_for(1, excluded=True) == "Excluded"


# ── _valid_result ────────────────────────────────────────────────────────────


def _result(**overrides):
    base = {
        "score": 12,
        "reason": "solid stack match",
        "breakdown": [{"point": "Python backend", "effect": "plus"}],
        "excluded": False,
    }
    base.update(overrides)
    return base


def test_valid_result_accepts_full_shape():
    assert gemini._valid_result(_result())


def test_valid_result_accepts_minimal_shape():
    # breakdown and excluded are optional — score() defaults them after.
    assert gemini._valid_result({"score": 12, "reason": "ok"})


@pytest.mark.parametrize(
    "bad",
    [
        "not a dict",
        _result(score=0),
        _result(score=21),
        _result(score="12"),
        _result(reason=""),
        _result(reason="   "),
        _result(breakdown="nope"),
        _result(breakdown=[{"effect": "plus"}]),                  # missing point
        _result(breakdown=[{"point": "", "effect": "plus"}]),     # blank point
        _result(breakdown=[{"point": "x", "effect": "neutral"}]),
        _result(excluded="yes"),
    ],
)
def test_valid_result_rejects(bad):
    assert not gemini._valid_result(bad)


# ── criteria / job-part serialization (ADR 0041) ─────────────────────────────


def test_format_criteria_empty_emits_nothing():
    assert gemini._format_criteria({}) == ""
    assert gemini._format_criteria(
        {"locations": [], "target_term": "", "work_authorization": None}
    ) == ""


def test_format_criteria_labels_and_joins():
    text = gemini._format_criteria(
        {
            "work_authorization": "citizen",
            "locations": ["Toronto", "Remote"],
            "target_term": "Fall 2026",
        }
    )
    assert "Work authorization: Canadian citizen" in text
    assert "Locations: Toronto, Remote" in text
    assert "Target term: Fall 2026" in text


def test_build_job_part_bare_posting():
    part = gemini.build_job_part(
        meta={"title": "Dev", "org": "Acme"},
        description_text="build things",
        preferences="",
        match_criteria={},
    )
    assert part.startswith("<job_posting>")
    assert "Job: Dev at Acme" in part
    assert "<match_criteria>" not in part
    assert "<candidate_notes>" not in part


def test_build_job_part_includes_criteria_and_notes():
    part = gemini.build_job_part(
        meta={"title": "Dev", "org": "Acme"},
        description_text="build things",
        preferences="I care about mentorship",
        match_criteria={"target_term": "Fall 2026"},
    )
    assert part.index("<match_criteria>") < part.index("<candidate_notes>")
    assert part.index("<candidate_notes>") < part.index("<job_posting>")


# ── profile context (ADR 0015 fallback chain) ────────────────────────────────


def test_profile_context_prefers_structured_profile():
    text = gemini.build_profile_context(
        {"summary": "CS student", "skills": ["Python", "Go"]}, [], "legacy blob"
    )
    assert "Summary: CS student" in text
    assert "Skills: Python, Go" in text
    assert "legacy blob" not in text


def test_profile_context_falls_back_to_cv_text():
    assert gemini.build_profile_context({}, [], "  legacy blob  ") == "legacy blob"
    assert gemini.build_profile_context(None, [], "legacy blob") == "legacy blob"


def test_profile_context_appends_supplement_as_self_reported():
    text = gemini.build_profile_context(
        {"summary": "CS student"},
        [{"kind": "project", "title": "Side thing", "description": "built it"}],
        "",
    )
    assert "Additional (self-reported):" in text
    assert "Project: Side thing — built it" in text


def test_profile_context_empty_everything_is_empty():
    assert gemini.build_profile_context(None, [], "") == ""
    assert gemini.build_profile_context({}, [], "   ") == ""


# ── ScanRequest model default (v8.11) ────────────────────────────────────────


def test_scan_request_defaults_model_server_side():
    from uuid import uuid4

    from app.billing import pricing
    from app.scoring.routes import ScanRequest

    req = ScanRequest(
        scan_id=uuid4(),
        meta={"title": "t", "org": "o"},
        description_text="desc",
        posting_id="123",
    )
    assert req.model == pricing.DEFAULT_MODEL
    assert pricing.DEFAULT_MODEL in pricing.supported_models()
