-- CDS attendant packet (2026-10-21, Samantha: "build it"). One private link per
-- attendant: Step 1 (application + background authorization) right after they
-- start, Step 2 (contract, pay rate, units agreement, handbook) once their checks
-- are clear. Everything hangs off their attendant_pool row, so the Caregiver Match
-- profile, screening and FCSR steps they already have are the same records.
--
-- cds_packets       : one row per attendant: where they are, their saved answers
--                     (never the SSN; that stays sealed in cds_screening_secret),
--                     and the office steps (Empeon invite, ID call, I-9, active).
-- cds_packet_forms  : one row per signed form. Write-once: a signed form can never
--                     be changed or deleted, only countersigned once by the office.
--
-- Settings (cds_match_settings):
--   packet_alerts : who hears "Step 1 signed, run EDL and FCSR" (Samantha, Krystal,
--                   Zach, copied from lead_alerts so no phone number is in this file),
--                   live false = written to the outbox as held, nothing sent.
--   packet_messages: texts and emails TO the attendant (orientation + handbook link,
--                   reminders). live false = held.
-- Nobody outside reads or writes these tables: the server function does. Safe to run twice.

create table if not exists public.cds_packets (
  pool_id uuid primary key references public.attendant_pool(id) on delete cascade,
  via text not null default 'apply' check (via in ('apply','list','office')),
  consumer_name text,
  list_choice text check (list_choice in ('join','no')),
  answers jsonb not null default '{}'::jsonb,
  esign_at timestamptz, esign_ip text, esign_agent text,
  step1_signed_at timestamptz,
  step2_opened_at timestamptz,
  step2_signed_at timestamptz,
  orientation_done_at timestamptz,
  empeon_invited_at timestamptz, empeon_invited_by text,
  empeon_done_at timestamptz,
  call_slot text, call_booked_at timestamptz,
  id_checked_at timestamptz, id_checked_by text,
  i9_done_at timestamptz, i9_done_by text,
  active_at timestamptz,
  reminders jsonb not null default '[]'::jsonb,     -- [{kind, due_at, sent_at}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cds_packet_forms (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.attendant_pool(id) on delete cascade,
  form_key text not null check (form_key in ('application','background','contract','pay','units','handbook')),
  version text not null,
  fingerprint text not null,          -- sha-256 of the exact text signed
  answers jsonb not null default '{}'::jsonb,
  initials jsonb,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  signed_ip text, signed_agent text,
  countersigned_name text, countersigned_by text, countersigned_at timestamptz,
  unique (pool_id, form_key)
);
create index if not exists cds_packet_forms_pool on public.cds_packet_forms (pool_id);

-- Write-once: no deletes, and the only allowed change is the office countersigning once.
create or replace function public.cds_packet_forms_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signed forms cannot be deleted'; end if;
  if old.countersigned_at is not null then raise exception 'This form is already countersigned'; end if;
  if (new.pool_id, new.form_key, new.version, new.fingerprint, new.answers, new.initials, new.signed_name, new.signed_at, new.signed_ip, new.signed_agent)
     is distinct from (old.pool_id, old.form_key, old.version, old.fingerprint, old.answers, old.initials, old.signed_name, old.signed_at, old.signed_ip, old.signed_agent)
  then raise exception 'Signed forms cannot be changed'; end if;
  return new;
end $$;
drop trigger if exists cds_packet_forms_guard on public.cds_packet_forms;
create trigger cds_packet_forms_guard before update or delete on public.cds_packet_forms
  for each row execute function public.cds_packet_forms_guard();

insert into public.cds_match_settings (key, value, updated_by)
select 'packet_alerts', jsonb_build_object('live', false,
  'recipients', coalesce((select value->'recipients' from public.cds_match_settings where key = 'lead_alerts'), '[]'::jsonb)), 'attendant_packet.sql'
on conflict (key) do nothing;
insert into public.cds_match_settings (key, value, updated_by)
values ('packet_messages', '{"live": false}'::jsonb, 'attendant_packet.sql')
on conflict (key) do nothing;

alter table public.cds_packets enable row level security;
alter table public.cds_packet_forms enable row level security;
revoke all on public.cds_packets, public.cds_packet_forms from anon, authenticated;
grant all on public.cds_packets, public.cds_packet_forms to service_role;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- drop table if exists public.cds_packet_forms; drop table if exists public.cds_packets;
-- drop function if exists public.cds_packet_forms_guard();
-- delete from public.cds_match_settings where key in ('packet_alerts','packet_messages');
