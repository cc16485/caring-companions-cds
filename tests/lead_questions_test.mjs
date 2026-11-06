// The sign-up questions on a lead's own link (2026-11-05). Made-up people, a stand-in database and sender.
// node tests/lead_questions_test.mjs
import '../supabase/functions/_shared/office/starting-rules.js';
import '../starting/call-answers.js';
import '../starting/lead-questions.js';
import { cleanAnswers, createLeadQuestions } from '../supabase/functions/_shared/enroll/lead-questions.js';
const LQ = globalThis.LeadQs, CA = globalThis.CallAnswers;
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL ' + m); } };
const throwsMsg = async (f, re, m) => { try { await f(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(re.test(e.message), m + ' (' + e.message + ')'); } };

// ---- the answers are cleaned to the questions on the page only
const A = { who: 'Mom or dad', decide: 'Yes', county: 'Greene', medicaid: 'Not sure', tasks: ['Bathing and grooming', 'Meals', 'Hacking'], hours: 15,
  basics: 'Yes', first: 'Pat', last: 'Example', phone: '(417) 555-0142', email: 'pat@example.com', cared: 'Mae', when: 'Morning',
  consName: 'Mae Example', consDob: '03/04/1944', ssn: '000-00-0000', who2: 'x' };
const c = cleanAnswers(A);
ok(c.phone === '4175550142' && c.consDob === '1944-03-04' && c.tasks.length === 2 && !('ssn' in c) && !('who2' in c), 'answers cleaned: phone digits, birth date read, unknown tasks and fields dropped');
ok(!cleanAnswers({ who: 'Hacker', hours: 99, medicaid: 'Maybe' }).who && !cleanAnswers({ hours: 99 }).hours, 'answers outside the choices are dropped');
ok(!cleanAnswers({ consDob: '13/45/1944' }).consDob, 'a birth date that cannot be read is dropped');

// ---- the server with a stand-in database
const rows = [], outbox = [], audits = [], tasks = [];
const db = {
  async q(sql, p) {
    if (/update cds_lead_questions set outbox_id/.test(sql)) { const r = rows.find(x => x.id === p[0]); r.outbox_id = p[1]; r.send_status = p[2]; return []; }
    if (/update cds_lead_questions set answers/.test(sql)) { const r = rows.find(x => x.id === p[0]); Object.assign(r, { answers: JSON.parse(p[1]), answered_at: new Date().toISOString(), answer_count: (r.answer_count || 0) + 1, decided_at: null }); return []; }
    if (/update cds_lead_questions set decided_at/.test(sql)) { const r = rows.find(x => x.id === p[0]); Object.assign(r, { decided_at: 'now', decided_by: p[1], kept: JSON.parse(p[2]), decision: p[3] }); return []; }
    if (/from cds_lead_questions where lead_id = any/.test(sql)) return rows.filter(r => p[0].includes(r.lead_id));
    throw new Error('unexpected q ' + sql);
  },
  async one(sql, p) {
    if (/insert into cds_lead_questions/.test(sql)) { const r = { id: 'L' + (rows.length + 1), token_hash: p[0], lead_id: p[1], lead_name: p[2], channel: p[3], created_by: p[4], expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), answer_count: 0 }; rows.push(r); return { id: r.id }; }
    if (/insert into cds_outbox/.test(sql)) { const r = { id: 'O' + (outbox.length + 1), channel: p[0], to_display: p[1], body: p[2], status: p[3], error: p[4], created_by: p[5], created_at: new Date().toISOString() }; outbox.push(r); return r; }
    if (/from cds_lead_questions where token_hash/.test(sql)) return rows.find(r => r.token_hash === p[0]) || null;
    if (/from cds_lead_questions where id=/.test(sql)) return rows.find(r => r.id === p[0]) || null;
    throw new Error('unexpected one ' + sql);
  },
};
let sent = [], live = false, n = 0;
const crypto = { token: async () => 'tok' + (++n) + 'abcdefghijklmnopqrstuvwxyz', hash: async t => 'h:' + t };
const R = { maskPhone: s => '***' + String(s).slice(-4), maskEmail: s => '***' + String(s).slice(-6) };
const fail = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
const mk = mode => createLeadQuestions({ q: db.q, one: db.one, audit: async (...a) => audits.push(a), setting: async () => ({ live }), task: async (...a) => tasks.push(a),
  crypto, R, fail, deps: { mode, send: async m => { sent.push(m); return { id: 'ghl1' }; } }, isTestRecipient: async (ch, to) => to === '4175550000' });
