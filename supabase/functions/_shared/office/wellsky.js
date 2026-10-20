// The daily CDS check from WellSky (2026-10-19, Samantha: "build the daily CDS check in
// practice mode with the 8 hour / 2x usual long-shift rule").
//
// WellSky's Connect API is paid and not set up. Every morning a task on Samantha's Mac runs three
// WellSky reports in her logged-in Chrome (wellsky/pull.js; the third, 2026-10-20, is her saved
// Custom Report for shifts never clocked out) and posts the report text
// to the cds-wellsky server function, which reads it with this file and saves the
// result as agency_data 'wellskyCheck'. The hub page and the 8am email read it back
// with this same file, so they can never disagree.
//
// WHY: CDS attendants add their own shift on the day they work, so nothing in WellSky
// stops a consumer going over the authorization, and a shift left clocked in (13 hours
// instead of 3) was only caught at payroll.
//
// Kept on purpose: dates, clock times, hours, attendant names, authorization hours.
// Dropped on purpose: addresses, phone numbers, email addresses and task lists.
//
// The hub loads this file with a <script> tag; the server imports it. It never saves.
// No em dashes in anything a person reads (her rule).
(function (root) {
  'use strict';
  const DAY = 864e5;
  // Her rule (2026-10-19): a shift is long when it is over 8 hours, or over twice
  // what that attendant usually works for that consumer.
  const LONG_HOURS = 8;
  const LONG_FACTOR = 2;
  const MIN_HISTORY = 5;        // fewer earlier shifts than this: only the 8 hour rule applies
  const LOOKBACK_DAYS = 14;     // long shifts older than this are payroll's problem already
  const STALE_HOURS = 26;       // a daily pull older than this means the check stopped running
  const OPEN_HOURS = 12;        // still "In Progress" this long after clocking in = never clocked out
  const OPEN_REPORT = 'CDS Daily Check - Care Logs';   // her saved Custom Report (2026-10-20)
  const LOW_SHARE = 0.25;       // under a quarter used ...
  const LOW_FROM_DAY = 15;      // ... after the middle of the month
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const iso = us => { const p = us.split('/'); return p[2] + '-' + p[0] + '-' + p[1]; };
  const r2 = n => Math.round(n * 100) / 100;
  const hrs = n => { const v = r2(n); return (v === Math.round(v) ? String(Math.round(v)) : String(v)) + ' hr' + (v === 1 ? '' : 's'); };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const short = isoDate => MON[+isoDate.slice(5, 7) - 1] + ' ' + (+isoDate.slice(8, 10));
  const daysInMonth = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const nextMonth = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0'); };
  const addDays = (isoDate, n) => new Date(Date.parse(isoDate + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
  // yyyy-mm-dd in the runtime's own clock (the hub runs in Central; the server passes Central noon).
  const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const lines = text => String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trim());
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const fail = msg => { const e = new Error(msg); e.wellsky = true; throw e; };

  // ---------- reading the two reports ----------

  // "Schedules (Future)" grouped by client. Despite its name it lists past shifts with
  // the real clock times too. Two shapes of shift line:
  //   10/05/2026  Pham, Nuong: 6:02 AM - 7:02 PM  13
  //   09/18/2026  Smith, Anita: 09/18/2026 8:54 AM - 09/19/2026 11:54 AM  27   (overnight)
  const SHIFT = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?):\s+(?:(\d{2}\/\d{2}\/\d{4})\s+)?(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(?:(\d{2}\/\d{2}\/\d{4})\s+)?(\d{1,2}:\d{2}\s*[AP]M)\s+(-?[\d.]+)$/;
  function parseShiftReport(text) {
    const ls = lines(text);
    if (!ls.some(l => /^Schedules by Client$/.test(l))) fail('This is not the WellSky schedule report grouped by client.');
    const range = ls.map(l => /^Date Range:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/.exec(l)).find(Boolean);
    if (!range) fail('The schedule report has no date range.');
    const consumers = [], unread = [];
    let pending = [];
    ls.forEach(l => {
      const m = SHIFT.exec(l);
      if (m) {
        pending.push({ date: iso(m[1]), attendant: m[2].trim(), start: m[4].replace(/\s+/, ' '), end: m[6].replace(/\s+/, ' '),
                       endDate: m[5] ? iso(m[5]) : iso(m[1]), hours: +m[7] });
        return;
      }
      if (/^\d{2}\/\d{2}\/\d{4}\s/.test(l)) { unread.push(l.slice(0, 120)); return; }
      const t = /^Total Hours for (.+?):\s*(-?[\d.]+)$/.exec(l);
      if (t) {
        const sum = r2(pending.reduce((s, x) => s + x.hours, 0));
        consumers.push({ name: t[1].trim(), shifts: pending, total: +t[2], adds_up: Math.abs(sum - +t[2]) < 0.02 });
        pending = [];
      }
    });
    if (pending.length) unread.push(pending.length + ' shift line(s) after the last consumer total');
    return { from: iso(range[1]), to: iso(range[2]), consumers, unread };
  }

  // "Authorizations - Sched/Comp", one block per consumer:
  //   Tran, Huan
  //   Auth# HUAN TRAN (DCN: ...) CDS Care Plan: 02/25/2026 - 12/31/2026 - 78.50 Hours/Month | Service: DSDS - CDS Personal Care. | Status: Active
  //   Period Authorized Completed Sched/In Progress Cancelled Comp + Sched Remaining % Utilized
  //   Oct 1 - Oct 31  78.50  80.25  30.00  0.00  110.25  -31.75  140%
  const AUTH = /^Auth#\s*(.*)\s+-\s+(-?[\d.]+)\s+Hours\/Month\s*\|\s*Service:\s*(.*?)\s*\|\s*Status:\s*(\S+)/;
  const ROW = /^([A-Z][a-z]{2})\s+(\d{1,2})\s*-\s*([A-Z][a-z]{2})\s+(\d{1,2})\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?\d+)%$/;
  function parseAuthReport(text) {
    const ls = lines(text).filter(Boolean);
    if (!ls.some(l => /^Authorized vs\. Scheduled vs\. Completed Report$/.test(l))) fail('This is not the WellSky authorizations report.');
    const range = ls.map(l => /^Date Range:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/.exec(l)).find(Boolean);
    if (!range) fail('The authorizations report has no date range.');
    const from = iso(range[1]);
    const consumers = [], unread = [];
    let who = null, auth = null;
    ls.forEach((l, i) => {
      const a = AUTH.exec(l);
      if (a) {
        if (!who) { unread.push(l.slice(0, 120)); return; }
        auth = { label: a[1].replace(/\s*\(DCN:\s*\d+\)/i, '').trim(), perMonth: +a[2], service: a[3].replace(/\.$/, ''), status: a[4], months: [] };
        who.auths.push(auth);
        return;
      }
      const r = ROW.exec(l);
      if (r) {
        if (!auth) { unread.push(l.slice(0, 120)); return; }
        const mi = MON.indexOf(r[1]);
        // The rows carry no year: a month before the report's first month is next year.
        const y = +from.slice(0, 4) + (mi + 1 < +from.slice(5, 7) ? 1 : 0);
        auth.months.push({ month: y + '-' + String(mi + 1).padStart(2, '0'), authorized: +r[5], completed: +r[6], scheduled: +r[7],
                           cancelled: +r[8], remaining: +r[10], pct: +r[11] });
        return;
      }
      if (/^Auth#/.test(l) || /^[A-Z][a-z]{2}\s+\d{1,2}\s*-\s*[A-Z][a-z]{2}\s+\d/.test(l)) { unread.push(l.slice(0, 120)); return; }
      // A consumer's name is the line straight before their first Auth# line.
      if (ls[i + 1] && /^Auth#/.test(ls[i + 1]) && !/^(Period|Date Range|Grouped by|Authorized vs)/.test(l)) {
        who = { name: l, auths: [] }; auth = null; consumers.push(who);
      }
    });
    return { from, to: iso(range[2]), consumers, unread };
  }

  // Her saved Custom Report "CDS Daily Check - Care Logs" (Reports > Custom, Care Logs,
  // filtered to the CDS: Consumer tag). Unlike the schedule report it lists shifts that
  // were clocked into and never clocked out: status "In Progress", no clock-out. The
  // morning code reads the report's own data in WellSky and sends only those rows:
  //   { report: { name, cdsFilter }, from, to, total, pulledLocal, rows: [{ consumer, attendant, clockIn, status }] }
  // Times are WellSky's own local (Central) clock with no time zone, e.g. 2026-09-05T17:52:00.123.
  const NAIVE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  function parseOpenReport(body) {
    if (!body || !body.report || body.report.name !== OPEN_REPORT)
      fail('The saved WellSky report "' + OPEN_REPORT + '" was not the one read (renamed or deleted?).');
    if (!body.report.cdsFilter) fail('The saved WellSky report "' + OPEN_REPORT + '" no longer filters to the CDS: Consumer tag.');
    if (!Array.isArray(body.rows) || typeof body.total !== 'number') fail('The open shift report came back in a shape this check does not know.');
    if (!NAIVE.test(String(body.pulledLocal || ''))) fail('The open shift report has no time it was read.');
    const rows = [], unread = [];
    body.rows.forEach(r => {
      if (r && r.status === 'In Progress' && NAIVE.test(String(r.clockIn || '')) && r.consumer && r.attendant)
        rows.push({ consumer: String(r.consumer).slice(0, 80), attendant: String(r.attendant).slice(0, 80), clockIn: String(r.clockIn).slice(0, 19) });
      else unread.push(String((r && r.status) || 'row').slice(0, 40));
    });
    return { from: String(body.from || ''), to: String(body.to || ''), total: body.total, pulledLocal: String(body.pulledLocal).slice(0, 19), rows, unread };
  }

  // Shifts still "In Progress" more than 12 hours after clocking in: the attendant
  // never clocked out, so the visit is neither billed nor paid until it is fixed.
  const asUtc = naive => Date.parse(naive.slice(0, 19) + 'Z');
  function whenNaive(naive) {
    const h = +naive.slice(11, 13), mi = naive.slice(14, 16);
    return short(naive.slice(0, 10)) + ', ' + ((h % 12) || 12) + ':' + mi + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  const openKey = r => 'open|' + r.consumer + '|' + r.clockIn.slice(0, 16);
  function openShifts(open, reviewed) {
    if (!open || !open.rows) return [];
    const at = asUtc(open.pulledLocal);
    return open.rows
      .filter(r => at - asUtc(r.clockIn) > OPEN_HOURS * 36e5)
      .filter(r => !(reviewed && reviewed[openKey(r)]))
      .map(r => {
        const days = Math.floor((at - asUtc(r.clockIn)) / DAY);
        return { key: openKey(r), consumer: r.consumer, attendant: r.attendant, clockIn: r.clockIn, when: whenNaive(r.clockIn), days,
                 why: 'clocked in ' + whenNaive(r.clockIn) + ', never clocked out' + (days >= 1 ? ' (' + plural(days, 'day', 'days') + ' ago)' : '') };
      })
      .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  }

  // ---------- the rules ----------

  // Hours under the personal care authorization. The ILW case management and financial
  // management lines are separate services billed differently, so they are not paced.
  const isPersonalCare = a => !/case management|financial management/i.test(a.service + ' ' + a.label);

  // Long shifts in the last two weeks that nobody has marked checked yet.
  // shifts = wellskyCheck.shifts; reviewed = agency_data 'wellskyReviewed' { key: {at, by} }.
  const shiftKey = (consumer, s) => consumer + '|' + s.date + '|' + s.start;
  function longShifts(shifts, reviewed, today) {
    if (!shifts || !shifts.consumers) return [];
    const since = addDays(today, -LOOKBACK_DAYS);
    const out = [];
    shifts.consumers.forEach(c => {
      const past = c.shifts.filter(s => s.date < today);
      past.forEach(s => {
        if (s.date < since) return;
        const key = shiftKey(c.name, s);
        if (reviewed && reviewed[key]) return;
        const others = past.filter(o => o !== s && o.attendant === s.attendant);
        const usual = others.length >= MIN_HISTORY ? median(others.map(o => o.hours)) : null;
        const overHours = s.hours > LONG_HOURS;
        const overUsual = usual !== null && usual > 0 && s.hours > LONG_FACTOR * usual;
        if (!overHours && !overUsual) return;
        out.push({ key, consumer: c.name, attendant: s.attendant, date: s.date, start: s.start, end: s.end, endDate: s.endDate,
                   hours: s.hours, usual,
                   why: hrs(s.hours) + (usual !== null ? ', usually about ' + hrs(usual) : ', over 8 hours') });
      });
    });
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.hours - a.hours);
  }

  // Each consumer's personal care hours this month. pulledOn = the date of the pull
  // (yyyy-mm-dd): the pull runs early, so that day itself has not been worked yet.
  function hoursThisMonth(auths, shifts, pulledOn) {
    if (!auths || !auths.consumers) return [];
    const ym = pulledOn.slice(0, 7), nm = nextMonth(ym);
    const dim = daysInMonth(ym), day = +pulledOn.slice(8, 10);
    const elapsed = day - 1, remainingDays = dim - elapsed;
    const coversNext = auths.to >= nm + '-01';
    const out = [];
    auths.consumers.forEach(c => {
      c.auths.filter(isPersonalCare).forEach(a => {
        const m = a.months.find(x => x.month === ym);
        if (!m) return;
        // Days still to come this month with a shift already booked in WellSky.
        const sc = shifts && shifts.consumers && shifts.consumers.find(x => x.name === c.name);
        const bookedDays = sc ? new Set(sc.shifts.filter(s => s.date >= pulledOn && s.date.slice(0, 7) === ym).map(s => s.date)).size
                              : (m.scheduled > 0 ? remainingDays : 0);
        const perDay = elapsed > 0 ? m.completed / elapsed : 0;
        const projected = r2(m.completed + m.scheduled + perDay * Math.max(0, remainingDays - bookedDays));
        const left = r2(m.authorized - m.completed - m.scheduled);
        let status = 'ok', note = '';
        if (m.completed > m.authorized + 0.01) {
          status = 'over'; note = 'Over by ' + hrs(m.completed - m.authorized) + ' already';
        } else if (m.completed + m.scheduled > m.authorized + 0.01) {
          status = 'booked-over'; note = 'Booked ' + hrs(m.completed + m.scheduled - m.authorized) + ' past the authorization';
        } else if (projected > m.authorized + 0.5) {
          status = 'pace-over'; note = 'On pace to go over by about ' + hrs(Math.round(projected - m.authorized));
        } else if (day >= LOW_FROM_DAY && m.authorized > 0 && m.completed / m.authorized < LOW_SHARE) {
          status = 'low'; note = 'Only ' + Math.round(m.completed / m.authorized * 100) + '% used';
        }
        const noNext = coversNext && !a.months.some(x => x.month === nm);
        out.push({ consumer: c.name, label: a.label, authorized: m.authorized, completed: m.completed, scheduled: m.scheduled,
                   left, projected, status, note, noNext, nextMonthName: MONTH_LONG[+nm.slice(5, 7) - 1],
                   perDay: remainingDays > 0 ? r2(Math.max(0, left) / remainingDays) : 0, remainingDays });
      });
    });
    return out;
  }

  // The lines for "Do this first, every morning" (step 2, Protect the money) and the
  // 8am email. check = agency_data 'wellskyCheck'; reviewed = 'wellskyReviewed'.
  // Nothing at all until the first pull has happened, so the office is not told about
  // a check that was never switched on.
  function items(check, reviewed, now) {
    if (!check || !check.lastRun) return [];
    now = now || new Date();
    const today = isoLocal(now);
    const tag = check.live ? '' : 'Practice: ';
    const out = [];
    const okAt = Math.min(Date.parse((check.shifts && check.shifts.at) || 0) || 0, Date.parse((check.auths && check.auths.at) || 0) || 0,
                          check.open ? (Date.parse(check.open.at || 0) || 0) : Infinity);
    if (!okAt || now - okAt > STALE_HOURS * 36e5) {
      out.push({ t: tag + 'The WellSky check has not run ' + (okAt ? 'since ' + short(isoLocal(new Date(okAt))) : 'yet') +
                    '. Log in to WellSky in Chrome and leave the Mac on.' + (check.lastRun.ok ? '' : ' Last try: ' + check.lastRun.why),
                 go: 'authorizations', bad: true });
    } else if (!check.lastRun.ok) {
      out.push({ t: tag + 'The last WellSky check did not finish: ' + check.lastRun.why, go: 'authorizations', bad: true });
    }
    const long = longShifts(check.shifts, reviewed, today);
    if (long.length) out.push({ t: tag + plural(long.length, 'long shift', 'long shifts') + ' to check before payroll', go: 'authorizations', bad: true,
                                people: long.map(s => ({ name: s.consumer, why: short(s.date) + ', ' + s.attendant + ', ' + s.why })) });
    const open = openShifts(check.open, reviewed);
    if (open.length) out.push({ t: tag + plural(open.length, 'shift', 'shifts') + ' never clocked out (still In Progress in WellSky)', go: 'authorizations', bad: true,
                                people: open.map(s => ({ name: s.consumer, why: s.attendant + ', ' + s.why })) });
    const pulledOn = check.auths && check.auths.at ? isoLocal(new Date(check.auths.at)) : today;
    const h = hoursThisMonth(check.auths, check.shifts, pulledOn);
    const over = h.filter(x => x.status === 'over' || x.status === 'booked-over');
    const pace = h.filter(x => x.status === 'pace-over');
    const low = h.filter(x => x.status === 'low');
    const noNext = h.filter(x => x.noNext);
    const ppl = list => list.map(x => ({ name: x.consumer, why: x.note }));
    if (over.length) out.push({ t: tag + plural(over.length, 'consumer', 'consumers') + ' over the authorization this month', go: 'authorizations', bad: true, people: ppl(over) });
    if (pace.length) out.push({ t: tag + plural(pace.length, 'consumer', 'consumers') + ' on pace to go over this month', go: 'authorizations', people: ppl(pace) });
    if (low.length) out.push({ t: tag + plural(low.length, 'consumer', 'consumers') + ' barely using their hours', go: 'authorizations', people: ppl(low) });
    if (noNext.length) out.push({ t: tag + plural(noNext.length, 'consumer', 'consumers') + ' with no ' + noNext[0].nextMonthName + ' authorization showing in WellSky',
                                  go: 'authorizations', people: noNext.map(x => ({ name: x.consumer, why: 'ends after this month' })) });
    return out;
  }

  root.CDSWellSky = { parseShiftReport, parseAuthReport, parseOpenReport, longShifts, openShifts, hoursThisMonth, items, shiftKey, isPersonalCare, isoLocal,
                      LONG_HOURS, LONG_FACTOR, MIN_HISTORY, LOOKBACK_DAYS, STALE_HOURS, OPEN_HOURS, OPEN_REPORT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
