// CDS attendant packet: end to end on a local Postgres copy with practice plumbing.
// Runs the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/attendant_packet_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
const P = await import(ROOT + '/supabase/functions/_shared/packet/rules.js');
const F = await import(ROOT + '/supabase/functions/_shared/packet/forms.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const refuses = async (fn, re, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

const pg = new PGlite();
const db = { query: (s, p) => pg.query(s, p) };
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(`insert into cds_match_settings (key, value, updated_by) values ('lead_alerts', '{"recipients":[{"name":"Samantha","email":"s@x.test","phone":"+14175550001"},{"name":"Krystal","email":"k@x.test","phone":"+14175550002"},{"name":"Zach","email":"z@x.test","phone":"+14175550003"}]}'::jsonb, 't') on conflict (key) do nothing`);
await pg.exec(strip(readFileSync(ROOT + '/oig_check.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'packet SQL runs twice');

// ---------- lockdown ----------
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
ok(!(await can('anon', 'select * from cds_packets')) && !(await can('authenticated', 'select * from cds_packets')), 'nobody outside reads packets');
ok(!(await can('anon', 'select * from cds_packet_forms')) && !(await can('authenticated', 'select * from cds_packet_forms')), 'nobody outside reads signed forms');
const alerts = (await pg.query(`select value from cds_match_settings where key='packet_alerts'`)).rows[0].value;
ok(alerts.live === false && alerts.recipients.length === 3 && alerts.recipients.map(r => r.name).join() === 'Samantha,Krystal,Zach', 'alert list copied from lead alerts (no phones in the file), switched off');

const match = createMatch(practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' }));
const H = (role, a, i) => match.handle(role, a, i);
const S = (a, i) => H('staff', a, { staff: 'samantha@mo-care.com', ...i });
const outbox = async () => (await pg.query(`select * from cds_outbox order by created_at, id`)).rows;
const tokenOf = link => new URL(link).searchParams.get('c');

const run = (await pg.query(`insert into cds_oig_runs (status, file_month, row_count, finished_at) values ('done','2026-10',2,now()) returning id`)).rows[0].id;
await pg.query(`insert into cds_oig_leie (run_id, last_name, first_name, dob, state, last_keys, first_key) values ($1,'COLE','BRENDA','1980-01-01','MO','{cole}','brenda'), ($1,'SMITH','JOHN',null,'MO','{smith}','john')`, [run]);
await pg.query(`update cds_match_settings set value = jsonb_set(value, '{live}', 'true') where key='oig_check'`);
// ---------- the public link ----------
await refuses(() => H('public', 'applyStart', { first_name: 'Jordan', last_name: 'Ellis', phone: '417-555-0142', email: 'j@x.test' }), /who you will care for/, 'consumer name required');
await refuses(() => H('public', 'applyStart', { consumer_name: 'Ruth Ellis', first_name: 'Jordan', last_name: 'Ellis', phone: '555-0142', email: 'j@x.test' }), /10-digit/, 'phone checked');
const st = await H('public', 'applyStart', { consumer_name: 'Ruth Ellis', first_name: 'Jordan', last_name: 'Ellis', phone: '(417) 555-0142', email: 'J@X.test' });
ok(st.ok && /[?&]c=/.test(st.link), 'new attendant gets their private link on screen');
const link = tokenOf(st.link);
const pool = (await pg.query(`select * from attendant_pool where first_name='Jordan'`)).rows[0];
ok(pool.source === 'apply' && pool.knows_consumer === 'Ruth Ellis' && pool.email === 'j@x.test', 'attendant_pool row made (source apply)');
const tasks0 = (await pg.query(`select * from cds_tasks where pool_id=$1`, [pool.id])).rows;
ok(tasks0.length === 0, 'no "call to say hello" to-do for the office (admin-light)');
const ob0 = await outbox();
ok(ob0.length === 1 && ob0[0].template === 'packet_att_link' && ob0[0].status === 'practice', 'a copy of the link is texted (practice)');
const repeat = await H('public', 'applyStart', { consumer_name: 'Ruth Ellis', first_name: 'Someone', last_name: 'Else', phone: '4175550142', email: 'x@x.test' });
ok(repeat.repeat && !repeat.link, 'same phone again: no link on screen, it goes to the phone on file');

// ---------- Step 1 ----------
let v = await H('caregiver', 'packet', { link });
ok(v.step === 1 && v.consumer === 'Ruth Ellis' && v.answers.first === 'Jordan' && v.docs.application && !v.docs.contract, 'packet opens at Step 1; Step 2 documents not shown yet');
await refuses(() => H('caregiver', 'packetSign', { link, form: 'application', typed_name: 'Jordan Ellis', agree: true }), /sign electronically/, 'no signing before e-sign consent');
await H('caregiver', 'packetEsign', { link, ip: '1.2.3.4', agent: 'test' });
await refuses(() => H('caregiver', 'packetSign', { link, form: 'application', typed_name: 'Jordan Ellis', agree: true }), /please add/, 'application refuses while answers are missing');
await H('caregiver', 'packetSave', { link, answers: { relation: 'spouse', related: 'yes', street: '1 Main', city: 'Springfield', zip: '65806', qualified: 'yes', list: 'join' } });
v = await H('caregiver', 'packet', { link });
ok(v.missing.application.some(m => /spouse/.test(m)), 'spouse is stopped');
await H('caregiver', 'packetSave', { link, answers: { relation: 'grandchild', evil: 'x', ssn: '123456789',
  jobs: [{ co: 'Price Cutter', sup: 'Dana', ph: '4175550190' }, { co: 'Golden Years', sup: 'Pat', ph: '4175550177' }, { co: 'Walmart', sup: 'Lee', ph: '4175550111' }],
  refs: [{ name: 'Kelly Hart', rel: 'Friend', ph: '4175550123' }, { name: 'Tom Bell', rel: 'Pastor', ph: '4175550133' }],
  convicted: 'no', gcw: 'no', fcsr: 'no', mo_only: 'mo', tasks: ['Laundry', 'Not a task'] } });
const saved = (await pg.query(`select answers, list_choice from cds_packets where pool_id=$1`, [pool.id])).rows[0];
ok(!('evil' in saved.answers) && !('ssn' in saved.answers) && saved.answers.tasks.join() === 'Laundry' && saved.list_choice === 'join', 'only allowed answers are stored, never an SSN');
await H('caregiver', 'packetSave', { link, answers: { gender: 'f', addrs: [{ a: '1 Main, Springfield', d: '2022 to now' }] } });
v = await H('caregiver', 'packet', { link });
ok(v.missing.application.length === 0, 'application complete -> ' + v.missing.application.join('; '));
await refuses(() => H('caregiver', 'packetSign', { link, form: 'application', typed_name: 'Jordan', agree: true }), /full name/, 'one-word signature refused');
await H('caregiver', 'packetSign', { link, form: 'application', typed_name: 'Jordan Ellis', agree: true, ip: '1.2.3.4', agent: 'test' });
const f1 = (await pg.query(`select * from cds_packet_forms where pool_id=$1 and form_key='application'`, [pool.id])).rows[0];
ok(f1 && f1.version === F.FORMS.application.version && /^[0-9a-f]{64}$/.test(f1.fingerprint) && f1.answers.refs.length === 2, 'application saved on its own, with version, fingerprint and the answers signed');
await refuses(() => pg.query(`update cds_packet_forms set signed_name='Someone Else' where id=$1`, [f1.id]), /cannot be changed/, 'signed form cannot be changed');
await refuses(() => pg.query(`delete from cds_packet_forms where id=$1`, [f1.id]), /cannot be deleted/, 'signed form cannot be deleted');
await refuses(() => H('caregiver', 'packetSave', { link, answers: { city: 'Nixa' } }), /already signed/, 'answers frozen after signing');
await refuses(() => H('caregiver', 'packetSign', { link, form: 'background', typed_name: 'Jordan Ellis', agree: true }), /date of birth/, 'background form needs the date of birth and SSN first');
await refuses(() => H('caregiver', 'packetIdentity', { link, dob: '1999-05-02', ssn: '912345678', ssn2: '912345670' }), /do not match/, 'SSN typed twice must match');
await refuses(() => H('caregiver', 'packetIdentity', { link, dob: '2012-05-02', ssn: '912345678', ssn2: '912345678' }), /at least 18/, 'under 18 refused');
await refuses(() => H('caregiver', 'packetIdentity', { link, dob: '1999-05-02', ssn: '123456789', ssn2: '123456789' }), /starts with 9/, 'practice never takes a real-looking SSN');
await H('caregiver', 'packetIdentity', { link, dob: '1999-05-02', ssn: '912-34-5678', ssn2: '912345678' });
const scr = (await pg.query(`select * from cds_screening where pool_id=$1`, [pool.id])).rows[0];
const sec = (await pg.query(`select * from cds_screening_secret where pool_id=$1`, [pool.id])).rows[0];
ok(scr.ssn_last4 === '5678' && scr.legal_first === 'Jordan' && sec && !String(sec.ssn_ciphertext).includes('912345678'), 'SSN sealed in the screening record, only last 4 visible');
await refuses(() => H('caregiver', 'packetSign', { link, form: 'contract', typed_name: 'Jordan Ellis', agree: true }), /checks are clear/, 'Step 2 forms refused before checks are clear');
// answers frozen after application? background answers are saved before signing the application in the real page; here use SQL to add them
await H('caregiver', 'packetSign', { link, form: 'background', typed_name: 'Jordan Ellis', agree: true });
const pk = (await pg.query(`select * from cds_packets where pool_id=$1`, [pool.id])).rows[0];
ok(!!pk.step1_signed_at && pk.reminders.length === 2 && pk.reminders.every(r => r.kind === 'orientation'), 'Step 1 done: orientation reminders set (2)');
const scr2 = (await pg.query(`select * from cds_screening where pool_id=$1`, [pool.id])).rows[0];
ok(!!scr2.authorization_signed_at && !!scr2.reg_needed_at, 'background signature = screening authorization; FCSR registration flagged as needed');
const oigRow = (await pg.query(`select * from cds_screening_checks where pool_id=$1 and check_key='oig'`, [pool.id])).rows;
ok(oigRow.length === 1 && oigRow[0].result === 'clear' && oigRow[0].recorded_by === 'oig-automatic', 'OIG ran itself at Step 1: clear, recorded');
ok((await pg.query(`select count(*)::int n from cds_oig_results where person_ref=$1`, ['pool:' + pool.id])).rows[0].n === 1, 'OIG result saved for the audit trail');
const t1 = (await pg.query(`select * from cds_tasks where pool_id=$1`, [pool.id])).rows;
ok(t1.length === 1 && /Run EDL and FCSR for Jordan Ellis/.test(t1[0].title) && t1[0].due_at, 'office to-do: run EDL and FCSR, due next business day 4pm');
const ob1 = (await outbox()).filter(o => o.pool_id === pool.id);
const office = ob1.filter(o => o.audience === 'office');
ok(office.filter(o => o.channel === 'email').length === 3, 'office alert emailed to Samantha, Krystal, Zach');
ok(office.every(o => /OIG: clear, checked automatically/.test(o.body)), 'office alert says OIG is already clear');
ok(office.every(o => o.status === 'practice') && office.every(o => !o.body.includes('912')), 'office alerts practice only, never an SSN');
const after = ob1.filter(o => o.template === 'packet_att_after_step1');
ok(after.length === 2 && after.every(o => /orientation/.test(o.body) && /handbook/.test(o.body)), 'attendant gets orientation + handbook by text and email');
ok(!JSON.stringify(ob1).includes('—'), 'no em dashes in any message');
v = await H('caregiver', 'packet', { link });
ok(v.step === 'checks' && v.signed.application && v.signed.background, 'attendant sees: waiting on checks');

// ---------- office view + copy buttons ----------
const list = (await S('packetList', {})).attendants;
const me = list.find(a => a.name === 'Jordan Ellis');
ok(me && me.label === 'Run EDL and FCSR' && me.tone === 'r', 'office list: Run EDL and FCSR');
const g = await S('packetGet', { pool_id: pool.id });
ok(g.forms.application.signed_name === 'Jordan Ellis' && !JSON.stringify(g).includes('ssn_ciphertext') && g.answers.other_ssn_sealed === undefined, 'office profile: forms listed, nothing sealed shown ' + JSON.stringify(Object.keys(g.forms)));
const cp = await S('packetCopy', { pool_id: pool.id, kind: 'fcsr' });
ok(cp.fields.find(f => f.label === 'Date of birth').value === '1999-05-02' && !JSON.stringify(cp).includes('912345678'), 'Copy for FCSR has the fields, never the full SSN');
await refuses(() => S('packetMark', { pool_id: pool.id, what: 'i9_done' }), /not clear/, 'I-9 cannot be marked before checks are clear');

// ---------- checks clear (office records them the existing way) ----------
const now = (await pg.query(`select (now() at time zone 'America/Chicago')::date as d`)).rows[0].d;
await pg.query(`update cds_screening set reg_verified_at=now(), reg_verified_by='t', screen_requested_at=now(), screen_result_at=now(), screen_result='no_findings' where pool_id=$1`, [pool.id]);
for (const k of ['edl', 'edr', 'mo_medicaid'])
  await pg.query(`insert into cds_screening_checks (pool_id, check_key, result, checked_on, recorded_by) values ($1,$2,'clear',$3,'t')`, [pool.id, k, now]);
const age = (await pg.query(`select * from cds_screening_checks where pool_id=$1 and check_key='age18'`, [pool.id])).rows;
ok(age.length === 1 && age[0].recorded_by === 'packet', 'age 18 recorded by itself from the date of birth');
let job = await H('job', 'packetJob', {});
ok(job.step2_opened === 1, 'checks clear (except the ID match) -> Step 2 opens');
const ob2 = (await outbox()).filter(o => o.template === 'packet_att_step2_open');
ok(ob2.length === 2 && ob2.every(o => /book your 5-minute ID check|5-minute video call/.test(o.body)), 'attendant told by text and email');
const t2 = (await pg.query(`select title from cds_tasks where pool_id=$1 and kind='packet_empeon'`, [pool.id])).rows;
ok(t2.length === 1 && /Empeon invite/.test(t2[0].title), 'office to-do: send the Empeon invite');
job = await H('job', 'packetJob', {});
ok(job.step2_opened === 0, 'Step 2 opening is announced only once');
v = await H('caregiver', 'packet', { link });
ok(v.step === 2 && v.docs.contract && v.call_slots.length >= 5, 'Step 2 documents and call times now shown');
ok(!JSON.stringify(v.docs).includes('{consumer}') && JSON.stringify(v.docs.pay).includes('Ruth Ellis'), 'names filled into the documents');

// ---------- Step 2 ----------
await refuses(() => H('caregiver', 'packetSign', { link, form: 'contract', typed_name: 'Jordan Ellis', agree: true, initials: { 1: 'JE' } }), /initials after every part/, 'contract needs initials after all 13 parts');
const ini = Object.fromEntries(F.CONTRACT_PARTS.map(p => [p, 'je']));
for (const form of ['contract', 'pay', 'units', 'handbook']) await H('caregiver', 'packetSign', { link, form, typed_name: 'Jordan Ellis', agree: true, initials: ini });
const pk2 = (await pg.query(`select * from cds_packets where pool_id=$1`, [pool.id])).rows[0];
const cf = (await pg.query(`select initials from cds_packet_forms where pool_id=$1 and form_key='contract'`, [pool.id])).rows[0];
ok(!!pk2.step2_signed_at && cf.initials['13'] === 'JE', 'all 4 Step 2 forms signed, initials kept');
await refuses(() => H('caregiver', 'packetBookCall', { link, slot: '2099-01-01 09:30' }), /times shown/, 'only offered call times');
const bk = await H('caregiver', 'packetBookCall', { link, slot: v.call_slots[0].value });
ok(bk.ok && (await pg.query(`select count(*)::int n from cds_tasks where pool_id=$1 and kind='packet_call'`, [pool.id])).rows[0].n === 1, 'call booked -> office to-do with the time');
await H('caregiver', 'packetSelf', { link, what: 'empeon' });
await H('caregiver', 'packetSelf', { link, what: 'orientation' });
let s1 = (await S('packetGet', { pool_id: pool.id })).status;
ok(s1.label === 'Send Empeon invite', 'office: next is the Empeon invite (' + s1.label + ')');
await S('packetMark', { pool_id: pool.id, what: 'empeon_invited' });
s1 = (await S('packetGet', { pool_id: pool.id })).status;
ok(s1.label === 'ID check booked' && /5-minute ID check/.test(s1.next), 'office: ID check booked');
await S('packetMark', { pool_id: pool.id, what: 'id_checked' });
s1 = (await S('packetGet', { pool_id: pool.id })).status;
ok(s1.label === 'Finish in Empeon' && /I-9 Section 2/.test(s1.next) && /countersign/.test(s1.next), 'office: I-9 Section 2 and countersign left (' + s1.next + ')');
const open = (await pg.query(`select kind from cds_tasks where pool_id=$1 and done_at is null`, [pool.id])).rows.map(r => r.kind);
ok(open.length === 0, 'office to-dos closed themselves as steps were done (open: ' + open.join(',') + ')');
await S('packetMark', { pool_id: pool.id, what: 'i9_done' });
await refuses(() => S('packetCountersign', { pool_id: pool.id, typed_name: 'Samantha' }), /full name/, 'countersign needs a full name');
await S('packetCountersign', { pool_id: pool.id, typed_name: 'Samantha Troutman' });
await refuses(() => S('packetCountersign', { pool_id: pool.id, typed_name: 'Samantha Troutman' }), /no signed contract waiting/, 'countersign only once');
const fin = await S('packetGet', { pool_id: pool.id });
ok(fin.status.active && fin.status.label === 'Active' && !!fin.packet.active_at, 'turns Active by itself after the last step');
ok(/Approve their profile/.test(fin.status.next), 'listed path: reminds the office to approve the profile (one tap)');

// ---------- reminders ----------
const st2 = await H('public', 'applyStart', { consumer_name: 'Gene Porter', first_name: 'Brenda', last_name: 'Cole', phone: '4175550105', email: 'b@x.test' });
const bpool = (await pg.query(`select id from attendant_pool where first_name='Brenda'`)).rows[0].id;
await pg.query(`update cds_packets set reminders = jsonb_build_array(jsonb_build_object('kind','step1','due_at', now() - interval '1 minute')) where pool_id=$1`, [bpool]);
job = await H('job', 'packetJob', {});
const hr = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
const daytime = hr >= 9 && hr < 19;
const rem = (await pg.query(`select reminders from cds_packets where pool_id=$1`, [bpool])).rows[0].reminders[0];
ok(daytime ? (job.reminders === 1 && !!rem.sent_at) : (job.reminders === 0 && !rem.sent_at), 'Step 1 reminder sent only in the daytime (' + (daytime ? 'day' : 'night') + ')');
await pg.query(`update cds_packets set step1_signed_at=null, reminders = jsonb_build_array(jsonb_build_object('kind','orientation','due_at', now() - interval '1 minute')), orientation_done_at=now() where pool_id=$1`, [bpool]);
job = await H('job', 'packetJob', {});
const rem2 = (await pg.query(`select reminders from cds_packets where pool_id=$1`, [bpool])).rows[0].reminders[0];
ok(rem2.sent_at === 'not needed', 'orientation reminder skipped when the orientation is already done');

// ---------- rules ----------
ok(P.applicationMissing({}).length > 3, 'empty application lists what is missing');
ok(P.callSlots('2026-10-23T15:00:00Z').every(sl => !/Sat|Sun/.test(sl.label)), 'no weekend call times');
const forms = F.FORMS;
ok(Object.values(forms).every(f => !JSON.stringify(f.doc).includes('—')), 'no em dashes in any document');
ok(JSON.stringify(forms).includes('Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care') && !/DBA Caring Companions"/.test(JSON.stringify(forms)), 'company name as she corrected it');
ok(JSON.stringify(forms.contract.doc).includes('$15.00 to $16.00') && JSON.stringify(forms.pay.doc).includes('every Thursday'), 'pay wording as she approved');

console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
