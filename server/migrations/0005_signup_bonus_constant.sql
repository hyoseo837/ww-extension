-- 0005_signup_bonus_constant.sql
-- Make the signup-bonus amount a named constant inside the trigger (v4.7).
-- Behavior is identical to 0001 (still 100 credits, one per user via the
-- partial unique index): the amount is just no longer buried in the insert,
-- so it's a single greppable spot to adjust. create-or-replace updates the
-- function in place; the grant_signup_bonus_trigger from 0001 is untouched.
-- Idempotent: safe to re-apply.

create or replace function public.grant_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bonus_amount constant int := 100;  -- signup bonus, in credits ($1 CAD)
begin
  insert into public.credit_ledger_entry (user_id, delta, kind)
  values (new.id, bonus_amount, 'signup_bonus');
  return new;
end;
$$;
