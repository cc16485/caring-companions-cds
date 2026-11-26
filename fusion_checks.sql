-- Fusion checks after a referral or PCCP (2026-11-26, her ask: check Fusion 7+ days after, because the state notes there
-- when it cannot reach the consumer and when it will close the referral). One row per check Katlin (or anyone) records
-- through Claude. Server only. The first check is day 7, then every 3 days (setting fusion_checks.every_days).
-- Safe to run twice.
create table if not exists public.cds_fusion_checks (
  id             bigserial primary key,
  consumer_id    text not null,
  consumer_name  text,
  day            date not null,                  -- the Missouri day it was checked
  result         text not null check (result in ('nothing_new','state_cant_reach','assessment_set','more_info_needed','closed_by_state','authorized')),
  close_by       date,                           -- the date the state said it will close the referral
  assessment     date,
  state_phone    text,
  note           text,
  by_email       text not null,
  at             timestamptz not null default now()
);
create index if not exists cds_fusion_checks_consumer on public.cds_fusion_checks (consumer_id, at desc);
alter table public.cds_fusion_checks enable row level security;
revoke all on public.cds_fusion_checks from anon, authenticated;
revoke all on sequence public.cds_fusion_checks_id_seq from anon, authenticated;
insert into public.cds_match_settings (key, value, updated_by)
values ('fusion_checks', '{"every_days": 3}'::jsonb, 'fusion_checks.sql') on conflict (key) do nothing;
notify pgrst, 'reload schema';
