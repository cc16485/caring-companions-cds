// CDS Hub · Hours & EVV · This month (2026-10-22, her yes to the Attendants plan, part c).
// One page for the three things CDS compliance comes down to:
//   1. hours stay inside the authorization (pace per consumer, authorization end dates)
//   2. every shift is clocked in and out (long shifts, never clocked out, two attendants at once)
//   3. every manual fix has an EVV correction form signed by the consumer and the attendant
// Everything here is read from what the hub already has: agency_data 'wellskyCheck' (the
// WellSky reports), 'wellskyReviewed', 'evvCorrections' and the evv_submissions table. It never
// writes. Calls about care go to the consumer (her rule 2026-10-21), so no attendant phone here.
// mountHours(el, { W, check, reviewed, corrections, submissions, consumers, go, markChecked })
// markChecked(key): the hub saves who checked a shift (wellskyReviewed), so it drops off here and on Today.
// No em dashes in anything a person reads.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const shortDay = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + (iso.slice(0, 4) !== String(new Date().getFullYear()) ? ', ' + iso.slice(0, 4) : '') : '';
const firstLast = n => { const m = /^([^,]+),\s*(.+)$/.exec(String(n || '').trim()); return m ? m[2] + ' ' + m[1] : String(n || '').trim(); };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const hrs = n => { const v = Math.round(n * 100) / 100; return v + ' hr' + (v === 1 ? '' : 's'); };
export const SOON_DAYS = 30;          // an authorization ending within this many days shows as "ends soon"
export const OVERLAP_DAYS = 31;       // look for two attendants at once in the last month
export const EVV_GOAL = 0.05;         // her internal standard: no more than 5% of shifts need a manual fix

