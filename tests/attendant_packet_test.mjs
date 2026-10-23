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
const GCW_SQL = strip(readFileSync(ROOT + '/fcsr_waiver.sql', 'utf8'));
await pg.exec(GCW_SQL); await pg.exec(GCW_SQL);
ok(true, 'FCSR waiver SQL runs twice');

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
ok(t1.length === 1 && /^Consumer waiting: Run EDL and FCSR for Jordan Ellis/.test(t1[0].title) && t1[0].due_at, 'office to-do is marked Consumer waiting');
{ const hrs = (new Date(t1[0].due_at) - Date.now()) / 36e5; ok(hrs > 0 && hrs <= 72, 'urgent: due today 4pm or the next weekday at noon (' + hrs.toFixed(1) + ' hr)'); }
const inMatch = (await S('caregivers', {})).caregivers.map(c => c.first_name);
ok(inMatch.includes('Jordan'), 'an applicant who chose "list me" is in Caregiver Match');
const ob1 = (await outbox()).filter(o => o.pool_id === pool.id);
const office = ob1.filter(o => o.audience === 'office');
ok(office.filter(o => o.channel === 'email').length === 3, 'office alert emailed to Samantha, Krystal, Zach');
ok(office.every(o => /OIG: clear, checked automatically/.test(o.body)), 'office alert says OIG is already clear');
ok(office.every(o => o.status === 'practice') && office.every(o => !o.body.includes('912')), 'office alerts practice only, never an SSN');
ok(office.every(o => /^Consumer waiting: Step 1 signed/.test(o.body)), 'alert subject starts with Consumer waiting');
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
ok(!(await S('caregivers', {})).caregivers.some(c => c.first_name === 'Brenda'), 'an applicant with a consumer who has not chosen "list me" stays out of Caregiver Match');
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

