// CDS Communication & Follow-Up Center, step 1 (2026-10-22): end to end on a local Postgres copy
// with a fake GoHighLevel and a fake clock. Runs the real SQL and the real job code; nothing
// leaves this machine.
//   PGLITE=/path/to/pglite/dist/index.js node tests/comm_center_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgPath = process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pgPath);
const C = await import(ROOT + '/supabase/functions/_shared/office/comms.js');
const SW = await import(ROOT + '/supabase/functions/_shared/office/switches.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- pure parts ----------
{
  const conv = { id: 'cv1', phone: '+1 (417) 555-0131', fullName: 'Ruth Caldwell', contactId: 'ct1' };
  let m = C.plainMessage({ id: 'm1', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: '2026-10-22T13:52:00Z', meta: { call: { duration: 0, status: 'no-answer' } } }, conv);
  ok(m.channel === 'call' && !m.answered && !m.voicemail && m.phone10 === '4175550131', 'missed call, meta.call shape');
  m = C.plainMessage({ id: 'm2', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: '2026-10-22T13:52:00Z', meta: { callDuration: 41, callStatus: 'voicemail' } }, conv);
  ok(m.voicemail && !m.answered && m.seconds === 41, 'voicemail, docs shape');
  m = C.plainMessage({ id: 'm3', messageType: 'TYPE_VOICEMAIL', direction: 'inbound', dateAdded: '2026-10-22T13:52:00Z', status: 'voicemail' }, conv);
  ok(m.voicemail && !m.answered, 'TYPE_VOICEMAIL with no call details');
  m = C.plainMessage({ id: 'm4', messageType: 'TYPE_CALL', direction: 'outbound', dateAdded: '2026-10-22T13:52:00Z', meta: { call: { duration: 120, status: 'completed' } } }, conv);
  ok(m.answered && m.seconds === 120, 'answered call');
  m = C.plainMessage({ id: 'm5', messageType: 'TYPE_CALL', direction: 'outbound', dateAdded: '2026-10-22T13:52:00Z', meta: { call: { duration: 3, status: 'voicemail' } } }, conv);
  ok(!m.answered && m.voicemail, 'outbound call to their voicemail is not answered');
  m = C.plainMessage({ id: 'm6', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: '2026-10-22T13:52:00Z', meta: { call: { duration: 0, status: 'completed' } } }, conv);
  ok(!m.answered, 'completed with 0 seconds is not answered');
  m = C.plainMessage({ id: 'm7', messageType: 'TYPE_SMS', direction: 'inbound', dateAdded: '2026-10-22T13:52:00Z', body: 'hello' }, conv);
  ok(m.channel === 'sms' && m.body === 'hello', 'text');
  ok(C.plainMessage({ id: 'm8', messageType: 'TYPE_EMAIL', direction: 'inbound', dateAdded: '2026-10-22T13:52:00Z' }, conv) === null, 'emails are left out');
  ok(C.plainMessage({ id: 'm9', messageType: 'TYPE_SMS', dateAdded: '2026-10-22T13:52:00Z' }, conv) === null, 'no direction, left out');
}
{
  const rows = C.phoneBookRows({
    consumers: [{ id: 'c1', name: 'Ruth Caldwell', phone: '(417) 555-0131' }],
    pipeline: [
      { id: 'l1', name: 'Ruth Caldwell', phone: '417.555.0131', referral: { responsiblePartyName: 'Lena', responsiblePartyRelationship: 'Daughter', responsiblePartyPhone: '4175550177' } },
      { id: 'l2', name: 'Tom Hensley', phone: '+14175550188' }],
    attendants: [{ id: 'a1', name: 'Marcus Webb', phone: '4175550144', consumer: 'Ruth Caldwell' }, { id: 'a2', name: 'Dee Lawson', phone: '4175550155' }],
    pool: [{ id: 'p1', first_name: 'Dee', last_name: 'Lawson', phone: '(417) 555-0155', status: 'active', placed_with: 'Gus Tolliver' },
           { id: 'p2', first_name: 'Bev', last_name: 'Carter', phone: '4175550166', status: 'new' }],
    staff: [{ name: 'Krystal', email: 'krystal@mo-care.com', phone: '4175550100' }],
  });
  const by = p => rows.filter(r => r.phone10 === p).map(r => r.ref + '|' + r.kind);
  eq(by('4175550131'), ['consumer:c1|consumer'], 'a lead already on Consumers is that consumer, once');
  eq(by('4175550177'), ['family:consumer:c1|family'], 'the responsible party number points at the consumer as family');
  ok(rows.find(r => r.phone10 === '4175550177').detail === 'Daughter of Ruth Caldwell', 'family detail');
  eq(by('4175550188'), ['lead:l2|lead'], 'a lead');
  eq(by('4175550155'), ['pool:p1|attendant'], 'roster and Active Attendants: one attendant, the pool record wins');
  eq(by('4175550144'), ['attendant:a1|attendant'], 'roster-only attendant');
  ok(rows.find(r => r.phone10 === '4175550144').detail === 'Attendant for Ruth Caldwell', 'roster attendant detail');
  eq(by('4175550166'), ['pool:p2|applicant'], 'an applicant');
  eq(by('4175550100'), ['staff:krystal@mo-care.com|staff'], 'our team');
}
{
  const r = C.resolve([{ ref: 'lead:1', kind: 'lead', source: 'sync' }, { ref: 'pool:2', kind: 'applicant', source: 'sync' }]);
  ok(r.state === 'several' && r.candidates.length === 2, 'two different people: ask');
  ok(C.resolve([{ ref: 'lead:1', kind: 'lead', source: 'sync' }, { ref: 'pool:2', kind: 'attendant', source: 'staff' }]).person.ref === 'pool:2', 'a person\'s answer wins');
  ok(C.resolve([]).state === 'unknown', 'unknown');
  ok(C.resolve([{ ref: 'ignore', kind: 'ignore', source: 'staff' }]).state === 'ignore', 'not for CDS');
}

// ---------- database ----------
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));`);
const SQL = strip(readFileSync(ROOT + '/comm_center.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'comm_center.sql runs twice');
// step 2 (2026-10-22): run twice too; a changed owner survives a second run
const SQL2 = strip(readFileSync(ROOT + '/comm_center_step2.sql', 'utf8'));
await pg.exec(SQL2);
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{owners,other}', '"samantha@mo-care.com"') where key='comm_center'`);
await pg.exec(SQL2);
{
  const v = (await pg.query(`select value from cds_match_settings where key='comm_center'`)).rows[0].value;
  ok(v.owners.enrollment === 'zach@mo-care.com' && v.owners.pay === 'samantha@mo-care.com' && v.owners.concern === 'samantha@mo-care.com' && v.owners.not_sure === 'zach@mo-care.com',
     'step 2: her approved owners, Zach for all but Pay and Concern');
  ok(v.owners.other === 'samantha@mo-care.com', 'running step 2 again never undoes an owner changed on the Switches page');
  ok(v.live === false && v.people.length === 2, 'still practice; Samantha and Zach can own cards');
  await pg.query(`update cds_match_settings set value = jsonb_set(value, '{owners,other}', '"zach@mo-care.com"') where key='comm_center'`);
}
const s0 = (await pg.query(`select value from cds_match_settings where key='comm_center'`)).rows[0].value;
ok(s0.live === false && s0.history_days === 30, 'starts in practice, 30 days of history');
for (const role of ['anon', 'authenticated']) {
  for (const t of ['cds_phone_book', 'cds_comms', 'cds_tasks']) {
    const g = (await pg.query(`select has_table_privilege($1, $2, 'select') s, has_table_privilege($1, $2, 'insert') i`, [role, 'public.' + t])).rows[0];
    ok(!g.s && !g.i, role + ' cannot read or write ' + t);
  }
}
const AG = 'caring-companions-cds';
const put = (k, v) => pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1,$2,$3::jsonb) on conflict (agency_id, data_key) do update set data_value=excluded.data_value`, [AG, k, JSON.stringify(v)]);
await put('consumers', [{ id: 'c1', name: 'Ruth Caldwell', phone: '(417) 555-0131', status: 'Active' }]);
await put('pipeline', [{ id: 'l2', name: 'Tom Hensley', phone: '4175550188', siteLeadId: 'sl2', fromWebsite: true, status: 'new' },
  { id: 'l3', name: 'Ruth Caldwell', phone: '4175550131', referral: { responsiblePartyName: 'Lena', responsiblePartyRelationship: 'Daughter', responsiblePartyPhone: '4175550177' } }]);
await put('attendants', [{ id: 'a1', name: 'Marcus Webb', phone: '4175550144', consumer: 'Ruth Caldwell' }]);
await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone, status) values ($1,'Bev','Carter','(417) 555-0166','new')`, [AG]);
await pg.query(`insert into cds_match_settings (key, value) values ('lead_alerts', $1::jsonb) on conflict (key) do update set value=excluded.value`,
  [JSON.stringify({ recipients: [{ name: 'Krystal', email: 'krystal@mo-care.com', phone: '4175550100' }] })]);
