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

// ---------- approved hours not used (her pick 2026-11-01) ----------
const ua = { at: '2026-11-20T11:00:00Z', from: '2026-10-01', to: '2026-11-30', consumers: [
  { name: 'Barnwell, Susan', auths: [{ label: 'Susan Barnwell PC - CDS 4/01/2026-2/28/2027', service: 'DSDS - CDS Personal Care', months: [
    { month: '2026-10', authorized: 100, completed: 95, scheduled: 0 }, { month: '2026-11', authorized: 100, completed: 60, scheduled: 0 }] }] },
  { name: 'Bell, Pamela', auths: [{ label: 'Pamela Bell CDS Authorized Hours', service: 'DSDS - CDS Personal Care', months: [
    { month: '2026-10', authorized: 80, completed: 40, scheduled: 0 }, { month: '2026-11', authorized: 80, completed: 30, scheduled: 0 }] }] },
  { name: 'Reed, Shasta', auths: [{ label: 'Shasta Reed Authorization', service: 'DSDS - CDS Personal Care', months: [
    { month: '2026-10', authorized: 60, completed: 70, scheduled: 0 }, { month: '2026-11', authorized: 60, completed: 5, scheduled: 0 }] }] } ] };
const NOV = new Date('2026-11-20T15:00:00');
const uv = H.monthView({ W, check: { auths: ua }, reviewed: {}, corrections: [], submissions: [], perHour: 21, now: NOV });
const by = Object.fromEntries(uv.hours.map(h => [h.consumer, h]));
// Susan: 60 in 19 days, about 3.16 a day, 11 days left -> about 94.7 of 100, on track
eq([by['Barnwell, Susan'].status, by['Barnwell, Susan'].use.under], ['ok', false], 'on pace for 95%: not flagged');
// Pamela: 30 in 19 days -> about 47.4 of 80 (59%), under 80%
eq([by['Bell, Pamela'].status, by['Bell, Pamela'].use.under, by['Bell, Pamela'].use.unused, Math.round(by['Bell, Pamela'].use.dollars)], ['ok', true, 32.75, 688], 'on pace for 59%: flagged, 32.75 hrs about $688 unused');
eq(by['Reed, Shasta'].status, 'low', 'under a quarter after the 15th is still "barely used"');
eq(uv.hours.map(h => h.consumer), ['Reed, Shasta', 'Bell, Pamela', 'Barnwell, Susan'], 'barely used, then under the goal, then on track');
eq(uv.tiles.under, 2, 'tile counts barely used and under the goal');
eq([uv.use.last.name, uv.use.last.authorized, uv.use.last.used, uv.use.last.unused], ['October', 240, 195, 45], 'October: over-use does not cancel out unused hours');
eq(uv.use.last.most.map(r => [r.consumer, r.unused]), [['Pamela Bell', 40]], 'most unused last month: only those under the goal');
eq(Math.round(uv.use.last.dollars), 945, '45 hrs at $21 net');
const early = H.monthView({ W, check: { auths: { ...ua, at: '2026-11-03T11:00:00Z' } }, reviewed: {}, corrections: [], submissions: [], perHour: 21, now: new Date('2026-11-03T15:00:00') });
ok(!early.use.paceOk && early.hours.every(h => !h.use.under), 'first week: too early, nobody flagged for pace');
const g60 = H.monthView({ W, check: { auths: ua }, reviewed: {}, corrections: [], submissions: [], perHour: 21, goal: 0.5, now: NOV });
eq(g60.hours.find(h => h.consumer === 'Bell, Pamela').use.under, false, 'the goal comes from Settings');
eq(H.monthView({ W, check: { auths: ua }, reviewed: {}, corrections: [], submissions: [], now: NOV }).use.month.dollars, 0, 'no rate: hours only');

// net per hour (her ask 2026-11-01): billing less pay and payroll costs
eq(H.netPerHour({ billing: 20.92, pay: 15 }), 5.92, '$20.92 less $15 pay');
eq(H.netPerHour({ billing: 20.92, pay: 15, payCosts: 10 }), 4.42, 'and 10% payroll costs on the pay');
eq([H.netPerHour({ billing: 0, pay: 15 }), H.netPerHour({ billing: 10, pay: 15 })], [0, 0], 'no rate, or pay above the rate: 0');

// ---------- hours from the daily WellSky email (her yes 2026-11-01) ----------
const PB = 'Pamela Bell CDS Authorized Hours', SB = 'Susan Barnwell PC - CDS 4/01/2026-2/28/2027';
const log = (consumer, auth, inn, out, h, extra = {}) => ({ consumer, auth, clockIn: inn, clockOut: out, hours: h, attendant: 'A B', authHours: auth === PB ? 80 : auth === SB ? 100 : undefined, ...extra });
const mail = { at: '2026-11-20T12:00:00Z', shifts: [
  log('Bell, Pamela', PB, '2026-10-02T09:00:00', '2026-10-02T13:00:00', 4), log('Bell, Pamela', PB, '2026-11-03T09:00:00', '2026-11-03T15:00:00', 6),
  log('Bell, Pamela', PB, '2026-11-18T09:00:00', '', null),
  log('Barnwell, Susan', SB, '2026-11-10T09:00:00', '2026-11-10T17:00:00', 8, { authEnd: '2027-02-28' }),
  log('Barnwell, Susan', 'Susan Barnwell CDS ILW - FMS 4/01/2026-2/28/2027', '2026-11-10T09:00:00', '2026-11-10T09:15:00', 0.25)] };
