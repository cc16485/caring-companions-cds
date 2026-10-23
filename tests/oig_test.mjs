// The automatic OIG exclusion check: the matching rules, then end to end on a local Postgres
// copy with a small fixture file. Runs the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/oig_test.mjs
// Optional: LEIE_FILE=/path/to/UPDATED.csv also reads the real OIG file (not stored in git).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = await import(ROOT + '/supabase/functions/_shared/office/oig.js');
const CSV = readFileSync(ROOT + '/tests/fixtures/oig_leie_sample.csv', 'utf8');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const throws = (fn, want, m) => { try { fn(); ok(false, m + ' (did not throw)'); } catch (e) { eq(e.message, want, m); } };

// ---------- names and dates ----------
eq(O.lastKeys("O'Brien"), ['OBRIEN'], 'apostrophes do not matter');
eq(O.lastKeys('De La Cruz'), ['DELACRUZ', 'CRUZ'], 'a two-word last name, joined, plus its longer parts');
eq(O.lastKeys('Smith-Jones'), ['SMITHJONES', 'SMITH', 'JONES'], 'a hyphenated last name finds each part');
eq(O.lastKeys('Jones Jr.'), ['JONES'], 'Jr is dropped');
eq(O.lastKeys('Muñoz'), ['MUNOZ'], 'accents do not matter');
eq(O.firstKey('Mary Ann'), 'MARY', 'only the first word of a first name');
eq(['1966-02-04', '02/04/1966', '2/4/1966', '19660204', '00000000', '', '0', null].map(O.isoDate),
   ['1966-02-04', '1966-02-04', '1966-02-04', '1966-02-04', null, null, null, null], 'birth dates in any of the usual forms; OIG zeros are no date');
eq(O.splitName('Smith, Mary J.'), { first: 'Mary', middle: 'J.', last: 'Smith' }, '"Last, First"');
eq(O.splitName('Mary Ann Smith'), { first: 'Mary', middle: 'Ann', last: 'Smith' }, '"First Middle Last"');
eq(O.splitName('Robert Jones Jr'), { first: 'Robert', middle: '', last: 'Jones' }, 'a Jr at the end');

// ---------- the file ----------
const L = O.importLeie(CSV);
eq(L.people, 7, 'people only; the business row is left out');
const smith = L.rows.find(r => r.last_name === 'SMITH' && r.middle_name === 'ANN');
eq([smith.dob, smith.state, smith.excl_type, smith.excl_date, smith.reinstate_date, smith.city], ['1970-03-12', 'MO', '1128a1', '2019-01-01', null, 'SPRINGFIELD'], 'one row read right');
eq(L.rows.find(r => r.first_name === 'JOSE').last_name, 'PEREZ "PEPE"', 'quotes inside a quoted field');
eq(L.rows.find(r => r.first_name === 'JOSE').dob, null, '00000000 is no birth date');
eq(O.importLeie(CSV.replace(/\n/g, '\r\n')).people, 7, 'Windows line endings');
throws(() => O.importLeie('NAME,DOB\nx,y\n'), 'This is not the OIG exclusion file (the column names are different)', 'refuses a file that is not the OIG file');

// ---------- the match ----------
const chk = p => O.checkPerson(p, L.rows);
let r = chk({ first: 'Mary', last: 'Smith', dob: '03/12/1970', state: 'MO' });
eq(r.result, 'possible_match', 'Mary Smith with the same birth date is a possible match');
eq(r.matches.map(m => [m.strength, m.why]), [
  ['strong', 'Same name and same birth date'],
  ['dob_differs', 'Same name, different birth date (11/20/1985)']], 'strong first; same name with another birth date still goes to a person');
