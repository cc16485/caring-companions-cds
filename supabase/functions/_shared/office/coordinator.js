// The CDS Coordinator, part 1: it listens (2026-11-17, her words: "building the automated ai cds coordinator who will
// follow up with leads, is fully in the know with everything by reading call transcripts and text, and works
// independently").
//
// Every 15 minutes it reads the new calls and texts of everyone on the start tracker (Starting consumers) and every open
// lead, on BOTH phone lines: the CDS line (cds_comms, with the transcripts the call notes saved) and the Caring
// Companions line 417-234-8494 (the Caring Companions server's cds-call-feed, which returns only calls from the numbers
// we ask about). Each call or text thread goes to Claude once, with who the person is, and comes back as:
//   promises      what we told them we would do, with a due date (they go straight onto the person's
//                 "What we promised" list and onto her My Week; a promise is a reminder for us, nothing is sent)
//   their_word    what they said they would do (call back with a date, send a DCN), a date to check on it
//   start_date    a start date the state gave or that changed, waits for the office to say Use it
//   attendant     an attendant's name, phone and email, waits for the office (Use it adds them and texts the link)
//   questions     questions they asked that we did not answer
// Nothing here texts, emails or calls anyone but her My Week. It never writes a consumer or a lead record: the hub
// applies what the office says Use it to (the hub owns those records; two writers would lose each other's changes).
// Setting coordinator (cds_match_settings): { live, per_run, backfill_days }. Off = it does nothing.
// No em dashes in anything a person reads (her rule).

export const COORD_MODEL = 'claude-opus-5-5';
const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
const noDash = t => String(t || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
export const AGENCY = 'caring-companions-cds';

export const COORD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['about_person', 'summary', 'promises', 'their_word', 'start_date', 'attendant', 'questions', 'concerns'],
  properties: {
    about_person: { type: 'boolean' },
    summary: { type: 'string' },
    promises: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'due'], properties: { what: { type: 'string' }, due: { type: 'string' } } } },
    their_word: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'check_on'], properties: { what: { type: 'string' }, check_on: { type: 'string' } } } },
    start_date: { type: 'object', additionalProperties: false, required: ['date', 'said_by', 'note'],
      properties: { date: { type: 'string' }, said_by: { type: 'string', enum: ['state', 'office', 'consumer', 'family', 'attendant', ''] }, note: { type: 'string' } } },
    attendant: { type: 'object', additionalProperties: false, required: ['name', 'phone', 'email', 'relation'],
      properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, relation: { type: 'string' } } },
    questions: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } }
  }
};
const SYSTEM = [
  'You are the coordinator for Caring Companions Direct Services (CDS), a Missouri Medicaid consumer directed services agency. A consumer is the person who gets care; their attendant is the caregiver they chose (often family), whom we hire for them.',
  'You get one phone call transcript (or a short call summary, or a thread of text messages) with someone on our list, what the hub knows about them, and today\'s date. Pull out only what was really said. Never guess. Use empty strings and empty lists when something was not said.',
  'summary: one or two plain sentences for the office about what matters for getting this person started.',
  'promises: each thing our office said WE would do (send the packet, send the attendant the application, run the background check, call back Friday, send clock-in instructions). what: a short instruction in plain words, naming who it is for. due: YYYY-MM-DD, the day we said, else "today" means the call date, "this week" means the Friday after the call, and no day said means the next weekday after the call.',
  'their_word: things THEY said they would do (call back with a move date, text their DCN, call the state). check_on: YYYY-MM-DD, the day they named, else 7 days after the call.',
  'start_date: only when a start date for care was given or changed on this call (by the state, our office, or the family). date: YYYY-MM-DD, empty if it was only said that the date will change or is unknown. said_by: who gave it. note: a few words, for example "moving by December 1, will call with the new date".',
  'attendant: the person who will be the attendant, only when their name was said: full name as spelled on the call, phone digits only if said aloud, email exactly as spelled out, relation to the consumer in one or two words.',
  'questions: questions they asked that were not answered on the call.',
  'concerns: anything a person at our office must handle soon, in a few words each: a health or safety worry, a fall or hospital stay, someone upset or unhappy, wanting to stop or change caregivers, a pay or hours dispute, a problem with the state or Medicaid, a possible abuse or neglect. Empty when there is none. Never put routine questions here.',
  'about_person: false when this is clearly not about this person (a wrong number, a different client). Also false when the call is about Caring Companions In-Home Senior Care work rather than CDS: a caregiver\'s shifts or schedule with a Caring Companions client, covering a shift, training or hiring for Caring Companions. Many people work for both; only CDS matters here (their own CDS enrollment, their attendant, their paperwork, the state, their start date, CDS clock-in and pay).',
  'The office staff are Samantha, Krystal (sometimes written Crystal), Zach and the Caring Companions team. Names in transcripts are often misspelled by the transcriber: prefer the spelling the hub has, or letters spelled out on the call.',
  'Never use em dashes. Plain words. Do not mention the transcript or yourself.'
].join('\n');

