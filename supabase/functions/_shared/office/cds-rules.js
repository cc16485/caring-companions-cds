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
    let visitDue = null, visitDays = null;
    if (anchor) {
      const d = new Date(anchor + 'T12:00:00');
      d.setDate(d.getDate() + 365);
      visitDue = iso(d);
      visitDays = Math.round((d - today) / DAY);
    }
    return {
      monthly: { doneThisMonth, thisMonth, last12, missed, everLogged: months.length },
      annual:  { visits, lastVisit, anchor, due: visitDue, days: visitDays,
                 overdue: visitDays !== null && visitDays < 0,
                 soon: visitDays !== null && visitDays >= 0 && visitDays <= 45,
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

  // "Do this first, every morning". data = { consumers, pipeline, authorizations, attendantWages, siteLeads?, calls? }.
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
      ].filter(Boolean),
      clear: 'Every consumer has a current authorization.'
    });

    let visitsOverdue = 0, monthDue = 0;
    consumers.forEach(c => {
      const r = ongoingRequirements(c, now);
      if (r.annual.overdue) visitsOverdue++;
      if (!r.monthly.doneThisMonth) monthDue++;
    });
    steps.push({
      n: 3, title: 'Keep the case files clean',
      items: [
        visitsOverdue && { t: plural(visitsOverdue, 'annual face-to-face visit', 'annual face-to-face visits') + ' overdue', go: 'consumers', bad: true },
        monthDue      && { t: plural(monthDue, 'monthly contact', 'monthly contacts') + ' not yet logged this month', go: 'consumers' }
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
                            people: follow.map(p => ({ name: p.name, county: p.county || '', at: '' })) }
      ].filter(Boolean),
      clear: 'Nobody is waiting on a call.'
    });
    return steps;
  }

  // The name the hub gives a website lead when it imports it.
  const siteLeadName = r => [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || String(r.full_name || '').trim() || 'Website enquiry';

  // yyyy-mm-dd of a Date in the runtime's own clock (the server passes Central noon).
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  root.CDSRules = { einClock, desThreshold, ongoingRequirements, taxDone, leadWaiting, siteLeadWaiting, followDue,
                    dailyRoutine, isFormNote, siteLeadName, CLOSED };
})(typeof globalThis !== 'undefined' ? globalThis : this);
