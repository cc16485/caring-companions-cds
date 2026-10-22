// CDS Communication & Follow-Up Center, step 2 (2026-10-22): needs, owners, how soon, "Make a
// follow-up" and the Today line, end to end on a local Postgres copy with a fake GoHighLevel and a
// fake clock. Runs the real SQL and the real job code; nothing leaves this machine.
//   PGLITE=/path/to/pglite/dist/index.js node tests/comm_center_step2_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgPath = process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pgPath);
const C = await import(ROOT + '/supabase/functions/_shared/office/comms.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const throws = async (f, re, m) => { let e = null; try { await f(); } catch (x) { e = x; } ok(e instanceof C.CommsError && (!re || re.test(e.message)), m + (e ? ' (' + e.message + ')' : ' (no error)')); };

// ---------- pure parts ----------
ok(C.NEEDS.map(n => n.label).join('|') === 'Enrollment|Clock-in & EVV|Pay|Attendant change|Hours & care plan|Concern or complaint|Other', 'the needs from her design, in order');
ok(C.needLabel(null) === 'Not sure yet' && C.needLabel('evv') === 'Clock-in & EVV', 'no need reads Not sure yet');
ok(C.defaultNeed('lead') === 'enrollment' && C.defaultNeed('applicant') === 'enrollment' && C.defaultNeed('consumer') === null && C.defaultNeed('attendant') === null, 'only leads and applicants start with a need');
ok(C.ownerFor({ evv: 'Zach', not_sure: 'Samantha' }, 'evv') === 'Zach' && C.ownerFor({ not_sure: 'Samantha' }, 'pay') === 'Samantha' && C.ownerFor({}, 'pay') === null, 'owner: the need, else Not sure yet, else nobody');
ok(Object.keys(C.URGENCY).join() === 'urgent,today,week' && C.URGENCY.urgent === 'Care or safety today', 'how soon: three levels');

// ---------- database ----------
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));`);
await pg.exec(strip(readFileSync(ROOT + '/comm_center.sql', 'utf8')));
// a card from step 1, before the new columns
await pg.query(`insert into cds_tasks (kind, title, area, phone10, events, due_at, dedupe_key) values ('followup', 'Old card', 'followup', '4175550111', '[{"id":"x","at":"2026-10-22T12:00:00Z","kind":"missed","text":"Missed call. No voicemail."}]'::jsonb, '2026-10-22T12:00:00Z', 'fu:old')`);
const SQL2 = strip(readFileSync(ROOT + '/comm_center_step2.sql', 'utf8'));
await pg.exec(SQL2); await pg.exec(SQL2);
ok(true, 'comm_center_step2.sql runs twice');
const cols = (await pg.query(`select column_name from information_schema.columns where table_name='cds_tasks' and column_name in ('urgency','owner_by')`)).rows.length;
ok(cols === 2, 'urgency and owner_by added');
let threwSql = false; try { await pg.query(`update cds_tasks set urgency='soon' where dedupe_key='fu:old'`); } catch (e) { threwSql = true; }
ok(threwSql, 'the database refuses a made-up urgency');
for (const role of ['anon', 'authenticated']) {
  const g = (await pg.query(`select has_table_privilege($1, 'public.cds_tasks', 'select') s`, [role])).rows[0];
  ok(!g.s, role + ' still cannot read cds_tasks');
}

const AG = 'caring-companions-cds';
const put = (k, v) => pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1,$2,$3::jsonb) on conflict (agency_id, data_key) do update set data_value=excluded.data_value`, [AG, k, JSON.stringify(v)]);
await put('consumers', [{ id: 'c1', name: 'Ruth Caldwell', phone: '(417) 555-0131', status: 'Active' }]);
await put('pipeline', [{ id: 'l2', name: 'Tom Hensley', phone: '4175550188', status: 'new' }]);
await put('attendants', [{ id: 'a1', name: 'Marcus Webb', phone: '4175550144', consumer: 'Ruth Caldwell' }]);
const setting = (k, v) => pg.query(`insert into cds_match_settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value=excluded.value`, [k, JSON.stringify(v)]);
await setting('lead_alerts', { recipients: [{ name: 'Samantha Troutman', email: 's@x' }, { name: 'Krystal Smith', email: 'k@x' }, { name: 'Zach', email: 'z@x' }] });
await setting('packet_alerts', { recipients: [{ name: 'Zach Troutman', email: 'z@x' }] });
await setting('switch_owners', ['samantha@mo-care.com']);

