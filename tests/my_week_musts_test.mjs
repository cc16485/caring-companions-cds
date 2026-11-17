// My Week must-do items and reminders (2026-11-17, her ask: can't move things that HAVE to be done; email and text her
// if they are not checked off). Proves the server's list (my-week-musts.js) matches the calendar (my-week.js), the
// reminder timing, and the reminder job against a fake database and a fake sender. node tests/my_week_musts_test.mjs
import fs from 'fs'; import path from 'path'; import vm from 'vm';
import { MUSTS, DEADLINES, dateId, mustIds, isMustKey, dueReminders, words } from '../supabase/functions/_shared/office/my-week-musts.js';
import { createReminders, LINK } from '../supabase/functions/_shared/office/my-reminders.js';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', '·', n, c ? '' : JSON.stringify(d ?? '').slice(0, 400)); };

// ---- the calendar's own list, from my-week.js as the browser runs it ----
const src = fs.readFileSync(path.join(process.cwd(), 'my-week.js'), 'utf8');
const ctx = { window: {}, document: { getElementById: () => null, addEventListener: () => {}, createElement: () => ({}), head: { appendChild: () => {} } },
  localStorage: { getItem: () => null, setItem: () => {} }, console, Intl, Date, Map, Set };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const MW = ctx.MW;
ok('my-week.js loads and shares its must list', MW && MW.MUST && typeof MW.mustOf === 'function');
const clientItems = MW.WEEKLY.map((w) => Object.assign({ every: 'week' }, w)).concat(MW.RULES);
ok('the calendar and the server name the same weekly, quarterly and yearly must-do items',
  JSON.stringify(Object.keys(MW.MUST).sort()) === JSON.stringify(MUSTS.map((m) => m.id).sort()), [Object.keys(MW.MUST), MUSTS.map((m) => m.id)]);
for (const m of MUSTS) {
  const c = clientItems.find((x) => x.id === m.id);
  ok(m.id + ': on the calendar with the same name and day', c && c.t === m.t && c.every === m.every && (m.every !== 'week' || c.dow === m.dow)
    && (m.every !== 'quarter' || (c.day === m.day && JSON.stringify(c.months) === JSON.stringify(m.months))) && (m.every !== 'year' || (c.month === m.month && c.day === m.day)), [c, m]);
  ok(m.id + ': the same words on the lock', MW.MUST[m.id] === m.label, [MW.MUST[m.id], m.label]);
}
const clientDeadlines = MW.DATES.filter((d) => d.cat === 'deadline').map((d) => [d.date, d.t, d.id]);
ok('every dated deadline on the calendar is on the server list, with the same id', clientDeadlines.length === DEADLINES.length
  && clientDeadlines.every(([d, t, id]) => DEADLINES.some(([d2, t2]) => d2 === d && t2 === t) && id === dateId(d, t)), clientDeadlines);
ok('dated deadlines are must-do on the calendar too', MW.DATES.filter((d) => d.cat === 'deadline').every((d) => MW.mustOf(d)));
ok('items that are not must-do stay movable', !MW.mustOf(MW.WEEKLY.find((w) => w.id === 'w-mkt')) && !MW.mustOf({ own: true, id: 'w-money' }));
ok('isMustKey knows them', isMustKey('w-money@2026-11-16') && isMustKey(dateId('2026-11-20', 'Medicaid claim cutoff, 5 PM') + '@2026-11-20') && !isMustKey('w-mkt@2026-11-18'));
ok('no em dashes in any words', ![...MUSTS.map((m) => m.label + m.t), ...Object.values(MW.MUST)].some((x) => /[—–]/.test(x)));

// ---- timing (Central). Nov 2026 is CST, UTC-6 ----
const at = (s) => Date.parse(s + ':00-06:00');
const keys = (list) => list.map((r) => r.key + '#' + r.step).sort();
ok('Monday 11:59 AM: nothing yet', dueReminders(at('2026-11-23T11:59'), {}, new Set()).filter((r) => r.key === 'w-money@2026-11-23').length === 0);
let due = dueReminders(at('2026-11-23T12:00'), {}, new Set());
ok('Monday noon: Money in is due', keys(due).includes('w-money@2026-11-23#due'), keys(due));
ok('...but not when it is checked off', !dueReminders(at('2026-11-23T12:00'), { 'w-money@2026-11-23': { done: true } }, new Set()).some((r) => r.key === 'w-money@2026-11-23'));
ok('...and not again once sent', !dueReminders(at('2026-11-23T12:15'), {}, new Set(['w-money@2026-11-23#due'])).some((r) => r.key === 'w-money@2026-11-23'));
ok('CDS payroll (Tuesday): due Wednesday noon, last reminder Wednesday 2 PM', keys(dueReminders(at('2026-11-25T12:00'), {}, new Set())).includes('w-cdspay@2026-11-24#due')
  && keys(dueReminders(at('2026-11-25T14:00'), {}, new Set(['w-cdspay@2026-11-24#due']))).includes('w-cdspay@2026-11-24#last'));
ok('...a late first run sends only the last reminder, not both', keys(dueReminders(at('2026-11-25T15:00'), {}, new Set())).filter((k) => k.startsWith('w-cdspay@2026-11-24')).join() === 'w-cdspay@2026-11-24#last');
ok('...and never the first one after the last', !dueReminders(at('2026-11-25T16:00'), {}, new Set(['w-cdspay@2026-11-24#last'])).some((r) => r.key === 'w-cdspay@2026-11-24'));
ok('nothing is sent at night (9 PM) or before 7 AM', dueReminders(at('2026-11-23T21:00'), {}, new Set()).length === 0 && dueReminders(at('2026-11-24T06:59'), {}, new Set()).length === 0);
ok('...it waits for 7 AM', dueReminders(at('2026-11-24T07:00'), {}, new Set()).some((r) => r.key === 'w-money@2026-11-23'));
ok('the Medicaid cutoff Nov 20: noon, then 3 PM', keys(dueReminders(at('2026-11-20T12:00'), {}, new Set())).some((k) => k.endsWith('@2026-11-20#due') && k.startsWith('d-20261120'))
  && keys(dueReminders(at('2026-11-20T15:00'), {}, new Set())).some((k) => k.startsWith('d-20261120') && k.endsWith('#last')));
