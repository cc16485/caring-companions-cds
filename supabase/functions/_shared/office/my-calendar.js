// My Week calendar server logic (2026-11-17). Samantha's own calendar, the same in both hubs.
// Rows live in owner_calendar (my_calendar.sql). A mark = she checked an item off or moved it, for one day.
// An item = something she added herself (once, every week, month, quarter or year).
// Only her two sign-ins may use it. db.query(text, params) -> { rows }.
export const OWNERS = ['samantha@mo-care.com', 'samantha@caringcds.com'];
export class CalError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z0-9-]{1,40}@\d{4}-\d{2}-\d{2}$/;
const EVERY = ['once', 'week', 'month', 'quarter', 'year'];
const CATS = ['money', 'cds', 'marketing', 'growth', 'big', 'deadline', 'mine'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const okDate = (d) => DATE.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;

export function cleanItem(x) {
  x = x || {};
  const t = clean(x.t, 120);
  if (!t) throw new CalError('Please give it a name.');
  if (!okDate(x.date)) throw new CalError('Please pick a day.');
  const every = EVERY.includes(x.every) ? x.every : 'once';
  const time = clean(x.time, 12);
  const note = clean(x.note, 400);
  const cat = CATS.includes(x.cat) ? x.cat : 'mine';
  return { t, date: x.date, every, time, note, cat };
}

export function createCalendar({ db }) {
  async function list() {
    const r = await db.query('select id, kind, data, updated_at from owner_calendar order by id');
    return { ok: true, rows: r.rows.map((x) => ({ id: x.id, kind: x.kind, data: x.data, at: x.updated_at })) };
  }
  async function mark(email, b) {
    if (!KEY.test(String(b.key || ''))) throw new CalError('That item could not be found.');
    const id = 'm:' + b.key;
    const cur = (await db.query('select data from owner_calendar where id = $1', [id])).rows[0];
    const d = Object.assign({}, cur ? cur.data : {});
    if ('done' in b) d.done = !!b.done;
    if ('to' in b) {
      if (b.to === null || b.to === '') delete d.to;
      else if (okDate(b.to)) d.to = b.to;
      else throw new CalError('Please pick a day to move it to.');
    }
    if (!d.done) delete d.done;
    if (d.to === b.key.split('@')[1]) delete d.to;          // moved back to its own day
    if (!d.done && !d.to) { await db.query('delete from owner_calendar where id = $1', [id]); return { ok: true, id, data: null }; }
    await db.query(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'mark', $2::jsonb, now(), $3)
      on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [id, JSON.stringify(d), email]);
    return { ok: true, id, data: d };
  }
  async function add(email, b) {
    const it = cleanItem(b.item);
    const id = 'i:' + (b.id && /^[a-z0-9]{6,24}$/.test(b.id) ? b.id : Math.random().toString(36).slice(2, 12));
    await db.query(`insert into owner_calendar (id, kind, data, updated_at, updated_by) values ($1, 'item', $2::jsonb, now(), $3)
      on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [id, JSON.stringify(it), email]);
    return { ok: true, id, data: it };
  }
  async function remove(b) {
    const id = String(b.id || '');
    if (!/^i:[a-z0-9]{6,24}$/.test(id)) throw new CalError('Only things you added yourself can be removed.');
    await db.query('delete from owner_calendar where id = $1', [id]);
    await db.query("delete from owner_calendar where kind = 'mark' and id like $1", ['m:' + id.slice(2) + '@%']);
    return { ok: true, id };
  }
  async function handle(email, body) {
    email = String(email || '').toLowerCase();
    if (!OWNERS.includes(email)) throw new CalError('My Week is Samantha\'s own page.', 403);
    const b = body || {};
    if (b.action === 'list') return list();
    if (b.action === 'mark') return mark(email, b);
    if (b.action === 'add') return add(email, b);
    if (b.action === 'remove') return remove(b);
    throw new CalError('Unknown action.');
  }
  return { handle };
}
