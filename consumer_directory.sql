-- Every active and starting CDS consumer gets caregiver directory access (2026-11-25, her "Yes, build it").
-- Access is given automatically by the 15-minute job. Invitation texts are HELD (invites_live false)
-- until enough caregivers are listed; the office can still send one by hand from the consumer's page.
-- Safe to run twice. Nothing is sent by running it.
alter table public.cds_prospects add column if not exists consumer_id text;
create unique index if not exists cds_prospects_consumer_id on public.cds_prospects (consumer_id) where consumer_id is not null;
insert into public.cds_match_settings (key, value)
values ('consumer_directory', '{"auto_access": true, "invites_live": false, "invite_after_listed": 10}'::jsonb)
on conflict (key) do nothing;
