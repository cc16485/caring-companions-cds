-- Caregivers can say yes to showing their profile on the public findcdscaregivers.com page
-- (Samantha 2026-11-26). Adds the 'public' consent kind. Contact details stay private. Safe to run twice.
alter table public.cds_consents drop constraint if exists cds_consents_kind_check;
alter table public.cds_consents add constraint cds_consents_kind_check check (kind in ('profile','video','interview','contact','public'));
