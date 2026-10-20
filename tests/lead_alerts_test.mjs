// CDS new-lead alerts + morning email: end-to-end on a local Postgres copy, with a
// fake clock. Runs the real SQL and the real job code; nothing leaves this machine.
//   PGLITE=/path/to/pglite/dist/index.js node tests/lead_alerts_test.mjs
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgPath = process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pgPath);
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const R = globalThis.CDSRules;

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

// ---------- database ----------
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`alter table attendant_pool add column if not exists office_reviewed_at timestamptz;`);
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(`
  create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  create table evv_submissions (id uuid primary key default gen_random_uuid(), agency_id text, processed bool default false, submitted_at timestamptz default now());
  -- live: the website forms add leads with the public key (insert only)
  alter table site_leads enable row level security; grant insert on site_leads to anon;
  create policy public_insert_site_leads on site_leads for insert to anon with check (true);
  insert into evv_submissions (agency_id) values ('caring-companions-cds'), ('caring-companions-cds');
  insert into site_leads (agency_id, source, first_name, last_name, phone, submitted_at) values ('caring-companions-cds','caringcds.com','Old','Lead','4175550000', now() - interval '20 days');`);
const SQL = strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'SQL runs twice');
const old = (await pg.query(`select * from site_leads where first_name='Old'`)).rows[0];
ok(old.alert_at && old.alert_texted_at && old.reminder_at, 'a lead already on file is marked handled, so turning alerts on never sends about it');
const cfg0 = (await pg.query(`select value from cds_match_settings where key='lead_alerts'`)).rows[0].value;
ok(cfg0.live === false && cfg0.recipients.map(r => r.email).join() === 'samantha@mo-care.com,krystal@mo-care.com', 'lead alerts start in practice, to Samantha and Krystal');
const mcfg0 = (await pg.query(`select value from cds_match_settings where key='morning_email'`)).rows[0].value;
ok(mcfg0.live === false && mcfg0.hour === 8, 'morning email starts in practice, 8am');

// The public form cannot mark its own lead as already alerted.
await pg.exec('set role anon');
await pg.query(`insert into site_leads (agency_id, first_name, phone, alert_at, alert_failed) values ('x','Sneaky','1', now(), 'x')`);
await pg.exec('reset role');
const sneaky = (await pg.query(`select * from site_leads where first_name='Sneaky'`)).rows[0];
ok(sneaky.alert_at === null && sneaky.alert_failed === null, 'public form cannot set the alert columns');
await pg.query(`delete from site_leads where first_name='Sneaky'`);

