// CDS Hub · Claims for eMOMED (2026-11-16, her "build it"). The rules that turn WellSky care logs and
// the DSDS authorizations into the lines she types into eMOMED Claim Management. Pure functions, no
// page and no database, so tests/claims_test.mjs runs them in node. Drawn by claims/hub-claims.js.
//
// Where the rules come from (Independent Living Waiver Provider Manual, MO HealthNet, May 2026):
//  - T1019 is billed in 15-minute units. Add the minutes, divide by 15, keep whole units (no rounding up).
//  - One line may cover a date range inside ONE calendar month, never two months.
//  - Each month all State Plan CDS units (T1019 U2) are billed before waiver CDS (T1019 U6).
//  - FMS (T2040 U6) is 1 unit a month, only when at least 1 unit of waiver CDS was delivered that month.
//  - Case management (T2024 U6) is 1 unit a month, with the monthly contact written down.
//  - Supplies (T2028 U6), equipment (T2029 U6), home changes (S5165 U6) are billed at cost, after approval.
//  - A diagnosis code (field 21) is required on every claim. Place of service 12 = home.
//  - Claims must be filed within 12 months of the date of service.
// Her own paid claims (eMOMED export, 2026-11-16) are billed at $5.23 a unit, a week or two at a time.
// No em dashes in anything a person reads.

export const DAY = 864e5;
export const POS_HOME = '12';

// What each service section on the DSDS authorization ("Service Type") is billed as.
export const SERVICES = {
  'PC - CDS':  { code: 'T1019', mod: 'U2', label: 'State Plan CDS', unit: '15 min' },
  'CDS - ILW': { code: 'T1019', mod: 'U6', label: 'Waiver CDS (ILW)', unit: '15 min' },
  'FMS':       { code: 'T2040', mod: 'U6', label: 'FMS (ILW)', unit: '1 a month' },
  'CM':        { code: 'T2024', mod: 'U6', label: 'Case management (ILW)', unit: '1 a month' },
  'SMS':       { code: 'T2028', mod: 'U6', label: 'Medical supplies (ILW)', unit: 'cost' },
  'SME':       { code: 'T2029', mod: 'U6', label: 'Medical equipment (ILW)', unit: 'cost' },
  'EAA':       { code: 'S5165', mod: 'U6', label: 'Home changes (ILW)', unit: 'cost' }
};
export const svcKey = (code, mod) => code + (mod ? ' ' + mod : '');
const byCode = { T2040: 'FMS', T2024: 'CM', T2028: 'SMS', T2029: 'SME', S5165: 'EAA' };

// The service a row of an authorization belongs to. Rows read before 2026-11-16 have no section label:
// a T1019 row then is State Plan unless the record also has a second T1019 row for the same month, in
// which case we cannot tell them apart and say so (null).
export function serviceOf(row, record) {
  if (row.svc && SERVICES[normSvc(row.svc)]) return normSvc(row.svc);
  if (byCode[row.code]) return byCode[row.code];
  if (row.code !== 'T1019') return null;
  const same = (record.months || []).filter(m => m.code === 'T1019' && m.start === row.start);
  return same.length > 1 ? null : 'PC - CDS';
}
export function normSvc(s) {
  const t = String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (/ILW|WAIVER/.test(t) && /CDS|PC/.test(t)) return 'CDS - ILW';
  if (/^PC\s*-\s*CDS$|^CDS$/.test(t)) return 'PC - CDS';
  if (/^FMS\b|FINANCIAL/.test(t)) return 'FMS';
  if (/^CM\b|CASE MANAGEMENT/.test(t)) return 'CM';
  if (/^SMS\b|SUPPLIES/.test(t)) return 'SMS';
  if (/^SME\b|EQUIPMENT/.test(t)) return 'SME';
  if (/^EAA\b|ENVIRONMENTAL/.test(t)) return 'EAA';
  return t;
}