const H = mk('live');
const person = { kind: 'lead', id: 'lead1', name: 'Mae Example' };
const BODY = 'Hi Pat, this is Kim with Caring Companions CDS. A few quick questions: [link]\nReply STOP to opt out.';

await throwsMsg(() => H.office.leadQuestionsSend({ staff: 'kim@x', person, channel: 'sms', to: '4175550142', body: 'no link here at all' }), /\[link\]/, 'a message without [link] is refused');
await throwsMsg(() => H.office.leadQuestionsSend({ staff: '', person, channel: 'sms', to: '4175550142', body: BODY }), /sign in/i, 'not signed in is refused');
await throwsMsg(() => H.office.leadQuestionsSend({ staff: 'kim@x', person: { kind: 'consumer', id: 'c1' }, channel: 'sms', to: '4175550142', body: BODY }), /lead/, 'only leads');

let r = await H.office.leadQuestionsSend({ staff: 'kim@x', person, channel: 'sms', to: '4175550142', body: BODY });
ok(r.message.status === 'held' && !sent.length, 'switch off: held, nothing sent');
ok(outbox[0].body.includes('[link]') && !outbox[0].body.includes('tok1'), 'the outbox keeps [link], never the private link');
ok(rows[0].token_hash === 'h:tok1abcdefghijklmnopqrstuvwxyz' && !JSON.stringify(rows[0]).includes('"tok1'), 'only the link’s hash is stored');
r = await H.office.leadQuestionsSend({ staff: 'kim@x', person, channel: 'sms', to: '4175550000', body: BODY });
ok(r.message.status === 'sent' && sent.length === 1 && sent[0].body.includes('https://www.caringcds.com/start/?k=tok2'), 'a test recipient gets it with the switch off, with the real link');
live = true;
r = await H.office.leadQuestionsSend({ staff: 'kim@x', person, channel: 'sms', to: '4175550142', body: BODY });
ok(r.message.status === 'sent' && sent.length === 2, 'switch on: sent');
const P = mk('practice');
r = await P.office.leadQuestionsSend({ staff: 'kim@x', person, channel: 'sms', to: '4175550142', body: BODY });
ok(r.message.status === 'practice' && sent.length === 2, 'practice mode never sends');

// ---- the public page answers on the link
await throwsMsg(() => H.pub.leadQuestionsCheck({ k: 'short' }), /not working/, 'a made-up link is refused');
ok((await H.pub.leadQuestionsCheck({ k: 'tok3abcdefghijklmnopqrstuvwxyz' })).ok, 'a real link checks out');
const chk = JSON.stringify(await H.pub.leadQuestionsCheck({ k: 'tok3abcdefghijklmnopqrstuvwxyz' }));
ok(!/Mae|lead1|Example/.test(chk), 'checking a link says nothing about the lead');
await throwsMsg(() => H.pub.leadQuestionsAnswer({ k: 'tok3abcdefghijklmnopqrstuvwxyz', answers: { who: 'Mom or dad' } }), /name and phone/, 'answers need a name and phone');
await H.pub.leadQuestionsAnswer({ k: 'tok3abcdefghijklmnopqrstuvwxyz', answers: A });
ok(rows[2].answers.first === 'Pat' && rows[2].answer_count === 1 && !('ssn' in rows[2].answers), 'answers saved on that link only, cleaned');
rows[1].expires_at = new Date(Date.now() - 1000).toISOString();
await throwsMsg(() => H.pub.leadQuestionsAnswer({ k: 'tok2abcdefghijklmnopqrstuvwxyz', answers: A }), /expired/, 'an expired link is refused');
rows[2].answer_count = 10;
await throwsMsg(() => H.pub.leadQuestionsAnswer({ k: 'tok3abcdefghijklmnopqrstuvwxyz', answers: A }), /already have/, 'a link stops taking answers after 10 tries');

