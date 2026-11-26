// The start-date alert (2026-11-26): first look says nothing; a new or changed state start date emails both, texts
// Samantha in text hours (7 AM to 8 PM Missouri) or at 7 AM, puts it on Katlin's to-do and Samantha's My Week;
// practice records without sending; failures recorded; examples stay quiet. node tests/start_alert_test.mjs
import { createStartAlert, changes, words, textHours, moHour } from '../supabase/functions/_shared/office/start-alert.js';

function world(liveSetting = true) {
  const W = { settings: { start_alerts: { live: liveSetting, text_from: 7, text_until: 20, my_week: true, seen: {}, pending: [],
      recipients: [{ name: 'Samantha', email: 'samantha@mo-care.com', phone: '4175550199', todo: false }, { name: 'Katlin', email: 'katlin@mo-care.com', phone: null, todo: true }] } },
    consumers: [
      { id: 'C1', name: 'Linda Testcase', status: 'starting', cdsStartDate: '2026-11-23', county: 'Greene' },
      { id: 'C2', name: 'Ruth Example', status: 'starting' },
      { id: 'C3', name: 'Joe Madeup', status: 'starting', county: 'Christian', starting: { attendantName: 'Kayla Madeup' } },
      { id: 'C4', name: 'Old Active', status: 'active', cdsStartDate: '2026-10-01' } ],
    outbox: [], todo: new Map(), cal: new Map(), sent: [], failNext: false };
  W.db = { query: async (t, p = []) => {
    const s = t.replace(/\s+/g, ' ').trim();
    if (/^select value from cds_match_settings where key = 'start_alerts'/.test(s)) return { rows: W.settings.start_alerts ? [{ value: JSON.parse(JSON.stringify(W.settings.start_alerts)) }] : [] };
    if (/^update cds_match_settings set value = \$1::jsonb/.test(s)) { W.settings.start_alerts = JSON.parse(p[0]); return { rows: [] }; }
    if (/^select data_value from agency_data/.test(s)) return { rows: [{ data_value: JSON.parse(JSON.stringify(W.consumers)) }] };
    if (/^insert into cds_outbox/.test(s)) { W.outbox.push({ channel: p[0], to: p[1], body: p[2], status: p[3], error: p[4] }); return { rows: [] }; }
    if (/^insert into cds_todo/.test(s)) { W.todo.set(p[0], JSON.parse(p[1])); return { rows: [] }; }
    if (/^insert into owner_calendar/.test(s)) { W.cal.set(p[0], JSON.parse(p[1])); return { rows: [] }; }
    throw new Error('unexpected sql ' + s);
  } };
  W.send = async (m) => { if (W.failNext) { W.failNext = false; throw new Error('GoHighLevel 500'); } W.sent.push(m); };
  return W;
}
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', '·', n, c ? '' : JSON.stringify(d ?? '').slice(0, 700)); };
const DAY = Date.parse('2026-11-30T16:00:00Z');     // Monday 10 AM Missouri
const NIGHT = Date.parse('2026-12-01T03:30:00Z');   // Monday 9:30 PM Missouri
const MORNING = Date.parse('2026-12-01T13:05:00Z'); // Tuesday 7:05 AM Missouri

ok('text hours are Missouri hours, 7 AM to 8 PM', textHours(DAY) && !textHours(NIGHT) && textHours(MORNING) && moHour(NIGHT) === 21);

// first look
let W = world(); let clock = DAY; let A = createStartAlert({ db: W.db, send: W.send, now: () => clock });
let r = await A.run();
ok('first look remembers what is on file and says nothing', r.seeded === 2 && W.outbox.length === 0 && W.settings.start_alerts.seen.C1 === '2026-11-23' && W.settings.start_alerts.seeded, r);
r = await A.run();
ok('...and the next look finds nothing new', r.found === 0 && W.outbox.length === 0);

