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

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = iso => (iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '');
const ymd = d => d.toISOString().slice(0, 10);
const addM = (iso, m) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return ymd(d); };
const CHECK_NAMES = { edl: 'EDL', edr: 'DMH EDR', oig: 'OIG', mo_medicaid: 'MO Medicaid exclusion', age18: 'Age 18+', id_match: 'ID matches (video call)' };

const CSS = `
.hp{font-family:inherit;color:#1d2a36}
.hp .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.hp .tabs button,.hp .pill-btn{border:2px solid #dfe6ec;background:#fff;color:#0D365F;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:14px}
.hp .tabs button.on{background:#0D365F;color:#fff;border-color:#0D365F}
.hp .tabs{margin:10px 0 12px}
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
  const get = raw => { const k = nameKey(raw); if (!k) return null; return by[k] || (by[k] = { key: k, name: display(raw), last: '', hours: 0, consumers: [] }); };
  const addC = (x, c) => { const n = display(c); if (n && !x.consumers.includes(n)) x.consumers.push(n); };
  const sh = w.shifts, fl = w.analytics && w.analytics.firstLast;
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

export function mountHubPacket(el, opts) {
  const { api } = opts;
  const roster = () => (opts.roster ? opts.roster() : []).filter(a => a.status !== 'inactive');
  const autoOig = id => { const p = opts.oigPeople && (opts.oigPeople() || {})['attendant:' + id];
    return p && (p.result === 'clear' || p.review === 'not_them') && p.checked_at
      ? new Date(p.checked_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : null; };   // the Central day, not the UTC one
  const ended = () => (opts.roster ? opts.roster() : []).filter(a => a.status === 'inactive');
  // Tabs (her ask 2026-10-22): Onboarding / Working / Inactive. Opens on Onboarding when someone is in it.
  let list = [], open = null, err = '', tab = null;
  if (!document.getElementById('hp_css')) { const s = document.createElement('style'); s.id = 'hp_css'; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add('hp');
  el.addEventListener('click', onClick);
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
    if (tab === 'onboarding') body = `<div class="ghead"><span>Consumer waiting goes first</span></div>
      ${g.starting.length ? g.starting.map(rowHtml).join('') : '<p class="small">Nobody is onboarding. New attendants start at caringcds.com/apply; you get an alert when they sign Step 1.</p>'}`;
    else if (tab === 'working') body = `<div class="ghead"><span>${ws.have ? 'Shift in WellSky in the last ' + WORKING_DAYS + ' days. WellSky ' + esc(asOf) + esc(hoursNote) : 'WellSky has not sent anything yet, so everyone shows here'}</span>
        <span>${t.due ? `<span class="pill r">${t.due} check due or overdue</span> ` : ''}${t.dates ? `<span class="pill y">${t.dates} with check dates to add</span>` : ''}</span></div>
      ${g.working.length ? g.working.map(rowHtml).join('') : '<p class="small">Nobody yet.</p>'}`;
    else body = `<section class="grp" style="margin-top:4px"><div class="ghead"><h3>Not working lately</h3><span>No WellSky shift in ${WORKING_DAYS} days. Rechecks continue until you mark them no longer working.</span></div>
      ${g.quiet.length ? g.quiet.map(rowHtml).join('') : '<p class="small">Nobody.</p>'}</section>
      <section class="grp"><div class="ghead"><h3>No longer working</h3><span>Marked no longer working. No rechecks.</span></div>
      ${g.ended.length ? g.ended.map(endedRow).join('') : '<p class="small">Nobody.</p>'}</section>`;
    el.innerHTML = `<div class="hp-head"><h2>Attendants</h2><button data-act="reload" class="pill-btn">Refresh</button></div>
      <div class="tabs" role="tablist">${tabBtn('onboarding', 'Onboarding', g.starting.length)}${tabBtn('working', 'Working', g.working.length)}${tabBtn('inactive', 'Inactive', g.quiet.length + g.ended.length)}</div>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
      ${body}
      <p class="small" style="margin-top:12px">New attendants apply at <b>caringcds.com/apply</b>. Rechecks: OIG every month (runs by itself), EDL every 3 months, FCSR every year.</p>`;
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
    el.innerHTML = `<button class="pill-btn" data-act="back">← All attendants</button>
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
      <dl>${Object.values(g.forms).map(f => `<dt>${esc(f.title)}</dt><dd>${esc(f.signed_name)}, ${esc(fmtD(f.signed_at))}${f.countersigned_at ? ' · countersigned by ' + esc(f.countersigned_name) : ''}</dd>`).join('') || '<dt>None yet</dt><dd></dd>'}</dl>
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
    el.innerHTML = `<button class="pill-btn" data-act="back">← All attendants</button>
      <div class="card"><h2>${esc(a.name)}</h2><span class="pill ${d.tone}">${esc(d.label)}</span>
      <dl><dt>Works for</dt><dd>${esc((w && w.consumers.join(' and ')) || a.consumer)}</dd>
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
      <h3>Not working anymore?</h3>
      <div id="hp_leave"><div class="btns"><button class="btn o" data-act="leave">No longer working</button></div>
      <p class="small">Moves them off this list and stops their rechecks. You can make them active again on the old Roster.</p></div>
      <div class="cds-comm-history" data-refs="attendant:${esc(a.id)}" data-phones="${esc(a.phone || '')}"></div></div>`;
    if (window.cdsCommHistory) window.cdsCommHistory(el);
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
