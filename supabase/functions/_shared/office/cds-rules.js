// CDS rules shared by the hub page and the server (2026-10-19).
//
// ONE place decides what the Dashboard's "Do this first, every morning" list says,
// so the 8am morning email and the Dashboard can never disagree. The hub loads this
// file with a <script> tag; the server functions import it. It only reads the data
// it is handed and never saves anything.
//
// Moved here unchanged from index.html: einClock, desThreshold, ongoingRequirements
// and the four steps of renderDailyRoutine. New: leadWaiting, which also counts a
// lead as reached once somebody adds a note to it, not only when its status moves.
//
// No em dashes in anything a person reads (her rule).
(function (root) {
  'use strict';
  const DAY = 864e5;
  // closed_inactive and closed_spam added 2026-10-22 (her ask: a way to make a lead inactive or mark it spam).
  // closed_linked (2026-10-29): the caller is family or the attendant of someone we serve or a lead; see linkLead.
  const CLOSED = ['closed_ni', 'closed_other', 'closed_inactive', 'closed_spam', 'closed_pool', 'closed_linked'];
  const CLOSED_LABELS = { closed_ni: 'Not interested', closed_other: 'Went with another agency',
                          closed_inactive: 'Inactive, stopped answering', closed_spam: 'Spam, not a real lead',
                          closed_pool: 'Moved to the Caregiver Pool',  // closed_pool: Who called, 2026-10-22
                          closed_linked: 'Linked to the person they called about' };
  // One rule for "active" (2026-10-22): the hub saves "inactive" lowercase and old
  // imports said "Inactive" or "Discharged", so compare without case. The hub uses this too.
  const isActive = c => !!c && !['inactive', 'discharged'].includes(String(c.status || '').toLowerCase());
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  // Due-date helpers (her approved rules 2026-10-23).
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
  const addBusinessDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return isoLocal(d); };
  const payWeekEnd = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + (6 - d.getDay())); return isoLocal(d); };
  const mdy = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : ''; };
  const monDay = iso => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  // One meaning of "active" on Today and the Dashboard (her ask 2026-10-22, for Zach): a hub
  // consumer not marked inactive whose attendant worked a WellSky shift in the last 31 days.
  // people = the WellSky list (CDSWellSky.consumersNow people + leftOut); with no WellSky
  // report yet it falls back to everyone not marked inactive, so nothing goes missing.
  const defaultKey = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '');
  function activeNow(consumers, people, nameKey) {
    const hub = (consumers || []).filter(isActive);
    if (!people) return { live: false, list: hub };
    const key = nameKey || defaultKey;
    const seen = new Set(people.map(p => p.key));
    return { live: true, list: hub.filter(c => seen.has(key(c.name))) };
  }

  // The 90-day EIN clock, measured from the CDS start date.
  function einClock(c, now) {
    const start = String(c.cdsStartDate || '').trim();
    if (!start) return { known: false };
    const due = new Date(new Date(start + 'T12:00:00').getTime() + 90 * DAY);
    const days = Math.round((due - (now || new Date())) / DAY);
    return { known: true, due: due.toISOString().slice(0, 10), days };
  }

  // DES: wages per calendar quarter from the check registers; $1,000 in one
  // quarter means register in UInteract. Gross where known, else net (so the
  // figure understates, never overstates) and says so.
  function desThreshold(entriesAll, consumerName) {
    const entries = (entriesAll || []).filter(e => e.consumer === consumerName);
    if (!entries.length) return { known: false };
    const byQuarter = {};
    let estimated = false;
    entries.forEach(e => {
      const first = String(e.period || '').split('-')[0].trim();
      const parts = first.split('/');
      if (parts.length < 3) return;
      const y = +parts[2], m = +parts[0];
      if (!y || !m) return;
      const q = 'Q' + (Math.floor((m - 1) / 3) + 1) + ' ' + y;
      const amt = (e.gross != null) ? e.gross : (estimated = true, e.net || 0);
      byQuarter[q] = (byQuarter[q] || 0) + amt;
    });
    const order = Object.keys(byQuarter).sort((a, b) => {
      const [qa, ya] = a.split(' '), [qb, yb] = b.split(' ');
      return (+ya - +yb) || (+qa.slice(1) - +qb.slice(1));
    });
    if (!order.length) return { known: false };
    const crossed = order.find(q => byQuarter[q] >= 1000);
    const latest = order[order.length - 1];
    return {
      known: true, estimated, byQuarter, quarters: order,
      crossed: crossed || null,
      crossedAmount: crossed ? byQuarter[crossed] : 0,
      latestQuarter: latest,
      latestAmount: byQuarter[latest],
      shortfall: crossed ? 0 : Math.max(0, 1000 - byQuarter[latest])
    };
  }

  // 19 CSR 15-8.400(5)(F): monthly contact, plus an annual face-to-face visit.
  // Missed months only count from the consumer's start, so a new consumer is
  // never told they missed eleven.
  function ongoingRequirements(c, now) {
    const today = new Date(now || new Date()); today.setHours(12, 0, 0, 0);
    const iso = d => d.toISOString().slice(0, 10);
    const monthKey = d => d.toISOString().slice(0, 7);
    const contacts = (c.contacts && typeof c.contacts === 'object') ? c.contacts : {};
    const months = Object.keys(contacts).sort();
    const thisMonth = monthKey(today);
    const doneThisMonth = !!contacts[thisMonth];
    const startedKey = ((c.cdsStartDate || c.empeonStartDate || '').trim() || '').slice(0, 7);
    const last12 = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1, 12);
      const k = monthKey(d);
      if (startedKey && k < startedKey) continue;
      last12.push({ month: k, done: !!contacts[k], log: contacts[k] || null });
    }
    const missed = last12.filter(m => !m.done && m.month < thisMonth).length;
    const visits = Array.isArray(c.homeVisits) ? c.homeVisits.slice()
                 : (c.homeVisitDate ? [{ date: c.homeVisitDate, by: '', notes: '' }] : []);
    visits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const lastVisit = visits[0] || null;
    const anchor = (lastVisit && lastVisit.date) || (c.cdsStartDate || '').trim() || (c.empeonStartDate || '').trim();
    let visitDue = null, visitDays = null, monthTen = null;
    if (anchor) {
      const d = new Date(anchor + 'T12:00:00');
      d.setDate(d.getDate() + 365);
      visitDue = iso(d);
      visitDays = Math.round((d - today) / DAY);
      // Her rule (2026-10-21): tell the office at month 10, when 2 months are left.
      const t = new Date(anchor + 'T12:00:00');
      t.setMonth(t.getMonth() + 10);
      monthTen = iso(t);
    }
    return {
      monthly: { doneThisMonth, thisMonth, last12, missed, everLogged: months.length },
      annual:  { visits, lastVisit, anchor, due: visitDue, days: visitDays,
                 overdue: visitDays !== null && visitDays < 0,
                 soon: visitDays !== null && visitDays >= 0 && iso(today) >= monthTen,
                 monthTen,
                 known: !!anchor }
    };
  }

  // Tax standing is finished when a prior vendor's proof exempts them, or both
  // numbers are in Fusion with the proof uploaded (same test as taxStatus).
  const taxDone = c => !!c.priorVendorProof || (!!c.fusionEntered && !!String(c.proofUploaded || '').trim());

  // The note the hub writes when it imports a website lead is the family's own
  // words, not a call. Anything else in the notes means somebody followed up.
  const FORM_NOTE = /^(Who needs care|Medicaid|They said): /;
  const isFormNote = n => !!n && (n.fromForm || FORM_NOTE.test(String(n.text || '')));

  // A call logged from the lead link page (table cds_lead_calls) also counts.
  const calledFor = (calls, siteLeadId) => !!siteLeadId && (calls || []).some(c => c && c.site_lead_id === siteLeadId);

  // A website lead is waiting until its status moves off New, someone adds a note,
  // or someone logs a call from the link page.
  function leadWaiting(p, calls) {
    if (!p || !p.fromWebsite || p.status !== 'new') return false;
    if (calledFor(calls, p.siteLeadId)) return false;
    const notes = Array.isArray(p.notes) ? p.notes : [];
    return !notes.some(n => !isFormNote(n));
  }
  // Same question for a site_leads row, which may not be in the pipeline yet.
  function siteLeadWaiting(row, pipeline, calls) {
    if (!row || row.archived) return false;
    if (calledFor(calls, row.id)) return false;
    const p = (pipeline || []).find(x => x && x.siteLeadId === row.id);
    return p ? leadWaiting(p, calls) : true;
  }
  const followDue = (p, todayIso) => !!(p && p.followup && p.followup <= todayIso && !CLOSED.includes(p.status));

  // "Do this first, every morning". data = { consumers, pipeline, authorizations, attendantWages, siteLeads?, calls?, wellskyItems? }.
  // Items carry the page to open (go), whether it is red (bad) and, for people
  // waiting, their names, so the email can say who.
  function dailyRoutine(data, now) {
    now = now || new Date();
    const todayIso = isoLocal(now);
    const consumers = (data.consumers || []).filter(isActive);
    // Steps 2 and 3 (money, case files) count only consumers working now, the same people the
    // Dashboard counts. Step 1 stays on everyone not marked inactive: a state deadline does not
    // stop because the shifts did. Hub-only consumers with no shifts are the closings step's job.
    const now31 = data.wsPeople ? activeNow(data.consumers, data.wsPeople, data.nameKey).list : consumers;
    const nowNames = new Set(now31.map(c => String(c.name).toUpperCase()));
    const wages = (data.attendantWages && data.attendantWages.entries) || [];
    const steps = [];
    // Names on every line (her ask 2026-10-22, for Zach). Each person carries why (the email
    // prints it), due (yyyy-mm-dd, when there is one), id (the consumer or lead) and act, the
    // button that records the work: call, visit, tax, shift (Checked), lead or profile (Open).
    const byName = new Map((data.consumers || []).map(c => [String(c.name).toUpperCase(), c]));
    const who = (c, why, due, act) => ({ name: c.name, id: c.id, why, due: due || '', act: act || 'profile' });
    const byDue = list => list.sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || String(a.name).localeCompare(String(b.name)));

    const einLate = [], einSoon = [], desDue = [];
    consumers.forEach(c => {
      if (!taxDone(c)) {
        const k = einClock(c, now);
        if (k.known && k.days < 0) einLate.push(who(c, 'EIN, MO Tax ID and proof in Fusion', k.due, 'tax'));
        else if (k.known && k.days <= 21) einSoon.push(who(c, 'EIN, MO Tax ID and proof in Fusion', k.due, 'tax'));
      }
      if (!c.desRegistered) { const d = desThreshold(wages, c.name); if (d.known && d.crossed)
        desDue.push(who(c, '$' + Math.round(d.crossedAmount).toLocaleString('en-US') + ' in ' + d.crossed + ', register now', '', 'tax')); }
    });
    steps.push({
      n: 1, title: 'Clear anything the state is waiting on',
      items: [
        einLate.length && { t: plural(einLate.length, 'consumer', 'consumers') + ' past the 90-day EIN deadline', go: 'taxcompliance', bad: true, people: byDue(einLate) },
        einSoon.length && { t: einSoon.length + ' inside three weeks of it', go: 'taxcompliance', people: byDue(einSoon) },
        desDue.length  && { t: desDue.length + ' past $1,000 in a quarter and not registered with DES', go: 'taxcompliance', bad: true, people: byDue(desDue) },
        // State reports and tax filings due in 30 days or late, until marked sent (only when the caller hands quarterStatus in).
        ...(data.quarterStatus ? [reportsDue(data.quarterStatus, now)].filter(r => r.length).map(r => ({
          t: plural(r.length, 'state report or tax filing', 'state reports and tax filings') + ' due', go: 'calendar', bad: r.some(x => x.late || x.days <= 7),
          people: r.map(x => ({ name: x.title, why: x.late ? 'late' : x.days === 0 ? 'due today' : plural(x.days, 'day', 'days') + ' left', due: x.due, key: x.key, act: 'report' })) })) : []),
        ...(data.agencyDates ? agencyDatesDue(data.agencyDates, now) : [])
      ].filter(Boolean),
      clear: 'Nothing outstanding with the state.'
    });

    const records = (data.authorizations && data.authorizations.records) || {};
    const auths = Object.values(records).filter(a => !data.wsPeople || nowNames.has(String(a.consumer || a.name || '').toUpperCase()));
    const authWho = (a, why) => { const n = String(a.consumer || a.name || ''), c = byName.get(n.toUpperCase());
      const due = /ended/.test(why) ? '' : (a.planEnd || '');
      return c ? who(c, why, due, 'profile') : { name: n, why, due, act: '' }; };
    // An authorization WellSky shows Active is not expired or missing, only out of date in the
    // hub (2026-10-22). The hub hands in wsAuth(name); the email does not, so it is unchanged.
    const wsAuth = typeof data.wsAuth === 'function' ? data.wsAuth : () => null;
    const isOld = a => a.planEnd && new Date(a.planEnd + 'T12:00:00') < now;
    const wsOld = auths.filter(a => isOld(a) && wsAuth(a.consumer || a.name)).map(a => authWho(a, 'WellSky shows it active, upload the new care plan'));
    const expired = auths.filter(a => isOld(a) && !wsAuth(a.consumer || a.name)).map(a => authWho(a, 'authorization ended ' + monDay(a.planEnd)));
    const expiring = auths.filter(a => {
      if (!a.planEnd) return false;
      const d = Math.round((new Date(a.planEnd + 'T12:00:00') - now) / DAY);
      return d >= 0 && d <= 60;
    }).map(a => authWho(a, 'renew the authorization'));
    const noHub = now31.filter(c => !auths.some(a =>
      String(a.consumer || a.name || '').toUpperCase() === String(c.name).toUpperCase()));
    const noAuth = noHub.filter(c => !wsAuth(c.name)).map(c => who(c, 'no authorization on file', '', 'profile'));
    noHub.filter(c => wsAuth(c.name)).forEach(c => wsOld.push(who(c, 'WellSky shows it active, upload the care plan', '', 'profile')));
    steps.push({
      n: 2, title: 'Protect the money',
      items: [
        noAuth.length   && { t: noAuth.length + ' active consumer' + (noAuth.length !== 1 ? 's have' : ' has') + ' no authorization on file', go: 'authorizations', bad: true, people: byDue(noAuth) },
        expired.length  && { t: plural(expired.length, 'authorization', 'authorizations') + ' expired', go: 'authorizations', bad: true, people: byDue(expired) },
        expiring.length && { t: expiring.length + ' expiring within 60 days', go: 'authorizations', people: byDue(expiring) },
        wsOld.length    && { t: plural(wsOld.length, 'care plan', 'care plans') + ' to upload (WellSky shows the authorization active, the hub has old or no dates)', go: 'authorizations', people: byDue(wsOld) },
        ...evvAndPayroll(data, now)
      ].filter(Boolean).concat(data.wellskyItems || []),   // the daily WellSky check (wellsky.js items)
      clear: 'Every consumer has a current authorization.'
    });

    const visitsOverdue = [], visitsSoon = [], monthDue = [];
    const monthEnd = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12));
    now31.forEach(c => {
      const r = ongoingRequirements(c, now);
      if (r.annual.overdue) visitsOverdue.push(who(c, 'annual face-to-face visit', r.annual.due, 'visit'));
      else if (r.annual.soon) visitsSoon.push(who(c, 'book the face-to-face visit', r.annual.due, 'visit'));
      if (!r.monthly.doneThisMonth) monthDue.push(who(c, 'monthly check-in call', monthEnd, 'call'));
    });
    steps.push({
      n: 3, title: 'Keep the case files clean',
      items: [
        visitsOverdue.length && { t: plural(visitsOverdue.length, 'annual face-to-face visit', 'annual face-to-face visits') + ' overdue', go: 'consumers', bad: true, people: byDue(visitsOverdue) },
        visitsSoon.length    && { t: plural(visitsSoon.length, 'face-to-face visit', 'face-to-face visits') + ' in the last 2 months, book ' + (visitsSoon.length === 1 ? 'it' : 'them') + ' now', go: 'consumers', people: byDue(visitsSoon) },
        monthDue.length      && { t: plural(monthDue.length, 'monthly check-in call', 'monthly check-in calls') + ' not yet logged this month', go: 'consumers', people: byDue(monthDue) },
        ...dhssChanges(consumers, now),
        ...(data.checks ? checklistDue(data.checks, now) : [])
      ].filter(Boolean),
      clear: 'Contacts and visits are up to date.'
    });

    const pipeline = data.pipeline || [];
    // The server also hands over website leads the page has not pulled in yet
    // (nobody has opened the hub since they came in). They are waiting too.
    const calls = data.calls || [];
    const notPulled = (data.siteLeads || []).filter(r => r && !r.archived && !pipeline.some(p => p && p.siteLeadId === r.id) && !calledFor(calls, r.id));
    const waiting = pipeline.filter(p => leadWaiting(p, calls)).map(p => ({ name: p.name, county: p.county || '', at: p.addedAt || p.firstContact || '', id: p.id, act: 'lead' }))
      .concat(notPulled.map(r => ({ name: siteLeadName(r), county: r.county || '', at: r.submitted_at || '' })));
    const follow = pipeline.filter(p => followDue(p, todayIso));
    const fuNow = (Array.isArray(data.followups) ? data.followups : []).filter(f => !f.later || f.later <= todayIso);
    const urgentFu = fuNow.filter(f => f.urgent), otherFu = fuNow.filter(f => !f.urgent);
    const fuPerson = f => ({ name: (f.name || 'Unknown number') + (f.owner ? ' (' + f.owner + ')' : ''), county: '', at: f.since || '' });
    steps.push({
      n: 4, title: 'Call the people waiting',
      items: [
        waiting.length && { t: waiting.length + ' new ' + (waiting.length !== 1 ? 'enquiries' : 'enquiry') + ' from the website, never contacted', go: 'pipeline', bad: true,
                            people: waiting },
        ...leadDeadlines(pipeline, calls, todayIso),
        // "Follow-ups" is the calls-and-texts tab, so a lead's call-back date says "call back" (10-22).
        follow.length  && { t: plural(follow.length, 'lead', 'leads') + ' to call back today or overdue', go: 'pipeline',
                            people: follow.map(p => ({ name: p.name, county: p.county || '', at: '', id: p.id, act: 'lead', due: p.followup || '' })) },
        // Communication Center (2026-10-22): missed calls and unanswered texts. Only handed in once
        // setting comm_center.live is true, by the hub and the 8am email alike. Step 2: care or safety
        // cards first, with whose they are; cards moved to a later day are left out until that day.
        urgentFu.length &&
          { t: plural(urgentFu.length, 'care or safety call or text', 'care or safety calls and texts') + ' today', go: 'followups', bad: true,
            people: urgentFu.map(fuPerson) },
        otherFu.length &&
          { t: plural(otherFu.length, 'call or text', 'calls and texts') + ' to follow up', go: 'followups', bad: true,
            people: otherFu.map(fuPerson) }
      ].filter(Boolean),
      clear: 'Nobody is waiting on a call.'
    });

    // Only the hub knows first shifts (data.firstShiftOf); the email skips this step.
    if (typeof data.firstShiftOf === 'function') {
      const prep = consumers.map(c => ({ c, p: firstShiftPrep(c, data.firstShiftOf(c)) })).filter(x => x.p.applies);
      const notReady = prep.filter(x => !x.p.firstShift && !x.p.ready);
      const why = prep.filter(x => x.p.needsReason);
      steps.push({
        n: 5, title: 'Get new consumers ready for the first shift',
        items: [
          notReady.length && { t: plural(notReady.length, 'new consumer', 'new consumers') + ' not ready for the first shift yet', go: 'consumers',
                               bad: notReady.some(x => x.p.start && x.p.start <= todayIso),
                               people: notReady.map(x => ({ name: x.c.name, county: x.c.county || '', at: x.p.start, id: x.c.id, act: 'profile', due: x.p.start || '' })) },
          why.length && { t: plural(why.length, 'late start needs', 'late starts need') + ' a reason written down', go: 'consumers', bad: true,
                          people: why.map(x => ({ name: x.c.name, county: x.c.county || '', at: x.p.firstShift, id: x.c.id, act: 'profile' })) }
        ].filter(Boolean),
        clear: 'New consumers are ready.'
      });
    }
    // Attendants (her ask 2026-10-22, build step 3 of the hub audit): only when the caller hands
    // the attendant work in (the hub after it loads, the 8am email from the database).
    if (data.attendantWork) {
      const items = attendantWork(data.attendantWork, now);
      steps.push({ n: steps.length + 1, title: 'Attendants', items, clear: 'Nothing is waiting on the office for attendants.' });
    }
    // Closings, pauses and missing shifts (closure plan step 5, her yes 2026-10-22). Only shown
    // when there is something to do, so a morning with none keeps the old steps.
    const closing = closureItems(data.consumers || [], now, data.noShift);
    if (closing.length) steps.push({ n: steps.length + 1, title: 'Closings, pauses and missing shifts', items: closing,
                                     clear: 'No closings or missing shifts.' });
    // Who owns each part of Today (build step 5, 2026-10-23). Her call 2026-10-21: everything is
    // Zach's in the end, but the state and the money stay hers until she hands them over.
    // data.owners = agency_data 'todayOwners'.owners, set in Settings by Samantha.
    const PART = { 'Clear anything the state is waiting on': 'state', 'Protect the money': 'money', 'Keep the case files clean': 'files',
                   'Call the people waiting': 'calls', 'Get new consumers ready for the first shift': 'firstshift', 'Attendants': 'attendants',
                   'Closings, pauses and missing shifts': 'closings' };
    const owners = Object.assign({}, TODAY_OWNERS, data.owners || {});
    steps.forEach(st => { st.k = PART[st.title] || ''; st.owner = String(owners[st.k] || '').toLowerCase(); });
    return steps;
  }
  const TODAY_OWNERS = { state: 'samantha@mo-care.com', money: 'samantha@mo-care.com', files: 'zach@caringcds.com', calls: 'zach@caringcds.com',
                         firstshift: 'zach@caringcds.com', attendants: 'zach@caringcds.com', closings: 'zach@caringcds.com' };
  const TODAY_PARTS = [['state', 'The state'], ['money', 'The money'], ['files', 'Case files'], ['calls', 'Calls'],
                       ['firstshift', 'First shifts'], ['attendants', 'Attendants'], ['closings', 'Closings and missing shifts']];


  // ---------- compliance checklist cycles and yearly agency dates (build step 5, 2026-10-23) ----------
  // A recurring box counts only when ticked in its current period; a tick saves { at, by }. A plain
  // true from before dates were kept counts for one-time boxes only (nobody knows when it was done).
  // today: show on Today's step 3 when not done and the period ends within that many days
  // (0 = do not show: tracked per consumer already, or a report that is on step 1). The yearly HIPAA
  // training and disaster plan review are her yearly agency dates (AGENCY_DATES), not boxes here.
  const CHECK_CYCLES = {
    audit1: { every: 'week',    label: 'Weekly review of EVV records, tasks, visit notes and care plans', today: 7 },
    audit2: { every: 'quarter', label: 'Quarterly audit of billing, participant funds and grievance reports', today: 21 },
    audit3: { every: 'quarter', label: 'Quarterly payroll audit, employment taxes included', today: 21 },
    audit4: { every: 'month',   label: 'Monthly case management contact with each participant', today: 0 },
    rec2:   { every: 'month',   label: 'Monthly contact documented in each consumer file', today: 0 },
    audit5: { every: 'year',    label: 'Annual face-to-face home visit with each participant', today: 0 },
    rec3:   { every: 'year',    label: 'Annual face-to-face visits documented', today: 0 },
    fin2:   { every: 'year',    label: 'Annual CPA audit', today: 0 },
    fin3:   { every: 'quarter', label: 'Quarterly Financial & Service Reports', today: 0 },
    fin4:   { every: 'year',    label: 'Annual Service Report', today: 0 },
    emg3:   { every: 'year',    label: 'Consumer backup plans reviewed and updated', today: 45 },
    staff4: { every: 'year',    label: 'All staff credentials and licenses current', today: 45 }
  };
  // The last day of the period (Sunday to Saturday week, calendar month, quarter, year) a date is in.
  function periodEnd(every, iso) {
    const d = new Date(iso + 'T12:00:00');
    if (every === 'week') d.setDate(d.getDate() + (6 - d.getDay()));
    else if (every === 'month') { d.setMonth(d.getMonth() + 1, 0); }
    else if (every === 'quarter') { d.setMonth(Math.floor(d.getMonth() / 3) * 3 + 3, 0); }
    else if (every === 'year') { d.setMonth(12, 0); }
    return isoLocal(d);
  }
  function checkCurrent(key, rec, now) {
    const c = CHECK_CYCLES[key];
    if (!rec) return false;
    if (!c) return true;                                   // one-time box: ticked is ticked
    const at = typeof rec === 'object' && rec.at ? String(rec.at).slice(0, 10) : '';
    if (!at) return false;                                 // ticked before dates were kept: tick again to record when
    const today = isoLocal(now || new Date());
    return periodEnd(c.every, at) === periodEnd(c.every, today);
  }
  function checklistDue(checks, now) {
    const today = isoLocal(now || new Date()), ppl = [];
    Object.entries(CHECK_CYCLES).forEach(([key, c]) => {
      if (!c.today || checkCurrent(key, (checks || {})[key], now)) return;
      const end = periodEnd(c.every, today);
      if (daysBetween(today, end) <= c.today) ppl.push({ name: c.label, why: 'this ' + c.every, due: end, key, act: 'checklist' });
    });
    return ppl.length ? [{ t: plural(ppl.length, 'checklist item', 'checklist items') + ' due this period', go: 'compliance',
                           people: ppl.sort((a, b) => a.due.localeCompare(b.due)) }] : [];
  }
  // Yearly agency dates she types in on the Deadlines page (her picks 2026-10-23). agencyDates =
  // agency_data 'agencyDates' { [key]: { due: 'yyyy-mm-dd', done: 'yyyy-mm-dd'? } }. Shown on step 1
  // from 30 days before until marked done; no date typed in yet = shown as a records gap, once.
  const AGENCY_DATES = [['license', 'License renewal'], ['insurance', 'Insurance renewal'],
                        ['policy', 'Policy and disaster plan review'], ['training', 'Staff and HIPAA training']];
  function agencyDatesDue(agencyDates, now) {
    const today = isoLocal(now || new Date()), due = [], missing = [];
    AGENCY_DATES.forEach(([key, label]) => {
      const r = (agencyDates || {})[key] || {};
      if (!r.due) { missing.push(label); return; }
      if (r.done && r.done >= addDays(r.due, -60)) return;   // done for this due date
      const n = daysBetween(today, r.due);
      if (n <= 30) due.push({ name: label, why: n < 0 ? 'late' : n === 0 ? 'due today' : plural(n, 'day', 'days') + ' left', due: r.due, key, act: 'agencydate' });
    });
    return [
      due.length && { t: plural(due.length, 'yearly agency date', 'yearly agency dates') + ' coming up', go: 'calendar', bad: due.some(x => x.due < today), people: due },
      missing.length && { t: 'Add the yearly agency dates on the Deadlines page: ' + missing.join(', '), go: 'calendar' }
    ].filter(Boolean);
  }

  // ---------- approved due dates (her answers 2026-10-23, build step 4 of the hub audit) ----------
  // EVV forms and payroll. data.evv = { corrections (agency_data evvCorrections), submissions
  // (evv_submissions not processed) }; data.payroll = { runs (payrollTotals.runs), registers
  // (attendantWages.registers) }. Each only when handed in.
  function evvAndPayroll(data, now) {
    const today = isoLocal(now), out = [];
    if (data.evv) {
      const ppl = [];
      (data.evv.submissions || []).filter(x => x && !x.processed).forEach(x => {
        const d = String(x.visitdate || '').slice(0, 10), miss = [!x.sig_consumer && 'the consumer', !x.sig_attendant && 'the attendant'].filter(Boolean);
        ppl.push({ name: x.consumer || 'EVV form', why: miss.length ? 'needs ' + miss.join(' and ') + ' to sign' : 'signed form to review and fix in WellSky',
                   due: d ? payWeekEnd(d) : '', act: 'evv' });
      });
      (data.evv.corrections || []).filter(c => c && c.wellskyDone !== 'yes' && c.status !== 'denied').forEach(c => {
        const d = String(c.visitdate || '').slice(0, 10);
        ppl.push({ name: c.consumer || 'EVV form', why: 'form on file, fix the shift in WellSky', due: d ? payWeekEnd(d) : '', act: 'evv' });
      });
      if (ppl.length) out.push({ t: plural(ppl.length, 'EVV form', 'EVV forms') + ' to finish (due Saturday 11:59 PM of that pay week)', go: 'evvcorrections',
                                 bad: ppl.some(p => p.due && p.due < today), people: ppl.sort((a, b) => (a.due || '9').localeCompare(b.due || '9')) });
    }
    if (data.payroll) {
      // Upload each payroll's Check Register and Payroll Summary the day after payday. Paydays drift
      // around holidays, so the next one is expected 7 days after the last uploaded, due the day after.
      const last = k => (data.payroll[k] || []).map(r => mdy(r.checkDate)).filter(Boolean).sort().pop() || '';
      const sum = last('runs'), reg = last('registers');
      const have = [sum, reg].filter(Boolean).sort()[0];
      if (have) {
        const due = addDays(have, 8);
        if (due <= today) out.push({ t: 'Upload the latest Empeon payroll', go: 'payroll', bad: due < today,
          people: [{ name: 'Check Register and Payroll Summary', why: 'last payroll on file paid ' + monDay(have) + (sum !== reg ? ' (one of the two is older)' : ''), due, act: 'payroll' }] });
      }
    }
    return out;
  }
  // A check-in call that found a change in health or circumstances: report it to DHSS within 10 days.
  // The call log keeps dhssFlag; Reported on Today saves dhssReported on that log.
  function dhssChanges(consumers, now) {
    const today = isoLocal(now), ppl = [];
    (consumers || []).forEach(c => Object.entries(c.contacts || {}).forEach(([month, log]) => {
      if (!log || !log.dhssFlag || log.dhssReported) return;
      const d = String(log.date || '').slice(0, 10) || month + '-01';
      ppl.push({ name: c.name, id: c.id, month, why: 'change found on the ' + monDay(d) + ' call' + (log.healthNotes || log.circNotes ? ': ' + String(log.healthNotes || log.circNotes).slice(0, 80) : ''),
                 due: addDays(d, 10), act: 'dhss' });
    }));
    // A face-to-face visit that found services not given as authorized (rec.dhss, 2026-10-23 audit file):
    // reported the same way; month = 'visit:<index in homeVisits>' so Reported finds the visit.
    (consumers || []).forEach(c => (Array.isArray(c.homeVisits) ? c.homeVisits : []).forEach((v, i) => {
      if (!v || !v.dhss || v.dhssReported || !v.date) return;
      ppl.push({ name: c.name, id: c.id, month: 'visit:' + i, why: 'visit ' + monDay(v.date) + ' found services not given as authorized',
                 due: addDays(v.date, 10), act: 'dhss' });
    }));
    return ppl.length ? [{ t: plural(ppl.length, 'change', 'changes') + ' to report to DHSS (10 days from the call)', go: 'consumers',
                           bad: ppl.some(p => p.due <= today), people: ppl.sort((a, b) => a.due.localeCompare(b.due)) }] : [];
  }
  // Leads: waiting on the state over 21 days (call DSDS), and leads already reached with no call back
  // date (set one within 1 business day of the last contact). Same rule as the Leads page cards.
  function leadDeadlines(pipeline, calls, todayIso) {
    const state = [], noDate = [];
    (pipeline || []).forEach(p => {
      if (!p) return;
      const k = leadCard(p, calls, todayIso, !!p.movedToConsumers);
      if (k.step === 'state' && p.stateSubmit && daysBetween(p.stateSubmit, todayIso) > 21)
        state.push({ name: p.name, id: p.id, why: 'sent to the state ' + monDay(p.stateSubmit) + ', call DSDS', due: addDays(p.stateSubmit, 21), act: 'lead' });
      if (k.step === 'call' && !p.followup && !leadWaiting(p, calls)) {
        const notes = (p.notes || []).filter(n => n && n.date && !isFormNote(n)).map(n => String(n.date).slice(0, 10)).sort();
        const lastTouch = notes.pop() || String(p.addedAt || p.firstContact || '').slice(0, 10) || todayIso;
        noDate.push({ name: p.name, id: p.id, why: 'no call back date set', due: addBusinessDays(lastTouch, 1), act: 'lead' });
      }
    });
    const byD = l => l.sort((a, b) => a.due.localeCompare(b.due));
    return [
      state.length && { t: plural(state.length, 'lead', 'leads') + ' waiting on the state over 21 days', go: 'pipeline', bad: true, people: byD(state) },
      noDate.length && { t: plural(noDate.length, 'lead needs', 'leads need') + ' a call back date', go: 'pipeline', bad: noDate.some(x => x.due < todayIso), people: byD(noDate) }
    ].filter(Boolean);
  }

  // ---------- Attendants on Today and in the 8am email (2026-10-22) ----------
  // w = { tasks, applications?, roster, autoOig? }
  //   tasks: open office to-dos from cds_tasks (area 'match') { id, kind, title, due_at, pool_id, caregiver }.
  //          packet_* are the new-attendant steps (run checks, Empeon invite, ID call); oig_check is an
  //          OIG possible match (or the OIG check failing), which is same-day work.
  //   applications: the hub's packetList rows (the email has none): anyone waiting on the office
  //          with no open to-do yet (FCSR findings, Finish in Empeon: I-9 Section 2 and countersign).
  //   roster: Roster attendants not marked inactive { id, name, leieDate, edlDate, fcsrDate }.
  //   autoOig: { [id]: 'yyyy-mm-dd' } the day the automatic OIG check last found them clear.
  // Recheck rule as on the Active Attendants page (hub-packet.js rosterDue): OIG monthly, EDL every
  // 3 months, FCSR yearly; "due soon" is within 7 days; a date never typed in is a records gap.
  const RECHECKS = [['OIG', 'leieDate', 1], ['EDL', 'edlDate', 3], ['FCSR', 'fcsrDate', 12]];
  const OUR_LABELS = ['FCSR findings', 'Run EDL and FCSR', 'Send Empeon invite', 'Finish in Empeon', 'ID check booked'];
  function attendantChecks(a, autoOig, now) {
    const today = isoLocal(now), soon = isoLocal(new Date(now.getTime() + 7 * DAY));
    const addM = (iso, m) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return isoLocal(d); };
    return RECHECKS.map(([k, f, m]) => {
      let d = a[f] || '';
      if (k === 'OIG' && autoOig && (!d || autoOig > d)) d = autoOig;
      const due = d ? addM(d, m) : '';
      return { k, done: d, due, late: !!d && due < today, soon: !!d && due >= today && due <= soon, missing: !d };
    });
  }
  function attendantWork(w, now) {
    now = now || new Date();
    const today = isoLocal(now);
    const day = iso => iso ? isoLocal(new Date(iso)) : '';
    const tasks = (w.tasks || []).filter(t => t && !t.done_at);
    const oig = tasks.filter(t => t.kind === 'oig_check');
    const steps = tasks.filter(t => /^packet_/.test(t.kind));
    const withTask = new Set(steps.map(t => t.pool_id).filter(Boolean));
    const taskWho = t => ({ name: t.caregiver || 'New attendant', why: t.title, due: day(t.due_at), id: t.id, pool: t.pool_id || '', act: 'task' });
    // I-9 Section 2 is due 3 business days after the first day worked (federal rule). The hub knows
    // first shifts from WellSky (w.firstShift by lowercased name); anyone not active who already worked is late or due.
    const i9 = (w.applications || []).filter(a => a && !a.active && w.firstShift && w.firstShift[String(a.name || '').toLowerCase()])
      .map(a => { const f = w.firstShift[String(a.name).toLowerCase()];
        return { name: a.name, why: 'worked ' + monDay(f) + ' before onboarding was finished. Complete I-9 Section 2 in Empeon.', due: addBusinessDays(f, 3), act: 'attendant', pool: a.pool_id }; });
    const i9Pools = new Set(i9.map(x => x.pool));
    const ours = (w.applications || []).filter(a => a && !a.active && OUR_LABELS.includes(a.label) && !withTask.has(a.pool_id) && !i9Pools.has(a.pool_id));
    const late = [], soon = [], missing = [];
    (w.roster || []).forEach(a => {
      const c = attendantChecks(a, (w.autoOig || {})[a.id], now);
      const L = c.filter(x => x.late), S = c.filter(x => x.soon), M = c.filter(x => x.missing);
      const who = (why, due) => ({ name: a.name, id: a.id, why, due: due || '', act: 'attendant' });
      if (L.length) late.push(who(L.map(x => x.k).join(' and ') + ' overdue', L.map(x => x.due).sort()[0]));
      else if (S.length) soon.push(who(S.map(x => x.k).join(' and ') + ' recheck', S.map(x => x.due).sort()[0]));
      if (M.length) missing.push(who('add the ' + M.map(x => x.k).join(' and ') + ' date' + (M.length > 1 ? 's' : '') + ' from the last check'));
    });
    const byDue = l => l.sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || String(a.name).localeCompare(String(b.name)));
    return [
      w.error && { t: 'The attendant to-dos could not be read: ' + w.error, go: 'activeattendants', bad: true },
      i9.length && { t: plural(i9.length, 'attendant', 'attendants') + ' worked before I-9 Section 2 was done (3 business days)', go: 'activeattendants', bad: true, people: i9 },
      oig.length && { t: plural(oig.length, 'OIG possible match', 'OIG possible matches') + ' to decide today', go: 'activeattendants', bad: true,
                      people: byDue(oig.map(t => Object.assign(taskWho(t), { name: t.caregiver || 'OIG check', act: 'oig' }))) },
      steps.length && { t: plural(steps.length, 'office step', 'office steps') + ' for new attendants', go: 'activeattendants',
                        bad: steps.some(t => /^Consumer waiting/.test(t.title) || (t.due_at && day(t.due_at) <= today)),
                        people: byDue(steps.map(taskWho)) },
      ours.length && { t: plural(ours.length, 'new attendant', 'new attendants') + ' waiting on the office', go: 'activeattendants',
                       bad: ours.some(a => a.consumer_waiting),
                       people: ours.map(a => ({ name: a.name, why: (a.consumer_waiting ? 'consumer waiting. ' : '') + (a.next || a.label), act: 'attendant', pool: a.pool_id })) },
      late.length && { t: plural(late.length, 'attendant', 'attendants') + ' with a background recheck overdue', go: 'activeattendants', bad: true, people: byDue(late) },
      soon.length && { t: plural(soon.length, 'background recheck', 'background rechecks') + ' due in the next 7 days', go: 'activeattendants', people: byDue(soon) },
      missing.length && { t: plural(missing.length, 'attendant', 'attendants') + ' with a check date not on file', go: 'activeattendants', people: missing }
    ].filter(Boolean);
  }

  // One line per consumer who is Closing or Paused: the next thing the rules need. Plus the
  // consumers with no worked shift in 30+ days whom nobody has told DSDS about yet
  // (noShift = CDSWellSky.noShifts(...); the hub hands it in, the email does not yet).
  // Items with id open that consumer's profile in the hub.
  function closureItems(consumers, now, noShift) {
    const todayIso = isoLocal(now || new Date());
    const day = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const items = [];
    (consumers || []).filter(c => c && c.ending && isActive(c)).sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(c => {
      const e = c.ending, r = endingReason(e.kind);
      if (!r) return;
      const d = e.steps || {};
      const it = (t, bad) => items.push({ t: c.name + ': ' + t, go: 'consumers', id: c.id, bad: !!bad });
      if (r.pause) return it('paused (' + r.t.toLowerCase() + ')' + (d.dsdsTold && d.dsdsTold.date ? '. Mark them back home when they are.' : '. Tell DSDS about the stay.'), !(d.dsdsTold && d.dsdsTold.date));
      if (r.group === 'tell' && !(d.dsds && d.dsds.date)) return it('tell DSDS right away (' + r.t.toLowerCase() + ')', true);
      const miss = endingMissing(e);
      if (miss.length) return it('next, ' + miss[0].charAt(0).toLowerCase() + miss[0].slice(1), true);
      if (r.noDsds) return it('ready to mark inactive (no open authorization with us)', true);
      if (!e.dsdsNotice) return it('waiting on DSDS to decide. Keep serving them.', false);
      const appeal = appealEnds(e.dsdsNotice);
      if (appeal >= todayIso) return it('the appeal window ends ' + day(appeal) + '. Keep serving them until then.', false);
      if (!e.lastDay) return it('enter the last day of services from DSDS', true);
      return it('DSDS closed the case. Mark them inactive.', true);
    });
    const notTold = ((noShift && noShift.people) || []).filter(p => {
      const c = (consumers || []).find(x => x.id === p.id);
      return !(c && c.noShiftReport && c.noShiftReport.date);
    });
    if (notTold.length) items.push({ t: plural(notTold.length, 'consumer', 'consumers') + ' with no worked shift in ' + noShift.days + '+ days, DSDS not told: ' +
                                       notTold.map(p => p.name).join(', '), go: 'consumers', bad: true,
                                     people: notTold.map(p => ({ name: p.name, county: '', at: p.last || '', id: p.id, act: 'profile' })) });
    return items;
  }

  // Her checklist (2026-10-21) for a new consumer between approval and the first
  // shift. The authorization and tasks must be in WellSky before the start date.
  const PREP_STEPS = [
    { k: 'carePlan',     t: 'Get the care plan' },
    { k: 'tasks',        t: 'Get the list of tasks' },
    { k: 'shiftStyle',   t: 'Ask: set shifts, or shifts as needed?' },
    { k: 'authWellSky',  t: 'Put the authorization in WellSky', beforeStart: true },
    { k: 'tasksWellSky', t: 'Put the tasks in WellSky', beforeStart: true },
    { k: 'toldClockIn',  t: 'Tell them they can call us for help with the first clock-in' }
  ];
  // Ending or pausing services (her yes 2026-10-22). Only DSDS closes a CDS case
  // (19 CSR 15-8.400(6)(B) and (7)(B)); we tell DSDS, may pause for listed
  // reasons, and ask for closure in writing. Each reason lists the steps the
  // rules require. A step with need: true must have a date before the hub lets
  // anyone mark the consumer closed. DSDS form: the online Care Plan Change
  // Request, Closure section.
  const DSDS_FORM = 'https://modhss.entellitrak.com/etk-modhss-prod/page.request.do?page=portal.pccpRequest';
  const DSDS_PHONE = '866-835-3505';
  const ENDING_GROUPS = [
    { id: 'tell',     t: 'Tell DSDS right away', cite: '19 CSR 15-8.400(6)' },
    { id: 'pause',    t: 'We may pause services, after telling DSDS', cite: '19 CSR 15-8.400(7)(A)' },
    { id: 'other',    t: 'Other reasons', cite: '' },
    { id: 'hospital', t: 'Short stay away, not an ending', cite: '' }
  ];
  const S = {
    learned:  { k: 'learned',  t: 'Date we found out', need: true },
    dsds:     { k: 'dsds',     t: 'Told DSDS on the online Care Plan Change Request form (Closure section)', need: true, form: true },
    letter:   { k: 'letter',   t: 'Written notice with the specific reasons sent to the consumer AND DSDS', need: true, cite: '19 CSR 15-8.400(7)(B)', print: true },
    paused:   { k: 'paused',   t: 'Services paused (only after DSDS was told)', cite: '19 CSR 15-8.400(7)(A)' },
    fixTried: { k: 'fixTried', t: 'We tried to fix it first (write what we did in the notes)', need: true },
    file:     { k: 'file',     t: 'Proof saved in the consumer file (kept 6 years)', need: true, cite: '19 CSR 15-8.400(10)' }
  };
  const ENDING_REASONS = [
    { id: 'death', group: 'tell', t: 'The consumer died', cite: '19 CSR 15-8.400(6)(A)1', eventLabel: 'Date of death',
      steps: [S.learned, S.dsds, S.file] },
    { id: 'facility', group: 'tell', t: 'Moved into a nursing home or other long-term care facility', letter: 'You moved into a nursing home or other long-term care facility. CDS is a service for people living in their own home.',
      cite: '19 CSR 15-8.400(6)(A)2', eventLabel: 'Date they moved in',
      steps: [S.learned, S.dsds, S.file] },
    { id: 'noNeed', group: 'tell', t: 'No longer needs services', letter: 'You no longer need the help that CDS provides.',
      cite: '19 CSR 15-8.400(6)(A)3',
      steps: [S.learned, S.dsds, S.file] },
    { id: 'selfDirect', group: 'tell', t: 'Can no longer direct their own care, or a big change needs a new care plan', letter: 'You are no longer able to direct your own care (hire, train, schedule and supervise your attendant), and no representative is directing it for you. CDS requires this.',
      cite: '19 CSR 15-8.400(6)(A)4 and (7)(A)1',
      tip: 'Ask first if a representative can direct care for them. DSDS decides.',
      steps: [S.learned, S.dsds, S.paused, S.file] },
    { id: 'moreHours', group: 'tell', t: 'Needs more hours than the plan allows to be safe', letter: 'The care you need to be safe is more than the hours your care plan allows.',
      cite: '19 CSR 15-8.400(6)(A)5',
      steps: [S.learned, S.dsds, S.file] },
    { id: 'fraud', group: 'pause', t: 'Fraud or false records, including false EVV', letter: 'Records for your services were falsified. This may include false clock-in or clock-out (EVV) records. Missouri rules treat false records as fraud.',
      cite: '19 CSR 15-8.400(7)(A)2 and (5)(B)5',
      tip: 'False EVV counts as fraud and is also reported to MMAC.',
      steps: [S.learned, S.dsds, S.letter, S.paused, { k: 'mmac', t: 'Reported to MMAC', need: true }, S.file] },
    { id: 'noncompliance', group: 'pause', t: 'Keeps not following the care plan', letter: 'There have been repeated actions that go against your care plan and keep the services from working.',
      cite: '19 CSR 15-8.400(7)(A)3 and 15-8.200(8)(C)',
      tip: 'Persistent actions that undo the services. Missed monthly calls, a refused visit or unsigned EVV count here when they keep happening.',
      steps: [S.learned, S.fixTried, S.dsds, S.letter, S.paused, S.file] },
    { id: 'threats', group: 'pause', t: 'The consumer or someone in the home threatened or abused the attendant or our staff', letter: 'Your attendant or our staff were threatened or abused by you or someone in your home, and our efforts to correct it did not work.',
      cite: '19 CSR 15-8.400(7)(A)4 and RSMo 208.924.1(4)',
      tip: 'Corrective action must have failed first.',
      steps: [S.learned, S.fixTried, S.dsds, S.letter, S.paused, S.file] },
    { id: 'attendant', group: 'pause', t: 'The attendant is not following the care plan', letter: 'Your attendant is not giving your care the way your care plan says, and our efforts to fix it did not work.',
      cite: '19 CSR 15-8.400(7)(A)5',
      tip: 'Attempts to fix it must have failed first.',
      steps: [S.learned, S.fixTried, S.dsds, S.letter, S.paused, S.file] },
    { id: 'asked', group: 'other', t: 'The consumer asked to stop services', letter: 'You asked us to stop your CDS services. DSDS requires you to call them at 866-835-3505 to confirm.',
      cite: 'HCBS Manual 4.40, voluntary withdrawal',
      steps: [S.learned, S.dsds, { k: 'confirm', t: 'Consumer called DSDS to confirm (' + DSDS_PHONE + ')', need: true }, S.file] },
    { id: 'noAttendant', group: 'other', t: 'No attendant, and they do not want our help finding one', letter: 'You do not have an attendant, so you are not receiving the services in your care plan. We offered to help you find one, and you told us you do not want that help.',
      cite: '19 CSR 15-8.400(5)(A), (B), (F)1; HCBS Manual 4.40',
      tip: 'No rule sets a number of days. Log every offer of help and their answer first.',
      steps: [S.learned, { k: 'offers', t: 'Offers of help to find an attendant logged (date, what we offered, their answer)', need: true },
              { k: 'notServed', t: 'Told DSDS services are not being given as authorized', need: true, cite: '19 CSR 15-8.400(5)(F)1' },
              S.dsds, S.letter, S.file] },
    { id: 'medicaid', group: 'other', t: 'Lost Medicaid', letter: 'Your MO HealthNet (Medicaid) coverage has ended. It is required for CDS.',
      cite: '19 CSR 15-8.200(1)(A)7; HCBS Manual 4.40',
      steps: [S.learned, S.dsds, S.file] },
    { id: 'moved', group: 'other', t: 'Moved out of our area or out of state', letter: 'You moved outside the area we serve.',
      cite: 'HCBS Manual 4.20 and 5.00',
      steps: [S.learned, S.dsds, S.file] },
    { id: 'transfer', group: 'other', t: 'Moving to another CDS agency', letter: 'You chose to move your CDS services to another agency.',
      cite: 'HCBS Manual 4.20',
      tip: 'Keep serving until DSDS approves the new agency. The new agency may not start before that.',
      steps: [S.learned, { k: 'newAgency', t: 'DSDS approved the new agency (write its name in the notes)', need: true }, S.file] },
    // Her ask 2026-10-22 (roster cleanup): consumers on the hub roster with no open
    // authorization with us. DSDS has no case of ours to close, so there is no DSDS
    // notice; we record what Fusion showed and keep the proof (19 CSR 15-8.400(10)).
    { id: 'authEnded', group: 'other', t: 'Authorization already ended, or never started with us', noDsds: true,
      cite: 'No open DSDS case with us, so nothing for DSDS to close. Records: 19 CSR 15-8.400(10)',
      tip: 'Only use this after Fusion shows no open authorization with Caring Companions. If one is open, pick another reason.',
      steps: [{ k: 'fusion', t: 'Checked Fusion: no open authorization with us (write what Fusion showed in the notes)', need: true }, S.file] },
    { id: 'hospital', group: 'hospital', t: 'In the hospital or rehab for a short stay', cite: 'HCBS Manual 3.00', pause: true,
      tip: 'Not a closure. No CDS hours or billing for days in the hospital. Tell DSDS.',
      eventLabel: 'Went in on',
      steps: [S.learned, { k: 'dsdsTold', t: 'Told DSDS about the stay', need: true }, { k: 'noBill', t: 'Checked no hours were entered for hospital days' }] }
  ];
  // The written notice to the consumer and DSDS (19 CSR 15-8.400(7)(B): "listing
  // specific reasons"). Returns the parts; the hub fills, edits and prints them.
  function endingLetter(c, ending, today) {
    const r = endingReason(ending && ending.kind);
    if (!r || !r.letter) return null;
    return {
      date: today,
      to: (c.name || '') + (c.mailAddress ? '\n' + c.mailAddress : ''),
      dcn: c.dcn || '',
      subject: 'Request to close your Consumer Directed Services (CDS)',
      opening: 'Dear ' + (c.name || '') + ',\n\nCaring Companions CDS is asking the Missouri Department of Health and Senior Services, Division of Senior and Disability Services (DSDS), to close your Consumer Directed Services with our agency. We are sending this letter to you and to DSDS.',
      reason: r.letter,
      facts: (ending.notes || '').trim(),
      next: 'Only DSDS can close your services. DSDS will review this request.\n' +
            'If DSDS decides to close your services, DSDS will send you a written notice. That notice explains your right to appeal.\n' +
            'Until DSDS decides, please call us with any questions. You may also call DSDS at ' + DSDS_PHONE + '.',
      cite: 'This notice is sent under 19 CSR 15-8.400(7)(B).'
    };
  }
  const endingReason = id => ENDING_REASONS.find(r => r.id === id) || null;
  // The required steps still missing a date, and whether DSDS's closing date is in.
  function endingMissing(ending) {
    const r = ending && endingReason(ending.kind);
    if (!r) return [];
    const d = ending.steps || {};
    const miss = r.steps.filter(s => s.need && !(d[s.k] && d[s.k].date)).map(s => s.t);
    if (r.eventLabel && !r.pause && !ending.eventDate) miss.unshift(r.eventLabel);
    return miss;
  }
  // DSDS's notice gives the consumer 10 days to appeal; a timely appeal keeps services going
  // (19 CSR 15-8.500(3), HCBS Manual 5.00).
  function appealEnds(noticeDate) {
    if (!noticeDate) return '';
    const d = new Date(String(noticeDate).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + 10);
    return d.toISOString().slice(0, 10);
  }

  const LATE_REASONS = ['Waiting on FCSR', 'Waiting on EDL', 'Attendant paperwork', 'Authorization not in yet', 'Consumer not ready', 'Other'];
  const PREP_FROM = Date.parse('2026-10-21T00:00:00-05:00');

  // firstShift = yyyy-mm-dd of the first worked WellSky shift, or null.
  // Applies to consumers added from 2026-10-21 (the hub's id is the time it was
  // added), or anyone the office has started a checklist for.
  function firstShiftPrep(c, firstShift) {
    const prep = (c && c.firstShiftPrep) || {};
    const applies = !!c && (Number(c.id) >= PREP_FROM || !!c.firstShiftPrep);
    const steps = PREP_STEPS.map(s => Object.assign({}, s, { done: !!prep[s.k] }));
    const done = steps.filter(s => s.done).length;
    const start = String((c && c.cdsStartDate) || '').trim();
    const late = !!(firstShift && start && firstShift > start);
    return { applies, steps, done, total: steps.length, ready: done === steps.length,
             shiftStyle: prep.shiftStyleChoice || '', start, firstShift: firstShift || null, late,
             needsReason: applies && late && !(c.lateStart && c.lateStart.reason) };
  }

  // ── The Leads page card (2026-10-21) ──
  // One card per person: which of the three steps they are in, who they are in a
  // sentence, how urgent they are, and what to do next. The page only draws it.
  const LEAD_KINDS = { lead: 'Still deciding', referral: 'New to CDS - Referral', pccp: 'Moving from Another Agency - PCCP' };
  const DONE = ['authorized', 'transfer_complete'];
  const shortDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso + 'T12:00:00') - Date.parse(fromIso + 'T12:00:00')) / DAY);

  // The website form's answers, as a sentence. The form note reads
  // "Who needs care: ...\nMedicaid: ...\nThey said: ...".
  function formWho(text) {
    const get = k => { const m = String(text || '').match(new RegExp('^' + k + ': *(.+)$', 'mi')); return m ? m[1].trim() : ''; };
    const who = get('Who needs care'), med = get('Medicaid'), said = get('They said');
    const parts = [];
    if (/paid caregiver/i.test(who)) parts.push('Wants to be the paid caregiver for someone.');
    else if (/^yes/i.test(who)) parts.push('Needs the care themself.');
    else if (who) parts.push('Who needs care: ' + who + '.');
    if (/^yes/i.test(med)) parts.push('Has Medicaid.');
    else if (/not sure/i.test(med)) parts.push('Medicaid not sure.');
    else if (/^no/i.test(med)) parts.push('No Medicaid yet.');
    else if (med) parts.push('Medicaid: ' + med + '.');
    if (said) parts.push('They said: "' + (said.length > 90 ? said.slice(0, 90) + '...' : said) + '"');
    return parts.join(' ');
  }

  // Which form a website lead filled out (2026-10-31): p.form = { name, at, answers: [[question, answer]] },
  // written by the lead job (lead-forms.js). Older leads without it say "Website form".
  // short: the list's small tag, without the site ("Home page", "Family asking for a caregiver").
  function formLabel(p, short) {
    const name = (p && p.form && p.form.name) || '';
    if (!name) return 'Website form';
    if (!short) return name;
    const tail = name.replace(/^[^:]*:\s*/, '');
    return tail.charAt(0).toUpperCase() + tail.slice(1);
  }
  // Who they are, from the form's answers, when the older form note says nothing (findcdscaregivers
  // families and caregivers). "Who they are" first, then up to three more answers.
  function formAbout(p) {
    const a = p && p.form && Array.isArray(p.form.answers) ? p.form.answers.filter(x => Array.isArray(x) && x[1]) : [];
    if (!a.length) return '';
    const first = a.find(x => x[0] === 'Who they are');
    const rest = a.filter(x => x !== first && !/^(They wrote|Town|Counties|Heard about us)$/.test(x[0])).slice(0, 3);
    return [first ? first[1] + '.' : ''].concat(rest.map(x => x[0] + ': ' + x[1] + '.')).filter(Boolean).join(' ');
  }

  // The day a lead came in, for the card (2026-10-22). A website lead has the exact time
  // (addedAt, shown as the Central day); someone the office added uses the first contact date they typed.
  // The day a lead came in (yyyy-mm-dd), for the Leads sort.
  function cameInIso(p) {
    if (!p) return '';
    const typed = /^\d{4}-\d{2}-\d{2}$/.test(String(p.firstContact || '')) ? p.firstContact : '';
    const at = Date.parse(p.addedAt || '');
    if (p.fromWebsite && !isNaN(at)) return isoLocal(new Date(at));
    if (typed) return typed;
    if (!isNaN(at)) return isoLocal(new Date(at));
    return '';
  }
  // The last day we talked to them: a call note (not the form, not a Who called tap) or a call
  // logged from the lead link page. The hub adds office-line calls and texts on top.
  function lastContactIso(p, calls) {
    const notes = (Array.isArray(p && p.notes) ? p.notes : []).filter(n => n && n.date && !isFormNote(n) && !n.whoCalled && !n.linkNote)
      .map(n => String(n.date).slice(0, 10));
    const logged = p && p.siteLeadId ? (calls || []).filter(c => c && c.site_lead_id === p.siteLeadId && c.at)
      .map(c => isoLocal(new Date(c.at))) : [];
    return notes.concat(logged).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || '';
  }
  function cameIn(p, todayIso) {
    const iso = cameInIso(p);
    if (!iso) return '';
    const sameYear = String(todayIso || '').slice(0, 4) === iso.slice(0, 4);
    return 'Came in ' + new Date(iso + 'T12:00:00').toLocaleDateString('en-US', sameYear
      ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---------- Who called (her approved mockup 2026-10-22, artifact 9FKrkUhoS3cmbTyymKpaSj) ----------
  // A "Still deciding" lead can be one of 5 kinds of caller. The website form answers set it by
  // themselves; the office sets it after the first call (p.whoCalled) and that always wins.
  // "Caregiver, no consumer" is only ever set by the office: no form can tell us that.
  const WHO_CALLED = { pair: 'Caregiver with a consumer', family: 'For a family member', self: 'For themself',
                       unsure: 'Not sure yet', solo: 'Caregiver, no consumer' };
  const WHO_NEXT = {
    pair: 'Get the consumer’s name, phone and Medicaid number. The consumer is the lead; the caller will be their attendant.',
    family: 'Ask about the person needing care: Medicaid, the care they need, and who would be their caregiver.',
    self: 'Ask about Medicaid and the help they need, and if they have a caregiver in mind or need us to find one.',
    unsure: 'Ask: "Are you the person needing care, calling for someone, or wanting to be a caregiver?" Then tap who it was.',
    solo: 'Not a consumer lead. Move them to the Caregiver Pool so we can match them with a consumer who needs someone.'
  };
  function whoCalled(p) {
    if (!p) return 'unsure';
    if (WHO_CALLED[p.whoCalled]) return p.whoCalled;
    const form = (Array.isArray(p.notes) ? p.notes : []).find(n => isFormNote(n));
    const text = form ? String(form.text || '') : '';
    const m = text.match(/^Who needs care: *(.+)$/mi), who = m ? m[1].trim() : '';
    // the caller would be the paid caregiver (eligibility check "person" / "Caregiver situation" answers)
    const callerCares = /would be the caregiver|is the caregiver/i.test(text);
    const hasSomeone = /has someone in mind|already helping/i.test(text);
    if (/wants? to be the (paid )?caregiver|be the paid caregiver|be paid to care/i.test(who)) return hasSomeone ? 'pair' : 'unsure';
    if (/family/i.test(who)) return callerCares ? 'pair' : 'family';
    if (/^(yes|self)\b|i need the care|for myself/i.test(who)) return 'self';
    return 'unsure';
  }

  // ---------- Contacts: family and attendants who call about someone (her ask 2026-10-29) ----------
  // Mockup 6CxaqzDSJABjRYnGxc6tZg. The consumer is the boss, so callers hang under the person who needs
  // care: record.relatedPeople = [{ id, name, phone, role, relation, fromLead, prevStatus, at, by }].
  // (Not "contacts": on a consumer that key already holds the monthly contact logs.)
  // role: family | attendant | other. Linking closes the caller's own lead as closed_linked with
  // p.linkedTo = { kind, id, name }; unlinking reopens it as it was.
  const CONTACT_ROLES = { family: 'Family', attendant: 'Attendant', other: 'Someone else' };
  function relatedPeople(r) { return Array.isArray(r && r.relatedPeople) ? r.relatedPeople.filter(x => x && x.id) : []; }
  // data = { pipeline, consumers } (mutated). target = { kind: 'consumer' | 'lead', id }.
  // opts = { role, relation, phone, by, now (ISO) }. Returns { ok, owner } or { error }.
  function linkLead(data, leadId, target, opts) {
    opts = opts || {};
    const pipeline = data.pipeline || [], consumers = data.consumers || [];
    const lead = pipeline.find(p => p && p.id === leadId);
    if (!lead) return { error: 'That lead is gone.' };
    if (lead.status === 'closed_linked') return { error: (lead.name || 'This lead') + ' is already linked to ' + ((lead.linkedTo || {}).name || 'someone') + '.' };
    if (!target || !target.id) return { error: 'Pick who they called about.' };
    if (target.kind === 'lead' && target.id === leadId) return { error: 'Pick someone else, not the same lead.' };
    const owner = target.kind === 'consumer' ? consumers.find(c => c && String(c.id) === String(target.id))
      : target.kind === 'lead' ? pipeline.find(p => p && p.id === target.id) : null;
    if (!owner) return { error: 'That person is not in the hub.' };
    if (target.kind === 'lead' && CLOSED.includes(owner.status)) return { error: (owner.name || 'That lead') + ' is closed. Reopen them first, or pick someone else.' };
    const role = CONTACT_ROLES[opts.role] ? opts.role : '';
    if (!role) return { error: 'Pick family, attendant or someone else.' };
    const now = opts.now || new Date().toISOString(), by = opts.by || 'office';
    const list = relatedPeople(owner);
    list.push({ id: 'rp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: lead.name || '', phone: opts.phone != null ? String(opts.phone) : (lead.phone || ''),
      role, relation: String(opts.relation || '').trim(), fromLead: lead.id, prevStatus: lead.status || 'new', at: now, by });
    // Anyone already hanging under the caller's lead comes along.
    relatedPeople(lead).forEach(x => list.push(Object.assign({}, x)));
    owner.relatedPeople = list;
    lead.relatedPeople = [];
    lead.linkedTo = { kind: target.kind, id: String(target.id), name: owner.name || '', role };
    lead.status = 'closed_linked';
    lead.closedAt = now;
    lead.followup = '';
    lead.notes = (Array.isArray(lead.notes) ? lead.notes : []).concat({ date: isoLocal(new Date(now)),
      linkNote: true, text: 'Linked to ' + (owner.name || 'someone') + ' as ' + (opts.relation ? opts.relation + ', ' : '') + CONTACT_ROLES[role].toLowerCase() + ' (by ' + by + ').' });
    return { ok: true, owner };
  }
  // The son or daughter called first (her ask 2026-10-29): the lead came in under the caller's name.
  // Turn it into the lead of the person who needs care, keeping everything (notes, call back date,
  // website answers, calls), and put the caller on Contacts. careFor = { name, phone, relation, role }.
  function careFor(lead, cf, opts) {
    opts = opts || {};
    const name = String(cf && cf.name || '').trim();
    if (!lead) return { error: 'That lead is gone.' };
    if (!name) return { error: 'Add the name of the person who needs care.' };
    if (name.toLowerCase() === String(lead.name || '').trim().toLowerCase()) return { error: 'That is the same name as the caller. Type the name of the person who needs care.' };
    const role = CONTACT_ROLES[cf.role] ? cf.role : 'family';
    const now = opts.now || new Date().toISOString(), by = opts.by || 'office';
    const caller = { id: 'rp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: lead.name || 'Caller', phone: lead.phone || '',
      role, relation: String(cf.relation || '').trim(), caller: true, at: now, by };
    lead.relatedPeople = [caller].concat(relatedPeople(lead));
    lead.callerWas = { name: caller.name, phone: caller.phone, at: now, by };
    lead.name = name;
    lead.phone = String(cf.phone || '').trim();   // never the caller's: that number is theirs, on Contacts
    lead.notes = (Array.isArray(lead.notes) ? lead.notes : []).concat({ date: isoLocal(new Date(now)),
      linkNote: true, text: caller.name + (caller.relation ? ' (' + caller.relation + ')' : '') + ' called for ' + name + '. The lead is now ' + name + '; ' + caller.name + ' is on Contacts (by ' + by + ').' });
    return { ok: true, caller };
  }
  // Notes from leads linked to this record, newest last: what the son or daughter told us stays with the client.
  function linkedNotes(owner, pipeline) {
    const out = [];
    relatedPeople(owner).forEach(x => {
      const L = x.fromLead && (pipeline || []).find(p => p && p.id === x.fromLead);
      (L && Array.isArray(L.notes) ? L.notes : []).filter(n => n && n.text && !n.linkNote)
        .forEach(n => out.push(Object.assign({}, n, { from: x.name + (x.relation ? ' (' + x.relation + ')' : '') })));
    });
    return out.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }
  // A contact typed in by hand (no lead behind it).
  function addContact(owner, c, opts) {
    opts = opts || {};
    const name = String(c && c.name || '').trim();
    if (!name) return { error: 'Add their name.' };
    if (!CONTACT_ROLES[c.role]) return { error: 'Pick family, attendant or someone else.' };
    owner.relatedPeople = relatedPeople(owner).concat({ id: 'rp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name,
      phone: String(c.phone || '').trim(), role: c.role, relation: String(c.relation || '').trim(), at: opts.now || new Date().toISOString(), by: opts.by || 'office' });
    return { ok: true };
  }
  // Take a contact off. If they came from a lead, that lead opens again as it was.
  function unlinkContact(data, owner, contactId, opts) {
    opts = opts || {};
    const list = relatedPeople(owner), c = list.find(x => x.id === contactId);
    if (!c) return { error: 'That contact is already gone.' };
    owner.relatedPeople = list.filter(x => x.id !== contactId);
    const lead = c.fromLead ? (data.pipeline || []).find(p => p && p.id === c.fromLead) : null;
    if (lead && lead.status === 'closed_linked') {
      lead.status = c.prevStatus && !CLOSED.includes(c.prevStatus) ? c.prevStatus : 'nurturing';
      delete lead.linkedTo; delete lead.closedAt;
      lead.notes = (Array.isArray(lead.notes) ? lead.notes : []).concat({ date: isoLocal(new Date(opts.now || Date.now())),
        linkNote: true, text: 'Unlinked from ' + (owner.name || 'someone') + ' (by ' + (opts.by || 'office') + '). Open again.' });
    }
    return { ok: true, lead };
  }

  // p = a pipeline record, calls = cds_lead_calls rows, todayIso = yyyy-mm-dd,
  // moved = true when this person is already on the Consumers list.
  // tone: late (red), today (honey), later, none, ready.
  // opts.whoCalled (the Leads switch is on): Still deciding leads get who called and a next step for it.
  function leadCard(p, calls, todayIso, moved, opts) {
    const notes = (Array.isArray(p.notes) ? p.notes : []).filter(Boolean);
    const form = notes.find(n => isFormNote(n));
    const real = notes.filter(n => !isFormNote(n));
    const talk = real.filter(n => !n.whoCalled && !n.linkNote);   // a Who called tap or a link note is not a call note to show
    const last = talk.length ? talk[talk.length - 1] : null;
    const kind = LEAD_KINDS[p.type] || 'Still deciding';
    const closed = CLOSED.includes(p.status);
    const done = DONE.includes(p.status);
    const sent = !done && (p.type === 'referral' || p.type === 'pccp') && (p.status === 'submitted' || p.status === 'processing');
    const step = closed || (done && moved) ? 'closed' : done ? 'ready' : sent ? 'state' : 'call';

    let who = form ? formWho(form.text) : '';
    if (!who) who = formAbout(p);
    if (!who && p.type === 'pccp') who = 'Has CDS now' + (p.leavingAgency || p.currentAgency ? ' with ' + (p.leavingAgency || p.currentAgency) : ' with another agency') + '.';
    if (!who && p.hours) who = p.hours + ' hours a week.';
    // Nothing else known: the last call note says who they are best.
    const clip = t => t.length > 120 ? t.slice(0, 120) + '...' : t;
    const noteIsWho = !who && !!last;
    if (noteIsWho) who = 'Last note: "' + clip(last.text) + '"';
    if (!who) who = 'No details yet. Open the profile to add them.';
    if (step === 'state') who = (p.stateSubmit ? 'Sent to the state ' + shortDay(p.stateSubmit) + '. ' : '') + who;

    const wc = opts && opts.whoCalled && (p.type || 'lead') === 'lead' ? whoCalled(p) : '';
    let due = '', tone = 'none', next = '', sort = 3;
    if (step === 'call') {
      if (leadWaiting(p, calls)) {
        const added = String(p.addedAt || p.firstContact || '').slice(0, 10);
        const old = added && added < todayIso;
        due = 'Not called yet'; tone = old ? 'late' : 'today'; sort = old ? 0 : 1;
        next = 'First call. Find out who needs care and if they have Medicaid.';
        if (wc) next = WHO_NEXT[wc];
      } else {
        if (p.followup && p.followup < todayIso) {
          const n = daysBetween(p.followup, todayIso);
          due = plural(n, 'day', 'days') + ' late'; tone = 'late'; sort = 0;
        } else if (p.followup === todayIso) { due = 'Due today'; tone = 'today'; sort = 1; }
        else if (p.followup) { due = 'Due ' + shortDay(p.followup); tone = 'later'; sort = 4; }
        else { due = 'No call back date'; tone = 'none'; sort = 2; }
        next = p.type === 'referral' ? 'Ask the referral questions, then send it to the state.'
          : p.type === 'pccp' ? 'Get their DCN and enter the transfer in the state portal.'
          : 'Call back and see if they are ready to start.';
        if (!p.followup) next = 'Set a call back date so they are not forgotten. ' + next;
      }
      if (wc === 'solo' || (wc === 'unsure' && !leadWaiting(p, calls))) next = WHO_NEXT[wc];
      if (last && !noteIsWho && !leadWaiting(p, calls)) next += ' Last note: "' + clip(last.text) + '"';
    } else if (step === 'state') {
      if (!p.stateSubmit) { due = 'Sent date missing'; tone = 'today'; sort = 1; next = 'Add the date it went to the state.'; }
      else {
        const n = daysBetween(p.stateSubmit, todayIso);
        due = 'Day ' + n + ' of waiting';
        if (n > 21) { tone = 'late'; sort = 0; next = 'This is taking long. Call DSDS today.'; }
        else if (n > 10) { tone = 'today'; sort = 1; next = 'Check in with the state this week.'; }
        else { tone = 'later'; sort = 4; next = 'Waiting on the state. Nothing to do yet.'; }
      }
    } else if (step === 'ready') {
      due = 'Approved'; tone = 'ready'; sort = 1;
      next = 'Move them to Consumers to start the first shift checklist.';
    } else {
      due = done ? 'On the Consumers list' : p.status === 'closed_linked' && p.linkedTo ? 'Linked to ' + (p.linkedTo.name || 'someone')
        : 'Closed: ' + (CLOSED_LABELS[p.status] || 'closed'); tone = 'none'; sort = 5;
      next = done ? 'Nothing to do here.' : 'Nothing to do. Press Reopen if they come back.';
    }
    // needsToday: a call that should happen today (the Leads summary line).
    const needsToday = (step === 'call' && (tone === 'late' || tone === 'today')) || (step === 'state' && tone === 'late');
    return { step, kind, who, due, tone, next, sort, needsToday, followup: p.followup || '', came: cameIn(p, todayIso),
             cameIso: cameInIso(p), lastIso: lastContactIso(p, calls),
             whoCalled: wc, whoLabel: wc ? WHO_CALLED[wc] : '' };
  }

  // State reports and tax filings with a due date (2026-10-22, her yes; on Today's step 1 since 2026-10-23) from 30 days
  // before until marked Submitted on the Deadlines page. A Submitted mark only counts for the due
  // date it was made for (quarterStatus[key + '_for']), so last year's mark never hides this year's.
  const REPORTS = [
    { key: 'q1',     title: 'Q1 Financial & Service Report (Jan to Mar)', due: y => [y, 4, 30] },
    { key: 'q2',     title: 'Q2 Financial & Service Report (Apr to Jun)', due: y => [y, 7, 31] },
    { key: 'q3',     title: 'Q3 Financial & Service Report (Jul to Sep)', due: y => [y, 10, 31] },
    { key: 'q4',     title: 'Q4 Financial & Service Report (Oct to Dec)', due: y => [y + 1, 1, 31] },
    { key: 'annual', title: 'Annual Service Report',                      due: y => [y + 1, 1, 31] },
    { key: 'des',    title: 'DES wage reports in UInteract, one per registered consumer', quarterly: true },
    // 2026-10-23 (her answers): fiscal year ends Dec 31, so the CPA audit is due 150 days later, May 30.
    { key: 'audit',  title: 'Annual CPA audit (last year, ending Dec 31)', due: y => [y, 5, 30] },
    { key: 'f941',   title: 'Federal 941, one per consumer EIN', quarterly: true },
    { key: 'mo941',  title: 'MO 941, one per consumer EIN', quarterly: true },
    { key: 'w2',     title: 'W-2s to attendants and W-3 to SSA, one per consumer EIN', due: y => [y + 1, 1, 31] },
    { key: 'mow3',   title: 'MO W-3, one per consumer EIN', due: y => [y + 1, 2, 28] }
  ];
  const _iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const QUARTER_DUE = [[4, 30], [7, 31], [10, 31], [1, 31]];
  // The due date a report is "on" right now: the earliest one no more than 55 days past (a late one
  // stays on Today for 55 days, until the next quarter's report is close).
  function reportDue(key, now) {
    now = now || new Date();
    const r = REPORTS.find(x => x.key === key);
    if (!r) return null;
    const today = isoLocal(now), y0 = now.getFullYear(), dates = [];
    for (let y = y0 - 2; y <= y0 + 1; y++) {
      if (r.quarterly) QUARTER_DUE.forEach(([m, d], i) => dates.push(_iso(i === 3 ? y + 1 : y, m, d)));
      else { const [yy, m, d] = r.due(y); dates.push(_iso(yy, m, d)); }
    }
    const days = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(today + 'T12:00:00')) / DAY);
    const due = dates.sort().find(iso => days(iso) >= -55);
    return { key, title: r.title, due, days: days(due) };
  }
  const reportSubmitted = (qs, key, due) => !!qs && qs[key] === 'submitted' && qs[key + '_for'] === due;
  // Reports due within 30 days, or late, and not yet marked Submitted for that due date.
  function reportsDue(quarterStatus, now) {
    return REPORTS.map(r => reportDue(r.key, now))
      .filter(x => x && x.days <= 30 && !reportSubmitted(quarterStatus, x.key, x.due))
      .map(x => Object.assign(x, { late: x.days < 0 }))
      .sort((a, b) => a.days - b.days);
  }

  // The name the hub gives a website lead when it imports it.
  const siteLeadName = r => [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || String(r.full_name || '').trim() || 'Website enquiry';

  // yyyy-mm-dd of a Date in the runtime's own clock (the server passes Central noon).
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- Dashboard numbers (her "keep it and fix", 2026-10-22) ----------
  // Every number on the Dashboard tab reads live data:
  //  consumers  = WellSky: everyone with a worked shift in the last 31 days (wsPeople from
  //               CDSWellSky.consumersNow), matched to hub records by nameKey. Hub records
  //               not seen in WellSky are listed, not counted. No WellSky report yet: the hub list.
  //  check-ins  = the same live consumers, a check-in logged this month (the Communication
  //               Center saves them there too).
  //  screenings = OIG/LEIE counts as current from a monthly check: the hub date OR the
  //               automatic OIG check's clear (oigPeople, only when that switch is on).
  //               FCSR yearly. EDL is not counted (no date kept for it).
  //  checklist  = done out of the real number of items on the checklist.
  //  money      = this month's WellSky authorized hours (personal care), or the hub's
  //               weekly hours x 4.33 when there is no authorization report yet. With
  //               payRange [15, 16] the margin is a range (pay differs by attendant).
  function dashboardNumbers(o) {
    const now = o.now || new Date();
    const key = o.nameKey || (n => String(n || '').toLowerCase().replace(/[^a-z]/g, ''));
    const days = d => (now - new Date(d)) / DAY;
    const hub = (o.consumers || []);
    const a = activeNow(hub, o.wsPeople, key);
    const live = a.live, consumers = a.list;
    let notInWellSky = [], wellSkyOnly = [];
    if (live) {
      const inHub = new Set(hub.map(c => key(c.name)));
      wellSkyOnly = o.wsPeople.filter(p => !inHub.has(p.key)).map(p => p.name);
      const working = new Set(consumers);
      notInWellSky = hub.filter(isActive).filter(c => !working.has(c)).map(c => c.name);
    }
    const count = live ? o.wsPeople.length : consumers.length;
    const ym = isoLocal(now).slice(0, 7);
    const checkedIn = consumers.filter(c => c.contacts && c.contacts[ym]).length;
    // Missed monthly calls in the last 12 months (an auditor counts the months, not the last call).
    // A health number, not a to-do: past months cannot be made up (2026-10-22, was on the old roster).
    const missedMonths = consumers.map(c => ({ name: c.name, id: c.id, missed: ongoingRequirements(c, now).monthly.missed }))
      .filter(x => x.missed >= 2).sort((a, b) => b.missed - a.missed || String(a.name).localeCompare(String(b.name)));
    const atts = (o.attendants || []).filter(a => a.status !== 'inactive');
    const oig = o.oigPeople || {};
    const autoClear = a => { const p = oig['attendant:' + a.id];
      return p && (p.result === 'clear' || p.review === 'not_them') ? String(p.checked_at || '').slice(0, 10) : ''; };
    const within = (a, n) => [a.leieDate, autoClear(a)].some(d => d && days(d) <= n);
    const leieOk = atts.filter(a => within(a, 31)).length;
    const fcsrOk = atts.filter(a => a.fcsrDate && days(a.fcsrDate) <= 365).length;
    // Due soon or late: OIG/LEIE older than 25 days, FCSR older than 335 days, or never done.
    const soon = atts.filter(a => !within(a, 25) || !(a.fcsrDate && days(a.fcsrDate) <= 335)).length;
    const total = o.checklistTotal || 0;
    const done = Object.entries(o.checks || {}).filter(([k, v]) => checkCurrent(k, v, now) && (!o.checklistIds || o.checklistIds.includes(k))).length;
    const authRows = (o.hours || []);
    const fromWellSky = authRows.length > 0;
    const hoursMonth = fromWellSky ? authRows.reduce((s, r) => s + (Number(r.authorized) || 0), 0)
                                   : consumers.reduce((s, c) => s + (parseFloat(c.hours) || 0), 0) * 4.33;
    const rates = o.rates || { billing: 0, pay: 0 };
    const revenue = hoursMonth * rates.billing, labor = hoursMonth * rates.pay;
    // Pay differs by attendant ($15 to $16): margin low = everyone at the top rate, high = everyone at the bottom.
    const pr = o.payRange;
    const range = pr && revenue > 0 ? { low: revenue - hoursMonth * pr[1], high: revenue - hoursMonth * pr[0] } : null;
    return { live, consumers: count, notInWellSky, wellSkyOnly,
             checkIns: { done: checkedIn, of: count, left: Math.max(0, count - checkedIn) }, missedMonths,
             attendants: atts.length, screeningsSoon: soon,
             leie: { ok: leieOk, of: atts.length, auto: atts.filter(a => autoClear(a)).length }, fcsr: { ok: fcsrOk, of: atts.length },
             checklist: { done, of: total },
             money: { hoursMonth, fromWellSky, revenue, labor, margin: revenue - labor,
                      pct: revenue > 0 ? Math.round((revenue - labor) / revenue * 100) : 0, rates, range } };
  }

  root.CDSRules = { einClock, desThreshold, ongoingRequirements, taxDone, leadWaiting, siteLeadWaiting, followDue,
                    dailyRoutine, TODAY_OWNERS, TODAY_PARTS, CHECK_CYCLES, periodEnd, checkCurrent, checklistDue, AGENCY_DATES, agencyDatesDue, isActive, activeNow, attendantWork, attendantChecks, evvAndPayroll, dhssChanges, leadDeadlines, addBusinessDays, isFormNote, siteLeadName, CLOSED, CLOSED_LABELS, cameIn, firstShiftPrep, PREP_STEPS, LATE_REASONS,
                    leadCard, formWho, formLabel, formAbout, LEAD_KINDS, CONTACT_ROLES, relatedPeople, linkLead, addContact, unlinkContact, careFor, linkedNotes, isoLocal, cameInIso, lastContactIso, REPORTS, reportDue, reportSubmitted, reportsDue, dashboardNumbers,
                    whoCalled, WHO_CALLED, WHO_NEXT,
                    DSDS_FORM, DSDS_PHONE, ENDING_GROUPS, ENDING_REASONS, endingReason, endingMissing, appealEnds, endingLetter, closureItems };
})(typeof globalThis !== 'undefined' ? globalThis : this);
