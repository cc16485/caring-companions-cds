-- The CDS Coordinator answers texts back, and its texts get their own switch (2026-11-18, her yes). Server only. Safe twice.
alter table public.cds_coord_msgs drop constraint if exists cds_coord_msgs_kind_check;
alter table public.cds_coord_msgs add constraint cds_coord_msgs_kind_check
  check (kind in ('clock','dsds','check','chat','journey','packet','apppacket','reply'));
-- Starts OFF: every text and answer waits on the profile for Send until she turns it on (Switches card).
insert into public.cds_match_settings (key, value, updated_by)
values ('coordinator_texts', jsonb_build_object('live', false), 'coordinator_replies.sql')
on conflict (key) do nothing;
notify pgrst, 'reload schema';
