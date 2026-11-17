// My Week calendar server (2026-11-17): only Samantha, marks (done / moved), her own items, bad input refused.
// node tests/my_calendar_test.mjs
import { createCalendar, cleanItem, CalError } from '../supabase/functions/_shared/office/my-calendar.js';
import { hash as MUSTH } from '../supabase/functions/_shared/office/my-week-musts.js';
const rows = new Map();
const db = { query: async (t, p = []) => {
  if (/^select id, kind/.test(t)) return { rows: [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  if (/^select data from owner_calendar where id/.test(t)) return { rows: rows.has(p[0]) ? [rows.get(p[0])] : [] };
  if (/^insert into owner_calendar/.test(t)) { rows.set(p[0], { id: p[0], kind: /'item'/.test(t) ? 'item' : 'mark', data: JSON.parse(p[1]), updated_by: p[2] }); return { rows: [] }; }
  if (/^delete from owner_calendar where id = \$1/.test(t)) { rows.delete(p[0]); return { rows: [] }; }
  if (/^delete from owner_calendar where kind = 'mark' and id like/.test(t)) { const pre = p[0].slice(0, -1); for (const k of [...rows.keys()]) if (k.startsWith(pre)) rows.delete(k); return { rows: [] }; }
  throw new Error('unexpected sql ' + t);
} };
const cal = createCalendar({ db });
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', '·', n, c ? '' : JSON.stringify(d ?? '')); };
const refused = async (fn, status) => { try { await fn(); return false; } catch (e) { return e instanceof CalError && (!status || e.status === status); } };
const S = 'samantha@mo-care.com', C = 'Samantha@CaringCDS.com';

ok('a coordinator is refused', await refused(() => cal.handle('krystal@mo-care.com', { action: 'list' }), 403));
ok('no email is refused', await refused(() => cal.handle('', { action: 'list' }), 403));
ok('Samantha (either sign-in, any case) can list', (await cal.handle(C, { action: 'list' })).ok && (await cal.handle(S, { action: 'list' })).rows.length === 0);
let r = await cal.handle(S, { action: 'mark', key: 'w-mkt@2026-11-18', done: true });
ok('check off saves done', r.data.done === true && rows.get('m:w-mkt@2026-11-18').updated_by === S);
r = await cal.handle(C, { action: 'mark', key: 'w-mkt@2026-11-18', to: '2026-11-19' });
ok('moving keeps the check and adds the day', r.data.done === true && r.data.to === '2026-11-19');
r = await cal.handle(S, { action: 'mark', key: 'w-mkt@2026-11-18', done: false });
ok('uncheck keeps the move', !('done' in r.data) && r.data.to === '2026-11-19');
r = await cal.handle(S, { action: 'mark', key: 'w-mkt@2026-11-18', to: '2026-11-18' });
ok('moving back to its own day with nothing else clears the row', r.data === null && !rows.has('m:w-mkt@2026-11-18'));
// 2026-11-17: must-do items (billing, payroll, cutoffs) can be checked off but never moved
ok('a must-do item cannot be moved, and she is told why', await refused(() => cal.handle(S, { action: 'mark', key: 'w-money@2026-11-16', to: '2026-11-17' })));
r = await cal.handle(S, { action: 'mark', key: 'w-cdspay@2026-11-17', done: true });
ok('...but it can be checked off', r.data.done === true);
try { await cal.handle(S, { action: 'mark', key: 'w-cdspay@2026-11-17', to: '2026-11-20' }); } catch (e) { ok('...the words say it has a deadline', /has a deadline, so it cannot be moved/.test(e.message), e.message); }
ok('...and the check stayed', rows.get('m:w-cdspay@2026-11-17').data.done === true && !rows.get('m:w-cdspay@2026-11-17').data.to);
rows.set('m:w-viv-rpt@2026-11-20', { id: 'm:w-viv-rpt@2026-11-20', kind: 'mark', data: { to: '2026-11-23' } });
r = await cal.handle(S, { action: 'mark', key: 'w-viv-rpt@2026-11-20', to: null });
ok('an older move of a must-do item can still be put back on its own day', r.data === null);
ok('a dated cutoff cannot be moved either', await refused(() => cal.handle(S, { action: 'mark', key: 'd-20261120-' + MUSTH('Medicaid claim cutoff, 5 PM') + '@2026-11-20', to: '2026-11-21' })));
ok('list still works when the reminder table is not there yet', (await cal.handle(S, { action: 'list' })).reminders.length === 0);
ok('a bad key is refused', await refused(() => cal.handle(S, { action: 'mark', key: 'DROP TABLE@x', done: true })));
ok('a bad day is refused', await refused(() => cal.handle(S, { action: 'mark', key: 'w-big@2026-11-20', to: '2026-02-31' })));
r = await cal.handle(S, { action: 'add', item: { t: '  Call the bank  ', date: '2026-11-19', every: 'month', time: '2 PM', cat: 'money' } });
ok('add her own item', r.id.startsWith('i:') && r.data.t === 'Call the bank' && r.data.every === 'month' && r.data.cat === 'money');
const id = r.id;
await cal.handle(S, { action: 'mark', key: id.slice(2) + '@2026-11-19', done: true });
ok('her own item can be checked off', rows.has('m:' + id.slice(2) + '@2026-11-19'));
ok('a strange repeat becomes once, a strange colour becomes mine', (() => { const x = cleanItem({ t: 'x', date: '2026-01-01', every: 'hourly', cat: 'red' }); return x.every === 'once' && x.cat === 'mine'; })());
ok('a name is needed', await refused(() => cal.handle(S, { action: 'add', item: { t: ' ', date: '2026-11-19' } })));
ok('a long name is cut to 120', cleanItem({ t: 'a'.repeat(300), date: '2026-01-01' }).t.length === 120);
r = await cal.handle(S, { action: 'remove', id });
ok('removing her item also clears its check marks', !rows.has(id) && ![...rows.keys()].some((k) => k.includes(id.slice(2))));
ok('a built-in item cannot be removed', await refused(() => cal.handle(S, { action: 'remove', id: 'm:w-money@2026-11-16' })));
ok('an unknown action is refused', await refused(() => cal.handle(S, { action: 'drop' })));
console.log(pass, '/', pass + fail); process.exit(fail ? 1 : 0);
