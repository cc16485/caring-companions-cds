// The CDS Coordinator, three more jobs (2026-11-18, her words after Karen Bohnstedt's packet sat unsent: "Our ai
// coordinator should have found Karen Bohnstedt's email and or phone number and sent her the consumer packet already",
// "should also be asking me to sign them into Emomed to verify medicaid", "also ask me to login to Fusion to put in the
// referral", "several attendant and consumer packets need to be sent").
//
//   1 contacts  A Starting consumer or open lead with no phone and no email, or an attendant the tracker says to text
//               with no phone: look for one in what the Coordinator already hears. The CDS line (cds_comms, by the name
//               GoHighLevel shows for the caller) and the Caring Companions line (cds-call-feed {names}, the phones and
//               email the Caring Companions records hold for that exact full name). Never written to a record: a
//               'contact' item waits in "Heard on calls and texts" for Use it or Not right. A number that already belongs
//               to someone else we watch (the daughter who called for her mom) is never suggested.
//   2 packets   The tracker says "Send the packet" (consumer enrollment packet) or "Text <attendant> the application"
//               (attendant packet) and a phone or email is on file: a 'packet' or 'apppacket' draft, sent through the same
//               server code as the hub's buttons (cds-match, enrollSend / packetStartFromLead + packetSendLink). Switch
//               "The Coordinator sends packets" (setting packet_sends.live, off = Practice: the draft waits for Send).
//               On: sent by itself Monday to Saturday, 9 AM to 7 PM Central. Never twice (one key per person, and the
//               server refuses a packet that already went out). No phone or email: "Need a phone for X" goes on My Week
//               and the 4:30 email until one is on file.
//   3 sign-ins  A Starting row shows "Verify in eMOMED", "Put the referral in" or "Enter the transfer" (Fusion): one
//               email per portal per day to her reminder address (and to the people in coordinator.signin_also, Katlin,
//               who does eMOMED and Fusion on her evening shift), with the sign-in link and the names, plus one My Week
//               item per portal. Names only: never a DCN, a Medicaid number or a date of birth. The person who signs in
//               looks them up; the Coordinator never types into a state portal.
// No em dashes in anything a person reads (her rule).
import './starting-rules.js';
import './start-tracker.js';
import { sendingHours } from './coordinator-hands.js';

const T = () => globalThis.CDSTracker;
const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const okEmail = e => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(e || '').trim());
const real = x => x && !/^(example|test)\b/i.test(String(x.name || '').trim());
const fullName = n => String(n || '').trim().split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length >= 2).length >= 2;
const fmt = d => '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const niceDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
// Our own lines are never someone's phone.
export const OFFICE_LINES = ['4172182888', '4172348494'];

export const PORTALS = {
  emomed: { label: 'eMOMED', url: 'https://www.emomed.com',
    why: 'to check Medicaid for the people below (Verify in eMOMED on their Starting row)',
    after: 'Look each one up, upload the eligibility page on their Medicaid step, type the ME code and Lock Ins, and save. That marks it Verified and the Starting page moves on.' },
  fusion: { label: 'Fusion (DSDS)', url: 'https://modhss.entellitrak.com/etk-modhss-prod/page.request.do?page=portal.referral',
    transferUrl: 'https://modhss.entellitrak.com/etk-modhss-prod/page.request.do?page=portal.pccpRequest',
    why: 'to put in the CDS referral, or the transfer, for the people below',
    after: 'When each one is in, mark it on their Starting profile (State step: Referral sent, or Transfer entered) so the Coordinator stops asking.' },
};

