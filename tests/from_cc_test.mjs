// A caller the Caring Companions office sends over to CDS (lead-from-cc.js), end to end on a local
// Postgres copy: one site_leads row with the call in words, never twice, nobody added who is already a
// CDS lead or consumer, and the alert text and GoHighLevel note say where they came from.
//   PGLITE=/path/to/pglite/dist/index.js node tests/from_cc_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const C = await import(ROOT + '/supabase/functions/_shared/office/lead-from-cc.js');
const F = await import(ROOT + '/supabase/functions/_shared/office/lead-forms.js');
const A = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_forms.sql', 'utf8')));
const db = { query: async (t, p) => ({ rows: (await pg.query(t.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), p)).rows }) };
const X = C.createFromCc({ db });

// ---------- the body is checked ----------
eq(C.checkHandoff(null).error, 'no person sent', 'nothing sent');
eq(C.checkHandoff({ phone: '4175551234' }).error, 'missing the Caring Companions lead or call id', 'needs an id');
eq(C.checkHandoff({ cc_id: 'lead_1234', first_name: 'Ann' }).error, 'no phone or email to reach them', 'needs a phone or email');
eq(C.checkHandoff({ cc_id: "x'; drop table", phone: '4175551234' }).error, 'missing the Caring Companions lead or call id', 'odd id refused');

const body = { cc_id: 'lead_ann1', first_name: 'Ann', last_name: 'Lee', phone: '(417) 555-1234', email: 'Kim@Example.com ',
  caller_name: 'Kim Lee', relationship: 'Daughter', who_needs_care: 'Her mother', county: 'Greene',
  call_at: '2026-11-01T15:30:00Z', summary: 'Mother has Medicaid and wants her daughter to be paid as her caregiver — asked about CDS.',
  notes: 'Prefers calls after 3pm.', sent_by: 'Krystal' };
const { row } = C.checkHandoff(body);
eq([row.phone, row.email, row.full_name, row.source, row.form_name, row.from_kind, row.from_id],
  ['+14175551234', 'kim@example.com', 'Ann Lee', 'the Caring Companions line', 'Called the Caring Companions line', 'cc_lead', 'lead_ann1'], 'row fields');
eq(row.form_answers.map(a => a[0]), ['Who they are', 'Who called', 'Who needs care', 'County', 'Call was on', 'What the call was about', 'Caring Companions notes', 'Sent over by'], 'answers in order');
ok(!/[—–]/.test(row.message), 'no em dashes in what the office reads');
ok(/Call was on: Sun, Nov 1, 2026/.test(row.message), 'call day in Central time');

// ---------- added once ----------
const r1 = await X.take(body);
ok(r1.ok && r1.added && r1.id, 'added');
const r2 = await X.take(body);
eq([r2.ok, r2.added, r2.already && r2.already.kind], [true, false, 'sent'], 'sending the same person again adds nothing');
const rows = (await pg.query(`select * from site_leads`)).rows;
eq(rows.length, 1, 'one row');
eq([rows[0].status, rows[0].archived, rows[0].alert_at, rows[0].ghl_contact_id], ['new', false, null, null], 'waits for the lead job: alert, contact and note');

// ---------- someone CDS already has ----------
const r3 = await X.take({ ...body, cc_id: 'call:abc123', email: '' });
eq([r3.added, r3.already.kind, r3.already.name], [false, 'lead', 'Ann Lee'], 'same phone as a website lead: not added');
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ($1, 'pipeline', $2::jsonb), ($1, 'consumers', $3::jsonb)`,
  [A.AGENCY_ID, JSON.stringify([{ id: 'p1', name: 'Bo Hart', phone: '417-555-0001', status: 'new' }, { id: 'p2', name: 'Old Lead', phone: '4175550003', status: 'closed_lost' }]),
   JSON.stringify([{ id: 'c1', name: 'Cy Dunn', phone: '+1 417 555 0002' }])]);
eq((await X.take({ cc_id: 'lead_bo', first_name: 'Bo', phone: '4175550001' })).already, { kind: 'lead', name: 'Bo Hart' }, 'already on CDS Leads');
eq((await X.take({ cc_id: 'lead_cy', first_name: 'Cy', phone: '4175550002' })).already, { kind: 'consumer', name: 'Cy Dunn' }, 'already a CDS consumer');
ok((await X.take({ cc_id: 'lead_old', first_name: 'Old', phone: '4175550003' })).added, 'a closed CDS lead can be sent again');

// ---------- the words ----------
const note = F.noteText(row.form_name, '2026-11-01T16:00:00Z', row.form_answers);
ok(note.startsWith('Called the Caring Companions line, (417) 234-8494. Sent to CDS on Sun, Nov 1, 2026.\nWho they are: Called the Caring Companions line about CDS'), 'GoHighLevel note: ' + note.split('\n')[0]);
ok(F.noteText('caringcds.com: Home page', '2026-10-26T16:46:59Z', []).startsWith('Filled out: caringcds.com: Home page'), 'website notes unchanged');
const t = A.leadText({ ...rows[0] }, Date.parse(rows[0].submitted_at), 'hub.caringcds.com/lead/?k=x');
ok(/Sent over from the Caring Companions line\. Tap to see the call notes and call: hub\.caringcds\.com\/lead\/\?k=x$/.test(t), 'office text: ' + t);
ok(/Tap to see what they wrote/.test(A.leadText({ first_name: 'Z', submitted_at: new Date().toISOString() }, Date.now(), 'x')), 'website text unchanged');
const em = A.leadEmail(rows[0], '');
ok(/came in from the Caring Companions line/.test(em.text) && /Nothing was sent to the family/.test(em.text), 'office email says where from');

console.log(`from_cc: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