ok('fixed deadlines with no task (EVV forms Saturday) never send', !dueReminders(at('2026-11-23T12:00'), {}, new Set()).some((r) => r.id === 'w-evv' || r.id === 'y-q4sui'));
ok('nothing from before reminders began: last Monday (Nov 16) is never texted about', !dueReminders(at('2026-11-18T12:00'), {}, new Set()).some((r) => r.day < '2026-11-17'));
ok('...but this week\'s CDS payroll (Tue Nov 17) is: due Wed Nov 18 at noon', keys(dueReminders(at('2026-11-18T12:00'), {}, new Set())).includes('w-cdspay@2026-11-17#due'));
ok('nothing older than 3 weeks', !dueReminders(at('2026-12-31T12:00'), {}, new Set()).some((r) => r.day < '2026-12-10'));
ok('the quarter tax IDs (Dec 15): reminded Dec 26', keys(dueReminders(at('2026-12-26T09:00'), {}, new Set())).includes('q-empeon@2026-12-15#due'));
const w = words({ step: 'due', t: 'Money in: AxisCare billing and payroll prep', day: '2026-11-23', label: 'Due Monday by noon' }, LINK);
ok('the text says what, which day, when it was due, and links to My Week', /Not checked off yet: Money in/.test(w.text) && /Monday, Nov 23/.test(w.text) && /Due Monday by noon/.test(w.text) && w.text.includes(LINK), w.text);
ok('...short enough for one or two texts, no em dashes', w.text.length < 300 && !/[—–]/.test(w.text + w.html + w.subject), w.text.length);

// ---- the job, against a fake database and sender ----
function fake({ set, marks = {}, failSms = false }) {
  const sent = new Map(), out = [];
  const db = { query: async (t, p = []) => {
    if (/from owner_reminders/.test(t)) return { rows: set ? [set] : [] };
    if (/from owner_calendar where kind = 'mark'/.test(t)) return { rows: Object.entries(marks).map(([k, d]) => ({ id: 'm:' + k, data: d })) };
    if (/select key from owner_reminder_sent/.test(t)) return { rows: [...sent.keys()].map((key) => ({ key })) };
    if (/^insert into owner_reminder_sent/.test(t)) { if (!sent.has(p[0])) sent.set(p[0], { ok: p[1], sms: p[2], email: p[3], error: p[4] }); return { rows: [] }; }
    throw new Error('unexpected sql ' + t);
  } };
  const send = async (m) => { if (failSms && m.channel === 'sms') throw new Error('GoHighLevel 400: bad number'); out.push(m); };
  return { r: createReminders({ db, send }), sent, out };
}
const SET = { phone: '+15555550100', email: 'owner@example.test', live: true };
let f = fake({ set: SET });
let res = await f.r.run({ nowMs: at('2026-11-23T12:05') });
ok('Monday 12:05: one text and one email about Money in, recorded', res.sent >= 1 && f.out.some((m) => m.channel === 'sms' && /Money in/.test(m.text)) && f.out.some((m) => m.channel === 'email' && /Money in/.test(m.subject)) && f.sent.get('w-money@2026-11-23#due').ok === true, [res, f.out.length]);
const n1 = f.out.length; res = await f.r.run({ nowMs: at('2026-11-23T12:20') });
ok('...15 minutes later nothing repeats', f.out.length === n1, res);
f = fake({ set: SET, marks: { 'w-money@2026-11-23': { done: true } } }); await f.r.run({ nowMs: at('2026-11-23T12:05') });
ok('checked off: nothing about it', !f.out.some((m) => /Money in/.test(m.text)));
f = fake({ set: SET, failSms: true }); res = await f.r.run({ nowMs: at('2026-11-23T12:05') });
ok('a text that fails is written down, and the email still goes', f.sent.get('w-money@2026-11-23#due').sms.startsWith('failed') && f.sent.get('w-money@2026-11-23#due').email === 'sent' && f.sent.get('w-money@2026-11-23#due').ok === true);
f = fake({ set: { phone: '', email: '', live: true } }); res = await f.r.run({ nowMs: at('2026-11-23T12:05') });
ok('nowhere to send: recorded as failed (shows red on My Week), not silent', f.sent.get('w-money@2026-11-23#due').ok === false && res.failed >= 1, res);
f = fake({ set: Object.assign({}, SET, { live: false }) }); res = await f.r.run({ nowMs: at('2026-11-23T12:05') });
ok('switched off: nothing sent', f.out.length === 0 && res.note === 'reminders are off');
f = fake({ set: null }); res = await f.r.run({ nowMs: at('2026-11-23T12:05') });
ok('no recipients yet: nothing sent, says so', f.out.length === 0 && /no recipients/.test(res.note));
f = fake({ set: SET }); res = await f.r.run({ nowMs: at('2026-11-23T12:05'), test: true });
ok('a test sends one text and one email and records nothing', f.out.length === 2 && res.test.sms === 'sent' && res.test.email === 'sent' && f.sent.size === 0, res);

console.log(pass + ' / ' + (pass + fail)); process.exit(fail ? 1 : 0);