// ---------- the jobs, with a fake clock and a fake sender ----------
let NOW = 0; const sent = []; let sendFails = false;
const jobs = LA.createLeadAlerts({
  db: { query: (t, p) => pg.query(t, p) },
  now: () => NOW,
  async send(m) { if (sendFails) throw new Error('GoHighLevel 500: down'); sent.push(m); },
});
const at = iso => { NOW = Date.parse(iso); };
const lead = async (fields) => (await pg.query(
  `insert into site_leads (agency_id, source, first_name, last_name, phone, email, county, who_needs_care, has_medicaid, message, submitted_at)
   values ('caring-companions-cds','caringcds.com',$1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
  [fields.first, fields.last, fields.phone ?? null, fields.email ?? null, fields.county ?? null, fields.who ?? null, fields.medicaid ?? null, fields.msg ?? null, new Date(NOW).toISOString()])).rows[0];
const outbox = async (id) => (await pg.query(`select * from cds_outbox where site_lead_id=$1 order by created_at, template, to_display`, [id])).rows;
const setCfg = (k, v) => pg.query(`update cds_match_settings set value = value || $2::jsonb where key=$1`, [k, JSON.stringify(v)]);
const pipeline = v => pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','pipeline',$1::jsonb)
  on conflict (agency_id, data_key) do update set data_value = excluded.data_value`, [JSON.stringify(v)]);
await setCfg('lead_alerts', { started_at: '2026-10-01T00:00:00Z', recipients: [
  { name: 'Samantha', email: 'samantha@mo-care.com', phone: '+14175551111' },
  { name: 'Krystal', email: 'krystal@mo-care.com', phone: null }] });

// A. Monday 2:00pm Central (CDT, UTC-5): email + text at once, reminder after 30 minutes.
at('2026-10-19T19:00:00Z');
const a = await lead({ first: 'Mary', last: 'Smith', phone: '417-555-0123', email: 'mary@example.com', county: 'Greene', who: 'My mother', medicaid: 'Yes', msg: 'She needs help at home.' });
let r = await jobs.run();
ok(r.ok && r.emailed === 1 && r.texted === 1, 'new lead in text hours: emailed and texted ' + JSON.stringify(r));
let ob = await outbox(a.id);
eq(ob.length, 4, '2 emails + 2 texts recorded');
ok(ob.every(m => m.status === 'practice' && m.audience === 'office'), 'all practice, all office');
eq(sent.length, 0, 'practice: nothing sent');
const smsS = ob.find(m => m.channel === 'sms' && m.to_display !== 'Krystal');
eq(smsS.body, 'New CDS lead: Mary Smith, Greene County. Call 417-555-0123. hub.caringcds.com/#pipeline', 'the new lead text');
const smsK = ob.find(m => m.channel === 'sms' && m.to_display === 'Krystal');
eq(smsK.error, 'No phone on file for Krystal yet', 'Krystal has no phone yet: recorded, not skipped silently');
const em = ob.find(m => m.channel === 'email');
eq(em.body.split('\n')[0], 'New CDS lead: Mary Smith, Greene County', 'email subject');
ok(em.body.includes('A new lead just came in from caringcds.com.') && em.body.includes('Who needs care: My mother') &&
   em.body.includes('Has Medicaid: Yes') && em.body.includes('Came in: Mon, Oct 19, 2:00pm') && em.body.includes('Nothing was sent to the family.'), 'email body');
r = await jobs.run(); eq((await outbox(a.id)).length, 4, 'running again sends nothing twice');
at('2026-10-19T19:29:00Z'); await jobs.run(); eq((await outbox(a.id)).length, 4, 'no reminder at 29 minutes');
at('2026-10-19T19:31:00Z'); r = await jobs.run();
ob = await outbox(a.id);
const rem = ob.filter(m => m.template === 'lead_reminder_text');
eq(rem.length, 2, 'reminder at 31 minutes to both');
eq(rem.find(m => m.to_display !== 'Krystal').body,
   'Still waiting: Mary Smith (CDS lead) came in 31 minutes ago and nobody has called yet. Call 417-555-0123. hub.caringcds.com/#pipeline', 'the reminder text');
at('2026-10-19T20:31:00Z'); await jobs.run(); eq((await outbox(a.id)).length, 6, 'only one reminder, ever');

// B. Friday 7:12pm: email now, text Monday 8am, reminder Monday 8:30.
at('2026-10-24T00:12:00Z');
const b = await lead({ first: 'John', last: 'Doe', phone: '417-555-0199', county: 'Polk County' });
r = await jobs.run();
ob = await outbox(b.id);
ok(ob.length === 2 && ob.every(m => m.channel === 'email'), 'after hours: emails only');
at('2026-10-24T17:00:00Z'); await jobs.run(); eq((await outbox(b.id)).length, 2, 'Saturday noon: no texts');
at('2026-10-26T13:00:00Z'); await jobs.run();   // Mon 8:00am CDT
ob = await outbox(b.id);
eq(ob.filter(m => m.template === 'lead_alert_text' && m.to_display !== 'Krystal')[0]?.body,
   'New CDS lead: John Doe, Polk County. Came in 7:12pm Fri. Call 417-555-0199. hub.caringcds.com/#pipeline', 'the 8am text says when it came in');
at('2026-10-26T13:29:00Z'); await jobs.run(); eq((await outbox(b.id)).filter(m => m.template === 'lead_reminder_text').length, 0, 'no reminder at 8:29');
at('2026-10-26T13:30:00Z'); await jobs.run();
eq((await outbox(b.id)).filter(m => m.template === 'lead_reminder_text' && m.to_display !== 'Krystal')[0]?.body,
   'Still waiting: John Doe (CDS lead) came in at 7:12pm Fri and nobody has called yet. Call 417-555-0199. hub.caringcds.com/#pipeline', 'Monday 8:30 reminder');

// C. Somebody called (status moved off New): no reminder. A note also counts.
at('2026-10-26T15:00:00Z');
const c = await lead({ first: 'Ann', last: 'Lee', phone: '417-555-0142' });
const d = await lead({ first: 'Bo', last: 'Park', phone: '417-555-0143' });
await jobs.run();
await pipeline([
  { id: 'web-' + c.id, siteLeadId: c.id, name: 'Ann Lee', fromWebsite: true, status: 'contacted', notes: [] },
  { id: 'web-' + d.id, siteLeadId: d.id, name: 'Bo Park', fromWebsite: true, status: 'new',
    notes: [{ date: '2026-10-26', text: 'They said: hi', fromForm: true }, { date: '2026-10-26', text: 'Left a voicemail' }] }]);
at('2026-10-26T15:40:00Z'); await jobs.run();
eq((await outbox(c.id)).filter(m => m.template === 'lead_reminder_text').length, 0, 'called (status moved): no reminder');
eq((await outbox(d.id)).filter(m => m.template === 'lead_reminder_text').length, 0, 'note added: no reminder');
ok((await pg.query(`select reminder_at from site_leads where id=$1`, [c.id])).rows[0].reminder_at, 'reminder marked done so it never comes later');

// D. Live: real sends, and a failure is written onto the lead for the Dashboard.
await setCfg('lead_alerts', { live: true });
at('2026-10-26T16:00:00Z');
const e = await lead({ first: 'Eve', last: 'Fox', phone: '417-555-0150' });
await jobs.run();
ob = await outbox(e.id);
eq(ob.filter(m => m.status === 'sent').length, 3, 'live: 2 emails + Samantha text sent');
eq(sent.length, 3, 'live: the sender was called 3 times');
const fx = (await pg.query(`select alert_failed from site_leads where id=$1`, [e.id])).rows[0].alert_failed;
eq(fx, 'Did not send: text to Krystal (No phone on file for Krystal)', 'live with no phone: failure shown on the lead');
sendFails = true;
at('2026-10-26T16:10:00Z');
const g = await lead({ first: 'Gus', last: 'Hill', phone: '417-555-0160' });
await jobs.run();
ok((await outbox(g.id)).filter(m => m.status === 'failed').length === 4, 'GoHighLevel down: every message recorded as failed');
ok(/email to Samantha \(GoHighLevel 500: down\)/.test((await pg.query(`select alert_failed from site_leads where id=$1`, [g.id])).rows[0].alert_failed), 'the reason is kept');
sendFails = false;
await setCfg('lead_alerts', { live: false });

// ---------- morning email ----------
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','consumers',$1::jsonb)`, [JSON.stringify([
  { name: 'Pat Q', status: 'Active', cdsStartDate: '2026-06-01', contacts: {} },
  { name: 'Lou R', status: 'Active', cdsStartDate: '2026-09-20', fusionEntered: true, proofUploaded: '2026-09-25', contacts: { '2026-10': { date: '2026-10-02' } } },
  { name: 'Gone S', status: 'Inactive' }])]);
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','authorizations',$1::jsonb)`, [JSON.stringify({ records: {
  a: { consumer: 'PAT Q', planEnd: '2026-11-30' } } })]);
