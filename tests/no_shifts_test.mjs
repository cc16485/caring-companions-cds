// No worked shifts in 30 days (closure plan step 4, her rule 2026-10-22).
// Every name here is made up (this repo is public).
//   node tests/no_shifts_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/wellsky.js');
const W = globalThis.CDSWellSky;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

const sh = { from: '2026-09-01', consumers: [
  { name: 'Caldwell, Ruth', shifts: [{ date: '2026-10-20' }] },
  { name: 'Barnwell, Susan', shifts: [{ date: '2026-09-10' }, { date: '2026-09-05' }] },
  { name: 'Ames, Lou', shifts: [{ date: '2026-09-22' }] },
  { name: 'Hale, June', shifts: [{ date: '2026-10-25' }] }   // booked ahead, not worked
] };
const consumers = [
  { id: '1', name: 'Ruth Caldwell' }, { id: '2', name: 'Susan Barnwell' }, { id: '3', name: 'Pat Moss' },
  { id: '4', name: 'Lou Ames' }, { id: '5', name: 'June Hale' },
  { id: '6', name: 'Gone Person', status: 'Inactive' }, { id: '7', name: 'In Hospital', status: 'paused', ending: { kind: 'hospital' } },
  { id: '8', name: 'Leaving Now', status: 'closing', ending: { kind: 'asked' } }, { id: '9', name: 'Not Started', status: 'pending' },
  { id: String(Date.parse('2026-10-10T12:00:00-05:00')), name: 'Brand New' }
];
const r = W.noShifts(sh, '2026-10-22', consumers);
const ids = r.people.map(p => p.name);
ok(r.known && r.days === 30 && r.cutoff === '2026-09-22', 'known, 30 days, cutoff');
ok(!ids.includes('Ruth Caldwell'), 'a shift 2 days ago is fine');
ok(ids.includes('Susan Barnwell'), 'last shift Sep 10 is flagged');
ok(r.people.find(p => p.name === 'Susan Barnwell').last === '2026-09-10', 'uses the latest worked shift');
ok(r.people.find(p => p.name === 'Susan Barnwell').days === 42, 'days since the last shift');
ok(ids.includes('Pat Moss') && r.people.find(p => p.name === 'Pat Moss').last === '', 'not in the report at all is flagged');
ok(!ids.includes('Lou Ames'), 'exactly 30 days ago is not yet flagged');
ok(ids.includes('June Hale'), 'a shift booked ahead does not count as worked');
ok(!ids.some(n => ['Gone Person', 'In Hospital', 'Leaving Now', 'Not Started'].includes(n)), 'inactive, paused, closing and pending are left out');
ok(!ids.includes('Brand New'), 'in the hub less than 30 days is left out');
ok(ids[0] === 'June Hale' || ids[0] === 'Pat Moss', 'longest gap (no shift on file) sorts first');
ok(!W.noShifts(null, '2026-10-22', consumers).known, 'no report, nothing flagged');
ok(W.noShifts(sh, '2026-10-22', consumers, 60).people.length < r.people.length, 'the days setting changes the list');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
