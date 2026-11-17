// Forgot to clock out: finding the shifts, who to text, the text, the form answer and the office card.
// End to end on a local Postgres copy with the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/clockout_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(ROOT + '/supabase/functions/_shared/office/clockout.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const rejects = async (p, want, m) => { try { await p; ok(false, m + ' (did not fail)'); } catch (e) { eq(e.message, want, m); } };

// ---------- names, times, payroll ----------
eq(C.display('Melton, Kristie'), 'Kristie Melton', 'WellSky "Last, First" reads as First Last');
eq(C.nameKey('Melton, Kristie'), C.nameKey('Kristie  Melton'), 'one key for both spellings');
eq(C.centralNaive(Date.parse('2026-11-11T12:12:45Z')), '2026-11-11T06:12:45', 'Central time in November (CST)');
eq(C.shortDay('2026-11-10T17:47:00'), 'Tue 11/10', 'short day');
eq(C.clock('2026-11-10T17:47:00'), '5:47 PM', 'clock');
eq(C.payroll('2026-11-10'), { weekEnd: '2026-11-14', locks: '2026-11-18', paid: '2026-11-19' }, 'pay week Sun to Sat, locks Wednesday, paid Thursday');

// ---------- 1. which shifts were never clocked out ----------
const at = iso => Date.parse(iso);
const stores = {
  careLogs: { logs: [
    { consumer: 'Melton, Kristie', auth: 'A1', clockIn: '2026-11-10T17:47:00', clockOut: null, seen: '2026-11-11T12:12:45' },     // evening shift
    { consumer: 'Melton, Kristie', auth: 'A1', clockIn: '2026-11-12T08:00:00', clockOut: null, seen: '2026-11-13T12:10:00' },     // morning shift
    { consumer: 'Barnwell, Susan', auth: 'A2', clockIn: '2026-11-12T09:00:00', clockOut: '2026-11-12T13:00:00', seen: '2026-11-13T12:10:00' },
    { consumer: 'Bell, Pamela', auth: 'A3', clockIn: '2026-11-01T09:00:00', clockOut: null, seen: '2026-11-02T12:10:00' },        // too old
    { consumer: 'Dodd, Crystal', auth: 'A4', clockIn: '2026-11-12T10:00:00', clockOut: null, seen: '2026-11-13T12:10:00' },
  ] },
  careLogsUploaded: { at: '2026-11-13T15:00:00Z', logs: [
    { consumer: 'Crystal Dodd', attendant: 'Anita Smith', clockIn: '2026-11-12T10:00:00', clockOut: '2026-11-12T14:00:00' },    // fixed since
    { consumer: 'Kristie Melton', attendant: 'Larissa Melton', clockIn: '2026-11-12T08:00:00', clockOut: null },
  ] },
};
let found = C.openShifts(stores, at('2026-11-13T15:30:00Z'), C.DEFAULTS);
eq(found.map(s => [s.consumer, s.clockIn, s.attendant]), [['Kristie Melton', '2026-11-12T08:00:00', 'Larissa Melton']],
   'the morning shift is caught; the evening one waits a day; a clocked-out copy closes it; old ones are left alone');
const early = { careLogs: { logs: [stores.careLogs.logs[0]] } };
eq(C.openShifts(early, at('2026-11-11T15:00:00Z'), C.DEFAULTS).length, 0, 'the 6am email only runs to midnight: a 5:47 PM shift is not called open the next morning (it may be overnight)');
const later = { careLogs: { logs: [Object.assign({}, stores.careLogs.logs[0], { seen: '2026-11-12T12:10:00' })] } };
eq(C.openShifts(later, at('2026-11-12T15:00:00Z'), C.DEFAULTS).map(s => s.consumer), ['Kristie Melton'], 'the morning after next it is caught');
eq(C.openShifts({ wellskyCheck: { open: { pulledLocal: '2026-11-11T06:30:00', rows: [{ consumer: 'Kristie Melton', attendant: 'Larissa Melton', clockIn: '2026-11-10T17:47:00', status: 'In Progress' }] } } },
   at('2026-11-11T15:00:00Z'), C.DEFAULTS).length, 1, 'the live WellSky report (when it runs) catches it the next morning');

