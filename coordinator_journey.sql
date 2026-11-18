-- The CDS Coordinator's welcome journey and "needs you" concerns (2026-11-17, her yes). Server only.
alter table public.cds_coord_items drop constraint if exists cds_coord_items_kind_check;
alter table public.cds_coord_items add constraint cds_coord_items_kind_check check (kind in ('promise','their_word','start_date','attendant','question','concern'));
alter table public.cds_coord_msgs drop constraint if exists cds_coord_msgs_kind_check;
alter table public.cds_coord_msgs add constraint cds_coord_msgs_kind_check check (kind in ('clock','dsds','check','chat','journey'));
-- "Welcome texts to new consumers" on the Switches card: starts OFF (each welcome text waits on the profile for Send).
insert into public.cds_match_settings (key, value, updated_by)
values ('welcome_texts', jsonb_build_object('live', false), 'coordinator_journey.sql')
on conflict (key) do nothing;
notify pgrst, 'reload schema';
