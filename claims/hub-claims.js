// CDS Hub · Money · Claims for eMOMED (2026-11-16, her "build it", behind her switch 'claims').
// Shows, for the dates being billed, each consumer's lines to type into eMOMED Claim Management, what
// stops a claim, and what was left out. The rules are in claims/claims.js. This file draws the card and
// saves only what a person types here (diagnosis codes, rates, case management dates, supplies, "sent").
// It never sends a claim: eMOMED is the system of record for claims; the hub keeps a copy of the
// eMOMED claim list she uploads, to know what is already billed.
// mountClaims(el, deps) deps = { consumers(), auths(), work(), saveWork(w), load() -> { careLogs, uploadedLogs, emomed },
//   saveStore(key, val), hospital(), who(), xlsx() (loads SheetJS), toast(msg, warn) }
// No em dashes in anything a person reads.
import * as C from './claims.js?v=4';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const us = d => d ? d.slice(5, 7) + '/' + d.slice(8, 10) + '/' + d.slice(0, 4) : '';
const longDay = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
// What her own paid claims show (eMOMED, 2026-11-16): $5.23 a unit for T1019. Only a suggestion until she saves it.
const SUGGEST = { 'T1019 U2': 5.23, 'T1019 U6': 5.23 };
const RATE_KEYS = ['T1019 U2', 'T1019 U6', 'T2040 U6', 'T2024 U6'];

