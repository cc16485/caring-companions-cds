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

// One meaning of active (her ask 2026-10-22, for Zach): Today counts the same people as the Dashboard.
const A = R.activeNow(consumers, ws, W.nameKey);
ok(A.live && A.list.map(c => c.name).join() === 'Ruth Caldwell,Dale Pruitt', 'active now = in the hub, not inactive, and a WellSky shift in 31 days');
ok(R.activeNow(consumers, null, W.nameKey).list.length === 3, 'no WellSky report yet: everyone not marked inactive');
const auths = { records: {
  r: { consumer: 'Ruth Caldwell', planEnd: '2026-09-01' },     // expired, working now: counted
  o: { consumer: 'Old Hubonly', planEnd: '2026-09-01' } } };   // expired, not working: not counted
const steps = R.dailyRoutine({ consumers, pipeline: [], authorizations: auths, wsPeople: ws, nameKey: W.nameKey }, now);
const s2 = steps.find(s => s.n === 2).items.map(i => i.t), s3 = steps.find(s => s.n === 3).items.map(i => i.t);
ok(s2.includes('1 authorization expired'), 'expired authorizations: only consumers working now, got ' + s2);
ok(s2.includes('1 active consumer has no authorization on file'), 'no authorization: only consumers working now (Dale), got ' + s2);
ok(s3.some(t => t === '1 monthly check-in call not yet logged this month'), 'check-ins left match the Dashboard (Dale), got ' + s3);
ok(D.checkIns.left === 2 && D.consumers === 3, 'Dashboard still counts the WellSky-only person (Ann) in its total');
const old = R.dailyRoutine({ consumers, pipeline: [], authorizations: auths }, now);
ok(old.find(s => s.n === 2).items.some(i => i.t === '2 authorizations expired'), 'with no WellSky list handed in, the old count');

// WellSky check problems are system items (the hub shows them to the owner only).
const stale = { lastRun: { ok: false, why: 'Chrome was closed' }, shifts: { at: '2026-10-20T08:00:00' }, auths: { at: '2026-10-20T08:00:00' } };
const it = W.items(stale, {}, now)[0];
ok(it.system === true && it.since === '2026-10-20', 'a stopped check is a system item with the day it last ran');

// Names on every Today line (her ask 2026-10-22, for Zach): who, why, due date and the button that records it.
const calls = steps.find(s => s.n === 3).items.find(i => /check-in/.test(i.t)).people;
ok(calls.length === 1 && calls[0].name === 'Dale Pruitt' && calls[0].id === '2' && calls[0].act === 'call' && calls[0].due === '2026-10-31', 'check-in line names Dale, Log call, due Oct 31 ' + JSON.stringify(calls));
const exp = steps.find(s => s.n === 2).items.find(i => /expired/.test(i.t)).people;
ok(exp[0].name === 'Ruth Caldwell' && exp[0].id === '1' && exp[0].act === 'profile' && /ended Sep 1/.test(exp[0].why) && !exp[0].due, 'expired line names Ruth, opens her profile ' + JSON.stringify(exp));
const noA = steps.find(s => s.n === 2).items.find(i => /no authorization/.test(i.t)).people;
ok(noA[0].name === 'Dale Pruitt' && noA[0].act === 'profile', 'no authorization line names Dale');
const ein = R.dailyRoutine({ consumers: [{ id: '9', name: 'Eve Late', status: 'active', cdsStartDate: '2026-06-01' }], pipeline: [] }, now)
  .find(s => s.n === 1).items[0].people[0];
ok(ein.act === 'tax' && ein.due === '2026-08-30' && ein.id === '9', 'EIN line: tax setup button and the 90-day date ' + JSON.stringify(ein));
const emailText = (await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js')).morningEmail(steps, {}, now.getTime()).text;
ok(emailText.includes('      Dale Pruitt (monthly check-in call, due Oct 31)'), 'the 8am email names the same people with the due date');
ok(emailText.includes('      Ruth Caldwell (authorization ended Sep 1)'), 'and the expired authorization');

// Missed monthly calls in the last 12 months, on the Dashboard (2026-10-22): 2 or more, most first.
const MM = R.dashboardNumbers({ consumers: [
  { id: 'a', name: 'Ann Old', status: 'active', cdsStartDate: '2025-06-01', contacts: { '2026-09': {} } },
  { id: 'b', name: 'Ben New', status: 'active', cdsStartDate: '2026-09-01', contacts: {} },
  { id: 'c', name: 'Cal Good', status: 'active', cdsStartDate: '2026-07-01', contacts: { '2026-07': {}, '2026-08': {}, '2026-09': {} } }], now }).missedMonths;
ok(MM.length === 1 && MM[0].name === 'Ann Old' && MM[0].missed === 10 && MM[0].id === 'a', 'missed calls: only Ann (10), not Ben (1, new) or Cal (none) ' + JSON.stringify(MM));

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
