// Ending or pausing services (2026-10-22): the reasons, the required steps and
// the 10-day appeal date. Only DSDS closes a CDS case (19 CSR 15-8.400(6)(B), (7)(B)).
//   node tests/ending_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

ok(R.ENDING_REASONS.every(r => R.ENDING_GROUPS.some(g => g.id === r.group)), 'every reason is in a group');
ok(new Set(R.ENDING_REASONS.map(r => r.id)).size === R.ENDING_REASONS.length, 'reason ids are unique');
ok(R.ENDING_REASONS.every(r => r.cite), 'every reason names its rule');
ok(R.ENDING_REASONS.filter(r => !r.pause).every(r => r.steps.some(s => s.k === 'file')), 'every closure keeps proof on file');
ok(R.ENDING_REASONS.filter(r => r.group === 'pause').every(r => r.steps.some(s => s.k === 'letter') && r.steps.some(s => s.k === 'dsds')),
   'every pause reason needs the DSDS form and the written notice (7)(B)');
ok(R.endingReason('noAttendant').steps.some(s => s.k === 'offers' && s.need), 'no attendant: offers of help required');
ok(R.endingReason('asked').steps.some(s => s.k === 'confirm' && s.need), 'consumer asked: DSDS confirm required');
ok(R.endingReason('hospital').pause, 'hospital is a pause, not a closure');
ok(!R.endingReason('nope'), 'unknown reason is null');

const e = { kind: 'death', steps: {} };
ok(R.endingMissing(e).length === 4, 'death: date of death plus three steps missing');
e.eventDate = '2026-10-20';
['learned', 'dsds', 'file'].forEach(k => { e.steps[k] = { date: '2026-10-22' }; });
ok(R.endingMissing(e).length === 0, 'death: nothing missing once dated');
ok(R.endingMissing({ kind: 'hospital', steps: {} }).length === 2, 'hospital: went-in date not required, two steps are');

ok(R.appealEnds('2026-10-22') === '2026-11-01', '10 days after the notice');
ok(R.appealEnds('2026-12-25') === '2027-01-04', 'across the year');
ok(R.appealEnds('') === '', 'no notice, no date');

// ── the written notice (step 3) ──
ok(R.ENDING_REASONS.filter(r => r.steps.some(s => s.k === 'letter')).every(r => r.letter), 'every reason that needs a letter has its wording');
ok(!R.endingReason('death').letter && !R.endingReason('hospital').letter, 'no letter for a death or a hospital stay');
const L = R.endingLetter({ name: 'Ruth Caldwell', dcn: '123', mailAddress: '1 Elm St\nOzark, MO' }, { kind: 'noAttendant', notes: ' offered help twice ' }, '2026-10-22');
ok(L.to === 'Ruth Caldwell\n1 Elm St\nOzark, MO', 'letter is addressed to the consumer with the saved address');
ok(L.dcn === '123' && L.date === '2026-10-22', 'DCN and date');
ok(L.facts === 'offered help twice', 'what happened comes from the notes');
ok(/Only DSDS can close/.test(L.next) && /866-835-3505/.test(L.next), 'says only DSDS closes, with the DSDS number');
ok(/15-8\.400\(7\)\(B\)/.test(L.cite), 'names the rule');
ok(R.endingLetter({ name: 'X' }, { kind: 'death' }, '2026-10-22') === null, 'no letter for a death');
ok(!Object.values(L).join(' ').includes('\u2014'), 'no em dashes in the letter');

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
