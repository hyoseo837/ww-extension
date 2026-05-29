-- 0006_match_criteria.sql
-- v5.0.0 structured match criteria (ADR 0013). Adds a single JSONB column
-- holding the whole evolving criteria object (work authorization + weighted,
-- tiered preferences). Shape is owned/validated by the backend Pydantic model;
-- the DB enforces only valid JSON. No change to `preferences` — it is
-- re-purposed unchanged as the "additional notes" field, so existing prose
-- carries over with no data migration.
-- Idempotent: safe to re-apply.

alter table public.user_profile
  add column if not exists match_criteria jsonb not null default '{}'::jsonb;
