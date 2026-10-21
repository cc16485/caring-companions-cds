// "Ring my phone, then connect" for the CDS lead link page (2026-10-20, Samantha:
// "Build the call bridge for the lead call button please - to the number 417-218-2888").
// Same design as the CC Hub's call bridge (Staffing _shared/ghl-call-bridge.ts, proven
// live 2026-10-03), in the CDS GoHighLevel sub-account only.
//
// GoHighLevel has no API to start a call. Its workflow "Call" action rings the user the
// contact is ASSIGNED to, plays a short whisper, and on a key press connects them to the
// contact from the CDS line, (417) 218-2888, and logs the call. So one tap:
//   1. the person is known from their own private lead link (checked by lead-link.js)
//   2. one ring per person per 30 seconds (cds_audit is both the record and the limiter)
//   3. finds the person's GoHighLevel user: setting ghl_user_ids {email: userId} first
//      (her override), else GoHighLevel's user list for the CDS sub-account (GET only)
//   4. the lead's contact: the linked one (site_leads.ghl_contact_id), else search only,
//      exactly one match, never created
//   5. refuses when GoHighLevel says the workflow "Hub call bridge" is missing or a draft
//   6. records the ring in cds_audit (who, contact, previous owner), THEN
//   7. assigns the contact to the person (that field only), THEN
//   8. adds the tag hub-call-bridge (removed first if already on, so the trigger fires).
//      The workflow rings the person and removes the tag.
// Only a person's tap reaches this. It never creates a contact, never sends a text or
// email, and changes nothing in GoHighLevel but "Assigned to" and that one tag.
// Checked 2026-10-20: no published CDS workflow starts on an assigned-user change.
// No em dashes in anything a person reads (her rule).

export const BRIDGE_TAG = 'hub-call-bridge';
export const BRIDGE_WORKFLOW = 'Hub call bridge';
export const BRIDGE_GAP_SEC = 30;
export const CDS_LINE = '(417) 218-2888';

