// The start tracker (2026-11-17): one row per Starting consumer, steps in order, owner and due date, what we promised.
//   node tests/start_tracker_test.mjs     (made-up people only)
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/starting-rules.js');
await import(ROOT + '/supabase/functions/_shared/office/start-tracker.js');
const T = globalThis.CDSTracker;
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const today = '2026-11-17';
const verified = { checks: [{ at: '2026-11-02T10:00:00Z', status: 'active', pdf: 'x.pdf', result: { k: 'ok', label: 'Eligible' } }] };
const base = over => Object.assign({ id: 'C1', name: 'Pat Example', status: 'starting', coordinator: 'Krystal', medicaid: verified,
  starting: { kind: 'new', referralSent: '2026-11-01' } }, over || {});

// Nothing started: Medicaid first, packet and attendant can be done now; no start date, so no due dates.
let t = T.tracker(base({ medicaid: {} }), { today });
ok(t.cells.medicaid.state === 'now', 'medicaid now');
ok(t.cells.packet.state === 'now' && !t.cells.packet.due, 'packet now, no due without a start date');
ok(t.cells.checks.t === 'Find out who', 'no attendant: find out who');
ok(t.next.k === 'medicaid', 'next is medicaid');
ok(t.cells.start.t === 'Not yet', 'no start date');

// Referral sent, waiting on the state.
t = T.tracker(base(), { today });
ok(t.cells.referral.state === 'wait' && t.cells.referral.owner === 'State' && /16 days/.test(t.cells.referral.t), 'referral waiting 16 days: ' + t.cells.referral.t);

// Authorized with a start date 5 days out: due dates count back, late ones red, urgent.
const c2 = base({ cdsStartDate: '2026-11-22', starting: { kind: 'new', referralSent: '2026-11-01', attendantName: 'Lee Sample' } });
t = T.tracker(c2, { today, auth: true, packet: { status: 'Sent, waiting' }, att: null });
ok(t.cells.packet.state === 'wait' && t.cells.packet.due === '2026-11-12' && t.cells.packet.late, 'packet due 10 days before, late');
ok(t.cells.tax.due === '2026-11-15' && t.cells.tax.late, 'tax due 7 days before, late');
ok(t.cells.checks.t === 'Text Lee the application', 'attendant named, not in onboarding: ' + t.cells.checks.t);
ok(t.cells.clock.due === '2026-11-20' && !t.cells.clock.late, 'clock-in call 2 days before');
ok(t.cells.start.t === 'In 5 days', 'counts down');
ok(t.urgent, 'urgent within 7 days');
ok(t.next.late && t.next.k === 'tax' || t.next.k === 'checks', 'next is a late office step: ' + t.next.k);

// Attendant onboarding row matched by the typed name; Step 1 not signed waits on the attendant.
const rows = [{ name: 'Lee Sample', consumer: 'Pat Example', step1: false }];
ok(T.attendantFor(c2, rows) === rows[0], 'matched by typed name');
ok(T.attendantFor(base({ starting: {} }), rows) === rows[0], 'matched by consumer on the onboarding');
t = T.tracker(c2, { today, auth: true, att: rows[0] });
ok(t.cells.checks.state === 'wait' && t.cells.checks.owner === 'Attendant', 'step 1 waits on attendant');
t = T.tracker(c2, { today, auth: true, att: { name: 'Lee Sample', step1: true, checksClear: true, invite: true, empeon: true, i9: false } });
ok(t.cells.checks.state === 'done', 'checks clear');
ok(t.cells.empeon.state === 'now' && t.cells.empeon.note === 'I-9 Section 2 by 2026-11-25', 'I-9 by 3 business days after start: ' + t.cells.empeon.note);
t = T.tracker(c2, { today, auth: true, roster: { name: 'Lee Sample' } });
ok(t.cells.checks.state === 'done' && t.cells.empeon.state === 'done', 'roster attendant is done');

// Tax: forms sent count, like the Tax Setup chips.
const taxed = base({ ein: '11-1111111', moTaxId: '1', irs8821: true, filings: { 'IRS-2678': { sentAt: 'x' } }, mo2827: true, desRegistered: true, empeonUpdated: true });
ok(T.taxState(taxed).done, 'tax done');
ok(T.taxState(base()).missing.length === 7, 'all 7 tax parts missing');

// Promises: a late promise comes first; done ones go last.
const pc = base({ starting: { kind: 'new', referralSent: '2026-11-01', promises: [
  { id: 'a', what: 'Text the daughter her application', due: '2026-10-19' },
  { id: 'b', what: 'Call back Friday', due: '2026-11-21' },
  { id: 'c', what: 'Email the forms', due: '2026-11-01', done: { at: 'x', by: 'Sam' } }] } });
t = T.tracker(pc, { today });
ok(t.openPromises === 2 && t.latePromises === 1, 'promise counts');
ok(t.next.k === 'promise' && /Text the daughter/.test(t.next.t), 'late promise is next');
ok(t.promises[2].id === 'c', 'done promise last');
const dl = T.dueList(c2, { today, auth: true });
ok(dl.length >= 3 && dl.every(x => x.owner === 'Krystal') && dl[0].due <= dl[dl.length - 1].due, 'due list sorted, office owner only');

// Clock-in call recorded.
t = T.tracker(base({ cdsStartDate: '2026-11-22', starting: { clockCall: { at: 'x', by: 'Sam', questions: 'Which app?' } } }), { today });
ok(t.cells.clock.state === 'done' && /questions/.test(t.cells.clock.t), 'clock-in call done');

// No em dashes in anything a person reads.
ok(!/[—–]/.test(JSON.stringify(T.tracker(c2, { today, auth: true }))), 'no em dashes');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
