-- One-time "photo upload is fixed" text (2026-11-26, her "Yes, Friday 9 AM").
-- Starts switched OFF; the installer turns it on with start_at Friday Nov 27, 9am Central.
insert into public.cds_match_settings (key, value)
values ('photo_fixed_send', '{"live": false, "start_at": null, "batch_size": 40}'::jsonb)
on conflict (key) do nothing;
