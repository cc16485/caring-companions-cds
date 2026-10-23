// Missouri rules check, gaps 1, 2, 4, 6, 7 (2026-10-22): consumer forms signed by link, office staff
// in the monthly OIG check, the three application questions, and the other SSN in the FCSR view.
// End to end on a local Postgres copy with practice plumbing; runs the real SQL and server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/mo_forms_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const { createMatch } = await import(ROOT + '/supabase/functions/_shared/match/handlers.js');
const { practiceDeps } = await import(ROOT + '/caregiver-match/practice/deps.js');
const SG = await import(ROOT + '/supabase/functions/_shared/enroll/sign.js');
const P = await import(ROOT + '/supabase/functions/_shared/packet/rules.js');
const O = await import(ROOT + '/supabase/functions/_shared/office/oig.js');
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
await pg.exec(`create table if not exists agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key))`);
await pg.exec(strip(readFileSync(ROOT + '/oig_check.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/fcsr_waiver.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/consumer_packet.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/consumer_forms.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'consumer_forms.sql runs twice');

// ---------- lockdown and switches ----------
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
for (const t of ['cds_sign_requests', 'cds_sign_links'])
  ok(!(await can('anon', 'select * from ' + t)) && !(await can('authenticated', 'select * from ' + t)), 'nobody outside reads ' + t);
for (const k of ['consumer_forms', 'apply_questions']) {
  ok((await pg.query(`select value from cds_match_settings where key=$1`, [k])).rows[0].value.live === false, k + ' starts off');
  ok(SWITCHES.some(s => s.key === k), k + ' is on the Switches card');
}
ok(SWITCHES.find(s => s.key === 'consumer_forms').warn === 'This one reaches consumers.', 'consumer texts switch carries the warning');

// ---------- the words ----------
const words = JSON.stringify([SG.SIGN_FORMS, ...SG.SIGN_KEYS.map(k => SG.signDoc(k, { first: 'Ruth', last: 'Caldwell', hours: 'M-F', att_name: 'Marcus Webb' })), P.MO_QUESTIONS]);
ok(!/[—–]/.test(words), 'no em dashes anywhere a person reads');
ok(!/plain (language|english)/i.test(words), 'never "plain language"');
ok(/90 days/.test(JSON.stringify(SG.signDoc('rights'))) && /within 10 days of the notice/.test(JSON.stringify(SG.signDoc('rights'))), 'rights: 90 days to ask, 10 days keeps services (15-8.500)');
ok(/1331 N Stewart Ave Ste B/.test(JSON.stringify(SG.signDoc('office', {}))), 'office: the real street address, Suite B');
ok(SG.signText('pandemic', { first: 'A', last: 'B' }, 2026) !== SG.signText('pandemic', { first: 'A', last: 'B' }, 2027), 'pandemic fingerprint differs by year');

// ---------- the office sends ----------
const match = createMatch(practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' }));
const S = (a, i) => match.handle('staff', a, { staff: 'samantha@mo-care.com', ...i });
const C = (a, i) => match.handle('consumer', a, i);
const ruth = { id: 'c1', name: 'Ruth Caldwell', phone: '417-555-0131', email: '' };
await refuses(() => match.handle('staff', 'signSend', { consumer: ruth, form: 'rights' }), /sign in/i, 'nobody signed out can send');
await refuses(() => S('signSend', { consumer: { id: 'c9', name: 'No Phone' }, form: 'rights' }), /cell phone or an email/, 'needs a phone or email');
await refuses(() => S('signSend', { consumer: ruth, form: 'office' }), /office hours/, 'office form needs the hours first');
await refuses(() => S('signSend', { consumer: ruth, form: 'pandemic_att' }), /attendant/, 'attendant form needs the attendant name');
await refuses(() => S('signSend', { consumer: ruth, form: 'nope' }), /Unknown form/, 'unknown form refused');
let r = await S('signSend', { consumer: ruth, form: 'rights' });
ok(r.ok && r.messages.join() === 'practice' && /\/sign\/\?c=/.test(r.practice_link || ''), 'practice: one text, nothing sent, link back for the office');
const ob = (await pg.query(`select * from cds_outbox where template='sign_link'`)).rows;
ok(ob.length === 1 && /Your Rights and Responsibilities in CDS/.test(ob[0].body) && !/555-0131|5550131/.test(ob[0].to_display), 'the text is in Messages, number masked -> ' + (ob[0] || {}).to_display);
const link = new URL(r.practice_link).searchParams.get('c');

// ---------- the consumer signs ----------
let g = await C('signGet', { link });
ok(g.form === 'rights' && g.name === 'Ruth Caldwell' && !g.signed && g.doc.length > 2, 'the form opens with its words');
ok((await pg.query(`select opened_at from cds_sign_requests where consumer_id='c1'`)).rows[0].opened_at, 'opened is recorded');
await refuses(() => C('signGet', { link: 'short' }), /not complete/, 'a cut-off link is refused');
await refuses(() => C('signGet', { link: 'x'.repeat(30) }), /could not find/, 'an unknown link is refused');
await refuses(() => C('signDo', { link, typed_name: 'Ruth Caldwell', agree: false }), /tick the box/, 'must tick agree');
await refuses(() => C('signDo', { link, typed_name: 'Ruth', agree: true }), /full name/, 'one word is not a signature');
await refuses(() => C('signDo', { link, typed_name: 'Someone Else', agree: true }), /exactly as Ruth Caldwell/, 'a different name is refused');
await refuses(() => C('signDo', { link, typed_name: 'Amy Caldwell', agree: true, rep: { rel: ' ' } }), /related/, 'a representative says how they are related');
r = await C('signDo', { link, typed_name: 'ruth  caldwell', agree: true, ip: '1.2.3.4' });
ok(r.ok, 'signed with her own name (case and spaces do not matter)');
g = await C('signGet', { link });
ok(g.signed && g.signed.name === 'ruth caldwell', 'shows signed');
ok((await C('signDo', { link, typed_name: 'Ruth Caldwell', agree: true })).already, 'signing twice is a no-op');
const row = (await pg.query(`select * from cds_sign_requests where consumer_id='c1' and form_key='rights'`)).rows[0];
ok(row.fingerprint && row.version === '2026-10-22' && row.signer_role === 'consumer' && row.signed_ip === '1.2.3.4', 'fingerprint, version and who are kept');
let threw = false; try { await pg.query(`update cds_sign_requests set signed_name='X Y' where id=$1`, [row.id]); } catch { threw = true; }
ok(threw, 'a signed form cannot be changed');
threw = false; try { await pg.query(`delete from cds_sign_requests where id=$1`, [row.id]); } catch { threw = true; }
ok(threw, 'a signed form cannot be deleted');
await refuses(() => S('signSend', { consumer: ruth, form: 'rights' }), /Already signed/, 'a signed once-only form is not sent again');

// office details, by a representative
r = await S('signSend', { consumer: { ...ruth, email: 'ruth@x.test' }, form: 'office', hours: 'Monday to Friday, 8am to 4:30pm' });
ok(r.messages.length === 2, 'text and email when both are on file');
let L2 = new URL(r.practice_link).searchParams.get('c');
g = await C('signGet', { link: L2 });
ok(JSON.stringify(g.doc).includes('Monday to Friday, 8am to 4:30pm'), 'the hours print on the form');
r = await C('signDo', { link: L2, typed_name: 'Amy Caldwell', agree: true, rep: { rel: 'Daughter' } });
ok((await pg.query(`select signer_role, rep_rel from cds_sign_requests where form_key='office'`)).rows[0].signer_role === 'rep', 'signed by a representative, recorded as such');

// pandemic, yearly, and the attendant line
r = await S('signSend', { consumer: ruth, form: 'pandemic' });
const L3 = new URL(r.practice_link).searchParams.get('c');
await C('signDo', { link: L3, typed_name: 'Ruth Caldwell', agree: true });
r = await S('signSend', { consumer: ruth, form: 'pandemic_att', att_name: 'Marcus Webb' });
const L4 = new URL(r.practice_link).searchParams.get('c');
g = await C('signGet', { link: L4 });
ok(g.attendant && g.att_name === 'Marcus Webb', 'attendant form asks for the attendant');
await refuses(() => C('signDo', { link: L4, typed_name: 'Ruth Caldwell', agree: true }), /attendant types their full name/, 'the attendant must type their name');
await refuses(() => C('signDo', { link: L4, typed_name: 'Ruth Caldwell', agree: true, att_typed: 'Jane Doe' }), /exactly as Marcus Webb/, 'it must be the attendant named');
await C('signDo', { link: L4, typed_name: 'Ruth Caldwell', agree: true, att_typed: 'Marcus Webb' });
const st = await S('signStatus', { consumer_ids: ['c1', 'c2'] });
const y = st.year;
ok(st.consumers.c1.pandemic[0].year === y && st.consumers.c1.pandemic_att[0].att_signed_name === 'Marcus Webb', 'status: this year\'s pandemic steps');
ok(st.consumers.c1.rights[0].signed_at && !st.consumers.c2, 'status per consumer');
await refuses(() => S('signSend', { consumer: ruth, form: 'pandemic' }), new RegExp('Already signed for ' + y), 'this year\'s policy is signed: not sent again this year');
await pg.query(`insert into cds_sign_requests (consumer_id, form_key, year) values ('c1','pandemic',$1)`, [y + 1]);
ok((await S('signStatus', { consumer_ids: ['c1'] })).consumers.c1.pandemic.length === 2, 'each year is its own row (next year starts fresh)');

// ---------- live: held while the switch is off, sent to the office test phone ----------
const liveDeps = practiceDeps(db, { familyBase: 'https://x.test/directory/', caregiverBase: 'https://x.test/caregiver/' });
const sent = [];
liveDeps.mode = 'live'; liveDeps.send = async m => { sent.push(m); };
const live = createMatch(liveDeps);
await pg.query(`insert into cds_match_settings (key, value) values ('staff_emails', '["samantha@mo-care.com"]'::jsonb) on conflict (key) do update set value=excluded.value`);
r = await live.handle('staff', 'signSend', { staff: 'samantha@mo-care.com', consumer: { id: 'c2', name: 'Dale Moss', phone: '4175550199' }, form: 'rights' });
ok(r.messages.join() === 'held' && sent.length === 0 && !r.practice_link, 'live, switch off: held in Messages, nothing sent, no link back');
await pg.query(`update cds_match_settings set value='{"live":true}'::jsonb where key='consumer_forms'`);
r = await live.handle('staff', 'signSend', { staff: 'samantha@mo-care.com', consumer: { id: 'c2', name: 'Dale Moss', phone: '4175550199' }, form: 'rights' });
ok(r.messages.join() === 'sent' && sent.length === 1 && /caringcds\.com\/sign\/\?c=/.test(sent[0].body), 'switch on: the text goes out with the sign link');
await refuses(() => live.handle('staff', 'signStatus', { staff: 'stranger@x.test', consumer_ids: ['c1'] }), /staff list/, 'live: only the office staff list');

// ---------- application questions ----------
const base = { first: 'A', last: 'B', street: '1', city: 'S', zip: '65802', phone: '4175550100', has_consumer: 'yes', consumer_name: 'R', related: 'no', qualified: 'yes', list: 'no',
  not_working: true, jobs: [{}, { co: 'x', sup: 'y', ph: '1' }, { co: 'x', sup: 'y', ph: '1' }], refs: [{ name: 'a', rel: 'Friend', ph: '1' }, { name: 'b', rel: 'Friend', ph: '1' }],
  convicted: 'no', gcw: 'no', fcsr: 'yes', mo_only: 'mo' };
ok(P.applicationMissing(base).length === 0, 'switch off: the application as before');
ok(P.applicationMissing(base, { mo: true }).includes('the Missouri questions'), 'switch on: the 3 questions are needed');
ok(P.applicationMissing({ ...base, guardian: 'no', gets_cds: 'no', mfraud: 'no' }, { mo: true }).length === 0, 'three Noes: ready');
ok(P.applicationMissing({ ...base, has_consumer: 'no', gets_cds: 'no', mfraud: 'no' }, { mo: true }).length === 0, 'no consumer yet: the guardian question is skipped');
ok(P.applicationMissing({ ...base, guardian: 'yes', gets_cds: 'no', mfraud: 'no' }, { mo: true }).some(m => /legal guardian/.test(m)), 'guardian: a different caregiver');
ok(P.applicationMissing({ ...base, guardian: 'no', gets_cds: 'no', mfraud: 'yes' }, { mo: true }).some(m => /Medicaid fraud/.test(m)), 'Medicaid fraud: a different caregiver');
ok(P.cleanAnswers({ guardian: 'yes', gets_cds: 'maybe', mfraud: 'no' }).gets_cds === '' && P.cleanAnswers({ guardian: 'yes' }).guardian === 'yes', 'only yes or no is kept');

// ---------- the other SSN in the FCSR view ----------
const pool = (await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone) values ('caring-companions-cds','Bob','Jones','4175550111') returning id`)).rows[0].id;
const crypt = liveDeps.crypto || match.deps.crypto;
await pg.query(`insert into cds_screening_secret (pool_id, ssn_ciphertext) values ($1,$2)`, [pool, await crypt.encrypt('900112222')]);
await pg.query(`insert into cds_packets (pool_id, answers) values ($1, jsonb_build_object('other_ssn_sealed', $2::text))`, [pool, await crypt.encrypt('900334444')]);
r = await S('revealSsn', { id: pool, reason: 'FCSR screening request' });
ok(r.ssn === '900-11-2222' && r.other === '900-33-4444', 'the FCSR view shows the other number too');
ok((await pg.query(`select detail from cds_audit where action='ssn_viewed_for_fcsr' order by at desc limit 1`)).rows[0].detail.other === true, 'and the view is recorded as including it');

// ---------- office staff in the monthly OIG check ----------
const CSV = readFileSync(ROOT + '/tests/fixtures/oig_leie_sample.csv', 'utf8');
const oig = O.createOig({ db, now: () => Date.parse('2026-10-11T12:00:00Z'), minPeople: 5, fetchList: async () => ({ text: CSV, lastModified: 'Fri, 09 Oct 2026 12:51:03 GMT' }) });
await oig.download();
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','officeStaff',$1::jsonb)`,
  [JSON.stringify([{ id: 's1', name: 'Krystal Lane', otherNames: 'Mary Smith, Cher' }, { id: 's2', name: 'Zach Troutman', leftAt: '2026-01-01' }])]);
let c = await oig.recheckAll();
ok(!c.people.some(p => p.ref.startsWith('staff:')), 'staff switch off: staff are not checked');
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','moStaffOig','{"live":true}'::jsonb)`);
c = await oig.recheckAll();
const refs = c.people.filter(p => p.ref.startsWith('staff:')).map(p => [p.ref, p.name, p.result]);
ok(JSON.stringify(refs) === JSON.stringify([['staff:s1', 'Krystal Lane', 'clear'], ['staff:s1:alias1', 'Mary Smith', 'possible_match']]), 'switch on: staff and their other names (2+ words), not someone who left -> ' + JSON.stringify(refs));
await pg.query(`insert into cds_match_settings (key, value) values ('switch_owners', '["samantha@mo-care.com"]'::jsonb) on conflict (key) do update set value=excluded.value`);
await refuses(() => oig.office('krystal@mo-care.com', { action: 'recheck' }), /Only Samantha/, 'check now: switch owners only');
r = await oig.office('samantha@mo-care.com', { action: 'recheck' });
ok(r.ok && r.checked >= 2, 'check now runs the recheck');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
