-- 0009_ledger_audit_columns.sql
-- Audit trail for admin gift-credit grants (v6.6, ADR 0025).
--   created_by — the actor who wrote the row (the granting admin for
--                kind='admin_grant'). NULL for system/self rows and all
--                pre-v6.6 rows.
--   note       — free-text reason ("why"): goodwill, support make-good, promo.
-- Both nullable; existing rows degrade to NULL. Does NOT affect the balance
-- (SUM(delta) is unchanged). Idempotent: safe to re-apply.

alter table public.credit_ledger_entry
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists note       text;
