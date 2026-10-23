// WellSky Analytics reports that arrive by email (2026-10-21, Samantha: "I would rather
// you deep dive on how to set up recurring report pulls").
//
// WellSky Analytics (Reports > Analytics, built on Looker) emails two dashboards to
// samantha@mo-care.com every day at 6:00am Central as a CSV zip. A Google script in her
// account (wellsky/google-script.gs) unzips each one and posts the CSV files to the
// cds-wellsky server function, which reads them with this file. No Chrome, no Mac and no
// WellSky login is involved, so the WellSky idle logout can no longer stop it.
//
//   "First and Last Carelog"   (dashboard 67)  every active consumer's first and last care
//                                              log, back to the very first one (the 40 goal)
//   "Authorization Care Logs"  (dashboard 670) every shift in the last 7 days with clock in
//                                              and clock out (blank = never clocked out)
//
// Analytics data runs up to the end of the day before. Columns are found by their names,
// so a column WellSky moves still reads; a column that disappears is a failure that says
// which columns did arrive, never a quiet nothing.
// Kept: names, dates, times, authorization labels. Nothing else is saved.
// No em dashes in anything a person reads (her rule).

export const REPORTS = { firstLast: 'First and Last Carelog', authLogs: 'Authorization Care Logs' };
export const SENDER = 'noreply-analytics-scheduler@clearcaremail.com';
const MAX_ROWS = 20000;

const fail = msg => { const e = new Error(msg); e.wellsky = true; throw e; };

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes.
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

const norm = h => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// The header row as objects keyed by the column name, plus a finder by name pattern.
function table(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { head: [], rows: [] };
  const head = rows[0].map(h => String(h).trim());
  return { head, rows: rows.slice(1, MAX_ROWS + 1).map(r => r.map(x => String(x).trim())) };
}
function col(head, ...patterns) {
  const n = head.map(norm);
  for (const p of patterns) { const i = n.findIndex(h => p.test(h)); if (i >= 0) return i; }
  return -1;
}
const day = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? m[0] : ''; };
const stamp = v => { const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?/.exec(v || ''); return m ? m[1] + 'T' + m[2] + (m[3] || ':00') : ''; };
const byName = (files, re) => (files || []).find(f => re.test(String(f.name || '').toLowerCase()));
const heads = f => f ? table(f.text).head.join(', ') : '';

// First and Last Carelog: client.csv (one row per consumer) and client_then_caregiver.csv
// (one row per consumer and attendant, used to name who worked the first shift).
export function readFirstLast(files) {
  const cf = byName(files, /(^|\/)client\.csv$/);
  if (!cf) fail('The First and Last Carelog email had no client file. Files: ' + (files || []).map(f => f.name).join(', '));
  const t = table(cf.text);
  const iN = col(t.head, /^client name$/, /client.*name/), iF = col(t.head, /^first carelog date$/, /first.*date/), iL = col(t.head, /^last carelog date$/, /last.*date/);
  if (iN < 0 || iF < 0) fail('The First and Last Carelog client file changed shape. Columns: ' + t.head.join(', '));
  const consumers = [], unread = [];
  t.rows.forEach(r => {
    const name = r[iN], first = day(r[iF]);
    if (!name) return;
    if (!first) { unread.push(name); return; }
    consumers.push({ name, first, last: iL >= 0 ? day(r[iL]) : '' });
  });
  // Who worked the first shift: the attendant whose own first care log for that consumer is earliest.
  const tf = byName(files, /client_then_caregiver\.csv$/);
  if (tf) {
    const u = table(tf.text);
    const jN = col(u.head, /^client name$/, /client.*name/), jC = col(u.head, /^caregiver name$/, /caregiver.*name/), jF = col(u.head, /^first carelog date$/, /first.*date/);
    if (jN >= 0 && jC >= 0 && jF >= 0) {
      const best = {};
      u.rows.forEach(r => { const d = day(r[jF]); if (r[jN] && r[jC] && d && (!best[r[jN]] || d < best[r[jN]].d)) best[r[jN]] = { d, who: r[jC] }; });
      consumers.forEach(c => { if (best[c.name] && best[c.name].d === c.first) c.attendant = best[c.name].who; });
    }
  }
  if (!consumers.length) fail('The First and Last Carelog email listed no consumers. Columns: ' + t.head.join(', '));
  return { consumers, unread };
}