eq([r.matches[0].name, r.matches[0].same_state, r.matches[0].city, r.matches[0].specialty], ['Mary Ann Smith', true, 'Springfield', 'Nurse/Nurses Aide'], 'what the reviewer sees');
r = chk({ first: 'Mary', last: 'Smith' });
eq(r.matches.map(m => m.strength), ['name', 'name'], 'no birth date: same name is a possible match, never clear');
r = chk({ first: 'Megan', last: 'Smith', dob: '1990-01-05' });
eq(r.matches.map(m => [m.strength, m.why, m.name]), [['strong', 'Same last name, first initial and birth date', 'M Smith']], 'first initial plus birth date');
eq(chk({ first: 'Megan', last: 'Smith', dob: '1991-01-05' }).result, 'clear', 'first initial with a different birth date is clear');
eq(chk({ first: 'Megan', last: 'Smith' }).result, 'clear', 'first initial alone is not enough');
eq(chk({ first: 'John', last: 'Smith', dob: '1970-03-12' }).result, 'clear', 'same birth date, different first name and initial: clear');
eq(chk({ first: 'Sean', last: 'OBrien' }).matches.map(m => m.strength), ['name'], "O'Brien = OBrien");
eq(chk({ first: 'Maria', last: 'Cruz', dob: '1975-07-04' }).matches.map(m => m.strength), ['strong'], 'Maria Cruz finds De La Cruz, Maria');
eq(chk({ first: 'Maria', last: 'de la Cruz' }).result, 'possible_match', 'de la Cruz in lower case');
eq(chk({ first: 'Robert', last: 'Jones', dob: '11/11/1966' }).matches.map(m => m.strength), ['strong'], 'JONES JR on the list = Jones');
eq(chk({ first: 'Robert', last: 'Smith-Jones' }).result, 'possible_match', 'a hyphenated name finds a part');
eq(chk({ first: 'Ann', last: 'Brown', dob: '1970-03-12' }), { result: 'clear', matches: [] }, 'nobody: clear');
throws(() => chk({ first: '', last: 'Smith' }), 'A first and last name are needed to check the OIG list', 'needs a first name');
ok(!/[—–]/.test(JSON.stringify(chk({ first: 'Mary', last: 'Smith', dob: '1970-03-12' }))), 'no em dashes in what a person reads');

if (process.env.LEIE_FILE) {
  const t0 = Date.now();
  const big = O.importLeie(readFileSync(process.env.LEIE_FILE, 'utf8'));
  const ms = Date.now() - t0;
  ok(big.people > O.MIN_PEOPLE, 'the real file reads: ' + big.people + ' people in ' + ms + 'ms');
  console.log('real file:', big.people, 'people,', ms + 'ms to read');
}

// ---------- the database ----------
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/oig_check.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
await pg.exec(strip(readFileSync(ROOT + '/attendant_packet.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/fcsr_waiver.sql', 'utf8')));
ok(true, 'the SQL runs twice');
eq((await pg.query(`select value from cds_match_settings where key='oig_check'`)).rows[0].value, { live: false }, 'starts in practice');

const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
ok(!(await can('anon', 'select * from cds_oig_leie')) && !(await can('authenticated', 'select * from cds_oig_leie')), 'only the server reads the imported list');
ok(!(await can('anon', 'select * from cds_oig_results')) && !(await can('anon', 'select * from cds_oig_runs')), 'the public key reads nothing');
ok(await can('authenticated', 'select * from cds_oig_results') && await can('authenticated', 'select * from cds_oig_runs'), 'signed-in hub staff can read results and runs');
ok(!(await can('authenticated', `update cds_oig_results set review='not_them'`)) && !(await can('authenticated', `insert into cds_oig_runs (file_month) values ('x')`)), 'hub staff cannot write directly');
const rls = (await pg.query(`select relname from pg_class where relname like 'cds_oig_%' and relkind='r' and relrowsecurity order by 1`)).rows.map(x => x.relname);
eq(rls, ['cds_oig_leie', 'cds_oig_results', 'cds_oig_runs'], 'row security on all three');

