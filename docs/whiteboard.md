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

- for credit field, add login with uwaterloo if not loged in.

## fixes needed

## Possible questions

- subscription model / term pass (unlimited scan for certain period)
- cover letter generator

## Solved

- ~~account section in option page~~ — shipped (v4.2–v4.5)
- ~~upgrade prompt for job scan~~ — shipped (v5)
- ~~upgrade prompt for upload application package~~ — shipped (v6.13.2)
- ~~confirmation button for credit uses~~ — shipped (v6.13, v7.5.1)
- ~~friend invitation (bonus credit on invitee's first scan)~~ — shipped (v8.12, ADR 0050)
- ~~JavaScript to TypeScript~~ — dropped (v7.5.2, ADR 0037)
- ~~`user_profile` direct-write hardening (RLS)~~ — shipped (v8.3.2)
- ~~smaller delete account button~~ — shipped (v8.3.1, v8.4.5)
- ~~better Match preferences page UX~~ — shipped (v8.4–v8.5, ADR 0040/0041)
- ~~dashboard get-started: scan is the finale~~ — shipped (v8.4.6)
- ~~reduce texts from getting-started page~~ — shipped (v8.6.1, ADR 0043)
- ~~plan messages: emphasize it's not expensive~~ — tried, rolled back (v8.6.2/v8.6.4)
- ~~feedback loop of user~~ — shipped (v8.6.6, ADR 0044)
- ~~extension on "Employer-Student Direct" page~~ — shipped (v8.7)
- ~~score badge missing on Direct page job table~~ — fixed (v8.8.4)
- ~~scan job one by one (enter post id)~~ — shipped sidebar input (v8.16.1, ADR 0053); detail-page "Scan this job" button deferred, needs a WW posting-detail DOM capture
- ~~export / import scans to/from a file (share between devices / backup)~~ — shipped as JSON, all boards, merge-with-warning, schema-gated (v8.17.2, ADR 0054)
- ~~icon next to settings button → opens web app~~ — shipped (v8.17.1)