// a Caregiver Match to-do already on the list
await pg.query(`insert into cds_tasks (kind, title, dedupe_key) values ('cg_signup', 'Call Pat', 'cg:1')`);

// ---------- fake GoHighLevel ----------
const T0 = Date.parse('2026-10-22T13:00:00Z');   // 8am Central
let NOW = T0;
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{cards_from}', to_jsonb($1::text)) where key='comm_center'`, [new Date(T0 - 3600000).toISOString()]);
const convs = new Map();   // id -> { conv, messages[] }
let ghlDown = false;
const at = mins => new Date(T0 + mins * 60000).toISOString();
function say(phone, name, m) {
  const id = 'cv-' + phone;
  if (!convs.has(id)) convs.set(id, { conv: { id, phone, fullName: name, contactId: 'ct-' + phone }, messages: [] });
  const c = convs.get(id);
  c.messages.push(m);
  c.conv.lastMessageDate = Math.max(c.conv.lastMessageDate || 0, Date.parse(m.dateAdded));
}
let n = 0;
const call = (phone, name, mins, dir, status, secs, user) => say(phone, name, { id: 'c' + (++n), messageType: 'TYPE_CALL', direction: dir, dateAdded: at(mins), userId: user, meta: { call: { duration: secs, status } } });
const text = (phone, name, mins, dir, body, user) => say(phone, name, { id: 't' + (++n), messageType: 'TYPE_SMS', direction: dir, dateAdded: at(mins), body, userId: user });
const db = { query: async (t, p) => ({ rows: (await pg.query(t, p)).rows }) };
const comms = C.createComms({
  db, now: () => NOW,
  ghl: {
    async users() { return [{ id: 'u-k', name: 'Krystal Smith' }, { id: 'u-s', firstName: 'Samantha', lastName: 'Troutman' }]; },
    async conversations(since) { if (ghlDown) throw new Error('GoHighLevel 503'); return [...convs.values()].map(c => c.conv).filter(c => c.lastMessageDate >= since).sort((a, b) => b.lastMessageDate - a.lastMessageDate); },
    async messages(id, since) { return convs.get(id).messages.filter(m => Date.parse(m.dateAdded) >= since).filter(m => Date.parse(m.dateAdded) <= NOW); },
    async contact(id) { contactLookups++; if (CONTACTS[id] && CONTACTS[id].throw) throw new Error('GoHighLevel 403 on /contacts/' + id + ': no'); return CONTACTS[id] || {}; },
  },
});
const CONTACTS = {}; let contactLookups = 0;
const open = async () => (await pg.query(`select * from cds_tasks where area='followup' and done_at is null order by created_at`)).rows;
const tick = async mins => { NOW = T0 + mins * 60000; return comms.run(); };

