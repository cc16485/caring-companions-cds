-- CDS email sign-up (2026-11-11, Samantha: "Approved, build it").
-- caringcds.com box "Get all 6 Getting Paid worksheets by email": first name + email, then 4 welcome
-- emails (right away, about 3, 7 and 12 days later) and nothing after. NOT a lead: never on Leads,
-- no alert texts. GoHighLevel gets a contact with first name + email only and one note, no tags.
-- The page inserts with the public key; the trigger below forces every other column, so a stranger
-- can only add a first name, an email and the page it came from. Nobody outside the server can read
-- the list. Unsubscribe is one function that only stops the row whose secret link it was given.
-- Starts switched OFF (email_welcome.live false). Safe to run more than once. Rollback at the bottom.

create table if not exists public.cds_email_signups (
  id             uuid primary key default gen_random_uuid(),
  agency_id      text not null default 'caring-companions-cds',
  first_name     text,
  email          text not null,
  page           text,
  signed_up_at   timestamptz not null default now(),
  unsub_token    text not null default replace(gen_random_uuid()::text, '-', ''),
  ghl_contact_id text,
  ghl_status     text,
  noted_at       timestamptz,
  step_sent      int not null default 0,
  last_sent_at   timestamptz,
  sends          jsonb not null default '[]'::jsonb,
  stopped_at     timestamptz,
  stop_reason    text,
  fail           text
);
create unique index if not exists cds_email_signups_unsub on public.cds_email_signups (unsub_token);
create index if not exists cds_email_signups_active on public.cds_email_signups (signed_up_at) where stopped_at is null;

create or replace function public.cds_email_signup_public_lock()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user <> 'anon' then return new; end if;
  new.id := gen_random_uuid();
  new.agency_id := 'caring-companions-cds';
  new.first_name := nullif(btrim(coalesce(new.first_name, '')), '');
  new.email := lower(btrim(coalesce(new.email, '')));
  new.page := left(nullif(btrim(coalesce(new.page, '')), ''), 120);
  new.signed_up_at := now();
  new.unsub_token := replace(gen_random_uuid()::text, '-', '');
  new.ghl_contact_id := null; new.ghl_status := null; new.noted_at := null;
  new.step_sent := 0; new.last_sent_at := null; new.sends := '[]'::jsonb;
  new.stopped_at := null; new.stop_reason := null; new.fail := null;
  if length(coalesce(new.first_name, '')) > 60 or length(new.email) > 200
     or new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please check the name and email.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists cds_email_signup_public_lock on public.cds_email_signups;
create trigger cds_email_signup_public_lock before insert on public.cds_email_signups
  for each row execute function public.cds_email_signup_public_lock();

alter table public.cds_email_signups enable row level security;
revoke all on public.cds_email_signups from anon, authenticated;
grant insert (first_name, email, page) on public.cds_email_signups to anon;
drop policy if exists cds_email_signups_public_insert on public.cds_email_signups;
create policy cds_email_signups_public_insert on public.cds_email_signups for insert to anon with check (true);

-- The Unsubscribe link: stops only the row whose secret it carries. True when the link was real.
create or replace function public.cds_email_unsubscribe(t text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare hit int;
begin
  if t is null or length(t) <> 32 then return false; end if;
  update public.cds_email_signups set stopped_at = coalesce(stopped_at, now()),
         stop_reason = coalesce(stop_reason, 'unsubscribed')
   where unsub_token = t;
  get diagnostics hit = row_count;
  return hit > 0;
end $$;
revoke all on function public.cds_email_unsubscribe(text) from public;
grant execute on function public.cds_email_unsubscribe(text) to anon, authenticated;

-- The switch: OFF until Samantha has read the 4 test emails. test_to = who gets test copies.
insert into public.cds_match_settings (key, value, updated_by)
values ('email_welcome', '{"live": false, "test_to": ["samantha@mo-care.com"]}'::jsonb, 'cds_email_signup.sql')
on conflict (key) do nothing;

-- Rollback:
-- drop function if exists public.cds_email_unsubscribe(text);
-- drop table if exists public.cds_email_signups;
-- drop function if exists public.cds_email_signup_public_lock();
-- delete from public.cds_match_settings where key = 'email_welcome';
