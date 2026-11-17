// Never-clocked-out texts (2026-11-17, Samantha): "if they clocked in and didn't clock out right now we
// delete those shifts and they aren't paid for them ... could we use the hub to send that consumer and
// attendant a text to say that the shift on that certain day had a clock in time of ____ and does not
// have a clock out time so right now it won't be paid. If they would like us to enter a clock out time
// for them, please complete the EVV form."
//
// Not clocking in at all is left alone (CDS is flexible; the consumer sets the schedule). Only a shift
// with a clock in and no clock out gets a text.
//
// Where the shifts come from: the daily WellSky email "Authorization Care Logs" (wellskyCheck.analytics
// .authLogs, last 7 days, a blank clock out = never clocked out). Only the NEWEST email counts, so a
// shift the office already fixed or deleted in WellSky is never texted.
//
// Rules:
//  - a shift counts once it has been open more than 12 hours (someone still on a long shift is left alone)
//  - one text to the CONSUMER only (her word 11-17: the consumer is the boss), ONCE per shift (marks in agency_data openShiftTexts)
//  - only 9am to 6pm Central, any day (her rule: no night texts)
//  - switch open_shift_texts (cds_match_settings, starts OFF): off = practice, the texts are written and
//    saved as "would send" but nobody gets one
// No em dashes in anything a person reads (her rule).

export const AGENCY_ID = 'caring-companions-cds';
export const SETTING = 'open_shift_texts';
export const MARKS = 'openShiftTexts';
export const FORM = 'https://hub.caringcds.com/evv-form';
export const OPEN_HOURS = 12;
export const START_HOUR = 9, END_HOUR = 18;   // Central, texts only from 9:00 to 5:59pm
export const MAX_AGE_DAYS = 8;                // the WellSky email only holds 7 days anyway

