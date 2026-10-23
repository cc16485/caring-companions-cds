// Hours & EVV · This month (2026-10-22, her yes to part c). Pure functions only.
//   node tests/hours_evv_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
import { readFileSync } from 'fs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = await import(ROOT + '/hours/hub-hours.js');
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(ROOT + '/supabase/functions/_shared/office/wellsky.js', 'utf8'), ctx);
const W = ctx.CDSWellSky;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const NOW = new Date('2026-10-22T15:00:00');

// ---------- end dates from the authorization names ----------
eq(H.authEnd('Susan Barnwell PC - CDS 4/01/2026-2/28/2027'), '2027-02-28', 'dates with no spaces');
eq(H.authEnd('HUAN TRAN (DCN: 62258468) CDS Care Plan: 02/25/2026 - 12/31/2026'), '2026-12-31', 'dates with spaces and a DCN');
eq(H.authEnd('Pamela Bell CDS Authorized Hours'), null, 'no dates in the name');
eq(H.authEnd('Linda Boyd - 7/1/2026-4/40/2027 Authorized CDS Hours'), null, 'April 40 is not a date');
const auths = { at: '2026-10-22T11:00:00Z', consumers: [
  { name: 'Barnwell, Susan', auths: [{ label: 'Susan Barnwell CDS ILW - FMS 4/01/2026-2/28/2027', service: 'DSDS - ILW Financial Management Service', months: [] },
                                     { label: 'Susan Barnwell PC - CDS 4/01/2026-2/28/2027', service: 'DSDS - CDS Personal Care', months: [{ month: '2026-10', authorized: 147.5, completed: 120, scheduled: 0 }] }] },
  { name: 'Gasper, Michael', auths: [{ label: 'Michael Gasper CDS Authorized Hours 09/25/2025 - 08/31/2026', service: 'DSDS - CDS Personal Care', months: [{ month: '2026-10', authorized: 80, completed: 30, scheduled: 0 }] }] },
  { name: 'Reed, Shasta', auths: [{ label: 'Shasta Reed Authorization 6/29/2026-11/10/2026', service: 'DSDS - CDS Personal Care', months: [{ month: '2026-10', authorized: 100, completed: 10, scheduled: 0 }] }] },
  { name: 'Bell, Pamela', auths: [{ label: 'Pamela Bell CDS Authorized Hours', service: 'DSDS - CDS Personal Care', months: [{ month: '2026-10', authorized: 60, completed: 40, scheduled: 0 }] }] } ] };
const ends = H.authEnds(auths, W, NOW);
eq(ends.map(e => [e.consumer, e.status]), [['Michael Gasper', 'ended'], ['Shasta Reed', 'soon'], ['Pamela Bell', 'unknown'], ['Susan Barnwell', 'ok']], 'ended first, then soon, unknown, current');
eq(ends[1].days, 19, 'days left');
eq(ends[3].label, 'Susan Barnwell PC - CDS 4/01/2026-2/28/2027', 'the personal care line, not FMS');

// ---------- DSDS end dates first (her switch 'authSlim', 2026-10-23) ----------
const dsds = { 'Pamela Bell': { end: '2027-03-31', priorAuth: 'PA-1' }, 'Michael Gasper': { end: '2026-12-31', priorAuth: '' },
               'Susan Barnwell': { end: '2026-09-30', priorAuth: 'PA-2' } };
const ends2 = H.authEnds(auths, W, NOW, n => dsds[n] || null);
const by2 = Object.fromEntries(ends2.map(e => [e.consumer, e]));
eq([by2['Pamela Bell'].status, by2['Pamela Bell'].end, by2['Pamela Bell'].from, by2['Pamela Bell'].label], ['ok', '2027-03-31', 'dsds', 'DSDS authorization PA-1'], 'no date in the WellSky name: the DSDS date fills it');
eq([by2['Michael Gasper'].status, by2['Michael Gasper'].end, by2['Michael Gasper'].label], ['ok', '2026-12-31', 'DSDS authorization'], 'a newer DSDS date beats an old WellSky name');
eq([by2['Susan Barnwell'].end, by2['Susan Barnwell'].from], ['2027-02-28', 'wellsky'], 'an older hub copy does not beat WellSky');
ok(/upload the new authorization/.test(by2['Susan Barnwell'].label), 'and it says to upload the new authorization');
eq(by2['Shasta Reed'].from, 'wellsky', 'nothing uploaded: WellSky as before');
eq(H.authEnds(auths, W, NOW, null).map(e => e.end), ends.map(e => e.end), 'switch off: same as before');

// ---------- two attendants at once ----------
const shifts = { at: '2026-10-22T11:00:00Z', consumers: [
  { name: 'Tran, Huan', shifts: [{ attendant: 'Pham, Nuong', date: '2026-10-20', start: '9:00 AM', endDate: '2026-10-20', end: '1:00 PM', hours: 4 },
                                  { attendant: 'Lee, Tonya', date: '2026-10-20', start: '12:30 PM', endDate: '2026-10-20', end: '3:00 PM', hours: 2.5 },
                                  { attendant: 'Pham, Nuong', date: '2026-10-21', start: '9:00 AM', endDate: '2026-10-21', end: '1:00 PM', hours: 4 },
                                  { attendant: 'Lee, Tonya', date: '2026-10-21', start: '1:00 PM', endDate: '2026-10-21', end: '3:00 PM', hours: 2 }] },
  { name: 'Barnwell, Susan', shifts: [{ attendant: 'Smith, Anita', date: '2026-10-18', start: '10:00 PM', endDate: '2026-10-19', end: '6:00 AM', hours: 8 },
                                      { attendant: 'Smith, Anita', date: '2026-10-19', start: '5:00 AM', endDate: '2026-10-19', end: '7:00 AM', hours: 2 },
                                      { attendant: 'Smith, Anita', date: '2026-08-01', start: '9:00 AM', endDate: '2026-08-01', end: '5:00 PM', hours: 8 },
                                      { attendant: 'Smith, Anita', date: '2026-08-01', start: '9:00 AM', endDate: '2026-08-01', end: '5:00 PM', hours: 8 }] } ] };
