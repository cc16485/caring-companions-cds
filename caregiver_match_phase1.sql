-- CDS Caregiver Match, Phase 1 schema.
-- NOT APPLIED to the live CDS project. Approved for practice mode only (2026-10-15).
--
-- Every new table has RLS on and NO grants to anon or authenticated: families,
-- caregivers and staff all reach this data only through the cds-match server
-- function, which checks who is asking on every request.
-- Caregivers stay in the existing attendant_pool table (extended, not copied).
-- Families stay GoHighLevel contacts; cds_prospects holds only the link, a
-- first name and town for display, and matching state.

-- ---------- attendant_pool: a few new columns ----------
alter table public.attendant_pool
  add column if not exists fcsr_registered_answer text check (fcsr_registered_answer in ('yes','no','not_sure')),
  add column if not exists office_reviewed_at timestamptz,
  add column if not exists office_reviewed_by text,
  add column if not exists ghl_contact_id text;

-- The public sign-up form may answer the FCSR question, but never the office fields.
create or replace function public.attendant_pool_match_lock()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'anon' then
    new.office_reviewed_at := null;
    new.office_reviewed_by := null;
    new.ghl_contact_id := null;
  end if;
  return new;
end $$;
drop trigger if exists attendant_pool_match_lock_trg on public.attendant_pool;
create trigger attendant_pool_match_lock_trg before insert on public.attendant_pool
  for each row execute function public.attendant_pool_match_lock();
revoke execute on function public.attendant_pool_match_lock() from public, anon, authenticated;

