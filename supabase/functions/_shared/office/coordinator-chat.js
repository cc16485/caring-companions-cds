// The CDS Coordinator texts new leads (2026-11-17, her words: "text back and forth with leads, when they come in see if
// they would want to text back and forth to see if they are qualified or their loved one or consumer are qualified
// before calling them, but make it seem very natural"; then "The call really need to be with the consumer, so we can get
// verbal permission to make the referral and answer any questions they may have"). Mockup she approved:
// https://claude.ai/artifact/HFQXH7oXcrZ55VtVUGsdrW (version 2).
//
// Who: only people who filled out a form on our websites (site_leads with no from_kind, or a findcdscaregivers family),
// submitted after the switch went on, with a phone. Never a caller (they reached a person), never a caregiver sign-up.
// How: a first text asks if texting is easier. Each reply they send (read from the CDS line by cds-comms) gets one reply
// written by Claude: one question at a time, warm, the office's voice, never the word "AI", never claiming to be a
// person (if asked: "I'm the Caring Companions text helper. A real person on our team reads every message"). It ends with
// "we'll give you a call" WITH THE CONSUMER (their own OK for the referral, their questions; family may join), or a
// follow-up date, or a hand-off to a person. Her word 11-17: no set call times ("a lot of people are flexible ... instead of
// putting me on the spot for a certain time, i would rather tell them that we will give them a call"); make sure we have
// the consumer's phone; ask for the consumer's first and last name and date of birth so the office can check Medicaid is
// active before calling. Never asks for a Medicaid number, DCN or SSN by text; never promises hours, a start date or a
// caregiver. STOP (or any opt-out word) ends it for good.
// Switch coordinator.lead_chat: 'off' | 'practice' (each text waits on the lead for a person to press Send; the default) |
// 'on' (sent by itself, Mon to Sat 9 AM to 7 PM Central). The office's test phones (setting test_recipients) always get
// it live, so she can try it from her own phone. Every text in or out is saved; nothing fails silently.
// No em dashes in anything a person reads (her rule).
import { safeText, sendingHours, LINE } from './coordinator-hands.js';

export const CHAT_MODEL = 'claude-opus-5-5';
const ten = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
const noDash = t => String(t || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|opt[\s-]?out|no more|don'?t text|do not text)\b/i;
export const CHAT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'state', 'followup', 'handoff', 'answers'],
  properties: {
    reply: { type: 'string' },
    state: { type: 'string', enum: ['asking', 'ready', 'followup', 'handoff', 'not_a_fit', 'stop'] },
    followup: { type: 'string' }, handoff: { type: 'string' },
    answers: { type: 'object', additionalProperties: false,
      required: ['texting_for', 'consumer_first', 'consumer_last', 'consumer_dob', 'relation', 'consumer_phone', 'county', 'medicaid', 'help', 'attendant', 'attendant_relation', 'self_direct', 'other_agency', 'notes'],
      properties: { texting_for: { type: 'string', enum: ['self', 'family', 'other', ''] }, consumer_first: { type: 'string' }, consumer_last: { type: 'string' }, consumer_dob: { type: 'string' },
        relation: { type: 'string' }, consumer_phone: { type: 'string' }, county: { type: 'string' }, medicaid: { type: 'string', enum: ['yes', 'no', 'applied', 'not sure', ''] },
        help: { type: 'string' }, attendant: { type: 'string' }, attendant_relation: { type: 'string' }, self_direct: { type: 'string', enum: ['yes', 'no', 'not sure', ''] },
        other_agency: { type: 'string' }, notes: { type: 'string' } } }
  }
};
// The same 27 counties as the hub's CDS_COUNTIES (index.html) and caringcds.com.
export const COUNTIES = ['Greene', 'Christian', 'Jasper', 'Taney', 'Polk', 'Webster', 'Lawrence', 'Newton', 'Barry', 'Stone', 'Dade', 'Douglas', 'Dallas', 'Cedar',
  'Hickory', 'Laclede', 'McDonald', 'Ozark', 'Wright', 'Texas', 'Phelps', 'Pulaski', 'Camden', 'Benton', 'St. Clair', 'Vernon', 'Barton'];
