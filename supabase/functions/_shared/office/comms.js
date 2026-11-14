import { createFromVoicemail } from './lead-from-voicemail.js';
// CDS Communication & Follow-Up Center, step 1 (2026-10-22, her approved design, mockup
// artifact 6DTNtZDFccu8i3ZbJZhmee).
//
// Every 5 minutes: read new calls and texts from GoHighLevel (both CDS lines live in the one
// CDS sub-account), save each once (cds_comms, keyed by the GoHighLevel message id), work out who
// it is from the phone book, and keep follow-ups on the hub's task list (cds_tasks area 'followup'):
//   - a missed call or voicemail opens a follow-up, or adds to the open one for that number;
//   - texts nobody answered for 10 minutes do the same ("ok" and "thanks" do not);
//   - an unknown number, or one on two different people, opens a "Who is this?" follow-up;
//   - it closes itself when someone on the team texts that number, or a call with them connects.
//     A call back that does not connect is added to the card and the card stays open.
// It only READS GoHighLevel. It never calls, texts or emails anyone, and never changes a contact.
// Owners come from setting comm_center.owners (the hub picks the owner, never the AI); until she
// sets them every card is "Nobody yet". Calls never count as monthly check-ins.
// No em dashes in anything a person reads (her rule).
//
// Step 2 (2026-10-22, her approved mockup LBNkuRZyb7pJebrykd4Mxm): every card gets a need, an owner
// for that need (comm_center.owners, set on the Switches page), and "Care or safety today" when a
// text says so. No AI: who is calling and simple words only. A need, owner or urgency a person sets
// is never changed by the hub. "Later this week" moves a card to a day. The check-in tap lists
// real calls of 3 minutes or more with a consumer or their family; only the hub's check-in form,
// saved by a person, counts as a check-in. Nothing here texts or calls anyone.

export const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const normName = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
// Payroll writes "Lopez, Maria"; the roster writes "Maria Lopez". Both are the same person.
const nameKeys = s => { const t = String(s || ''), k = new Set([normName(t)]); const m = t.match(/^\s*([^,]+),\s*(.+)$/); if (m) k.add(normName(m[2] + m[1])); k.delete(''); return k; };
const sameName = (a, b) => { const B = nameKeys(b); return [...nameKeys(a)].some(x => B.has(x)); };
const TRIVIAL = /^(ok|okay|k|kk|thanks|thank you|thank u|thx|ty|sounds good|great|perfect|got it|will do|you too|yw|welcome|bye)[.! ]*$/i;
export const TEXT_QUIET_MIN = 10;

// ---------- step 2: needs, owners, care or safety ----------
export const NEEDS = [
  { key: 'enrollment', label: 'Enrollment' }, { key: 'evv', label: 'Clock-in & EVV' }, { key: 'pay', label: 'Pay' },
  { key: 'attendant_change', label: 'Attendant change' }, { key: 'hours', label: 'Hours & care plan' },
  { key: 'concern', label: 'Concern or complaint' }, { key: 'other', label: 'Other' }, { key: 'not_sure', label: 'Not sure yet' }];
export const NEED_LABEL = Object.fromEntries(NEEDS.map(n => [n.key, n.label]));
// Her approved owners (2026-10-22): Zach for everything but Pay and Concern or complaint.
export const DEFAULT_NEED_OWNERS = { enrollment: 'zach@mo-care.com', evv: 'zach@mo-care.com', pay: 'samantha@mo-care.com',
  attendant_change: 'zach@mo-care.com', hours: 'zach@mo-care.com', concern: 'samantha@mo-care.com', other: 'zach@mo-care.com', not_sure: 'zach@mo-care.com' };
