// CDS Hub · Leads as one table (2026-11-03, Samantha: "Approve the CDS Leads table as shown, with all six of your picks.
// Build it switched off."; mockup https://claude.ai/artifact/HQDFAmbD6DZM5T15UgnoCo). window.LDT.
// One row per person from the first call to Move to Consumers, one column per step with that step's button in it:
// First call, Referral or PCCP answers, Sent to the state, State approved, Enrollment packet, Attendant, Move to Consumers.
// Then Waiting on (Office, Consumer, State, Attendant), Call back on, Days on this step. Chips: Step (To call / Sent to
// state / Ready to start), Who needs, Waiting on, Kind. Phone cards. 2026-11-05: the menus gave way to tabs, one per closed reason.
// Her switch: agency_data 'leadsTable' {live}. Off = the Leads page exactly as before; an owner can preview the table in
// this browser (localStorage ldTable). Once it is on, anyone can go back to the cards in their own browser (ldView).
// It only READS: the same people, the same CDSRules.leadCard steps and late rules, and each lead's enrollment packet
// (cdsMatchApi enrollGet, the call the lead profile's card makes; read once and kept 5 minutes). Every button opens
// what the cards and the lead profile open today. Nothing is sent to anyone. No em dashes in anything a person reads.
(function () {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const live = () => typeof getObj === 'function' && getObj('leadsTable').live === true;
  const owner = () => typeof ldWhoOwner === 'function' && ldWhoOwner();
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; };
  const preview = () => ls('ldTable') === '1';
  /* on for this browser: live (unless they chose the cards here), or an owner previewing it */
  const on = () => live() ? ls('ldView') !== 'cards' : owner() && preview();
  const day = iso => { if (!iso) return ''; const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const daysSince = (iso, today) => { if (!iso) return null; const n = Math.round((new Date(today + 'T12:00:00') - new Date(String(iso).slice(0, 10) + 'T12:00:00')) / 864e5); return isNaN(n) ? null : Math.max(0, n); };

  const COLS = [
    { k: 'call', h: 'First call', job: 'First call' },
    { k: 'answers', h: 'Referral or PCCP answers', job: 'Referral or PCCP answers' },
    { k: 'sent', h: 'Sent to the state', job: 'Send to the state' },
    { k: 'approved', h: 'State approved', job: 'Check with the state' },
    { k: 'packet', h: 'Enrollment packet', job: 'Enrollment packet' },
    { k: 'att', h: 'Attendant', job: 'Attendant' },
    { k: 'move', h: 'Move to Consumers', job: 'Move to Consumers' },
  ];
  /* 2026-11-05 her ask: with Starting on (StartHub.on), the state, packet, attendant and move steps live on the
     Starting page. Leads keeps First call and the answers, then They said yes, which opens the lead to start them. */
  const YES = { k: 'yes', h: 'They said yes', job: 'They said yes' };
  const startOn = () => !!(window.StartHub && StartHub.on());
  const cols = () => startOn() ? [COLS[0], COLS[1], YES] : COLS;
  const STEP = { call: 'To call', state: 'Sent to state', ready: 'Ready to start' };
  const HOLD = { office: 'Office', consumer: 'Consumer', state: 'State', attendant: 'Attendant' };
  const KIND = { lead: 'Still deciding', referral: 'New to CDS - Referral', pccp: 'Moving from Another Agency - PCCP' };
  const SENT = ['submitted', 'processing', 'authorized', 'transfer_complete'];
  const APPROVED = ['authorized', 'transfer_complete'];

  /* each lead's enrollment packet, read once per 5 minutes, 4 at a time */
  const PK = {}; let busy = 0;
  function packet(id) {
    const g = PK[id];
    if (g && (g.loading || Date.now() - g.at < 5 * 60e3)) return g;
    if (busy >= 4 || typeof cdsMatchApi !== 'function') return g || { loading: true };
    PK[id] = Object.assign({}, g || {}, { loading: true }); busy++;
    Promise.resolve().then(() => cdsMatchApi('enrollGet', { lead_id: id })).then(r => {
      const p = r && r.packet, st = (r && r.status) || {};
      PK[id] = { at: Date.now(), sent: !!(p && p.sent_at), label: st.label || (p && p.sent_at ? 'Sent' : 'Not sent'), done: !!st.done, consumer: !!st.consumer_done, when: p && (p.office_signed_at || p.signed_at || p.sent_at) };
    }).catch(() => { PK[id] = { at: Date.now() - 4 * 60e3, err: true }; })
      .finally(() => { busy--; if (on() && typeof renderPipeline === 'function') renderPipeline(); });
    return PK[id];
  }

  const ok = (t, sub) => ({ s: 'ok', t: t || '', sub });
  const todo = (t, go) => ({ s: 'todo', t, go });
  const late = (t, go, d) => ({ s: 'late', t, go, d });
  const wait = (t, warn) => ({ s: 'wait', t, warn });
  const none = () => ({ s: 'none' });

  /* one row from a pipeline person and their CDSRules.leadCard */
  function row(p, c, today, calls) {
    const R = window.CDSRules, id = String(p.id).replace(/[^\w.-]/g, ''), type = KIND[p.type] ? p.type : 'lead';
    const prof = "openLeadProfile('" + id + "')", log = "ldLogCall('" + id + "')";
    const cells = COLS.map(none);
    let cur = 0, hold = 'office', holdNote = '', days = null;
    const waiting = R.leadWaiting(p, calls);
    const notes = (Array.isArray(p.notes) ? p.notes : []).filter(n => n && !R.isFormNote(n) && !n.whoCalled && !n.linkNote);
    const firstNote = notes.map(n => String(n.date || '').slice(0, 10)).filter(Boolean).sort()[0];
    /* 1 First call */
    /* a website lead nobody has called (CDSRules.leadWaiting, the cards' own rule), or one the office added with no call yet */
    const called = !waiting && (notes.length > 0 || p.status !== 'new');
    if (waiting) {
      cells[0] = c.tone === 'late' ? late('Log a call', log, 'came in ' + day(c.cameIso) + ', no call yet') : todo('Log a call', log);
      days = daysSince(c.cameIso, today);
    } else if (!called) { cells[0] = c.tone === 'late' ? late('Log a call', log, c.due) : todo('Log a call', log); days = daysSince(c.cameIso, today); }
    else cells[0] = ok(day(firstNote));
    /* 2 Referral or PCCP answers */
    const answered = type === 'referral' ? !!(p.referral && Object.keys(p.referral).length) : type === 'pccp' ? !!(p.dcn || p.leavingAgency) : false;
    const sent = SENT.includes(p.status) || !!p.stateSubmit;
    if (called) {
      if (answered || sent) cells[1] = ok(type === 'pccp' && p.dcn ? 'DCN on file' : '');
      else if (type === 'lead') {
        cur = 1; hold = 'consumer'; holdNote = 'Still deciding';
        cells[1] = c.tone === 'late' ? late('Log a call', log, c.due) : p.followup ? wait('Still deciding') : todo('Set a call back', log);
        if (c.tone === 'late' || !p.followup) hold = 'office';
        days = daysSince(c.lastIso, today);
      } else { cur = 1; cells[1] = c.tone === 'late' ? late(type === 'pccp' ? 'Get their DCN' : 'Referral answers', prof, c.due) : todo(type === 'pccp' ? 'Get their DCN' : 'Referral answers', prof); days = daysSince(c.lastIso, today); }
    }
    /* 3 Sent to the state (a PCCP transfer's own checklist rides along) */
    const t = p.transfer || {};
    const xfer = type === 'pccp' ? [t.emomedChecked ? 'eMOMED ✓' : '', t.fusionSubmitted ? 'FUSION ✓' : '', t.startDate ? 'start ' + day(t.startDate) : ''].filter(Boolean).join(' · ') : '';
    if (sent) cells[2] = ok(day(p.stateSubmit), xfer);
    else if (called && answered) { cur = 2; cells[2] = c.tone === 'late' ? late('Send to the state', prof, c.due) : todo('Send to the state', prof); if (xfer) cells[2].sub = xfer; days = daysSince(c.lastIso, today); }
    /* 4 State approved */
    const approved = APPROVED.includes(p.status);
    if (approved) cells[3] = ok('', [p.dcn ? 'DCN ' + p.dcn : '', p.hours ? p.hours + ' hrs' : ''].filter(Boolean).join(' · '));
    else if (c.step === 'state') {
      cur = 3; hold = 'state'; days = daysSince(p.stateSubmit, today);
      cells[3] = !p.stateSubmit ? todo('Add the sent date', log) : c.tone === 'late' ? late('Call DSDS', prof, c.due) : wait(c.due.replace(' of waiting', ''), c.tone === 'today');
      holdNote = c.next; if (!p.stateSubmit || c.tone === 'late') hold = 'office';
    }
    /* 5 Enrollment packet (asked of the Hub only once they reach the state or are approved) */
    if (c.step === 'state' || c.step === 'ready') {
      const g = packet(p.id);
      if (g.loading) cells[4] = { s: 'none', t: '…' };
      else if (g.err) cells[4] = { s: 'none', t: '?' };
      else if (g.done) cells[4] = ok(day(g.when));
      else if (g.consumer) { cells[4] = todo('Sign as agent', prof); if (c.step === 'ready') { cur = 4; hold = 'office'; holdNote = 'Signed, needs your agent signature'; } }
      else if (g.sent) { cells[4] = wait(g.label); if (c.step === 'ready') { cur = 4; hold = 'consumer'; holdNote = 'Packet: ' + g.label; } }
      else cells[4] = c.step === 'ready' ? todo('Send packet', prof) : none();
    }
    /* 6 Attendant */
    const a = p.attendant;
    const ak = typeof attPacketFor === 'function' ? attPacketFor(p) : null;   // 2026-11-04 one attendant record: their packet's real step
    if (ak) cells[5] = ak.active ? ok(ak.name) : wait(ak.name + ': ' + ak.label, ak.tone === 'y');
    else if (a && a.name) {
      const steps = typeof ATT_STEPS !== 'undefined' ? ATT_STEPS : [];
      const n = steps.filter(([k]) => a[k]).length;
      if (a.backgroundResult === 'failed') cells[5] = late('Pick another', "openLeadAttendant('" + id + "')", a.name + ': background failed');
      else if (a.backgroundResult === 'clear' && n >= steps.length) cells[5] = ok(a.name);
      else cells[5] = wait(a.name + (a.backgroundResult === 'clear' ? ', ' + n + ' of ' + steps.length + ' steps' : ', check not back'));
    } else if (c.step !== 'closed') cells[5] = { s: 'add', t: c.cg === 'has' ? 'Add (has one)' : 'Add', go: "openLeadAttendant('" + id + "')" };   // 2026-11-04 "attach them"
    /* 7 Move to Consumers */
    if (c.step === 'ready') {
      cells[6] = todo('Move to Consumers', "convertToConsumer('" + id + "')");
      if (cur < 4) { cur = 6; hold = 'office'; holdNote = ''; }
    }
    if (c.step === 'ready' && cells[5].s === 'wait' && cur === 6) { hold = 'attendant'; holdNote = 'Attendant: ' + cells[5].t; }
    const urg = c.tone === 'late' ? 'now' : c.tone === 'today' || c.tone === 'ready' ? 'today' : '';
    if (startOn()) {
      /* the answers are in (or nothing more to ask): They said yes is next, on their lead */
      const yes = called && (answered || sent) ? (c.tone === 'late' ? late('They said yes', prof, c.due) : todo('They said yes', prof)) : none();
      cells.splice(2, cells.length, yes);
      if (cur >= 2) { cur = 2; hold = 'consumer'; holdNote = 'Waiting for their yes'; if (c.tone === 'late' || !p.followup) hold = 'office'; }
    }
    return { id, p, c, name: p.name || 'No name', county: p.county || '', phone: p.phone || '', type, step: c.step, cells, cur, job: cols()[cur].k, hold, holdNote,
      followup: p.followup || '', days, urg, prof, closed: false };
  }
  function closedRow(p, c) {
    const id = String(p.id).replace(/[^\w.-]/g, '');
    return { id, p, c, name: p.name || 'No name', county: p.county || '', phone: p.phone || '', type: KIND[p.type] ? p.type : 'lead', step: 'closed', cells: COLS.map(none), cur: -1, job: '', hold: '',
      holdNote: c.due, followup: '', days: null, urg: '', prof: "openLeadProfile('" + id + "')", closed: true,
      reopen: (typeof PIPELINE_CLOSED_STATUSES !== 'undefined' && PIPELINE_CLOSED_STATUSES.includes(p.status)) ? "reopenLead('" + id + "')" : '' };
  }

  /* 2026-11-05 her ask: "all the stuff at the top gone" and clear sub tabs. Every closed reason (CDSRules.CLOSED) has a
     tab, so nobody hides behind a Show closed box. No Medicaid keeps a check back date (p.medicaidCheck); on that day the
     person shows on Active Leads for a call. A reason added later lands on Inactive Leads until it gets a tab. */
  const TABS = [
    { k: 'active', h: 'Active Leads', d: 'Everyone we are working with now.' },
    { k: 'med', h: 'No Medicaid', d: 'No Medicaid yet. We check back to see if it came through.', st: ['closed_no_medicaid'] },
    { k: 'att', h: 'Needs an Attendant', d: 'Nobody to be their attendant yet.', st: ['closed_no_attendant'] },
    { k: 'stateno', h: 'State Said No', d: 'The state turned them down. They can apply again if things change.', st: ['closed_state_no'] },
    { k: 'area', h: 'Out of Service Area', d: 'They live where we do not serve yet.', st: ['closed_area'] },
    { k: 'inactive', h: 'Inactive Leads', d: 'Not going ahead, or we could not reach them.', st: ['closed_ni', 'closed_other', 'closed_inactive', 'closed_no_reach', 'closed_more_care', 'closed_facility'] },
    { k: 'moved', h: 'Moved to Consumers', d: 'Said yes and moved on to Starting or Consumers.' },
    { k: 'gone', h: 'Closed for Good', d: 'Passed away, spam, or linked to someone else. Nobody calls them.', st: ['closed_passed', 'closed_spam', 'closed_linked', 'closed_pool'] },
  ];
  const STATE_NO = { reach: 'The state could not reach them', level: 'Did not meet the level of care', other: 'Another reason' };
  let tab = 'active';
  const allClosed = () => (window.CDSRules && CDSRules.CLOSED) || [];
  const tabOf = p => { if (!allClosed().includes(p.status)) return 'moved'; const t = TABS.find(t => t.st && t.st.includes(p.status)); return t ? t.k : 'inactive'; };
  const medDue = (p, today) => p.status === 'closed_no_medicaid' && !!p.medicaidCheck && p.medicaidCheck <= today;
  const lastNote = p => { const n = (Array.isArray(p.notes) ? p.notes : []).filter(n => n && n.text && !(window.CDSRules && CDSRules.isFormNote(n))); const t = n.length ? String(n[n.length - 1].text) : ''; return t.length > 110 ? t.slice(0, 110) + '...' : t; };
  const closedOn = p => String(p.closedAt || '').slice(0, 10) || ((Array.isArray(p.notes) ? p.notes : []).map(n => String((n && n.date) || '').slice(0, 10)).filter(Boolean).sort().pop() || '');
  const why = p => {
    const L = (window.CDSRules && CDSRules.CLOSED_LABELS) || {};
    if (p.status === 'closed_state_no') return STATE_NO[p.stateNoWhy] || 'The state said no';
    if (p.status === 'closed_linked' && p.linkedTo) return 'Linked to ' + (p.linkedTo.name || 'someone');
    if (!allClosed().includes(p.status)) return p.startingId ? 'Starting' : 'On the Consumers list';
    return L[p.status] || 'Closed';
  };

  function cellHTML(x, r, i) {
    const hi = i === r.cur ? ' lt-hi' : '';
    if (x && x.s === 'add') return '<td class="' + hi.trim() + '"><button type="button" class="lt-b lt-b-q" onclick="' + E(x.go) + '">' + E(x.t) + '</button></td>';
    if (!x || x.s === 'none') return '<td class="' + hi.trim() + '"><span class="lt-none">' + E(x && x.t ? x.t : '–') + '</span></td>';
    if (x.s === 'ok') return '<td class="' + hi.trim() + '"><span class="lt-ok">✓</span>' + (x.t ? ' ' + E(x.t) : '') + (x.sub ? '<div class="lt-sub">' + E(x.sub) + '</div>' : '') + '</td>';
    if (x.s === 'wait') return '<td class="' + hi.trim() + '"><span class="lt-wait' + (x.warn ? ' lt-warn' : '') + '">' + E(x.t) + '</span>' + (x.sub ? '<div class="lt-sub">' + E(x.sub) + '</div>' : '') + '</td>';
    return '<td class="' + hi.trim() + '"><button type="button" class="lt-b' + (x.s === 'late' ? ' lt-b-late' : '') + '" onclick="' + E(x.go) + '">' + E(x.t) + '</button>'
      + (x.d ? '<div class="lt-sub lt-red">' + E(x.d) + '</div>' : '') + (x.sub ? '<div class="lt-sub">' + E(x.sub) + '</div>' : '') + '</td>';
  }
  const facts = r => [r.county, KIND[r.type], r.c.whoLabel, r.c.cameIso ? 'came in ' + day(r.c.cameIso) : ''].filter(Boolean).join(' · ');
  function rowHTML(r) {
    const tel = String(r.phone).replace(/\D/g, '');
    return '<tr class="lt-r' + (r.urg ? ' lt-' + r.urg : '') + (r.closed ? ' lt-closed' : '') + '"><td class="lt-n"><button type="button" class="lt-name" onclick="' + E(r.prof) + '">' + E(r.name) + '</button>'
      + '<div class="lt-sub">' + E(facts(r)) + '</div>' + (tel ? '<a class="lt-tel" href="tel:' + tel + '">' + E(r.phone) + '</a>' : '') + '</td>'
      + r.cells.map((x, i) => cellHTML(x, r, i)).join('')
      + '<td>' + (r.closed ? '<span class="lt-sub">' + E(r.holdNote) + '</span>' + (r.reopen ? ' <button type="button" class="lt-b lt-b-q" onclick="' + E(r.reopen) + '">Reopen</button>' : '')
        : '<span class="lt-who lt-who-' + r.hold + '">' + HOLD[r.hold] + '</span>' + (r.holdNote ? '<div class="lt-sub">' + E(r.holdNote) + '</div>' : '')) + '</td>'
      + '<td' + (r.urg === 'now' && r.followup ? ' class="lt-red"' : r.followup && r.c.tone === 'today' ? ' class="lt-gold"' : '') + '>' + (r.followup ? E(day(r.followup)) : '<span class="lt-none">–</span>') + '</td>'
      + '<td>' + (r.days == null ? '<span class="lt-none">–</span>' : r.days === 0 ? 'today' : r.days + (r.days === 1 ? ' day' : ' days')) + '</td></tr>';
  }
  function cardHTML(r) {
    const COLS = cols();
    const x = r.cells[r.cur] || {};
    const btn = x.s === 'todo' || x.s === 'late' ? '<button type="button" class="lt-b' + (x.s === 'late' ? ' lt-b-late' : '') + '" onclick="' + E(x.go) + '">' + E(x.t) + '</button>'
      : r.reopen ? '<button type="button" class="lt-b lt-b-q" onclick="' + E(r.reopen) + '">Reopen</button>' : '<button type="button" class="lt-b lt-b-q" onclick="' + E(r.prof) + '">Open</button>';
    return '<div class="lt-card' + (r.urg ? ' lt-' + r.urg : '') + '"><div class="lt-card-top"><div><button type="button" class="lt-name" onclick="' + E(r.prof) + '">' + E(r.name) + '</button><div class="lt-sub">' + E(facts(r)) + '</div></div>'
      + (r.followup ? '<div class="lt-sub">Call back ' + E(day(r.followup)) + '</div>' : '') + '</div>'
      + (r.closed ? '' : '<div class="lt-pms">' + COLS.map((k, i) => { const y = r.cells[i] || {}; return '<span class="lt-pm' + (y.s && y.s !== 'none' ? ' lt-pm-' + y.s : '') + (i === r.cur ? ' lt-pm-hi' : '') + '">' + E(k.h) + '</span>'; }).join('') + '</div>')
      + '<div class="lt-card-b">' + (r.closed ? '<span class="lt-sub">' + E(r.holdNote) + '</span>' : '<span class="lt-who lt-who-' + r.hold + '">' + HOLD[r.hold] + '</span>' + (r.holdNote ? '<span class="lt-sub">' + E(r.holdNote) + '</span>' : '')) + btn + '</div></div>';
  }
  /* the top of the page while the table shows: just the title, Add someone, the tabs and search (her ask 2026-11-05) */
  const TOP = ['ldCount', 'ldHelp'];
  function tidyTop(hide, alertHtml) {
    TOP.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = hide ? 'none' : ''; });
    ['pipeShowClosed', 'ldSort'].forEach(id => { const el = document.getElementById(id); if (el && el.closest('label')) el.closest('label').style.display = hide ? 'none' : ''; });
    const help = document.querySelector('#csub-pipeline .ld-helpbtn'); if (help) help.style.display = hide ? 'none' : '';
    const sum = document.getElementById('ldSummary');
    if (sum && hide) { sum.innerHTML = alertHtml || ''; sum.style.display = alertHtml ? '' : 'none'; } else if (sum) sum.style.display = '';
    /* the owner's switches move under the list */
    const sw = document.getElementById('ldWho'), pager = document.getElementById('ldPager'), cards = document.getElementById('ldCards');
    if (sw && pager && cards) { if (hide && sw.nextElementSibling !== null && sw.previousElementSibling !== pager) pager.after(sw); else if (!hide && sw.nextElementSibling !== cards) cards.before(sw); }
  }
  /* a No Medicaid check back that is due, as a row on Active Leads */
  function medRowHTML(p, today) {
    const id = String(p.id).replace(/[^\w.-]/g, ''), late = p.medicaidCheck < today, tel = String(p.phone || '').replace(/\D/g, '');
    return '<tr class="lt-r ' + (late ? 'lt-now' : 'lt-today') + '"><td class="lt-n"><button type="button" class="lt-name" onclick="openLeadProfile(\'' + id + '\')">' + E(p.name || 'No name') + '</button>'
      + '<div class="lt-sub">' + E([p.county, 'No Medicaid', p.medicaidApplying ? 'applying' : ''].filter(Boolean).join(' · ')) + '</div>' + (tel ? '<a class="lt-tel" href="tel:' + tel + '">' + E(p.phone) + '</a>' : '') + '</td>'
      + '<td colspan="' + cols().length + '" class="lt-hi"><button type="button" class="lt-b' + (late ? ' lt-b-late' : '') + '" onclick="openPipelineEdit(\'' + id + '\')">Log a call</button> '
      + '<button type="button" class="lt-b lt-b-q" onclick="reopenLead(\'' + id + '\')">They have Medicaid now</button><div class="lt-sub">Ask if their Medicaid came through.</div></td>'
      + '<td class="lt-sep"><span class="lt-who lt-who-office">Office</span><div class="lt-sub">Medicaid check back</div></td>'
      + '<td class="' + (late ? 'lt-red' : 'lt-gold') + '">' + E(day(p.medicaidCheck)) + '</td><td>' + E(late ? daysSince(p.medicaidCheck, today) + ' days late' : 'today') + '</td></tr>';
  }
  function medCardHTML(p, today) {
    const id = String(p.id).replace(/[^\w.-]/g, ''), late = p.medicaidCheck < today;
    return '<div class="lt-card ' + (late ? 'lt-now' : 'lt-today') + '"><div class="lt-card-top"><div><button type="button" class="lt-name" onclick="openLeadProfile(\'' + id + '\')">' + E(p.name || 'No name') + '</button><div class="lt-sub">No Medicaid · check back ' + E(day(p.medicaidCheck)) + '</div></div></div>'
      + '<div class="lt-card-b"><span class="lt-sub">Ask if their Medicaid came through.</span><button type="button" class="lt-b' + (late ? ' lt-b-late' : '') + '" onclick="openPipelineEdit(\'' + id + '\')">Log a call</button></div></div>';
  }
  /* one closed tab: who, why, when, the last note, and Reopen (No Medicaid: applying, check back date, Log a call) */
  function closedTabHTML(k, list, today) {
    const med = k === 'med', moved = k === 'moved';
    const heads = med ? ['Person', 'Applying for Medicaid?', 'Check back on', 'Last note', ''] : ['Person', moved ? 'Where they are now' : 'Why', moved ? 'Came in' : 'Closed on', 'Last note', ''];
    const by = med ? (a, b) => String(a.p.medicaidCheck || '9').localeCompare(String(b.p.medicaidCheck || '9')) : (a, b) => String(closedOn(b.p)).localeCompare(String(closedOn(a.p)));
    list = list.slice().sort((a, b) => by(a, b) || String(a.p.name || '').localeCompare(String(b.p.name || '')));
    const t = TABS.find(t => t.k === k);
    /* Out of Service Area: how many in each county, for the day we grow */
    let top = '';
    if (k === 'area' && list.length) {
      const n = {}; list.forEach(x => { const c = x.p.county || 'County not known'; n[c] = (n[c] || 0) + 1; });
      top = '<div class="lt-sub" style="margin:0 0 8px">By county: ' + Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b)).map(c => E(c) + ' <b>' + n[c] + '</b>').join(' · ') + '</div>';
    }
    const btns = (p, id) => moved ? '<button type="button" class="lt-b lt-b-q" onclick="openLeadProfile(\'' + id + '\')">Open</button>'
      : (med ? '<button type="button" class="lt-b' + (medDue(p, today) ? ' lt-b-late' : '') + '" onclick="openPipelineEdit(\'' + id + '\')">Log a call</button> ' : '')
        + (p.status === 'closed_passed' ? '' : '<button type="button" class="lt-b lt-b-q" onclick="reopenLead(\'' + id + '\')">' + (med ? 'They have Medicaid now' : 'Reopen') + '</button>');
    const rows = list.map(({ p, c }) => {
      const id = String(p.id).replace(/[^\w.-]/g, ''), tel = String(p.phone || '').replace(/\D/g, ''), due = med && medDue(p, today);
      return '<tr class="lt-r' + (due ? (p.medicaidCheck < today ? ' lt-now' : ' lt-today') : '') + '"><td class="lt-n"><button type="button" class="lt-name" onclick="openLeadProfile(\'' + id + '\')">' + E(p.name || 'No name') + '</button>'
        + '<div class="lt-sub">' + E([p.county ? p.county + ' County' : '', KIND[p.type] || KIND.lead].filter(Boolean).join(' · ')) + '</div>' + (tel ? '<a class="lt-tel" href="tel:' + tel + '">' + E(p.phone) + '</a>' : '') + '</td>'
        + (med ? '' : '<td>' + E(why(p)) + '</td>')
        + (med ? '<td>' + (p.medicaidApplying === true ? 'Yes, applying' : p.medicaidApplying === false ? 'Not right now' : '<span class="lt-none">Not asked</span>') + '</td>'
            + '<td><label class="ld-sr" for="ltMed_' + id + '">Check back on</label><input type="date" id="ltMed_' + id + '" class="lt-date' + (due ? ' lt-red' : '') + '" value="' + E(p.medicaidCheck || '') + '" onchange="LDT.medDate(\'' + id + '\',this.value)"></td>'
          : '<td>' + E(day(moved ? c.cameIso : closedOn(p)) || '–') + '</td>')
        + '<td class="lt-sub">' + E(lastNote(p) || '–') + '</td><td>' + btns(p, id) + '</td></tr>';
    }).join('');
    const cards = list.map(({ p }) => {
      const id = String(p.id).replace(/[^\w.-]/g, '');
      return '<div class="lt-card"><div class="lt-card-top"><div><button type="button" class="lt-name" onclick="openLeadProfile(\'' + id + '\')">' + E(p.name || 'No name') + '</button><div class="lt-sub">' + E(why(p)) + '</div></div>'
        + (med && p.medicaidCheck ? '<div class="lt-sub">Check back ' + E(day(p.medicaidCheck)) + '</div>' : '') + '</div><div class="lt-card-b"><span class="lt-sub">' + E(lastNote(p)) + '</span>' + btns(p, id) + '</div></div>';
    }).join('');
    const empty = '<div class="lt-empty">Nobody here right now.</div>';
    return '<div class="lt"><p class="lt-sub" style="margin:0 0 6px">' + E(t.d) + '</p>' + top
      + '<div class="lt-wrap"><table class="lt-t lt-t-closed"><thead><tr>' + heads.map(h => '<th' + (h === 'Person' ? ' class="lt-n"' : '') + '>' + E(h) + '</th>').join('') + '</tr></thead><tbody>'
      + (list.length ? rows : '<tr><td colspan="' + heads.length + '" class="lt-empty">Nobody here right now.</td></tr>') + '</tbody></table></div>'
      + '<div class="lt-cards">' + (list.length ? cards : empty) + '</div></div>';
  }
  /* draw the tabs and the table into the Leads list box (renderPipeline hands over what it already worked out) */
  function draw(o) {
    const { open, closed, match, today, calls, cardsEl, stepsEl, pager, who, alertHtml } = o;
    tidyTop(true, alertHtml);
    if (pager) pager.innerHTML = '';
    cardsEl.classList.add('lt-host');
    const q = (document.getElementById('ldSearch') || {}).value || '';
    const county = p => !q || String(p.county || '').toLowerCase().indexOf(q.trim().toLowerCase()) > -1;
    const hit = x => match(x) || county(x.p);
    const rows = open.map(x => row(x.p, x.c, today, calls));
    const urgRank = { now: 0, today: 1, '': 2 };
    rows.sort((a, b) => urgRank[a.urg] - urgRank[b.urg] || a.c.sort - b.c.sort || String(a.followup || '9').localeCompare(String(b.followup || '9')) || String(a.name).localeCompare(String(b.name)));
    const list = rows.filter(r => hit({ p: r.p }) && (!who || who === 'all' || r.c.whoCalled === who));
    const meds = closed.filter(x => medDue(x.p, today) && hit(x)).map(x => x.p).sort((a, b) => String(a.medicaidCheck).localeCompare(String(b.medicaidCheck)));
    const shut = {}; TABS.forEach(t => { shut[t.k] = []; });
    closed.filter(hit).forEach(x => shut[tabOf(x.p)].push(x));
    const count = { active: list.length + meds.length }; TABS.forEach(t => { if (t.k !== 'active') count[t.k] = shut[t.k].length; });
    /* the tabs (the cards' step tabs box): a search shows how many match on each */
    if (stepsEl) {
      stepsEl.style.display = '';
      stepsEl.innerHTML = TABS.map(t => {
        const on = t.k === tab, late = t.k === 'active' ? rows.filter(r => r.urg === 'now').length + meds.filter(p => p.medicaidCheck < today).length : t.k === 'med' ? meds.length : 0;
        return '<button type="button" role="tab" aria-selected="' + on + '" class="ld-tab' + (on ? ' on' : '') + '" title="' + E(t.d) + '" onclick="LDT.tab(\'' + t.k + '\')">' + E(t.h) + ' <span class="ld-tabn">' + count[t.k] + '</span>'
          + (late ? '<span class="ld-late">' + late + (t.k === 'med' ? ' due' : ' late') + '</span>' : '') + '</button>';
      }).join('');
    }
    if (tab !== 'active') { cardsEl.innerHTML = closedTabHTML(tab, shut[tab], today); return; }
    const COLS = cols(), st = startOn();
    const body = meds.map(p => medRowHTML(p, today)).join('') + list.map(rowHTML).join('');
    const empty = rows.length || meds.length ? 'Nobody matches that search.' : 'No open leads right now.';
    cardsEl.innerHTML = '<div class="lt">'
      + '<div class="lt-wrap"><table class="lt-t"' + (st ? ' style="min-width:880px"' : '') + '><thead><tr class="lt-grp"><th class="lt-n"></th><th colspan="2">To call</th>'
      + (st ? '<th class="lt-sep">Starting</th>' : '<th colspan="2" class="lt-sep">Sent to state</th><th colspan="3" class="lt-sep">Ready to start</th>') + '<th colspan="3" class="lt-sep"></th></tr>'
      + '<tr><th class="lt-n">Person</th>' + COLS.map((c, i) => '<th' + (i === 2 || (!st && i === 4) ? ' class="lt-sep"' : '') + '>' + E(c.h) + '</th>').join('') + '<th class="lt-sep">Waiting on</th><th>Call back on</th><th>Days on this step</th></tr></thead><tbody>'
      + (body || '<tr><td colspan="' + (COLS.length + 4) + '" class="lt-empty">' + empty + '</td></tr>') + '</tbody></table></div>'
      + '<div class="lt-cards">' + (body ? meds.map(p => medCardHTML(p, today)).join('') + list.map(cardHTML).join('') : '<div class="lt-empty">' + empty + '</div>') + '</div>'
      + '<div class="lt-key"><span><b class="lt-red">Red edge</b> needs you now</span> · <span><b class="lt-gold">Gold edge</b> today</span> · <span>✓ done</span> · <span>Search finds a name, phone or county</span>'
      + (live() ? ' · <button type="button" class="lt-link" onclick="LDT.view(\'cards\')">Show the cards instead (this computer)</button>' : '') + '</div></div>';
  }
  /* the cards again: the step tabs, the sort and the top of the page come back */
  function restore(stepsEl, cardsEl) {
    tidyTop(false);
    if (stepsEl) stepsEl.style.display = '';
    if (cardsEl) cardsEl.classList.remove('lt-host');
  }
  /* a new check back date for a No Medicaid lead, with a note */
  function medDate(id, v) {
    if (typeof getData !== 'function') return;
    const pipeline = getData('pipeline'), p = pipeline.find(x => String(x.id) === String(id));
    if (!p || p.status !== 'closed_no_medicaid') return;
    p.medicaidCheck = v || '';
    (p.notes = p.notes || []).push({ date: new Date().toLocaleDateString('en-CA'), text: v ? 'Medicaid check back set for ' + v + '.' : 'Medicaid check back date taken off.' });
    setData('pipeline', pipeline); again();
  }
  /* the owner's switch row (beside the calmer list's), and everyone's way back to the table once it is on */
  function switchHtml() {
    if (live() && !on()) return '<div class="ld-switch"><span><strong>Leads table:</strong> you are looking at the cards on this computer.</span><button type="button" class="btn btn-sm btn-primary" onclick="LDT.view(\'table\')">Show the table</button></div>';
    if (!owner()) return '';
    const sw = getObj('leadsTable'), lv = live(), pv = !lv && preview();
    return '<div class="ld-switch"><span><strong>Leads as a table:</strong> ' + (lv ? 'On' : pv ? 'Off (you are previewing it, only in this browser)' : 'Off') + (sw.by ? ' (changed by ' + E(sw.by) + ')' : '') + '. Only you see this switch.</span>'
      + (lv ? '' : '<button type="button" class="btn btn-sm btn-outline" onclick="LDT.preview(' + !pv + ')">' + (pv ? 'Back to the cards' : 'Preview it (only me)') + '</button>')
      + '<button type="button" class="btn btn-sm ' + (lv ? 'btn-outline' : 'btn-primary') + '" onclick="LDT.flip(' + !lv + ')">Turn ' + (lv ? 'off' : 'on for everyone') + '</button></div>';
  }
  const again = () => { if (typeof renderPipeline === 'function') renderPipeline(); };
  window.LDT = {
    on, live, draw, restore, switchHtml, COLS, TABS, medDate, _PK: PK, _tab: () => tab,
    tab(k) { tab = TABS.some(t => t.k === k) ? k : 'active'; again(); },
    /* the old filter menus are gone (2026-11-05); this forgets any saved on this computer and goes back to Active Leads */
    clear() { ls('ldTableF', null); tab = 'active'; if (typeof _ldWhoFilter !== 'undefined') _ldWhoFilter = 'all'; again(); },
    preview(v) { ls('ldTable', v ? '1' : null); again(); },
    view(v) { ls('ldView', v === 'cards' ? 'cards' : null); again(); },
    async flip(v) { if (!owner()) return; await setObj('leadsTable', { live: !!v, by: typeof _ldWhoBy === 'function' ? _ldWhoBy() : 'office', at: new Date().toISOString() }); again(); },
  };
})();
