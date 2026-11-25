-- Caregiver sign-up made easier (2026-11-24, her "Yes, build all three").
-- 1. Personal sign-up links for former Caring Companions caregivers (cds_cg_invites).
-- 2. "Finish your profile" reminders, switched OFF to start (setting cg_profile_reminders).
-- Safe to run twice. Nothing is sent by running it.

create table if not exists cds_cg_invites (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  first_name  text,
  last_name   text,
  phone       text,
  email       text,
  city        text,
  batch       text,
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '120 days',
  opened_at   timestamptz,
  used_at     timestamptz,
  pool_id     uuid
);
alter table cds_cg_invites enable row level security;
revoke all on cds_cg_invites from anon, authenticated;
create index if not exists cds_cg_invites_batch on cds_cg_invites (batch);

-- Reminders start OFF. Samantha turns them on after she approves the wording.
insert into cds_match_settings (key, value)
values ('cg_profile_reminders', '{"live": false, "first_after_hours": 20, "second_after_hours": 72, "window_days": 14}'::jsonb)
on conflict (key) do nothing;
