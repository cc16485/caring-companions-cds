// The filled-in EVV form and the office card for never-clocked-out shifts (2026-11-17, Samantha: "you fix the
// shift based on the evv form info"). Works with the never-clocked-out texts (open-shift-texts.js, switch
// open_shift_texts): that text goes to the CONSUMER only (her word: the consumer is the boss).
//
// 1. LINK   For each shift the texts job finds, a private link (hub.caringcds.com/evv-form?fix=...) goes in the
//           text in place of the plain form link. The form opens already filled in with the shift.
// 2. ANSWER The real clock out time, the reason and the tasks. Both the consumer and the attendant sign. Saved as
//           a normal evv_submissions row, linked to the shift.
// 3. FIX    The office card on the EVV forms page shows the proposed fix. Approve shows exactly what to change in
//           WellSky (we have no write access: WellSky's Connect API is paid and contract-gated), then "Done, fixed
//           in WellSky" closes it. Not approved: the shift stays unpaid (her rule).
// A shift WellSky later shows with a clock out closes on its own. No clock in at all is left alone (her word).
// No em dashes in anything a person reads (her rule).

export const AGENCY_ID = 'caring-companions-cds';
export const LINK = 'hub.caringcds.com/evv-form?fix=';
export const LINK_DAYS = 10;
export const TZ = 'America/Chicago';
export const REASONS = ['Forgot to clock out', 'Phone dead / no battery', 'App crashed or technical error', 'No cell service at consumer location',
  'WellSky app error / update disruption', 'Landline EVV not available', 'Other'];

export class ClockoutError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

