// The daily attendant check against WellSky: the rules, the wording, and the 8am email hook.
//   PGLITE=/path/to/pglite/dist/index.js node tests/attendant_check_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-attendant-check.js');
const A = globalThis.CDSAttendantCheck;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- names ----------
eq(A.display('Pham, Nuong'), 'Nuong Pham', 'WellSky "Last, First" shown as "First Last"');
eq(A.nameKey('Smith, Mary J.'), A.nameKey('Mary Smith'), 'initials and order do not matter');
eq(A.nameKey("O'Brien, Sean"), A.nameKey('Sean OBrien'), 'apostrophes do not matter');
ok(!/['"]/.test(A.nameKey("D'Angelo, Kay")), 'a key never holds a quote (safe in a button)');
ok(A.names('Huan Tran & Mary Smith', 'Smith, Mary') && !A.names('Huan Tran', 'Smith, Mary'), 'a list naming a consumer, in any order');

// ---------- the three lists ----------
const NOW = new Date('2026-10-20T14:00:00Z');
const shifts = { at: '2026-10-20T11:31:00Z', from: '2026-09-01', to: '2026-10-31', consumers: [
  { name: 'Tran, Huan', shifts: [{ date: '2026-10-18', attendant: 'Pham, Nuong' }, { date: '2026-10-25', attendant: 'Pham, Nuong' }] },
  { name: 'Q, Pat', shifts: [{ date: '2026-10-18', attendant: 'Lopez, Maria' }, { date: '2026-10-10', attendant: 'Park, Lee' }] },
  { name: 'Brown, Ann', shifts: [{ date: '2026-10-12', attendant: 'Park, Lee' }] },
  { name: 'Clark, Bo', shifts: [{ date: '2026-10-28', attendant: 'New, Nina' }] },
  { name: 'Dee, Jo', shifts: [{ date: '2026-10-15', attendant: 'Gone, Gary' }] },
]};
const attendants = [
  { id: '1', name: 'Nuong Pham', consumer: 'Huan Tran', status: 'active' },
  { id: '2', name: 'Lee Park', consumer: 'Ann Brown', status: 'active' },
  { id: '3', name: 'John Doe', consumer: 'Jo Dee', status: 'active' },
  { id: '4', name: 'Gary Gone', consumer: 'Jo Dee', status: 'inactive' },
  { id: '5', name: 'Kay Quiet', consumer: '', status: 'inactive' },
];
let r = A.compare({ attendants, shifts, reviewed: {}, now: NOW });
ok(r.ok && !r.stale, 'reads the WellSky schedule; not stale');
eq(r.missing.map(m => [m.name, m.what, m.inactive]), [
  ['Gary Gone', 'worked for Jo Dee on Oct 15', true],
  ['Maria Lopez', 'worked for Pat Q on Oct 18', false],
  ['Nina New', 'is scheduled for Bo Clark on Oct 28', false]], 'missing: not on the list, or marked inactive but working');
eq(r.quiet.map(q => q.name), ['John Doe'], 'quiet: active on the list, no WellSky shifts (inactive ones are not nagged)');
eq(r.different.map(d => [d.name, d.listSays, d.wellsky, d.extra]), [['Lee Park', 'Ann Brown', ['Ann Brown', 'Pat Q'], ['Pat Q']]], 'different consumer');
ok(!r.different.some(d => d.name === 'Nuong Pham'), 'Nuong works for the consumer the list names: no flag');

// matched by the WellSky name a person picked ("Same person as")
r = A.compare({ attendants: attendants.concat([{ id: '6', name: 'Mary Lopez-Ruiz', wellskyName: 'Lopez, Maria', consumer: 'Pat Q', status: 'active' }]), shifts, reviewed: {}, now: NOW });
ok(!r.missing.some(m => m.name === 'Maria Lopez'), '"Same person as" sticks');

// the office's choices
const keyOf = n => A.nameKey(n);
r = A.compare({ attendants, shifts, now: NOW, reviewed: {
  ['quiet:' + keyOf('John Doe')]: { choice: 'still-active', until: '2026-11-19' },
  ['missing:' + keyOf('Nina New')]: { choice: 'not-attendant' },
  ['different:' + keyOf('Lee Park')]: { choice: 'leave', sig: 'Pat Q' } } });
eq([r.quiet.length, r.missing.map(m => m.name), r.different.length], [0, ['Gary Gone', 'Maria Lopez'], 0], 'still active / not an attendant / leave as is hide the line');
r = A.compare({ attendants, shifts, now: new Date('2026-11-25T14:00:00Z'), reviewed: { ['quiet:' + keyOf('John Doe')]: { choice: 'still-active', until: '2026-11-19' } } });
ok(r.quiet.some(q => q.name === 'John Doe'), 'still active comes back after 30 days');
r = A.compare({ attendants, now: NOW, reviewed: { ['different:' + keyOf('Lee Park')]: { choice: 'leave', sig: 'Pat Q' } },
  shifts: Object.assign({}, shifts, { consumers: shifts.consumers.concat([{ name: 'Zed, Zoe', shifts: [{ date: '2026-10-19', attendant: 'Park, Lee' }] }]) }) });
ok(r.different.some(d => d.name === 'Lee Park'), 'leave as is comes back when a new consumer appears');

// no data / old data: said, never silent
r = A.compare({ attendants, shifts: undefined, now: NOW });
ok(!r.ok, 'no schedule yet');
eq(A.items(r).map(i => i.t), ['The attendant check has no WellSky schedule to compare with yet'], 'no schedule: the email says so');
r = A.compare({ attendants, shifts: Object.assign({}, shifts, { at: '2026-10-18T11:31:00Z' }), now: NOW });
ok(r.stale && A.items(r)[0].t === 'The attendant check is using an old WellSky schedule (from Oct 18)', 'old schedule: said first');

// ---------- the 8am email wording ----------
r = A.compare({ attendants, shifts, reviewed: {}, now: NOW });
const it = A.items(r);
eq(it.map(i => i.t), [
  '3 attendants working in WellSky but not on the Attendants list',
  '1 attendant with no WellSky shifts since Sep 1',
  '1 attendant working for a consumer the list does not name'], 'email lines');
eq(it[0].people.map(p => p.name + ' (' + p.why + ')'), [
  'Gary Gone (marked inactive, worked for Jo Dee on Oct 15)', 'Maria Lopez (worked for Pat Q on Oct 18)', 'Nina New (is scheduled for Bo Clark on Oct 28)'], 'who, and why');
ok(it.every(i => i.go === 'attendants'), 'every line opens the Attendants page');
ok(!/[—–]/.test(JSON.stringify(it)), 'no em dashes');

// ---------- the 8am email only includes it once switched on ----------
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  create table evv_submissions (id uuid primary key default gen_random_uuid(), agency_id text, processed bool default false);`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_link.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')));
const AC = readFileSync(ROOT + '/attendant_check.sql', 'utf8'); await pg.exec(AC); await pg.exec(AC);
ok((await pg.query(`select value from cds_match_settings where key='attendant_check'`)).rows[0].value.live === false, 'the email part starts off');
for (const [k, v] of [['attendants', attendants], ['wellskyCheck', { shifts }]])
  await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds',$1,$2::jsonb)`, [k, JSON.stringify(v)]);
let at = Date.parse('2026-10-20T13:00:00Z');
const jobs = LA.createLeadAlerts({ db: { query: (t, p) => pg.query(t, p) }, now: () => at, async send() {} });
await jobs.morning({ force: true });
let body = (await pg.query(`select body from cds_outbox where template='morning_email' order by created_at desc limit 1`)).rows[0].body;
ok(!body.includes('working in WellSky'), 'practice: not in the 8am email');
await pg.query(`update cds_match_settings set value='{"live": true}'::jsonb where key='attendant_check'`);
await jobs.morning({ force: true });
body = (await pg.query(`select body from cds_outbox where template='morning_email' order by created_at desc limit 1`)).rows[0].body;
ok(body.includes('3 attendants working in WellSky but not on the Attendants list') && body.includes('Maria Lopez (worked for Pat Q on Oct 18)')
   && body.includes('1 attendant with no WellSky shifts since Sep 1'), 'live: in the 8am email under Also waiting');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
