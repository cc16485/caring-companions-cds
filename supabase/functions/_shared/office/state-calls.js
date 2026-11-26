// The state's calls on the CDS line (2026-11-26, Samantha: "the state calls 417-234-8494 to give the date now" ... "I will
// change our number with them so you can catch it in calls"). Runs inside cds-coordinator, every 15 minutes.
//
// The Coordinator reads calls from numbers it knows (consumers, families, attendants, leads). A call from the state
// (DSDS, HCBS, DHSS, MO HealthNet) comes from a number it does not know, so it was never read. This reads answered
// CDS-line calls with a transcript from numbers that are NOT a known consumer, family, attendant or lead (unknown
// numbers, and numbers the office marked as the state), asks Claude whether the caller is the state calling about one
// of our people, and if so:
//   a start date   -> a start_date item on that person (said by: state), which sets off the start-date alert to Samantha
//                     and Katlin and shows "Use it" on the Starting profile. It is never put on the profile by itself.
//   anything else  -> a "needs you" item on that person (My Week today), e.g. an authorization or a question
//   no match       -> a one-time item on Katlin's to-do and Samantha's My Week, with the name the state gave
// Each call is read once (cds_coord_seen 'state:<id>'). Nothing is texted or sent to anyone outside the office.
// db.query(text, params) -> { rows }; ai(request) -> Claude Messages API answer.
import { watchList } from './coordinator.js';

