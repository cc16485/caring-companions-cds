-- The CDS Coordinator, three more jobs (2026-11-18, her ask): phones and emails found by name, packets it sends, and
-- sign-in asks for eMOMED and Fusion. Server only. Safe to run twice.
-- Items: 'contact' (a phone or email found for someone with none, waits for Use it / Not right) and 'need_contact'
-- (no way to reach someone a packet is waiting for; closes by itself).
alter table public.cds_coord_items drop constraint if exists cds_coord_items_kind_check;
alter table public.cds_coord_items add constraint cds_coord_items_kind_check
  check (kind in ('promise','their_word','start_date','attendant','question','concern','contact','need_contact'));
-- Drafts: 'packet' (consumer enrollment packet) and 'apppacket' (attendant application link). What they are sent with.
alter table public.cds_coord_msgs add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.cds_coord_msgs drop constraint if exists cds_coord_msgs_kind_check;
alter table public.cds_coord_msgs add constraint cds_coord_msgs_kind_check
  check (kind in ('clock','dsds','check','chat','journey','packet','apppacket'));
-- The switch starts OFF: every packet waits on the profile for a person to press Send.
insert into public.cds_match_settings (key, value, updated_by)
values ('packet_sends', jsonb_build_object('live', false), 'coordinator_jobs.sql')
on conflict (key) do nothing;
notify pgrst, 'reload schema';
