// To-do lists (2026-11-26): who may see and change what, the night list rule, bad input refused.
// node tests/todo_test.mjs
import { createTodo, cleanItem, dayList, moDay, TodoError } from '../supabase/functions/_shared/office/todo.js';
const rows = new Map();
const settings = { switch_owners: ['samantha@mo-care.com', 'samantha@caringcds.com'], staff_emails: ['samantha@caringcds.com', 'katlin@mo-care.com', 'krystal@mo-care.com'] };
const db = { query: async (t, p = []) => {
  if (/^select value from cds_match_settings/.test(t)) return { rows: p[0] in settings ? [{ value: settings[p[0]] }] : [] };
  if (/^select id, kind, data, updated_at from cds_todo where data->>'who'/.test(t)) return { rows: [...rows.values()].filter((r) => r.data.who === p[0]).sort((a, b) => a.id.localeCompare(b.id)) };
  if (/^select distinct data->>'who'/.test(t)) return { rows: [...new Set([...rows.values()].filter((r) => r.kind === 'item').map((r) => r.data.who))].map((who) => ({ who })) };
  if (/^select data from cds_todo where id = \$1 and kind = 'item'/.test(t)) { const r = rows.get(p[0]); return { rows: r && r.kind === 'item' ? [r] : [] }; }
  if (/^insert into cds_todo/.test(t)) { rows.set(p[0], { id: p[0], kind: /'item'/.test(t) ? 'item' : 'mark', data: JSON.parse(p[1]), updated_by: p[2] }); return { rows: [] }; }
  if (/^delete from cds_todo where id = \$1 or id like/.test(t)) { const pre = p[1].slice(0, -1); for (const k of [...rows.keys()]) if (k === p[0] || k.startsWith(pre)) rows.delete(k); return { rows: [] }; }
  if (/^delete from cds_todo where id = \$1/.test(t)) { rows.delete(p[0]); return { rows: [] }; }
  throw new Error('unexpected sql ' + t);
} };
const NOW = Date.parse('2026-11-26T23:45:00Z');   // Thu Nov 26, 5:45 PM Missouri (Fri 6:45 AM in Vietnam)
const td = createTodo({ db, now: () => NOW });
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', '·', n, c ? '' : JSON.stringify(d ?? '')); };
const refused = async (fn, status) => { try { await fn(); return false; } catch (e) { return e instanceof TodoError && (!status || e.status === status); } };
const S = 'Samantha@CaringCDS.com', K = 'katlin@mo-care.com', Y = 'krystal@mo-care.com';

ok('the Missouri day is used, not the Vietnam one', moDay(NOW) === '2026-11-26');
ok('someone not on the office list is refused', await refused(() => td.handle('stranger@example.com', { action: 'list' }), 403));
ok('no sign-in is refused', await refused(() => td.handle('', { action: 'list' }), 401));

// Samantha sets up Katlin's list
let r = await td.handle(S, { action: 'save', who: K, item: { t: 'Call the leads that are ready', how: 'Talk with the consumer', when: 'days', days: [1, 2, 3, 4, 5] } });
const nightly = r.id;
ok('an owner adds an every-night item to Katlin\'s list', r.ok && r.data.who === K && r.data.days.join() === '1,2,3,4,5' && r.data.by === 'samantha@caringcds.com');
r = await td.handle(S, { action: 'save', who: K, item: { t: 'Enter EVV fixes', when: 'days', days: [1] } }); const monday = r.id;
r = await td.handle(S, { action: 'save', who: K, item: { t: 'I-9 Section 2 for Pat', when: 'once', date: '2026-11-24' } }); const late = r.id;
r = await td.handle(S, { action: 'save', who: K, item: { t: 'FCSR results', when: 'once', date: '2026-11-30' } }); const future = r.id;
r = await td.handle(S, { action: 'save', who: K, item: { t: 'Ruth said evenings are best. Try her first.', when: 'note' } }); const note = r.id;

// Katlin opens her list on Thursday night
r = await td.handle(K, { action: 'list' });
ok('Katlin sees her own list for tonight (Thursday)', r.who === K && r.day === '2026-11-26' && !r.owner);
ok('...the note is on top', r.notes.length === 1 && r.notes[0].id === note);
ok('...tonight has the every-night item and the late one-time item, late first', r.tonight.map((x) => x.id).join() === [late, nightly].join() && r.tonight[0].late === true, r.tonight);
ok('...the Monday-only item and the future one are under Coming up', r.later.map((x) => x.id).sort().join() === [monday, future].sort().join());
ok('...she does not get the people picker', r.people.length === 0);
ok('Katlin cannot open someone else\'s list', await refused(() => td.handle(K, { action: 'list', who: Y }), 403));

