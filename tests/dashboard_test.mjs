// Dashboard numbers read live data (her "keep it and fix", 2026-10-22).
//   node tests/dashboard_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
await import(ROOT + '/supabase/functions/_shared/office/wellsky.js');
const R = globalThis.CDSRules, W = globalThis.CDSWellSky;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const now = new Date('2026-10-22T12:00:00');

const consumers = [
  { id: '1', name: 'Ruth Caldwell', status: 'active', hours: '20', contacts: { '2026-10': { by: 'comm center' } } },
  { id: '2', name: 'Dale Pruitt', status: 'active', hours: '10' },
  { id: '3', name: 'Old Hubonly', status: 'active', hours: '30' },       // no WellSky shift: not counted
  { id: '4', name: 'Gone Person', status: 'Inactive', hours: '30' },
];
const ws = [{ key: W.nameKey('Caldwell, Ruth'), name: 'Ruth Caldwell' }, { key: W.nameKey('Pruitt, Dale'), name: 'Dale Pruitt' },
            { key: W.nameKey('Newman, Ann'), name: 'Ann Newman' }];
const attendants = [
  { id: 'a1', name: 'A One', leieDate: '2026-10-10', fcsrDate: '2026-03-01' },   // current
  { id: 'a2', name: 'A Two', leieDate: '2026-08-01', fcsrDate: '2026-03-01' },   // OIG old, auto clear saves it
  { id: 'a3', name: 'A Three', leieDate: '', fcsrDate: '' },                       // never done
  { id: 'a4', name: 'A Four', status: 'inactive' },
];
const oigPeople = { 'attendant:a2': { result: 'clear', checked_at: '2026-10-20T08:00:00Z' } };

const D = R.dashboardNumbers({ consumers, attendants, now, wsPeople: ws, nameKey: W.nameKey, oigPeople,
  checks: { ops1: true, ops2: true, gone: true }, checklistIds: ['ops1', 'ops2', 'ops3'], checklistTotal: 3,
  hours: [{ authorized: 100 }, { authorized: 50 }], rates: { billing: 20, pay: 16 } });

ok(D.live && D.consumers === 3, 'consumers = WellSky people (3), not hub records');
ok(D.notInWellSky.length === 1 && D.notInWellSky[0] === 'Old Hubonly', 'hub-only active consumer listed, inactive one not');
ok(D.wellSkyOnly[0] === 'Ann Newman', 'WellSky person with no hub record noticed');
ok(D.checkIns.done === 1 && D.checkIns.of === 3 && D.checkIns.left === 2, 'check-ins against the live base, Comm Center log counts');
ok(D.attendants === 3, 'inactive attendant left out');
ok(D.leie.ok === 2 && D.leie.auto === 1, 'automatic OIG clear counts as current');
ok(D.fcsr.ok === 2, 'FCSR yearly');
ok(D.screeningsSoon === 1, 'only the never-screened attendant is due');
ok(D.checklist.done === 2 && D.checklist.of === 3, 'checklist uses real items, ignores stale keys');
ok(D.money.fromWellSky && D.money.hoursMonth === 150 && D.money.revenue === 3000 && D.money.labor === 2400 && D.money.pct === 20, 'money from WellSky authorized hours at $16 pay');

// No WellSky report yet: falls back to the hub list and hub hours
const F = R.dashboardNumbers({ consumers, attendants, now, rates: { billing: 20, pay: 16 } });
ok(!F.live && F.consumers === 3 && F.notInWellSky.length === 0, 'fallback: hub active list');
ok(!F.money.fromWellSky && Math.round(F.money.hoursMonth) === Math.round(60 * 4.33), 'fallback: hub weekly hours x 4.33');

// Practice OIG results (switch off) are never passed in: old manual date stays due
const P = R.dashboardNumbers({ consumers, attendants, now, wsPeople: ws, nameKey: W.nameKey, rates: { billing: 20, pay: 16 } });
ok(P.leie.ok === 1 && P.screeningsSoon === 2, 'without the automatic check, the old date counts as due');

// Pay is $15 to $16 depending on the attendant: margin is a range
const G = R.dashboardNumbers({ consumers, attendants, now, wsPeople: ws, nameKey: W.nameKey,
  hours: [{ authorized: 100 }], rates: { billing: 20, pay: 15 }, payRange: [15, 16] });
ok(G.money.range && G.money.range.low === 400 && G.money.range.high === 500, 'margin range at $16 (low) and $15 (high)');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