// The lead the hub's packet card would use for this consumer (same order as the profile's profPacketLead): their
// Starting lead, else the lead they came from, else a lead moved to Consumers with their name, else the consumer record.
export function leadFor(c, pipeline) {
  const list = pipeline || [], byId = id => id ? list.find(p => String(p.id) === String(id)) : null;
  const f = c.facts || {};
  const own = { id: 'consumer-' + c.id, type: c.starting && c.starting.kind === 'move' ? 'pccp' : 'lead', name: c.name, phone: c.phone, email: c.email,
    county: c.county || f.county, street: f.street, apt: f.apt, city: f.city, zip: f.zip };
  return byId(c.starting && c.starting.leadId) || byId(c.leadId) || list.find(p => p.movedToConsumers && norm(p.name) === norm(c.name)) || own;
}
// What the packet is sent with: the lead's details (as the hub's leadForPacket), the consumer's own phone and email when the
// lead has none, and always the consumer's name (a lead saved under the caller's name must not put her name on the forms).
export function packetLead(c, lead) {
  const R = lead.referral || {};
  const phone = ten(lead.phone) || ten(c.phone), email = okEmail(lead.email) ? String(lead.email).trim().toLowerCase() : okEmail(c.email) ? String(c.email).trim().toLowerCase() : '';
  return { id: lead.id, type: lead.type, name: c.name, phone: phone ? fmt(phone) : '', email, county: lead.county || c.county, leavingAgency: lead.leavingAgency,
    street: lead.street || R.street, apt: lead.apt || R.apt, city: lead.city || R.city, zip: lead.zip || R.zip };
}

// The consumer's enrollment packet row, found the way the hub's profile finds it (enrollProfile).
export function packetOf(c, packets, lead) {
  const list = packets || [], ids = [c.starting && c.starting.leadId, c.leadId, lead && lead.id, 'consumer-' + c.id].filter(Boolean).map(String);
  return list.find(p => String(p.consumer_id || '') === String(c.id)) || list.find(p => ids.includes(String(p.lead_id)))
    || list.find(p => !p.consumer_id && p.sent_at && norm([p.first, p.last].join(' ')) === norm(c.name)) || null;
}

// One tracker per Starting consumer, with the same answers the hub gives it.
export function trackRows({ consumers, pipeline, packets, onboarding, roster, auths, today }) {
  const out = [];
  (consumers || []).filter(c => c && c.status === 'starting' && real(c)).forEach(c => {
    const lead = leadFor(c, pipeline), P = packetOf(c, packets, lead);
    const att = T().attendantFor(c, (onboarding || []).map(r => ({ name: [r.first_name, r.last_name].filter(Boolean).join(' '), consumer: r.consumer_name, phone: r.phone })));
    const rost = (roster || []).filter(a => a && a.status !== 'inactive' && String(a.consumer || '').split(',').map(norm).includes(norm(c.name)))[0] || null;
    const t = T().tracker(c, { today, auth: !!(auths || {})[norm(c.name)], att: att ? { name: att.name } : null, roster: rost ? { name: rost.name } : null,
      packet: P ? { signed: !!P.signed_at, done: !!P.office_signed_at, status: P.sent_at ? 'Sent' : '' } : {} });
    out.push({ c, lead, packet: P, t });
  });
  return out;
}

// Job 2: what to send, and who we need a phone for.
export function planPackets({ rows, heard }) {
  const drafts = [], needs = [];
  rows.forEach(({ c, lead, t }) => {
    if (t.cells.packet.t === 'Send the packet') {
      const L = packetLead(c, lead);
      if (L.phone || L.email) drafts.push({ kind: 'packet', key: 'packet:' + c.id, person_id: String(c.id), person_name: c.name, to_name: c.name, phone: ten(L.phone), email: L.email,
        data: { lead: L, consumer_id: String(c.id) }, body: 'Send ' + c.name + ' the enrollment packet: their private link by ' + [L.phone ? 'text' : '', L.email ? 'email' : ''].filter(Boolean).join(' and ') + '. Reminders on day 2 and 4 go by themselves.' });
      else needs.push({ person_id: String(c.id), person_name: c.name, who: c.name, what: 'their enrollment packet' });
    }
    const ct = t.cells.checks.t || '';
    if (/^Text .+ the application$/.test(ct) && t.attName) {
      const name = String(t.attName).trim().replace(/\s+/g, ' '), short = n => { const w = String(n || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean); return w.length ? w[0] + (w[1] || '').slice(0, 1) : ''; };
      const la = (lead && lead.attendant) || {};
      const fromLead = norm(la.name) === norm(name) && ten(la.phone) ? { phone: ten(la.phone), email: okEmail(la.email) ? la.email : '' } : null;
      const h = (heard || []).find(i => i.person_kind === 'consumer' && String(i.person_id) === String(c.id) && i.kind === 'attendant' && i.status !== 'dismissed' && short(i.data.name) === short(name) && ten(i.data.phone))
        || (heard || []).find(i => i.person_kind === 'consumer' && String(i.person_id) === String(c.id) && i.kind === 'contact' && i.status === 'applied' && i.data.for === 'attendant' && norm(i.data.name) === norm(name) && ten(i.data.phone));
      const got = fromLead || (h ? { phone: ten(h.data.phone), email: okEmail(h.data.email) ? h.data.email : '' } : null);
      if (got && fullName(name)) drafts.push({ kind: 'apppacket', key: 'apppacket:' + c.id + ':' + norm(name), person_id: String(c.id), person_name: c.name, to_name: name, phone: got.phone, email: got.email || '',
        data: { name, phone: got.phone, email: got.email || '', consumer: c.name }, body: 'Text ' + name + ' (' + c.name + '\'s attendant) the attendant application link, the same text as Save and text on Add attendant.' });
      else needs.push({ person_id: String(c.id), person_name: c.name, who: name, what: 'the attendant application' + (fullName(name) ? '' : ' (and their last name)') });
    }
  });
  return { drafts, needs };
}