// checking off
r = await td.handle(K, { action: 'mark', id: nightly, day: '2026-11-26', done: true });
ok('Katlin checks off tonight\'s item', r.done && rows.get('m:' + nightly + '@2026-11-26').data.by === K);
r = await td.handle(K, { action: 'mark', id: late, day: '2026-11-26', done: true });
r = await td.handle(K, { action: 'list' });
ok('...both show done tonight', r.tonight.every((x) => x.done), r.tonight);
r = await td.handle(K, { action: 'list', day: '2026-11-27' });
ok('Friday: the every-night item is fresh again and the finished one-time item is gone', r.tonight.length === 1 && r.tonight[0].id === nightly && !r.tonight[0].done, r.tonight);
r = await td.handle(K, { action: 'list', day: '2026-11-30' });
ok('Monday: the Monday item and the one dated Monday are there', r.tonight.map((x) => x.id).sort().join() === [nightly, monday, future].sort().join(), r.tonight);
r = await td.handle(K, { action: 'mark', id: nightly, day: '2026-11-26', done: false });
ok('unchecking removes the mark', !rows.has('m:' + nightly + '@2026-11-26'));
ok('Krystal cannot check off Katlin\'s item', await refused(() => td.handle(Y, { action: 'mark', id: nightly, day: '2026-11-26', done: true }), 403));
ok('a made-up item id is refused', await refused(() => td.handle(K, { action: 'mark', id: 'zzzzzzzz', day: '2026-11-26', done: true }), 404));
ok('a bad day is refused', await refused(() => td.handle(K, { action: 'mark', id: nightly, day: '2026-02-30', done: true })));

// what Katlin may change
r = await td.handle(K, { action: 'save', item: { t: 'Call Harold back', when: 'once', date: '2026-11-27' } });
const mine = r.id;
ok('Katlin adds a one-time item for herself', r.ok && r.data.who === K && r.data.by === K);
ok('...she can change it', (await td.handle(K, { action: 'save', id: mine, item: { t: 'Call Harold back about the rate', when: 'once', date: '2026-11-27' } })).data.t === 'Call Harold back about the rate');
ok('...and remove it', (await td.handle(K, { action: 'remove', id: mine })).removed === true && !rows.has('i:' + mine));
ok('Katlin cannot add an every-night item, and is told why', await (async () => { try { await td.handle(K, { action: 'save', item: { t: 'x', when: 'days', days: [1] } }); return false; } catch (e) { return e.status === 403 && /Only Samantha can change the every-night list/.test(e.message); } })());
ok('Katlin cannot change Samantha\'s one-time item', await refused(() => td.handle(K, { action: 'save', id: future, item: { t: 'changed', when: 'once', date: '2026-11-30' } }), 403));
ok('Katlin cannot remove the every-night item', await refused(() => td.handle(K, { action: 'remove', id: nightly }), 403));
ok('Katlin cannot put items on Krystal\'s list', await refused(() => td.handle(K, { action: 'save', who: Y, item: { t: 'x', when: 'once', date: '2026-11-27' } }), 403));

// owners
r = await td.handle('samantha@mo-care.com', { action: 'list', who: K });
ok('an owner opens Katlin\'s list and gets the people picker with the office team', r.owner && r.people.includes(K) && r.people.includes(Y), r.people);
r = await td.handle(S, { action: 'save', id: nightly, who: K, item: { t: 'Call the ready leads', when: 'days', days: [1, 2, 3, 4] } });
ok('an owner changes an item; who first wrote it is kept', r.data.t === 'Call the ready leads' && r.data.days.join() === '1,2,3,4' && r.data.by === 'samantha@caringcds.com' && r.data.changed_by === 'samantha@caringcds.com');
ok('an item cannot be moved to someone else\'s list by saving it there', await refused(() => td.handle(S, { action: 'save', id: nightly, who: Y, item: { t: 'x', when: 'days', days: [1] } }), 403));
await td.handle(K, { action: 'mark', id: note, day: '2026-11-26', done: true });
r = await td.handle(S, { action: 'remove', id: note });
ok('an owner clears the note, and its marks go with it', r.removed && ![...rows.keys()].some((k) => k.includes(note)));

// input rules
ok('an empty item is refused', (() => { try { cleanItem({ t: '  ', when: 'once', date: '2026-11-26' }); return false; } catch (e) { return /write what to do/.test(e.message); } })());
ok('a days item needs a day', (() => { try { cleanItem({ t: 'x', when: 'days', days: [9] }); return false; } catch (e) { return /at least one day/.test(e.message); } })());
ok('a one-time item needs a real day', (() => { try { cleanItem({ t: 'x', when: 'once', date: '2026-13-01' }); return false; } catch (e) { return /pick a day/.test(e.message); } })());
ok('long words are cut and control characters cleaned', cleanItem({ t: 'a\u0007b' + 'x'.repeat(300), when: 'note' }).t.length === 160 && !/\u0007/.test(cleanItem({ t: 'a\u0007b', when: 'note' }).t));
ok('an unknown action is refused', await refused(() => td.handle(K, { action: 'drop' })));
ok('dayList alone: nothing on a day with no items', (() => { const x = dayList([], {}, '2026-11-26'); return !x.notes.length && !x.tonight.length && !x.later.length; })());

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
