-- Caregivers can choose to share their phone and email with signed-in directory
-- families, so families reach them directly (Samantha 2026-11-25: "i dont want us
-- to be the go-between"). Adds the 'contact' consent kind. Safe to run twice.
alter table public.cds_consents drop constraint if exists cds_consents_kind_check;
alter table public.cds_consents add constraint cds_consents_kind_check check (kind in ('profile','video','interview','contact'));
