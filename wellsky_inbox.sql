-- The daily CDS check: a holding area for WellSky reports (2026-10-20). Safe to run again.
-- The WellSky page posts each report WITHOUT any key (so no key is ever put into a web
-- page); cds-wellsky parks it here and hands back a receipt. The 6:30 task then confirms
-- the receipt from Samantha's Mac with the key, and only then is the report used.
-- Unconfirmed rows are deleted after an hour; confirmed rows are deleted straight away.
-- Only the cds-wellsky function (database owner) touches this table: no grants at all
-- to anon or authenticated, so the hub page and the public cannot read or write it.
create table if not exists public.wellsky_inbox (
  receipt      text primary key,
  kind         text not null,
  body         jsonb not null,
  size         integer not null,
  created_at   timestamptz not null default now()
);
alter table public.wellsky_inbox enable row level security;
revoke all on public.wellsky_inbox from anon, authenticated;
create index if not exists wellsky_inbox_created on public.wellsky_inbox (created_at);
notify pgrst, 'reload schema';