// Words in a text (the approved list), checked in this order.
const NEED_WORDS = [
  ['concern', /complain|\bupset\b/i],
  ['attendant_change', /new attendant|\bquit\b|\bquitting\b|did ?n[o']?t (come|show)|didn'?t (come|show)|no[- ]show/i],
  ['evv', /\bclock(ed|ing)?\b|\bapp\b|\bevv\b|\bshift\b/i],
  ['pay', /\bcheck\b|\bpaid\b|\bpay(check|day|roll)?\b|\bw-?2\b/i],
  ['hours', /\bhours\b|care plan/i]];
// Care or safety words (her approved list), and the words shown back on the card.
const URGENT_WORDS = /did ?n[o']?t come|didn'?t come|no[- ]show|nobody is here|no one is here|nobody'?s here|\bfell\b|hospital|\b911\b|\bhurt(ing|s)?\b|no food/i;
const textsOf = events => (events || []).filter(e => e.kind === 'text').map(e => String(e.text || ''));
export function guessNeed(personKind, events) {
  if (personKind === 'lead' || personKind === 'applicant') return 'enrollment';
  const texts = textsOf(events).reverse();
  for (const t of texts) for (const [key, re] of NEED_WORDS) if (re.test(t)) return key;
  return 'not_sure';
}
// Why a card is care or safety today, or '' when it is not. An attendant who says they cannot clock
// in, today: a shift may be going on (CDS shifts are not scheduled ahead, so the hub cannot know).
export function urgentWhy(personKind, events, nowMs) {
  for (const t of textsOf(events)) { const m = t.match(URGENT_WORDS); if (m) return 'The text says "' + m[0] + '".'; }
  if (personKind === 'attendant' && (events || []).some(e => e.kind === 'text' && /\bclock|\bapp\b|\bevv\b/i.test(e.text || '') && nowMs - Date.parse(e.at) < 12 * 3600000))
    return 'An attendant says they cannot clock in. A shift may be going on now.';
  return '';
}
const firstNameOf = e => { const n = String(e || '').split('@')[0].replace(/[^a-z]/gi, ''); return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; };
// Missouri's date (America/Chicago), YYYY-MM-DD.
export const chicagoDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const byPerson = v => !!v && v !== 'hub';
// A date column comes back as a Date or a string, depending on the driver.
const dayOf = v => !v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

// Words for the kinds of people (cards and profiles).
export const KIND_LABEL = { lead: 'Lead', consumer: 'Consumer', family: 'Family', attendant: 'Attendant', pool: 'Attendant',
  applicant: 'Applicant', staff: 'Our team', ignore: 'Not for CDS' };

// ---------- one GoHighLevel message, made plain ----------
// Calls: messageType TYPE_CALL (and IVR/custom calls), TYPE_VOICEMAIL. Duration and status sit in
// meta.call (seen live by the Caring Companions hub) or meta.callDuration / meta.callStatus (the docs).
export function plainMessage(m, conv) {
  const type = String(m.messageType || m.type || '');
  const call = /CALL|VOICEMAIL/i.test(type);
  const sms = /SMS/i.test(type);
  if (!call && !sms) return null;
  const direction = m.direction === 'outbound' ? 'outbound' : m.direction === 'inbound' ? 'inbound' : null;
  if (!direction || !m.id || !m.dateAdded) return null;
  const meta = m.meta || {};
  const seconds = Math.max(0, Math.round(+(meta.call?.duration ?? meta.callDuration ?? 0) || 0));
  const status = String(meta.call?.status ?? meta.callStatus ?? m.status ?? '').toLowerCase();
  const voicemail = call && (status === 'voicemail' || /VOICEMAIL/i.test(type));
  const answered = call && !voicemail && (status === 'completed' || status === 'answered') && seconds > 0;
  return {
    id: String(m.id), channel: call ? 'call' : 'sms', direction, at: new Date(m.dateAdded).toISOString(),
    phone10: ten(conv?.phone || m.phone || ''), ghl_contact_id: String(m.contactId || conv?.contactId || '') || null,
    conversation_id: String(m.conversationId || conv?.id || '') || null,
    contact_name: String(conv?.fullName || conv?.contactName || '').slice(0, 120) || null,
    status: status || null, seconds, answered, voicemail,
    user_id: m.userId ? String(m.userId) : null,
    body: sms ? String(m.body || '').slice(0, 1000) : null,
  };
}

// ---------- call notes (2026-10-29, her approved mockup 6CxaqzDSJABjRYnGxc6tZg) ----------
// After an answered call on a CDS line, GoHighLevel's transcript becomes a short note and a suggested
// call back date for the person, saved as WAITING in cds_call_notes. Nothing reaches the person's record
// until someone in the office presses OK on the hub (her rule: draft first). Never sent to anyone.
// Behind the switch call_notes.live (off until she turns it on). BAAs cover CDS (her words 2026-10-29).
export const NOTE_MODEL = 'claude-opus-5-5';
// Answers from the call (2026-11-05, her ask: "summarize the lead info that comes from calls"; mockup W47w6qkzLLB3FF91iEJ8J1):
// the same questions as the hub's first call screen. Empty when it was not said. They wait with the note; the office ticks
// which go on the lead when it presses OK. Nothing reaches a lead without that.
export const ANSWER_HELP = ['bathing', 'dressing', 'eating', 'toileting', 'mobility', 'meals', 'meds', 'housekeeping', 'errands'];
const ANSWERS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['who', 'first', 'last', 'dob', 'county', 'medicaid', 'dcn', 'cds', 'agency', 'help', 'help_note', 'attendant', 'att_name', 'att_phone', 'att_relation'],
  properties: {
    who: { type: 'string', enum: ['self', 'family', 'pair', 'solo', ''] },
    first: { type: 'string' }, last: { type: 'string' }, dob: { type: 'string' }, county: { type: 'string' },
    medicaid: { type: 'string', enum: ['yes', 'no', 'applied', ''] }, dcn: { type: 'string' },
    cds: { type: 'string', enum: ['new', 'move', ''] }, agency: { type: 'string' },
    help: { type: 'array', items: { type: 'string', enum: ANSWER_HELP } }, help_note: { type: 'string' },
    attendant: { type: 'string', enum: ['has', 'find', ''] }, att_name: { type: 'string' }, att_phone: { type: 'string' }, att_relation: { type: 'string' }
  }
};
export const NOTE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['about_person', 'new_lead', 'note', 'call_back', 'people', 'answers'],
  properties: {
    answers: ANSWERS_SCHEMA,
    about_person: { type: 'boolean' },
    new_lead: { type: 'boolean' },
    note: { type: 'string' },
    call_back: { type: 'string' },
    people: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'relation', 'phone'],
      properties: { name: { type: 'string' }, relation: { type: 'string' }, phone: { type: 'string' } } } }
  }
};
const NOTE_SYSTEM = [
  'You write call notes for the office of Caring Companions Direct Services (CDS), a Missouri home care agency for consumer directed services paid by Medicaid.',
  'You get the transcript of one phone call on the office line, who the hub thinks the caller is, and the call date.',
  'Write the note for the office staff: 2 to 4 short, plain sentences. Say what the caller needed and the facts the office will want later: who needs care, Medicaid and DCN, the care or hours needed, who would be the attendant, their current agency, anything the office promised, and when to call back. Use first names. Only write what was said; leave out anything that was not.',
  'Never use em dashes. Do not mention the transcript, the recording or yourself.',
  'call_back: a date as YYYY-MM-DD only when a call back day was agreed or is clearly needed (count from the call date; "Friday" means the next Friday after the call date). Otherwise an empty string.',
  'people: everyone named on the call other than the office staff and the person the hub thinks this is, who matters to their care (family, an attendant, a case manager): their name, how they relate to the client in one or two words, and a phone number only if it was said aloud (digits only, else empty).',
  'about_person: false only when the call is clearly not about that person (a wrong number, or a call about a different client). Otherwise true.',
  'new_lead: true only when the caller is someone new asking about getting care or CDS services for themselves or someone in their family, or a case manager or other referral source sending someone new. False for a current client, attendant or family member calling about existing care, a job seeker, a sales call, a wrong number, or anything unclear.',
  'Some calls are a voicemail: nobody answered and the caller left a message. Then write what they asked for and how to reach them.',
  'answers: the facts said on the call about the person who would get care (the client), for the office to check. Use an empty string (or an empty list) for anything not clearly said. Never guess.',
  '  who: who was calling: self (the client, for themself), family (family or a friend calling for the client), pair (an attendant calling about a client they would care for), solo (someone who wants to be an attendant and has nobody to care for yet).',
  '  first, last: the client\'s first and last name. dob: the client\'s date of birth as YYYY-MM-DD, only when the full date was said. county: the Missouri county the client lives in, without the word County.',
  '  medicaid: yes (has Medicaid now), no (does not), applied (applied and waiting). dcn: the Medicaid DCN number, digits only, only when it was read out.',
  '  cds: new (never had consumer directed services) or move (has CDS now with another agency); agency: that other agency\'s name.',
  '  help: the kinds of help the client needs, from the list. help_note: anything else about their care needs, in a few words.',
  '  attendant: has (they already have someone to be the attendant) or find (they need us to find one); att_name, att_phone (digits only, only if said), att_relation (how the attendant is related to the client, one or two words).'
].join('\n');
// GoHighLevel's transcription: pieces with a speaker channel and the words (the same reading as the Staffing hub's call reader).
export function transcriptText(t) {
  if (typeof t === 'string') return t.trim();
  const arr = Array.isArray(t) ? t : (t && (t.transcription || t.data || t.sentences)) || [];
  if (!Array.isArray(arr)) return '';
  return arr.slice().sort((a, b) => Number(a?.sentenceIndex ?? a?.startTime ?? 0) - Number(b?.sentenceIndex ?? b?.startTime ?? 0))
    .map(p => { const w = String(p?.transcript ?? p?.sentence ?? p?.text ?? '').trim(); if (!w) return '';
      const ch = p?.mediaChannel ?? p?.channel ?? p?.speaker; return (ch != null && ch !== '' ? 'Speaker ' + ch + ': ' : '') + w; })
    .filter(Boolean).join('\n');
}
// ctx = { who, role, detail, day (YYYY-MM-DD, Missouri), weekday, direction, staff, minutes, transcript }
export function noteRequest(ctx) {
  const lines = [
    'Call date: ' + ctx.weekday + ', ' + ctx.day + '.',
    ctx.voicemail ? 'They called the office, nobody answered, and they left this voicemail.'
      : (ctx.direction === 'outbound' ? 'The office called them' : 'They called the office') + (ctx.staff ? ' (' + ctx.staff + ' for the office)' : '') + '. ' + ctx.minutes + ' minutes.',
    'The hub thinks this is: ' + (ctx.who ? ctx.who + (ctx.role ? ', ' + ctx.role : '') + (ctx.detail ? ' (' + ctx.detail + ')' : '') : 'an unknown number') + '.',
    '<transcript>\n' + ctx.transcript + '\n</transcript>'
  ];
  return { model: NOTE_MODEL, max_tokens: 4000, fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: NOTE_SCHEMA } },
    system: NOTE_SYSTEM, messages: [{ role: 'user', content: lines.join('\n') }] };
}
const noDash = t => String(t || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
// The model's answer, held in code: plain text, a real date not before the call, at most 6 people.
export function cleanNote(resp, day) {
  if (!resp) return { error: 'no answer from the model' };
  if (resp.stop_reason === 'refusal') return { error: 'the model declined this call' };
  if (resp.stop_reason === 'max_tokens') return { error: 'the note ran too long' };
  const text = (resp.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
  let j; try { j = JSON.parse(text); } catch { return { error: 'the note could not be read' }; }
  const note = noDash(j && j.note).slice(0, 1200);
  if (!note) return { error: 'the note came back empty' };
  const cb = /^\d{4}-\d{2}-\d{2}$/.test(String(j.call_back || '')) && !isNaN(Date.parse(j.call_back)) && j.call_back >= day ? j.call_back : '';
  const people = (Array.isArray(j.people) ? j.people : []).slice(0, 6).map(x => ({ name: noDash(x && x.name).slice(0, 80), relation: noDash(x && x.relation).slice(0, 40),
    phone: ten(x && x.phone) })).filter(x => x.name);
  return { note, followup: cb, people, about: j.about_person !== false, newLead: j.new_lead === true, answers: cleanAnswers(j.answers, day) };
}
// The answers, held in code: only known choices, a real birth date, a DCN of digits, a 10 digit phone. Empty ones left out.
export function cleanAnswers(a, day) {
  if (!a || typeof a !== 'object') return {};
  const one = (v, ok) => { const t = noDash(v).slice(0, 120); return ok ? (ok.includes(t) ? t : '') : t; };
  const out = {
    who: one(a.who, ['self', 'family', 'pair', 'solo']), first: one(a.first).slice(0, 60), last: one(a.last).slice(0, 60),
    dob: /^\d{4}-\d{2}-\d{2}$/.test(String(a.dob || '')) && !isNaN(Date.parse(a.dob)) && a.dob >= '1900-01-01' && a.dob <= (day || '9999') ? a.dob : '',
    county: one(a.county).replace(/\s+county$/i, '').slice(0, 40), medicaid: one(a.medicaid, ['yes', 'no', 'applied']),
    dcn: (d => d.length >= 6 && d.length <= 12 ? d : '')(String(a.dcn || '').replace(/\D/g, '')),
    cds: one(a.cds, ['new', 'move']), agency: one(a.agency).slice(0, 80),
    help: [...new Set((Array.isArray(a.help) ? a.help : []).filter(h => ANSWER_HELP.includes(h)))], help_note: one(a.help_note).slice(0, 200),
    attendant: one(a.attendant, ['has', 'find']), att_name: one(a.att_name).slice(0, 80), att_phone: ten(a.att_phone), att_relation: one(a.att_relation).slice(0, 40)
  };
  if (out.cds !== 'move') out.agency = '';
  for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return out;
}

// ---------- the phone book ----------
// agency = { pipeline, consumers, attendants } (agency_data), pool = attendant_pool rows, staff = [{name, phone}].
export function phoneBookRows({ pipeline = [], consumers = [], attendants = [], pool = [], staff = [], wages = [] }) {
  const rows = [];
  const add = (phone, ref, kind, name, detail) => { const p = ten(phone); if (p) rows.push({ phone10: p, ref, kind, name: name || '', detail: detail || '' }); };
  const consumerByName = new Map(consumers.filter(c => c && c.name).map(c => [normName(c.name), c]));
  // Contacts (2026-10-29): family and attendants linked to someone point at that person's record.
  const ROLE_WORD = { family: 'Family', attendant: 'Attendant', other: 'Contact' };
  const addPeople = (r, ref, name) => {
    for (const x of Array.isArray(r.relatedPeople) ? r.relatedPeople : []) {
      if (!x || !x.phone) continue;
      add(x.phone, 'family:' + ref, x.role === 'attendant' ? 'attendant' : 'family', x.name || ROLE_WORD[x.role] || 'Contact',
        (x.relation ? x.relation + ', ' : '') + (ROLE_WORD[x.role] || 'Contact').toLowerCase() + ' for ' + name);
    }
  };
  for (const c of consumers) if (c && c.id) {
    add(c.phone, 'consumer:' + c.id, 'consumer', c.name, c.status && c.status !== 'Active' ? c.status : '');
    addPeople(c, 'consumer:' + c.id, c.name);
  }
  for (const p of pipeline) {
    if (!p || !p.id) continue;
    // A linked lead's number now lives as a contact on the person they called about.
    if (p.status === 'closed_linked') continue;
    // A lead already on Consumers is that consumer, so their numbers point there.
    const asConsumer = consumerByName.get(normName(p.name));
    const ref = asConsumer ? 'consumer:' + asConsumer.id : 'lead:' + p.id;
    const kind = asConsumer ? 'consumer' : 'lead';
    const name = asConsumer ? asConsumer.name : p.name;
    add(p.phone, ref, kind, name, '');
    const R = p.referral || {};
    add(R.altPhone, ref, kind, name, '');
    for (const ph of [R.responsiblePartyPhone, R.responsiblePartyAltPhone])
      add(ph, 'family:' + ref, 'family', R.responsiblePartyName || 'Family', (R.responsiblePartyRelationship ? R.responsiblePartyRelationship + ' of ' : 'Family of ') + name);
    if (p.attendant && p.attendant.phone) add(p.attendant.phone, 'attendant:lead-' + p.id, 'attendant', p.attendant.name || 'Attendant', 'Attendant for ' + name);
    addPeople(p, ref, name);
  }
  // Attendants: the old roster and Active Attendants (attendant_pool) can hold the same person.
  // Same phone and same name is one attendant; the pool record wins.
  const poolByPhoneName = new Set();
  for (const a of pool) {
    if (!a || !a.id || a.archived) continue;
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
    const hired = ['active', 'placed', 'hired', 'working'].includes(String(a.status || '').toLowerCase()) || !!a.placed_with;
    add(a.phone, 'pool:' + a.id, hired ? 'attendant' : 'applicant', name, a.placed_with ? 'Attendant for ' + a.placed_with : hired ? '' : 'Attendant applicant');
    poolByPhoneName.add(ten(a.phone) + '|' + normName(name));
  }
  for (const a of attendants) {
    if (!a || !a.id) continue;
    if (poolByPhoneName.has(ten(a.phone) + '|' + normName(a.name))) continue;
    add(a.phone, 'attendant:' + a.id, 'attendant', a.name, a.consumer ? 'Attendant for ' + a.consumer : '');
  }
  for (const s of staff) add(s.phone, 'staff:' + String(s.email || s.name || '').toLowerCase(), 'staff', s.name, 'Our team');
  servesRows(consumers, attendants, pool, wages).forEach(r => rows.push(r));
  // one row per number per person
  const seen = new Set();
  return rows.filter(r => { const k = r.phone10 + '|' + r.ref; if (seen.has(k)) return false; seen.add(k); return true; });
}

// The consumer is the boss (her rule 2026-10-21; 2026-11-05: "all calls from the Consumers contacts, their family,
// attendants go onto the consumers profile"). Each attendant who works or worked for a consumer gets a row
// serves:consumer:<id> for their number. These rows only say whose profile a call also belongs on: they never
// decide who a number is (bookFor leaves them out), so an attendant never becomes "Who is this?" and never counts
// as a check-in. Ties: Active Attendants placed with them, the consumer named on their attendant packet (2026-11-05: 1300 found
// only 1 link without it), the attendant roster, and payroll (past attendants).
export function servesRows(consumers = [], attendants = [], pool = [], wages = []) {
  const out = [], seen = new Set();
  const people = [];   // { name, phone, now: consumer name they work for now, or '' }
  // now = placed with them in Active Attendants, or the consumer they named on their attendant packet (cds_packets.consumer_name)
  for (const a of pool) if (a && !a.archived && a.phone) people.push({ name: [a.first_name, a.last_name].filter(Boolean).join(' '), phone: a.phone, now: a.placed_with || a.consumer_name || '' });
  for (const a of attendants) if (a && a.phone) people.push({ name: a.name || '', phone: a.phone, now: a.consumer || '' });
  for (const c of consumers) {
    if (!c || !c.id || !c.name) continue;
    const ref = 'serves:consumer:' + c.id;
    const add = (x, past) => { const p10 = ten(x.phone), k = p10 + '|' + ref; if (!p10 || seen.has(k)) return; seen.add(k);
      out.push({ phone10: p10, ref, kind: 'attendant', name: x.name || 'Attendant', detail: (past ? 'Past attendant for ' : 'Attendant for ') + c.name }); };
    // working for them now
    for (const x of people) if (x.now && sameName(x.now, c.name)) add(x, false);
    // paid for them in payroll: past, unless they still work for them
    const paid = new Set(wages.filter(w => w && w.attendant && w.consumer && sameName(w.consumer, c.name)).map(w => w.attendant));
    for (const nm of paid) for (const x of people) if (sameName(x.name, nm)) add(x, !(x.now && sameName(x.now, c.name)));
  }
  // a number that works for them now wins over the same number marked past
  const now = new Set(out.filter(r => r.detail.startsWith('Attendant for')).map(r => r.phone10 + '|' + r.ref));
  return out.filter(r => r.detail.startsWith('Attendant for') || !now.has(r.phone10 + '|' + r.ref));
}

// Confirm-once cards (her pick 2026-11-05: "Build the confirm-once cards from payroll names, plus the Who is this? choice").
// Payroll knows who works for whom but has no phone numbers. When GoHighLevel names a number's contact the same as an attendant
// in payroll, the office is asked ONCE: is this them? Nothing is tied until a person says Yes. Payroll months are 'YYYY-MM';
// a consumer they were not paid for in the last two payroll months is a past one.
export function payrollMatch(contactName, wages = [], consumers = []) {
  const keys = nameKeys(contactName);
  if (!keys.size) return null;
  const mine = wages.filter(w => w && w.attendant && w.consumer && [...nameKeys(w.attendant)].some(k => keys.has(k)));
  if (!mine.length) return null;
  const months = wages.map(w => String(w && w.period || '')).filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  const newest = months[months.length - 1] || '';
  const recent = newest ? (([y, m]) => { const d = new Date(Date.UTC(+y, +m - 2, 1)); return d.toISOString().slice(0, 7); })(newest.split('-')) : '';
  const byConsumer = new Map();
  for (const w of mine) { const k = normName(w.consumer), was = byConsumer.get(k); if (!was || String(w.period || '') > was.last) byConsumer.set(k, { consumer: w.consumer, last: String(w.period || '') }); }
  const ties = [];
  for (const { consumer, last } of byConsumer.values()) {
    const c = consumers.find(x => x && x.id && sameName(x.name, consumer));
    if (c) ties.push({ id: String(c.id), name: c.name, past: !!recent && last < recent, last });
  }
  if (!ties.length) return null;
  ties.sort((a, b) => (a.past - b.past) || b.last.localeCompare(a.last));
  return { name: String(mine[0].attendant).replace(/^\s*([^,]+),\s*(.+)$/, '$2 $1').trim(), ties };
}

// Who is this number? book = rows for that number. A staff answer wins. One person = known.
export function resolve(book) {
  const mine = book.filter(r => r.source === 'staff');
  const use = mine.length ? mine : book;
  if (use.some(r => r.kind === 'staff')) return { state: 'staff', person: use.find(r => r.kind === 'staff') };
  if (use.some(r => r.kind === 'ignore')) return { state: 'ignore', person: null };
  const people = [...new Map(use.map(r => [r.ref, r])).values()];
  if (people.length === 1) return { state: 'known', person: people[0] };
  if (!people.length) return { state: 'unknown', person: null };
  return { state: 'several', person: null, candidates: people };
}

// ---------- follow-ups for one number ----------
// comms = every saved call and text for this number since cards_from (oldest first), open = the
// open follow-up or null. Returns what to do: { open: { events, last }, close: { reason, by, at } | null }.
export function decide(comms, open, nowMs) {
  const events = open ? (Array.isArray(open.events) ? open.events.slice() : []) : [];
  const have = new Set(events.map(e => e.id));
  let lastWant = events.filter(e => e.kind !== 'tried').reduce((m, e) => Math.max(m, Date.parse(e.at) || 0), 0);
  let close = null;
  const want = (c, text, kind) => { if (have.has(c.id)) return; events.push({ id: c.id, at: c.at, kind, text }); have.add(c.id); lastWant = Math.max(lastWant, Date.parse(c.at)); close = null; };
  // inbound texts wait for 10 quiet minutes before they count
  const lastIn = comms.filter(c => c.channel === 'sms' && c.direction === 'inbound').map(c => Date.parse(c.at)).sort((a, b) => b - a)[0] || 0;
  const textsSettled = nowMs - lastIn >= TEXT_QUIET_MIN * 60000;
  for (const c of comms) {
    const t = Date.parse(c.at);
    if (c.channel === 'call' && c.direction === 'inbound' && !c.answered) {
      want(c, c.voicemail ? 'Missed call. Voicemail' + (c.seconds ? ', ' + c.seconds + ' seconds.' : '.') + ' Listen in GoHighLevel.' : 'Missed call. No voicemail.', c.voicemail ? 'voicemail' : 'missed');
    } else if (c.channel === 'sms' && c.direction === 'inbound') {
      if (!textsSettled && t > nowMs - TEXT_QUIET_MIN * 60000) continue;
      // only texts nobody has answered yet
      const answeredLater = comms.some(o => o.direction === 'outbound' && Date.parse(o.at) > t && (o.channel === 'sms' || o.answered))
        || comms.some(o => o.channel === 'call' && o.direction === 'inbound' && o.answered && Date.parse(o.at) > t);
      if (answeredLater || TRIVIAL.test(String(c.body || '').trim())) continue;
      want(c, 'Texted: "' + String(c.body || '').trim().slice(0, 240) + '"', 'text');
    } else if (lastWant && t > lastWant) {
      // something after the last thing that needed us
      if (c.direction === 'outbound' && c.channel === 'sms') close = { reason: 'texted', by: c.staff_name || '', at: c.at };
      else if (c.channel === 'call' && c.answered) close = { reason: c.direction === 'outbound' ? 'called' : 'talked', by: c.staff_name || '', at: c.at };
      else if (c.channel === 'call' && c.direction === 'outbound' && !have.has(c.id)) {
        events.push({ id: c.id, at: c.at, kind: 'tried', text: 'Called back' + (c.staff_name ? ' (' + c.staff_name + ')' : '') + '. No answer.' }); have.add(c.id);
      }
    }
  }
  if (!events.some(e => e.kind !== 'tried')) return { open: null, close: null };
  return { open: { events, last: new Date(lastWant).toISOString() }, close };
}

// deps: { db: { query(text, params) -> { rows } }, ghl: { users(), conversations(sinceMs), messages(conversationId, sinceMs), contact(id) }, now?: () => ms }
export function createComms(deps) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const nowMs = () => deps.now ? deps.now() : Date.now();
  const iso = ms => new Date(ms).toISOString();

  async function settings() {
    const r = await one(`select value from cds_match_settings where key='comm_center'`);
    return r && r.value && typeof r.value === 'object' ? r.value : null;
  }
  async function saveState(patch) {
    await q(`update cds_match_settings set value = value || jsonb_build_object('state', coalesce(value->'state','{}'::jsonb) || $1::jsonb), updated_at=now() where key='comm_center'`, [JSON.stringify(patch)]);
  }
  async function agency(key) {
    const r = await one(`select data_value from agency_data where agency_id='caring-companions-cds' and data_key=$1`, [key]);
    return r && Array.isArray(r.data_value) ? r.data_value : [];
  }

  // payroll is kept as { entries: [...] }, not a list
  async function agencyEntries(key) {
    const r = await one(`select data_value from agency_data where agency_id='caring-companions-cds' and data_key=$1`, [key]);
    const v = r && r.data_value; return v && Array.isArray(v.entries) ? v.entries : [];
  }

  async function rebuildBook() {
    const staff = [];
    for (const key of ['lead_alerts', 'packet_alerts']) {
      const r = await one(`select value from cds_match_settings where key=$1`, [key]);
      for (const x of (r && r.value && r.value.recipients) || []) staff.push({ name: x.name, phone: x.phone, email: x.email });
    }
    const pool = await q(`select p.id, p.first_name, p.last_name, p.phone, p.status, p.placed_with, p.archived, k.consumer_name
      from attendant_pool p left join cds_packets k on k.pool_id = p.id where p.agency_id='caring-companions-cds'`);
    const rows = phoneBookRows({ pipeline: await agency('pipeline'), consumers: await agency('consumers'), attendants: await agency('attendants'), pool, staff,
      wages: await agencyEntries('attendantWages') });
    await q(`delete from cds_phone_book where source='sync'`);
    for (let i = 0; i < rows.length; i += 200) {
      const part = rows.slice(i, i + 200);
      await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source)
               select x->>'phone10', x->>'ref', x->>'kind', x->>'name', x->>'detail', 'sync' from jsonb_array_elements($1::jsonb) x
               on conflict (phone10, ref) do nothing`, [JSON.stringify(part)]);
    }
    return rows.length;
  }

  async function bookFor(phone10) { return q(`select * from cds_phone_book where phone10=$1 and ref not like 'serves:%'`, [phone10]); }
  // whose profile this number's calls also belong on (attendants -> the consumer)
  async function servesFor(phone10) { return phone10 ? q(`select ref, name, detail from cds_phone_book where phone10=$1 and ref like 'serves:%'`, [phone10]) : []; }

  // Read GoHighLevel and save what is new. Overlaps the last run by 15 minutes; ids make it safe.
  // rescan: read the whole history window again (ids make it safe), e.g. after a fix.
  async function pull(s, { rescan = false } = {}) {
    const st = s.state || {};
    const since = st.read_until && !rescan ? Date.parse(st.read_until) - 15 * 60000 : nowMs() - (s.history_days || 60) * 86400000;
    const users = new Map((await deps.ghl.users().catch(() => [])).map(u => [String(u.id), u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')]));
    let saved = 0, seen = 0, skipped = 0, partial = false, fromContact = 0;
    // Some GoHighLevel conversations carry no phone number (seen live 2026-10-22: 8 of 55).
    // Then the number is read from the contact itself, once per contact per run. Read only.
    // Why a number is missing is counted, never swallowed (1042 could not tell; her rule).
    const noNumber = { no_contact: 0, contact_no_phone: 0, lookup_failed: {}, kinds: {} };
    const contactPhone = new Map();
    const phoneOf = async id => {
      if (!id) return { phone: '', why: 'no_contact' };
      if (!deps.ghl.contact) return { phone: '', why: 'contact_no_phone' };
      if (!contactPhone.has(id)) {
        let got;
        try { const c = await deps.ghl.contact(id); const ph = ten(c && c.phone); got = { phone: ph, why: ph ? '' : 'contact_no_phone' }; }
        catch (e) { const m = String(e && e.message || e).match(/GoHighLevel (\d{3})/); got = { phone: '', why: 'lookup_failed', status: m ? m[1] : 'error' }; }
        contactPhone.set(id, got);
      }
      return contactPhone.get(id);
    };
    const started = nowMs();
    // A long first read must never get stuck: after the time budget it keeps what it has,
    // says so (history_partial), and the next run carries on from now.
    const budget = deps.budgetMs ?? 100000;
    const t0 = Date.now();
    for (const conv of await deps.ghl.conversations(since)) {
      if (Date.now() - t0 > budget) { partial = true; break; }
      for (const m of await deps.ghl.messages(conv.id, since)) {
        const c = plainMessage(m, conv);
        if (!c) continue;
        seen++;
        if (Date.parse(c.at) < since) continue;
        if (!c.phone10) {
          const got = await phoneOf(c.ghl_contact_id);
          if (got.phone) { c.phone10 = got.phone; fromContact++; }
          else {
            // Still saved (phone10 empty) so a missed call from a hidden number is never dropped.
            skipped++;
            if (got.why === 'lookup_failed') noNumber.lookup_failed[got.status] = (noNumber.lookup_failed[got.status] || 0) + 1;
            else noNumber[got.why]++;
            const k = c.channel + ' ' + c.direction;
            noNumber.kinds[k] = (noNumber.kinds[k] || 0) + 1;
          }
        }
        const r = await one(`insert into cds_comms (id, channel, direction, at, phone10, ghl_contact_id, conversation_id, contact_name, status, seconds, answered, voicemail, staff_name, body)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (id) do nothing returning id`,
          [c.id, c.channel, c.direction, c.at, c.phone10 || null, c.ghl_contact_id, c.conversation_id, c.contact_name, c.status, c.seconds, c.answered, c.voicemail,
           c.user_id ? (users.get(c.user_id) || null) : null, c.body]);
        if (r) saved++;
      }
    }
    await saveState(Object.assign({ read_until: iso(started), last_run: iso(nowMs()), last_saved: saved, last_skipped_no_number: skipped, last_no_number: noNumber, last_error: null },
      partial ? { history_partial: true } : {}));
    return { seen, saved, skipped, partial, fromContact, noNumber };
  }

  // Keep follow-ups right for every number with calls or texts since cards_from.
  async function cards(s) {
    const from = s.cards_from ? s.cards_from : iso(nowMs());
    const owners = s.owners || {};
    const phones = (await q(`select distinct phone10 from cds_comms where at >= $1 and phone10 is not null`, [from])).map(r => r.phone10);
    let opened = 0, updated = 0, closed = 0;
    for (const phone10 of phones) {
      const comms = await q(`select * from cds_comms where phone10=$1 and at >= $2 order by at`, [phone10, from]);
      const open = await one(`select * from cds_tasks where area='followup' and phone10=$1 and done_at is null and kind <> 'attendant_confirm' order by created_at desc limit 1`, [phone10]);
      // after a close, only what came later counts
      const lastDone = await one(`select done_at from cds_tasks where area='followup' and phone10=$1 and done_at is not null and kind <> 'attendant_confirm' order by done_at desc limit 1`, [phone10]);
      const after = lastDone ? comms.filter(c => Date.parse(c.at) > Date.parse(lastDone.done_at)) : comms;
      const who = resolve(await bookFor(phone10));
      if (who.state === 'staff' || who.state === 'ignore') continue;
      const d = decide(after, open, nowMs());
      if (!d.open) continue;
      const person = who.person;
      const title = person ? person.name : 'Unknown number';
      const ref = person ? person.ref : null;
      const owner = owners.not_sure || null;
      if (!open) {
        const id = (await one(`insert into cds_tasks (kind, title, area, phone10, person_ref, owner, events, due_at, dedupe_key, updated_at)
          values ($1, $2, 'followup', $3, $4, $5, $6::jsonb, $7, $8, $9) on conflict (dedupe_key) do nothing returning id`,
          [who.state === 'known' ? 'followup' : 'who_is_this', title, phone10, ref, owner, JSON.stringify(d.open.events), d.open.events[0].at,
           'fu:' + phone10 + ':' + d.open.events[0].id, d.open.last]))?.id;
        if (id) opened++;
        if (id && d.close) { await closeTask(id, d.close.reason, d.close.by || 'GoHighLevel', d.close.at); closed++; }
      } else {
        if (JSON.stringify(open.events) !== JSON.stringify(d.open.events) || open.person_ref !== ref) {
          // A new call or text brings a card moved to a later day back to today.
          const wants = ev => (ev || []).filter(e => e.kind !== 'tried').length;
          const fresh = wants(d.open.events) > wants(open.events);
          await q(`update cds_tasks set events=$2::jsonb, updated_at=$3, title=$4, person_ref=$5, kind=$6, later_until=case when $7 then null else later_until end where id=$1`,
            [open.id, JSON.stringify(d.open.events), d.open.last, title, ref, who.state === 'known' ? 'followup' : 'who_is_this', fresh]);
          updated++;
        }
        if (d.close) { await closeTask(open.id, d.close.reason, d.close.by || 'GoHighLevel', d.close.at); closed++; }
      }
    }
    // Hidden numbers: a missed call or a text with no number anywhere still gets a card, one per
    // call or text, so nobody is dropped. It cannot be called back; Done closes it, and an answered
    // call or a reply in the same GoHighLevel conversation closes it too.
    const hidden = await q(`select * from cds_comms where phone10 is null and at >= $1 and direction='inbound' and at <= $2
      and ((channel='call' and not answered) or channel='sms') order by at`, [from, iso(nowMs() - TEXT_QUIET_MIN * 60000)]);
    for (const c of hidden) {
      if (c.channel === 'sms' && TRIVIAL.test(String(c.body || '').trim())) continue;
      const text = c.channel === 'call'
        ? (c.voicemail ? 'Missed call from a hidden number. Voicemail' + (c.seconds ? ', ' + c.seconds + ' seconds.' : '.') : 'Missed call from a hidden number. No voicemail.')
        : 'Text with no number: "' + String(c.body || '').trim().slice(0, 240) + '"';
      const ev = [{ id: c.id, at: c.at, kind: c.channel === 'call' ? (c.voicemail ? 'voicemail' : 'missed') : 'text', text, contactId: c.ghl_contact_id || null, conversationId: c.conversation_id || null }];
      const id = (await one(`insert into cds_tasks (kind, title, area, phone10, owner, events, due_at, dedupe_key, updated_at)
        values ('hidden_number', 'Hidden number', 'followup', null, $1, $2::jsonb, $3, $4, $3) on conflict (dedupe_key) do nothing returning id`,
        [owners.not_sure || null, JSON.stringify(ev), c.at, 'fu:hidden:' + c.id]))?.id;
      if (id) opened++;
      const later = c.conversation_id ? await one(`select at, staff_name, channel, direction from cds_comms where conversation_id=$1 and at > $2
        and ((direction='outbound' and channel='sms') or (channel='call' and answered)) order by at limit 1`, [c.conversation_id, c.at]) : null;
      if (later) {
        const t = await one(`select id from cds_tasks where dedupe_key=$1 and done_at is null`, ['fu:hidden:' + c.id]);
        if (t) { await closeTask(t.id, later.channel === 'sms' ? 'texted' : later.direction === 'outbound' ? 'called' : 'talked', later.staff_name || 'GoHighLevel', later.at); closed++; }
      }
    }
    const confirm = await confirmCards(owners);
    const sorted = await sortAll(s);
    return { opened, updated, closed, sorted, confirm };
  }

  // Step 2: need, owner and care or safety for every open card. A person's choice always wins.
  async function personKindOf(t) {
    if (!t.phone10) return null;
    const who = resolve(await bookFor(t.phone10));
    return who.person ? who.person.kind : null;
  }
  function sortOne(t, kind, owners) {
    const need = byPerson(t.need_by) && t.need ? t.need : guessNeed(kind, t.events);
    const why = byPerson(t.urgent_by) ? (t.urgent ? t.urgent_why || '' : '') : urgentWhy(kind, t.events, nowMs());
    const urgent = byPerson(t.urgent_by) ? !!t.urgent : !!why;
    const owner = byPerson(t.owner_by) ? (t.owner || null) : (owners[need] || owners.not_sure || null);
    return { need, need_by: byPerson(t.need_by) ? t.need_by : 'hub', urgent, urgent_why: urgent ? why : null,
             urgent_by: byPerson(t.urgent_by) ? t.urgent_by : 'hub', owner, owner_by: byPerson(t.owner_by) ? t.owner_by : 'hub' };
  }
  async function sortAll(s) {
    const owners = (s && s.owners) || {};
    let n = 0;
    for (const t of await q(`select * from cds_tasks where area='followup' and done_at is null`)) {
      const v = sortOne(t, await personKindOf(t), owners);
      if (v.need === t.need && v.need_by === t.need_by && v.urgent === !!t.urgent && (v.urgent_why || null) === (t.urgent_why || null)
          && v.urgent_by === t.urgent_by && (v.owner || null) === (t.owner || null) && v.owner_by === t.owner_by) continue;
      await q(`update cds_tasks set need=$2, need_by=$3, urgent=$4, urgent_why=$5, urgent_by=$6, owner=$7, owner_by=$8 where id=$1`,
        [t.id, v.need, v.need_by, v.urgent, v.urgent_why, v.urgent_by, v.owner, v.owner_by]);
      n++;
    }
    return n;
  }

  // Only while the hub switch "Communication tab on the consumer profile" is on. One card per number, ever (dedupe att:<phone>).
  async function commTabOn() {
    const r = await one(`select data_value from agency_data where agency_id='caring-companions-cds' and data_key='consumerComms'`);
    return !!(r && r.data_value && r.data_value.live === true);
  }
  async function confirmCards(owners) {
    if (!(await commTabOn())) return 0;
    const wages = await agencyEntries('attendantWages');
    if (!wages.length) return 0;
    const consumers = await agency('consumers');
    const seen = await q(`select distinct on (phone10) phone10, contact_name, at from cds_comms where phone10 is not null and coalesce(contact_name,'') <> ''
      and at >= $1 order by phone10, at desc`, [iso(nowMs() - 90 * 86400000)]);
    let made = 0;
    for (const r of seen) {
      if (await one(`select 1 from cds_phone_book where phone10=$1 and ref like 'serves:%' limit 1`, [r.phone10])) continue;
      if (await one(`select 1 from cds_tasks where dedupe_key=$1`, ['att:' + r.phone10])) continue;
      const who = resolve(await bookFor(r.phone10));
      if (who.state === 'staff' || who.state === 'ignore' || (who.person && ['consumer', 'family', 'lead'].includes(who.person.kind))) continue;
      const m = payrollMatch(r.contact_name, wages, consumers);
      if (!m) continue;
      const ev = [{ at: r.at, kind: 'confirm', text: 'GoHighLevel names this number ' + r.contact_name + '. Payroll pays ' + m.name + ' as the attendant for '
        + m.ties.map(t => t.name + (t.past ? ' (before)' : '')).join(', ') + '.', suggest: { ...m, contact: r.contact_name } }];
      const id = (await one(`insert into cds_tasks (kind, title, area, phone10, owner, events, due_at, dedupe_key, updated_at)
        values ('attendant_confirm', $1, 'followup', $2, $3, $4::jsonb, $5, $6, $5) on conflict (dedupe_key) do nothing returning id`,
        [m.name, r.phone10, owners.not_sure || null, JSON.stringify(ev), r.at, 'att:' + r.phone10]))?.id;
      if (id) made++;
    }
    return made;
  }
  // Tie a number to the consumer(s) an attendant works for. Staff rows: the nightly phone book rebuild keeps them.
  async function tieAttendant(phone10, name, ties, by, identity) {
    for (const t of ties)
      await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1,$2,'attendant',$3,$4,'staff',$5)
        on conflict (phone10, ref) do update set name=excluded.name, detail=excluded.detail, source='staff', set_by=excluded.set_by, set_at=now()`,
        [phone10, 'serves:consumer:' + t.id, name, (t.past ? 'Past attendant for ' : 'Attendant for ') + t.name, by]);
    // who the number is, when the hub did not know: an attendant (so it never becomes Who is this? again)
    if (identity) {
      await q(`delete from cds_phone_book where phone10=$1 and source='staff' and ref not like 'serves:%'`, [phone10]);
      await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1,$2,'attendant',$3,$4,'staff',$5)`,
        [phone10, 'attendant:office-' + phone10, name, 'Attendant for ' + ties.filter(t => !t.past).concat(ties).slice(0, 1).map(t => t.name).join(''), by]);
    }
  }
  async function attendantAnswer(email, { id, yes }) {
    const by = String(email || '').toLowerCase();
    const t = await one(`select * from cds_tasks where id=$1 and kind='attendant_confirm' and done_at is null`, [String(id || '')]);
    if (!t) throw new CommsError('That question is already answered.');
    const m = ((t.events || [])[0] || {}).suggest;
    if (yes === true) {
      if (!m || !Array.isArray(m.ties) || !m.ties.length) throw new CommsError('That card has nothing to tie. Press No.');
      const who = resolve(await bookFor(t.phone10));
      await tieAttendant(t.phone10, m.name, m.ties, by, who.state !== 'known');
    }
    await closeTask(t.id, yes === true ? 'attendant_yes' : 'attendant_no', by, iso(nowMs()));
    await audit(by, 'comm_attendant', t.phone10, { yes: yes === true, consumers: (m && m.ties || []).map(x => x.id) });
    await sortAll(await settings());
    return { ok: true };
  }
  async function closeTask(id, reason, by, at) {
    await q(`update cds_tasks set done_at=$2, done_by=$3, closed_reason=$4 where id=$1 and done_at is null`, [id, at || iso(nowMs()), by, reason]);
  }

  // The 5-minute job. Errors are saved so the page and the 8am email can say the job stopped.
  // ---------- call notes ----------
  async function noteSettings() {
    const r = await one(`select value from cds_match_settings where key='call_notes'`);
    return r && r.value && typeof r.value === 'object' ? r.value : null;
  }
  // Voicemail leads (2026-10-29): voicemails get a note too, read even while call_notes is off.
  async function voicemailSettings() {
    const r = await one(`select value from cds_match_settings where key='voicemail_leads'`);
    return r && r.value && typeof r.value === 'object' ? r.value : null;
  }
  const chicago = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const weekdayOf = ms => new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long' });
  // A few calls per run, oldest first. A call too new for a transcript waits for the next run; after
  // 30 minutes with none it is saved as no_transcript so it is never quietly missing (her rule).
  // ns = call_notes (answered calls, when live), vs = voicemail_leads (voicemails left on a CDS line).
  async function makeNotes(ns, vs) {
    if (!deps.ghl.transcript || !deps.ai) return { notes: 0, noteError: 'not set up on the server' };
    const on = ns && ns.live === true;
    const min = Math.max(30, Number(on && ns.min_seconds) || 60);
    const NEVER = Date.parse('9999-01-01T00:00:00Z');   // a side that is off reads nothing
    const from = on ? Math.max(Date.parse(ns.since || 0) || 0, nowMs() - 2 * 86400000) : NEVER;
    const vmMin = Math.max(10, Number(vs && vs.min_seconds) || 25);
    // A voicemail is read once, up to 3 days back (the catch-up for her 11:33am call), never before vs.since.
    const vmFrom = vs ? Math.max(Date.parse(vs.since || 0) || 0, nowMs() - 3 * 86400000) : NEVER;
    const todo = await q(`select c.*, n.attempts from cds_comms c left join cds_call_notes n on n.comm_id = c.id
      where c.channel='call' and c.at <= $3
        and ((c.answered and c.seconds >= $1 and c.at >= $2) or (c.voicemail and c.direction='inbound' and c.seconds >= $5 and c.at >= $6))
        and (n.comm_id is null or (n.status = 'failed' and n.attempts < 3)) order by c.at limit $4`,
      [min, iso(from), iso(nowMs() - 2 * 60000), Math.max(1, Math.min(8, Number((on ? ns : vs || {}).per_run) || 4)), vmMin, iso(vmFrom)]);
    let made = 0, waiting = 0, failed = 0, none = 0, leads = 0;
    for (const c of todo) {
      const at = Date.parse(c.at);
      const who = c.phone10 ? resolve(await bookFor(c.phone10)) : { state: 'unknown', person: null };
      const vm = !c.answered && !!c.voicemail;
      const save = async (status, f = {}) => q(`insert into cds_call_notes (comm_id, phone10, person_ref, status, note, followup, people, transcript, model, error, attempts, made_at, voicemail, new_lead, answers)
          values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11, now(), $12, $13, $14::jsonb)
          on conflict (comm_id) do update set person_ref=excluded.person_ref, status=excluded.status, note=excluded.note, followup=excluded.followup, people=excluded.people,
            transcript=coalesce(excluded.transcript, cds_call_notes.transcript), model=excluded.model, error=excluded.error, attempts=excluded.attempts, made_at=now(),
            voicemail=excluded.voicemail, new_lead=excluded.new_lead, answers=excluded.answers`,
        [c.id, c.phone10 || null, who.person ? who.person.ref : null, status, f.note || null, f.followup || null, JSON.stringify(f.people || []),
         f.transcript || null, f.model || null, f.error || null, (Number(c.attempts) || 0) + 1, vm, !!f.newLead, JSON.stringify(f.answers || {})]);
      if (who.state === 'staff' || who.state === 'ignore') { await save('skipped', { error: who.state === 'staff' ? 'a call with our own team' : 'marked Not for CDS' }); continue; }
      let text = '';
      try { text = transcriptText(await deps.ghl.transcript(c.id)); }
      catch (e) { const m = String(e && e.message || e); if (!/GoHighLevel 404/.test(m)) { failed++; await save('failed', { error: 'reading the transcript failed: ' + m.slice(0, 200) }); continue; } }
      if (!text) {
        if (nowMs() - at < 30 * 60000) { waiting++; continue; }
        none++; await save('no_transcript', { error: 'GoHighLevel has no transcript for this call. Listen to the recording.' }); continue;
      }
      if (text.length > 200000) text = text.slice(0, 200000) + '\n(the rest of this very long call was left out)';
      const p = who.person;
      const req = noteRequest({ who: p ? p.name : '', role: p ? (KIND_LABEL[p.kind] || p.kind) : '', detail: p ? p.detail : '',
        day: chicago(at), weekday: weekdayOf(at), direction: c.direction, staff: c.staff_name || '', minutes: Math.max(1, Math.round(c.seconds / 60)), transcript: text, voicemail: vm });
      let r;
      try { r = cleanNote(await deps.ai(req), chicago(at)); } catch (e) { r = { error: 'the note could not be written: ' + String(e && e.message || e).slice(0, 200) }; }
      if (r.error) { failed++; await save('failed', { error: r.error, transcript: text, model: NOTE_MODEL }); continue; }
      made++;
      // A new lead only from a voicemail, and only from a number that is not a current consumer, family or attendant.
      const newLead = vm && r.newLead && (who.state === 'unknown' || (who.state === 'known' && who.person.kind === 'lead')
        || (who.state === 'several' && who.candidates.every(x => x.kind === 'lead')));
      if (newLead) leads++;
      await save(r.about ? 'waiting' : 'not_about', { note: r.note, followup: r.followup, people: r.people, transcript: text, model: NOTE_MODEL, newLead, answers: r.answers });
    }
    const state = JSON.stringify({ last_run: iso(nowMs()), last_made: made, last_failed: failed, last_no_transcript: none, last_waiting_for_transcript: waiting, last_new_leads: leads });
    await q(`update cds_match_settings set value = value || jsonb_build_object('state', $1::jsonb), updated_at=now() where key = any($2)`,
      [state, [on && 'call_notes', vs && 'voicemail_leads'].filter(Boolean)]);
    return { notes: made, notesFailed: failed, notesNoTranscript: none, voicemailLeads: leads };
  }
  // Desktop step proof: a made-up call (no client details) through the real request and the real key.
  // Saves nothing.
  async function noteSelfTest() {
    if (!deps.ai) return { ok: false, error: 'not set up on the server' };
    const req = noteRequest({ who: 'Test Person', role: 'Lead', detail: '', day: chicago(nowMs()), weekday: weekdayOf(nowMs()), direction: 'inbound', staff: 'Test Staff', minutes: 2,
      transcript: 'Speaker 1: Caring Companions CDS, this is Test Staff.\nSpeaker 2: Hi, this is Test Person. This is only a test call for the office system. I live in Greene County and I have Medicaid. Please call me back next Monday.\nSpeaker 1: Will do, talk Monday.' });
    try { const r = cleanNote(await deps.ai(req), chicago(nowMs())); return r.error ? { ok: false, error: r.error } : { ok: true, note: r.note, followup: r.followup, answers: r.answers }; }
    catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
  }
  const NOTE_COLS = `n.comm_id, n.status, n.note, n.followup, n.people, n.answers, n.final_note, n.decided_by, n.decided_at, n.error`;
  // Waiting notes with who they are about now (the phone book can change after the call: a link, a pick).
  async function notesWaiting() {
    const rows = await q(`select ${NOTE_COLS}, c.at, c.seconds, c.direction, c.staff_name, c.phone10 from cds_call_notes n join cds_comms c on c.id = n.comm_id
      where n.status = 'waiting' order by c.at desc limit 200`);
    const out = [];
    for (const r of rows) {
      const who = r.phone10 ? resolve(await bookFor(r.phone10)) : { person: null };
      out.push({ ...r, ref: who.person ? who.person.ref : null, who: who.person ? who.person.name : '', detail: who.person ? who.person.detail : '' });
    }
    return { notes: out };
  }
  async function noteTranscript(id) {
    const r = await one(`select transcript from cds_call_notes where comm_id=$1`, [String(id || '')]);
    if (!r || !r.transcript) throw new CommsError('There is no transcript for that call.', 404);
    return { transcript: r.transcript };
  }
  // OK (with the office's own words, if they fixed it) or "Not about them". The hub has already saved
  // the note to the person's record when this says ok; this only closes the waiting note.
  async function noteDecide(email, { id, decision, note, followup, kept }) {
    const by = String(email || '').toLowerCase();
    if (!['ok', 'not_about'].includes(decision)) throw new CommsError('Unknown choice.');
    const keep = decision === 'ok' && Array.isArray(kept) ? kept.map(String).filter(k => /^[a-z_]{2,20}$/.test(k)).slice(0, 20) : [];
    const r = await one(`update cds_call_notes set status=$2, final_note=$3, final_followup=$4, decided_by=$5, decided_at=now(), kept=$6::jsonb
      where comm_id=$1 and status='waiting' returning comm_id`,
      [String(id || ''), decision === 'ok' ? 'ok' : 'not_about', decision === 'ok' ? noDash(note).slice(0, 2000) || null : null,
       decision === 'ok' && /^\d{4}-\d{2}-\d{2}$/.test(String(followup || '')) ? followup : null, by, JSON.stringify(keep)]);
    if (!r) throw new CommsError('Someone already answered that note.', 409);
    await audit(by, 'call_note_' + decision, String(id), keep.length ? { kept: keep } : {});
    return { ok: true };
  }

  async function run(opts = {}) {
    const s = await settings();
    if (!s) return { ok: false, error: 'comm_center setting missing (run comm_center.sql)' };
    try {
      const book = await rebuildBook();
      const read = await pull(s, { rescan: opts.rescan === true });
      const c = await cards(await settings());
      // Call notes: their own switch, and a failure here never stops the follow-ups above.
      let n = {};
      const ns = await noteSettings(), vs = await voicemailSettings();
      if ((ns && ns.live === true) || vs) n = await makeNotes(ns, vs).catch(e => ({ noteError: String(e && e.message || e).slice(0, 300) }));
      // A voicemail that sounds like a new lead goes onto Leads by itself (2026-11-13, lead-from-voicemail.js).
      let vl = {};
      if (vs) vl = await createFromVoicemail({ db: deps.db, now: nowMs }).run(vs).catch(e => ({ leadsError: String(e && e.message || e).slice(0, 300) }));
      return { ok: true, phoneBook: book, ...read, ...c, ...n, ...vl };
    } catch (e) {
      await saveState({ last_error: String(e && e.message || e).slice(0, 300), last_error_at: iso(nowMs()) }).catch(() => {});
      throw e;
    }
  }

  // ---------- what signed-in staff can ask for ----------
  function cardView(t, book) {
    const who = resolve(book);
    const p = who.person;
    return {
      id: t.id, kind: t.kind, phone10: t.phone10, ref: t.person_ref,
      name: p ? p.name : 'Unknown number', role: p ? (KIND_LABEL[p.kind] || p.kind) : '', detail: p ? p.detail : '',
      candidates: who.state === 'several' ? who.candidates.map(c => ({ ref: c.ref, name: c.name, role: KIND_LABEL[c.kind] || c.kind, detail: c.detail })) : [],
      owner: t.owner || null, need: t.need || null, events: t.events || [], since: t.due_at, updated: t.updated_at,
      contactId: null,
      ...step2(t),
    };
  }
  function step2(t) {
    return { needLabel: NEED_LABEL[t.need] || NEED_LABEL.not_sure, needByHub: !byPerson(t.need_by),
      urgent: !!t.urgent, urgentWhy: t.urgent ? (t.urgent_why || '') : '', later: dayOf(t.later_until) };
  }
  async function queue() {
    let consumersNow = null;   // read once per queue, only when an attendant card needs it
    const s = await settings() || {};
    const open = await q(`select * from cds_tasks where area='followup' and done_at is null order by due_at`);
    const out = [];
    for (const t of open) {
      if (t.kind === 'hidden_number') {
        const e = (t.events || [])[0] || {};
        out.push({ id: t.id, kind: t.kind, phone10: null, ref: null, name: 'Hidden number', role: '', detail: '', candidates: [],
          owner: t.owner || null, need: t.need || null, events: t.events || [], since: t.due_at, updated: t.updated_at,
          contactId: e.contactId || null, conversationId: e.conversationId || null, ...step2(t) });
        continue;
      }
      const v = cardView(t, await bookFor(t.phone10));
      // An attendant's call belongs to the consumer they work for (the consumer is the boss): the card names them.
      v.forConsumers = (await servesFor(t.phone10)).map(r => ({ id: String(r.ref).replace(/^serves:consumer:/, ''), detail: r.detail || '', past: String(r.detail || '').startsWith('Past') }));
      for (const fc of v.forConsumers) {
        if (!consumersNow) consumersNow = await agency('consumers');
        const c = consumersNow.find(x => x && String(x.id) === fc.id);
        fc.name = c ? c.name : ''; fc.phone10 = c ? ten(c.phone) : '';
        const g = fc.phone10 ? await one(`select ghl_contact_id from cds_comms where phone10=$1 and ghl_contact_id is not null order by at desc limit 1`, [fc.phone10]) : null;
        fc.contactId = g ? g.ghl_contact_id : null;
      }
      v.forConsumers = v.forConsumers.filter(fc => fc.name);
      const c = await one(`select ghl_contact_id from cds_comms where phone10=$1 and ghl_contact_id is not null order by at desc limit 1`, [t.phone10]);
      v.contactId = c ? c.ghl_contact_id : null;
      // What their voicemail said (2026-10-29), once it has been read.
      const vm = await one(`select coalesce(n.final_note, n.note) note, n.new_lead from cds_call_notes n join cds_comms c on c.id = n.comm_id
        where c.phone10=$1 and n.voicemail and n.note is not null and c.at >= $2 order by c.at desc limit 1`, [t.phone10, iso(Date.parse(t.due_at) - 864e5)]);
      if (vm) { v.voicemailNote = vm.note; v.newLead = !!vm.new_lead; }
      out.push(v);
    }
    const today = iso(nowMs()).slice(0, 10);
    const closedToday = await q(`select id, title, done_by, done_at, closed_reason from cds_tasks where area='followup' and done_at >= $1 order by done_at desc`, [today + 'T05:00:00Z']);
    const match = await one(`select count(*)::int n from cds_tasks where area='match' and done_at is null`);
    return { live: !!s.live, state: s.state || {}, cardsFrom: s.cards_from || null, cards: out, closedToday, caregiverListTodos: match ? match.n : 0,
             voicemailProblems: await voicemailProblems(),
             today: chicagoDay(nowMs()), needs: NEEDS, people: peopleOf(s) };
  }
  // Voicemails nobody could read, or whose lead text did not send, while that number still needs a call back.
  // Red on Today and in the 8am email until someone calls (her rule: nothing fails silently).
  async function voicemailProblems() {
    let rows;
    try {
      rows = await q(`select c.id, c.at, c.phone10, c.conversation_id, n.status, n.error, n.lead_alert_failed from cds_call_notes n join cds_comms c on c.id = n.comm_id
        where n.voicemail and c.at > $1 and (n.status = 'no_transcript' or (n.status = 'failed' and n.attempts >= 3) or n.lead_alert_failed is not null)
          and (c.phone10 is null or exists (select 1 from cds_tasks t where t.area='followup' and t.done_at is null and t.phone10 = c.phone10))
        order by c.at desc limit 20`, [iso(nowMs() - 7 * 864e5)]);
    } catch (e) { return []; }   // before voicemail_leads.sql runs
    return rows.map(r => ({ id: r.id, at: r.at, phone10: r.phone10, conversationId: r.conversation_id,
      why: r.lead_alert_failed ? 'The text about this voicemail did not send: ' + r.lead_alert_failed
        : r.status === 'no_transcript' ? 'GoHighLevel has no words for this voicemail. Listen to it.' : 'This voicemail could not be read: ' + (r.error || 'unknown') }));
  }
  // Who a card can belong to: setting comm_center.people ({ email, name }), else the owners' emails.
  function peopleOf(s) {
    const set = Array.isArray(s.people) && s.people.length ? s.people
      : [...new Set(Object.values(s.owners || {}).filter(Boolean))].map(e => ({ email: e, name: firstNameOf(e) }));
    return set.map(p => ({ email: String(p.email || '').toLowerCase(), name: p.name || firstNameOf(p.email) })).filter(p => p.email);
  }
  // Calls and texts for a person: every number whose phone book row points at one of these refs.
  // phones: numbers on the record itself, so history shows even before the phone book is rebuilt.
  // withAttendants (her Communication tab, 2026-11-05): a consumer's history also holds the calls and texts of every
  // attendant who works or worked for them. Their own rows come first so a number that is also family keeps that name.
  async function history(refs, extraPhones, withAttendants) {
    refs = (Array.isArray(refs) ? refs : []).map(String).filter(r => /^(lead|consumer|attendant|pool|family):/.test(r)).slice(0, 20);
    const own = [...new Set((Array.isArray(extraPhones) ? extraPhones : []).map(ten).filter(Boolean))].slice(0, 10);
    if (!refs.length && !own.length) return { items: [], phones: [] };
    const fam = refs.map(r => 'family:' + r);
    const serves = withAttendants ? refs.filter(r => r.startsWith('consumer:')).map(r => 'serves:' + r) : [];
    const att = serves.length ? await q(`select distinct phone10, ref, kind, name, detail from cds_phone_book where ref = any($1)`, [serves]) : [];
    const phones = att.concat(await q(`select distinct phone10, ref, kind, name, detail from cds_phone_book where ref = any($1) or ref = any($2)`, [refs, fam]));
    for (const p of own) if (!phones.some(x => x.phone10 === p)) phones.push({ phone10: p, ref: '', kind: '', name: '' });
    if (!phones.length) return { items: [], phones: [] };
    const items = await q(`select c.id, c.channel, c.direction, c.at, c.phone10, c.status, c.seconds, c.answered, c.voicemail, c.staff_name, c.body,
        n.status note_status, coalesce(n.final_note, n.note) note, coalesce(n.final_followup, n.followup) note_followup, n.people note_people, n.decided_by note_by,
        (n.transcript is not null) has_transcript
      from cds_comms c left join cds_call_notes n on n.comm_id = c.id
      where c.phone10 = any($1) order by c.at desc limit 60`, [[...new Set(phones.map(p => p.phone10))]]);
    const whoByPhone = new Map(phones.map(p => [p.phone10, p]));
    const viaContact = p => String(p.ref || '').startsWith('family:');
    const viaWork = p => String(p.ref || '').startsWith('serves:');
    return { items: items.map(i => { const w = whoByPhone.get(i.phone10) || {};
               return { ...i, who: w.name || '', family: w.kind === 'family', contact: viaContact(w), detail: viaContact(w) ? (w.detail || '') : '',
                 attendant: viaWork(w) ? (String(w.detail || '').startsWith('Past') ? 'past' : 'now') : '' }; }),
             phones: phones.map(p => ({ phone10: p.phone10, name: p.name, kind: p.kind })) };
  }
  // Phones the office has called (answered or not), texted, or talked to when they called in, with
  // the last time. The Leads page counts a lead as called when that came after the lead did. Same rule
  // as the lead reminder text and the 8am email (lead-alerts.js commsCallsFor).
  async function reached(sinceIso) {
    // last_talk: the last answered call, for a family who talked to us just before they became a lead (24 hours).
    return q(`select phone10, max(at) as last, max(at) filter (where channel='call' and answered) as last_talk from cds_comms
              where at >= $1 and phone10 is not null and (direction='outbound' or (channel='call' and answered)) group by phone10`,
      [sinceIso || iso(nowMs() - 120 * 86400000)]);
  }
  // Everyone who can be picked for "Who is this?".
  async function people() {
    const rows = await q(`select distinct on (ref) ref, kind, name, detail from cds_phone_book where source='sync' and kind <> 'staff' and ref not like 'serves:%' order by ref, name`);
    const extra = [];
    for (const c of await agency('consumers')) if (c && c.id) extra.push({ ref: 'consumer:' + c.id, kind: 'consumer', name: c.name, detail: '' });
    for (const p of await agency('pipeline')) if (p && p.id && p.status !== 'closed_linked') extra.push({ ref: 'lead:' + p.id, kind: 'lead', name: p.name, detail: '' });
    const all = [...new Map([...extra, ...rows].map(r => [r.ref, r])).values()];
    return { people: all.filter(r => r.name).map(r => ({ ref: r.ref, name: r.name, role: KIND_LABEL[r.kind] || r.kind, detail: r.detail || '' }))
      .sort((a, b) => a.name.localeCompare(b.name)) };
  }
  async function pick(email, { phone10, ref, family, attendant, name }) {
    phone10 = ten(phone10);
    if (!phone10) throw new CommsError('That is not a phone number.');
    const by = String(email || '').toLowerCase();
    if (ref === 'ignore') {
      await q(`delete from cds_phone_book where phone10=$1 and source='staff' and ref not like 'serves:%'`, [phone10]);
      await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1, 'ignore', 'ignore', 'Not for CDS', '', 'staff', $2)`, [phone10, by]);
      await q(`update cds_tasks set done_at=now(), done_by=$2, closed_reason='not_cds' where area='followup' and phone10=$1 and done_at is null`, [phone10, by]);
      await audit(by, 'comm_pick', phone10, { ref: 'ignore' });
      return { ok: true };
    }
    if (!/^(lead|consumer|attendant|pool):[A-Za-z0-9-]+$/.test(String(ref || ''))) throw new CommsError('Pick a person from the list.');
    const all = (await people()).people;
    const p = all.find(x => x.ref === ref);
    if (!p) throw new CommsError('That person is not in the hub.');
    // Who is this? > their attendant (2026-11-05, Communication tab on): the number is that consumer's attendant
    if (attendant === true) {
      if (!String(ref).startsWith('consumer:')) throw new CommsError('Pick the consumer they work for.');
      const nm = String(name || '').trim().slice(0, 80) || 'Attendant';
      await tieAttendant(phone10, nm, [{ id: String(ref).slice(9), name: p.name, past: false }], by, true);
      await q(`update cds_tasks set kind='followup', title=$2, person_ref=$3 where area='followup' and phone10=$1 and done_at is null and kind <> 'attendant_confirm'`,
        [phone10, nm, 'attendant:office-' + phone10]);
      await audit(by, 'comm_pick', phone10, { ref: 'attendant_for:' + ref });
      await sortAll(await settings());
      return { ok: true };
    }
    const finalRef = family ? 'family:' + ref : ref;
    await q(`delete from cds_phone_book where phone10=$1 and source='staff' and ref not like 'serves:%'`, [phone10]);
    await q(`insert into cds_phone_book (phone10, ref, kind, name, detail, source, set_by) values ($1,$2,$3,$4,$5,'staff',$6)`,
      [phone10, finalRef, family ? 'family' : String(ref).split(':')[0] === 'pool' ? 'attendant' : String(ref).split(':')[0], family ? 'Family' : p.name,
       family ? 'Family of ' + p.name : p.detail, by]);
    await q(`update cds_tasks set kind='followup', title=$2, person_ref=$3 where area='followup' and phone10=$1 and done_at is null and kind <> 'attendant_confirm'`, [phone10, family ? 'Family of ' + p.name : p.name, finalRef]);
    await audit(by, 'comm_pick', phone10, { ref: finalRef });
    await sortAll(await settings());   // the need and owner follow who it is, right away
    return { ok: true };
  }
  async function done(email, { id }) {
    email = String(email || '').toLowerCase();
    const t = await one(`select id from cds_tasks where id=$1 and area='followup' and done_at is null`, [String(id || '')]);
    if (!t) throw new CommsError('That follow-up is already closed.');
    await closeTask(t.id, 'marked_done', email, iso(nowMs()));
    await audit(email, 'comm_done', String(id), {});
    return { ok: true };
  }
  // ---------- step 2: what a person can change on a card ----------
  async function openCard(id) {
    const t = await one(`select * from cds_tasks where id=$1 and area='followup' and done_at is null`, [String(id || '')]);
    if (!t) throw new CommsError('That follow-up is already closed.');
    return t;
  }
  async function setNeed(email, { id, need }) {
    email = String(email || '').toLowerCase();
    if (!NEED_LABEL[need]) throw new CommsError('Pick a need from the list.');
    const t = await openCard(id);
    const s = await settings() || {};
    // The owner follows the need unless a person picked the owner.
    const owner = byPerson(t.owner_by) ? t.owner : ((s.owners || {})[need] || (s.owners || {}).not_sure || null);
    await q(`update cds_tasks set need=$2, need_by=$3, owner=$4 where id=$1`, [t.id, need, email, owner]);
    await audit(email, 'comm_need', String(t.id), { from: t.need, to: need });
    return { ok: true };
  }
  async function setOwner(email, { id, owner }) {
    email = String(email || '').toLowerCase();
    const t = await openCard(id);
    owner = String(owner || '').toLowerCase();
    if (owner && !peopleOf(await settings() || {}).some(p => p.email === owner)) throw new CommsError('Pick an owner from the list.');
    await q(`update cds_tasks set owner=$2, owner_by=$3 where id=$1`, [t.id, owner || null, email]);
    await audit(email, 'comm_owner', String(t.id), { from: t.owner, to: owner || null });
    return { ok: true };
  }
  async function setUrgent(email, { id, on }) {
    email = String(email || '').toLowerCase();
    if (typeof on !== 'boolean') throw new CommsError('Say yes or no.');
    const t = await openCard(id);
    await q(`update cds_tasks set urgent=$2, urgent_why=$3, urgent_by=$4 where id=$1`,
      [t.id, on, on ? 'Marked care or safety by ' + firstNameOf(email) + '.' : null, email]);
    await audit(email, 'comm_urgent', String(t.id), { to: on });
    return { ok: true };
  }
  // A day after today, up to two weeks out; null brings it back to today.
  async function setLater(email, { id, date }) {
    email = String(email || '').toLowerCase();
    const t = await openCard(id);
    if (date != null) {
      const today = chicagoDay(nowMs()), max = chicagoDay(nowMs() + 14 * 86400000);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || date <= today || date > max) throw new CommsError('Pick a day in the next two weeks.');
    }
    await q(`update cds_tasks set later_until=$2 where id=$1`, [t.id, date || null]);
    await audit(email, 'comm_later', String(t.id), { to: date || null });
    return { ok: true };
  }
  // The check-in tap: answered calls this month (Missouri time) of 3 minutes or more with a consumer
  // or their family, newest per consumer. The hub leaves out anyone already checked in. Read only.
  async function checkins() {
    const month = chicagoDay(nowMs()).slice(0, 7);
    const consumers = new Map((await agency('consumers')).filter(c => c && c.id).map(c => [String(c.id), c]));
    const calls = await q(`select id, at, phone10, seconds, staff_name, direction from cds_comms where channel='call' and answered and seconds >= 180
      and phone10 is not null and at >= $1 order by at desc`, [month + '-01T00:00:00Z']);
    const out = new Map();
    for (const c of calls) {
      if (chicagoDay(Date.parse(c.at)).slice(0, 7) !== month) continue;
      const who = resolve(await bookFor(c.phone10));
      const p = who.person;
      if (!p) continue;
      const m = String(p.ref).match(/^(family:)?consumer:(.+)$/);
      if (!m || !consumers.has(m[2]) || out.has(m[2])) continue;
      const family = !!m[1];
      out.set(m[2], { consumerId: m[2], name: consumers.get(m[2]).name, who: family ? (p.detail || 'Family') : 'Consumer', whoName: family ? p.name : '',
        family, at: c.at, day: chicagoDay(Date.parse(c.at)), minutes: Math.round(c.seconds / 60), staff: c.staff_name || '', direction: c.direction });
    }
    return { month, calls: [...out.values()] };
  }

  async function audit(actor, action, target, detail) {
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, $2, $3, $4::jsonb)`, [actor, action, target, JSON.stringify(detail || {})]);
  }

  async function handle(email, body) {
    const a = String(body && body.action || 'queue');
    if (a === 'queue') return queue();
    if (a === 'history') return history(body.refs, body.phones, body.with_attendants === true);
    if (a === 'reached') { const r = await reached(body.since); return { phones: r.map(x => x.phone10), last: Object.fromEntries(r.map(x => [x.phone10, x.last])),
      talk: Object.fromEntries(r.filter(x => x.last_talk).map(x => [x.phone10, x.last_talk])) }; }
    if (a === 'people') return people();
    if (a === 'pick') return pick(email, body);
    if (a === 'done') return done(email, body);
    if (a === 'attendant_answer') return attendantAnswer(email, body);
    if (a === 'set_need') return setNeed(email, body);
    if (a === 'set_owner') return setOwner(email, body);
    if (a === 'urgent') return setUrgent(email, body);
    if (a === 'later') return setLater(email, body);
    if (a === 'checkins') return checkins();
    if (a === 'notes_waiting') return notesWaiting();
    if (a === 'note_transcript') return noteTranscript(body.id);
    if (a === 'note_decide') return noteDecide(email, body);
    throw new CommsError('Unknown request');
  }
  return { run, rebuildBook, pull, cards, sortAll, queue, history, reached, people, pick, done, setNeed, setOwner, setUrgent, setLater, checkins, handle, settings, makeNotes, notesWaiting, noteDecide, noteTranscript, noteSelfTest };
}

export class CommsError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
