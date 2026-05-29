-- 0004_purchase_idempotency.sql
-- Idempotency for Stripe webhook credit grants (v4.5).
-- One 'purchase' ledger row per Stripe event id (stored in ref), so a
-- replayed/retried checkout.session.completed event can't double-grant.
-- Stripe event ids are globally unique, so a purchase-scoped unique on ref
-- never collides with scan_debit/scan_refund rows (whose ref is a scan UUID).
-- Mirrors the signup_bonus partial unique index from 0001.
-- Idempotent: safe to re-apply.

create unique index if not exists credit_ledger_entry_purchase_ref_unique
  on public.credit_ledger_entry (ref)
  where kind = 'purchase';