// ---------- 2. who to text ----------
const roster = [
  { name: 'Larissa Melton', consumer: 'Kristie Melton', status: 'active', phone: '(417) 555-0101' },
  { name: 'Anita Smith', consumer: 'Susan Barnwell', status: 'active', phone: '' },
  { name: 'Bob Jones', consumer: 'Crystal Dodd', status: 'active' }, { name: 'Ann Lee', consumer: 'Crystal Dodd', status: 'active' },
  { name: 'Old Hand', consumer: 'Pamela Bell', status: 'inactive', phone: '4175550199' },
];
const pool = [{ first_name: 'Anita', last_name: 'Smith', phone: '417-555-0102', archived: false }];
eq(C.whoWorked({ consumer: 'Kristie Melton', attendant: '' }, roster, pool), { name: 'Larissa Melton', guessed: true, phone: '+14175550101', why: '' }, 'no name from WellSky: the one active attendant for that consumer');
eq(C.whoWorked({ consumer: 'Susan Barnwell', attendant: 'Smith, Anita' }, roster, pool).phone, '+14175550102', 'a phone from the caregiver pool when the roster has none');
eq(C.whoWorked({ consumer: 'Crystal Dodd', attendant: '' }, roster, pool).why, 'The hub lists 2 attendants for Crystal Dodd. Check WellSky for who worked it.', 'two attendants: no guessing');
eq(C.whoWorked({ consumer: 'Pamela Bell', attendant: '' }, roster, pool).why, 'No active attendant for Pamela Bell on the hub roster.', 'inactive attendants are not texted');
eq(C.whoWorked({ consumer: 'X Y', attendant: 'Nobody Here' }, roster, pool).why, 'No phone on file for Nobody Here. Add it on their hub profile.', 'no phone: said, not skipped');

const sms = C.smsFor({ attendant: 'Larissa Melton', consumer: 'Kristie Melton', clock_in: '2026-11-10T17:47:00' }, C.LINK + 'AbCdEfGhIjKlMnOp');
eq(sms, "Hi Larissa, it's Caring Companions CDS. You did not clock out of your shift with Kristie on Tue 11/10. To be paid for it, please fill out this form: hub.caringcds.com/evv-form?fix=AbCdEfGhIjKlMnOp", 'the text');
ok(sms.length <= C.SMS_MAX, 'the text stays short (' + sms.length + ' characters)');
ok(!/[–—]/.test(sms + C.wellskySteps({ consumer: 'a', attendant: 'b', clock_in: '2026-11-10T17:47:00', answer: { clockOut: '2026-11-10T21:00:00', hours: 3.2, reason: 'x' } }).join('')), 'no em or en dashes');
ok(C.textHoursOpen(at('2026-11-15T15:00:00Z'), C.DEFAULTS) && !C.textHoursOpen(at('2026-11-15T13:30:00Z'), C.DEFAULTS) && !C.textHoursOpen(at('2026-11-16T01:30:00Z'), C.DEFAULTS),
   'texts 9am to 7pm Central only (9am Sunday yes, 7:30am no, 7:30pm no)');

// ---------- the database ----------
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
await pg.exec(`create table agency_data (id uuid primary key default gen_random_uuid(), agency_id text, data_key text, data_value jsonb, unique (agency_id, data_key));
  do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
  create table evv_submissions (id uuid default gen_random_uuid() primary key, agency_id text not null, attendant text not null, consumer text not null,
    visitdate date not null, submitdate date, orig_in time, orig_out time, new_in time, new_out time, reason text, tasks_performed jsonb, notes text,
    sig_attendant text, sig_attendant_date date, sig_consumer text, sig_consumer_date date, submitted_at timestamptz default now(), processed boolean default false);`);