-- ---------- settings ----------
create table if not exists public.cds_match_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.cds_match_settings (key, value) values
  ('messages_live', 'false'::jsonb),
  ('required_checks', '["edl","edr","oig","mo_medicaid","age18","id_match"]'::jsonb),
  ('access_days', '45'::jsonb),
  ('medicaid_recheck_days', '30'::jsonb),
  ('ihs_invites_allowed', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------- media (photos, videos, screening proof) ----------
create table if not exists public.cds_media (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid references public.attendant_pool(id) on delete cascade,
  kind text not null check (kind in ('photo','video','proof')),
  storage_path text,               -- live: path in a private bucket
  practice_data text,              -- practice mode only: data URL
  mime text,
  bytes integer,
  created_at timestamptz not null default now(),
  created_by text
);

-- ---------- caregiver directory profile (family-facing content) ----------
create table if not exists public.cds_cg_profiles (
  pool_id uuid primary key references public.attendant_pool(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,       -- what the caregiver is editing
  approved jsonb,                                 -- what families see
  review_status text not null default 'draft'
    check (review_status in ('draft','submitted','approved','changes_requested')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  photo_draft uuid references public.cds_media(id),
  photo_approved uuid references public.cds_media(id),
  video_draft uuid references public.cds_media(id),
  video_approved uuid references public.cds_media(id),
  -- availability changes go live right away, without re-approval
  availability jsonb not null default '{}'::jsonb,
  hours_min integer,
  hours_max integer,
  availability_confirmed_at timestamptz,
  accepting_intros boolean not null default true,
  paused boolean not null default false,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cds_consents (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.attendant_pool(id) on delete cascade,
  kind text not null check (kind in ('profile','video','interview')),
  wording_version text not null,
  wording text not null,
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

-- ---------- screening (never shown to families) ----------
create table if not exists public.cds_screening (
  pool_id uuid primary key references public.attendant_pool(id) on delete cascade,
  reg_needed_at timestamptz,           reg_needed_source text,
  instructions_sent_at timestamptz,    instructions_sent_by text,   instructions_channel text,
  reg_pending_at timestamptz,          reg_pending_how text,
  reg_verified_at timestamptz,         reg_verified_by text,        reg_verified_proof uuid references public.cds_media(id),
  screen_requested_at timestamptz,     screen_requested_by text,    screen_requested_method text
    check (screen_requested_method in ('phone','form','online')),
  screen_result_at timestamptz,        screen_result text check (screen_result in ('no_findings','findings')),
  screen_proof uuid references public.cds_media(id),             screen_recorded_by text,
  findings_note text,                  -- owner only
  legal_first text, legal_middle text, legal_last text, legal_suffix text, other_names text, dob date,
  ssn_last4 text,
  authorization_signed_at timestamptz,
  follow_up text, follow_up_due date,
  updated_at timestamptz not null default now()
);

-- The full SSN is kept encrypted only until the screening result is recorded,
-- then deleted. Encryption happens in the server function with a secret key.
create table if not exists public.cds_screening_secret (
  pool_id uuid primary key references public.attendant_pool(id) on delete cascade,
  ssn_ciphertext text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cds_screening_checks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.attendant_pool(id) on delete cascade,
  check_key text not null,
  result text not null check (result in ('clear','not_clear')),
  checked_on date not null,
  proof_media_id uuid references public.cds_media(id),
  note text,
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

-- ---------- families ----------
create table if not exists public.cds_prospects (
  id uuid primary key default gen_random_uuid(),
  ghl_contact_id text,
  first_name text not null,
  town text,
  county text,
  kind text not null default 'prospect' check (kind in ('prospect','consumer')),
  -- The prospect journey (her list, 2026-10-15) plus hold, not eligible and follow-up.
  stage text not null default 'new_request'
    check (stage in ('new_request','medicaid_needed','cds_review_pending','potential_review','access_approved','invited','browsing',
                     'intro_requested','caregiver_identified','transition_requested','authorization_pending','attendant_onboarding',
                     'ready_to_begin','services_started','on_hold','not_eligible','follow_up_later','closed')),
  -- Directory access gate. Separate from CDS eligibility and from service authorization.
  access_status text not null default 'pending' check (access_status in ('pending','approved','on_hold','not_eligible')),
  access_path text check (access_path in ('cds_consumer','potential_cds')),
  access_decided_by text, access_decided_at timestamptz, access_note text,
  hold_reason text,
  next_action text, next_owner text, next_due date,
  services_authorized_at date, services_authorized_by text, services_authorized_note text,
  expected_start_date date,             -- drives the service-month Medicaid check
  chosen_pool_id uuid references public.attendant_pool(id) on delete set null,
  attendant_onboarding_done_at date, attendant_onboarding_done_by text,
  source text,
  needs jsonb not null default '{}'::jsonb,
  notes text,
  followup_hash text,                  -- lets the public form add optional details for 2 hours
  followup_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cds_prospects add column if not exists followup_hash text, add column if not exists followup_expires timestamptz;

-- ---------- Medicaid and CDS eligibility (office only, never shown to families or caregivers) ----------
-- eMOMED has no approved real-time API for this use, so checks are done by
-- authorized staff in eMOMED and recorded here. No eMOMED passwords, no full
-- Medicaid ID (DCN), no screenshots.
create table if not exists public.cds_eligibility (
  prospect_id uuid primary key references public.cds_prospects(id) on delete cascade,
  consent_at timestamptz, consent_by text,
  consent_from text check (consent_from in ('consumer','authorized_rep')),
  consent_how text,
  dsds_cds text not null default 'unknown' check (dsds_cds in ('unknown','not_yet','confirmed','denied')),
  dsds_cds_on date, dsds_cds_by text, dsds_note text,
  referral_needed boolean,
  updated_at timestamptz not null default now()
);
create table if not exists public.cds_medicaid_checks (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.cds_prospects(id) on delete cascade,
  checked_on date not null,
  method text not null check (method in ('emomed_web','emomed_phone','emomed_batch')),
  coverage text not null check (coverage in ('active','inactive','unable')),
  restrictions text,
  note text,
  checked_by text not null,
  recorded_at timestamptz not null default now()
);
-- Every stage change and decision, so a prospect's history is never lost.
create table if not exists public.cds_prospect_events (
  id bigint generated always as identity primary key,
  prospect_id uuid not null references public.cds_prospects(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  kind text not null,
  from_stage text, to_stage text,
  note text
);

create table if not exists public.cds_access (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.cds_prospects(id) on delete cascade,
  token_hash text not null unique,
  invited_by text not null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz,               -- null = ongoing (active consumers)
  revoked_at timestamptz,
  revoked_by text,
  last_sign_in_at timestamptz
);

create table if not exists public.cds_codes (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.cds_access(id) on delete cascade,
  code_hash text not null,
  channel text not null check (channel in ('sms','email')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  tries integer not null default 0,
  used_at timestamptz
);

create table if not exists public.cds_sessions (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.cds_access(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

-- ---------- caregiver secure links ----------
create table if not exists public.cds_cg_links (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.attendant_pool(id) on delete cascade,
  token_hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);

-- ---------- introductions ----------
create table if not exists public.cds_introductions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.cds_prospects(id) on delete cascade,
  pool_id uuid not null references public.attendant_pool(id) on delete cascade,
  how text not null check (how in ('video','home','elsewhere')),
  preferred_times text,
  status text not null default 'sent'
    check (status in ('sent','asked','caregiver_yes','caregiver_no','scheduled','met','not_available','closed')),
  meet_at timestamptz,
  meet_details text,                    -- place, or video link once the office sets it
  office_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cds_intro_open_once
  on public.cds_introductions (prospect_id, pool_id)
  where status not in ('closed','caregiver_no','not_available');

-- ---------- families' saved caregivers (a private shortlist) ----------
create table if not exists public.cds_saved (
  prospect_id uuid not null references public.cds_prospects(id) on delete cascade,
  pool_id uuid not null references public.attendant_pool(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (prospect_id, pool_id)
);

-- ---------- office tasks, messages, audit ----------
create table if not exists public.cds_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  pool_id uuid references public.attendant_pool(id) on delete cascade,
  prospect_id uuid references public.cds_prospects(id) on delete cascade,
  intro_id uuid references public.cds_introductions(id) on delete cascade,
  due_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by text
);

-- Every message, whether sent, held or failed, is recorded here. Nothing fails silently.
create table if not exists public.cds_outbox (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('caregiver','family')),
  pool_id uuid references public.attendant_pool(id) on delete set null,
  prospect_id uuid references public.cds_prospects(id) on delete set null,
  channel text not null check (channel in ('sms','email')),
  template text not null,
  to_display text,                      -- masked, for the screen
  body text not null,
  status text not null check (status in ('practice','held','sent','failed')),
  error text,
  automatic boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.cds_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb
);

-- ---------- lock everything down ----------
do $$
declare t text;
begin
  foreach t in array array['cds_match_settings','cds_media','cds_cg_profiles','cds_consents','cds_screening',
    'cds_screening_secret','cds_screening_checks','cds_prospects','cds_eligibility','cds_medicaid_checks','cds_prospect_events','cds_access','cds_codes','cds_sessions',
    'cds_cg_links','cds_introductions','cds_saved','cds_tasks','cds_outbox','cds_audit']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
