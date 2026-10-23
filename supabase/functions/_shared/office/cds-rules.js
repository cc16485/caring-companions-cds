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
  const CLOSED = ['closed_ni', 'closed_other', 'closed_inactive', 'closed_spam', 'closed_pool'];
  const CLOSED_LABELS = { closed_ni: 'Not interested', closed_other: 'Went with another agency',
                          closed_inactive: 'Inactive, stopped answering', closed_spam: 'Spam, not a real lead',
                          closed_pool: 'Moved to the Caregiver Pool' };  // closed_pool: Who called, 2026-10-22
  // One rule for "active" (2026-10-22): the hub saves "inactive" lowercase and old
  // imports said "Inactive" or "Discharged", so compare without case. The hub uses this too.
  const isActive = c => !!c && !['inactive', 'discharged'].includes(String(c.status || '').toLowerCase());
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
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

    let einLate = 0, einSoon = 0, desDue = 0;
    consumers.forEach(c => {
      if (!taxDone(c)) {
        const k = einClock(c, now);
        if (k.known && k.days < 0) einLate++; else if (k.known && k.days <= 21) einSoon++;
      }
      if (!c.desRegistered) { const d = desThreshold(wages, c.name); if (d.known && d.crossed) desDue++; }
    });
    steps.push({
      n: 1, title: 'Clear anything the state is waiting on',
      items: [
        einLate && { t: plural(einLate, 'consumer', 'consumers') + ' past the 90-day EIN deadline', go: 'taxcompliance', bad: true },
        einSoon && { t: einSoon + ' inside three weeks of it', go: 'taxcompliance' },
        desDue  && { t: desDue + ' past $1,000 in a quarter and not registered with DES', go: 'taxcompliance', bad: true }
      ].filter(Boolean),
      clear: 'Nothing outstanding with the state.'
    });

    const records = (data.authorizations && data.authorizations.records) || {};
    const auths = Object.values(records).filter(a => !data.wsPeople || nowNames.has(String(a.consumer || a.name || '').toUpperCase()));
    const expired = auths.filter(a => a.planEnd && new Date(a.planEnd + 'T12:00:00') < now).length;
    const expiring = auths.filter(a => {
      if (!a.planEnd) return false;
      const d = Math.round((new Date(a.planEnd + 'T12:00:00') - now) / DAY);
      return d >= 0 && d <= 60;
    }).length;
    const noAuth = now31.filter(c => !auths.some(a =>
      String(a.consumer || a.name || '').toUpperCase() === String(c.name).toUpperCase())).length;
    steps.push({
      n: 2, title: 'Protect the money',
      items: [
        noAuth   && { t: noAuth + ' active consumer' + (noAuth !== 1 ? 's have' : ' has') + ' no authorization on file', go: 'authorizations', bad: true },
        expired  && { t: plural(expired, 'authorization', 'authorizations') + ' expired', go: 'authorizations', bad: true },
        expiring && { t: expiring + ' expiring within 60 days', go: 'authorizations' }
      ].filter(Boolean).concat(data.wellskyItems || []),   // the daily WellSky check (wellsky.js items)
      clear: 'Every consumer has a current authorization.'
    });

    let visitsOverdue = 0, visitsSoon = 0, monthDue = 0;
    now31.forEach(c => {
      const r = ongoingRequirements(c, now);
      if (r.annual.overdue) visitsOverdue++;
      else if (r.annual.soon) visitsSoon++;
      if (!r.monthly.doneThisMonth) monthDue++;
    });
    steps.push({
      n: 3, title: 'Keep the case files clean',
      items: [
        visitsOverdue && { t: plural(visitsOverdue, 'annual face-to-face visit', 'annual face-to-face visits') + ' overdue', go: 'consumers', bad: true },
        visitsSoon    && { t: plural(visitsSoon, 'face-to-face visit', 'face-to-face visits') + ' in the last 2 months, book ' + (visitsSoon === 1 ? 'it' : 'them') + ' now', go: 'consumers' },
        monthDue      && { t: plural(monthDue, 'monthly check-in call', 'monthly check-in calls') + ' not yet logged this month', go: 'consumers' }
      ].filter(Boolean),
      clear: 'Contacts and visits are up to date.'
    });

    const pipeline = data.pipeline || [];
    // The server also hands over website leads the page has not pulled in yet
    // (nobody has opened the hub since they came in). They are waiting too.
    const calls = data.calls || [];
    const notPulled = (data.siteLeads || []).filter(r => r && !r.archived && !pipeline.some(p => p && p.siteLeadId === r.id) && !calledFor(calls, r.id));
    const waiting = pipeline.filter(p => leadWaiting(p, calls)).map(p => ({ name: p.name, county: p.county || '', at: p.addedAt || p.firstContact || '' }))
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
        // "Follow-ups" is the calls-and-texts tab, so a lead's call-back date says "call back" (10-22).
        follow.length  && { t: plural(follow.length, 'lead', 'leads') + ' to call back today or overdue', go: 'pipeline',
                            people: follow.map(p => ({ name: p.name, county: p.county || '', at: '' })) },
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
                               people: notReady.map(x => ({ name: x.c.name, county: x.c.county || '', at: x.p.start })) },
          why.length && { t: plural(why.length, 'late start needs', 'late starts need') + ' a reason written down', go: 'consumers', bad: true,
                          people: why.map(x => ({ name: x.c.name, county: x.c.county || '', at: x.p.firstShift })) }
        ].filter(Boolean),
        clear: 'New consumers are ready.'
      });
    }
    // Closings, pauses and missing shifts (closure plan step 5, her yes 2026-10-22). Only shown
    // when there is something to do, so a morning with none keeps the old steps.
    const closing = closureItems(data.consumers || [], now, data.noShift);
    if (closing.length) steps.push({ n: steps.length + 1, title: 'Closings, pauses and missing shifts', items: closing,
                                     clear: 'No closings or missing shifts.' });
    return steps;
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
                                     people: notTold.map(p => ({ name: p.name, county: '', at: p.last || '' })) });
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

  // The day a lead came in, for the card (2026-10-22). A website lead has the exact time
  // (addedAt, shown as the Central day); someone the office added uses the first contact date they typed.
  function cameIn(p, todayIso) {
    if (!p) return '';
    const typed = /^\d{4}-\d{2}-\d{2}$/.test(String(p.firstContact || '')) ? p.firstContact : '';
    const at = Date.parse(p.addedAt || '');
    let iso = '';
    if (p.fromWebsite && !isNaN(at)) iso = isoLocal(new Date(at));
    else if (typed) iso = typed;
    else if (!isNaN(at)) iso = isoLocal(new Date(at));
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

  // p = a pipeline record, calls = cds_lead_calls rows, todayIso = yyyy-mm-dd,
  // moved = true when this person is already on the Consumers list.
  // tone: late (red), today (honey), later, none, ready.
  // opts.whoCalled (the Leads switch is on): Still deciding leads get who called and a next step for it.
  function leadCard(p, calls, todayIso, moved, opts) {
    const notes = (Array.isArray(p.notes) ? p.notes : []).filter(Boolean);
    const form = notes.find(n => isFormNote(n));
    const real = notes.filter(n => !isFormNote(n));
    const talk = real.filter(n => !n.whoCalled);   // a Who called tap is not a call note to show
    const last = talk.length ? talk[talk.length - 1] : null;
    const kind = LEAD_KINDS[p.type] || 'Still deciding';
    const closed = CLOSED.includes(p.status);
    const done = DONE.includes(p.status);
    const sent = !done && (p.type === 'referral' || p.type === 'pccp') && (p.status === 'submitted' || p.status === 'processing');
    const step = closed || (done && moved) ? 'closed' : done ? 'ready' : sent ? 'state' : 'call';

    let who = form ? formWho(form.text) : '';
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
      due = done ? 'On the Consumers list' : 'Closed: ' + (CLOSED_LABELS[p.status] || 'closed'); tone = 'none'; sort = 5;
      next = done ? 'Nothing to do here.' : 'Nothing to do. Press Reopen if they come back.';
    }
    // needsToday: a call that should happen today (the Leads summary line).
    const needsToday = (step === 'call' && (tone === 'late' || tone === 'today')) || (step === 'state' && tone === 'late');
    return { step, kind, who, due, tone, next, sort, needsToday, followup: p.followup || '', came: cameIn(p, todayIso),
             whoCalled: wc, whoLabel: wc ? WHO_CALLED[wc] : '' };
  }

  // State reports with a due date (2026-10-22, her yes): shown on Today's Coming up from 30 days
  // before until marked Submitted on the Deadlines page. A Submitted mark only counts for the due
  // date it was made for (quarterStatus[key + '_for']), so last year's mark never hides this year's.
  const REPORTS = [
    { key: 'q1',     title: 'Q1 Financial & Service Report (Jan to Mar)', due: y => [y, 4, 30] },
    { key: 'q2',     title: 'Q2 Financial & Service Report (Apr to Jun)', due: y => [y, 7, 31] },
    { key: 'q3',     title: 'Q3 Financial & Service Report (Jul to Sep)', due: y => [y, 10, 31] },
    { key: 'q4',     title: 'Q4 Financial & Service Report (Oct to Dec)', due: y => [y + 1, 1, 31] },
    { key: 'annual', title: 'Annual Service Report',                      due: y => [y + 1, 1, 31] },
    { key: 'des',    title: 'DES wage reports in UInteract, one per registered consumer', quarterly: true }
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
    const done = Object.entries(o.checks || {}).filter(([k, v]) => v && (!o.checklistIds || o.checklistIds.includes(k))).length;
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
             checkIns: { done: checkedIn, of: count, left: Math.max(0, count - checkedIn) },
             attendants: atts.length, screeningsSoon: soon,
             leie: { ok: leieOk, of: atts.length, auto: atts.filter(a => autoClear(a)).length }, fcsr: { ok: fcsrOk, of: atts.length },
             checklist: { done, of: total },
             money: { hoursMonth, fromWellSky, revenue, labor, margin: revenue - labor,
                      pct: revenue > 0 ? Math.round((revenue - labor) / revenue * 100) : 0, rates, range } };
  }

  root.CDSRules = { einClock, desThreshold, ongoingRequirements, taxDone, leadWaiting, siteLeadWaiting, followDue,
                    dailyRoutine, isActive, activeNow, isFormNote, siteLeadName, CLOSED, CLOSED_LABELS, cameIn, firstShiftPrep, PREP_STEPS, LATE_REASONS,
                    leadCard, formWho, LEAD_KINDS, REPORTS, reportDue, reportSubmitted, reportsDue, dashboardNumbers,
                    whoCalled, WHO_CALLED, WHO_NEXT,
                    DSDS_FORM, DSDS_PHONE, ENDING_GROUPS, ENDING_REASONS, endingReason, endingMissing, appealEnds, endingLetter, closureItems };
})(typeof globalThis !== 'undefined' ? globalThis : this);