// a new start date, in the daytime
W.consumers[2].cdsStartDate = '2026-12-08';
W.consumers[2].medicaid = { log: [{ at: '2026-11-30T15:58:00Z', by: 'Katlin', text: 'Start date from the state set to Mon, Dec 8.' }] };
r = await A.run();
ok('a new start date: found, emails both, texts Samantha', r.found === 1 && r.sent === 3 && W.sent.filter((m) => m.channel === 'email').length === 2 && W.sent.filter((m) => m.channel === 'sms').length === 1, r);
const em = W.sent.find((m) => m.channel === 'email'), tx = W.sent.find((m) => m.channel === 'sms');
ok('...the email says who, when, who put it in, and what is next', /CDS start date: Joe Madeup starts Tuesday, December 8/.test(em.subject) && /Put in the hub by Katlin/.test(em.text) && /Put the authorization in WellSky/.test(em.text) && /Kayla Madeup has the packet done/.test(em.text) && /hub\.caringcds\.com\/#starting/.test(em.text), em);
ok('...the email has a big banner', /Start date from the state: Joe Madeup/.test(em.html));
ok('...the text is short, with first name and last initial only', /^CDS START DATE: Joe M\. starts Tuesday, December 8\./.test(tx.text) && tx.text.length < 240 && !/Madeup/.test(tx.text), tx.text);
ok('...no em dashes anywhere', !/—/.test(em.text + em.html + tx.text));
const kt = [...W.todo.values()][0];
ok('...it is at the top of Katlin\'s to-do today with the next steps', W.todo.size === 1 && kt.who === 'katlin@mo-care.com' && kt.n === 0 && kt.date === '2026-11-30' && /START DATE: Joe Madeup/.test(kt.t) && /1\. Put the authorization in WellSky/.test(kt.how) && /^[a-z0-9]{6,24}$/.test([...W.todo.keys()][0].slice(2)), [...W.todo.entries()]);
ok('...and on Samantha\'s My Week today', [...W.cal.values()].some((c) => c.date === '2026-11-30' && /START DATE: Joe Madeup/.test(c.t)));
ok('...every message recorded as sent (masked)', W.outbox.length === 3 && W.outbox.every((o) => o.status === 'sent') && W.outbox.some((o) => o.to === '…0199'), W.outbox);
r = await A.run();
ok('...and it is said once', r.found === 0 && W.sent.length === 3);

// a changed date, at night
clock = NIGHT; W.consumers[2].cdsStartDate = '2026-12-10';
r = await A.run();
ok('a changed date at night: emails both now, the text waits', r.found === 1 && W.sent.length === 5 && W.sent.slice(3).every((m) => m.channel === 'email') && r.waiting_texts === 1, r);
ok('...the email says changed, and from what', /changed to Thursday, December 10 \(was Tuesday, December 8\)/.test(W.sent[3].text));
clock = MORNING; r = await A.run();
ok('at 7 AM the waiting text goes', W.sent.length === 6 && W.sent[5].channel === 'sms' && /December 10/.test(W.sent[5].text) && r.waiting_texts === 0, r);

// changed twice overnight: only the newest text
clock = NIGHT + 864e5; W.consumers[2].cdsStartDate = '2026-12-11'; await A.run();
W.consumers[2].cdsStartDate = '2026-12-12'; await A.run();
const before = W.sent.length;
clock = MORNING + 864e5; await A.run();
const morningTexts = W.sent.slice(before).filter((m) => m.channel === 'sms');
ok('changed twice overnight: one text at 7 AM, the newest date', morningTexts.length === 1 && /December 12/.test(morningTexts[0].text), morningTexts);

// failures and practice
clock = DAY + 2 * 864e5; W.failNext = true; W.consumers[0].cdsStartDate = '2026-12-15';
r = await A.run();
ok('a send that fails is recorded as failed with the reason', r.failed === 1 && W.outbox.some((o) => o.status === 'failed' && /GoHighLevel 500/.test(o.error)), W.outbox.slice(-3));
const P = world(false); const B = createStartAlert({ db: P.db, send: P.send, now: () => DAY });
await B.run(); P.consumers[2].cdsStartDate = '2026-12-08'; r = await B.run();
ok('practice: recorded, nothing sent, lists still filled', r.practice === 3 && P.sent.length === 0 && P.outbox.every((o) => o.status === 'practice') && P.todo.size === 1);
const X = world(); const C = createStartAlert({ db: X.db, send: X.send, now: () => DAY });
await C.run(); X.consumers.push({ id: 'C9', name: 'Example Practice', status: 'starting', cdsStartDate: '2026-12-01' }); r = await C.run();
ok('an Example or Test record stays quiet', r.found === 0 && X.sent.length === 0);
const N = world(); N.settings.start_alerts = null;
ok('no setting yet: does nothing', (await createStartAlert({ db: N.db, send: N.send, now: () => DAY }).run()).skipped);

// pure parts
ok('changes(): only Starting people with a real date that is new or different', changes([{ id: 1, status: 'starting', cdsStartDate: '2026-12-01' }, { id: 2, status: 'starting', cdsStartDate: 'soon' }, { id: 3, status: 'active', cdsStartDate: '2026-12-01' }, { id: 4, status: 'Starting', cdsStartDate: '2026-12-02' }], { 4: '2026-12-02' }).map((x) => x.id).join() === '1');
ok('words(): a one-word name still reads', /^CDS START DATE: Cher starts/.test(words({ name: 'Cher', date: '2026-12-01', was: '' }).text));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
