// Medicaid application instructions from the Starting profile (2026-11-04), end to end on a local Postgres
// copy with the real SQL and server logic: switch off holds, a live send keeps the GoHighLevel id, delivery is
// read back, a failure becomes a Needs attention task, duplicates warn, identifiers are stopped.
//   node tests/starting_medicaid_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
const { SWITCHES } = await import(ROOT + '/supabase/functions/_shared/office/switches.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const refuses = async (fn, re, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

const pg = new PGlite();
const db = { query: (s, p) => pg.query(s, p) };
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(`create table if not exists agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key))`);
await pg.exec(strip(readFileSync(ROOT + '/comm_center.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/starting_medicaid.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'starting_medicaid.sql runs twice');
ok((await pg.query(`select value from cds_match_settings where key='medicaid_messages'`)).rows[0].value.live === false, 'switch starts off');
ok(SWITCHES.some(s => s.key === 'medicaid_messages' && /families/.test(s.warn)), 'on the Switches card with a warning');

// A live-mode copy of the practice plumbing with a fake GoHighLevel.
const sent = [];
let failNext = false, deliveryOf = {};
const base = practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' });
const live = Object.assign({}, base, { mode: 'live',
  async send(m) { if (failNext) { failNext = false; throw new Error('GoHighLevel 422: invalid phone'); } sent.push(m); return { id: 'ghl-' + sent.length }; },
  async messageStatus(id) { return deliveryOf[id] || 'sent'; } });
const person = { kind: 'consumer', id: 'c-fict-1', name: 'Pat Example' };
const body = "Hi Linda, it's Krystal with Caring Companions CDS. Here's how to apply for Missouri Medicaid for Pat:\nOnline: https://mydss.mo.gov/healthcare\nBy phone: 855-373-9994";

// Off: held, nothing sent.
let M = createMatch(live);
const S = (a, i) => M.handle('staff', a, { staff: 'samantha@mo-care.com', ...i });
let r = await S('medicaidSend', { person, channel: 'sms', to: '4175550177', body });
ok(r.message.status === 'held' && sent.length === 0, 'switch off: held, not sent');
ok(r.message.to === R_mask(), 'phone masked on screen');
function R_mask() { return r.message.to; }

// On.
await pg.query(`update cds_match_settings set value='{"live": true}' where key='medicaid_messages'`);
r = await S('medicaidSend', { person, channel: 'sms', to: '4175550177', body });
ok(r.duplicate === undefined && r.message.status === 'sent' && sent.length === 1, 'held one does not count as a duplicate; sent');
ok((await pg.query(`select ghl_id from cds_outbox where id=$1`, [r.message.id])).rows[0].ghl_id === 'ghl-1', 'GoHighLevel id kept');
// Duplicate warning, then resend allowed.
r = await S('medicaidSend', { person, channel: 'email', to: 'linda@example.com', subject: 'How to apply for Missouri Medicaid for Pat', body });
ok(Array.isArray(r.duplicate) && r.duplicate.length === 1 && sent.length === 1, 'recent send warns, nothing sent');
r = await S('medicaidSend', { person, channel: 'email', to: 'linda@example.com', subject: 'How to apply for Missouri Medicaid for Pat', body, force: true });
ok(r.message.status === 'sent' && sent.length === 2 && sent[1].subject.includes('Pat'), 'resend allowed when staff confirm');
// Delivery read back; a bad delivery becomes Needs attention.
deliveryOf['ghl-1'] = 'delivered'; deliveryOf['ghl-2'] = 'failed';
let list = await S('medicaidSends', { person });
ok(list.messages.length === 3 && list.messages.find(m => m.channel === 'sms' && m.status === 'sent').delivery === 'delivered', 'delivered read back');
ok(list.messages.find(m => m.channel === 'email').delivery === 'failed', 'failed delivery read back');
let tasks = (await S('tasks', {})).tasks.filter(t => t.kind === 'medicaid_failed');
ok(tasks.length === 1 && /Pat Example/.test(tasks[0].title), 'failed delivery is a Needs attention task');
// A send that fails at GoHighLevel.
failNext = true;
r = await S('medicaidSend', { person: { kind: 'lead', id: 'l-fict-2', name: 'Lee Sample' }, channel: 'sms', to: '4175550188', body });
ok(r.message.status === 'failed' && /invalid phone/.test(r.message.error), 'failed send recorded with the reason');
tasks = (await S('tasks', {})).tasks.filter(t => t.kind === 'medicaid_failed');
ok(tasks.length === 2, 'failed send is a Needs attention task');
// The after-call message: same sender and records, no duplicate warning.
r = await S('callFollowupSend', { person, channel: 'sms', to: '4175550177', body: "Hi Linda, thank you for calling about Pat. We'll call you back." });
ok(r.message.status === 'sent' && (await pg.query(`select template from cds_outbox where id=$1`, [r.message.id])).rows[0].template === 'call_followup', 'after-call text sent and recorded');
r = await S('callFollowupSend', { person, channel: 'sms', to: '4175550177', body: "Hi Linda, thank you again. We'll call you back." });
ok(r.message.status === 'sent', 'after-call texts never warn as duplicates');
await refuses(() => S('callFollowupSend', { person, channel: 'sms', to: '4175550177', body: 'Her ME code is 13.' }), /ME code/, 'after-call: identifiers stopped');
// Safeguard 6 and input checks.
await refuses(() => S('medicaidSend', { person, channel: 'sms', to: '4175550177', body: body + '\nHer DCN is 12345678', ids: { dcn: '12345678' }, force: true }), /DCN|Medicaid number/, 'DCN stopped');
await refuses(() => S('medicaidSend', { person, channel: 'sms', to: '4175550177', body: body + '\nShe is not eligible because of managed care.', force: true }), /eligibility details/, 'eligibility details stopped');
await refuses(() => S('medicaidSend', { person, channel: 'sms', to: '123', body }), /cell phone/, 'bad phone');
await refuses(() => S('medicaidSend', { person: { kind: 'x' }, channel: 'sms', to: '4175550177', body }), /Pick the lead/, 'needs a person');
await refuses(() => M.handle('staff', 'medicaidSend', { person, channel: 'sms', to: '4175550177', body }), /sign in|staff list/i, 'staff only');
// Practice mode never sends.
M = createMatch(base);
r = await M.handle('staff', 'medicaidSend', { staff: 'samantha@mo-care.com', person: { kind: 'lead', id: 'l-3', name: 'X' }, channel: 'sms', to: '4175550199', body });
ok(r.message.status === 'practice', 'practice mode');
// Audit rows.
ok((await pg.query(`select count(*)::int n from cds_audit where action like 'medicaid_instructions_%'`)).rows[0].n >= 4, 'every send audited');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
