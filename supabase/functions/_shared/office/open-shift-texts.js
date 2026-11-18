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
// LONG SHIFTS (2026-11-17, her rule): "in the future, I would like for that to be considered a non-clock out so it's
// not payable and they get a text saying that we need to know the hours worked and they have to complete an evv form".
// A shift that WAS clocked out but ran overnight (across midnight; WellSky splits it into ...23:59 + 00:00..., joined
// back here) or longer than 8 hours is treated like a no clock-out: not paid until fixed, and the consumer gets a text
// asking for the real hours worked on the EVV form. Her rule too: nobody stays clocked in more than 8 hours, so a
// shift with no clock out is texted once it has been open more than 8 hours (was 12).
//
// Rules:
//  - a shift with no clock out counts once it has been open more than 8 hours
//  - one text to the CONSUMER only (her word 11-17: the consumer is the boss), ONCE per shift (marks in agency_data openShiftTexts)
//  - only 9am to 6pm Central, any day (her rule: no night texts)
//  - switch open_shift_texts (cds_match_settings, starts OFF): off = practice, the texts are written and
//    saved as "would send" but nobody gets one
//  - the filled-in form (2026-11-17, clockout.js): when deps.fixes is given, each text carries a private link
//    (hub.caringcds.com/evv-form?fix=...) that opens the form filled in with that shift, and the answer goes to
//    the office card on the EVV forms page. Without it, the plain form link as before.
// No em dashes in anything a person reads (her rule).

export const AGENCY_ID = 'caring-companions-cds';
export const SETTING = 'open_shift_texts';
export const MARKS = 'openShiftTexts';
export const FORM = 'https://hub.caringcds.com/evv-form';
export const OPEN_HOURS = 8;
export const LONG_HOURS = 8;
export const LONG_FROM = '2026-11-18';      // her word "in the future": long shifts before this day were already paid and billed              // a finished shift longer than this (or across midnight) gets the long-shift text
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
export const longKeyOf = s => 'long|' + nameKey(s.consumer) + '|' + String(s.clockIn).slice(0, 16);

// WellSky splits a shift at midnight into "...T23:59(:59)" and "next dayT00:00". Join those halves back into one
// shift (same consumer, same attendant or both blank). Returns new objects; the input is not changed.
export function joinSplits(shifts) {
  const list = (shifts || []).filter(x => x && x.consumer && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(x.clockIn || '')))
    .map(x => ({ ...x, clockIn: String(x.clockIn).slice(0, 19), clockOut: x.clockOut ? String(x.clockOut).slice(0, 19) : null }))
    .sort((a, b) => (nameKey(a.consumer) + a.clockIn).localeCompare(nameKey(b.consumer) + b.clockIn));
  const out = [];
  for (const x of list) {
    const prev = out[out.length - 1];
    const nextDay = prev && prev.clockOut ? new Date(Date.parse(prev.clockOut.slice(0, 10) + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10) : '';
    if (prev && prev.clockOut && /T23:59/.test(prev.clockOut) && nameKey(prev.consumer) === nameKey(x.consumer)
        && nameKey(prev.attendant) === nameKey(x.attendant) && x.clockIn.slice(0, 16) === nextDay + 'T00:00') {
      prev.clockOut = x.clockOut; prev.joined = true; continue;
    }
    if (out.some(y => keyOf(y) === keyOf(x) && y.clockOut === x.clockOut)) continue;   // duplicate row
    out.push(x);
  }
  return out;
}
const hoursOf = s => (Date.parse(s.clockOut + 'Z') - Date.parse(s.clockIn + 'Z')) / 36e5;
// A finished shift that needs the long-shift text: across midnight, or longer than LONG_HOURS.
export const isLong = s => !!(s && s.clockOut && (s.clockOut.slice(0, 10) !== s.clockIn.slice(0, 10) || hoursOf(s) > LONG_HOURS));

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
  const tail = ` has a clock in time of ${time} and no clock out time, so right now it won't be paid. To have us enter a clock out time, please complete the EVV form by ${due} at midnight for payroll: ${s.link || FORM}`;
  if (s.clockOut) {
    const h = Math.round(hoursOf(s) * 4) / 4, sameDay = s.clockOut.slice(0, 10) === s.clockIn.slice(0, 10);
    const until = timeOf(s.clockOut) + (sameDay ? '' : ' on ' + dayOf(s.clockOut));
    return {
      consumer: `Caring Companions CDS: ${s.attendantName ? s.attendantName + "'s" : 'The'} shift with you on ${day} was clocked in from ${time} to ${until} (${h} hours). Shifts over 8 hours or overnight aren't paid until we know the real hours worked. Send them on the EVV form by ${due} at midnight: ${s.link || FORM}`,
    };
  }
  return {
    consumer: `Caring Companions CDS: ${s.attendantName ? s.attendantName + "'s" : 'The'} shift with you on ${day}${tail}`,
  };
}

