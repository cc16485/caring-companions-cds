// The Attendants page (2026-10-22, her yes to the plan): three groups, the onboarding track,
// WellSky on each card, Roster check dates. Pure functions only.
//   node tests/attendants_page_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = await import(ROOT + '/caregiver-match/hub-packet.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

const NOW = new Date('2026-10-22T15:00:00');   // a Thursday

// ---------- names ----------
eq(H.nameKey('Pham, Nuong'), H.nameKey('Nuong Pham'), '"Last, First" and "First Last" are the same person');
eq(H.nameKey("O'Neal, Mary J."), H.nameKey('Mary ONeal'), 'apostrophes and initials do not matter');

// ---------- WellSky ----------
const wellsky = {
  shifts: { at: '2026-10-20T06:59:44Z', from: '2026-09-01', to: '2026-10-31', consumers: [
    { name: 'Barnwell, Susan', shifts: [{ attendant: 'Smith, Anita', date: '2026-09-30', hours: 8 }, { attendant: 'Smith, Anita', date: '2026-10-02', hours: 8.5 },
      { attendant: 'Smith, Anita', date: '2026-10-19', hours: 6.25 }, { attendant: 'Smith, Anita', date: '2026-10-30', hours: 9 }] },
    { name: 'Bell, Pamela', shifts: [{ attendant: 'Wiggins, Andrew', date: '2026-09-05', hours: 4 }] } ] },
  analytics: { firstLast: { at: '2026-10-22T12:23:52Z', consumers: [
    { name: 'Barnwell, Susan', attendant: 'Smith, Anita', first: '2025-06-24', last: '2026-10-21' },
    { name: 'Reed, Shasta', attendant: 'Wise, Jeana', first: '2025-01-02', last: '2026-10-19' },
    { name: 'Goddard, Tracy', attendant: null, last: '2026-10-17' } ],
    attendants: [{ name: 'Smith, Anita', first: '2025-06-24', consumers: ['Barnwell, Susan'] }, { name: 'Future, Fay', first: '2027-01-01', consumers: [] }] } } };
const W = H.wellskyByAttendant(wellsky, NOW);
const anita = W.by[H.nameKey('Anita Smith')];
eq(anita.last, '2026-10-21', 'the daily email is newer than the schedule, so its last date counts');
eq(anita.hours, 14.75, 'hours this month: October shifts only, never a future one');
eq(anita.consumers, ['Susan Barnwell'], 'works for, shown "First Last"');
eq(W.by[H.nameKey('Jeana Wise')].last, '2026-10-19', 'someone only in the daily email still counts');
eq(anita.first, '2025-06-24', 'first day of work: their first care log in WellSky');
eq(W.by[H.nameKey('Jeana Wise')].first, '', 'no first day when the email does not list them');
eq(W.by[H.nameKey('Fay Future')] ? W.by[H.nameKey('Fay Future')].first : '', '', 'a date in the future is never a first day');
eq(W.have, true, 'WellSky data is there');
eq(W.asOf, '2026-10-22T12:23:52Z', 'as of the newest report');
eq(H.wellskyByAttendant(null, NOW).have, false, 'no WellSky data at all');

// ---------- Roster rechecks ----------
eq(H.rosterDue({ edlDate: '', fcsrDate: '' }, '2026-10-22', NOW).label, 'Add EDL and FCSR dates', 'dates never typed in: add them (not overdue)');
eq(H.rosterDue({ edlDate: '', fcsrDate: '' }, '2026-10-22', NOW).tone, 'y', 'a missing date is yellow, not red');
eq(H.rosterDue({}, null, NOW).label, 'Add OIG and EDL and FCSR dates', 'no automatic OIG yet either');
eq(H.rosterDue({ edlDate: '2026-05-01', fcsrDate: '2026-03-01' }, '2026-10-22', NOW).label, 'EDL overdue', 'EDL every 3 months');
eq(H.rosterDue({ edlDate: '2026-07-26', fcsrDate: '2026-03-01' }, '2026-10-22', NOW).label, 'EDL due Oct 26', 'due within a week');
const good = H.rosterDue({ edlDate: '2026-10-01', fcsrDate: '2026-03-01' }, '2026-10-22', NOW);
eq([good.label, good.tone, good.rows[0].auto], ['All checks good', 'g', true], 'all good, OIG ran by itself');