// Job 3: who is waiting on a portal today.
export function planSignIns(rows) {
  const emomed = [], fusion = [];
  rows.forEach(({ c, t }) => {
    if (t.cells.medicaid.t === 'Verify in eMOMED') emomed.push({ id: String(c.id), name: c.name });
    const r = t.cells.referral.t;
    if (r === 'Put the referral in' || r === 'Enter the transfer') fusion.push({ id: String(c.id), name: c.name, transfer: r === 'Enter the transfer', afterMedicaid: t.cells.medicaid.state !== 'done' });
  });
  return { emomed, fusion };
}
export function signInWords(portal, list, today) {
  const P = PORTALS[portal];
  const line = x => x.name + (x.transfer ? ': enter the transfer (PCCP Request)' : portal === 'fusion' ? ': put the referral in' : '') + (x.afterMedicaid ? ' (after Medicaid is verified in eMOMED)' : '');
  const links = portal === 'fusion' ? [['Open Fusion, referral', P.url], ...(list.some(x => x.transfer) ? [['Open Fusion, transfer (PCCP Request)', P.transferUrl]] : [])] : [['Open eMOMED', P.url]];
  const subject = 'Sign-in needed: ' + P.label + ' (' + list.length + ' waiting)';
  const text = ['Please sign in to ' + P.label + ' ' + P.why + '.', ...links.map(([l, u]) => l + ': ' + u), '', ...list.map(x => '- ' + line(x)), '', P.after,
    'Signed in as yourself, you look each person up; I never type a Medicaid number or DCN into a state site.', '', 'The CDS Coordinator, ' + niceDay(today)].join('\n');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0d365f"><h2 style="margin:0 0 8px">Sign-in needed: ' + esc(P.label) + '</h2>' +
    '<p>Please sign in to ' + esc(P.label) + ' ' + esc(P.why) + '.</p><p>' + links.map(([l, u]) => '<a href="' + esc(u) + '" style="display:inline-block;background:#0d365f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;margin:0 8px 8px 0">' + esc(l) + '</a>').join('') + '</p>' +
    '<ul>' + list.map(x => '<li>' + esc(line(x)) + '</li>').join('') + '</ul><p>' + esc(P.after) + '</p>' +
    '<p style="color:#667;font-size:13px">Signed in as yourself, you look each person up. The Coordinator never types a Medicaid number or DCN into a state site. Open the <a href="https://hub.caringcds.com/#starting">Starting page</a>.</p></div>';
  return { subject, text, html, week: 'Sign in to ' + P.label + ': ' + list.map(x => x.name).join(', ') };
}

