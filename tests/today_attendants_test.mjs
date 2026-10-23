// Attendants on Today and in the 8am email (her ask 2026-10-22, build step 3 of the hub audit).
//   node tests/today_attendants_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;
const HP = await import(ROOT + '/caregiver-match/hub-packet.js');
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const now = new Date('2026-10-22T12:00:00');

const tasks = [
  { id: 't1', kind: 'packet_checks', title: 'Consumer waiting: Run EDL and FCSR for Amy Ash (Step 1 signed, for Ruth Caldwell).', due_at: '2026-10-22T21:00:00Z', pool_id: 'p1', caregiver: 'Amy' },
  { id: 't2', kind: 'packet_empeon', title: 'Checks clear: send the Empeon invite to Bo Birch (Copy for Empeon).', due_at: '2026-10-23T21:00:00Z', pool_id: 'p2', caregiver: 'Bo' },
  { id: 't3', kind: 'oig_check', title: 'OIG possible match: Cy Cole. Decide on the OIG card.', due_at: '2026-10-22T14:00:00Z', caregiver: '' },
  { id: 't4', kind: 'cg_signup', title: 'Call new sign-up', due_at: '2026-10-23T21:00:00Z' },       // Directory work: not here
  { id: 't5', kind: 'packet_call', title: 'done already', done_at: '2026-10-21', pool_id: 'p9' } ];
const applications = [
  { pool_id: 'p1', name: 'Amy Ash', label: 'Run EDL and FCSR', next: 'Run the checks', consumer_waiting: true },       // has a to-do: not twice
  { pool_id: 'p3', name: 'Di Dunn', label: 'Finish in Empeon', next: 'Complete I-9 Section 2 in Empeon.', consumer_waiting: true },
  { pool_id: 'p4', name: 'Ed East', label: 'Filling out Step 1', next: 'Nothing to do.' },                               // theirs, not ours
  { pool_id: 'p5', name: 'Fay Fox', label: 'Active', active: true } ];
const roster = [
  { id: 'r1', name: 'Gil Gray', leieDate: '2026-10-10', edlDate: '2026-09-01', fcsrDate: '2025-10-01' },   // FCSR overdue
  { id: 'r2', name: 'Hal Hunt', leieDate: '2026-09-25', edlDate: '2026-09-01', fcsrDate: '2026-03-01' },   // OIG due Oct 25 (soon)
  { id: 'r3', name: 'Ida Ivy', leieDate: '2026-09-01', edlDate: '2026-09-01', fcsrDate: '2026-03-01' },    // OIG overdue, but auto cleared Oct 11
  { id: 'r4', name: 'Jo Jay', leieDate: '2026-10-10', edlDate: '', fcsrDate: '2026-03-01' } ];             // EDL date missing
const autoOig = { r3: '2026-10-11' };

const items = R.attendantWork({ tasks, applications, roster, autoOig }, now);
const line = re => items.find(i => re.test(i.t));
const oig = line(/OIG possible/);
ok(oig && oig.bad && oig.people.length === 1 && oig.people[0].act === 'oig' && oig.people[0].due === '2026-10-22', 'OIG possible match: red, same day, opens the OIG card');
const st = line(/office steps/);
ok(st && st.bad && st.people.length === 2 && st.people[0].name === 'Amy' && st.people[0].act === 'task' && st.people[0].id === 't1', 'office steps: the consumer-waiting one first, with a Done button (task id)');
ok(!items.some(i => (i.people || []).some(p => /sign-up/.test(p.why))), 'Directory sign-ups stay out of this step');
const ours = line(/waiting on the office/);
ok(ours && ours.bad && ours.people.length === 1 && ours.people[0].name === 'Di Dunn' && /I-9/.test(ours.people[0].why), 'waiting on us with no to-do: Di (I-9), not Amy twice, not Ed (theirs)');
const late = line(/overdue/), soon = line(/next 7 days/), miss = line(/not on file/);
ok(late && late.people.map(p => p.name).join() === 'Gil Gray' && late.people[0].why === 'FCSR overdue' && late.people[0].due === '2026-10-01', 'FCSR overdue: Gil, due Oct 1');
ok(soon && soon.people.map(p => p.name).join() === 'Hal Hunt' && soon.people[0].due === '2026-10-25', 'OIG due Oct 25: Hal');
ok(!late.people.some(p => p.name === 'Ida Ivy') && !soon.people.some(p => p.name === 'Ida Ivy'), 'the automatic OIG clear counts (Ida is current)');
ok(miss && miss.people[0].name === 'Jo Jay' && /EDL date/.test(miss.people[0].why) && !miss.bad, 'a missing date is a records gap, not red');

// Same answer as the Active Attendants page for every Roster attendant.
for (const a of roster) {
  const page = HP.rosterDue(a, autoOig[a.id] || null, now), mine = R.attendantChecks(a, autoOig[a.id] || null, now);
  for (const r of page.rows) { const m = mine.find(x => x.k === r.k);
    ok(m.due === (r.due || '') && m.missing === r.missing && m.late === (r.tone === 'r'), a.name + ' ' + r.k + ': same as the Attendants page'); }
}

// Wired into Today's routine only when handed in; the old steps stay as they were.
const without = R.dailyRoutine({ consumers: [], pipeline: [] }, now);
ok(!without.some(s => s.title === 'Attendants'), 'no attendant data handed in: no Attendants step');
const withW = R.dailyRoutine({ consumers: [], pipeline: [], attendantWork: { tasks, roster, autoOig } }, now);
const A = withW.find(s => s.title === 'Attendants');
ok(A && A.n === withW.length && A.items.length === 5, 'Attendants step after the others (no applications in the email: 5 lines)');
const empty = R.dailyRoutine({ consumers: [], pipeline: [], attendantWork: { tasks: [], roster: [] } }, now).find(s => s.title === 'Attendants');
ok(empty && !empty.items.length && /Nothing is waiting/.test(empty.clear), 'a clear Attendants step says so');
const mail = LA.morningEmail(withW, {}, now.getTime()).text;
ok(mail.includes('Attendants') && mail.includes('      Gil Gray (FCSR overdue, late, was due Oct 1)'), 'the 8am email names them with the due date');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
