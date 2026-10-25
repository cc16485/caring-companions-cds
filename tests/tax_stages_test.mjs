// Tax Setup in stages (2026-10-25, her switch 'taxStages'). Pure rules only.
//   node tests/tax_stages_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
import { readFileSync } from 'fs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(ROOT + '/tax/tax-stages.js', 'utf8'), ctx);
const S = ctx.CDSTaxStages;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const TODAY = '2026-10-25';
const sent = (d, extra) => Object.assign({ sentAt: d }, extra || {});

// Michael Gasper as he is in the hub today: signed and split, no EIN.
const mg = { name: 'Michael Gasper', packetSent: '2025-09-25', packetSigned: '2026-08-04', packetForms: [{ file: 'IRS-SS-4' }] };
let n = S.next(mg, TODAY);
eq([n.id, n.card, n.wait, n.what], ['ein', 2, false, 'Apply for Michael\'s federal EIN'], 'Michael: apply for the EIN');
ok(/signed 08\/04\/2026, 82 days ago, with no EIN yet/.test(n.why), 'says how long it has sat: ' + n.why);
ok(/Answer the question above first/.test(n.why), 'kind not answered yet: asks it');
eq(S.packetFlag(mg), 'Sent 09/25/2025 is about 10 months before it was signed. Typo for 2026?', 'packet date typo check');
eq(S.packetFlag({ packetSent: '2026-08-01', packetSigned: '2026-08-04' }), '', 'normal dates: no flag');
eq(S.packetFlag({ packetSent: '2026-08-09', packetSigned: '2026-08-04' }), 'The sent date is after the signed date. Typo?', 'sent after signed');

// Transferring: the existing-EIN call comes before applying.
const tr = Object.assign({}, mg, { taxKind: 'transfer' });
eq(S.next(tr, TODAY).id, 'check', 'transfer: check for an existing EIN first');
eq(S.steps(tr).map(s => s.chip).length, 13, 'transfer has the EIN check chip');
eq(S.steps(mg).map(s => s.chip), ['Packet signed', 'Split', 'EIN', '8821', '2678', '2643A', '2827', 'MO Tax ID', 'In Fusion', 'Proof uploaded', 'Empeon', 'DES'], 'new: chips in stage order');
eq(S.next(Object.assign({}, tr, { einCheck: 'none' }), TODAY).id, 'ein', 'none found: apply');

// Walk it forward.
let c = Object.assign({}, mg, { taxKind: 'new', ein: '12-1234567' });
ok(S.stageOpen(c, S.STAGES[1]), 'the EIN opens the second stage');
ok(!S.stageOpen(mg, S.STAGES[1]), 'no EIN: second stage not yet');
eq(S.next(c, TODAY).id, 'f8821', '8821 next');
c.filings = { 'IRS-8821': sent('2026-10-20') };
eq(S.next(c, TODAY).id, 'f2678', 'then mail the 2678');
c.irs2678 = true;
c.filings['MO-2643A'] = sent('2026-10-21'); c.filings['MO-2827'] = sent('2026-10-21');
n = S.next(c, TODAY);
eq([n.id, n.wait], ['motaxid', true], 'waiting on the MO Tax ID');
ok(/Registered 10\/21\/2026\. .* If nothing by 10\/28\/2026, call \(573\) 751-5860/.test(n.why), 'chase date a week after: ' + n.why);
c.moTaxId = '12345678';
ok(S.stageOpen(c, S.STAGES[3]), 'both numbers open Fusion');
eq(S.next(c, TODAY).id, 'fusion', 'numbers into Fusion');
c.fusionEntered = true; c.proofUploaded = '2026-10-25';
eq(S.next(c, TODAY).id, 'empeon', 'then Empeon');
c.empeonUpdated = '2026-10-25';
n = S.next(c, TODAY);
eq([n.what, n.wait], ['Waiting on the IRS to approve the 2678', true], 'then waiting on the 2678 approval');
c.filings['IRS-2678'] = { docPath: 'x/approval.pdf' };
eq([S.next(c, TODAY).what, S.next(c, TODAY).wait], ['All set until the first $1,000 quarter', true], 'then nothing until the $1,000 quarter');
c.desRegistered = true;
eq(S.next(c, TODAY).what, 'Michael\'s tax setup is complete', 'complete');

// The 90-day Fusion clock.
eq(S.clock(mg, TODAY), { tone: 'idle', text: 'Add the CDS start date to start the 90-day Fusion clock' }, 'no start date');
eq(S.clock({ cdsStartDate: '2026-08-18' }, TODAY).text, 'Fusion proof due 11/16/2026 · 22 days left', 'amber zone text');
eq(S.clock({ cdsStartDate: '2026-08-18' }, TODAY).tone, 'warn', '30 days or less: amber');
eq(S.clock({ cdsStartDate: '2026-08-01' }, TODAY).tone, 'bad', '10 days or less: red');
eq(S.clock({ cdsStartDate: '2026-07-01' }, TODAY).text, 'Fusion proof 26 days overdue (due 09/29/2026)', 'overdue');
eq(S.clock({ cdsStartDate: '2026-10-01' }, TODAY).tone, 'ok', 'plenty of time: green');
eq(S.clock({ cdsStartDate: '2026-07-01', priorVendorProof: true }, TODAY).text, 'Fusion proof done', 'prior vendor proof counts as done');

// No em dashes anywhere a person reads.
ok(!/—/.test(readFileSync(ROOT + '/tax/tax-stages.js', 'utf8')), 'no em dashes');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
