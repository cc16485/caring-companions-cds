// Forgot to clock out (2026-11-17, Samantha: "text someone if they don't clock out and prompt them to
// complete the evv form and then you fix the shift based on the evv form info").
//
// 1. FIND   The hourly sweep reads the care logs the hub already keeps: agency_data 'careLogs' (the daily
//           6am WellSky Analytics email), 'careLogsUploaded' (WellSky exports uploaded by hand) and
//           wellskyCheck.open (the old Chrome report, when it runs). A shift is "never clocked out" when it
//           still had no clock out in data taken at least open_hours after the clock in. The daily email only
//           runs to midnight, so an evening shift is caught the morning after next (never a shift that may
//           still be going on overnight).
// 2. TEXT   The attendant gets one short text with a private link to the EVV Correction Form
//           (hub.caringcds.com/evv-form?fix=...), only between text_from and text_until Central. Who: the
//           attendant WellSky names, or else the one active attendant the hub roster has for that consumer.
//           No phone or no clear attendant: no text, the office card says what is missing.
// 3. ANSWER The form, already filled in with the shift, asks the real clock out time, the reason and the
//           tasks, and both the attendant and the consumer sign (the CDS consumer is the employer and must
//           verify the time). It is saved as a normal evv_submissions row, linked to this shift.
// 4. FIX    The office card shows the proposed fix. Approve shows exactly what to change in WellSky (WellSky
//           has no write access for us: its Connect API is paid and contract-gated), then "Done, fixed in
//           WellSky" closes it. Not approved = denied; the shift stays unpaid (her rule).
//
// Switch: cds_match_settings 'clockout_texts'.live, starts false. While off everything above still runs and
// every text is written to Messages as practice; nothing is sent. Texts reach attendants only, never the office.
// No em dashes in anything a person reads (her rule).

export const AGENCY_ID = 'caring-companions-cds';
export const SETTING = 'clockout_texts';
export const DEFAULTS = { live: false, open_hours: 12, look_back_days: 7, text_from: 9, text_until: 19, text_days: [0, 1, 2, 3, 4, 5, 6], link_days: 10 };
export const LINK = 'hub.caringcds.com/evv-form?fix=';
export const TZ = 'America/Chicago';
// DRAFT wording, waiting for her OK before the switch goes on (her rule: texts short).
export const SMS = 'Hi {first}, it\'s Caring Companions CDS. You did not clock out of your shift with {consumer} on {day}. To be paid for it, please fill out this form: {link}';
export const SMS_MAX = 200;
export const REASONS = ['Forgot to clock out', 'Phone dead / no battery', 'App crashed or technical error', 'No cell service at consumer location',
  'WellSky app error / update disruption', 'Landline EVV not available', 'Other'];

export class ClockoutError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

