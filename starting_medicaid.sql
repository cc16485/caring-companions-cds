-- Starting profile, Medicaid application instructions (2026-11-04, her approved mockup version 5
-- and safeguards 2 and 4). Safe to run twice. Nobody outside reads or writes these tables.
--
-- cds_outbox gets the GoHighLevel message id and the delivery status read back from GoHighLevel,
-- so a message shows Sent, Delivered or Failed for real (not only "we asked GoHighLevel").
--
-- Setting (cds_match_settings), starts OFF:
--   medicaid_messages : the Medicaid application instructions a coordinator sends from a lead or a
--                       Starting profile. live false = held in Messages (the office's own test
--                       phones and emails still get them).

alter table public.cds_outbox add column if not exists ghl_id text;
alter table public.cds_outbox add column if not exists delivery text;
alter table public.cds_outbox add column if not exists delivery_at timestamptz;
create index if not exists cds_outbox_ghl_id on public.cds_outbox (ghl_id) where ghl_id is not null;
create index if not exists cds_outbox_medicaid on public.cds_outbox (created_by) where template = 'medicaid_apply';

insert into public.cds_match_settings (key, value, updated_by)
  values ('medicaid_messages', '{"live": false}'::jsonb, 'starting_medicaid.sql')
  on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- To undo:
-- delete from public.cds_match_settings where key = 'medicaid_messages';
-- drop index if exists public.cds_outbox_medicaid; drop index if exists public.cds_outbox_ghl_id;
-- alter table public.cds_outbox drop column if exists delivery_at, drop column if exists delivery, drop column if exists ghl_id;
