// The daily attendant check against WellSky (2026-10-20, Samantha: "build the daily attendant
// check against WellSky in practice first").
//
// WellSky says who is working and for whom (the schedule report the 6:30am WellSky check already
// saves as agency_data 'wellskyCheck'.shifts). The hub's Attendants list keeps what only the hub
// has: screenings, contract, Empeon, E-Verify. This file compares the two and returns three lists:
//   1. working in WellSky, not on the Attendants list (or marked inactive there)
//   2. on the list, no shifts in WellSky in the whole report range
//   3. working for a consumer the list does not name
// Nothing here changes anything: the office clicks to add, mark inactive or update. The hub saves the
// list as one block, and a background writer could overwrite someone's edit, so changes are a person's.
//
// The hub loads this with a <script> tag; the morning email imports it. No em dashes (her rule).
(function (root) {
  'use strict';
  const DAY = 864e5;
  const STALE_HOURS = 26;
  const STILL_ACTIVE_DAYS = 30;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const short = iso => MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10));
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // "Pham, Nuong" -> "Nuong Pham"; "Nuong Pham" stays.
  function display(name) {
    const s = String(name || '').trim().replace(/\s+/g, ' ');
    const m = /^([^,]+),\s*(.+)$/.exec(s);
    return m ? m[2] + ' ' + m[1] : s;
  }
  // The words of a name, lower case, without initials or punctuation, sorted, so
  // "Smith, Mary J." and "Mary Smith" are the same person.
  function tokens(name) {
    // apostrophes are dropped (O'Brien = OBrien), so a key is only letters, spaces and hyphens
    return String(name || '').toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z\s-]/g, ' ')
      .split(/\s+/).map(t => t.replace(/^-+|-+$/g, '')).filter(t => t.length > 1);
  }
  const nameKey = name => tokens(name).slice().sort().join(' ');
  // Does a free-text field ("Huan Tran & Mary Smith") name this consumer?
  const names = (text, consumer) => { const have = new Set(tokens(text)); const want = tokens(consumer); return want.length > 0 && want.every(t => have.has(t)); };

  // Who WellSky shows working, from wellskyCheck.shifts: { from, to, at, consumers: [{ name, shifts: [{ date, attendant }] }] }
  function fromWellSky(shifts, todayIso) {
    const by = new Map();
    for (const c of (shifts && shifts.consumers) || []) {
      for (const s of c.shifts || []) {
        const k = nameKey(s.attendant);
        if (!k) continue;
        const w = by.get(k) || { key: k, raw: s.attendant, name: display(s.attendant), consumers: new Map(), last: '', next: '' };
        const cw = w.consumers.get(nameKey(c.name)) || { name: display(c.name), last: '' };
        if (s.date <= todayIso) { if (s.date > w.last) w.last = s.date; if (s.date > cw.last) cw.last = s.date; }
        else if (!w.next || s.date < w.next) w.next = s.date;
        w.consumers.set(nameKey(c.name), cw);
        by.set(k, w);
      }
    }
    return by;
  }

  // reviewed = agency_data 'attendantCheckReviewed': { [key]: { choice, until?, sig?, by, at } }
  function compare({ attendants, shifts, reviewed, now }) {
    now = now || new Date();
    const today = isoLocal(now);
    reviewed = reviewed || {};
    const out = { ok: !!(shifts && shifts.consumers), from: shifts && shifts.from, to: shifts && shifts.to, at: shifts && shifts.at,
                  stale: false, missing: [], quiet: [], different: [] };
    if (!out.ok) return out;
    out.stale = !shifts.at || (now - Date.parse(shifts.at)) > STALE_HOURS * 3600e3;
    const ws = fromWellSky(shifts, today);
    const list = attendants || [];
    const keyOf = a => nameKey(a.wellskyName || a.name);
    const byKey = new Map(list.map(a => [keyOf(a), a]));
    const hidden = (k, choice, sig) => { const r = reviewed[k]; if (!r || r.choice !== choice) return false;
      if (r.until && r.until < today) return false; if (sig !== undefined && r.sig !== sig) return false; return true; };

    for (const w of ws.values()) {
      const a = byKey.get(w.key);
      const consumers = [...w.consumers.values()].sort((x, y) => (y.last || '').localeCompare(x.last || ''));
      const lastFor = consumers.find(c => c.last) || consumers[0];
      const what = w.last ? 'worked for ' + lastFor.name + ' on ' + short(w.last) : 'is scheduled for ' + lastFor.name + ' on ' + short(w.next);
      if (!a) {
        if (!hidden('missing:' + w.key, 'not-attendant')) out.missing.push({ key: w.key, raw: w.raw, name: w.name, consumers: consumers.map(c => c.name), what, inactive: false });
        continue;
      }
      if (a.status === 'inactive') {
        out.missing.push({ key: w.key, raw: w.raw, name: a.name, id: a.id, consumers: consumers.map(c => c.name), what, inactive: true });
        continue;
      }
      const extra = consumers.filter(c => !names(a.consumer || '', c.name)).map(c => c.name);
      const sig = extra.slice().sort().join('|');
      if (extra.length && !hidden('different:' + w.key, 'leave', sig))
        out.different.push({ key: w.key, id: a.id, name: a.name, listSays: String(a.consumer || '').trim(), wellsky: consumers.map(c => c.name), extra, sig });
    }
    for (const a of list) {
      if (a.status === 'inactive') continue;
      const k = keyOf(a);
      if (!k || ws.has(k) || hidden('quiet:' + k, 'still-active')) continue;
      out.quiet.push({ key: k, id: a.id, name: a.name, since: shifts.from });
    }
    const byName = (x, y) => x.name.localeCompare(y.name);
    out.missing.sort(byName); out.quiet.sort(byName); out.different.sort(byName);
    return out;
  }

  // The same three lists as lines for the 8am email (its "Also waiting" part).
  function items(r) {
    if (!r || !r.ok) return [{ t: 'The attendant check has no WellSky schedule to compare with yet', go: 'attendants', bad: true }];
    const out = [];
    if (r.stale) out.push({ t: 'The attendant check is using an old WellSky schedule (from ' + short(String(r.at || '').slice(0, 10) || r.to) + ')', go: 'attendants', bad: true });
    if (r.missing.length) out.push({ t: plural(r.missing.length, 'attendant', 'attendants') + ' working in WellSky but not on the Attendants list', go: 'attendants', bad: true,
      people: r.missing.map(m => ({ name: m.name, why: (m.inactive ? 'marked inactive, ' : '') + m.what })) });
    if (r.quiet.length) out.push({ t: plural(r.quiet.length, 'attendant', 'attendants') + ' with no WellSky shifts since ' + short(r.from), go: 'attendants',
      people: r.quiet.map(q => ({ name: q.name, why: 'still active?' })) });
    if (r.different.length) out.push({ t: plural(r.different.length, 'attendant', 'attendants') + ' working for a consumer the list does not name', go: 'attendants',
      people: r.different.map(d => ({ name: d.name, why: 'also ' + d.extra.join(', ') })) });
    return out;
  }

  root.CDSAttendantCheck = { compare, items, display, nameKey, names, fromWellSky, STILL_ACTIVE_DAYS, short };
})(typeof globalThis !== 'undefined' ? globalThis : this);
