-- 0003_user_profile.sql
-- Server-authoritative CV text + preferences. Replaces the inline
-- cv_text / preferences fields in POST /scan.
-- Idempotent: safe to re-apply.

create table if not exists public.user_profile (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  cv_text     text not null default '',
  preferences text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.user_profile enable row level security;

-- Forward-compat policies (backend bypasses RLS via service-role).
drop policy if exists user_profile_select_own on public.user_profile;
create policy user_profile_select_own on public.user_profile
  for select using (auth.uid() = user_id);

drop policy if exists user_profile_modify_own on public.user_profile;
create policy user_profile_modify_own on public.user_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
