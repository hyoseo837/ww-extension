"""Per-token credit pricing.

1 credit = $0.01 CAD. Rates below are credits-per-token, pre-computed
as `USD_per_token × (USD→CAD FX) × margin / 0.01`.

Calibration snapshot
--------------------
Date:    2026-05-28
Source:  https://ai.google.dev/pricing
USD→CAD: 1.37
Margin:  2.0× over raw Google rates (covers DO + Supabase fixed costs
         + FX cushion + actual margin; revisit when real cost data
         lands from the v4.4.0 logs).

Updating a rate is a code review + redeploy on purpose — see spec
v4.4.0 Notes ("Pricing constants live in code, not env").
"""

from decimal import Decimal

# Per-million-token USD rates from the snapshot above.
# Kept here as comments alongside the derived credit rates so future
# diffs of this file show both numerators side-by-side.
#
# gemini-2.5-flash:  input $0.30  · cached $0.075 · output $2.50  per 1M
# gemini-2.5-pro:    input $1.25  · cached $0.31  · output $10.00 per 1M

_RATES: dict[str, dict[str, Decimal]] = {
    "gemini-2.5-flash": {
        "input":        Decimal("0.0000822"),  # 0.30  * 1.37 * 2 / 0.01 / 1e6
        "cached_input": Decimal("0.0000206"),  # 0.075 * 1.37 * 2 / 0.01 / 1e6
        "output":       Decimal("0.0006850"),  # 2.50  * 1.37 * 2 / 0.01 / 1e6
    },
    "gemini-2.5-pro": {
        "input":        Decimal("0.0003425"),  # 1.25  * 1.37 * 2 / 0.01 / 1e6
        "cached_input": Decimal("0.0000850"),  # 0.31  * 1.37 * 2 / 0.01 / 1e6
        "output":       Decimal("0.0027400"),  # 10.00 * 1.37 * 2 / 0.01 / 1e6
    },
}

# Conservative chars-per-token used for the pre-call estimate. English
# prose averages ~4; structured / multi-byte / code text sits closer to
# 3. Use 3 so the worst-case estimate genuinely covers the real input.
_CHARS_PER_TOKEN = 3

# Overhead the system prompt + JSON response schema add to every scan.
_SYSTEM_OVERHEAD_TOKENS = 200

# What we tell Gemini to cap output at (mirrors background.js).
DEFAULT_MAX_OUTPUT_TOKENS = 1024


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
