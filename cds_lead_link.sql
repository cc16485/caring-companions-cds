-- CDS lead link page (2026-10-19, Samantha: "build the CDS lead link page with this wording").
-- Each new-lead text and email carries a private link to that one lead, for that one
-- person: see what they wrote, log the call, open the intake questions in the hub.
--
-- cds_lead_links : one row per link sent. Only a fingerprint (sha-256) of the link is
--                  kept, so a copy of this table opens nothing. Links expire after 7 days.
-- cds_lead_calls : every call logged from a link page. Kept apart from the hub's own
--                  lead list so a logged call can never overwrite an edit in the hub.
--                  Logging a call stops the 30-minute reminder for everyone.
--
-- Nobody outside reads or writes either table directly: the page goes through the
-- server function cds-lead-link. Signed-in hub staff may read the calls.
-- Safe to run twice.

create table if not exists public.cds_lead_links (
  token_hash text primary key,
  site_lead_id uuid not null references public.site_leads(id) on delete cascade,
  person_name text not null,
  person_email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_opened_at timestamptz
);
create index if not exists cds_lead_links_lead on public.cds_lead_links (site_lead_id);

create table if not exists public.cds_lead_calls (
  id uuid primary key default gen_random_uuid(),
  site_lead_id uuid not null references public.site_leads(id) on delete cascade,
  by_name text not null,
  by_email text not null,
  outcome text not null check (outcome in ('connected','voicemail','no_answer','wrong_number')),
  note text check (length(note) <= 300),
  at timestamptz not null default now()
);
create index if not exists cds_lead_calls_lead on public.cds_lead_calls (site_lead_id, at desc);

alter table public.cds_lead_links enable row level security;
alter table public.cds_lead_calls enable row level security;
revoke all on public.cds_lead_links from anon, authenticated;
revoke all on public.cds_lead_calls from anon, authenticated;
-- The hub (signed in) reads the calls to show them on the lead and count it as reached.
grant select on public.cds_lead_calls to authenticated;
drop policy if exists cds_lead_calls_staff_read on public.cds_lead_calls;
create policy cds_lead_calls_staff_read on public.cds_lead_calls for select to authenticated using (true);
grant all on public.cds_lead_links, public.cds_lead_calls to service_role;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- drop table if exists public.cds_lead_calls; drop table if exists public.cds_lead_links;
