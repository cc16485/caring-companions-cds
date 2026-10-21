-- The CDS switches card (2026-10-20). Who may change a switch: Samantha for now (her call;
-- Zach to be added in March, Krystal view only). Changing this list is done by a script, not the card.
-- Safe to run twice.
insert into public.cds_match_settings (key, value, updated_by)
values ('switch_owners', '["samantha@mo-care.com", "samantha@caringcds.com"]'::jsonb, 'switches.sql')
on conflict (key) do nothing;
