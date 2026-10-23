// CDS Hub · Attendants · Active Attendants (2026-10-21, Samantha: "a tab of Active
// Attendants that open to each attendant's profile" and "as easy as possible on
// the admin"). Two sources in one list:
//   - attendants who came through the new application (caringcds.com/apply): the
//     cds-match server (packetList / packetGet ...), full profile + onboarding tracker
//   - attendants already on the Roster (agency_data 'attendants'): their roster card,
//     with rechecks due worked out from the dates already typed there.
// mountHubPacket(el, { api, roster, saveRoster, wellsky, oigPeople, openRoster, openMatch })
// 2026-10-22 (her yes to the Attendants plan): three groups instead of Active / Applying tabs,
// the onboarding track, WellSky shown on each card, Roster check dates typed in on the card.
// No em dashes in anything a person reads.

import { mergedShifts } from '../hours/hub-hours.js?v=4';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = iso => (iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '');
const ymd = d => d.toISOString().slice(0, 10);
const addM = (iso, m) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return ymd(d); };
const CHECK_NAMES = { edl: 'EDL', edr: 'DMH EDR', oig: 'OIG', mo_medicaid: 'MO Medicaid exclusion', age18: 'Age 18+', id_match: 'ID matches (video call)' };

const CSS = `
.hp{font-family:inherit;color:#1d2a36}
/* Not "tabs": inside GHL the hub hides every .tabs bar (html.embedded.focused .tabs), which hid these (fixed 2026-10-22). */
.hp .hp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.hp .hp-tabs button,.hp .pill-btn{border:2px solid #dfe6ec;background:#fff;color:#0D365F;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:14px}
.hp .hp-tabs button.on{background:#0D365F;color:#fff;border-color:#0D365F}
.hp .hp-tabs{margin:10px 0 12px}
.hp .row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;width:100%;text-align:left;background:#fff;border:1px solid #dfe6ec;border-radius:12px;padding:12px 14px;margin-top:8px;cursor:pointer;font:inherit;color:inherit}
.hp .row b{color:#0D365F;font-size:16px}.hp .row .meta{grid-column:1/-1;font-size:13.5px;color:#5b6977}
.hp .pill{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap}
.hp .g{background:#e7f5ee;color:#1f7a4d}.hp .y{background:#f6e7b8;color:#6b4e00}.hp .r{background:#fdecea;color:#b42318}.hp .b{background:#e3f1f0;color:#0f5f61}
.hp .card{background:#fff;border:1px solid #dfe6ec;border-radius:14px;padding:16px;margin-top:10px}
.hp h2{font-size:22px;color:#0D365F;margin:4px 0}.hp h3{font-size:15px;color:#0D365F;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em}
.hp .next{border-radius:10px;padding:10px 12px;margin-top:10px;font-weight:600}
.hp dl{display:grid;grid-template-columns:minmax(120px,34%) 1fr;gap:5px 12px;margin:6px 0;font-size:14.5px}.hp dt{color:#5b6977}.hp dd{margin:0;overflow-wrap:anywhere}
.hp ol.steps{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.hp ol.steps li{display:grid;grid-template-columns:24px 1fr;gap:8px;font-size:14.5px}
.hp ol.steps li::before{content:"";width:18px;height:18px;border-radius:50%;border:2px solid #c9d3dc;margin-top:2px}
.hp ol.steps li.done::before{content:"✓";border:0;background:#e7f5ee;color:#1f7a4d;display:grid;place-items:center;font-size:12px}
.hp ol.steps li.now::before{background:#0f7a7c;border-color:#0f7a7c}
.hp ol.steps span{display:block;color:#5b6977;font-size:13px}
.hp table{width:100%;border-collapse:collapse;font-size:14px}.hp th,.hp td{text-align:left;padding:7px 6px;border-bottom:1px solid #eef2f5;vertical-align:top}
.hp th{font-size:11px;text-transform:uppercase;color:#5b6977;letter-spacing:.05em}
.hp .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.hp .btn{border:0;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer;font:inherit;font-size:14px;background:#0D365F;color:#fff}
.hp .btn.o{background:#fff;color:#0D365F;border:2px solid #dfe6ec}
.hp .copy{border:1px dashed #c9d3dc;border-radius:10px;padding:8px 10px;margin-top:8px}
.hp .copy div{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0;font-size:14px;flex-wrap:wrap}
.hp .small{font-size:13px;color:#5b6977}.hp .err{color:#b42318;font-weight:700;margin-top:6px}
.hp input[type=text],.hp input[type=date]{font:inherit;padding:7px 9px;border:2px solid #dfe6ec;border-radius:8px}
.hp .hp-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.hp .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:8px 0 4px}
.hp .tile{background:#fff;border:1px solid #dfe6ec;border-radius:12px;padding:10px 12px}
.hp .tile .n{font-size:24px;font-weight:800;color:#0D365F;line-height:1.1;font-variant-numeric:tabular-nums}
.hp .tile .t{font-size:13px;color:#5b6977}
.hp .tile.r .n{color:#b42318}.hp .tile.y .n{color:#6b4e00}
.hp .grp{margin-top:16px}
.hp .ghead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.hp .ghead h3{margin:0}.hp .ghead span{font-size:13px;color:#5b6977}
.hp .track{grid-column:1/-1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:6px}
.hp .track i{height:7px;border-radius:99px;background:#e5eaef}
.hp .track i.d{background:#0f7a7c}.hp .track i.n{background:#e9a92c}
.hp .row .stepname{color:#0D365F;font-size:13.5px}
.hp .ok{color:#1f7a4d;font-weight:700;margin-top:6px}
.hp .ask{background:#f7f9fb;border-radius:10px;padding:10px 12px;margin-top:6px}
.hp .btn.bad{background:#b42318}
.hp .hp-print p{font-size:14.5px;line-height:1.5}
@media print{body *{visibility:hidden!important}.hp .hp-print,.hp .hp-print *{visibility:visible!important}
.hp .hp-print{position:absolute;left:0;top:0;width:100%;border:0;margin:0;padding:0}.hp .hp-noprint{display:none!important}
.hp .hp-print h3{break-after:avoid}.hp .hp-print dl{break-inside:avoid}}
`;

// ---------- the three groups (pure, tested in tests/attendants_page_test.mjs) ----------
// Her calls 2026-10-22: one page with Getting started / Working / Not working lately; an
// attendant counts as Working from their first clock-in in WellSky; no shift in 31 days moves
// them to Not working lately, and rechecks stop only when someone taps "No longer working".
const DAY = 864e5;
export const WORKING_DAYS = 31;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const shortDay = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) : '';
// "Pham, Nuong" and "Nuong Pham" are the same person (same rule as the Check against WellSky card).
export function nameKey(name) {
  return String(name || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/).map(t => t.replace(/^-+|-+$/g, '')).filter(t => t.length > 1).sort().join(' ');
}
const display = name => { const s = String(name || '').trim().replace(/\s+/g, ' '); const m = /^([^,]+),\s*(.+)$/.exec(s); return m ? m[2] + ' ' + m[1] : s; };

// What WellSky says about each attendant, from agency_data 'wellskyCheck':
//   .shifts                 the schedule report: every shift with its attendant and hours
//   .analytics.firstLast    the daily email: each consumer's last care log and who worked their
//                           first shift. It is usually newer than the schedule, so its last date also
//                           counts for that first-shift attendant (a CDS consumer almost always has one).
// -> { by: { [nameKey]: { name, last, hours (this month), consumers } }, have, asOf, hoursAsOf }
export function wellskyByAttendant(w, now = new Date()) {
  w = w || {};
  const today = isoLocal(now), month = today.slice(0, 7), by = {};
  const get = raw => { const k = nameKey(raw); if (!k) return null; return by[k] || (by[k] = { key: k, name: display(raw), last: '', first: '', hours: 0, consumers: [] }); };
  const addC = (x, c) => { const n = display(c); if (n && !x.consumers.includes(n)) x.consumers.push(n); };
  // Shifts from the daily WellSky email when it names the attendant, else the Chrome schedule report.
  const sh = mergedShifts(w), fl = w.analytics && w.analytics.firstLast;
  for (const c of (sh && sh.consumers) || []) for (const s of c.shifts || []) {
    if (!s.date || s.date > today) continue;
    const x = get(s.attendant); if (!x) continue;
    addC(x, c.name);
    if (s.date > x.last) x.last = s.date;
    if (s.date.slice(0, 7) === month && typeof s.hours === 'number') x.hours += s.hours;
  }
  for (const c of (fl && fl.consumers) || []) {
    const x = c.attendant ? get(c.attendant) : null; if (!x) continue;
    addC(x, c.name);
    if (c.last && c.last <= today && c.last > x.last) x.last = c.last;
  }
  // First day of work: the attendant's first care log in WellSky (the daily First and Last Carelog email).
  for (const a of (fl && fl.attendants) || []) {
    const x = get(a.name); if (!x || !a.first || a.first > today) continue;
    if (!x.first || a.first < x.first) x.first = a.first;
  }
  Object.values(by).forEach(x => { x.hours = Math.round(x.hours * 4) / 4; });
  return { by, have: !!((sh && sh.consumers) || (fl && fl.consumers)),
    asOf: [sh && sh.at, fl && fl.at].filter(Boolean).sort().pop() || null, hoursAsOf: (sh && sh.at) || null };
}

