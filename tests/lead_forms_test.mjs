// Every website form into GoHighLevel with a note, and findcdscaregivers families onto Leads: end to end
// on a local Postgres copy with a fake GoHighLevel. Proves practice writes nothing to GoHighLevel, live
// sends only the four contact fields and one note each, nothing is copied or noted twice, and the
// public forms cannot set the new columns.
//   PGLITE=/path/to/pglite/dist/index.js node tests/lead_forms_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const F = await import(ROOT + '/supabase/functions/_shared/office/lead-forms.js');
const G = await import(ROOT + '/supabase/functions/_shared/office/lead-ghl.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  alter table site_leads enable row level security; grant insert on site_leads to anon;
  create policy public_insert_site_leads on site_leads for insert to anon with check (true);
  create policy public_insert_pool on attendant_pool for insert to anon with check (true);`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/cds_lead_forms.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'SQL runs twice');
ok((await pg.query(`select value from cds_match_settings where key='lead_forms'`)).rows[0].value.live === false, 'starts in practice');

// ---------- the public forms cannot set the new columns ----------
await pg.exec('set role anon');
await pg.query(`insert into site_leads (agency_id, first_name, phone, form_name, from_kind, from_id, ghl_note_status) values ('x','Sneaky','1','fake','prospect','1','added')`);
await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone, ghl_contact_id, ghl_status, ghl_note_status) values ('x','Sneaky','S','1','abc','found','added')`);
await pg.exec('reset role');
const sl = (await pg.query(`select * from site_leads where first_name='Sneaky'`)).rows[0];
ok(sl.form_name === null && sl.from_kind === null && sl.from_id === null && sl.ghl_note_status === null, 'website form cannot set form or note columns');
const sp = (await pg.query(`select * from attendant_pool where first_name='Sneaky'`)).rows[0];
ok(sp.ghl_contact_id === null && sp.ghl_status === null && sp.ghl_note_status === null, 'caregiver form cannot set GoHighLevel columns');
await pg.query(`delete from site_leads where first_name='Sneaky'`); await pg.query(`delete from attendant_pool where first_name='Sneaky'`);

// ---------- names and answers ----------
eq(F.formName('caringcds home'), 'caringcds.com: Home page', 'home form');
eq(F.formName('caringcds eligibility wizard'), 'caringcds.com: Check if you qualify', 'eligibility form');
eq(F.formName('caringcds attendants switch'), 'caringcds.com: Switch to Caring Companions CDS', 'switch form');
eq(F.formName('caringcds contact'), 'caringcds.com: Contact us', 'contact form');
eq(F.formName('findcdscaregivers request access'), 'findcdscaregivers.com: family asking for a caregiver', 'family request');
eq(F.caregiverFormName('findcdscaregivers.com'), 'findcdscaregivers.com: caregiver sign-up', 'findcdscaregivers sign-up');
eq(F.caregiverFormName('public'), 'caringcds.com: caregiver list sign-up', 'caringcds caregiver list');
eq(F.caregiverFormName('apply'), 'caringcds.com: attendant application', 'attendant application');
eq(F.siteAnswers({ who_needs_care: 'family member', has_medicaid: 'no', county: 'Greene', message: 'person: would be the caregiver' }),
  [['Who needs care', 'family member'], ['Medicaid', 'no'], ['County', 'Greene'], ['Who they are', 'would be the caregiver']], 'eligibility answers');
eq(F.siteAnswers({ message: 'topic: Something else\nHi Team,\nI read about you.' }),
  [['What it is about', 'Something else'], ['They wrote', 'Hi Team, I read about you.']], 'contact form: topic and what they wrote');
const note = F.noteText('caringcds.com: Home page', '2026-10-26T16:46:59Z', [['Who needs care', 'Yes, I need the care'], ['County', 'Greene']]);
eq(note, 'Filled out: caringcds.com: Home page on Mon, Oct 26, 2026.\nWho needs care: Yes, I need the care\nCounty: Greene', 'the note');

