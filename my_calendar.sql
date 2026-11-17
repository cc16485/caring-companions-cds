-- My Week calendar (2026-11-17, Samantha: "as high tech and interactive as possible of a weekly calendar that i can
-- check off and move it to next day - also monthly or yearly as well").
-- One table for both hubs: what she checked off, what she moved, and things she added herself.
-- Only the cds-my-calendar server function reads or writes it (service role). No browser access at all.
create table if not exists public.owner_calendar (
  id          text primary key,                  -- 'm:<item>@<YYYY-MM-DD>' a mark on one day, 'i:<id>' her own item
  kind        text not null check (kind in ('mark','item')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.owner_calendar enable row level security;
revoke all on public.owner_calendar from anon, authenticated;