at('2026-10-27T13:00:00Z');   // Tuesday 8:00am CDT
r = await jobs.morning();
ok(r.ok && r.live === false, 'morning email ran in practice ' + JSON.stringify(r));
const mm = (await pg.query(`select * from cds_outbox where template='morning_email' order by created_at`)).rows;
eq(mm.length, 2, 'one per address');
const body = mm[0].body;
eq(body.split('\n')[0], 'CDS morning, Tue, Oct 27: 8 things waiting', 'morning subject');
for (const want of [
  'Good morning. Here is what is waiting in the CDS hub today.',
  '1. Clear anything the state is waiting on',
  '   1 consumer past the 90-day EIN deadline (https://hub.caringcds.com/#taxcompliance)',
  '2. Protect the money',
  '   1 active consumer has no authorization on file',
  '   1 expiring within 60 days',
  '3. Keep the case files clean',
  '   1 monthly contact not yet logged this month',
  '4. Call the people waiting',
  '   5 new enquiries from the website, never contacted',
  '      Eve Fox, came in 11:00am Mon',
  '      Mary Smith, Greene County, came in Oct 19',
  'Also waiting',
  '   2 new lead alerts did not send',
  '   2 EVV correction forms to review',
  'Sent to Samantha and Krystal every weekday at 8am. Nothing here goes to families.']) ok(body.includes(want), 'morning email has: ' + want);
