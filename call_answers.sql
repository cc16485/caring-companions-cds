-- Answers from recorded calls (2026-11-05, her ask: "summarize the lead info that comes from calls";
-- mockup https://claude.ai/artifact/W47w6qkzLLB3FF91iEJ8J1). Each call note also keeps the lead answers heard on
-- the call (who called, date of birth, county, Medicaid and DCN, new or moving, help needed, attendant), and,
-- once someone presses OK, which of them the office kept. Rides on the call_notes switch. Safe to run again.
alter table public.cds_call_notes add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.cds_call_notes add column if not exists kept jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
