// The filled-in EVV form and the office card for never-clocked-out shifts, end to end with the never-clocked-out
// texts job (consumer only) on a local Postgres copy, with the real SQL and the real server logic.
//   PGLITE=/path/to/pglite/dist/index.js node tests/clockout_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import(ROOT + '/supabase/functions/_shared/office/clockout.js');
const T = await import(ROOT + '/supabase/functions/_shared/office/open-shift-texts.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const rejects = async (p, want, m) => { try { await p; ok(false, m + ' (did not fail)'); } catch (e) { eq(e.message, want, m); } };
const at = iso => Date.parse(iso);

// ---------- small parts ----------
eq(C.centralNaive(at('2026-11-11T12:12:45Z')), '2026-11-11T06:12:45', 'Central time in November');
eq([C.shortDay('2026-11-10T17:47:00'), C.clock('2026-11-10T17:47:00')], ['Tue 11/10', '5:47 PM'], 'day and clock');
eq(C.payroll('2026-11-10'), { weekEnd: '2026-11-14', locks: '2026-11-18', paid: '2026-11-19' }, 'pay week Sun to Sat, paid Thursday');

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
await pg.exec(strip(readFileSync(ROOT + '/evv_form_454.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/open_shift_texts.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/clockout_fixes.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'the SQL runs twice');
const can = async (role, sql) => { await pg.exec('set role ' + role); try { await pg.query(sql); return true; } catch { return false; } finally { await pg.exec('reset role'); } };
ok(!(await can('anon', 'select * from cds_clockout_fixes')) && !(await can('authenticated', 'select * from cds_clockout_fixes')), 'only the server reads the shifts and links');
ok(!(await can('authenticated', `update cds_clockout_fixes set status='fixed'`)), 'hub staff cannot change them directly');
ok(await can('anon', `insert into evv_submissions (agency_id, attendant, consumer, visitdate) values ('caring-companions-cds','a','b','2026-11-01')`), 'the plain public form still saves');

const put = (k, v) => pg.query(`insert into agency_data (agency_id, data_key, data_value) values ('caring-companions-cds',$1,$2::jsonb) on conflict (agency_id, data_key) do update set data_value=excluded.data_value`, [k, JSON.stringify(v)]);
const authLogs = (atIso, shifts) => ({ analytics: { authLogs: { at: atIso, shifts } } });
await put('consumers', [{ name: 'Kristie Melton', phone: '(417) 555-0101', status: 'active' }, { name: 'Susan Barnwell', status: 'active' }]);
await put('attendants', [{ name: 'Larissa Melton', consumer: 'Kristie Melton', status: 'active' }]);
await put('wellskyCheck', authLogs('2026-11-17T12:20:00Z', [
  { consumer: 'Melton, Kristie', clockIn: '2026-11-16T08:00:00', clockOut: null },
  { consumer: 'Barnwell, Susan', clockIn: '2026-11-16T09:00:00', clockOut: null },
]));
await pg.query(`insert into cds_match_settings (key, value) values ('staff_emails', '["krystal@mo-care.com"]'::jsonb) on conflict (key) do update set value=excluded.value`);

let NOW = at('2026-11-17T15:10:00Z');   // 9:10 AM Central
const sent = [];
let smsFails = false;
const db = { query: (t, p) => pg.query(t, p) };
const fix = C.createClockout({ db, now: () => NOW });
const job = T.createOpenShiftTexts({ db, now: () => NOW, fixes: fix, sms: async (p, t) => { if (smsFails) throw new Error('GoHighLevel 400: bad number'); sent.push([p, t]); } });

// ---------- 1. the link goes in the consumer's text ----------
let r = await job.run();
eq([r.shifts, r.practice, r.missing, sent.length], [2, 1, 1, 0], 'switch off: practice only, nothing sent');
const marks = (await pg.query(`select data_value from agency_data where data_key='openShiftTexts'`)).rows[0].data_value.shifts;
const kText = Object.values(marks).find(m => m.consumer === 'Kristie Melton').to[0].text;
const token = (/evv-form\?fix=([0-9A-Za-z]{16})/.exec(kText) || [])[1];
ok(!!token, 'the text carries a private link to the filled-in form');
eq(kText, "Caring Companions CDS: Larissa Melton's shift with you on Mon, Nov 16 has a clock in time of 8:00 AM and no clock out time, so right now it won't be paid. To have us enter a clock out time, please complete the EVV form by Sat, Nov 21 at midnight for payroll: https://hub.caringcds.com/evv-form?fix=" + token,
   'the same words as before, with the private link in place of the plain one');
ok(!(await pg.query(`select 1 from cds_clockout_fixes where token_hash=$1`, [token])).rows.length, 'only a fingerprint of the link is kept');
eq((await pg.query(`select consumer, status from cds_clockout_fixes order by consumer`)).rows.map(x => [x.consumer, x.status]),
   [['Kristie Melton', 'waiting'], ['Susan Barnwell', 'no_phone']], 'each texted shift is on the office card; no phone is said, not skipped');
r = await job.run();
eq([r.shifts, (await pg.query(`select count(*)::int n from cds_clockout_fixes`)).rows[0].n], [0, 2], 'one text and one link per shift, never twice');

// ---------- 2. the form ----------
const g = await fix.form({ action: 'form_get', token });
eq([g.state, g.shift.attendant, g.shift.consumer, g.shift.date, g.shift.clockIn, g.shift.when, g.shift.due], ['open', 'Larissa Melton', 'Kristie Melton', '2026-11-16', '08:00', 'Mon 11/16 at 8:00 AM', 'Sat 11/21'], 'the form opens filled in, with the Saturday deadline');
await rejects(fix.form({ action: 'form_get', token: 'x' }), 'This link is not complete. Please open the whole link from the text.', 'a broken link');
await rejects(fix.form({ action: 'form_get', token: 'AAAAAAAAAAAAAAAA' }), 'This link is not working. Please call the office at (417) 218-2888.', 'a guessed link');
const sig = 'data:image/png;base64,' + 'A'.repeat(400);
const answer = { clockOutDate: '2026-11-16', clockOut: '12:15', reason: 'Forgot to clock out', tasks: ['Bathing', 'Meal Prep and Eating'], notes: '', sigAttendant: sig, sigConsumer: sig };
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { clockOut: '07:00' }) }), 'The clock out time has to be after the clock in (8:00 AM on Mon 11/16).', 'before the clock in');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { clockOutDate: '2026-11-18' }) }), 'That is more than 24 hours after the clock in. Please check the day, or call the office.', 'more than a day');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { sigConsumer: '' }) }), "The consumer's signature is needed.", 'the consumer signs');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { sigAttendant: '' }) }), "The attendant's signature is needed.", 'the attendant signs too');
await rejects(fix.form({ action: 'form_submit', token, answer: Object.assign({}, answer, { reason: 'Other' }) }), 'Please say what happened.', 'Other needs words');
r = await fix.form({ action: 'form_submit', token, answer });
eq(r.hours, 4.3, 'saved: 8:00 AM to 12:15 PM is 4.3 hours');
const evv = (await pg.query(`select attendant, consumer, visitdate::text, orig_in::text, orig_out, new_in::text, new_out::text, reason, tasks_performed, processed, clockout_fix_id is not null linked from evv_submissions where id=$1`, [r.id])).rows[0];
eq(evv, { attendant: 'Larissa Melton', consumer: 'Kristie Melton', visitdate: '2026-11-16', orig_in: '08:00:00', orig_out: null, new_in: '08:00:00', new_out: '12:15:00',
          reason: 'Forgot to clock out', tasks_performed: ['Bathing', 'Meal Prep and Eating'], processed: false, linked: true }, 'saved as a normal EVV form, linked to the shift');
