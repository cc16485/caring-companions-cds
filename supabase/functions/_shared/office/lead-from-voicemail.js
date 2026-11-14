// A voicemail that sounds like a new lead becomes a lead on the Leads page by itself
// (2026-11-13, Samantha: "voicemail to lead").
//
// comms.js already reads every voicemail left on the CDS line and marks the ones that sound like a new
// lead (cds_call_notes.new_lead), and lead-alerts.js texts Samantha and Zach a private link. Until now
// the caller was only a Follow-ups card; nobody was on Leads unless a person typed them in.
// This adds one row to site_leads, the same list the website forms fill, so the hub's Leads import
// brings them in as a new lead who is waiting for a call.
//
// - Only from a number that is not already a lead, a consumer or a website enquiry (lead-from-cc.js
//   `already`). A hidden number is left to its Follow-ups card: a lead needs a phone or email (her rule).
// - One row per voicemail, ever: from_kind 'voicemail' + from_id (the call id).
// - Never contacts the caller. Sends nothing new to the office either: the voicemail text is the alert,
//   so the lead alert email, text and 30-minute reminder are marked handled on the row.
// - Starts from voicemail_leads.to_leads_since (set by voicemail_to_lead.sql), so older voicemails
//   the office already dealt with are not added.
// No em dashes in anything a person reads (her rule).
import { AGENCY_ID } from './lead-alerts.js';
import { createFromCc } from './lead-from-cc.js';

export const FROM_KIND = 'voicemail';
export const FORM_NAME = 'CDS line: left a voicemail';
export const SOURCE = 'a voicemail on the CDS line';

const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const ten = s => String(s ?? '').replace(/\D/g, '').slice(-10);
const noDash = s => String(s).replace(/\s*[—–]\s*/g, ', ');
const pretty = p => '(' + p.slice(0, 3) + ') ' + p.slice(3, 6) + '-' + p.slice(6);
const when = at => new Date(at).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const WHO = { self: 'The person who needs care', family: 'Family or a friend', pair: 'An attendant with someone to care for', solo: 'Someone who wants to be an attendant' };
const MEDICAID = { yes: 'Yes', no: 'No', applied: 'Applied, waiting' };

// v = { comm_id, at, phone10, contact_name, ghl_contact_id, note, people, answers }. Returns the site_leads row, or null.
export function voicemailRow(v, nowIso) {
  const p = ten(v && v.phone10);
  if (!v || !v.comm_id || p.length !== 10) return null;
  const a = v.answers && typeof v.answers === 'object' ? v.answers : {};
  const first = clean(a.first, 60), last = clean(a.last, 60);
  // GoHighLevel names an unknown caller by their number; that is not a name.
  const ghlName = /[A-Za-z]{2}/.test(String(v.contact_name || '')) ? clean(v.contact_name, 80) : '';
  const people = (Array.isArray(v.people) ? v.people : []).filter(x => x && x.name).slice(0, 4)
    .map(x => clean(x.name, 80) + (x.relation ? ' (' + clean(x.relation, 40) + ')' : ''));
  const answers = [
    ['Who they are', 'Left a voicemail on the CDS line'],
    ['Voicemail was on', when(v.at)],
    v.note ? ['What they said', clean(v.note, 1500)] : null,
    WHO[a.who] ? ['Who called', WHO[a.who]] : null,
    a.county ? ['County', clean(a.county, 60)] : null,
    MEDICAID[a.medicaid] ? ['Medicaid', MEDICAID[a.medicaid]] : null,
    a.cds === 'move' ? ['CDS now', 'With another agency' + (a.agency ? ': ' + clean(a.agency, 80) : '')] : null,
    people.length ? ['People named', people.join(', ')] : null,
  ].filter(Boolean).map(([k, t]) => [k, noDash(t)]);
  return {
    agency_id: AGENCY_ID, source: SOURCE, first_name: first || null, last_name: last || null,
    full_name: [first, last].filter(Boolean).join(' ') || ghlName || 'Voicemail from ' + pretty(p),
    phone: '+1' + p, email: null, county: clean(a.county, 60) || null, who_needs_care: null, has_medicaid: null,
    message: answers.map(([k, t]) => k + ': ' + t).join('\n').slice(0, 4000),
    form_name: FORM_NAME, form_answers: answers, from_kind: FROM_KIND, from_id: String(v.comm_id),
    ghl_contact_id: v.ghl_contact_id ? String(v.ghl_contact_id) : null,
    submitted_at: new Date(v.at).toISOString(),
    // The voicemail text already told the office. Nothing more goes out about this row.
    alert_at: nowIso, alert_texted_at: nowIso, reminder_at: nowIso,
  };
}

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms }
export function createFromVoicemail(deps) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const now = deps.now || (() => Date.now());
  const cc = createFromCc(deps);

  // vs = the voicemail_leads setting. Returns { leadsAdded, leadsAlready }.
  async function run(vs) {
    const since = Date.parse((vs && vs.to_leads_since) || '');
    if (isNaN(since)) return { leadsAdded: 0 };   // not started yet (voicemail_to_lead.sql)
    const from = new Date(Math.max(since, now() - 3 * 86400000)).toISOString();
    const todo = await q(`select n.comm_id, c.at, c.phone10, c.contact_name, c.ghl_contact_id, coalesce(n.final_note, n.note) note, n.people, n.answers
        from cds_call_notes n join cds_comms c on c.id = n.comm_id
       where n.voicemail and n.new_lead and c.phone10 is not null and c.at >= $1
         and not exists (select 1 from site_leads s where s.from_kind = $2 and s.from_id = n.comm_id)
       order by c.at limit 10`, [from, FROM_KIND]);
    let added = 0, already = 0;
    for (const v of todo) {
      const row = voicemailRow(v, new Date(now()).toISOString());
      if (!row) continue;
      if (await cc.already(row)) { already++; continue; }
      const cols = Object.keys(row);
      const ins = await q(`insert into site_leads (${cols.join(', ')}) values (${cols.map((c, i) => '$' + (i + 1) + (c === 'form_answers' ? '::jsonb' : '')).join(', ')})
         on conflict (from_kind, from_id) where from_kind is not null do nothing returning id`,
        cols.map(c => c === 'form_answers' ? JSON.stringify(row[c]) : row[c]));
      if (ins[0]) added++;
    }
    return { leadsAdded: added, leadsAlready: already };
  }
  return { run };
}
