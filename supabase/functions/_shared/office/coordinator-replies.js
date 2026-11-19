// The CDS Coordinator answers texts back (2026-11-18, her yes: "what else needs to be built for our ai cds coordinator
// to do as much as possible" -> "yes" to text-back replies).
//
// When a consumer or attendant texts back after one of the Coordinator's texts (clock-in help, "has the state called",
// a check-in, a welcome text, or its own earlier answer), and nobody at the office has texted them since, Claude reads
// the thread and picks one of three:
//   reply   a short, warm answer it can give from what the text said (thanks, how clocking in works, "we will let
//           you know", "a coordinator will call you"): a 'reply' draft, the same switch as its other texts
//   person  anything a person must handle (a question about Medicaid, hours, pay, eligibility, a health or safety
//           worry, someone upset, a change of caregiver, anything it is not sure of): a 'concern' item, which goes on
//           My Week today and the 4:30 email; nothing is texted
//   none    nothing to say ("ok", a thumbs up)
// Never: Medicaid numbers, money, hours or start-date promises, a diagnosis, the word AI, claiming to be a person.
// What they said is still read by the listener (coordinator.js) for promises and dates, as before.
// No em dashes in anything a person reads (her rule).
const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
const first = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const noDash = t => String(t || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
export const LINE = '(417) 218-2888';
export const REPLY_KINDS = ['clock', 'dsds', 'check', 'journey', 'reply'];

export const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['action', 'reply', 'note'],
  properties: { action: { type: 'string', enum: ['reply', 'person', 'none'] }, reply: { type: 'string' }, note: { type: 'string' } }
};
const SYSTEM = [
  'You answer text messages for the office of Caring Companions Direct Services (CDS), a small Missouri Medicaid consumer directed home care agency. A consumer gets care; their attendant is the caregiver they chose, often family.',
  'You get the last text our office sent this person and what they texted back. Decide one action:',
  'reply: only when a short, kind, plain answer is enough and needs no decision: thank them, confirm we got it, say a coordinator will call them, point to the clock-in steps at caringcds.com/clock-in, say we will let them know when the state answers. Under 300 characters, one or two sentences, sign it exactly as told, no em dashes.',
  'person: anything a person at the office must handle or decide: Medicaid, eligibility, hours, pay, payroll, start dates, schedules, changing or ending care or the caregiver, a health or safety worry, a fall or hospital stay, someone upset or confused, a complaint, a problem with the state, anything you are not sure about. note: a few plain words saying what they need. reply stays empty; nobody is texted.',
  'none: nothing needs saying (ok, thanks, a thumbs up, a heart). reply and note stay empty.',
  'Never promise hours, money, eligibility or a start date. Never ask for or repeat a Medicaid number, DCN, Social Security number or date of birth. Never mention AI, a computer, a recording or a transcript, and never claim to be a person. When in doubt, choose person.'
].join('\n');

export function replyRequest(v, model) {
  return { model, max_tokens: 800, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } }, system: SYSTEM,
    messages: [{ role: 'user', content: 'Their first name: ' + first(v.to_name) + '. Sign a reply exactly: ' + v.sign + '.\nOur last text to them (' + String(v.sent_at).slice(0, 10) + '):\n' + String(v.ours).slice(0, 600) +
      '\nWhat they texted back:\n' + v.theirs.map(t => '- ' + String(t).slice(0, 600)).join('\n') }] };
}
export function cleanReply(resp) {
  if (!resp || resp.stop_reason === 'refusal') return { action: 'person', reply: '', note: 'could not read their text' };
  let j; try { j = JSON.parse((resp.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('')); } catch { return { action: 'person', reply: '', note: 'could not read their text' }; }
  const action = ['reply', 'person', 'none'].includes(j.action) ? j.action : 'person';
  return { action, reply: action === 'reply' ? noDash(j.reply).slice(0, 480) : '', note: noDash(j.note).slice(0, 200) };
}

// Who texted back after our last text, with nobody at the office answering since. sent: our sent coordinator texts
// (newest first per phone wins); comms: cds_comms sms rows for those phones, oldest first.
export function planReplies({ sent, comms, nowMs, maxAgeHours = 48 }) {
  const lastOurs = new Map();
  (sent || []).forEach(m => { const p = ten(m.phone); if (!p || !REPLY_KINDS.includes(m.kind) || !m.sent_at) return; const x = lastOurs.get(p); if (!x || String(m.sent_at) > String(x.sent_at)) lastOurs.set(p, m); });
  const out = [];
  for (const [phone, ours] of lastOurs) {
    const rows = (comms || []).filter(r => ten(r.phone10) === phone && r.channel === 'sms' && new Date(r.at).toISOString() > new Date(ours.sent_at).toISOString());
    const lastOut = rows.filter(r => r.direction === 'outbound').map(r => new Date(r.at).toISOString()).sort().pop() || '';
    const theirs = rows.filter(r => r.direction === 'inbound' && r.body && new Date(r.at).toISOString() > lastOut);
    if (!theirs.length) continue;
    const newest = theirs[theirs.length - 1];
    if (nowMs - new Date(newest.at).getTime() > maxAgeHours * 3600e3) continue;   // too old to answer now
    out.push({ key: 'reply:' + phone + ':' + newest.id, phone, ours, theirs: theirs.map(r => r.body), at: new Date(newest.at).toISOString(), last_id: newest.id });
  }
  return out;
}
