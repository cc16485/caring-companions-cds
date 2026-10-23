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
    let consumers, notInWellSky = [], wellSkyOnly = [], live = false;
    if (o.wsPeople) {
      live = true;
      const byKey = new Map(hub.map(c => [key(c.name), c]));
      const seen = new Set();
      consumers = [];
      o.wsPeople.forEach(p => {
        const c = byKey.get(p.key);
        seen.add(p.key);
        if (c) consumers.push(c); else wellSkyOnly.push(p.name);
      });
      notInWellSky = hub.filter(isActive).filter(c => !seen.has(key(c.name))).map(c => c.name);
    } else consumers = hub.filter(isActive);
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
                    dailyRoutine, isActive, isFormNote, siteLeadName, CLOSED, CLOSED_LABELS, cameIn, firstShiftPrep, PREP_STEPS, LATE_REASONS,
                    leadCard, formWho, LEAD_KINDS, REPORTS, reportDue, reportSubmitted, reportsDue, dashboardNumbers,
                    whoCalled, WHO_CALLED, WHO_NEXT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
