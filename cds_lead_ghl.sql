-- Website leads into GoHighLevel as plain contacts (2026-10-20, Samantha: "add each new website
-- lead to GoHighLevel with only name, phone and email, no tags or custom fields, and never the
-- four tags. Practice first").
--
-- The 2-minute lead job (cds-lead-alert) looks each website lead up in the CDS sub-account:
--   found (exactly one match by phone, then email) -> remember its contact id. Nothing in
--                                                     GoHighLevel is changed.
--   not found -> live:     create a contact with first name, last name, phone, email. Nothing else:
--                          no tags, no custom fields, no source, no assignment.
--                practice:  nothing is created; the lead is marked 'practice: would create'.
--   several matches -> not linked, says so (a person picks).
-- Why only those four: all 28 published CDS workflows were read 2026-10-20. Contacts with no
-- tags and no custom fields set none of them off. Tags "new lead", "active consumer",
-- "onboard cds consumer" and "admin- add playbooks" DO start workflows (the first three message
-- the family), so the code refuses to send any tag at all.
--
-- PRACTICE until setting lead_ghl.live is true. Safe to run twice.

alter table public.site_leads add column if not exists ghl_contact_id text;     -- the linked GoHighLevel contact
alter table public.site_leads add column if not exists ghl_status text;         -- found / created / practice: would create / several matches / failed: why
alter table public.site_leads add column if not exists ghl_at timestamptz;      -- last try
alter table public.site_leads add column if not exists ghl_tries int not null default 0;

-- The public form cannot set any of these.
create or replace function public.site_leads_ghl_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    new.ghl_contact_id := null; new.ghl_status := null; new.ghl_at := null; new.ghl_tries := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.site_leads_ghl_lock() from public, anon, authenticated;
drop trigger if exists site_leads_ghl_lock_trg on public.site_leads;
create trigger site_leads_ghl_lock_trg before insert on public.site_leads
  for each row execute function public.site_leads_ghl_lock();

insert into public.cds_match_settings (key, value, updated_by)
values ('lead_ghl', jsonb_build_object('live', false), 'cds_lead_ghl.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- delete from public.cds_match_settings where key = 'lead_ghl';
-- drop trigger if exists site_leads_ghl_lock_trg on public.site_leads;
-- alter table public.site_leads drop column if exists ghl_contact_id, drop column if exists ghl_status,
--   drop column if exists ghl_at, drop column if exists ghl_tries;
