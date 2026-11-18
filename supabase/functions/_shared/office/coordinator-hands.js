// The CDS Coordinator, part 2: its hands (2026-11-17, her "Yes, build part 2").
// What it writes and sends, from what it heard (coordinator.js) and what the hub knows. Three kinds of text, each made
// only when something real calls for it, never because time passed on its own (her rule, feedback-no-timed-family-nudges):
//   clock     3 days or less before the state's start date, when the clock-in call is not done: the consumer and the
//             attendant each get how clocking in works and "any questions?"
//   check     a day they named for something THEY said they would do (call back with a move date, text a DCN) has come
//             and nothing newer was heard: a short, warm check-in Claude writes from what was said
//   dsds      day 14 after the referral, no authorization, not assessed yet: ask the consumer whether the state has called
//             or visited (stateWaits in starting-rules.js, the same clock as the hub)
// Switch coordinator.texts: 'off' (nothing made), 'practice' (made as drafts; a person presses Send on the profile; the
// default), 'on' (sent by themselves, 9 AM to 7 PM Central, Monday to Saturday). Every text is signed by the person's
// coordinator, goes from the CDS line through GoHighLevel, and is saved (sent or failed, never silent).
// coordinator.email (default on): one email to Samantha at 4:30 PM Central: what it did, what waits on her, what it was
// not sure about. Never: Medicaid numbers, DCNs, diagnoses or money in a text; never a text at night.
// No em dashes in anything a person reads (her rule).
import './starting-rules.js';
import { planJourney } from './coordinator-journey.js';
const S = () => globalThis.CDSStarting;
export const LINE = '(417) 218-2888';
export const HUB = 'https://hub.caringcds.com/#starting';
const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
const first = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const noDash = t => String(t || '').replace(/\s*[—–]\s*/g, ', ');
const niceDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const sign = who => (who && !/^office$/i.test(who) ? first(who) + ' at ' : '') + 'Caring Companions';

// The words. Short (one text, about 300 characters), warm, signed, the CDS line to call back.
export const WORDS = {
  clockConsumer: (v) => 'Hi ' + first(v.name) + ', this is ' + sign(v.from) + '. Your CDS care starts ' + niceDay(v.start) + '! ' +
    (v.att ? first(v.att) + ' will clock in when they arrive and out when they leave, on the WellSky app or your home phone. ' : 'Your attendant will clock in when they arrive and out when they leave, on the WellSky app or your home phone. ') +
    'Would set shifts (we put the schedule in WellSky) or flexible shifts (a shift is started in the app when the work begins) work better for you? Any questions? Reply here or call ' + LINE + '.',
  clockAttendant: (v) => 'Hi ' + first(v.att) + ', this is ' + sign(v.from) + '. ' + first(v.name) + "'s CDS care starts " + niceDay(v.start) + '. ' +
    'Please make sure you can sign in to the WellSky app before then. Clock in when you arrive and out when you leave, every visit, or the hours cannot be paid. Any questions? Reply here or call ' + LINE + '.',
  dsds: (v) => 'Hi ' + first(v.name) + ', this is ' + sign(v.from) + '. We sent your CDS referral to the state on ' + niceDay(v.sent) + '. Has anyone from the state (DSDS) called or visited you yet? Just reply yes or no and we will take it from there.',
};
// Only words like these ever leave: no long numbers (DCN, Medicaid), no dollar amounts.
export function safeText(t) {
  const s = noDash(t).replace(/\s+/g, ' ').trim();
  if (!s || s.length > 480) return '';
  if (/\d{7,}/.test(s.replace(/\(\d{3}\) \d{3}-\d{4}/g, '').replace(/\d{3}-\d{3}-\d{4}/g, ''))) return '';
  if (/\$\s?\d/.test(s)) return '';
  return s;
}

// A check-in text, written by Claude from what they said they would do. Plain, warm, one question, signed.
export function checkRequest(v, model) {
  return { model, max_tokens: 600, fallbacks: 'default', output_config: { effort: 'low' },
    system: 'You write one short text message (under 300 characters) for the office of Caring Companions, a Missouri CDS home care agency, to someone who said on a call that they would do something. Be warm and plain, like a real person in a small office. Remind them gently and ask one easy question. Sign it exactly as told. Never use em dashes. Never mention Medicaid numbers, money, diagnoses, a recording or a transcript. Output only the text.',
    messages: [{ role: 'user', content: 'Their first name: ' + first(v.name) + '. What they said they would do: ' + v.what + '. When they said it: ' + v.when + '. Sign it: ' + sign(v.from) + '. End with: Just reply here or call ' + LINE + '.' }] };
}

