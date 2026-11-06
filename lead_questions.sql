-- The sign-up questions on a lead's own link (2026-11-05, her ask: "Give each lead their own link that a coordinator
-- sends, save the answers on that lead's profile, and fill in the guided call so it's just a quick confirm").
-- One row per link a coordinator sent: the lead it belongs to, when it expires (30 days), and the answers once the
-- person fills in caringcds.com/start/?k=... The link itself is never stored, only its hash. Answers wait here until
-- someone presses OK on the lead (decided_at, kept). Only the cds-match server function (service role) reads or writes
-- it; the hub and the website never touch it directly. Safe to run again.
create table if not exists public.cds_lead_questions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  lead_id text not null,
  lead_name text,
  channel text,
  send_status text,
  outbox_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  answers jsonb not null default '{}'::jsonb,
  answered_at timestamptz,
  answer_count int not null default 0,
  decided_at timestamptz,
  decided_by text,
  decision text,
  kept jsonb not null default '[]'::jsonb
);
create index if not exists cds_lead_questions_lead on public.cds_lead_questions (lead_id, created_at desc);

alter table public.cds_lead_questions enable row level security;
revoke all on public.cds_lead_questions from anon, authenticated;

-- Off until she turns it on (Switches page): while off, the texts are held, not sent (test recipients still get them).
insert into public.cds_match_settings (key, value, updated_by)
values ('lead_questions', jsonb_build_object('live', false), 'lead_questions.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