// an old call from before cards_from: saved for history, no card
call('4175550131', 'Ruth Caldwell', -120, 'inbound', 'no-answer', 0);
// Ruth misses us; Krystal calls from her own cell (staff): no card
call('4175550131', 'Ruth Caldwell', 52, 'inbound', 'voicemail', 41);
call('4175550100', 'Krystal', 53, 'inbound', 'no-answer', 0);
// Tom (lead) calls and Samantha answers: no card
call('4175550188', 'Tom Hensley', 54, 'inbound', 'completed', 300, 'u-s');
// unknown number
call('4175550190', '', 55, 'inbound', 'no-answer', 0);
let r = await tick(60);
ok(r.ok && r.saved === 5, 'saved 5 calls (the old one included)');
let o = await open();
eq(o.map(t => t.title + '|' + t.kind).sort(), ['Ruth Caldwell|followup', 'Unknown number|who_is_this'], 'cards: Ruth, and Who is this');
const ruth = o.find(t => t.title === 'Ruth Caldwell');
ok(ruth.person_ref === 'consumer:c1' && ruth.owner === 'zach@mo-care.com' && ruth.need === 'not_sure' && ruth.need_by === 'hub',
   'Ruth is the consumer; a missed call with no words is Not sure yet, so Zach owns it (step 2)');
ok(/Voicemail, 41 seconds/.test(ruth.events[0].text) && ruth.events.length === 1, 'the old missed call is not on the card');
ok((await pg.query(`select count(*)::int n from cds_comms where staff_name='Samantha Troutman'`)).rows[0].n === 1, 'who on our team answered');

// same run again: nothing doubles
r = await tick(61);
ok(r.saved === 0 && (await open()).length === 2 && (await pg.query('select count(*)::int n from cds_comms')).rows[0].n === 5, 'running again saves nothing twice');

// Lena (family) texts: waits 10 quiet minutes, then joins Ruth's... no: Lena is her own number, her own card
text('4175550177', 'Lena', 62, 'inbound', 'Mom says Marcus is sick today');
r = await tick(65);
ok(!(await open()).some(t => t.phone10 === '4175550177'), 'a text waits 10 quiet minutes');
r = await tick(73);
const lena = (await open()).find(t => t.phone10 === '4175550177');
ok(lena && lena.title === 'Lena' && lena.person_ref === 'family:consumer:c1' && /Marcus is sick/.test(lena.events[0].text), 'then a card for Lena, as Ruth\'s family');

// Krystal calls Ruth back, no answer: stays open with the try on it
call('4175550131', 'Ruth Caldwell', 75, 'outbound', 'no-answer', 0, 'u-k');
await tick(76);
let rt = (await open()).find(t => t.phone10 === '4175550131');
ok(rt && rt.events.some(e => e.kind === 'tried' && /Krystal Smith/.test(e.text)), 'a call back with no answer goes on the card and it stays open');
// then texts her: closes
text('4175550131', 'Ruth Caldwell', 78, 'outbound', 'Calling you in 5 minutes', 'u-k');
await tick(79);
ok(!(await open()).some(t => t.phone10 === '4175550131'), 'texting them back closes it');
const closedR = (await pg.query(`select * from cds_tasks where phone10='4175550131' and area='followup'`)).rows[0];
ok(closedR.closed_reason === 'texted' && closedR.done_by === 'Krystal Smith', 'closed: texted, by Krystal Smith');

// a new missed call after the close opens a new card
call('4175550131', 'Ruth Caldwell', 90, 'inbound', 'no-answer', 0);
await tick(91);
rt = (await open()).filter(t => t.phone10 === '4175550131');
ok(rt.length === 1 && rt[0].events.length === 1 && /No voicemail/.test(rt[0].events[0].text), 'a new missed call after a close is a new card with only that call');
// and a second missed call joins it
call('4175550131', 'Ruth Caldwell', 95, 'inbound', 'voicemail', 12);
await tick(96);
rt = (await open()).filter(t => t.phone10 === '4175550131');
ok(rt.length === 1 && rt[0].events.length === 2, 'another missed call joins the open card');
// an answered call with her closes it
call('4175550131', 'Ruth Caldwell', 100, 'inbound', 'completed', 200, 'u-k');
await tick(101);
ok(!(await open()).some(t => t.phone10 === '4175550131'), 'talking to them closes it');

// texts: "ok" makes no card; an answered text makes no card
text('4175550144', 'Marcus Webb', 110, 'inbound', 'Ok!');
await tick(125);
ok(!(await open()).some(t => t.phone10 === '4175550144'), '"ok" makes no card');
text('4175550144', 'Marcus Webb', 126, 'inbound', 'Can I swap Tuesday for Wednesday?');
text('4175550144', 'Marcus Webb', 128, 'outbound', 'Yes that works', 'u-s');
await tick(140);
ok(!(await open()).some(t => t.phone10 === '4175550144'), 'a text we answered makes no card');

