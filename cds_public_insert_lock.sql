-- Phase 0 (CDS Caregiver Match): lock the public form fields.
--
-- The public sign-up and lead forms insert with the anon (publishable) key,
-- which is visible in page source. RLS let anon set ANY column, so a stranger
-- could add a pool row already marked screened, placed, or carrying staff
-- notes. These BEFORE INSERT triggers force every staff-only field back to its
-- default whenever the inserting role is anon, and cap text lengths.
-- Staff inserts from the hub (role authenticated) are untouched.
--
-- Safe to run more than once. Rollback at the bottom.

-- ---------- attendant_pool (Join our caregiver list) ----------
create or replace function public.attendant_pool_public_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'anon' then
    return new;
  end if;

  new.id             := gen_random_uuid();
  new.agency_id      := 'caring-companions-cds';
  new.status         := 'new';
  new.fcsr_status    := null;
  new.fcsr_date      := null;
  new.edl_status     := null;
  new.edl_date       := null;
  new.last_contacted := null;
  new.placed_with    := null;
  new.staff_notes    := null;
  new.archived       := false;
  new.submitted_at   := now();
  new.updated_at     := now();
  new.source         := left(coalesce(nullif(btrim(new.source), ''), 'public'), 60);

  if length(coalesce(new.first_name, '')) > 80
     or length(coalesce(new.last_name, '')) > 80
     or length(coalesce(new.phone, '')) > 40
     or length(coalesce(new.email, '')) > 200
     or length(coalesce(new.city, '')) > 100
     or length(coalesce(new.zip, '')) > 20
     or length(coalesce(new.hours_wanted, '')) > 200
     or length(coalesce(new.experience, '')) > 200
     or length(coalesce(new.experience_notes, '')) > 3000
     or length(coalesce(new.cert_other, '')) > 300
     or length(coalesce(new.knows_consumer, '')) > 500
     or length(coalesce(new.how_heard, '')) > 300
     or length(coalesce(new.applicant_notes, '')) > 3000
     or length(coalesce(new.has_potential_consumer, '')) > 200
     or length(coalesce(new.consumer_relationship, '')) > 200
     or length(coalesce(new.consumer_has_medicaid, '')) > 200
     or length(coalesce(new.counties::text, '')) > 2000
     or length(coalesce(new.availability::text, '')) > 2000
     or coalesce(new.max_miles, 0) not between 0 and 500 then
    raise exception 'Sign-up form entry is too long.' using errcode = '22001';
  end if;

  return new;
end;
$$;

drop trigger if exists attendant_pool_public_lock_trg on public.attendant_pool;
create trigger attendant_pool_public_lock_trg
  before insert on public.attendant_pool
  for each row execute function public.attendant_pool_public_lock();

-- ---------- site_leads (caringcds.com lead forms) ----------
create or replace function public.site_leads_public_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'anon' then
    return new;
  end if;

  new.id             := gen_random_uuid();
  new.agency_id      := 'caring-companions-cds';
  new.status         := 'new';
  new.staff_notes    := null;
  new.last_contacted := null;
  new.archived       := false;
  new.submitted_at   := now();
  new.updated_at     := now();
  new.source         := left(coalesce(nullif(btrim(new.source), ''), 'website'), 60);

  if length(coalesce(new.first_name, '')) > 80
     or length(coalesce(new.last_name, '')) > 80
     or length(coalesce(new.full_name, '')) > 160
     or length(coalesce(new.phone, '')) > 40
     or length(coalesce(new.email, '')) > 200
     or length(coalesce(new.county, '')) > 100
     or length(coalesce(new.who_needs_care, '')) > 200
     or length(coalesce(new.has_medicaid, '')) > 200
     or length(coalesce(new.message, '')) > 5000 then
    raise exception 'Form entry is too long.' using errcode = '22001';
  end if;

  return new;
end;
$$;

drop trigger if exists site_leads_public_lock_trg on public.site_leads;
create trigger site_leads_public_lock_trg
  before insert on public.site_leads
  for each row execute function public.site_leads_public_lock();

-- ---------- care_plan_preferences (signed care plan form) ----------
-- The consumer and specialist sign on the same device, so signatures stay.
-- Only the office's "scheduled" marks are forced off.
create or replace function public.care_plan_preferences_public_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'anon' then
    return new;
  end if;

  new.id           := gen_random_uuid();
  new.agency_id    := 'caring-companions-cds';
  new.scheduled    := false;
  new.scheduled_at := null;
  new.scheduled_by := null;
  new.submitted_at := now();
  return new;
end;
$$;

drop trigger if exists care_plan_preferences_public_lock_trg on public.care_plan_preferences;
create trigger care_plan_preferences_public_lock_trg
  before insert on public.care_plan_preferences
  for each row execute function public.care_plan_preferences_public_lock();

-- These run only as triggers; nobody needs to call them directly.
revoke execute on function public.attendant_pool_public_lock() from public, anon, authenticated;
revoke execute on function public.site_leads_public_lock() from public, anon, authenticated;
revoke execute on function public.care_plan_preferences_public_lock() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ---------- Rollback ----------
-- drop trigger if exists attendant_pool_public_lock_trg on public.attendant_pool;
-- drop trigger if exists site_leads_public_lock_trg on public.site_leads;
-- drop trigger if exists care_plan_preferences_public_lock_trg on public.care_plan_preferences;
-- drop function if exists public.attendant_pool_public_lock();
-- drop function if exists public.site_leads_public_lock();
-- drop function if exists public.care_plan_preferences_public_lock();
