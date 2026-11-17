// Keeping every WellSky care log for billing (2026-11-16, Claims for eMOMED). The daily
// "Authorization Care Logs" email only holds the last few days, so each morning its shifts are added to
// agency_data 'careLogs' = { logs: [{ consumer, attendant, auth, clockIn, clockOut, seen }],
// coverage: [{ from, to }], at }. coverage = the days the emails have fully covered: from the earliest
// clock-in day in an email to the day before it arrived. The hub's Claims card stops any claim for a
// day outside coverage (no silent gaps). Kept 400 days: the 12-month filing limit plus a little.
// Same shift (consumer + clock-in to the minute) = one log; a copy with a clock out wins, then the newest.
export const KEEP_DAYS = 400;

const day = s => String(s || '').slice(0, 10);
const key = x => String(x.consumer || '').toLowerCase().replace(/[^a-z]/g, '') + '|' + String(x.clockIn || '').slice(0, 16);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export function mergeCareLogs(prev, shifts, receivedIso) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const by = new Map();
  for (const x of p.logs || []) if (x && x.consumer && x.clockIn) by.set(key(x), x);
  const seen = String(receivedIso || '').slice(0, 19);
  for (const s of shifts || []) {
    if (!s || !s.consumer || !s.clockIn) continue;
    const x = { consumer: s.consumer, attendant: s.attendant || '', auth: s.auth || '', clockIn: s.clockIn, clockOut: s.clockOut || null, seen };
    const had = by.get(key(x));
    if (!had || x.clockOut || !had.clockOut) by.set(key(x), had && had.clockOut && !x.clockOut ? had : x);
  }
  const cut = addDays(day(receivedIso) || new Date().toISOString().slice(0, 10), -KEEP_DAYS);
  const logs = [...by.values()].filter(x => day(x.clockIn) >= cut).sort((a, b) => a.clockIn < b.clockIn ? -1 : 1);
  let coverage = (p.coverage || []).slice();
  const ins = (shifts || []).map(s => day(s && s.clockIn)).filter(Boolean).sort();
  const to = addDays(day(receivedIso), -1);
  if (ins.length && ins[0] <= to) coverage.push({ from: ins[0], to });
  coverage = joinRanges(coverage).filter(r => r.to >= cut);
  return { logs, coverage, at: seen };
}

// Overlapping or touching ranges become one.
export function joinRanges(list) {
  const s = list.filter(r => r && r.from && r.to && r.from <= r.to).sort((a, b) => a.from < b.from ? -1 : 1);
  const out = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) >= r.from) { if (r.to > last.to) last.to = r.to; }
    else out.push({ from: r.from, to: r.to });
  }
  return out;
}
