// The CDS Coordinator texts new website leads (2026-11-17). Fake database, fake Claude, made-up people.
//   node tests/coordinator_chat_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(ROOT + '/supabase/functions/_shared/office/coordinator-chat.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
// Tue Nov 17 2026, 2:16 PM Central
const NOW = Date.parse('2026-11-17T20:16:00Z');
const resp = o => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(Object.assign({ reply: 'x', state: 'asking', followup: '', handoff: '', answers: { texting_for: '', consumer_first: '', consumer_last: '', consumer_dob: '', relation: '', consumer_phone: '', county: '', medicaid: '', help: '', attendant: '', attendant_relation: '', self_direct: '', other_agency: '', notes: '' } }, o)) }] });
const A = o => Object.assign({}, JSON.parse(resp({}).content[0].text).answers, o);
let t = C.cleanTurn(resp({ reply: 'Samantha will give Linda a call soon.', state: 'ready', answers: A({ consumer_first: 'Linda', consumer_phone: '417-555-0177', consumer_dob: '1948-03-02' }) }), '2026-11-17', '4175550142');
ok(t.state === 'ready' && t.answers.consumer_phone === '4175550177' && t.answers.consumer_dob === '1948-03-02', 'ready with the consumer phone and date of birth', t);
t = C.cleanTurn(resp({ state: 'ready', answers: A({ texting_for: 'family', consumer_first: 'Linda' }) }), '2026-11-17', '4175550142');
ok(t.state === 'asking', 'never ready without the consumer\'s phone');
t = C.cleanTurn(resp({ state: 'ready', answers: A({ texting_for: 'self', consumer_first: 'Marcus' }) }), '2026-11-17', '4175550142');
ok(t.state === 'ready' && t.answers.consumer_phone === '4175550142', 'texting for themself: their own number is the consumer phone');
ok(C.cleanTurn(resp({ answers: A({ consumer_dob: '2030-01-01' }) }), '2026-11-17').answers.consumer_dob === undefined, 'a date of birth in the future is dropped');
ok(C.cleanTurn(resp({ reply: 'Thanks, I have her birthday as 3/2/1948.' }), '2026-11-17').reply === '', 'never repeats a date of birth back');
ok(C.cleanTurn(resp({ reply: "I'm a real person here at the office." }), '2026-11-17').reply === '', 'never claims to be a person');
ok(C.cleanTurn(resp({ reply: "I'm the Caring Companions text helper. A real person on our team reads every message, and Samantha will be the one who calls." }), '2026-11-17').reply !== '', 'the honest line passes');
ok(C.cleanTurn(resp({ reply: 'What is her Medicaid number? 123456789' }), '2026-11-17').reply === '', 'no long numbers in a text');
ok(!/\bAI\b/.test(C.cleanTurn(resp({ reply: 'Our AI helper is here.' }), '2026-11-17').reply), 'the word AI never leaves');