// Roster attendants: rechecks from the dates typed on the Roster, plus the automatic OIG.
// autoOig: the date the automatic OIG check (cds-oig) last found them clear, when the OIG switch is on.
// A date never typed in is "add the date" (yellow), not overdue: it is a records gap.
export function rosterDue(a, autoOig, now = new Date()) {
  const t = isoLocal(now), soon = isoLocal(new Date(now.getTime() + 7 * DAY));
  const oig = autoOig && (!a.leieDate || autoOig > a.leieDate) ? autoOig : a.leieDate;
  const rows = [['OIG', oig, 1, oig && oig === autoOig], ['EDL', a.edlDate, 3], ['FCSR', a.fcsrDate, 12]].map(([k, d, m, auto]) => {
    const due = d ? addM(d, m) : null;
    return { k, done: d || null, auto: !!auto, due, tone: !d ? 'y' : due < t ? 'r' : due <= soon ? 'y' : 'g', missing: !d };
  });
  const over = rows.find(r => r.tone === 'r'), soonR = rows.find(r => r.tone === 'y' && !r.missing), miss = rows.filter(r => r.missing);
  const label = over ? over.k + ' overdue' : soonR ? soonR.k + ' due ' + shortDay(soonR.due)
    : miss.length ? 'Add ' + miss.map(r => r.k).join(' and ') + (miss.length > 1 ? ' dates' : ' date') : 'All checks good';
  return { rows, label, tone: over ? 'r' : soonR || miss.length ? 'y' : 'g', due: !!(over || soonR), missing: miss.length > 0 };
}