// Job 1: phones and emails heard for people who have none. comms: cds_comms rows grouped { phone10, contact_name, n, last };
// cc: cds-call-feed { found } answers. taken: phones that already belong to someone we watch.
export function findContacts({ wanted, comms, cc, taken }) {
  const out = [], seen = new Set(), busy = new Set([...(taken || []), ...OFFICE_LINES]);
  wanted.forEach(w => {
    const k = norm(w.name);
    const add = (phone, email, where, calls, last) => {
      const p = ten(phone), e = okEmail(email) ? String(email).trim().toLowerCase() : '';
      if ((!p && !e) || (p && busy.has(p))) return;
      const key = w.person_kind + ':' + w.person_id + ':contact:' + (w.for === 'attendant' ? norm(w.name) + ':' : '') + (p || e);
      if (seen.has(key)) return; seen.add(key);
      out.push({ key, person_kind: w.person_kind, person_id: w.person_id, person_name: w.person_name, kind: 'contact', status: 'suggested',
        data: { for: w.for, name: w.name, phone: p, email: p ? '' : e, where, calls: calls || 0, last: String(last || '').slice(0, 10) } });
    };
    (comms || []).filter(r => norm(r.contact_name) === k).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 2)
      .forEach(r => add(r.phone10, '', 'the CDS line', r.n, r.last));
    const f = (cc || []).find(x => norm(x.name) === k);
    if (f && f.people === 1) {   // two Caring Companions people with one name: never guess between them
      (f.phones || []).slice(0, 2).forEach(p => add(p.phone10, '', 'the Caring Companions line', p.calls, p.last_at));
      if (f.email && w.for !== 'attendant') add('', f.email, 'the Caring Companions records', 0, '');
    }
  });
  return out;
}
// Who has no way to reach them: Starting consumers and open leads with no phone and no email, and attendants the tracker
// says to text but who have no phone anywhere.
export function wantedContacts({ consumers, pipeline, rows, needs }) {
  const out = [];
  const closed = s => /^closed|^lost|^not_?interested/i.test(String(s || ''));
  (rows || []).forEach(({ c, lead }) => { if (!ten(c.phone) && !okEmail(c.email) && !ten(lead.phone) && !okEmail(lead.email) && fullName(c.name))
    out.push({ person_kind: 'consumer', person_id: String(c.id), person_name: c.name, name: c.name, for: 'consumer' }); });
  const onList = new Set((rows || []).map(r => String(r.lead.id)));   // a Starting consumer's own lead is asked about once, as the consumer
  (pipeline || []).filter(p => p && p.id && real(p) && !p.movedToConsumers && !p.startingId && !onList.has(String(p.id)) && !closed(p.status) && !ten(p.phone) && !okEmail(p.email) && fullName(p.name))
    .forEach(p => out.push({ person_kind: 'lead', person_id: String(p.id), person_name: p.name, name: p.name, for: 'lead' }));
  (needs || []).filter(n => n.who !== n.person_name && fullName(n.who))
    .forEach(n => out.push({ person_kind: 'consumer', person_id: n.person_id, person_name: n.person_name, name: n.who, for: 'attendant' }));
  return out;
}