// ---------- FCSR came back with something (2026-10-23) ----------
const PDF = { mime: 'application/pdf', data: 'data:application/pdf;base64,JVBERg==' };
const sign1 = async id => {
  for (const k of ['application', 'background']) await pg.query(`insert into cds_packet_forms (pool_id, form_key, version, fingerprint, signed_name) values ($1,$2,'t','x','Test Person')`, [id, k]);
  await pg.query(`update cds_packets set step1_signed_at=now(), reminders='[]'::jsonb where pool_id=$1`, [id]);
  await pg.query(`update cds_screening set authorization_signed_at=now() where pool_id=$1`, [id]);
  await pg.query(`insert into cds_screening_secret (pool_id, ssn_ciphertext) values ($1,'x') on conflict do nothing`, [id]);
};
await sign1(bpool);
await refuses(() => S('packetFcsr', { pool_id: bpool, result: 'finding', kind: 'gcw_needed', notify: 'send' }), /result page/, 'a finding needs the FCSR result page');
await refuses(() => S('packetFcsr', { pool_id: bpool, result: 'finding', kind: 'maybe', notify: 'send', proof: PDF }), /Pick which/, 'only the three picks');
await refuses(() => S('packetFcsr', { pool_id: bpool, result: 'finding', kind: 'gcw_needed', proof: PDF }), /how they hear/, 'the office picks send or told by phone');
await pg.query(`update cds_tasks set done_at=null where pool_id=$1`, [bpool]);
await H('staff', 'packetFcsr', { staff: 'krystal@mo-care.com', pool_id: bpool, result: 'finding', kind: 'gcw_needed', notify: 'send', proof: PDF });
const bs = (await pg.query(`select * from cds_screening where pool_id=$1`, [bpool])).rows[0];
ok(bs.screen_result === 'findings' && bs.finding_review === 'gcw_needed' && bs.finding_notice === 'sent' && !!bs.reg_verified_at && !!bs.screen_proof, 'finding recorded: waiver needed, one proof covers registration and result');
ok(!(await pg.query(`select 1 from cds_screening_secret where pool_id=$1`, [bpool])).rows.length, 'full SSN not kept once the result is in');
const gob = (await outbox()).filter(o => o.template === 'packet_att_fcsr_gcw' && o.pool_id === bpool);
ok(gob.length === 2 && gob.some(o => o.channel === 'sms' && /one more step before you can start working for Gene Porter/.test(o.body) && !/FCSR|waiver|EDL/i.test(o.body)), 'text says one more step, never what came up');
ok(gob.some(o => o.channel === 'email' && /Good Cause Waiver/.test(o.body) && /health\.mo\.gov\/providers\/good-cause-waiver/.test(o.body) && /PO Box 570/.test(o.body) && /Gene Porter/.test(o.body)), 'email has the waiver steps, forms and address');
ok(gob.every(o => o.status === 'practice') && !JSON.stringify(gob).includes('—'), 'practice mode, no em dashes');
const call = (await pg.query(`select title, due_at from cds_tasks where pool_id=$1 and kind='packet_consumer_call' and done_at is null`, [bpool])).rows;
ok(call.length === 1 && /^Call Gene Porter: Brenda Cole can't start yet/.test(call[0].title) && !!call[0].due_at, 'to-do: the office calls the consumer (nothing sent to the consumer)');
ok(!(await outbox()).some(o => o.audience === 'consumer' || /Gene Porter/.test(o.to_display || '')), 'no message to the consumer');
let bg = await S('packetGet', { pool_id: bpool });
ok(!(await S('packetList', {})).attendants.find(a => a.pool_id === bpool).consumer_waiting, 'waiting on a waiver is not marked urgent');
ok(bg.status.label === 'Waiting on Good Cause Waiver' && bg.status.tone === 'y' && !bg.status.step2Open && bg.screening.review === 'gcw_needed', 'status: waiting on the waiver, Step 2 stays locked');
await refuses(() => H('caregiver', 'packetSign', { link: 'x', form: 'contract' }), /./, 'no Step 2 signing (no link)');
await refuses(() => S('packetFcsr', { pool_id: bpool, result: 'clear', proof: PDF }), /already recorded/, 'a recorded finding cannot be overwritten with clear');
const brem = (await pg.query(`select reminders from cds_packets where pool_id=$1`, [bpool])).rows[0].reminders;
ok(brem.length === 1 && brem[0].kind === 'gcw' && new Date(brem[0].due_at) - Date.now() > 20 * 864e5, 'one waiver reminder text set for 3 weeks out');
// two weeks later: a status check to-do; three weeks: the reminder text
await pg.query(`update cds_screening set finding_reviewed_at = now() - interval '15 days' where pool_id=$1`, [bpool]);
await pg.query(`update cds_packets set reminders = jsonb_build_array(jsonb_build_object('kind','gcw','due_at', now() - interval '1 minute')) where pool_id=$1`, [bpool]);
job = await H('job', 'packetJob', {}); job = await H('job', 'packetJob', {});
const gst = (await pg.query(`select title from cds_tasks where pool_id=$1 and kind='packet_gcw_status'`, [bpool])).rows;
ok(gst.length === 1 && /Good Cause Waiver status/.test(gst[0].title), 'every 2 weeks: one "check the waiver status" to-do');
const grem = (await outbox()).filter(o => o.template === 'packet_att_gcw_reminder' && o.pool_id === bpool);
ok(daytime ? grem.length === 1 && /approval letter/.test(grem[0].body) : grem.length === 0, 'waiver reminder text once, daytime only');
await pg.query(`update cds_screening set finding_reviewed_at = now() - interval '29 days' where pool_id=$1`, [bpool]);
await H('job', 'packetJob', {});
ok((await pg.query(`select count(*)::int n from cds_tasks where pool_id=$1 and kind='packet_gcw_status'`, [bpool])).rows[0].n === 2, 'a new status check after the next 2 weeks');
// the letter comes: the office decides
await refuses(() => S('packetWaiver', { pool_id: bpool, decision: 'clear' }), /approval letter/, 'clear needs the approval letter');
await refuses(() => S('packetWaiver', { pool_id: bpool, decision: 'not_moving' }), /reason/, 'not moving forward needs a reason');
const wv = await S('packetWaiver', { pool_id: bpool, decision: 'clear', proof: PDF });
ok(wv.ok && !(await pg.query(`select 1 from cds_tasks where pool_id=$1 and kind='packet_gcw_status' and done_at is null`, [bpool])).rows.length, 'waiver approved and cleared: status to-dos close');
const bs2 = (await pg.query(`select finding_review, gcw_letter from cds_screening where pool_id=$1`, [bpool])).rows[0];
ok(bs2.finding_review === 'cleared_waiver' && !!bs2.gcw_letter, 'the letter is kept as proof');
bg = await S('packetGet', { pool_id: bpool });
ok(!bg.screening.findings && bg.screening.screened && bg.status.label === 'Run EDL and FCSR', 'after the waiver the FCSR counts as clear; the other checks still show (' + bg.status.next + ')');
ok((await pg.query(`select 1 from cds_tasks where pool_id=$1 and kind='packet_checks' and done_at is null and title like 'Waiver approved%'`, [bpool])).rows.length === 1, 'other checks still open: a "finish the checks" to-do');
ok((await S('packetList', {})).attendants.find(a => a.pool_id === bpool).consumer_waiting === true, 'after the waiver they are urgent again (consumer waiting)');

// EDL: no waiver possible; told by phone; nothing sent
const st3 = await H('public', 'applyStart', { consumer_name: 'Ada Long', first_name: 'Carl', last_name: 'Diaz', phone: '4175550188', email: 'c@x.test' });
const cpool = (await pg.query(`select id from attendant_pool where first_name='Carl'`)).rows[0].id;
await sign1(cpool);
const before = (await outbox()).length;
await S('packetFcsr', { pool_id: cpool, result: 'finding', kind: 'edl', notify: 'phone', proof: PDF });
ok((await outbox()).length === before, 'told by phone: nothing sent');
const cg = await S('packetGet', { pool_id: cpool });
ok(cg.status.label === 'Cannot work in CDS (EDL)' && cg.screening.notice === 'phone', 'status: cannot work in CDS');
ok((await pg.query(`select title from cds_tasks where pool_id=$1 and kind='packet_consumer_call'`, [cpool])).rows[0].title.includes("can't be approved for CDS (on the EDL)"), 'to-do: call the consumer');
ok(!(await S('packetList', {})).attendants.find(a => a.pool_id === cpool).consumer_waiting, 'no longer marked consumer waiting');
await refuses(() => S('packetWaiver', { pool_id: cpool, decision: 'clear', proof: PDF }), /EDL cannot be cleared/, 'EDL cannot be cleared with a waiver');
await S('packetWaiver', { pool_id: cpool, decision: 'not_moving', reason: 'On the EDL' });
ok((await S('packetGet', { pool_id: cpool })).status.label === 'Not moving forward', 'office closes it: not moving forward');

// Not on the list: clear after review, nothing sent; pending: follow-up to-do
const st4 = await H('public', 'applyStart', { consumer_name: 'Bo Tran', first_name: 'Dee', last_name: 'Fox', phone: '4175550177', email: 'd@x.test' });
const dpool = (await pg.query(`select id from attendant_pool where first_name='Dee'`)).rows[0].id;
await sign1(dpool);
await S('packetFcsr', { pool_id: dpool, result: 'pending' });
ok((await pg.query(`select 1 from cds_tasks where pool_id=$1 and kind='fcsr_result' and done_at is null`, [dpool])).rows.length === 1, 'still pending: follow-up to-do');
const before2 = (await outbox()).length;
await S('packetFcsr', { pool_id: dpool, result: 'finding', kind: 'cleared_no_waiver', proof: PDF });
const dg = await S('packetGet', { pool_id: dpool });
ok((await outbox()).length === before2 && !dg.screening.findings && dg.screening.review === 'cleared_no_waiver' && dg.screening.screened, 'not on the list: clear after review, nothing sent');
ok(!(await pg.query(`select 1 from cds_tasks where pool_id=$1 and kind='fcsr_result' and done_at is null`, [dpool])).rows.length, 'follow-up to-do closed');
// Clear
const st5 = await H('public', 'applyStart', { consumer_name: 'Al Moe', first_name: 'Eve', last_name: 'Gray', phone: '4175550166', email: 'e@x.test' });
const epool = (await pg.query(`select id from attendant_pool where first_name='Eve'`)).rows[0].id;
await sign1(epool);
await refuses(() => S('packetFcsr', { pool_id: epool, result: 'clear' }), /result page/, 'clear needs the result page');
await S('packetFcsr', { pool_id: epool, result: 'clear', proof: PDF });
ok((await S('packetGet', { pool_id: epool })).screening.screened, 'clear recorded right on the profile');
ok(P.FINDING.gcw_needed && P.FINDING.edl && !JSON.stringify(P.FINDING).includes('—'), 'finding wording, no em dashes');

// ---------- rules ----------
ok(P.applicationMissing({}).length > 3, 'empty application lists what is missing');
ok(P.callSlots('2026-10-23T15:00:00Z').every(sl => !/Sat|Sun/.test(sl.label)), 'no weekend call times');
const forms = F.FORMS;
ok(Object.values(forms).every(f => !JSON.stringify(f.doc).includes('—')), 'no em dashes in any document');
ok(JSON.stringify(forms).includes('Troutman Enterprises, LLC DBA Caring Companions In-Home Senior Care') && !/DBA Caring Companions"/.test(JSON.stringify(forms)), 'company name as she corrected it');
ok(JSON.stringify(forms.contract.doc).includes('$15.00 to $16.00') && JSON.stringify(forms.pay.doc).includes('every Thursday'), 'pay wording as she approved');

// ---------- View and Print a signed form (2026-10-22) ----------
const fv = await S('packetFormView', { pool_id: pool.id, form: 'application' });
ok(fv.title === 'CDS Attendant Application' && fv.wording === 'exact' && fv.blocks.length > 0, 'the application comes back as signed, wording matches the fingerprint');
ok(fv.signed_name === 'Jordan Ellis' && fv.signed_ip === '1.2.3.4' && fv.signed_agent === 'test' && fv.signed_at, 'who signed, when, from where');
ok(fv.answers.some(sec => sec.h === 'References') && fv.answers.some(sec => sec.h === 'Work history'), 'their answers by section');
ok(!/\b\d{3}-?\d{2}-?\d{4}\b/.test(JSON.stringify(fv.answers)) && !/ssn|sealed|dob/i.test(JSON.stringify(fv.answers.map(s => s.rows.map(r => r[0])))), 'no SSN, date of birth or sealed field');
const fc = await S('packetFormView', { pool_id: pool.id, form: 'contract' });
ok(fc.initials && Object.keys(fc.initials).length === 13 && fc.blocks.some(b => b.h && /^1\./.test(b.h)), 'the contract shows its 13 initialed parts');
await refuses(() => S('packetFormView', { pool_id: pool.id, form: 'nope' }), /not signed/, 'an unknown form is refused');
await refuses(() => H('staff', 'packetFormView', { pool_id: pool.id, form: 'application' }), /sign in/i, 'not signed in: refused (live also checks the office staff list)');
ok((await pg.query(`select count(*)::int n from cds_audit where action='packet_form_viewed'`)).rows[0].n >= 2, 'each view is in the audit log');
const V = await import(ROOT + '/supabase/functions/_shared/packet/view.js');
ok(!JSON.stringify(V.answerSections({ first: 'A', last: 'B', other_ssn_sealed: 'x', ssn: '123456789', dob: '1990-01-01' })).match(/123456789|1990|sealed/), 'secret fields never shown, even if stored');

console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
