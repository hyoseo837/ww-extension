"""Server-side input caps (v8.9, audit #5). Pure validation — no DB.

conftest forces dummy env vars before these imports, so app modules load
without touching real settings.
"""

import uuid

import pytest
from pydantic import ValidationError

from app.main import _MAX_BODY_BYTES, body_too_large
from app.scoring.routes import (
    _MAX_DESC_CHARS,
    _MAX_PDF_B64_CHARS,
    ExtractRequest,
    FeedbackRequest,
    ScanRequest,
)


def _scan_kwargs(**overrides):
    kwargs = {
        "scan_id": uuid.uuid4(),
        "model": "gemini-2.5-flash",
        "meta": {"title": "Dev", "org": "Acme"},
        "description_text": "a job",
        "posting_id": "471670",
    }
    kwargs.update(overrides)
    return kwargs


def test_scan_accepts_max_description():
    req = ScanRequest(**_scan_kwargs(description_text="x" * _MAX_DESC_CHARS))
    assert len(req.description_text) == _MAX_DESC_CHARS


def test_scan_rejects_oversized_description():
    with pytest.raises(ValidationError):
        ScanRequest(**_scan_kwargs(description_text="x" * (_MAX_DESC_CHARS + 1)))


def test_scan_rejects_oversized_meta_and_posting_id():
    with pytest.raises(ValidationError):
        ScanRequest(**_scan_kwargs(meta={"title": "x" * 301, "org": ""}))
    with pytest.raises(ValidationError):
        ScanRequest(**_scan_kwargs(posting_id="1" * 33))


def test_extract_rejects_oversized_pdf():
    with pytest.raises(ValidationError):
        ExtractRequest(
            scan_id=uuid.uuid4(), pdf_b64="A" * (_MAX_PDF_B64_CHARS + 1)
        )


def test_feedback_rejects_oversized_comment_and_description():
    ok = FeedbackRequest(scan_id=uuid.uuid4(), rating="down", comment="x" * 2000)
    assert ok.rating == "down"
    with pytest.raises(ValidationError):
        FeedbackRequest(scan_id=uuid.uuid4(), rating="down", comment="x" * 2001)
    with pytest.raises(ValidationError):
        FeedbackRequest(
            scan_id=uuid.uuid4(), rating="down", description_text="x" * 8001
        )


def test_body_too_large():
    assert body_too_large(str(_MAX_BODY_BYTES + 1))
    assert not body_too_large(str(_MAX_BODY_BYTES))
    assert not body_too_large(None)
    assert not body_too_large("not-a-number")
