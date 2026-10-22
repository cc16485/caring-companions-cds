-- CDS Communication & Follow-Up Center, step 2 (2026-10-22, her approved design,
-- mockup artifact 6DTNtZDFccu8i3ZbJZhmee): needs, owners, urgency.
--
-- cds_tasks already has need and owner (comm_center.sql). This adds:
--   urgency   'urgent' (Care or safety today), 'today', 'week'. Empty on older cards = today.
--   owner_by  who picked the owner by hand (email). Empty = the owner comes from the Switches
--             page (comm_center.owners), so changing owners there moves the card.
-- Server only, like comm_center.sql: nothing here opens a table to the page or the public.
-- Uses "if not exists", so a second run adds nothing.

alter table public.cds_tasks add column if not exists urgency text;
alter table public.cds_tasks add column if not exists owner_by text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cds_tasks_urgency_check') then
    alter table public.cds_tasks add constraint cds_tasks_urgency_check check (urgency is null or urgency in ('urgent','today','week'));
  end if;
end $$;

notify pgrst, 'reload schema';
