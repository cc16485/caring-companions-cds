// A caller the Caring Companions office sends over to CDS (2026-11-01, Samantha: "We have many people
// calling our Caring Companions In-Home Senior Care number 417-234-8494 but are interested in the CDS
// program, so we need to be able to send leads to the CDS subaccount - and make sure they don't get the
// lead follow up that happens in the Caring Companions In-Home Senior Care subaccount in ghl").
//
// The Caring Companions server (send-to-cds, shared Hub project) posts one person here after a staff
// member pressed "Send to Caring CDS". This only adds them to site_leads, the same list the website
// forms fill, so everything CDS already does for a new lead happens on its own within 2 minutes:
// the office alert (lead-alerts.js), the plain GoHighLevel contact in the CDS sub-account (lead-ghl.js)
// and the one note with the call (lead-forms.js), and the hub's Leads import.
// Never contacts the family. Never sets a GoHighLevel tag or custom field.
// from_kind 'cc_lead' + from_id (the Caring Companions lead or call) means one row per person, ever.
// No em dashes in anything a person reads (her rule).
import { AGENCY_ID } from './lead-alerts.js';

export const FROM_KIND = 'cc_lead';
export const FORM_NAME = 'Called the Caring Companions line';
export const SOURCE = 'the Caring Companions line';

const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const ten = s => String(s ?? '').replace(/\D/g, '').slice(-10);
const noDash = s => String(s).replace(/\s*[—–]\s*/g, ', ');

// The day of the call, the way the office says it.
function callDay(at) {
  const t = Date.parse(at || '');
  return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// The body Caring Companions sends, checked. Returns { row } or { error }.
export function checkHandoff(b) {
  if (!b || typeof b !== 'object') return { error: 'no person sent' };
  const id = clean(b.cc_id, 80);
  if (!/^[A-Za-z0-9_:.-]{4,80}$/.test(id)) return { error: 'missing the Caring Companions lead or call id' };
  const phone = ten(b.phone).length === 10 ? '+1' + ten(b.phone) : '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(b.email, 120)) ? clean(b.email, 120).toLowerCase() : '';
  if (!phone && !email) return { error: 'no phone or email to reach them' };
  const first = clean(b.first_name, 60), last = clean(b.last_name, 60);
  const caller = clean(b.caller_name, 80), rel = clean(b.relationship, 40);
  const answers = [
    ['Who they are', 'Called the Caring Companions line about CDS'],
    caller && (caller.toLowerCase() !== [first, last].filter(Boolean).join(' ').toLowerCase() || rel) ? ['Who called', caller + (rel ? ' (' + rel + ')' : '')] : null,
    b.who_needs_care ? ['Who needs care', clean(b.who_needs_care, 80)] : null,
    b.county ? ['County', clean(b.county, 60)] : null,
    b.town ? ['Town', clean(b.town, 60)] : null,
    callDay(b.call_at) ? ['Call was on', callDay(b.call_at)] : null,
    b.summary ? ['What the call was about', clean(b.summary, 1500)] : null,
    b.notes ? ['Caring Companions notes', clean(b.notes, 1500)] : null,
    b.sent_by ? ['Sent over by', clean(b.sent_by, 80)] : null,
  ].filter(Boolean).map(([k, v]) => [k, noDash(v)]);
  return { row: {
    agency_id: AGENCY_ID, source: SOURCE, first_name: first || null, last_name: last || null,
    full_name: [first, last].filter(Boolean).join(' ') || caller || null,
    phone: phone || null, email: email || null, county: clean(b.county, 60) || null,
    who_needs_care: clean(b.who_needs_care, 80) || null, has_medicaid: null,
    message: answers.map(([k, v]) => k + ': ' + v).join('\n').slice(0, 4000),
    form_name: FORM_NAME, form_answers: answers, from_kind: FROM_KIND, from_id: id,
    submitted_at: new Date().toISOString(),
  } };
}

// deps: { db: { query(text, params) -> { rows } } }
export function createFromCc(deps) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;

  // Someone already on CDS with this phone or email (a website lead, a lead in the hub, or a consumer).
  async function already(row) {
    const p = ten(row.phone), e = String(row.email || '');
    const sl = await q(`select id, full_name, first_name, last_name, phone, email, from_kind, from_id from site_leads
       where agency_id=$1 and not coalesce(archived,false)
         and (($2 <> '' and right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10) = $2) or ($3 <> '' and lower(coalesce(email,'')) = $3))
       order by submitted_at desc limit 1`, [AGENCY_ID, p, e]);
    if (sl[0]) return { where: 'site_leads', id: sl[0].id, name: sl[0].full_name || [sl[0].first_name, sl[0].last_name].filter(Boolean).join(' '), same: sl[0].from_kind === FROM_KIND && sl[0].from_id === row.from_id };
    for (const key of ['pipeline', 'consumers']) {
      const r = await q(`select data_value from agency_data where agency_id=$1 and data_key=$2`, [AGENCY_ID, key]);
      const list = Array.isArray(r[0] && r[0].data_value) ? r[0].data_value : [];
      const hit = list.find(x => x && !x.archived && !/^closed/i.test(String(x.status || '')) &&
        ((p && ten(x.phone) === p) || (e && String(x.email || '').trim().toLowerCase() === e)));
      if (hit) return { where: key, name: clean(hit.name || [hit.firstName, hit.lastName].filter(Boolean).join(' '), 80) };
    }
    return null;
  }

  async function take(body) {
    const { row, error } = checkHandoff(body);
    if (error) return { ok: false, error };
    const was = await already(row);
    if (was && was.same) return { ok: true, added: false, already: { kind: 'sent', name: was.name } };
    if (was) return { ok: true, added: false, already: { kind: was.where === 'consumers' ? 'consumer' : 'lead', name: was.name } };
    const cols = Object.keys(row);
    const ins = await q(`insert into site_leads (${cols.join(', ')}) values (${cols.map((c, i) => '$' + (i + 1) + (c === 'form_answers' ? '::jsonb' : '')).join(', ')})
       on conflict (from_kind, from_id) where from_kind is not null do nothing returning id`,
      cols.map(c => c === 'form_answers' ? JSON.stringify(row[c]) : row[c]));
    if (!ins[0]) return { ok: true, added: false, already: { kind: 'sent', name: row.full_name } };
    return { ok: true, added: true, id: ins[0].id, name: row.full_name };
  }

  return { take, already };
}