// Which shifts need a text right now. input = { authLogs, consumers, attendants, marks, nowMs }
// Returns { due: [{ key, clockIn, consumerName, attendantName, to: [{ who, name, phone10, text } | { who, name, missing }] }], skipped: [...] }
export function plan({ authLogs, consumers = [], attendants = [], marks = {}, nowMs }) {
  const out = { due: [], skipped: [] };
  const shifts = joinSplits((authLogs && Array.isArray(authLogs.shifts)) ? authLogs.shifts : []);
  const nowNaive = chi(nowMs).naive;
  const cBy = new Map(), aBy = new Map();
  for (const c of consumers) if (c && c.name) cBy.set(nameKey(c.name), c);
  for (const a of attendants) if (a && a.name && a.status !== 'inactive') aBy.set(nameKey(a.name), a);
  const seen = new Set();
  for (const s of shifts) {
    if (!s || !s.consumer) continue;
    const long = isLong(s);
    if (s.clockOut && !long) continue;                    // a normal finished shift: nothing to say
    if (long && s.clockIn.slice(0, 10) < LONG_FROM) continue;   // before her rule started: already paid and billed
    const key = long ? longKeyOf(s) : keyOf(s);
    if (seen.has(key)) continue; seen.add(key);
    const openH = (naiveMs(nowNaive) - naiveMs(s.clockIn)) / 36e5;
    if (!long && openH <= OPEN_HOURS) { out.skipped.push({ key, why: 'still within ' + OPEN_HOURS + ' hours of clocking in' }); continue; }
    if (openH > MAX_AGE_DAYS * 24) { out.skipped.push({ key, why: 'older than ' + MAX_AGE_DAYS + ' days' }); continue; }
    if (marks[key]) { out.skipped.push({ key, why: 'already texted' }); continue; }
    // already texted as a no clock-out while it was open: that text and its form link already ask for the hours
    if (long && marks[keyOf(s)]) { out.skipped.push({ key, why: 'already texted while it had no clock out' }); continue; }
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
    const words = texts({ clockIn: s.clockIn, clockOut: long ? s.clockOut : null, consumerName, attendantName, sendNaive: nowNaive });
    const to = [];
    const cp = c ? digits10(c.phone) : '';
    to.push(cp ? { who: 'consumer', name: consumerName, phone10: cp, text: words.consumer } : { who: 'consumer', name: consumerName, missing: c ? 'no phone on the consumer' : 'consumer not found in the hub' });
    // HER WORD 2026-11-17 "the consumer is the boss": the text goes to the consumer only; the attendant's
    // name is in it so the consumer knows which shift. Nothing is sent to the attendant.
    out.due.push({ key, kind: long ? 'long' : 'open', clockIn: String(s.clockIn).slice(0, 19), clockOut: long ? s.clockOut : null, consumerName, attendantName, to });
  }
  return out;
}

// deps = { db: { query(text, params) -> { rows } }, sms(phone10, text, name) -> Promise, now?: () => ms,
//          fixes?: clockout.js createClockout(...) for the private form links and the office card }
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
    // Shifts the newest email shows clocked out: their form links close (fixed in WellSky some other way).
    // A shift that was clocked out but ran overnight or over 8 hours still needs the form: its link stays open.
    if (deps.fixes) sum.closed = await deps.fixes.closeFixed(joinSplits(authLogs.shifts || []).filter(x => x.clockOut && !isLong(x)).map(keyOf));
    for (const d of P.due) {
      const rec = { at: new Date(t).toISOString(), kind: d.kind, clockIn: d.clockIn, clockOut: d.clockOut || undefined, consumer: d.consumerName, attendant: d.attendantName, live, to: [] };
      if (deps.fixes) {
        try {
          const link = await deps.fixes.register({ key: d.key, consumer: d.consumerName, attendant: d.attendantName, clockIn: d.clockIn,
                                                  sent: d.to.every(r => r.missing) ? 'no_phone' : (live ? 'sent' : 'practice') });
          if (link) { rec.link = true; for (const r of d.to) if (r.text) r.text = texts({ clockIn: d.clockIn, clockOut: d.clockOut, consumerName: d.consumerName, attendantName: d.attendantName, sendNaive: c.naive, link }).consumer; }
        } catch (e) { rec.linkError = String((e && e.message) || e).slice(0, 200); }   // the text still goes, with the plain form link
      }
      for (const r of d.to) {
        if (r.missing) { rec.to.push({ who: r.who, name: r.name, missing: r.missing }); sum.missing++; continue; }
        if (!live) { rec.to.push({ who: r.who, name: r.name, phone10: r.phone10, text: r.text, practice: true }); sum.practice++; continue; }
        try { await deps.sms(r.phone10, r.text, r.name); rec.to.push({ who: r.who, name: r.name, phone10: r.phone10, text: r.text, sent: true }); sum.sent++; }
        catch (e) { rec.to.push({ who: r.who, name: r.name, phone10: r.phone10, text: r.text, error: String((e && e.message) || e).slice(0, 200) }); sum.failed++;
                    if (deps.fixes && rec.link) await deps.fixes.textResult(d.key, 'failed', String((e && e.message) || e).slice(0, 300)).catch(() => {}); }
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