const T0 = Date.parse('2026-10-22T13:00:00Z');
let NOW = T0;
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{cards_from}', to_jsonb($1::text)) where key='comm_center'`, [new Date(T0 - 3600000).toISOString()]);
const convs = new Map();
const at = mins => new Date(T0 + mins * 60000).toISOString();
function say(phone, name, m) {
  const id = 'cv-' + phone;
  if (!convs.has(id)) convs.set(id, { conv: { id, phone, fullName: name, contactId: 'ct-' + phone }, messages: [] });
  const c = convs.get(id); c.messages.push(m);
  c.conv.lastMessageDate = Math.max(c.conv.lastMessageDate || 0, Date.parse(m.dateAdded));
}
let n = 0;
const call = (phone, name, mins, dir, status, secs, user) => { const id = 'c' + (++n); say(phone, name, { id, messageType: 'TYPE_CALL', direction: dir, dateAdded: at(mins), userId: user, meta: { call: { duration: secs, status } } }); return id; };
const text = (phone, name, mins, dir, body, user) => { const id = 't' + (++n); say(phone, name, { id, messageType: 'TYPE_SMS', direction: dir, dateAdded: at(mins), body, userId: user }); return id; };
const db = { query: async (t, p) => ({ rows: (await pg.query(t, p)).rows }) };
const comms = C.createComms({
  db, now: () => NOW,
  ghl: {
    async users() { return [{ id: 'u-k', name: 'Krystal Smith' }]; },
    async conversations(since) { return [...convs.values()].map(c => c.conv).filter(c => c.lastMessageDate >= since); },
    async messages(id, since) { return convs.get(id).messages.filter(m => Date.parse(m.dateAdded) >= since && Date.parse(m.dateAdded) <= NOW); },
    async contact() { return {}; },
  },
});
const open = async () => (await pg.query(`select * from cds_tasks where area='followup' and done_at is null order by created_at`)).rows;
const card = async phone => (await open()).find(t => t.phone10 === phone);
const tick = async mins => { NOW = T0 + mins * 60000; return comms.run(); };

// new cards: a lead starts as Enrollment, a consumer as Not sure yet; both "today"
call('4175550188', 'Tom Hensley', 10, 'inbound', 'no-answer', 0);
call('4175550131', 'Ruth Caldwell', 11, 'inbound', 'voicemail', 30);
call('4175550190', '', 12, 'inbound', 'no-answer', 0);
await tick(15);
let tom = await card('4175550188'), ruth = await card('4175550131'), unk = await card('4175550190');
ok(tom.need === 'enrollment' && tom.urgency === 'today' && tom.owner === null, 'lead card: Enrollment, today, Nobody yet');
ok(ruth.need === null && ruth.urgency === 'today', 'consumer card: Not sure yet, today');
ok(unk.need === null && unk.kind === 'who_is_this', 'unknown number: no need');

// the queue shows the new fields, and an old step 1 card reads as today
let qv = await comms.queue('krystal@mo-care.com');
ok(qv.cards.find(c => c.name === 'Old card' || c.phone10 === '4175550111').urgency === 'today', 'an old card with no urgency reads as today');
ok(qv.cards.find(c => c.phone10 === '4175550188').needLabel === 'Enrollment', 'the queue has the need label');
ok(qv.needs.length === 7 && qv.urgency.week === 'This week', 'the queue has the needs and how soon');
ok(qv.ownerChoices.join() === 'Samantha,Krystal,Zach', 'owner choices: first names from the alert lists, once each (' + qv.ownerChoices.join() + ')');
ok(qv.canSetOwners === false && (await comms.queue('Samantha@mo-care.com')).canSetOwners === true, 'only the switch owner can set owners');

