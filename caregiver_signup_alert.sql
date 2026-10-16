-- CDS caregiver sign-up alert (2026-10-16, Samantha: "alert samantha@caringcds.com,
-- samantha@mo-care.com, krystal@mo-care.com, zach@mo-care.com").
--
-- 1. Every sign-up from findcdscaregivers.com creates a to-do in the CDS Hub
--    (Caregiver Match > To-dos). The database makes it, so it happens even if
--    the website's email step never runs.
-- 2. The office alert email goes to the addresses in setting office_alerts.
--    It stays switched off (live=false) until Samantha turns it on.
-- 3. The people already on the list who were never contacted get a to-do too.
--
-- Safe to run twice.

-- Office alerts are recorded in the outbox like every other message.
alter table public.cds_outbox drop constraint if exists cds_outbox_audience_check;
alter table public.cds_outbox add constraint cds_outbox_audience_check check (audience in ('caregiver','family','office'));

insert into public.cds_match_settings (key, value) values
  ('office_alerts', '{"emails": ["samantha@caringcds.com", "samantha@mo-care.com", "krystal@mo-care.com", "zach@mo-care.com"], "live": false}'::jsonb)
on conflict (key) do nothing;

-- Next weekday at 4pm Central (office hours are Monday to Friday 9 to 4).
create or replace function public.cds_next_business_4pm(from_ts timestamptz) returns timestamptz
language plpgsql stable set search_path = public as $$
declare d date := (from_ts at time zone 'America/Chicago')::date + 1;
begin
  while extract(isodow from d) > 5 loop d := d + 1; end loop;
  return (d + time '16:00') at time zone 'America/Chicago';
end $$;

create or replace function public.cds_signup_task_title(p public.attendant_pool) returns text
language sql stable set search_path = public as $$
  select left(
    case when p.has_potential_consumer = 'Yes' then 'Has someone to care for. ' else '' end
    || 'New caregiver sign-up: ' || coalesce(p.first_name, '') || coalesce(' ' || nullif(p.last_name, ''), '')
    || coalesce(', ' || nullif(p.city, ''), '')
    || coalesce(' (' || (select string_agg(x, ', ') from jsonb_array_elements_text(
         case when jsonb_typeof(p.counties) = 'array' then p.counties else '[]'::jsonb end) x) || ')', '')
    || '. Call to say hello within 1 business day.', 300)
$$;

create or replace function public.attendant_pool_signup_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.source, '') <> 'findcdscaregivers.com' or coalesce(new.archived, false) then return new; end if;
  insert into public.cds_tasks (kind, title, pool_id, dedupe_key, due_at)
  values ('cg_signup', public.cds_signup_task_title(new), new.id, 'cg_signup:' || new.id, public.cds_next_business_4pm(now()))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
revoke all on function public.attendant_pool_signup_task() from public, anon, authenticated;

drop trigger if exists attendant_pool_signup_task_trg on public.attendant_pool;
create trigger attendant_pool_signup_task_trg after insert on public.attendant_pool
  for each row execute function public.attendant_pool_signup_task();

-- People already on the list that nobody has contacted or reviewed yet.
insert into public.cds_tasks (kind, title, pool_id, dedupe_key, due_at)
select 'cg_signup',
       left('Signed up ' || to_char(coalesce(p.submitted_at, p.updated_at) at time zone 'America/Chicago', 'Mon FMDD')
            || ', never contacted: ' || coalesce(p.first_name, '') || coalesce(' ' || nullif(p.last_name, ''), '')
            || coalesce(', ' || nullif(p.city, ''), '') || '. Call to say hello.', 300),
       p.id, 'cg_signup:' || p.id, public.cds_next_business_4pm(now())
from public.attendant_pool p
where coalesce(p.archived, false) = false and p.last_contacted is null and p.office_reviewed_at is null
on conflict (dedupe_key) do nothing;

notify pgrst, 'reload schema';