const SYSTEM = [
  'You text with someone who just filled out a form on our website, for Caring Companions, a small home care agency in Springfield, Missouri. You are helping with CDS (Consumer Directed Services): Missouri Medicaid pays for in-home help, and the consumer (the person who gets care) chooses their own caregiver, often a family member or friend, whom we hire and pay for them. We handle the paperwork and payroll.',
  'VOICE: warm, plain, kind, like a caring person in a small local office texting from their phone. Short texts (one to three sentences, under 300 characters). Ask ONE question at a time. Use their first name now and then, not every time. Never use em dashes. Never use the word AI. Never say you are a person, a coordinator or a staff member. If they ask whether you are a real person or a bot, say exactly: "I\'m the Caring Companions text helper. A real person on our team reads every message, and Samantha will be the one who calls." then go on.',
  'GOAL: find out kindly whether CDS can fit, then tell them we will give the CONSUMER (the person who would get the care) a call soon, because the consumer must give their own OK for us to send the referral to the state, and the call is their chance to ask questions. Family is welcome to be there. Do NOT set or offer a time: people are flexible, so just say we will call them. Make sure we have the consumer\'s own phone number (if the person texting is the consumer, the number they are texting from is fine; ask if it is the best one).',
  'WHAT TO LEARN, in a natural order, skipping anything the form or the texts already told you: who needs care (themselves or someone else, the consumer\'s first name), what help they need day to day (bathing, dressing, meals, getting around), whether the consumer has Missouri Medicaid now (yes, applied, no, not sure), the county they live in, whether they have someone in mind to be the paid caregiver and how that person is related, and whether the consumer can make their own day to day decisions.',
  'CDS RULES you may explain simply: the consumer must be 18 or older, have Missouri Medicaid, live at home in one of our counties (' + COUNTIES.join(', ') + '), and be able to direct their own care. The paid caregiver can be family or a friend, 18 or older, but NOT the consumer\'s spouse and NOT their legal guardian. The state decides the hours after its own assessment.',
  'BEFORE WE CALL we check that the consumer\'s Medicaid is active, so ask (once, kindly, explaining why) for the consumer\'s first and last name and date of birth. If the person texting is the consumer, ask for their own. If they would rather not share it by text, that is fine: say we will get it on the call. Never repeat a date of birth back in a text.',
  'NEVER: ask for a Medicaid number, DCN, Social Security number, diagnosis or money details by text. Never promise hours, a start date, a caregiver, pay amounts or that the state will approve. Never give medical or legal advice. Never argue.',
  'HAND OFF to a person (state handoff, with the reason) when: someone is in danger or there is an emergency (tell them to call 911 first), they are upset or confused, there is a legal guardian or power of attorney for the consumer, the consumer is under 18, they live outside our counties, they ask something you cannot answer from these rules, or they ask for a person. Say kindly that Samantha will call them.',
  'NOT A FIT YET (state followup): no Medicaid yet or applied and waiting. Encourage them, say CDS starts once Medicaid is approved, and set a follow-up date 14 days out (applied) or 7 days out (no Medicaid, offer that we can share application help). If a spouse wants to be paid, say kindly early on that a spouse cannot be the paid caregiver in Missouri and ask if someone else could be (a son, daughter, friend or neighbor), then continue.',
  'READY (state ready): when CDS looks like a fit and we have the consumer\'s phone number (and their name and date of birth if they were willing to share them). Say Samantha will give the consumer a call soon from ' + LINE + ', that it is quick, and that family is welcome to be there. Thank them warmly. No set time.',
  'STOP: if they ask you to stop texting, state stop and reply only "Got it, we won\'t text again. If you ever want help, call ' + LINE + '. Take care."',
  'If it is outside 9 AM to 7 PM their time, your reply will be sent at 9 AM: write it so it reads well then (for example start with "Good morning"). The first text you ever send: introduce Caring Companions in Springfield, thank them for asking about care for whoever the form says, and ask if it would be easier to text a few quick questions now or have us call.',
  'answers: everything learned so far from the form and the whole conversation (empty strings for unknown). consumer_phone: digits only. consumer_dob: YYYY-MM-DD only when the full date was given. Never guess.'
].join('\n');

