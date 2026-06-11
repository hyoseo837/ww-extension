-- 0012_scan_feedback.sql
-- User verdicts on scored postings (ADR 0044). One row per scan; re-submits
-- upsert so the latest verdict wins. description_text is stored only on 👎
-- (sent by the extension at feedback time — the scan row never holds it).
-- Backend (service role) is the sole writer, same posture as 0011.
-- Idempotent: safe to re-apply.

create table if not exists public.scan_feedback (
  scan_id           uuid primary key references public.scan(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  rating            text not null check (rating in ('up', 'down')),
  comment           text,
  description_text  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists scan_feedback_created_idx
  on public.scan_feedback (created_at desc);

alter table public.scan_feedback enable row level security;

-- Select-own as defense-in-depth; no insert/update/delete policy — writes go
-- through the backend's POST /scan/feedback only.
drop policy if exists scan_feedback_select_own on public.scan_feedback;
create policy scan_feedback_select_own on public.scan_feedback
  for select
  using (auth.uid() = user_id);
