// Answers from recorded calls (2026-11-05, Samantha: "Mock up recorded calls filling the lead answers for the office to OK,
// then build it"; mockup W47w6qkzLLB3FF91iEJ8J1). The hub's starting/call-answers.js, with made-up people. node tests/call_answers_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
new Function(readFileSync(ROOT + '/starting/call-answers.js', 'utf8'))();
const A = globalThis.CallAnswers;
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const ans = { who: 'family', first: 'Ruth', last: 'Example', dob: '1945-03-14', county: 'greene', medicaid: 'yes', dcn: '12345687', cds: 'new', help: ['bathing', 'meals'], attendant: 'has', att_name: 'Carol Example', att_phone: '4175550123', att_relation: 'daughter' };
const lead = () => ({ id: 'l1', name: 'Caller: Carol', status: 'new', type: 'lead', county: 'Greene', dcn: '12345678', notes: [] });
const by = (rs, k) => rs.find(r => r.k === k) || {};
let rs = A.rows(lead(), ans, '2026-11-05');
ok(rs.map(r => r.k).join() === 'who,name,dob,county,medicaid,dcn,cds,help,attendant', 'one row per answer, in the first call order: ' + rs.map(r => r.k));
ok(by(rs, 'name').state === 'new' && by(rs, 'name').tick, 'a lead named "Caller: Carol" has no name yet: the call\'s name is new and ticked');
ok(by(rs, 'dob').value === 'Mar 14, 1945 (81)' && by(rs, 'dob').tick, 'date of birth with age, ticked');
ok(by(rs, 'county').state === 'same' && !by(rs, 'county').tick, 'county already on the lead (any case): not ticked');
ok(by(rs, 'dcn').state === 'differs' && !by(rs, 'dcn').tick && by(rs, 'dcn').current === '12345678', 'a different DCN is never ticked for them, and shows what the lead says');
ok(by(rs, 'attendant').value === 'Carol Example, daughter, (417) 555-0123', 'the attendant with how they are related and the phone');
ok(!rs.some(r => /—/.test(r.value + r.label)), 'no em dashes');
ok(A.rows(lead(), {}, '2026-11-05').length === 0 && A.rows(lead(), null, '2026-11-05').length === 0, 'nothing said, nothing shown');
// help adds to what the lead has
const l2 = Object.assign(lead(), { helpNeeded: ['bathing'] });
ok(by(A.rows(l2, ans, '2026-11-05'), 'help').state === 'adds' && by(A.rows(l2, ans, '2026-11-05'), 'help').tick, 'help the lead does not have yet adds to it');
ok(by(A.rows(Object.assign(lead(), { helpNeeded: ['bathing', 'meals'] }), ans, '2026-11-05'), 'help').state === 'same', 'the same help: nothing to add');
// apply
const p = lead();
const did = A.apply(p, ans, ['who', 'name', 'dob', 'medicaid', 'cds', 'help', 'attendant'], { id: 'c1', at: '2026-11-05T20:14:00Z', by: 'krystal' });
ok(did.join() === 'who,name,dob,medicaid,cds,help,attendant', 'only the ticked ones: ' + did);
ok(p.name === 'Ruth Example' && p.firstName === 'Ruth' && p.dob === '1945-03-14' && p.medicaidStatus === 'active' && p.dcn === '12345678' && p.whoCalled === 'family', 'written to the same fields the first call screen uses; the DCN untouched');
ok(p.cdsHistory === 'new' && p.type === 'lead', 'new to CDS is remembered without moving them to Referral');
ok(JSON.stringify(p.helpNeeded) === '["bathing","meals"]' && p.attendant.name === 'Carol Example' && p.attendant.phone === '(417) 555-0123' && p.attendant.relation === 'daughter' && p.caregiverPlan === 'has', 'help and attendant');
ok(p.fromCalls.dob.id === 'c1' && /^from the call Nov 5, /.test(A.fromLabel(p, 'dob')) && A.fromLabel(p, 'dcn') === '', 'each saved answer remembers its call');
ok(by(A.rows(p, ans, '2026-11-05'), 'dob').state === 'same' && by(A.rows(p, ans, '2026-11-05'), 'cds').state === 'same', 'after saving, the same call shows them as already on the lead');
const q = lead(); A.apply(q, { medicaid: 'applied', cds: 'move', agency: 'Old Co' }, ['medicaid', 'cds', 'agency'], { by: 'zach' });
ok(q.medicaidStatus === 'pending' && q.medicaid.application.stage === 'applied' && q.type === 'pccp' && q.leavingAgency === 'Old Co', 'applied for Medicaid starts the application follow up; moving makes them PCCP');
const r2 = lead(); r2.attendant = { name: 'carol example', phone: '(417) 555-0999', empeonInvited: '2026-11-01' };
A.apply(r2, { attendant: 'has', att_name: 'Carol Example' }, ['attendant'], {});
ok(r2.attendant.phone === '(417) 555-0999' && r2.attendant.empeonInvited === '2026-11-01', 'the same attendant keeps their phone and checklist');
console.log(pass + ' passed, ' + failN + ' failed'); process.exit(failN ? 1 : 0);
