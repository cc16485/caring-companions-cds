// Voicemail to lead (2026-11-13, Samantha: "voicemail to lead"). End to end on a local Postgres copy
// with a fake GoHighLevel, a fake Claude and a fake clock: a voicemail that sounds like a new lead is
// added to Leads by itself, once, and nothing new is sent to anyone. Nothing leaves this machine.
//   PGLITE=/path/to/pglite/dist/index.js node tests/voicemail_to_lead_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const C = await import(ROOT + '/supabase/functions/_shared/office/comms.js');
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const V = await import(ROOT + '/supabase/functions/_shared/office/lead-from-voicemail.js');
await import(ROOT + '/supabase/functions/_shared/office/cds-rules.js');
const R = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- pure parts ----------
{
  const v = { comm_id: 'm1', at: '2026-11-13T16:33:00Z', phone10: '7195550146', contact_name: '+17195550146', ghl_contact_id: 'ct-1',
    note: 'Kim called about CDS care for her mother — call her back.', people: [{ name: 'Kim', relation: 'daughter', phone: '' }],
    answers: { who: 'family', first: 'Rose', last: 'Hart', county: 'Greene', medicaid: 'yes', cds: 'move', agency: 'Other Agency' } };
  const row = V.voicemailRow(v, '2026-11-13T16:40:00Z');
  eq([row.full_name, row.phone, row.county, row.from_kind, row.from_id, row.form_name, row.ghl_contact_id, row.submitted_at],
    ['Rose Hart', '+17195550146', 'Greene', 'voicemail', 'm1', 'CDS line: left a voicemail', 'ct-1', '2026-11-13T16:33:00.000Z'], 'the row: named for the person who needs care, dated when they called');
  eq(row.form_answers, [['Who they are', 'Left a voicemail on the CDS line'], ['Voicemail was on', 'Fri, Nov 13, 10:33 AM'],
    ['What they said', 'Kim called about CDS care for her mother, call her back.'], ['Who called', 'Family or a friend'], ['County', 'Greene'],
    ['Medicaid', 'Yes'], ['CDS now', 'With another agency: Other Agency'], ['People named', 'Kim (daughter)']], 'what the office reads');
  ok(!/[—–]/.test(row.message), 'no em dashes');
  eq([row.alert_at, row.alert_texted_at, row.reminder_at], ['2026-11-13T16:40:00Z', '2026-11-13T16:40:00Z', '2026-11-13T16:40:00Z'], 'no second alert, text or reminder about it');
  eq(V.voicemailRow({ ...v, answers: {}, people: [] }, 'x').full_name, 'Voicemail from (719) 555-0146', 'no name said: named by the number, not "Website enquiry"');
  eq(V.voicemailRow({ ...v, answers: {}, contact_name: 'Kim Hart' }, 'x').full_name, 'Kim Hart', 'a name GoHighLevel already has is used');
  ok(V.voicemailRow({ ...v, phone10: '' }, 'x') === null, 'a hidden number is never a lead row (phone or email required)');
  eq(R.formLabel({ form: { name: row.form_name } }, true), 'Left a voicemail', 'the small tag on the Leads list');
}