let NOW = Date.parse('2026-10-11T12:00:00Z');
let download = async () => ({ text: CSV, lastModified: 'Fri, 09 Oct 2026 12:51:03 GMT' });
const oig = O.createOig({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW, minPeople: 5, fetchList: () => download() });
const count = async (t, p) => (await pg.query(t, p)).rows[0].n;

// checking before any list is loaded is an error, not a "clear"
let c = await oig.check({ people: [{ ref: 'packet:1', first: 'Mary', last: 'Smith' }] });
eq([c.ok, c.error], [false, 'The OIG list is not loaded yet'], 'no list: no result, never clear');

let imp = await oig.download();
eq([imp.ok, imp.file_month, imp.people], [true, '2026-10', 7], 'import: the October file');
eq(await count(`select count(*)::int n from cds_oig_leie`), 7, 'seven people loaded');
const firstRun = imp.run_id;
eq((await oig.download()).skipped, 'the 2026-10 list is already loaded', 'the same month is not loaded twice');

// the attendant packet's call: same shape as the pure function
r = await oig.checkPerson({ first: 'Mary', last: 'Smith', middle: '', dob: '1970-03-12', state: 'MO' });
eq([r.result, r.matches.map(m => m.strength)], ['possible_match', ['strong', 'dob_differs']], 'checkPerson against the loaded list');
eq((await oig.checkPerson({ first: 'Ann', last: 'Brown', dob: '1980-01-01', state: 'MO' })).result, 'clear', 'clear against the loaded list');

c = await oig.check({ people: [
  { ref: 'packet:1', first: 'Mary', last: 'Smith', dob: '03/12/1970', state: 'mo' },
  { ref: 'packet:2', name: 'Ann Brown' },
  { ref: 'packet:3', first: '', last: 'Nobody' },
  { first: 'No', last: 'Ref' }] });
eq([c.ok, c.live, c.checked, c.possible, c.failed], [true, false, 4, 1, 2], 'check: one possible match, one clear, two that could not be checked');
eq(c.people.map(p => p.result || p.error), ['possible_match', 'clear', 'A first and last name are needed to check the OIG list', 'Each person needs a ref'], 'each person');
const saved = (await pg.query(`select person_ref, person, result, source, file_month, jsonb_array_length(matches)::int n from cds_oig_results order by person_ref`)).rows;
eq(saved.map(s => [s.person_ref, s.result, s.source, s.file_month, s.n]), [['packet:1', 'possible_match', 'check', '2026-10', 2], ['packet:2', 'clear', 'check', '2026-10', 0]], 'results saved');
const sorted = o => Object.fromEntries(Object.entries(o).sort());
eq(sorted(saved[0].person), sorted({ first: 'Mary', middle: '', last: 'Smith', dob: '1970-03-12', state: 'MO' }), 'what was checked is saved with it');
eq(await count(`select count(*)::int n from cds_tasks`), 0, 'practice: nothing reaches the office as a to-do');

// monthly recheck of active attendants (read from the hub's list, never written)
const attendants = [
  { id: 'a1', name: 'Robert Jones', status: 'active', dob: '1966-11-11' },
  { id: 'a2', name: 'Lee Park', status: 'active' },
  { id: 'a3', name: 'Mary Smith', status: 'inactive' },
  { id: 'a4', name: 'Maria De La Cruz' }];
await pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds','attendants',$1::jsonb)`, [JSON.stringify(attendants)]);
c = await oig.recheckAll();
eq(c.people.map(p => [p.ref, p.result]), [['attendant:a1', 'possible_match'], ['attendant:a2', 'clear'], ['attendant:a4', 'possible_match']], 'recheck: active attendants only');
eq(await count(`select count(*)::int n from cds_oig_results where source='recheck'`), 3, 'recheck results saved');
eq((await pg.query(`select data_value from agency_data where data_key='attendants'`)).rows[0].data_value.map(sorted), attendants.map(sorted), 'the Attendants list is not changed');
eq(await count(`select count(*)::int n from cds_tasks`), 0, 'practice: still no to-dos');