const EA = W.authsFromLogs(mail);
eq(EA.consumers.map(c => [c.name, c.auths.map(a => a.months.map(m => m.month + ':' + m.authorized + '/' + m.completed).join(','))]),
   [['Bell, Pamela', ['2026-10:80/4,2026-11:80/6']], ['Barnwell, Susan', ['2026-10:100/0,2026-11:100/8']]], 'approved and used per month; never clocked out not counted; FMS line dropped');
eq(EA.consumers[1].auths[0].endDate, '2027-02-28', 'end date from the email');
eq(W.authsFromLogs({ at: mail.at, shifts: mail.shifts.slice(1).map(x => ({ ...x })) }).consumers[0].auths[0].months.map(m => m.month), ['2026-11'], 'email not reaching back to the 1st of last month: this month only');
eq(W.authsFromLogs({ at: mail.at, shifts: mail.shifts.map(x => ({ ...x, authHours: undefined })) }), null, 'the old email with no Initial Hours: nothing');
const oldRep = { at: '2026-10-20T07:00:00Z', consumers: [] };
eq(W.hoursAuths({ auths: oldRep, analytics: { authLogs: mail } }).email, true, 'a newer email wins over the Chrome report');
eq(W.hoursAuths({ auths: oldRep, analytics: { authLogs: { ...mail, shifts: mail.shifts.map(x => ({ ...x, authHours: undefined })) } } }), oldRep, 'old email: the Chrome report as before');
ok(W.emailCovers({ analytics: { authLogs: mail } }, new Date('2026-11-20T18:00:00Z')) && !W.emailCovers({ analytics: { authLogs: mail } }, new Date('2026-11-22T18:00:00Z')), 'the email covers it while fresh');
const ck = { lastRun: { at: '2026-10-20T07:00:00Z', ok: false, why: 'Chrome not connected' }, auths: oldRep, analyticsRun: { ok: true }, analytics: { firstLast: { at: mail.at }, authLogs: mail } };
const its = W.items(ck, {}, new Date('2026-11-20T18:00:00Z'));
ok(!its.some(i => /WellSky check has not run|did not finish/.test(i.t)), 'no "Chrome check stopped" line when the email has it all');
ok(its.some(i => /on pace to go over|barely using/.test(i.t)) || its.every(i => !/over the authorization/.test(i.t)), 'no over-the-authorization line from the stale Chrome report');
const ev = H.monthView({ W, check: ck, reviewed: {}, corrections: [], submissions: [], perHour: 5.92, now: new Date('2026-11-20T18:00:00Z') });
eq([ev.hoursFromEmail, ev.hours.length, ev.use.last && ev.use.last.name], [true, 2, 'October'], 'This month reads the email, with last month');
eq(ev.hours.find(h => h.consumer === 'Bell, Pamela').use.under, true, 'Pamela 6 of 80 by the 20th: under the goal');

// ---------- 40 hours a week for one consumer (her rule 2026-11-01, attendant packet) ----------
const wkNow = new Date('2026-11-05T15:00:00');   // a Thursday; this week Nov 1 to 7, last week Oct 25 to 31
const sh = (date, hours, attendant = 'Wise, Jeana') => ({ attendant, date, start: '8:00 AM', endDate: date, end: '5:00 PM', hours });
const wkShifts = { consumers: [
  { name: 'Reed, Shasta', shifts: [sh('2026-10-25', 9), sh('2026-10-26', 9), sh('2026-10-27', 9), sh('2026-10-28', 9), sh('2026-10-29', 7.5), sh('2026-11-01', 9), sh('2026-11-02', 9), sh('2026-11-03', 9), sh('2026-11-04', 9.5), sh('2026-10-18', 50)] },
  { name: 'Dodd, Crystal', shifts: [sh('2026-11-02', 20, 'Ackerman, Kiersten'), sh('2026-11-03', 10, 'Ackerman, Kiersten')] },
  { name: 'Tran, Huan', shifts: [sh('2026-11-02', 10, 'Ackerman, Kiersten'), sh('2026-11-03', 0, 'Ackerman, Kiersten')] } ] };
const w40 = W.over40(wkShifts, {}, wkNow);
eq(w40.map(x => [x.attendant, x.consumer, x.hours, x.over, x.thisWeek]), [['Jeana Wise', 'Shasta Reed', 43.5, true, false], ['Jeana Wise', 'Shasta Reed', 36.5, false, true]],
   'last week over 40 (red), this week close (36.5); older weeks skipped; two consumers are not added together');
ok(/time over 40 is not paid/.test(w40[0].why) && /3.5 hrs left before 40/.test(w40[1].why), 'says why, and how many hours are left');
eq(W.over40(wkShifts, { [w40[0].key]: { at: 'x' } }, wkNow).length, 1, 'Checked hides it');
const its40 = W.items({ lastRun: { at: '2026-11-05T07:00:00Z', ok: true }, shifts: { ...wkShifts, at: '2026-11-05T07:00:00Z' }, auths: { at: '2026-11-05T07:00:00Z', consumers: [] } }, {}, wkNow);
ok(its40.some(i => /1 attendant over 40 hours a week for one consumer/.test(i.t) && i.bad) && its40.some(i => /close to 40 hours this week/.test(i.t)), 'on Today too');
const mv40 = H.monthView({ W, check: { shifts: wkShifts }, reviewed: {}, corrections: [], submissions: [], now: wkNow });
eq([mv40.week.length, mv40.tiles.week], [2, 1], 'This month lists both, the tile counts the one over');
eq(JSON.stringify(W.shiftsNow(emailCheck)), JSON.stringify(H.mergedShifts(emailCheck)), 'Today and This month read the same shifts');

const src = readFileSync(ROOT + '/hours/hub-hours.js', 'utf8');
ok(!/—/.test(src), 'no em dashes');
ok(!/tel:|sms:/.test(src), 'no call or text buttons for attendants');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
