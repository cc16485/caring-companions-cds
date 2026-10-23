// What the cds-wellsky server function does with a posted WellSky report (2026-10-19;
// receipts added 2026-10-20 so the key never goes into the WellSky page, see the bottom).
// The function is a thin wrapper; the tests run this against a local Postgres copy.
//
// body = { kind: 'shifts' | 'auths', text }   one report's page text, read with wellsky.js
//      | { kind: 'failed', why }              the morning task could not get a report
//      | { kind: 'ping' }                     the installer checking the key; saves nothing
//      | { kind: 'open', report, from, to, total, pulledLocal, rows }   her saved Custom Report's
//        shifts still In Progress (never clocked out), 2026-10-20; read with wellsky.js parseOpenReport
// Saves into agency_data 'wellskyCheck' (one key, merged): { live, shifts, auths, lastRun },
// and each consumer's earliest worked shift into 'firstShifts' (only grows).
// A report that cannot be read is NOT saved over the last good one; it is recorded as
// a failed run, which the Dashboard and the 8am email show in red (no silent failures).
//
// Practice until cds_match_settings 'wellsky_check' has live = true. Practice still
// pulls and shows everything in the hub, marked "Practice"; it only stays out of the
// 8am email. This job never contacts anyone.
import './wellsky.js';
const W = globalThis.CDSWellSky;
import { readReport, mergeFirstFromAnalytics } from './wellsky-analytics.js';

export const AGENCY_ID = 'caring-companions-cds';
const MAX_TEXT = 3e6;

export async function ingest(deps, body) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const at = new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const cfg = (await q(`select value from cds_match_settings where key='wellsky_check'`, []))[0];
  const live = !!(cfg && cfg.value && cfg.value.live === true);
  const save = patch => q(`insert into agency_data (agency_id, data_key, data_value) values ($1, 'wellskyCheck', $2::jsonb)
                           on conflict (agency_id, data_key) do update set data_value = coalesce(agency_data.data_value, '{}'::jsonb) || excluded.data_value`,
                          [AGENCY_ID, JSON.stringify(Object.assign({ live }, patch))]);
  const failed = async why => {
    why = String(why || 'unknown reason').replace(/\s+/g, ' ').slice(0, 300);
    await save({ lastRun: { at, kind: String(body && body.kind || ''), ok: false, why } });
    return { ok: false, saved: false, recorded: true, why };   // the failure itself IS saved, for the Dashboard
  };

  const kind = body && body.kind;
  // The installer's check that the key works; saves nothing.
  if (kind === 'ping') return { ok: true, saved: false, live, kinds: ['shifts', 'auths', 'open', 'receipts', 'analytics'] };
  if (kind === 'analytics' || kind === 'analytics_missing') return analytics(q, save, at, body);
  if (kind === 'failed') return failed(body.why);
  if (kind === 'open') {
    let o;
    try { o = W.parseOpenReport(body); }
    catch (e) { return failed(e && e.wellsky ? e.message : 'the open shift report could not be read'); }
    await save({ open: Object.assign({ at }, o), lastRun: { at, kind, ok: true, why: '' } });
    return { ok: true, saved: true, live, kind, careLogs: o.total, open: o.rows.length, unread: o.unread.length };
  }
  if (kind !== 'shifts' && kind !== 'auths') return failed('the task sent something that is not a WellSky report');
  const text = String(body.text || '');
  if (!text || text.length > MAX_TEXT) return failed('the ' + (kind === 'shifts' ? 'schedule' : 'authorizations') + ' report came back empty or far too big');

  let r;
  try { r = kind === 'shifts' ? W.parseShiftReport(text) : W.parseAuthReport(text); }
  catch (e) { return failed(e && e.wellsky ? e.message : 'the report could not be read'); }
  if (!r.consumers.length) return failed('the ' + (kind === 'shifts' ? 'schedule' : 'authorizations') + ' report listed no CDS consumers');
  const counted = kind === 'shifts' ? r.consumers.reduce((n, c) => n + c.shifts.length, 0)
                                    : r.consumers.reduce((n, c) => n + c.auths.length, 0);
  await save({ [kind]: Object.assign({ at }, r), lastRun: { at, kind, ok: true, why: '' } });
  // Each consumer's earliest worked shift, kept for good (the 40 new consumers goal, 2026-10-20).
  if (kind === 'shifts') {
    const prev = (await q(`select data_value from agency_data where agency_id = $1 and data_key = 'firstShifts'`, [AGENCY_ID]))[0];
    const pulledOn = new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const next = W.mergeFirstShifts(prev && prev.data_value, r, pulledOn);
    await q(`insert into agency_data (agency_id, data_key, data_value) values ($1, 'firstShifts', $2::jsonb)
             on conflict (agency_id, data_key) do update set data_value = excluded.data_value`, [AGENCY_ID, JSON.stringify(next)]);
  }
  return { ok: true, saved: true, live, kind, consumers: r.consumers.length, [kind === 'shifts' ? 'shifts' : 'authorizations']: counted, unread: r.unread.length };
}

