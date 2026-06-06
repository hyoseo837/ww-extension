# ww-extension

Chrome MV3 extension that scores WaterlooWorks job postings via Gemini,
with a `server/` backend (user accounts + credit system) and a `web/`
account/profile/payment app. Monorepo since 2026-05-27 (ADR 0010
superseded ADR 0004). v4 (monetization), v5 (scoring quality), v6
(web-app UI transition + data rights), and v7 (extension Web Store
approval + website integration) are shipped and frozen;
**v8 — maintenance & polish — is the active major** (opened 2026-06-05).
The web app is deployed and the extension is published on the Web Store
(approved as 7.1.1 on 2026-06-04); v8 is cleanup + small fixes on top.

## Before doing any work

Read in order:

1. `.claude/rules.html` — project rules (HTML docs, minimal code,
   `vX.Y.Z` versioning matching `manifest.json`, ADR pattern).
2. `docs/README.html` — doc map. Tells you which docs to read for
   which task; explains spec/ADR conventions.

Don't re-derive what these files already say. Don't duplicate them here.

## How to work (phase workflow)

This order is load-bearing — follow it for every phase, not just when asked:

1. **Documentation first.** Before writing any code, write the phase spec
   (`docs/specs/vX.Y.Z-slug.html`) and an ADR
   (`docs/decisions/NNNN-slug.html`) for any significant decision. Build the
   code from them. Treat existing specs/roadmap as user-confirmed; if a phase
   is vague or involves product / pricing / money calls, clarify scope with
   the user **before** locking the spec.
2. **Then implement** what the spec describes — nothing more.
3. **Commit between phases.** Each sub-version (`vX.Y.Z`) is its own commit,
   with the version in the message matching `manifest.json` (ADR 0002). Slice
   the work (backend / client / close-out) the way the spec lays out — don't
   batch a whole feature into one commit, and don't defer all commits to the
   end.

(Earlier agents skipped straight to code, and batched commits — don't.)

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
- `ext/` — the Chrome extension source (manifest, src/, icons/,
  options.html, welcome.html, design/, screenshots/); ADR 0026
- `web/` — Vite+React web app (account/profile/payments + admin)
- `server/` — FastAPI backend (created at v4.1 bootstrap; excluded
  from Web Store zip by `package.sh`)
- `docs/whiteboard.md` — user's personal scratchpad for raw ideas.
  Read for context; **do not edit without explicit permission**.

## Build / package

No build step. The extension source lives in `ext/` (ADR 0026). Load the
**`ext/` folder** as unpacked in Chrome for dev (`ext/manifest.json`
references `ext/src/`). `dist/` (repo root) holds only the packaged Web Store
zips — it is not a loadable unpacked directory. `./package.sh` (repo root)
zips from `ext/` into `dist/`.

Version is in `ext/manifest.json` and MUST match the commit-message version.
