# ww-extension

Chrome MV3 extension that scores WaterlooWorks job postings via Gemini.
v4 in progress — adding monetization via a backend in `server/`
(user accounts + credit system). Monorepo since 2026-05-27 (ADR 0010
superseded ADR 0004). Current shipped state: v03.015.

## Before doing any work

Read in order:

1. `.claude/rules.html` — project rules (HTML docs, minimal code,
   `vX.Y.Z` versioning matching `manifest.json`, ADR pattern).
2. `docs/README.html` — doc map. Tells you which docs to read for
   which task; explains spec/ADR conventions.

Don't re-derive what these files already say. Don't duplicate them here.

## Quick orientation

- `docs/roadmap.html` — vision across major versions
- `docs/architecture.html` — current shipped system (extension half;
  `server/` arrives at v4.1 bootstrap)
- `docs/specs/` — per-phase specs (one file per phase, `vX.Y.Z-slug.html`)
- `docs/decisions/` — ADRs (numbered, immutable, subject-indexed)
- `docs/reference/` — stable lookup (WW DOM, storage schemas,
  authoritative backend API contract)
- `docs/archive/` — frozen old major versions (v01, v02, v03 used the
  older plan/impl/history shape)
- `server/` — FastAPI backend (created at v4.1 bootstrap; excluded
  from Web Store zip by `package.sh`)
- `docs/whiteboard.md` — user's personal scratchpad for raw ideas.
  Read for context; **do not edit without explicit permission**.

## Build / package

No build step. Load `dist/` as unpacked in Chrome for dev.
`./package.sh` produces the Web Store zip.

Version is in `manifest.json` and MUST match the commit-message version.
