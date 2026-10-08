-- CDS fix 1 (2026-10-08): remove the old GoHighLevel key from the saved Outreach Settings.
-- CDS project (siivpekcaryeyttszwav) only. Safe to run again. Removes the one field; the rest of the row stays.
-- Every signed-in CDS hub user could read agency_data, so a key saved there was readable by all of them.
update public.agency_data
   set data_value = data_value - 'apiKey', updated_at = now()
 where data_key = 'outreachSettings' and jsonb_typeof(data_value) = 'object' and data_value ? 'apiKey';
-- proof: 0 rows anywhere in agency_data still hold an apiKey field (no value is ever shown)
select count(*)::int as still_saved from public.agency_data where data_value::text like '%"apiKey"%';
