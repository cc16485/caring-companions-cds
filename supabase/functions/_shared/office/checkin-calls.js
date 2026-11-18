// Monthly check-in calls (2026-11-17, Samantha): "Set it up for consumers monthly check in calls".
// Her picks the same day: the call COUNTS by itself as the month's Missouri contact (19 CSR 15-8.400(5)(F)),
// it goes out on the 1st of the month to EVERY active consumer, and it introduces itself as the
// Caring Companions check-in line (never "AI", never a person).
//
// How it works:
//   GoHighLevel (CDS sub-account) holds the caller: Voice AI agent "CDS Monthly Check-in" (7 questions)
//   and the published workflow "CDS monthly check-in call": tag cds-checkin-call added -> Voice AI
//   outbound call from the Main Line (417-218-2888). After each call the agent writes one line into the
//   contact field "Monthly check-in result" (contact.monthly_checkin_result):
//     CHECKIN, who consumer, finished yes, plan yes, hours yes, happy yes, health change no,
//     living change no, complaint no, other help no, notes none
//   This job (hourly, cds-checkin-calls):
//     1. from the 1st to the 7th, 10am to 5pm Central, each active consumer with a phone not called yet
//        this month: their field is set to "WAITING ..." (so last month's answers can never count) and the
//        tag is removed and added again (that starts the call). A few per run.
//     2. every run: reads the field of everyone called this month (and last month, for a call late on the
//        last day). A finished call is saved as that month's check-in (agency_data checkinCalls; the hub and
//        the 8am email show it as the month's call through CDSRules.mergeCheckinCalls). Any concern, change or
//        request becomes a follow-up card for a person to call back (the caller tells them the office will).
//        A call nobody finished is left for the office (the month stays open on Today); after 6 days with no
//        answer at all it stops looking.
//   Switch checkin_calls (cds_match_settings, starts OFF): off = nobody is called; the run only lists who would be.
// The consumer is the boss: only the consumer's own phone is ever called (her rule 2026-10-21).
// No em dashes in anything a person reads (her rule).
import './cds-rules.js';
import { chi, digits10 } from './open-shift-texts.js';

const R = globalThis.CDSRules;
export const AGENCY_ID = 'caring-companions-cds';
export const SETTING = 'checkin_calls';
export const STORE = 'checkinCalls';
export const TAG = 'cds-checkin-call';
export const FIELD_KEY = 'contact.monthly_checkin_result';
export const START_HOUR = 10, END_HOUR = 17;   // Central: calls start 10:00 to 4:59pm
export const LAST_DAY = 7;                     // the 1st, and through the 7th for anyone not reached by the job yet
export const PER_RUN = 8;                      // calls started per hourly run
export const GIVE_UP_DAYS = 6;
export const pending = ym => 'WAITING FOR THE ' + ym + ' CHECK-IN CALL';

const YN = v => (/^y/i.test(v) ? 'yes' : /^n/i.test(v) ? 'no' : '');
const KEYS = { plan: 'plan', hours: 'hours', happy: 'happy', 'health change': 'health', 'living change': 'living', complaint: 'complaint', 'other help': 'other' };

// The agent's one line -> answers. null when the field does not hold a check-in (empty, WAITING, typed by hand).
export function parseResult(text) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!/^CHECKIN\b/i.test(s)) return null;
  const at = s.search(/,\s*notes\b/i);
  const head = at >= 0 ? s.slice(0, at) : s;
  let notes = at >= 0 ? s.slice(at).replace(/^,\s*notes\s*:?\s*/i, '').trim() : '';
  if (/^(none|no|nothing|n\/a)\.?$/i.test(notes)) notes = '';
  const out = { who: '', finished: false, plan: '', hours: '', happy: '', health: '', living: '', complaint: '', other: '', notes: notes.slice(0, 600) };
  for (const part of head.split(',').slice(1)) {
    const m = /^\s*(who|finished|plan|hours|happy|health change|living change|complaint|other help)\s*:?\s*(.*)$/i.exec(part);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim().toLowerCase();
    if (k === 'who') out.who = /family|rep/.test(v) ? 'family' : /consumer|self/.test(v) ? 'consumer' : 'other';
    else if (k === 'finished') out.finished = YN(v) === 'yes';
    else out[KEYS[k]] = YN(v);
  }
  return out;
}

