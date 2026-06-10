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

## Future features

- cover letter writer (very low priority)
- feedback loop of user — *(shaped 2026-06-10)* 👍/👎 per scored posting in
  the extension's score panel, optional one-line "what was wrong?" on 👎.
  New `scan_feedback` endpoint keyed to the existing scan row; store the full
  posting description **only on 👎** (needed to debug, tiny volume); list it
  in the admin page. Loop closes by hand: collect → review → tune prompt →
  re-test against flagged set. Real value = a growing gold set of
  (profile, criteria, posting, score, user verdict) to calibrate prompt
  changes against — incl. validating v8.5's phrasing-inferred importance.
  Deliberately NOT yet: per-user score adjustment, implicit signals
  (save/apply tracking), any tie to credit refunds. Slot after the two quick
  fixes below.
- extension also available on “Employer-Student Direct” page (currently only "Full Cycle Service" page)

## fixes needed

- reduce texts from getting-started page

## Possible questions

- subscription model / term pass (unlimited scan for certain period)

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

- ~~`user_profile` direct-write hardening (RLS)~~ — shipped (v8.3.2):
  migration 0011 drops `user_profile_modify_own`; backend is the sole
  writer. Applied to production Supabase 2026-06-10.

- ~~smaller delete account button~~ — shipped: compact (v8.3.1), then merged
  with Download-my-data into one "Your data" card, side by side (v8.4.5).

- ~~better Match preferences page UX~~ — shipped & launched 2026-06-10:
  v8.4 added the required setup wizard + gate (ADR 0040); v8.5 rebuilt the
  criteria as facts + "in your own words" with no weights/tiers (ADR 0041),
  term chips, and a research-hardened scoring prompt. Live as of the
  v8.5.7 merge to master.

- ~~dashboard get-started: scan is the finale, not a step~~ — shipped
  (v8.4.6): steps are install → upload application package → preferences
  wizard; completing all three reveals a "You're ready — scan your jobs!"
  button. Card still retires after the first scan.