// ---------- names and times ----------
export const display = s => { const m = /^([^,]+),\s*(.+)$/.exec(String(s || '').trim()); return m ? m[2].trim() + ' ' + m[1].trim() : String(s || '').trim(); };
// Naive Central times ("2026-11-10T17:47:00") are compared as if they were UTC: same clock, no zone.
export const naiveMs = s => Date.parse(String(s || '').slice(0, 19) + 'Z');
export function centralNaive(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = naive => new Date(naiveMs(naive.slice(0, 10) + 'T12:00:00')).getUTCDay();
export const shortDay = naive => DAYS[dow(naive)] + ' ' + (+naive.slice(5, 7)) + '/' + (+naive.slice(8, 10));
export const clock = naive => { const h = +naive.slice(11, 13); return ((h % 12) || 12) + ':' + naive.slice(14, 16) + ' ' + (h < 12 ? 'AM' : 'PM'); };
const addDaysIso = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// Payroll: Sunday to Saturday, paid Thursday. HER RULE: the EVV form must be in by Saturday at midnight.
export function payroll(naiveDay) {
  const sat = addDaysIso(naiveDay, 6 - dow(naiveDay));
  return { weekEnd: sat, locks: addDaysIso(sat, 4), paid: addDaysIso(sat, 5) };
}

// ---------- the form answer ----------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SIG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
export function checkAnswer(row, a, nowMs) {
  a = a || {};
  const outDay = String(a.clockOutDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(outDay) || !HHMM.test(String(a.clockOut || ''))) throw new ClockoutError('Please put the day and time the shift really ended.');
  const clockOut = outDay + 'T' + a.clockOut + ':00';
  const mins = (naiveMs(clockOut) - naiveMs(row.clock_in)) / 6e4;
  if (mins <= 0) throw new ClockoutError('The clock out time has to be after the clock in (' + clock(row.clock_in) + ' on ' + shortDay(row.clock_in) + ').');
  if (mins > 24 * 60) throw new ClockoutError('That is more than 24 hours after the clock in. Please check the day, or call the office.');
  if (naiveMs(clockOut) > naiveMs(centralNaive(nowMs)) + 5 * 6e4) throw new ClockoutError('That time has not happened yet. Please check the day and time.');
  const reason = String(a.reason || '').trim();
  if (!REASONS.includes(reason)) throw new ClockoutError('Please pick a reason.');
  const other = String(a.reasonOther || '').trim().slice(0, 300);
  if (reason === 'Other' && !other) throw new ClockoutError('Please say what happened.');
  const tasks = (Array.isArray(a.tasks) ? a.tasks : []).map(t => String(t).slice(0, 60)).slice(0, 40);
  for (const [k, who] of [['sigConsumer', 'The consumer\'s signature'], ['sigAttendant', 'The attendant\'s signature']]) {
    if (!SIG.test(String(a[k] || '')) || String(a[k]).length < 200) throw new ClockoutError(who + ' is needed.');
    if (String(a[k]).length > 400000) throw new ClockoutError(who + ' is too big. Please clear it and sign again.');
  }
  return { clockOut, hours: Math.round(mins / 6) / 10, reason: reason === 'Other' ? other : reason, tasks, notes: String(a.notes || '').trim().slice(0, 1000),
           sigAttendant: a.sigAttendant, sigConsumer: a.sigConsumer };
}

// What to change in WellSky, word for word. WellSky gives us no way to write, so a person does it.
export function wellskySteps(row) {
  const a = row.answer || {};
  return [
    'In WellSky open Clients, then ' + row.consumer + ', then Daily Care Logs, and go to ' + shortDay(row.clock_in) + '.',
    'Open the care log for ' + (row.attendant || 'the attendant') + ' that clocked in at ' + clock(row.clock_in) + ' (it says In Progress) and press Edit.',
    'Leave Clock In at ' + clock(row.clock_in) + '. Set Clock Out to ' + shortDay(a.clockOut) + ' ' + clock(a.clockOut) + ' (' + a.hours + ' hours).',
    'Set the status to Complete and Save.',
    'Add a comment on the care log: "EVV correction form signed by consumer and attendant, reason: ' + a.reason + '."',
  ];
}

// ---------- the database ----------
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function newToken() { const b = crypto.getRandomValues(new Uint8Array(16)); return Array.from(b, x => B62[x % 62]).join(''); }
export async function tokenHash(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t)));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}
const OPEN = ['waiting', 'no_phone'];
const firstName = e => { const n = String(e || '').split('@')[0].replace(/[^a-z]/gi, ''); return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; };

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms }
export function createClockout(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p = []) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const setting = async k => { const r = await one(`select value from cds_match_settings where key=$1`, [k]); return r ? r.value : null; };

  async function newLink(id) {
    const t = newToken();
    await q(`update cds_clockout_fixes set token_hash=$2, link_expires_at=$3, updated_at=now() where id=$1`,
      [id, await tokenHash(t), new Date(now() + LINK_DAYS * 864e5).toISOString()]);
    return 'https://' + LINK + t;
  }

  // Called by the texts job for each shift it texts (or would text, in practice). Returns the private link.
  // shift = { key, consumer, attendant, clockIn, sent: 'practice'|'sent'|'failed'|'no_phone', error }
  async function register(shift) {
    const status = shift.sent === 'no_phone' ? 'no_phone' : 'waiting';
    const row = await one(`insert into cds_clockout_fixes (shift_key, consumer, attendant, clock_in, status, text_status, text_error, texted_at)
                           values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (shift_key) do nothing returning id`,
      [shift.key, display(shift.consumer), shift.attendant ? display(shift.attendant) : null, String(shift.clockIn).slice(0, 16) + ':00',
       status, shift.sent === 'no_phone' ? null : (shift.sent || 'practice'), shift.error || null, new Date(now()).toISOString()]);
    if (!row) return null;   // already has a link
    return newLink(row.id);
  }
  // The texts job's outcome, after sending.
  async function textResult(key, sent, error) {
    await q(`update cds_clockout_fixes set text_status=$2, text_error=$3, updated_at=now() where shift_key=$1`, [key, sent, error || null]);
  }
  // Shifts the newest WellSky email shows with a clock out: fixed in WellSky some other way.
  async function closeFixed(keys) {
    if (!keys || !keys.length) return 0;
    const r = await q(`update cds_clockout_fixes set status='closed', note='WellSky now shows a clock out.', updated_at=now()
                       where shift_key = any($1) and status = any($2) returning id`, [keys, OPEN]);
    return r.length;
  }

  // ---------- the form (public: only the private link) ----------
  const shape = row => Object.assign({}, row, { clock_in: String(row.clock_in).replace(' ', 'T').slice(0, 19) });
  async function byToken(token) {
    if (!/^[0-9A-Za-z]{16}$/.test(String(token || ''))) throw new ClockoutError('This link is not complete. Please open the whole link from the text.', 404);
    const row = await one(`select * from cds_clockout_fixes where token_hash=$1`, [await tokenHash(token)]);
    if (!row) throw new ClockoutError('This link is not working. Please call the office at (417) 218-2888.', 404);
    return shape(row);
  }
  async function form(body) {
    const row = await byToken(body && body.token);
    const expired = row.link_expires_at && Date.parse(row.link_expires_at) < now();
    const state = OPEN.includes(row.status) ? (expired ? 'expired' : 'open') : ['answered', 'approved', 'fixed'].includes(row.status) ? 'answered' : 'closed';
    const p = payroll(row.clock_in.slice(0, 10));
    const shift = { attendant: row.attendant || '', consumer: row.consumer, date: row.clock_in.slice(0, 10), clockIn: row.clock_in.slice(11, 16),
                    when: shortDay(row.clock_in) + ' at ' + clock(row.clock_in), due: shortDay(p.weekEnd + 'T00:00:00'), reasons: REASONS };
    if (body.action === 'form_get') return { ok: true, state, shift };
    if (state !== 'open') throw new ClockoutError(state === 'answered' ? 'This form was already sent. Thank you.' : state === 'expired' ? 'This link has expired. Please call the office at (417) 218-2888.' : 'This shift no longer needs a form. Questions? Call (417) 218-2888.', 409);
    const attendant = row.attendant || String(body.answer && body.answer.attendant || '').trim().slice(0, 80);
    if (!attendant) throw new ClockoutError('Please put the attendant\'s name.');
    const a = checkAnswer(row, body.answer, now());
    const today = centralNaive(now()).slice(0, 10);
    // Saved like every other EVV form (the hub's EVV forms page, the 8am email and the office email read it).
    const evv = await one(`insert into evv_submissions (agency_id, attendant, consumer, visitdate, submitdate, orig_in, orig_out, new_in, new_out, reason,
                             tasks_performed, notes, sig_attendant, sig_attendant_date, sig_consumer, sig_consumer_date, clockout_fix_id)
                           values ($1,$2,$3,$4,$5,$6,null,$6,$7,$8,$9::jsonb,$10,$11,$5,$12,$5,$13) returning id`,
      [AGENCY_ID, attendant, row.consumer, row.clock_in.slice(0, 10), today, row.clock_in.slice(11, 16), a.clockOut.slice(11, 16), a.reason,
       JSON.stringify(a.tasks), [a.clockOut.slice(0, 10) !== row.clock_in.slice(0, 10) ? 'Clocked out the next day, ' + shortDay(a.clockOut) + '.' : '', a.notes].filter(Boolean).join(' ') || null,
       a.sigAttendant, a.sigConsumer, row.id]);
    const answer = { clockOut: a.clockOut, hours: a.hours, reason: a.reason, tasks: a.tasks.length, notes: a.notes };
    const upd = await one(`update cds_clockout_fixes set status='answered', attendant=coalesce(attendant,$5), evv_id=$2, answer=$3::jsonb, answered_at=$4, updated_at=now()
                           where id=$1 and status = any($6) returning id`,
      [row.id, evv.id, JSON.stringify(answer), new Date(now()).toISOString(), attendant, OPEN]);
    if (!upd) { await q(`delete from evv_submissions where id=$1`, [evv.id]); throw new ClockoutError('This form was already sent. Thank you.', 409); }
    return { ok: true, id: evv.id, hours: a.hours };
  }

  // ---------- the office card (signed-in CDS office staff) ----------
  async function staffList() {
    const rows = await q(`select key, value from cds_match_settings where key in ('staff_emails','switch_owners')`);
    return [...new Set(rows.flatMap(r => Array.isArray(r.value) ? r.value : []).map(e => String(e).trim().toLowerCase()))];
  }
  function card(r) {
    r = shape(r);
    const out = { id: r.id, consumer: r.consumer, attendant: r.attendant || '', clockIn: r.clock_in,
                  when: shortDay(r.clock_in) + ' at ' + clock(r.clock_in), status: r.status, textStatus: r.text_status || '', textError: r.text_error || '',
                  payroll: payroll(r.clock_in.slice(0, 10)), note: r.note || '', decidedBy: firstName(r.decided_by), fixedBy: firstName(r.fixed_by) };
    if (r.answer) {
      out.answer = Object.assign({}, r.answer, { clockOutWhen: shortDay(r.answer.clockOut) + ' at ' + clock(r.answer.clockOut) });
      out.steps = wellskySteps(r);
      out.long = r.answer.hours > 12;
    }
    return out;
  }
  async function list() {
    const sw = await setting('open_shift_texts');
    const rows = await q(`select * from cds_clockout_fixes where status not in ('fixed','denied','closed') or updated_at > now() - interval '7 days' order by clock_in desc limit 100`);
    return { ok: true, live: !!(sw && sw.live === true), cards: rows.map(card) };
  }
  async function act(email, body) {
    email = String(email || '').toLowerCase();
    if (!(await staffList()).includes(email)) throw new ClockoutError('This sign-in is not on the CDS office staff list.', 403);
    const action = String(body && body.action || 'list');
    if (action === 'list') return list();
    const row = await one(`select * from cds_clockout_fixes where id::text=$1`, [String(body.id || '')]);
    if (!row) throw new ClockoutError('That shift is not on the list any more. Refresh the page.', 404);
    const at = new Date(now()).toISOString();
    const audit = (what, detail) => q(`insert into cds_audit (actor, action, target, detail) values ($1, $2, $3, $4::jsonb)`, [email, 'clockout_' + what, row.id, JSON.stringify(detail || {})]);
    if (action === 'approve') {
      if (row.status !== 'answered') throw new ClockoutError('Only an answered form can be approved.');
      await q(`update cds_clockout_fixes set status='approved', decided_by=$2, decided_at=$3, updated_at=now() where id=$1`, [row.id, email, at]);
      if (row.evv_id) await q(`update evv_submissions set processed=true where id=$1`, [row.evv_id]);
      await audit('approve', row.answer);
      return { ok: true };
    }
    if (action === 'deny') {
      if (!['answered', 'approved'].includes(row.status)) throw new ClockoutError('Only an answered form can be turned down.');
      const note = String(body.note || '').trim().slice(0, 300);
      await q(`update cds_clockout_fixes set status='denied', decided_by=$2, decided_at=$3, note=$4, updated_at=now() where id=$1`, [row.id, email, at, note || 'Not approved: the shift stays unpaid.']);
      if (row.evv_id) await q(`update evv_submissions set processed=true where id=$1`, [row.evv_id]);
      await audit('deny', { note });
      return { ok: true };
    }
    if (action === 'done') {
      if (row.status !== 'approved') throw new ClockoutError('Approve it first.');
      await q(`update cds_clockout_fixes set status='fixed', fixed_by=$2, fixed_at=$3, updated_at=now() where id=$1`, [row.id, email, at]);
      await audit('fixed_in_wellsky', row.answer);
      return { ok: true };
    }
    if (action === 'skip') {
      if (!OPEN.includes(row.status)) throw new ClockoutError('This one already has an answer. Approve or turn it down instead.');
      await q(`update cds_clockout_fixes set status='closed', note=$2, updated_at=now() where id=$1`, [row.id, 'Not needed (' + firstName(email) + ').']);
      await audit('skip', {});
      return { ok: true };
    }
    // A new link the office sends itself from the office line (no consumer phone, or a second try).
    if (action === 'link') {
      if (!OPEN.includes(row.status)) throw new ClockoutError('This one already has an answer.');
      const url = await newLink(row.id);
      await q(`update cds_clockout_fixes set status='waiting', text_status='office', text_error=null, updated_at=now() where id=$1`, [row.id]);
      await audit('link', {});
      return { ok: true, url };
    }
    throw new ClockoutError('Unknown request');
  }

  return { register, textResult, closeFixed, form, act, list };
}
