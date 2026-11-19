-- The CDS Coordinator and paper (2026-11-18, her words "build complete 2 and 3 now"): tax form faxes out, state faxes in.
-- Server only. Safe to run twice.
alter table public.cds_coord_items drop constraint if exists cds_coord_items_kind_check;
alter table public.cds_coord_items add constraint cds_coord_items_kind_check
  check (kind in ('promise','their_word','start_date','attendant','question','concern','contact','need_contact','state_doc'));
alter table public.cds_coord_msgs drop constraint if exists cds_coord_msgs_kind_check;
alter table public.cds_coord_msgs add constraint cds_coord_msgs_kind_check
  check (kind in ('clock','dsds','check','chat','journey','packet','apppacket','reply','fax'));
-- Starts OFF: each fax waits on the profile for Send until she turns it on (Switches card).
insert into public.cds_match_settings (key, value, updated_by)
values ('fax_sends', jsonb_build_object('live', false), 'coordinator_paper.sql')
on conflict (key) do nothing;
notify pgrst, 'reload schema';
