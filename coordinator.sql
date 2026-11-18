-- The CDS Coordinator, part 1: it listens (2026-11-17, her ask). Server only: no page reads or writes these tables;
-- the cds-coordinator function does (service role), and the hub asks it.
create table if not exists public.cds_coord_items (
  id          bigserial primary key,
  key         text not null unique,                 -- source + kind + what: each item once, ever
  person_kind text not null check (person_kind in ('consumer','lead')),
  person_id   text not null,
  person_name text,
  kind        text not null check (kind in ('promise','their_word','start_date','attendant','question')),
  data        jsonb not null default '{}'::jsonb,
  source      jsonb not null default '{}'::jsonb,   -- { line: cds|cc, kind: call|texts, id, at, who, summary }
  status      text not null check (status in ('open','suggested','done','dismissed','applied')),
  due         date,
  created_at  timestamptz not null default now(),
  decided_by  text,
  decided_at  timestamptz
);
create index if not exists cds_coord_items_open on public.cds_coord_items (person_kind, person_id) where status in ('open','suggested');
create table if not exists public.cds_coord_seen (
  source_id  text primary key,                      -- cds:<message id> | cds-texts:<person>@<day>:<n> | cc:<call id>
  at         timestamptz not null default now(),
  ok         bool not null default false,
  tries      int not null default 1,
  note       text,
  person_ref text,
  summary    text
);
alter table public.cds_coord_items enable row level security;
alter table public.cds_coord_seen enable row level security;
revoke all on public.cds_coord_items, public.cds_coord_seen from anon, authenticated;
revoke all on sequence public.cds_coord_items_id_seq from anon, authenticated;

-- On by default: it only reads calls and texts and writes reminders for the office. It sends nothing to anyone.
insert into public.cds_match_settings (key, value, updated_by)
values ('coordinator', jsonb_build_object('live', true, 'per_run', 10, 'backfill_days', 45), 'coordinator.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
