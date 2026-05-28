-- 0001_credit_ledger.sql
-- Append-only credit ledger. Balance = SUM(delta) over a user's rows.
-- delta is NUMERIC(14, 6); 1 credit = $0.01 CAD.
-- Idempotent: safe to re-apply.

create table if not exists public.credit_ledger_entry (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  delta       numeric(14, 6) not null,
  kind        text not null check (kind in (
                'signup_bonus', 'admin_grant', 'purchase',
                'scan_debit',   'scan_refund'
              )),
  ref         text,
  created_at  timestamptz not null default now()
);

create index if not exists credit_ledger_entry_user_created_idx
  on public.credit_ledger_entry (user_id, created_at desc);

-- One signup bonus per user, ever.
create unique index if not exists credit_ledger_entry_signup_bonus_unique
  on public.credit_ledger_entry (user_id)
  where kind = 'signup_bonus';

-- RLS as defense-in-depth. Backend uses service-role and bypasses RLS;
-- this only matters if a future code path ever uses a user-role conn.
alter table public.credit_ledger_entry enable row level security;

drop policy if exists credit_ledger_entry_select_own on public.credit_ledger_entry;
create policy credit_ledger_entry_select_own on public.credit_ledger_entry
  for select
  using (auth.uid() = user_id);

-- Signup bonus trigger: grant 100 credits ($1 CAD) on first user creation.
create or replace function public.grant_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_ledger_entry (user_id, delta, kind)
  values (new.id, 100, 'signup_bonus');
  return new;
end;
$$;

drop trigger if exists grant_signup_bonus_trigger on auth.users;
create trigger grant_signup_bonus_trigger
  after insert on auth.users
  for each row
  execute function public.grant_signup_bonus();
