"""Model-facing prompts and response schemas — the scan + extract contract.

Kept in a distinct file from the Gemini client logic in `gemini.py` so the
prompts are easy to find and iterate on. Server-side only (like the rest of
`server/`, excluded from the Web Store zip), so the scoring prompt and tuning
never ship to end users. `gemini.py` imports these.
"""

# ── Scan / scoring ─────────────────────────────────────────────────────────────

SYSTEM_TEXT = """You score how well a University of Waterloo student fits a job posting on WaterlooWorks, to help the student decide whether to apply.

These are early-career candidates — co-op/internship students and graduating students seeking new-grad roles. Postings vary widely: a co-op work term may run ~4, 8, or 12 months or span multiple terms, and some postings are full-time or new-grad roles. Judge fit for the role as actually described — its field, seniority, and duration — never a fixed assumption about length. For co-op and new-grad roles, calibrate to an early-career applicant: the candidate need not meet every "nice to have"; strong fundamentals plus a few relevant skills already make a good fit. Hold the bar higher only for a clearly senior or specialized role.

Weigh the candidate's match criteria by their stated importance — "must" criteria dominate, "strong" matter a lot, "nice-to-have" are minor nudges. The candidate's target term and term length are criteria too: a posting whose duration conflicts with what the candidate wants (e.g. a 4-month term when they asked for 8) is a real negative, weighted like any other stated preference.

Work through the output in this order — analyze first, score last:
1. breakdown: the few specific points (match criteria or profile facts) that most move the score, each as {point, effect} where effect is "plus" if it raises the score or "minus" if it lowers it. Be concrete and contrastive, e.g. {"point": "requires Canadian citizenship", "effect": "minus"} or {"point": "Python + AWS match the stack", "effect": "plus"}. Keep it to the ~6 most decisive points.
2. excluded: true only when the posting is a hard no-go for this candidate — set it and name the gate as a "minus" point above. A hard no-go is either (a) a work-authorization, citizenship, or security-clearance requirement the candidate does not satisfy (e.g. a US-citizen-only or clearance-required posting for an international student), or (b) something the posting matches that the candidate placed in their "excluded"/"never" criteria tier (a location, language, or term they ruled out). Otherwise false.
3. reason: 2–3 sentences explaining the decision from the applicant's perspective.
4. score: an integer from 1 to 20, consistent with the breakdown above:
- 17–20: excellent fit — skills/experience and criteria line up strongly; prioritize applying.
- 14–16: good fit — clearly worth applying; most key signals align.
- 10–13: marginal — some alignment but notable gaps; apply only if interested.
- 6–9: weak — significant mismatch on skills, level, or stated preferences.
- 1–5: poor — wrong field/level, or a hard exclusion applies (when excluded is true, score here).

Do NOT output a verdict label — the score and the exclusion flag determine it."""

# Key order = generation order: the model lays out its analysis (breakdown,
# excluded flag, reason) before committing to the score — a chain-of-thought
# ordering that improves scoring accuracy. propertyOrdering pins this for
# Gemini, and the prompt's field list above is in the same order (a mismatch
# confuses the model). See ADR 0017 + spec v5.2.0.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "breakdown": {
            "type": "array",
            "description": "Up to ~6 decisive points that raised or lowered the score.",
            "items": {
                "type": "object",
                "properties": {
                    "point":  {"type": "string"},
                    "effect": {"type": "string", "enum": ["plus", "minus"]},
                },
                "required": ["point", "effect"],
            },
        },
        "excluded": {
            "type": "boolean",
            "description": "True only if a hard eligibility/criteria gate rules the candidate out.",
        },
        "reason": {
            "type": "string",
            "description": "2–3 sentence explanation of the decision.",
        },
        "score": {
            "type": "integer",
            "description": "Fit rating from 1 (poor) to 20 (excellent).",
        },
    },
    "propertyOrdering": ["breakdown", "excluded", "reason", "score"],
    "required": ["score", "reason", "excluded"],
}


# ── Profile extraction (PDF → structured profile) ──────────────────────────────

PROFILE_EXTRACT_PROMPT = (
    "This is a WaterlooWorks application package PDF that may bundle several "
    "documents: a résumé/CV, a grade report (transcript), a University of "
    "Waterloo co-op work-history summary, and sometimes a cover letter. Extract "
    "into the given JSON schema.\n"
    "From the résumé/CV, fill the structured fields: summary (a 1–2 sentence "
    "overview), education, experience, projects (one object per entry, most "
    "recent first), skills, and languages (spoken/working languages like "
    "English or French — not programming languages, which go in skills).\n"
    "Copy these other documents verbatim into their fields, PRESERVING the "
    "original line breaks — put each transcript/course row, each work-term "
    "entry, and each paragraph on its own line (use newlines; do not flatten "
    "the text into one line): the grade report → grade_report, the co-op "
    "work-history summary → coop_history, the cover letter → cover_letter.\n"
    "Use empty strings/arrays for any document or field the package doesn't "
    "contain; do not invent facts."
)

# Gemini structured-output schema. Optional fields throughout — the extractor
# leaves them empty when the PDF is silent (validated app-side by StructuredProfile).
PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "institution": {"type": "string"},
                    "credential": {"type": "string"},
                    "field": {"type": "string"},
                    "grade": {"type": "string"},
                    "dates": {"type": "string"},
                },
            },
        },
        "experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "org": {"type": "string"},
                    "dates": {"type": "string"},
                    "description": {"type": "string"},
                },
            },
        },
        "skills": {"type": "array", "items": {"type": "string"}},
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                },
            },
        },
        "languages": {"type": "array", "items": {"type": "string"}},
        # Raw-text dumps of the package's other documents (v5.1.6).
        "grade_report": {"type": "string"},
        "coop_history": {"type": "string"},
        "cover_letter": {"type": "string"},
    },
}