// ---------- names and times ----------
// WellSky writes "Last, First"; the hub writes "First Last". One key for both: the words, sorted.
export const display = s => { const m = /^([^,]+),\s*(.+)$/.exec(String(s || '').trim()); return m ? m[2].trim() + ' ' + m[1].trim() : String(s || '').trim(); };
export const nameKey = s => display(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const firstWord = s => display(s).split(/\s+/)[0] || '';
// Naive Central times ("2026-11-10T17:47:00") are compared as if they were UTC: same clock, no zone.
export const naiveMs = s => Date.parse(String(s || '').slice(0, 19).padEnd(19, ':00').slice(0, 19) + 'Z');
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
// Payroll: Sunday to Saturday, reviewed Tuesday, locks Wednesday 3pm, paid Thursday.
export function payroll(naiveDay) {
  const sat = addDaysIso(naiveDay, 6 - dow(naiveDay));
  return { weekEnd: sat, locks: addDaysIso(sat, 4), paid: addDaysIso(sat, 5) };
}
export const shiftKey = (consumer, clockIn) => nameKey(consumer) + '|' + String(clockIn || '').slice(0, 16);

// ---------- 1. which shifts were never clocked out ----------
// stores = { careLogs, careLogsUploaded, wellskyCheck } as saved in agency_data.
export function openShifts(stores, nowMs, cfg = DEFAULTS) {
  const by = new Map();
  const add = (x, cutoff, source) => {
    if (!x || !x.consumer || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(x.clockIn || ''))) return;
    const k = shiftKey(x.consumer, x.clockIn);
    const s = by.get(k) || { key: k, consumer: display(x.consumer), clockIn: String(x.clockIn).slice(0, 16) + ':00', attendant: '', closed: false, cutoff: '', sources: [] };
    if (x.clockOut) s.closed = true;
    else if (cutoff && cutoff > s.cutoff) s.cutoff = cutoff;
    if (x.attendant && !s.attendant) s.attendant = display(x.attendant);
    if (!s.sources.includes(source)) s.sources.push(source);
    by.set(k, s);
  };
  const cl = stores.careLogs || {};
  // The email arrives in the morning and runs to the end of the day before: its data stops at midnight.
  for (const x of cl.logs || []) add(x, x.seen ? centralNaive(Date.parse(x.seen + (/[zZ]|[+-]\d\d:?\d\d$/.test(x.seen) ? '' : 'Z'))).slice(0, 10) + 'T00:00:00' : '', 'email');
  const up = stores.careLogsUploaded || {};
  const upAt = up.at ? centralNaive(Date.parse(up.at)) : '';
  for (const x of up.logs || []) add(x, upAt, 'upload');
  const op = stores.wellskyCheck && stores.wellskyCheck.open;
  if (op && op.rows) for (const r of op.rows) add({ consumer: r.consumer, attendant: r.attendant, clockIn: r.clockIn }, String(op.pulledLocal || '').slice(0, 19), 'wellsky');
  const now = centralNaive(nowMs), since = addDaysIso(now.slice(0, 10), -cfg.look_back_days);
  return [...by.values()]
    .filter(s => !s.closed && s.cutoff && s.clockIn.slice(0, 10) >= since)
    .filter(s => naiveMs(s.cutoff) - naiveMs(s.clockIn) >= cfg.open_hours * 36e5)
    .sort((a, b) => a.clockIn < b.clockIn ? -1 : 1);
}
// Shifts that now have a clock out somewhere (fixed in WellSky, or the attendant did it late).
export function closedKeys(stores) {
  const out = new Set();
  for (const src of [(stores.careLogs || {}).logs, (stores.careLogsUploaded || {}).logs]) for (const x of src || []) if (x && x.clockOut && x.consumer) out.add(shiftKey(x.consumer, x.clockIn));
  return out;
}

// ---------- 2. who to text ----------
const ten = p => { const d = String(p || '').replace(/\D/g, ''); const t = d.length === 11 && d[0] === '1' ? d.slice(1) : d; return t.length === 10 ? '+1' + t : ''; };
// roster = agency_data 'attendants' [{ name, phone, consumer, status }]; pool = attendant_pool rows.
export function whoWorked(shift, roster = [], pool = []) {
  let name = shift.attendant, guessed = false;
  if (!name) {
    const mine = roster.filter(a => a && a.name && String(a.status || 'active').toLowerCase() !== 'inactive' && nameKey(a.consumer) === nameKey(shift.consumer));
    if (mine.length !== 1) return { name: '', phone: '', why: mine.length ? 'The hub lists ' + mine.length + ' attendants for ' + shift.consumer + '. Check WellSky for who worked it.' : 'No active attendant for ' + shift.consumer + ' on the hub roster.' };
    name = display(mine[0].name); guessed = true;
  }
  const k = nameKey(name);
  const phones = [...new Set([
    ...roster.filter(a => a && nameKey(a.name) === k).map(a => ten(a.phone)),
    ...pool.filter(p => p && !p.archived && nameKey([p.first_name, p.last_name].join(' ')) === k).map(p => ten(p.phone)),
  ].filter(Boolean))];
  if (phones.length > 1) return { name, guessed, phone: '', why: 'Two different phones on file for ' + name + '.' };
  if (!phones.length) return { name, guessed, phone: '', why: 'No phone on file for ' + name + '. Add it on their hub profile.' };
  return { name, guessed, phone: phones[0], why: '' };
}

