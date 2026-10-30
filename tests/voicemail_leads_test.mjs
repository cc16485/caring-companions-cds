// Voicemail leads (2026-10-29, Samantha: "build the voicemail lead text in practice with that wording,
// Samantha and Zach only"). End to end on a local Postgres copy with a fake GoHighLevel, a fake Claude
// and a fake clock: a voicemail is read, a new lead texts Samantha and Zach a private link, the link page
// shows it. Nothing leaves this machine.
//   PGLITE=/path/to/pglite/dist/index.js node tests/voicemail_leads_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const C = await import(ROOT + '/supabase/functions/_shared/office/comms.js');
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const { createLeadLink } = await import(ROOT + '/supabase/functions/_shared/office/lead-link.js');
const SW = await import(ROOT + '/supabase/functions/_shared/office/switches.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const K = s => String(s ?? '').replace(/\?k=[0-9A-Za-z]{16}\b/g, '?k=KKK');

// ---------- pure parts ----------
{
  const T = Date.parse('2026-10-29T16:33:00Z');
  eq(LA.voicemailText(T, T + 6 * 60000, 'hub.caringcds.com/lead/?k=abc'), 'New CDS lead left a voicemail at 11:33am. Open to hear it and call back: hub.caringcds.com/lead/?k=abc', 'her approved words, same day');
  eq(LA.voicemailText(Date.parse('2026-10-29T22:30:00Z'), Date.parse('2026-10-30T14:00:00Z'), 'x'), 'New CDS lead left a voicemail at 5:30pm Thu. Open to hear it and call back: x', 'next morning says the day');
  ok(!/[—–]/.test(LA.voicemailText(T, T, 'x')), 'no em dashes');
  const req = C.noteRequest({ who: '', role: '', detail: '', day: '2026-10-29', weekday: 'Thursday', direction: 'inbound', staff: '', minutes: 2, transcript: 'hi', voicemail: true });
  ok(/left this voicemail/.test(req.messages[0].content) && !/2 minutes/.test(req.messages[0].content), 'Claude is told it is a voicemail');
  ok(C.NOTE_SCHEMA.required.includes('new_lead') && /new_lead: true only when/.test(req.system), 'the answer says whether it is a new lead');
  const txt = j => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(j) }] });
  ok(C.cleanNote(txt({ about_person: true, new_lead: true, note: 'x', call_back: '', people: [] }), '2026-10-29').newLead === true, 'new lead read');
  ok(C.cleanNote(txt({ about_person: true, note: 'x', call_back: '', people: [] }), '2026-10-29').newLead === false, 'missing means not a lead');
  const sw = SW.SWITCHES.find(s => s.key === 'voicemail_leads');
  ok(sw && /Samantha and Zach get a text/.test(sw.does({ emails: ['samantha@mo-care.com', 'zach@caringcds.com'] })), 'a switch on the Switches page, naming who gets the text');
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
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_link.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/comm_center.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/comm_center_step2.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/call_notes.sql', 'utf8')));
const VM_SQL = strip(readFileSync(ROOT + '/voicemail_leads.sql', 'utf8'));
await pg.exec(VM_SQL); await pg.exec(VM_SQL);
ok(true, 'voicemail_leads.sql runs twice');
const vs0 = (await pg.query(`select value from cds_match_settings where key='voicemail_leads'`)).rows[0].value;
eq([vs0.live, vs0.since, vs0.emails], [false, '2026-10-29T16:00:00Z', ['samantha@mo-care.com', 'zach@caringcds.com']], 'starts in practice, from this morning, Samantha and Zach');
let bad = null; try { await pg.query(`insert into cds_lead_links (token_hash, person_name, person_email, expires_at) values ('x','a','a',now())`); } catch (e) { bad = e; }
ok(bad, 'a link is for a lead or a voicemail, never neither');

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

// ---------- her call ----------
const kim = call('7193081546', 0, 100);   say(kim, 'Hi, my name is Kim, I am calling about getting care for my mother through CDS. Please call me back.');
const ruth = call('4175550200', 1, 60);   say(ruth, 'This is Ruth, sign up question about my hours.');   // a consumer: never a new lead
const dana = call('4175550300', 2, 45);   say(dana, 'Dana again, I want to sign up for CDS.');            // a website lead calling: counts
const beep = call('4175550400', 3, 15);   say(beep, 'care for my mother');                                 // hung up at the beep
const talk = call('4175550500', 4, 300, 'completed'); say(talk, 'care for my mother');                     // answered, call_notes off
const quiet = call('4175550600', 5, 40);                                                                   // no words from GoHighLevel
const early = call('4175550700', -60, 50); say(early, 'care for my mother');                               // 10:33am, before "since"

