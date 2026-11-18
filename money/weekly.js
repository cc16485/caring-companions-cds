// Money > Weekly (2026-11-17, Samantha: "I would love to see record of it being done and what got rejected, and also a nice
// clean proof of billing and payroll numbers and what we make every week, all in the CDS sub account").
// One row per CDS pay week (Sunday to Saturday, the same week Empeon pays): hours paid, payroll, what we billed MO HealthNet
// for care in that week, what eMOMED approved, what came back $0 or denied and why, and what we made (approved minus payroll).
// Below it: every batch sent to eMOMED, and every $0 / denied line with its reason.
// Reads only: agency_data emomedClaims (claims with day-by-day lines and approved amounts), payrollWeeks (the hours sent
// to Empeon each week), payrollTotals (Empeon Payroll Summary gross pay), rateSettings.pay. Saves nothing.
// No em dashes in anything she reads (her rule).

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((+n || 0) * 100) / 100;
export const money = n => (n < 0 ? '-$' : '$') + Math.abs(r2(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const nice = iso => { const [y, m, d] = String(iso).split('-'); return MON[+m - 1] + ' ' + (+d) + (y ? ', ' + y : ''); };
const niceShort = iso => { const [, m, d] = String(iso).split('-'); return MON[+m - 1] + ' ' + (+d); };
// Sunday that starts the CDS pay week holding this date (YYYY-MM-DD).
export function weekOf(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
const plusDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const usToIso = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : ''; };

// A claim that was replaced, and the credit that cancels it, net to zero: leave both out so the replacement counts once.
function counted(claims) {
  const replaced = new Set(claims.filter(c => c.status === 'replaced').map(c => c.icn));
  return claims.filter(c => c.status !== 'replaced' && !(c.billed < 0 && /replaced/i.test(c.note || '') && [...replaced].some(i => (c.note || '').includes(i))));
}
// Every billed day as { week, date, consumer, icn, code, units, billed, approved, why, status }.
export function billedDays(claims) {
  const out = [];
  for (const c of counted(claims || [])) {
    const base = { consumer: c.consumer || ('DCN ' + c.dcn), icn: c.icn, status: c.status, batch: c.batch || '', cutoff: c.cutoff || '' };
    if (Array.isArray(c.lines) && c.lines.length) {
      for (const l of c.lines) {
        const approved = c.status === 'denied' ? 0 : (l.approved != null ? +l.approved : +l.charge);
        out.push({ ...base, week: weekOf(l.from), date: l.from, to: l.to, code: l.code + (l.mod ? ' ' + l.mod : ''), units: l.units, billed: +l.charge, approved,
          why: approved < +l.charge ? (c.status === 'denied' ? (c.note || 'Claim denied') : (l.why || 'Came back $0')) : '' });
      }
    } else {
      // older claims kept only as totals: the whole claim goes in the week it starts
      const approved = c.status === 'denied' ? 0 : +c.paid;
      out.push({ ...base, week: weekOf(c.first), date: c.first, to: c.last, code: '', units: null, billed: +c.billed, approved,
        why: approved < +c.billed ? (c.status === 'denied' ? (c.note || 'Claim denied') : c.status === 'suspended' ? 'Suspended by MO HealthNet' : 'Part came back $0') : '' });
    }
  }
  return out;
}
// Payroll for a week: Empeon's own gross when that payroll summary is loaded, otherwise hours sent x the pay rate (about).
export function payrollFor(week, payrollWeeks, runs, payRate) {
  const run = (runs || []).find(r => usToIso(r.payStart) === week);
  const pw = payrollWeeks && payrollWeeks[week];
  if (run && run.gross) return { amount: +run.gross, exact: true, hours: pw ? pw.hours : null, source: 'Empeon payroll summary, check ' + (run.checkDate || '') };
  if (pw && pw.hours != null) return { amount: r2(pw.hours * payRate), exact: false, hours: pw.hours, source: 'About: ' + pw.hours + ' hours x $' + payRate + ' an hour until the Empeon payroll report is loaded' };
  return null;
}
export function payday(cutoff, schedule) { const s = (schedule || []).find(x => x.cutoff === cutoff); return s ? s.paid : ''; }
// We bill MO HealthNet ourselves from Sep 17, 2026. Before that Paradigm Senior Services billed from WellSky, so those
// weeks only hold the catch-up claims we sent for days Paradigm missed: they are labeled, not compared.
export const OURS_FROM = '2026-09-17';
// A $0 day billed for more units than Sandata showed gets a Replacement at the Sandata units once the claim is paid.
export const recoverable = d => d.approved < d.billed && /^Billed \d+ units, Sandata had/.test(d.why || '');
// The weekly rows, newest first.
export function buildWeeks({ claims, payrollWeeks, runs, payRate = 15, schedule = [] }) {
  const days = billedDays(claims);
  const weeks = new Map();
  const W = w => { if (!weeks.has(w)) weeks.set(w, { week: w, end: plusDays(w, 6), billed: 0, approved: 0, zero: 0, zeroLines: 0, rebill: 0, days: [], claims: new Set(), paydays: new Set() }); return weeks.get(w); };
  for (const d of days) {
    const x = W(d.week); x.billed += d.billed; x.approved += d.approved; x.days.push(d); x.claims.add(d.icn);
    if (d.approved < d.billed) { x.zero += d.billed - d.approved; x.zeroLines++; }
    if (recoverable(d)) x.rebill += d.billed - d.approved;
    const p = payday(d.cutoff, schedule); if (p) x.paydays.add(p);
  }
  for (const w of Object.keys(payrollWeeks || {})) W(w);
  for (const r of runs || []) { const w = usToIso(r.payStart); if (w && w >= '2026-01-01') W(w); }
  return [...weeks.values()].map(x => {
    const pay = payrollFor(x.week, payrollWeeks, runs, payRate);
    const made = pay ? r2(x.approved - pay.amount) : null;
    const rebill = r2(x.rebill);
    return { ...x, billed: r2(x.billed), approved: r2(x.approved), zero: r2(x.zero), rebill, claims: x.claims.size, paydays: [...x.paydays].sort(),
      payroll: pay, made, madeAfter: made == null ? null : r2(made + rebill), margin: pay && x.approved ? Math.round(made / x.approved * 100) : null,
      paradigm: x.end < OURS_FROM ? 'all' : x.week < OURS_FROM ? 'part' : '' };
  }).sort((a, b) => a.week < b.week ? 1 : -1);
}
// Each batch sent to eMOMED: claims, billed, approved, $0 lines, payday.
export function batches(claims, schedule) {
  const by = new Map();
  for (const c of counted(claims || [])) {
    const k = c.batch || 'Earlier claims';
    if (!by.has(k)) by.set(k, { batch: k, cutoff: c.cutoff || '', entered: String(c.enteredBy || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '', claims: 0, billed: 0, approved: 0, zeroLines: 0, denied: 0, from: c.first, to: c.last });
    const b = by.get(k); b.claims++; b.billed += +c.billed; b.approved += c.status === 'denied' ? 0 : +c.paid;
    if (c.status === 'denied') b.denied++;
    (c.lines || []).forEach(l => { if (+l.approved < +l.charge) b.zeroLines++; });
    if (c.first < b.from) b.from = c.first; if (c.last > b.to) b.to = c.last;
  }
  return [...by.values()].map(b => ({ ...b, billed: r2(b.billed), approved: r2(b.approved), payday: payday(b.cutoff, schedule) }))
    .sort((a, b) => (a.batch === 'Earlier claims') - (b.batch === 'Earlier claims') || (a.to < b.to ? 1 : -1));
}
export function rejected(claims) { return billedDays(claims).filter(d => d.approved < d.billed).sort((a, b) => a.date < b.date ? 1 : -1); }

// ---------- the page ----------
export function mountWeekly(el, deps) {
  let open = null, showAll = false;
  async function draw() {
    el.innerHTML = '<div style="padding:18px;color:var(--gray-600)">Loading the claims...</div>';
    let emomed = {};
    try { emomed = (await deps.load()) || {}; } catch (e) { el.innerHTML = '<div style="color:#a8342a">Could not load the claims: ' + esc(e.message || e) + '</div>'; return; }
    const claims = emomed.claims || [];
    const schedule = deps.schedule() || [];
    const pw = (deps.payrollWeeks() || {}).weeks || {};
    const runs = deps.runs() || [];
    const rate = +deps.payRate() || 15;
    const weeks = buildWeeks({ claims, payrollWeeks: pw, runs, payRate: rate, schedule });
    const shown = showAll ? weeks : weeks.filter(w => w.paradigm !== 'all').slice(0, 16);
    const latest = weeks.find(w => w.payroll && w.claims && !w.paradigm) || weeks[0];
    const kpi = (label, val, sub, color) => '<div class="stat-card ' + color + '"><div class="stat-label">' + label + '</div><div class="stat-value">' + val + '</div><div class="stat-sub">' + sub + '</div></div>';
    const top = latest ? '<div style="font-size:13px;color:var(--gray-600);margin:0 0 8px">Week of ' + esc(nice(latest.week)) + ' to ' + esc(niceShort(latest.end)) + '</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:12px;margin-bottom:14px">' +
      kpi('👷 Payroll', latest.payroll ? money(latest.payroll.amount) + (latest.payroll.exact ? '' : '*') : 'Not loaded', latest.payroll && latest.payroll.hours != null ? latest.payroll.hours + ' hours' : 'Empeon', 'warn') +
      kpi('🧾 Billed to Medicaid', money(latest.billed), latest.claims + (latest.claims === 1 ? ' claim' : ' claims'), 'blue') +
      kpi('✅ Approved', money(latest.approved), latest.paydays.length ? 'Payday ' + latest.paydays.map(niceShort).join(', ') : 'eMOMED', 'green') +
      kpi('⚠️ $0 or denied', money(latest.zero), latest.zeroLines + (latest.zeroLines === 1 ? ' day' : ' days'), latest.zero ? 'red' : 'green') +
      kpi('💵 What we made', latest.made == null ? 'Needs payroll' : money(latest.made), latest.margin == null ? '' : latest.margin + '% of approved', latest.made == null ? 'blue' : latest.made >= 0 ? 'green' : 'red') +
      (latest.rebill ? kpi('🔁 After rebills', money(latest.madeAfter), money(latest.rebill) + ' to rebill', 'green') : '') + '</div>' : '';
    const row = w => '<tr data-week="' + w.week + '" style="cursor:pointer' + (open === w.week ? ';background:#F4FBF8' : '') + '">' +
      '<td><b>' + esc(niceShort(w.week)) + ' to ' + esc(niceShort(w.end)) + '</b><div style="font-size:11px;color:var(--gray-500)">' + w.week.slice(0, 4) + '</div></td>' +
      '<td>' + (w.payroll && w.payroll.hours != null ? w.payroll.hours : '') + '</td>' +
      '<td>' + (w.payroll ? money(w.payroll.amount) + (w.payroll.exact ? '' : '*') : '<span style="color:var(--gray-500)">Not loaded</span>') + '</td>' +
      '<td>' + (w.billed ? money(w.billed) : '') + '</td><td>' + (w.billed ? money(w.approved) : '') + '</td>' +
      '<td style="color:' + (w.zero ? '#a8342a' : 'inherit') + '">' + (w.zero ? money(w.zero) + ' (' + w.zeroLines + ')' : w.billed ? '$0.00' : '') + '</td>' +
      '<td style="font-weight:700;color:' + (w.made == null ? 'var(--gray-500)' : w.made >= 0 ? '#0F6E56' : '#a8342a') + '">' + (w.paradigm === 'all' ? '<span style="font-weight:400;color:var(--gray-500)">Paradigm billed</span>' : w.made == null ? (w.billed ? 'Needs payroll' : 'Not billed yet') : money(w.made)) + '</td>' +
      '<td>' + (w.rebill ? money(w.rebill) : '') + '</td><td style="font-weight:700">' + (w.paradigm === 'all' || w.madeAfter == null || !w.rebill ? '' : money(w.madeAfter)) + '</td>' +
      '<td style="font-size:12px">' + (w.paydays.length ? w.paydays.map(niceShort).join(', ') : '') + '</td></tr>' +
      (open === w.week ? '<tr><td colspan="10" style="background:#FAFCFD">' + detail(w) + '</td></tr>' : '');
    const detail = w => {
      const by = {}; w.days.forEach(d => { const k = d.consumer; by[k] = by[k] || { billed: 0, approved: 0, icns: new Set() }; by[k].billed += d.billed; by[k].approved += d.approved; by[k].icns.add(d.icn); });
      const zero = w.days.filter(d => d.approved < d.billed);
      const pay = w.payroll ? '<div style="font-size:12.5px;margin:4px 0 8px"><b>Payroll:</b> ' + esc(w.payroll.source) + '</div>' : '';
      const ppl = (pw[w.week] && pw[w.week].byAttendant) ? '<div style="font-size:12.5px;margin-bottom:8px"><b>Hours by attendant:</b> ' + Object.entries(pw[w.week].byAttendant).sort((a, b) => b[1] - a[1]).map(([n, h]) => esc(n) + ' ' + h).join(', ') + '</div>' : '';
      const note = w.paradigm ? '<div style="font-size:12.5px;margin-bottom:8px;color:#A8660E">' + (w.paradigm === 'all' ? 'Paradigm Senior Services billed this week from WellSky. Only our catch-up claims for days they missed are here.' : 'Paradigm billed the days before Sep 17 in this week; we billed from Sep 17.') + '</div>' : '';
      return note + pay + ppl + (Object.keys(by).length ? '<table class="data-table" style="font-size:12.5px"><thead><tr><th>Consumer</th><th>ICN</th><th>Billed</th><th>Approved</th></tr></thead><tbody>' +
        Object.entries(by).sort((a, b) => b[1].billed - a[1].billed).map(([n, v]) => '<tr><td>' + esc(n) + '</td><td class="mono">' + [...v.icns].map(esc).join(', ') + '</td><td>' + money(v.billed) + '</td><td>' + money(v.approved) + '</td></tr>').join('') + '</tbody></table>' : '<div style="font-size:12.5px">No claims for this week yet.</div>') +
        (zero.length ? '<div style="font-size:12.5px;margin-top:8px"><b>$0 or denied:</b><ul style="margin:4px 0 0 18px">' + zero.map(d => '<li>' + esc(d.consumer) + ', ' + esc(nice(d.date)) + ': ' + money(d.billed - d.approved) + ' of ' + money(d.billed) + '. ' + esc(d.why) + '</li>').join('') + '</ul></div>' : '');
    };
    const bs = batches(claims, schedule);
    const rej = rejected(claims);
    el.innerHTML = '<div class="card" style="margin-bottom:16px"><div class="card-title"><span class="icon">📅</span> Week by week</div>' +
      '<div style="font-size:12px;color:var(--gray-600);margin-bottom:12px">Each CDS pay week, Sunday to Saturday: what we paid, what we billed MO HealthNet for that week\'s care, what eMOMED approved, and what we made. Click a week for the details. ' +
      '* means the payroll is about (hours x $' + rate + ' an hour) until Empeon\'s payroll report for that week is loaded on the Payroll tab. Payroll here is gross wages only, without employer taxes. "To rebill" is $0 days billed for more units than Sandata showed: they are sent again at the Sandata units after the Dec 4 payment. We bill MO HealthNet ourselves from Sep 17, 2026; earlier weeks were billed by Paradigm and show under Show every week.</div>' +
      top + '<div style="overflow-x:auto"><table class="data-table" id="mwkTable" style="font-size:13px"><thead><tr><th>Week</th><th>Hours</th><th>Payroll</th><th>Billed</th><th>Approved</th><th>$0 or denied (days)</th><th>What we made</th><th>To rebill</th><th>Made after rebills</th><th>Payday</th></tr></thead><tbody>' +
      shown.map(row).join('') + '</tbody></table></div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-outline" id="mwkAll">' + (showAll ? 'Show recent weeks' : 'Show every week') + '</button><button class="btn btn-sm btn-outline" id="mwkPrint">🖨 Print this as proof</button></div></div>' +
      '<div class="card" style="margin-bottom:16px"><div class="card-title"><span class="icon">📮</span> Sent to eMOMED</div><div style="overflow-x:auto"><table class="data-table" style="font-size:13px"><thead><tr><th>Batch</th><th>Care dates</th><th>Claims</th><th>Billed</th><th>Approved</th><th>$0 days</th><th>Cutoff</th><th>Payday</th></tr></thead><tbody>' +
      bs.map(b => '<tr><td><b>' + esc(b.batch) + '</b>' + (b.entered ? '<div style="font-size:11px;color:var(--gray-500)">Entered ' + esc(nice(b.entered)) + '</div>' : '') + '</td><td>' + esc(niceShort(b.from)) + ' to ' + esc(nice(b.to)) + '</td><td>' + b.claims + (b.denied ? ' (' + b.denied + ' denied)' : '') + '</td><td>' + money(b.billed) + '</td><td>' + money(b.approved) + '</td><td>' + (b.zeroLines || '') + '</td><td>' + (b.cutoff ? esc(niceShort(b.cutoff)) : '') + '</td><td>' + (b.payday ? esc(niceShort(b.payday)) : '') + '</td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="card"><div class="card-title"><span class="icon">⚠️</span> Came back $0 or denied (' + rej.length + ')</div><div style="font-size:12px;color:var(--gray-600);margin-bottom:8px">Most are days billed for more units than Sandata showed: they get a Replacement at the Sandata units after the claim is paid. Days with no Sandata visit need the EVV fixed first.</div>' +
      '<div style="overflow-x:auto;max-height:420px;overflow-y:auto"><table class="data-table" style="font-size:12.5px"><thead><tr><th>Day</th><th>Consumer</th><th>ICN</th><th>Billed</th><th>Why</th></tr></thead><tbody>' +
      rej.map(d => '<tr><td>' + esc(nice(d.date)) + '</td><td>' + esc(d.consumer) + '</td><td class="mono">' + esc(d.icn) + '</td><td>' + money(d.billed - d.approved) + '</td><td>' + esc(d.why) + '</td></tr>').join('') + '</tbody></table></div></div>';
    el.querySelectorAll('#mwkTable tr[data-week]').forEach(tr => tr.onclick = () => { open = open === tr.dataset.week ? null : tr.dataset.week; draw(); });
    el.querySelector('#mwkAll').onclick = () => { showAll = !showAll; draw(); };
    el.querySelector('#mwkPrint').onclick = () => printProof(shown, rate);
  }
  function printProof(weeks, rate) {
    const w = window.open('', '_blank'); if (!w) return;
    const sum = k => r2(weeks.reduce((s, x) => s + (k === 'payroll' ? (x.payroll ? x.payroll.amount : 0) : (+x[k] || 0)), 0));
    w.document.write('<!doctype html><html><head><title>CDS billing and payroll by week</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#1f2a36}h1{font-size:20px;color:#0D365F;margin:0}table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12.5px}th,td{border:1px solid #c9d1da;padding:5px 7px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#EEF4F9}p{font-size:12px;color:#57606a}</style></head><body>' +
      '<h1>Caring Companions CDS: billing and payroll by week</h1><p>Printed ' + esc(new Date().toLocaleString()) + '. Billed and approved are MO HealthNet claims in eMOMED for care in that week. Payroll is gross wages from Empeon; * = about (hours x $' + rate + ').</p>' +
      '<table><thead><tr><th>Week (Sun to Sat)</th><th>Hours</th><th>Payroll</th><th>Billed</th><th>Approved</th><th>$0 or denied</th><th>Made</th><th>To rebill</th><th>Made after rebills</th></tr></thead><tbody>' +
      weeks.map(x => '<tr><td>' + esc(nice(x.week)) + ' to ' + esc(nice(x.end)) + '</td><td>' + (x.payroll && x.payroll.hours != null ? x.payroll.hours : '') + '</td><td>' + (x.payroll ? money(x.payroll.amount) + (x.payroll.exact ? '' : '*') : '') + '</td><td>' + money(x.billed) + '</td><td>' + money(x.approved) + '</td><td>' + money(x.zero) + '</td><td>' + (x.paradigm === 'all' ? 'Paradigm billed' : x.made == null ? '' : money(x.made)) + '</td><td>' + (x.rebill ? money(x.rebill) : '') + '</td><td>' + (x.madeAfter == null || !x.rebill ? '' : money(x.madeAfter)) + '</td></tr>').join('') +
      '<tr><th>Total</th><th></th><th>' + money(sum('payroll')) + '</th><th>' + money(sum('billed')) + '</th><th>' + money(sum('approved')) + '</th><th>' + money(sum('zero')) + '</th><th>' + money(r2(weeks.reduce((s, x) => s + (x.paradigm === 'all' ? 0 : x.made || 0), 0))) + '</th><th>' + money(sum('rebill')) + '</th><th>' + money(r2(weeks.reduce((s, x) => s + (x.paradigm === 'all' ? 0 : x.madeAfter || 0), 0))) + '</th></tr></tbody></table></body></html>');
    w.document.close(); w.focus(); w.print();
  }
  draw();
  return { draw };
}