export function smsFor(row, link) {
  return SMS.replace('{first}', firstWord(row.attendant)).replace('{consumer}', firstWord(row.consumer))
    .replace('{day}', shortDay(row.clock_in)).replace('{link}', link);
}
export const textHoursOpen = (nowMs, cfg) => { const n = centralNaive(nowMs); const h = +n.slice(11, 13);
  return (cfg.text_days || DEFAULTS.text_days).includes(dow(n)) && h >= cfg.text_from && h < cfg.text_until; };

// ---------- the form answer ----------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SIG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
export function checkAnswer(row, a, nowMs) {
  a = a || {};
  const outDay = String(a.clockOutDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(outDay) || !HHMM.test(String(a.clockOut || ''))) throw new ClockoutError('Please put the day and time you really clocked out.');
  const clockOut = outDay + 'T' + a.clockOut + ':00';
  const mins = (naiveMs(clockOut) - naiveMs(row.clock_in)) / 6e4;
  if (mins <= 0) throw new ClockoutError('The clock out time has to be after you clocked in (' + clock(row.clock_in) + ' on ' + shortDay(row.clock_in) + ').');
  if (mins > 24 * 60) throw new ClockoutError('That is more than 24 hours after you clocked in. Please check the day, or call the office.');
  if (naiveMs(clockOut) > naiveMs(centralNaive(nowMs)) + 5 * 6e4) throw new ClockoutError('That time has not happened yet. Please check the day and time.');
  const reason = String(a.reason || '').trim();
  if (!REASONS.includes(reason)) throw new ClockoutError('Please pick a reason.');
  const other = String(a.reasonOther || '').trim().slice(0, 300);
  if (reason === 'Other' && !other) throw new ClockoutError('Please say what happened.');
  const tasks = (Array.isArray(a.tasks) ? a.tasks : []).map(t => String(t).slice(0, 60)).slice(0, 40);
  for (const [k, who] of [['sigAttendant', 'Your signature'], ['sigConsumer', 'The consumer\'s signature']]) {
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
    'Add a comment on the care log: "EVV correction form signed by attendant and consumer, reason: ' + a.reason + '."',
  ];
}

// ---------- the parts that touch the database ----------
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function newToken() { const b = crypto.getRandomValues(new Uint8Array(16)); return Array.from(b, x => B62[x % 62]).join(''); }
export async function tokenHash(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t)));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}
const maskPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 4 ? '(***) ***-' + d.slice(-4) : ''; };
const OPEN = ['found', 'no_phone', 'no_attendant', 'texted'];
const firstName = e => { const n = String(e || '').split('@')[0].replace(/[^a-z]/gi, ''); return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; };