// The DSDS Home & Community Based Services Care Plan prints one section per service, each starting
// "Service Type ... Prior Authorization" then the label (PC - CDS, CDS - ILW, FMS, SMS, CM), the
// plan dates, the provider, GHE 1, GHE 2 and that section's prior authorization number, then rows of
// start, end, procedure code, units. Returns [{ svc, pa, start, end, code, units }] or [] when the
// text has no sections (older layouts are left to the hub's own reader).
// Real PDFs (2026-11-16) also: print "Service Type" and "Prior Authorization" across two lines on some
// pages; carry sections that are not ours (HDMS meals S5170 from the Area Agency on Aging, or every
// section with another CDS vendor after a transfer). So a section only takes rows with its own code, and
// each row says whether the section's provider is us (ours: false is never billed).
export const OUR_PROVIDER = /TROUTMAN\s+ENTERPRISES/i;   // the CDS vendor (Caring Companions In-Home shares the phone, so never match on it)
export function readAuthSections(text) {
  const parts = String(text || '').split(/\bService\s+Type\b/).slice(1);
  const rows = [];
  for (const p of parts) {
    const head = /Prior\s+Authorization\s*\n\s*([A-Za-z][A-Za-z \-]{1,30}?)\s*\n/.exec(p);
    if (!head) continue;
    const svc = normSvc(head[1]);
    if (!SERVICES[svc]) continue;
    const top = p.split(/Start\s+Date\s*\n\s*End\s+Date\s*\n\s*Procedure/)[0];
    const pa = (/\b(\d{14})\b/.exec(top) || [])[1] || '';
    const ours = OUR_PROVIDER.test(top);
    const re = /(\d{2}\/\d{2}\/\d{4})\s*\n\s*(\d{2}\/\d{2}\/\d{4})\s*\n\s*([TS]\d{4})\s*\n\s*(\d{1,5})/g;
    let m;
    while ((m = re.exec(p)) !== null) if (m[3] === SERVICES[svc].code) rows.push({ svc, pa, ours, start: iso(m[1]), end: iso(m[2]), code: m[3], units: +m[4] });
  }
  return rows;
}
const iso = us => { const [m, d, y] = us.split('/'); return y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0'); };

// A new DSDS authorization replaces the consumer's record in the hub, but claims for the months before it
// still need the old plan (Crystal Dodd's new plan starts Nov 1; Sep and Oct are on the old one). The old
// record's months before the new plan starts are kept in `history`, which only the claims read, so the
// rest of the hub (pages that show "units a month") sees just the current plan as before.
export function keepEarlier(old, next) {
  if (!old || !next || !next.planStart) return next;
  const before = (old.months || []).concat(old.history || []).filter(m => m.start < next.planStart)
    .map(m => Object.assign({}, m, { end: m.end >= next.planStart ? addDays(next.planStart, -1) : m.end, from: m.from || old.source || '' }));
  const seen = new Set();
  const history = before.filter(m => { const k = m.start + '|' + m.code + '|' + (m.svc || '') + '|' + m.units; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.start < b.start ? -1 : 1);
  return history.length ? Object.assign({}, next, { history }) : next;
}

// ---------- the state's claim processing schedule ----------
// MO HealthNet Claims Processing Schedule, State Fiscal Years 2026 and 2027 (eMOMED, read 2026-11-16).
// cutoff = Ending Claim Capture, 5:00 pm that day; paid = Provider Check Date.
export const SCHEDULE = [
  ['2026-06-08', '2026-06-23'], ['2026-06-26', '2026-07-08'], ['2026-07-10', '2026-07-24'], ['2026-07-24', '2026-08-07'],
  ['2026-08-07', '2026-08-20'], ['2026-08-21', '2026-09-04'], ['2026-09-11', '2026-09-18'], ['2026-09-25', '2026-10-09'],
  ['2026-10-09', '2026-10-23'], ['2026-10-23', '2026-11-06'], ['2026-11-06', '2026-11-19'], ['2026-11-20', '2026-12-04'],
  ['2026-12-11', '2026-12-18'], ['2026-12-25', '2027-01-08'], ['2027-01-08', '2027-01-22'], ['2027-01-22', '2027-02-05'],
  ['2027-02-05', '2027-02-17'], ['2027-02-19', '2027-03-05'], ['2027-03-12', '2027-03-19'], ['2027-03-26', '2027-04-09'],
  ['2027-04-16', '2027-04-23'], ['2027-04-30', '2027-05-14'], ['2027-05-14', '2027-05-25'], ['2027-05-28', '2027-06-11'],
  ['2027-06-08', '2027-06-23']
].map(([cutoff, paid]) => ({ cutoff, paid }));
// The next cutoff still open at `now` (a Date). Null once past the last date we know: then the
// card says to load the next year's schedule rather than guessing.
export function nextCutoff(now) {
  const today = localIso(now), h = now.getHours();
  return SCHEDULE.find(s => s.cutoff > today || (s.cutoff === today && h < 17)) || null;
}
export function localIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const addDays = (isoDay, n) => { const d = new Date(isoDay + 'T12:00:00'); d.setDate(d.getDate() + n); return localIso(d); };
export const monthOf = isoDay => String(isoDay).slice(0, 7);
export const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return localIso(new Date(y, m, 0)); };
// The 12-month filing limit: a date of service must be on or after this day to be filed today.
export const filingLimitFrom = now => { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return localIso(d); };

// ---------- names ----------
// WellSky writes "Last, First"; the hub writes "First Last". Same key either way.
export const nameKey = n => String(n || '').toLowerCase().replace(/[^a-z\s,'-]/g, '').split(/[\s,]+/).filter(Boolean).sort().join(' ');
const digits = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

// ---------- care logs ----------
// A care log = { consumer, attendant, clockIn 'YYYY-MM-DDTHH:MM:SS' (local), clockOut or null }.
// Minutes are counted on the day the shift was clocked in. A shift never clocked out counts nothing
// and stops the claim until it is fixed in WellSky (with an EVV correction form).
export function logMinutes(x) {
  if (!x.clockIn || !x.clockOut) return 0;
  const m = Math.round((Date.parse(x.clockOut + 'Z') - Date.parse(x.clockIn + 'Z')) / 6e4);
  return m > 0 ? m : 0;
}
// Merge care logs from several places (the daily email store, uploads). Same consumer and clock-in =
// the same shift; the copy WITH a clock out wins, then the newest.
export function mergeLogs(...lists) {
  const by = new Map();
  for (const list of lists) for (const x of list || []) {
    if (!x || !x.consumer || !x.clockIn) continue;
    const k = nameKey(x.consumer) + '|' + x.clockIn.slice(0, 16);
    const had = by.get(k);
    if (!had || (!had.clockOut && x.clockOut) || (!!had.clockOut === !!x.clockOut && (x.seen || '') >= (had.seen || ''))) by.set(k, x);
  }
  return [...by.values()].sort((a, b) => a.clockIn < b.clockIn ? -1 : 1);
}
// Which days the care logs we hold cover, as a list of [from, to] runs (a day with no shift for
// anyone still counts as covered when it sits inside a store's own covered range).
export function coveredDays(ranges, from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!(ranges || []).some(r => r.from <= d && d <= r.to)) days.push(d);
  return days;   // the days NOT covered
}

// ---------- the eMOMED claim list (Claim Management, Advanced search, Export Results) ----------
// Columns: ICN, NPI, Participant DCN, Claim Status, Claim Type, Billed Amt, Paid Amt, First D.O.S., Last D.O.S.
// rows = array of arrays (CSV or the first sheet of an XLSX), first row the headings.
export function readEmomedExport(rows) {
  const head = (rows[0] || []).map(h => String(h || '').toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...pats) => head.findIndex(h => pats.some(p => p.test(h)));
  const iI = col(/^icn$/), iD = col(/dcn/), iS = col(/status/), iB = col(/billed/), iP = col(/paid/), iF = col(/^first/), iL = col(/^last/), iN = col(/^npi$/);
  if (iI < 0 || iD < 0 || iS < 0 || iB < 0 || iF < 0) throw new Error('This does not look like the eMOMED claim list. Headings found: ' + (rows[0] || []).join(', '));
  const out = [];
  for (const r of rows.slice(1)) {
    const icn = String(r[iI] || '').trim();
    if (!/^\d{10,15}$/.test(icn)) continue;
    const st = String(r[iS] || '').trim();
    out.push({ icn, npi: iN >= 0 ? String(r[iN] || '').trim() : '', dcn: String(r[iD] || '').trim(),
      status: /^p\b|paid/i.test(st) && !/to be/i.test(st) ? 'paid' : /to be paid|^i\b/i.test(st) ? 'to be paid' : /denied|^n\b/i.test(st) ? 'denied' : st.toLowerCase(),
      billed: money(r[iB]), paid: iP >= 0 ? money(r[iP]) : 0, first: anyDay(r[iF]), last: anyDay(iL >= 0 ? r[iL] : r[iF]) });
  }
  return out;
}
const money = v => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n; };
function anyDay(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return localIso(new Date(Math.round((v - 25569) * DAY) + 12 * 36e5));  // Excel serial
  const s = String(v || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? m[0] : '';
}
// Keep one copy per ICN; a later upload wins (status changes from "to be paid" to "paid").
export function mergeClaims(old, fresh) {
  const by = new Map((old || []).map(c => [c.icn, c]));
  for (const c of fresh || []) by.set(c.icn, c);
  return [...by.values()].sort((a, b) => a.icn < b.icn ? 1 : -1);
}
// An ICN starting 70 with a negative amount is an adjustment (money taken back or a correction).
export const isAdjustment = c => c.billed < 0 || c.paid < 0;

// What eMOMED already holds for one consumer (by DCN): claims that are not denied, by the days they
// cover. Adjustments are counted against the days they name. Used to (a) not offer days already
// billed and (b) subtract units already billed in a month. Units are worked out from the money at
// the T1019 rate, because the claim list shows money, not units; marked "about" on the page.
export function billedFor(claims, dcn, rate) {
  const key = digits(dcn), mine = (claims || []).filter(c => digits(c.dcn) === key && key);
  const live = mine.filter(c => c.status !== 'denied');
  const byMonth = {};
  for (const c of live) {
    const ym = monthOf(c.first);
    byMonth[ym] = byMonth[ym] || { billed: 0, paid: 0, units: 0, claims: [] };
    byMonth[ym].billed += c.billed; byMonth[ym].paid += c.paid; byMonth[ym].claims.push(c);
    if (rate > 0) byMonth[ym].units += Math.round(c.billed / rate);
  }
  const lastBilled = live.filter(c => !isAdjustment(c)).map(c => c.last).sort().pop() || '';
  return { claims: mine, live, byMonth, lastBilled, denied: mine.filter(c => c.status === 'denied') };
}

// ---------- the worksheet ----------
// in = {
//   from, to: 'YYYY-MM-DD' (the dates being billed; split by month automatically)
//   consumers: [{ id, name, dcn, status }] (active ones are billed)
//   auths: { records: { key: { name, consumer, dcn, months: [{ svc?, pa?, start, end, code, units }] } } }
//   logs: care logs (see above); coverage: [{ from, to }] the days the logs are complete for
//   claims: the eMOMED claim list (readEmomedExport); work: the hub's own record {
//     dx: { consumerId: 'F03.90' }, rates: { 'T1019 U2': 5.23, ... }, cm: { consumerId: { 'YYYY-MM': 'YYYY-MM-DD' } },
//     buys: [{ consumerId, month, svc: 'SMS', amount, approved }], sent: { lineKey: { icn, at, by } } }
//   hospital: { consumerId: [{ from, to }] } (Something changed checklist) ; now: Date }
// Returns { blocks: [ per consumer per month ], totals, cutoff, uncovered }.
export function buildWorksheet(input) {
  const { from, to, now = new Date() } = input;
  const work = input.work || {}, rates = work.rates || {};
  const logs = mergeLogs(input.logs || []);
  const limit = filingLimitFrom(now);
  const uncovered = coveredDays(input.coverage, from, to);
  const blocks = [];
  const active = (input.consumers || []).filter(c => !/inactive|closed|ended|starting|lead/i.test(c.status || ''));
  for (const c of active) {
    const key = nameKey(c.name);
    const recs = Object.values((input.auths && input.auths.records) || {}).filter(a =>
      (c.dcn && digits(a.dcn) === digits(c.dcn)) || nameKey(a.consumer || a.name) === key);
    // A care log with the consumer's DCN (WellSky's Insurance ID) matches on that; otherwise on the name.
    const mine = x => x.dcn && c.dcn ? digits(x.dcn) === digits(c.dcn) : nameKey(x.consumer) === key;
    const myLogs = logs.filter(x => mine(x) && x.clockIn.slice(0, 10) >= from && x.clockIn.slice(0, 10) <= to);
    const hist = billedFor(input.claims, c.dcn, rates['T1019 U2'] || 0);
    for (let ym = monthOf(from); ym <= monthOf(to); ym = monthOf(addDays(monthEnd(ym), 1))) {
      const mFrom = from > ym + '-01' ? from : ym + '-01', mTo = to < monthEnd(ym) ? to : monthEnd(ym);
      const b = block(c, ym, mFrom, mTo, recs, myLogs.filter(x => monthOf(x.clockIn) === ym), hist, work, input.hospital, limit, uncovered);
      if (b) blocks.push(b);
    }
  }
  const ready = blocks.filter(b => !b.stops.length && b.lines.some(l => !l.sent));
  return {
    blocks, uncovered, cutoff: nextCutoff(now),
    totals: { consumers: new Set(blocks.map(b => b.consumerId)).size, ready: ready.length, stopped: blocks.filter(b => b.stops.length).length,
              charge: round2(ready.reduce((s, b) => s + b.lines.reduce((t, l) => t + (l.sent ? 0 : l.charge), 0), 0)) }
  };
}

function block(c, ym, mFrom, mTo, recs, logs, hist, work, hospital, limit, uncovered) {
  const rates = work.rates || {};
  const stops = [], notes = [];
  // authorized units this month, per service, from every record that covers the month
  const auth = {}, pa = {};
  let unknownT1019 = false, otherVendor = false;
  for (const r0 of recs) for (const m of (r0.months || []).concat(r0.history || [])) {
    const r = { months: (r0.months || []).concat(r0.history || []) };
    if (!(m.start <= mTo && m.end >= mFrom)) continue;
    if (m.ours === false) { otherVendor = true; continue; }
    const s = serviceOf(m, r);
    if (!s) { unknownT1019 = true; continue; }
    auth[s] = (auth[s] || 0) + (+m.units || 0);
    if (m.pa) pa[s] = m.pa;
  }
  const minutes = logs.reduce((s, x) => s + logMinutes(x), 0);
  // A shift never clocked out, or one WellSky marks Not Complete, holds its whole day back: the day is billed
  // on its own claim once it is fixed, never half now and half later (that reads as a duplicate).
  const open = logs.filter(x => !x.clockOut), unfinished = logs.filter(x => x.clockOut && x.incomplete);
  const held = new Set(open.concat(unfinished).map(x => x.clockIn.slice(0, 10)));
  const days = [...new Set(logs.filter(x => x.clockOut && !x.incomplete).map(x => x.clockIn.slice(0, 10)))].filter(d => !held.has(d)).sort();
  const anyAuth = Object.keys(auth).length > 0;
  if (!days.length && !open.length && !anyAuth) return null;     // nothing to bill and nothing authorized: leave them out

  // what is already billed in eMOMED this month (not denied), and days already covered by a claim
  const already = hist.byMonth[ym] || { units: 0, billed: 0, paid: 0, claims: [] };
  const coveredBy = d => already.claims.find(cl => !isAdjustment(cl) && cl.first <= d && d <= cl.last);
  const billedDays = days.filter(d => coveredBy(d));
  const newDays = days.filter(d => !coveredBy(d));
  const newMin = logs.filter(x => x.clockOut && !x.incomplete && newDays.includes(x.clockIn.slice(0, 10))).reduce((s, x) => s + logMinutes(x), 0);
  const units = Math.floor(newMin / 15);

  if (!c.dcn) stops.push('No DCN on their profile.');
  if (!anyAuth && otherVendor) stops.push('Their DSDS authorization for ' + niceMonth(ym) + ' names another provider, not Troutman Enterprises. Do not bill until DSDS moves it to us.');
  else if (!anyAuth && !unknownT1019) stops.push('No DSDS authorization in the hub covers ' + niceMonth(ym) + '. Upload it on their profile, or check Prior Authorization Status in eMOMED.');
  if (unknownT1019) stops.push('Their authorization has two personal care lines and the hub cannot tell State Plan from waiver. Upload the authorization again so it is read with its sections.');
  if (!(work.dx || {})[c.id]) stops.push('No diagnosis code saved for them (eMOMED needs one on every claim).');
  if (open.length) notes.push(open.length + (open.length === 1 ? ' shift was' : ' shifts were') + ' never clocked out (' + open.map(x => shortDay(x.clockIn)).join(', ') + '). Those days are left out: fix them in WellSky with an EVV correction form, then bill them on their own claim.');
  if (unfinished.length) notes.push(unfinished.length + (unfinished.length === 1 ? ' care log is' : ' care logs are') + ' Not Complete in WellSky (' + runs([...new Set(unfinished.map(x => x.clockIn.slice(0, 10)))].sort()) + ', ' + hrs(Math.floor(unfinished.reduce((s, x) => s + logMinutes(x), 0) / 15)) + '). Those days are left out until they are finished in WellSky.');
  if (mFrom < limit) stops.push('Some of these dates are past the 12-month filing limit (' + shortDay(limit) + ').');
  const gap = uncovered.filter(d => d >= mFrom && d <= mTo);
  if (gap.length) stops.push('The hub does not have WellSky care logs for ' + runs(gap) + '. Upload the WellSky Care Logs report for those days.');
  for (const h of (hospital || {})[c.id] || []) if (h.from <= mTo && (h.to || mTo) >= mFrom) notes.push('Hospital or rehab stay ' + shortDay(h.from) + (h.to ? ' to ' + shortDay(h.to) : '') + ': no care should be billed on those days.');
  if (billedDays.length) notes.push(billedDays.length + (billedDays.length === 1 ? ' day' : ' days') + ' in this range are already on a claim in eMOMED and are left out.');
  for (const d of hist.denied.filter(x => monthOf(x.first) === ym)) notes.push('Denied in eMOMED: claim ' + d.icn + ' (' + shortDay(d.first) + (d.last !== d.first ? ' to ' + shortDay(d.last) : '') + ', $' + d.billed.toFixed(2) + '). Open it in Claim Management to see why before billing those days again.');

  // split T1019 units: State Plan first, then waiver, each up to what is left this month
  const leftU2 = Math.max(0, (auth['PC - CDS'] || 0) - already.units);
  const u2 = Math.min(units, leftU2);
  const leftU6 = Math.max(0, (auth['CDS - ILW'] || 0) - Math.max(0, already.units - (auth['PC - CDS'] || 0)));
  const u6 = Math.min(units - u2, leftU6);
  const over = units - u2 - u6;
  if (over > 0 && anyAuth) notes.push(over + ' units (' + hrs(over) + ') are over the authorization for ' + niceMonth(ym) + ' and cannot be billed.');
  if (already.units) notes.push('About ' + already.units + ' units are already billed in eMOMED for ' + niceMonth(ym) + ' (worked out from the money), so the authorization left is smaller.');

  const first = newDays[0] || mFrom, last = newDays[newDays.length - 1] || mTo;
  const lines = [];
  const add = (svc, unitsN, extra) => {
    const s = SERVICES[svc], k = svcKey(s.code, s.mod), rate = +rates[k] || 0;
    const charge = extra && extra.amount != null ? round2(extra.amount) : round2(unitsN * rate);
    const lineKey = c.id + '|' + ym + '|' + k + '|' + (extra && extra.from || first) + '|' + (extra && extra.to || last);
    const sent = (work.sent || {})[lineKey] || null;
    const l = { lineKey, svc, code: s.code, mod: s.mod, label: s.label, units: unitsN, rate, charge, from: extra && extra.from || first, to: extra && extra.to || last, pa: pa[svc] || '', sent };
    if (!rate && !(extra && extra.amount != null)) l.problem = 'No rate saved for ' + k + '.';
    lines.push(l);
  };
  if (u2 > 0) add('PC - CDS', u2);
  if (u6 > 0) add('CDS - ILW', u6);
  // FMS and case management: once a month, billed with the claim that reaches the month's end
  const monthDone = mTo === monthEnd(ym);
  const monthU6 = Math.max(0, already.units - (auth['PC - CDS'] || 0)) + u6;
  if (auth['FMS']) {
    if (!monthDone) notes.push('FMS is billed once for ' + niceMonth(ym) + ', on the claim that runs to the end of the month.');
    else if (monthU6 < 1) notes.push('FMS cannot be billed for ' + niceMonth(ym) + ': no waiver CDS unit was delivered.');
    else add('FMS', 1, { from: ym + '-01', to: monthEnd(ym) });
  }
  if (auth['CM']) {
    const cmDay = ((work.cm || {})[c.id] || {})[ym];
    if (!monthDone) notes.push('Case management is billed once for ' + niceMonth(ym) + ', on the claim that runs to the end of the month.');
    // A missing contact holds back only the case management line, never the personal care (2026-11-17).
    else if (!cmDay) notes.push('Case management (T2024) for ' + niceMonth(ym) + ' is not on this claim: write down that month\'s contact date to bill it.');
    else add('CM', 1, { from: ym + '-01', to: monthEnd(ym) });
  }
  for (const b of (work.buys || []).filter(x => x.consumerId === c.id && x.month === ym)) {
    if (!auth[b.svc]) { stops.push(SERVICES[b.svc].label + ' bought but not on their authorization for ' + niceMonth(ym) + '.'); continue; }
    if (!b.approved) { stops.push(SERVICES[b.svc].label + ' ($' + (+b.amount).toFixed(2) + '): mark the DSDS approval first.'); continue; }
    add(b.svc, 1, { amount: +b.amount, from: b.day || ym + '-01', to: b.day || ym + '-01' });
  }
  for (const l of lines) if (l.problem) stops.push(l.problem);
  if (!lines.length && !stops.length) notes.push('Nothing new to bill for these dates.');

  return { consumerId: c.id, name: c.name, dcn: c.dcn || '', dx: (work.dx || {})[c.id] || '', month: ym, from: mFrom, to: mTo,
           minutes: newMin, units, auth, already, lines, stops, notes, shifts: logs.length };
}

const round2 = n => Math.round(n * 100) / 100;
const hrs = u => { const h = u / 4; return (Math.round(h * 100) / 100) + (h === 1 ? ' hour' : ' hours'); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const shortDay = d => d ? MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : '';
export const niceMonth = ym => FULL[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
// "Sep 17 to Sep 30, Oct 2" from a sorted list of days
export function runs(days) {
  const out = [];
  let a = null, b = null;
  for (const d of days) { if (b && addDays(b, 1) === d) b = d; else { if (a) out.push([a, b]); a = b = d; } }
  if (a) out.push([a, b]);
  return out.map(([x, y]) => x === y ? shortDay(x) : shortDay(x) + ' to ' + shortDay(y)).join(', ');
}
