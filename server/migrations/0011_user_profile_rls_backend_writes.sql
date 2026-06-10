-- 0011_user_profile_rls_backend_writes.sql
-- Harden user_profile RLS: the backend (service-role / direct Postgres,
-- bypasses RLS) is the sole writer. Dropping user_profile_modify_own
-- closes the direct PostgREST write path (anon key + user JWT) that
-- skipped FastAPI's Pydantic validation/normalization. No client uses
-- that path (verified 2026-06-10). Reads stay client-visible via
-- user_profile_select_own (0003).
-- Idempotent: safe to re-apply.

drop policy if exists user_profile_modify_own on public.user_profile;
