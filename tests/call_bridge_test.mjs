// "Ring my phone, then connect" (CDS call bridge): end-to-end on a local Postgres copy with
// a fake clock and a fake GoHighLevel. Runs the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/call_bridge_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const LA = await import(ROOT + '/supabase/functions/_shared/office/lead-alerts.js');
const { createLeadLink } = await import(ROOT + '/supabase/functions/_shared/office/lead-link.js');
const { createCallBridge, BRIDGE_TAG } = await import(ROOT + '/supabase/functions/_shared/office/call-bridge.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_alerts.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/cds_lead_link.sql', 'utf8')));
if (readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')) await pg.exec(strip(readFileSync(ROOT + '/cds_lead_ghl.sql', 'utf8')));

let NOW = Date.parse('2026-10-20T19:00:00Z');   // Tuesday 2:00pm Central
await pg.query(`update cds_match_settings set value = value || $1::jsonb where key='lead_alerts'`, [JSON.stringify({ started_at: '2026-10-01T00:00:00Z', recipients: [
  { name: 'Samantha', email: 'samantha@mo-care.com', phone: '+14175550001' }, { name: 'Zach', email: 'zach@mo-care.com', phone: '+14175550003' }] })]);
const jobs = LA.createLeadAlerts({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW, async send() {} });
const lead = (await pg.query(`insert into site_leads (agency_id, source, first_name, last_name, phone, email, county, message, submitted_at)
  values ('caring-companions-cds','caringcds.com','Mary','Smith','417-555-0123','mary@example.com','Greene','Please call', $1) returning *`, [new Date(NOW).toISOString()])).rows[0];
await jobs.run();
const texts = (await pg.query(`select * from cds_outbox where site_lead_id=$1 and channel='sms' order by to_display`, [lead.id])).rows;
const keyOf = body => (body.match(/\?k=([0-9A-Za-z]{16})/) || [])[1];
const kSam = keyOf(texts.find(t => t.to_display.endsWith('01')).body), kZach = keyOf(texts.find(t => t.to_display.endsWith('03')).body);
ok(kSam && kZach, 'both people got their own link');

// ---------- a fake GoHighLevel ----------
const G = { users: [{ id: 'uSam', email: 'Samantha@mo-care.com', phone: '+1 417 555 0001' }, { id: 'uZach', email: 'zach@mo-care.com', phone: '' }],
  usersStatus: 200, wf: [{ name: 'Hub call bridge', status: 'published' }], wfStatus: 200,
  contacts: [{ id: 'cMary', phone: '+14175550123', email: 'mary@example.com', firstName: 'Mary', tags: ['new lead'], assignedTo: 'uZach' }],
  putStatus: 200, tagStatus: 200, log: [] };
const ghl = {
  async get(p) {
    G.log.push('GET ' + p.split('?')[0]);
    if (p.startsWith('/users/')) return { status: G.usersStatus, body: { users: G.users } };
    if (p.startsWith('/workflows/')) return { status: G.wfStatus, body: { workflows: G.wf } };
    if (p.startsWith('/contacts/?')) {
      const qy = new URLSearchParams(p.split('?')[1]).get('query');
      return { status: 200, body: { contacts: G.contacts.filter(c => c.phone.endsWith(qy) || c.email === qy) } };
    }
    const id = decodeURIComponent(p.split('/')[2]);
    const c = G.contacts.find(x => x.id === id);
    return c ? { status: 200, body: { contact: JSON.parse(JSON.stringify(c)) } } : { status: 404, body: null };
  },
  async put(p, b) {
    G.log.push('PUT ' + p + ' ' + JSON.stringify(b));
    if (G.putStatus === 200) { const c = G.contacts.find(x => x.id === decodeURIComponent(p.split('/')[2])); if (c) c.assignedTo = b.assignedTo; }
    return { status: G.putStatus, body: {} };
  },
  async post(p, b) {
    G.log.push('POST ' + p + ' ' + JSON.stringify(b));
    if (G.tagStatus === 200) { const c = G.contacts.find(x => x.id === decodeURIComponent(p.split('/')[2])); if (c) c.tags.push(...b.tags); }
    return { status: G.tagStatus, body: {} };
  },
  async del(p, b) {
    G.log.push('DELETE ' + p + ' ' + JSON.stringify(b));
    const c = G.contacts.find(x => x.id === decodeURIComponent(p.split('/')[2])); if (c) c.tags = c.tags.filter(t => !b.tags.includes(t));
    return { status: 200, body: {} };
  },
};
const db = { query: (t, p) => pg.query(t, p) };
const bridge = createCallBridge({ db, ghl, locationId: '4EFPkajwe0hHrqxvYkZ9', now: () => NOW });
const link = createLeadLink({ db, now: () => NOW, bridge,
  ghl: { async contactUrl() { return 'https://app.hirecara.com/v2/location/4EFPkajwe0hHrqxvYkZ9/contacts/detail/cMary'; }, async texts() { return { ok: true, messages: [] }; } } });
const audit = async () => (await pg.query(`select actor, action, target, detail from cds_audit where action like 'call_bridge%' order by id`)).rows;
const writes = () => G.log.filter(l => !l.startsWith('GET'));

// ---------- the page knows it can ring ----------
const v = await link.handle({ k: kSam, action: 'view' });
eq(v.can_ring, true, 'the page shows the Ring button');
const noBridge = createLeadLink({ db, now: () => NOW });
eq((await noBridge.handle({ k: kSam, action: 'view' })).can_ring, false, 'without the bridge the page keeps the old button');

// ---------- a ring ----------
let r = await link.handle({ k: kSam, action: 'ring' });
eq(r.ok, true, 'ring works');
ok(/Ringing your phone now\. Answer, then press any key to connect to Mary\. It goes out on the CDS line, \(417\) 218-2888\./.test(r.message), 'ring message: ' + r.message);
eq(G.contacts[0].assignedTo, 'uSam', 'Mary is assigned to Samantha (the person on the link)');
ok(G.contacts[0].tags.includes(BRIDGE_TAG), 'the call tag is on');
eq(writes().length, 2, 'exactly two GoHighLevel changes: assign + tag');
ok(writes()[0].startsWith('PUT /contacts/cMary {"assignedTo":"uSam"}'), 'the assign sends that one field only');
ok(!G.log.some(l => /POST \/contacts\/ |POST \/contacts\/?\s|upsert/.test(l)), 'never creates a contact');
let a = await audit();
eq(a.length, 1, 'one record');
eq(a[0].actor, 'samantha@mo-care.com', 'record says who');
eq(a[0].target, 'lead:' + lead.id, 'record says which lead');
eq(a[0].detail.previous_assigned_to, 'uZach', 'record keeps who owned Mary before');
eq((await pg.query('select count(*)::int n from cds_lead_calls')).rows[0].n, 0, 'ringing does not log a call');

// ---------- 30 seconds between rings ----------
G.log = []; NOW += 10000;
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.ok, false, 'a second ring 10s later is refused');
eq(r.why, 'too_soon', 'too soon');
ok(/Try again in 20 seconds/.test(r.message), 'says how long: ' + r.message);
eq(writes().length, 0, 'nothing changed in GoHighLevel');

