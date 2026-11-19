-- 2026-11-18, her word: "take of Missouri Medicaid exclusion". The Missouri Medicaid exclusion search is no longer a
-- required attendant check (FCSR, EDL and OIG are). Results already saved stay as they are. Safe to run twice.
update public.cds_match_settings set value = (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_array_elements(value) k where k <> '"mo_medicaid"'::jsonb),
  updated_by = 'no_mo_exclusion_check.sql' where key = 'required_checks' and jsonb_typeof(value) = 'array';
notify pgrst, 'reload schema';
