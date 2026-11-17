// My Week MUST-DO items (2026-11-17). Samantha: "make sure i can't move things that HAVE to be done - email and text me
// if they arent done or checked off...things that have a due date/time like billing/payroll".
// One list, used by the calendar server (cds-my-calendar refuses to move these) and the reminder job (cds-my-reminders
// texts and emails her when one is not checked off by its time). my-week.js (both hubs) marks the same items with a lock;
// tests/my_week_musts_test.mjs proves the two lists match. Times are Central. Pure: no network, no database.
//
// due:  { add: days after the item's own day, at: 'HH:MM' }  first reminder
// last: same shape, a second reminder if it is still not done
// lock: true and no due = a fixed deadline she cannot move, with no reminder (it is not a task she does)

export const START = '2026-11-17';          // reminders start the day they were built: Monday Nov 16 came before them
export const LOOKBACK_DAYS = 21;            // an unchecked must older than this is not texted about again
export const SEND_FROM = 7, SEND_UNTIL = 20; // reminders go 7 AM to 8 PM Central; one due overnight goes at 7 AM

export const MUSTS = [
  { id: 'w-money', every: 'week', dow: 1, t: 'Money in: AxisCare billing and payroll prep', label: 'Due Monday by noon', due: { add: 0, at: '12:00' } },
  { id: 'w-cdspay', every: 'week', dow: 2, t: 'CDS day: payroll, Medicaid and growth', label: 'Due Wednesday by noon, before the 3 PM payroll lock',
    due: { add: 1, at: '12:00' }, last: { add: 1, at: '14:00' } },
  { id: 'w-empeon-rpt', every: 'week', dow: 4, t: 'Empeon payroll reports to the CDS hub', label: 'Due Friday by noon', due: { add: 1, at: '12:00' } },
  { id: 'w-viv-rpt', every: 'week', dow: 5, t: 'Viventium payroll register for the books', label: 'Due Friday by 5 PM', due: { add: 0, at: '17:00' } },
  { id: 'w-evv', every: 'week', dow: 6, t: 'CDS EVV forms due', label: 'Fixed deadline', lock: true },
  { id: 'q-empeon', every: 'quarter', months: [3, 6, 9, 12], day: 15, t: 'Empeon CDS tax IDs', label: 'Due by the end of the quarter', due: { add: 11, at: '09:00' } },
  { id: 'y-w2', every: 'year', month: 1, day: 15, t: 'W-2s go out', label: 'Due Jan 31', due: { add: 14, at: '12:00' } },
  { id: 'y-q4sui', every: 'year', month: 1, day: 31, t: 'Q4 unemployment report due', label: 'Fixed deadline', lock: true },
];
// Dated deadlines (my-week.js DATES with the 'deadline' colour). Reminded at noon and 3 PM on the day.
export const DEADLINES = [
  ['2026-11-20', 'Medicaid claim cutoff, 5 PM'],
  ['2026-12-11', 'Medicaid claim cutoff, 5 PM'],
  ['2026-12-23', 'Enter claims early: the Dec 25 cutoff falls on Christmas'],
  ['2027-01-08', 'Medicaid claim cutoff, 5 PM'],
];
export const DEADLINE_DUE = { add: 0, at: '12:00' }, DEADLINE_LAST = { add: 0, at: '15:00' };

// the same id my-week.js gives a dated item
export const hash = (x) => { let h = 7; for (const ch of x) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h.toString(36).slice(0, 6); };
export const dateId = (date, t) => 'd-' + date.replace(/-/g, '') + '-' + hash(t);

function all() {
  return MUSTS.concat(DEADLINES.map(([date, t]) => ({ id: dateId(date, t), every: 'once', date, t, label: 'Fixed deadline', due: DEADLINE_DUE, last: DEADLINE_LAST })));
}
const IDS = new Set(all().map((m) => m.id));
export const mustIds = () => [...IDS];
// a mark key is '<id>@YYYY-MM-DD'
export const isMustKey = (key) => IDS.has(String(key || '').split('@')[0]);

// ---------- Central dates ----------
const D = (s) => new Date(s + 'T12:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function chicago(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute, h: +p.hour };
}
function hits(r, s) {
  const [y, m, d] = s.split('-').map(Number);
  const dd = (want) => (want >= 28 && d === lastDay(y, m) && want >= d) || want === d;
  if (r.every === 'week') return D(s).getUTCDay() === r.dow;
  if (r.every === 'quarter') return r.months.includes(m) && dd(r.day);
  if (r.every === 'year') return m === r.month && dd(r.day);
  return r.date === s;
}
const at = (day, x) => addDays(day, x.add) + ' ' + x.at;   // 'YYYY-MM-DD HH:MM', sortable

// Every reminder that is due now and not sent yet.
// marks: { '<id>@<date>': { done } }   sent: Set of '<id>@<date>#due' / '#last'
// Returns [{ key, step: 'due'|'last', id, day, t, label, when }].
export function dueReminders(nowMs, marks, sent) {
  const now = chicago(nowMs), out = [];
  if (now.h < SEND_FROM || now.h >= SEND_UNTIL) return out;
  const stamp = now.date + ' ' + now.hm;
  const from = addDays(now.date, -LOOKBACK_DAYS);
  for (const r of all()) {
    if (!r.due) continue;
    for (let day = from < START ? START : from; day <= now.date; day = addDays(day, 1)) {
      if (!hits(r, day)) continue;
      const key = r.id + '@' + day;
      if (marks && marks[key] && marks[key].done) continue;
      const steps = [['due', r.due]].concat(r.last ? [['last', r.last]] : []);
      // only the latest step that has come due: a late first run sends one message, not two
      const ready = steps.filter(([, x]) => at(day, x) <= stamp);
      if (!ready.length) continue;
      const [step, x] = ready[ready.length - 1];
      const sk = key + '#' + step;
      if (sent && sent.has(sk)) continue;
      if (step === 'due' && r.last && sent && sent.has(key + '#last')) continue;
      out.push({ key, step, id: r.id, day, t: r.t, label: r.label, when: at(day, x) });
    }
  }
  return out;
}

const dayWords = (day) => D(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
export function words(rem, link) {
  const first = rem.step === 'last' ? 'Last reminder: ' : 'Not checked off yet: ';
  const text = 'My Week. ' + first + rem.t + ' (' + dayWords(rem.day) + '). ' + rem.label + '. Check it off when it is done: ' + link;
  const subject = (rem.step === 'last' ? 'Last reminder: ' : 'Not done yet: ') + rem.t;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0D365F;max-width:520px">'
    + '<p>' + (rem.step === 'last' ? '<b>Last reminder.</b> ' : '') + '<b>' + esc(rem.t) + '</b> (' + esc(dayWords(rem.day)) + ') is not checked off on My Week yet.</p>'
    + '<p>' + esc(rem.label) + '.</p>'
    + '<p><a href="' + esc(link) + '" style="display:inline-block;background:#1D9E75;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px">Open My Week</a></p>'
    + '<p style="color:#6B7280;font-size:13px">If it is done, check it off and the reminders stop.</p></div>';
  return { text, subject, html };
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