// Check proof from GHL (2026-10-22): after the office reviews the dates, each attendant's Roster
// date moves forward to the newest confirmed check, never back.
const PROOF_FIELD = { edl: 'edlDate', fcsr: 'fcsrDate', oig: 'leieDate' };
export function proofPatches(items, roster) {
  const out = [];
  for (const a of roster || []) {
    const patch = {};
    for (const [k, f] of Object.entries(PROOF_FIELD)) {
      const newest = (items || []).filter(x => x.attendant_id === a.id && x.check === k && /^\d{4}-\d{2}-\d{2}$/.test(x.checked_on || '')).map(x => x.checked_on).sort().pop();
      if (newest && (!a[f] || newest > a[f])) patch[f] = newest;
    }
    if (Object.keys(patch).length) out.push({ id: a.id, patch });
  }
  return out;
}
const CHECK_LABEL = { fcsr: 'FCSR', edl: 'EDL', oig: 'OIG', application: 'Application', onboarding: 'Onboarding papers' };
const IS_CHECK = k => k === 'fcsr' || k === 'edl' || k === 'oig';
// A paper's link: the copy in the hub, else the signed record in GHL.
const paperLink = x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.file_name || 'View')}</a>`
  : x.ghl_link ? `${esc(x.file_name)} <a href="${esc(x.ghl_link)}" target="_blank" rel="noopener">Open in GHL</a>` : esc(x.file_name);

// Ending an attendant (her rule 2026-10-22): the consumer's decision, on record.
export const END_WHY = [['consumer', 'The consumer ended it'], ['attendant', 'The attendant quit (consumer told)'], ['other', 'Other (say what in the note)']];
export const END_HOW = [['call', 'Phone call'], ['person', 'In person'], ['text', 'Text message'], ['email', 'Email'], ['letter', 'Signed letter or form']];
export function endRecord({ why, how, on, said, by }, now = new Date()) {
  const today = isoLocal(now);
  if (!END_WHY.some(([k]) => k === why)) return { error: 'Pick why they are no longer working.' };
  if (!END_HOW.some(([k]) => k === how)) return { error: 'Pick how the consumer told us.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on || '') || on > today) return { error: 'Pick the date the consumer told us (not in the future).' };
  const words = String(said || '').trim();
  if (words.length < 10) return { error: 'Write what the consumer said, or paste their text or email.' };
  return { record: { why, how, on, said: words.slice(0, 4000), by: String(by || '').trim(), at: now.toISOString() } };
}
export function endWords(e) {
  if (!e) return '';
  const why = (END_WHY.find(([k]) => k === e.why) || [, ''])[1], how = (END_HOW.find(([k]) => k === e.how) || [, ''])[1];
  return 'Ended ' + shortDay(e.on) + ': ' + why.replace(/ \(.*\)$/, '').toLowerCase() + ' (' + how.toLowerCase() + ')' + (e.by ? ', recorded by ' + e.by.replace(/@.*/, '') : '');
}

// The onboarding track: the packet's steps folded into the 7 the office sees, the last one
// being the first clock-in in WellSky.
export const TRACK = [
  { key: 'step1', label: 'Application signed', keys: ['step1'] },
  { key: 'checks', label: 'Checks', keys: ['checks'] },
  { key: 'orientation', label: 'Orientation', keys: ['orientation'] },
  { key: 'papers', label: 'Papers signed', keys: ['papers'] },
  { key: 'empeon', label: 'Empeon', keys: ['empeon_invite', 'empeon'] },
  { key: 'call', label: 'ID call and I-9', keys: ['call', 'i9', 'countersign'] },
  { key: 'shift', label: 'First shift in WellSky', keys: [] },
];
export function trackOf(steps, hasShift) {
  const done = Object.fromEntries((steps || []).map(s => [s.key, !!s.done]));
  const t = TRACK.map(x => ({ key: x.key, label: x.label, done: x.key === 'shift' ? !!hasShift : x.keys.every(k => done[k]) }));
  // Orientation can finish any time, so it is "where they are" only when everything else is done.
  let at = t.findIndex(x => !x.done && x.key !== 'orientation');
  if (at < 0) at = t.findIndex(x => !x.done);
  return { steps: t, at: at < 0 ? t.length : at };
}

// Weekdays (Mon to Fri) from iso to now, not counting the day it happened.
export function weekdaysSince(iso, now = new Date()) {
  if (!iso) return 0;
  let n = 0;
  const d = new Date(iso); d.setHours(12, 0, 0, 0);
  const end = new Date(now); end.setHours(12, 0, 0, 0);
  while (d < end) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0 && d <= end) n++; }
  return n;
}
const daysSince = (iso, now) => iso ? Math.floor((now - new Date(iso)) / DAY) : 0;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const lastWords = (iso, now) => { const d = daysSince(iso + 'T12:00:00', now); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : shortDay(iso); };

// packets: packetList rows, plus steps and updated_at from packetGet for anyone not yet active.
// roster: the Roster attendants not marked inactive. -> { starting, working, quiet, tiles, wellsky }
// ended: Roster attendants marked "No longer working" (shown on the Inactive tab, 2026-10-22).
export function buildGroups({ packets = [], roster = [], ended = [], autoOig = () => null, wellsky, now = new Date() }) {
  const ws = wellskyByAttendant(wellsky, now);
  const cutoff = isoLocal(new Date(now.getTime() - WORKING_DAYS * DAY));
  const find = name => ws.by[nameKey(name)] || null;
  const workMeta = (consumers, w) => [consumers ? 'Works for ' + consumers : '',
    w && w.hours ? w.hours + ' hrs this month' : '', w && w.last ? 'last shift ' + lastWords(w.last, now) : ''].filter(Boolean).join(' · ');
  const starting = [], working = [], quiet = [];

  for (const a of packets) {
    const w = find(a.name), shift = !!(w && w.last);
    if (a.active && shift) {
      working.push({ kind: 'packet', id: a.pool_id, name: a.name, label: 'All checks good', tone: 'g', due: false, missing: false,
        meta: workMeta(w.consumers.join(' and ') || a.consumer, w) });
      continue;
    }
    const tr = a.steps ? trackOf(a.steps, shift) : null;
    const since = a.updated_at || a.step1_at || a.started_at;
    let flag = null;
    if (a.active) flag = daysSince(a.active_at || since, now) >= 10 ? { tone: 'y', text: 'No shift yet after ' + plural(daysSince(a.active_at || since, now), 'day', 'days') } : null;
    else if (a.consumer_waiting && a.step1_at && weekdaysSince(since, now) >= 2) flag = { tone: 'r', text: 'No change in ' + plural(weekdaysSince(since, now), 'weekday', 'weekdays') };
    else if (daysSince(since, now) >= 10) flag = { tone: 'y', text: 'Quiet ' + plural(daysSince(since, now), 'day', 'days') };
    starting.push({ kind: 'packet', id: a.pool_id, name: a.name, waiting: !!a.consumer_waiting && !a.active, ready: !!a.active,
      label: a.active ? 'Waiting on first shift' : a.label, tone: a.active ? 'b' : a.tone, track: tr, flag, since: a.step1_at || a.started_at,
      meta: [a.consumer ? (a.consumer_waiting ? 'For ' + a.consumer + ' (consumer waiting)' : 'For ' + a.consumer) : '',
        a.step1_at ? 'Step 1 signed ' + shortDay(String(a.step1_at).slice(0, 10)) : 'Started ' + shortDay(String(a.started_at || '').slice(0, 10)),
        a.active ? 'Ready: their first clock-in in WellSky moves them to Working' : a.next].filter(Boolean).join(' · ') });
  }
  for (const a of roster) {
    const w = find(a.wellskyName || a.name), d = rosterDue(a, autoOig(a.id), now);
    const row = { kind: 'roster', id: a.id, name: a.name, label: d.label, tone: d.tone, due: d.due, missing: d.missing, last: w ? w.last : '' };
    if (!ws.have || (w && w.last >= cutoff)) working.push({ ...row, meta: workMeta((w && w.consumers.join(' and ')) || a.consumer, w) });
    else quiet.push({ ...row, label: w && w.last ? 'Last shift ' + shortDay(w.last) : 'No WellSky shifts', tone: 'b',
      meta: [a.consumer ? 'Was with ' + a.consumer : '', 'Still working? Open to mark them no longer working.'].filter(Boolean).join(' · ') });
  }
  const rank = r => r.tone === 'r' ? 0 : r.due ? 1 : r.missing ? 2 : 3;
  // Consumer waiting first, then everyone still onboarding (oldest first), then the ready ones waiting on a first shift.
  starting.sort((x, y) => (y.waiting - x.waiting) || (x.ready - y.ready) || String(x.since).localeCompare(String(y.since)));
  working.sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name));
  quiet.sort((x, y) => String(y.last).localeCompare(String(x.last)) || x.name.localeCompare(y.name));
  const gone = ended.map(a => { const w = find(a.wellskyName || a.name);
    return { kind: 'ended', id: a.id, name: a.name, label: 'No longer working', tone: 'b', last: w ? w.last : '',
      said: a.ended ? a.ended.said : '',
      meta: [endWords(a.ended) || 'No record of how the consumer told us', a.consumer ? 'was with ' + a.consumer : '', w && w.last ? 'last shift ' + shortDay(w.last) : ''].filter(Boolean).join(' · ') }; })
    .sort((x, y) => x.name.localeCompare(y.name));
  return { starting, working, quiet, ended: gone, wellsky: ws,
    tiles: { starting: starting.length, working: working.length, due: [...working, ...quiet].filter(r => r.due).length,
      dates: [...working, ...quiet].filter(r => r.missing).length, quiet: quiet.length } };
}


// ---------- the attendant's audit file (her yes to the mockup, 2026-10-23) ----------
// One printable file from both views: the application (packetGet: answers, signed forms, I-9,
// orientation) and the Roster (check dates, proof PDFs, WellSky). Either may be missing: someone
// hired before the online application has only the Roster and the papers brought in from GHL.
// No SSN or birth date prints; the age check result does. 19 CSR 15-8.400 (5)(A), (5)(B), (8)(B), (10).
const ORIENT_TOPICS = ['EVV rules and clocking in and out in WellSky', 'What counts as fraud', 'Allowed and not allowed tasks',
  'Falsified visit records are fraud and are reported to MMAC', 'Attendant rights and responsibilities',
  'Spotting abuse, neglect and exploitation; duty to report', 'Must report a decline in the consumer’s health'];
const addBiz = (iso, n) => { const d = new Date(iso + 'T12:00:00'); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return isoLocal(d); };
export function attendantFileHtml({ name, roster, packet, proofs = [], wellsky, autoOig, corrections = [], company = 'Caring Companions CDS', printedBy = '', now = new Date() }) {
  const a = roster || {}, g = packet || null, p = (g && g.packet) || {}, ans = (g && g.answers) || {}, forms = (g && g.forms) || {};
  const ws = wellskyByAttendant(wellsky, now), w = ws.by[nameKey(a.wellskyName || name)] || null;
  const day = d => d ? fmtD(String(d).slice(0, 10)) : '';
  const nr = '<span class="none">not recorded</span>';
  const ymdOf = d => d ? (String(d).length === 10 ? d : new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })) : '';
  const first = w && w.first || '';
  const appFile = proofs.find(x => x.check === 'application');
  const gaps = [];
  // 1. qualifications
  const scrChecks = (g && g.screening && g.screening.checks) || [];
  const age = scrChecks.find(c => c.key === 'age18');
  const fromApp = (k, okWhen) => g ? (ans[k] === undefined ? '' : ans[k] === okWhen ? 'Confirmed' : '<span class="none">' + (ans[k] === 'yes' ? 'Yes: not allowed' : esc(ans[k])) + '</span>') : appFile ? 'Signed application on file (from GHL)' : '';
  const q = [
    ['At least 18', age ? (age.clear ? 'Yes, checked from the birth date' : '<span class="none">not clear</span>') : appFile ? 'Signed application on file (from GHL)' : ''],
    ['Not the consumer’s spouse', g ? (ans.relation === 'spouse' ? '<span class="none">Spouse: not allowed</span>' : ans.has_consumer === 'no' || ans.related ? 'Confirmed' : '') : appFile ? 'Signed application on file (from GHL)' : ''],
    ['Not the consumer’s guardian', fromApp('guardian', 'no')], ['Not a CDS consumer', fromApp('gets_cds', 'no')], ['No past Medicaid fraud', fromApp('mfraud', 'no')],
    ['Agrees to confidentiality', forms.contract ? 'Signed contract, ' + day(forms.contract.signed_at) : appFile ? 'Application on file (from GHL)' : ''],
    ['Able to do the tasks, dependable, handles emergencies', ans.qualified === 'yes' ? 'Says so on the application; the consumer hired them' : a.consumer || p.consumer_name ? 'The consumer’s hiring decision' : '']];
  q.forEach(([k, v]) => { if (!v) gaps.push('(5)(A)3 ' + k.toLowerCase() + ': not on file'); });
  // 2. background checks: first check, before the first shift, last check, next due, proof
  const rd = rosterDue(a, autoOig || null, now);
  const proofOf = k => proofs.filter(x => x.check === k).map(x => x.checked_on || x.date_found).filter(Boolean).sort();
  const scrAt = k => { const c = scrChecks.find(x => x.key === k); return c && c.clear && c.at ? ymdOf(c.at) : ''; };
  const checks = [['FCSR registration and screening', 'fcsr', 'FCSR', a.fcsrDate], ['EDL (Employee Disqualification List)', 'edl', 'EDL', a.edlDate], ['OIG / LEIE exclusion list', 'oig', 'OIG', a.leieDate]].map(([label, k, rk, rosterDate]) => {
    const dates = [...proofOf(k), rosterDate, scrAt(k)].filter(Boolean).sort();
    const r = rd.rows.find(x => x.k === rk) || {};
    const firstCheck = dates[0] || '', before = firstCheck && first ? firstCheck <= first : null;
    if (!firstCheck) gaps.push('(5)(A)1 no ' + rk + ' check on file');
    else if (before === false) gaps.push('(5)(A)1 first ' + rk + ' check (' + firstCheck + ') was after the first shift (' + first + ')');
    if (r.tone === 'r') gaps.push(rk + ' recheck overdue since ' + r.due);
    const files = proofs.filter(x => x.check === k).length;
    return [esc(label), day(firstCheck), before === null ? (first ? '' : '<span class="small">no shift yet</span>') : before ? 'Yes' : '<span class="none">No</span>',
      day(r.done || dates[dates.length - 1]) + (r.auto ? ' (automatic)' : ''), r.due ? (r.tone === 'r' ? '<span class="none">' + day(r.due) + ', overdue</span>' : day(r.due)) : '',
      files ? files + (files === 1 ? ' file' : ' files') : '<span class="none">none</span>'];
  });
  // 3. hiring papers
  const signedForm = k => forms[k] ? 'Signed ' + day(forms[k].signed_at) + (forms[k].countersigned_at ? ', countersigned ' + day(forms[k].countersigned_at) : '') : '';
  const i9 = p.i9_done_at ? ymdOf(p.i9_done_at) : '';
  const i9Due = first ? addBiz(first, 3) : '';
  if (g && !i9 && first) gaps.push('I-9 Section 2 not done; due ' + i9Due + ' (3 business days after the first shift)');
  if (i9 && i9Due && i9 > i9Due) gaps.push('I-9 Section 2 done ' + i9 + ', after the 3-business-day limit (' + i9Due + ')');
  const papers = [
    ['Contract', signedForm('contract') || (a.contract ? esc(a.contract) : appFile ? 'Onboarding papers on file (from GHL)' : '')],
    ['Handbook', signedForm('handbook')], ['Pay and units', [signedForm('pay'), signedForm('units')].filter(Boolean).join('; ')],
    ['I-9 Section 2', i9 ? day(i9) + (i9Due ? (i9 <= i9Due ? ', within 3 business days of starting' : ', <span class="none">late (due ' + day(i9Due) + ')</span>') : '') : g ? '' : 'In Empeon (hired before the online application)'],
    ['W-4 and direct deposit', p.empeon_done_at ? 'Done in Empeon ' + day(p.empeon_done_at) : a.empeon ? 'Empeon: ' + esc(a.empeon) : '']];
  // 4. orientation, per topic
  const vid = p.orientation_done_at ? ymdOf(p.orientation_done_at) : '';
  if (!vid) gaps.push('(5)(B) no orientation date on file');
  const orient = [['General orientation with the consumer present', 'Done by the consumer as the employer; recorded on the consumer’s file']].concat(ORIENT_TOPICS.map(t => [t, vid ? day(vid) + ', orientation video and handbook' : '']))
    .concat([['Pandemic policy (the consumer trains them yearly)', 'Recorded on the consumer’s file (Missouri forms)']]);
  // 5. work history
  const fixes = corrections.filter(x => nameKey(x.attendant) === nameKey(name));
  // 6. ending
  const ends = [...(a.pastEnds || []), ...(a.ended ? [a.ended] : [])];
  const tbl = (head, rows) => '<table><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(x => '<td>' + (x || nr) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  const S = (n, title, cite, ok, inner) => '<section><h2><span class="n">' + n + '</span>' + title + ' <span class="cite">' + cite + '</span><span class="chip ' + (ok ? 'ok">On file' : 'miss">Needs attention') + '</span></h2>' + inner + '</section>';
  const has = re => gaps.some(x => re.test(x));
  const sec = [
    S(1, 'Qualifications', '(5)(A)3', !has(/^\(5\)\(A\)3/), tbl(['Rule', 'How we know'], q.map(([k, v]) => [esc(k), v]))),
    S(2, 'Background checks', '(5)(A)1, (8)(B)', !has(/^\(5\)\(A\)1|recheck overdue/), tbl(['Check', 'First check', 'Before first shift' + (first ? ' (' + day(first) + ')' : ''), 'Last check', 'Next due', 'Proof'], checks) +
      (proofs.length ? '<p class="small">Proof on file: ' + proofs.map(x => esc(CHECK_LABEL[x.check] || x.check) + ' ' + day(x.checked_on || x.date_found)).join(' · ') + '</p>' : '')),
    S(3, 'Hiring papers', 'federal I-9, payroll for the consumer', !has(/I-9/), tbl(['Paper', 'On file'], papers.map(([k, v]) => [esc(k), v]))),
    S(4, 'Orientation', '(5)(B), (5)(A)2', !!vid, tbl(['Topic', 'Done'], orient.map(([k, v]) => [esc(k), v]))),
    S(5, 'Work history', '(10): records of service delivery', true, tbl(['Consumer', 'First shift', 'Last shift', 'Hours this month', 'Shifts fixed by hand'],
      [[esc((w && w.consumers.join(' and ')) || a.consumer || p.consumer_name || ''), day(first), day(w && w.last), w && w.hours ? String(w.hours) : '0', String(fixes.length) + (fixes.length ? ' (' + fixes.filter(x => x.formReceived === 'yes').length + ' with signed forms)' : '')]])),
    S(6, 'Ending', 'the consumer decides', true, ends.length ? tbl(['Ended', 'Why and how', 'What the consumer said'], ends.map(e => [day(e.on), esc(endWords(e)), esc(e.said || '')])) : '<p>Still working.</p>')
  ];
  const done = sec.filter(x => x.includes('chip ok')).length;
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Attendant file, ' + esc(name) + '</title><style>' +
    '@page{margin:16mm}body{font-family:Poppins,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:12px;line-height:1.5;color:#1d2a36;max-width:900px;margin:0 auto;padding:24px}' +
    'h1{font-family:Fraunces,Georgia,serif;font-size:28px;margin:2px 0;color:#0D365F}.kicker{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0f5f61}' +
    '.sub{color:#55606b;font-size:12px}section{border-top:1px solid #dfe6ec;padding:14px 0 6px;page-break-inside:avoid}' +
    'h2{font-size:14.5px;color:#0D365F;margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.n{width:22px;height:22px;border-radius:50%;background:#e3f1f0;display:inline-flex;align-items:center;justify-content:center;font-size:11px}' +
    '.cite{font-weight:400;font-size:11px;color:#55606b}.chip{margin-left:auto;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 9px}.ok{background:#e7f5ee;color:#1f6b45}.miss{background:#fdecea;color:#a3201a}' +
    'table{border-collapse:collapse;width:100%;margin:4px 0 6px}th,td{border-bottom:1px solid #eef2f5;padding:5px 7px;text-align:left;vertical-align:top}thead th{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#55606b;border-bottom:1.5px solid #dfe6ec}' +
    '.none{color:#a3201a;font-style:italic}.small{font-size:11px;color:#55606b}.gap{background:#fdecea;border-radius:8px;padding:12px 14px;margin:14px 0}.allok{background:#e7f5ee;color:#1f6b45;border-radius:8px;padding:12px 14px;margin:14px 0}' +
    '.foot{margin-top:18px;padding-top:10px;border-top:1.5px solid #0D365F;color:#55606b;font-size:10.5px}@media print{.noprint{display:none}}</style></head><body>' +
    '<div class="noprint" style="background:#0D365F;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span>Print, or choose <strong>Save as PDF</strong> in the print window.</span>' +
    '<button onclick="window.print()" style="background:#54bdb8;color:#08343a;border:0;border-radius:6px;padding:9px 18px;font-weight:700;cursor:pointer">Print or save as PDF</button></div>' +
    '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><div class="kicker">Attendant file</div><h1>' + esc(name) + '</h1>' +
    '<div class="sub">' + [a.consumer || p.consumer_name ? 'Attendant for ' + esc(a.consumer || p.consumer_name) : '', a.hiredate ? 'hired ' + day(a.hiredate) : '', a.status === 'inactive' ? 'No longer working' : 'Working'].filter(Boolean).join(' · ') + '</div></div>' +
    '<div class="sub" style="text-align:right"><b style="color:#0D365F">' + esc(company) + '</b><br>Employee of the consumer, never of the vendor<br>Printed ' + day(isoLocal(now)) + (printedBy ? ' by ' + esc(printedBy) : '') + '</div></div>' +
    '<p class="sub" style="margin-top:10px"><b>' + done + ' of ' + sec.length + '</b> sections complete. Kept 6 years, per 19 CSR 15-8.400(10).</p>' +
    (gaps.length ? '<div class="gap"><b style="color:#a3201a">Gaps in this file</b><ul>' + gaps.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '<div class="allok"><b>No gaps found against 19 CSR 15-8.400 for this attendant.</b></div>') +
    sec.join('') + '<div class="foot">' + esc(company) + ' · ' + esc(name) + '. The signed forms and check PDFs named here open from the attendant’s profile in the hub. No SSN or birth date is printed.</div></body></html>';
}

export function mountHubPacket(el, opts) {
  const { api } = opts;
  const roster = () => (opts.roster ? opts.roster() : []).filter(a => a.status !== 'inactive');
  const autoOig = id => { const p = opts.oigPeople && (opts.oigPeople() || {})['attendant:' + id];
    return p && (p.result === 'clear' || p.review === 'not_them') && p.checked_at
      ? new Date(p.checked_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : null; };   // the Central day, not the UTC one
  const ended = () => (opts.roster ? opts.roster() : []).filter(a => a.status === 'inactive');
  // Tabs (her ask 2026-10-22): Onboarding / Working / Inactive. Opens on Onboarding when someone is in it.
  let list = [], open = null, err = '', tab = null, query = '';
  if (!document.getElementById('hp_css')) { const s = document.createElement('style'); s.id = 'hp_css'; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add('hp');
  el.addEventListener('click', onClick);
  // Find by name (her ask 2026-10-23): searches every tab at once.
  el.addEventListener('input', e => { if (e.target.id !== 'hp_find') return; query = e.target.value; const pos = e.target.selectionStart; draw();
    const i = el.querySelector('#hp_find'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* not a text input */ } } });
  load();

  async function load() {
    el.innerHTML = '<div class="small" style="padding:12px">Loading attendants…</div>';
    try {
      list = (await api('packetList')).attendants || []; err = '';
      // Anyone not active yet: their steps for the track (a handful of people at most).
      await Promise.all(list.filter(a => !a.active).map(async a => {
        try { const g = await api('packetGet', { pool_id: a.pool_id }); a.steps = g.status.steps; a.updated_at = g.packet.updated_at; } catch (e) { /* the row still shows, without the track */ }
      }));
    } catch (e) { list = []; err = e.message; }
    draw();
  }
  const groups = () => buildGroups({ packets: list, roster: roster(), ended: ended(), autoOig, wellsky: opts.wellsky ? opts.wellsky() : null });
  function rowHtml(x) {
    const edge = x.flag && x.flag.tone === 'r' || x.waiting ? ' style="border-left:5px solid #b42318"' : '';
    const track = x.track ? `<div class="track" aria-label="Step ${Math.min(x.track.at + 1, 7)} of 7">${x.track.steps.map((s, i) => `<i class="${s.done ? 'd' : i === x.track.at ? 'n' : ''}" title="${esc(s.label)}"></i>`).join('')}</div>
      <span class="meta"><b class="stepname">Step ${Math.min(x.track.at + 1, 7)} of 7: ${esc((x.track.steps[x.track.at] || x.track.steps[6]).label)}</b>${x.flag ? ` <span class="pill ${x.flag.tone}">${esc(x.flag.text)}</span>` : ''}</span>` : x.flag ? `<span class="meta"><span class="pill ${x.flag.tone}">${esc(x.flag.text)}</span></span>` : '';
    return `<button class="row" data-open="${x.kind}:${esc(x.id)}"${edge}><b>${esc(x.name)}</b><span class="pill ${x.tone}">${esc(x.label)}</span><span class="meta">${esc(x.meta)}</span>${track}</button>`;
  }
  function draw() {
    if (open) return;
    const g = groups(), t = g.tiles, ws = g.wellsky;
    if (!tab) tab = g.starting.length ? 'onboarding' : 'working';
    const asOf = ws.asOf ? new Date(ws.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : '';
    const hoursNote = ws.hoursAsOf && ws.asOf && ws.hoursAsOf.slice(0, 10) !== ws.asOf.slice(0, 10)
      ? '; hours this month as of ' + shortDay(new Date(ws.hoursAsOf).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })) : '';
    const tabBtn = (k, label, n) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${label} (${n})</button>`;
    const endedRow = x => `<div class="row" style="cursor:default"><b>${esc(x.name)}</b><button class="btn o" data-reactivate="${esc(x.id)}">Make active again</button><span class="meta">${esc(x.meta)}</span>${x.said ? `<span class="meta">The consumer said: "${esc(x.said)}"</span>` : ''}</div>`;
    let body;
    const words = query.toLowerCase().replace(/[’']/g, '').split(/[\s,]+/).filter(Boolean);
    const hit = x => words.every(w => (x.name + ' ' + (x.meta || '')).toLowerCase().replace(/[’']/g, '').includes(w));
    if (words.length) {
      const found = [...g.starting.map(x => ({ ...x, where: 'Onboarding' })), ...g.working.map(x => ({ ...x, where: 'Working' })),
        ...g.quiet.map(x => ({ ...x, where: 'Not working lately' }))].filter(hit);
      const gone = g.ended.filter(hit);
      body = `<div class="ghead"><span>${found.length + gone.length} found on every tab</span></div>
        ${found.map(x => rowHtml({ ...x, meta: x.where + (x.meta ? ' · ' + x.meta : '') })).join('')}
        ${gone.map(endedRow).join('')}
        ${found.length + gone.length ? '' : '<p class="small">Nobody matches. Try fewer letters.</p>'}`;
    } else if (tab === 'onboarding') body = `<div class="ghead"><span>Consumer waiting goes first</span></div>
      ${g.starting.length ? g.starting.map(rowHtml).join('') : '<p class="small">Nobody is onboarding. New attendants start at caringcds.com/apply; you get an alert when they sign Step 1.</p>'}`;
    else if (tab === 'working') body = `<div class="ghead"><span>${ws.have ? 'Shift in WellSky in the last ' + WORKING_DAYS + ' days. WellSky ' + esc(asOf) + esc(hoursNote) : 'WellSky has not sent anything yet, so everyone shows here'}</span>
        <span>${t.due ? `<span class="pill r">${t.due} check due or overdue</span> ` : ''}${t.dates ? `<span class="pill y">${t.dates} with check dates to add</span>` : ''}</span></div>
      ${g.working.length ? g.working.map(rowHtml).join('') : '<p class="small">Nobody yet.</p>'}`;
    else body = `<section class="grp" style="margin-top:4px"><div class="ghead"><h3>Not working lately</h3><span>No WellSky shift in ${WORKING_DAYS} days. Rechecks continue until you mark them no longer working.</span></div>
      ${g.quiet.length ? g.quiet.map(rowHtml).join('') : '<p class="small">Nobody.</p>'}</section>
      <section class="grp"><div class="ghead"><h3>No longer working</h3><span>Marked no longer working. No rechecks.</span></div>
      ${g.ended.length ? g.ended.map(endedRow).join('') : '<p class="small">Nobody.</p>'}</section>`;
    el.innerHTML = `<div class="hp-head"><h2>Attendants</h2><div class="btns" style="margin:0"><button class="btn o" data-act="ghl-import">Bring in papers and checks from GHL</button><button data-act="reload" class="pill-btn">Refresh</button></div></div>
      <label style="display:flex;align-items:center;gap:8px;max-width:380px;margin:8px 0 0;padding:0 14px;min-height:42px;background:#fff;border:2px solid #dfe6ec;border-radius:999px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#55677a" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="hp_find" value="${esc(query)}" placeholder="Find an attendant or consumer by name" aria-label="Find an attendant or consumer by name" style="border:0;outline:0;font:inherit;font-size:14.5px;flex:1;min-width:0;background:transparent"></label>
      <div class="hp-tabs" role="tablist">${tabBtn('onboarding', 'Onboarding', g.starting.length)}${tabBtn('working', 'Working', g.working.length)}${tabBtn('inactive', 'Inactive', g.quiet.length + g.ended.length)}</div>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
      ${body}
      <p class="small" style="margin-top:12px">New attendants apply at <b>caringcds.com/apply</b>. Rechecks: OIG every month (runs by itself), EDL every 3 months, FCSR every year.</p>`;
  }

  // Check PDFs from GHL: copied into the hub, dates read from each PDF, the office reviews and saves.
  async function openImport(note) {
    open = { kind: 'import' };
    el.innerHTML = '<button class="pill-btn" data-act="back">← All attendants</button><div class="card"><h2>Papers and checks from GHL</h2><p class="small">Copying each attendant\'s application, onboarding papers and FCSR, EDL and OIG files from GHL. This can take a few minutes.</p></div>';
    let r;
    try { r = await api('rosterProofScan'); } catch (e) { open = { kind: 'import' }; el.querySelector('.card').insertAdjacentHTML('beforeend', `<div class="err">${esc(e.message)}</div>`); return; }
    open = { kind: 'import', r };
    const byAtt = {};
    const checks = r.items.filter(x => IS_CHECK(x.check)), papers = r.items.filter(x => !IS_CHECK(x.check));
    for (const x of checks) (byAtt[x.attendant_id] = byAtt[x.attendant_id] || []).push(x);
    const cur = Object.fromEntries((r.roster || []).map(a => [a.id, a]));
    const blank = checks.filter(x => !(x.checked_on || x.date_found)).length;
    const paperBy = {};
    for (const x of papers) (paperBy[x.name] = paperBy[x.name] || []).push(x);
    const paperList = Object.keys(paperBy).sort().map(n => `<li><b>${esc(n)}</b>: ${paperBy[n].map(x => esc(CHECK_LABEL[x.check]) + ' ' + paperLink(x)).join(' · ')}</li>`).join('');
    const noApp = (r.roster || []).filter(a => !papers.some(x => x.attendant_id === a.id && x.check === 'application') && !r.skipped.some(k => k.attendant_id === a.id && /No GHL contact/.test(k.why)));
    const rows = Object.entries(byAtt).sort((x, y) => x[1][0].name.localeCompare(y[1][0].name)).map(([id, xs]) => xs
      .sort((a, b) => ['fcsr', 'edl', 'oig'].indexOf(a.check) - ['fcsr', 'edl', 'oig'].indexOf(b.check) || String(a.checked_on || a.date_found || '9999').localeCompare(String(b.checked_on || b.date_found || '9999')))
      .map((x, i) => `<tr>${i ? '<td></td>' : `<td><b>${esc(x.name)}</b></td>`}<td><b>${CHECK_LABEL[x.check]}</b></td>
        <td>${paperLink(x)}${x.ghl_result ? `<div class="small">GHL: ${esc(x.ghl_result.replace(/^[^A-Za-z]+/, ''))}</div>` : ''}</td>
        <td><input type="date" data-proof="${esc(x.id)}" value="${esc(x.checked_on || x.date_found || '')}" max="${isoLocal(new Date())}" aria-label="${CHECK_LABEL[x.check]} date for ${esc(x.name)}">
        ${x.checked_on ? '<div class="small">Saved</div>' : x.date_found ? '<div class="small">From the PDF</div>' : '<div><span class="pill y">Open the PDF, type the date</span></div>'}
        ${cur[id] && cur[id][PROOF_FIELD[x.check]] ? `<div class="small">On the Roster: ${esc(fmtD(cur[id][PROOF_FIELD[x.check]]))}</div>` : ''}</td></tr>`).join('')).join('');
    el.innerHTML = `<button class="pill-btn" data-act="back">← All attendants</button>
      <div class="card"><h2>Papers and checks from GHL</h2>
      <p class="small">Copied from each attendant's GHL contact (the Upload boxes and the Documents panel) and kept in the hub. ID photos, Social Security cards and E-Verify stay in GHL only. Nothing in GHL changes.</p>
      <h3>Checks</h3>
      <p class="small">The date is the day the PDF was saved, which is the day the search was run (or the day it was put in GHL, when the PDF has no date). Open any that look wrong, fix the date, then save.</p>
      ${checks.length ? `<table><thead><tr><th>Attendant</th><th>Check</th><th>File</th><th>Date of the check</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No check files found in GHL.</p>'}
      <h3>Application and onboarding papers</h3>
      ${paperList ? `<ul>${paperList}</ul>` : '<p class="small">None found in GHL.</p>'}
      ${noApp.length ? `<p class="small">No application found in GHL for: ${noApp.map(a => esc(a.name)).join(', ')}.</p>` : ''}
      ${r.skipped.length ? `<h3>Not brought in</h3><ul>${r.skipped.map(x => `<li><b>${esc(x.name)}</b>: ${esc(x.why)}</li>`).join('')}</ul>` : ''}
      ${checks.length ? `<div class="btns"><button class="btn" data-act="ghl-save">Save check dates</button></div>
      <p class="small">${blank ? blank + (blank === 1 ? ' file has' : ' files have') + ' no date in the PDF. Those are skipped until you type the date. ' : ''}Each attendant's Roster date moves to the newest check, never back, so their recheck dates show on their card.</p>` : ''}
      <div class="err" id="hp_err"></div>${note ? `<div class="ok">${esc(note)}</div>` : ''}</div>`;
  }

  // One signed form, as they signed it (her ask 2026-10-22: View and Print on the profile).
  async function openForm(poolId, form, print) {
    el.innerHTML = '<div class="small" style="padding:12px">Loading the signed form…</div>';
    let f;
    try { f = await api('packetFormView', { pool_id: poolId, form }); } catch (e) { return openPacket(poolId); }
    open = { kind: 'form', id: poolId };
    const when = d => d ? new Date(d).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' Central' : '';
    const note = f.wording === 'exact' ? '' : f.wording === 'names_changed'
      ? '<p class="small"><b>Note:</b> a name in this form changed after it was signed, so the wording below has today\'s names. Version and fingerprint are what they signed.</p>'
      : '<p class="small"><b>Note:</b> this form was signed on version ' + esc(f.version) + ', and the wording has changed since. Their answers and signature below are exactly as signed.</p>';
    el.innerHTML = `<div class="hp-noprint btns" style="margin:0 0 8px"><button class="pill-btn" data-act="form-back">← Back to ${esc(f.attendant)}</button><button class="btn" data-act="form-print">Print</button></div>
      <article class="card hp-print">
      <div class="small">${esc(f.company)}</div>
      <h2>${esc(f.title)}</h2>
      <dl><dt>Attendant</dt><dd>${esc(f.attendant)}</dd>${f.consumer ? `<dt>Consumer</dt><dd>${esc(f.consumer)}</dd>` : ''}</dl>
      ${note}
      ${f.blocks.map(b => b.h ? `<h3>${esc(b.h)}${f.initials && f.initials[b.h.split('.')[0]] ? ` <span class="pill b">Initialed ${esc(f.initials[b.h.split('.')[0]])}</span>` : ''}</h3>` : `<p>${esc(b.p)}</p>`).join('')}
      ${f.answers.map(sec => `<h3>${esc(sec.h)}</h3><dl>${sec.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`).join('')}
      <h3>Signature</h3>
      <dl><dt>Signed by</dt><dd style="font-family:'Brush Script MT',cursive;font-size:22px">${esc(f.signed_name)}</dd>
      <dt>Signed</dt><dd>${esc(when(f.signed_at))}</dd>
      <dt>How</dt><dd>Typed name, electronic signature (they agreed to sign electronically first)</dd>
      ${f.signed_ip ? `<dt>From</dt><dd>${esc(f.signed_ip)}${f.signed_agent ? '<div class="small">' + esc(f.signed_agent) + '</div>' : ''}</dd>` : ''}
      ${f.countersigned_at ? `<dt>Countersigned</dt><dd>${esc(f.countersigned_name)}, ${esc(when(f.countersigned_at))}</dd>` : ''}
      <dt>Form version</dt><dd>${esc(f.version)}<div class="small">Fingerprint ${esc(String(f.fingerprint || '').slice(0, 16))}…</div></dd></dl>
      </article>`;
    el.scrollIntoView({ block: 'start' });
    if (print) setTimeout(() => window.print(), 150);
  }

  async function openPacket(id) {
    el.innerHTML = '<div class="small" style="padding:12px">Loading…</div>';
    let g;
    try { g = await api('packetGet', { pool_id: id }); } catch (e) { open = null; err = e.message; draw(); return; }
    open = { kind: 'packet', id, g };
    const st = g.status, p = g.packet;
    const nextCls = st.tone === 'r' ? 'r' : st.tone === 'y' ? 'y' : st.tone === 'g' ? 'g' : 'b';
    const nowKey = (st.steps.find(s => !s.done) || {}).key;
    const checks = (g.screening.checks || []);
    el.innerHTML = `<div class="btns" style="margin:0"><button class="pill-btn" data-act="back">← All attendants</button><button class="btn o" data-act="file">Print attendant file</button></div>
      <div class="card"><h2>${esc(g.pool.first + ' ' + g.pool.last)}</h2><span class="pill ${st.tone}">${esc(st.label)}</span>
      <div class="next ${nextCls}"><b>Next:</b> ${esc(st.next)}</div>
      <dl><dt>Phone</dt><dd>${esc(g.pool.phone)}</dd><dt>Email</dt><dd>${esc(g.pool.email)}</dd><dt>Works for</dt><dd>${esc(p.consumer_name || '')}</dd>
      <dt>Caregiver list</dt><dd>${p.list_choice === 'join' ? 'Yes, wants to be listed' : 'No, works for their consumer only'}</dd></dl>

      <h3>Onboarding</h3><ol class="steps">${st.steps.map(s => `<li class="${s.done ? 'done' : s.key === nowKey ? 'now' : ''}"><div><b>${esc(s.label)}</b><span>${esc(s.who)}${s.detail ? ' · ' + esc(s.detail) : ''}</span></div></li>`).join('')}</ol>

      <h3>Background checks</h3>
      <table><thead><tr><th>Check</th><th>Result</th><th>Done</th><th></th></tr></thead><tbody>
      <tr><td><b>FCSR</b></td><td>${g.screening.findings ? 'Findings' : (g.screening.missing || []).some(m => /FCSR|Registration/.test(m)) ? 'Not finished' : 'Clear'}</td><td></td><td><button class="btn o" data-act="match">Record in Caregiver Match</button></td></tr>
      ${checks.map(c => `<tr><td><b>${esc(CHECK_NAMES[c.key] || c.label)}</b></td><td>${c.clear ? 'Clear' : c.result === 'not_clear' ? 'Not clear' : 'To run'}</td><td>${esc(fmtD(c.at))}</td>
        <td>${c.clear || c.key === 'id_match' || c.key === 'age18' ? '' : `<button class="btn o" data-clear="${c.key}">Clear: add screenshot</button>`}</td></tr>`).join('')}
      </tbody></table>
      <input type="file" id="hp_proof" accept="image/*,application/pdf" hidden>
      <p class="small">Clear: pick the screenshot or PDF of the search result, and it is recorded as clear today with that proof. Age 18 records itself from the date of birth. The ID match is recorded by the 5-minute ID check below. FCSR registration and result need the proof upload in Caregiver Match.</p>
      <div class="btns"><button class="btn o" data-copy="fcsr">Copy for FCSR</button><button class="btn o" data-copy="edl">Copy for EDL</button><button class="btn o" data-act="ssn">Show SSN for the FCSR request</button></div>
      <div id="hp_copy"></div>

      <h3>Office steps</h3>
      <div class="btns">
        <button class="btn o" data-copy="empeon">Copy for Empeon</button>
        ${p.empeon_invited_at ? `<span class="pill g">Empeon invite sent ${esc(fmtD(p.empeon_invited_at))}</span>` : '<button class="btn" data-mark="empeon_invited">Empeon invite sent</button>'}
        ${p.id_checked_at ? `<span class="pill g">ID seen ${esc(fmtD(p.id_checked_at))}</span>` : st.checksClear ? `<button class="btn" data-mark="id_checked">ID seen on the video call</button>` : ''}
        ${p.i9_done_at ? `<span class="pill g">I-9 done ${esc(fmtD(p.i9_done_at))}</span>` : p.id_checked_at ? '<button class="btn" data-mark="i9_done">I-9 Section 2 done in Empeon</button>' : ''}
      </div>
      ${g.forms.contract && !g.forms.contract.countersigned_at ? `<div class="copy"><b>Countersign the Attendant Care Contract</b><div><input type="text" id="hp_cs" placeholder="Type your full name"><button class="btn" data-act="countersign">Countersign</button></div></div>` : ''}
      ${p.list_choice === 'join' ? `<p class="small">Their caregiver profile is in Caregiver Match. Approve it there (one tap) once their checks are clear.</p>` : ''}

      <h3>Signed forms</h3>
      ${Object.keys(g.forms).length ? `<table><tbody>${Object.entries(g.forms).map(([k, f]) => `<tr><td><b>${esc(f.title)}</b><div class="small">${esc(f.signed_name)}, ${esc(fmtD(f.signed_at))}${f.countersigned_at ? ' · countersigned by ' + esc(f.countersigned_name) : ''}</div></td>
        <td style="white-space:nowrap"><button class="btn o" data-form="${esc(k)}">View</button> <button class="btn o" data-form="${esc(k)}" data-print="1">Print</button></td></tr>`).join('')}</tbody></table>` : '<p class="small">None yet.</p>'}
      <div class="cds-comm-history" data-refs="pool:${esc(id)}" data-phones="${esc(g.pool.phone || '')}"></div>
      <div class="err" id="hp_err"></div></div>`;
    if (window.cdsCommHistory) window.cdsCommHistory(el);
  }
  function openRosterCard(id, note) {
    const a = roster().find(x => x.id === id); if (!a) { open = null; draw(); return; }
    open = { kind: 'roster', id };
    const d = rosterDue(a, autoOig(a.id));
    const ws = wellskyByAttendant(opts.wellsky ? opts.wellsky() : null), w = ws.by[nameKey(a.wellskyName || a.name)];
    const field = { EDL: 'edlDate', FCSR: 'fcsrDate', OIG: 'leieDate' };
    el.innerHTML = `<div class="btns" style="margin:0"><button class="pill-btn" data-act="back">← All attendants</button><button class="btn o" data-act="file">Print attendant file</button></div>
      <div class="card"><h2>${esc(a.name)}</h2><span class="pill ${d.tone}">${esc(d.label)}</span>
      <dl><dt>Works for</dt><dd>${esc((w && w.consumers.join(' and ')) || a.consumer)}</dd>
      <dt>First day of work</dt><dd>${w && w.first ? esc(fmtD(w.first)) + ' <span class="small">(first care log in WellSky)</span>' : '<span class="small">Not in WellSky yet. It comes from the daily First and Last Carelog email.</span>'}</dd>
      <dt>In WellSky</dt><dd>${w && w.last ? 'Last shift ' + esc(fmtD(w.last)) + (w.hours ? ' · ' + w.hours + ' hrs this month' : '') : ws.have ? 'No shifts in the WellSky reports' : 'WellSky has not sent anything yet'}</dd>
      ${[['Phone', a.phone], ['Email', a.email], ['Hired', fmtD(a.hiredate)], ['FCSR number', a.fcsrNum], ['Empeon', a.empeon], ['Contract', a.contract], ['EVV', a.evv]]
        .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <h3>Rechecks</h3>
      <table><thead><tr><th>Check</th><th>Last done</th><th>Next due</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr><td><b>${r.k}</b></td><td>${r.auto ? esc(fmtD(r.done)) + ' <span class="small">(ran by itself)</span>'
        : `<input type="date" id="hp_${field[r.k]}" value="${esc(r.done || '')}" max="${isoLocal(new Date())}" aria-label="${r.k} last done">`}</td>
        <td>${r.due ? `<span class="pill ${r.tone}">${esc(fmtD(r.due))}</span>` : '<span class="small">Add the date it was last done</span>'}</td></tr>`).join('')}
      </tbody></table>
      <div class="btns"><button class="btn" data-act="dates">Save dates</button></div>
      <p class="small">OIG every month (runs by itself), EDL every 3 months, FCSR every year. Use the date on the search result you have on file.</p>
      <div class="err" id="hp_err"></div>${note ? `<div class="ok">${esc(note)}</div>` : ''}
      <h3>Papers and proof on file</h3>
      <div id="hp_proofs" class="small">Loading…</div>
      <div class="copy"><b>Add a recheck</b>
        <div><select id="hp_pk" aria-label="Which check"><option value="edl">EDL</option><option value="fcsr">FCSR</option><option value="oig">OIG</option></select>
        <input type="date" id="hp_pd" value="${isoLocal(new Date())}" max="${isoLocal(new Date())}" aria-label="Day the check was run">
        <button class="btn" data-act="proof-add">Clear: add the PDF or screenshot</button></div>
        <p class="small">Only for a clear result. If a search finds something, call Samantha before anything else.</p></div>
      <div class="copy"><b>Add a paper</b>
        <div><select id="hp_ak" aria-label="Which paper"><option value="application">Application packet</option><option value="onboarding">Onboarding papers</option></select>
        <button class="btn o" data-act="paper-add">Add the PDF</button></div>
        <p class="small">For a packet signed in GHL: open Documents &amp; Contracts in GHL, find it under Completed, press the ⋮ menu, Download PDF, then add it here.</p></div>
      <input type="file" id="hp_proof" accept="image/*,application/pdf" hidden>
      <h3>Not working anymore?</h3>
      <div id="hp_leave"><div class="btns"><button class="btn o" data-act="leave">No longer working</button></div>
      <p class="small">Moves them off this list and stops their rechecks. You can make them active again on the old Roster.</p></div>
      <div class="cds-comm-history" data-refs="attendant:${esc(a.id)}" data-phones="${esc(a.phone || '')}"></div></div>`;
    if (window.cdsCommHistory) window.cdsCommHistory(el);
    loadProofs(a.id);
  }
  // Print attendant file: from either view, joined with the other by name.
  async function printFile(b) {
    const w = window.open('', '_blank');
    if (!w) return alert('Your browser blocked the pop-up. Allow pop-ups for this site and try again.');
    w.document.write('<p style="font-family:sans-serif;padding:24px">Putting the file together…</p>');
    b.disabled = true;
    try {
      let packet = open.kind === 'packet' ? open.g : null, name = packet ? packet.pool.first + ' ' + packet.pool.last : '';
      let ros = open.kind === 'roster' ? (opts.roster ? opts.roster() : []).find(x => x.id === open.id) : null;
      if (ros) name = ros.name;
      if (!ros) ros = (opts.roster ? opts.roster() : []).find(x => nameKey(x.name) === nameKey(name)) || null;
      if (!packet) { const hit = list.find(x => nameKey(x.name) === nameKey(name)); if (hit) packet = await api('packetGet', { pool_id: hit.pool_id }); }
      let proofs = [];
      if (ros) proofs = (await api('rosterProofList', { attendant_id: ros.id })).items || [];
      const html = attendantFileHtml({ name, roster: ros, packet, proofs, wellsky: opts.wellsky ? opts.wellsky() : null, autoOig: ros ? autoOig(ros.id) : null,
        corrections: opts.corrections ? opts.corrections() : [], printedBy: opts.who ? String(opts.who()).split('@')[0] : '' });
      w.document.open(); w.document.write(html); w.document.close();
    } catch (e) { w.document.open(); w.document.write('<p style="font-family:sans-serif;padding:24px;color:#a3201a">The file could not be put together: ' + esc(e.message) + '</p>'); w.document.close(); }
    b.disabled = false;
  }
  async function loadProofs(id) {
    const box = el.querySelector('#hp_proofs'); if (!box) return;
    try {
      const { items: got } = await api('rosterProofList', { attendant_id: id });
      // Her ask 2026-10-22: the pre-hire check on top, its rechecks under it (oldest first).
      const ORDER = ['application', 'onboarding', 'fcsr', 'edl', 'oig'], when = x => x.checked_on || x.date_found || '9999';
      const items = got.slice().sort((a, b) => ORDER.indexOf(a.check) - ORDER.indexOf(b.check) || when(a).localeCompare(when(b)));
      if (!open || open.id !== id) return;
      box.innerHTML = items.length ? `${items.some(x => x.check === 'application') ? '' : '<p>No application on file. Bring it in from GHL, or add the PDF below.</p>'}<table><tbody>${items.map(x => `<tr><td><b>${CHECK_LABEL[x.check]}</b>${IS_CHECK(x.check) ? `<div class="small">${items.findIndex(y => y.check === x.check) === items.indexOf(x) ? 'Pre-hire' : 'Recheck'}</div>` : ''}</td><td>${esc(fmtD(x.checked_on || x.date_found) || (IS_CHECK(x.check) ? 'No date yet' : ''))}</td>
        <td>${paperLink(x)}</td><td>${x.source === 'ghl' ? 'From GHL' : 'Added in the hub'}</td></tr>`).join('')}</tbody></table>`
        : '<p>No proof in the hub yet.</p><div class="btns"><button class="btn" data-act="ghl-import">Bring in papers and checks from GHL</button></div><p>This brings in everyone\'s application, onboarding papers and FCSR, EDL and OIG PDFs at once. Or add a recheck below.</p>';
    } catch (e) { box.textContent = 'Proof could not load: ' + e.message; }
  }

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const errEl = () => el.querySelector('#hp_err');
    const fail = m => { const x = errEl(); if (x) x.textContent = m; else alert(m); };
    try {
      if (b.dataset.tab) { tab = b.dataset.tab; draw(); return; }
      if (b.dataset.reactivate) {
        // The end record is kept (pastEnds), never thrown away.
        const a = (opts.roster ? opts.roster() : []).find(x => x.id === b.dataset.reactivate) || {};
        await opts.saveRoster(b.dataset.reactivate, { status: 'active', ended: null, pastEnds: [...(a.pastEnds || []), ...(a.ended ? [a.ended] : [])] });
        draw(); return;
      }
      if (b.dataset.open) { const [k, id] = b.dataset.open.split(':'); return k === 'packet' ? openPacket(id) : openRosterCard(id); }
      const act = b.dataset.act;
      if (act === 'reload') return load();
      if (act === 'back') { open = null; return load(); }
      if (act === 'roster') return opts.openRoster && opts.openRoster(open.id);
      if (act === 'dates') {
        const patch = {};
        for (const k of ['edlDate', 'fcsrDate', 'leieDate']) { const i = el.querySelector('#hp_' + k); if (i) patch[k] = i.value || ''; }
        if (Object.values(patch).some(v => v && v > isoLocal(new Date()))) return fail('A check date cannot be in the future.');
        await opts.saveRoster(open.id, patch);
        return openRosterCard(open.id, 'Saved.');
      }
      // Her rule 2026-10-22: the consumer is the employer, so ending an attendant needs a record of
      // how the consumer told us (their words, or the text or email pasted in), on what day, and who took it.
      if (act === 'leave') {
        const a = roster().find(x => x.id === open.id);
        el.querySelector('#hp_leave').innerHTML = `<div class="ask"><b>Mark ${esc(a ? a.name : 'them')} as no longer working</b>
          <p class="small">The consumer is the employer, so we need their decision on record. Their rechecks stop and they move to Inactive.</p>
          <dl><dt>Why</dt><dd><select id="hp_why"><option value="">Pick one</option>${END_WHY.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></dd>
          <dt>How the consumer told us</dt><dd><select id="hp_how"><option value="">Pick one</option>${END_HOW.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></dd>
          <dt>Date they told us</dt><dd><input type="date" id="hp_on" value="${isoLocal(new Date())}" max="${isoLocal(new Date())}"></dd>
          <dt>What the consumer said</dt><dd><textarea id="hp_said" rows="3" style="width:100%;font:inherit;padding:7px 9px;border:2px solid #dfe6ec;border-radius:8px" placeholder="Their words from the call, or paste the text or email"></textarea></dd></dl>
          <div class="btns"><button class="btn bad" data-act="leave-yes">Save and mark no longer working</button><button class="btn o" data-act="leave-no">Keep them</button></div><div class="err" id="hp_leave_err"></div></div>`;
        return;
      }
      if (act === 'leave-no') return openRosterCard(open.id);
      if (act === 'leave-yes') {
        const v = id => (el.querySelector('#' + id) || {}).value || '';
        const rec = endRecord({ why: v('hp_why'), how: v('hp_how'), on: v('hp_on'), said: v('hp_said'), by: opts.who ? opts.who() : '' });
        if (rec.error) { el.querySelector('#hp_leave_err').textContent = rec.error; return; }
        await opts.saveRoster(open.id, { status: 'inactive', ended: rec.record }); open = null; tab = 'inactive'; return draw();
      }
      if (act === 'ghl-import') return openImport();
      if (act === 'file') return printFile(b);
      if (b.dataset.form) return openForm(open.id, b.dataset.form, !!b.dataset.print);
      if (act === 'form-back') return openPacket(open.id);
      if (act === 'form-print') return window.print();
      if (act === 'ghl-save') {
        const items = [...el.querySelectorAll('input[data-proof]')].filter(i => i.value).map(i => ({ id: i.dataset.proof, checked_on: i.value }));
        if (!items.length) return fail('Type at least one date.');
        if (items.some(x => x.checked_on > isoLocal(new Date()))) return fail('A check date cannot be in the future.');
        b.disabled = true; b.textContent = 'Saving…';
        await api('rosterProofConfirm', { items });
        const byId = Object.fromEntries(open.r.items.map(x => [x.id, x]));
        const confirmed = items.map(x => ({ ...byId[x.id], checked_on: x.checked_on }));
        const patches = proofPatches(confirmed, opts.roster ? opts.roster() : []);
        for (const p of patches) await opts.saveRoster(p.id, p.patch);
        return openImport('Saved ' + items.length + (items.length === 1 ? ' date' : ' dates') + '. ' + (patches.length ? patches.length + (patches.length === 1 ? ' attendant\'s' : ' attendants\'') + ' Roster dates moved forward.' : 'The Roster already had these dates or newer ones.'));
      }
      if (act === 'proof-add') {
        const inp = el.querySelector('#hp_proof'), key = el.querySelector('#hp_pk').value, day = el.querySelector('#hp_pd').value, id = open.id;
        if (!day || day > isoLocal(new Date())) return fail('Pick the day the check was run (not in the future).');
        inp.value = '';
        inp.onchange = async () => {
          const f = inp.files[0]; if (!f) return;
          if (f.size > 15 * 1024 * 1024) return fail('That file is too big (15 MB limit).');
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
          try {
            await api('rosterProofAdd', { attendant_id: id, check_key: key, checked_on: day, result: 'clear', proof: { mime: f.type || 'application/pdf', name: f.name, data } });
            const p = proofPatches([{ attendant_id: id, check: key, checked_on: day }], (opts.roster ? opts.roster() : []).filter(a => a.id === id))[0];
            if (p) await opts.saveRoster(id, p.patch);
            openRosterCard(id, CHECK_LABEL[key] + ' recheck saved with its proof.');
          } catch (x) { fail(x.message); }
        };
        inp.click();
        return;
      }
      if (act === 'paper-add') {
        const inp = el.querySelector('#hp_proof'), key = el.querySelector('#hp_ak').value, id = open.id;
        inp.value = '';
        inp.onchange = async () => {
          const f = inp.files[0]; if (!f) return;
          if (f.size > 15 * 1024 * 1024) return fail('That file is too big (15 MB limit).');
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
          try { await api('rosterProofAdd', { attendant_id: id, check_key: key, proof: { mime: f.type || 'application/pdf', name: f.name, data } }); openRosterCard(id, CHECK_LABEL[key] + ' added.'); }
          catch (x) { fail(x.message); }
        };
        inp.click();
        return;
      }
      if (act === 'match') return opts.openMatch && opts.openMatch();
      if (b.dataset.copy) {
        const r = await api('packetCopy', { pool_id: open.id, kind: b.dataset.copy });
        el.querySelector('#hp_copy').innerHTML = `<div class="copy"><b>For ${esc(b.dataset.copy.toUpperCase())}</b>${r.fields.map(f => `<div><span><span class="small">${esc(f.label)}:</span> <b>${esc(f.value)}</b></span>${f.value ? `<button class="btn o" data-val="${esc(f.value)}">Copy</button>` : ''}</div>`).join('')}</div>`;
        if (b.dataset.copy === 'empeon') el.querySelector('#hp_copy').scrollIntoView({ block: 'nearest' });
        return;
      }
      if (b.dataset.val != null) { try { await navigator.clipboard.writeText(b.dataset.val); b.textContent = 'Copied'; } catch { b.textContent = 'Select it'; } return; }
      if (act === 'ssn') {
        const r = await api('revealSsn', { id: open.id, reason: 'FCSR screening request' });
        b.outerHTML = `<span class="pill y" style="user-select:all">${esc(r.ssn)}</span>${r.other ? ` <span class="small">Also used:</span> <span class="pill y" style="user-select:all">${esc(r.other)}</span> <span class="small">Run FCSR and EDL on every number.</span>` : ''} <span class="small">Shown once for the FCSR request. This view is recorded.</span>`;
        return;
      }
      if (b.dataset.clear) {
        const inp = el.querySelector('#hp_proof'), key = b.dataset.clear;
        inp.value = '';
        inp.onchange = async () => {
          const f = inp.files[0]; if (!f) return;
          if (f.size > 15 * 1024 * 1024) return fail('That file is too big (15 MB limit).');
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
          try { await api('recordCheck', { id: open.id, check_key: key, result: 'clear', checked_on: isoLocal(new Date()), proof: { mime: f.type || 'image/png', data }, note: 'Recorded from Active Attendants' }); openPacket(open.id); }
          catch (x) { fail(x.message); }
        };
        inp.click();
        return;
      }
      if (b.dataset.mark) { await api('packetMark', { pool_id: open.id, what: b.dataset.mark }); return openPacket(open.id); }
      if (act === 'countersign') { await api('packetCountersign', { pool_id: open.id, typed_name: el.querySelector('#hp_cs').value }); return openPacket(open.id); }
    } catch (x) { fail(x.message || 'Something went wrong.'); }
  }
}
