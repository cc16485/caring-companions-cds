-- THE FILLED-IN EVV FORM AND THE OFFICE CARD for never-clocked-out shifts (Samantha, 2026-11-17: "you fix the shift
-- based on the evv form info"). Goes with the never-clocked-out texts (open_shift_texts.sql, switch open_shift_texts).
-- Logic: supabase/functions/_shared/office/clockout.js; the form and the card use the cds-clockout server function.
--   cds_clockout_fixes: one row per texted shift, with the private link's fingerprint. Only the server reads or writes it.
--   evv_submissions.clockout_fix_id: the signed EVV form that answers one of these shifts.
-- No new switch: nothing is sent unless open_shift_texts is on. Safe to run twice.
begin;
create table if not exists public.cds_clockout_fixes (
  id uuid primary key default gen_random_uuid(),
  shift_key text not null unique,                 -- the texts job's key: open|consumer|clock in to the minute
  consumer text not null,
  attendant text,
  clock_in text not null check (clock_in ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'),   -- WellSky's own Central clock, no time zone
  status text not null default 'waiting'
    check (status in ('waiting','no_phone','answered','approved','fixed','denied','closed')),
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
commit;
notify pgrst, 'reload schema';

-- Deploy: this SQL, then cds-clockout (--no-verify-jwt: the form has no sign-in) and cds-open-shifts again.
-- Undo: alter table public.evv_submissions drop column if exists clockout_fix_id; drop table if exists public.cds_clockout_fixes;