export function mountClaims(el, deps) {
  let stores = null, loadErr = '';
  const today = C.localIso(new Date());
  const yesterday = C.localIso(new Date(Date.now() - C.DAY));
  let range = null;

  async function load() {
    try { stores = await deps.load(); loadErr = ''; }
    catch (e) { stores = null; loadErr = String(e && e.message || e); }
  }
  const work = () => Object.assign({ dx: {}, rates: {}, cm: {}, buys: [], sent: {} }, deps.work() || {});
  const save = w => { deps.saveWork(w); draw(); };

  function defaultRange() {
    // From the day after the newest date already on a claim (any consumer), else the 1st of this month.
    const claims = (stores && stores.emomed && stores.emomed.claims) || [];
    const last = claims.filter(c => c.status !== 'denied' && !C.isAdjustment(c)).map(c => c.last).sort().pop();
    const d = last ? C.localIso(new Date(new Date(last + 'T12:00:00').getTime() + C.DAY)) : today.slice(0, 8) + '01';
    return { from: d > yesterday ? yesterday : d, to: yesterday };
  }

  function logsAndCoverage() {
    const a = (stores && stores.careLogs) || {}, b = (stores && stores.uploadedLogs) || {};
    return { logs: C.mergeLogs(a.logs, b.logs), coverage: [].concat(a.coverage || [], b.coverage || []) };
  }

  function draw() {
    if (!stores && !loadErr) { el.innerHTML = '<div style="padding:12px;color:#5a6570">Loading care logs and claims…</div>'; return; }
    if (loadErr) { el.innerHTML = '<div class="alert alert-warn">The billing records could not load: ' + esc(loadErr) + '. Nothing is shown rather than a wrong number. Reload the page to try again.</div>'; return; }
    if (!range) range = defaultRange();
    const w = work(), { logs, coverage } = logsAndCoverage();
    const em = (stores.emomed && stores.emomed.claims) || [];
    const sheet = C.buildWorksheet({ from: range.from, to: range.to, consumers: deps.consumers(), auths: deps.auths(), logs, coverage, claims: em, work: w, hospital: deps.hospital(), now: new Date() });
    const cut = sheet.cutoff;
    let h = '';
    h += '<div style="display:flex;flex-wrap:wrap;gap:10px 18px;align-items:flex-end;margin-bottom:12px">' +
      '<div><label style="font-size:12px;font-weight:700;display:block">Bill from</label><input type="date" id="clFrom" value="' + range.from + '" max="' + today + '"></div>' +
      '<div><label style="font-size:12px;font-weight:700;display:block">To</label><input type="date" id="clTo" value="' + range.to + '" max="' + today + '"></div>' +
      '<button class="btn btn-sm btn-primary" id="clGo">Show these dates</button>' +
      '<div style="font-size:13px;flex:1;min-width:220px">' + (cut ? '<strong>Next cutoff ' + esc(longDay(cut.cutoff)) + ', 5 pm.</strong> Paid ' + esc(longDay(cut.paid)) + '.'
        : '<span style="color:var(--danger)">The claim schedule in the hub ends June 2027. Load the next year\'s schedule.</span>') + '</div></div>';

    // what the hub holds
    const covText = coverage.length ? coverage.map(r => C.shortDay(r.from) + (r.from.slice(0, 4) !== r.to.slice(0, 4) ? ', ' + r.from.slice(0, 4) : '') + ' to ' + C.shortDay(r.to) + ', ' + r.to.slice(0, 4)).join('; ') : 'none yet';
    const emAt = stores.emomed && stores.emomed.at;
    h += '<div style="font-size:12.5px;background:var(--gray-50,#f6f8fa);border:1px solid var(--gray-200);border-radius:8px;padding:10px 12px;margin-bottom:12px;line-height:1.6">' +
      '<div><strong>WellSky care logs in the hub:</strong> ' + esc(covText) + '. New days arrive each morning from the WellSky email. ' +
        '<label class="btn btn-sm btn-outline" style="font-size:11.5px;cursor:pointer">Upload WellSky care logs<input type="file" id="clLogFile" accept=".csv,.xlsx,.xls" hidden></label></div>' +
      '<div><strong>eMOMED claim list:</strong> ' + (em.length ? em.length + ' claims, last uploaded ' + esc(new Date(emAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : 'not uploaded yet') +
        '. In eMOMED: Claim Management, Advanced, dates of service, Search, then Export Results. ' +
        '<label class="btn btn-sm btn-outline" style="font-size:11.5px;cursor:pointer">Upload the claim list<input type="file" id="clEmFile" accept=".csv,.xlsx,.xls" multiple hidden></label></div>' +
      '<div id="clUpMsg"></div></div>';

    // rates
    const missing = RATE_KEYS.filter(k => !(+w.rates[k] > 0));
    h += '<details' + (missing.length ? ' open' : '') + ' style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px">Rates per unit' + (missing.length ? ' <span style="color:var(--danger);font-weight:400">(' + missing.join(', ') + ' not set)</span>' : '') + '</summary>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' + RATE_KEYS.map(k =>
        '<label style="font-size:12px">' + esc(k) + '<br><input type="number" step="0.01" min="0" style="width:90px" data-rate="' + k + '" value="' + (w.rates[k] || '') + '" placeholder="' + (SUGGEST[k] || '') + '"></label>').join('') +
      '<button class="btn btn-sm btn-outline" id="clRates" style="align-self:flex-end">Save rates</button></div>' +
      '<div style="font-size:11.5px;color:var(--gray-600);margin-top:4px">Your paid T1019 claims show $5.23 a unit. FMS and case management are 1 unit a month: use the amount on the MO HealthNet fee schedule. MO HealthNet pays the lower of what you bill and its own rate.</div></details>';

    // summary
    const t = sheet.totals;
    h += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;font-size:13.5px"><div><strong>' + t.ready + '</strong> ready to type in</div>' +
      '<div style="color:' + (t.stopped ? 'var(--danger)' : 'inherit') + '"><strong>' + t.stopped + '</strong> stopped</div><div>Ready to bill: <strong>' + money(t.charge) + '</strong></div></div>';
    if (sheet.uncovered.length) h += '<div class="alert alert-warn" style="font-size:13px">The hub has no WellSky care logs for ' + esc(C.runs(sheet.uncovered)) + '. Claims touching those days are stopped. Upload the WellSky care logs for them (WellSky, Reports, Custom, Care Logs, export).</div>';

    if (!sheet.blocks.length) h += '<div class="empty"><p>Nothing to bill for these dates.</p></div>';
    for (const b of sheet.blocks.sort((x, y) => (x.stops.length > 0) - (y.stops.length > 0) || x.name.localeCompare(y.name))) h += drawBlock(b, w);
    el.innerHTML = h;
    wire(w);
  }

  function drawBlock(b, w) {
    const id = b.consumerId + '_' + b.month;
    let h = '<div class="card" style="margin:0 0 12px;padding:12px 14px;border-left:4px solid ' + (b.stops.length ? 'var(--danger)' : 'var(--success)') + '">';
    h += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><strong>' + esc(b.name) + '</strong> <span style="color:var(--gray-600);font-size:12.5px">DCN ' + esc(b.dcn || 'missing') + ' · ' + esc(C.niceMonth(b.month)) + ' · ' + b.shifts + ' shifts, ' + (Math.round(b.minutes / 6) / 10) + ' hrs new</span></div>' +
      '<label style="font-size:12px">Diagnosis code <input data-dx="' + esc(b.consumerId) + '" value="' + esc(b.dx) + '" placeholder="e.g. R26.89" style="width:96px;text-transform:uppercase"></label></div>';
    if (b.stops.length) h += '<ul style="margin:8px 0 0 18px;color:var(--danger);font-size:13px">' + b.stops.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>';
    if (b.notes.length) h += '<ul style="margin:6px 0 0 18px;color:var(--gray-700,#444);font-size:12.5px">' + b.notes.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>';
    if (b.auth['CM']) {
      const v = ((w.cm || {})[b.consumerId] || {})[b.month] || '';
      h += '<div style="font-size:12.5px;margin-top:6px">Case management contact in ' + esc(C.niceMonth(b.month)) + ': <input type="date" data-cm="' + esc(b.consumerId) + '|' + b.month + '" value="' + v + '"></div>';
    }
    if (b.lines.length) {
      h += '<div class="table-wrap" style="margin-top:8px"><table style="font-size:12.5px"><thead><tr><th>Code</th><th>Modifier</th><th>From</th><th>To</th><th>Units</th><th>Charge</th><th>Prior auth</th><th></th></tr></thead><tbody>' +
        b.lines.map(l => '<tr' + (l.sent ? ' style="opacity:.6"' : '') + '><td class="mono">' + l.code + '</td><td class="mono">' + l.mod + '</td><td>' + us(l.from) + '</td><td>' + us(l.to) + '</td><td>' + l.units + '</td><td>' + money(l.charge) + '</td><td class="mono" style="font-size:11.5px">' + esc(l.pa) + '</td><td>' +
          (l.sent ? 'Sent, ICN ' + esc(l.sent.icn) + ' <button class="btn btn-sm btn-outline" style="font-size:11px" data-unsend="' + esc(l.lineKey) + '">Undo</button>'
                  : b.stops.length ? '' : '<input placeholder="ICN from eMOMED" data-icn="' + esc(l.lineKey) + '" style="width:130px"> <button class="btn btn-sm btn-primary" style="font-size:11px" data-sent="' + esc(l.lineKey) + '">Mark sent</button>') + '</td></tr>').join('') +
        '</tbody></table></div>';
      if (!b.stops.length) h += '<button class="btn btn-sm btn-outline" style="font-size:11.5px;margin-top:6px" data-copy="' + esc(id) + '">Copy for eMOMED</button>';
    }
    h += '<details style="margin-top:6px;font-size:12px"><summary style="cursor:pointer;color:var(--gray-600)">Supplies, equipment or home changes bought</summary>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:flex-end"><select data-bsvc="' + esc(id) + '"><option value="SMS">Supplies (T2028)</option><option value="SME">Equipment (T2029)</option><option value="EAA">Home changes (S5165)</option></select>' +
      '<input type="date" data-bday="' + esc(id) + '" value="' + b.from + '"><input type="number" step="0.01" min="0" placeholder="Cost" data-bamt="' + esc(id) + '" style="width:90px">' +
      '<label><input type="checkbox" data-bok="' + esc(id) + '"> DSDS approved it</label><button class="btn btn-sm btn-outline" style="font-size:11px" data-badd="' + esc(b.consumerId) + '|' + b.month + '|' + esc(id) + '">Add</button></div>' +
      ((w.buys || []).filter(x => x.consumerId === b.consumerId && x.month === b.month).map((x, i) => '<div>' + esc(x.svc) + ' ' + money(x.amount) + ' on ' + us(x.day) + (x.approved ? ', approved' : ', not approved yet') + ' <button class="btn btn-sm btn-outline" style="font-size:10.5px" data-bdel="' + esc(b.consumerId) + '|' + b.month + '|' + i + '">Remove</button></div>').join('')) + '</details>';
    h += '</div>';
    block[id] = b;
    return h;
  }
  const block = {};

  function copyText(b) {
    const L = ['Participant DCN: ' + b.dcn, 'Diagnosis (field 21): ' + b.dx.toUpperCase(), 'Place of service: ' + C.POS_HOME];
    b.lines.filter(l => !l.sent).forEach((l, i) => L.push('Line ' + (i + 1) + ': ' + us(l.from) + ' to ' + us(l.to) + '  ' + l.code + ' ' + l.mod + '  units ' + l.units + '  charge ' + l.charge.toFixed(2) + (l.pa ? '  prior auth ' + l.pa : '')));
    return L.join('\n');
  }

  function wire(w) {
    const $ = s => el.querySelector(s), all = s => [...el.querySelectorAll(s)];
    $('#clGo').onclick = () => { const f = $('#clFrom').value, t = $('#clTo').value; if (!f || !t || f > t) return deps.toast('Pick a From date on or before the To date.', true); range = { from: f, to: t }; draw(); };
    $('#clRates').onclick = () => { all('[data-rate]').forEach(i => { const v = parseFloat(i.value); if (v > 0) w.rates[i.dataset.rate] = v; else delete w.rates[i.dataset.rate]; }); save(w); };
    all('[data-dx]').forEach(i => i.onchange = () => { const v = i.value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, ''); if (v && !/^[A-Z]\d{2}(\.?[A-Z0-9]{1,4})?$/.test(v)) { i.value = w.dx[i.dataset.dx] || ''; return deps.toast('That does not look like a diagnosis (ICD-10) code, e.g. R26.89.', true); } w.dx[i.dataset.dx] = v; if (!v) delete w.dx[i.dataset.dx]; save(w); });
    all('[data-cm]').forEach(i => i.onchange = () => { const [cid, ym] = i.dataset.cm.split('|'); w.cm[cid] = w.cm[cid] || {}; if (i.value) w.cm[cid][ym] = i.value; else delete w.cm[cid][ym]; save(w); });
    all('[data-sent]').forEach(bn => bn.onclick = () => {
      const k = bn.dataset.sent, icn = (el.querySelector('[data-icn="' + CSS.escape(k) + '"]').value || '').replace(/\D/g, '');
      if (!/^\d{13}$/.test(icn)) return deps.toast('Type the 13-digit ICN eMOMED gave the claim, so it can be found later.', true);
      w.sent[k] = { icn, at: new Date().toISOString(), by: deps.who() }; save(w);
    });
    all('[data-unsend]').forEach(bn => bn.onclick = () => { delete w.sent[bn.dataset.unsend]; save(w); });
    all('[data-copy]').forEach(bn => bn.onclick = async () => { try { await navigator.clipboard.writeText(copyText(block[bn.dataset.copy])); deps.toast('Copied. Paste it beside eMOMED while you type the claim.'); } catch (e) { deps.toast('Could not copy: ' + (e.message || e), true); } });
    all('[data-badd]').forEach(bn => bn.onclick = () => {
      const [cid, ym, id] = bn.dataset.badd.split('|'), amt = parseFloat(el.querySelector('[data-bamt="' + CSS.escape(id) + '"]').value), day = el.querySelector('[data-bday="' + CSS.escape(id) + '"]').value;
      if (!(amt > 0)) return deps.toast('Type the cost.', true);
      if (!day || day.slice(0, 7) !== ym) return deps.toast('The date bought must be in ' + C.niceMonth(ym) + '.', true);
      w.buys.push({ consumerId: cid, month: ym, svc: el.querySelector('[data-bsvc="' + CSS.escape(id) + '"]').value, amount: amt, day, approved: el.querySelector('[data-bok="' + CSS.escape(id) + '"]').checked, by: deps.who(), at: new Date().toISOString() });
      save(w);
    });
    all('[data-bdel]').forEach(bn => bn.onclick = () => { const [cid, ym, i] = bn.dataset.bdel.split('|'); const mine = w.buys.filter(x => x.consumerId === cid && x.month === ym); w.buys = w.buys.filter(x => x !== mine[+i]); save(w); });
    $('#clEmFile').onchange = e => upload(e, 'emomed');
    $('#clLogFile').onchange = e => upload(e, 'logs');
  }

  async function readRows(file) {
    if (/\.xlsx?$/i.test(file.name)) {
      const X = await deps.xlsx();
      const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      return X.utils.sheet_to_json(fullRange(X, wb.Sheets[wb.SheetNames[0]]), { header: 1, raw: true, defval: '' });
    }
    return parseCsv(await file.text());
  }

  async function upload(e, kind) {
    const files = [...(e.target.files || [])]; e.target.value = '';
    const msg = m => { const x = el.querySelector('#clUpMsg'); if (x) x.innerHTML = m; };
    if (!files.length) return;
    try {
      if (kind === 'emomed') {
        let fresh = [];
        for (const f of files) fresh = fresh.concat(C.readEmomedExport(await readRows(f)));
        if (!fresh.length) return msg('<span style="color:var(--danger)">No claims found in ' + esc(files.map(f => f.name).join(', ')) + '. Nothing was saved.</span>');
        const next = { claims: C.mergeClaims((stores.emomed || {}).claims, fresh), at: new Date().toISOString(), by: deps.who() };
        await deps.saveStore('emomedClaims', next); stores.emomed = next; range = null;
        const den = fresh.filter(c => c.status === 'denied').length;
        draw(); msg('<span style="color:var(--success)">Read ' + fresh.length + ' claims (' + den + ' denied). The hub now has ' + next.claims.length + '. eMOMED shows at most 200 a search, so export a few months at a time.</span>');
      } else {
        const rows = await readRows(files[0]);
        const r = readCareLogRows(rows);
        if (!r.logs.length) return msg('<span style="color:var(--danger)">No care logs found in ' + esc(files[0].name) + ' (' + esc(r.why) + '). Nothing was saved.</span>');
        const days = r.logs.map(x => x.clockIn.slice(0, 10)).sort();
        const from = days[0], to = days[days.length - 1];
        if (!confirm('This file has ' + r.logs.length + ' care logs from ' + us(from) + ' to ' + us(to) + '.\n\nOK only if the report covered EVERY CDS consumer for all of those days. The hub will treat those days as complete.')) return msg('Nothing was saved.');
        const prev = stores.uploadedLogs || {};
        const next = { logs: C.mergeLogs(prev.logs, r.logs), coverage: (prev.coverage || []).concat([{ from, to }]), at: new Date().toISOString(), by: deps.who() };
        await deps.saveStore('careLogsUploaded', next); stores.uploadedLogs = next;
        draw(); msg('<span style="color:var(--success)">Saved ' + r.logs.length + ' care logs, ' + us(from) + ' to ' + us(to) + (r.skipped ? '. ' + r.skipped + ' rows were not care logs and were skipped' : '') + '.</span>');
      }
    } catch (err) { msg('<span style="color:var(--danger)">' + esc(err.message || err) + ' Nothing was saved.</span>'); }
  }

  load().then(draw); draw();
  return { draw: async (reload) => { if (reload) { stores = null; await load(); } draw(); } };
}

// WellSky's Excel exports label the sheet as one row long (A1:C1) while holding every row (seen 2026-11-16 on
// "care_logs by caregiver", 374 rows). Reading by that label gives an empty file, so the range is worked out
// from the cells themselves.
export function fullRange(X, sheet) {
  const ks = Object.keys(sheet).filter(k => k[0] !== '!');
  if (!ks.length) return sheet;
  const r = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  for (const k of ks) { const a = X.utils.decode_cell(k); r.s.r = Math.min(r.s.r, a.r); r.s.c = Math.min(r.s.c, a.c); r.e.r = Math.max(r.e.r, a.r); r.e.c = Math.max(r.e.c, a.c); }
  sheet['!ref'] = X.utils.encode_range(r);
  return sheet;
}

// A WellSky care log export (Reports, Custom, Care Logs), CSV or Excel. Headings vary, so they are found
// by name: the client, the caregiver, clock in and clock out (date and time in one cell, or a date
// column plus time columns). Rows whose status says not complete or cancelled are skipped.
export function readCareLogRows(rows) {
  const head = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
  const col = (...p) => head.findIndex(h => p.some(r => r.test(h)));
  const iN = col(/^client( last, first)? name$/, /^(client|patient|consumer)\b.*name/, /^(client|patient|consumer)$/),
        iC = col(/caregiver.*name/, /^caregiver$/, /attendant/),
        iI = col(/clock ?in/, /^start( time)?$/, /check ?in/), iO = col(/clock ?out/, /^end( time)?$/, /check ?out/),
        iD = col(/^(date|care ?log date|visit date|shift date)$/), iS = col(/^status$/, /care ?log status/),
        iM = col(/^insurance id$/, /^(dcn|medicaid id|member id)$/);
  if (iN < 0 || iI < 0) return { logs: [], why: 'no client name or clock in column; headings: ' + (rows[0] || []).slice(0, 12).join(', '), skipped: 0 };
  const logs = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    if (!r[iN]) continue;
    const st = iS >= 0 ? String(r[iS] || '') : '';
    if (/cancel|missed|deleted/i.test(st)) { skipped++; continue; }
    const base = iD >= 0 ? stamp(r[iD]) : '';
    const clockIn = stamp(r[iI], base), clockOut = iO >= 0 ? stamp(r[iO], base) : '';
    if (!clockIn) { skipped++; continue; }
    let out = clockOut || null;
    if (out && out < clockIn && out.slice(0, 10) === clockIn.slice(0, 10)) out = C.localIso(new Date(Date.parse(clockIn.slice(0, 10) + 'T12:00:00') + C.DAY)) + out.slice(10);   // past midnight
    const x = { consumer: String(r[iN]).trim(), attendant: iC >= 0 ? String(r[iC] || '').trim() : '', clockIn, clockOut: out };
    if (iM >= 0 && String(r[iM] || '').trim()) x.dcn = String(r[iM]).trim();
    // "Not Complete" in WellSky: the care log is not finished, so it is not billed yet (the claim leaves that day out).
    if (/not complete/i.test(st)) x.incomplete = true;
    logs.push(x);
  }
  return { logs, skipped, why: '' };
}
// 'YYYY-MM-DDTHH:MM:SS' from "2026-10-15 09:41:23", "10/15/2026 9:41 AM", an Excel serial, or a time
// ("9:41 AM") on top of a date found in another column.
export function stamp(v, baseDay) {
  if (typeof v === 'number') {
    if (v >= 1 && v < 80000) { const ms = Math.round((v - 25569) * C.DAY); const d = new Date(ms); return d.toISOString().slice(0, 19); }
    if (v >= 0 && v < 1 && baseDay) { const m = Math.round(v * 1440); return baseDay.slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':00'; }
    return '';
  }
  const s = String(v || '').trim();
  if (!s) return '';
  let day = '', m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) day = m[0];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))) day = (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  else if (baseDay) day = baseDay.slice(0, 10);
  if (!day) return '';
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(s.replace(/^\S*\d{4}\S*\s*/, ' ')) || (/T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s));
  if (!t) return '';
  let hh = +t[1]; const ap = (t[4] || '').toLowerCase();
  if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0;
  return day + 'T' + String(hh).padStart(2, '0') + ':' + t[2] + ':' + (t[3] || '00');
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