// ---------- database ----------
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  create table evv_submissions (id uuid primary key default gen_random_uuid(), agency_id text, processed bool default false, submitted_at timestamptz default now(),
    consumer text, attendant text, visitdate date, sig_attendant text, sig_consumer text);`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8')));   // the phone book reads cds_packets (2026-11-05)
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_link.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_forms.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/comm_center.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/comm_center_step2.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/call_notes.sql', 'utf8')));
const VM_SQL = strip(readFileSync(ROOT + '/voicemail_leads.sql', 'utf8'));
await pg.exec(VM_SQL);
await pg.exec(strip(readFileSync(ROOT + '/call_answers.sql', 'utf8')));   // cds_call_notes.answers (2026-11)
await pg.exec(VM_SQL); await pg.exec(VM_SQL);

// people: phones only in the setting lead_alerts (never in the repo)
await pg.query(`update cds_match_settings set value = value || $1::jsonb where key='lead_alerts'`, [JSON.stringify({ live: true, recipients: [
  { name: 'Samantha', email: 'samantha@mo-care.com', phone: '+14175550001' }, { name: 'Krystal', email: 'krystal@mo-care.com', phone: '+14175550002' },
  { name: 'Zach', email: 'zach@caringcds.com', phone: '+14175550003' }] })]);
const T0 = Date.parse('2026-10-29T16:33:00Z');   // Thu 11:33am Central, her call
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{cards_from}', to_jsonb($1::text)) where key='comm_center'`, [new Date(T0 - 864e5).toISOString()]);
const AG = 'caring-companions-cds';
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1,'consumers',$2::jsonb), ($1,'pipeline',$3::jsonb)`, [AG,
  JSON.stringify([{ id: 'c1', name: 'Ruth Ellis', status: 'Active', phone: '4175550200' }]),
  JSON.stringify([{ id: 'l1', name: 'Dana Fox', status: 'new', phone: '4175550300' }])]);

// ---------- fake GoHighLevel and Claude ----------
let NOW = T0;
const convs = new Map(); let n = 0;
const at = mins => new Date(T0 + mins * 60000).toISOString();
function call(phone, mins, secs, status = 'voicemail', dir = 'inbound') {
  const id = 'cv-' + phone;
  if (!convs.has(id)) convs.set(id, { conv: { id, phone, contactId: 'ct-' + phone }, messages: [] });
  const c = convs.get(id), m = { id: 'm' + (++n), messageType: 'TYPE_CALL', direction: dir, dateAdded: at(mins), userId: 'u-z', contactId: 'ct-' + phone, meta: { call: { duration: secs, status } } };
  c.messages.push(m); c.conv.lastMessageDate = Math.max(c.conv.lastMessageDate || 0, Date.parse(m.dateAdded));
  return m.id;
}
const TRANSCRIPTS = {}; const aiCalls = [];
const say = (id, words) => { TRANSCRIPTS[id] = [{ sentenceIndex: 0, mediaChannel: 1, transcript: words }]; };
const comms = C.createComms({
  db: { query: async (t, p) => ({ rows: (await pg.query(t, p)).rows }) }, now: () => NOW,
  ghl: {
    async users() { return [{ id: 'u-z', name: 'Zach Troutman' }]; },
    async conversations(since) { return [...convs.values()].map(c => c.conv).filter(c => c.lastMessageDate >= since); },
    async messages(id, since) { return convs.get(id).messages.filter(m => Date.parse(m.dateAdded) >= since && Date.parse(m.dateAdded) <= NOW); },
    async transcript(id) { if (!(id in TRANSCRIPTS)) throw new Error('GoHighLevel 404 on /transcription'); return TRANSCRIPTS[id]; },
  },
  ai: async req => {
    aiCalls.push(req);
    const lead = /care for my mother|sign up/i.test(req.messages[0].content);
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ about_person: true, new_lead: lead,
      note: lead ? 'Kim called about CDS care for her mother in Greene County. Call her back.' : 'Ruth called about her hours.', call_back: '', people: [] }) }] };
  },
});
const sent = []; let sendFails = false;
const jobs = LA.createLeadAlerts({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW,
  async send(m) { if (sendFails) throw new Error('GoHighLevel 500: down'); sent.push(m); } });
const note = async id => (await pg.query(`select * from cds_call_notes where comm_id=$1`, [id])).rows[0];
const outbox = async () => (await pg.query(`select * from cds_outbox where template='voicemail_lead_text' order by created_at, to_display`)).rows;
const tick = async mins => { NOW = T0 + mins * 60000; return comms.run(); };
const leads = async () => (await pg.query(`select * from site_leads where from_kind='voicemail' order by submitted_at`)).rows;
const txt = `select count(*)::int n from cds_outbox where template <> 'voicemail_lead_text'`;
const TO_SQL = strip(readFileSync(ROOT + '/voicemail_to_lead.sql', 'utf8'));

// ---------- before the start time is set: nothing is added ----------
const old = call('7195550100', 0, 100); say(old, 'Calling about care for my mother through CDS.');
let r = await tick(6);
ok(r.ok && r.voicemailLeads === 1 && r.leadsAdded === 0 && (await leads()).length === 0, 'not started: read as a lead, not added: ' + JSON.stringify(r));

// ---------- started ----------
await pg.exec(TO_SQL);
const since1 = (await pg.query(`select value->>'to_leads_since' s from cds_match_settings where key='voicemail_leads'`)).rows[0].s;
await pg.exec(TO_SQL);
const since2 = (await pg.query(`select value->>'to_leads_since' s from cds_match_settings where key='voicemail_leads'`)).rows[0].s;
ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(since1) && since1 === since2, 'voicemail_to_lead.sql sets the start once, running it twice changes nothing');
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{to_leads_since}', to_jsonb($1::text)) where key='voicemail_leads'`, [at(8)]);
r = await tick(9);
ok(r.leadsAdded === 0 && (await leads()).length === 0, 'a voicemail from before the start is left alone');