// ---------- the track ----------
const steps = done => ['step1', 'orientation', 'checks', 'papers', 'empeon_invite', 'empeon', 'call', 'i9', 'countersign'].map(k => ({ key: k, done: done.includes(k) }));
eq(H.trackOf(steps(['step1']), false).at, 1, 'Step 1 signed: now on Checks');
eq(H.trackOf(steps(['step1', 'checks']), false).at, 3, 'orientation can wait: Papers is where they are');
eq(H.trackOf(steps(['step1', 'checks', 'papers', 'empeon_invite']), false).at, 4, 'Empeon needs the invite and their part');
eq(H.trackOf(steps(['step1', 'checks', 'papers', 'empeon_invite', 'empeon', 'call', 'i9', 'countersign']), false).at, 6, 'orientation and first shift left: the first shift is where they are');
eq(H.trackOf(steps(['step1', 'checks', 'papers', 'empeon_invite', 'empeon', 'call', 'i9', 'countersign']), true).at, 2, 'only orientation left');
eq(H.trackOf(steps(['step1', 'orientation', 'checks', 'papers', 'empeon_invite', 'empeon', 'call', 'i9', 'countersign']), false).at, 6, 'all done: waiting on the first shift');
eq(H.trackOf(steps(['step1', 'orientation', 'checks', 'papers', 'empeon_invite', 'empeon', 'call', 'i9', 'countersign']), true).at, 7, 'first shift: done');
eq(H.TRACK.length, 7, '7 steps');

eq(H.weekdaysSince('2026-10-20T15:00:00', NOW), 2, 'Tue to Thu is 2 weekdays');
eq(H.weekdaysSince('2026-10-16T15:00:00', NOW), 4, 'Fri to Thu skips the weekend');

// ---------- the groups ----------
const roster = [
  { id: 'r1', name: 'Anita Smith', wellskyName: 'Smith, Anita', consumer: 'Susan Barnwell', edlDate: '', fcsrDate: '' },
  { id: 'r2', name: 'Andrew Wiggins', consumer: 'Pamela Bell', edlDate: '2026-10-01', fcsrDate: '2026-03-01' },
  { id: 'r3', name: 'Kiersten Ackerman', consumer: 'Crystal Dodd', edlDate: '2026-05-01', fcsrDate: '2026-03-01' } ];
const packets = [
  { pool_id: 'p1', name: 'Dana Whitfield', consumer: 'Mary Harper', consumer_waiting: true, active: false, label: 'Run EDL and FCSR', tone: 'r', next: 'Run the checks.',
    step1_at: '2026-10-19T14:00:00Z', updated_at: '2026-10-19T14:00:00Z', steps: steps(['step1']) },
  { pool_id: 'p2', name: 'Corey Banks', consumer: '', consumer_waiting: false, active: false, label: 'Finishing onboarding', tone: 'b', next: '',
    step1_at: '2026-10-01T14:00:00Z', updated_at: '2026-10-05T14:00:00Z', steps: steps(['step1', 'checks', 'papers']) },
  { pool_id: 'p3', name: 'Jeana Wise', consumer: 'Shasta Reed', active: true, label: 'Active', tone: 'g', step1_at: '2026-09-01T14:00:00Z' },
  { pool_id: 'p4', name: 'Lee Park', consumer: 'Earl Simmons', active: true, label: 'Active', tone: 'g', step1_at: '2026-10-10T14:00:00Z', updated_at: '2026-10-20T14:00:00Z' } ];
