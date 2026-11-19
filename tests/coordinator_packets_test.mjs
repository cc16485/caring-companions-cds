// The Coordinator's packet doors in cds-match (2026-11-18): coordEnrollSend and coordAttendantSend run the SAME code as
// the hub's buttons, only on the schedule's secret (role 'job'), and never send a packet twice. Real SQL, practice plumbing.
//   node tests/coordinator_packets_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
let pass = 0, failN = 0;
const ok = (c, m, x) => { if (c) pass++; else { failN++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const pg = new PGlite();
const db = { query: (s, p) => pg.query(s, p) };
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
for (const f of ['cds_public_insert_lock', 'caregiver_match_phase1', 'caregiver_signup_alert']) await pg.exec(strip(readFileSync(ROOT + '/' + f + '.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
for (const f of ['oig_check', 'attendant_packet', 'id_room', 'fcsr_waiver', 'consumer_packet']) await pg.exec(strip(readFileSync(ROOT + '/' + f + '.sql', 'utf8')));
const match = createMatch(practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' }));
const J = (a, i) => match.handle('job', a, i);
const one = async (s, p) => (await pg.query(s, p)).rows[0];

// The consumer packet, as the Coordinator sends it.
const lead = { id: 'consumer-C2', type: 'lead', name: 'Robin Sample', phone: '(417) 555-0143', email: 'robin@example.com' };
let r = await J('coordEnrollSend', { lead, consumer_id: 'C2' });
ok(r.ok && !r.already && r.status === 'practice' && r.messages.length === 2, 'sent: a text and an email', r);
const p = await one(`select * from cds_enroll_packets where lead_id = 'consumer-C2'`);
ok(p && p.sent_at && p.sent_by === 'cds-coordinator' && p.consumer_id === 'C2' && p.answers.first === 'Robin' && p.answers.last === 'Sample', 'the same packet row the hub button makes, tied to the consumer', p && p.answers);
ok((p.reminders || []).length === 2, 'the day 2 and day 4 reminders are set, as from the hub');
r = await J('coordEnrollSend', { lead, consumer_id: 'C2' });
ok(r.ok && r.already, 'never twice');
r = await J('coordEnrollSend', { lead: { ...lead, id: 'L-other' }, consumer_id: 'C2' });
ok(r.ok && r.already, 'never twice, even under another lead for the same consumer');
ok((await one(`select count(*)::int as n from cds_outbox where template = 'enroll_link'`)).n === 2, 'only the first send wrote messages');

// The attendant application, as the Coordinator sends it.
r = await J('coordAttendantSend', { name: 'Ann Sample', phone: '4175550160', email: '', consumer: 'Robin Sample' });
ok(r.ok && !r.already && r.pool_id, 'attendant added to Onboarding for the consumer and the link texted', r);
const k = await one(`select k.consumer_name, a.first_name, a.last_name from cds_packets k join attendant_pool a on a.id = k.pool_id where k.pool_id = $1`, [r.pool_id]);
ok(k && k.consumer_name === 'Robin Sample' && k.first_name === 'Ann' && k.last_name === 'Sample', 'the same rows as Add attendant', k);
const pool = r.pool_id;
await pg.query(`update cds_outbox set status = 'sent' where pool_id = $1 and template = 'packet_att_link'`, [pool]);   // live: it went
r = await J('coordAttendantSend', { name: 'Ann Sample', phone: '417-555-0160', email: '', consumer: 'Robin Sample' });
ok(r.ok && r.already && r.pool_id === pool, 'never twice: a link already texted is not texted again', r);

// Only the schedule's secret reaches these (the edge function checks it for role 'job'); nobody else can.
for (const role of ['staff', 'public', 'consumer', 'caregiver', 'family']) {
  let refused = false; try { await match.handle(role, 'coordEnrollSend', { lead, staff: 'x@example.com' }); } catch { refused = true; }
  ok(refused, 'role ' + role + ' cannot reach coordEnrollSend');
}
const idx = readFileSync(ROOT + '/supabase/functions/cds-match/index.ts', 'utf8');
ok(/role === 'job'[\s\S]{0,200}x-cron-secret/.test(idx), 'cds-match checks the schedule secret for role job');

// The new SQL runs twice on top of the Coordinator's tables.
for (const f of ['coordinator', 'coordinator_hands', 'coordinator_chat', 'coordinator_journey', 'coordinator_lead_texts', 'coordinator_jobs', 'coordinator_jobs', 'coordinator_replies', 'coordinator_replies', 'coordinator_paper', 'coordinator_paper'].filter((x, i, a) => true)) {
  try { await pg.exec(strip(readFileSync(ROOT + '/' + f + '.sql', 'utf8'))); ok(true, f + '.sql runs'); } catch (e) { ok(false, f + '.sql: ' + e.message); }
}
await pg.query(`insert into cds_coord_items (key, person_kind, person_id, kind, status) values ('a','consumer','C1','contact','suggested'), ('b','consumer','C1','need_contact','open')`);
await pg.query(`insert into cds_coord_msgs (key, kind, person_kind, person_id, phone, body, status, data) values ('packet:C1','packet','consumer','C1','','x','draft','{"lead":{}}'::jsonb)`);
ok(true, 'the new kinds save');
let bad = false; try { await pg.query(`insert into cds_coord_msgs (key, kind, person_kind, person_id, phone, body, status) values ('z','nope','consumer','C1','','x','draft')`); } catch { bad = true; }
ok(bad, 'an unknown kind is still refused');
await pg.query(`insert into cds_coord_msgs (key, kind, person_kind, person_id, phone, body, status) values ('reply:x','reply','consumer','C1','4175550142','x','draft')`);
ok((await one(`select value from cds_match_settings where key = 'coordinator_texts'`)).value.live === false, 'answers save; the texts switch starts off');
await pg.query(`insert into cds_coord_msgs (key, kind, person_kind, person_id, phone, body, status) values ('fax:x','fax','consumer','C1','','x','draft')`);
await pg.query(`insert into cds_coord_items (key, person_kind, person_id, kind, status) values ('sd','consumer','C1','state_doc','open')`);
ok((await one(`select value from cds_match_settings where key = 'fax_sends'`)).value.live === false, 'fax drafts and state notes save; the fax switch starts off');
ok((await one(`select value from cds_match_settings where key = 'packet_sends'`)).value.live === false, 'the switch starts off');
console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
