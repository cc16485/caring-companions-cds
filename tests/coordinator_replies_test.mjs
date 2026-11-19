// The Coordinator answers texts back, and its own switch (2026-11-18). Made-up people only.
//   node tests/coordinator_replies_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(ROOT + '/supabase/functions/_shared/office/coordinator-replies.js');
const H = await import(ROOT + '/supabase/functions/_shared/office/coordinator-hands.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const now = Date.parse('2026-11-19T16:00:00Z');
const sent = [{ kind: 'dsds', phone: '4175550142', sent_at: '2026-11-19T15:00:00Z', person_kind: 'consumer', person_id: 'C1', person_name: 'Pat Sample', to_name: 'Pat Sample', body: 'Has anyone from the state called?' },
  { kind: 'clock', phone: '4175550143', sent_at: '2026-11-19T15:00:00Z', person_kind: 'consumer', person_id: 'C2', person_name: 'Robin Sample', to_name: 'Lee Sample', body: 'clock in' },
  { kind: 'chat', phone: '4175550144', sent_at: '2026-11-19T15:00:00Z', person_kind: 'lead', person_id: 'L1', person_name: 'Casey', to_name: 'Casey', body: 'x' },
  { kind: 'check', phone: '4175550145', sent_at: '2026-11-15T15:00:00Z', person_kind: 'consumer', person_id: 'C3', person_name: 'Dana', to_name: 'Dana', body: 'x' }];
const comms = [
  { id: 'm1', channel: 'sms', direction: 'outbound', at: '2026-11-19T15:00:05Z', phone10: '4175550142', body: 'Has anyone from the state called?' },
  { id: 'm2', channel: 'sms', direction: 'inbound', at: '2026-11-19T15:30:00Z', phone10: '4175550142', body: 'Yes they came Tuesday' },
  { id: 'm3', channel: 'sms', direction: 'inbound', at: '2026-11-19T15:31:00Z', phone10: '4175550142', body: 'what happens next?' },
  { id: 'm4', channel: 'sms', direction: 'inbound', at: '2026-11-19T15:20:00Z', phone10: '4175550143', body: 'thanks' },
  { id: 'm5', channel: 'sms', direction: 'outbound', at: '2026-11-19T15:25:00Z', phone10: '4175550143', body: 'Krystal: you are welcome!' },
  { id: 'm6', channel: 'sms', direction: 'inbound', at: '2026-11-19T15:40:00Z', phone10: '4175550144', body: 'hi' },
  { id: 'm7', channel: 'sms', direction: 'inbound', at: '2026-11-15T16:00:00Z', phone10: '4175550145', body: 'old answer' }];
const P = R.planReplies({ sent, comms, nowMs: now });
ok(P.length === 1 && P[0].phone === '4175550142' && P[0].theirs.length === 2 && P[0].key === 'reply:4175550142:m3', 'one to answer: both texts after ours, newest is the key', P);
ok(!P.some(p => p.phone === '4175550143'), 'someone at the office already answered: left alone');
ok(!P.some(p => p.phone === '4175550144'), 'lead chat texts are the lead texting helper\'s, not these');
ok(!P.some(p => p.phone === '4175550145'), 'more than 2 days old: not answered now');
const req = R.replyRequest({ to_name: 'Pat Sample', sign: 'Krystal at Caring Companions', ours: 'Has anyone from the state called?', sent_at: '2026-11-19T15:00:00Z', theirs: ['Yes they came Tuesday'] }, 'm');
ok(/Pat/.test(req.messages[0].content) && /Krystal at Caring Companions/.test(req.messages[0].content) && /choose person/.test(req.system), 'the request: first name, signature, when in doubt a person');
const txt = o => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
ok(R.cleanReply(txt({ action: 'reply', reply: 'Thank you Pat — we will let you know.', note: '' })).reply === 'Thank you Pat, we will let you know.', 'no em dashes in a reply');
ok(R.cleanReply({ content: [{ type: 'text', text: 'nonsense' }] }).action === 'person' && R.cleanReply({ stop_reason: 'refusal' }).action === 'person', 'cannot read it: a person looks');
ok(R.cleanReply(txt({ action: 'weird', reply: 'x', note: '' })).action === 'person', 'unknown action: a person looks');

// The run, against a fake database
const D = { msgs: [], items: [], sent: [], sw: { value: { live: false }, updated_at: '2026-11-19T15:45:00Z' } };
let nid = 1, aiAnswer = { action: 'reply', reply: 'Thank you Pat! A coordinator will call you about the next step. Krystal at Caring Companions', note: '' };
const consumers = [{ id: 'C1', name: 'Pat Sample', status: 'active', phone: '4175550142', coordinator: 'Krystal' }];
const db = { async query(t, p = []) {
  if (/from agency_data/.test(t)) return { rows: [{ data_value: { consumers, pipeline: [], authorizations: { records: {} } }[p[1]] }] };
  if (/from cds_packets/.test(t)) return { rows: [] };
  if (/kind = 'their_word' and status = 'open'/.test(t)) return { rows: [] };
  if (/max\(source->>'at'\)/.test(t)) return { rows: [] };
  if (/key = 'welcome_texts'/.test(t)) return { rows: [] };
  if (/from cds_enroll_packets|from orientation_completions/.test(t)) return { rows: [] };
  if (/where status = 'sent' and kind = any/.test(t)) return { rows: sent.filter(m => p[0].includes(m.kind)) };
  if (/from cds_comms where channel = 'sms'/.test(t)) return { rows: comms };
  if (/select 1 from cds_coord_msgs where key/.test(t)) return { rows: D.msgs.filter(m => m.key === p[0]) };
  if (/insert into cds_coord_msgs .*'reply',.*'draft'/s.test(t)) { if (D.msgs.some(m => m.key === p[0])) return { rows: [] }; D.msgs.push({ id: nid++, key: p[0], kind: 'reply', phone: p[5], body: p[6], status: 'draft', created_at: new Date(now).toISOString() }); return { rows: [] }; }
  if (/insert into cds_coord_msgs .*'skipped'/s.test(t)) { D.msgs.push({ id: nid++, key: p[0], kind: 'reply', body: p[6], status: 'skipped' }); return { rows: [] }; }
  if (/insert into cds_coord_items/.test(t)) { D.items.push({ key: p[0], data: JSON.parse(p[4]) }); return { rows: [] }; }
  if (/key = 'coordinator_texts'/.test(t)) return { rows: [D.sw] };
  if (/select id from cds_coord_msgs where status = 'draft' and kind in \('clock','dsds','check','reply'\) and created_at >= \$1/.test(t)) return { rows: D.msgs.filter(m => m.status === 'draft' && m.created_at >= p[0]).map(m => ({ id: m.id })) };
  if (/select \* from cds_coord_msgs where id/.test(t)) return { rows: D.msgs.filter(m => m.id === p[0]) };
  if (/update cds_coord_msgs set status = 'sent'/.test(t)) { Object.assign(D.msgs.find(m => m.id === p[0]), { status: 'sent' }); return { rows: [] }; }
  if (/insert into cds_audit/.test(t)) return { rows: [] };
  return { rows: [] };
} };
const ai = async () => ({ content: [{ type: 'text', text: JSON.stringify(aiAnswer) }] });
const hands = H.createHands({ db, ai, send: async m => D.sent.push(m), model: 'm', nowMs: () => now });
let r = await hands.work({ texts: 'practice' });
ok(r.replies.reply === 1 && D.msgs.length === 1 && D.msgs[0].status === 'draft' && D.sent.length === 0, 'switch off: the answer waits as a draft', r);
r = await hands.work({ texts: 'practice' });
ok(D.msgs.length === 1 && r.replies.reply === 0, 'never twice');
// switch on: sends drafts written after it went on
D.sw = { value: { live: true }, updated_at: '2026-11-19T15:45:00Z' };
r = await hands.work({ texts: 'practice' });
ok(D.sent.length === 1 && D.sent[0].phone === '+14175550142' && D.msgs[0].status === 'sent', 'switch on: the answer goes, 9 to 7', r);
// a draft from before the switch went on never goes by itself
D.msgs.length = 0; D.sent.length = 0; D.sw = { value: { live: true }, updated_at: '2026-11-19T17:00:00Z' };
await hands.work({ texts: 'practice' });
ok(D.sent.length === 0 && D.msgs[0].status === 'draft', 'older draft than the switch: waits for a person');
// a person must handle it: concern, nothing texted
D.msgs.length = 0; D.items.length = 0; aiAnswer = { action: 'person', reply: '', note: 'asks about her hours' };
r = await hands.work({ texts: 'practice' });
ok(r.replies.person === 1 && D.items.length === 1 && /Pat texted back: asks about her hours/.test(D.items[0].data.text) && D.msgs[0].status === 'skipped' && D.sent.length === 0, 'needs a person: My Week and the 4:30 email, nothing texted', D.items);
// nothing to say
D.msgs.length = 0; D.items.length = 0; aiAnswer = { action: 'none', reply: '', note: '' };
r = await hands.work({ texts: 'practice' });
ok(r.replies.none === 1 && !D.items.length && D.msgs[0].status === 'skipped', 'ok or a thumbs up: nothing');
// an answer that cannot go as written (a long number) goes to a person instead
D.msgs.length = 0; D.items.length = 0; aiAnswer = { action: 'reply', reply: 'Your DCN is 12345678', note: '' };
await hands.work({ texts: 'practice' });
ok(D.items.length === 1 && D.msgs[0].status === 'skipped', 'an answer with a long number never goes: a person looks');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
