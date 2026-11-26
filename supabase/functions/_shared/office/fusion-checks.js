// Checking Fusion after a referral or PCCP (2026-11-26, Samantha: "a biggie is staying on top of checking back in Fusion
// 7+ days after a referral/PCCP to see if the lead is answering the phone for the state. Many times new referrals dont
// happen because the state tries to call and will upload documents and notes in the FUSION profile of the consumer
// saying that theyve tried to call and if the consumer doesnt call back by a certain date they will close out the referral").
//
// Who: every Starting consumer whose referral was sent (or PCCP / transfer entered) and who has no authorization yet.
// When: the first check is 7 days after it went in, then every 3 days (setting fusion_checks.every_days) until the
// authorization comes. A close-out date the state gave makes the next check due before it.
// Katlin opens the consumer's Fusion profile (her own sign-in; Claude cannot open Fusion), reads the newest notes and
// documents, and tells Claude what she found. Claude records it here (cds_fusion_checks) and:
//   state_cant_reach   -> "needs you" on Samantha's My Week today, a promise to call the consumer today, a one-time item
//                         at the top of Katlin's to-do, and the next check before the close-out date
//   closed_by_state    -> "needs you" for Samantha
//   more_info_needed   -> "needs you" for Samantha, with what the state asked for
//   assessment_set     -> noted; the next check is the day after the assessment
//   authorized         -> "needs you": upload the authorization in the hub (the hub then stops asking)
//   nothing_new        -> noted; next check in 3 days
// Everything shows on the person's profile ("Heard on calls and texts": "Fusion checked by Katlin: ..."). No texts.
import { itemsFrom } from './coordinator.js';

export const FIRST_CHECK_DAYS = 7, EVERY_DAYS = 3;
export const RESULTS = {
  nothing_new: 'No new notes or documents from the state',
  state_cant_reach: 'The state has tried to call and cannot reach them',
  assessment_set: 'The state set the assessment',
  more_info_needed: 'The state needs something more',
  closed_by_state: 'The state closed the referral',
  authorized: 'The authorization is in Fusion',
};
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));
const addDays = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const between = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 864e5);

/* When the next Fusion check is due for one consumer, or null when none is needed. Pure.
   c: the consumer; auth: has an authorization in the hub; last: newest check row { day, result, close_by, assessment } */
export function fusionDue(c, auth, last, today, every = EVERY_DAYS) {
  const st = (c && c.starting) || {}, move = st.kind === 'move';
  const sent = move ? st.transferEntered : st.referralSent;
  if (!isDay(String(sent || '').slice(0, 10)) || auth) return null;
  if (last && ['closed_by_state', 'authorized'].includes(last.result)) return null;   // Samantha has it now
  const sentDay = String(sent).slice(0, 10);
  let due = addDays(sentDay, FIRST_CHECK_DAYS);
  if (last && isDay(last.day)) {
    due = addDays(last.day, every);
    if (last.result === 'assessment_set' && isDay(last.assessment) && last.assessment >= last.day) due = addDays(last.assessment, 1);
    if (last.result === 'state_cant_reach') due = addDays(last.day, 1);   // watch it closely until they reach the state
  }
  if (last && isDay(last.close_by) && last.close_by >= today) { const before = addDays(last.close_by, -1); if (before < due) due = before < today ? today : before; }
  return { kind: move ? 'PCCP / transfer' : 'Referral', sent: sentDay, days_since: between(sentDay, today), due, late: due < today, today: due === today,
    last_checked: last ? last.day : '', last_result: last ? (RESULTS[last.result] || last.result) : '', close_by: last && isDay(last.close_by) ? last.close_by : '' };
}

