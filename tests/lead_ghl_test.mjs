// Website leads into GoHighLevel as plain contacts: end-to-end on a local Postgres copy with a fake
// GoHighLevel. Proves practice creates nothing, live sends only the four fields, and no tag ever.
//   PGLITE=/path/to/pglite/dist/index.js node tests/lead_ghl_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
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
  create policy public_insert_site_leads on site_leads for insert to anon with check (true);`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'SQL runs twice');
ok((await pg.query(`select value from cds_match_settings where key='lead_ghl'`)).rows[0].value.live === false, 'starts in practice');

await pg.exec('set role anon');
await pg.query(`insert into site_leads (agency_id, first_name, phone, ghl_contact_id, ghl_status) values ('x','Sneaky','1','abc','created')`);
await pg.exec('reset role');
const sn = (await pg.query(`select * from site_leads where first_name='Sneaky'`)).rows[0];
ok(sn.ghl_contact_id === null && sn.ghl_status === null, 'the public form cannot set the GoHighLevel link');
await pg.query(`delete from site_leads where first_name='Sneaky'`);

// ---------- the body rule ----------
eq(G.contactBody({ first_name: 'Mary', last_name: 'Smith', phone: '(417) 555-0123', email: 'Mary@Example.com', county: 'Greene', message: 'hi', has_medicaid: 'Yes' }),
   { firstName: 'Mary', lastName: 'Smith', phone: '+14175550123', email: 'mary@example.com' }, 'only name, phone and email, nothing else from the form');
eq(G.contactBody({ full_name: 'Jo Ann Lee', phone: '4175550000' }), { firstName: 'Jo', lastName: 'Ann Lee', phone: '+14175550000' }, 'full name split');
eq(G.contactBody({ email: 'bad-email' }), { firstName: 'CDS website lead' }, 'a broken email is not sent');
for (const k of ['tags', 'customFields', 'source', 'assignedTo', 'customField', 'dnd'])
  try { G.checkBody({ firstName: 'A', [k]: k === 'tags' ? ['new lead'] : 'x' }); ok(false, 'refuses ' + k); } catch (e) { ok(/Refused/.test(e.message), 'refuses ' + k); }
eq(G.WORKFLOW_TAGS, ['new lead', 'active consumer', 'onboard cds consumer', 'admin- add playbooks'], 'the four tags that start workflows are named');

// ---------- a fake GoHighLevel ----------
let NOW = Date.parse('2026-10-20T15:00:00Z');
const book = [{ id: 'c-sam', phone: '+14175550199', email: 'sam@x.com' }, { id: 'c-dup1', phone: '+14175550777' }, { id: 'c-dup2', phone: '417-555-0777' }];
const created = [], searched = []; let failCreate = null;
const ghl = {
  async search(q) { searched.push(q); return book.filter(c => String(c.phone || '').replace(/\D/g, '').endsWith(q) || String(c.email || '') === q); },
  async create(body) {
    G.checkBody(body);   // the server checks again; the fake does too
    created.push(body);
    if (failCreate === 'dup') { const e = new Error('GoHighLevel create 400: duplicate'); e.contactId = 'c-existing'; throw e; }
    if (failCreate) throw new Error(failCreate);
    const id = 'c-new-' + created.length; book.push({ id, ...body }); return id;
  },
};
const job = G.createLeadGhl({ db: { query: (t, p) => pg.query(t, p) }, ghl, now: () => NOW });
const add = async (f) => (await pg.query(`insert into site_leads (agency_id, source, first_name, last_name, phone, email, submitted_at)
  values ('caring-companions-cds','caringcds.com',$1,$2,$3,$4,$5) returning id`, [f.first, f.last || null, f.phone || null, f.email || null, new Date(NOW).toISOString()])).rows[0].id;
const row = async id => (await pg.query(`select ghl_contact_id, ghl_status, ghl_tries from site_leads where id=$1`, [id])).rows[0];

const a = await add({ first: 'Mary', last: 'Smith', phone: '417-555-0123', email: 'mary@example.com' });
const b = await add({ first: 'Sam', last: 'Lee', phone: '417 555 0199' });
const c = await add({ first: 'Twin', phone: '4175550777' });
const d = await add({ first: 'Nobody' });
const e = await add({ first: 'Emma', email: 'sam@x.com' });

// PRACTICE
let r = await job.run();
eq([r.live, r.checked, r.found, r.practice, r.several, r.skipped, r.created], [false, 5, 2, 1, 1, 1, 0], 'practice run ' + JSON.stringify(r));
eq(created.length, 0, 'practice: nothing created in GoHighLevel');
eq(await row(a), { ghl_contact_id: null, ghl_status: 'practice: would create', ghl_tries: 1 }, 'Mary: would create');
eq((await row(b)).ghl_contact_id, 'c-sam', 'Sam: found by phone and linked (GoHighLevel unchanged)');
eq((await row(e)).ghl_contact_id, 'c-sam', 'Emma: no phone, found by email');
eq(await row(c), { ghl_contact_id: null, ghl_status: 'several matches, not linked', ghl_tries: 1 }, 'two matches: not linked');
eq((await row(d)).ghl_status, 'skipped: no phone or email', 'no phone or email: skipped');
r = await job.run(); eq(r.checked, 0, 'nothing is looked at twice in practice');

// LIVE
await pg.query(`update cds_match_settings set value = '{"live": true}'::jsonb where key='lead_ghl'`);
NOW += 120000;
r = await job.run();
eq([r.live, r.checked, r.created], [true, 1, 1], 'going live creates the one that was waiting ' + JSON.stringify(r));
eq(created[0], { firstName: 'Mary', lastName: 'Smith', phone: '+14175550123', email: 'mary@example.com' }, 'exactly four fields sent');
ok(created.every(b => !('tags' in b) && !('customFields' in b)), 'no tags, no custom fields, ever');
eq(await row(a), { ghl_contact_id: 'c-new-1', ghl_status: 'created', ghl_tries: 2 }, 'Mary linked to her new contact');
r = await job.run(); eq(r.checked, 0, 'done ones are left alone');

// a duplicate GoHighLevel refuses: link it, change nothing
failCreate = 'dup'; NOW += 60000;
const f = await add({ first: 'Dee', phone: '417-555-0300' });
await job.run();
eq(await row(f), { ghl_contact_id: 'c-existing', ghl_status: 'found', ghl_tries: 1 }, 'already in GoHighLevel: linked, not changed');

// failure: tried again after an hour, at most 3 tries, and the morning email can say why
failCreate = 'GoHighLevel create 500: down'; NOW += 60000;
const g = await add({ first: 'Gus', phone: '417-555-0400' });
await job.run();
eq(await row(g), { ghl_contact_id: null, ghl_status: 'failed: GoHighLevel create 500: down', ghl_tries: 1 }, 'failure recorded with the reason');
NOW += 30 * 60000; await job.run(); eq((await row(g)).ghl_tries, 1, 'not retried inside the hour');
NOW += 31 * 60000; await job.run(); eq((await row(g)).ghl_tries, 2, 'retried after an hour');
NOW += 61 * 60000; await job.run(); NOW += 61 * 60000; await job.run();
eq((await row(g)).ghl_tries, 3, 'stops after 3 tries');
failCreate = null;

// archived leads and leads already linked are never touched
const h = await add({ first: 'Old', phone: '417-555-0500' });
await pg.query(`update site_leads set archived = true where id = $1`, [h]);
await job.run(); eq((await row(h)).ghl_status, null, 'archived leads are left alone');

// the morning email lists the failure
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const m = LA.morningEmail([], { ghlFailures: [{ name: 'Gus', why: 'GoHighLevel create 500: down' }] }, NOW);
ok(m.text.includes('1 lead could not be added to GoHighLevel') && m.text.includes('Gus (GoHighLevel create 500: down)'), 'morning email: could not be added');

// no tag word anywhere in the code that talks to GoHighLevel
const src = readFileSync(ROOT + '/supabase/functions/_shared/office/lead-ghl.js', 'utf8') + readFileSync(ROOT + '/supabase/functions/_shared/office/server.ts', 'utf8');
ok(!/tags\s*:/.test(src.replace(/\/\/.*$/gm, '')), 'no "tags:" is ever built in the GoHighLevel code');
ok(!/[—–]/.test(m.text), 'no em dashes');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
