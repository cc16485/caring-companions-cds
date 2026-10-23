// Build step 5 (2026-10-23): owners on Today, checklist cycles, yearly agency dates.
//   node tests/owners_cycles_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const now = new Date('2026-10-23T12:00:00');   // a Friday

// Owners: her call, the state and the money are hers, the rest Zach's; Settings can change one.
const steps = R.dailyRoutine({ consumers: [], pipeline: [], firstShiftOf: () => null, attendantWork: { tasks: [], roster: [] } }, now);
const own = Object.fromEntries(steps.map(s => [s.k, s.owner]));
ok(own.state === 'samantha@mo-care.com' && own.money === 'samantha@mo-care.com', 'state and money: Samantha');
ok(['files', 'calls', 'firstshift', 'attendants'].every(k => own[k] === 'zach@caringcds.com'), 'the rest: Zach');
const changed = R.dailyRoutine({ consumers: [], pipeline: [], owners: { money: 'zach@caringcds.com' } }, now);
ok(changed.find(s => s.k === 'money').owner === 'zach@caringcds.com', 'Settings hands the money to Zach');

// Checklist cycles: a tick counts only for its own period; a dateless old tick does not count for a recurring box.
ok(R.periodEnd('week', '2026-10-23') === '2026-10-24' && R.periodEnd('month', '2026-10-23') === '2026-10-31' &&
   R.periodEnd('quarter', '2026-10-23') === '2026-12-31' && R.periodEnd('quarter', '2026-02-10') === '2026-03-31' && R.periodEnd('year', '2026-10-23') === '2026-12-31', 'period ends');
ok(R.checkCurrent('audit1', { at: '2026-10-19' }, now) && !R.checkCurrent('audit1', { at: '2026-10-17' }, now), 'weekly: Monday counts this week, last Saturday does not');
ok(R.checkCurrent('audit2', { at: '2026-10-01' }, now) && !R.checkCurrent('audit2', { at: '2026-09-30' }, now), 'quarterly: resets Oct 1');
ok(!R.checkCurrent('audit1', true, now) && R.checkCurrent('ops1', true, now), 'old dateless tick: not for a recurring box, still for a one-time box');
ok(!R.CHECK_CYCLES.hipaa2 && !R.CHECK_CYCLES.emg1, 'HIPAA training and the disaster plan are yearly agency dates, not boxes');
const due = R.checklistDue({ audit2: { at: '2026-10-02' } }, now)[0];
ok(due && due.people.map(p => p.key).join() === 'audit1' && due.people[0].due === '2026-10-24', 'Today: this week\'s EVV review, due Saturday; quarter audits not yet (69 days left)');
const dec = R.checklistDue({}, new Date('2026-12-10T12:00:00'))[0].people.map(p => p.key);
ok(['audit1', 'audit2', 'audit3', 'emg3', 'staff4'].every(k => dec.includes(k)) && !dec.includes('audit4') && !dec.includes('fin3'), 'December: weekly, quarterly and yearly boxes; per-consumer contacts and reports stay off');
const D = R.dashboardNumbers({ checks: { audit1: { at: '2026-10-19' }, audit2: true, ops1: true }, checklistTotal: 67, now });
ok(D.checklist.done === 2, 'Dashboard counts current ticks only (audit1 this week, ops1 one-time; audit2 has no date)');

// Yearly agency dates.
const none = R.agencyDatesDue({}, now);
ok(none.length === 1 && /Add the yearly agency dates/.test(none[0].t) && !none[0].bad, 'none typed in: one reminder to add them');
const ad = R.agencyDatesDue({ license: { due: '2026-11-10' }, insurance: { due: '2027-03-01' }, policy: { due: '2026-10-01' },
                              training: { due: '2026-11-01', done: '2026-10-20' } }, now);
const line = ad.find(x => /coming up/.test(x.t));
ok(line && line.bad && line.people.map(p => p.key).join() === 'license,policy', 'license (18 days) and policy (late); insurance far off; training done');
ok(line.people.every(p => p.act === 'agencydate'), 'each has a Done button');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