// ---------- 0. which shifts to read ----------
// Two WellSky sources: the Chrome schedule report (check.shifts, stops when WellSky logs Chrome out)
// and the daily email report (check.analytics.authLogs). The email has the attendant once her
// dashboard includes Caregiver Full Name (2026-10-22). When it does, the email's shifts are used
// for the days it covers, and the schedule report only for days before that. Same shape either way:
// { at, consumers: [{ name, shifts: [{ attendant, date, start "9:41 AM", endDate, end, hours }] }] }.
const t12 = naive => { const h = +naive.slice(11, 13), m = naive.slice(14, 16); return ((h % 12) || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'); };
export function mergedShifts(check) {
  const sh = check && check.shifts, al = check && check.analytics && check.analytics.authLogs;
  const email = ((al && al.shifts) || []).filter(s => s.attendant && s.clockIn);
  if (!email.length) return sh || null;
  const from = email.map(s => s.clockIn.slice(0, 10)).sort()[0];
  const by = new Map();
  const add = (name, x) => { if (!by.has(name)) by.set(name, []); by.get(name).push(x); };
  for (const c of (sh && sh.consumers) || []) for (const x of c.shifts || []) if (x.date < from) add(c.name, x);
  for (const x of email) add(x.consumer, { attendant: x.attendant, date: x.clockIn.slice(0, 10), start: t12(x.clockIn),
    endDate: x.clockOut ? x.clockOut.slice(0, 10) : x.clockIn.slice(0, 10), end: x.clockOut ? t12(x.clockOut) : '', hours: x.hours == null ? 0 : x.hours });
  return { at: al.at, email: true, emailFrom: from, consumers: [...by].map(([name, shifts]) => ({ name, shifts: shifts.sort((a, b) => a.date.localeCompare(b.date)) })) };
}
// Shifts the email shows clocked in but never clocked out, in the shape CDSWellSky.openShifts reads.
export function emailOpen(check) {
  const al = check && check.analytics && check.analytics.authLogs;
  if (!al || !al.at || !(al.shifts || []).some(s => s.attendant)) return null;
  const local = new Date(al.at).toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).replace(' ', 'T');
  return { pulledLocal: local, rows: al.shifts.filter(s => s.clockIn && !s.clockOut).map(s => ({ consumer: s.consumer, attendant: s.attendant || '', clockIn: s.clockIn })) };
}

// ---------- 1. authorization end dates ----------
// WellSky does not send the end date on its own yet, but most authorization names carry the
// dates: "Susan Barnwell PC - CDS 4/01/2026-2/28/2027", "... Care Plan: 02/25/2026 - 12/31/2026".
// The last real date in the name is the end. A name with no dates (or "4/40/2027") -> null.
export function authEnd(label) {
  const ds = [...String(label || '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map(m => {
    const y = +m[3], mo = +m[1], d = +m[2];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
  });
  return ds.length && ds[ds.length - 1] ? ds[ds.length - 1] : null;
}
// One row per consumer: their personal care authorization (case management / FMS lines are not hours).
// dsds (her switch 'authSlim', 2026-10-23): name -> { end, priorAuth } from the DSDS authorization
// uploaded to the hub, or null. When it ends on or after the WellSky name's date it is the one shown;
// an older hub copy keeps the WellSky date and says to upload the new authorization.
export function authEnds(auths, W, now = new Date(), dsds = null) {
  const today = isoLocal(now), soon = isoLocal(new Date(now.getTime() + SOON_DAYS * DAY));
  const out = [];
  for (const c of (auths && auths.consumers) || []) {
    const pc = (c.auths || []).filter(a => !W || W.isPersonalCare(a));
    if (!pc.length) continue;
    const ends = pc.map(a => ({ label: a.label, end: authEnd(a.label) }));
    const known = ends.filter(e => e.end).sort((x, y) => y.end.localeCompare(x.end))[0];
    let end = known ? known.end : null, label = (known || ends[0]).label, from = 'wellsky';
    const d = dsds ? dsds(firstLast(c.name)) || dsds(c.name) : null;
    if (d && d.end && (!end || d.end >= end)) { end = d.end; from = 'dsds'; label = 'DSDS authorization' + (d.priorAuth ? ' ' + d.priorAuth : ''); }
    else if (d && d.end) label += '. The hub copy ended ' + shortDay(d.end) + ', so upload the new authorization';
    const status = !end ? 'unknown' : end < today ? 'ended' : end <= soon ? 'soon' : 'ok';
    out.push({ consumer: firstLast(c.name), end, status, label, from,
      days: end ? Math.round((Date.parse(end + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / DAY) : null });
  }
  const rank = { ended: 0, soon: 1, unknown: 2, ok: 3 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || String(a.end).localeCompare(String(b.end)) || a.consumer.localeCompare(b.consumer));
}

// ---------- 2. two attendants at the same time ----------
// DHSS: one CDS attendant per consumer at a time. From the WellSky schedule report shifts
// { attendant, date, start "9:41 AM", endDate, end }. Same attendant twice is a double entry.
const minutes = (date, t) => {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(String(t || '').trim());
  if (!date || !m) return null;
  const h = (+m[1] % 12) + (m[3].toUpperCase() === 'P' ? 12 : 0);
  return Date.parse(date + 'T00:00:00Z') / 6e4 + h * 60 + +m[2];
};
export function overlaps(shifts, now = new Date()) {
  const since = isoLocal(new Date(now.getTime() - OVERLAP_DAYS * DAY)), today = isoLocal(now);
  const out = [];
  for (const c of (shifts && shifts.consumers) || []) {
    const list = (c.shifts || []).filter(s => s.date >= since && s.date <= today)
      .map(s => ({ ...s, a: minutes(s.date, s.start), b: minutes(s.endDate || s.date, s.end) }))
      .filter(s => s.a != null && s.b != null && s.b > s.a).sort((x, y) => x.a - y.a);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].a < list[i].b; j++) {
      const x = list[i], y = list[j], same = x.attendant === y.attendant;
      out.push({ key: 'overlap|' + c.name + '|' + x.date + '|' + x.start + '|' + y.start, consumer: firstLast(c.name), date: x.date,
        why: same ? firstLast(x.attendant) + ' has two shifts that overlap (' + x.start + ' to ' + x.end + ' and ' + y.start + ' to ' + y.end + '). Probably entered twice.'
          : firstLast(x.attendant) + ' (' + x.start + ' to ' + x.end + ') and ' + firstLast(y.attendant) + ' (' + y.start + ' to ' + y.end + ') at the same time. Only one attendant may work at a time.' });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- 3. EVV corrections ----------
// corrections = agency_data 'evvCorrections' (logged by the office); submissions = evv_submissions
// rows not yet processed (sent in from hub.caringcds.com/evv-form). Her rule: both must sign.
export function evvStatus(corrections, submissions, shiftsThisMonth, now = new Date()) {
  const ym = isoLocal(now).slice(0, 7);
  const month = (corrections || []).filter(c => String(c.visitdate || c.submitdate || '').slice(0, 7) === ym);
  const subs = (submissions || []).filter(s => !s.processed);
  const needSign = subs.filter(s => !s.sig_attendant || !s.sig_consumer).map(s => ({ consumer: s.consumer, attendant: s.attendant, visitdate: s.visitdate,
    missing: [!s.sig_consumer && 'the consumer', !s.sig_attendant && 'the attendant'].filter(Boolean).join(' and ') }));
  const toLog = subs.filter(s => s.sig_attendant && s.sig_consumer).length;
  const toFix = (corrections || []).filter(c => c.wellskyDone !== 'yes').map(c => ({ consumer: c.consumer, attendant: c.attendant, visitdate: c.visitdate }));
  const n = month.length + subs.filter(s => String(s.visitdate || '').slice(0, 7) === ym).length;
  const share = shiftsThisMonth > 0 ? n / shiftsThisMonth : null;
  return { thisMonth: n, shifts: shiftsThisMonth || 0, share, overGoal: share != null && share > EVV_GOAL, needSign, toLog, toFix,
    open: needSign.length + toLog + toFix.length };
}
// Shifts worked this month so far, from the schedule report (every clocked shift is a row).
export function shiftsThisMonth(shifts, now = new Date()) {
  const today = isoLocal(now), ym = today.slice(0, 7);
  return ((shifts && shifts.consumers) || []).reduce((n, c) => n + (c.shifts || []).filter(s => s.date.slice(0, 7) === ym && s.date <= today).length, 0);
}

// ---------- the page, all together ----------
export function monthView({ W, check, reviewed, corrections, submissions, dsdsEnd = null, now = new Date() }) {
  check = check || {};
  const today = isoLocal(now);
  const pulledOn = check.auths && check.auths.at ? isoLocal(new Date(check.auths.at)) : today;
  const hours = W && check.auths ? W.hoursThisMonth(check.auths, check.shifts, pulledOn) : [];
  const shifts = mergedShifts(check), eo = emailOpen(check);
  const long = W && shifts ? W.longShifts(shifts, reviewed, today) : [];
  const open = W && (eo || check.open) ? W.openShifts(eo || check.open, reviewed) : [];
  const over = overlaps(shifts, now).filter(o => !(reviewed && reviewed[o.key]));
  const ends = authEnds(check.auths, W, now, dsdsEnd);
  const evv = evvStatus(corrections, submissions, shiftsThisMonth(shifts, now), now);
  const rank = { over: 0, 'booked-over': 0, 'pace-over': 1, low: 2, ok: 3 };
  hours.sort((a, b) => rank[a.status] - rank[b.status] || a.consumer.localeCompare(b.consumer));
  const dayOfMonth = +pulledOn.slice(8, 10), dim = new Date(+pulledOn.slice(0, 4), +pulledOn.slice(5, 7), 0).getDate();
  return { hours, long, open, overlaps: over, ends, evv, have: !!(check.auths || check.shifts),
    expectedShare: Math.max(0, Math.min(1, (dayOfMonth - 1) / dim)),
    asOf: [check.auths && check.auths.at, shifts && shifts.at].filter(Boolean).sort()[0] || null, fromEmail: !!(shifts && shifts.email),
    tiles: { over: hours.filter(h => ['over', 'booked-over', 'pace-over'].includes(h.status)).length, low: hours.filter(h => h.status === 'low').length,
      ending: ends.filter(e => e.status === 'ended' || e.status === 'soon').length, checks: long.length + open.length + over.length, evv: evv.open } };
}

const CSS = `
.hx{color:#1d2a36}
.hx h2{font-size:22px;color:#0D365F;margin:4px 0}
.hx h3{font-size:15px;color:#0D365F;margin:0;text-transform:uppercase;letter-spacing:.04em}
.hx .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:10px 0}
.hx .tile{background:#fff;border:1px solid #dfe6ec;border-radius:12px;padding:10px 12px}
.hx .tile .n{font-size:24px;font-weight:800;color:#0D365F;line-height:1.1;font-variant-numeric:tabular-nums}
.hx .tile.r .n{color:#b42318}.hx .tile.y .n{color:#6b4e00}
.hx .tile .t{font-size:13px;color:#5b6977}
.hx .grp{margin-top:18px}
.hx .ghead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.hx .ghead span{font-size:13px;color:#5b6977}
.hx .row{background:#fff;border:1px solid #dfe6ec;border-radius:12px;padding:10px 14px;margin-top:8px;display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center}
.hx .row.hot{border-left:5px solid #b42318}
.hx .row b{color:#0D365F}
.hx .row .meta{grid-column:1/-1;font-size:13.5px;color:#5b6977}
.hx .pill{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap}
.hx .g{background:#e7f5ee;color:#1f7a4d}.hx .y{background:#f6e7b8;color:#6b4e00}.hx .r{background:#fdecea;color:#b42318}.hx .b{background:#e3f1f0;color:#0f5f61}
.hx .bar{grid-column:1/-1;height:9px;border-radius:99px;background:#e5eaef;position:relative;overflow:hidden}
.hx .bar span{position:absolute;inset:0 auto 0 0;border-radius:99px;background:#0f7a7c}
.hx .bar.over span{background:#b42318}.hx .bar.low span{background:#e9a92c}
.hx .bar em{position:absolute;top:0;bottom:0;width:3px;background:#0D365F;opacity:.85}
.hx .small{font-size:13px;color:#5b6977}
.hx .link{border:0;background:none;color:#0f5f61;font-weight:700;cursor:pointer;padding:0;font:inherit;font-size:13.5px;text-decoration:underline}
.hx .warn{background:#fdecea;color:#b42318;border-radius:10px;padding:10px 12px;font-weight:600;margin-top:8px}
`;

export function mountHours(el, opts) {
  if (!document.getElementById('hx_css')) { const s = document.createElement('style'); s.id = 'hx_css'; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add('hx');
  el.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && opts.go) opts.go(b.dataset.go); if (e.target.closest('[data-act=reload]')) draw();
    const c = e.target.closest('[data-check]'); if (c && opts.markChecked) { opts.markChecked(c.dataset.check); draw(); } });
  draw();
  async function draw() {
    let subs = [], subsErr = '';
    try { subs = opts.submissions ? await opts.submissions() : []; } catch (e) { subsErr = e.message || String(e); }
    const dsdsEnd = opts.dsdsEnd ? opts.dsdsEnd() : null;
    const v = monthView({ W: opts.W, check: opts.check(), reviewed: opts.reviewed(), corrections: opts.corrections(), submissions: subs, dsdsEnd });
    const phone = name => { const c = (opts.consumers ? opts.consumers() : []).find(x => String(x.name || '').toLowerCase() === name.toLowerCase()); return c && c.phone ? c.phone : ''; };
    const tile = (n, label, tone) => `<div class="tile${n && tone ? ' ' + tone : ''}"><div class="n">${n}</div><div class="t">${esc(label)}</div></div>`;
    const asOf = v.asOf ? new Date(v.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : '';
    const stale = v.asOf && Date.now() - Date.parse(v.asOf) > 26 * 36e5;
    const pill = { over: ['r', 'Over'], 'booked-over': ['r', 'Booked over'], 'pace-over': ['y', 'On pace to go over'], low: ['y', 'Barely used'], ok: ['g', 'On track'] };
    const hourRow = h => {
      const name = firstLast(h.consumer), pct = h.authorized > 0 ? Math.min(100, h.completed / h.authorized * 100) : 0;
      const [tone, label] = pill[h.status] || pill.ok, ph = phone(name);
      return `<div class="row${tone === 'r' ? ' hot' : ''}"><b>${esc(name)}</b><span class="pill ${tone}">${esc(label)}</span>
        <div class="bar${tone === 'r' ? ' over' : h.status === 'low' ? ' low' : ''}"><span style="width:${pct.toFixed(1)}%"></span><em style="left:${(v.expectedShare * 100).toFixed(1)}%"></em></div>
        <span class="meta">${esc(hrs(h.completed))} of ${esc(hrs(h.authorized))}${h.scheduled ? ' (+' + esc(hrs(h.scheduled)) + ' booked)' : ''}${h.note ? ' · ' + esc(h.note) : ''}${h.status !== 'ok' ? ' · Check in with ' + esc(name) + (ph ? ' at ' + esc(ph) : '') : ''}</span></div>`;
    };
    // A Checked button on every row (2026-10-22): two attendants at once had no way to be cleared.
    const checkRow = (title, meta, tone, key) => `<div class="row${tone === 'r' ? ' hot' : ''}"><b>${esc(title)}</b><span class="pill ${tone}">${tone === 'r' ? 'Needs a correction form' : 'Check with the consumer'}</span><span class="meta">${esc(meta)}${key && opts.markChecked ? ` <button class="link" data-check="${esc(key)}">Checked</button>` : ''}</span></div>`;
    const endPill = { ended: ['r', 'Ended'], soon: ['y', 'Ends soon'], unknown: ['b', dsdsEnd ? 'End date unknown: upload the authorization' : 'End date not in WellSky name'], ok: ['g', 'Current'] };
    const e = v.evv;
    el.innerHTML = `<div class="ghead"><h2>This month</h2><span>${v.have ? 'From WellSky, ' + esc(asOf) : ''} <button class="link" data-act="reload">Refresh</button></span></div>
      ${!v.have ? '<div class="warn">WellSky has not sent its reports yet, so there is nothing to show.</div>' : stale ? `<div class="warn">The WellSky reports were last updated ${esc(asOf)}, so this may be out of date.</div>` : ''}
      <div class="tiles">${tile(v.tiles.over, 'Over or on pace to go over', 'r')}${tile(v.tiles.low, 'Barely using their hours', 'y')}${tile(v.tiles.ending, 'Authorizations ended or ending in 30 days', 'y')}${tile(v.tiles.checks, 'Shifts to check', 'r')}${tile(v.tiles.evv, 'EVV corrections to finish', 'y')}</div>

      <section class="grp"><div class="ghead"><h3>Hours against the authorization</h3><span>Bar = hours used. Line = where they would be at an even pace today.</span></div>
      ${v.hours.length ? v.hours.map(hourRow).join('') : '<p class="small">No personal care authorizations in the WellSky report this month.</p>'}</section>

      <section class="grp"><div class="ghead"><h3>Shifts to check</h3><span>Tap Checked once it is sorted out (it saves who and when)</span></div>
      ${v.open.map(s => checkRow(firstLast(s.consumer) + ': never clocked out', firstLast(s.attendant) + ', ' + s.why + '. The consumer and attendant both sign a correction form.', 'r', s.key)).join('')}
      ${v.overlaps.map(o => checkRow(o.consumer + ': two shifts at the same time, ' + shortDay(o.date), o.why, 'r', o.key)).join('')}
      ${v.long.map(s => checkRow(firstLast(s.consumer) + ': long shift ' + shortDay(s.date), firstLast(s.attendant) + ', ' + s.why + '.', 'y', s.key)).join('')}
      ${v.tiles.checks ? '' : '<p class="small">Nothing to check. No long shifts, none left clocked in, no two attendants at once.</p>'}</section>

      <section class="grp"><div class="ghead"><h3>EVV corrections</h3><button class="link" data-go="evvcorrections">Open EVV forms</button></div>
      <div class="row"><b>${e.thisMonth} this month${e.shifts ? ' out of ' + e.shifts + ' shifts' : ''}</b><span class="pill ${e.share == null ? 'b' : e.overGoal ? 'r' : 'g'}">${e.share == null ? 'Goal: 5% or less' : Math.round(e.share * 1000) / 10 + '% (goal 5% or less)'}</span>
        <span class="meta">Every manual fix needs a correction form signed by the consumer and the attendant, sent in by Saturday 11:59 PM.</span></div>
      ${e.needSign.map(s => `<div class="row hot"><b>${esc(s.consumer || 'Form')} · ${esc(shortDay(String(s.visitdate || '').slice(0, 10)))}</b><span class="pill r">Missing a signature</span><span class="meta">Still needs ${esc(s.missing)} to sign.${s.attendant ? ' Attendant: ' + esc(s.attendant) + '.' : ''}</span></div>`).join('')}
      ${e.toLog ? `<div class="row"><b>${plural(e.toLog, 'signed form', 'signed forms')} to review</b><span class="pill y">To review</span><span class="meta">Open EVV forms to approve and fix the shift in WellSky.</span></div>` : ''}
      ${e.toFix.map(c => `<div class="row"><b>${esc(c.consumer)} · ${esc(shortDay(String(c.visitdate || '').slice(0, 10)))}</b><span class="pill y">Fix in WellSky</span><span class="meta">Form on file. Update the shift in WellSky, then mark it done on EVV forms.</span></div>`).join('')}
      ${subsErr ? `<p class="small">Could not load the forms sent in online: ${esc(subsErr)}</p>` : ''}</section>

      <section class="grp"><div class="ghead"><h3>Authorization end dates</h3><span>${dsdsEnd ? 'From the DSDS authorization when it is uploaded, otherwise the WellSky name' : 'From the authorization names in WellSky'}</span></div>
      ${v.ends.length ? v.ends.map(a => { const [tone, label] = endPill[a.status]; return `<div class="row${a.status === 'ended' ? ' hot' : ''}"><b>${esc(a.consumer)}</b><span class="pill ${tone}">${esc(a.status === 'soon' ? 'Ends in ' + plural(a.days, 'day', 'days') : label)}</span>
        <span class="meta">${a.end ? (a.status === 'ended' ? 'Ended ' : 'Ends ') + esc(shortDay(a.end)) + ' · ' : ''}${esc(a.label)}</span></div>`; }).join('') : '<p class="small">No authorizations in the WellSky report.</p>'}</section>`;
  }
  return { draw };
}
