-- 0008_scan_meta_batch.sql
-- Credit-history refinements (v6.2): richer descriptions + batch grouping.
--   title / org  — captured from the scan request meta, for history labels
--                  ("Scan · Apple Inc."). NULL for old rows / profile extracts.
--   batch_id     — shared id across all scans in one Scan run, so history can
--                  collapse them into one "Scanned N jobs" group. NULL for old
--                  rows and single profile extracts.
-- All nullable — existing rows degrade gracefully. Idempotent.

alter table public.scan add column if not exists title    text;
alter table public.scan add column if not exists org      text;
alter table public.scan add column if not exists batch_id uuid;