await pg.exec(strip(readFileSync(ROOT + '/caregiver_signup_alert.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/evv_form_454.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/clockout_fixes.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'the SQL runs twice');
eq((await pg.query(`select value->'live' v from cds_match_settings where key='clockout_texts'`)).rows[0].v, false, 'starts switched off');
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
ok(!(await can('anon', 'select * from cds_clockout_fixes')) && !(await can('authenticated', 'select * from cds_clockout_fixes')), 'only the server reads the shifts and phones');
ok(!(await can('authenticated', `update cds_clockout_fixes set status='fixed'`)), 'hub staff cannot change them directly');
ok(await can('anon', `insert into evv_submissions (agency_id, attendant, consumer, visitdate) values ('caring-companions-cds','a','b','2026-11-01')`), 'the plain public form still saves');

const put = (k, v) => pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds',$1,$2::jsonb) on conflict (agency_id, data_key) do update set data_value=excluded.data_value`, [k, JSON.stringify(v)]);
await put('careLogs', stores.careLogs); await put('careLogsUploaded', stores.careLogsUploaded); await put('attendants', roster);
await pg.query(`insert into cds_match_settings (key, value) values ('staff_emails', '["krystal@mo-care.com"]'::jsonb) on conflict (key) do update set value=excluded.value`);

let NOW = at('2026-11-13T12:30:00Z');   // 6:30 AM Central: before text hours
const sent = [];
let sendFails = false;
const fix = C.createClockout({ db: { query: (t, p) => pg.query(t, p) }, now: () => NOW, send: async m => { if (sendFails) throw new Error('GoHighLevel 400: bad number'); sent.push(m); } });

let r = await fix.sweep();
eq([r.open, r.added, r.texts], [1, 1, 0], 'found at 6:30 AM, no text before 9');
NOW = at('2026-11-13T15:10:00Z');   // 9:10 AM
r = await fix.sweep();
eq([r.added, r.texts, r.practice, r.sent, sent.length], [0, 1, 1, 0, 0], 'at 9:10 one text, written as practice: the switch is off, nothing sent');
r = await fix.sweep();
eq(r.texts, 0, 'one text per shift, never twice');
const box = (await pg.query(`select audience, template, to_display, body, status from cds_outbox where template='clockout_fix'`)).rows;
eq(box.map(b => [b.audience, b.to_display, b.status]), [['caregiver', '(***) ***-0101', 'practice']], 'in Messages, phone masked');
const token = /fix=([0-9A-Za-z]{16})/.exec(box[0].body)[1];
ok(!(await pg.query(`select 1 from cds_clockout_fixes where token_hash=$1`, [token])).rows.length, 'only a fingerprint of the link is kept');

// ---------- 3. the form ----------
const g = await fix.form({ action: 'form_get', token });
eq([g.state, g.shift.attendant, g.shift.consumer, g.shift.date, g.shift.clockIn, g.shift.when], ['open', 'Larissa Melton', 'Kristie Melton', '2026-11-12', '08:00', 'Thu 11/12 at 8:00 AM'], 'the form opens filled in');
await rejects(fix.form({ action: 'form_get', token: 'x' }), 'This link is not complete. Please open the whole link from the text.', 'a broken link');
await rejects(fix.form({ action: 'form_get', token: 'AAAAAAAAAAAAAAAA' }), 'This link is not working. Please call the office at (417) 218-2888.', 'someone else\'s guess');
const sig = 'data:image/png;base64,' + 'A'.repeat(400);
const answer = { clockOutDate: '2026-11-12', clockOut: '12:15', reason: 'Forgot to clock out', tasks: ['Bathing', 'Meal Prep and Eating'], notes: '', sigAttendant: sig, sigConsumer: sig };
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { clockOut: '07:00' }) }), 'The clock out time has to be after you clocked in (8:00 AM on Thu 11/12).', 'before the clock in');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { clockOutDate: '2026-11-14' }) }), 'That is more than 24 hours after you clocked in. Please check the day, or call the office.', 'more than a day');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { sigConsumer: '' }) }), "The consumer's signature is needed.", 'the consumer must sign (the CDS consumer verifies the time)');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { reason: 'Other' }) }), 'Please say what happened.', 'Other needs words');
r = await fix.form({ action: 'form_submit', token, answer });
eq(r.hours, 4.3, 'saved: 8:00 AM to 12:15 PM is 4.3 hours (rounded to a tenth)');
const evv = (await pg.query(`select attendant, consumer, visitdate::text, orig_in::text, orig_out, new_in::text, new_out::text, reason, tasks_performed, processed, clockout_fix_id is not null linked from evv_submissions where id=$1`, [r.id])).rows[0];
eq(evv, { attendant: 'Larissa Melton', consumer: 'Kristie Melton', visitdate: '2026-11-12', orig_in: '08:00:00', orig_out: null, new_in: '08:00:00', new_out: '12:15:00',
          reason: 'Forgot to clock out', tasks_performed: ['Bathing', 'Meal Prep and Eating'], processed: false, linked: true }, 'saved as a normal EVV form, linked to the shift');
await rejects(fix.form({ action: 'form_submit', token, answer }), 'This form was already sent. Thank you.', 'only once');
eq((await fix.form({ action: 'form_get', token })).state, 'answered', 'the link now says it was sent');

// ---------- 4. the office card ----------
await rejects(fix.act('someone@else.com', { action: 'list' }), 'This sign-in is not on the CDS office staff list.', 'staff only');
let L = await fix.act('krystal@mo-care.com', { action: 'list' });
const c1 = L.cards[0];
eq([L.live, c1.status, c1.attendant, c1.guessed, c1.answer.clockOutWhen, c1.answer.hours, c1.long, c1.payroll.locks], [false, 'answered', 'Larissa Melton', false, 'Thu 11/12 at 12:15 PM', 4.3, false, '2026-11-18'], 'the card shows the proposed fix and the payroll lock');
eq(c1.steps[2], 'Leave Clock In at 8:00 AM. Set Clock Out to Thu 11/12 12:15 PM (4.3 hours).', 'exactly what to change in WellSky');
await rejects(fix.act('krystal@mo-care.com', { action: 'done', id: c1.id }), 'Approve it first.', 'cannot mark fixed before approving');
await fix.act('krystal@mo-care.com', { action: 'approve', id: c1.id });
eq((await pg.query(`select processed from evv_submissions where id=$1`, [r.id])).rows[0].processed, true, 'approving takes it off the plain EVV forms list (no double work)');
await fix.act('krystal@mo-care.com', { action: 'done', id: c1.id });
L = await fix.act('krystal@mo-care.com', { action: 'list' });
eq([L.cards[0].status, L.cards[0].fixedBy], ['fixed', 'Krystal'], 'done, fixed in WellSky');
eq((await pg.query(`select action from cds_audit where action like 'clockout_%' order by id`)).rows.map(x => x.action), ['clockout_approve', 'clockout_fixed_in_wellsky'], 'every decision is recorded');

