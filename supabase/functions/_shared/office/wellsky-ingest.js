// What the cds-wellsky server function does with a posted WellSky report (2026-10-19).
// The function is a thin wrapper; the tests run this against a local Postgres copy.
//
// body = { kind: 'shifts' | 'auths', text }   one report's page text, read with wellsky.js
//      | { kind: 'failed', why }              the morning task could not get a report
//      | { kind: 'ping' }                     the installer checking the key; saves nothing
//      | { kind: 'open', report, from, to, total, pulledLocal, rows }   her saved Custom Report's
//        shifts still In Progress (never clocked out), 2026-10-20; read with wellsky.js parseOpenReport
// Saves into agency_data 'wellskyCheck' (one key, merged): { live, shifts, auths, lastRun }.
// A report that cannot be read is NOT saved over the last good one; it is recorded as
// a failed run, which the Dashboard and the 8am email show in red (no silent failures).
//
// Practice until cds_match_settings 'wellsky_check' has live = true. Practice still
// pulls and shows everything in the hub, marked "Practice"; it only stays out of the
// 8am email. This job never contacts anyone.
import './wellsky.js';
const W = globalThis.CDSWellSky;

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
    return { ok: false, saved: false, why };
  };

  const kind = body && body.kind;
  // The installer's check that the key works; saves nothing.
  if (kind === 'ping') return { ok: true, saved: false, live };
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
  return { ok: true, saved: true, live, kind, consumers: r.consumers.length, [kind === 'shifts' ? 'shifts' : 'authorizations']: counted, unread: r.unread.length };
}
