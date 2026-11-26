// The CDS Hub connector (2026-11-26, Samantha: "I want the cds hub connector", for Katlin's night in her Claude team
// account). Claude in a team-account chat calls these tools; each one runs here with the person's own CDS hub sign-in.
// Who: anyone on staff_emails or switch_owners (the same people who can open the CDS hub).
//
// What it can do (her list, 2026-11-26):
//   read   tonight: her to-do + the people to call tonight · find a person · one person in full · what was promised
//   write  check off / add to her to-do · save what happened on a call (lands on the person's "Heard" box and on
//          Samantha's My Week, the same way the Coordinator's own reading of a call does) · record a Medicaid check ·
//          ask for a follow-up text (a DRAFT: it waits in the hub for a person to press Send) · her end-of-night note
// What it never does: send a text or email, close or move a lead, change a start date, money, switches, state portals.
// The hub's own lead and consumer records are only READ here; everything written goes to the server tables the hub
// already shows (cds_coord_items, cds_coord_seen, cds_coord_msgs, cds_todo, owner_calendar).
// db.query(text, params) -> { rows }.
import { AGENCY, watchList, itemsFrom, weekLine } from './coordinator.js';
import { safeText } from './coordinator-hands.js';
import { createTodo, moDay, okDate, TodoError } from './todo.js';
// 2026-11-26 (her ask: "is it also showing her which attendants need to have background checks, who needs entered into
// Wellsky"): the Starting list, from the same start tracker the hub draws, and marking WellSky and clock-in steps done.
import './starting-rules.js';
import './start-tracker.js';
import { leadFor, packetOf } from './coordinator-jobs.js';
import { createHubUpdates, STEPS, HubUpdateError } from './hub-updates.js';
const TR = () => globalThis.CDSTracker;

export class ToolError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const lc = (s) => String(s || '').trim().toLowerCase();
const ten = (p) => { const d = String(p || '').replace(/\D/g, ''); const t = d.length === 11 && d[0] === '1' ? d.slice(1) : d; return t.length === 10 ? t : ''; };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/—/g, ', ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const nameOf = (email) => { const f = String(email || '').split('@')[0].split(/[._-]/)[0]; return f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Office'; };
const last4 = (p) => (ten(p) ? '…' + ten(p).slice(-4) : '');
const fmtPhone = (p) => { const t = ten(p); return t ? '(' + t.slice(0, 3) + ') ' + t.slice(3, 6) + '-' + t.slice(6) : ''; };
const isDay = (d) => okDate(d);
/* a DCN (8 digits), an SSN (9) or anything longer than a phone; a 10-digit phone number is allowed */
export const longNumber = (t) => (String(t || '').replace(/(\d)[ .-](?=\d)/g, '$1').match(/\d{8,}/g) || []).some((n) => n.length !== 10 && !(n.length === 11 && n[0] === '1'));

/* ---------- the tools Claude sees ---------- */
const PERSON = { type: 'object', additionalProperties: false, required: ['kind', 'id'], properties: {
  kind: { type: 'string', enum: ['lead', 'consumer'], description: 'lead (not started yet) or consumer (starting or active)' },
  id: { type: 'string', description: 'The id from tonight or find_person' } } };
const LIST = (what) => ({ type: 'array', maxItems: 6, items: { type: 'string', maxLength: 240 }, description: what });
const DATED = (what) => ({ type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['what'], properties: {
  what: { type: 'string', maxLength: 240 }, due: { type: 'string', description: 'YYYY-MM-DD, Missouri date. Leave out if none was said.' } } }, description: what });