// Authorization Care Logs: one row per shift in the last 7 days. A blank clock out means
// the shift was never clocked out.
export function readAuthLogs(files) {
  const f = (files || []).find(x => /\.csv$/i.test(String(x.name || '')));
  if (!f) fail('The Authorization Care Logs email had no CSV file.');
  const t = table(f.text);
  const iN = col(t.head, /^client last first name$/, /client.*name/), iA = col(t.head, /^authorization id$/, /authorization/),
        iI = col(t.head, /^clock in time$/, /clock in/), iO = col(t.head, /^clock out time$/, /clock out/);
  // Her own copy of this dashboard (2026-10-21) adds Caregiver Full Name, the authorization end date
  // and Initial Hours. Read when there; the older dashboard without them still works (2026-10-22).
  const iC = col(t.head, /^caregiver full name$/, /^caregiver name$/, /caregiver.*name/),
        iE = col(t.head, /authorizations? end date/, /^end date$/), iH = col(t.head, /^initial hours$/);
  if (iN < 0 || iI < 0 || iO < 0) fail('The Authorization Care Logs file changed shape. Columns: ' + t.head.join(', '));
  const shifts = [], unread = [];
  t.rows.forEach(r => {
    if (!r[iN]) return;
    const clockIn = stamp(r[iI]);
    if (!clockIn) { unread.push(r[iN]); return; }
    const out = stamp(r[iO]);
    const hours = out ? Math.round((Date.parse(out + 'Z') - Date.parse(clockIn + 'Z')) / 36e3) / 100 : null;
    const x = { consumer: r[iN], auth: iA >= 0 ? r[iA] : '', clockIn, clockOut: out, hours };
    if (iC >= 0 && r[iC]) x.attendant = r[iC];
    if (iE >= 0 && day(r[iE])) x.authEnd = day(r[iE]);
    if (iH >= 0 && r[iH] !== '' && !isNaN(+r[iH])) x.authHours = +r[iH];
    shifts.push(x);
  });
  return { shifts, unread, columns: t.head.slice(0, 40) };
}

// body = { kind: 'analytics', report: '<email subject>', received: ISO time, files: [{ name, text }] }
export function readReport(body) {
  const report = String(body && body.report || '').trim();
  const files = Array.isArray(body && body.files) ? body.files.map(f => ({ name: String(f && f.name || ''), text: String(f && f.text || '') })) : [];
  if (!files.length) fail('The "' + report + '" email had no files in it.');
  if (report === REPORTS.firstLast) return Object.assign({ which: 'firstLast' }, readFirstLast(files));
  if (report === REPORTS.authLogs) return Object.assign({ which: 'authLogs' }, readAuthLogs(files));
  fail('An email from WellSky Analytics that is not one of ours: "' + report.slice(0, 80) + '"');
}

// The WellSky first care log is the true first shift, so it replaces a later date the
// schedule report saw (that report only reaches back to the 1st of last month).
export function mergeFirstFromAnalytics(prev, fl) {
  const out = { from: (prev && prev.from) || '', people: Object.assign({}, prev && prev.people), analytics: true };
  (fl && fl.consumers || []).forEach(c => {
    const had = out.people[c.name];
    if (!had || c.first < had.date) out.people[c.name] = { date: c.first, attendant: c.attendant || (had && had.attendant) || '' };
    if (!out.from || c.first < out.from) out.from = c.first;
  });
  return out;
}