// Which texts are due today. people: from the hub's records; heard: open items; att: onboarding rows; auths: by name.
export function plan({ consumers, pipeline, items, attendants, auths, today, waits, lastHeard }) {
  const out = [], isStarting = c => c && c.status === 'starting' && !/^(example|test)\b/i.test(String(c.name || ''));
  const attOf = c => {
    const typed = norm(c.starting && c.starting.attendantName);
    return (attendants || []).find(a => typed && norm([a.first_name, a.last_name].join(' ')) === typed) || (attendants || []).find(a => norm(a.consumer_name) === norm(c.name)) || null;
  };
  (consumers || []).filter(isStarting).forEach(c => {
    const s = c.starting || {}, from = c.coordinator || '', start = c.cdsStartDate || '';
    // clock: start in 0 to 3 days, clock-in call not done
    if (start && !s.clockCall) {
      const n = daysTo(today, start);
      if (n >= 0 && n <= 3) {
        const a = attOf(c), attName = a ? [a.first_name, a.last_name].filter(Boolean).join(' ') : (s.attendantName || '');
        if (ten(c.phone)) out.push({ kind: 'clock', key: 'clock:' + c.id + ':' + start + ':consumer', person_kind: 'consumer', person_id: String(c.id), person_name: c.name, to_name: c.name, phone: ten(c.phone), body: WORDS.clockConsumer({ name: c.name, att: attName, start, from }) });
        if (a && ten(a.phone)) out.push({ kind: 'clock', key: 'clock:' + c.id + ':' + start + ':attendant', person_kind: 'consumer', person_id: String(c.id), person_name: c.name, to_name: attName, phone: ten(a.phone), body: WORDS.clockAttendant({ name: c.name, att: attName, start, from }) });
      }
    }
  });
  // dsds: the same clock as the hub; only the "ask the consumer" step, once per referral
  const W = S().stateWaits({ consumers: (consumers || []).filter(isStarting) }, today, c => ({ auth: !!(auths || {})[norm(c.name)] }), waits);
  W.filter(w => !w.call).forEach(w => {
    const c = consumers.find(x => String(x.id) === String(w.id));
    if (c && ten(c.phone)) out.push({ kind: 'dsds', key: 'dsds:' + c.id + ':' + w.since, person_kind: 'consumer', person_id: String(c.id), person_name: c.name, to_name: c.name, phone: ten(c.phone), body: WORDS.dsds({ name: c.name, sent: String(w.since).slice(0, 10), from: c.coordinator || '' }) });
  });
  // check: their word, due today or in the last 2 days, still open; texted to the number we heard them on
  // ...and only when nothing newer was heard from them (they may already have called back).
  (items || []).filter(i => i.kind === 'their_word' && i.status === 'open' && i.due && i.due <= today && i.due >= addDays(today, -2)
      && !((lastHeard || {})[i.person_kind + ':' + i.person_id] > String(i.source && i.source.at || ''))).forEach(i => {
    const p = i.person_kind === 'consumer' ? (consumers || []).find(c => String(c.id) === String(i.person_id)) : (pipeline || []).find(l => String(l.id) === String(i.person_id));
    const phone = ten(i.source && i.source.phone10) || ten(p && p.phone);
    if (p && phone) out.push({ kind: 'check', key: 'check:' + i.id, item_id: i.id, person_kind: i.person_kind, person_id: String(i.person_id), person_name: i.person_name, to_name: (i.source && i.source.who) || p.name, phone,
      what: i.data.what, when: String(i.source && i.source.at || '').slice(0, 10), from: p.coordinator || '' });
  });
  return out;
}

// Monday to Saturday, 9 AM to 7 PM Central.
export function sendingHours(nowMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(nowMs)).map(p => [p.type, p.value]));
  return parts.weekday !== 'Sun' && +parts.hour >= 9 && +parts.hour < 19;
}

// The 4:30 email: what it did today, what waits on her, what it was not sure about.
export function emailWords({ today, added, sent, waiting, drafts, failed, late }) {
  const li = a => a.length ? '<ul>' + a.map(x => '<li>' + String(x).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]) + '</li>').join('') + '</ul>' : '<p style="color:#667">Nothing.</p>';
  const text = ['CDS Coordinator, ' + niceDay(today),
    'What I did today: ' + (added.length + sent.length ? [...added, ...sent].join('; ') : 'nothing new'),
    'Waiting on you: ' + ([...late, ...waiting, ...drafts].join('; ') || 'nothing'),
    'Not sure, please look: ' + (failed.join('; ') || 'nothing'), 'Open the Starting page: ' + HUB].join('\n\n');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0d365f"><h2 style="margin:0 0 8px">CDS Coordinator, ' + niceDay(today) + '</h2>' +
    '<h3>Waiting on you</h3>' + li([...late, ...waiting]) + (drafts.length ? '<h3>Texts ready for you to send</h3>' + li(drafts) : '') +
    '<h3>What I did today</h3>' + li([...added, ...sent]) + '<h3>Not sure, please look</h3>' + li(failed) +
    '<p><a href="' + HUB + '">Open the Starting page</a></p></div>';
  return { subject: 'CDS Coordinator: ' + ([...late, ...waiting, ...drafts].length) + ' waiting on you today', text, html };
}

