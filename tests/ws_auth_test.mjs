// WellSky Active authorizations (2026-10-22): an Active WellSky personal care authorization
// stops the hub calling a consumer expired or missing; the hub's dates are never changed.
// Every name here is made up (this repo is public).
//   node tests/ws_auth_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/wellsky.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const W = globalThis.CDSWellSky, R = globalThis.CDSRules;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const now = new Date('2026-10-22T12:00:00');

ok(W.labelEnd('Ruth Caldwell PC - CDS 4/01/2026-2/28/2027') === '2027-02-28', 'last date in the label');
ok(W.labelEnd('Pat Moss - 7/1/2026-4/40/2027 Authorized CDS Hours') === '', 'a typo date is not a date');
ok(W.labelEnd('Lou Ames CDS Authorized Hours') === '', 'no date in the label');

const check = {
  auths: { at: '2026-10-20T07:00:00Z', consumers: [
    { name: 'Caldwell, Ruth', auths: [
      { label: 'Ruth Caldwell CDS ILW - Case Management 4/01/2026-2/28/2027', service: 'DSDS - ILW Case Management', status: 'Active', perMonth: 1 },
      { label: 'Ruth Caldwell PC - CDS 4/01/2026-2/28/2027', service: 'DSDS - CDS Personal Care', status: 'Active', perMonth: 147.5 } ] },
    { name: 'Ended, Ed', auths: [{ label: 'Ed Ended PC', service: 'DSDS - CDS Personal Care', status: 'Inactive', perMonth: 10 }] } ] },
  analytics: { authLogs: { at: '2026-10-22T12:00:00Z', shifts: [{ consumer: 'Ames, Lou', auth: 'Lou Ames CDS Authorized Hours' }] } }
};
const m = W.wsActiveAuths(check, now);
ok(m[W.nameKey('Ruth Caldwell')] && m[W.nameKey('Ruth Caldwell')].end === '2027-02-28' && m[W.nameKey('Ruth Caldwell')].perMonth === 147.5, 'personal care, not case management');
ok(!m[W.nameKey('Ed Ended')], 'an inactive authorization does not count');
ok(m[W.nameKey('Lou Ames')] && m[W.nameKey('Lou Ames')].from === 'carelogs', 'a shift this week under an authorization counts');
ok(Object.keys(W.wsActiveAuths(check, new Date('2026-11-15T12:00:00'))).length === 0, 'reports older than 7 days are ignored');

const ws = m[W.nameKey('Ruth Caldwell')];
ok(W.authView({ planEnd: '2027-01-31' }, ws, now).state === 'ok', 'hub current: ok');
ok(W.authView({ planEnd: '2026-03-31' }, ws, now).state === 'wellsky', 'hub old, WellSky active');
ok(W.authView({ planEnd: '2026-03-31' }, ws, now).differs, 'dates differ');
ok(W.authView({ planEnd: '2026-03-31' }, null, now).state === 'expired', 'hub old, nothing in WellSky: expired');
ok(W.authView(null, null, now).state === 'none', 'nothing anywhere');

// the morning list
const consumers = [{ id: '1', name: 'Ruth Caldwell', status: 'active' }, { id: '2', name: 'Lou Ames', status: 'active' }, { id: '3', name: 'Ed Ended', status: 'active' }, { id: '4', name: 'Pat Moss', status: 'active' }];
const authorizations = { records: { a: { consumer: 'Ruth Caldwell', planStart: '2025-04-01', planEnd: '2026-03-31', months: [] }, b: { consumer: 'Ed Ended', planStart: '2025-01-01', planEnd: '2026-01-31', months: [] } } };
const step2 = data => R.dailyRoutine(Object.assign({ consumers, pipeline: [], authorizations }, data), now).find(s => s.n === 2);
const lines = step2({ wsAuth: n => m[W.nameKey(n)] || null }).items.map(i => i.t);
ok(lines.some(t => /^1 authorization expired/.test(t)), 'only Ed is expired');
ok(lines.some(t => /^1 active consumer has no authorization on file/.test(t)), 'only Pat has nothing anywhere');
ok(lines.some(t => /^2 care plans to upload/.test(t)), 'Ruth (old) and Lou (none in the hub) need the care plan uploaded');
const old = step2({}).items.map(i => i.t);
ok(old.some(t => /^2 authorizations expired/.test(t)) && !old.some(t => /to upload/.test(t)), 'without wsAuth (the email) nothing changes');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