export function chatRequest({ lead, convo, answers, nowLabel, first }) {
  const form = ['Form name: ' + (lead.form_name || 'website form'), lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') ? 'Name on the form: ' + (lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ')) : '',
    lead.who_needs_care ? 'Who needs care (form): ' + lead.who_needs_care : '', lead.has_medicaid ? 'Medicaid (form): ' + lead.has_medicaid : '', lead.county ? 'County (form): ' + lead.county : '',
    lead.message ? 'Their message on the form: ' + String(lead.message).slice(0, 800) : ''].filter(Boolean).join('\n');
  const lines = ['Now: ' + nowLabel + ' (Central time).', '<form>\n' + form + '\n</form>',
    'What we know so far: ' + JSON.stringify(answers || {}),
    first ? 'This is the FIRST text: nothing has been sent yet.' : '<conversation>\n' + convo.map(m => (m.dir === 'out' ? 'US: ' : 'THEM: ') + m.text).join('\n') + '\n</conversation>\nWrite our next text.'];
  return { model: CHAT_MODEL, max_tokens: 2000, fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: CHAT_SCHEMA } },
    system: SYSTEM, messages: [{ role: 'user', content: lines.join('\n') }] };
}

// The answer, held in code: a reply that may leave, "ready" only with a way to reach the consumer, a real follow-up day,
// a real date of birth.
export function cleanTurn(resp, today, texterPhone) {
  if (!resp || resp.stop_reason === 'refusal') return { error: 'declined' };
  const text = (resp.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
  let j; try { j = JSON.parse(text); } catch { return { error: 'could not be read' }; }
  let reply = safeText(noDash(j.reply).replace(/\bA\.?I\.?\b/g, ''));
  if (/\b(I am|I'm) (a |an )?(real )?(person|human|coordinator|staff)/i.test(reply) && !/text helper/i.test(reply)) reply = '';
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(reply)) reply = '';   // never repeat a date of birth back
  let state = CHAT_SCHEMA.properties.state.enum.includes(j.state) ? j.state : 'asking';
  const fu = /^\d{4}-\d{2}-\d{2}$/.test(String(j.followup || '')) && j.followup > today ? j.followup : '';
  const a = j.answers || {};
  const answers = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k === 'consumer_phone' ? ten(v) : noDash(v).slice(0, 200)]).filter(([, v]) => v));
  if (answers.consumer_dob && !(/^\d{4}-\d{2}-\d{2}$/.test(answers.consumer_dob) && answers.consumer_dob >= '1900-01-01' && answers.consumer_dob <= today)) delete answers.consumer_dob;
  if (answers.texting_for === 'self' && !answers.consumer_phone && texterPhone) answers.consumer_phone = ten(texterPhone);
  if (state === 'ready' && !answers.consumer_phone) state = 'asking';   // never "ready" without the consumer's phone
  return { reply, state, followup: fu, handoff: noDash(j.handoff).slice(0, 200), answers };
}

