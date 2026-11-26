// The state's calls on the CDS line (2026-11-26): calls from numbers we do not know are read once; the state with a
// start date becomes a start_date item (said by: state) on the right person; anything else from the state is a
// "needs you" item; no match goes to Katlin's to-do and Samantha's My Week; known people's calls are left to the
// Coordinator; failures are retried at most 3 times. node tests/state_calls_test.mjs
import { createStateCalls, cleanState, matchName, stateRequest } from '../supabase/functions/_shared/office/state-calls.js';

const NOW = Date.parse('2026-12-01T16:00:00Z');   // Tuesday 10 AM Missouri
const consumers = [
  { id: 'C1', name: 'Joe Madeup', status: 'starting', phone: '4175550133', county: 'Christian' },
  { id: 'C2', name: 'Ruth Ann Example', status: 'starting', phone: '4175550144' },
  { id: 'C3', name: 'Joe Madeup', status: 'active', phone: '4175550155' } ];
const pipeline = [{ id: 'L1', name: 'Harold Sample', phone: '4175550166' }];
const at = (min) => new Date(NOW - min * 60e3).toISOString();
const calls = [
  { id: 'm1', at: at(60), phone10: '5735550100', contact_name: 'DHSS', transcript: 'STATE START Joe Madeup start date is December 8' },
  { id: 'm2', at: at(50), phone10: '4175550144', contact_name: 'Ruth', transcript: 'FAMILY a call from Ruth herself about her hours, nothing about the state at all here' },
  { id: 'm3', at: at(40), phone10: '5735550101', contact_name: '', transcript: 'STATE AUTH Ruth Example authorization update, the units are changing next month for her' },
  { id: 'm4', at: at(30), phone10: '5735550102', contact_name: '', transcript: 'STATE START Mary Nobody start date December 9, we do not have her in the hub at all' },
  { id: 'm5', at: at(25), phone10: '8005550199', contact_name: 'Sales', transcript: 'SALES a vendor selling copiers and paper to the office, not a state call at all here' },
  { id: 'm6', at: at(5), phone10: '5735550100', contact_name: 'DHSS', transcript: 'STATE START too new, only 5 minutes old, should wait for the transcript to finish' },
  { id: 'm7', at: at(45), phone10: '5735550103', contact_name: '', transcript: 'FAIL this one makes the reader fail every time it is read by the coordinator' } ];
const answers = {
  'STATE START Joe': { from_state: true, caller: 'Pam, DSDS', consumer_name: 'Joe Madeup', start_date: '2026-12-08', topic: 'start_date', summary: 'DSDS gave a start date of December 8 for Joe Madeup.' },
  FAMILY: { from_state: false, caller: '', consumer_name: '', start_date: '', topic: 'not_state', summary: '' },
  'STATE AUTH': { from_state: true, caller: 'HCBS', consumer_name: 'Ruth Example', start_date: '', topic: 'authorization', summary: 'The authorization units change next month.' },
  'STATE START Mary': { from_state: true, caller: 'DSDS', consumer_name: 'Mary Nobody', start_date: '2026-12-09', topic: 'start_date', summary: 'Start date December 9 for Mary Nobody.' },
  SALES: { from_state: false, caller: '', consumer_name: '', start_date: '', topic: 'not_state', summary: '' } };
const T = { seen: new Map(), items: [], book: [{ phone10: '4175550144', kind: 'consumer' }], todo: new Map(), cal: new Map(), asked: [] };
const db = { query: async (t, p = []) => {
  const s = t.replace(/\s+/g, ' ').trim(); const rows = (r) => ({ rows: r });
  if (/^select data_value from agency_data/.test(s)) return rows([{ data_value: p[0] === 'consumers' ? consumers : pipeline }]);
  if (/^select phone10, kind from cds_phone_book where kind in/.test(s)) return rows(T.book.filter((b) => b.kind !== 'state'));
  if (/^select phone10 from cds_phone_book where kind = 'state'/.test(s)) return rows(T.book.filter((b) => b.kind === 'state'));
  if (/^select c\.id, c\.at, c\.phone10/.test(s)) return rows(calls.filter((c) => c.at > p[0] && c.at < p[1]));
  if (/^select source_id from cds_coord_seen/.test(s)) return rows([...T.seen.values()].filter((x) => x.ok || x.tries >= 3));
  if (/^insert into cds_coord_seen/.test(s)) { const cur = T.seen.get(p[0]); if (/ok = true/.test(s) || /values \(\$1, now\(\), true/.test(s)) T.seen.set(p[0], { source_id: p[0], ok: true, tries: 1, note: p[1], person_ref: p[2], summary: p[3] }); else T.seen.set(p[0], { source_id: p[0], ok: false, tries: cur ? cur.tries + 1 : 1, note: p[1] }); return rows([]); }
  if (/^insert into cds_phone_book/.test(s)) { T.book.push({ phone10: p[0], ref: p[1], kind: 'state', name: p[2] }); return rows([]); }
  if (/^insert into cds_coord_items/.test(s)) { if (T.items.some((i) => i.key === p[0])) return rows([]); T.items.push({ key: p[0], person_kind: p[1], person_id: p[2], person_name: p[3], kind: p[4], data: JSON.parse(p[5]), source: JSON.parse(p[6]), status: p[7], due: p[8] }); return rows([{ id: T.items.length }]); }
  if (/^insert into cds_todo/.test(s)) { T.todo.set(p[0], JSON.parse(p[1])); return rows([]); }
  if (/^insert into owner_calendar/.test(s)) { T.cal.set(p[0], JSON.parse(p[1])); return rows([]); }
  throw new Error('unexpected sql ' + s);
} };
const ai = async (req) => {
  const tr = req.messages[0].content; T.asked.push(tr.match(/<transcript>\n(\w+)/)[1]);
  if (/FAIL/.test(tr)) throw new Error('Claude 529');
  const k = Object.keys(answers).find((a) => tr.includes(a));
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answers[k]) }] };
};
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', '·', n, c ? '' : JSON.stringify(d ?? '').slice(0, 700)); };
const S = createStateCalls({ db, ai, model: 'claude-opus-5-5', nowMs: () => NOW });

