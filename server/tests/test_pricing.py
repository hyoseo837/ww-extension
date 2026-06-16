"""Pure pricing math — no DB, no network.

Expected credit values are computed independently from the documented
formula (USD/Mtok × FX 1.37 × margin 10.0 / $0.01 / 1e6), so a change to
any pricing dial fails these tests on purpose: re-pricing is a deliberate
code review (spec v4.4.0), and the new numbers belong here too.
"""

from decimal import Decimal

from app.billing import pricing
from app.billing.payments import CREDIT_PACKAGES

# Derived flash rates at the 2026-05-29 calibration (credits per token).
FLASH_INPUT = Decimal("0.000411")
FLASH_CACHED = Decimal("0.00010275")
FLASH_OUTPUT = Decimal("0.003425")


def test_supported_models_includes_default():
    assert pricing.DEFAULT_MODEL in pricing.supported_models()


def test_estimate_input_tokens_is_chars_over_three_plus_overhead():
    assert pricing.estimate_input_tokens("a" * 300) == 100 + 200
    assert pricing.estimate_input_tokens("") == 200
    assert pricing.estimate_input_tokens("ab", "cd") == 1 + 200  # 4 chars // 3


def test_estimate_scan_cost_flash():
    cost = pricing.estimate_scan_cost("gemini-2.5-flash", 3000)
    expected = 3000 * FLASH_INPUT + 1024 * FLASH_OUTPUT
    assert cost == expected


def test_estimate_scan_cost_cached_input_is_cheaper():
    plain = pricing.estimate_scan_cost("gemini-2.5-flash", 3000)
    cached = pricing.estimate_scan_cost(
        "gemini-2.5-flash", 3000, cached_input_tokens=1000
    )
    assert cached == 2000 * FLASH_INPUT + 1000 * FLASH_CACHED + 1024 * FLASH_OUTPUT
    assert cached < plain


def test_actual_cost_from_usage():
    usage = {"promptTokenCount": 2500, "candidatesTokenCount": 400}
    assert pricing.actual_cost("gemini-2.5-flash", usage) == (
        2500 * FLASH_INPUT + 400 * FLASH_OUTPUT
    )


def test_actual_cost_subtracts_cached_tokens():
    usage = {
        "promptTokenCount": 2500,
        "cachedContentTokenCount": 500,
        "candidatesTokenCount": 400,
    }
    assert pricing.actual_cost("gemini-2.5-flash", usage) == (
        2000 * FLASH_INPUT + 500 * FLASH_CACHED + 400 * FLASH_OUTPUT
    )


def test_actual_cost_empty_usage_is_zero():
    assert pricing.actual_cost("gemini-2.5-flash", {}) == 0


def test_actual_cost_cached_never_exceeds_prompt():
    # fresh = max(0, prompt - cached): pathological usage can't go negative.
    usage = {"promptTokenCount": 100, "cachedContentTokenCount": 500}
    assert pricing.actual_cost("gemini-2.5-flash", usage) == 500 * FLASH_CACHED


def test_estimate_never_below_actual_for_capped_output():
    # The whole debit-then-refund design assumes the estimate is a ceiling:
    # same input tokens, output at the cap, can't out-cost the estimate.
    estimate = pricing.estimate_scan_cost("gemini-2.5-flash", 3000)
    worst_usage = {"promptTokenCount": 3000, "candidatesTokenCount": 1024}
    assert pricing.actual_cost("gemini-2.5-flash", worst_usage) <= estimate


def test_extract_cost_page_clamp():
    one_page = pricing.estimate_extract_cost("gemini-2.5-flash", 0)
    small = pricing.estimate_extract_cost("gemini-2.5-flash", 50 * 1024)
    big = pricing.estimate_extract_cost("gemini-2.5-flash", 2 * 1024 * 1024)
    huge = pricing.estimate_extract_cost("gemini-2.5-flash", 100 * 1024 * 1024)
    assert one_page == small          # both round to 1 page
    assert big == huge                # both clamp at 10 pages
    assert one_page < big


def test_credit_packages_sane():
    # Base rate 1 credit = 1 cent; bigger packs add bonus credits, never fewer
    # (ADR 0034). Ladder is $5/$10/$20 since v8.15 (ADR 0052).
    assert set(CREDIT_PACKAGES) == {"credits_525", "credits_1100", "credits_2500"}
    assert CREDIT_PACKAGES["credits_2500"]["cad_cents"] == 2000
    assert CREDIT_PACKAGES["credits_2500"]["credits"] == 2500
    for pkg in CREDIT_PACKAGES.values():
        assert pkg["credits"] >= pkg["cad_cents"]