export function createChat({ db, ai, send, nowMs = () => Date.now() }) {
  const q = async (t, p) => (await db.query(t, p || [])).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const chicago = ms => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  const todayOf = ms => { const c = chicago(ms); return c.year + '-' + c.month + '-' + c.day; };

  async function testPhones() { const r = await one("select value from cds_match_settings where key = 'test_recipients'"); return ((r && r.value && r.value.phones) || []).map(ten).filter(Boolean); }

  async function run(set) {
    let mode = ['off', 'practice', 'on'].includes(set.lead_chat) ? set.lead_chat : 'off';
    if (mode === 'off') return { chat: 'off' };
    // The Switches card (2026-11-17, her "lets go live with it"): "Texting new website leads" on = texts go by themselves.
    const sw = await one("select value from cds_match_settings where key = 'lead_texts'");
    if (sw && sw.value && typeof sw.value === 'object') mode = sw.value.live === true ? 'on' : 'practice';
    const now = nowMs(), today = todayOf(now), tests = await testPhones(), hours = sendingHours(now);
    const from = set.lead_chat_from || new Date(now).toISOString();
    // 1. New website leads since the switch went on.
    const fresh = await q(`select l.* from site_leads l where l.submitted_at > $1 and l.phone is not null and (l.from_kind is null or l.from_kind = 'prospect')
      and not exists (select 1 from cds_lead_chats c where c.site_lead_id = l.id::text) order by l.submitted_at limit 10`, [from]);
    for (const l of fresh) {
      const ph = ten(l.phone); if (!ph) continue;
      await q(`insert into cds_lead_chats (site_lead_id, lead_id, phone, name, status, answers, last_seen_at) values ($1, $2, $3, $4, 'new', '{}'::jsonb, now()) on conflict (site_lead_id) do nothing`,
        [String(l.id), 'web-' + l.id, ph, l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || '']);
    }
    // 2. Every open chat: read what they texted since, then write one reply if one is due.
    const chats = await q(`select c.*, l.form_name, l.full_name, l.first_name, l.last_name, l.who_needs_care, l.has_medicaid, l.county, l.message from cds_lead_chats c
      join site_leads l on l.id::text = c.site_lead_id where c.status in ('new','asking','waiting') order by c.id limit 25`);
    let made = 0, sent = 0, stopped = 0;
    for (const c of chats) {
      const inbound = await q(`select id, at, body from cds_comms where channel = 'sms' and direction = 'inbound' and phone10 = $1 and at > $2 order by at`, [c.phone, c.last_seen_at]);
      if (inbound.length) await q(`update cds_lead_chats set last_seen_at = $2, last_in_at = $2 where id = $1`, [c.id, inbound[inbound.length - 1].at]);
      if (inbound.some(m => STOP.test(String(m.body || '')))) {
        await q(`update cds_lead_chats set status = 'stopped' where id = $1`, [c.id]);
        await q(`update cds_coord_msgs set status = 'skipped', error = 'they asked us to stop' where kind = 'chat' and person_id = $1 and status = 'draft'`, ['web-' + c.site_lead_id]);
        stopped++; continue;   // GoHighLevel itself confirms STOP; we send nothing more, ever
      }
      const draft = await one(`select id from cds_coord_msgs where kind = 'chat' and person_id = $1 and status = 'draft'`, [c.lead_id]);
      const first = c.status === 'new';
      if (!first && !inbound.length) continue;          // nothing new from them: nothing to say
      if (draft) await q(`update cds_coord_msgs set status = 'skipped', error = 'they texted again before it was sent' where id = $1`, [draft.id]);
      const convo = (await q(`select dir, text from (select 'out' as dir, body as text, coalesce(sent_at, created_at) as at from cds_coord_msgs where kind = 'chat' and person_id = $1 and status = 'sent'
          union all select 'in', body, at from cds_comms where channel = 'sms' and phone10 = $2 and direction = 'inbound' and at >= $3) x order by at`, [c.lead_id, c.phone, c.created_at]));
      const cc = chicago(now);
      let t;
      try { t = cleanTurn(await ai(chatRequest({ lead: c, convo, answers: c.answers || {}, nowLabel: cc.weekday + ' ' + today + ' ' + cc.hour + ':' + cc.minute + ' ' + (cc.dayPeriod || ''), first })), today, c.phone); }
      catch (e) { t = { error: String(e && e.message || e).slice(0, 160) }; }
      if (t.error || !t.reply) { await q(`update cds_lead_chats set status = 'waiting', note = $2 where id = $1`, [c.id, 'A reply could not be written (' + (t.error || 'it did not pass the safety check') + '). A person should text them.']); continue; }
      const status = t.state === 'stop' ? 'stopped' : t.state === 'ready' ? 'ready' : t.state === 'followup' ? 'followup' : t.state === 'handoff' || t.state === 'not_a_fit' ? 'handoff' : 'asking';
      await q(`update cds_lead_chats set status = $2, answers = coalesce(answers, '{}'::jsonb) || $3::jsonb, followup = coalesce(nullif($4, '')::date, followup), note = nullif($5, '') where id = $1`,
        [c.id, status, JSON.stringify(t.answers), t.followup, t.handoff]);
      const live = mode === 'on' || tests.includes(c.phone);
      // ':auto' = written while texting was on, so it may go by itself later (a night reply at 9 AM). A Practice draft never does.
      const m = await one(`insert into cds_coord_msgs (key, kind, person_kind, person_id, person_name, to_name, phone, body, status)
        values ($1, 'chat', 'lead', $2, $3, $4, $5, $6, 'draft') returning id`, ['chat:' + c.id + ':' + now + (live ? ':auto' : ''), c.lead_id, c.name, c.name, c.phone, t.reply]);
      made++;
      if (live && (hours || tests.includes(c.phone))) {
        try { await send({ phone: '+1' + c.phone, text: t.reply }); await q(`update cds_coord_msgs set status = 'sent', sent_at = now(), sent_by = 'coordinator' where id = $1`, [m.id]); sent++; }
        catch (e) { await q(`update cds_coord_msgs set status = 'failed', error = $2 where id = $1`, [m.id, String(e && e.message || e).slice(0, 200)]); }
      }
      if (status === 'ready' || status === 'followup' || status === 'handoff') await weekFor(c.id);
    }
    // 3. In 'on' mode, replies written at night (':auto') go at 9 AM. Practice drafts wait for a person, always.
    if (mode === 'on' && hours) {
      for (const d of await q(`select id, phone, body from cds_coord_msgs where kind = 'chat' and status = 'draft' and key like '%:auto' and created_at > now() - interval '1 day' order by id limit 10`)) {
        try { await send({ phone: '+1' + d.phone, text: d.body }); await q(`update cds_coord_msgs set status = 'sent', sent_at = now(), sent_by = 'coordinator' where id = $1`, [d.id]); sent++; }
        catch (e) { await q(`update cds_coord_msgs set status = 'failed', error = $2 where id = $1`, [d.id, String(e && e.message || e).slice(0, 200)]); }
      }
    }
    return { chat: mode, fresh: fresh.length, made, sent, stopped };
  }

  // Her My Week: the call with the consumer (day and time), a follow-up day, or "a person should call" today.
  async function weekFor(chatId) {
    const c = await one(`select id, name, status, answers, followup::text as followup, note, lead_id from cds_lead_chats where id = $1`, [chatId]);
    if (!c) return;
    const a = c.answers || {}, who = [a.consumer_first, a.consumer_last].filter(Boolean).join(' ') || c.name;
    const phone = a.consumer_phone ? ' at (' + a.consumer_phone.slice(0, 3) + ') ' + a.consumer_phone.slice(3, 6) + '-' + a.consumer_phone.slice(6) : '';
    let item = null;
    if (c.status === 'ready') {
      // Today if it is a weekday before 3 PM, else the next weekday: check Medicaid in eMOMED, then call.
      const now = nowMs(), wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(now));
      const hr = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now));
      let d = now; if (['Sat', 'Sun'].includes(wd) || hr >= 15) { do { d += 864e5; } while (['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(d)))); }
      item = { t: (a.consumer_dob ? 'Check Medicaid, then call ' : 'Call ') + who + phone + ': their OK for the referral, answer questions', date: todayOf(d), time: '' };
    } else if (c.status === 'followup' && c.followup) item = { t: 'Check back with ' + who + ' about Medicaid (from texts)', date: c.followup, time: '' };
    else if (c.status === 'handoff') item = { t: 'Call ' + c.name + ': the text helper handed them to you' + (c.note ? ' (' + c.note + ')' : ''), date: todayOf(nowMs()), time: '' };
    if (!item) return;
    await q(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), 'cds-coordinator')
      on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ['i:chat-' + c.id, JSON.stringify({ t: item.t.slice(0, 160), date: item.date, time: item.time, every: 'once', cat: 'mine', note: 'From texting with a new lead. Their answers are on the lead in the CDS hub.', by: 'coordinator' })]);
  }

  // The hub: open chats with their answers and texts.
  async function list() {
    return { chats: await q(`select c.id, c.lead_id, c.name, c.status, c.answers, c.followup::text as followup, c.note, c.created_at, c.last_in_at, right(c.phone, 4) as last4
      from cds_lead_chats c where c.created_at > now() - interval '60 days' order by c.id desc limit 200`) };
  }
  return { run, list, weekFor };
}