// a bad download keeps the old list and is recorded
NOW = Date.parse('2026-11-11T12:00:00Z');
download = async () => ({ text: 'LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WVRSTATE\nSMITH,MARY', lastModified: 'Mon, 09 Nov 2026 12:00:00 GMT' });
imp = await oig.download();
eq([imp.ok, imp.error], [false, 'The file has only 1 person on it, so it looks cut off'], 'a cut-off file is refused');
eq(await count(`select count(*)::int n from cds_oig_leie where run_id=$1`, [firstRun]), 7, 'the October list stays in use');
download = async () => { throw new Error('OIG download 503'); };
imp = await oig.download();
eq(imp.error, 'OIG download 503', 'a failed download');
eq((await pg.query(`select status, file_month, error from cds_oig_runs where id=$1`, [imp.run_id])).rows[0], { status: 'failed', file_month: '2026-11', error: 'OIG download 503' }, 'is recorded in the runs');
eq(await count(`select count(*)::int n from cds_tasks`), 0, 'practice: a failure is recorded, not a to-do');

// live: possible matches and failures become office to-dos, once each
await pg.query(`update cds_match_settings set value='{"live": true}'::jsonb where key='oig_check'`);
await oig.download();
c = await oig.recheckAll(); await oig.recheckAll();
const tasks = (await pg.query(`select title from cds_tasks where kind='oig_check' order by title`)).rows.map(t => t.title);
eq(tasks, [
  'Check the OIG list for Maria De La Cruz: same name as someone excluded. Look at the OIG entry and decide if it is them.',
  'Check the OIG list for Robert Jones: same name and birth date as someone excluded. Look at the OIG entry and decide if it is them.',
  'The OIG list did not download this month. Check exclusions.oig.hhs.gov by hand until it is fixed. (OIG download 503)'], 'live: one to-do per possible match, plus the failed download');
ok(!tasks.some(t => /[—–]/.test(t)), 'no em dashes in the to-dos');
// a new month's list replaces the old one
download = async () => ({ text: CSV.replace(/^SMITH,M,.*\n/m, ''), lastModified: 'Tue, 10 Nov 2026 12:00:00 GMT' });
imp = await oig.download();
eq([imp.ok, imp.file_month, imp.people], [true, '2026-11', 6], 'the November list loads');
eq(await count(`select count(*)::int n from cds_oig_leie`), 6, 'and replaces October');
eq((await oig.checkPerson({ first: 'Megan', last: 'Smith', dob: '1990-01-05' })).result, 'clear', 'someone taken off the list no longer matches');

// ---------- the monthly recheck also covers the new application (caringcds.com/apply) ----------
const pool = (await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone) values ('caring-companions-cds','Bob','Jones','4175550111') returning id`)).rows[0].id;
const pool2 = (await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone) values ('caring-companions-cds','Nobody','Here','4175550112') returning id`)).rows[0].id;
await pg.query(`insert into cds_packets (pool_id, step1_signed_at, answers) values ($1, now(), '{"state":"MO"}'), ($2, null, '{}')`, [pool, pool2]);
await pg.query(`insert into cds_screening (pool_id, legal_first, legal_last, dob) values ($1, 'Robert', 'Jones', '1966-11-11')`, [pool]);
NOW = Date.parse('2026-12-11T13:00:00Z');
download = async () => ({ text: CSV, lastModified: 'Wed, 09 Dec 2026 12:00:00 GMT' });
await oig.download();
c = await oig.recheckAll();
const poolRow = c.people.find(p => p.ref === 'pool:' + pool);
eq([poolRow && poolRow.name, poolRow && poolRow.result, poolRow && poolRow.matches[0].strength], ['Robert Jones', 'possible_match', 'strong'], 'someone who signed Step 1 is rechecked by legal name and birth date');
ok(!c.people.some(p => p.ref === 'pool:' + pool2), 'someone who has not signed Step 1 is not rechecked');