const safeId = s => /^[A-Za-z0-9_-]{1,64}$/.test(String(s ?? '')) ? String(s) : '';
const low = s => String(s ?? '').trim().toLowerCase();
const ten = s => String(s ?? '').replace(/\D/g, '').slice(-10);

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms, locationId,
//         ghl: { get(path) -> {status, body}, put(path, body), post(path, body), del(path, body) } -> {status, body} }
export function createCallBridge(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const loc = deps.locationId;

  async function setting(key) {
    const r = await one('select value from cds_match_settings where key=$1', [key]);
    return r ? r.value : null;
  }

  // GoHighLevel's users in the CDS sub-account: {email: {id, hasPhone}} (GET only)
  async function listUsers() {
    let r;
    try { r = await deps.ghl.get('/users/?' + new URLSearchParams({ locationId: loc })); } catch { return { api: 'error', users: {} }; }
    if (r.status === 401 || r.status === 403) return { api: 'no_scope', users: {} };
    if (r.status < 200 || r.status > 299) return { api: 'error', users: {} };
    const users = {};
    for (const u of (r.body?.users ?? [])) {
      if (!u || u.deleted === true) continue;
      const id = safeId(u.id), em = low(u.email);
      if (id && em) users[em] = { id, hasPhone: ten(u.phone).length === 10 };
    }
    return { api: 'ok', users };
  }

  async function userFor(email) {
    const em = low(email);
    const map = (await setting('ghl_user_ids')) || {};
    for (const [k, v] of Object.entries(map)) if (low(k) === em && safeId(v)) return { id: String(v), via: 'settings', api: 'not_asked' };
    const got = await listUsers();
    return got.users[em] ? { id: got.users[em].id, via: 'gohighlevel', api: got.api } : { id: '', via: null, api: got.api };
  }

  async function workflow() {
    try {
      const r = await deps.ghl.get('/workflows/?' + new URLSearchParams({ locationId: loc }));
      if (r.status < 200 || r.status > 299 || !Array.isArray(r.body?.workflows)) return 'unknown';
      const mine = r.body.workflows.filter(w => low(w?.name) === low(BRIDGE_WORKFLOW));
      if (!mine.length) return 'missing';
      return mine.some(w => low(w?.status) === 'published') ? 'published' : 'draft';
    } catch { return 'unknown'; }
  }

  // Search only, exactly one match by phone (last 10 digits) or email; never creates.
  async function findContact(lead) {
    if (safeId(lead.ghl_contact_id)) return { id: lead.ghl_contact_id };
    const tries = [];
    if (ten(lead.phone).length === 10) tries.push([ten(lead.phone), c => ten(c.phone) === ten(lead.phone)]);
    if (lead.email) tries.push([low(lead.email), c => low(c.email) === low(lead.email)]);
    let several = false;
    for (const [query, keep] of tries) {
      let r;
      try { r = await deps.ghl.get('/contacts/?' + new URLSearchParams({ locationId: loc, query, limit: '20' })); } catch { return { why: 'error' }; }
      if (r.status < 200 || r.status > 299) return { why: 'error' };
      const hits = (r.body?.contacts ?? []).filter(keep);
      if (hits.length === 1 && safeId(hits[0].id)) return { id: hits[0].id };
      if (hits.length > 1) several = true;
    }
    return { why: several ? 'several' : 'not_found' };
  }

  const record = (me, action, target, detail) =>
    q(`insert into cds_audit (at, actor, action, target, detail) values ($1,$2,$3,$4,$5::jsonb)`,
      [new Date(now()).toISOString(), me, action, target, JSON.stringify(detail)]);

  // person: { email, name } from their lead link. lead: the site_leads row.
  async function ring(person, lead) {
    const me = low(person.email);
    const first = String(lead.first_name || '').trim().split(/\s+/)[0] || 'them';
    if (!me) return { ok: false, why: 'no_user', message: 'This link does not say who you are. Open Leads in the CDS hub.' };

    // 2 · one ring per person per 30 seconds
    const last = await one(`select at from cds_audit where action='call_bridge' and actor=$1 and at > $2 order by at desc limit 1`,
      [me, new Date(now() - BRIDGE_GAP_SEC * 1000).toISOString()]);
    if (last) {
      const wait = Math.max(1, Math.ceil((BRIDGE_GAP_SEC * 1000 - (now() - Date.parse(last.at))) / 1000));
      return { ok: false, why: 'too_soon', message: 'Your phone was just rung. Try again in ' + wait + ' seconds if it did not ring.' };
    }

    // 3 + 4 · the person's GoHighLevel user, and the lead's contact
    const [user, found] = await Promise.all([userFor(me), findContact(lead)]);
    if (!found.id) return { ok: false, why: found.why, message: found.why === 'several'
      ? 'Two GoHighLevel contacts have ' + first + "'s number, so nothing was rung. Call from the CDS line, " + CDS_LINE + '.'
      : found.why === 'not_found'
        ? first + ' is not in GoHighLevel yet, so nothing was rung. Call from the CDS line, ' + CDS_LINE + '.'
        : 'GoHighLevel did not answer, so nothing was rung. Try again in a minute.' };
    if (!user.id) return { ok: false, why: 'no_user', message: 'Your GoHighLevel user in the CDS sub-account was not found for ' + me +
      ', so nothing was rung. Tell Samantha (CDS GoHighLevel, Settings, My Staff).' };

    // 5 · the workflow that does the ringing
    const wf = await workflow();
    if (wf === 'missing' || wf === 'draft') return { ok: false, why: 'no_workflow', message:
      'The "' + BRIDGE_WORKFLOW + '" workflow is ' + (wf === 'draft' ? 'still a draft' : 'not set up') + ' in CDS GoHighLevel, so nothing was rung.' };

    // the contact now: tags and who owned it (kept in the record)
    let c = null;
    try { const r = await deps.ghl.get('/contacts/' + encodeURIComponent(found.id)); if (r.status >= 200 && r.status < 300) c = r.body?.contact ?? null; } catch { c = null; }
    if (!c) return { ok: false, why: 'error', message: 'Could not read ' + first + ' in GoHighLevel, so nothing was rung. Try again.' };
    const tagOn = (Array.isArray(c.tags) ? c.tags : []).map(low).includes(BRIDGE_TAG);
    const previous = safeId(c.assignedTo) || null;

    // 6 · the record (and the limiter's mark) before anything changes in GoHighLevel
    const target = 'lead:' + lead.id;
    await record(me, 'call_bridge', target, { contact_id: found.id, user_via: user.via, previous_assigned_to: previous, tag_was_on: tagOn, workflow: wf });
    const failed = async (why, msg) => {
      try { await record(me, 'call_bridge_failed', target, { contact_id: found.id, why }); } catch { /* shown on the page */ }
      return { ok: false, why, message: msg };
    };

    // 7 · assign the contact to the person: that field only
    if (previous !== user.id) {
      let st = 0;
      try { st = (await deps.ghl.put('/contacts/' + encodeURIComponent(found.id), { assignedTo: user.id })).status; } catch { st = 0; }
      if (st < 200 || st > 299) return failed('assign_failed', 'GoHighLevel would not assign ' + first + ' to you (' + (st || 'no answer') + '), so nothing was rung.');
    }

    // 8 · the tag that starts the workflow, newly added so the trigger fires
    const tagPath = '/contacts/' + encodeURIComponent(found.id) + '/tags';
    if (tagOn) {
      let st = 0;
      try { st = (await deps.ghl.del(tagPath, { tags: [BRIDGE_TAG] })).status; } catch { st = 0; }
      if (st < 200 || st > 299) return failed('tag_failed', 'GoHighLevel would not reset the call tag on ' + first + ' (' + (st || 'no answer') + ').');
    }
    let st2 = 0;
    try { st2 = (await deps.ghl.post(tagPath, { tags: [BRIDGE_TAG] })).status; } catch { st2 = 0; }
    if (st2 < 200 || st2 > 299) return failed('tag_failed', 'GoHighLevel would not start the call to ' + first + ' (' + (st2 || 'no answer') + ').');
    return { ok: true, message: 'Ringing your phone now. Answer, then press any key to connect to ' + first + '. It goes out on the CDS line, ' + CDS_LINE + '.' };
  }

  // The installer's check: is the workflow published, and is each lead-alert person
  // linked to a GoHighLevel user with a phone? Names and yes/no only, never ids or numbers.
  async function setup() {
    const [users, wf, alerts, map] = await Promise.all([listUsers(), workflow(), setting('lead_alerts'), setting('ghl_user_ids')]);
    const people = (alerts?.recipients || []).map(p => {
      const em = low(p.email);
      const over = Object.entries(map || {}).some(([k, v]) => low(k) === em && safeId(v));
      const u = users.users[em];
      return { name: p.name || em, email: em, linked: over || !!u, via: over ? 'settings' : u ? 'gohighlevel' : null, has_phone: u ? u.hasPhone : null };
    });
    return { workflow: wf, users_api: users.api, users_count: Object.keys(users.users).length, people };
  }

  return { ring, setup, listUsers, workflow };
}
