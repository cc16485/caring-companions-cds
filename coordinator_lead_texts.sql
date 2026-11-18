-- "Texting new website leads" on the Switches card (2026-11-17, her "lets go live with it"). On = texts to new website
-- leads go by themselves (Mon to Sat, 9am to 7pm); off = each waits on the lead for someone to press Send.
insert into public.cds_match_settings (key, value, updated_by)
values ('lead_texts', jsonb_build_object('live', true), 'coordinator_lead_texts.sql')
on conflict (key) do update set value = public.cds_match_settings.value || jsonb_build_object('live', true), updated_at = now(), updated_by = 'coordinator_lead_texts.sql';
notify pgrst, 'reload schema';
