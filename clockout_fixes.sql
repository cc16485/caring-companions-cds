-- FORGOT TO CLOCK OUT (Samantha, 2026-11-17): "text someone if they don't clock out and prompt them to complete
-- the evv form and then you fix the shift based on the evv form info". Logic: supabase/functions/_shared/office/clockout.js,
-- server function cds-clockout.
--   cds_clockout_fixes: one row per shift WellSky shows as never clocked out. Only the server reads or writes it
--     (the hub card and the form go through cds-clockout). The attendant's phone and the link fingerprint live here.
--   evv_submissions.clockout_fix_id: the signed EVV form that answers one of these shifts.
--   setting clockout_texts: starts OFF (live false). While off, every text is written to Messages as practice.
-- Safe to run twice.
begin;
create table if not exists public.cds_clockout_fixes (
  id uuid primary key default gen_random_uuid(),
  shift_key text not null unique,                 -- consumer name key | clock in to the minute
  consumer text not null,
  attendant text,
  attendant_guessed boolean not null default false, -- true: the one active attendant the hub roster has for that consumer
  clock_in text not null check (clock_in ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'),   -- WellSky's own Central clock as written, no time zone
  sources jsonb not null default '[]'::jsonb,
  phone text,
  status text not null default 'found'
    check (status in ('found','no_phone','no_attendant','texted','answered','approved','fixed','denied','closed')),
  problem text,
  token_hash text unique,
  link_expires_at timestamptz,
  texted_at timestamptz,
  text_status text check (text_status in ('practice','sent','failed','office')),
  text_error text,
  evv_id uuid,
  answer jsonb,
  answered_at timestamptz,
  decided_by text, decided_at timestamptz,
  fixed_by text, fixed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cds_clockout_fixes_status on public.cds_clockout_fixes (status);
alter table public.cds_clockout_fixes enable row level security;
revoke all privileges on public.cds_clockout_fixes from anon, authenticated;
grant all privileges on public.cds_clockout_fixes to service_role;

alter table public.evv_submissions add column if not exists clockout_fix_id uuid;

insert into public.cds_match_settings (key, value, updated_by) values
  ('clockout_texts', '{"live": false, "open_hours": 12, "look_back_days": 7, "text_from": 9, "text_until": 19, "text_days": [0,1,2,3,4,5,6], "link_days": 10}'::jsonb, 'clockout_fixes.sql')
on conflict (key) do nothing;
commit;
notify pgrst, 'reload schema';

-- Schedule (set by the deploy script, which holds CDS_JOB_SECRET): every hour at :10, POST cds-clockout with
-- header x-cron-secret and body {"action":"sweep"}. The sweep only texts between text_from and text_until Central.
-- Undo: alter table public.evv_submissions drop column if exists clockout_fix_id; drop table if exists public.cds_clockout_fixes;
--       delete from public.cds_match_settings where key='clockout_texts';