await rejects(fix.form({ action: 'form_submit', token, answer }), 'This form was already sent. Thank you.', 'only once');
eq((await fix.form({ action: 'form_get', token })).state, 'answered', 'the link now says it was sent');

// ---------- 3. the office card ----------
await rejects(fix.act('someone@else.com', { action: 'list' }), 'This sign-in is not on the CDS office staff list.', 'staff only');
let L = await fix.act('krystal@mo-care.com', { action: 'list' });
const c1 = L.cards.find(x => x.consumer === 'Kristie Melton');
eq([L.live, c1.status, c1.answer.clockOutWhen, c1.answer.hours, c1.long, c1.payroll.weekEnd], [false, 'answered', 'Mon 11/16 at 12:15 PM', 4.3, false, '2026-11-21'], 'the card shows the proposed fix');
eq(c1.steps[2], 'Leave Clock In at 8:00 AM. Set Clock Out to Mon 11/16 12:15 PM (4.3 hours).', 'exactly what to change in WellSky');
await rejects(fix.act('krystal@mo-care.com', { action: 'done', id: c1.id }), 'Approve it first.', 'cannot mark fixed before approving');
await fix.act('krystal@mo-care.com', { action: 'approve', id: c1.id });
eq((await pg.query(`select processed from evv_submissions where id=$1`, [r.id])).rows[0].processed, true, 'approving takes it off the plain EVV forms list (no double work)');
await fix.act('krystal@mo-care.com', { action: 'done', id: c1.id });
L = await fix.act('krystal@mo-care.com', { action: 'list' });
eq([L.cards.find(x => x.id === c1.id).status, L.cards.find(x => x.id === c1.id).fixedBy], ['fixed', 'Krystal'], 'done, fixed in WellSky');
eq((await pg.query(`select action from cds_audit where action like 'clockout_%' order by id`)).rows.map(x => x.action), ['clockout_approve', 'clockout_fixed_in_wellsky'], 'every decision is recorded');
const susan = L.cards.find(x => x.consumer === 'Susan Barnwell');
const lk = await fix.act('krystal@mo-care.com', { action: 'link', id: susan.id });
ok(/^https:\/\/hub\.caringcds\.com\/evv-form\?fix=[0-9A-Za-z]{16}$/.test(lk.url), 'no phone: the office copies a link to send from the office line');
await rejects(fix.form({ action: 'form_submit', token: lk.url.split('fix=')[1], answer }), "Please put the attendant's name.", 'no attendant known: the form asks for the name');

