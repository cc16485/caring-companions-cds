-- Background check proof for Roster attendants (2026-10-22, Samantha: "Yes, build the pull of the
-- GHL check PDFs and dates into the hub").
--
-- cds_roster_proof : one row per proof file (FCSR, EDL or OIG) for an attendant on the hub's Roster
--                    (agency_data 'attendants' id). source 'ghl' = copied from their GHL contact;
--                    'hub' = a recheck the office added on the attendant's card. The file itself is
--                    in the private bucket cds-screening-proof (cds_media row, kind 'proof').
--                    Missouri wants proof kept 5 years, so rows are never deleted by the hub.
--                    2026-10-22 (her yes): also the application and onboarding papers from the GHL
--                    Documents panel. A signed GHL e-sign record has no file: ghl_link opens it in GHL.
-- Nobody outside reads or writes this table: the cds-match server function does. Safe to run twice.

create table if not exists public.cds_roster_proof (
  id uuid primary key default gen_random_uuid(),
  attendant_id text not null,
  attendant_name text,
  check_key text not null check (check_key in ('fcsr','edl','oig')),
  media_id uuid references public.cds_media(id),
  file_name text,
  source text not null check (source in ('ghl','hub')),
  source_hash text not null,          -- ghl: hash of the GHL file address, so a file is copied once
  ghl_contact_id text,
  ghl_result text,                    -- what the GHL result dropdown said, when it could be read
  date_found date,                    -- the day the PDF was saved, read from the file
  checked_on date,                    -- the check date the office confirmed
  confirmed_by text,
  confirmed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  unique (attendant_id, source_hash)
);
-- Added 2026-10-22 (papers): safe on a table made by the first version.
alter table public.cds_roster_proof add column if not exists ghl_link text;
alter table public.cds_roster_proof drop constraint if exists cds_roster_proof_check_key_check;
alter table public.cds_roster_proof add constraint cds_roster_proof_check_key_check
  check (check_key in ('fcsr','edl','oig','application','onboarding'));

create index if not exists cds_roster_proof_att on public.cds_roster_proof (attendant_id, check_key);

alter table public.cds_roster_proof enable row level security;
revoke all on public.cds_roster_proof from anon, authenticated;
