// Website leads into GoHighLevel as plain contacts (2026-10-20, Samantha: "only name, phone and
// email, no tags or custom fields, and never the four tags. Practice first").
//
// Runs inside the 2-minute lead job. For each website lead not yet linked:
//   exactly one GoHighLevel contact with the same phone (last 10 digits), else the same email
//     -> remember its id. Nothing in GoHighLevel changes.
//   several matches -> not linked; "several matches" (a person decides which).
//   none -> live: create { firstName, lastName, phone, email } and nothing else.
//           practice: create nothing; "practice: would create".
//   no phone and no email -> "skipped: no phone or email".
//   failure -> "failed: why", tried again after an hour, at most 3 tries; the morning email lists it.
//
// WHY ONLY FOUR FIELDS: all 28 published CDS workflows were read 2026-10-20. A contact with no tags
// and no custom fields sets none of them off. The tags below DO start workflows (the first three
// message the family). checkBody() refuses ANY tag, custom field or other key, so a later edit
// cannot slip one in. Searching is read only and runs in practice too.
// No em dashes in anything a person reads (her rule).
import { AGENCY_ID } from './lead-alerts.js';

export const WORKFLOW_TAGS = ['new lead', 'active consumer', 'onboard cds consumer', 'admin- add playbooks'];
export const ALLOWED_KEYS = ['firstName', 'lastName', 'phone', 'email'];
const ten = s => String(s ?? '').replace(/\D/g, '').slice(-10);
const RETRY_MS = 60 * 60000, MAX_TRIES = 3;

// The one body this code may send to create a contact.
export function contactBody(lead) {
  let first = String(lead.first_name || '').trim(), last = String(lead.last_name || '').trim();
  if (!first && !last) {
    const parts = String(lead.full_name || '').trim().split(/\s+/).filter(Boolean);
    first = parts.shift() || ''; last = parts.join(' ');
  }
  if (!first && !last) first = 'CDS website lead';
  const p = ten(lead.phone), e = String(lead.email || '').trim().toLowerCase();
  const body = { firstName: first.slice(0, 80) };
  if (last) body.lastName = last.slice(0, 80);
  if (p.length === 10) body.phone = '+1' + p;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) body.email = e;
  return body;
}
// Refuses anything but the four fields: no tags, no customFields, no source, nothing.
export function checkBody(body) {
  const extra = Object.keys(body || {}).filter(k => !ALLOWED_KEYS.includes(k));
  if (extra.length) throw new Error('Refused: only first name, last name, phone and email may be sent (got ' + extra.join(', ') + ')');
  return body;
}

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms,
//         ghl: { search(query) -> [contacts], create(body) -> id   (throws; err.contactId when it already exists) } }
export function createLeadGhl(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;

  async function find(lead) {
    const p = ten(lead.phone), e = String(lead.email || '').trim().toLowerCase();
    if (p.length === 10) {
      const hits = (await deps.ghl.search(p)).filter(c => ten(c.phone) === p);
      if (hits.length) return hits;
    }
    if (e) return (await deps.ghl.search(e)).filter(c => String(c.email || '').trim().toLowerCase() === e);
    return [];
  }

  async function run({ limit = 20 } = {}) {
    const cfg = (await one(`select value from cds_match_settings where key='lead_ghl'`)) || { value: { live: false } };
    const live = cfg.value && cfg.value.live === true;
    const t = new Date(now()).toISOString(), retryBefore = new Date(now() - RETRY_MS).toISOString();
    const leads = await q(`select * from site_leads
       where agency_id=$1 and not coalesce(archived,false) and ghl_contact_id is null
         and (ghl_at is null
              or (ghl_status like 'failed%' and ghl_tries < $2 and ghl_at < $3)
              or ($4 and ghl_status = 'practice: would create'))
       order by submitted_at limit $5`, [AGENCY_ID, MAX_TRIES, retryBefore, live, limit]);
    const sum = { ok: true, live, checked: 0, found: 0, created: 0, practice: 0, several: 0, skipped: 0, failed: 0 };
    for (const lead of leads) {
      // claim it, so two runs never both create
      const mine = await one(`update site_leads set ghl_at=$2, ghl_tries=ghl_tries+1 where id=$1 and ghl_contact_id is null
                              and (ghl_at is distinct from $3) returning id`, [lead.id, t, t]);
      if (!mine) continue;
      sum.checked++;
      const mark = (status, id = null) => q(`update site_leads set ghl_status=$2, ghl_contact_id=coalesce($3, ghl_contact_id) where id=$1`,
        [lead.id, String(status).slice(0, 300), id]);
      try {
        const body = checkBody(contactBody(lead));
        if (!body.phone && !body.email) { await mark('skipped: no phone or email'); sum.skipped++; continue; }
        const hits = await find(lead);
        if (hits.length === 1) { await mark('found', String(hits[0].id)); sum.found++; continue; }
        if (hits.length > 1) { await mark('several matches, not linked'); sum.several++; continue; }
        if (!live) { await mark('practice: would create'); sum.practice++; continue; }
        try {
          const id = await deps.ghl.create(body);
          await mark('created', String(id)); sum.created++;
        } catch (e) {
          // GoHighLevel says it already exists: link that one, change nothing.
          if (e && e.contactId) { await mark('found', String(e.contactId)); sum.found++; }
          else throw e;
        }
      } catch (e) {
        await mark('failed: ' + String((e && e.message) || e).slice(0, 200)); sum.failed++;
      }
    }
    return sum;
  }
  return { run };
}