// ---------- closing on its own, live sending, a failed text ----------
await put('wellskyCheck', authLogs('2026-11-18T12:20:00Z', [{ consumer: 'Barnwell, Susan', clockIn: '2026-11-16T09:00:00', clockOut: '2026-11-16T12:00:00' }]));
NOW = at('2026-11-18T15:10:00Z');
r = await job.run();
eq(r.closed, 1, 'a shift WellSky now shows clocked out closes on its own');
await pg.query(`update cds_match_settings set value='{"live": true}'::jsonb where key='open_shift_texts'`);
await put('wellskyCheck', authLogs('2026-11-18T12:20:00Z', [{ consumer: 'Melton, Kristie', clockIn: '2026-11-17T08:00:00', clockOut: null }]));
r = await job.run();
eq([r.sent, sent.length, /fix=[0-9A-Za-z]{16}$/.test(sent[0][1]), sent[0][0]], [1, 1, true, '4175550101'], 'live: the consumer gets the text with the private link');
smsFails = true;
await put('wellskyCheck', authLogs('2026-11-18T12:20:00Z', [{ consumer: 'Melton, Kristie', clockIn: '2026-11-17T13:00:00', clockOut: null }]));
NOW = at('2026-11-18T20:10:00Z');
r = await job.run();
eq(r.failed, 1, 'a refused text is counted');
L = await fix.act('krystal@mo-care.com', { action: 'list' });
eq(L.cards.find(x => x.clockIn === '2026-11-17T13:00:00').textError, 'GoHighLevel 400: bad number', 'and the card shows why (no silent failures)');

// ---------- the hub and the form pages ----------
const page = readFileSync(ROOT + '/index.html', 'utf8');
const form = readFileSync(ROOT + '/evv-form.html', 'utf8');
ok(page.includes('id="clockoutCard"') && page.includes("functions/v1/cds-clockout"), 'the hub has the card');
ok(/loadPendingSubmissions[\s\S]{0,1500}clockout_fix_id/.test(page), 'the plain EVV list leaves out forms the card handles');
ok(form.includes("get('fix')") && form.includes('form_submit'), 'the form opens from the private link and sends through the server');
ok(!/no_clock_in/.test(page + form), 'no clock in at all is left alone (her word)');
const block = s => s.slice(s.indexOf('// FORGOT TO CLOCK OUT'), s.indexOf('// END FORGOT TO CLOCK OUT'));
ok(!/[–—]/.test(block(page) + block(form)), 'no em or en dashes in the new hub or form words');

console.log(pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