let r = await S.run();
ok('reads calls from numbers it does not know, not from a known consumer, not the 5-minute-old one', r.looked === 5 && !T.asked.includes('FAMILY') && T.asked.filter((x) => x === 'STATE').length === 3, [r, T.asked]);
const start = T.items.find((i) => i.kind === 'start_date');
ok('the state with a start date: a start_date item, said by the state, on the STARTING Joe (not the active one)', start && start.person_id === 'C1' && start.data.date === '2026-12-08' && start.data.saidBy === 'state' && start.status === 'suggested' && /Pam, DSDS/.test(start.source.who), start);
ok('...it is never put on the profile by itself (only a suggestion)', start.status === 'suggested');
const auth = T.items.find((i) => i.kind === 'concern');
ok('the state about an authorization: a needs-you item on Ruth (matched by first and last name)', auth && auth.person_id === 'C2' && /authorization/.test(auth.data.text), auth);
ok('no match: Katlin\'s to-do and Samantha\'s My Week, with the name the state gave', [...T.todo.values()].some((x) => /Mary Nobody: start date 2026-12-09\. No match in the hub/.test(x.t) && x.who === 'katlin@mo-care.com') && [...T.cal.values()].some((x) => /Mary Nobody/.test(x.t)), [...T.todo.values()]);
ok('a sales call is read and left alone', !T.items.some((i) => /copier/i.test(JSON.stringify(i))) && T.seen.get('state:m5').ok && /not the state/.test(T.seen.get('state:m5').note));
ok('the state\'s numbers are remembered', T.book.filter((b) => b.kind === 'state').map((b) => b.phone10).sort().join() === '5735550100,5735550101,5735550102');
ok('a reading that fails is tried again next time', T.seen.get('state:m7').ok === false && T.seen.get('state:m7').tries === 1 && r.failed === 1);
T.asked = [];
r = await S.run();
ok('the next run reads only the one that failed', r.looked === 1 && T.asked.join() === 'FAIL', [r, T.asked]);
await S.run();
r = await S.run();
ok('...and gives up after 3 tries', r.looked === 0 && T.seen.get('state:m7').tries === 3, T.seen.get('state:m7'));
ok('the same start date is never two items', T.items.filter((i) => i.kind === 'start_date').length === 1);

// pure parts
ok('matchName: two people with the same full name in one group is no match (never guess)', matchName('Joe Madeup', [{ id: 1, name: 'Joe Madeup', status: 'starting' }, { id: 2, name: 'Joe Madeup', status: 'starting' }], []) === null);
ok('matchName: Starting first, then other consumers, then leads', matchName('Joe Madeup', consumers, pipeline).id === 'C1' && matchName('Harold Sample', consumers, pipeline).kind === 'lead');
ok('cleanState: a bad date is dropped, em dashes become commas', (() => { const x = cleanState({ content: [{ type: 'text', text: JSON.stringify({ from_state: true, caller: 'A — B', consumer_name: 'X Y', start_date: 'next Monday', topic: 'start_date', summary: 'S' }) }] }); return x.date === '' && x.caller === 'A , B'; })());
ok('cleanState: not_state wins over from_state', cleanState({ content: [{ type: 'text', text: JSON.stringify({ from_state: true, caller: '', consumer_name: '', start_date: '', topic: 'not_state', summary: '' }) }] }).fromState === false);
ok('the request gives Claude the call date for words like "next Monday"', /Call date \(Missouri\): 2026-12-01/.test(stateRequest({ transcript: 'x' }, 'm', '2026-12-01').messages[0].content));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
