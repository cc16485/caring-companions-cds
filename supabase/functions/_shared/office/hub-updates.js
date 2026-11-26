// Small changes to a hub record that come from outside the hub page (2026-11-26, Katlin's Night Desk: "When she says a
// step is done, Claude marks it done in the Hub"). The consumers list lives in the hub page's own saved data, so the
// server never edits it directly (a page with an older copy could save over it). Instead a change waits here, and the
// next time anyone opens the CDS hub, the page applies it the same way its own buttons do, then marks it applied.
// Table: cds_hub_updates (hub_updates.sql). Server only. Used by cds-connector (adds) and cds-todo (the page reads and
// marks applied). db.query(text, params) -> { rows }.
export const STEPS = {
  wellsky_authorization: { field: 'authWellSky', where: 'firstShiftPrep', words: 'WellSky: authorization is in' },
  wellsky_tasks: { field: 'tasksWellSky', where: 'firstShiftPrep', words: 'WellSky: tasks are in' },
  consumer_told_clock_in: { field: 'toldClockIn', where: 'firstShiftPrep', words: 'Told the consumer how to clock in' },
  attendant_clock_in: { field: 'attClockIn', where: 'starting', words: 'The attendant can clock in (WellSky app set up)' },
  // 2026-11-26 (her "Yes, add it"): the day the referral or PCCP went into Fusion, which starts the Fusion checks
  referral_sent: { field: 'referralSent', where: 'starting', words: 'Referral sent to DSDS', date: true },
  transfer_entered: { field: 'transferEntered', where: 'starting', words: 'Transfer entered in the state portal', date: true },
};
export class HubUpdateError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

export function createHubUpdates({ db }) {
  const q = async (t, p = []) => (await db.query(t, p)).rows;
  async function add(email, consumerId, step, name, value) {
    if (!STEPS[step]) throw new HubUpdateError('Unknown step. Use one of: ' + Object.keys(STEPS).join(', '));
    if (STEPS[step].date && !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new HubUpdateError('Please give the date (YYYY-MM-DD).');
    const r = await q(`insert into cds_hub_updates (target_kind, target_id, target_name, step, by_email, value)
      values ('consumer', $1, $2, $3, $4, $5) returning id, at`, [String(consumerId), String(name || '').slice(0, 120), step, String(email || '').toLowerCase(), STEPS[step].date ? String(value) : null]);
    return r[0];
  }
  async function pending() {
    return q(`select id, target_id, target_name, step, by_email, at, value from cds_hub_updates where applied_at is null order by id limit 200`);
  }
  async function applied(email, ids) {
    const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    if (!list.length) return { ok: true, applied: 0 };
    const r = await q(`update cds_hub_updates set applied_at = now(), applied_by = $2 where id = any($1) and applied_at is null returning id`, [list, String(email || '').toLowerCase()]);
    return { ok: true, applied: r.length };
  }
  return { add, pending, applied };
}
