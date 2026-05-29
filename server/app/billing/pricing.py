"""Per-token credit pricing.

1 credit = $0.01 CAD. The credit-per-token rates are *derived* at import
from Google's raw USD list prices and three dials — the FX rate, the
credit value, and `MARGIN`:

    credits_per_token = USD_per_Mtok × (USD→CAD FX) × MARGIN
                        / (CAD per credit) / 1e6

To re-price, edit `MARGIN` (one number) — not the individual rates.

Calibration snapshot
--------------------
Date:    2026-05-29
Source:  https://ai.google.dev/pricing
USD→CAD: 1.37
Margin:  5.0× over raw Google rates (covers DO + Supabase fixed costs
         + FX cushion + actual margin). Rebalanced from 2.0× → 5.0× in
         v4.6 so the 100-credit signup bonus buys ~200 Flash scans (a
         meaningful trial) instead of a whole co-op term: at 2.0× the
         real v4.4 logs put a Flash scan at ~0.18 credits (~550 scans
         per bonus), too generous to ever drive a purchase. See spec
         v4.6.0 Notes for the rebalance rationale.

Updating the price is a code review + redeploy on purpose — see spec
v4.4.0 Notes ("Pricing constants live in code, not env").
"""

from decimal import Decimal

# Google's published per-million-token list prices, in USD.
_USD_PER_MTOK: dict[str, dict[str, Decimal]] = {
    "gemini-2.5-flash": {
        "input":        Decimal("0.30"),
        "cached_input": Decimal("0.075"),
        "output":       Decimal("2.50"),
    },
    "gemini-2.5-pro": {
        "input":        Decimal("1.25"),
        "cached_input": Decimal("0.31"),
        "output":       Decimal("10.00"),
    },
}

USD_TO_CAD = Decimal("1.37")       # FX snapshot (see docstring date)
CAD_PER_CREDIT = Decimal("0.01")   # 1 credit = $0.01 CAD

# The margin dial: multiplies raw Google cost to cover DO + Supabase
# fixed costs, FX cushion, and actual margin. THIS is the number to edit
# when re-pricing. v4.6 raised it 2.0 → 5.0 so the 100-credit signup
# bonus buys ~200 Flash scans instead of a whole co-op term.
MARGIN = Decimal("5.0")

# Credit-per-token rates, derived from the dials above.
_RATES: dict[str, dict[str, Decimal]] = {
    model: {
        unit: usd * USD_TO_CAD * MARGIN / CAD_PER_CREDIT / Decimal(1_000_000)
        for unit, usd in units.items()
    }
    for model, units in _USD_PER_MTOK.items()
}

# Conservative chars-per-token used for the pre-call estimate. English
# prose averages ~4; structured / multi-byte / code text sits closer to
# 3. Use 3 so the worst-case estimate genuinely covers the real input.
_CHARS_PER_TOKEN = 3

# Overhead the system prompt + JSON response schema add to every scan.
_SYSTEM_OVERHEAD_TOKENS = 200

# Scan output cap. Single source of truth — gemini.py imports this for the
# actual Gemini call, so the pre-debit estimate and the call can't desync.
DEFAULT_MAX_OUTPUT_TOKENS = 1024


# Default model for requests that don't carry one (e.g. PDF extract).
# Must be a key of _RATES above.
DEFAULT_MODEL = "gemini-2.5-flash"


def supported_models() -> list[str]:
    return list(_RATES)


def estimate_input_tokens(*chunks: str) -> int:
    """Char-based estimate, biased high. Used before the Gemini call."""
    chars = sum(len(c) for c in chunks)
    return chars // _CHARS_PER_TOKEN + _SYSTEM_OVERHEAD_TOKENS


def estimate_scan_cost(
    model: str,
    input_tokens: int,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    cached_input_tokens: int = 0,
) -> Decimal:
    """Worst-case credit cost the caller pre-debits."""
    rates = _RATES[model]
    fresh_input = max(0, input_tokens - cached_input_tokens)
    return (
        Decimal(fresh_input) * rates["input"]
        + Decimal(cached_input_tokens) * rates["cached_input"]
        + Decimal(max_output_tokens) * rates["output"]
    )


def actual_cost(model: str, usage: dict) -> Decimal:
    """Credit cost from Gemini's reported usageMetadata."""
    rates = _RATES[model]
    prompt = int(usage.get("promptTokenCount", 0))
    cached = int(usage.get("cachedContentTokenCount", 0))
    output = int(usage.get("candidatesTokenCount", 0))
    fresh = max(0, prompt - cached)
    return (
        Decimal(fresh) * rates["input"]
        + Decimal(cached) * rates["cached_input"]
        + Decimal(output) * rates["output"]
    )


# PDF extract: Gemini bills multimodal PDFs as ~258 input tokens per page.
# Page count isn't visible from the raw bytes without parsing the PDF, so
# we estimate it from the base64 size with a conservative ceiling. Real
# usage refunds the difference.
_PDF_TOKENS_PER_PAGE = 258
_PDF_BYTES_PER_PAGE_ESTIMATE = 100 * 1024  # ~100 KB per page; varies wildly
_PDF_MAX_PAGES_ESTIMATE = 10               # ceiling for the worst-case bill
_PDF_PROMPT_OVERHEAD_TOKENS = 100

# PDF-extract output cap. Single source of truth — gemini.py imports this
# for the actual call (mirrors the extension's old 8192-token max).
DEFAULT_EXTRACT_MAX_OUTPUT_TOKENS = 8192


def estimate_extract_cost(
    model: str,
    pdf_size_bytes: int,
    max_output_tokens: int = DEFAULT_EXTRACT_MAX_OUTPUT_TOKENS,
) -> Decimal:
    """Worst-case credit cost for a PDF extraction."""
    rates = _RATES[model]
    pages = max(
        1,
        min(_PDF_MAX_PAGES_ESTIMATE, (pdf_size_bytes // _PDF_BYTES_PER_PAGE_ESTIMATE) + 1),
    )
    input_tokens = pages * _PDF_TOKENS_PER_PAGE + _PDF_PROMPT_OVERHEAD_TOKENS
    return (
        Decimal(input_tokens) * rates["input"]
        + Decimal(max_output_tokens) * rates["output"]
    )