let r = await tick(6);
ok(r.ok && r.voicemailLeads === 2, 'two voicemails read as new leads: ' + JSON.stringify(r));
const nk = await note(kim);
ok(nk && nk.voicemail && nk.new_lead && nk.status === 'waiting' && /Kim called about CDS care/.test(nk.note), 'her 11:33 voicemail: read, a new lead');
ok(/left this voicemail/.test(aiCalls[0].messages[0].content) && /an unknown number/.test(aiCalls[0].messages[0].content), 'Claude was told it is a voicemail from an unknown number');
const nr = await note(ruth);
ok(nr && nr.voicemail && !nr.new_lead && nr.person_ref === 'consumer:c1', 'a consumer\'s voicemail gets a note, never a lead text');
ok((await note(dana)).new_lead === true, 'a lead already on Leads who leaves a voicemail counts');
ok(!(await note(beep)) && !(await note(talk)) && !(await note(early)), 'too short, answered while call notes are off, and before this morning: not read');
ok(!(await note(quiet)), 'no words yet: waits');

// texts: in office hours, Samantha and Zach only, practice
r = await jobs.run();
ok(r.voicemailTexted === 2 && sent.length === 0, 'two voicemails texted, in practice nothing is sent: ' + JSON.stringify(r));
let ob = await outbox();
eq(ob.map(o => [o.status, o.to_display.slice(-2), K(o.body)]), [
  ['practice', '01', 'New CDS lead left a voicemail at 11:33am. Open to hear it and call back: hub.caringcds.com/lead/?k=KKK'],
  ['practice', '03', 'New CDS lead left a voicemail at 11:33am. Open to hear it and call back: hub.caringcds.com/lead/?k=KKK'],
  ['practice', '01', 'New CDS lead left a voicemail at 11:35am. Open to hear it and call back: hub.caringcds.com/lead/?k=KKK'],
  ['practice', '03', 'New CDS lead left a voicemail at 11:35am. Open to hear it and call back: hub.caringcds.com/lead/?k=KKK'],
], 'her words, to Samantha (01) and Zach (03), not Krystal');
ok(!ob.some(o => /7193081546|308-1546|Kim/.test(o.body)), 'no number or name in the text');
r = await jobs.run();
ok(r.voicemailTexted === 0 && (await outbox()).length === 4, 'never twice');

// ---------- the link page ----------
const tokenFor = async () => {
  // the test cannot read a link from the fingerprint, so make one the same way the job does
  const t = LA.newToken();
  await pg.query(`insert into cds_lead_links (token_hash, comm_id, person_name, person_email, expires_at) values ($1,$2,'Zach','zach@caringcds.com',$3)`,
    [await LA.tokenHash(t), kim, new Date(NOW + 7 * 864e5).toISOString()]);
  return t;
};
ok((await pg.query(`select count(*)::int n from cds_lead_links where comm_id=$1`, [kim])).rows[0].n === 2, 'one private link per person for her voicemail');
const k = await tokenFor();
const played = [];
const link = createLeadLink({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW,
  ghl: { appUrl: p => 'https://app.example' + p, contactUrl: async () => null, texts: async () => ({ ok: true, messages: [] }) },
  recording: async id => { played.push(id); return 'audio'; } });
let v = await link.handle({ k, action: 'view' });
eq([v.kind, v.me, v.name, v.came_in, v.open_minutes], ['voicemail', 'Zach', '(719) 308-1546', '11:33am Thu', 6], 'the page: whose, from which number, when, nobody has called back');
ok(/Kim called about CDS care/.test(v.note) && /calling about getting care/.test(v.transcript) && v.unread === '', 'what they said and their words');
eq(v.contact_url, 'https://app.example/contacts/detail/ct-7193081546', 'call them in GoHighLevel');
ok(v.can_listen && !v.can_ring, 'Listen on; Ring only with the call bridge');
ok((await link.recording(k)) === 'audio' && played[0] === kim, 'Listen plays that one voicemail');
let e = null; try { await link.handle({ k, action: 'called', outcome: 'connected' }); } catch (x) { e = x; }
ok(e && /GoHighLevel/.test(e.message), 'nothing to log here: call back from GoHighLevel');
const leadK = LA.newToken();
await pg.query(`insert into site_leads (id, agency_id, first_name, phone, submitted_at, archived) values ('11111111-1111-1111-1111-111111111111',$1,'Mary','4175550900',now(),true)`, [AG]);
await pg.query(`insert into cds_lead_links (token_hash, site_lead_id, person_name, person_email, expires_at) values ($1,'11111111-1111-1111-1111-111111111111','Zach','zach@caringcds.com',$2)`,
  [await LA.tokenHash(leadK), new Date(NOW + 864e5).toISOString()]);
e = null; try { await link.recording(leadK); } catch (x) { e = x; }
ok(e && e.status === 404, 'a website lead link never plays a recording');
ok((await link.handle({ k: leadK, action: 'view' })).name === 'Mary', 'website lead links still work');

