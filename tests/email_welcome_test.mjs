// CDS email sign-up + 4 welcome emails: end-to-end on a local Postgres copy with a fake GoHighLevel.
// Proves: the public box can only add name + email; nobody outside can read the list; unsubscribe only
// stops its own row; practice touches nothing; live timing, stops, no tags, one note, fails closed.
//   PGLITE=/path/to/pglite/dist/index.js node tests/email_welcome_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE || '/Users/samantha/Claude/Projects/.pglite/node_modules/@electric-sql/pglite/dist/index.js');
const W = await import(ROOT + '/supabase/functions/_shared/office/email-welcome.js');

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));

const pg = new PGlite();
const strip = s => s.replace(/notify pgrst[^;]*;/g, '').replace(/create extension[^;]*;/g, '');
await pg.exec(readFileSync(ROOT + '/caregiver-match/practice/base.sql', 'utf8'));
await pg.exec(strip(readFileSync(ROOT + '/cds_public_insert_lock.sql', 'utf8')));
await pg.exec(strip(readFileSync(ROOT + '/caregiver_match_phase1.sql', 'utf8')));
const SQL = strip(readFileSync(ROOT + '/cds_email_signup.sql', 'utf8'));
await pg.exec(SQL); await pg.exec(SQL);
ok(true, 'SQL runs twice');
eq((await pg.query(`select value from cds_match_settings where key='email_welcome'`)).rows[0].value, { live: false, test_to: ['samantha@mo-care.com'] }, 'starts OFF, tests go to Samantha');

// ---------- the public box ----------
await pg.exec('set role anon');
await pg.query(`insert into cds_email_signups (first_name, email, page) values ('  Rosa ', ' Rosa@Example.COM ', '/getting-paid/')`);
let threw = '';
try { await pg.query(`insert into cds_email_signups (first_name, email, step_sent, stopped_at, ghl_contact_id) values ('X','x@y.com', 4, now(), 'c1')`); } catch (e) { threw = e.message; }
ok(/permission/.test(threw), 'the public box cannot set staff columns (' + threw.slice(0, 60) + ')');
threw = ''; try { await pg.query(`insert into cds_email_signups (first_name, email) values ('X','not-an-email')`); } catch (e) { threw = e.message; }
ok(/check the name and email/.test(threw), 'a broken email is refused');
threw = ''; try { await pg.query(`select * from cds_email_signups`); } catch (e) { threw = e.message; }
ok(/permission/.test(threw), 'the public cannot read the list');
threw = ''; try { await pg.query(`update cds_email_signups set step_sent=4`); } catch (e) { threw = e.message; }
ok(/permission/.test(threw), 'the public cannot change the list');
eq((await pg.query(`select cds_email_unsubscribe('0123456789abcdef0123456789abcdef') r`)).rows[0].r, false, 'a made-up unsubscribe link stops nobody');
eq((await pg.query(`select cds_email_unsubscribe('x') r`)).rows[0].r, false, 'a short link is refused');
await pg.exec('reset role');
const rosa = (await pg.query(`select * from cds_email_signups`)).rows[0];
await pg.query(`update cds_email_signups set signed_up_at='2026-11-11T19:59:00Z'`);   // the box stamps the real clock; pin it for the timing below
eq([rosa.first_name, rosa.email, rosa.page, rosa.step_sent, rosa.stopped_at, rosa.unsub_token.length], ['Rosa', 'rosa@example.com', '/getting-paid/', 0, null, 32], 'cleaned and locked');

// ---------- the emails ----------
const all = W.EMAILS.map(e => [e.subj, e.pre, e.head, JSON.stringify(e.blocks), JSON.stringify(e.after || []), e.cta ? e.cta.label : ''].join(' ')).join(' ');
ok(!/—/.test(all), 'no em dashes');
ok(!/\bAI\b/.test(all), 'never says AI');
ok(!/what you already do|high pay|guarantee|fast approval|within \d+ (days|weeks)/i.test(all), 'no banned promises');
eq(W.EMAILS.map(e => e.subj), ['Your CDS worksheets are here', 'Who can be the paid caregiver?', 'The steps, start to finish', "Whenever you're ready"], 'her 4 subjects');
const m1 = W.render(1, 'Rosa', 'https://caringcds.com/unsubscribe/?t=abc');
ok(m1.html.includes('Hi Rosa,') && (m1.html.match(/getting-paid\/printables\/getting-paid-\d/g) || []).length === 6, 'email 1 has her name and all 6 worksheets');
ok(m1.html.includes('https://caringcds.com/unsubscribe/?t=abc') && m1.text.includes('Unsubscribe: https://caringcds.com/unsubscribe/?t=abc'), 'every email has their own unsubscribe link');
ok(W.render(2, '<b>x</b>', 'u').html.includes('Hi &lt;b&gt;x&lt;/b&gt;,'), 'a typed name cannot add HTML');
ok(W.render(3, '', 'u').html.includes('Hi there,'), 'no name: "Hi there"');
const m4 = W.render(4, 'Rosa', 'u');
ok(m4.html.includes('https://caringcds.com/check/') && m4.html.includes("We won&#39;t email again") === false && m4.html.includes("We won't email again"), 'email 4: check button and the last-email line');

