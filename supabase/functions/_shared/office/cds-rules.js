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
  const CLOSED = ['closed_ni', 'closed_other'];
  const isActive = c => c && c.status !== 'Inactive' && c.status !== 'Discharged';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

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
    const auths = Object.values(records);
    const expired = auths.filter(a => a.planEnd && new Date(a.planEnd + 'T12:00:00') < now).length;
    const expiring = auths.filter(a => {
      if (!a.planEnd) return false;
      const d = Math.round((new Date(a.planEnd + 'T12:00:00') - now) / DAY);
      return d >= 0 && d <= 60;
    }).length;
    const noAuth = consumers.filter(c => !auths.some(a =>
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
    consumers.forEach(c => {
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
    steps.push({
      n: 4, title: 'Call the people waiting',
      items: [
        waiting.length && { t: waiting.length + ' new ' + (waiting.length !== 1 ? 'enquiries' : 'enquiry') + ' from the website, never contacted', go: 'pipeline', bad: true,
                            people: waiting },
        follow.length  && { t: plural(follow.length, 'follow-up', 'follow-ups') + ' due today or overdue', go: 'pipeline',
                            people: follow.map(p => ({ name: p.name, county: p.county || '', at: '' })) },
        // Communication Center (2026-10-22): missed calls and unanswered texts. Only handed in once
        // setting comm_center.live is true, by the hub and the 8am email alike.
        // Step 2: cards marked "Care or safety today" are said first.
        Array.isArray(data.followups) && data.followups.length &&
          { t: plural(data.followups.length, 'call or text', 'calls and texts') + ' to follow up' +
               (data.followups.some(f => f.urgency === 'urgent') ? ', ' + data.followups.filter(f => f.urgency === 'urgent').length + ' care or safety today' : ''),
            go: 'followups', bad: true,
            people: data.followups.map(f => ({ name: f.name || 'Unknown number', county: '', at: f.since || '' })) }
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
    return steps;
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

  // p = a pipeline record, calls = cds_lead_calls rows, todayIso = yyyy-mm-dd,
  // moved = true when this person is already on the Consumers list.
  // tone: late (red), today (honey), later, none, ready.
  function leadCard(p, calls, todayIso, moved) {
    const notes = (Array.isArray(p.notes) ? p.notes : []).filter(Boolean);
    const form = notes.find(n => isFormNote(n));
    const real = notes.filter(n => !isFormNote(n));
    const last = real.length ? real[real.length - 1] : null;
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

    let due = '', tone = 'none', next = '', sort = 3;
    if (step === 'call') {
      if (leadWaiting(p, calls)) {
        const added = String(p.addedAt || p.firstContact || '').slice(0, 10);
        const old = added && added < todayIso;
        due = 'Not called yet'; tone = old ? 'late' : 'today'; sort = old ? 0 : 1;
        next = 'First call. Find out who needs care and if they have Medicaid.';
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
      due = done ? 'On the Consumers list' : 'Closed'; tone = 'none'; sort = 5;
      next = done ? 'Nothing to do here.' : 'Closed. Open the profile to see why.';
    }
    // needsToday: a call that should happen today (the Leads summary line).
    const needsToday = (step === 'call' && (tone === 'late' || tone === 'today')) || (step === 'state' && tone === 'late');
    return { step, kind, who, due, tone, next, sort, needsToday, followup: p.followup || '' };
  }

  // The name the hub gives a website lead when it imports it.
  const siteLeadName = r => [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || String(r.full_name || '').trim() || 'Website enquiry';

  // yyyy-mm-dd of a Date in the runtime's own clock (the server passes Central noon).
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  root.CDSRules = { einClock, desThreshold, ongoingRequirements, taxDone, leadWaiting, siteLeadWaiting, followDue,
                    dailyRoutine, isFormNote, siteLeadName, CLOSED, firstShiftPrep, PREP_STEPS, LATE_REASONS,
                    leadCard, formWho, LEAD_KINDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