// What a person needs to follow up on, in plain words.
export function concerns(p) {
  const c = [];
  if (p.plan === 'no') c.push('the plan of care needs an update');
  if (p.hours === 'no') c.push('hours are not on track');
  if (p.happy === 'no') c.push('not happy with the care');
  if (p.health === 'yes') c.push('a change in health or ability to self-direct (tell DSDS within 10 days)');
  if (p.living === 'yes') c.push('a change in living situation (tell DSDS within 10 days)');
  if (p.complaint === 'yes') c.push('a complaint');
  if (p.other === 'yes') c.push('needs other help to keep living safely at home');
  return c;
}

// The month's check-in, in the same shape the hub's "Monthly check-in call" form saves (index.html saveContactLog).
export function toLog(p, dateIso, atIso) {
  const n = p.notes || '';
  const k = (v, yes) => (v === yes ? n : '');
  return {
    date: dateIso, method: 'phone', person: p.who || 'consumer',
    poc: p.plan, util: p.hours, utilNotes: k(p.hours, 'no'), sat: p.happy, satNotes: k(p.happy, 'no'),
    health: p.health, healthNotes: k(p.health, 'yes'), circ: p.living, circNotes: k(p.living, 'yes'),
    complaint: p.complaint, complaintNotes: k(p.complaint, 'yes'), needs: p.other, needsNotes: k(p.other, 'yes'),
    notes: 'Automated check-in call (the Caring Companions check-in line).' + (n ? ' ' + n : ''),
    loggedAt: atIso, auto: 'voice', dhssFlag: p.health === 'yes' || p.living === 'yes',
  };
}

// Who still needs this month's call. month = checkinCalls.months[ym] ({ consumerId: entry }).
export function due(consumers, month) {
  const list = [], noPhone = [];
  for (const c of consumers || []) {
    if (!c || !c.id || !R.isActive(c)) continue;
    if (month && month[String(c.id)]) continue;
    const phone10 = digits10(c.phone);
    if (!phone10) { noPhone.push(c.name || String(c.id)); continue; }
    list.push({ id: String(c.id), name: c.name || '', phone10 });
  }
  return { list, noPhone };
}

const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); };

