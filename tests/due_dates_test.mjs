// Approved due dates on Today and in the 8am email (her answers 2026-10-23, build step 4).
//   node tests/due_dates_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
await import(ROOT + '/supabase/functions/_shared/office/wellsky.js');
const R = globalThis.CDSRules, W = globalThis.CDSWellSky;
const H = await import(ROOT + '/hours/hub-hours.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const now = new Date('2026-10-23T12:00:00');   // a Friday
const line = (items, re) => items.find(i => re.test(i.t));

// EVV forms: due Saturday 11:59 PM of the visit's pay week (Sunday to Saturday).
const ev = R.evvAndPayroll({ evv: {
  submissions: [{ consumer: 'Ann Alpha', visitdate: '2026-10-14', sig_attendant: true, sig_consumer: false },   // week of Oct 11-17: late
                { consumer: 'Ben Bravo', visitdate: '2026-10-20', sig_attendant: true, sig_consumer: true },    // due Oct 24
                { consumer: 'Done Already', visitdate: '2026-10-20', processed: true }],
  corrections: [{ consumer: 'Cal Charlie', visitdate: '2026-10-21', wellskyDone: 'no' }, { consumer: 'Fixed', visitdate: '2026-10-21', wellskyDone: 'yes' }] } }, now);
const evl = line(ev, /EVV form/);
ok(evl && evl.people.length === 3 && evl.bad, 'EVV: 3 forms (processed and fixed ones left out), red because one is late');
ok(evl.people[0].name === 'Ann Alpha' && evl.people[0].due === '2026-10-17' && /consumer to sign/.test(evl.people[0].why), 'Ann: needs the consumer to sign, was due Sat Oct 17');
ok(evl.people.find(p => p.name === 'Ben Bravo').due === '2026-10-24' && evl.people.find(p => p.name === 'Cal Charlie').due === '2026-10-24', 'this week: due Sat Oct 24');
ok(evl.people.every(p => p.act === 'evv'), 'each opens EVV forms');

// Payroll upload: the day after the next payday (7 days after the last one uploaded, plus 1).
const pay = (sum, reg) => R.evvAndPayroll({ payroll: { runs: sum.map(d => ({ checkDate: d })), registers: reg.map(d => ({ checkDate: d })) } }, now);
const p1 = line(pay(['10/15/2026'], ['10/15/2026']), /payroll/);
ok(p1 && p1.people[0].due === '2026-10-23' && !p1.bad, 'last payroll Oct 15: the Oct 22 payroll is due today (Fri Oct 23), not red yet');
ok(!pay(['10/22/2026'], ['10/22/2026']).length, 'Oct 22 payroll uploaded: nothing due');
const p2 = line(pay(['10/22/2026'], ['10/08/2026']), /payroll/);
ok(p2 && p2.bad && p2.people[0].due === '2026-10-16' && /older/.test(p2.people[0].why), 'register two weeks old: late, and says one of the two is older');
ok(!R.evvAndPayroll({ payroll: { runs: [], registers: [] } }, now).length, 'nothing ever uploaded: no line (the Payroll page says where to start)');

// DHSS: a change found on a check-in call is reported within 10 days of the call.
const dh = R.dhssChanges([
  { id: 'a', name: 'Ann Alpha', contacts: { '2026-10': { date: '2026-10-10', dhssFlag: true, healthNotes: 'Fell, in rehab' } } },
  { id: 'b', name: 'Ben Bravo', contacts: { '2026-10': { date: '2026-10-20', dhssFlag: true } } },
  { id: 'c', name: 'Cal Charlie', contacts: { '2026-10': { date: '2026-10-05', dhssFlag: true, dhssReported: { date: '2026-10-07' } } } },
  { id: 'd', name: 'Dee Delta', contacts: { '2026-10': { date: '2026-10-05' } } }], now);
ok(dh.length === 1 && dh[0].people.length === 2 && dh[0].bad, 'DHSS: Ann and Ben, not Cal (reported) or Dee (no change); red');
ok(dh[0].people[0].name === 'Ann Alpha' && dh[0].people[0].due === '2026-10-20' && /Fell/.test(dh[0].people[0].why) && dh[0].people[0].act === 'dhss' && dh[0].people[0].month === '2026-10', 'Ann: due Oct 20 with the note');

// Leads: waiting on the state over 21 days; reached with no call back date (1 business day).
const ld = R.leadDeadlines([
  { id: 'L1', name: 'Sue State', type: 'referral', status: 'submitted', stateSubmit: '2026-09-25' },     // 28 days
  { id: 'L2', name: 'Tim Wait', type: 'referral', status: 'submitted', stateSubmit: '2026-10-15' },      // 8 days: fine
  { id: 'L3', name: 'Uma Undated', type: 'lead', status: 'contacted', notes: [{ date: '2026-10-21', text: 'Called, thinking it over' }] },
  { id: 'L4', name: 'Val Dated', type: 'lead', status: 'contacted', followup: '2026-10-30', notes: [{ date: '2026-10-21', text: 'x' }] }], [], '2026-10-23');
const st = line(ld, /state/), nd = line(ld, /call back date/);
ok(st && st.people.length === 1 && st.people[0].name === 'Sue State' && st.people[0].due === '2026-10-16' && st.people[0].act === 'lead', 'Sue: on the state 28 days, call DSDS (was due day 21)');
ok(nd && nd.people.length === 1 && nd.people[0].name === 'Uma Undated' && nd.people[0].due === '2026-10-22' && nd.bad, 'Uma: reached Wed Oct 21, a call back date was due Thu Oct 22');

// I-9: 3 business days after the first day worked (hub knows first shifts).
const aw = R.attendantWork({ applications: [{ pool_id: 'p1', name: 'Amy Ash', label: 'Finish in Empeon', next: 'I-9' }, { pool_id: 'p2', name: 'Bo Birch', label: 'Finish in Empeon' }],
                             firstShift: { 'amy ash': '2026-10-16' }, roster: [] }, now);
const i9 = line(aw, /I-9/);
ok(i9 && i9.bad && i9.people.length === 1 && i9.people[0].name === 'Amy Ash' && i9.people[0].due === '2026-10-21', 'Amy worked Fri Oct 16: I-9 was due Wed Oct 21');
ok(line(aw, /waiting on the office/).people.map(p => p.name).join() === 'Bo Birch', 'Amy is not listed twice');

// Two attendants at once: same rule and keys as the Hours page, on Today with a Saturday due date.
const shifts = { consumers: [{ name: 'Alpha, Ann', shifts: [
  { date: '2026-10-20', start: '8:00 AM', end: '12:00 PM', attendant: 'Gray, Gil' }, { date: '2026-10-20', start: '10:00 AM', end: '1:00 PM', attendant: 'Hunt, Hal' },
  { date: '2026-10-21', start: '8:00 AM', end: '10:00 AM', attendant: 'Gray, Gil' }, { date: '2026-10-21', start: '10:00 AM', end: '11:00 AM', attendant: 'Gray, Gil' }] }] };
ok(JSON.stringify(W.overlaps(shifts, now)) === JSON.stringify(H.overlaps(shifts, now)), 'two attendants at once: same answer as the Hours page');
const items = W.items({ lastRun: { ok: true }, live: true, shifts: Object.assign({ at: now.toISOString() }, shifts), auths: { at: now.toISOString() } }, {}, now);
const ov = line(items, /at once/);
ok(ov && ov.people.length === 1 && ov.people[0].due === '2026-10-24' && ov.people[0].act === 'shift' && ov.people[0].key.startsWith('overlap|'), 'on Today: 1 time, due Sat Oct 24, Checked clears it');
ok(!line(W.items({ lastRun: { ok: true }, live: true, shifts: Object.assign({ at: now.toISOString() }, shifts), auths: { at: now.toISOString() } }, { [ov.people[0].key]: { at: 'x' } }, now), /at once/), 'checked: gone');
ok(W.shiftsThisMonth(shifts, now) === 4 && W.EVV_GOAL === 0.05, 'shifts this month for the 5% EVV standard');

// Reports line on Today (step 1) and its button.
const s1 = R.dailyRoutine({ consumers: [], pipeline: [], quarterStatus: { q3: 'submitted', q3_for: '2026-10-31' } }, now).find(s => s.n === 1);
const rep = line(s1.items, /state report/);
ok(rep && rep.people.map(p => p.key).join() === 'des,f941,mo941' && rep.people[0].act === 'report' && rep.people[0].due === '2026-10-31', 'Q3 marked sent: DES, Federal 941 and MO 941 left, Mark it sent');
ok(!R.dailyRoutine({ consumers: [], pipeline: [] }, now).find(s => s.n === 1).items.length, 'no quarterStatus handed in: no reports line');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