export const nameKey = n => String(n || '').toLowerCase().replace(/[^a-z\s,'-]/g, '').split(/[\s,]+/).filter(Boolean).sort().join(' ');
// "Smith, Mary" -> "Mary Smith"
export const firstLast = n => { const s = String(n || '').trim(); const m = /^([^,]+),\s*(.+)$/.exec(s); return m ? m[2] + ' ' + m[1] : s; };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// naive local "2026-11-16T09:05:00" -> "Sun, Nov 16" and "9:05 AM"
export function dayOf(naive) { const d = new Date(naive.slice(0, 10) + 'T12:00:00Z'); return DOW[d.getUTCDay()] + ', ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate(); }
export function timeOf(naive) { const h = +naive.slice(11, 13); return ((h % 12) || 12) + ':' + naive.slice(14, 16) + ' ' + (h < 12 ? 'AM' : 'PM'); }
export const digits10 = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
export const keyOf = s => 'open|' + nameKey(s.consumer) + '|' + String(s.clockIn).slice(0, 16);

// Central time parts for a UTC ms
export function chi(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { naive: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`, h: +p.hour, date: `${p.year}-${p.month}-${p.day}` };
}
const naiveMs = n => Date.parse(String(n).slice(0, 19) + 'Z');

// The words. Kept short so it is one or two text messages.
// HER RULE 2026-11-17: the EVV form must be in by Saturday at midnight to be fixed for payroll
// (CDS pay week Sunday to Saturday). The text names the coming Saturday (today, if sent on a Saturday).
export function dueSaturday(sendNaive) {
  const d = new Date(String(sendNaive).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}
export function texts(s) {
  const day = dayOf(s.clockIn), time = timeOf(s.clockIn);
  const due = dayOf(dueSaturday(s.sendNaive || s.clockIn) + 'T00:00:00');
  const tail = ` has a clock in time of ${time} and no clock out time, so right now it won't be paid. To have us enter a clock out time, please complete the EVV form by ${due} at midnight for payroll: ${FORM}`;
  return {
    consumer: `Caring Companions CDS: ${s.attendantName ? s.attendantName + "'s" : 'The'} shift with you on ${day}${tail}`,
  };
}

// Which shifts need a text right now. input = { authLogs, consumers, attendants, marks, nowMs }
// Returns { due: [{ key, clockIn, consumerName, attendantName, to: [{ who, name, phone10, text } | { who, name, missing }] }], skipped: [...] }
export function plan({ authLogs, consumers = [], attendants = [], marks = {}, nowMs }) {
  const out = { due: [], skipped: [] };
  const shifts = (authLogs && Array.isArray(authLogs.shifts)) ? authLogs.shifts : [];
  const nowNaive = chi(nowMs).naive;
  const cBy = new Map(), aBy = new Map();
  for (const c of consumers) if (c && c.name) cBy.set(nameKey(c.name), c);
  for (const a of attendants) if (a && a.name && a.status !== 'inactive') aBy.set(nameKey(a.name), a);
  const seen = new Set();
  for (const s of shifts) {
    if (!s || s.clockOut || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(s.clockIn || '')) || !s.consumer) continue;
    const key = keyOf(s);
    if (seen.has(key)) continue; seen.add(key);
    const openH = (naiveMs(nowNaive) - naiveMs(s.clockIn)) / 36e5;
    if (openH <= OPEN_HOURS) { out.skipped.push({ key, why: 'still within 12 hours of clocking in' }); continue; }
    if (openH > MAX_AGE_DAYS * 24) { out.skipped.push({ key, why: 'older than ' + MAX_AGE_DAYS + ' days' }); continue; }
    if (marks[key]) { out.skipped.push({ key, why: 'already texted' }); continue; }
    const c = cBy.get(nameKey(s.consumer));
    // The WellSky email may have no attendant column: then the roster's one attendant for this consumer.
    let a = s.attendant ? aBy.get(nameKey(s.attendant)) : null;
    if (!a && !s.attendant) {
      const mine = [...aBy.values()].filter(x => nameKey(x.consumer) && nameKey(x.consumer) === nameKey(s.consumer));
      if (mine.length === 1) a = mine[0];
    }
    const consumerName = c ? c.name : firstLast(s.consumer);
    const attendantName = a ? a.name : (s.attendant ? firstLast(s.attendant) : '');
    if (c && /^(inactive|closed|ended)$/i.test(String(c.status || ''))) { out.skipped.push({ key, why: 'consumer is not active' }); continue; }
    const words = texts({ clockIn: s.clockIn, consumerName, attendantName, sendNaive: nowNaive });
    const to = [];
    const cp = c ? digits10(c.phone) : '';
    to.push(cp ? { who: 'consumer', name: consumerName, phone10: cp, text: words.consumer } : { who: 'consumer', name: consumerName, missing: c ? 'no phone on the consumer' : 'consumer not found in the hub' });
    // HER WORD 2026-11-17 "the consumer is the boss": the text goes to the consumer only; the attendant's
    // name is in it so the consumer knows which shift. Nothing is sent to the attendant.
    out.due.push({ key, clockIn: String(s.clockIn).slice(0, 19), consumerName, attendantName, to });
  }
  return out;
}

// deps = { db: { query(text, params) -> { rows } }, sms(phone10, text, name) -> Promise, now?: () => ms }
export function createOpenShiftTexts(deps) {
  const q = async (t, p = []) => (await deps.db.query(t, p)).rows;
  const now = () => (deps.now ? deps.now() : Date.now());
  const store = async keys => Object.fromEntries((await q('select data_key, data_value from agency_data where agency_id=$1 and data_key = any($2)', [AGENCY_ID, keys])).map(r => [r.data_key, r.data_value]));
  async function run({ force = false } = {}) {
    const t = now(), c = chi(t);
    const cfgRow = (await q('select value from cds_match_settings where key=$1', [SETTING]))[0];
    if (!cfgRow) return { ok: false, error: SETTING + ' is not set up' };
    const live = cfgRow.value && cfgRow.value.live === true;
    // force (tests and Desktop checks) only skips the clock while practicing: real texts always keep the hours
    if ((!force || live) && (c.h < START_HOUR || c.h >= END_HOUR)) return { ok: true, skipped: 'outside 9am to 6pm Central', live };
    const s = await store(['wellskyCheck', 'consumers', 'attendants', MARKS]);
    const wc = s.wellskyCheck || {};
    const authLogs = wc.analytics && wc.analytics.authLogs;
    if (!authLogs || !authLogs.at) return { ok: false, error: 'No Authorization Care Logs email has been read yet', live };
    // a stale email would text about shifts the office may have fixed since: only use one from the last 36 hours
    if (t - Date.parse(authLogs.at) > 36 * 36e5) return { ok: false, error: 'The newest WellSky care log email is from ' + String(authLogs.at).slice(0, 10) + ', too old to text from', live };
    const marks = (s[MARKS] && s[MARKS].shifts) || {};
    const consumers = Array.isArray(s.consumers) ? s.consumers : Object.values(s.consumers || {});
    const attendants = Array.isArray(s.attendants) ? s.attendants : Object.values(s.attendants || {});
    const P = plan({ authLogs, consumers, attendants, marks, nowMs: t });
    const sum = { ok: true, live, shifts: P.due.length, sent: 0, practice: 0, missing: 0, failed: 0 };
    for (const d of P.due) {
      const rec = { at: new Date(t).toISOString(), clockIn: d.clockIn, consumer: d.consumerName, attendant: d.attendantName, live, to: [] };
      for (const r of d.to) {
        if (r.missing) { rec.to.push({ who: r.who, name: r.name, missing: r.missing }); sum.missing++; continue; }
        if (!live) { rec.to.push({ who: r.who, name: r.name, phone10: r.phone10, text: r.text, practice: true }); sum.practice++; continue; }
        try { await deps.sms(r.phone10, r.text, r.name); rec.to.push({ who: r.who, name: r.name, phone10: r.phone10, text: r.text, sent: true }); sum.sent++; }
        catch (e) { rec.to.push({ who: r.who, name: r.name, phone10: r.phone10, text: r.text, error: String((e && e.message) || e).slice(0, 200) }); sum.failed++; }
      }
      marks[d.key] = rec;
    }
    // keep 60 days of marks
    const cutoff = new Date(t - 60 * 864e5).toISOString();
    for (const k of Object.keys(marks)) if (String(marks[k].at || '') < cutoff) delete marks[k];
    await q(`insert into agency_data (agency_id, data_key, data_value) values ($1, $2, $3::jsonb)
             on conflict (agency_id, data_key) do update set data_value = excluded.data_value`,
      [AGENCY_ID, MARKS, JSON.stringify({ at: new Date(t).toISOString(), lastRun: sum, shifts: marks })]);
    return sum;
  }
  return { run };
}
