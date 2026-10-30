// The CDS lead link page (2026-10-19, Samantha: "build the CDS lead link page with
// this wording"). hub.caringcds.com/lead/?k=... calls the server function
// cds-lead-link, which is a thin wrapper around this file.
//
// A link is for ONE lead and ONE person, from their own new-lead text or email, and
// works for 7 days. With it they can see what the lead wrote, log the call, and open
// the intake questions in the hub (which needs a sign-in, because those questions
// ask for date of birth and the Medicaid number).
//
// Nothing here ever contacts the lead. It reads; the only thing it writes is a call
// someone logs (table cds_lead_calls), which stops the reminder for everyone.
// No em dashes in anything a person reads (her rule).
import './cds-rules.js';
import { tokenHash, time12, whenShort, AGENCY_ID, HUB } from './lead-alerts.js';
const R = globalThis.CDSRules;

export const OUTCOMES = { connected: 'We talked', voicemail: 'Voicemail', no_answer: 'No answer', wrong_number: 'Wrong number' };
export const EXPIRED = 'This link has expired. Open Leads in the CDS hub.';
export class LinkError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const countyOf = c => { c = String(c || '').trim(); return !c ? '' : /county/i.test(c) ? c : c + ' County'; };
const first = s => String(s || '').trim().split(/\s+/)[0] || '';

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms,
//         ghl?: { contactUrl({contactId, phone, email}) -> url|null, texts({contactId, phone, email}) -> {ok, messages:[{body, at}]} },
//         bridge?: { ring({email, name}, lead) -> {ok, message} } }   (call-bridge.js, "Ring my phone, then connect")
//         contactId is the lead's linked GoHighLevel contact (site_leads.ghl_contact_id) when there is one.
export function createLeadLink(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;

  async function linkOf(k) {
    if (!/^[0-9A-Za-z]{16}$/.test(String(k || ''))) throw new LinkError(EXPIRED, 401);
    const l = await one('select * from cds_lead_links where token_hash=$1', [await tokenHash(k)]);
    if (!l || Date.parse(l.expires_at) < now()) throw new LinkError(EXPIRED, 401);
    if (l.comm_id) return { l, lead: null };
    const lead = await one('select * from site_leads where id=$1 and agency_id=$2', [l.site_lead_id, AGENCY_ID]);
    if (!lead) throw new LinkError(EXPIRED, 401);
    return { l, lead };
  }

  // A voicemail link (2026-10-29): the voicemail's note and words, Listen, call back, and whether
  // anyone already did. Nothing to log here: calling back from GoHighLevel closes the follow-up.
  async function voicemailOf(l) {
    const v = await one(`select c.id, c.at, c.phone10, c.ghl_contact_id, c.conversation_id, c.seconds, n.note, n.final_note, n.transcript, n.status
      from cds_comms c left join cds_call_notes n on n.comm_id = c.id where c.id=$1`, [l.comm_id]);
    if (!v) throw new LinkError(EXPIRED, 401);
    return v;
  }
  async function voicemailView(l) {
    const v = await voicemailOf(l);
    const at = Date.parse(v.at);
    const back = v.phone10 ? await q(`select direction, channel, answered, staff_name, at from cds_comms where phone10=$1 and at > $2
      and (direction='outbound' or (channel='call' and answered)) order by at desc limit 5`, [v.phone10, v.at]) : [];
    const pretty = v.phone10 ? '(' + v.phone10.slice(0, 3) + ') ' + v.phone10.slice(3, 6) + '-' + v.phone10.slice(6) : 'A hidden number';
    const contactUrl = deps.ghl && deps.ghl.appUrl ? (v.ghl_contact_id ? deps.ghl.appUrl('/contacts/detail/' + encodeURIComponent(v.ghl_contact_id))
      : v.conversation_id ? deps.ghl.appUrl('/conversations/conversations/' + encodeURIComponent(v.conversation_id)) : null) : null;
    const word = r => r.channel === 'sms' ? 'Texted' : r.answered ? 'Talked' : 'Called, no answer';
    return {
      kind: 'voicemail', me: l.person_name, name: pretty, first: 'them', phone: v.phone10 || '',
      came_in: isNaN(at) ? '' : whenShort(at, now()),
      note: v.final_note || v.note || '', transcript: v.transcript || '',
      unread: !v.note ? (v.status === 'no_transcript' ? 'GoHighLevel has no words for this voicemail. Listen to it.' : 'Not read yet. Listen to it.') : '',
      back: back.map(r => ({ by: r.staff_name || 'The office', what: word(r), at: whenShort(Date.parse(r.at), now()) })),
      open_minutes: back.length ? null : Math.max(0, Math.round((now() - at) / 60000)),
      contact_url: contactUrl, can_ring: !!deps.bridge && !!v.ghl_contact_id, can_listen: !!deps.recording,
      followups_url: HUB + '#followups',
    };
  }
  async function view(k) {
    const { l, lead } = await linkOf(k);
    await q('update cds_lead_links set last_opened_at=$2 where token_hash=$1', [l.token_hash, new Date(now()).toISOString()]);
    if (!lead) return voicemailView(l);
    const calls = await q('select by_name, outcome, note, at from cds_lead_calls where site_lead_id=$1 order by at desc limit 10', [lead.id]);
    const at = Date.parse(lead.submitted_at);
    const last = calls[0] || null;
    const name = R.siteLeadName(lead);
    let theirTexts = null, contactUrl = null;
    if (deps.ghl) {
      const who = { contactId: lead.ghl_contact_id || null, phone: lead.phone, email: lead.email };
      try { contactUrl = await deps.ghl.contactUrl(who); } catch { contactUrl = null; }
      try { theirTexts = await deps.ghl.texts(who); } catch { theirTexts = { ok: false, messages: [] }; }
    }
    return {
      me: l.person_name,
      name, first: first(lead.first_name || name),
      came_in: isNaN(at) ? '' : whenShort(at, now()),
      source: String(lead.source || '').trim() || 'the website',
      county: countyOf(lead.county), who: lead.who_needs_care || '', medicaid: lead.has_medicaid || '',
      wrote: lead.message || '', phone: lead.phone || '', email: lead.email || '',
      open_minutes: last ? null : Math.max(0, Math.round((now() - at) / 60000)),
      last: last ? { by: last.by_name, outcome: OUTCOMES[last.outcome] || last.outcome, talked: last.outcome === 'connected',
                     at: (now() - Date.parse(last.at) > 20 * 3600e3) ? whenShort(Date.parse(last.at), now()) : time12(Date.parse(last.at)) } : null,
      calls: calls.map(c => ({ by: c.by_name, outcome: OUTCOMES[c.outcome] || c.outcome, note: c.note || '', at: whenShort(Date.parse(c.at), now()) })),
      their_texts: theirTexts, contact_url: contactUrl, can_ring: !!deps.bridge,
      intake: { referral: HUB + '#lead=' + lead.id + '&intake=referral', pccp: HUB + '#lead=' + lead.id + '&intake=pccp' },
      leads_url: HUB + '#pipeline',
    };
  }

  async function called(k, input) {
    const { l, lead } = await linkOf(k);
    if (!lead) throw new LinkError('Call them back from GoHighLevel. That closes the follow-up for everyone.');
    const outcome = String(input.outcome || '');
    if (!OUTCOMES[outcome]) throw new LinkError('Pick what happened first.');
    const note = String(input.note || '').trim().slice(0, 300);
    const recent = await one(`select count(*)::int n from cds_lead_calls where site_lead_id=$1 and by_email=$2 and at > $3`,
      [lead.id, l.person_email, new Date(now() - 20000).toISOString()]);
    if (recent.n) throw new LinkError('That call is already logged.');
    const before = await one('select count(*)::int n from cds_lead_calls where site_lead_id=$1', [lead.id]);
    await q(`insert into cds_lead_calls (site_lead_id, by_name, by_email, outcome, note, at) values ($1,$2,$3,$4,$5,$6)`,
      [lead.id, l.person_name, l.person_email, outcome, note || null, new Date(now()).toISOString()]);
    return { ok: true, first_call: before.n === 0, message: 'Logged. The reminder is stopped.' };
  }

  // "Ring my phone, then connect" (2026-10-20): the person is the one the link was made for.
  // Ringing does not log a call; they still pick what happened.
  async function ring(k) {
    const { l, lead } = await linkOf(k);
    if (!deps.bridge) throw new LinkError('Ringing your phone is not set up yet. Call from the CDS line, (417) 218-2888.');
    if (!lead) {
      const v = await voicemailOf(l);
      if (!v.ghl_contact_id) throw new LinkError('This caller is not a GoHighLevel contact. Call from the CDS line, (417) 218-2888.');
      return deps.bridge.ring({ email: l.person_email, name: l.person_name }, { id: 'voicemail:' + v.id, first_name: '', phone: v.phone10, ghl_contact_id: v.ghl_contact_id });
    }
    return deps.bridge.ring({ email: l.person_email, name: l.person_name }, lead);
  }
  // The voicemail's recording, for Listen. Only for a voicemail link.
  async function recording(k) {
    const { l } = await linkOf(k);
    if (!l.comm_id || !deps.recording) throw new LinkError('There is no recording here.', 404);
    return deps.recording(l.comm_id);
  }

  async function handle(body) {
    const action = String(body?.action || 'view');
    if (action === 'view') return view(body.k);
    if (action === 'called') return called(body.k, body);
    if (action === 'ring') return ring(body.k);
    throw new LinkError('Unknown request');
  }
  return { view, called, ring, recording, handle };
}
