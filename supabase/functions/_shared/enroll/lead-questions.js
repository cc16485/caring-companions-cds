// CDS Hub · the sign-up questions on a lead's own link (2026-11-05, her ask: "Give each lead their own link that a
// coordinator sends, save the answers on that lead's profile, and fill in the guided call so it's just a quick confirm").
//
// A coordinator presses Send on the lead. This makes a private link (caringcds.com/start/?k=...) for that one lead,
// good for 30 days, and sends it through the same GoHighLevel sender and records as every other family message
// (cds_outbox). Nothing here sends by itself. Switch lead_questions (Switches card) starts off: while off, messages
// are held (shown, not sent), except to the test recipients.
// The person opens the link and answers the questions on caringcds.com/start. The answers are saved on this link only
// (cds_lead_questions), never shown back to whoever holds the link. The hub shows them on the lead and the guided call
// fills in from them for the coordinator to confirm. Nothing goes on the lead until someone presses OK.
//   office: leadQuestionsSend, leadQuestionsFor, leadQuestionsDecide
//   public: leadQuestionsCheck, leadQuestionsAnswer
// No em dashes in anything a person reads.
import '../office/starting-rules.js';

const S = globalThis.CDSStarting;
const LINK_DAYS = 30;
const MAX_ANSWERS = 10;
export const QUESTION_LINK = t => 'https://www.caringcds.com/start/?k=' + t;

const WHO = ['Mom or dad', 'A grandparent', 'Another relative', 'A friend or neighbor', 'My husband or wife'];
const DECIDE = ['Yes', 'Guardian', 'POA', 'Not sure'];
const MEDICAID = ['Yes', 'Not sure', 'No'];
const TASKS = ['Bathing and grooming', 'Dressing', 'Meals', 'Toileting', 'Getting in and out of bed', 'Getting around', 'Housekeeping', 'Shopping and rides'];
const BASICS = ['Yes', 'Not sure'];
const WHEN = ['Any time', 'Morning', 'Afternoon', 'Evening'];

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const pick = (v, list) => list.includes(v) ? v : '';

// Only the questions on the page, each checked against its own answers. Anything else is dropped.
export function cleanAnswers(a) {
  a = a && typeof a === 'object' ? a : {};
  const out = {};
  const set = (k, v) => { if (v !== '' && v != null && !(Array.isArray(v) && !v.length)) out[k] = v; };
  set('who', pick(a.who, WHO));
  set('decide', pick(a.decide, DECIDE));
  set('county', str(a.county, 40));
  set('medicaid', pick(a.medicaid, MEDICAID));
  set('tasks', Array.isArray(a.tasks) ? [...new Set(a.tasks.filter(t => TASKS.includes(t)))] : []);
  const h = Math.round(Number(a.hours));
  if (h >= 5 && h <= 35) out.hours = h;
  set('basics', pick(a.basics, BASICS));
  set('first', str(a.first, 60));
  set('last', str(a.last, 60));
  const ph = String(a.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (ph.length === 10) out.phone = ph;
  const em = str(a.email, 120);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) out.email = em;
  set('cared', str(a.cared, 60));
  set('when', pick(a.when, WHEN));
  // The person getting care, only when they had it handy (her ask 2026-11-05: we check Medicaid with full name and birth date).
  set('consName', str(a.consName, 80));
  const dob = S.parseDob ? S.parseDob(str(a.consDob, 20)) : '';
  if (dob) out.consDob = dob;
  return out;
}

