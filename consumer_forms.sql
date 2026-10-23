-- Missouri forms for consumers on the roster (2026-10-22, Samantha approved the mockup
-- claude.ai/artifact/L4Sq459wGcwy7JBX5A5yGb: "build them in practice, switches off").
-- The office presses Send on a consumer's profile; the consumer signs one form on their phone
-- (caringcds.com/sign/?c=...).
--
-- cds_sign_requests : one row per consumer, form and year (year 0 = a once-only form).
--                     Forms: rights, office, pandemic, pandemic_att. Signing is write-once.
-- cds_sign_links    : the private links (only a hash of each is kept).
--
-- Setting (cds_match_settings), starts OFF:
--   consumer_forms : texts and emails TO consumers with their link. live false = held in Messages
--                    (the office's own test phones and emails still get them).
-- Nobody outside reads or writes these tables: the cds-match server function does. Safe to run twice.

create table if not exists public.cds_sign_requests (
  id uuid primary key default gen_random_uuid(),
  consumer_id text not null,                    -- agency_data 'consumers' id
  consumer_name text,
  form_key text not null check (form_key in ('rights','office','pandemic','pandemic_att')),
  year int not null default 0,
  answers jsonb not null default '{}'::jsonb,   -- first, last; att_name; hours
  sent_by text, sent_at timestamptz,
  opened_at timestamptz,
  signed_at timestamptz, signed_name text, signer_role text check (signer_role in ('consumer','rep')), rep_rel text,
  att_signed_name text,
  version text, fingerprint text,               -- the text signed, sha-256
  signed_ip text, signed_agent text,
  created_at timestamptz not null default now(),
  unique (consumer_id, form_key, year)
);

create table if not exists public.cds_sign_links (
  token_hash text primary key,
  request_id uuid not null references public.cds_sign_requests(id) on delete cascade,
  created_by text, created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists cds_sign_links_request on public.cds_sign_links (request_id);

-- Write-once: no deletes of a signed form, and once signed nothing about the signature changes.
create or replace function public.cds_sign_requests_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null then raise exception 'Signed forms cannot be deleted'; end if;
    return old;
  end if;
  if old.signed_at is not null and
     (new.consumer_id, new.form_key, new.year, new.answers, new.signed_at, new.signed_name, new.signer_role, new.rep_rel, new.att_signed_name, new.version, new.fingerprint, new.signed_ip, new.signed_agent)
     is distinct from
     (old.consumer_id, old.form_key, old.year, old.answers, old.signed_at, old.signed_name, old.signer_role, old.rep_rel, old.att_signed_name, old.version, old.fingerprint, old.signed_ip, old.signed_agent)
  then raise exception 'Signed forms cannot be changed'; end if;
  return new;
end $$;
drop trigger if exists cds_sign_requests_guard on public.cds_sign_requests;
create trigger cds_sign_requests_guard before update or delete on public.cds_sign_requests
  for each row execute function public.cds_sign_requests_guard();

alter table public.cds_sign_requests enable row level security;
alter table public.cds_sign_links enable row level security;
revoke all on public.cds_sign_requests, public.cds_sign_links from anon, authenticated;
grant all on public.cds_sign_requests, public.cds_sign_links to service_role;

insert into public.cds_match_settings (key, value, updated_by)
values ('consumer_forms', '{"live": false}'::jsonb, 'consumer_forms.sql')
on conflict (key) do nothing;

-- apply_questions : the three Missouri questions on caringcds.com/apply (legal guardian, gets CDS,
--                   Medicaid fraud; 19 CSR 15-8.400(5)(A)3). Off = the application as before.
insert into public.cds_match_settings (key, value, updated_by)
values ('apply_questions', '{"live": false}'::jsonb, 'consumer_forms.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- drop table if exists public.cds_sign_links; drop table if exists public.cds_sign_requests;
-- drop function if exists public.cds_sign_requests_guard();
-- delete from public.cds_match_settings where key in ('consumer_forms','apply_questions');
