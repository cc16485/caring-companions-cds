-- CDS 5-minute ID check video room (2026-10-27, Samantha: "build the ID check room part behind a
-- switch that stays off. I'll set up the CDS team room in GHL").
--
-- Setting id_room: { live, url }. url = the GoHighLevel Meeting Room link for the CDS ID check,
-- pasted by Samantha on the Switches card. live false = the booking and reminder texts wait in
-- Messages, nothing sent.
--
-- cds_packets.call_at   : the booked time as a real timestamp (call_slot keeps the label shown).
-- cds_packets.call_reminded_at : the "starting soon" text went out (or was held) once.
-- One attendant per time: a second booking for the same open time is refused.
-- Safe to run twice.

alter table public.cds_packets add column if not exists call_at timestamptz;
alter table public.cds_packets add column if not exists call_reminded_at timestamptz;

create unique index if not exists cds_packets_one_call_per_time
  on public.cds_packets (call_at) where call_at is not null and id_checked_at is null;

insert into public.cds_match_settings (key, value, updated_by)
values ('id_room', '{"live": false, "url": ""}'::jsonb, 'id_room.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- drop index if exists public.cds_packets_one_call_per_time;
-- alter table public.cds_packets drop column if exists call_at, drop column if exists call_reminded_at;
-- delete from public.cds_match_settings where key = 'id_room';