// Who is this: the list, then a pick
const people = (await comms.people()).people;
ok(people.some(p => p.ref === 'pool:' + (people.find(x => x.name === 'Bev Carter') || {}).ref?.split(':')[1]) && people.some(p => p.name === 'Ruth Caldwell'), 'the pick list has everyone');
ok(!people.some(p => p.ref.startsWith('staff:')), 'the pick list leaves out our team');
const bev = people.find(p => p.name === 'Bev Carter');
await comms.pick('samantha@mo-care.com', { phone10: '4175550190', ref: bev.ref, family: false });
let w = (await open()).find(t => t.phone10 === '4175550190');
ok(w.kind === 'followup' && w.title === 'Bev Carter' && w.person_ref === bev.ref, 'after a pick the card is Bev\'s');
await tick(141);
w = (await open()).find(t => t.phone10 === '4175550190');
ok(w.kind === 'followup' && w.title === 'Bev Carter', 'and stays Bev\'s after the next run');
ok((await pg.query(`select count(*)::int n from cds_audit where action='comm_pick'`)).rows[0].n === 1, 'the pick is in the audit log');
let threw = false; try { await comms.pick('x', { phone10: '4175550190', ref: 'consumer:nobody' }); } catch (e) { threw = e instanceof C.CommsError; }
ok(threw, 'cannot pick someone who is not in the hub');
// not for CDS
call('4175550199', '', 142, 'inbound', 'no-answer', 0);
await tick(143);
await comms.pick('samantha@mo-care.com', { phone10: '4175550199', ref: 'ignore' });
ok(!(await open()).some(t => t.phone10 === '4175550199'), 'Not for CDS closes it');
call('4175550199', '', 150, 'inbound', 'no-answer', 0);
await tick(151);
ok(!(await open()).some(t => t.phone10 === '4175550199'), 'and that number makes no more cards');

// Done by hand
const lenaId = (await open()).find(t => t.phone10 === '4175550177').id;
await comms.done('krystal@mo-care.com', { id: lenaId });
ok(!(await open()).some(t => t.id === lenaId), 'Done closes it');
threw = false; try { await comms.done('krystal@mo-care.com', { id: lenaId }); } catch (e) { threw = true; }
ok(threw, 'Done twice says it is already closed');

// the queue the page reads
const qv = await comms.queue();
ok(qv.live === false && qv.state.last_run && qv.caregiverListTodos === 1, 'queue: practice, last run, and the Caregiver List to-do count');
ok(qv.cards.every(c => c.contactId), 'every card links to the GoHighLevel contact');
ok(qv.closedToday.length >= 3, 'closed today are listed');

// history on Ruth's profile includes Lena's text, marked family
const h = await comms.history(['consumer:c1'], ['(417) 555-0131']);
ok(h.items.some(i => i.phone10 === '4175550177' && i.family) && h.items.some(i => i.phone10 === '4175550131'), 'Ruth\'s calls and texts include Lena\'s, marked family');
ok(h.items.length === 8, 'every call and text for Ruth and Lena, the old one too (' + h.items.length + ')');
const hb = await comms.history([], ['4175550144']);
ok(hb.items.length === 3, 'history by phone alone');
ok((await comms.history(['staff:x'])).items.length === 0, 'cannot ask for our team\'s calls');
// reached: Tom talked to Samantha, so the Leads page counts him as called
const reached = (await comms.reached()).map(r => r.phone10);
ok(reached.includes('4175550188') && !reached.includes('4175550190'), 'reached: talked, texted, or we called; a missed call to us is not');
ok(reached.includes('4175550131'), 'a call back with no answer counts as called (her point 10-22)');
const rh = await comms.handle('x@y', { action: 'reached' });
ok(Array.isArray(rh.phones) && rh.last['4175550188'], 'the page gets the phones and when');
ok(rh.talk['4175550188'] && !rh.talk['4175550190'], 'and the last answered call, for a talk just before a lead came in');

