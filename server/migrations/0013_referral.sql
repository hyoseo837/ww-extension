-- 0013_referral.sql
-- Friend-invitation bonus (v8.12, ADR 0050): the inviter earns 20 credits
-- when an invited friend's first scan settles. Attribution is one row per
-- invitee, written by the backend when the invitee answers the optional
-- "Who invited you?" wizard step.
--
-- Idempotent: safe to re-apply.

create table if not exists public.referral (
  invitee_user_id  uuid primary key references auth.users(id) on delete cascade,
  inviter_user_id  uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now()
);

-- Backend-only table (service-role / direct connection). RLS on with no
-- policies denies anon/authenticated keys entirely — same defense-in-depth
-- posture as signup_bonus_block (0010) and user_profile writes (0011).
alter table public.referral enable row level security;

-- New ledger kind for the inviter's grant.
alter table public.credit_ledger_entry
  drop constraint if exists credit_ledger_entry_kind_check;
alter table public.credit_ledger_entry
  add constraint credit_ledger_entry_kind_check check (kind in (
    'signup_bonus', 'admin_grant', 'purchase',
    'scan_debit',   'scan_refund', 'referral_bonus'
  ));

-- At most one referral bonus per invitee, ever (ref = invitee user id).
-- This is the grant's idempotency key: the settlement hook does a plain
-- insert-or-ignore on every successful scan, and this index makes "first
-- scan only" emergent — no first-scan bookkeeping anywhere. Mirrors 0004's
-- purchase idempotency index.
create unique index if not exists credit_ledger_entry_referral_bonus_unique
  on public.credit_ledger_entry (ref)
  where kind = 'referral_bonus';
