# Whiteboard

Personal scratchpad for ideas, possible changes, and future updates.
Low-friction — jot here first, formalize later if it survives.

**Lifecycle out of the whiteboard:**

```
whiteboard.md → roadmap.html (when it matures into a real direction)
             → docs/specs/vX.Y.Z-*.html (when scheduled into a phase)
             → docs/decisions/NNNN-*.html (if a significant call is made along the way)
```

**For agents:** read this for context. **Do not edit without explicit permission.**
This file reflects the user's evolving thinking, not decided work — promoting
an entry out of here is a user decision, not an agent decision.

**Convention:** add a dated section for new entries. Free-form bullets.
No required schema. Strike through (`~~text~~`) or delete entries you've
moved out or dropped.

---

## Existing Bugs

- (2026-06-06, security review) **`user_profile` direct-write hardening.**
  The RLS policy `user_profile_modify_own` (`for all`) lets an authenticated
  user write their own profile row directly via PostgREST with the anon key,
  bypassing the FastAPI backend's Pydantic validation/normalization. Not a
  vulnerability (own-row only), but consider narrowing it to `for select` so
  the backend (service-role, direct Postgres conn) is the sole writer.
  Touches `server/migrations/0003_user_profile.sql`.

## Future features

- Diffrent models (Gemini pro, Claude Haiku, Sonnet, Opus, Gpt 5.5, mini ...)
- re-score feature

## fixes needed

## Possible questions

## Solved

- ~~add account section in option page~~ — shipped (v4.2–v4.5): Account
  card in options page with sign-in, email, balance, Buy credits, sign-out.
  Further consolidation (dedicated area + credit history) still tracked as
  v5 roadmap thread #5, possibly subsumed by the external-site direction.

- ~upgrade prompt for job scan~ - shipped (v5)
- upgrade prompt for upload application package (not just extracting text)

- ~~confirmation button for any credit uses~~ — shipped: the scan confirm
  (v6.13) already gated the only credit-spending action; v7.5.1 added the
  estimated cost, low-balance warning, and a Buy-credits nudge.

- ~~JavaScript to TypeScript~~ — dropped (v7.5.2, ADR 0037): the extension
  ships fine in JS; the migration had zero Web-Store benefit and would add a
  build step superseding ADR 0026. De-committed to roadmap "Further out".
