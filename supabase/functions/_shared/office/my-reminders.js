// My Week must-do reminders (2026-11-17). Every 15 minutes: any must-do item (billing, payroll, a cutoff) that is past
// its time and not checked off gets ONE text and ONE email to Samantha, and a "last reminder" where the list says so.
// Which items and when: my-week-musts.js. Recipients: the server-only row owner_reminders 'samantha'.
// Each reminder is written to owner_reminder_sent, sent or failed, so it never repeats and never fails silently
// (My Week shows a failed one in red on the card). 7 AM to 8 PM Central only.
// deps: db.query(text, params) -> { rows }, send({ channel: 'sms'|'email', to, subject?, text, html? }) throws on failure.
import { dueReminders, words } from './my-week-musts.js';

export const LINK = 'https://cc.mo-care.com/#myweek';

export function createReminders({ db, send }) {
  async function run({ nowMs = Date.now(), test = false } = {}) {
    const set = (await db.query("select phone, email, live from owner_reminders where id = 'samantha'")).rows[0];
    if (!set) return { ok: true, sent: 0, note: 'no recipients set yet' };
    if (test) {
      const rem = { step: 'due', t: 'Test reminder from My Week', day: new Date(nowMs).toISOString().slice(0, 10), label: 'Nothing is due. This shows a reminder reaches you' };
      return { ok: true, test: await deliver(set, rem) };
    }
    if (set.live === false) return { ok: true, sent: 0, note: 'reminders are off' };
    const marks = {};
    for (const r of (await db.query("select id, data from owner_calendar where kind = 'mark'")).rows) marks[r.id.slice(2)] = r.data || {};
    const sent = new Set((await db.query("select key from owner_reminder_sent where at > now() - interval '40 days'")).rows.map((r) => r.key));
    const due = dueReminders(nowMs, marks, sent);
    let n = 0, failed = 0;
    for (const rem of due) {
      const res = await deliver(set, rem);
      const ok = res.sms === 'sent' || res.email === 'sent';
      await db.query(`insert into owner_reminder_sent (key, at, ok, sms, email, error) values ($1, now(), $2, $3, $4, $5)
        on conflict (key) do nothing`, [rem.key + '#' + rem.step, ok, res.sms, res.email, ok ? null : [res.sms, res.email].join('; ').slice(0, 300)]);
      ok ? n++ : failed++;
    }
    return { ok: true, sent: n, failed, waiting: due.length };
  }
  async function deliver(set, rem) {
    const w = words(rem, LINK);
    const out = { sms: 'no phone', email: 'no email' };
    if (set.phone) { try { await send({ channel: 'sms', to: set.phone, text: w.text }); out.sms = 'sent'; } catch (e) { out.sms = 'failed: ' + String(e && e.message || e).slice(0, 140); } }
    if (set.email) { try { await send({ channel: 'email', to: set.email, subject: w.subject, text: w.text, html: w.html }); out.email = 'sent'; } catch (e) { out.email = 'failed: ' + String(e && e.message || e).slice(0, 140); } }
    return out;
  }
  return { run };
}