// ---------- a fake GoHighLevel ----------
let NOW = Date.parse('2026-10-31T15:00:00Z');
const book = [{ id: 'c-fam', firstName: 'Fran', lastName: 'Family', phone: '+14175550101', email: 'fran@x.com' }, { id: 'c-web', phone: '+14175550202' }];
const created = [], notes = [], gets = []; let failNote = null;
const ghl = {
  async search(q) { return book.filter(c => String(c.phone || '').replace(/\D/g, '').endsWith(q) || String(c.email || '') === q); },
  async create(body) { G.checkBody(body); created.push(body); const id = 'c-new-' + created.length; book.push({ id, ...body }); return id; },
  async get(id) { gets.push(id); return book.find(c => c.id === id) || null; },
  async note(id, b) { ok(Object.keys(b).join() === 'body', 'a note sends only its body'); if (failNote) throw new Error(failNote); notes.push({ id, body: b.body }); },
};
const job = F.createLeadForms({ db: { query: (t, p) => pg.query(t, p) }, ghl, now: () => NOW });
const A = 'caring-companions-cds';

// a website lead already linked to GoHighLevel, a findcdscaregivers family, caregivers with and without someone
const web = (await pg.query(`insert into site_leads (agency_id, source, first_name, phone, who_needs_care, has_medicaid, county, ghl_contact_id, ghl_status, submitted_at)
  values ($1,'caringcds home','Wendy','4175550202','Yes, I need the care','Yes, active Medicaid','Greene','c-web','found','2026-10-26T16:46:59Z') returning id`, [A])).rows[0].id;
const fam = (await pg.query(`insert into cds_prospects (ghl_contact_id, first_name, town, county, source, needs)
  values ('c-fam','Fran','Ozark','Christian','findcdscaregivers request access','{"program":"ihs","relationship":"parent"}'::jsonb) returning id`)).rows[0].id;
