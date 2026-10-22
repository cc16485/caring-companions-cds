-- CDS Communication & Follow-Up Center, step 1 (2026-10-22, her approved design,
-- mockup artifact 6DTNtZDFccu8i3ZbJZhmee).
--
-- cds_phone_book: every phone number we know, pointing at a person's EXISTING record
--   (ref = 'lead:<id>', 'consumer:<id>', 'family:<consumer or lead ref>', 'attendant:<roster id>',
--   'pool:<attendant_pool id>', 'staff:<email>'). It never makes a person. Rows with source 'sync'
--   are rebuilt by the job; 'staff' rows are a person's "Who is this?" answer and win.
-- cds_comms: one row per GoHighLevel call or text (id = GoHighLevel message id), so the
--   same call can never be saved twice.
-- cds_tasks: the hub's one task list. Follow-ups are area 'followup'; Caregiver Match keeps 'match'.
--
-- Server only: nothing here is readable by the hub page or the public (the cds-comms
-- function reads it for signed-in staff). Safe to run twice.

create table if not exists public.cds_phone_book (
  phone10 text not null check (phone10 ~ '^[0-9]{10}$'),
  ref text not null,
  kind text not null,                 -- lead, consumer, family, attendant, pool, staff, ignore
  name text,
  detail text,                        -- e.g. 'Attendant for Gus Tolliver'
  source text not null default 'sync' check (source in ('sync','staff')),
  set_by text,
  set_at timestamptz not null default now(),
  primary key (phone10, ref)
);

create table if not exists public.cds_comms (
  id text primary key,                -- GoHighLevel message id
  channel text not null check (channel in ('call','sms')),
  direction text not null check (direction in ('inbound','outbound')),
  at timestamptz not null,
  phone10 text,
  ghl_contact_id text,
  conversation_id text,
  contact_name text,
  status text,
  seconds int not null default 0,
  answered bool not null default false,
  voicemail bool not null default false,
  staff_name text,
  body text,
  seen_at timestamptz not null default now()
);
create index if not exists cds_comms_phone_at on public.cds_comms (phone10, at desc);
create index if not exists cds_comms_at on public.cds_comms (at desc);

alter table public.cds_tasks add column if not exists area text not null default 'match';
alter table public.cds_tasks add column if not exists owner text;
alter table public.cds_tasks add column if not exists need text;
alter table public.cds_tasks add column if not exists phone10 text;
alter table public.cds_tasks add column if not exists person_ref text;
alter table public.cds_tasks add column if not exists events jsonb not null default '[]'::jsonb;
alter table public.cds_tasks add column if not exists closed_reason text;
alter table public.cds_tasks add column if not exists updated_at timestamptz;
create index if not exists cds_tasks_followup_open on public.cds_tasks (phone10) where area = 'followup' and done_at is null;

-- Practice until live: the job reads and builds cards either way (reading changes nothing in
-- GoHighLevel); live only decides whether Today and the 8am email show them.
insert into public.cds_match_settings (key, value, updated_by)
values ('comm_center', jsonb_build_object('live', false, 'history_days', 30, 'cards_from', now(), 'owners', '{}'::jsonb), 'comm_center.sql')
on conflict (key) do nothing;

do $$
declare t text;
begin
  foreach t in array array['cds_phone_book','cds_comms']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
