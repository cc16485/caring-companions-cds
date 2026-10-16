import { readFileSync } from 'fs';
const { PGlite } = await import(process.env.PGLITE);
const db = new PGlite();
const lock = readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
await db.exec(`
create role anon nologin; create role authenticated nologin;
create function update_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
create table attendant_pool (id uuid primary key default gen_random_uuid(), agency_id text not null, first_name text not null, last_name text not null, phone text not null, email text, city text, zip text, counties jsonb, availability jsonb, hours_wanted text, max_miles int, has_transport bool, experience text, experience_notes text, cert_cpr bool, cert_cna bool, cert_other text, worked_here_before bool, knows_consumer text, background_ok bool, how_heard text, applicant_notes text, source text default 'public', submitted_at timestamptz default now(), status text default 'new', fcsr_status text, fcsr_date date, edl_status text, edl_date date, last_contacted date, placed_with text, staff_notes text, archived bool default false, updated_at timestamptz default now(), has_potential_consumer text, consumer_relationship text, consumer_has_medicaid text, show_anonymously bool default true);
create table site_leads (id uuid primary key default gen_random_uuid(), agency_id text, source text, first_name text, last_name text, full_name text, phone text, email text, county text, who_needs_care text, has_medicaid text, message text, status text default 'new', staff_notes text, last_contacted date, archived bool default false, submitted_at timestamptz default now(), updated_at timestamptz default now());
create table care_plan_preferences (id uuid primary key default gen_random_uuid(), agency_id text, consumer text, plan_date date, wellsky_id text, specialist text, daily_tasks jsonb default '[]', flexible_tasks jsonb default '[]', signer_name text, sig_consumer text, sig_consumer_date date, sig_staff text, sig_staff_date date, submitted_at timestamptz default now(), scheduled bool default false, scheduled_at timestamptz, scheduled_by text);
create trigger attendant_pool_touch_trg before update on attendant_pool for each row execute function update_updated_at();
alter table attendant_pool enable row level security; alter table site_leads enable row level security; alter table care_plan_preferences enable row level security;
grant usage on schema public to anon, authenticated;
grant insert on attendant_pool, site_leads, care_plan_preferences to anon;
grant select, insert, update, delete on attendant_pool, site_leads, care_plan_preferences to authenticated;
create policy a1 on attendant_pool for insert to anon with check (true);
create policy a2 on attendant_pool for all to authenticated using (true) with check (true);
create policy s1 on site_leads for insert to anon with check (true);
create policy s2 on site_leads for all to authenticated using (true) with check (true);
create policy c1 on care_plan_preferences for insert to anon with check (true);
create policy c2 on care_plan_preferences for all to authenticated using (true) with check (true);
`);
const cleanLock = lock.replace(/notify pgrst[^;]*;/, '');
await db.exec(cleanLock);
await db.exec(cleanLock); ok(true, 'lock SQL runs twice without error');

async function as(role, sql, params=[]) { await db.exec(`set role ${role}`); try { return await db.query(sql, params); } finally { await db.exec('reset role'); } }
const hubRow = `insert into attendant_pool (agency_id,first_name,last_name,phone,email,city,zip,counties,availability,hours_wanted,max_miles,has_transport,experience,cert_cpr,cert_cna,worked_here_before,background_ok,how_heard,applicant_notes,source,status) values ('caring-companions-cds','Test','Person','4175550100','t@example.com','Ozark','65721','["Christian"]','["Mon AM"]','20',20,true,'1-3 years',true,false,false,true,'Facebook','hi','public','new')`;
await as('anon', hubRow);
let r = (await db.query(`select * from attendant_pool where first_name='Test'`)).rows[0];
ok(r && r.status==='new' && r.source==='public' && r.city==='Ozark' && r.counties[0]==='Christian', 'hub sign-up form row still saves with its own values');

await as('anon', `insert into attendant_pool (id,agency_id,first_name,last_name,phone,status,fcsr_status,fcsr_date,edl_status,placed_with,staff_notes,archived,last_contacted,submitted_at,source) values ('00000000-0000-0000-0000-000000000001','other','Forged','X','1','cleared','clear','2026-01-01','clear','Mrs Smith','approved by office',true,'2026-01-01','2020-01-01',' ')`);
r = (await db.query(`select * from attendant_pool where first_name='Forged'`)).rows[0];
ok(r.status==='new' && r.fcsr_status===null && r.fcsr_date===null && r.edl_status===null && r.placed_with===null && r.staff_notes===null && r.archived===false && r.last_contacted===null, 'anon cannot set status, screening, placed with, staff notes, archived, last contacted');
ok(r.id!=='00000000-0000-0000-0000-000000000001' && r.agency_id==='caring-companions-cds' && new Date(r.submitted_at).getFullYear()>=2026 && r.source==='public', 'anon cannot pick id, agency, submitted date; blank source becomes public');

let threw=false; try { await as('anon', `insert into attendant_pool (agency_id,first_name,last_name,phone,applicant_notes) values ('caring-companions-cds','Big','X','1',repeat('a',5000))`); } catch(e){ threw = /too long/.test(e.message); }
ok(threw, 'oversized anon entry is refused with a clear message');

await as('authenticated', `insert into attendant_pool (agency_id,first_name,last_name,phone,status,staff_notes,fcsr_status,source) values ('caring-companions-cds','Staff','Add','2','screening','called 10-15','submitted','staff')`);
r = (await db.query(`select * from attendant_pool where first_name='Staff'`)).rows[0];
ok(r.status==='screening' && r.staff_notes==='called 10-15' && r.fcsr_status==='submitted' && r.source==='staff', 'hub staff can still add a caregiver with staff fields');

await as('authenticated', `update attendant_pool set status='contacted', staff_notes='ok' where first_name='Forged'`);
r = (await db.query(`select status, staff_notes from attendant_pool where first_name='Forged'`)).rows[0];
ok(r.status==='contacted' && r.staff_notes==='ok', 'hub staff can still update status and notes');

threw=false; try { await as('anon', `select * from attendant_pool`); } catch(e){ threw=true; }
ok(threw, 'anon still cannot read the pool');

await as('anon', `insert into site_leads (agency_id,source,first_name,phone,message,status,staff_notes,archived) values ('x','caringcds contact','Lead','3','need help','won','vip',true)`);
r = (await db.query(`select * from site_leads where first_name='Lead'`)).rows[0];
ok(r.status==='new' && r.staff_notes===null && r.archived===false && r.source==='caringcds contact' && r.message==='need help' && r.agency_id==='caring-companions-cds', 'site lead keeps form fields, staff fields forced');

await as('anon', `insert into care_plan_preferences (agency_id,consumer,sig_consumer,sig_staff,scheduled,scheduled_by) values ('caring-companions-cds','C','sigC','sigS',true,'someone')`);
r = (await db.query(`select * from care_plan_preferences where consumer='C'`)).rows[0];
ok(r.scheduled===false && r.scheduled_by===null && r.sig_consumer==='sigC' && r.sig_staff==='sigS', 'care plan keeps signatures, scheduled marks forced off');

await as('authenticated', `update care_plan_preferences set scheduled=true, scheduled_by='office' where consumer='C'`);
r = (await db.query(`select scheduled from care_plan_preferences where consumer='C'`)).rows[0];
ok(r.scheduled===true, 'office can still mark a care plan scheduled');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