// Switches page: owners per need
await throws(() => comms.setOwners('krystal@mo-care.com', { owners: { enrollment: 'Zach' } }), /Only Samantha/, 'Krystal cannot change who owns each need');
await throws(() => comms.setOwners('samantha@mo-care.com', { owners: { enrollment: 'Bob' } }), /Pick an owner/, 'an owner must be one of the office people');
let r = await comms.setOwners('samantha@mo-care.com', { owners: { enrollment: 'Zach', concern: 'Samantha', not_sure: 'Krystal', made_up: 'Zach' } });
const s1 = (await pg.query(`select value->'owners' o from cds_match_settings where key='comm_center'`)).rows[0].o;
ok(JSON.stringify(Object.entries(s1).sort()) === JSON.stringify(Object.entries({ enrollment: 'Zach', concern: 'Samantha', not_sure: 'Krystal' }).sort()), 'owners saved, a made-up need dropped');
tom = await card('4175550188'); ruth = await card('4175550131');
ok(tom.owner === 'Zach' && ruth.owner === 'Krystal' && r.moved === 4, 'open cards moved: Tom to Zach (Enrollment), the rest to Krystal (Not sure yet) (' + r.moved + ')');
ok((await pg.query(`select count(*)::int n from cds_audit where action='comm_owners'`)).rows[0].n === 1, 'owners change is in the audit log');

// one tap on a card
await comms.change('krystal@mo-care.com', { id: ruth.id, need: 'concern' });
ruth = await card('4175550131');
ok(ruth.need === 'concern' && ruth.owner === 'Samantha' && !ruth.owner_by, 'changing the need moves it to that need\'s owner');
await comms.change('krystal@mo-care.com', { id: ruth.id, urgency: 'urgent' });
ruth = await card('4175550131');
ok(ruth.urgency === 'urgent', 'moved up to Care or safety today');
await comms.change('krystal@mo-care.com', { id: ruth.id, owner: 'Krystal' });
ruth = await card('4175550131');
ok(ruth.owner === 'Krystal' && ruth.owner_by === 'krystal@mo-care.com', 'owner picked by hand');
await comms.change('krystal@mo-care.com', { id: ruth.id, need: 'evv' });
ruth = await card('4175550131');
ok(ruth.need === 'evv' && ruth.owner === 'Krystal', 'a hand-picked owner stays when the need changes');
await comms.setOwners('samantha@mo-care.com', { owners: { enrollment: 'Zach', not_sure: 'Samantha' } });
ok((await card('4175550131')).owner === 'Krystal', 'and stays when owners change on Switches');
ok((await card('4175550190')).owner === 'Samantha', 'while a card nobody picked by hand moves');
await comms.change('krystal@mo-care.com', { id: ruth.id, owner: '' });
ok((await card('4175550131')).owner === null, 'owner can be set back to Nobody yet');
await throws(() => comms.change('k', { id: ruth.id, urgency: 'soon' }), /how soon/, 'a made-up urgency is refused');
await throws(() => comms.change('k', { id: ruth.id, need: 'gossip' }), /needs/, 'a made-up need is refused');
await throws(() => comms.change('k', { id: ruth.id, owner: 'Bob' }), /owner/, 'a made-up owner is refused');
await throws(() => comms.change('k', { id: ruth.id }), /Nothing/, 'nothing to change says so');
ok((await pg.query(`select count(*)::int n from cds_audit where action='comm_change'`)).rows[0].n === 5, 'every change is in the audit log');

// the 5-minute job leaves need, owner and urgency alone
call('4175550131', 'Ruth Caldwell', 20, 'inbound', 'no-answer', 0);
await tick(21);
ruth = await card('4175550131');
ok(ruth.urgency === 'urgent' && ruth.need === 'evv' && ruth.events.length === 2, 'a new missed call joins the card and keeps what staff set');

// Who is this: picking a lead gives the card Enrollment and its owner
await comms.pick('samantha@mo-care.com', { phone10: '4175550190', ref: 'lead:l2', family: false });
unk = await card('4175550190');
ok(unk.need === 'enrollment' && unk.owner === 'Zach', 'picked as a lead: Enrollment, Zach');

// Make a follow-up from a call we talked on
const talk = call('4175550144', 'Marcus Webb', 30, 'inbound', 'completed', 240, 'u-k');
await tick(31);
ok(!(await card('4175550144')), 'a call we talked on makes no card by itself');
r = await comms.make('krystal@mo-care.com', { commId: talk, need: 'pay', note: 'Check his hours from last week' });
let marcus = await card('4175550144');
ok(r.ok && marcus && marcus.need === 'pay' && marcus.urgency === 'week' && /Check his hours/.test(marcus.events[0].text), 'Make a follow-up: Pay, this week, the note on it');
ok(marcus.owner === 'Samantha' && marcus.title === 'Marcus Webb' && marcus.person_ref === 'attendant:a1', 'owned by the Not sure yet owner (no Pay owner), and it is Marcus');
await tick(35);
ok((await card('4175550144')).id === marcus.id, 'the next run keeps it open (the call was before the note)');
text('4175550144', 'Marcus Webb', 40, 'outbound', 'Your hours look right', 'u-k');
await tick(41);
ok(!(await card('4175550144')), 'texting him back closes it');
await throws(() => comms.make('k', { commId: 'nope' }), /no number/, 'cannot make one from a call that is not saved');

