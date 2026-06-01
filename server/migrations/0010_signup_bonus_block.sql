-- 0010_signup_bonus_block.sql
-- Suppress repeat signup bonuses after account deletion (v6.9, ADR 0029).
--
-- The signup bonus is granted by grant_signup_bonus() on auth.users insert,
-- keyed per auth-row — so the hard delete chosen in ADR 0027 (which removes the
-- auth.users row + cascades the ledger) would let a delete + re-register re-grab
-- the 100-credit bonus. To make the bonus once-per-person, account deletion
-- records a one-way SHA-256 hash of the (lowercased) email here, and the trigger
-- below skips the grant when a matching hash exists. Only the hash is stored —
-- no plaintext email survives a deletion.
--
-- Idempotent: safe to re-apply.

-- digest() lives in pgcrypto. On Supabase it's pre-installed in the `extensions`
-- schema; this is a no-op there and installs into the default schema locally.
create extension if not exists pgcrypto;

create table if not exists public.signup_bonus_block (
  email_hash  text primary key,   -- encode(digest(lower(email),'sha256'),'hex')
  created_at  timestamptz not null default now()
);

-- Amend the bonus trigger to skip blocked identities. Behavior is otherwise
-- identical to 0005 (still 100 credits, once per auth-row via the partial unique
-- index). search_path includes `extensions` so digest() resolves whether
-- pgcrypto is installed there (Supabase) or in public (local).
create or replace function public.grant_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  bonus_amount constant int := 100;  -- signup bonus, in credits ($1 CAD)
begin
  -- ADR 0029: a previously-deleted identity does not get the bonus again.
  if new.email is not null and exists (
    select 1 from public.signup_bonus_block b
    where b.email_hash = encode(digest(lower(new.email), 'sha256'), 'hex')
  ) then
    return new;
  end if;

  insert into public.credit_ledger_entry (user_id, delta, kind)
  values (new.id, bonus_amount, 'signup_bonus');
  return new;
end;
$$;
