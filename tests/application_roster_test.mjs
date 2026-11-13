// Attendants hired through the online application join the Roster (2026-11-13, her yes).
//   node tests/application_roster_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HP = await import(ROOT + '/caregiver-match/hub-packet.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

const now = new Date('2027-12-15T12:00:00');   // 13 months after hire
const wellsky = { analytics: { firstLast: { consumers: [{ name: 'Ruth Caldwell', attendant: 'Marcus Webb', last: '2027-12-14' }], attendants: [{ name: 'Marcus Webb', first: '2026-11-10' }] } } };
const packet = { pool_id: 'P1', name: 'Marcus Webb', active: true, consumer: 'Ruth Caldwell', step1_at: '2026-11-01T15:00:00Z', active_at: '2026-11-09T20:00:00Z' };
const g = { pool: { first: 'Marcus', last: 'Webb', phone: '4175550151', email: 'm@example.com' },
  screening: { screened: true, result_at: '2026-11-03T16:00:00Z', checks: [
    { key: 'edl', clear: true, at: '2026-11-02T15:00:00Z' }, { key: 'edr', clear: true, at: '2026-11-04T02:00:00Z' },   // 02:00Z Nov 4 is Nov 3 in Missouri
    { key: 'oig', clear: true, at: '2026-11-02' }, { key: 'mo_medicaid', clear: false, at: '2026-11-08T15:00:00Z' }] } };

// The plan: finished applications with no record, or a record not linked yet.
ok(HP.rosterPlan([packet], []).length === 1, 'finished application, nobody on the Roster: needs a record');
ok(HP.rosterPlan([{ ...packet, active: false }], []).length === 0, 'still onboarding: no record yet');
const row = HP.rosterRowFromPacket(packet, g, now);
ok(row.id === 'pool-P1' && row.poolId === 'P1' && row.status === 'active' && row.consumer === 'Ruth Caldwell' && row.phone === '4175550151' && row.addedFrom === 'Application', 'the record: id, consumer, phone, where it came from');
ok(row.fcsrDate === '2026-11-03' && row.edlDate === '2026-11-03' && row.leieDate === '2026-11-02' && row.hiredate === '2026-11-09', 'the record carries the hiring check dates (Missouri day, newest clear one)');
ok(HP.rosterPlan([packet], [row]).length === 0, 'second run: nothing to do');
ok(HP.checkDatesFromPacket({ screening: { screened: false, result_at: '2026-11-03T16:00:00Z', checks: [] } }).fcsrDate === '', 'FCSR not back clear: no date');

// A record somebody already made with the WellSky Add button: linked, blanks filled, nothing moved.
const added = { id: '17', name: 'Webb, Marcus', consumer: 'Ruth Caldwell', fcsrDate: '', edlDate: '2026-12-01', leieDate: '', phone: '', status: 'active' };
ok(HP.rosterPlan([packet], [added]).length === 1 && HP.rosterMatch([added], packet) === added, 'WellSky Add record with the same name: to be linked');
const patch = HP.rosterPatchFromPacket(added, packet, g);
ok(patch.poolId === 'P1' && patch.fcsrDate === '2026-11-03' && !('edlDate' in patch) && patch.leieDate === '2026-11-02' && patch.phone === '4175550151', 'link fills blanks only; the EDL date already typed stays');
ok(HP.rosterPlan([packet], [{ ...added, status: 'inactive' }]).length === 0, 'marked No longer working: left alone');
ok(HP.rosterMatch([{ id: '9', name: 'Marcus Webb', poolId: 'OTHER' }], packet) === null, 'same name linked to another application: not theirs');

// Working: one row per person, real dates.
const G = (packets, roster, ended = []) => HP.buildGroups({ packets, roster, ended, wellsky, now });
let w = G([packet], [row]).working;
ok(w.length === 1 && w[0].kind === 'roster' && /overdue/.test(w[0].label) && w[0].due === true, '13 months on: one Roster row, a recheck overdue (was "All checks good")');
w = G([packet], []).working;
ok(w.length === 1 && w[0].kind === 'packet' && w[0].label === 'Recheck dates not set up yet' && w[0].tone === 'y', 'record not made yet: says so, never "All checks good"');
w = G([packet], [{ ...added, ...patch }]).working;
ok(w.length === 1 && w[0].kind === 'roster', 'WellSky Add record linked: one row, not two');
// Finished, no shift yet: Onboarding only.
const quietWs = { analytics: { firstLast: { consumers: [{ name: 'Someone Else', attendant: 'Other Person', last: '2027-12-14' }], attendants: [] } } };
let q = HP.buildGroups({ packets: [packet], roster: [row], wellsky: quietWs, now });
ok(q.starting.length === 1 && q.starting[0].label === 'Waiting on first shift' && q.working.length === 0 && q.quiet.length === 0, 'finished, no shift yet: on Onboarding once, not also under Working or Inactive');
// No longer working: gone, and does not come back through the application.
const ended = [{ ...row, status: 'inactive', ended: { on: '2027-06-01', why: 'consumer', how: 'call', said: 'x', by: 'z@x' } }];
let e = G([packet], [], ended);
ok(e.working.length === 0 && e.starting.length === 0 && e.ended.length === 1, 'No longer working: not shown again from their application');
e = G([{ ...packet, active_at: '2027-09-01T15:00:00Z' }], [], ended);
ok(e.working.length === 1 && /Hired again/.test(e.working[0].label), 'finished a new application after being let go: shown, with what to do');
// A stranger on the old Roster is untouched.
w = G([packet], [row, { id: '5', name: 'Sam Helper', consumer: 'Morgan Active', fcsrDate: '2027-10-01', edlDate: '2027-11-01', leieDate: '2027-12-01' }]).working;
ok(w.length === 1 && w[0].name === 'Marcus Webb', 'old Roster attendant with no WellSky shifts stays where they were (Inactive tab)');

// Today: their rechecks are on the list now.
const lines = R.attendantWork({ tasks: [], applications: [packet], roster: [row], autoOig: {} }, now) || [];
ok(lines.some(i => (i.people || []).some(p => /Marcus Webb/.test(p.name))), 'Today lists their overdue recheck');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
