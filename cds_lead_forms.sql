-- Every website form becomes a GoHighLevel contact with a note saying which form and what they
-- answered; findcdscaregivers families show on Leads (2026-10-31, Samantha: "leads should make a
-- contact if they came in from a website form, also i need a more clear view of what form they
-- filled out and who they are"). Logic: supabase/functions/_shared/office/lead-forms.js.
--
--   site_leads.form_name / form_answers   the form in words and its answers, for the hub
--   site_leads.from_kind / from_id        a family (cds_prospects) or caregiver (attendant_pool)
--                                         copied onto Leads; one copy each, never twice
--   attendant_pool.ghl_status / _at / _tries   caregiver sign-ups into GoHighLevel (like site_leads)
--   *.ghl_note_at / _status / _tries      the one note on the GoHighLevel contact
--
-- PRACTICE until setting lead_forms.live is true. Run twice in a test copy before the real one.

alter table public.site_leads add column if not exists form_name text;
alter table public.site_leads add column if not exists form_answers jsonb;
alter table public.site_leads add column if not exists from_kind text;
alter table public.site_leads add column if not exists from_id text;
alter table public.site_leads add column if not exists ghl_note_at timestamptz;
alter table public.site_leads add column if not exists ghl_note_status text;
alter table public.site_leads add column if not exists ghl_note_tries int not null default 0;
create unique index if not exists site_leads_from_once on public.site_leads (from_kind, from_id) where from_kind is not null;

alter table public.attendant_pool add column if not exists ghl_status text;
alter table public.attendant_pool add column if not exists ghl_at timestamptz;
alter table public.attendant_pool add column if not exists ghl_tries int not null default 0;
alter table public.attendant_pool add column if not exists ghl_note_at timestamptz;
alter table public.attendant_pool add column if not exists ghl_note_status text;
alter table public.attendant_pool add column if not exists ghl_note_tries int not null default 0;

-- The public forms cannot set any of these.
create or replace function public.site_leads_forms_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    new.form_name := null; new.form_answers := null; new.from_kind := null; new.from_id := null;
    new.ghl_note_at := null; new.ghl_note_status := null; new.ghl_note_tries := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.site_leads_forms_lock() from public, anon, authenticated;
drop trigger if exists site_leads_forms_lock_trg on public.site_leads;
create trigger site_leads_forms_lock_trg before insert on public.site_leads
  for each row execute function public.site_leads_forms_lock();

create or replace function public.attendant_pool_ghl_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    new.ghl_contact_id := null; new.ghl_status := null; new.ghl_at := null; new.ghl_tries := 0;
    new.ghl_note_at := null; new.ghl_note_status := null; new.ghl_note_tries := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.attendant_pool_ghl_lock() from public, anon, authenticated;
drop trigger if exists attendant_pool_ghl_lock_trg on public.attendant_pool;
create trigger attendant_pool_ghl_lock_trg before insert on public.attendant_pool
  for each row execute function public.attendant_pool_ghl_lock();

insert into public.cds_match_settings (key, value, updated_by)
values ('lead_forms', jsonb_build_object('live', false), 'cds_lead_forms.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- delete from public.cds_match_settings where key = 'lead_forms';
-- delete from public.site_leads where from_kind is not null;   -- the copies only; the hub keeps its own Leads rows
-- drop trigger if exists site_leads_forms_lock_trg on public.site_leads;
-- drop trigger if exists attendant_pool_ghl_lock_trg on public.attendant_pool;
-- drop index if exists public.site_leads_from_once;
-- alter table public.site_leads drop column if exists form_name, drop column if exists form_answers, drop column if exists from_kind,
--   drop column if exists from_id, drop column if exists ghl_note_at, drop column if exists ghl_note_status, drop column if exists ghl_note_tries;
-- alter table public.attendant_pool drop column if exists ghl_status, drop column if exists ghl_at, drop column if exists ghl_tries,
--   drop column if exists ghl_note_at, drop column if exists ghl_note_status, drop column if exists ghl_note_tries;