export function createJobs({ db, send, packetSend, ccNames, nowMs = () => Date.now() }) {
  const q = async (t, p) => (await db.query(t, p || [])).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const AG = 'caring-companions-cds';
  const data = async k => { const r = await one('select data_value from agency_data where agency_id = $1 and data_key = $2', [AG, k]); return (r && r.data_value) || null; };
  const chicagoDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const setting = async (k, d) => { const r = await one('select value from cds_match_settings where key = $1', [k]); return (r && r.value) || d; };

  async function gather() {
    const today = chicagoDay(nowMs());
    const consumers = (await data('consumers')) || [], pipeline = (await data('pipeline')) || [], roster = (await data('attendants')) || [];
    const authRec = ((await data('authorizations')) || {}).records || {};
    const auths = Object.fromEntries(Object.values(authRec).map(a => [norm(a.consumer), true]));
    const packets = await q(`select lead_id, consumer_id, sent_at, signed_at, office_signed_at, answers->>'first' as first, answers->>'last' as last from cds_enroll_packets`);
    const onboarding = await q(`select a.first_name, a.last_name, a.phone, k.consumer_name from cds_packets k join attendant_pool a on a.id = k.pool_id where coalesce(a.archived,false) = false`);
    const heard = await q(`select id, kind, person_kind, person_id, data, status from cds_coord_items where kind in ('attendant','contact')`);
    const rows = trackRows({ consumers, pipeline, packets, onboarding, roster, auths, today });
    return { today, consumers, pipeline, rows, heard, onboarding };
  }

  // Job 1.
  async function contacts(g) {
    const { needs } = planPackets({ rows: g.rows, heard: g.heard });
    const wanted = wantedContacts({ consumers: g.consumers, pipeline: g.pipeline, rows: g.rows, needs });
    if (!wanted.length) return { wanted: 0, added: 0 };
    const taken = new Set();
    g.consumers.forEach(c => { [c.phone, ...(c.relatedPeople || []).map(p => p && p.phone)].map(ten).filter(Boolean).forEach(p => taken.add(p)); });
    g.pipeline.forEach(p => { [p.phone, (p.attendant || {}).phone, ...(p.relatedPeople || []).map(r => r && r.phone)].map(ten).filter(Boolean).forEach(x => taken.add(x)); });
    g.onboarding.forEach(a => { const p = ten(a.phone); if (p) taken.add(p); });
    const comms = await q(`select phone10, contact_name, count(*)::int as n, max(at) as last from cds_comms
      where phone10 is not null and contact_name is not null and at > now() - interval '180 days' group by 1, 2`);
    let cc = [], ccNote = 'ok';
    if (ccNames) { try { cc = ((await ccNames(wanted.map(w => w.name))) || {}).found || []; } catch (e) { ccNote = String(e && e.message || e).slice(0, 160); } }
    let added = 0;
    for (const it of findContacts({ wanted, comms, cc, taken: [...taken] })) {
      const r = await one(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
        values ($1, $2, $3, $4, 'contact', $5::jsonb, $6::jsonb, 'suggested', $7) on conflict (key) do nothing returning id`,
        [it.key, it.person_kind, it.person_id, it.person_name, JSON.stringify(it.data), JSON.stringify({ line: /Caring/.test(it.data.where) ? 'cc' : 'cds', kind: 'lookup', at: new Date(nowMs()).toISOString(), summary: 'Found by name in ' + it.data.where + '.' }), g.today]);
      if (r) added++;
    }
    return { wanted: wanted.length, added, cc: ccNote };
  }

  // Job 2.
  async function packets(g) {
    const sw = await setting('packet_sends', { live: false });
    const live = sw.live === true;
    const { drafts, needs } = planPackets({ rows: g.rows, heard: g.heard });
    let made = 0, sent = 0, failed = 0;
    for (const d of drafts) {
      const r = await one(`insert into cds_coord_msgs (key, kind, person_kind, person_id, person_name, to_name, phone, body, status, data)
        values ($1, $2, 'consumer', $3, $4, $5, $6, $7, 'draft', $8::jsonb) on conflict (key) do nothing returning id`,
        [d.key, d.kind, d.person_id, d.person_name, d.to_name, d.phone || '', d.body, JSON.stringify(d.data)]);
      if (!r) continue;
      made++;
      if (live && sendingHours(nowMs())) { const x = await sendPacket(r.id, 'coordinator'); x.ok ? sent++ : failed++; }
    }
    // A switch turned on later sends what is still waiting (written in the last 3 days), in hours only.
    if (live && sendingHours(nowMs())) for (const m of await q(`select id from cds_coord_msgs where status = 'draft' and kind in ('packet','apppacket') and created_at > now() - interval '3 days' order by id limit 10`)) {
      const x = await sendPacket(m.id, 'coordinator'); x.ok ? sent++ : failed++;
    }
    // Need a phone: one open item per person and what for, closed by itself when it is no longer needed.
    const want = new Map(needs.map(n => ['consumer:' + n.person_id + ':need_contact:' + norm(n.who), n]));
    for (const [key, n] of want) await q(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
      values ($1, 'consumer', $2, $3, 'need_contact', $4::jsonb, '{}'::jsonb, 'open', $5) on conflict (key) do update set due = excluded.due, status = case when cds_coord_items.decided_by = 'coordinator' then 'open' else cds_coord_items.status end,
      decided_by = case when cds_coord_items.decided_by = 'coordinator' then null else cds_coord_items.decided_by end`, [key, n.person_id, n.person_name, JSON.stringify({ who: n.who, what: n.what }), g.today]);
    let closed = 0;
    for (const r of await q(`select id, key from cds_coord_items where kind = 'need_contact' and status = 'open'`)) if (!want.has(r.key)) {
      await q(`update cds_coord_items set status = 'done', decided_by = 'coordinator', decided_at = now() where id = $1`, [r.id]); closed++; }
    return { live, made, sent, failed, need_phone: needs.length, closed };
  }
  // Send one packet draft through the hub's own server code. Re-checked first: a packet the hub sent meanwhile is not sent again.
  async function sendPacket(id, by) {
    const m = await one(`select * from cds_coord_msgs where id = $1`, [+id]);
    if (!m) return { ok: false, error: 'That draft is gone.' };
    if (m.status === 'sent') return { ok: true, already: true };
    if (!['packet', 'apppacket'].includes(m.kind)) return { ok: false, error: 'Not a packet.' };
    let r;
    try { r = await packetSend(m.kind, m.data || {}, by); }
    catch (e) { r = { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
    if (r && r.already) {
      await q(`update cds_coord_msgs set status = 'skipped', error = $2, sent_by = $3, sent_at = now() where id = $1`, [m.id, 'Already sent from the hub, so nothing was sent again.', by]);
      return { ok: true, already: true };
    }
    if (!r || !r.ok || ['failed', 'held'].includes(r.status)) {
      const err = r && r.status === 'held' ? 'Saved, but held: the ' + (m.kind === 'packet' ? 'Enrollment packet texts' : 'Attendant application texts') + ' switch is off (Switches card).' : String((r && r.error) || 'It did not go.');
      await q(`update cds_coord_msgs set status = 'failed', error = $2 where id = $1`, [m.id, err.slice(0, 200)]);
      return { ok: false, error: err };
    }
    await q(`update cds_coord_msgs set status = 'sent', sent_at = now(), sent_by = $2, error = null where id = $1`, [m.id, by]);
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, 'coordinator_packet', $2, $3::jsonb)`, [by, 'coordmsg:' + m.id, JSON.stringify({ kind: m.kind, person: 'consumer:' + m.person_id })]);
    return { ok: true };
  }

  // Job 3. Weekdays from 8 AM Central, once a day per portal.
  async function signIns(g, set, { force = false } = {}) {
    const now = nowMs(), today = g.today;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
    const plan = planSignIns(g.rows), done = Object.assign({}, set.signin_day || {}), out = {};
    for (const portal of ['emomed', 'fusion']) {
      const list = plan[portal], id = 'i:coordsign-' + portal;
      if (!list.length) { await q('delete from owner_calendar where id = $1', [id]); out[portal] = 'nobody waiting'; continue; }
      const w = signInWords(portal, list, today);
      await q(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), 'cds-coordinator')
        on conflict (id) do update set data = excluded.data, updated_at = now() where owner_calendar.data->>'t' is distinct from excluded.data->>'t' or owner_calendar.data->>'date' is distinct from excluded.data->>'date'`,
        [id, JSON.stringify({ t: w.week.slice(0, 160), date: today, time: '', every: 'once', cat: 'cds', note: 'From the CDS Coordinator. Sign-in link: ' + PORTALS[portal].url + ' . Katlin can do these on her evening shift.', by: 'coordinator' })]);
      if (!force && (['Sat', 'Sun'].includes(parts.weekday) || +parts.hour < 8 || +parts.hour >= 19)) { out[portal] = 'not yet'; continue; }
      if (!force && done[portal] === today) { out[portal] = 'already asked today'; continue; }
      const to = await one(`select email from owner_reminders where id = 'samantha'`);
      const also = (Array.isArray(set.signin_also) ? set.signin_also : []).filter(okEmail);
      if (!to || !to.email) { out[portal] = 'no address'; continue; }
      try { for (const email of [to.email, ...also]) await send({ email, subject: w.subject, text: w.text, html: w.html }); }
      catch (e) { out[portal] = 'failed: ' + String(e && e.message || e).slice(0, 160); continue; }
      done[portal] = today; out[portal] = 'sent (' + list.length + ')';
    }
    await q(`update cds_match_settings set value = value || $1::jsonb where key = 'coordinator'`, [JSON.stringify({ signin_day: done })]);
    return out;
  }

  async function run(set, opts = {}) {
    const g = await gather();
    const res = {};
    for (const [k, f] of [['contacts', () => contacts(g)], ['packets', () => packets(g)], ['signins', () => signIns(g, set, opts)]]) {
      try { res[k] = await f(); } catch (e) { res[k] = { error: String(e && e.message || e).slice(0, 200) }; }   // one failing never stops the others
    }
    return res;
  }
  return { run, contacts, packets, signIns, sendPacket, gather };
}