// ---------- tag already on: removed first so the trigger fires ----------
NOW += 31000; G.log = [];
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.ok, true, 'ring after 30s works');
eq(writes()[0], 'DELETE /contacts/cMary/tags {"tags":["hub-call-bridge"]}', 'leftover tag removed first');
eq(writes()[1], 'POST /contacts/cMary/tags {"tags":["hub-call-bridge"]}', 'then added again');
ok(!writes().some(l => l.startsWith('PUT')), 'already assigned to her: no assign call');

// ---------- the workflow ----------
NOW += 31000; G.log = []; G.wf = [{ name: 'Hub call bridge', status: 'draft' }];
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.why, 'no_workflow', 'a draft workflow refuses');
ok(/still a draft/.test(r.message), 'says draft');
eq(writes().length, 0, 'draft: nothing changed');
G.wf = [];
NOW += 31000; r = await link.handle({ k: kSam, action: 'ring' });
eq(r.why, 'no_workflow', 'a missing workflow refuses');
G.wf = [{ name: 'Hub call bridge', status: 'published' }];
const before = (await audit()).length;
ok(before === 2, 'refusals before any change leave no ring record (' + before + ')');

// ---------- person not a GoHighLevel user ----------
NOW += 31000; G.log = []; G.users = G.users.filter(u => u.id !== 'uZach');
r = await link.handle({ k: kZach, action: 'ring' });
eq(r.why, 'no_user', 'Zach with no GoHighLevel user is refused');
ok(/zach@mo-care.com/.test(r.message), 'says which email was looked for');
eq(writes().length, 0, 'no user: nothing changed');
// her override map links him
await pg.query(`insert into cds_match_settings (key, value, updated_by) values ('ghl_user_ids', '{"Zach@mo-care.com":"uZach2"}'::jsonb, 'test')`);
r = await link.handle({ k: kZach, action: 'ring' });
eq(r.ok, true, 'the override map links Zach');
eq(G.contacts[0].assignedTo, 'uZach2', 'assigned to the mapped user');

