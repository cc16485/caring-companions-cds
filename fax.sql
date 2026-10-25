-- One-click fax from Tax & Enrollment Setup, and incoming faxes on Today (2026-10-25, her yes).
-- Faxes go out through the office eFax Protect account by email from intake@caringcds.com (the
-- only address eFax lets send), sent by a Google script in that mailbox (fax/google-script.gs).
-- The script also hands back eFax's receipts and the faxes that come in. One row per fax.
-- Only the cds-fax server function reads or writes this table; the hub goes through it.
-- Safe to run twice.
create table if not exists public.cds_fax (
  id            uuid primary key default gen_random_uuid(),
  direction     text not null check (direction in ('out', 'in')),
  -- out: queued, sending, sent, delivered, failed, unclear, cancelled · in: new, handled
  status        text not null,
  consumer_id   text,
  consumer_name text,
  form_key      text,
  fax_to        text,
  doc_path      text,
  doc_name      text,
  token         text unique,
  requested_by  text,
  requested_at  timestamptz not null default now(),
  sent_at       timestamptz,
  result_at     timestamptz,
  result_text   text,
  receipt_path  text,
  applied_at    timestamptz,
  dismissed_by  text,
  dismissed_at  timestamptz,
  from_number   text,
  subject       text,
  file_path     text,
  gmail_id      text unique,
  handled_by    text,
  handled_at    timestamptz,
  handled_note  text
);
create index if not exists cds_fax_consumer on public.cds_fax (consumer_id, form_key, requested_at desc);
create index if not exists cds_fax_status on public.cds_fax (direction, status);
alter table public.cds_fax enable row level security;
revoke all on public.cds_fax from anon, authenticated;