// Zach calls her back: the page says so, and her follow-up card shows what she said
call('7193081546', 20, 180, 'completed', 'outbound');
await tick(21);
v = await link.handle({ k, action: 'view' });
ok(v.back.length === 1 && v.back[0].what === 'Talked' && v.back[0].by === 'Zach Troutman' && v.open_minutes === null, 'called back shows on the page');

// ---------- follow-up cards and red lines ----------
const kimCard = (await pg.query(`select * from cds_tasks where area='followup' and phone10='4175550300'`)).rows[0];
let qv = await comms.handle('zach@caringcds.com', { action: 'queue' });
const dc = qv.cards.find(c => c.id === kimCard.id);
ok(dc && /Kim called about CDS care/.test(dc.voicemailNote) && dc.newLead, 'the card shows what the voicemail said');
ok(qv.voicemailProblems.length === 0, 'no red lines yet (the quiet one is still waiting for words)');
await tick(40);   // 35 minutes after the quiet voicemail
ok((await note(quiet)).status === 'no_transcript', 'no words after 30 minutes says so');
qv = await comms.handle('zach@caringcds.com', { action: 'queue' });
eq(qv.voicemailProblems.map(p => [p.phone10, p.why]), [['4175550600', 'GoHighLevel has no words for this voicemail. Listen to it.']], 'red line on Today until someone calls back');
let m = await jobs.morning({ force: true });
const mail = (await pg.query(`select body from cds_outbox where template='morning_email' order by created_at desc limit 1`)).rows[0];
ok(m.ok && mail && /1 voicemail could not be read or its text did not send. Listen to it/.test(mail.body), 'in the 8am email too');
call('4175550600', 41, 0, 'no-answer', 'outbound');
call('4175550600', 42, 0, 'completed', 'outbound');   // GoHighLevel's outbound call that connected
convs.get('cv-4175550600').messages.at(-1).meta.call.duration = 90;
await tick(43);
qv = await comms.handle('zach@caringcds.com', { action: 'queue' });
ok(qv.voicemailProblems.length === 0, 'the red line goes once they are called back');

// ---------- after hours, called back first, live, failures ----------
NOW = Date.parse('2026-10-29T22:30:00Z');   // 5:30pm Thu
const late = call('4175551000', (NOW - T0) / 60000, 70); say(late, 'Calling about care for my mother.');
NOW += 5 * 60000; await comms.run();
r = await jobs.run();
ok(r.voicemailWaitingForHours && (await outbox()).length === 4, 'after 4pm: no text yet');
const back = call('4175551100', (NOW - T0) / 60000, 60); say(back, 'care for my mother');
NOW += 5 * 60000; await comms.run();
call('4175551100', (NOW - T0) / 60000 + 1, 0, 'no-answer', 'outbound');   // Zach tried them back that evening
NOW += 3 * 60000; await comms.run();
NOW = Date.parse('2026-10-30T14:00:00Z');   // Fri 9am
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{live}', 'true') where key='voicemail_leads'`);
r = await jobs.run();
ok(r.voicemailTexted === 1 && r.voicemailCalledBack === 1 && r.voicemailLive, '9am: one text, one skipped because someone already called: ' + JSON.stringify(r));
eq(sent.map(s => [s.to, K(s.text)]), [
  ['+14175550001', 'New CDS lead left a voicemail at 5:30pm Thu. Open to hear it and call back: hub.caringcds.com/lead/?k=KKK'],
  ['+14175550003', 'New CDS lead left a voicemail at 5:30pm Thu. Open to hear it and call back: hub.caringcds.com/lead/?k=KKK']], 'live: sent to Samantha and Zach');
ok((await note(back)).lead_text_skipped === 'called back before the text', 'the skip is recorded');
sendFails = true;
NOW += 10 * 60000;
const fail = call('4175551200', (NOW - T0) / 60000, 60); say(fail, 'care for my mother');
NOW += 5 * 60000; await comms.run();
r = await jobs.run();
const nf = await note(fail);
ok(/text to Samantha \(GoHighLevel 500: down\); text to Zach/.test(nf.lead_alert_failed), 'a text that did not send is written down: ' + nf.lead_alert_failed);
qv = await comms.handle('zach@caringcds.com', { action: 'queue' });
ok(qv.voicemailProblems.some(p => p.phone10 === '4175551200' && /did not send/.test(p.why)), 'and shows red on Today');

// a missing phone is a failure in live, never quiet
sendFails = false;
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{emails}', '["samantha@mo-care.com","nobody@caringcds.com"]') where key='voicemail_leads'`);
const nob = call('4175551300', (NOW - T0) / 60000 + 1, 60); say(nob, 'care for my mother');
NOW += 6 * 60000; await comms.run(); await jobs.run();
ok(/text to Nobody \(No phone on file for Nobody\)/.test((await note(nob)).lead_alert_failed), 'someone with no phone on file shows as a failure');

console.log('\nvoicemail leads: ' + pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
