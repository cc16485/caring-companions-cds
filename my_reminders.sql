-- My Week reminders (2026-11-17, Samantha: "email and text me if they arent done or checked off...things that have a
-- due date/time like billing/payroll"). Server only: no browser reads or writes these (service role only).
-- owner_reminders: where her reminders go (one row, 'samantha'), set by the Desktop step. live=false stops all sending.
-- owner_reminder_sent: one row per reminder sent or failed ('<item>@<day>#due' or '#last'), so each goes once.
create table if not exists public.owner_reminders (
  id          text primary key,
  phone       text,
  email       text,
  live        boolean not null default true,
  updated_at  timestamptz not null default now()
);
create table if not exists public.owner_reminder_sent (
  key    text primary key,
  at     timestamptz not null default now(),
  ok     boolean not null default true,
  sms    text,          -- 'sent' | 'failed: ...' | 'no phone'
  email  text,          -- 'sent' | 'failed: ...' | 'no email'
  error  text
);
alter table public.owner_reminders enable row level security;
alter table public.owner_reminder_sent enable row level security;
revoke all on public.owner_reminders from anon, authenticated;
revoke all on public.owner_reminder_sent from anon, authenticated;
grant all on public.owner_reminders to service_role;
grant all on public.owner_reminder_sent to service_role;
comment on table public.owner_reminders is '2026-11-17: where Samantha''s My Week must-do reminders go. Server only.';
comment on table public.owner_reminder_sent is '2026-11-17: each My Week must-do reminder sent or failed, so it goes once. Server only.';
