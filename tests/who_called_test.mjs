// Who called on the Leads page (her approved mockup 2026-10-22, artifact 9FKrkUhoS3cmbTyymKpaSj).
//   node tests/who_called_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const form = t => ({ type: 'lead', status: 'new', fromWebsite: true, siteLeadId: 's1', addedAt: '2026-10-22T15:00:00Z',
  notes: [{ date: '2026-10-22', text: t, fromForm: true }] });
const W = t => R.whoCalled(form(t));

// home page form
ok(W('Who needs care: Yes, I need the care\nMedicaid: Yes, active Medicaid') === 'self', 'home: I need the care');
ok(W('Who needs care: No, I am asking for a family member\nMedicaid: No') === 'family', 'home: family member');
ok(W('Who needs care: No, I want to be the paid caregiver\nMedicaid: Not sure') === 'unsure', 'home: paid caregiver, who for unknown');
// eligibility check (caringcds-apply)
ok(W('Who needs care: self\nThey said: person: has someone in mind') === 'self', 'check: self');
ok(W('Who needs care: family member\nMedicaid: no\nThey said: person: would be the caregiver') === 'pair', 'check: family + I would be the caregiver');
ok(W('Who needs care: family member\nThey said: person: needs a caregiver match') === 'family', 'check: family, needs a match');
ok(W('Who needs care: wants to be the caregiver\nThey said: person: has someone in mind') === 'pair', 'check: caregiver with someone in mind');
ok(W('Who needs care: wants to be the caregiver') === 'unsure', 'check: caregiver, nothing else');
// older check page
ok(W('Who needs care: Wants to be the paid caregiver\nThey said: Caregiver situation: Is the caregiver') === 'unsure', 'old check: paid caregiver alone stays unsure');
ok(W('Who needs care: Someone in my family\nThey said: Caregiver situation: Is the caregiver') === 'pair', 'old check: family + is the caregiver');
// contact form / typed in
ok(W('They said: topic: Something else') === 'unsure', 'contact form: not sure');
ok(R.whoCalled({ type: 'lead', notes: [] }) === 'unsure', 'typed in: not sure');
// the office's choice wins, solo only from the office
ok(R.whoCalled(Object.assign(form('Who needs care: Yes, I need the care'), { whoCalled: 'solo' })) === 'solo', 'office choice wins');
ok(!Object.values(['self','family','pair','unsure']).includes('solo'), 'solo never comes from a form');

// leadCard: off = exactly as before
const p = form('Who needs care: family member\nThey said: person: would be the caregiver');
const off = R.leadCard(p, [], '2026-10-22', false);
ok(off.whoCalled === '' && off.next === 'First call. Find out who needs care and if they have Medicaid.', 'switch off: unchanged');
const on = R.leadCard(p, [], '2026-10-22', false, { whoCalled: true });
ok(on.whoLabel === 'Caregiver with a consumer' && /consumer’s name, phone and Medicaid/.test(on.next), 'switch on: label and next step');
// referral / PCCP never get a label
ok(R.leadCard(Object.assign({}, p, { type: 'pccp' }), [], '2026-10-22', false, { whoCalled: true }).whoLabel === '', 'PCCP: no label');
// after the call, not sure still asks; solo always says pool
const called = Object.assign({}, form('They said: topic: Something else'), { notes: [{ date: '2026-10-22', text: 'They said: topic: Something else', fromForm: true }, { date: '2026-10-22', text: 'Left a message' }] });
ok(/Then tap who it was/.test(R.leadCard(called, [], '2026-10-22', false, { whoCalled: true }).next), 'called but still not sure: asks');
const solo = Object.assign({}, called, { whoCalled: 'solo' });
ok(/Caregiver Pool/.test(R.leadCard(solo, [], '2026-10-22', false, { whoCalled: true }).next), 'solo: move to pool');
// moved to the pool = closed, never waiting, no follow-up due
const pooled = Object.assign({}, p, { status: 'closed_pool', followup: '2026-10-20' });
ok(R.leadCard(pooled, [], '2026-10-22', false, { whoCalled: true }).step === 'closed', 'pool: closed');
ok(!R.leadWaiting(pooled, []) && !R.followDue(pooled, '2026-10-22'), 'pool: not waiting, no follow-up');
ok(R.CLOSED_LABELS.closed_pool === 'Moved to the Caregiver Pool', 'pool: label');

// the page: switch read from agency_data, off by default, labels only when on
const html = readFileSync(ROOT + '/index.html', 'utf8');
ok(/const ldWhoLive = \(\) => getObj\('leadsWhoCalled'\)\.live === true;/.test(html), 'page: off unless leadsWhoCalled.live is true');
ok(/'closed_pool'\]/.test(html), 'page: closed_pool is a closed status');
ok(/cds-rules\.js\?v=14/.test(html), 'page loads rules v=14');
ok(!/[—]/.test(Object.values(R.WHO_NEXT).join(' ') + Object.values(R.WHO_CALLED).join(' ')), 'no em dashes');

// 2026-10-22 fix (#58): this hub has no _user; the switch row read it and stopped the Leads cards drawing
ok(!/\b_user[.)]|!!_user/.test(html.slice(html.indexOf('const LD_WHO_OWNERS'), html.indexOf('function renderLdWho'))), 'who called reads the header email, not _user');
ok(/try \{ renderLdWho\(shown, wcOn\); \} catch/.test(html), 'the switch row can never stop the cards');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
