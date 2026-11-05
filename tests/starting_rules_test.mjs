// The Starting profile rules (2026-11-04): ME codes, managed care, Medicaid state, the seven steps,
// the Ready for first shift checklist, follow-ups, the message templates and their safeguards.
//   node tests/starting_rules_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/starting-rules.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const S = globalThis.CDSStarting, CR = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const d = (codes, mc, lock, status) => S.decide({ status: status || 'active', codes: S.normCodes(codes), managedCare: mc || 'no', lockIn: lock || 'none', name: 'Pat' });

// Every chart row is in the rules, once.
const codes = S.DEFAULT_RULES.codes.map(r => r.code);
ok(codes.length === 35 && new Set(codes).size === 35, '35 codes, no repeats');
ok(['02', '03', '04', '11', '12', '13', '83', '84', '86'].every(c => d(c).k === 'ok'), 'State Plan codes eligible');
ok(d('85').k === 'rev' && d('85', 'no', 'tw_paid').k === 'ok', '85 needs the premium paid');
ok(d('E2').k === 'ok' && d('E2', 'yes').k === 'ok', 'E2 eligible whatever the lock-in');
ok(d('13, E2').k === 'rev' && d('13, E2').sup, 'E2 with another code: review');
ok(d('05').k === 'rev' && d('05').sup, '05 without managed care shown: supervisor confirms');
ok(d('05', 'yes').label === 'Not eligible for CDS under current coverage', '05 with managed care shown');
ok(d('13', 'yes').label === 'Not eligible for CDS under current coverage', 'dual codes with managed care');
ok(d('13', 'unsure').k === 'rev', 'managed care unsure: review');
ok(['14', '15', '16'].every(c => d(c).label === 'Not eligible for standard in-home CDS under this ME category' && d(c).sup), 'decision A');
ok(['55', '82', '91'].every(c => d(c).label === 'Not eligible for CDS under this ME category'), 'State Plan No');
ok(['73', '74', '75'].every(c => d(c).label === 'Not eligible for CDS: CDS is for adults'), 'children');
ok(d('99').k === 'rev' && d('99').why.includes('not on the DHSS chart'), 'unknown code never guessed');
ok(d('13, 55').k === 'ok', 'dual codes, one eligible, no managed care');
ok(d('13', 'no', 'sd_not').k === 'rev' && d('13', 'no', 'sd_met').k === 'ok', 'spenddown');
ok(d('', 'no', 'none', 'nomed').label === 'No Medicaid yet' && d('', 'no', 'none', 'pending').k === 'pend', 'no Medicaid, pending');
ok(d('5').k === d('05').k, '5 reads as 05');
ok(S.DEFAULT_RULES.codes.every(r => d(r.code).k !== 'no' || d(r.code).sup), 'every no waits for a supervisor');
ok(d('13').fam.includes('Pat') && !/—/.test(JSON.stringify(S.FAM)), 'family words name them, no em dashes');

// Medicaid state: a family report is never verified (safeguard 1); application is not eligibility (5).
const chk = (over) => Object.assign({ at: '2026-11-04T15:00:00Z', by: 'zach', status: 'active', codes: ['13'], pdf: 'p.pdf', result: { k: 'ok', label: 'Eligible ME code' }, rulesVersion: '2026-11-04' }, over || {});
ok(S.medicaidState({ medicaid: { checks: [chk()] } }).verified, 'saved check with PDF verifies');
ok(!S.medicaidState({ medicaid: { checks: [chk({ pdf: '' })] } }).verified, 'no PDF, not verified');
let st = S.medicaidState({ medicaid: { checks: [chk()], familyReport: { at: '2026-11-05T10:00:00Z' } } });
ok(!st.verified && st.label === 'Family reports Medicaid approved. Verification needed', 'family report needs verification');
ok(S.medicaidState({ medicaid: { checks: [chk({ at: '2026-11-06T10:00:00Z' })], familyReport: { at: '2026-11-05T10:00:00Z' } } }).verified, 'a later check clears the report');
ok(S.medicaidState({ medicaid: { application: { stage: 'help' } } }).label === 'No Medicaid yet', 'application alone is not eligibility');
const revCheck = chk({ codes: ['05'], result: { k: 'rev', label: 'Needs review', sup: true } });
st = S.medicaidState({ medicaid: { checks: [revCheck] } });
ok(!st.verified && st.needsSupervisor, 'review waits on a supervisor');
ok(S.medicaidState({ medicaid: { checks: [revCheck], reviews: [{ checkAt: revCheck.at, action: 'approve' }] } }).verified, 'supervisor approval verifies');
ok(!S.medicaidState({ medicaid: { checks: [chk()], flags: [{ open: true }] } }).verified, 'open flag blocks');
ok(S.medicaidState({ medicaid: { checks: [chk()] } }, '2027-01-01').ruleChanged, 'rule change is noticed, not applied');