// ---------- timing (Chicago) ----------
const at = s => Date.parse(s);
const base = { step_sent: 0, signed_up_at: '2026-11-11T20:00:00Z', last_sent_at: null, stopped_at: null };   // Wed 2pm CST
eq(W.nextStep(base, at('2026-11-11T20:10:00Z')), 1, 'email 1 at the next run');
eq(W.nextStep(base, at('2026-11-12T04:00:00Z')), null, 'email 1 not at 10pm');
eq(W.nextStep(base, at('2026-11-12T13:30:00Z')), 1, 'email 1 waits for 7am');
const s1 = { ...base, step_sent: 1, last_sent_at: '2026-11-11T20:10:00Z' };
eq(W.nextStep(s1, at('2026-11-13T16:00:00Z')), null, 'email 2 not before day 3');
eq(W.nextStep(s1, at('2026-11-14T16:00:00Z')), null, 'email 2 not on Saturday');
eq(W.nextStep(s1, at('2026-11-16T15:00:00Z')), null, 'email 2 not before 9:30 Monday');
eq(W.nextStep(s1, at('2026-11-16T15:40:00Z')), 2, 'email 2 Monday 9:40');
eq(W.nextStep({ ...base, step_sent: 2, last_sent_at: '2026-11-17T15:40:00Z' }, at('2026-11-18T16:00:00Z')), null, '2 days apart even if late');
eq(W.nextStep({ ...base, step_sent: 3, last_sent_at: '2026-11-18T15:40:00Z' }, at('2026-11-23T15:40:00Z')), 4, 'email 4 on day 12');
eq(W.nextStep({ ...base, step_sent: 4 }, at('2026-12-30T16:00:00Z')), null, 'nothing after email 4');
eq(W.nextStep({ ...base, stopped_at: 'x' }, at('2026-11-11T20:10:00Z')), null, 'stopped: nothing');

// ---------- a fake GoHighLevel ----------
let NOW = at('2026-11-11T20:10:00Z');
const book = [{ id: 'c-old', email: 'known@x.com' }, { id: 'c-dnd', email: 'dnd@x.com', dndSettings: { Email: { status: 'active' } } }];
const log = { created: [], notes: [], sent: [], tests: [] }; let inbound = new Set(), readFails = false, sendFails = false;
const ghl = {
  async search(q) { return book.filter(c => c.email === q); },
  async create(body) { log.created.push(body); const id = 'c-new' + log.created.length; book.push({ id, email: body.email }); return id; },
  async note(id, { body }) { log.notes.push([id, body]); },
  async inboundSince(id) { if (readFails) throw new Error('GoHighLevel 500'); return inbound.has(id); },
  async sendEmail(id, m) { if (sendFails) throw new Error('GoHighLevel 400 on /conversations/messages'); log.sent.push([id, m.subject]); },
  async sendTest(to, m) { log.tests.push([to, m.subject]); },
};
const db = { query: async (t, p) => pg.query(t, p) };
const job = W.createEmailWelcome({ db, ghl, now: () => NOW });

let r = await job.run();
eq([r.live, r.practice, r.sent], [false, 1, 0], 'practice: would send, sends nothing');
ok(!log.created.length && !log.notes.length && !log.sent.length, 'practice: GoHighLevel untouched');
r = await job.preview();
eq([r.sent, log.tests.map(x => x[1])], [4, ['[Test] Your CDS worksheets are here', '[Test] Who can be the paid caregiver?', '[Test] The steps, start to finish', "[Test] Whenever you're ready"]], 'preview: all 4 to Samantha with the switch off');
ok(log.tests.every(x => x[0] === 'samantha@mo-care.com'), 'preview goes only to the test address');

