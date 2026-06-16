-- 0014_signup_bonus_200.sql
-- Double the signup-bonus amount 100 -> 200 credits (v8.15, ADR 0052).
-- At today's ~2 credits/scan rate (ADR 0048) the old 100-credit bonus bought
-- only ~50 scans; 200 restores the "~100 free scans" welcome.
--
-- Recreates the trigger function in place. Based on the CURRENT definition
-- (0010, not 0005): the ADR 0029 re-register suppression check and the
-- `search_path = public, extensions` (so digest() resolves) are preserved
-- verbatim — only bonus_amount changes. Still one bonus per auth-row via the
-- partial unique index. Only future grants change; existing 100-credit
-- bonuses stand.
-- Idempotent: safe to re-apply.

create or replace function public.grant_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  bonus_amount constant int := 200;  -- signup bonus, in credits ($2 CAD)
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
