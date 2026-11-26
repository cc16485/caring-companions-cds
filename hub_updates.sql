-- Changes to a hub record that come from Claude (the CDS Hub connector), waiting for the hub page to apply them
-- (2026-11-26, Katlin's Night Desk). Server only: the cds-connector and cds-todo functions read and write it.
-- Safe to run twice.
create table if not exists public.cds_hub_updates (
  id           bigserial primary key,
  target_kind  text not null check (target_kind in ('consumer')),
  target_id    text not null,
  target_name  text,
  step         text not null check (step in ('wellsky_authorization','wellsky_tasks','consumer_told_clock_in','attendant_clock_in')),
  by_email     text not null,
  at           timestamptz not null default now(),
  applied_at   timestamptz,
  applied_by   text
);
create index if not exists cds_hub_updates_waiting on public.cds_hub_updates (id) where applied_at is null;
alter table public.cds_hub_updates enable row level security;
revoke all on public.cds_hub_updates from anon, authenticated;
revoke all on sequence public.cds_hub_updates_id_seq from anon, authenticated;
notify pgrst, 'reload schema';
