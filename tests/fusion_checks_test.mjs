// When the next Fusion check is due (2026-11-26): day 7 after the referral or PCCP, then every 3 days, the day after a
// "cannot reach" note, before a close-out date, after the assessment; never once authorized or closed. node tests/fusion_checks_test.mjs
import { fusionDue } from '../supabase/functions/_shared/office/fusion-checks.js';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', '·', n, c ? '' : JSON.stringify(d ?? '')); };
const ref = { starting: { referralSent: '2026-11-16' } }, pccp = { starting: { kind: 'move', transferEntered: '2026-11-20' } };
ok('no referral yet: nothing to check', fusionDue({ starting: {} }, false, null, '2026-11-26') === null);
ok('authorized: nothing to check', fusionDue(ref, true, null, '2026-11-26') === null);
let d = fusionDue(ref, false, null, '2026-11-20');
ok('the first check is 7 days after the referral', d.due === '2026-11-23' && !d.late && d.days_since === 4 && d.kind === 'Referral', d);
d = fusionDue(pccp, false, null, '2026-11-27');
ok('a PCCP / transfer too, and due today on day 7', d.due === '2026-11-27' && d.today && d.kind === 'PCCP / transfer', d);
d = fusionDue(ref, false, { day: '2026-11-23', result: 'nothing_new' }, '2026-11-24');
ok('nothing new: every 3 days after', d.due === '2026-11-26' && d.last_checked === '2026-11-23', d);
d = fusionDue(ref, false, { day: '2026-11-23', result: 'nothing_new' }, '2026-11-24', 2);
ok('...every N days when the setting says so', d.due === '2026-11-25');
d = fusionDue(ref, false, { day: '2026-11-23', result: 'state_cant_reach', close_by: '2026-12-03' }, '2026-11-23');
ok('the state cannot reach them: check again tomorrow', d.due === '2026-11-24' && d.close_by === '2026-12-03', d);
d = fusionDue(ref, false, { day: '2026-11-30', result: 'nothing_new', close_by: '2026-12-01' }, '2026-11-30');
ok('a close-out date tomorrow: check today', d.due === '2026-11-30', d);
d = fusionDue(ref, false, { day: '2026-11-23', result: 'assessment_set', assessment: '2026-12-02' }, '2026-11-24');
ok('assessment set: check the day after it', d.due === '2026-12-03', d);
ok('closed by the state or authorized in Fusion: Samantha has it, no more checks', fusionDue(ref, false, { day: '2026-11-23', result: 'closed_by_state' }, '2026-11-24') === null && fusionDue(ref, false, { day: '2026-11-23', result: 'authorized' }, '2026-11-24') === null);
d = fusionDue(ref, false, null, '2026-11-30');
ok('never checked and past day 7: late', d.late && d.last_checked === '', d);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