ok(!body.includes('Ann Lee') && !body.includes('Bo Park'), 'people already called are not listed');
ok(/      Old Lead, came in [A-Z][a-z]{2} \d{1,2}\n/.test(body), 'a lead older than 6 days shows its date, not a weekday');
eq((await jobs.morning()).skipped, 'already sent today', 'only one a day');
at('2026-10-27T14:00:00Z'); eq((await jobs.morning()).skipped, 'not 8am on a weekday in Central time', '9am: nothing (the winter schedule)');
at('2026-11-01T14:00:00Z'); eq((await jobs.morning()).skipped, 'not 8am on a weekday in Central time', 'Sunday: nothing');
at('2026-11-02T14:00:00Z'); ok((await jobs.morning()).ok && (await pg.query(`select count(*)::int n from cds_outbox where template='morning_email'`)).rows[0].n === 4, 'winter time: 14:00 UTC is 8am CST and sends');
const clear = LA.morningEmail([{ n: 1, title: 'Clear anything the state is waiting on', items: [] }], {}, Date.parse('2026-10-27T13:00:00Z'));
ok(clear.subject === 'CDS morning, Tue, Oct 27: nothing waiting' && clear.text.includes('   Nothing waiting here.'), 'a clear morning says so');

// ---------- rules ----------
ok(R.leadWaiting({ fromWebsite: true, status: 'new', notes: [{ text: 'Who needs care: dad' }] }), 'an old import note (no marker) is still the family\'s words');
ok(!R.leadWaiting({ fromWebsite: true, status: 'new', notes: [{ text: 'Called, no answer' }] }), 'a staff note means reached');
ok(!R.leadWaiting({ fromWebsite: false, status: 'new' }), 'leads typed in by the office are not website leads');
ok(R.siteLeadWaiting({ id: 'x' }, []) && !R.siteLeadWaiting({ id: 'x', archived: true }, []), 'a lead not pulled in yet is waiting; archived is not');

// The moved rules give the same answers as the old copies in index.html.
const oldSrc = execSync('git show origin/main:index.html', { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
const grab = name => { const a = oldSrc.indexOf('function ' + name + '('); return oldSrc.slice(a, oldSrc.indexOf('\n}\n', a) + 2); };
const wages = { entries: [{ consumer: 'Pat Q', period: '07/19/2026 - 07/25/2026', gross: 600 }, { consumer: 'Pat Q', period: '08/02/2026 - 08/08/2026', net: 500 },
                          { consumer: 'Lou R', period: '12/28/2025 - 01/03/2026', gross: 300 }] };
const OLD = new Function('getObj', grab('desThreshold') + grab('einClock') + grab('ongoingRequirements') + 'return { desThreshold, einClock, ongoingRequirements };')(() => wages);
const people = [{ name: 'Pat Q', cdsStartDate: '2026-06-01', contacts: { '2026-08': {}, '2026-10': {} }, homeVisits: [{ date: '2025-11-01' }] },
                { name: 'Lou R', empeonStartDate: '2025-12-15', contacts: {} }, { name: 'New T' }];
for (const p of people) {
  eq(JSON.stringify(R.einClock(p)), JSON.stringify(OLD.einClock(p)), 'einClock same as before for ' + p.name);
  eq(JSON.stringify(R.desThreshold(wages.entries, p.name)), JSON.stringify(OLD.desThreshold(p.name)), 'desThreshold same as before for ' + p.name);
  eq(JSON.stringify(R.ongoingRequirements(p)), JSON.stringify(OLD.ongoingRequirements(p)), 'ongoingRequirements same as before for ' + p.name);
}

// ---------- her words rules ----------
const all = (await pg.query(`select body from cds_outbox where audience='office'`)).rows.map(x => x.body).join('\n');
ok(!/[—―–]/.test(all), 'no em or en dashes in any message');
ok(!/plain (language|english)/i.test(all), 'no "plain language"');
const html = LA.leadEmail({ first_name: '<b>X</b>', submitted_at: new Date().toISOString() }).html;
ok(!html.includes('<b>X</b>') && html.includes('&lt;b&gt;X&lt;/b&gt;'), 'what a family typed is escaped in the email');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