// a note joins an open card and never moves it down
const t2 = text('4175550131', 'Ruth Caldwell', 50, 'inbound', 'ok');
await tick(65);
r = await comms.make('krystal@mo-care.com', { commId: t2, note: 'She will call back after lunch' });
ruth = await card('4175550131');
ok(r.joined && ruth.urgency === 'urgent' && ruth.events.some(e => e.kind === 'note'), 'joining keeps Care or safety today and adds the note');
ok((await pg.query(`select count(*)::int n from cds_tasks where area='followup' and phone10='4175550131' and done_at is null`)).rows[0].n === 1, 'still one card for Ruth');

// handle() routes the new actions
r = await comms.handle('krystal@mo-care.com', { action: 'change', id: tom.id, urgency: 'week' });
ok(r.ok && (await card('4175550188')).urgency === 'week', 'handle: change');
await throws(() => comms.handle('krystal@mo-care.com', { action: 'owners', owners: {} }), /Only Samantha/, 'handle: owners is owner-only');

// Today and the 8am email say how many are care or safety today
const src = readFileSync(ROOT + '/supabase/functions/_shared/office/cds-rules.js', 'utf8');
ok(/care or safety today/.test(src), 'the Today line names care or safety today');
const la = readFileSync(ROOT + '/supabase/functions/_shared/office/lead-alerts.js', 'utf8');
ok(/due_at as since, urgency from cds_tasks/.test(la), 'the 8am email reads how soon');
if (typeof R.dailyRoutine === 'function') {
  const out = R.dailyRoutine({ consumers: [], pipeline: [], attendants: [], followups: [{ name: 'Ruth', since: at(0), urgency: 'urgent' }, { name: 'Tom', since: at(0), urgency: 'today' }] }, new Date(T0));
  const all = JSON.stringify(out);
  ok(/2 calls and texts to follow up, 1 care or safety today/.test(all), 'Today: "2 calls and texts to follow up, 1 care or safety today"');
  const out2 = R.dailyRoutine({ consumers: [], pipeline: [], attendants: [], followups: [{ name: 'Tom', since: at(0), urgency: 'today' }] }, new Date(T0));
  ok(/1 call or text to follow up"/.test(JSON.stringify(out2)), 'no urgent: the line is as before');
} else ok(false, 'CDSRules.dailyRoutine is there');

// the hub page
const html = readFileSync(ROOT + '/index.html', 'utf8');
ok(/cds-rules\.js\?v=9/.test(html), 'the hub loads the new rules (v=9)');
ok(/id="fuTiles"/.test(html) && /id="fuFilters"/.test(html), 'Follow-ups has tiles and filters');
ok(/function fuCheckinTile/.test(html) && /A call only counts if you record it/.test(html), 'the check-ins tile, kept apart');
ok(/Record as the ' \+ esc\(month\) \+ ' check-in/.test(html) && /if \(_clm_commId\) log\.commId = _clm_commId/.test(html), 'the check-in tap opens the form and the saved form remembers the call');
ok(/_clm_commId = null;/.test(html), 'opening the form any other way does not link a call');
ok(/if \(!c\.urgency\) c\.urgency = 'today'/.test(html), 'before the server update, cards with no urgency still show (as today)');
ok(/id="needOwnersCard"/.test(html) && /action: 'owners'/.test(html), 'Switches has who gets each follow-up');
const added = html.slice(html.indexOf('/* Step 2 (2026-10-22)'), html.indexOf('/* Consumer profile */'));
ok(!/—/.test(added), 'no em dashes in the new styles');
for (const f of [ROOT + '/supabase/functions/_shared/office/comms.js', ROOT + '/comm_center_step2.sql']) ok(!/—/.test(readFileSync(f, 'utf8')), 'no em dashes in ' + path.basename(f));

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