// ---------- the hub card: list and decide ----------
await pg.query(`insert into cds_match_settings (key, value) values ('switch_owners', '["samantha@mo-care.com"]'::jsonb) on conflict (key) do update set value = excluded.value`);
await pg.query(`update cds_match_settings set value = '["samantha@caringcds.com","krystal@mo-care.com"]'::jsonb where key='staff_emails'`);
const offRefuses = async (fn, want, m) => { try { await fn(); ok(false, m + ' (did not refuse)'); } catch (e) { eq([e.message, e.status], want, m); } };
await offRefuses(() => oig.office('someone@gmail.com', { action: 'list' }), ['This sign-in is not on the CDS office staff list.', 403], 'only the office staff list sees the card');
let card = await oig.office('Krystal@mo-care.com', { action: 'list' });
eq([card.live, card.list.file_month, card.list.people, card.failed], [true, '2026-12', 7, null], 'the card: list month, people, no failure');
ok(card.last_recheck && card.last_recheck.startsWith('2026-12-11'), 'the card: last recheck');
eq(card.open.map(o => o.ref).sort(), ['attendant:a1', 'attendant:a4', 'packet:1', 'pool:' + pool].sort(), 'open possible matches, latest result per person (packet:1 from October is still waiting)');
eq(card.open[0].ref, 'packet:1', 'oldest first');
eq(card.people['attendant:a2'].result, 'clear', 'each person\'s latest result, for the Roster');
const forPool = card.open.find(o => o.ref === 'pool:' + pool);
await offRefuses(() => oig.office('krystal@mo-care.com', { action: 'review', id: forPool.id, decision: 'maybe' }), ['Pick Not them or This is them.', 400], 'only the two answers');
await offRefuses(() => oig.office('krystal@mo-care.com', { action: 'review', id: '00000000-0000-0000-0000-000000000000', decision: 'not_them' }), ['That OIG match was not found. Refresh and try again.', 404], 'an unknown match');
const taskOpen = async ref => count(`select count(*)::int n from cds_tasks where dedupe_key like $1 and done_at is null`, ['oig:' + ref + ':%']);
eq(await taskOpen('pool:' + pool), 1, 'live: the Robert Jones to-do is open');
let rv = await oig.office('krystal@mo-care.com', { action: 'review', id: forPool.id, decision: 'not_them' });
eq(rv.message, 'Saved. Robert Jones is not the person on the OIG list.', 'Not them wording');
await offRefuses(() => oig.office('samantha@mo-care.com', { action: 'review', id: forPool.id, decision: 'is_them' }), ['Someone already decided this one. Refresh to see it.', 409], 'decided once');
eq(await taskOpen('pool:' + pool), 0, 'deciding closes the to-do');
const chkRow = (await pg.query(`select check_key, result, checked_on::text d, recorded_by, note from cds_screening_checks where pool_id=$1`, [pool])).rows;
eq(chkRow, [{ check_key: 'oig', result: 'clear', d: '2026-12-11', recorded_by: 'krystal@mo-care.com', note: 'Not them: reviewed the OIG possible match (2026-12)' }], 'for an applicant it is recorded as their OIG check, as that person');
const aud = (await pg.query(`select actor, action, target, detail->>'decision' d from cds_audit where action='oig_review'`)).rows;
eq(aud, [{ actor: 'krystal@mo-care.com', action: 'oig_review', target: 'pool:' + pool, d: 'not_them' }], 'every decision is in the audit log');
const forA1 = card.open.find(o => o.ref === 'attendant:a1');
rv = await oig.office('samantha@mo-care.com', { action: 'review', id: forA1.id, decision: 'is_them' });
eq(rv.message, 'Saved as a match. Someone on the OIG list cannot be paid with Medicaid money, so Robert Jones cannot work CDS shifts.', 'This is them wording');
eq(await count(`select count(*)::int n from cds_screening_checks where note like 'This is them%'`), 0, 'a Roster attendant has no screening record to write (the Roster is changed by a person)');
card = await oig.office('samantha@mo-care.com', { action: 'list' });
eq(card.open.map(o => o.ref), ['packet:1', 'attendant:a4'], 'decided matches leave the card');
eq([card.people['attendant:a1'].review, card.people['pool:' + pool].review], ['is_them', 'not_them'], 'and show as decided');
ok(!/[—–]/.test(JSON.stringify(card) + rv.message), 'no em dashes');

