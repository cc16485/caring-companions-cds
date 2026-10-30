-- Call notes from recorded calls (2026-10-29, her approved mockup 6CxaqzDSJABjRYnGxc6tZg).
-- One row per answered call on a CDS line: the transcript GoHighLevel made, the short note and call back date
-- drafted from it, and what the office did with it. status:
--   waiting        drafted, waiting for someone to press OK (nothing is on the person's record yet)
--   ok             someone pressed OK (final_note / final_followup are what they saved)
--   not_about      someone said the call was not about that person (or the draft said so)
--   no_transcript  GoHighLevel had no transcript after 30 minutes: listen to the recording
--   failed         the note could not be written (tried up to 3 times)
--   skipped        a call with our own team, or a number marked Not for CDS
-- Only the cds-comms server function (service role) reads or writes it. The hub page never touches it directly.
-- Holds health information: covered by the BAAs (her words 2026-10-29). Safe to run again.
create table if not exists public.cds_call_notes (
  comm_id text primary key references public.cds_comms(id) on delete cascade,
  phone10 text,
  person_ref text,
  status text not null check (status in ('waiting','ok','not_about','no_transcript','failed','skipped')),
  note text,
  followup date,
  people jsonb not null default '[]'::jsonb,
  transcript text,
  model text,
  error text,
  attempts int not null default 1,
  made_at timestamptz not null default now(),
  final_note text,
  final_followup date,
  decided_by text,
  decided_at timestamptz
);
create index if not exists cds_call_notes_waiting on public.cds_call_notes (made_at desc) where status = 'waiting';

alter table public.cds_call_notes enable row level security;
revoke all on public.cds_call_notes from anon, authenticated;

-- Off until she turns it on (Switches page). since: only calls from the moment this runs; min_seconds: shorter calls get no note.
insert into public.cds_match_settings (key, value, updated_by)
values ('call_notes', jsonb_build_object('live', false, 'since', now(), 'min_seconds', 60, 'per_run', 4), 'call_notes.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