const G = H.buildGroups({ packets, roster, autoOig: id => id === 'r3' ? null : '2026-10-22', wellsky, now: NOW });
eq(G.starting.map(r => r.name), ['Dana Whitfield', 'Corey Banks', 'Lee Park'], 'Getting started: consumer waiting first, then oldest, then ready ones');
eq(G.starting[0].flag, { tone: 'r', text: 'No change in 3 weekdays' }, 'consumer waiting and stuck 2+ weekdays: red');
eq(G.starting[1].flag, { tone: 'y', text: 'Quiet 17 days' }, 'no consumer, quiet 10+ days: yellow');
eq([G.starting[2].label, G.starting[2].track, G.starting[2].flag], ['Waiting on first shift', null, null], 'active in the packet but no WellSky shift yet: still Getting started');
eq(G.working.map(r => r.name), ['Anita Smith', 'Jeana Wise'], 'Working: a WellSky shift in the last 31 days (dates to add sort before all good)');
eq(G.working[0].meta, 'Works for Susan Barnwell · 14.75 hrs this month · last shift yesterday', 'the card says who, how much, how recent');
eq(G.working[1].kind, 'packet', 'a packet attendant with a shift counts as Working');
eq(G.quiet.map(r => [r.name, r.label]), [['Andrew Wiggins', 'Last shift Sep 5'], ['Kiersten Ackerman', 'No WellSky shifts']], 'Not working lately: newest last shift first');
eq(G.tiles, { starting: 3, working: 2, due: 1, dates: 2, quiet: 2 }, 'the tiles (a missing date counts even when another check is overdue)');
const E = H.buildGroups({ packets: [], roster: [], ended: [{ id: 'x1', name: 'Faith Long', consumer: 'Michael Gasper', status: 'inactive' }, { id: 'x2', name: 'Anita Smith', wellskyName: 'Smith, Anita', status: 'inactive' }], wellsky, now: NOW });
eq(E.ended.map(r => [r.name, r.meta]), [['Anita Smith', 'No record of how the consumer told us · last shift Oct 21'], ['Faith Long', 'No record of how the consumer told us · was with Michael Gasper']], 'No longer working: listed for the Inactive tab, with last shift when WellSky has one');
const none = H.buildGroups({ packets: [], roster, autoOig: () => null, wellsky: null, now: NOW });
eq([none.working.length, none.quiet.length], [3, 0], 'no WellSky data: nobody is called not working');

// ---------- ending an attendant: the consumer's decision on record (her rule 2026-10-22) ----------
const endIn = { why: 'consumer', how: 'call', on: '2026-10-22', said: 'Mary called and said she does not want Jo working for her anymore.', by: 'samantha@mo-care.com' };
eq(H.endRecord({ ...endIn, why: '' }, NOW).error, 'Pick why they are no longer working.', 'why is required');
eq(H.endRecord({ ...endIn, how: '' }, NOW).error, 'Pick how the consumer told us.', 'how the consumer told us is required');
eq(H.endRecord({ ...endIn, on: '2026-10-30' }, NOW).error, 'Pick the date the consumer told us (not in the future).', 'no future date');
eq(H.endRecord({ ...endIn, said: 'ok' }, NOW).error, 'Write what the consumer said, or paste their text or email.', 'their words are required');
const rec = H.endRecord(endIn, NOW).record;
eq([rec.why, rec.how, rec.on, rec.by], ['consumer', 'call', '2026-10-22', 'samantha@mo-care.com'], 'saved with who recorded it');
eq(H.endWords(rec), 'Ended Oct 22: the consumer ended it (phone call), recorded by samantha', 'how it reads on the Inactive tab');
const E2 = H.buildGroups({ packets: [], roster: [], ended: [{ id: 'x3', name: 'Jo Ray', consumer: 'Mary Lee', status: 'inactive', ended: rec }, { id: 'x4', name: 'Old Person', status: 'inactive' }], wellsky: null, now: NOW });
eq(E2.ended.map(r => r.meta), ['Ended Oct 22: the consumer ended it (phone call), recorded by samantha · was with Mary Lee', 'No record of how the consumer told us'], 'the record shows; an old one without a record says so');
eq(E2.ended[0].said, endIn.said, 'their words show too');

// ---------- words ----------
const src = readFileSync(ROOT + '/caregiver-match/hub-packet.js', 'utf8');
ok(!/—/.test(src), 'no em dashes in the page');
ok(!/Applying \(/.test(src), 'the old Active / Applying tabs are gone');
ok(/data-tab="\$\{k\}"/.test(src) && /'Onboarding'/.test(src) && /'Inactive'/.test(src), 'Onboarding / Working / Inactive tabs');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