// ---------- the card's words ----------
const H = await import(ROOT + '/caregiver-match/hub-oig.js');
let w = H.cardWords(card, new Date('2026-12-14T15:00:00Z'));
eq(w.people[0].we[3], ['Checked', 'Oct 11 (application)'], 'an application check');
eq(w.people[0].them[0].why, 'Same name and same birth date', 'strong first');
ok(w.people[0].them[0].strong, 'strong is marked');
eq(w.lines, ['Runs by itself. The December OIG list is loaded (7 people, Dec 11).', 'Everyone was last rechecked Dec 11. Next recheck Jan 11.'], 'card lines (on)');
eq([w.practice, w.bad, w.clear, w.people.map(p => p.title)], [false, null, null, ['Mary Smith may be on the OIG list', 'Maria De La Cruz may be on the OIG list']], 'two to look at');
eq(w.people[1].we, [['Name', 'Maria De La Cruz'], ['Born', 'not given'], ['State', 'not given'], ['Checked', 'Dec 11 (monthly recheck)']], 'we checked');
eq(w.people[1].them[0], { why: 'Same name, no birth date to compare', strong: false, rows: [['Name', 'Maria De La Cruz'], ['Born', '7/4/1975'], ['Lives', 'Saint Louis, MO'], ['Job', 'Personal Care Provid'], ['Excluded since', '2/2/2022']] }, 'the OIG side');
w = H.cardWords({ live: false, list: null, failed: null, last_recheck: null, open: [], people: {} }, new Date('2026-10-21T15:00:00Z'));
eq([w.practice, w.bad, w.clear, w.lines], [true, 'The OIG list is not loaded yet. Check exclusions.oig.hhs.gov by hand until it is.', 'No possible matches. Nobody to look at.',
  ['The first monthly recheck of everyone is Nov 11.', 'Practice: results show here, but they do not count as anyone\'s OIG check yet and make no to-dos.']], 'card in practice, nothing loaded');
w = H.cardWords({ live: true, list: card.list, failed: { at: '2027-01-11T11:00:00Z', error: 'x' }, last_recheck: null, open: [], people: {} }, new Date('2027-01-11T15:00:00Z'));
eq(w.bad, 'The OIG list did not download on Jan 11. Last month\'s list is still in use. If this stays, check exclusions.oig.hhs.gov by hand.', 'a failed download shows');
eq(H.nextRun(new Date(2026, 9, 10)), 'Oct 11', 'next run before the 11th');
const cardSrc = readFileSync(ROOT + '/caregiver-match/hub-oig.js', 'utf8');
ok(!/[—–]/.test(cardSrc.replace(/\/\/.*$/gm, '')), 'no em dashes on the card');
ok(!/confirm\(|alert\(/.test(cardSrc), 'the card never uses a pop-up');
for (const t of ['Not them', 'This is them', 'Yes, save', 'Cancel', 'IS the person on the OIG list? They cannot work CDS shifts.',
  'is NOT the person on the OIG list? Only if the birth date or other details are clearly different.', 'How to decide: compare the birth date, city and job.'])
  ok(cardSrc.includes(t), 'card says: ' + t);
const hub = readFileSync(ROOT + '/index.html', 'utf8');
ok(hub.includes('<div id="oigCard"></div>') && hub.includes("/functions/v1/cds-oig") && hub.includes('oigPeople:'), 'the hub mounts the card on Active Attendants');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
