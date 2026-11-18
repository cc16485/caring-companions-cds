// The CDS Coordinator, part 2 (2026-11-17): the texts it writes and sends, and the 4:30 email. Fakes only, made-up people.
//   node tests/coordinator_hands_test.mjs
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = await import(ROOT + '/supabase/functions/_shared/office/coordinator-hands.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const today = '2026-11-17';
const consumers = [
  { id: 'C1', name: 'Pat Example', status: 'starting', phone: '(417) 555-0142', coordinator: 'Krystal', cdsStartDate: '2026-11-19', starting: { attendantName: 'Lee Sample' } },
  { id: 'C2', name: 'Robin Sample', status: 'starting', phone: '4175550143', coordinator: 'Samantha', starting: { referralSent: '2026-11-03', kind: 'new' } },
  { id: 'C3', name: 'Dana Sample', status: 'starting', phone: '4175550144', cdsStartDate: '2026-11-19', starting: { clockCall: { at: 'x' } } },
  { id: 'C4', name: 'Morgan Sample', status: 'starting', phone: '4175550145', starting: { referralSent: '2026-10-20', kind: 'new' } },
  { id: 'C5', name: 'Example CDS Consumer', status: 'starting', phone: '4175550146', cdsStartDate: '2026-11-18' }];
const pipeline = [{ id: 'L1', name: 'Joe Sample', phone: '4175550188', coordinator: 'Samantha' }];
const attendants = [{ first_name: 'Lee', last_name: 'Sample', phone: '417-555-0160', consumer_name: 'Pat Example' }];
const items = [{ id: 5, kind: 'their_word', status: 'open', due: '2026-11-17', person_kind: 'lead', person_id: 'L1', person_name: 'Joe Sample', data: { what: 'call the state to ask for the switch' }, source: { at: '2026-11-10T15:00:00Z', who: 'Joe', phone10: '4175550188' } },
               { id: 6, kind: 'their_word', status: 'open', due: '2026-11-01', person_kind: 'lead', person_id: 'L1', person_name: 'Joe Sample', data: { what: 'old thing' }, source: { at: '2026-10-20T00:00:00Z' } }];
let P = H.plan({ consumers, pipeline, items, attendants, auths: {}, today });
const kinds = P.map(p => p.kind + ':' + p.person_id + ':' + p.to_name).sort();
ok(kinds.includes('clock:C1:Pat Example') && kinds.includes('clock:C1:Lee Sample'), 'clock-in help to the consumer and the attendant 2 days before', kinds);
ok(!kinds.some(k => k.startsWith('clock:C3')), 'no clock text once the clock-in call is done');
ok(!kinds.some(k => k.includes('Example CDS')), 'practice records get nothing');
ok(kinds.includes('dsds:C2:Robin Sample'), 'day 14 after the referral: ask if the state called', kinds);
ok(!kinds.includes('dsds:C4:Morgan Sample'), 'day 28: that is a call to DSDS by the office, not a text');
ok(kinds.filter(k => k.startsWith('check:')).length === 1 && P.find(p => p.kind === 'check').phone === '4175550188', 'one check-in, today\'s, to the number we heard them on');
ok(H.plan({ consumers, pipeline, items, attendants, auths: {}, today, lastHeard: { 'lead:L1': '2026-11-15T00:00:00Z' } }).every(p => p.kind !== 'check'), 'no check-in when they were heard from since');
ok(H.plan({ consumers, pipeline, items: [], attendants, auths: { robinsample: true }, today }).every(p => p.kind !== 'dsds'), 'no DSDS text once authorized');
const clockText = P.find(p => p.to_name === 'Pat Example').body;
ok(/^Hi Pat, this is Krystal at Caring Companions\. Your CDS care starts Thursday, November 19!/.test(clockText) && /set shifts .* or flexible shifts/.test(clockText) && /\(417\) 218-2888\.$/.test(clockText) && clockText.length < 480, 'consumer clock text: signed, the date, set or flexible shifts, the line', clockText);
ok(!/[—–]/.test(P.map(p => p.body || '').join(' ')), 'no em dashes');
ok(H.safeText('Your DCN is 12345678') === '' && H.safeText('It pays $15') === '' && H.safeText('Call (417) 218-2888 or 417-218-2888') !== '', 'no long numbers or money in a text; phone numbers are fine');
ok(/Hi Joe/.test(H.checkRequest({ name: 'Joe Sample', what: 'x', when: '2026-11-10', from: 'Samantha' }, 'm').messages[0].content) === false && /Joe/.test(H.checkRequest({ name: 'Joe Sample', what: 'x', when: '2026-11-10', from: 'Samantha' }, 'm').messages[0].content), 'check-in prompt has their first name');
ok(H.sendingHours(Date.parse('2026-11-17T16:00:00Z')) && !H.sendingHours(Date.parse('2026-11-18T02:00:00Z')) && !H.sendingHours(Date.parse('2026-11-22T17:00:00Z')), '9 to 7 Central, not Sunday');

// work + send + skip + email against a fake database
const T = { msgs: [], audit: [], settings: { texts: 'practice' }, sent: [] };
let nid = 1;
const db = { async query(t, p = []) {
  if (/from agency_data/.test(t)) return { rows: [{ data_value: { consumers, pipeline, authorizations: { records: {} }, startingWaits: null }[p[1]] }] };
  if (/from cds_packets/.test(t)) return { rows: attendants };
  if (/kind = 'their_word' and status = 'open'/.test(t)) return { rows: items };
  if (/max\(source->>'at'\)/.test(t)) return { rows: [] };
  if (/select 1 from cds_coord_msgs where key/.test(t)) return { rows: T.msgs.filter(m => m.key === p[0]) };
  if (/insert into cds_coord_msgs .*values \(\$1,'journey'/s.test(t)) { if (T.msgs.some(m => m.key === p[0])) return { rows: [] }; const m = { id: nid++, key: p[0], kind: 'journey', person_name: p[3], to_name: p[4], phone: p[5], body: p[6], status: 'draft' }; T.msgs.push(m); return { rows: [{ id: m.id }] }; }
  if (/insert into cds_coord_msgs/.test(t)) { T.msgs.push({ id: nid++, key: p[0], kind: p[1], person_name: p[5], to_name: p[6], phone: p[7], body: p[8], status: 'draft' }); return { rows: [] }; }
  if (/select id from cds_coord_msgs where status = 'draft'/.test(t)) return { rows: T.msgs.filter(m => m.status === 'draft' && ['clock', 'dsds', 'check'].includes(m.kind)).map(m => ({ id: m.id })) };
  if (/select \* from cds_coord_msgs where id/.test(t)) return { rows: T.msgs.filter(m => m.id === p[0]) };
  if (/update cds_coord_msgs set status = 'sent'/.test(t)) { Object.assign(T.msgs.find(m => m.id === p[0]), { status: 'sent', body: p[1], sent_by: p[2] }); return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'failed'/.test(t)) { Object.assign(T.msgs.find(m => m.id === p[0]), { status: 'failed', error: p[1] }); return { rows: [] }; }
  if (/update cds_coord_msgs set status = 'skipped'/.test(t)) { const m = T.msgs.find(m => m.id === p[0] && ['draft', 'failed'].includes(m.status)); if (m) m.status = 'skipped'; return { rows: m ? [{ id: m.id }] : [] }; }
  if (/insert into cds_audit/.test(t)) { T.audit.push(p); return { rows: [] }; }
  if (/key = 'welcome_texts'/.test(t)) return { rows: T.welcome ? [{ value: { live: true } }] : [] };
  if (/from cds_enroll_packets/.test(t)) return { rows: [] };
  if (/from orientation_completions/.test(t)) return { rows: [] };
  if (/from owner_reminders/.test(t)) return { rows: [{ email: 'owner@example.com' }] };
  if (/from cds_coord_items where created_at/.test(t)) return { rows: [{ person_name: 'Pat Example', kind: 'promise', data: { what: 'send the packet' } }] };
  if (/from cds_coord_items where status in/.test(t)) return { rows: [{ person_name: 'Pat Example', kind: 'attendant', data: { name: 'Lee Sample' }, status: 'suggested' }] };
  if (/from cds_coord_msgs where status in \('draft','failed'\) or sent_at/.test(t)) return { rows: T.msgs };
  if (/update cds_match_settings/.test(t)) { Object.assign(T.settings, JSON.parse(p[0])); return { rows: [] }; }
  throw new Error('unexpected ' + t.slice(0, 70));
} };
let fail = false;
const send = async m => { if (fail) throw new Error('GoHighLevel 400'); T.sent.push(m); };
const ai = async () => ({ content: [{ type: 'text', text: 'Hi Joe, this is Samantha at Caring Companions. Were you able to call the state about switching to us? Just reply here or call (417) 218-2888.' }] });
const at = iso => () => Date.parse(iso);
let hands = H.createHands({ db, ai, send, model: 'm', nowMs: at('2026-11-17T16:00:00Z') });
let r = await hands.work({ texts: 'practice' });
ok(r.made === 4 && T.sent.length === 0, 'practice: 4 drafts, nothing sent', r);
r = await hands.work({ texts: 'practice' });
ok(r.made === 0, 'each draft once');
r = await hands.sendOne(T.msgs[0].id, 'samantha@example.com');
ok(r.ok && T.sent[0].phone === '+14175550142' && T.msgs[0].status === 'sent' && T.audit.length === 1, 'a person presses Send: it goes, audited');
r = await hands.sendOne(T.msgs[1].id, 'samantha@example.com', 'Your DCN is 123456789');
ok(!r.ok && T.msgs[1].status === 'draft', 'an edited text with a long number is refused', r);
fail = true; r = await hands.sendOne(T.msgs[1].id, 'x'); fail = false;
ok(!r.ok && T.msgs[1].status === 'failed', 'a failed send is saved as failed, never silent');
ok((await hands.skip(T.msgs[2].id, 'x')).ok && T.msgs[2].status === 'skipped', 'Skip');
hands = H.createHands({ db, ai, send, model: 'm', nowMs: at('2026-11-18T03:00:00Z') });
r = await hands.work({ texts: 'on' });
ok(r.sent === 0, 'on, but 9 PM: nothing sent at night', r);
hands = H.createHands({ db, ai, send, model: 'm', nowMs: at('2026-11-17T17:00:00Z') });
r = await hands.work({ texts: 'on' });
ok(r.sent === 1 && T.msgs[3].status === 'sent', 'on, in hours: the remaining draft goes by itself', r);
ok((await hands.work({ texts: 'off' })).made === 0, 'off: nothing made');
// the welcome journey: switch on, in hours, a consumer who said yes today gets the welcome by itself
consumers.push({ id: 'C9', name: 'Kim Sample', status: 'starting', phone: '4175550199', coordinator: 'Samantha', starting: { at: '2026-11-17T15:00:00Z' } });
T.welcome = true; const beforeJ = T.sent.length;
hands = H.createHands({ db, ai, send, model: 'm', nowMs: at('2026-11-17T17:00:00Z') });
r = await hands.work({ texts: 'practice' });
ok(r.journey.made === 1 && r.journey.sent === 1 && T.sent.length === beforeJ + 1 && T.sent[T.sent.length - 1].phone === '+14175550199', 'welcome switch on: the welcome text goes by itself', r.journey);
consumers.pop(); T.welcome = false;
// the 4:30 email
let e = await hands.dailyEmail({ email: true });
ok(e.email === 'not yet', '11 AM: not yet', e);
hands = H.createHands({ db, ai, send, model: 'm', nowMs: at('2026-11-17T22:35:00Z') });
const before = T.sent.length;
e = await hands.dailyEmail({ email: true });
ok(e.email === 'sent' && T.sent.length === before + 1 && T.sent[before].email === 'owner@example.com' && /waiting on you/.test(T.sent[before].subject), '4:35 PM: one email to her', [e, T.sent[before]]);
e = await hands.dailyEmail({ email: true, email_day: T.settings.email_day });
ok(e.email === 'already sent today', 'once a day');
ok(/Lee Sample/.test(T.sent[before].html) && !/[—–]/.test(T.sent[before].html), 'the email lists what waits on her, no em dashes');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