// deps: { db: { query(text, params) -> { rows } }, send({ to, body }) (GoHighLevel SMS, CDS only), now?: () => ms }
export function createClockout(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p = []) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const config = async () => { const r = await one(`select value from cds_match_settings where key=$1`, [SETTING]); return Object.assign({}, DEFAULTS, r && r.value, { ready: !!r }); };
  async function store(keys) {
    const rows = await q(`select data_key, data_value from agency_data where agency_id=$1 and data_key = any($2)`, [AGENCY_ID, keys]);
    const o = {}; rows.forEach(r => { o[r.data_key] = r.data_value; }); return o;
  }

  async function link(row, cfg) {
    const t = newToken();
    await q(`update cds_clockout_fixes set token_hash=$2, link_expires_at=$3, updated_at=now() where id=$1`,
      [row.id, await tokenHash(t), new Date(now() + cfg.link_days * 864e5).toISOString()]);
    return LINK + t;
  }

  // The hourly job.
  async function sweep() {
    const cfg = await config();
    if (!cfg.ready) return { ok: false, error: 'The setting ' + SETTING + ' is not set up yet (run the SQL first).' };
    const s = await store(['careLogs', 'careLogsUploaded', 'wellskyCheck', 'attendants']);
    const pool = await q(`select first_name, last_name, phone, archived from attendant_pool`).catch(() => []);
    const found = openShifts(s, now(), cfg);
    let added = 0;
    for (const sh of found) {
      const who = whoWorked(sh, Array.isArray(s.attendants) ? s.attendants : [], pool);
      const status = !who.name ? 'no_attendant' : !who.phone ? 'no_phone' : 'found';
      const r = await one(`insert into cds_clockout_fixes (shift_key, consumer, attendant, attendant_guessed, clock_in, sources, phone, status, problem)
                           values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) on conflict (shift_key) do nothing returning id`,
        [sh.key, sh.consumer, who.name || null, !!who.guessed, sh.clockIn, JSON.stringify(sh.sources), who.phone || null, status, who.why || null]);
      if (r) added++;
      // A phone added to the hub since: try again.
      else if (who.phone) await q(`update cds_clockout_fixes set phone=$2, attendant=coalesce(attendant,$3), status='found', problem=null, updated_at=now()
                                   where shift_key=$1 and status in ('no_phone','no_attendant')`, [sh.key, who.phone, who.name]);
    }
    // Fixed in WellSky some other way: close it, unless the attendant already answered (the office decides those).
    const closed = closedKeys(s);
    let autoClosed = 0;
    for (const r of await q(`select id, shift_key from cds_clockout_fixes where status = any($1)`, [OPEN])) {
      if (closed.has(r.shift_key)) { await q(`update cds_clockout_fixes set status='closed', note='WellSky now shows a clock out.', updated_at=now() where id=$1`, [r.id]); autoClosed++; }
    }
    // Texts: one per shift, in text hours only (later ones wait for the next run).
    const texts = [];
    if (textHoursOpen(now(), cfg)) {
      for (const row of await q(`select * from cds_clockout_fixes where status='found' order by clock_in`)) {
        const body = smsFor(shape(row), await link(row, cfg));
        let status = 'practice', error = null;
        if (cfg.live) {
          try { await deps.send({ to: row.phone, body }); status = 'sent'; }
          catch (e) { status = 'failed'; error = String((e && e.message) || e).slice(0, 300); }
        }
        await q(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by)
                 values ('caregiver','sms','clockout_fix',$1,$2,$3,$4,true,'cds-clockout')`, [maskPhone(row.phone), body, status, error]);
        await q(`update cds_clockout_fixes set status='texted', texted_at=$2, text_status=$3, text_error=$4, updated_at=now() where id=$1`,
          [row.id, new Date(now()).toISOString(), status, error]);
        texts.push(status);
      }
    }
    return { ok: true, live: !!cfg.live, open: found.length, added, autoClosed, texts: texts.length, sent: texts.filter(x => x === 'sent').length,
             practice: texts.filter(x => x === 'practice').length, failed: texts.filter(x => x === 'failed').length };
  }

  // ---------- the form (public: only the private link) ----------
  async function byToken(token) {
    if (!/^[0-9A-Za-z]{16}$/.test(String(token || ''))) throw new ClockoutError('This link is not complete. Please open the whole link from the text.', 404);
    const row = await one(`select * from cds_clockout_fixes where token_hash=$1`, [await tokenHash(token)]);
    if (!row) throw new ClockoutError('This link is not working. Please call the office at (417) 218-2888.', 404);
    return row;
  }
  const naiveOf = v => v instanceof Date ? v.toISOString().slice(0, 19) : String(v).replace(' ', 'T').slice(0, 19);
  const shape = row => Object.assign({}, row, { clock_in: naiveOf(row.clock_in) });
  async function form(body) {
    const row = shape(await byToken(body && body.token));
    const expired = row.link_expires_at && Date.parse(row.link_expires_at) < now();
    const state = row.status === 'texted' ? (expired ? 'expired' : 'open') : ['answered', 'approved', 'fixed'].includes(row.status) ? 'answered' : 'closed';
    const shift = { attendant: row.attendant, consumer: row.consumer, date: row.clock_in.slice(0, 10), clockIn: row.clock_in.slice(11, 16),
                    when: shortDay(row.clock_in) + ' at ' + clock(row.clock_in), reasons: REASONS };
    if (body.action === 'form_get') return { ok: true, state, shift };
    if (state !== 'open') throw new ClockoutError(state === 'answered' ? 'This form was already sent. Thank you.' : state === 'expired' ? 'This link has expired. Please call the office at (417) 218-2888.' : 'This shift no longer needs a form. Questions? Call (417) 218-2888.', 409);
    const a = checkAnswer(row, body.answer, now());
    const today = centralNaive(now()).slice(0, 10);
    // Saved like every other EVV form (the hub's EVV forms page, the 8am email and the office email read it).
    const evv = await one(`insert into evv_submissions (agency_id, attendant, consumer, visitdate, submitdate, orig_in, orig_out, new_in, new_out, reason,
                             tasks_performed, notes, sig_attendant, sig_attendant_date, sig_consumer, sig_consumer_date, clockout_fix_id)
                           values ($1,$2,$3,$4,$5,$6,null,$6,$7,$8,$9::jsonb,$10,$11,$5,$12,$5,$13) returning id`,
      [AGENCY_ID, row.attendant, row.consumer, row.clock_in.slice(0, 10), today, row.clock_in.slice(11, 16), a.clockOut.slice(11, 16), a.reason,
       JSON.stringify(a.tasks), [a.clockOut.slice(0, 10) !== row.clock_in.slice(0, 10) ? 'Clocked out the next day, ' + shortDay(a.clockOut) + '.' : '', a.notes].filter(Boolean).join(' ') || null,
       a.sigAttendant, a.sigConsumer, row.id]);
    const answer = { clockOut: a.clockOut, hours: a.hours, reason: a.reason, tasks: a.tasks.length, notes: a.notes };
    const upd = await one(`update cds_clockout_fixes set status='answered', evv_id=$2, answer=$3::jsonb, answered_at=$4, updated_at=now() where id=$1 and status='texted' returning id`,
      [row.id, evv.id, JSON.stringify(answer), new Date(now()).toISOString()]);
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
    const p = payroll(r.clock_in.slice(0, 10));
    const out = { id: r.id, consumer: r.consumer, attendant: r.attendant || '', guessed: !!r.attendant_guessed, clockIn: r.clock_in,
                  when: shortDay(r.clock_in) + ' at ' + clock(r.clock_in), status: r.status, problem: r.problem || '', textStatus: r.text_status || '',
                  textError: r.text_error || '', textedAt: r.texted_at, phone: maskPhone(r.phone), payroll: p, note: r.note || '',
                  decidedBy: firstName(r.decided_by), fixedBy: firstName(r.fixed_by), evvId: r.evv_id || null };
    if (r.answer) {
      out.answer = Object.assign({}, r.answer, { clockOutWhen: shortDay(r.answer.clockOut) + ' at ' + clock(r.answer.clockOut) });
      out.steps = wellskySteps(r);
      out.long = r.answer.hours > 12;
    }
    return out;
  }
  async function list() {
    const cfg = await config();
    const rows = await q(`select * from cds_clockout_fixes where status not in ('fixed','denied','closed') or updated_at > now() - interval '7 days' order by clock_in desc limit 100`);
    return { ok: true, live: !!cfg.live, ready: cfg.ready, textHours: { from: cfg.text_from, until: cfg.text_until }, cards: rows.map(card) };
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
      return { ok: true, card: card(Object.assign({}, row, { status: 'approved', decided_by: email })) };
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
    // A link the office sends itself from the office line (no phone on file, or a second try).
    if (action === 'link') {
      if (!OPEN.includes(row.status)) throw new ClockoutError('This one already has an answer.');
      if (!row.attendant && !String(body.attendant || '').trim()) throw new ClockoutError('Type who worked the shift first.');
      const cfg = await config();
      if (!row.attendant) await q(`update cds_clockout_fixes set attendant=$2, attendant_guessed=false where id=$1`, [row.id, display(String(body.attendant).trim()).slice(0, 80)]);
      const url = await link(row, cfg);
      await q(`update cds_clockout_fixes set status='texted', texted_at=$2, text_status='office', text_error=null, updated_at=now() where id=$1`, [row.id, at]);
      await audit('link', {});
      return { ok: true, url: 'https://' + url };
    }
    throw new ClockoutError('Unknown request');
  }

  return { sweep, form, act, list, config };
}
