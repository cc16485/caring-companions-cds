// The daily CDS check from WellSky: reading both reports, the long-shift rule, the
// hours left this month, the Dashboard/email lines, and saving on a local Postgres copy.
// Every name and number here is made up (this repo is public).
//   PGLITE=/path/to/pglite/dist/index.js node tests/wellsky_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgPath = process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pgPath);
const { ingest, submit, confirm, AGENCY_ID, INBOX_MAX_PER_HOUR } = await import(ROOT + '/supabase/functions/_shared/office/wellsky-ingest.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const W = globalThis.CDSWellSky, R = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- a schedule report, as WellSky's page text reads ----------
const tasks = 'Bathing - IHS Task\nDressing/Grooming - IHS Task\nWash Dishes\n';
const day = (d, who, from, to, h) => `${d}\t${who}: ${from} - ${to}\t${h}\n${tasks}`;
let shiftsText = 'Report Type\nSchedules (Future)\nRecent Reports\nSchedules by Client\n\nDate Range: 09/01/2026 - 10/31/2026\n\n' +
  'Able, Ann\n\nAddress: 1 Test Street, Springfield, MO 65800\nE-mail Address: ann@example.com\nMobile Phone: (417) 555-0100\n\nDate/Time\tActivity\tHours\n';
let annTotal = 0;
for (let d = 1; d <= 18; d++) {
  const dd = String(d).padStart(2, '0');
  if (d === 5 || d === 9) { shiftsText += day(`10/${dd}/2026`, 'Baker, Bea', '6:02 AM', '7:02 PM', 13); annTotal += 13; }
  else { shiftsText += day(`10/${dd}/2026`, 'Baker, Bea', '6:00 AM', '8:45 AM', 2.75); annTotal += 2.75; }
}
shiftsText += day('10/20/2026', 'Baker, Bea', '6:00 AM', '8:40 AM', 2.67); annTotal += 2.67;   // booked ahead
shiftsText += `Total Hours for Able, Ann: ${Math.round(annTotal * 100) / 100}\n` +
  'Carr, Cal\n\nAddress: 2 Test Street\n\nDate/Time\tActivity\tHours\n' +
  day('10/02/2026', 'Dunn, Dee', '7:49 AM', '4:19 PM', 8.5) +
  `10/12/2026\tDunn, Dee: 10/12/2026 3:01 PM - 10/13/2026 6:01 AM\t15\n${tasks}` +
  day('10/14/2026', 'Dunn, Dee', '9:00 AM', '1:00 PM', 4) +
  'Total Hours for Carr, Cal: 27.5\n';

const S = W.parseShiftReport(shiftsText);
eq([S.from, S.to], ['2026-09-01', '2026-10-31'], 'schedule report date range');
eq(S.consumers.map(c => c.name), ['Able, Ann', 'Carr, Cal'], 'consumers in the schedule report');
eq(S.consumers[0].shifts.length, 19, 'every shift line read');
ok(S.consumers.every(c => c.adds_up), 'shifts add up to WellSky\'s total for each consumer');
const night = S.consumers[1].shifts[1];
eq([night.date, night.endDate, night.start, night.end, night.hours], ['2026-10-12', '2026-10-13', '3:01 PM', '6:01 AM', 15], 'an overnight shift (dates on both ends) is read');
eq(S.unread, [], 'nothing left unread');
ok(!JSON.stringify(S).includes('Test Street') && !JSON.stringify(S).includes('example.com') && !JSON.stringify(S).includes('555-0100') && !JSON.stringify(S).includes('Bathing'),
   'addresses, emails, phones and task lists are dropped');
eq(W.parseShiftReport(shiftsText.replace('10/03/2026\tBaker, Bea: 6:00 AM - 8:45 AM\t2.75', '10/03/2026\tBaker, Bea: six to nine\t3')).unread.length, 1,
   'a shift line in a new shape is counted as unread, not skipped quietly');
let threw = '';
try { W.parseShiftReport('Some other page'); } catch (e) { threw = e.message; }
ok(/not the WellSky schedule report/.test(threw), 'the wrong page is refused');

// ---------- the long-shift rule ----------
const longs = W.longShifts(S, {}, '2026-10-19');
eq(longs.map(s => [s.consumer, s.date, s.hours]), [['Carr, Cal', '2026-10-12', 15], ['Able, Ann', '2026-10-09', 13], ['Able, Ann', '2026-10-05', 13]],
   'over 8 hours or twice the usual: newest first; booked-ahead shifts are not judged');
eq(longs[1].why, '13 hrs, usually about 2.75 hrs', 'the reason names the usual length');
eq(longs[0].why, '15 hrs, over 8 hours', 'too little history: only the 8 hour rule, and it says so');
ok(!longs.some(s => s.date === '2026-10-02'), '8.5 hours on Oct 2 is older than two weeks, so payroll already has it');
eq(W.longShifts(S, {}, '2026-10-06').map(s => s.date), ['2026-10-02', '2026-10-05'].reverse().sort().reverse(), 'two weeks back from Oct 6 includes Oct 2 and Oct 5');
const k = W.shiftKey('Able, Ann', { date: '2026-10-09', start: '6:02 AM' });
eq(W.longShifts(S, { [k]: { at: '2026-10-19', by: 'samantha@mo-care.com' } }, '2026-10-19').length, 2, 'a shift marked checked stops showing');
// 2x usual on its own (under 8 hours): 6 hours when the usual is 2.75.
const S2 = W.parseShiftReport(shiftsText.replace('10/16/2026\tBaker, Bea: 6:00 AM - 8:45 AM\t2.75', '10/16/2026\tBaker, Bea: 6:00 AM - 12:00 PM\t6'));
ok(W.longShifts(S2, {}, '2026-10-19').some(s => s.date === '2026-10-16' && s.hours === 6), 'more than twice the usual is long even under 8 hours');

// ---------- an authorizations report ----------
const head = 'Period\tAuthorized\tCompleted\tSched/In Progress\tCancelled\tComp + Sched\tRemaining\t% Utilized\n';
const row = (p, a, c, s, x, cs, rem, pct) => `${p}\t${a}\t${c}\t${s}\t${x}\t${cs}\t${rem}\t${pct}% \n \n\n`;
const authText = 'Authorized vs. Scheduled vs. Completed Report\n\nGrouped by Client\n\nDate Range: 10/01/2026 - 11/30/2026\n\n\n\n' +
  'Able, Ann\nAuth# ANN ABLE (DCN: 12345678) CDS Care Plan: 02/25/2026 - 12/31/2026 - 78.50 Hours/Month | Service: DSDS - CDS Personal Care. | Status: Active\n' + head +
  row('Oct 1 - Oct 31', '78.50', '80.25', '30.00', '0.00', '110.25', '-31.75', 140) + row('Nov 1 - Nov 30', '78.50', '0.00', '75.00', '0.00', '75.00', '3.50', 96) +
  'Carr, Cal\nAuth# Cal Carr CDS ILW - Case Management 4/01/2026-2/28/2027 - 1.00 Hours/Month | Service: DSDS - ILW Case Management. | Status: Active\n' + head +
  row('Oct 1 - Oct 31', '1.00', '0.00', '0.00', '0.00', '0.00', '1.00', 0) + row('Nov 1 - Nov 30', '1.00', '0.00', '0.00', '0.00', '0.00', '1.00', 0) +
  'Auth# Cal Carr PC - CDS 4/01/2026-2/28/2027 - 147.50 Hours/Month | Service: DSDS - CDS Personal Care. | Status: Active\n' + head +
  row('Oct 1 - Oct 31', '147.50', '96.50', '0.00', '0.00', '96.50', '51.00', 65) + row('Nov 1 - Nov 30', '147.50', '0.00', '0.00', '0.00', '0.00', '147.50', 0) +
  'Dove, Di\nAuth# Di Dove - 7/1/2026-4/40/2027 Authorized CDS Hours - 59.00 Hours/Month | Service: None. | Status: Active\n' + head +
  row('Oct 1 - Oct 31', '59.00', '0.00', '0.00', '0.00', '0.00', '59.00', 0) + row('Nov 1 - Nov 30', '59.00', '0.00', '0.00', '0.00', '0.00', '59.00', 0) +
  'Eads, Em\nAuth# Em Eads CDS Authorized Hours - 55.00 Hours/Month | Service: DSDS - CDS Personal Care. | Status: Active\n' + head +
  row('Oct 1 - Oct 31', '55.00', '30.00', '0.00', '0.00', '30.00', '25.00', 55) +
  'Ford, Fay\nAuth# Fay Ford Approved CDS Hours - 71.50 Hours/Month | Service: DSDS - CDS Personal Care. | Status: Active\n' + head +
  row('Oct 1 - Oct 31', '71.50', '40.00', '0.00', '0.00', '40.00', '31.50', 56) + row('Nov 1 - Nov 30', '71.50', '0.00', '0.00', '0.00', '0.00', '71.50', 0);
const A = W.parseAuthReport(authText);
eq(A.consumers.map(c => [c.name, c.auths.length]), [['Able, Ann', 1], ['Carr, Cal', 2], ['Dove, Di', 1], ['Eads, Em', 1], ['Ford, Fay', 1]], 'consumers and their authorizations');
eq(A.consumers[0].auths[0].label, 'ANN ABLE CDS Care Plan: 02/25/2026 - 12/31/2026', 'the DCN is dropped from the label');
eq(A.consumers[2].auths[0].label, 'Di Dove - 7/1/2026-4/40/2027 Authorized CDS Hours', 'a label with its own dashes keeps them');
eq(A.consumers[0].auths[0].months.map(m => [m.month, m.completed, m.scheduled, m.remaining]), [['2026-10', 80.25, 30, -31.75], ['2026-11', 0, 75, 3.5]], 'month rows');
eq(W.parseAuthReport(authText.replace('Date Range: 10/01/2026 - 11/30/2026', 'Date Range: 12/01/2026 - 01/31/2027')
  .replace(/Oct 1 - Oct 31/g, 'Dec 1 - Dec 31').replace(/Nov 1 - Nov 30/g, 'Jan 1 - Jan 31')).consumers[0].auths[0].months.map(m => m.month),
   ['2026-12', '2027-01'], 'a January row after a December start is next year');
eq(A.unread, [], 'nothing left unread in the authorizations report');

// ---------- hours this month (pulled the morning of Oct 19: 18 days worked) ----------
const H = W.hoursThisMonth(A, S, '2026-10-19');
const by = n => H.find(x => x.consumer === n);
eq(H.map(x => x.consumer), ['Able, Ann', 'Carr, Cal', 'Dove, Di', 'Eads, Em', 'Ford, Fay'], 'only personal care is paced (ILW case management left out)');
eq([by('Able, Ann').status, by('Able, Ann').note], ['over', 'Over by 1.75 hrs already'], 'already over');
eq([by('Carr, Cal').status, by('Carr, Cal').note], ['pace-over', 'On pace to go over by about 19 hrs'], '96.5 in 18 days of 31 is on pace for about 166');
eq(by('Carr, Cal').perDay, 3.92, 'safe hours a day for the 13 days left (51 / 13)');
eq([by('Dove, Di').status, by('Dove, Di').note], ['low', 'Only 0% used'], 'barely used after mid-month');
eq([by('Ford, Fay').status], ['ok'], '40 of 71.5 by day 18 is on track');
ok(by('Eads, Em').noNext && !by('Ford, Fay').noNext, 'no November row showing is flagged');
eq(W.hoursThisMonth(A, S, '2026-10-10').find(x => x.consumer === 'Dove, Di').status, 'ok', 'not "barely used" before the 15th');

// ---------- the Dashboard / email lines ----------
const now = new Date(2026, 9, 19, 9, 0);
const fresh = { live: false, lastRun: { at: new Date(2026, 9, 19, 6, 31).toISOString(), ok: true },
                shifts: Object.assign({ at: new Date(2026, 9, 19, 6, 30).toISOString() }, S), auths: Object.assign({ at: new Date(2026, 9, 19, 6, 31).toISOString() }, A) };
const I = W.items(fresh, {}, now);
eq(I.map(i => i.t), [
  'Practice: 3 long shifts to check before payroll',
  'Practice: 1 consumer over the authorization this month',
  'Practice: 1 consumer on pace to go over this month',
  'Practice: 1 consumer barely using their hours',
  'Practice: 1 consumer with no November authorization showing in WellSky'], 'Dashboard lines, marked Practice');
eq(I[0].people[1], { name: 'Able, Ann', why: 'Oct 9, Baker, Bea, 13 hrs, usually about 2.75 hrs' }, 'who and why for a long shift');
ok(I.every(i => i.go === 'authorizations'), 'every line opens the Authorizations page');
ok(!I.some(i => /—/.test(i.t + JSON.stringify(i.people))), 'no em dashes');
eq(W.items({}, {}, now), [], 'nothing at all before the first pull');
const stale = Object.assign({}, fresh, { live: true });
eq(W.items(stale, {}, new Date(2026, 9, 21, 8, 0))[0].t, 'The WellSky check has not run since Oct 19. Log in to WellSky in Chrome and leave the Mac on.', 'a stopped check is red, live wording has no Practice tag');
const broke = Object.assign({}, fresh, { lastRun: { at: now.toISOString(), ok: false, why: 'WellSky asked to log in again' } });
eq(W.items(broke, {}, now)[0], { t: 'Practice: The last WellSky check did not finish: WellSky asked to log in again', go: 'authorizations', bad: true }, 'a failed run is red with the reason');
const steps = R.dailyRoutine({ consumers: [], pipeline: [], authorizations: {}, attendantWages: {}, wellskyItems: I }, now);
eq(steps[1].items.length, 5, 'the lines join step 2, Protect the money');
eq(R.dailyRoutine({ consumers: [], pipeline: [], authorizations: {}, attendantWages: {} }, now)[1].items.length, 0, 'no WellSky lines when none are handed in');

// ---------- shifts never clocked out (her saved Custom Report, 2026-10-20) ----------
const openBody = { kind: 'open', from: '09/05/2026', to: '10/20/2026', total: 5, pulledLocal: '2026-10-20T06:31:10',
  report: { name: 'CDS Daily Check - Care Logs', cdsFilter: true },
  rows: [
    { consumer: 'Able Ann', attendant: 'Bea Baker', clockIn: '2026-09-05T17:52:00.123456', status: 'In Progress' },
    { consumer: 'Carr Cal', attendant: 'Dee Dunn', clockIn: '2026-10-19T08:07:00.5', status: 'In Progress' },
    { consumer: 'Eads Em', attendant: 'Gil Gray', clockIn: '2026-10-20T05:58:00', status: 'In Progress' },   // this morning: may be working
    { consumer: 'Ford Fay', attendant: 'Hal Hunt', clockIn: 'yesterday', status: 'In Progress' }] };
const O = W.parseOpenReport(openBody);
eq([O.rows.length, O.unread.length, O.total], [3, 1, 5], 'In Progress rows read; a row without a clock-in time is counted, not dropped quietly');
const opens = W.openShifts(O, {});
eq(opens.map(o => [o.consumer, o.days]), [['Able Ann', 44], ['Carr Cal', 0]], 'open more than 12 hours = never clocked out; oldest first; this morning\'s shift is left alone');
eq(opens[0].why, 'clocked in Sep 5, 5:52 PM, never clocked out (44 days ago)', 'the reason says when');
eq(opens[1].why, 'clocked in Oct 19, 8:07 AM, never clocked out', 'under a day: no day count');
eq(W.openShifts(O, { [opens[0].key]: { at: 'x' } }).length, 1, 'a never-clocked-out shift marked checked stops showing');
let t2 = '';
try { W.parseOpenReport(Object.assign({}, openBody, { report: { name: 'Something else', cdsFilter: true } })); } catch (e) { t2 = e.message; }
ok(/was not the one read/.test(t2), 'a renamed or different saved report is refused');
t2 = '';
try { W.parseOpenReport(Object.assign({}, openBody, { report: { name: 'CDS Daily Check - Care Logs', cdsFilter: false } })); } catch (e) { t2 = e.message; }
ok(/CDS: Consumer/.test(t2), 'the report losing its CDS filter is refused');
const withOpen = Object.assign({}, fresh, { open: Object.assign({ at: new Date(2026, 9, 19, 6, 32).toISOString() }, O) });
const IO = W.items(withOpen, {}, now);
eq(IO[1].t, 'Practice: 2 shifts never clocked out (still In Progress in WellSky)', 'the Dashboard line, right after long shifts');
eq(IO[1].people[0], { name: 'Able Ann', why: 'Bea Baker, clocked in Sep 5, 5:52 PM, never clocked out (44 days ago)' }, 'who and why for an open shift');
ok(IO[1].bad, 'open shifts are red');
const staleOpen = Object.assign({}, withOpen, { open: Object.assign({}, withOpen.open, { at: new Date(2026, 9, 17, 6, 0).toISOString() }) });
ok(/has not run since Oct 17/.test(W.items(staleOpen, {}, now)[0].t), 'once the open report is in use, it going stale is red too');

// ---------- saving, on a local Postgres copy ----------
const pg = new PGlite();
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  create table cds_match_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by text);`);
const SQL = readFileSync(ROOT + '/wellsky_check.sql', 'utf8');
await pg.exec(SQL); await pg.exec(SQL);
const db = { query: async (t, p) => pg.query(t, p) };
const saved = async () => (await pg.query(`select data_value v from agency_data where agency_id=$1 and data_key='wellskyCheck'`, [AGENCY_ID])).rows[0]?.v;
eq((await pg.query(`select value->>'live' l from cds_match_settings where key='wellsky_check'`)).rows[0].l, 'false', 'starts in practice, and running the SQL twice is safe');
let t0 = Date.parse('2026-10-19T11:30:00Z');
eq([await ingest({ db, now: () => 0 }, { kind: 'ping' }), await saved()], [{ ok: true, saved: false, live: false, kinds: ['shifts', 'auths', 'open', 'receipts'] }, undefined], 'a ping saves nothing and names the steps it knows');
const res = await ingest({ db, now: () => t0 }, { kind: 'shifts', text: shiftsText });
eq([res.ok, res.saved, res.live, res.consumers, res.shifts], [true, true, false, 2, 22], 'a schedule report is saved');
await ingest({ db, now: () => t0 + 6e4 }, { kind: 'auths', text: authText });
let v = await saved();
eq([v.live, v.shifts.consumers.length, v.auths.consumers.length, v.lastRun.ok, v.lastRun.kind], [false, 2, 5, true, 'auths'], 'both reports saved side by side');
const bad1 = await ingest({ db, now: () => t0 + 12e4 }, { kind: 'auths', text: 'Please log in to WellSky' });
v = await saved();
eq([bad1.ok, v.auths.consumers.length, v.lastRun.ok, v.lastRun.why], [false, 5, false, 'This is not the WellSky authorizations report.'], 'an unreadable report keeps the last good one and records why');
await ingest({ db, now: () => t0 }, { kind: 'failed', why: 'Chrome was not open' });
eq((await saved()).lastRun.why, 'Chrome was not open', 'the task can report its own failure');
eq((await ingest({ db, now: () => t0 }, { kind: 'shifts', text: 'Schedules by Client\nDate Range: 10/01/2026 - 10/31/2026\n' })).why,
   'the schedule report listed no CDS consumers', 'an empty report is a failure, not a quiet nothing');
const ro = await ingest({ db, now: () => t0 }, openBody);
eq([ro.ok, ro.careLogs, ro.open, ro.unread], [true, 5, 3, 1], 'the open shift report is saved');
eq((await saved()).open.rows.length, 3, 'saved next to the other two');
eq((await ingest({ db, now: () => t0 }, Object.assign({}, openBody, { report: { name: 'Other', cdsFilter: true } }))).saved, false, 'the wrong saved report is not saved');
eq((await saved()).open.rows.length, 3, 'and the last good one is kept');
eq((await ingest({ db, now: () => t0 }, { kind: 'drop table' })).why, 'the task sent something that is not a WellSky report', 'unknown kinds are refused');
await pg.exec(`update cds_match_settings set value = jsonb_set(value, '{live}', 'true') where key='wellsky_check'`);
await ingest({ db, now: () => t0 }, { kind: 'shifts', text: shiftsText });
eq((await saved()).live, true, 'live follows the setting');

// ---------- receipts: the key never goes into the WellSky page (2026-10-20) ----------
await pg.exec(`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;`);
const INBOX = readFileSync(ROOT + '/wellsky_inbox.sql', 'utf8').replace(/notify pgrst[^;]*;/g, '');
await pg.exec(INBOX); await pg.exec(INBOX);
const inbox = async () => (await pg.query('select receipt, kind, created_at from wellsky_inbox')).rows;
await pg.exec(`update cds_match_settings set value = jsonb_set(value, '{live}', 'false') where key='wellsky_check'`);
await pg.exec(`delete from agency_data where data_key='wellskyCheck'`);
const sub = await submit({ db }, { kind: 'shifts', text: shiftsText });
ok(sub.ok && /^[0-9a-f]{36}$/.test(sub.receipt), 'a report from the page is parked and a receipt comes back');
eq([(await inbox()).length, await saved()], [1, undefined], 'parked only: nothing reaches the hub card before it is confirmed');
const conf = await confirm({ db }, sub.receipt);
eq([conf.ok, conf.confirmed, conf.saved, conf.consumers], [true, true, true, 2], 'confirming the receipt saves the report');
eq([(await inbox()).length, (await saved()).shifts.consumers.length], [0, 2], 'the parked copy is deleted once used');
eq((await confirm({ db }, sub.receipt)).ok, false, 'a receipt works once only');
eq((await confirm({ db }, 'not-a-receipt')).error, 'not a receipt', 'junk is refused');
const old = await submit({ db }, { kind: 'auths', text: authText });
await pg.query(`update wellsky_inbox set created_at = now() - interval '61 minutes' where receipt = $1`, [old.receipt]);
eq((await confirm({ db }, old.receipt)).ok, false, 'a receipt over an hour old is refused');
await submit({ db }, { kind: 'ping' });
eq((await inbox()).map(r => r.kind), ['ping'], 'anything over an hour old is cleared on the next drop-off');
eq((await submit({ db }, { kind: 'confirm', receipt: 'x' })).error, 'not a WellSky report', 'the page cannot confirm anything itself');
eq((await submit({ db }, { kind: 'shifts', text: 'x'.repeat(3e6 + 10) })).error, 'too big', 'oversized drop-offs are refused');
const pingR = (await inbox())[0].receipt;
eq(await confirm({ db }, pingR), { ok: true, saved: false, confirmed: true, kind: 'ping' }, 'a confirmed ping saves nothing (installer proof)');
for (let i = 0; i < INBOX_MAX_PER_HOUR; i++) await submit({ db }, { kind: 'ping' });
eq((await submit({ db }, { kind: 'ping' })).error, 'too many waiting', 'a flood of drop-offs is capped');
await pg.exec('delete from wellsky_inbox');
const f = await submit({ db }, { kind: 'failed', why: 'Schedule report: WellSky did not open the report page' });
const fc = await confirm({ db }, f.receipt);
eq([fc.ok, fc.recorded, (await saved()).lastRun.why], [false, true, 'Schedule report: WellSky did not open the report page'], 'a failure from the page is recorded once confirmed, and the reply says so');
const o = await submit({ db }, openBody);
eq((await confirm({ db }, o.receipt)).open, 3, 'the open shift report goes through receipts too');
const grants = (await pg.query(`select grantee from information_schema.role_table_grants where table_name='wellsky_inbox' and grantee in ('anon','authenticated')`)).rows;
eq(grants.length, 0, 'the public and the hub page cannot read or write the holding table');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
