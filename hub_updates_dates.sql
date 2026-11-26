-- Dates Claude records for the hub page to apply (2026-11-26, her "Yes, add it": when Katlin puts a referral or PCCP in
-- Fusion, Claude records the date on the Starting profile, which starts the Fusion checks). Adds a value column and two
-- steps to cds_hub_updates (hub_updates.sql). Safe to run twice.
alter table public.cds_hub_updates add column if not exists value text;
alter table public.cds_hub_updates drop constraint if exists cds_hub_updates_step_check;
alter table public.cds_hub_updates add constraint cds_hub_updates_step_check check (step in
  ('wellsky_authorization','wellsky_tasks','consumer_told_clock_in','attendant_clock_in','referral_sent','transfer_entered'));
notify pgrst, 'reload schema';
