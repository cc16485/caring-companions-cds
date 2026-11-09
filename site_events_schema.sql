-- caringcds.com visit counter (2026-11-09, her monthly content scorecard on the CDS Hub Owners tab).
-- Counts only, never a person: a random per-tab id, the page, the website a visitor came from (name only) and the
-- post tag (?from= / utm_source). No cookies. The public key may only ADD a row; Hub logins may read; nobody empties it.
-- Applied by Desktop 1392. Safe to run again.
create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null check (length(session_id) between 1 and 40),
  event text not null check (event in ('page_view', 'call_click')),
  path text check (length(path) <= 200),
  came_from text check (length(came_from) <= 120),
  from_tag text check (length(from_tag) <= 40)
);
create index if not exists site_events_created_at on public.site_events (created_at);
alter table public.site_events enable row level security;
revoke all on table public.site_events from public, anon, authenticated;
grant insert (session_id, event, path, came_from, from_tag) on table public.site_events to anon, authenticated;
grant select on table public.site_events to authenticated;
drop policy if exists "anyone adds a visit" on public.site_events;
create policy "anyone adds a visit" on public.site_events for insert to anon, authenticated with check (true);
drop policy if exists "hub reads visits" on public.site_events;
create policy "hub reads visits" on public.site_events for select to authenticated using (true);
