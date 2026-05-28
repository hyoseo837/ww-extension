-- 0002_scan.sql
-- Per-call audit + idempotency record for billable Gemini calls.
-- PK is a client-generated UUID so retries hit ON CONFLICT DO NOTHING.
-- 1 credit = $0.01 CAD; cost columns are NUMERIC(14, 6) to match the ledger.
-- Idempotent: safe to re-apply.

create table if not exists public.scan (
  id              uuid primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  model           text not null,
  kind            text not null check (kind in ('scan', 'profile_extract')),
  posting_id      text,
  status          text not null check (status in ('pending', 'success', 'failed')),
  estimated_cost  numeric(14, 6) not null,
  actual_cost     numeric(14, 6),
  response        jsonb,
  usage           jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists scan_user_created_idx
  on public.scan (user_id, created_at desc);

-- RLS as defense-in-depth, same pattern as credit_ledger_entry.
alter table public.scan enable row level security;

drop policy if exists scan_select_own on public.scan;
create policy scan_select_own on public.scan
  for select
  using (auth.uid() = user_id);