const req = C.chatRequest({ lead: { form_name: 'Get care', full_name: 'Tanya Sample', who_needs_care: 'My mom' }, convo: [], answers: {}, nowLabel: 'Tuesday', first: true });
ok(/CONSUMER/.test(req.system) && /own OK/.test(req.system) && /NOT the consumer's spouse/.test(req.system) && /Phelps/.test(req.system), 'the rules: call with the consumer, spouse, our counties');
ok(/Do NOT set or offer a time/.test(req.system) && /first and last name and date of birth/.test(req.system) && /Medicaid is active/.test(req.system), 'her way: no set time, name and birth date to check Medicaid first');
ok(/FIRST text/.test(req.messages[0].content) && !/CALL TIMES/.test(req.messages[0].content), 'first text, no call times');
ok(!/[—–]/.test(req.system), 'no em dashes in the instructions');

// A run against a fake database
const T = { leads: [{ id: 'a1', submitted_at: '2026-11-17T20:14:00Z', phone: '417-555-0142', from_kind: null, full_name: 'Tanya Sample', form_name: 'Get care', who_needs_care: 'My mom' },
                    { id: 'a2', submitted_at: '2026-11-17T20:15:00Z', phone: '4175550199', from_kind: 'cc_lead', full_name: 'Caller' },
                    { id: 'a3', submitted_at: '2026-11-01T10:00:00Z', phone: '4175550188', from_kind: null, full_name: 'Old Lead' },
                    { id: 'a4', submitted_at: '2026-11-17T20:15:30Z', phone: '4175550111', from_kind: null, full_name: 'Test Phone' }],
  chats: [], msgs: [], comms: [], cal: new Map(), tests: ['4175550111'], sent: [] };
let cid = 1, mid = 1;
const db = { async query(t, p = []) {
  if (/key = 'test_recipients'/.test(t)) return { rows: [{ value: { phones: T.tests } }] };
  if (/from site_leads l where l.submitted_at/.test(t)) return { rows: T.leads.filter(l => l.submitted_at > p[0] && l.phone && (!l.from_kind || l.from_kind === 'prospect') && !T.chats.some(c => c.site_lead_id === String(l.id))) };
  if (/insert into cds_lead_chats/.test(t)) { T.chats.push({ id: cid++, site_lead_id: p[0], lead_id: p[1], phone: p[2], name: p[3], status: 'new', answers: {}, last_seen_at: '2026-11-17T20:14:00Z', created_at: '2026-11-17T20:14:00Z' }); return { rows: [] }; }
  if (/from cds_lead_chats c\s+join site_leads/.test(t)) return { rows: T.chats.filter(c => ['new', 'asking', 'waiting'].includes(c.status)).map(c => Object.assign({}, T.leads.find(l => String(l.id) === c.site_lead_id), c)) };
  if (/from cds_comms where channel = 'sms' and direction = 'inbound' and phone10 = \$1 and at > \$2/.test(t)) return { rows: T.comms.filter(m => m.phone10 === p[0] && m.at > p[1]) };
  if (/update cds_lead_chats set last_seen_at/.test(t)) { Object.assign(T.chats.find(c => c.id === p[0]), { last_seen_at: p[1] }); return { rows: [] }; }
  if (/update cds_lead_chats set status = 'stopped'/.test(t)) { T.chats.find(c => c.id === p[0]).status = 'stopped'; return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'skipped', error = 'they asked/.test(t)) { T.msgs.filter(m => m.person_id === p[0] && m.status === 'draft').forEach(m => m.status = 'skipped'); return { rows: [] }; }
  if (/select id from cds_coord_msgs where kind = 'chat' and person_id = \$1 and status = 'draft'/.test(t)) return { rows: T.msgs.filter(m => m.person_id === p[0] && m.status === 'draft') };
  if (/update cds_coord_msgs set status = 'skipped', error = 'they texted again/.test(t)) { T.msgs.find(m => m.id === p[0]).status = 'skipped'; return { rows: [] }; }
  if (/select dir, text from/.test(t)) return { rows: [...T.msgs.filter(m => m.person_id === p[0] && m.status === 'sent').map(m => ({ dir: 'out', text: m.body })), ...T.comms.filter(m => m.phone10 === p[1]).map(m => ({ dir: 'in', text: m.body }))] };
  if (/update cds_lead_chats set status = 'waiting'/.test(t)) { Object.assign(T.chats.find(c => c.id === p[0]), { status: 'waiting', note: p[1] }); return { rows: [] }; }
  if (/update cds_lead_chats set status = \$2, answers/.test(t)) { const c = T.chats.find(c => c.id === p[0]); Object.assign(c, { status: p[1], answers: Object.assign({}, c.answers, JSON.parse(p[2])) }); if (p[3]) c.followup = p[3]; c.note = p[4] || null; return { rows: [] }; }
  if (/insert into cds_coord_msgs/.test(t)) { const m = { id: mid++, key: p[0], person_id: p[1], phone: p[4], body: p[5], status: 'draft' }; T.msgs.push(m); return { rows: [{ id: m.id }] }; }
  if (/update cds_coord_msgs set status = 'sent'/.test(t)) { T.msgs.find(m => m.id === p[0]).status = 'sent'; return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'failed'/.test(t)) { Object.assign(T.msgs.find(m => m.id === p[0]), { status: 'failed', error: p[1] }); return { rows: [] }; }
  if (/select id, phone, body from cds_coord_msgs where kind = 'chat' and status = 'draft'/.test(t)) return { rows: T.msgs.filter(m => m.status === 'draft') };
  if (/select id, name, status, answers, followup/.test(t)) return { rows: T.chats.filter(c => c.id === p[0]) };
  if (/insert into owner_calendar/.test(t)) { T.cal.set(p[0], JSON.parse(p[1])); return { rows: [] }; }
  throw new Error('unexpected ' + t.slice(0, 80));
} };
let turn = 0, asked = [];
const ai = async req => { asked.push(req.messages[0].content); turn++;
  if (/FIRST text/.test(req.messages[0].content)) return resp({ reply: 'Hi Tanya, this is Caring Companions in Springfield. Thanks for asking about care for your mom! Would texting a few quick questions be easier, or would you rather we call?' });
  if (/THEM: Linda Sample 3\/2\/1948/.test(req.messages[0].content)) return resp({ reply: 'Thank you! Samantha will give Linda a call soon from (417) 218-2888.', state: 'ready', answers: Object.assign({}, JSON.parse(resp({}).content[0].text).answers, { consumer_first: 'Linda', consumer_last: 'Sample', consumer_dob: '1948-03-02', consumer_phone: '4175550177', county: 'Greene', medicaid: 'yes', attendant: 'Tanya', relation: 'daughter' }) });
  return resp({ reply: 'Great. What does Linda need the most help with?' }); };
const sent = []; const send = async m => { sent.push(m); };
let chat = C.createChat({ db, ai, send, nowMs: () => NOW });
const set = { lead_chat: 'practice', lead_chat_from: '2026-11-17T20:00:00Z' };
let r = await chat.run(set);
ok(r.fresh === 2 && T.chats.length === 2, 'two new website leads: the caller and the old lead are left out', T.chats.map(c => c.name));
ok(T.msgs.length === 2 && sent.length === 1 && sent[0].phone === '+14175550111', 'practice: the first texts wait as drafts, except the office test phone which goes live', [T.msgs.map(m => m.status), sent]);
ok(T.msgs[0].status === 'draft' && /Would texting a few quick questions/.test(T.msgs[0].body), 'Tanya\'s first text waits for Send');
r = await chat.run(set);
ok(r.made === 0, 'nothing new from them: no new text');
T.msgs[0].status = 'sent';   // a person pressed Send
T.comms.push({ phone10: '4175550142', at: '2026-11-17T20:20:00Z', body: 'Texting is great' });
r = await chat.run(set);
ok(r.made === 1 && /What does Linda need/.test(T.msgs[2].body), 'their reply gets one reply', T.msgs.map(m => m.body));
T.msgs[2].status = 'sent';
T.comms.push({ phone10: '4175550142', at: '2026-11-17T20:25:00Z', body: 'Linda Sample 3/2/1948, her cell is 417-555-0177' });
r = await chat.run(set);
const tanya = T.chats.find(c => c.name === 'Tanya Sample');
ok(tanya.status === 'ready' && tanya.answers.consumer_dob === '1948-03-02', 'ready to call, with what the office needs to check Medicaid');
const wk = T.cal.get('i:chat-' + tanya.id);
ok(wk && wk.date === '2026-11-17' && !wk.time && /Check Medicaid, then call Linda Sample at \(417\) 555-0177: their OK for the referral/.test(wk.t), 'on My Week: check Medicaid then call the consumer, today (it is 2:16 PM, before 3), no set time', wk);
ok(/THEM: Texting is great/.test(asked[asked.length - 1]) && /US: Hi Tanya/.test(asked[asked.length - 1]), 'Claude sees the whole conversation');
T.comms.push({ phone10: '4175550111', at: '2026-11-17T20:30:00Z', body: 'STOP' });
r = await chat.run(set);
ok(r.stopped === 1 && T.chats.find(c => c.phone === '4175550111').status === 'stopped', 'STOP ends it for good');
const before = asked.length; T.comms.push({ phone10: '4175550111', at: '2026-11-17T20:40:00Z', body: 'hello?' });
await chat.run(set);
ok(asked.length === before, 'nothing more after STOP');
r = await C.createChat({ db, ai, send, nowMs: () => NOW }).run({ lead_chat: 'off' });
ok(r.chat === 'off', 'off: nothing at all');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
