-- 0007_profile_json.sql
-- v5.1.0 structured profile (ADR 0015). Adds two JSONB columns to
-- user_profile: profile_json (the machine-extracted structured profile,
-- overwritten by POST /profile/extract) and profile_supplement (user-authored
-- experience/project entries, written only by PUT /profile). Shapes are
-- owned/validated by backend Pydantic models; the DB enforces only valid JSON.
-- cv_text is kept as a fallback (no migration, no forced re-upload) — the scan
-- uses profile_json when non-empty, else cv_text.
-- Idempotent: safe to re-apply.

alter table public.user_profile
  add column if not exists profile_json jsonb not null default '{}'::jsonb;

alter table public.user_profile
  add column if not exists profile_supplement jsonb not null default '[]'::jsonb;
