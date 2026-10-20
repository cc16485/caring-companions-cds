// The CDS lead link page: end-to-end on a local Postgres copy with a fake clock and
// a fake GoHighLevel. Runs the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/lead_link_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const { createLeadLink, EXPIRED } = await import(ROOT + '/supabase/functions/_shared/office/lead-link.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const refuses = async (fn, want, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { eq(e.message, want, m); } };

const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
const LINK_SQL = strip(readFileSync(ROOT + '/cds_lead_link.sql', 'utf8'));
await pg.exec(LINK_SQL); await pg.exec(LINK_SQL);
ok(true, 'link SQL runs twice');

// ---------- lockdown ----------
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
ok(!(await can('anon', 'select * from cds_lead_links')) && !(await can('authenticated', 'select * from cds_lead_links')), 'nobody outside reads the links table');
ok(!(await can('anon', 'select * from cds_lead_calls')), 'the public key cannot read logged calls');
ok(await can('authenticated', 'select * from cds_lead_calls'), 'signed-in hub staff can read logged calls');
ok(!(await can('authenticated', `insert into cds_lead_calls (site_lead_id, by_name, by_email, outcome) values (gen_random_uuid(),'x','x','voicemail')`)), 'hub staff cannot write calls directly');

// ---------- a lead comes in, the alert job makes the links ----------
let NOW = Date.parse('2026-10-19T19:00:00Z');   // Monday 2:00pm Central
await pg.query(`update cds_match_settings set value = value || $1::jsonb where key='lead_alerts'`, [JSON.stringify({ started_at: '2026-10-01T00:00:00Z', recipients: [
  { name: 'Samantha', email: 'samantha@mo-care.com', phone: '+14175550001' }, { name: 'Krystal', email: 'Krystal@mo-care.com', phone: '+14175550002' }] })]);
const jobs = LA.createLeadAlerts({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW, async send() {} });
const lead = (await pg.query(`insert into site_leads (agency_id, source, first_name, last_name, phone, email, county, who_needs_care, has_medicaid, message, submitted_at)
  values ('caring-companions-cds','caringcds.com','Mary','Smith','417-555-0123','mary@example.com','Greene','My mother','Yes','She needs help <b>at home</b>.', $1) returning *`, [new Date(NOW).toISOString()])).rows[0];
await jobs.run();
const texts = (await pg.query(`select * from cds_outbox where site_lead_id=$1 and channel='sms' order by to_display`, [lead.id])).rows;
const keyOf = body => (body.match(/\?k=([0-9A-Za-z]{16})/) || [])[1];
const kKrystal = keyOf(texts.find(t => t.to_display.endsWith('02')).body), kSam = keyOf(texts.find(t => t.to_display.endsWith('01')).body);
ok(kKrystal && kSam && kKrystal !== kSam, 'each person gets their own link');

// ---------- the page ----------
let ghlCalls = 0, ghlMode = 'ok';
const ghl = {
  async contactUrl(who) { ghlCalls++; return who.phone ? 'https://app.hirecara.com/v2/location/4EFPkajwe0hHrqxvYkZ9/contacts/detail/abc' : null; },
  async texts() { if (ghlMode === 'noscope') return { ok: false, messages: [] }; return { ok: true, messages: [{ body: 'Please call after 3', at: '2026-10-19T19:10:00Z' }] }; },
};
const link = createLeadLink({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW, ghl });
NOW += 31 * 60000;
let v = await link.handle({ k: kKrystal, action: 'view' });
eq(v.me, 'Krystal', 'the page says who it is for');
eq(v.name, 'Mary Smith', 'lead name');
eq(v.came_in, '2:00pm Mon', 'came in');
eq(v.source, 'caringcds.com', 'from where');
eq(v.open_minutes, 31, '31 min, nobody has called');
ok(v.last === null, 'no call yet');
eq([v.who, v.medicaid, v.county].join(' | '), 'My mother | Yes | Greene County', 'what they told us');
eq(v.wrote, 'She needs help <b>at home</b>.', 'what they wrote (the page escapes it)');
eq(v.their_texts.messages[0].body, 'Please call after 3', 'their texts to us');
ok(/contacts\/detail\/abc$/.test(v.contact_url), 'GoHighLevel contact link for calling');
eq(v.intake.referral, 'https://hub.caringcds.com/#lead=' + lead.id + '&intake=referral', 'intake: new to CDS');
eq(v.intake.pccp, 'https://hub.caringcds.com/#lead=' + lead.id + '&intake=pccp', 'intake: transferring to us');
eq((await pg.query(`select count(*)::int n from cds_lead_links where person_email='krystal@mo-care.com' and last_opened_at is not null`)).rows[0].n, 1, 'opening is recorded on that one link');
ghlMode = 'noscope'; v = await link.handle({ k: kKrystal, action: 'view' });
ok(v.their_texts.ok === false, 'when GoHighLevel will not show texts, the page offers the conversation link instead');