// ---------- no phone, the office link, closing on its own, live sending ----------
await put('careLogs', { logs: [...stores.careLogs.logs,
  { consumer: 'Barnwell, Susan', clockIn: '2026-11-13T08:00:00', clockOut: null, seen: '2026-11-14T12:10:00' },
  { consumer: 'Dodd, Crystal', clockIn: '2026-11-13T08:30:00', clockOut: null, seen: '2026-11-14T12:10:00' }] });
await pg.query(`insert into attendant_pool (agency_id, first_name, last_name, phone) values ('caring-companions-cds','Anita','Smith','417-555-0102')`);
NOW = at('2026-11-14T15:10:00Z');
await pg.query(`update cds_match_settings set value = value || '{"live": true}'::jsonb where key='clockout_texts'`);
r = await fix.sweep();
eq([r.added, r.texts, r.sent], [2, 1, 1], 'live: Anita gets a real text (pool phone); the Crystal Dodd shift has two possible attendants');
eq([sent[0].to, /Hi Anita.*with Susan on Fri 11\/13/.test(sent[0].body)], ['+14175550102', true], 'sent to the right phone with the right words');
L = await fix.act('krystal@mo-care.com', { action: 'list' });
const dodd = L.cards.find(x => x.consumer === 'Crystal Dodd');
eq([dodd.status, dodd.problem], ['no_attendant', 'The hub lists 2 attendants for Crystal Dodd. Check WellSky for who worked it.'], 'the card says what is missing');
await rejects(fix.act('krystal@mo-care.com', { action: 'link', id: dodd.id }), 'Type who worked the shift first.', 'office link needs a name');
const lk = await fix.act('krystal@mo-care.com', { action: 'link', id: dodd.id, attendant: 'Ann Lee' });
ok(/^https:\/\/hub\.caringcds\.com\/evv-form\?fix=[0-9A-Za-z]{16}$/.test(lk.url), 'the office gets a link to send from the office line');
eq((await fix.form({ action: 'form_get', token: lk.url.split('fix=')[1] })).shift.attendant, 'Ann Lee', 'that link opens for Ann Lee');
// WellSky now shows Susan's shift clocked out (fixed another way): it closes itself.
await put('careLogs', { logs: [{ consumer: 'Barnwell, Susan', clockIn: '2026-11-13T08:00:00', clockOut: '2026-11-13T12:00:00', seen: '2026-11-15T12:10:00' }] });
NOW = at('2026-11-15T15:10:00Z');
r = await fix.sweep();
eq(r.autoClosed, 1, 'a shift WellSky now shows clocked out closes on its own');
sendFails = true;
await put('careLogs', { logs: [{ consumer: 'Melton, Kristie', clockIn: '2026-11-14T08:00:00', clockOut: null, seen: '2026-11-15T12:10:00' }] });
r = await fix.sweep();
eq([r.failed], [1], 'a text GoHighLevel refuses is recorded as failed');
L = await fix.act('krystal@mo-care.com', { action: 'list' });
eq(L.cards.find(x => x.clockIn === '2026-11-14T08:00:00').textError, 'GoHighLevel 400: bad number', 'and the card shows why (no silent failures)');

// ---------- the hub and the form pages ----------
const page = readFileSync(ROOT + '/index.html', 'utf8');
const form = readFileSync(ROOT + '/evv-form.html', 'utf8');
ok(page.includes('id="clockoutCard"') && page.includes("functions/v1/cds-clockout"), 'the hub has the card');
ok(/loadPendingSubmissions[\s\S]{0,1500}clockout_fix_id/.test(page), 'the plain EVV list leaves out forms the card handles');
ok(form.includes("get('fix')") && form.includes('form_submit'), 'the form opens from the private link and sends through the server');
const block = s => s.slice(s.indexOf('// FORGOT TO CLOCK OUT'), s.indexOf('// END FORGOT TO CLOCK OUT'));
ok(!/[–—]/.test(block(page) + block(form)), 'no em or en dashes in the new hub or form words');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