// ---------- WellSky Analytics reports by email (2026-10-21) ----------
// The Google script in samantha@mo-care.com posts each emailed report (see
// wellsky-analytics.js). Saved beside the Chrome reports in 'wellskyCheck' as
// analytics.firstLast / analytics.authLogs, with its own analyticsRun, so the Chrome check
// keeps working untouched while both run side by side. First and Last Carelog also feeds
// 'firstShifts' (the 40 new consumers goal). { kind: 'analytics_missing', why } is the
// script saying a report did not arrive by 7am, which shows in red (no silent failures).
async function analytics(q, save, at, body) {
  const report = String(body.report || '').slice(0, 80);
  const failed = async why => {
    why = String(why || 'unknown reason').replace(/\s+/g, ' ').slice(0, 300);
    await save({ analyticsRun: { at, report, ok: false, why } });
    return { ok: false, saved: false, recorded: true, why };
  };
  if (body.kind === 'analytics_missing') return failed(body.why || 'a WellSky Analytics email did not arrive');
  let r;
  try { r = readReport(body); }
  catch (e) { return failed(e && e.wellsky ? e.message : 'the "' + report + '" email could not be read'); }
  const received = /^\d{4}-\d{2}-\d{2}T/.test(String(body.received || '')) ? String(body.received).slice(0, 24) : at;
  const cur = (await q(`select data_value v from agency_data where agency_id = $1 and data_key = 'wellskyCheck'`, [AGENCY_ID]))[0];
  const prevA = (cur && cur.v && cur.v.analytics) || {};
  const part = r.which === 'firstLast' ? { at, received, consumers: r.consumers, unread: r.unread } : { at, received, shifts: r.shifts, unread: r.unread, columns: r.columns };
  await save({ analytics: Object.assign({}, prevA, { [r.which]: part }), analyticsRun: { at, report, ok: true, why: '' } });
  if (r.which === 'firstLast') {
    const prev = (await q(`select data_value from agency_data where agency_id = $1 and data_key = 'firstShifts'`, [AGENCY_ID]))[0];
    const next = mergeFirstFromAnalytics(prev && prev.data_value, r);
    await q(`insert into agency_data (agency_id, data_key, data_value) values ($1, 'firstShifts', $2::jsonb)
             on conflict (agency_id, data_key) do update set data_value = excluded.data_value`, [AGENCY_ID, JSON.stringify(next)]);
  }
  return { ok: true, saved: true, report, consumers: r.consumers ? r.consumers.length : undefined, shifts: r.shifts ? r.shifts.length : undefined, unread: r.unread.length };
}

// ---------- receipts (2026-10-20) ----------
// The WellSky page posts a report with NO key. It is parked in wellsky_inbox and the page
// gets a receipt back. The 6:30 task confirms the receipt from the Mac with the key
// (confirm), and only then is the report read and saved by ingest() above. A receipt is
// good once, for one hour; anything unconfirmed is deleted after an hour.
const KINDS = ['shifts', 'auths', 'open', 'failed', 'ping'];
export const INBOX_MAX_BYTES = 3e6;
export const INBOX_MAX_PER_HOUR = 30;

function newReceipt() {
  const b = new Uint8Array(18);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export async function submit(deps, body) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const kind = body && body.kind;
  if (!KINDS.includes(kind)) return { ok: false, error: 'not a WellSky report' };
  const raw = JSON.stringify(body);
  if (raw.length > INBOX_MAX_BYTES) return { ok: false, error: 'too big' };
  await q(`delete from wellsky_inbox where created_at < now() - interval '1 hour'`, []);
  const n = (await q(`select count(*)::int n from wellsky_inbox`, []))[0].n;
  if (n >= INBOX_MAX_PER_HOUR) return { ok: false, error: 'too many waiting' };
  const receipt = newReceipt();
  await q(`insert into wellsky_inbox (receipt, kind, body, size) values ($1, $2, $3::jsonb, $4)`, [receipt, kind, raw, raw.length]);
  return { ok: true, receipt, kind };
}

export async function confirm(deps, receipt) {
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  if (!/^[0-9a-f]{36}$/.test(String(receipt || ''))) return { ok: false, error: 'not a receipt' };
  // Taking the row and deleting it in one step: a receipt can only ever be used once.
  const row = (await q(`delete from wellsky_inbox where receipt = $1 and created_at >= now() - interval '1 hour' returning kind, body`, [receipt]))[0];
  if (!row) return { ok: false, error: 'no such receipt, already used, or over an hour old' };
  if (row.kind === 'ping') return { ok: true, saved: false, confirmed: true, kind: 'ping' };
  const body = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
  return Object.assign({ confirmed: true }, await ingest(deps, body));
}
