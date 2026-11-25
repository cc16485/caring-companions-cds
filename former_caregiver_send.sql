-- Invitation to past Caring Companions caregivers (the "545" send), 2026-11-25.
-- Her words: "let's schedule them all to send out ... from CDS number and email", "today at 10am, Nov 25th".
-- The 15-minute job sends in groups once setting former_send.live is true and start_at has passed.
-- Safe to run twice. Nothing is sent by running it.
alter table public.cds_cg_invites
  add column if not exists never_hired boolean not null default false,
  add column if not exists skip_sms boolean not null default false,
  add column if not exists skip_email boolean not null default false,
  add column if not exists sms_status text,
  add column if not exists email_status text,
  add column if not exists sent_at timestamptz,
  add column if not exists send_error text;
insert into public.cds_match_settings (key, value)
values ('former_send', '{"live": false, "start_at": null, "batch": "former-caregivers-2026-11", "batch_size": 40}'::jsonb)
on conflict (key) do nothing;
