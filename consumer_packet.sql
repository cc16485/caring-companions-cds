-- CDS consumer enrollment packet (2026-10-22, Samantha: "build the consumer packet
-- into the hub to send easily with the click of a button"). Replaces the 19-page
-- GoHighLevel e-sign packet. The office presses "Send enrollment packet" on a lead;
-- the consumer gets a private link (caringcds.com/enroll/?c=...), answers a few
-- questions and signs each form on their phone.
--
-- cds_enroll_packets : one row per lead. Their answers (never the SSN: that is
--                      sealed in ssn_ciphertext), where they are, who sent it, the
--                      consumer it was moved to.
-- cds_enroll_links   : the private links (only a hash of each is kept).
-- cds_enroll_forms   : one row per signed form. Write-once: a signed form can never
--                      be changed or deleted, only signed once by the office as agent.
--
-- Settings (cds_match_settings), both start OFF:
--   enroll_alerts  : who hears "<name> signed the enrollment packet" (copied from
--                    lead_alerts so no phone number is in this file). live false = held.
--   enroll_messages: texts and emails TO the consumer (their link, 2 reminders). live false = held.
-- Nobody outside reads or writes these tables: the cds-match server function does. Safe to run twice.

create table if not exists public.cds_enroll_packets (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null unique,                 -- agency_data 'pipeline' id
  kind text not null check (kind in ('new','move')),
  consumer_id text,                             -- agency_data 'consumers' id, once linked in Tax Setup
  answers jsonb not null default '{}'::jsonb,
  ssn_ciphertext text, ssn_last4 text,
  sent_by text, sent_at timestamptz,
  opened_at timestamptz,
  esign_at timestamptz, esign_ip text, esign_agent text,
  signed_at timestamptz,                        -- every consumer form signed
  office_signed_at timestamptz, office_signed_by text,
  reminders jsonb not null default '[]'::jsonb, -- [{due_at, sent_at}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cds_enroll_links (
  token_hash text primary key,
  packet_id uuid not null references public.cds_enroll_packets(id) on delete cascade,
  created_by text, created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists cds_enroll_links_packet on public.cds_enroll_links (packet_id);

create table if not exists public.cds_enroll_forms (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.cds_enroll_packets(id) on delete cascade,
  form_key text not null check (form_key in ('vendor','numbers','evv','backup','prev','ss4','f8821','f2678','mo2643a','mo2827')),
  version text not null,
  fingerprint text not null,          -- sha-256 of the exact text signed
  answers jsonb not null default '{}'::jsonb,
  signed_name text not null,
  signer_role text not null default 'consumer' check (signer_role in ('consumer','rep','office')),
  signed_at timestamptz not null default now(),
  signed_ip text, signed_agent text,
  agent_name text, agent_by text, agent_at timestamptz,
  unique (packet_id, form_key)
);
create index if not exists cds_enroll_forms_packet on public.cds_enroll_forms (packet_id);

-- Write-once: no deletes, and the only allowed change is the office signing once as agent.
create or replace function public.cds_enroll_forms_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signed forms cannot be deleted'; end if;
  if old.agent_at is not null then raise exception 'This form is already signed by the agent'; end if;
  if (new.packet_id, new.form_key, new.version, new.fingerprint, new.answers, new.signed_name, new.signer_role, new.signed_at, new.signed_ip, new.signed_agent)
     is distinct from (old.packet_id, old.form_key, old.version, old.fingerprint, old.answers, old.signed_name, old.signer_role, old.signed_at, old.signed_ip, old.signed_agent)
  then raise exception 'Signed forms cannot be changed'; end if;
  return new;
end $$;
drop trigger if exists cds_enroll_forms_guard on public.cds_enroll_forms;
create trigger cds_enroll_forms_guard before update or delete on public.cds_enroll_forms
  for each row execute function public.cds_enroll_forms_guard();

insert into public.cds_match_settings (key, value, updated_by)
select 'enroll_alerts', jsonb_build_object('live', false,
  'recipients', coalesce((select value->'recipients' from public.cds_match_settings where key = 'lead_alerts'), '[]'::jsonb)), 'consumer_packet.sql'
on conflict (key) do nothing;
insert into public.cds_match_settings (key, value, updated_by)
values ('enroll_messages', '{"live": false}'::jsonb, 'consumer_packet.sql')
on conflict (key) do nothing;

alter table public.cds_enroll_packets enable row level security;
alter table public.cds_enroll_links enable row level security;
alter table public.cds_enroll_forms enable row level security;
revoke all on public.cds_enroll_packets, public.cds_enroll_links, public.cds_enroll_forms from anon, authenticated;
grant all on public.cds_enroll_packets, public.cds_enroll_links, public.cds_enroll_forms to service_role;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- drop table if exists public.cds_enroll_forms; drop table if exists public.cds_enroll_links; drop table if exists public.cds_enroll_packets;
-- drop function if exists public.cds_enroll_forms_guard();
-- delete from public.cds_match_settings where key in ('enroll_alerts','enroll_messages');