// deps = { db: { query(text, params) -> { rows } }, now?: () => ms,
//          ghl: { fieldId() -> id, findContact(phone10) -> id|null, setField(contactId, fieldId, value),
//                 retag(contactId, tag), readField(contactId, fieldId) -> string } }
export function createCheckinCalls(deps) {
  const q = async (t, p = []) => (await deps.db.query(t, p)).rows;
  const now = () => (deps.now ? deps.now() : Date.now());
  const store = async keys => Object.fromEntries((await q('select data_key, data_value from agency_data where agency_id=$1 and data_key = any($2)', [AGENCY_ID, keys])).map(r => [r.data_key, r.data_value]));
  const save = v => q(`insert into agency_data (agency_id, data_key, data_value) values ($1, $2, $3::jsonb)
                       on conflict (agency_id, data_key) do update set data_value = excluded.data_value`, [AGENCY_ID, STORE, JSON.stringify(v)]);

  async function card(e, id, p, ym, atIso) {
    const what = concerns(p);
    if (!what.length && !p.notes) return false;
    const text = 'Check-in call: ' + (what.length ? what.join('; ') : 'they asked for something') + '.' + (p.notes ? ' They said: "' + p.notes.slice(0, 240) + '"' : '') + ' The caller told them the office will call back.';
    const ev = [{ id: 'checkin:' + id + ':' + ym, at: atIso, kind: 'text', text }];
    const r = await q(`insert into cds_tasks (kind, title, area, phone10, person_ref, events, due_at, dedupe_key, updated_at)
      values ('followup', $1, 'followup', $2, $3, $4::jsonb, $5, $6, $5) on conflict (dedupe_key) do nothing returning id`,
      [e.name || 'Consumer', e.phone10 || null, 'consumer:' + id, JSON.stringify(ev), atIso, 'checkin:' + id + ':' + ym]);
    return !!(r && r[0]);
  }

  async function run({ force = false } = {}) {
    const t = now(), c = chi(t), iso = new Date(t).toISOString(), ym = c.date.slice(0, 7), day = +c.date.slice(8, 10);
    const cfgRow = (await q('select value from cds_match_settings where key=$1', [SETTING]))[0];
    if (!cfgRow) return { ok: false, error: SETTING + ' is not set up' };
    const live = !!(cfgRow.value && cfgRow.value.live === true);
    const s = await store(['consumers', STORE]);
    const consumers = Array.isArray(s.consumers) ? s.consumers : Object.values(s.consumers || {});
    const st = (s[STORE] && typeof s[STORE] === 'object') ? s[STORE] : {};
    const months = st.months || {};
    const sum = { ok: true, live, month: ym, called: 0, recorded: 0, notFinished: 0, noAnswer: 0, cards: 0, noContact: 0, failed: 0, wouldCall: [], noPhone: [], errors: [] };
    let fid = null;
    const field = async () => (fid || (fid = await deps.ghl.fieldId()));

    // 1. answers back from GoHighLevel (live only: practice never calls anyone, so there is nothing to read)
    if (live) {
      for (const k of [prevMonth(ym), ym]) {
        for (const [id, e] of Object.entries(months[k] || {})) {
          if (!e || e.state !== 'called' || !e.contactId) continue;
          try {
            const p = parseResult(await deps.ghl.readField(e.contactId, await field()));
            if (p && p.finished) {
              e.state = 'recorded'; e.at = iso; e.log = toLog(p, c.date, iso); sum.recorded++;
              if (await card(e, id, p, k, iso)) { e.card = true; sum.cards++; }
            } else if (p) {
              e.state = 'not_finished'; e.at = iso; e.notes = p.notes; sum.notFinished++;
              if (await card(e, id, p, k, iso)) { e.card = true; sum.cards++; }
            } else if (t - Date.parse(e.calledAt) > GIVE_UP_DAYS * 864e5) { e.state = 'no_answer'; e.at = iso; sum.noAnswer++; }
          } catch (err) { sum.failed++; sum.errors.push(String((err && err.message) || err).slice(0, 200)); }
        }
      }
    }

    // 2. start this month's calls: the 1st to the 7th, 10am to 5pm Central
    const inWindow = day <= LAST_DAY && c.h >= START_HOUR && c.h < END_HOUR;
    const month = months[ym] || (months[ym] = {});
    const D = due(consumers, month);
    sum.noPhone = D.noPhone;
    if (!live) sum.wouldCall = D.list.map(d => d.name);
    else if (inWindow) {
      for (const d of D.list.slice(0, PER_RUN)) {
        try {
          const contactId = await deps.ghl.findContact(d.phone10);
          if (!contactId) { month[d.id] = { state: 'no_contact', name: d.name, phone10: d.phone10, at: iso }; sum.noContact++; continue; }
          await deps.ghl.setField(contactId, await field(), pending(ym));
          await deps.ghl.retag(contactId, TAG);
          month[d.id] = { state: 'called', name: d.name, phone10: d.phone10, contactId, calledAt: iso };
          sum.called++;
        } catch (err) { sum.failed++; sum.errors.push(d.name + ': ' + String((err && err.message) || err).slice(0, 200)); }
      }
    } else sum.skipped = day > LAST_DAY ? 'calls start on the 1st' : 'outside 10am to 5pm Central';
    sum.left = due(consumers, month).list.length;

    // keep 13 months
    for (const k of Object.keys(months).sort().slice(0, -13)) delete months[k];
    await save({ at: iso, lastRun: sum, months });
    return sum;
  }

  // One test call to one phone (the Desktop proof): never touches a consumer, nothing is saved as a check-in.
  async function test(phone10) {
    phone10 = digits10(phone10);
    if (!phone10) return { ok: false, error: 'no 10-digit phone' };
    const contactId = await deps.ghl.findContact(phone10);
    if (!contactId) return { ok: false, error: 'no GoHighLevel contact with that phone in the CDS sub-account' };
    await deps.ghl.setField(contactId, await deps.ghl.fieldId(), pending('test'));
    await deps.ghl.retag(contactId, TAG);
    return { ok: true, contactId };
  }
  async function read(contactId) {
    const v = await deps.ghl.readField(String(contactId), await deps.ghl.fieldId());
    return { ok: true, waiting: /^WAITING/i.test(String(v || '')), parsed: parseResult(v) };
  }
  return { run, test, read };
}
