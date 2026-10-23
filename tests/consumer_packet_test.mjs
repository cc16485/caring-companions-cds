// CDS consumer enrollment packet: end to end on a local Postgres copy with practice plumbing.
// Runs the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/consumer_packet_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
const F = await import(ROOT + '/supabase/functions/_shared/enroll/forms.js');
const E = await import(ROOT + '/supabase/functions/_shared/enroll/handlers.js');
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
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(`insert into cds_match_settings (key, value, updated_by) values ('lead_alerts', '{"recipients":[{"name":"Samantha","email":"s@x.test","phone":"+14175550001"},{"name":"Krystal","email":"k@x.test","phone":"+14175550002"}]}'::jsonb, 't') on conflict (key) do nothing`);
await pg.exec(strip(readFileSync(ROOT + '/oig_check.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/fcsr_waiver.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/consumer_packet.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'consumer packet SQL runs twice');

// ---------- lockdown + switches ----------
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
for (const t of ['cds_enroll_packets', 'cds_enroll_links', 'cds_enroll_forms'])
  ok(!(await can('anon', 'select * from ' + t)) && !(await can('authenticated', 'select * from ' + t)), 'nobody outside reads ' + t);
const alerts = (await pg.query(`select value from cds_match_settings where key='enroll_alerts'`)).rows[0].value;
ok(alerts.live === false && alerts.recipients.map(r => r.name).join() === 'Samantha,Krystal', 'alert list copied from lead alerts, switched off');
ok((await pg.query(`select value from cds_match_settings where key='enroll_messages'`)).rows[0].value.live === false, 'consumer texts switched off');
ok(['enroll_alerts', 'enroll_messages'].every(k => SWITCHES.some(s => s.key === k)), 'both switches are on the Switches card');
ok(SWITCHES.find(s => s.key === 'enroll_messages').warn === 'This one reaches consumers.', 'consumer switch carries the warning');

// ---------- forms ----------
ok(F.formsFor('new').join() === 'vendor,numbers,evv,backup,ss4,f8821,f2678,mo2643a,mo2827', 'new to CDS: 9 forms (no Previous Vendor)');
ok(F.formsFor('move').join() === 'vendor,numbers,evv,backup,prev,f8821,f2678,mo2827', 'moving: Previous Vendor, no SS-4 or 2643A');
ok(F.consumerForms('new').length === 8 && !F.consumerForms('new').includes('mo2643a'), '2643A is signed by the office, as today');
ok(!F.ORDER.includes('training'), 'Training Acknowledgement is not in the packet (end of orientation)');
const allText = JSON.stringify([F.FORMS, F.AGENCY, F.ourDoc('backup', {}), F.ourDoc('vendor', {}), F.ourDoc('evv', {}), F.ourDoc('prev', {})]) + readFileSync(ROOT + '/supabase/functions/_shared/enroll/messages.js', 'utf8');
ok(!/—/.test(allText), 'no em dashes anywhere a person reads');
ok(/Ste B/.test(F.AGENCY.street) && !/Ste A/.test(allText), 'Suite B, never Ste A');
ok(/WellSky app/.test(JSON.stringify(F.ourDoc('evv', {}))), 'clocking in names the WellSky app');

// ---------- the office sends it ----------
const match = createMatch(practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' }));
const H = (role, a, i) => match.handle(role, a, i);
const S = (a, i) => H('staff', a, { staff: 'samantha@mo-care.com', ...i });
const C = (a, i) => H('consumer', a, { link, ...i });
const outbox = async () => (await pg.query(`select * from cds_outbox where template like 'enroll_%' order by created_at, id`)).rows;
const tokenOf = l => new URL(l).searchParams.get('c');

await refuses(() => H('staff', 'enrollSend', { lead: { id: 'L1' } }), /sign in/i, 'office only');
await refuses(() => S('enrollSend', { lead: { id: 'L1', name: 'Margaret Sample' } }), /phone or an email/, 'needs a way to reach them');
const lead = { id: 'L1', type: 'referral', name: 'Margaret Sample', phone: '417-555-0142', email: 'M@X.test', county: 'Greene', street: '1200 E Example St', city: 'Springfield', zip: '65804' };
const sent = await S('enrollSend', { lead });
ok(sent.ok && sent.status.label === 'Sent, waiting' && /caringcds\.com\/enroll\/\?c=/.test(sent.practice_link), 'Send enrollment packet works, link is on caringcds.com/enroll');
let link = tokenOf(sent.practice_link);
let ob = await outbox();
ok(ob.length === 2 && ob.every(m => m.status === 'practice' && m.audience === 'family') && ob.map(m => m.channel).sort().join() === 'email,sms', 'a text and an email to the consumer (practice)');
ok(!ob.some(m => /\d{3}-\d{2}-\d{4}/.test(m.body)) && ob.every(m => /•/.test(m.to_display)), 'messages masked, no SSN');
let p = (await pg.query(`select * from cds_enroll_packets where lead_id='L1'`)).rows[0];
ok(p.kind === 'new' && p.answers.first === 'Margaret' && p.answers.last === 'Sample' && p.answers.email === 'm@x.test' && p.answers.county === 'Greene', 'prefilled from the lead');
ok(p.reminders.length === 2 && p.reminders.every(r => r.due_at && !r.sent_at), 'two reminders set (day 2 and 4)');

// ---------- the consumer's phone ----------
await refuses(() => H('consumer', 'enroll', { link: 'nope' }), /not complete/, 'a broken link is refused');
let d = await C('enroll');
ok(d.kind === 'new' && d.forms.length === 9 && !d.esign && d.first === 'Margaret', 'consumer opens their packet');
ok((await pg.query(`select opened_at from cds_enroll_packets where lead_id='L1'`)).rows[0].opened_at, 'office sees it was opened');
await refuses(() => C('enrollSign', { form: 'vendor', typed_name: 'Margaret Sample', agree: true }), /electronically/, 'no signing before agreeing to e-sign');
await C('enrollEsign', { ip: '1.2.3.4', agent: 'test' });
await refuses(() => C('enrollSign', { form: 'vendor', typed_name: 'Margaret Sample', agree: true }), /who is signing/, 'who is signing first');
await C('enrollSave', { answers: { who: 'rep', rep_name: 'Linda Sample', rep_rel: 'Daughter, power of attorney', ssn: '999-99-9999', zip: '65804' } });
p = (await pg.query(`select * from cds_enroll_packets where lead_id='L1'`)).rows[0];
ok(!JSON.stringify(p.answers).includes('999'), 'an SSN sent with answers is never saved');
await refuses(() => C('enrollSign', { form: 'vendor', typed_name: 'Margaret Sample', agree: true }), /exactly as Linda Sample/, 'the representative signs in their own name');
await refuses(() => C('enrollSign', { form: 'vendor', typed_name: 'Linda Sample', agree: false }), /tick the box/, 'must agree');
let r = await C('enrollSign', { form: 'vendor', typed_name: 'linda  sample', agree: true });
ok(r.ok, 'vendor acknowledgement signed');
await refuses(() => C('enrollSign', { form: 'evv', typed_name: 'Linda Sample', agree: true }), /clocks in/, 'EVV needs a choice');
await refuses(() => C('enrollSign', { form: 'backup', typed_name: 'Linda Sample', agree: true }), /back-up person/, 'back-up plan needs a person');
await refuses(() => C('enrollSign', { form: 'f8821', typed_name: 'Linda Sample', agree: true }), /date of birth.*Social Security|Social Security/, 'tax forms need the SSN');
await refuses(() => C('enrollSign', { form: 'mo2643a', typed_name: 'Linda Sample', agree: true }), /Unknown form/, 'the consumer cannot sign the office form');
await refuses(() => C('enrollSign', { form: 'prev', typed_name: 'Linda Sample', agree: true }), /Unknown form/, 'no Previous Vendor form for someone new to CDS');
await refuses(() => C('enrollIdentity', { ssn: '123-45-6789', ssn2: '123-45-6789', dob: '1941-03-02' }), /starts with 9/, 'practice refuses a real-looking SSN');
await refuses(() => C('enrollIdentity', { ssn: '900-12-3456', ssn2: '900-12-3457', dob: '1941-03-02' }), /do not match/, 'SSN typed twice must match');
r = await C('enrollIdentity', { ssn: '900-12-3456', ssn2: '900123456', dob: '1941-03-02' });
ok(r.ssn_last4 === '3456', 'SSN sealed, only the last 4 come back');
p = (await pg.query(`select * from cds_enroll_packets where lead_id='L1'`)).rows[0];
ok(p.ssn_ciphertext && !p.ssn_ciphertext.includes('900') && p.ssn_last4 === '3456' && p.answers.dob === '1941-03-02', 'SSN stored sealed, date of birth kept');
await C('enrollSave', { answers: { evv: 'app', b1_name: 'Tom Sample', b1_rel: 'Son', b1_phone: '417-555-0199', first_pay: '2026-11-03' } });
d = await C('enroll');
ok(d.forms.find(f => f.key === 'ss4').rows.some(([k, v]) => k === 'SSN' && v === 'XXX-XX-3456'), 'tax forms show only the last 4');
ok(d.forms.find(f => f.key === 'evv').doc.some(b => b.kv && /WellSky app/.test(b.kv[0][1])), 'EVV form shows their choice');
for (const k of ['numbers', 'evv', 'backup', 'ss4', 'f8821', 'f2678']) await C('enrollSign', { form: k, typed_name: 'Linda Sample', agree: true });
ok(!(await pg.query(`select signed_at from cds_enroll_packets where lead_id='L1'`)).rows[0].signed_at, 'not done until the last form');
await refuses(() => C('enrollIdentity', { ssn: '900-12-3457', ssn2: '900-12-3457', dob: '1941-03-02' }), /already signed/, 'SSN cannot change after tax forms are signed');
await refuses(() => S('enrollOfficeSign', { lead_id: 'L1', typed_name: 'Samantha Troutman' }), /not signed every form/, 'office waits for the consumer');
await C('enrollSign', { form: 'mo2827', typed_name: 'Linda Sample', agree: true });
p = (await pg.query(`select * from cds_enroll_packets where lead_id='L1'`)).rows[0];
ok(!!p.signed_at, 'all consumer forms signed');
const forms = (await pg.query(`select * from cds_enroll_forms where packet_id=$1`, [p.id])).rows;
ok(forms.length === 8 && forms.every(f => f.signer_role === 'rep' && /^[0-9a-f]{64}$/.test(f.fingerprint) && f.version === '2026-10-22'), 'each form saved on its own, fingerprinted, signed by the representative');
await refuses(() => pg.query(`update cds_enroll_forms set signed_name='X' where packet_id=$1 and form_key='vendor'`, [p.id]), /cannot be changed/, 'a signed form cannot be changed');
await refuses(() => pg.query(`delete from cds_enroll_forms where packet_id=$1`, [p.id]), /cannot be deleted/, 'a signed form cannot be deleted');
await refuses(() => C('enrollSave', { answers: { b1_name: 'Someone Else' } }), /already signed/, 'answers locked after signing');
ob = await outbox();
const office = ob.filter(m => m.audience === 'office');
ok(office.filter(m => m.channel === 'email').length === 2, 'both office people emailed');
ok(office.every(m => /Linda Sample/.test(m.body) && /Apply for their EIN online/.test(m.body)), 'alert says who signed and what to do next');
const t = (await pg.query(`select * from cds_tasks where kind='enroll_agent'`)).rows;
ok(t.length === 1 && /Margaret Sample/.test(t[0].title) && !t[0].done_at, 'to-do for the agent signature');

// ---------- office ----------
let st = await S('enrollStatus', { lead_ids: ['L1', 'nope'] });
ok(st.packets.L1 && st.packets.L1.label === 'Signed, needs your agent signature' && !st.packets.nope, 'status for the lead');
let g = await S('enrollGet', { lead_id: 'L1' });
ok(g.forms.length === 9 && g.forms.filter(f => f.signed_at).length === 8 && g.packet.who === 'Linda Sample (Daughter, power of attorney)' && g.messages.length >= 4, 'office sees each form, who signed and the messages');
await refuses(() => S('enrollOfficeSign', { lead_id: 'L1', typed_name: 'Samantha' }), /full name/, 'agent types full name');
await S('enrollOfficeSign', { lead_id: 'L1', typed_name: 'Samantha Troutman' });
const f2 = Object.fromEntries((await pg.query(`select * from cds_enroll_forms where packet_id=$1`, [p.id])).rows.map(f => [f.form_key, f]));
ok(f2.mo2643a && f2.mo2643a.signer_role === 'office' && f2.f2678.agent_name === 'Samantha Troutman' && f2.mo2827.agent_at && !f2.f8821.agent_at, '2643A signed by the office, agent parts of 2678 and 2827 signed');
ok((await pg.query(`select done_at from cds_tasks where kind='enroll_agent'`)).rows[0].done_at, 'to-do closed itself');
await refuses(() => pg.query(`update cds_enroll_forms set agent_name='Y' where packet_id=$1 and form_key='f2678'`, [p.id]), /already signed by the agent/, 'agent signature is once only');
st = await S('enrollStatus', { lead_ids: ['L1'] });
ok(st.packets.L1.label === 'Done' && st.packets.L1.done, 'packet done');
const pdf = await S('enrollPdfData', { lead_id: 'L1' });
ok(pdf.ssn === '900123456' && pdf.agency.ein === '39-2504813' && pdf.forms.ss4.signed_name === 'Linda Sample' && pdf.docs.vendor.doc.length && pdf.files.mo2643a.file === 'MO-2643A', 'PDF data for the hub (full SSN for the forms)');
ok((await pg.query(`select count(*)::int n from cds_audit where action='enroll_pdf_ssn'`)).rows[0].n === 1, 'every SSN reveal is in the audit log');
const list = await S('enrollList', {});
ok(list.packets.length === 1 && list.packets[0].name === 'Margaret Sample' && list.packets[0].office_signed, 'Tax Setup can list signed packets');
await S('enrollLinkConsumer', { lead_id: 'L1', consumer_id: 'c-123' });
ok((await pg.query(`select consumer_id from cds_enroll_packets where lead_id='L1'`)).rows[0].consumer_id === 'c-123', 'packet linked to the consumer');
await refuses(() => S('enrollSend', { lead }), /already signed/, 'a signed packet is never sent again');

// ---------- moving from another agency + reminders ----------
const lead2 = { id: 'L2', type: 'pccp', name: 'Ruth Ellis', phone: '4175550188', email: '', leavingAgency: 'Example Home Care CDS' };
const s2 = await S('enrollSend', { lead: lead2 });
link = tokenOf(s2.practice_link);
d = await C('enroll');
ok(d.kind === 'move' && d.forms.map(f => f.key).join() === 'vendor,numbers,evv,backup,prev,f8821,f2678,mo2827' && d.answers.v1 === 'Example Home Care CDS', 'moving consumer: right forms, old agency filled in');
ok((await outbox()).filter(m => m.created_by.startsWith('enroll:L2')).map(m => m.channel).join() === 'sms', 'no email on file: text only');
const s2b = await S('enrollSend', { lead: { ...lead2, type: 'referral' } });
ok(s2b.ok && (await pg.query(`select kind from cds_enroll_packets where lead_id='L2'`)).rows[0].kind === 'new', 'sending again before anything is signed can change the kind');
await S('enrollSend', { lead: lead2 });
await pg.query(`update cds_enroll_packets set reminders='[{"due_at":"2020-01-01T15:00:00Z"},{"due_at":"2099-01-01T15:00:00Z"}]'::jsonb where lead_id='L2'`);
const jobNow = await pg.query(`select now()`);
const job = await H('job', 'packetJob', {});
const hr = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(jobNow.rows[0].now));
const rem = (await pg.query(`select reminders from cds_enroll_packets where lead_id='L2'`)).rows[0].reminders;
if (hr >= 9 && hr < 19) ok(job.enroll.reminders === 1 && rem[0].sent_at && !rem[1].sent_at, 'a due reminder is sent once, the later one waits');
else ok(job.enroll.reminders === 0 && !rem[0].sent_at, 'no reminders at night');
ok(job.enroll.ok && 'checked' in job, 'one job runs both packets');
await pg.query(`update cds_enroll_links set expires_at = now() - interval '1 day' where packet_id=(select id from cds_enroll_packets where lead_id='L2')`);
await refuses(() => C('enroll'), /expired/, 'an expired link says so');

// ---------- live mode: switched off holds everything but the office's own test phone ----------
const sentLive = [];
const liveDeps = practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' });
liveDeps.mode = 'live'; liveDeps.send = async m => { sentLive.push(m); };
const live = createMatch(liveDeps);
await pg.query(`insert into cds_match_settings (key, value) values ('staff_emails', '["samantha@mo-care.com"]'::jsonb), ('test_recipients', '{"phones":["+14175550777"],"emails":[]}'::jsonb) on conflict (key) do update set value = excluded.value`);
await live.handle('staff', 'enrollSend', { staff: 'samantha@mo-care.com', lead: { id: 'L3', type: 'referral', name: 'Test Phone', phone: '417-555-0777', email: 'someone@x.test' } });
const l3 = (await pg.query(`select channel, status, error from cds_outbox where created_by like 'enroll:L3%' order by channel`)).rows;
ok(l3.length === 2 && l3.find(m => m.channel === 'sms').status === 'sent' && sentLive.length === 1, 'switch off: the office test phone still gets the real text');
ok(l3.find(m => m.channel === 'email').status === 'held' && /switched off/.test(l3.find(m => m.channel === 'email').error), 'switch off: everyone else waits in Messages, saying why');
await refuses(() => live.handle('staff', 'enrollSend', { staff: 'stranger@x.test', lead: { id: 'L4', phone: '4175550000' } }), /staff list/, 'live: only the office staff list can send');

// ---------- small rules ----------
ok(E.cleanAnswers({ who: 'boss', evv: 'x', dob: '3/2/41', state: 'mo', junk: 1 }).state === 'MO' && !('who' in E.cleanAnswers({ who: 'boss' })) && !('junk' in E.cleanAnswers({ junk: 1 })), 'answers are cleaned');
ok(E.status({ kind: 'new' }, {}).label === 'Not sent', 'status before sending');

console.log(`${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