export function extractRequest(person, source, today) {
  const lines = [
    'Today: ' + today + '. ' + (source.kind === 'texts' ? 'Text messages' : 'Call') + ' on ' + (source.line === 'cc' ? 'the Caring Companions line (417-234-8494)' : 'the CDS line') + ', ' + String(source.at).slice(0, 10) + '.',
    'The hub knows: ' + person.name + ' (' + (person.kind === 'lead' ? 'a lead' : 'starting CDS') + ')' + (person.start ? ', start date on file ' + person.start : ', no start date on file') +
      (person.attendant ? ', attendant on file ' + person.attendant : ', no attendant on file') + '. This ' + (source.kind === 'texts' ? 'thread' : 'call') + ' is with ' + (source.who || 'their number') + '.',
    source.transcript ? '<transcript>\n' + String(source.transcript).slice(0, 30000) + '\n</transcript>' : '<summary>\n' + String(source.summary || '').slice(0, 4000) + '\n</summary>'
  ];
  return { model: COORD_MODEL, max_tokens: 4000, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: COORD_SCHEMA } },
    system: SYSTEM, messages: [{ role: 'user', content: lines.join('\n') }] };
}

// The answer, held in code: real dates, at most 6 of anything, plain text, digits-only phones, a real email.
export function cleanExtract(resp, callDay) {
  if (!resp) return { error: 'no answer' };
  if (resp.stop_reason === 'refusal') return { error: 'declined' };
  const text = (resp.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
  let j; try { j = JSON.parse(text); } catch { return { error: 'could not be read' }; }
  const day = v => isDay(v) && v >= '2020-01-01' ? v : '';
  const out = { about: j.about_person !== false, summary: noDash(j.summary).slice(0, 600),
    promises: (j.promises || []).slice(0, 6).map(p => ({ what: noDash(p.what).slice(0, 240), due: day(p.due) || callDay })).filter(p => p.what),
    theirWord: (j.their_word || []).slice(0, 6).map(p => ({ what: noDash(p.what).slice(0, 240), due: day(p.check_on) })).filter(p => p.what),
    questions: (j.questions || []).slice(0, 6).map(q => noDash(q).slice(0, 240)).filter(Boolean),
    concerns: (j.concerns || []).slice(0, 4).map(q => noDash(q).slice(0, 240)).filter(Boolean) };
  const sd = j.start_date || {};
  out.startDate = (day(sd.date) || noDash(sd.note)) ? { date: day(sd.date), saidBy: ['state', 'office', 'consumer', 'family', 'attendant'].includes(sd.said_by) ? sd.said_by : '', note: noDash(sd.note).slice(0, 200) } : null;
  const a = j.attendant || {};
  const email = String(a.email || '').trim().toLowerCase();
  out.attendant = noDash(a.name).split(' ').length >= 2 ? { name: noDash(a.name).slice(0, 80), phone: ten(a.phone), email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email.slice(0, 120) : '', relation: noDash(a.relation).slice(0, 40) } : null;
  return out;
}

// The people it watches, read from the hub's own records (read only): Starting consumers and open leads, each with every
// phone we know for them (their own, their contacts, their attendant's from onboarding).
export function watchList(consumers, pipeline, attendants) {
  const out = [];
  const closed = s => /^closed|^lost|^not_?interested/i.test(String(s || ''));
  const real = x => !/^(example|test)\b/i.test(String(x && x.name || '').trim());   // practice records are never watched
  const recent = c => c && c.status === 'active' && c.cdsStartDate && Date.parse(c.cdsStartDate + 'T12:00:00Z') > Date.now() - 45 * 864e5;
  (consumers || []).filter(c => c && (c.status === 'starting' || recent(c)) && real(c)).forEach(c => out.push({ kind: 'consumer', id: String(c.id), name: c.name || '', start: c.cdsStartDate || '',
    attendant: (c.starting && c.starting.attendantName) || '', phones: [c.phone, ...(c.relatedPeople || []).map(p => p && p.phone)].map(ten).filter(Boolean),
    leadId: c.starting && c.starting.leadId ? String(c.starting.leadId) : '' }));
  const onList = new Set(out.map(p => p.leadId).filter(Boolean));
  (pipeline || []).filter(p => p && p.id && real(p) && !p.movedToConsumers && !p.startingId && !closed(p.status) && !onList.has(String(p.id))).forEach(p => out.push({ kind: 'lead', id: String(p.id), name: p.name || '',
    start: '', attendant: (p.attendant && p.attendant.name) || '', phones: [p.phone, (p.attendant || {}).phone, ...(p.relatedPeople || []).map(r => r && r.phone)].map(ten).filter(Boolean) }));
  (attendants || []).forEach(a => { const who = out.find(p => norm(p.name) && norm(a.consumer_name) === norm(p.name)); const ph = ten(a.phone); if (who && ph && !who.phones.includes(ph)) who.phones.push(ph); });
  out.forEach(p => { p.phones = [...new Set(p.phones)]; });
  return out;
}

// The items one reading becomes. key makes each one once per person, ever (the same attendant heard on two calls is one item).
export function itemsFrom(person, source, x) {
  const items = [], src = { line: source.line, kind: source.kind, id: source.id, at: source.at, who: source.who || '', phone10: source.phone10 || '', summary: x.summary };
  const base = (kind, data, status, due) => ({ person_kind: person.kind, person_id: person.id, person_name: person.name, kind, data, status, due: due || null, source: src,
    key: person.kind + ':' + person.id + ':' + kind + ':' + norm(data.what || data.name || data.date || data.note || data.text).slice(0, 60) });   // once per person, however many calls say it
  x.promises.forEach(p => items.push(base('promise', p, 'open', p.due)));
  x.theirWord.forEach(p => items.push(base('their_word', p, 'open', p.due)));
  if (x.startDate && (x.startDate.date ? x.startDate.date !== person.start : true)) items.push(base('start_date', x.startDate, 'suggested', source.at.slice(0, 10)));
  // An attendant: not the person themselves, not the one on file, and "Iris D." is the same as "Iris Dorsey" (first name + last initial).
  const short = n => { const w = String(n || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean); return w.length ? w[0] + (w[1] || '').slice(0, 1) : ''; };
  if (x.attendant && short(x.attendant.name) !== short(person.name) && short(x.attendant.name) !== short(person.attendant)) {
    const it = base('attendant', x.attendant, 'suggested', source.at.slice(0, 10)); it.key = person.kind + ':' + person.id + ':attendant:' + short(x.attendant.name); items.push(it);
  }
  x.questions.forEach(q => items.push(base('question', { text: q }, 'open', source.at.slice(0, 10))));
  (x.concerns || []).forEach(q => items.push(base('concern', { text: q }, 'open', source.at.slice(0, 10))));   // a person is needed: My Week today
  return items;
}

// What My Week shows for an item (one line and a note), or null for items with nothing to do on a day.
export const WEEK_BACK_DAYS = 7;   // older than a week: on the person's profile only, never filling My Week with old calls
export function weekLine(it, today) {
  const d = it.data || {}, who = it.person_name;
  const when = String(it.due || (it.source && it.source.at) || today).slice(0, 10);
  if (when < new Date(Date.parse(today + 'T12:00:00Z') - WEEK_BACK_DAYS * 864e5).toISOString().slice(0, 10)) return null;
  if (it.kind === 'promise') return { t: who + ': we promised ' + d.what, date: it.due || today };
  if (it.kind === 'their_word') return { t: who + ': check on ' + d.what, date: it.due || today };
  if (it.kind === 'start_date') return { t: who + ': start date ' + (d.date ? 'heard on a call: ' + d.date : 'is changing') + ', confirm it', date: today };
  if (it.kind === 'attendant') return { t: who + ': add ' + d.name + ' as the attendant', date: today };
  if (it.kind === 'question') return { t: who + ' asked: ' + d.text, date: it.due || today };
  if (it.kind === 'concern') return { t: who + ' needs you: ' + d.text, date: today };   // stays on today until answered
  return null;
}

export function createCoordinator({ db, ai, ccFeed, nowMs = () => Date.now() }) {
  const q = async (t, p) => (await db.query(t, p || [])).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const chicagoDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  async function settings() { const r = await one("select value from cds_match_settings where key = 'coordinator'"); return (r && r.value) || {}; }
  async function data(key) { const r = await one('select data_value from agency_data where agency_id = $1 and data_key = $2', [AGENCY, key]); return (r && r.data_value) || []; }

  async function run({ backfill = false } = {}) {
    const s = await settings();
    if (s.live === false) return { ok: true, note: 'the coordinator is off' };
    const today = chicagoDay(nowMs()), perRun = Math.min(+s.per_run || 10, 30);
    const since = new Date(nowMs() - (backfill ? (+s.backfill_days || 45) : 3) * 864e5).toISOString();
    const att = await q('select a.phone, k.consumer_name from cds_packets k join attendant_pool a on a.id = k.pool_id where coalesce(a.archived,false) = false and k.consumer_name is not null');
    const people = watchList(await data('consumers'), await data('pipeline'), att);
    const byPhone = new Map(); people.forEach(p => p.phones.forEach(ph => { if (!byPhone.has(ph)) byPhone.set(ph, p); }));
    const phones = [...byPhone.keys()];
    // Read once; a reading that failed 3 times is left alone (it would only cost money again).
    const seen = new Set((await q("select source_id from cds_coord_seen where ok or tries >= 3")).map(r => r.source_id));
    const sources = [];
    // The CDS line: answered calls with a transcript, and texts (grouped per person per day). 20 minutes old at least, so
    // the transcript and the rest of a text conversation are in.
    const cutoff = new Date(nowMs() - 20 * 60e3).toISOString();
    if (phones.length) {
      const rows = await q(`select c.id, c.channel, c.direction, c.at, c.phone10, c.body, c.staff_name, c.contact_name, n.transcript
        from cds_comms c left join cds_call_notes n on n.comm_id = c.id
        where c.at > $1 and c.at < $2 and c.phone10 = any($3) order by c.at`, [since, cutoff, phones]);
      const texts = new Map();
      rows.forEach(r => {
        const p = byPhone.get(r.phone10); if (!p) return;
        const at = new Date(r.at).toISOString();
        if (r.channel === 'call' && r.transcript && !seen.has('cds:' + r.id)) sources.push({ person: p, src: { line: 'cds', kind: 'call', id: 'cds:' + r.id, at, who: r.contact_name || '', phone10: r.phone10, transcript: r.transcript } });
        if (r.channel === 'sms' && r.body) { const k = p.id + '@' + at.slice(0, 10); const g = texts.get(k) || { person: p, ids: [], lines: [], at, who: r.contact_name || '', phone10: r.phone10 };
          g.ids.push(r.id); g.lines.push((r.direction === 'outbound' ? 'Office' : (r.contact_name || 'Them')) + ': ' + String(r.body).slice(0, 600)); g.at = at; texts.set(k, g); }
      });
      texts.forEach((g, k) => { const id = 'cds-texts:' + k + ':' + g.ids.length; if (!seen.has(id)) sources.push({ person: g.person, src: { line: 'cds', kind: 'texts', id, at: g.at, who: g.who, phone10: g.phone10, transcript: g.lines.join('\n') } }); });
    }
    // The Caring Companions line.
    let ccNote = '';
    if (ccFeed && phones.length) {
      try {
        const feed = await ccFeed({ phones, since });
        (feed.calls || []).forEach(c => { const p = byPhone.get(ten(c.phone10 || c.phone)); const id = 'cc:' + c.id;
          if (p && !seen.has(id) && (c.transcript || c.summary)) sources.push({ person: p, src: { line: 'cc', kind: 'call', id, at: c.at, who: c.who || '', phone10: ten(c.phone10 || c.phone), transcript: c.transcript || '', summary: c.summary || '' } }); });
      } catch (e) { ccNote = 'Caring Companions line not read: ' + String(e && e.message || e).slice(0, 160); }
    }
    sources.sort((a, b) => String(a.src.at).localeCompare(String(b.src.at)));
    let read = 0, added = 0, failed = 0;
    for (const { person, src } of sources.slice(0, perRun)) {
      let x;
      try { x = cleanExtract(await ai(extractRequest(person, src, today)), String(src.at).slice(0, 10)); }
      catch (e) { x = { error: String(e && e.message || e).slice(0, 200) }; }
      if (x.error) { failed++; await q(`insert into cds_coord_seen (source_id, at, ok, tries, note) values ($1, now(), false, 1, $2)
        on conflict (source_id) do update set tries = cds_coord_seen.tries + 1, note = excluded.note, at = now()`, [src.id, x.error]); continue; }
      read++;
      await q(`insert into cds_coord_seen (source_id, at, ok, tries, note, person_ref, summary) values ($1, now(), true, 1, $2, $3, $4)
        on conflict (source_id) do update set ok = true, note = excluded.note, person_ref = excluded.person_ref, summary = excluded.summary, at = now()`,
        [src.id, x.about ? null : 'not about them', person.kind + ':' + person.id, x.summary || null]);
      if (!x.about) continue;
      for (const it of itemsFrom(person, src, x)) {
        const r = await one(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
          values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) on conflict (key) do nothing returning id`,
          [it.key, it.person_kind, it.person_id, it.person_name, it.kind, JSON.stringify(it.data), JSON.stringify(it.source), it.status, it.due]);
        if (r) added++;
      }
    }
    const week = await syncWeek(today);
    const state = { last_run: new Date(nowMs()).toISOString(), watched: people.length, phones: phones.length, waiting: Math.max(0, sources.length - perRun), read, added, failed, cc: ccNote || 'ok', week };
    await q(`update cds_match_settings set value = value || $1::jsonb where key = 'coordinator'`, [JSON.stringify({ state })]);
    return Object.assign({ ok: true }, state);
  }

  // Her My Week: one item per open promise or suggestion, gone when the office marks it done or answers it.
  async function syncWeek(today) {
    const open = await q("select id, kind, person_name, data, source, due::text as due from cds_coord_items where status in ('open','suggested')");
    const want = new Map();
    open.forEach(it => { const w = weekLine(it, today); if (w) want.set('i:coord-' + it.id, w); });
    const have = await q("select id from owner_calendar where id like 'i:coord-%'");
    let put = 0, gone = 0;
    for (const [id, w] of want) {
      const r = await one(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), 'cds-coordinator')
        on conflict (id) do update set data = excluded.data, updated_at = now() where owner_calendar.data->>'date' is distinct from excluded.data->>'date' or owner_calendar.data->>'t' is distinct from excluded.data->>'t'
        returning id`, [id, JSON.stringify({ t: w.t.slice(0, 160), date: String(w.date).slice(0, 10), time: '', every: 'once', cat: 'mine', note: 'From the CDS Coordinator. Done it? Check it off on the Starting page.', by: 'coordinator' })]);
      if (r) put++;
    }
    for (const r of have) if (!want.has(r.id)) { await q('delete from owner_calendar where id = $1', [r.id]); await q("delete from owner_calendar where kind = 'mark' and id like $1", ['m:' + r.id.slice(2) + '@%']); gone++; }
    return { put, gone };
  }

  // The hub: open items for everyone (or one person), and the office's answer to one.
  async function list({ all = false } = {}) {
    const items = await q(`select id, person_kind, person_id, person_name, kind, data, source, status, due::text as due, created_at, decided_by, decided_at from cds_coord_items
      where ${all ? "created_at > now() - interval '90 days'" : "status in ('open','suggested') or decided_at > now() - interval '30 days'"} order by created_at desc limit 500`);
    const s = await settings();
    return { items, state: s.state || null, live: s.live !== false };
  }
  const ACTIONS = { done: 'done', undo: 'open', dismiss: 'dismissed', used: 'applied' };
  async function decide(email, { id, answer }) {
    const to = ACTIONS[answer];
    if (!to) throw new Error('Unknown answer');
    // Undo puts a suggestion back to waiting on the office, and a promise back to open.
    const r = await one(`update cds_coord_items set status = case when $2 = 'open' and kind in ('start_date','attendant') then 'suggested' else $2 end,
      decided_by = $3, decided_at = now() where id = $1 returning id, status`, [+id, to, String(email || '').slice(0, 120)]);
    if (!r) throw new Error('That item is gone. Refresh the page.');
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, 'coordinator_item', $2, $3::jsonb)`, [String(email || ''), 'coord:' + id, JSON.stringify({ to })]);
    await syncWeek(chicagoDay(nowMs()));
    return { ok: true, id: r.id, status: r.status };
  }
  return { run, list, decide, syncWeek };
}
