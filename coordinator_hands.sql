-- The CDS Coordinator, part 2: the texts it writes (2026-11-17, her "Yes, build part 2"). Server only.
create table if not exists public.cds_coord_msgs (
  id          bigserial primary key,
  key         text not null unique,                 -- clock:<consumer>:<start>:<who> | dsds:<consumer>:<since> | check:<item>
  kind        text not null check (kind in ('clock','dsds','check')),
  item_id     bigint,
  person_kind text not null check (person_kind in ('consumer','lead')),
  person_id   text not null,
  person_name text,
  to_name     text,
  phone       text not null,                        -- 10 digits; the hub only ever sees the last 4
  body        text not null,
  status      text not null check (status in ('draft','sent','failed','skipped')),
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  sent_by     text
);
alter table public.cds_coord_msgs enable row level security;
revoke all on public.cds_coord_msgs from anon, authenticated;
revoke all on sequence public.cds_coord_msgs_id_seq from anon, authenticated;
-- Texts start in practice (drafts a person sends). The 4:30 email to Samantha is on.
update public.cds_match_settings set value = jsonb_build_object('texts', 'practice', 'email', true) || value where key = 'coordinator';
notify pgrst, 'reload schema';