export const TOOLS = [
  { name: 'tonight', title: 'Tonight', description: 'Start here. Your to-do for tonight (Missouri day), Samantha\'s notes, the people to call tonight (leads that answered our texts and are ready for a call, promises or check-ins due today or late), and the Starting summary: which attendants need background checks, who needs WellSky setup, and each Starting consumer\'s next step. Read only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { day: { type: 'string', description: 'YYYY-MM-DD Missouri date; leave out for tonight' } } }, annotations: { readOnlyHint: true } },
  { name: 'starting', title: 'Starting: who needs what', description: 'Everyone on the Starting page, soonest start date first: each step (Medicaid, referral or PCCP, packet, tax, attendant background checks, Empeon and I-9, orientation, clock-in call, start date) with what is next, who owns it and when it is due; the attendant and each background check (FCSR, EDL, OIG, fingerprints); and the WellSky setup (authorization, tasks) and clock-in steps. Read only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', description: 'One consumer id; leave out for everyone' } } }, annotations: { readOnlyHint: true } },
  { name: 'mark_step', title: 'Mark a Starting step done', description: 'After Katlin finishes a step, mark it done on the consumer\'s Starting profile: wellsky_authorization, wellsky_tasks, consumer_told_clock_in or attendant_clock_in. Only when she says it is really done. It shows on the profile the next time the CDS hub is opened.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['id', 'step'], properties: { id: { type: 'string', description: 'The consumer id from starting' },
      step: { type: 'string', enum: Object.keys(STEPS) } } } },
  { name: 'find_person', title: 'Find a person', description: 'Find leads and consumers by name or the last digits of a phone number. Read only.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['search'], properties: { search: { type: 'string', minLength: 2, maxLength: 80 } } }, annotations: { readOnlyHint: true } },
  { name: 'person', title: 'One person in full', description: 'Everything the hub knows about one lead or consumer before a call: their record, what they answered by text, what was heard on calls and texts, open promises and questions, and the date of birth and DCN for the Medicaid check in eMOMED. Read only.',
    inputSchema: PERSON, annotations: { readOnlyHint: true } },
  { name: 'save_call', title: 'Save what happened on a call', description: 'After a call: save what happened. It shows on the person\'s profile under what was heard on calls, and promises, things they will do, questions and concerns also go on Samantha\'s My Week. Write plainly, no em dashes. Never put a DCN, SSN or money amount in it.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['kind', 'id', 'summary'], properties: {
      kind: PERSON.properties.kind, id: PERSON.properties.id,
      reached: { type: 'string', enum: ['talked', 'voicemail', 'no_answer', 'wrong_number'], description: 'How the call went' },
      talked_with: { type: 'string', maxLength: 80, description: 'Who you talked with, e.g. "Ruth (the consumer)" or "Ann, her daughter"' },
      summary: { type: 'string', minLength: 3, maxLength: 600, description: 'Two or three plain sentences' },
      promises: DATED('What WE promised to do, with a date'),
      their_word: DATED('What THEY said they would do, with the day to check on it'),
      questions: LIST('Questions they asked that need an answer from the office'),
      concerns: LIST('Anything Samantha must look at: care or safety, upset, eligibility doubts'),
      attendant: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', maxLength: 80 }, phone: { type: 'string', maxLength: 20 }, relation: { type: 'string', maxLength: 40 } }, description: 'An attendant they named (first and last name)' },
      start_date: { type: 'string', description: 'YYYY-MM-DD if a start date was talked about' } } } },
  { name: 'medicaid_checked', title: 'Record a Medicaid check', description: 'After you look someone up in eMOMED: record what it showed. Anything but active goes to Samantha. Do not include the DCN.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['kind', 'id', 'result'], properties: { kind: PERSON.properties.kind, id: PERSON.properties.id,
      result: { type: 'string', enum: ['active', 'spend_down', 'not_active', 'not_found'] }, note: { type: 'string', maxLength: 300 } } } },
  { name: 'draft_text', title: 'Ask for a follow-up text', description: 'Write a short follow-up text to the person. It is NOT sent: it waits in the hub until Samantha or the office presses Send. Under 300 characters, warm and plain, signed "Caring Companions CDS". No numbers longer than a phone, no money, no Medicaid details.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['kind', 'id', 'body'], properties: { kind: PERSON.properties.kind, id: PERSON.properties.id,
      to: { type: 'string', enum: ['them', 'family'], description: 'them = the person; family = their first family contact on file' }, body: { type: 'string', minLength: 10, maxLength: 320 } } } },
  { name: 'todo_check', title: 'Check off a to-do', description: 'Check off (or uncheck) one item on your to-do for a Missouri day.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['item_id', 'done'], properties: { item_id: { type: 'string' }, done: { type: 'boolean' }, day: { type: 'string', description: 'YYYY-MM-DD; leave out for tonight' } } } },
  { name: 'todo_add', title: 'Add a one-time to-do', description: 'Add a one-time item to your own to-do.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['title', 'day'], properties: { title: { type: 'string', maxLength: 160 }, how: { type: 'string', maxLength: 1200 }, day: { type: 'string', description: 'YYYY-MM-DD Missouri date' } } } },
  { name: 'end_night', title: 'End my night', description: 'Send Samantha the end-of-night note. It goes on her My Week for the next morning. Who you reached, what you promised, what needs her.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['note'], properties: { note: { type: 'string', minLength: 10, maxLength: 2000 } } } },
];

// matchApi(jwt, action, input): the CDS hub's own server (cds-match), called with the person's own sign-in, for the
// attendants' onboarding table (Step 1 and background checks). Missing = the list says the checks could not be read.
export function createConnector({ db, now = () => Date.now(), matchApi = null }) {
  const q = async (t, p = []) => (await db.query(t, p)).rows;
  const one = async (t, p = []) => (await q(t, p))[0] || null;
  const todo = createTodo({ db, now });
  const hubUpdates = createHubUpdates({ db });
  const data = async (key) => { const r = await one('select data_value from agency_data where agency_id = $1 and data_key = $2', [AGENCY, key]); return (r && r.data_value) || []; };
  async function access(email) {
    const me = lc(email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(me)) throw new ToolError('Please sign in to the CDS hub again.', 401);
    const rows = await q("select key, value from cds_match_settings where key in ('staff_emails','switch_owners')");
    const v = (k) => ((rows.find((r) => r.key === k) || {}).value || []).map(lc);
    const owner = v('switch_owners').includes(me);
    if (!owner && !v('staff_emails').includes(me)) throw new ToolError('This connector is for the CDS office team. Ask Samantha to add you.', 403);
    return { me, owner };
  }
  async function people() {
    const consumers = await data('consumers'), pipeline = await data('pipeline');
    return { consumers: Array.isArray(consumers) ? consumers : [], pipeline: Array.isArray(pipeline) ? pipeline : [] };
  }
  function recordOf(all, kind, id) {
    const list = kind === 'lead' ? all.pipeline : all.consumers;
    const r = list.find((x) => x && String(x.id) === String(id));
    if (!r) throw new ToolError('No ' + kind + ' with that id. Use find_person first.', 404);
    return r;
  }
  const short = (x, kind) => ({ kind, id: String(x.id), name: x.name || '', status: x.status || '', county: x.county || '', phone: last4(x.phone) });

  /* ---------- read ---------- */
  async function tonight(a, args, ctx) {
    const day = isDay(args.day) ? args.day : moDay(now());
    const td = await todo.handle(a.me, { action: 'list', day });
    const all = await people();
    const chats = await q("select lead_id, name, status, answers, followup::text as followup, note from cds_lead_chats where status in ('ready','followup','handoff') order by last_seen_at desc limit 40");
    const items = await q("select id, person_kind, person_id, person_name, kind, data, due::text as due from cds_coord_items where status in ('open','suggested') and kind in ('promise','their_word','question','concern') and (due is null or due <= $1::date) order by due nulls first limit 60", [day]);
    const calls = [];
    for (const c of chats) {
      if (c.status === 'followup' && c.followup && c.followup > day) continue;
      const lead = all.pipeline.find((p) => String(p.id) === String(c.lead_id));
      const ans = c.answers || {};
      calls.push({ why: c.status === 'ready' ? 'New lead, ready for a call' : c.status === 'handoff' ? 'Asked for a person' : 'Follow-up date reached',
        kind: 'lead', id: String(c.lead_id), name: (lead && lead.name) || c.name || ans.consumer_name || '', consumer: ans.consumer_name || '',
        call: fmtPhone(ans.consumer_phone) || (lead ? fmtPhone(lead.phone) : ''), medicaid_check_first: true, note: c.note || '' });
    }
    const byPerson = new Map();
    for (const it of items) {
      const k = it.person_kind + ':' + it.person_id;
      if (!byPerson.has(k)) byPerson.set(k, { kind: it.person_kind, id: it.person_id, name: it.person_name, due: [] });
      const w = weekLine(it, day);
      byPerson.get(k).due.push({ what: w ? w.t.replace(/^[^:]+: /, '') : (it.data.what || it.data.text || ''), due: it.due || '', type: it.kind });
    }
    for (const p of byPerson.values()) if (!calls.some((c) => c.kind === p.kind && c.id === String(p.id))) calls.push({ why: 'Promised or due', kind: p.kind, id: String(p.id), name: p.name, due: p.due });
      else calls.find((c) => c.kind === p.kind && c.id === String(p.id)).due = p.due;
    return { day, missouri_now: new Date(now()).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'long', hour: 'numeric', minute: '2-digit' }),
      calls_end: '7:00 PM Missouri time for families',
      notes: td.notes.map((n) => ({ from: nameOf(n.data.by), text: n.data.t + (n.data.how ? ' ' + n.data.how : '') })),
      todo: td.tonight.map((x) => ({ item_id: x.id, title: x.data.t, how: x.data.how || '', done: !!x.done, late: !!x.late })),
      coming_up: td.later.slice(0, 10).map((x) => ({ item_id: x.id, title: x.data.t })),
      calls,
      starting: startingSummary(await startingList(a, {}, ctx)) };
  }
  async function findPerson(a, args) {
    const s = norm(args.search), digits = String(args.search || '').replace(/\D/g, '');
    if (s.length < 2) throw new ToolError('Type at least 2 letters.');
    const all = await people(), out = [];
    const hit = (x) => (digits.length >= 4 && ten(x.phone).endsWith(digits)) || norm(x.name).includes(s) || norm(x.consumerName).includes(s);
    all.pipeline.filter((x) => x && x.id && hit(x)).slice(0, 10).forEach((x) => out.push(short(x, 'lead')));
    all.consumers.filter((x) => x && x.id && hit(x)).slice(0, 10).forEach((x) => out.push(short(x, 'consumer')));
    return { found: out.length, people: out };
  }
  async function person(a, args) {
    const all = await people(), r = recordOf(all, args.kind, args.id);
    const ref = args.kind + ':' + r.id;
    const items = await q("select kind, data, status, due::text as due, source from cds_coord_items where person_kind = $1 and person_id = $2 and (status in ('open','suggested') or created_at > now() - interval '30 days') order by created_at desc limit 30", [args.kind, String(r.id)]);
    const heard = await q("select source_id, at, summary from cds_coord_seen where person_ref = $1 and ok = true and summary is not null order by at desc limit 10", [ref]);
    const chat = args.kind === 'lead' ? await one("select status, answers, note from cds_lead_chats where lead_id = $1", [String(r.id)]) : null;
    const rel = (r.relatedPeople || []).filter(Boolean).slice(0, 4).map((p) => ({ name: p.name || '', relation: p.relation || p.relationship || '', phone: fmtPhone(p.phone) }));
    const ans = chat ? Object.fromEntries(Object.entries(chat.answers || {}).filter(([k, v]) => v && !/phone$/.test(k) || k === 'consumer_phone').map(([k, v]) => [k, k === 'consumer_phone' ? fmtPhone(v) : v])) : null;
    return {
      kind: args.kind, id: String(r.id), name: r.name || '', status: r.status || '', county: r.county || '', city: r.city || '',
      phone: fmtPhone(r.phone), email: r.email || '', for_medicaid_check: { name: r.consumerName || r.name || '', date_of_birth: r.dob || (ans && ans.consumer_dob) || '', dcn: r.dcn || '' },
      start_date: r.cdsStartDate || '', attendant: (r.attendant && r.attendant.name) || (r.starting && r.starting.attendantName) || '',
      follow_up: r.followup || '', family_and_contacts: rel,
      hub_notes: (r.notes || []).slice(-8).map((n) => ({ date: n.date || '', text: clean(n.text, 400) })),
      texted_answers: ans, text_status: chat ? chat.status : '',
      heard_on_calls_and_texts: heard.map((h) => ({ at: String(h.at).slice(0, 10), what: h.summary })),
      open: items.filter((i) => ['open', 'suggested'].includes(i.status)).map((i) => ({ type: i.kind, what: i.data.what || i.data.text || i.data.name || i.data.date || '', due: i.due || '' })),
      rules: 'Talk with the consumer themselves (family may join). Get their OK to send the referral. Never promise hours, eligibility or a start date. Calls to families end at 7 PM Missouri time.' };
  }

  /* ---------- Starting: who needs what ---------- */
  const normN = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const CHECK = { fcsr: 'FCSR', edl: 'EDL', oig: 'OIG', fp: 'Fingerprints' };
  const STEP_NAMES = { medicaid: 'Medicaid', referral: 'Referral or PCCP', packet: 'Consumer packet', tax: 'Tax set up', checks: 'Attendant background checks',
    empeon: 'Empeon and I-9', orient: 'Consumer orientation', clock: 'Clock-in call', start: 'Start date' };
  async function attendantsFor(ctx) {
    if (!matchApi || !ctx || !ctx.jwt) return { rows: [], error: 'The attendants\' background checks could not be read right now.' };
    try {
      const r = await matchApi(ctx.jwt, 'packetList', {});
      return { rows: ((r && r.attendants) || []).map((a) => {
        const c = (a.table && a.table.cells) || {}, ok = (k) => !c[k] || ['done', 'na'].includes(c[k].s);
        return { name: a.name, consumer: a.consumer || '', active: !!a.active, step1: !!a.step1_at || !!a.active,
          checksClear: !!a.active || (['fcsr', 'edl', 'oig', 'fp'].every(ok) && !!c.fcsr), invite: !!a.active || (c.invite || {}).s === 'done',
          empeon: !!a.active || (c.empeon || {}).s === 'done', i9: !!a.active || (c.i9 || {}).s === 'done', hold: (a.table && a.table.hold) || '', next: a.next || '',
          checks: Object.fromEntries(Object.keys(CHECK).map((k) => [CHECK[k], !c[k] ? (a.active ? 'done' : 'not started') : c[k].s === 'done' ? 'done' : c[k].s === 'na' ? 'not needed' : c[k].s === 'bad' ? 'NOT CLEAR: ' + (c[k].t || '') : c[k].s === 'wait' ? 'waiting: ' + (c[k].t || '') : c[k].s === 'off' ? 'after Step 1' : 'to do: ' + (c[k].t || '')])) };
      }) };
    } catch (e) { return { rows: [], error: 'The attendants\' background checks could not be read: ' + String((e && e.message) || e).slice(0, 120) }; }
  }
  async function startingList(a, args, ctx) {
    const all = await people(), today = moDay(now());
    const authRec = ((await data('authorizations')) || {}).records || {};
    const auths = Object.fromEntries(Object.values(authRec).map((x) => [normN(x.consumer), true]));
    const roster = await data('attendants');
    const packets = await q(`select lead_id, consumer_id, sent_at, signed_at, office_signed_at, answers->>'first' as first, answers->>'last' as last from cds_enroll_packets`);
    const att = await attendantsFor(ctx);
    const pend = await hubUpdates.pending();
    const list = all.consumers.filter((c) => c && String(c.status || '').toLowerCase() === 'starting' && !/^(example|test)\b/i.test(String(c.name || '').trim()))
      .filter((c) => !args.id || String(c.id) === String(args.id));
    if (args.id && !list.length) throw new ToolError('No one on the Starting page has that id.', 404);
    const out = list.map((c) => {
      const lead = leadFor(c, all.pipeline), P = packetOf(c, packets, lead);
      const ar = TR().attendantFor(c, att.rows);
      const rost = (Array.isArray(roster) ? roster : []).filter((r) => r && r.status !== 'inactive' && String(r.consumer || '').split(',').map(normN).includes(normN(c.name)))[0] || null;
      const t = TR().tracker(c, { today, auth: !!auths[normN(c.name)], att: ar, roster: rost ? { name: rost.name } : null,
        packet: P ? { signed: !!P.signed_at, done: !!P.office_signed_at, status: P.sent_at ? 'Sent' : '', sent: P.sent_at } : {} });
      const mine = pend.filter((u) => String(u.target_id) === String(c.id)).map((u) => u.step);
      const prep = (c.firstShiftPrep || {}), st = (c.starting || {});
      const has = (step, v) => !!v || mine.includes(step);
      const steps = Object.fromEntries(Object.keys(STEP_NAMES).map((k) => { const x = t.cells[k] || {}; return [STEP_NAMES[k], { status: x.state || '', what: x.t || '', owner: x.owner || '', due: x.due || '', late: !!x.late }]; }));
      return { id: String(c.id), name: c.name || '', start_date: c.cdsStartDate || '', days_to_start: t.cells.start && t.cells.start.days !== undefined ? t.cells.start.days : null,
        next: t.next ? t.next.t + (t.next.due ? ' (due ' + t.next.due + ')' : '') + (t.next.late ? ' LATE' : '') : '', urgent: !!t.urgent, steps,
        attendant: t.attName ? { name: t.attName, on_roster: !!rost, step1_signed: ar ? ar.step1 : null, checks_clear: rost ? true : ar ? ar.checksClear : null,
          background_checks: rost ? 'on the roster (done)' : ar ? ar.checks : 'not started (no application yet)', next: ar ? ar.next : '' } : null,
        wellsky: { authorization_in: has('wellsky_authorization', prep.authWellSky), tasks_in: has('wellsky_tasks', prep.tasksWellSky),
          consumer_told_clock_in: has('consumer_told_clock_in', prep.toldClockIn), attendant_clock_in: has('attendant_clock_in', st.attClockIn) },
        waiting_to_show_in_hub: mine, promises: t.promises.filter((p) => p.open).map((p) => ({ what: p.what, due: p.due || '', late: !!p.late })) };
    }).sort((x, y) => String(x.start_date || '9999').localeCompare(String(y.start_date || '9999')));
    return { today, people: out, attendants_note: att.error || '' };
  }
  /* the short version for "Start my night" */
  function startingSummary(s) {
    const checks = [], wellsky = [];
    for (const p of s.people) {
      if (p.attendant && !p.attendant.checks_clear) checks.push({ consumer: p.name, id: p.id, attendant: p.attendant.name, checks: p.attendant.background_checks, start_date: p.start_date, due: (p.steps['Attendant background checks'] || {}).due || '', late: !!(p.steps['Attendant background checks'] || {}).late });
      else if (!p.attendant) checks.push({ consumer: p.name, id: p.id, attendant: 'not chosen yet', checks: 'find out who the attendant is', start_date: p.start_date, due: (p.steps['Attendant background checks'] || {}).due || '', late: !!(p.steps['Attendant background checks'] || {}).late });
      const ws = p.wellsky, miss = [!ws.authorization_in && 'authorization', !ws.tasks_in && 'tasks'].filter(Boolean);
      if (miss.length && (p.start_date || (p.steps['Referral or PCCP'] || {}).what === 'Authorized')) wellsky.push({ consumer: p.name, id: p.id, start_date: p.start_date, needs: 'WellSky: consumer, attendant, ' + miss.join(' and ') });
    }
    return { background_checks_needed: checks, wellsky_setup_needed: wellsky, starting_count: s.people.length, next_steps: s.people.slice(0, 8).map((p) => ({ consumer: p.name, id: p.id, start_date: p.start_date, next: p.next })), note: s.attendants_note };
  }
  async function markStep(a, args) {
    const all = await people(), r = recordOf(all, 'consumer', args.id);
    if (String(r.status || '').toLowerCase() !== 'starting') throw new ToolError(r.name + ' is not on the Starting page.');
    try { const u = await hubUpdates.add(a.me, r.id, args.step, r.name); return { marked: true, consumer: r.name, step: STEPS[args.step].words, at: u && u.at, shows_in_hub: 'the next time the CDS hub is opened' }; }
    catch (e) { if (e instanceof HubUpdateError) throw new ToolError(e.message, e.status); throw e; }
  }

  /* ---------- write ---------- */
  async function saveCall(a, args) {
    const all = await people(), r = recordOf(all, args.kind, args.id);
    const at = new Date(now()).toISOString(), day = moDay(now());
    const summary = clean(args.summary, 600);
    if (summary.length < 3) throw new ToolError('Please say what happened.');
    if (longNumber(summary)) throw new ToolError('Leave long numbers (DCN, SSN) out of the summary. A phone number is fine.');
    const how = { talked: '', voicemail: ' Left a voicemail.', no_answer: ' No answer.', wrong_number: ' Wrong number.' }[args.reached || 'talked'] || '';
    const who = clean(args.talked_with, 80);
    const fullSummary = (who ? 'Talked with ' + who + '. ' : '') + summary + how;
    const dated = (list) => (Array.isArray(list) ? list : []).slice(0, 6).map((p) => ({ what: clean(p && p.what, 240), due: isDay(p && p.due) ? p.due : '' })).filter((p) => p.what);
    const x = { about: true, summary: fullSummary.slice(0, 600),
      promises: dated(args.promises).map((p) => ({ what: p.what, due: p.due || day })),
      theirWord: dated(args.their_word).map((p) => ({ what: p.what, due: p.due || new Date(now() + 7 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) })),
      questions: (Array.isArray(args.questions) ? args.questions : []).slice(0, 6).map((s) => clean(s, 240)).filter(Boolean),
      concerns: (Array.isArray(args.concerns) ? args.concerns : []).slice(0, 4).map((s) => clean(s, 240)).filter(Boolean),
      startDate: isDay(args.start_date) ? { date: args.start_date, saidBy: '', note: 'from ' + nameOf(a.me) + '\'s call' } : null,
      attendant: args.attendant && clean(args.attendant.name, 80).split(' ').length >= 2 ? { name: clean(args.attendant.name, 80), phone: ten(args.attendant.phone), email: '', relation: clean(args.attendant.relation, 40) } : null };
    const p = { kind: args.kind, id: String(r.id), name: r.name || '', start: r.cdsStartDate || '', attendant: (r.attendant && r.attendant.name) || (r.starting && r.starting.attendantName) || '' };
    const sid = 'night:' + a.me + ':' + at;
    const src = { line: 'night', kind: 'call', id: sid, at, who: nameOf(a.me), phone10: '' };
    await q(`insert into cds_coord_seen (source_id, at, ok, tries, note, person_ref, summary) values ($1, now(), true, 1, $2, $3, $4)
      on conflict (source_id) do update set summary = excluded.summary, at = now()`, [sid, 'saved by ' + a.me, p.kind + ':' + p.id, x.summary]);
    let added = 0;
    for (const it of itemsFrom(p, src, x)) {
      it.source.by = a.me;
      const row = await one(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) on conflict (key) do nothing returning id`,
      [it.key, it.person_kind, it.person_id, it.person_name, it.kind, JSON.stringify(it.data), JSON.stringify(it.source), it.status, it.due]);
      if (row) added++;
    }
    return { saved: true, person: p.name, on_profile: 'Heard on calls and texts', added_items: added,
      next: added ? 'Promises, their word, questions and concerns are on Samantha\'s My Week (within 15 minutes).' : 'Saved on the profile. Nothing new for My Week.' };
  }
  async function medicaidChecked(a, args) {
    const all = await people(), r = recordOf(all, args.kind, args.id);
    const words = { active: 'Medicaid is active in eMOMED', spend_down: 'eMOMED shows a spend-down', not_active: 'Medicaid is not active in eMOMED', not_found: 'Not found in eMOMED' }[args.result];
    if (!words) throw new ToolError('Pick active, spend_down, not_active or not_found.');
    const note = clean(args.note, 300);
    if (longNumber(note)) throw new ToolError('Leave the DCN out of the note.');
    const at = new Date(now()).toISOString(), sid = 'night-medicaid:' + args.kind + ':' + r.id + ':' + at.slice(0, 10);
    const summary = 'Medicaid checked by ' + nameOf(a.me) + ': ' + words + '.' + (note ? ' ' + note : '');
    await q(`insert into cds_coord_seen (source_id, at, ok, tries, note, person_ref, summary) values ($1, now(), true, 1, $2, $3, $4)
      on conflict (source_id) do update set summary = excluded.summary, at = now()`, [sid, 'saved by ' + a.me, args.kind + ':' + r.id, summary]);
    let toSamantha = false;
    if (args.result !== 'active') {
      const p = { kind: args.kind, id: String(r.id), name: r.name || '' };
      const [it] = itemsFrom(p, { line: 'night', kind: 'call', id: sid, at, who: nameOf(a.me) }, { summary, promises: [], theirWord: [], questions: [], concerns: [words + (note ? ': ' + note : '') + '. Do not call until Samantha looks.'], startDate: null, attendant: null });
      it.source.by = a.me;
      await q(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) on conflict (key) do nothing`, [it.key, it.person_kind, it.person_id, it.person_name, it.kind, JSON.stringify(it.data), JSON.stringify(it.source), it.status, it.due]);
      toSamantha = true;
    }
    return { saved: true, person: r.name || '', result: words, call_now: args.result === 'active', sent_to_samantha: toSamantha };
  }
  async function draftText(a, args) {
    const all = await people(), r = recordOf(all, args.kind, args.id);
    const body = safeText(clean(args.body, 320));
    if (!body) throw new ToolError('That text cannot be saved: keep it under 300 characters, with no long numbers and no money amounts.');
    let to = { name: r.name || '', phone: ten(r.phone) };
    if (args.to === 'family') { const f = (r.relatedPeople || []).find((p) => p && ten(p.phone)); if (!f) throw new ToolError('No family contact with a phone is on file.'); to = { name: f.name || '', phone: ten(f.phone) }; }
    if (!to.phone && args.kind === 'lead') { const c = await one('select answers from cds_lead_chats where lead_id = $1', [String(r.id)]); to.phone = ten(c && c.answers && c.answers.consumer_phone); }
    if (!to.phone) throw new ToolError('No phone is on file for them.');
    const key = 'night:' + args.kind + ':' + r.id + ':' + new Date(now()).toISOString();
    const row = await one(`insert into cds_coord_msgs (key, kind, person_kind, person_id, person_name, to_name, phone, body, status)
      values ($1, 'check', $2, $3, $4, $5, $6, $7, 'draft') on conflict (key) do nothing returning id`, [key, args.kind, String(r.id), r.name || '', to.name, to.phone, body]);
    return { saved_as_draft: !!row, to: to.name + ' ' + last4(to.phone), body, sent: false, next: 'It waits on the person\'s profile under "Texts it wrote" until Samantha or the office presses Send.' };
  }
  async function endNight(a, args) {
    const note = clean(args.note, 2000);
    if (note.length < 10) throw new ToolError('Please write a few lines.');
    const at = new Date(now()), day = moDay(now());
    const morning = new Date(Date.parse(day + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
    const id = 'i:night-' + norm(nameOf(a.me)).replace(/ /g, '') + '-' + day;
    await q(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), $3)
      on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`,
    [id, JSON.stringify({ t: nameOf(a.me) + '\'s night (' + day + ')', date: morning, every: 'once', time: '', cat: 'cds', note }), a.me]);
    return { sent: true, where: 'On Samantha\'s My Week for ' + morning + ' morning', at: at.toISOString() };
  }

  async function call(email, name, args, ctx = {}) {
    const a = await access(email);
    args = args && typeof args === 'object' ? args : {};
    if ((name === 'person' || name === 'save_call' || name === 'medicaid_checked' || name === 'draft_text') && !['lead', 'consumer'].includes(args.kind)) throw new ToolError('kind must be lead or consumer.');
    try {
      switch (name) {
        case 'tonight': return await tonight(a, args, ctx);
        case 'starting': return await startingList(a, args, ctx);
        case 'mark_step': return await markStep(a, args);
        case 'find_person': return await findPerson(a, args);
        case 'person': return await person(a, args);
        case 'save_call': return await saveCall(a, args);
        case 'medicaid_checked': return await medicaidChecked(a, args);
        case 'draft_text': return await draftText(a, args);
        case 'todo_check': return await todo.handle(a.me, { action: 'mark', id: String(args.item_id || ''), day: isDay(args.day) ? args.day : moDay(now()), done: !!args.done });
        case 'todo_add': return await todo.handle(a.me, { action: 'save', item: { t: args.title, how: args.how, when: 'once', date: args.day } });
        case 'end_night': return await endNight(a, args);
      }
    } catch (e) {
      if (e instanceof TodoError) throw new ToolError(e.message, e.status);
      throw e;
    }
    throw new ToolError('Unknown tool: ' + name, 404);
  }
  return { call, access };
}

/* ---------- MCP over HTTP (JSON-RPC 2.0, one answer per request, no streaming) ---------- */
export const SERVER_INFO = { name: 'caring-companions-cds-hub', title: 'Caring Companions CDS Hub', version: '1.0.0' };
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const INSTRUCTIONS = 'The Caring Companions CDS hub. Start with the tonight tool. Calls are with the consumer themselves; never promise hours, eligibility or start dates. Nothing here sends a text: draft_text only saves a draft for Samantha. Times and days are Missouri (America/Chicago).';
export async function rpc(connector, email, msg, ctx = {}) {
  const id = msg && msg.id, isNote = !msg || msg.id === undefined || msg.id === null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Invalid request');
  if (isNote) return null;   // notifications (initialized, cancelled): nothing to answer
  const m = msg.method, p = msg.params || {};
  if (m === 'initialize') {
    const asked = p.protocolVersion;
    return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
  }
  if (m === 'ping') return ok({});
  if (m === 'tools/list') return ok({ tools: TOOLS });
  if (m === 'tools/call') {
    try {
      const out = await connector.call(email, p.name, p.arguments || {}, ctx);
      return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: out, isError: false });
    } catch (e) {
      if (e instanceof ToolError) return ok({ content: [{ type: 'text', text: e.message }], isError: true });
      return ok({ content: [{ type: 'text', text: 'Something went wrong on our side. Nothing changed.' }], isError: true });
    }
  }
  if (m === 'resources/list') return ok({ resources: [] });
  if (m === 'prompts/list') return ok({ prompts: [] });
  return err(-32601, 'Method not found: ' + m);
}