export const STATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['from_state', 'caller', 'consumer_name', 'start_date', 'topic', 'summary'],
  properties: {
    from_state: { type: 'boolean' },
    caller: { type: 'string' },
    consumer_name: { type: 'string' },
    start_date: { type: 'string' },
    topic: { type: 'string', enum: ['start_date', 'authorization', 'assessment', 'referral', 'other', 'not_state'] },
    summary: { type: 'string' },
  },
};
const SYSTEM = [
  'You read one answered phone call on the office line of Caring Companions CDS, a Missouri Consumer Directed Services vendor.',
  'Decide if the caller is from the State of Missouri about one of our consumers: DSDS, HCBS, the Department of Health and Senior Services, MO HealthNet, Family Support, or a state case manager or assessor.',
  'If they are: who called (name and office, as said), the consumer\'s full name as said, the start date they gave as YYYY-MM-DD (empty if none), the topic, and a two sentence summary in plain words.',
  'A start date is the day CDS services may begin for that consumer. Work out a date like "next Monday" from the call date. If the year is not said, use the next such date on or after the call date.',
  'If the caller is not from the state (a family, a caregiver, a sales call, our own staff), set from_state false, topic not_state, and leave the rest empty.',
  'Never use em dashes. Plain words only. Do not mention the transcript or yourself.',
].join(' ');
export function stateRequest(call, model, day) {
  return { model, max_tokens: 1200, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: STATE_SCHEMA } },
    system: SYSTEM, messages: [{ role: 'user', content: 'Call date (Missouri): ' + day + '. Caller ID name: ' + (call.who || 'unknown') + '.\n<transcript>\n' + String(call.transcript || '').slice(0, 30000) + '\n</transcript>' }] };
}
const noDash = (s) => String(s || '').replace(/—/g, ', ').replace(/\s+/g, ' ').trim();
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));
export function cleanState(resp) {
  if (!resp) return { error: 'no answer' };
  if (resp.stop_reason === 'refusal') return { error: 'declined' };
  const text = (resp.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  let j; try { j = JSON.parse(text); } catch { return { error: 'could not be read' }; }
  return { fromState: j.from_state === true && j.topic !== 'not_state', caller: noDash(j.caller).slice(0, 120), name: noDash(j.consumer_name).slice(0, 80),
    date: isDay(j.start_date) ? j.start_date : '', topic: ['start_date', 'authorization', 'assessment', 'referral', 'other'].includes(j.topic) ? j.topic : 'other',
    summary: noDash(j.summary).slice(0, 500) };
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
/* the person the state named: full name first, then first + last name, among Starting consumers, then other
   consumers, then open leads. Two or more equally good matches = no match (never guess). */
export function matchName(name, consumers, pipeline) {
  const n = norm(name); if (!n) return null;
  const w = n.split(' '), fl = w.length > 1 ? w[0] + ' ' + w[w.length - 1] : '';
  const pools = [
    (consumers || []).filter((c) => c && String(c.status || '').toLowerCase() === 'starting').map((c) => ({ kind: 'consumer', x: c })),
    (consumers || []).filter((c) => c && String(c.status || '').toLowerCase() !== 'starting').map((c) => ({ kind: 'consumer', x: c })),
    (pipeline || []).filter((p) => p && !p.movedToConsumers).map((p) => ({ kind: 'lead', x: p })),
  ];
  for (const pool of pools) {
    for (const test of [(m) => norm(m.x.name) === n, (m) => fl && (() => { const v = norm(m.x.name).split(' '); return v.length > 1 && v[0] + ' ' + v[v.length - 1] === fl; })()]) {
      const hits = pool.filter(test);
      if (hits.length === 1) return { kind: hits[0].kind, id: String(hits[0].x.id), name: hits[0].x.name || '', start: hits[0].x.cdsStartDate || '' };
      if (hits.length > 1) return null;
    }
  }
  return null;
}

export function createStateCalls({ db, ai, model, nowMs = () => Date.now() }) {
  const q = async (t, p = []) => (await db.query(t, p)).rows;
  const one = async (t, p = []) => (await q(t, p))[0] || null;
  const data = async (k) => { const r = await one("select data_value from agency_data where agency_id = 'caring-companions-cds' and data_key = $1", [k]); return (r && r.data_value) || []; };
  const day = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  async function run({ perRun = 6, days = 3 } = {}) {
    const consumers = await data('consumers'), pipeline = await data('pipeline');
    const known = new Set();
    watchList(consumers, pipeline, []).forEach((p) => p.phones.forEach((ph) => known.add(ph)));
    (await q("select phone10, kind from cds_phone_book where kind in ('lead','consumer','family','attendant','pool','staff','ignore')")).forEach((r) => known.add(r.phone10));
    const stateNums = new Set((await q("select phone10 from cds_phone_book where kind = 'state'")).map((r) => r.phone10));
    const since = new Date(nowMs() - days * 864e5).toISOString(), cutoff = new Date(nowMs() - 20 * 60e3).toISOString();
    const rows = await q(`select c.id, c.at, c.phone10, c.contact_name, n.transcript from cds_comms c join cds_call_notes n on n.comm_id = c.id
      where c.channel = 'call' and c.at > $1 and c.at < $2 and n.transcript is not null and length(n.transcript) > 80 order by c.at`, [since, cutoff]);
    const seen = new Set((await q("select source_id from cds_coord_seen where source_id like 'state:%' and (ok or tries >= 3)")).map((r) => r.source_id));
    const todo = rows.filter((r) => !seen.has('state:' + r.id) && (stateNums.has(r.phone10) || !known.has(r.phone10))).slice(0, perRun);
    let read = 0, state = 0, starts = 0, unmatched = 0, failed = 0;
    for (const r of todo) {
      const sid = 'state:' + r.id, at = new Date(r.at).toISOString(), callDay = day(Date.parse(at));
      let x;
      try { x = cleanState(await ai(stateRequest({ who: r.contact_name, transcript: r.transcript }, model, callDay))); } catch (e) { x = { error: String((e && e.message) || e).slice(0, 200) }; }
      if (x.error) {
        failed++;
        await q(`insert into cds_coord_seen (source_id, at, ok, tries, note) values ($1, now(), false, 1, $2)
          on conflict (source_id) do update set tries = cds_coord_seen.tries + 1, note = excluded.note, at = now()`, [sid, x.error]);
        continue;
      }
      read++;
      const m = x.fromState ? matchName(x.name, consumers, pipeline) : null;
      await q(`insert into cds_coord_seen (source_id, at, ok, tries, note, person_ref, summary) values ($1, now(), true, 1, $2, $3, $4)
        on conflict (source_id) do update set ok = true, note = excluded.note, person_ref = excluded.person_ref, summary = excluded.summary, at = now()`,
      [sid, x.fromState ? 'the state' + (m ? '' : ', no match for ' + x.name) : 'not the state', m ? m.kind + ':' + m.id : null, x.fromState ? 'The state called (' + (x.caller || 'state office') + '). ' + x.summary : null]);
      if (!x.fromState) continue;
      state++;
      if (r.phone10 && !stateNums.has(r.phone10)) {
        // remembered as the state (a 'staff' row, so the nightly phone book rebuild keeps it)
        await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1, $2, 'state', $3, 'The state (heard on a call)', 'staff', 'cds-state-calls')
          on conflict (phone10, ref) do nothing`, [r.phone10, 'state:' + r.phone10, (x.caller || 'The state').slice(0, 80)]);
        stateNums.add(r.phone10);
      }
      const src = { line: 'cds', kind: 'call', id: sid, at, who: 'The state' + (x.caller ? ' (' + x.caller + ')' : ''), phone10: r.phone10 || '', summary: x.summary };
      if (m) {
        const item = x.date
          ? { kind: 'start_date', data: { date: x.date, saidBy: 'state', note: 'The state called the CDS line' + (x.caller ? ': ' + x.caller : '') }, status: 'suggested', due: callDay }
          : { kind: 'concern', data: { text: 'The state called about ' + (m.name || x.name) + ' (' + x.topic.replace('_', ' ') + '): ' + x.summary }, status: 'open', due: callDay };
        const key = m.kind + ':' + m.id + ':' + item.kind + ':state:' + (x.date || r.id);
        const row = await one(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
          values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) on conflict (key) do nothing returning id`,
        [key, m.kind, m.id, m.name, item.kind, JSON.stringify(item.data), JSON.stringify(src), item.status, item.due]);
        if (row && x.date) starts++;
      } else {
        unmatched++;
        const what = 'The state called about ' + (x.name || 'someone') + (x.date ? ': start date ' + x.date : '') + '. No match in the hub: find them.';
        const id = 'sc' + String(r.id).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-18);
        await q(`insert into cds_todo (id, kind, data, updated_by) values ($1, 'item', $2::jsonb, 'cds-state-calls') on conflict (id) do nothing`,
          ['i:' + id.padEnd(8, '0'), JSON.stringify({ who: 'katlin@mo-care.com', n: 0, when: 'once', date: day(nowMs()), by: 'samantha@mo-care.com', t: what.slice(0, 160), how: x.summary })]);
        await q(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), 'cds-state-calls') on conflict (id) do nothing`,
          ['i:statecall-' + String(r.id).replace(/[^a-z0-9-]/gi, '').slice(-30), JSON.stringify({ t: what.slice(0, 160), date: day(nowMs()), every: 'once', time: '', cat: 'cds', note: x.summary })]);
      }
    }
    return { ok: true, looked: todo.length, read, state, starts, unmatched, failed };
  }
  return { run };
}