export function createLeadQuestions(h) {
  const { q, one, audit, setting, task, crypto, R, fail, deps, isTestRecipient } = h;
  const link = h.link || QUESTION_LINK;
  const who = s => { if (!s) fail('Please sign in to the CDS Hub.', 401); return s; };
  const leadId = p => {
    if (!p || p.kind !== 'lead') fail('Pick the lead first.');
    const id = String(p.id || '').slice(0, 80);
    if (!id) fail('Pick the lead first.');
    return id;
  };
  const pub = r => ({ id: r.id, channel: r.channel, to: r.to_display, status: r.status, error: r.error || null, at: r.created_at,
    by: String(r.created_by || '').split(':').pop() });
  async function findLink(k) {
    const t = String(k || '');
    if (t.length < 20 || t.length > 100) fail('This link is not working. Please call (417) 218-2888.', 404);
    const l = await one('select * from cds_lead_questions where token_hash=$1', [await crypto.hash(t)]);
    if (!l) fail('This link is not working. Please call (417) 218-2888.', 404);
    if (new Date(l.expires_at) < new Date()) fail('This link has expired. Please call (417) 218-2888 and we will send you a new one.', 410);
    return l;
  }

  const office = {
    // One message, staff pressed Send. The body carries [link]; the private link takes its place here, never in the hub.
    async leadQuestionsSend({ staff, person, channel, to, subject, body }) {
      who(staff);
      const id = leadId(person);
      if (!['sms', 'email'].includes(channel)) fail('Pick Text or Email.');
      const dest = String(to || '').trim();
      if (channel === 'sms' && dest.replace(/\D/g, '').length < 10) fail('Add a cell phone number first.');
      if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) fail('Add an email address first.');
      const draft = String(body || '').trim();
      if (!draft.includes('[link]')) fail('Keep [link] in the message. That is where their private link goes.');
      if (draft.length > (channel === 'sms' ? 1000 : 10000)) fail('The message is too long.');
      const bad = S.identifierProblems((subject ? subject + '\n' : '') + draft, {});
      if (bad.length) fail('Take out ' + bad.join(' and ') + '. Texts and emails never carry Medicaid numbers.');
      const token = await crypto.token();
      const row = await one(`insert into cds_lead_questions (token_hash, lead_id, lead_name, channel, created_by, expires_at)
        values ($1,$2,$3,$4,$5, now() + interval '${LINK_DAYS} days') returning id`, [await crypto.hash(token), id, str(person.name, 120), channel, staff]);
      const text = draft.split('[link]').join(link(token));
      const sw = await setting('lead_questions', { live: false });
      let status, error = null, ghlId = null;
      if (deps.mode === 'practice') status = 'practice';
      else if (!(sw && sw.live) && !(isTestRecipient && await isTestRecipient(channel, dest))) { status = 'held'; error = 'Sign-up question messages are switched off (Switches card).'; }
      else {
        try { const r = await deps.send({ channel, to: dest, subject: channel === 'email' ? String(subject || 'A few quick questions from Caring Companions') : null, body: text }); status = 'sent'; ghlId = (r && r.id) || null; }
        catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); }
      }
      // The outbox keeps the message as drafted, with [link], so the private link is never stored readable.
      const out = await one(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by, ghl_id)
        values ('family',$1,'lead_questions',$2,$3,$4,$5,false,$6,$7) returning *`,
        [channel, channel === 'sms' ? R.maskPhone(dest) : R.maskEmail(dest), (subject && channel === 'email' ? subject + '\n\n' : '') + draft, status, error, 'questions:lead:' + id + ':' + staff, ghlId]);
      await q('update cds_lead_questions set outbox_id=$2, send_status=$3 where id=$1', [row.id, out.id, status]);
      if (status === 'failed') await task('medicaid_failed', 'The sign-up questions to ' + (person.name || 'a lead') + ' did not go through. ' + (error || ''), {}, 'lead_questions_failed:' + out.id, null);
      await audit('staff:' + staff, 'lead_questions_' + status, 'lead:' + id, { channel });
      return { message: pub(out) };
    },

    // This lead's links, newest first: when sent, and the answers once they come back.
    async leadQuestionsFor({ staff, leadIds }) {
      who(staff);
      const ids = (Array.isArray(leadIds) ? leadIds : []).map(x => String(x).slice(0, 80)).filter(Boolean).slice(0, 500);
      if (!ids.length) return { links: [] };
      const rows = await q(`select id, lead_id, channel, send_status, created_by, created_at, expires_at, answers, answered_at, answer_count, decided_at, decided_by, kept
        from cds_lead_questions where lead_id = any($1) order by created_at desc limit 1000`, [ids]);
      return { links: rows.map(r => ({ id: r.id, lead: r.lead_id, channel: r.channel, status: r.send_status, by: r.created_by, at: r.created_at,
        expires: r.expires_at, answers: r.answers || {}, answered: r.answered_at, count: r.answer_count, decided: r.decided_at, decided_by: r.decided_by, kept: r.kept || [] })) };
    },

    // Someone pressed OK (or Not now) on the answers. The hub writes the ticked ones onto the lead; this keeps the record.
    async leadQuestionsDecide({ staff, id, decision, kept }) {
      who(staff);
      if (!['ok', 'dismiss'].includes(decision)) fail('Pick OK or Not now.');
      const r = await one('select id, lead_id, answered_at from cds_lead_questions where id=$1', [String(id || '')]);
      if (!r || !r.answered_at) fail('Those answers are not here any more. Refresh the page.');
      const k = (Array.isArray(kept) ? kept : []).map(x => str(x, 20)).slice(0, 20);
      await q('update cds_lead_questions set decided_at=now(), decided_by=$2, kept=$3::jsonb, decision=$4 where id=$1', [r.id, staff, JSON.stringify(k), decision]);
      await audit('staff:' + staff, 'lead_questions_' + decision, 'lead:' + r.lead_id, { kept: k });
      return { ok: true };
    },
  };

  const pubActions = {
    // The page asks first, so a dead link says so before anyone answers. Says nothing about the lead.
    async leadQuestionsCheck({ k }) {
      await findLink(k);
      return { ok: true };
    },
    async leadQuestionsAnswer({ k, answers }) {
      const l = await findLink(k);
      if ((l.answer_count || 0) >= MAX_ANSWERS) fail('We already have your answers. Please call (417) 218-2888 to change them.', 429);
      const a = cleanAnswers(answers);
      if (!a.first || !a.phone) fail('Please add your name and phone number.');
      await q(`update cds_lead_questions set answers=$2::jsonb, answered_at=now(), answer_count=coalesce(answer_count,0)+1,
        decided_at=null, decided_by=null, kept='[]'::jsonb, decision=null where id=$1`, [l.id, JSON.stringify(a)]);
      await audit('public', 'lead_questions_answered', 'lead:' + l.lead_id, { count: (l.answer_count || 0) + 1 });
      return { ok: true };
    },
  };

  return { office, pub: pubActions };
}