const ov = H.overlaps(shifts, NOW);
eq(ov.length, 2, 'two overlaps; back to back is fine; older than a month is skipped');
ok(/Nuong Pham \(9:00 AM to 1:00 PM\) and Tonya Lee \(12:30 PM to 3:00 PM\) at the same time/.test(ov[0].why), 'two attendants at once, named');
ok(/Anita Smith has two shifts that overlap/.test(ov[1].why) && ov[1].consumer === 'Susan Barnwell', 'an overnight shift overlapping the next one, same attendant');

// ---------- EVV corrections ----------
const corrections = [{ consumer: 'Huan Tran', attendant: 'Nuong Pham', visitdate: '2026-10-05', wellskyDone: 'no' },
                     { consumer: 'Susan Barnwell', attendant: 'Anita Smith', visitdate: '2026-10-02', wellskyDone: 'yes' },
                     { consumer: 'Susan Barnwell', attendant: 'Anita Smith', visitdate: '2026-09-02', wellskyDone: 'yes' }];
const subs = [{ consumer: 'Shasta Reed', attendant: 'Jeana Wise', visitdate: '2026-10-19', sig_attendant: 'data:x', sig_consumer: null, processed: false },
              { consumer: 'Crystal Dodd', attendant: 'Kiersten Ackerman', visitdate: '2026-10-20', sig_attendant: 'data:x', sig_consumer: 'data:y', processed: false }];
const e = H.evvStatus(corrections, subs, 40, NOW);
eq([e.thisMonth, e.share, e.overGoal], [4, 0.1, true], '4 fixes in 40 shifts is 10%, over the 5% goal');
eq(e.needSign, [{ consumer: 'Shasta Reed', attendant: 'Jeana Wise', visitdate: '2026-10-19', missing: 'the consumer' }], 'a form missing the consumer signature');
eq([e.toLog, e.toFix.length, e.open], [1, 1, 3], 'one signed form to review, one to fix in WellSky');
eq(H.evvStatus([], [], 0, NOW).share, null, 'no shifts: no rate');
eq(H.shiftsThisMonth(shifts, NOW), 6, 'shifts this month so far');

// ---------- the page ----------
const v = H.monthView({ W, check: { auths, shifts }, reviewed: { [ov[1].key]: { at: 'x' } }, corrections, submissions: subs, now: NOW });
eq(v.hours.map(h => h.status), ['pace-over', 'low', 'ok', 'ok'], 'statuses from the shared WellSky rules (Shasta 10 of 100 after the 15th is low)');
eq(v.hours[0].consumer, 'Barnwell, Susan', 'whoever is going over comes first');
eq(v.overlaps.length, 1, 'an overlap marked checked on the Authorizations tab stays hidden');
eq(v.tiles.ending, 2, 'ended or ending in 30 days');
ok(v.expectedShare > 0.6 && v.expectedShare < 0.75, 'the even-pace line is about two thirds through October');

// ---------- shifts from the daily WellSky email (2026-10-22) ----------
const emailCheck = { shifts, analytics: { authLogs: { at: '2026-10-22T12:00:00Z', shifts: [
  { consumer: 'Tran, Huan', attendant: 'Nuong Pham', auth: 'x', clockIn: '2026-10-21T09:00:00', clockOut: '2026-10-21T13:00:00', hours: 4 },
  { consumer: 'Tran, Huan', attendant: 'Tonya Lee', auth: 'x', clockIn: '2026-10-21T12:00:00', clockOut: '2026-10-21T14:00:00', hours: 2 },
  { consumer: 'Barnwell, Susan', attendant: 'Anita Smith', auth: 'x', clockIn: '2026-10-20T08:00:00', clockOut: '', hours: null } ] } } };
const m = H.mergedShifts(emailCheck);
eq(m.emailFrom, '2026-10-20', 'the email covers from its first day');
eq(m.consumers.find(c => c.name === 'Tran, Huan').shifts.map(x => x.date + ' ' + x.start + ' ' + x.attendant),
   ['2026-10-21 9:00 AM Nuong Pham', '2026-10-21 12:00 PM Tonya Lee'], 'email shifts replace the schedule report for the days the email covers');
ok(m.consumers.find(c => c.name === 'Barnwell, Susan').shifts.some(x => x.date === '2026-10-19'), 'days before the email still come from the schedule report');
eq(H.mergedShifts({ shifts, analytics: { authLogs: { at: 'x', shifts: [{ consumer: 'Tran, Huan', clockIn: '2026-10-21T09:00:00', clockOut: '2026-10-21T13:00:00', hours: 4 }] } } }), shifts, 'an email with no attendant names changes nothing');
eq(H.overlaps(m, NOW).length, 2, 'two attendants at once found in the email shifts too');
const eo = H.emailOpen(emailCheck);
eq([eo.pulledLocal, eo.rows.length, eo.rows[0].attendant], ['2026-10-22T07:00:00', 1, 'Anita Smith'], 'never clocked out, from the email, in Central time');
eq(W.openShifts(eo, {}).length, 1, 'and the shared rule flags it (over 12 hours)');

const src = readFileSync(ROOT + '/hours/hub-hours.js', 'utf8');
ok(!/—/.test(src), 'no em dashes');
ok(!/tel:|sms:/.test(src), 'no call or text buttons for attendants');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
