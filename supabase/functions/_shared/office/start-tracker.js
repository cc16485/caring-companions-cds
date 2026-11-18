// CDS start tracker (2026-11-17, her ask: "keeping leads, who need to have a referral put in get done, listen to the
// call, see what we have promised and make sure it gets done ... packets ... tax ... step 1 ... background checks ...
// Empeon ... I-9 ... teach the consumer and their attendant how to clock in ... before their start date").
//
// One row per Starting consumer, in the order the work really happens, each step with who owns it and when it is due:
//   Medicaid, Referral, Packet, Tax, Attendant checks, Empeon and I-9, Clock-in call, Start date,
// plus What we promised (from calls and typed in). The hub draws it on the Starting page; the CDS Coordinator (server)
// reads the same answers, so both always agree. It only reads; it never saves.
//
// ctx (from the hub or the server): { today, auth, packet: { signed, done }, att: one attendant onboarding row
// ({ name, step1, checksClear, invite, empeon, i9, active, hold }) or null, roster: { name } when the attendant is on the
// Attendants roster already, rulesVersion }.
// Due dates count back from the start date the state gave (her plan, my picks, she can change them in Admin later):
//   packet signed 10 days before, tax set up 7, attendant checks 7, Empeon 3, clock-in call 2.
// I-9 Section 2 is due 3 business days after the first day (federal rule), shown on the Empeon step.
// No em dashes in anything a person reads (her rule).
(function (root) {
  'use strict';

  const DUE_BEFORE = { packet: 10, tax: 7, checks: 7, empeon: 3, clock: 2 };
  const COLS = [
    ['medicaid', 'Medicaid'], ['referral', 'Referral'], ['packet', 'Packet'], ['tax', 'Tax set up'],
    ['checks', 'Attendant checks'], ['empeon', 'Empeon and I-9'], ['clock', 'Clock-in call'], ['start', 'Start date']
  ];

  const ymd = d => d.toISOString().slice(0, 10);
  function addDays(iso, n) { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function addBizDays(iso, n) {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n--; }
    return ymd(d);
  }
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

  // What we promised: c.starting.promises [{ id, what, due, owner, from: { kind: 'call'|'text'|'typed', at, line, ref }, done: { at, by } }]
  function promises(c, today) {
    const list = ((c && c.starting && c.starting.promises) || []).filter(p => p && p.what);
    return list.map(p => Object.assign({}, p, { open: !p.done, late: !p.done && !!p.due && !!today && p.due < today, today: !p.done && p.due === today }))
      .sort((a, b) => (a.open === b.open ? String(a.due || '9999').localeCompare(String(b.due || '9999')) : a.open ? -1 : 1));
  }

  // Tax set up before the first payroll: EIN, Missouri tax ID, IRS 8821 and 2678, MO 2827, unemployment (DES) and
  // the numbers in Empeon. Fusion (EIN typed in and proof uploaded) has 90 days after the start, so it is shown, not required.
  const sent = (c, k) => !!(c.filings && c.filings[k] && c.filings[k].sentAt);   // the same test as the Tax Setup chips
  const TAX_PARTS = [
    ['EIN', c => !!String(c.ein || '').trim()],
    ['MO tax ID', c => !!String(c.moTaxId || '').trim()],
    ['8821', c => !!c.irs8821 || sent(c, 'IRS-8821')], ['2678', c => !!c.irs2678 || sent(c, 'IRS-2678')], ['2827', c => !!c.mo2827 || sent(c, 'MO-2827')],
    ['Unemployment (DES)', c => !!c.desRegistered || sent(c, 'DES')], ['Numbers in Empeon', c => !!c.empeonUpdated]
  ];
  function taxState(c) {
    const missing = TAX_PARTS.filter(([, ok]) => !ok(c || {})).map(([t]) => t);
    const transfer = !!(c && c.starting && c.starting.kind === 'move');
    return { done: !missing.length, missing, transfer, fusion: !!(c && c.fusionEntered && (c.proofUploaded || c.priorVendorProof)) };
  }

  // The attendant onboarding row that belongs to this consumer: their typed attendant first, else the one whose
  // onboarding names this consumer.
  function attendantFor(c, rows) {
    rows = rows || [];
    const typed = norm(c && c.starting && c.starting.attendantName);
    return rows.find(r => typed && norm(r.name) === typed) || rows.find(r => norm(r.consumer) && norm(r.consumer) === norm(c && c.name)) || null;
  }

  function tracker(c, ctx) {
    ctx = ctx || {};
    const S = root.CDSStarting;
    const today = ctx.today || ymd(new Date());
    const st = S.startingSteps(c, Object.assign({}, ctx, { attendant: { linked: !!(ctx.att || ctx.roster), ready: !!ctx.roster || !!(ctx.att && ctx.att.active), name: (ctx.att || ctx.roster || {}).name } }));
    const s = (c && c.starting) || {}, start = (c && c.cdsStartDate) || '';
    const owner = (c && c.coordinator) || 'Office';
    const due = k => start ? addDays(start, -DUE_BEFORE[k]) : '';
    const transfer = st.transfer;
    const att = ctx.att || null, roster = ctx.roster || null;
    const attName = (att && att.name) || (roster && roster.name) || s.attendantName || '';
    const cells = {};

    // 1 Medicaid
    cells.medicaid = st.medicaid.verified ? { state: 'done', t: 'Verified' }
      : { state: 'now', t: st.medicaid.needsSupervisor ? 'ME code review' : st.medicaid.reported ? 'Verify in eMOMED' : 'Verify in eMOMED', owner };
    // 2 Referral (or transfer) put in, then the state answers
    if (ctx.auth) cells.referral = { state: 'done', t: 'Authorized' };
    else if (transfer ? s.transferEntered : s.referralSent) {
      const sent = transfer ? s.transferEntered : s.referralSent, n = daysBetween(sent, today);
      cells.referral = { state: 'wait', t: (transfer ? 'Transfer in ' : 'Sent ') + sent.slice(5).replace('-', '/') + ', ' + n + (n === 1 ? ' day' : ' days'), owner: 'State' };
    } else cells.referral = { state: cells.medicaid.state === 'done' ? 'now' : 'todo', t: transfer ? 'Enter the transfer' : 'Put the referral in', owner, due: cells.medicaid.state === 'done' ? today : '' };
    // 3 Consumer packet
    const pk = ctx.packet || {};
    cells.packet = pk.status === 'checking' ? { state: 'todo', t: 'Checking...' }
      : pk.done ? { state: 'done', t: 'Signed' }
      : pk.signed ? { state: 'now', t: 'Sign as agent', owner, due: due('packet') }
      : pk.status ? { state: 'wait', t: 'Sent, not signed', owner: 'Consumer', due: due('packet') }
      : { state: 'now', t: 'Send the packet', owner, due: due('packet') };
    // 4 Tax
    const tx = taxState(c);
    cells.tax = tx.done ? { state: 'done', t: tx.fusion ? 'Done, in Fusion' : 'Done (Fusion within 90 days)' }
      : { state: pk.done || pk.signed ? 'now' : 'todo', t: 'Missing ' + tx.missing.slice(0, 2).join(', ') + (tx.missing.length > 2 ? ' +' + (tx.missing.length - 2) : ''), owner, due: due('tax'), missing: tx.missing };
    // 5 Attendant: Step 1 and background checks
    if (roster) cells.checks = { state: 'done', t: 'On the roster' };
    else if (!attName) cells.checks = { state: 'now', t: 'Find out who', owner, due: due('checks') };
    else if (!att) cells.checks = { state: 'now', t: 'Text ' + attName.split(' ')[0] + ' the application', owner, due: due('checks') };
    else if (!att.step1) cells.checks = { state: 'wait', t: 'Step 1 not signed', owner: 'Attendant', due: due('checks') };
    else if (!att.checksClear) cells.checks = { state: att.hold === 'office' ? 'now' : 'wait', t: att.hold === 'office' ? 'Run the checks' : 'Checks pending', owner: att.hold === 'office' ? owner : 'State', due: due('checks') };
    else cells.checks = { state: 'done', t: 'Clear' };
    // 6 Empeon and I-9 (I-9 Section 2 within 3 business days of the first day)
    const i9By = start ? addBizDays(start, 3) : '';
    if (roster || (att && att.active)) cells.empeon = { state: 'done', t: 'Done' };
    else if (!att || !att.checksClear) cells.empeon = { state: 'todo', t: 'After the checks', due: due('empeon') };
    else if (!att.invite) cells.empeon = { state: 'now', t: 'Send the Empeon invite', owner, due: due('empeon') };
    else if (!att.empeon) cells.empeon = { state: 'wait', t: 'Attendant in Empeon', owner: 'Attendant', due: due('empeon') };
    else if (!att.i9) cells.empeon = { state: 'now', t: 'ID call and I-9', owner, due: i9By || due('empeon'), note: i9By ? 'I-9 Section 2 by ' + i9By : '' };
    else cells.empeon = { state: 'done', t: 'Done' };
    // 7 Clock-in call: both taught to clock in, questions answered, before the start date
    const prep = (c && c.firstShiftPrep) || {};
    const clockDone = !!(s.clockCall || (prep.toldClockIn && s.attClockIn));
    cells.clock = clockDone ? { state: 'done', t: 'Done' + (s.clockCall && s.clockCall.questions ? ', questions noted' : '') }
      : { state: start ? 'now' : 'todo', t: 'Teach both to clock in', owner, due: due('clock') };
    // 8 Start date the state gave
    if (!start) cells.start = { state: ctx.auth ? 'now' : 'todo', t: ctx.auth ? 'Add the date the state gave' : 'Not yet', owner: ctx.auth ? owner : '' };
    else { const n = daysBetween(today, start); cells.start = { state: n < 0 ? 'late' : 'date', t: n < 0 ? 'Passed ' + (-n) + (n === -1 ? ' day' : ' days') + ' ago' : n === 0 ? 'Today' : 'In ' + n + (n === 1 ? ' day' : ' days'), date: start, days: n }; }

    // Late: a due date passed and the step is not done.
    Object.values(cells).forEach(x => { if (x.due && x.state !== 'done' && x.due < today) x.late = true; });

    const prom = promises(c, today), openP = prom.filter(p => p.open), lateP = openP.filter(p => p.late);
    // The next step: a promise that is late comes first (we said we would), then the first open step in order.
    const order = COLS.map(([k]) => k).filter(k => k !== 'start');
    const firstK = order.find(k => cells[k].state === 'now' && cells[k].late) || order.find(k => cells[k].state === 'now') || (cells.start.state === 'now' ? 'start' : null)
      || order.find(k => cells[k].state === 'wait');
    let next;
    if (lateP.length) next = { k: 'promise', t: 'We promised: ' + lateP[0].what, owner: lateP[0].owner || owner, due: lateP[0].due, late: true };
    else if (firstK === 'medicaid' || firstK === 'referral') next = { k: firstK, t: st.next.t, d: st.next.d, owner: cells[firstK].owner || owner, due: cells[firstK].due || '' };
    else if (firstK) next = { k: firstK, t: cells[firstK].t, owner: cells[firstK].owner || owner, due: cells[firstK].due || '', late: !!cells[firstK].late, wait: cells[firstK].state === 'wait' };
    else next = { k: 'done', t: 'Everything is ready for the first shift', owner, due: '' };
    const soon = start && cells.start.days !== undefined && cells.start.days <= 7 && order.some(k => cells[k].state !== 'done');
    return { cells, next, promises: prom, openPromises: openP.length, latePromises: lateP.length, urgent: !!(soon || lateP.length || (next && next.late)), start, attName, steps: st };
  }

  // One line per open step with an owner and a due date, for My Week, Today and the 8am email.
  function dueList(c, ctx) {
    const t = tracker(c, ctx), out = [];
    COLS.forEach(([k, label]) => { const x = t.cells[k]; if (x.state !== 'done' && x.due && x.owner && !['State', 'Consumer', 'Attendant'].includes(x.owner)) out.push({ k, t: label + ': ' + x.t, due: x.due, owner: x.owner, late: !!x.late }); });
    t.promises.filter(p => p.open && p.due).forEach(p => out.push({ k: 'promise:' + p.id, t: 'We promised: ' + p.what, due: p.due, owner: p.owner || t.next.owner, late: p.late }));
    return out.sort((a, b) => a.due.localeCompare(b.due));
  }

  root.CDSTracker = { tracker, dueList, promises, taxState, attendantFor, COLS, DUE_BEFORE, TAX_PARTS, addDays, addBizDays };
})(typeof globalThis !== 'undefined' ? globalThis : this);
