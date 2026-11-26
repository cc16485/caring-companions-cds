// To-do lists for the CDS office (2026-11-26, Samantha: "Katlins to-do needs to be in the Caring Companions CDS
// Subaccount"). One list per person, kept by the cds-todo server function. First person: Katlin, who works
// 5:30 to 7:30 PM Missouri time from Vietnam. Later her Claude team-account project reads the same list.
//
// Rows live in cds_todo (todo.sql). Server only: the hub page never touches the table.
//   kind 'item'  id 'i:<id>'            data { who, t, how, when, days, date, by, at }
//   kind 'mark'  id 'm:<id>@YYYY-MM-DD'  data { who, done:true, by, at }   (that item, done on that Missouri day)
// when: 'days' = on these weekdays (0 Sun .. 6 Sat; Mon-Fri = every work night)
//       'once' = one time, from `date` on, until it is checked off (shows as late after its day)
//       'note' = a note from an owner, on top until it is cleared
// Who may do what: anyone on staff_emails (or an owner) sees and checks off their own list and adds one-time items
// for themselves. The owners (switch_owners) see everyone's list and add, change or remove anything.
// db.query(text, params) -> { rows }.
export class TodoError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]{6,24}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WHENS = ['days', 'once', 'note'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const lc = (s) => String(s || '').trim().toLowerCase();
export const okDate = (d) => DATE.test(String(d || '')) && !Number.isNaN(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
/* today's date in Missouri: the night she works is a Missouri evening, whatever the clock in Vietnam says */
export const moDay = (now = Date.now()) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
export const dow = (day) => new Date(day + 'T12:00:00Z').getUTCDay();

export function cleanItem(x) {
  x = x || {};
  const t = clean(x.t, 160);
  if (!t) throw new TodoError('Please write what to do.');
  const when = WHENS.includes(x.when) ? x.when : 'once';
  const how = clean(x.how, 1200);
  const out = { t, how, when };
  /* n = the order on the list (smaller first); new items go to the bottom */
  const n = Number(x.n); if (Number.isFinite(n) && n >= 0 && n < 1e10) out.n = Math.round(n);
  if (when === 'days') {
    const days = [...new Set((Array.isArray(x.days) ? x.days : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
    if (!days.length) throw new TodoError('Please pick at least one day.');
    out.days = days;
  }
  if (when === 'once') {
    if (!okDate(x.date)) throw new TodoError('Please pick a day.');
    out.date = x.date;
  }
  return out;
}

/* What shows for one person on one Missouri day. Pure, so the page and the tests use the same rule.
   items: [{ id, data }], marks: { '<itemId>@<day>': true }, onceDone: Set of item ids done on any day */
export function dayList(items, marks, day) {
  const d = dow(day), notes = [], tonight = [], later = [];
  const doneOnce = new Set(Object.keys(marks).filter((k) => marks[k]).map((k) => k.split('@')[0]));
  for (const it of items) {
    const x = it.data || {};
    if (x.when === 'note') { notes.push(it); continue; }
    if (x.when === 'days') {
      if ((x.days || []).includes(d)) tonight.push({ ...it, done: !!marks[it.id + '@' + day], late: false });
      else later.push(it);
      continue;
    }
    if (x.when === 'once') {
      if (doneOnce.has(it.id)) {
        /* a one-time item stays on the day it was checked off, then drops away */
        if (marks[it.id + '@' + day]) tonight.push({ ...it, done: true, late: false });
        continue;
      }
      if (x.date <= day) tonight.push({ ...it, done: false, late: x.date < day });
      else later.push(it);
    }
  }
  const rank = (x) => (x.late ? 0 : 1), ord = (x) => (Number.isFinite(x.data.n) ? x.data.n : 1e10);
  tonight.sort((a, b) => rank(a) - rank(b) || ord(a) - ord(b) || String(a.data.date || '').localeCompare(String(b.data.date || '')));
  later.sort((a, b) => String(a.data.date || '9').localeCompare(String(b.data.date || '9')) || (a.data.days || [9])[0] - (b.data.days || [9])[0]);
  return { notes, tonight, later };
}

export function createTodo({ db, now = () => Date.now() }) {
  async function setting(key, dflt) {
    const r = (await db.query('select value from cds_match_settings where key = $1', [key])).rows[0];
    return r ? r.value : dflt;
  }
  async function access(email) {
    const me = lc(email);
    if (!EMAIL.test(me)) throw new TodoError('Please sign in.', 401);
    const owners = (await setting('switch_owners', [])).map(lc);
    const staff = (await setting('staff_emails', [])).map(lc);
    const owner = owners.includes(me);
    if (!owner && !staff.includes(me)) throw new TodoError('This list is for the CDS office team.', 403);
    return { me, owner, staff: [...new Set([...owners, ...staff])] };
  }
  async function load(who) {
    const r = await db.query("select id, kind, data, updated_at from cds_todo where data->>'who' = $1 order by id", [who]);
    const items = [], marks = {};
    for (const x of r.rows) {
      if (x.kind === 'item') items.push({ id: x.id.slice(2), data: x.data, at: x.updated_at });
      else marks[x.id.slice(2)] = !!(x.data && x.data.done);
    }
    return { items, marks };
  }
  function whose(a, b) {
    const who = lc(b.who || a.me);
    if (who !== a.me && !a.owner) throw new TodoError('You can only open your own list.', 403);
    if (!EMAIL.test(who)) throw new TodoError('Please pick a person.');
    return who;
  }
  async function item(id) {
    return (await db.query("select data from cds_todo where id = $1 and kind = 'item'", [id])).rows[0] || null;
  }

  async function handle(email, b) {
    b = b || {};
    const a = await access(email);
    const action = String(b.action || 'list');
    if (action === 'list') {
      const who = whose(a, b);
      const day = okDate(b.day) ? b.day : moDay(now());
      const { items, marks } = await load(who);
      let people = [], listed = [];
      if (a.owner) {
        const r = await db.query("select distinct data->>'who' as who from cds_todo where kind = 'item'");
        listed = [...new Set(r.rows.map((x) => lc(x.who)))].filter(Boolean).sort();   /* people who have a list */
        people = [...new Set([...listed, ...a.staff])].filter(Boolean).sort();
      }
      return { ok: true, me: a.me, owner: a.owner, who, day, today: moDay(now()), people, listed, items, marks, ...dayList(items, marks, day) };
    }
    if (action === 'mark') {
      const id = String(b.id || ''), day = String(b.day || '');
      if (!ID.test(id)) throw new TodoError('That item could not be found.');
      if (!okDate(day)) throw new TodoError('Please pick a day.');
      const it = await item('i:' + id);
      if (!it) throw new TodoError('That item could not be found.', 404);
      if (lc(it.data.who) !== a.me && !a.owner) throw new TodoError('You can only check off your own list.', 403);
      const key = 'm:' + id + '@' + day;
      if (b.done) {
        await db.query(`insert into cds_todo (id, kind, data, updated_at, updated_by) values ($1, 'mark', $2::jsonb, now(), $3)
          on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`,
        [key, JSON.stringify({ who: lc(it.data.who), done: true, by: a.me, at: new Date(now()).toISOString() }), a.me]);
      } else {
        await db.query('delete from cds_todo where id = $1', [key]);
      }
      return { ok: true, id, day, done: !!b.done };
    }
    if (action === 'save') {
      const who = whose(a, b);
      const x = cleanItem(b.item);
      const id = b.id ? String(b.id) : Math.random().toString(36).slice(2, 12);
      if (!ID.test(id)) throw new TodoError('That item could not be found.');
      const cur = b.id ? await item('i:' + id) : null;
      if (b.id && !cur) throw new TodoError('That item could not be found.', 404);
      if (!a.owner) {
        /* a person may add and change their own one-time items; the standing list and notes are the owners' */
        if (x.when !== 'once') throw new TodoError('Only Samantha can change the every-night list. Add it as a one-time item, or send her a note.', 403);
        if (cur && (lc(cur.data.who) !== a.me || cur.data.when !== 'once' || cur.data.by && lc(cur.data.by) !== a.me)) throw new TodoError('Only Samantha can change that one.', 403);
      }
      if (cur && lc(cur.data.who) !== who) throw new TodoError('That item is on someone else\'s list.', 403);
      if (!Number.isFinite(x.n)) x.n = cur && Number.isFinite(cur.data.n) ? cur.data.n : Math.floor(now() / 1000);
      const data = { who, ...x, by: cur ? cur.data.by : a.me, at: cur ? cur.data.at : new Date(now()).toISOString(), changed_by: a.me };
      await db.query(`insert into cds_todo (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), $3)
        on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, ['i:' + id, JSON.stringify(data), a.me]);
      return { ok: true, id, data };
    }
    if (action === 'remove') {
      const id = String(b.id || '');
      if (!ID.test(id)) throw new TodoError('That item could not be found.');
      const cur = await item('i:' + id);
      if (!cur) return { ok: true, id, removed: false };
      const mine = lc(cur.data.who) === a.me && cur.data.when === 'once' && lc(cur.data.by) === a.me;
      if (!a.owner && !mine) throw new TodoError('Only Samantha can remove that one.', 403);
      await db.query("delete from cds_todo where id = $1 or id like $2", ['i:' + id, 'm:' + id + '@%']);
      return { ok: true, id, removed: true };
    }
    throw new TodoError('Unknown action.');
  }
  return { handle, access };
}