// ---- the hub reads them and someone presses OK
const list = await H.office.leadQuestionsFor({ staff: 'kim@x', leadIds: ['lead1'] });
ok(list.links.length === 4 && list.links.some(l => l.answered), 'the hub sees the lead’s links and the answers');
ok(!JSON.stringify(list).includes('h:tok'), 'the hub never gets the link or its hash');
await H.office.leadQuestionsDecide({ staff: 'kim@x', id: 'L3', decision: 'ok', kept: ['county', 'help'] });
ok(rows[2].decided_by === 'kim@x' && rows[2].kept.join() === 'county,help', 'OK is recorded with what was kept');
await throwsMsg(() => H.office.leadQuestionsDecide({ staff: 'kim@x', id: 'L1', decision: 'ok', kept: [] }), /not here/, 'a link with no answers cannot be OKed');

// ---- the answers next to the lead, and onto the lead
const x = cleanAnswers(A);
const lead = { id: 'lead1', name: 'Caller: Pat', county: '', helpNeeded: [], medicaidStatus: '' };
globalThis.CDS_COUNTIES = ['Greene', 'Polk'];
const a = LQ.toAnswers(x);
ok(a.first === 'Mae' && a.last === 'Example' && a.dob === '1944-03-04' && a.county === 'Greene' && !a.medicaid && a.help.join() === 'bathing,meals' && a.att_name === 'Pat Example', 'online answers become the lead’s answer set (Not sure Medicaid is left for the call)');
const rws = CA.rows(lead, a, '2026-11-05');
ok(rws.find(r => r.k === 'name').tick && rws.find(r => r.k === 'county').tick && rws.find(r => r.k === 'help').tick && rws.find(r => r.k === 'attendant'), 'new answers are ticked on the lead card');
const lead2 = { id: 'l2', name: 'Mae Example', county: 'Polk' };
ok(CA.rows(lead2, a, '2026-11-05').find(r => r.k === 'county').state === 'differs' && !CA.rows(lead2, a, '2026-11-05').find(r => r.k === 'county').tick, 'a different county than the lead has is not ticked');
const did = CA.apply(lead, a, ['county', 'help', 'dob'], { id: 'web:L3', at: '2026-11-05T15:00:00Z', by: 'kim' });
ok(lead.county === 'Greene' && lead.dob === '1944-03-04' && lead.helpNeeded.join() === 'bathing,meals' && did.length === 3, 'OK writes the ticked answers onto the lead');
ok(LQ.toAnswers({ who: 'Mom or dad', county: 'Another Missouri county' }).county === undefined, 'a county outside the area is not put on the lead');

// ---- the guided call fills in from them
const s = LQ.toCall(x);
ok(s.who === 'pair' && s.first === 'Mae' && s.last === 'Example' && s.dob === '1944-03-04' && s.medicaid === 'unsure' && s.selfDirect === 'yes' && s.callerName === 'Pat Example' && s.callerPhone === '(417) 555-0142', 'call fields: caller is the caregiver, about Mae');
ok(LQ.toCall({ decide: 'Guardian' }).guardian === 'yes' && !LQ.toCall({ decide: 'POA' }).guardian, 'guardian marks the guardian question; power of attorney does not');
ok(LQ.toCall({ who: 'My husband or wife' }).attRel === 'spouse', 'a spouse answering is marked spouse for the call’s attendant check');
const sh = LQ.shown(x).map(y => y.label);
ok(sh.includes('Their date of birth') && sh.includes('Best time to call') && sh.includes('Makes their own decisions'), 'every answer is shown word for word');

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
