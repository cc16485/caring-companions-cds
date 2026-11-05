// An attendant typed on a lead (2026-11-05): Save puts them in Onboarding and GoHighLevel, sends nothing; the office button texts the link.
// Runs the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/lead_attendant_onboarding_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const refuses = async (fn, re, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

const pg = new PGlite();
const db = { query: (s, p) => pg.query(s, p) };
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(`insert into cds_match_settings (key, value, updated_by) values ('lead_alerts', '{"recipients":[{"name":"Samantha","email":"s@x.test","phone":"+14175550001"},{"name":"Krystal","email":"k@x.test","phone":"+14175550002"},{"name":"Zach","email":"z@x.test","phone":"+14175550003"}]}'::jsonb, 't') on conflict (key) do nothing`);
await pg.exec(strip(readFileSync(ROOT + '/oig_check.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'packet SQL runs twice');
const ROOM_SQL = strip(readFileSync(ROOT + '/id_room.sql', 'utf8'));
await pg.exec(ROOM_SQL); await pg.exec(ROOM_SQL);
ok((await pg.query(`select value from cds_match_settings where key='id_room'`)).rows[0].value.live === false, 'ID room SQL runs twice, switch off');
const GCW_SQL = strip(readFileSync(ROOT + '/fcsr_waiver.sql', 'utf8'));
await pg.exec(GCW_SQL); await pg.exec(GCW_SQL);
ok(true, 'FCSR waiver SQL runs twice');

const match = createMatch(practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' }));
const H = (role, a, i) => match.handle(role, a, i);
const S = (a, i) => H('staff', a, { staff: 'samantha@mo-care.com', ...i });
const outbox = async () => (await pg.query(`select * from cds_outbox order by created_at, id`)).rows;
const tokenOf = link => new URL(link).searchParams.get('c');

// ---------- Save on the lead: Onboarding + GoHighLevel, nothing sent ----------
await refuses(() => S('packetStartFromLead', { name: 'Andrea Volley', phone: 'Volley', consumer: 'Dorsey Harrell' }), /10-digit/, 'phone must be a number');
await refuses(() => H('public', 'packetStartFromLead', { name: 'Andrea Volley', phone: '4175550190' }), /Unknown request/, 'not open to the public');
const a1 = await S('packetStartFromLead', { name: 'Andrea Volley', phone: '(417) 555-0190', email: 'Andrea@X.test', consumer: 'Dorsey Harrell' });
ok(a1.ok && a1.pool_id && !a1.repeat && a1.ghl.ok, 'started, GoHighLevel ok');
const pool = (await pg.query('select * from attendant_pool where id=$1', [a1.pool_id])).rows[0];
ok(pool.first_name === 'Andrea' && pool.last_name === 'Volley' && pool.phone === '(417) 555-0190' && pool.email === 'andrea@x.test' && pool.source === 'office', 'attendant on file');
const pk = (await pg.query('select * from cds_packets where pool_id=$1', [a1.pool_id])).rows[0];
ok(pk.via === 'office' && pk.consumer_name === 'Dorsey Harrell' && !pk.step1_signed_at, 'packet for Dorsey, Step 1 not signed');
const gc = (await pg.query('select * from practice_ghl_contacts where id=$1', [pool.ghl_contact_id])).rows[0];
ok(gc && gc.first_name === 'Andrea' && JSON.stringify(gc.tags) === '["attendant onboarding"]', 'GoHighLevel contact tagged attendant onboarding');
ok((await outbox()).length === 0, 'Save sends nothing');
const list = await S('packetList', {});
const row = list.attendants.find(r => r.pool_id === a1.pool_id);
ok(row && row.consumer === 'Dorsey Harrell' && row.consumer_waiting && row.label === 'Filling out Step 1', 'shows on Onboarding, consumer waiting');
ok(row.needs_link && /not been texted yet/.test(row.next), 'says the link is not texted yet');
ok(a1.status && a1.status.steps.length >= 9 && a1.status.steps[0].key === 'step1' && !a1.status.steps[0].done, 'steps returned for the lead card');

// Save again (or the same phone on another lead): same person, one contact, no second tag.
await pg.query(`update practice_ghl_contacts set tags='["vip"]'::jsonb where id=$1`, [pool.ghl_contact_id]);
const a2 = await S('packetStartFromLead', { name: 'Andrea Volley', phone: '417-555-0190', consumer: 'Dorsey Harrell' });
ok(a2.repeat && a2.pool_id === a1.pool_id, 'same phone is the same person');
ok((await pg.query('select count(*)::int as n from attendant_pool')).rows[0].n === 1 && (await pg.query('select count(*)::int as n from practice_ghl_contacts')).rows[0].n === 1, 'no second person or contact');
const tags = (await pg.query('select tags from practice_ghl_contacts')).rows[0].tags.sort();
ok(JSON.stringify(tags) === '["attendant onboarding","vip"]', 'a tag the office added is kept');

// Someone who applied on /apply first keeps their own consumer name.
const ap = await H('public', 'applyStart', { consumer_name: 'Ruth Ellis', first_name: 'Jordan', last_name: 'Ellis', phone: '(417) 555-0142', email: 'j@x.test' });
const before = (await outbox()).length;
const a3 = await S('packetStartFromLead', { name: 'Jordan Ellis', phone: '4175550142', consumer: 'Someone Else' });
ok(a3.repeat && (await pg.query('select consumer_name from cds_packets where pool_id=$1', [a3.pool_id])).rows[0].consumer_name === 'Ruth Ellis', 'never overwrites what they told us');
ok((await outbox()).length === before, 'still nothing sent');

// GoHighLevel down: saved anyway, and said out loud.
const realUpsert = match.deps.ghl.upsert;
match.deps.ghl.upsert = async () => { throw new Error('GoHighLevel 503: down'); };
const a4 = await S('packetStartFromLead', { name: 'Pat Gray', phone: '4175550177', consumer: 'Lee Gray' });
ok(a4.ok && a4.pool_id && a4.ghl.ok === false && /503/.test(a4.ghl.error), 'GoHighLevel failure comes back, attendant still saved');
match.deps.ghl.upsert = realUpsert;
const a5 = await S('packetStartFromLead', { name: 'Pat Gray', phone: '4175550177', consumer: 'Lee Gray' });
ok(a5.ghl.ok && (await pg.query('select ghl_contact_id from attendant_pool where id=$1', [a4.pool_id])).rows[0].ghl_contact_id, 'Save again fixes GoHighLevel');

// ---------- the office button: text the link ----------
const sl = await S('packetSendLink', { pool_id: a1.pool_id });
const ob = (await outbox()).filter(m => m.pool_id === a1.pool_id);
ok(sl.ok && ob.length === 1 && ob[0].template === 'packet_att_link' && ob[0].channel === 'sms' && /attendant application/.test(ob[0].body), 'one text, the /apply wording');
ok(sl.status === 'practice' && ob[0].status === 'practice', 'practice never sends');
const rem = (await pg.query('select reminders from cds_packets where pool_id=$1', [a1.pool_id])).rows[0].reminders;
ok(rem.length === 2 && rem.every(r => r.kind === 'step1'), 'day 2 and day 4 reminders set');
const row2 = (await S('packetList', {})).attendants.find(r => r.pool_id === a1.pool_id);
ok(!row2.needs_link && /Reminder texts/.test(row2.next), 'after the text, the usual next step');
const lk = (await pg.query(`select count(*)::int as n from cds_cg_links where pool_id=$1 and created_by='office'`, [a1.pool_id])).rows[0].n;
ok(lk === 1, 'a private link made for them');
await refuses(() => S('packetSendLink', { pool_id: '00000000-0000-0000-0000-000000000000' }), /Not found/, 'unknown attendant refused');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