const kim = call('7195550146', 10, 100);  say(kim, 'Hi, my name is Kim, I am calling about getting care for my mother through CDS. Please call me back.');
const ruth = call('4175550200', 11, 60);  say(ruth, 'This is Ruth, sign up question about my hours.');   // a consumer
const dana = call('4175550300', 12, 45);  say(dana, 'Dana again, I want to sign up for CDS.');            // already on Leads
r = await tick(16);
let ls = await leads();
ok(r.leadsAdded === 1 && r.leadsAlready === 1 && ls.length === 1, 'one new lead added; the one already on Leads is not added twice: ' + JSON.stringify(r));
const L = ls[0];
eq([L.phone, L.from_id, L.form_name, L.full_name, L.ghl_contact_id, L.archived], ['+17195550146', kim, 'CDS line: left a voicemail', 'Voicemail from (719) 555-0146', 'ct-7195550146', false],
  'her row: the number, the call, linked to the GoHighLevel contact that already exists');
ok(/What they said: Kim called about CDS care/.test(L.message), 'what the voicemail said is on the lead');
ok(new Date(L.submitted_at).getTime() === T0 + 10 * 60000, 'the wait clock starts when they called');
r = await tick(21);
ok(r.leadsAdded === 0 && (await leads()).length === 1, 'never twice');

// the lead job: the voicemail text is the only message
const before = (await pg.query(txt)).rows[0].n;
let j = await jobs.run();
ok(j.ok && j.emailed === 0 && j.texted === 0 && j.reminded === 0 && (await pg.query(txt)).rows[0].n === before, 'no lead email, text or reminder for a voicemail lead: ' + JSON.stringify(j));
ok(j.voicemailTexted >= 1, 'the voicemail text still goes (practice here)');
NOW += 3 * 3600000; j = await jobs.run();
ok(j.reminded === 0 && (await pg.query(txt)).rows[0].n === before, 'still nothing hours later');

// the Hub: waiting until someone calls
ok(R.siteLeadWaiting(L, [], []) === true, 'shows as waiting for a call');
ok(R.siteLeadName(L) === 'Voicemail from (719) 555-0146', 'named in the 8am email');

// a second voicemail from the same number, and a hidden number
const again = call('7195550146', (NOW - T0) / 60000 + 1, 50); say(again, 'Kim again about care for my mother.');
NOW += 6 * 60000; r = await comms.run();
ok(r.leadsAdded === 0 && r.leadsAlready === 2 && (await leads()).length === 1, 'the same caller again is not a second lead (2 = her and the one already on Leads)');
await pg.query(`update cds_comms set phone10 = null where id = $1`, [again]);
r = await comms.run();
ok((await leads()).length === 1, 'a hidden number is left to its Follow-ups card');

// the Hub import words
const html = readFileSync(ROOT + '/index.html', 'utf8');
ok(/r\.from_kind === 'voicemail' \? 'Voicemail on the CDS line'/.test(html), 'the Hub names the source');

console.log('\nvoicemail to lead: ' + pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