// ---------- the lead's contact ----------
NOW += 31000; G.log = []; G.contacts.push({ id: 'cMary2', phone: '+14175550123', email: 'other@example.com', firstName: 'Mary', tags: [] });
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.ok, true, 'two contacts share her phone but only one has her email: that one');
eq(G.contacts[0].assignedTo, 'uSam', 'the email match was used');
G.contacts[1].email = 'mary@example.com'; NOW += 31000; G.log = [];
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.why, 'several', 'two contacts with her number and email: refused, never picks');
ok(/Two GoHighLevel contacts/.test(r.message), 'says two contacts');
eq(writes().length, 0, 'several: nothing changed');
G.contacts.pop();
await pg.query(`update site_leads set ghl_contact_id='cMary' where id=$1`, [lead.id]);
G.log = []; NOW += 31000;
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.ok, true, 'the linked contact is used');
ok(!G.log.some(l => l.startsWith('GET /contacts/') && l.includes('?')), 'no search when the lead is linked');

// ---------- GoHighLevel refuses the assign: recorded, page says so ----------
NOW += 31000; G.log = []; G.putStatus = 422; G.contacts[0].assignedTo = 'uZach';
r = await link.handle({ k: kSam, action: 'ring' });
eq(r.why, 'assign_failed', 'assign refused');
ok(/would not assign Mary to you \(422\)/.test(r.message), 'says why');
ok(!G.log.some(l => l.startsWith('POST')), 'no tag when the assign failed');
a = await audit();
eq(a[a.length - 1].action, 'call_bridge_failed', 'the failure is recorded');
G.putStatus = 200;

// ---------- expired link ----------
NOW += 8 * 24 * 3600e3;
let refused = '';
try { await link.handle({ k: kSam, action: 'ring' }); } catch (e) { refused = e.message; }
ok(/expired/.test(refused), 'an expired link cannot ring');

// ---------- the installer's check ----------
G.users = [{ id: 'uSam', email: 'samantha@mo-care.com', phone: '+14175550001' }, { id: 'uK', email: 'krystal@mo-care.com', phone: '' }];
const s = await bridge.setup();
eq(s.workflow, 'published', 'setup: workflow published');
eq(s.people.length, 2, 'setup: the lead-alert people');
const sam = s.people.find(p => p.name === 'Samantha'), zach = s.people.find(p => p.name === 'Zach');
eq(sam.linked && sam.has_phone, true, 'setup: Samantha linked with a phone');
eq(zach.linked, true, 'setup: Zach linked by the override');
eq(zach.via, 'settings', 'setup: Zach via settings');
ok(!JSON.stringify(s).includes('uSam') && !JSON.stringify(s).includes('555'), 'setup never shows ids or numbers');
G.usersStatus = 403;
eq((await bridge.setup()).users_api, 'no_scope', 'setup: says when GoHighLevel will not list users');

console.log(`\ncall bridge: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