await pg.query(`update cds_match_settings set value = jsonb_set(value, '{live}', 'true') where key='email_welcome'`);
const add = (first, email, when) => pg.query(`insert into cds_email_signups (first_name, email, signed_up_at) values ($1, $2, $3)`, [first, email, when]);
await add('Known', 'known@x.com', '2026-11-11T20:01:00Z');
await add('Dee', 'dnd@x.com', '2026-11-11T20:02:00Z');
await add('Lead', 'lead@x.com', '2026-11-11T20:03:00Z');
await pg.query(`insert into site_leads (agency_id, first_name, email) values ('caring-companions-cds', 'Lead', 'LEAD@x.com')`);
await add('Rosa again', 'rosa@example.com', '2026-11-11T20:04:00Z');
r = await job.run();
eq([r.sent, r.stopped, r.failed], [2, 3, 0], 'live run: Rosa + Known get email 1; dnd, lead and the twin stop');
const st = Object.fromEntries((await pg.query(`select first_name, stop_reason, step_sent, ghl_contact_id, ghl_status from cds_email_signups`)).rows.map(x => [x.first_name, x]));
eq([st['Dee'].stop_reason, st['Lead'].stop_reason, st['Rosa again'].stop_reason], ['do not email in GoHighLevel', 'sent a form', 'signed up twice'], 'stop reasons');
eq([st['Known'].ghl_contact_id, st['Known'].ghl_status, st['Rosa'].ghl_status], ['c-old', 'found', 'created'], 'existing contact found by email, else made');
eq(log.created, [{ firstName: 'Rosa', email: 'rosa@example.com' }], 'a new contact gets first name + email only, no tags');
eq(log.notes.length, 2, 'one note each');
ok(log.notes.every(([, b]) => /Email sign-up on caringcds.com/.test(b) && /Not a lead/.test(b)), 'note says what it is');
r = await job.run();
eq([r.sent, log.notes.length], [0, 2], 'next run: nothing twice, no second note');

// email 2 (Monday 9:40 Chicago), reply check, fails closed
NOW = at('2026-11-16T15:40:00Z');
readFails = true; r = await job.run();
eq([r.sent, r.failed], [0, 2], 'GoHighLevel unreadable: nobody gets email 2 (fails closed)');
const failRow = (await pg.query(`select fail from cds_email_signups where first_name='Rosa'`)).rows[0].fail;
ok(/GoHighLevel 500/.test(failRow), 'the failure is written down for the 8am email');
readFails = false; inbound = new Set(['c-old']);
r = await job.run();
eq([r.sent, r.stopped], [1, 1], 'Known replied: stops; Rosa gets email 2');
eq((await pg.query(`select fail from cds_email_signups where first_name='Rosa'`)).rows[0].fail, null, 'failure cleared once it works');
sendFails = true; NOW = at('2026-11-18T15:40:00Z'); r = await job.run();
eq([r.sent, r.failed, (await pg.query(`select step_sent from cds_email_signups where first_name='Rosa'`)).rows[0].step_sent], [0, 1, 2], 'a failed send is not counted as sent');
sendFails = false; r = await job.run(); eq(r.sent, 1, 'email 3 goes on the next run');
NOW = at('2026-11-23T15:40:00Z'); r = await job.run(); eq(r.sent, 1, 'email 4 on day 12');
NOW = at('2026-12-30T15:40:00Z'); r = await job.run(); eq([r.active, r.sent], [0, 0], 'after email 4 she is done');
eq(log.sent.filter(x => x[0] === 'c-new1').map(x => x[1]), W.EMAILS.map(e => e.subj), 'Rosa got exactly the 4 emails, in order');

// unsubscribe stops only that person
await add('Una', 'una@x.com', '2026-12-30T15:00:00Z');
const una = (await pg.query(`select unsub_token from cds_email_signups where first_name='Una'`)).rows[0].unsub_token;
await pg.exec('set role anon');
eq((await pg.query(`select cds_email_unsubscribe($1) r`, [una])).rows[0].r, true, 'their own link works');
await pg.exec('reset role');
eq((await pg.query(`select count(*)::int n from cds_email_signups where stop_reason='unsubscribed'`)).rows[0].n, 1, 'only Una stopped');
r = await job.run(); eq(r.sent, 0, 'unsubscribed: nothing sent');

console.log(pass + ' passed, ' + failN + ' failed'); process.exit(failN ? 1 : 0);
