// The WellSky Analytics reports that arrive by email (2026-10-21): reading the CSV files,
// saving them beside the Chrome reports, feeding the 40 goal's first shifts, and the red
// Dashboard line when they stop. Every name here is made up (this repo is public).
//   PGLITE=/path/to/pglite/dist/index.js node tests/wellsky_analytics_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgPath = process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pgPath);
const A = await import(ROOT + '/supabase/functions/_shared/office/wellsky-analytics.js');
const { ingest, AGENCY_ID } = await import(ROOT + '/supabase/functions/_shared/office/wellsky-ingest.js');
const W = globalThis.CDSWellSky;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- CSV ----------
eq(A.parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,\n'), [['a', 'b'], ['x, y', 'say "hi"'], ['1', '']], 'quotes, commas inside quotes, CRLF and blank lines');
eq(A.parseCsv('﻿Name\n"two\nlines"'), [['Name'], ['two\nlines']], 'a byte order mark and a line break inside quotes');

// ---------- First and Last Carelog ----------
const D = 'dashboard-first_and_last_carelog/';
const flFiles = [
  { name: D + 'client.csv', text: 'Current Status,Client Name,First Carelog Date,Last Carelog Date,Days Since Last Carelog\n' +
    'Active,"Able, Ann",2025-06-24,2026-10-20,1\nActive,"Carr, Cal",2026-10-20,2026-10-20,1\nActive,"Dunn, Dee",,2026-10-01,20\n' },
  { name: D + 'client_then_caregiver.csv', text: 'Client Status,Client Name,Caregiver Name,Caregiver Status,Total Carelogs,Total Hours,First Carelog Date,Last Carelog Date,Days Since Last Carelog\n' +
    'Active,"Able, Ann","Baker, Bea",Active,300,900,2025-06-24,2026-10-20,1\nActive,"Able, Ann","Gray, Gus",Active,3,9,2025-09-01,2025-09-30,385\n' +
    'Active,"Carr, Cal","Hill, Hal",Active,1,4,2026-10-20,2026-10-20,1\n' },
  { name: D + 'caregiver.csv', text: 'Current Status,Caregiver Last First Name,First Carelog Date\nActive,"Baker, Bea",2025-06-24\n' },
];
let fl = A.readReport({ report: 'First and Last Carelog', files: flFiles });
eq(fl.consumers, [{ name: 'Able, Ann', first: '2025-06-24', last: '2026-10-20', attendant: 'Baker, Bea' }, { name: 'Carr, Cal', first: '2026-10-20', last: '2026-10-20', attendant: 'Hill, Hal' }],
   'each consumer\'s first and last care log, and the attendant who worked the first one');
eq(fl.unread, ['Dunn, Dee'], 'a consumer with no first date is counted as unread, not skipped quietly');
const prefixed = [{ name: D + 'client.csv', text: 'Clients Current Status,Clients Client Name,Carelogs First Carelog Date\nActive,"Able, Ann",2025-06-24\n' }];
eq(A.readReport({ report: 'First and Last Carelog', files: prefixed }).consumers[0].first, '2025-06-24', 'column names with a prefix still read');
let threw = '';
try { A.readReport({ report: 'First and Last Carelog', files: [{ name: D + 'client.csv', text: 'Status,Who\nActive,Ann\n' }] }); } catch (e) { threw = e.message; }
ok(/changed shape\. Columns: Status, Who/.test(threw), 'a changed file says which columns did arrive');
threw = '';
try { A.readReport({ report: 'Billing by Month', files: flFiles }); } catch (e) { threw = e.message; }
ok(/not one of ours/.test(threw), 'any other Analytics email is refused');

// ---------- Authorization Care Logs ----------
const alFiles = [{ name: 'dashboard-authorization_care_logs/same_client_same_authorization_same_date_and_same_bill_name.csv',
  text: '"Client Last, First Name",Authorization ID,Clock In Time,Clock Out Time,Bill Rate Name,Check\n' +
        '"Able, Ann",Ann Able PC - CDS 4/01/2026-2/28/2027,2026-10-15 09:41:23,2026-10-15 16:26:23,CDS Rate,\n' +
        '"Carr, Cal",Cal Carr CDS Authorized Hours,2026-10-20 08:02:15,,CDS Rate,1\n' +
        '"Carr, Cal",Cal Carr CDS Authorized Hours,not a time,,CDS Rate,1\n' }];
const al = A.readReport({ report: 'Authorization Care Logs', files: alFiles });
eq(al.shifts, [{ consumer: 'Able, Ann', auth: 'Ann Able PC - CDS 4/01/2026-2/28/2027', clockIn: '2026-10-15T09:41:23', clockOut: '2026-10-15T16:26:23', hours: 6.75 },
               { consumer: 'Carr, Cal', auth: 'Cal Carr CDS Authorized Hours', clockIn: '2026-10-20T08:02:15', clockOut: '', hours: null }],
   'every shift with its clock in and out; a blank clock out stays blank (never clocked out)');
eq(al.unread, ['Carr, Cal'], 'a row with an unreadable time is counted as unread');

// ---------- saving, on a local Postgres copy ----------
const pg = new PGlite();
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  create table cds_match_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by text);`);
await pg.exec(readFileSync(ROOT + '/wellsky_check.sql', 'utf8'));
const db = { query: async (t, p) => pg.query(t, p) };
const get = async k => (await pg.query(`select data_value v from agency_data where agency_id=$1 and data_key=$2`, [AGENCY_ID, k])).rows[0]?.v;
// The Chrome check had already saved something; the email reports must leave it alone.
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1, 'wellskyCheck', $2::jsonb)`,
  [AGENCY_ID, JSON.stringify({ live: false, lastRun: { at: 'x', kind: 'shifts', ok: true, why: '' }, shifts: { at: 'x', consumers: [] } })]);
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1, 'firstShifts', $2::jsonb)`,
  [AGENCY_ID, JSON.stringify({ from: '2026-09-01', people: { 'Able, Ann': { date: '2026-09-01', attendant: 'Baker, Bea' }, 'Ely, Eve': { date: '2026-10-25', attendant: 'Gray, Gus' } } })]);
const t0 = Date.parse('2026-10-22T11:20:00Z');
let r = await ingest({ db, now: () => t0 }, { kind: 'analytics', report: 'First and Last Carelog', received: '2026-10-22T11:00:29.000Z', files: flFiles });
eq([r.ok, r.saved, r.consumers, r.unread], [true, true, 2, 1], 'the First and Last Carelog email is saved');
let v = await get('wellskyCheck');
eq([v.lastRun.kind, v.shifts.at, v.analyticsRun.ok, v.analytics.firstLast.consumers.length, v.analytics.firstLast.received], ['shifts', 'x', true, 2, '2026-10-22T11:00:29.000Z'],
   'saved beside the Chrome reports without touching them');
const fs = await get('firstShifts');
eq([fs.people['Able, Ann'], fs.people['Carr, Cal'], fs.people['Ely, Eve'], fs.from, fs.analytics],
   [{ date: '2025-06-24', attendant: 'Baker, Bea' }, { date: '2026-10-20', attendant: 'Hill, Hal' }, { date: '2026-10-25', attendant: 'Gray, Gus' }, '2025-06-24', true],
   'the true first care log replaces the later date the schedule report saw; nobody already known is dropped');
const nc = W.newConsumers(fs, [{ id: '1753900000000', name: 'Ann Able' }], {});
eq(nc.people.map(p => p.name), ['Cal Carr', 'Eve Ely'], 'the 40 goal now counts from the true first care log');

r = await ingest({ db, now: () => t0 + 6e4 }, { kind: 'analytics', report: 'Authorization Care Logs', files: alFiles });
v = await get('wellskyCheck');
eq([r.ok, r.shifts, v.analytics.authLogs.shifts.length, !!v.analytics.firstLast], [true, 2, 2, true], 'the second report is saved next to the first');
r = await ingest({ db, now: () => t0 + 12e4 }, { kind: 'analytics', report: 'Authorization Care Logs', files: [{ name: 'a.csv', text: 'Nope\n1\n' }] });
v = await get('wellskyCheck');
eq([r.ok, v.analyticsRun.ok, v.analytics.authLogs.shifts.length], [false, false, 2], 'an unreadable email keeps the last good report and records why');
ok(/WellSky email report problem: The Authorization Care Logs file changed shape/.test((W.items(v, {}, new Date(t0 + 3e5))[0] || {}).t || ''), 'and the Dashboard says so in red');
await ingest({ db, now: () => t0 + 18e4 }, { kind: 'analytics_missing', report: 'First and Last Carelog', why: 'The "First and Last Carelog" email from WellSky did not arrive by 7:30am (or the hub could not read it).' });
ok(/did not arrive by 7:30am/.test(W.items(await get('wellskyCheck'), {}, new Date(t0 + 3e5))[0].t), 'a missing email shows in red');
await ingest({ db, now: () => t0 + 24e4 }, { kind: 'analytics', report: 'Authorization Care Logs', files: alFiles });
v = await get('wellskyCheck');
ok(!W.items(v, {}, new Date(t0 + 3e5)).some(x => /email report/.test(x.t)), 'both reports fresh: no line');
ok(/have not all arrived since Oct 22/.test(W.items(v, {}, new Date(t0 + 30 * 36e5))[0].t), 'over a day without a fresh report is red too');
eq(W.items({ live: false, analyticsRun: { ok: true }, analytics: { firstLast: { at: new Date(t0).toISOString() }, authLogs: { at: new Date(t0).toISOString() } } }, {}, new Date(t0 + 6e4)), [],
   'with only the email reports (Chrome check retired) and all fresh, nothing to say');
eq((await ingest({ db, now: () => t0 }, { kind: 'analytics', report: 'First and Last Carelog', files: [] })).why, 'The "First and Last Carelog" email had no files in it.', 'an email with no attachment is a failure, not a quiet nothing');

// ---------- the Google script ----------
const gs = readFileSync(ROOT + '/wellsky/google-script.gs', 'utf8');
ok(!/[A-Za-z0-9]{32,}/.test(gs.replace(/https:\/\/[^'"]+/g, '')), 'no key is written in the Google script (it lives in Script Properties)');
ok(gs.includes(A.SENDER), 'the script looks for the same sender the hub expects');
ok(Object.values(A.REPORTS).every(n => gs.includes("'" + n + "'")), 'and the same two report names');
ok(!/—/.test(readFileSync(ROOT + '/supabase/functions/_shared/office/wellsky-analytics.js', 'utf8') + gs), 'no em dashes');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
