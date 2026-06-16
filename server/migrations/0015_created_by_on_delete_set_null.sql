-- 0015_created_by_on_delete_set_null.sql
-- Fix account deletion (ADR 0027): the credit_ledger_entry.created_by FK
-- (0009, admin-grant audit pointer) was added without an ON DELETE action,
-- so deleting an admin's auth.users row was blocked by a 23503 foreign-key
-- violation whenever that admin had granted credits to anyone — the row
-- (user_id) belongs to the RECIPIENT, not the admin, so cascade would wrong-
-- ly wipe another user's legitimate grant. SET NULL drops only the audit
-- pointer to the departed actor and keeps the recipient's ledger intact.
-- (user_id stays ON DELETE CASCADE from 0001 — the owner's own rows go.)
-- Idempotent: safe to re-apply.

alter table public.credit_ledger_entry
  drop constraint if exists credit_ledger_entry_created_by_fkey;

alter table public.credit_ledger_entry
  add constraint credit_ledger_entry_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