export function createHands({ db, ai, send, model, nowMs = () => Date.now() }) {
  const q = async (t, p) => (await db.query(t, p || [])).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const AG = 'caring-companions-cds';
  const data = async k => { const r = await one('select data_value from agency_data where agency_id = $1 and data_key = $2', [AG, k]); return (r && r.data_value) || null; };
  const chicagoDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  // Make today's drafts (once each, by key), then send ready ones when the switch is on.
  async function work(set) {
    const mode = ['off', 'practice', 'on'].includes(set.texts) ? set.texts : 'practice';
    if (mode === 'off') return { mode, made: 0, sent: 0 };
    const today = chicagoDay(nowMs());
    const consumers = (await data('consumers')) || [], pipeline = (await data('pipeline')) || [];
    const authRec = ((await data('authorizations')) || {}).records || {};
    const auths = Object.fromEntries(Object.values(authRec).map(a => [norm(a.consumer), true]));
    const waitsSet = (await data('startingWaits')) || {};
    const attendants = await q(`select a.first_name, a.last_name, a.phone, k.consumer_name from cds_packets k join attendant_pool a on a.id = k.pool_id where coalesce(a.archived,false) = false`);
    const items = await q(`select id, kind, person_kind, person_id, person_name, data, source, status, due::text as due from cds_coord_items where kind = 'their_word' and status = 'open'`);
    const lastHeard = Object.fromEntries((await q(`select person_kind || ':' || person_id as p, max(source->>'at') as at from cds_coord_items group by 1`)).map(r => [r.p, r.at]));
    const want = plan({ consumers, pipeline, items, attendants, auths, today, lastHeard, waits: Object.fromEntries(['referral', 'transfer'].filter(k => +waitsSet[k] > 0).map(k => [k, +waitsSet[k]])) });   // Admin's numbers, else the hub's
    let made = 0, skipped = 0;
    for (const d of want) {
      if (await one('select 1 from cds_coord_msgs where key = $1', [d.key])) continue;
      let body = d.body;
      if (d.kind === 'check') {
        try { const r = await ai(checkRequest(d, model)); body = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim(); } catch (e) { body = ''; }
      }
      body = safeText(body);
      if (!body) { skipped++; continue; }
      await q(`insert into cds_coord_msgs (key, kind, item_id, person_kind, person_id, person_name, to_name, phone, body, status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') on conflict (key) do nothing`, [d.key, d.kind, d.item_id || null, d.person_kind, d.person_id, d.person_name, d.to_name || '', d.phone, body]);
      made++;
    }
    // The welcome journey (2026-11-17, her yes): its own switch, "Welcome texts to new consumers" (welcome_texts.live).
    const wsw = await one(`select value from cds_match_settings where key = 'welcome_texts'`);
    const jLive = !!(wsw && wsw.value && wsw.value.live === true);
    const hour = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(nowMs()));
    const packets = await q(`select lead_id, consumer_id, signed_at from cds_enroll_packets`);
    const orientations = await q(`select name, course, completed_at from orientation_completions where course = 'consumer'`).catch(() => []);
    let jmade = 0, jsent = 0;
    for (const d of planJourney({ consumers, attendants, packets, orientations, today, hour })) {
      if (await one('select 1 from cds_coord_msgs where key = $1', [d.key])) continue;
      const body = safeText(d.body); if (!body) continue;
      const auto = jLive && sendingHours(nowMs());
      const r = await one(`insert into cds_coord_msgs (key, kind, person_kind, person_id, person_name, to_name, phone, body, status)
        values ($1,'journey',$2,$3,$4,$5,$6,$7,'draft') on conflict (key) do nothing returning id`, [d.key, d.person_kind, d.person_id, d.person_name, d.to_name || '', d.phone, body]);
      if (!r) continue;
      jmade++;
      if (auto) { const x = await sendOne(r.id, 'coordinator'); if (x.ok) jsent++; }
    }
    let sent = 0, failed = 0;
    if (mode === 'on' && sendingHours(nowMs())) {
      for (const m of await q(`select id from cds_coord_msgs where status = 'draft' and kind in ('clock','dsds','check') and created_at > now() - interval '3 days' order by id limit 10`)) {
        const r = await sendOne(m.id, 'coordinator'); r.ok ? sent++ : failed++;
      }
    }
    return { mode, made, skipped, sent, failed, journey: { live: jLive, made: jmade, sent: jsent } };
  }
  async function sendOne(id, by, body) {
    const m = await one(`select * from cds_coord_msgs where id = $1`, [+id]);
    if (!m) return { ok: false, error: 'That text is gone.' };
    if (m.status === 'sent') return { ok: true, already: true };
    const text = safeText(body != null ? body : m.body);
    if (!text) return { ok: false, error: 'That text cannot go out as written (too long, or it has a long number or an amount). Change it and try again.' };
    try {
      await send({ phone: '+1' + m.phone, text });
      await q(`update cds_coord_msgs set status = 'sent', body = $2, sent_at = now(), sent_by = $3, error = null where id = $1`, [m.id, text, by]);
      await q(`insert into cds_audit (actor, action, target, detail) values ($1, 'coordinator_text', $2, $3::jsonb)`, [by, 'coordmsg:' + m.id, JSON.stringify({ kind: m.kind, person: m.person_kind + ':' + m.person_id })]);
      return { ok: true };
    } catch (e) {
      const err = String(e && e.message || e).slice(0, 200);
      await q(`update cds_coord_msgs set status = 'failed', error = $2 where id = $1`, [m.id, err]);
      return { ok: false, error: err };
    }
  }
  async function skip(id, by) {
    const r = await one(`update cds_coord_msgs set status = 'skipped', sent_by = $2, sent_at = now() where id = $1 and status in ('draft','failed') returning id`, [+id, by]);
    return r ? { ok: true } : { ok: false, error: 'That text was already sent or is gone.' };
  }
  async function list() {
    return { msgs: await q(`select id, kind, person_kind, person_id, person_name, to_name, right(phone, 4) as last4, body, status, error, created_at, sent_at, sent_by
      from cds_coord_msgs where status in ('draft','failed') or created_at > now() - interval '14 days' order by id desc limit 300`) };
  }
  // The 4:30 email, once a day, to her reminder address (owner_reminders, set by Desktop 1521).
  async function dailyEmail(set, { force = false } = {}) {
    if (set.email === false && !force) return { email: 'off' };
    const now = nowMs(), today = chicagoDay(now);
    const hm = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).format(new Date(now)).split(':').map(Number);
    if (!force && (hm[0] < 16 || (hm[0] === 16 && hm[1] < 30) || hm[0] >= 20)) return { email: 'not yet' };
    if (!force && set.email_day === today) return { email: 'already sent today' };
    const to = await one(`select email from owner_reminders where id = 'samantha'`);
    if (!to || !to.email) return { email: 'no address' };
    const fmt = i => i.person_name + ': ' + ({ promise: 'we promised ', their_word: 'they said they would ', question: 'they asked ', start_date: 'start date ', attendant: 'attendant ', concern: 'NEEDS YOU: ' }[i.kind] || '') + (i.data.what || i.data.text || i.data.name || i.data.date || i.data.note || '');
    const addedRows = await q(`select person_name, kind, data from cds_coord_items where created_at >= (now() at time zone 'America/Chicago')::date at time zone 'America/Chicago' order by id`);
    const open = await q(`select person_name, kind, data, due::text as due, status from cds_coord_items where status in ('open','suggested') order by due nulls last`);
    const msgs = await q(`select person_name, to_name, kind, status, error, sent_at from cds_coord_msgs where status in ('draft','failed') or sent_at >= now() - interval '1 day'`);
    const weekAgo = addDays(today, -7);
    const words = emailWords({ today,
      added: addedRows.map(i => 'Heard: ' + fmt(i)),
      sent: msgs.filter(m => m.status === 'sent').map(m => 'Texted ' + m.to_name + ' (' + m.kind + ')'),
      late: open.filter(i => i.kind === 'promise' && i.due && i.due < today && i.due >= weekAgo).map(i => 'Late: ' + fmt(i)),
      waiting: open.filter(i => ['start_date', 'attendant', 'concern'].includes(i.kind) || (i.kind === 'promise' && i.due === today)).map(fmt),
      drafts: msgs.filter(m => m.status === 'draft').map(m => m.to_name + ' (' + ({ clock: 'clock-in help', dsds: 'has the state called', check: 'check-in', journey: 'welcome text' }[m.kind] || m.kind) + ')'),
      failed: msgs.filter(m => m.status === 'failed').map(m => 'Text to ' + m.to_name + ' did not go: ' + (m.error || '')) });
    try { await send({ email: to.email, subject: words.subject, text: words.text, html: words.html }); }
    catch (e) { return { email: 'failed: ' + String(e && e.message || e).slice(0, 160) }; }
    await q(`update cds_match_settings set value = value || $1::jsonb where key = 'coordinator'`, [JSON.stringify({ email_day: today })]);
    return { email: 'sent' };
  }
  return { work, sendOne, skip, list, dailyEmail };
}
