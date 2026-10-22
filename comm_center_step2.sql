-- CDS Communication & Follow-Up Center, step 2 (2026-10-22, her approved mockup
-- LBNkuRZyb7pJebrykd4Mxm: "Owners as you suggested, the words are fine, and no texts for care
-- or safety cards. Build it in practice.").
--
-- Each follow-up card gets who set its need, owner and urgency ('hub' or the person's email; a
-- person's choice is never changed by the hub), "Care or safety today" and why, and a later day.
-- comm_center.owners: who owns each need (her approved defaults; changed on the Switches page).
-- comm_center.people: who a card can belong to.
-- Server only, like step 1. Safe to run twice. The live switch is not touched.

alter table public.cds_tasks add column if not exists need_by text;
alter table public.cds_tasks add column if not exists owner_by text;
alter table public.cds_tasks add column if not exists urgent bool not null default false;
alter table public.cds_tasks add column if not exists urgent_why text;
alter table public.cds_tasks add column if not exists urgent_by text;
alter table public.cds_tasks add column if not exists later_until date;

-- Owners: only fill needs that have no owner yet, so running this again never undoes a change
-- made on the Switches page.
update public.cds_match_settings
set value = value
  || jsonb_build_object('owners',
       jsonb_build_object(
         'enrollment', 'zach@mo-care.com', 'evv', 'zach@mo-care.com', 'pay', 'samantha@mo-care.com',
         'attendant_change', 'zach@mo-care.com', 'hours', 'zach@mo-care.com', 'concern', 'samantha@mo-care.com',
         'other', 'zach@mo-care.com', 'not_sure', 'zach@mo-care.com')
       || coalesce(value->'owners', '{}'::jsonb))
  || case when value ? 'people' then '{}'::jsonb else jsonb_build_object('people', jsonb_build_array(
       jsonb_build_object('email', 'samantha@mo-care.com', 'name', 'Samantha'),
       jsonb_build_object('email', 'zach@mo-care.com', 'name', 'Zach'))) end,
    updated_at = now(), updated_by = 'comm_center_step2.sql'
where key = 'comm_center';

notify pgrst, 'reload schema';