// Steps, Next step, side-by-side work, the gate.
const c0 = { status: 'starting', starting: { kind: 'new' } };
let s = S.startingSteps(c0, {});
ok(s.count === 1 && s.next.t === 'Medicaid verification' && s.steps[3].state === 'side' && s.steps[4].state === 'side', 'new: Medicaid first, paperwork and attendant side by side');
ok(s.also.length === 2, 'also-do-now list');
const c1 = { status: 'starting', starting: { kind: 'new' }, medicaid: { checks: [chk()] } };
s = S.startingSteps(c1, {});
ok(s.count === 2 && s.next.t === 'Send the DSDS referral', 'verified: send the referral');
s = S.startingSteps(c1, { auth: true, packet: { done: true }, attendant: { linked: true, ready: true } });
ok(s.next.t.startsWith('Finish the Ready') && !s.gateOk, 'gate waits for WellSky');
const c2 = Object.assign({}, c1, { firstShiftPrep: { authWellSky: { at: 1 }, tasksWellSky: { at: 1 } } });
s = S.startingSteps(c2, { auth: true, packet: { done: true }, attendant: { linked: true, ready: true } });
ok(s.gateOk && s.next.t === 'Mark ready for first shift', 'gate done');
s = S.startingSteps(Object.assign({}, c2, { starting: { kind: 'new', readyAt: '2026-11-20' } }), { auth: true, packet: { done: true }, attendant: { ready: true }, firstShift: '2026-11-24' });
ok(s.count === 7, 'all seven');
ok(S.startingSteps({ status: 'starting', starting: { kind: 'move' }, medicaid: { checks: [chk()] } }, {}).next.t.startsWith('Transfer'), 'transfer path');
ok(S.readyGate(c1, {}).find(g => g.k === 'auth').ok === false, 'authorization separate from Medicaid');

// Follow-ups go to the person's coordinator (safeguard 3).
const data = { consumers: [{ id: 'c', name: 'Pat Example', status: 'starting', coordinator: 'krystal', medicaid: { application: { stage: 'help' }, followup: { date: '2026-11-07' } } }],
               pipeline: [{ id: 'l', name: 'Lee Sample', medicaid: { followup: { date: '2026-11-10', owner: 'zach' } } }] };
let f = S.applicationFollowups(data, '2026-11-07');
ok(f.length === 1 && f[0].owner === 'krystal' && f[0].today, 'due today, owner from the coordinator');
f = S.applicationFollowups(data, '2026-11-12');
ok(f.length === 2 && f[1].owner === 'zach' && f[0].late, 'leads too, reassigned owner kept');

// Templates, identifiers, duplicates.
const vars = { caller: 'Linda', consumer: 'Pat', coordinator: 'Krystal', abd: true };
const text = S.fillTemplate(S.DEFAULT_TEMPLATES.text, vars), email = S.fillTemplate(S.DEFAULT_TEMPLATES.email, vars);
ok(text.includes('Hi Linda') && text.includes('855-373-9994') && text.includes('IM-1ABD') && !text.includes('{'), 'text filled');
ok(!S.fillTemplate(S.DEFAULT_TEMPLATES.text, Object.assign({}, vars, { abd: false })).includes('IM-1ABD'), 'form line only when it applies');
ok(email.includes('P.O. Box 2700') && email.includes('Thank you,\nKrystal') && !email.includes('[['), 'email filled');
ok(S.identifierProblems(text, { dcn: '12345678' }).length === 0 && S.identifierProblems(email, {}).length === 0, 'templates carry no identifiers');
ok(S.identifierProblems('Her DCN is 12345678', { dcn: '12345678' }).length >= 1, 'DCN stopped');
ok(S.identifierProblems('ME code 13 looks fine', {}).length === 1, 'ME code stopped');
ok(S.identifierProblems('She is not eligible because of managed care', {}).length === 1, 'eligibility details stopped');
ok(S.recentSends([{ at: '2026-11-02T00:00:00Z', status: 'sent' }, { at: '2026-10-01T00:00:00Z', status: 'sent' }, { at: '2026-11-03T00:00:00Z', status: 'failed' }], '2026-11-04T12:00:00Z').length === 1, 'recent sends');

// The active rule leaves Starting out.
ok(!CR.isActive({ status: 'starting' }) && CR.isActive({ status: 'active' }) && CR.isActive({ status: 'pending' }), 'isActive');
ok(S.isStarting({ status: 'Starting' }), 'isStarting');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
