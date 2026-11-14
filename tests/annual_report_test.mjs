// Annual Service Report helper (2026-11-13). The rules behind Money > Start annual report.
//   node tests/annual_report_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/annual/annual-report.js');
const A = globalThis.CDSAnnual;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

ok(A.reportYear(new Date('2027-01-15T12:00:00')) === 2026 && A.reportYear(new Date('2027-03-31T12:00:00')) === 2026, 'January to March: the report is about last year');
ok(A.reportYear(new Date('2026-11-13T12:00:00')) === 2026 && A.reportYear(new Date('2027-04-01T12:00:00')) === 2027, 'April on: this year');
ok(A.dueDate(2026) === '2027-01-30', 'due Jan 30 of the next year');

const q = A.quartersSent({ q1: 'submitted', q1_for: '2026-04-30', q2: 'submitted', q2_for: '2025-07-31', q3: 'pending', q4: 'submitted', q4_for: '2027-01-31' }, 2026);
ok(q.map(x => x.sent).join() === 'true,false,false,true', 'a quarter counts only when marked sent for THAT year\'s due date');
ok(q.map(x => x.due).join() === '2026-04-30,2026-07-31,2026-10-31,2027-01-31', 'the four due dates');
ok(A.quartersSent({}, 2026).every(x => !x.sent) && A.quartersSent(null, 2026).length === 4, 'nothing marked: none sent, no crash');

const people = ['Ruth Caldwell', 'Webb, Marcus', 'Li'];
let f = A.privacyFlags('Ruth can now stay in her own home. Marcus helps every day.', people);
ok(f.names.join() === 'Ruth,Marcus' && !f.dcn, 'first names of our consumers and attendants are caught');
f = A.privacyFlags('One participant, DCN 12345678, went home from rehab sooner.', people);
ok(f.dcn && !f.names.length, 'an 8-digit number is flagged as a possible DCN');
f = A.privacyFlags('A participant in Webster County could stay home after a fall because her attendant was already trained on her care plan.', people);
ok(!f.names.length && !f.dcn, 'a clean example passes (a county is not a name)');
ok(!A.privacyFlags('We webbed the plans together and ruthlessly cut waits.', people).names.length, 'a name inside another word, or uncapitalised, is not flagged');
ok(!A.privacyFlags('', people).names.length && !A.privacyFlags('Li was happy', ['Li']).names.length, 'empty text is fine; two-letter names are skipped to avoid false alarms');

ok(A.anyClients([{ name: 'x', cdsStartDate: '2025-06-01', status: 'active' }], {}, 2026) === true, 'a consumer who started earlier and is not Starting: yes');
ok(A.anyClients([{ name: 'x', cdsStartDate: '2027-02-01', status: 'active' }], {}, 2026) === false, 'started after the year: no');
ok(A.anyClients([{ name: 'x', cdsStartDate: '2026-12-01', status: 'starting' }], {}, 2026) === false, 'still Starting: not yet a client');
ok(A.anyClients([], { a: { planStart: '2026-03-01', planEnd: '2026-09-30' } }, 2026) === true && A.anyClients([], { a: { planStart: '2025-01-01', planEnd: '2025-12-31' } }, 2026) === false, 'an authorization that touches the year: yes; one that ended before it: no');

const facts = A.yearFacts([{ cdsStartDate: '2026-02-01', contacts: { '2026-03': { date: '2026-03-04' }, '2025-12': { date: '2025-12-02' }, '2026-04': null }, homeVisits: [{ date: '2026-05-01' }, { date: '2025-05-01' }] }], 2026);
ok(facts.calls === 1 && facts.visits === 1 && facts.started === 1, 'our own counts for the year: calls, visits, starts');

import fs from 'fs';
const src = fs.readFileSync(ROOT + '/annual/annual-report.js', 'utf8');
ok(!/[—–]/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'no dashes in anything a person reads');
ok(/Legal Name of CDS Vendor/.test(src) && /National Provider Identifier \(NPI\)/.test(src) && /Printed Name of Authorized Signer/.test(src) && /Title of Authorized Signer/.test(src), 'the labels are MMAC\'s own');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