// ---------- logging the call ----------
await refuses(() => link.handle({ k: kKrystal, action: 'called' }), 'Pick what happened first.', 'must pick what happened');
await refuses(() => link.handle({ k: kKrystal, action: 'called', outcome: 'sent_flowers' }), 'Pick what happened first.', 'only the four answers');
const r1 = await link.handle({ k: kKrystal, action: 'called', outcome: 'voicemail', note: 'Left a message about Thursday' });
eq(r1.message, 'Logged. The reminder is stopped.', 'logged wording');
ok(r1.first_call, 'first call');
await refuses(() => link.handle({ k: kKrystal, action: 'called', outcome: 'voicemail' }), 'That call is already logged.', 'a double tap logs once');
v = await link.handle({ k: kSam, action: 'view' });
eq(v.last && [v.last.by, v.last.outcome, v.last.talked, v.last.at].join(' | '), 'Krystal | Voicemail | false | 2:31pm', 'Samantha sees Krystal tried');
ok(v.open_minutes === null, 'the red "nobody has called" is gone');
NOW += 5 * 60000;
await link.handle({ k: kSam, action: 'called', outcome: 'connected', note: '' });
v = await link.handle({ k: kKrystal, action: 'view' });
eq([v.last.by, v.last.outcome, v.last.talked].join(' | '), 'Samantha | We talked | true', 'reached');
eq(v.calls.length, 2, 'both calls listed');
const row = (await pg.query(`select * from cds_lead_calls where by_name='Krystal'`)).rows[0];
eq([row.by_email, row.outcome, row.note].join(' | '), 'krystal@mo-care.com | voicemail | Left a message about Thursday', 'the call is saved as Krystal');
const rem = (await pg.query(`select count(*)::int n from cds_outbox where site_lead_id=$1 and template='lead_reminder_text'`, [lead.id])).rows[0].n;
await jobs.run(); eq((await pg.query(`select count(*)::int n from cds_outbox where site_lead_id=$1 and template='lead_reminder_text'`, [lead.id])).rows[0].n, rem, 'a logged call means no reminder');

// ---------- bad and old links ----------
await refuses(() => link.handle({ k: 'nope', action: 'view' }), EXPIRED, 'a made-up link');
await refuses(() => link.handle({ k: 'A'.repeat(16), action: 'view' }), EXPIRED, 'a well-formed but unknown link');
await refuses(() => link.handle({ k: kKrystal + "' or 1=1 --", action: 'view' }), EXPIRED, 'no tricks in the key');
NOW += 8 * 864e5;
await refuses(() => link.handle({ k: kKrystal, action: 'view' }), EXPIRED, 'after 7 days the link has expired');
await refuses(() => link.handle({ k: kKrystal, action: 'called', outcome: 'connected' }), EXPIRED, 'an expired link cannot log a call');
eq(EXPIRED, 'This link has expired. Open Leads in the CDS hub.', 'expired wording');

// ---------- the page file ----------
const page = readFileSync(ROOT + '/lead/index.html', 'utf8');
for (const w of ['New CDS lead', 'nobody has called', 'They wrote', 'Their texts to us', 'Open the conversation in GoHighLevel', 'What happened?',
  'We talked', 'Voicemail', 'No answer', 'Wrong number', 'Anything worth remembering? (optional)', 'Log the call',
  'Logging the call stops the reminder for everyone. It goes on the lead as you.', 'Intake questions', 'New to CDS (HCBS-1 referral)',
  'Already in CDS, transferring to us', 'Opens this lead in the CDS hub with the right questions. You sign in once on this phone.',
  'Call from there so it goes out on the CDS line, (417) 218-2888.']) ok(page.includes(w), 'page says: ' + w);
ok(!/[—–]/.test(page.replace(/<!--[\s\S]*?-->/g, '')) && !/plain (language|english)/i.test(page), 'no em dashes or "plain language" on the page');
ok(/name="robots" content="noindex/.test(page) && /name="referrer" content="no-referrer"/.test(page), 'not indexed, link not leaked as a referrer');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