// the Caregiver Match to-do list leaves follow-ups out
const handlers = readFileSync(ROOT + '/supabase/functions/_shared/match/handlers.js', 'utf8');
ok((handlers.match(/coalesce\(t?\.?area, 'match'\) = 'match'/g) || []).length >= 2 && /coalesce\(area, 'match'\) = 'match'`, \[id, s\]/.test(handlers), 'Caregiver Match tasks, its count and its Done leave follow-ups alone');
const cm = (await pg.query(`select count(*)::int n from cds_tasks t where t.done_at is null and coalesce(t.area, 'match') = 'match'`)).rows[0].n;
ok(cm === 1, 'Caregiver Match still sees only its own to-do');

// a GoHighLevel failure is saved, not swallowed
ghlDown = true;
threw = false; try { await tick(160); } catch (e) { threw = true; }
const st = (await pg.query(`select value->'state' s from cds_match_settings where key='comm_center'`)).rows[0].s;
ok(threw && /503/.test(st.last_error), 'a failed read is saved for the page to show');
ghlDown = false;
await tick(165);
ok((await pg.query(`select value->'state'->>'last_error' e from cds_match_settings where key='comm_center'`)).rows[0].e === null, 'and cleared on the next good run');

// a first read that runs out of time keeps what it has and does not get stuck
{
  const slow = C.createComms({ db, now: () => NOW, budgetMs: -1,
    ghl: { users: async () => [], conversations: async () => [...convs.values()].map(c => c.conv), messages: async (id) => convs.get(id).messages } });
  const before = (await pg.query(`select value->'state'->>'read_until' r from cds_match_settings where key='comm_center'`)).rows[0].r;
  NOW = T0 + 170 * 60000;
  const rr = await slow.pull(await slow.settings());
  const st2 = (await pg.query(`select value->'state' s from cds_match_settings where key='comm_center'`)).rows[0].s;
  ok(rr.partial && st2.history_partial === true && st2.read_until > before, 'out of time: says history is partial and moves on');
}

// a conversation with no phone: the number comes from the GoHighLevel contact (seen live 10-22: 8 of 55)
{
  CONTACTS['ct-nophone'] = { id: 'ct-nophone', phone: '+1 417-555-0131' };
  CONTACTS['ct-empty'] = { id: 'ct-empty' };
  convs.set('cv-np', { conv: { id: 'cv-np', contactId: 'ct-nophone', fullName: 'Ruth', lastMessageDate: Date.parse(at(170)) }, messages: [
    { id: 'np1', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: at(170), contactId: 'ct-nophone', meta: { call: { duration: 0, status: 'no-answer' } } },
    { id: 'np2', messageType: 'TYPE_SMS', direction: 'inbound', dateAdded: at(170), contactId: 'ct-nophone', body: 'Please call me' }] });
  convs.set('cv-np2', { conv: { id: 'cv-np2', contactId: 'ct-empty', lastMessageDate: Date.parse(at(170)) }, messages: [
    { id: 'np3', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: at(170), contactId: 'ct-empty', meta: { call: { duration: 0, status: 'no-answer' } } }] });
  contactLookups = 0;
  const rr = await tick(171);
  const saved = (await pg.query(`select id, phone10 from cds_comms where id in ('np1','np2','np3') order by id`)).rows;
  ok(saved.length === 3 && saved[0].phone10 === '4175550131' && saved[1].phone10 === '4175550131', 'no phone on the conversation: the contact\'s number is used');
  ok(saved[2].phone10 === null, 'a call with no number anywhere is still saved, not dropped');
  ok(rr.fromContact === 2 && rr.skipped === 1, 'counted: 2 from the contact, 1 still without a number (' + rr.fromContact + '/' + rr.skipped + ')');
  ok(rr.noNumber.contact_no_phone === 1 && rr.noNumber.kinds['call inbound'] === 1, 'and why: the contact has no phone; it was an incoming call');
  ok(contactLookups === 2, 'each contact is looked up once per run (' + contactLookups + ')');
  ok((await open()).some(t => t.phone10 === '4175550131' && t.events.some(e => e.id === 'np1')), 'and it makes a follow-up on the right person');
}
// rescan: something the reader missed earlier is picked up by a one-time re-read
{
  say('4175550144', 'Marcus Webb', { id: 'late1', messageType: 'TYPE_SMS', direction: 'inbound', dateAdded: at(100), body: 'missed by the first read' });
  NOW = T0 + 175 * 60000;
  let rr = await comms.run();
  ok(!(await pg.query(`select 1 from cds_comms where id='late1'`)).rows.length, 'a normal run only looks back 15 minutes');
  rr = await comms.run({ rescan: true });
  ok((await pg.query(`select 1 from cds_comms where id='late1'`)).rows.length === 1 && rr.saved === 1, 'a rescan reads the whole window again and saves only what is new');
}

// hidden numbers: a card for each missed call or real text, never dropped; the reason is counted
{
  convs.set('cv-anon', { conv: { id: 'cv-anon', lastMessageDate: Date.parse(at(180)) }, messages: [
    { id: 'an1', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: at(180), meta: { call: { duration: 20, status: 'voicemail' } } },
    { id: 'an2', messageType: 'TYPE_SMS', direction: 'inbound', dateAdded: at(181), body: 'thanks' }] });
  convs.set('cv-403', { conv: { id: 'cv-403', contactId: 'ct-403', lastMessageDate: Date.parse(at(182)) }, messages: [
    { id: 'an3', messageType: 'TYPE_SMS', direction: 'inbound', dateAdded: at(182), contactId: 'ct-403', body: 'Who do I call about my check?' }] });
  CONTACTS['ct-403'] = { throw: true };
  let rr = await tick(183);
  ok(rr.noNumber.no_contact === 2 && rr.noNumber.contact_no_phone === 1 && rr.noNumber.lookup_failed['403'] === 1,
     'reasons counted: no contact, contact has no phone, lookup refused (403) ' + JSON.stringify(rr.noNumber));
  const st = (await pg.query(`select value->'state'->'last_no_number' n from cds_match_settings where key='comm_center'`)).rows[0].n;
  ok(st && st.no_contact === 2, 'the reasons are saved for the page and the next report');
  ok(!(await open()).some(t => t.kind === 'hidden_number' && t.events[0].id === 'an3'), 'a text with no number also waits 10 quiet minutes');
  await tick(195);
  const hid = (await open()).filter(t => t.kind === 'hidden_number');
  eq(hid.map(t => t.events[0].id).sort(), ['an1', 'an3', 'np3'], 'hidden-number cards: the voicemail, the real text and the earlier call; "thanks" makes none');
  ok(hid.find(t => t.events[0].id === 'an1').events[0].text === 'Missed call from a hidden number. Voicemail, 20 seconds.', 'hidden voicemail wording');
  ok(/^Text with no number: "Who do I call/.test(hid.find(t => t.events[0].id === 'an3').events[0].text), 'hidden text wording');
  await tick(196);
  ok((await open()).filter(t => t.kind === 'hidden_number').length === 3, 'running again makes no duplicates');
  const qv = await comms.queue();
  const card = qv.cards.find(c => c.kind === 'hidden_number' && c.events[0].id === 'np3');
  ok(card && card.name === 'Hidden number' && card.contactId === 'ct-empty' && card.phone10 === null, 'the queue shows it with a link to the GoHighLevel contact');
  ok(qv.cards.find(c => c.events[0].id === 'an1').conversationId === 'cv-anon', 'or to the conversation when there is no contact');
  // an answered call in the same conversation closes it; Done closes the others
  convs.get('cv-anon').messages.push({ id: 'an4', messageType: 'TYPE_CALL', direction: 'inbound', dateAdded: at(197), meta: { call: { duration: 90, status: 'completed' } } });
  convs.get('cv-anon').conv.lastMessageDate = Date.parse(at(197));
  await tick(198);
  ok(!(await open()).some(t => t.kind === 'hidden_number' && t.events[0].id === 'an1'), 'a later answered call in the same conversation closes it');
  await comms.done('krystal@mo-care.com', { id: hid.find(t => t.events[0].id === 'an3').id });
  ok(!(await open()).some(t => t.kind === 'hidden_number' && t.events[0].id === 'an3'), 'Done closes a hidden-number card');
  await tick(200);
  ok(!(await open()).some(t => t.events[0] && t.events[0].id === 'an3'), 'and it does not come back');
}

// ---------- step 2: need, owner, care or safety, later, check-in calls ----------
{
  // the words (her approved list)
  const tx = t => [{ kind: 'text', text: 'Texted: "' + t + '"', at: at(0) }];
  eq(C.guessNeed('lead', []), 'enrollment', 'a lead is Enrollment');
  eq(C.guessNeed('applicant', tx('my check')), 'enrollment', 'an applicant is Enrollment, whatever the words');
  eq(C.guessNeed('attendant', tx('My check was short this week')), 'pay', '"check" is Pay');
  eq(C.guessNeed('attendant', tx('The app will not let me clock in')), 'evv', '"clock" or "app" is Clock-in & EVV');
  eq(C.guessNeed('consumer', tx('My attendant did not come today')), 'attendant_change', '"did not come" is Attendant change');
  eq(C.guessNeed('consumer', tx('I want to make a complaint')), 'concern', '"complaint" is Concern or complaint');
  eq(C.guessNeed('consumer', tx('Can I get more hours?')), 'hours', '"hours" is Hours & care plan');
  eq(C.guessNeed('consumer', [{ kind: 'missed', text: 'Missed call. No voicemail.', at: at(0) }]), 'not_sure', 'a missed call with no words is Not sure yet');
  const nowMs = Date.parse(at(10));
  eq(C.urgentWhy('consumer', tx('My attendant did not come today and nobody is here for lunch'), nowMs), 'The text says "did not come".', 'care or safety words, said back on the card');
  for (const w of ['no show', 'nobody is here', 'fell', 'hospital', '911', 'hurt', 'no food'])
    ok(C.urgentWhy('family', tx('Mom ' + w + ' today'), nowMs) !== '', 'care or safety word: ' + w);
  ok(/cannot clock in/.test(C.urgentWhy('attendant', tx('The app will not let me clock in'), nowMs)), 'an attendant who cannot clock in today is care or safety');
  eq(C.urgentWhy('attendant', [{ kind: 'text', text: 'Texted: "app will not clock me in"', at: at(-24 * 60) }], nowMs), '', 'but not a day later');
  eq(C.urgentWhy('consumer', tx('What time is my shift?'), nowMs), '', 'ordinary words are not');
  ok(C.NEEDS.length === 8 && !/—/.test(JSON.stringify(C.NEEDS)), 'eight needs, no em dashes');

  // on real cards
  text('4175550144', 'Marcus Webb', 210, 'inbound', 'The app will not let me clock in');
  text('4175550177', 'Lena', 211, 'inbound', 'Mom fell this morning, she is ok but sore');
  call('4175550188', 'Tom Hensley', 212, 'inbound', 'no-answer', 0);
  await tick(225);
  const by = async ph => (await open()).find(t => t.phone10 === ph);
  let mc = await by('4175550144'), lc = await by('4175550177'), tc = await by('4175550188');
  ok(mc.need === 'evv' && mc.urgent && /cannot clock in/.test(mc.urgent_why) && mc.owner === 'zach@mo-care.com', 'Marcus: Clock-in & EVV, care or safety, Zach');
  ok(lc.urgent && lc.urgent_why === 'The text says "fell".' && lc.need === 'not_sure', 'Lena: care or safety because the text says "fell"');
  ok(tc.need === 'enrollment' && !tc.urgent && tc.owner === 'zach@mo-care.com', 'Tom the lead: Enrollment, Zach');

  // a person's choice wins, and the hub never changes it back
  await comms.setNeed('samantha@mo-care.com', { id: tc.id, need: 'pay' });
  tc = await by('4175550188');
  ok(tc.need === 'pay' && tc.need_by === 'samantha@mo-care.com' && tc.owner === 'samantha@mo-care.com', 'changing the need moves the owner to that need\'s owner');
  await comms.setOwner('samantha@mo-care.com', { id: tc.id, owner: '' });
  await comms.setNeed('samantha@mo-care.com', { id: tc.id, need: 'evv' });
  tc = await by('4175550188');
  ok(tc.owner === null && tc.owner_by === 'samantha@mo-care.com' && tc.need === 'evv', 'an owner a person picked (here Nobody yet) stays when the need changes');
  await comms.setUrgent('samantha@mo-care.com', { id: lc.id, on: false });
  await comms.setUrgent('zach@mo-care.com', { id: tc.id, on: true });
  await tick(230);
  lc = await by('4175550177'); tc = await by('4175550188');
  ok(!lc.urgent && lc.urgent_by === 'samantha@mo-care.com', '"Not care or safety" stays, even with the words still on the card');
  ok(tc.urgent && tc.urgent_why === 'Marked care or safety by Zach.' && tc.need === 'evv' && tc.owner === null, 'a person can mark one; the next run changes none of it');
  let threw = false; try { await comms.setOwner('x', { id: tc.id, owner: 'stranger@x.com' }); } catch (e) { threw = e instanceof C.CommsError; }
  ok(threw, 'only Samantha or Zach can own a card');
  threw = false; try { await comms.setNeed('x', { id: tc.id, need: 'lunch' }); } catch (e) { threw = e instanceof C.CommsError; }
  ok(threw, 'only a need from the list');

  // later this week
  const tomorrow = C.chicagoDay(NOW + 86400000);
  await comms.setLater('zach@mo-care.com', { id: mc.id, date: tomorrow });
  let q2 = await comms.queue();
  ok(q2.cards.find(c => c.id === mc.id).later === tomorrow && q2.today === C.chicagoDay(NOW), 'moved to tomorrow; the page knows Missouri\'s today');
  for (const bad of [C.chicagoDay(NOW), C.chicagoDay(NOW + 20 * 86400000), 'soon']) {
    threw = false; try { await comms.setLater('x', { id: mc.id, date: bad }); } catch (e) { threw = e instanceof C.CommsError; }
    ok(threw, 'a later day must be after today and within two weeks: ' + bad);
  }
  text('4175550144', 'Marcus Webb', 232, 'inbound', 'Still cannot get in, please call');
  await tick(245);
  ok((await by('4175550144')).later_until === null, 'a new text brings a moved card back to today');
  await comms.setLater('zach@mo-care.com', { id: mc.id, date: tomorrow });
  await comms.setLater('zach@mo-care.com', { id: mc.id, date: null });
  ok((await by('4175550144')).later_until === null, '"Back to today" clears it');

  // what the page gets
  q2 = await comms.queue();
  const tv = q2.cards.find(c => c.id === tc.id), lv = q2.cards.find(c => c.id === lc.id);
  ok(q2.needs.length === 8 && q2.people.map(p => p.name).join() === 'Samantha,Zach', 'the page gets the needs and who can own a card');
  ok(tv.needLabel === 'Clock-in & EVV' && tv.needByHub === false && tv.urgent && tv.urgentWhy === 'Marked care or safety by Zach.', 'card: need label, who picked it, why it is care or safety');
  ok(lv.needByHub === true && lv.urgent === false && lv.urgentWhy === '', 'card: a hub-picked need, not care or safety');
  for (const a of ['comm_need', 'comm_owner', 'comm_urgent', 'comm_later'])
    ok((await pg.query(`select count(*)::int n from cds_audit where action=$1`, [a])).rows[0].n >= 1, 'recorded in the audit log: ' + a);

  // the check-in tap: answered calls of 3 minutes or more with a consumer or their family
  call('4175550177', 'Lena', 250, 'outbound', 'completed', 240, 'u-k');
  call('4175550131', 'Ruth Caldwell', 252, 'inbound', 'completed', 120, 'u-s');
  await tick(255);
  const ci = await comms.checkins();
  ok(ci.month === '2026-10' && ci.calls.length === 1, 'one consumer, once, newest call (Ruth: ' + ci.calls.length + ')');
  const rc = ci.calls[0];
  ok(rc.consumerId === 'c1' && rc.name === 'Ruth Caldwell' && rc.family && rc.whoName === 'Lena' && rc.who === 'Daughter of Ruth Caldwell' && rc.minutes === 4 && rc.staff === 'Krystal Smith' && rc.day === '2026-10-22',
     'Lena\'s 4 minute call counts for Ruth, marked family; the 2 minute call does not');
  ok(!ci.calls.some(x => x.name === 'Tom Hensley'), 'a lead\'s call is never a check-in');
  ok((await pg.query(`select data_value from agency_data where data_key='consumers'`)).rows[0].data_value[0].contacts === undefined, 'listing calls records no check-in');

  // Who owns each need, on the Switches page
  const sw = SW.createSwitches({ db, now: () => NOW });
  const l = await sw.list('zach@mo-care.com');
  ok(!l.canChange && l.needOwners.needs.length === 8 && l.needOwners.needs.find(n => n.key === 'pay').owner === 'samantha@mo-care.com', 'everyone sees who owns each need');
  threw = false; try { await sw.setNeedOwner('zach@mo-care.com', 'pay', 'zach@mo-care.com'); } catch (e) { threw = e.status === 403; }
  ok(threw, 'only Samantha changes it');
  const m = await sw.handle('samantha@mo-care.com', { action: 'set_need_owner', need: 'pay', owner: 'zach@mo-care.com' });
  ok(m.message === 'Done. New Pay cards go to Zach.', 'her change, said back: ' + m.message);
  ok((await sw.list('x')).needOwners.needs.find(n => n.key === 'pay').owner === 'zach@mo-care.com', 'saved');
  ok((await pg.query(`select count(*)::int n from cds_audit where action='need_owner'`)).rows[0].n === 1, 'and recorded');
  threw = false; try { await sw.setNeedOwner('samantha@mo-care.com', 'pay', 'stranger@x.com'); } catch (e) { threw = true; }
  ok(threw, 'only someone from the list');
  await sw.setNeedOwner('samantha@mo-care.com', 'pay', 'samantha@mo-care.com');
  const v = (await pg.query(`select value from cds_match_settings where key='comm_center'`)).rows[0].value;
  ok(v.live === false && v.state && v.state.last_run, 'changing an owner leaves the switch and the job\'s state alone');

  // nothing in step 2 sends anything
  const src = readFileSync(ROOT + '/supabase/functions/_shared/office/comms.js', 'utf8');
  ok(!/fetch\(|sendMessage|sms|ghl\.send/i.test(src.slice(src.indexOf('step 2: what a person can change'), src.indexOf('async function audit'))), 'the step 2 actions only write the hub\'s own cards');
}

// ---------- Today and the switch ----------
{
  const steps = R.dailyRoutine({ consumers: [], pipeline: [], followups: [{ name: 'Ruth Caldwell', since: at(52) }] }, new Date(T0));
  const s4 = steps.find(s => s.n === 4);
  ok(s4.items.some(i => /1 call or text to follow up/.test(i.t) && i.go === 'followups'), 'Today step 4 lists follow-ups once handed in');
  ok(!R.dailyRoutine({ consumers: [], pipeline: [] }, new Date(T0)).find(s => s.n === 4).items.length, 'and says nothing when not live');
  const s4b = R.dailyRoutine({ consumers: [], pipeline: [], followups: [
    { name: 'Ruth Caldwell', since: at(52), urgent: true, owner: 'Zach' }, { name: 'Tom Hensley', since: at(60), owner: 'Samantha' },
    { name: 'June Pruitt', since: at(60), later: '2099-01-01' }] }, new Date(T0)).find(s => s.n === 4);
  const ui = s4b.items.find(i => /care or safety/.test(i.t)), oi = s4b.items.find(i => /to follow up/.test(i.t));
  ok(ui && ui.t === '1 care or safety call or text today' && ui.people[0].name === 'Ruth Caldwell (Zach)' && s4b.items.indexOf(ui) < s4b.items.indexOf(oi), 'Today: care or safety first, with whose it is');
  ok(oi && oi.t === '1 call or text to follow up' && !oi.people.some(p => /June/.test(p.name)), 'a card moved to a later day waits for that day');
  const sw = SW.SWITCHES.find(x => x.key === 'comm_center');
  ok(sw && sw.field === 'live' && !/—/.test(sw.does({}) + sw.on + sw.off), 'the switch is on the Switches page, no em dashes');
}

// ---------- the hub page ----------
{
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  ok(html.includes('id="page-followups"') && /followups: 'today'/.test(html), 'Follow-ups page, in the Today section (#followups)');
  ok(/if \(id === 'followups'\) renderFollowups\(true\);/.test(html), 'opening it loads it');
  const a = html.indexOf('// COMMUNICATION CENTER, step 1'), b = html.indexOf('function convertToConsumer(');
  const code = html.slice(a, b);
  ok(a > 0 && !/—/.test(code), 'no em dashes in the new page code');
  ok(/firstShiftOf, followups: commForToday\(\)/.test(html), 'Today gets follow-ups only through commForToday (live only)');
  ok(/_comm\.live/.test(code), 'commForToday checks live');
  ok(/data-refs="lead:' \+ esc\(p\.id\)/.test(html) && /data-refs="consumer:' \+ esc\(c\.id\)/.test(html), 'calls and texts on lead and consumer profiles');
  const hp = readFileSync(ROOT + '/caregiver-match/hub-packet.js', 'utf8');
  ok((hp.match(/cds-comm-history/g) || []).length === 2 && /hub-packet\.js\?v=8/.test(html), 'and on both attendant cards');
  ok(/&& !c\.fromComms\) : \[\];/.test(html), 'the lead profile\'s logged calls leave out the ones read from GoHighLevel');
  const a2 = html.indexOf('// ---- Step 2: need, owner, care or safety'), b2 = html.indexOf('// "Calls and texts" on a profile');
  ok(a2 > 0 && b2 > a2 && !/—/.test(html.slice(a2, b2)) && !/—/.test(html.slice(html.indexOf('function needOwnersHtml'), html.indexOf('async function swNeedOwner'))), 'step 2 page code: no em dashes');
  ok(/id="fuTiles"/.test(html) && /id="fuCheckins"/.test(html) && /id="fuFilters"/.test(html), 'step 2: tiles, check-in panel and filters on the page');
  ok(/onchange="fuSet\(\\'' \+ id \+ '\\',\\'set_need\\'/.test(html) && /'urgent',\{on:/.test(html.replace(/\\'/g, "'")), 'cards change need, owner and care or safety through the server');
  ok(/id="clm_from"/.test(html) && /document\.getElementById\('clm_from'\)\.style\.display = 'none';/.test(html), 'the check-in form says when it was filled in from a call, and forgets it next time');
  ok(/openContactLog\(c\.id, ongoingRequirements\(c\)\.monthly\.thisMonth\)/.test(html) && !/contacts\[[^\]]*\] *=/.test(html.slice(a2, b2)), 'the check-in tap opens the existing form and never saves a check-in itself');
  ok(/action: 'set_need_owner'/.test(html), 'Who owns each need on the Switches page');
  ok(!/sendMessage|\/conversations\/messages'/.test(readFileSync(ROOT + '/supabase/functions/cds-comms/index.ts', 'utf8')), 'the server function never sends');
  ok(!/method: 'POST'|method: "POST"/.test(readFileSync(ROOT + '/supabase/functions/cds-comms/index.ts', 'utf8').split('Deno.serve')[0]), 'it only reads GoHighLevel (no POST to it)');
}

console.log(pass + ' passed, ' + failN + ' failed');
if (failN) process.exit(1);
