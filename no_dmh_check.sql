-- 2026-11-18, her word: "remove DMH check we dont serve DMH clients". The DMH Employee Disqualification Registry
-- is no longer a required attendant check. Records already saved stay as they are. Safe to run twice.
update public.cds_match_settings set value = (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_array_elements(value) k where k <> '"edr"'::jsonb),
  updated_by = 'no_dmh_check.sql' where key = 'required_checks' and jsonb_typeof(value) = 'array';
notify pgrst, 'reload schema';