await pg.query(`insert into cds_prospects (ghl_contact_id, first_name, town, source, needs) values ('c-office','Ollie','Nixa','office','{}'::jsonb)`);
const cgYes = (await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone, city, counties, source, has_potential_consumer, consumer_relationship, consumer_has_medicaid, submitted_at)
  values ($1,'Cara','Giver','417-555-0303','Ozark','["Christian"]'::jsonb,'findcdscaregivers.com','Yes','Parent','Yes, active Medicaid','2026-10-28T14:00:00Z') returning id`, [A])).rows[0].id;
const cgNo = (await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone, source, has_potential_consumer) values ($1,'Nate','','417-555-0404','public','No') returning id`, [A])).rows[0].id;
await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone, source) values ($1,'Staffy','S','417-555-0505','staff')`, [A]);

// PRACTICE
let r = await job.run();
eq([r.live, r.named, r.cgPractice, r.leadsWouldAdd, r.leadsAdded, r.notesWould, r.notesAdded], [false, 1, 2, 2, 0, 1, 0], 'practice run ' + JSON.stringify(r));
eq([created.length, notes.length], [0, 0], 'practice: nothing written to GoHighLevel');
const w = (await pg.query(`select form_name, form_answers from site_leads where id=$1`, [web])).rows[0];
eq(w.form_name, 'caringcds.com: Home page', 'practice still names the form for the hub');
eq(w.form_answers, [['Who needs care', 'Yes, I need the care'], ['Medicaid', 'Yes, active Medicaid'], ['County', 'Greene']], 'and keeps its answers');
eq((await pg.query(`select count(*)::int n from site_leads where from_kind is not null`)).rows[0].n, 0, 'practice: nobody copied onto Leads');

// LIVE
await pg.query(`update cds_match_settings set value = '{"live": true}'::jsonb where key='lead_forms'`);
NOW += 120000;
r = await job.run();
eq([r.cgCreated, r.leadsAdded, r.notesAdded, r.notesFailed], [2, 2, 4, 0], 'live run ' + JSON.stringify(r));
eq(created, [{ firstName: 'Cara', lastName: 'Giver', phone: '+14175550303' }, { firstName: 'Nate', phone: '+14175550404' }], 'caregivers added with name and phone only; the office one is left alone');
const copies = (await pg.query(`select from_kind, first_name, last_name, phone, email, form_name, ghl_contact_id, alert_at is not null alerted from site_leads where from_kind is not null order by from_kind`)).rows;
eq(copies.map(c => [c.from_kind, c.first_name, c.phone, c.form_name, c.ghl_contact_id, c.alerted]), [
  ['caregiver', 'Cara', '417-555-0303', 'findcdscaregivers.com: caregiver sign-up', 'c-new-1', true],
  ['prospect', 'Fran', '(417) 555-0101', 'findcdscaregivers.com: family asking for a caregiver', 'c-fam', true],
], 'family and caregiver-with-someone copied onto Leads, linked, no second alert');
eq(copies.find(c => c.from_kind === 'prospect').email, 'fran@x.com', 'family email read from GoHighLevel');
ok(!copies.some(c => c.first_name === 'Nate' || c.first_name === 'Ollie'), 'caregiver with nobody and office-added family stay off Leads');
eq(notes.map(n => n.id).sort(), ['c-fam', 'c-new-1', 'c-new-2', 'c-web'], 'one note each: website lead, family, Cara (from her caregiver row, not twice) and Nate');
ok(notes.find(n => n.id === 'c-fam').body.startsWith('Filled out: findcdscaregivers.com: family asking for a caregiver on '), 'family note names the form');
ok(notes.find(n => n.id === 'c-fam').body.includes('Care is for: My parent'), 'family note has the answers');
ok(notes.find(n => n.id === 'c-new-1').body.includes('Has someone to care for: Yes') && notes.find(n => n.id === 'c-new-1').body.includes('That person is their: Parent'), 'caregiver note has the answers');

ok(notes.some(n => n.id === 'c-new-2' && n.body.startsWith('Filled out: caringcds.com: caregiver list sign-up')), 'Nate noted with his form');
NOW += 120000;
r = await job.run();
eq([r.cgCreated, r.leadsAdded, r.notesAdded, notes.length], [0, 0, 0, 4], 'next run: nothing twice');

// a failed note is tried again after an hour, at most 3 times, and the reason is kept
failNote = 'GoHighLevel note 500: down';
const late = (await pg.query(`insert into site_leads (agency_id, source, first_name, phone, ghl_contact_id, ghl_status) values ($1,'caringcds contact','Lou','4175550606','c-lou','found') returning id`, [A])).rows[0].id;
NOW += 120000; await job.run();
eq((await pg.query(`select ghl_note_status, ghl_note_tries from site_leads where id=$1`, [late])).rows[0], { ghl_note_status: 'failed: GoHighLevel note 500: down', ghl_note_tries: 1 }, 'failure kept with why');
NOW += 30 * 60000; await job.run(); eq((await pg.query(`select ghl_note_tries from site_leads where id=$1`, [late])).rows[0].ghl_note_tries, 1, 'not retried inside the hour');
failNote = null; NOW += 31 * 60000; await job.run();
eq((await pg.query(`select ghl_note_status, ghl_note_tries from site_leads where id=$1`, [late])).rows[0], { ghl_note_status: 'added', ghl_note_tries: 2 }, 'retried after an hour and added');

// the morning email names a caregiver whose contact failed
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const m = LA.morningEmail([], { ghlFailures: [{ name: 'Nate (caregiver)', why: 'form note: GoHighLevel note 500: down' }] }, NOW);
ok(m.text.includes('Nate (caregiver) (form note: GoHighLevel note 500: down)'), 'morning email lists a failed note');

// no tags, no em dashes
const src = readFileSync(ROOT + '/supabase/functions/_shared/office/lead-forms.js', 'utf8');
ok(!/tags\s*:/.test(src.replace(/\/\/.*$/gm, '')), 'no "tags:" anywhere in lead-forms.js');
ok(!notes.some(n => /[—–]/.test(n.body)), 'no em dashes in notes');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
