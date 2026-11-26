-- To-do lists for the CDS office (2026-11-26, Samantha: "Katlins to-do needs to be in the Caring Companions CDS
-- Subaccount"). One table: each person's items and what they checked off on which Missouri day.
-- Only the cds-todo server function reads or writes it (service role). No browser access at all.
-- Safe to run twice.
create table if not exists public.cds_todo (
  id          text primary key,                  -- 'i:<id>' an item, 'm:<id>@<YYYY-MM-DD>' that item done that day
  kind        text not null check (kind in ('item','mark')),
  data        jsonb not null default '{}'::jsonb, -- always has who (the person's sign-in email)
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists cds_todo_who on public.cds_todo ((data->>'who'));
alter table public.cds_todo enable row level security;
revoke all on public.cds_todo from anon, authenticated;

-- Katlin on the CDS hub staff list (her call 2026-11-10: "invite Katlin to every hub", CDS included; this step was
-- left for her then). Her CDS sign-in is katlin@mo-care.com. Not an owner: she cannot change switches.
update public.cds_match_settings
   set value = value || '["katlin@mo-care.com"]'::jsonb, updated_by = 'todo.sql'
 where key = 'staff_emails' and not (value ? 'katlin@mo-care.com');

-- Katlin's starter list (Samantha changes it on the page). Work nights are Monday to Friday, 5:30 to 7:30 PM Missouri.
insert into public.cds_todo (id, kind, data, updated_by) values
 ('i:ktstart01', 'item', '{"who":"katlin@mo-care.com","n":1,"when":"days","days":[1,2,3,4,5],"by":"samantha@mo-care.com","t":"Read Samantha''s note and tonight''s list","how":"Start here every night. Anything Samantha left for you is at the top."}', 'todo.sql'),
 ('i:ktmedi01', 'item', '{"who":"katlin@mo-care.com","n":2,"when":"days","days":[1,2,3,4,5],"by":"samantha@mo-care.com","t":"Check Medicaid before each new lead call","how":"Look the consumer up in eMOMED with your own sign-in before you call. If Medicaid is not active, or there is a spend-down, do not call yet: send Samantha a note."}', 'todo.sql'),
 ('i:ktcall01', 'item', '{"who":"katlin@mo-care.com","n":3,"when":"days","days":[1,2,3,4,5],"by":"samantha@mo-care.com","t":"Call the leads that are ready","how":"Talk with the consumer themselves (family may join). Ask for their OK to send the referral and answer their questions. Never promise hours, eligibility or a start date. Calls to families end at 7 PM Missouri time."}', 'todo.sql'),
 ('i:ktnote01', 'item', '{"who":"katlin@mo-care.com","n":4,"when":"days","days":[1,2,3,4,5],"by":"samantha@mo-care.com","t":"Write what happened on each call on the lead","how":"A few lines: who you talked with, what they said, what you promised and when."}', 'todo.sql'),
 ('i:ktevv001', 'item', '{"who":"katlin@mo-care.com","n":5,"when":"days","days":[1],"by":"samantha@mo-care.com","t":"Enter the EVV form fixes in WellSky","how":"The EVV forms email comes Sunday at 4 PM. Enter each fix in WellSky, then check it off."}', 'todo.sql'),
 ('i:ktend001', 'item', '{"who":"katlin@mo-care.com","n":6,"when":"days","days":[1,2,3,4,5],"by":"samantha@mo-care.com","t":"End my night: send Samantha a short note","how":"Who you reached, what you promised, and anything that needs her."}', 'todo.sql')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