export function createFusionChecks({ db, now = () => Date.now() }) {
  const q = async (t, p = []) => (await db.query(t, p)).rows;
  const one = async (t, p = []) => (await q(t, p))[0] || null;
  const mo = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  async function lastByConsumer() {
    const rows = await q(`select distinct on (consumer_id) consumer_id, day::text as day, result, close_by::text as close_by, assessment::text as assessment
      from cds_fusion_checks order by consumer_id, at desc`);
    return Object.fromEntries(rows.map((r) => [String(r.consumer_id), r]));
  }
  async function every() { const r = await one(`select value from cds_match_settings where key = 'fusion_checks'`); const n = Number(r && r.value && r.value.every_days); return n >= 1 && n <= 14 ? n : EVERY_DAYS; }
  async function record(email, c, args, whoName) {
    const result = String(args.result || '');
    if (!RESULTS[result]) throw new Error('Pick what Fusion showed: ' + Object.keys(RESULTS).join(', '));
    const today = mo(now()), close = isDay(args.close_by) ? args.close_by : '', asmt = isDay(args.assessment) ? args.assessment : '';
    if (result === 'state_cant_reach' && !close) throw new Error('What date did the state say it will close the referral? (YYYY-MM-DD). If the note gives no date, use the date 10 days from the note.');
    const note = String(args.note || '').replace(/—/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const phone = String(args.state_phone || '').replace(/[^\d() -]/g, '').trim().slice(0, 20);
    await q(`insert into cds_fusion_checks (consumer_id, consumer_name, day, result, close_by, assessment, state_phone, note, by_email)
      values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)`, [String(c.id), c.name || '', today, result, close || null, asmt || null, phone || null, note || null, email]);
    const at = new Date(now()).toISOString(), sid = 'fusion:' + c.id + ':' + at;
    const nice = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const summary = 'Fusion checked by ' + whoName + ': ' + RESULTS[result] + (close ? '; the state will close the referral on ' + nice(close) : '') + (asmt ? '; assessment ' + nice(asmt) : '') + '.' + (note ? ' ' + note : '');
    await q(`insert into cds_coord_seen (source_id, at, ok, tries, note, person_ref, summary) values ($1, now(), true, 1, $2, $3, $4)
      on conflict (source_id) do update set summary = excluded.summary, at = now()`, [sid, 'saved by ' + email, 'consumer:' + c.id, summary]);
    const x = { summary, promises: [], theirWord: [], questions: [], concerns: [], startDate: null, attendant: null };
    if (result === 'state_cant_reach') {
      x.concerns.push('The state cannot reach ' + c.name + ' and will close the referral on ' + nice(close) + '. Make sure they call the state back' + (phone ? ' at ' + phone : '') + '.');
      x.promises.push({ what: 'call ' + (c.name || 'them') + ' today: the state is trying to reach them' + (phone ? ' (state number ' + phone + ')' : '') + ', call back before ' + nice(close), due: today });
    }
    if (result === 'closed_by_state') x.concerns.push('The state closed ' + c.name + '\'s referral in Fusion.' + (note ? ' ' + note : ''));
    if (result === 'more_info_needed') x.concerns.push('The state needs something more for ' + c.name + ': ' + (note || 'see the Fusion notes') + '.');
    if (result === 'authorized') x.concerns.push('The authorization for ' + c.name + ' is in Fusion. Upload it in the hub (Starting profile).');
    let added = 0;
    for (const it of itemsFrom({ kind: 'consumer', id: String(c.id), name: c.name || '' }, { line: 'night', kind: 'fusion', id: sid, at, who: whoName }, x)) {
      it.source.by = email;
      if (it.kind === 'promise' || it.kind === 'concern') it.key += ':' + today;   // a new day, a new reminder
      const r = await one(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) on conflict (key) do nothing returning id`,
      [it.key, it.person_kind, it.person_id, it.person_name, it.kind, JSON.stringify(it.data), JSON.stringify(it.source), it.status, it.due]);
      if (r) added++;
    }
    if (result === 'state_cant_reach') {
      const id = ('fc' + String(c.id).replace(/[^a-z0-9]/gi, '').toLowerCase() + today.replace(/-/g, '')).slice(0, 24).padEnd(8, '0');
      await q(`insert into cds_todo (id, kind, data, updated_by) values ($1, 'item', $2::jsonb, 'cds-connector') on conflict (id) do nothing`,
        ['i:' + id, JSON.stringify({ who: String(email).toLowerCase(), n: 0, when: 'once', date: today, by: 'samantha@mo-care.com',
          t: ('CALL ' + c.name + ': the state cannot reach them, closes ' + nice(close)).slice(0, 160),
          how: 'Call ' + c.name + ' (the consumer themselves). Tell them the state is trying to reach them about CDS and they need to call back' + (phone ? ' at ' + phone : '') + ' before ' + nice(close) + '. Tell Claude what they said.' })]);
    }
    return { saved: true, result: RESULTS[result], close_by: close, added_items: added };
  }
  return { lastByConsumer, every, record };
}
