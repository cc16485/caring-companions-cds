-- Voicemail to lead (2026-11-13, Samantha: "voicemail to lead").
-- A voicemail the call reader marks as a new lead is added to Leads by itself
-- (supabase/functions/_shared/office/lead-from-voicemail.js). This only sets the moment it starts from,
-- so voicemails the office already dealt with are not added. Safe to run twice: the first time wins.
-- Undo: update cds_match_settings set value = value - 'to_leads_since' where key = 'voicemail_leads';
update public.cds_match_settings
   set value = value || jsonb_build_object('to_leads_since', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
       updated_at = now()
 where key = 'voicemail_leads' and not (value ? 'to_leads_since');
