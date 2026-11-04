// CDS Hub · Leads as one table (2026-11-03, Samantha: "Approve the CDS Leads table as shown, with all six of your picks.
// Build it switched off."; mockup https://claude.ai/artifact/HQDFAmbD6DZM5T15UgnoCo). window.LDT.
// One row per person from the first call to Move to Consumers, one column per step with that step's button in it:
// First call, Referral or PCCP answers, Sent to the state, State approved, Enrollment packet, Attendant, Move to Consumers.
// Then Waiting on (Office, Consumer, State, Attendant), Call back on, Days on this step. Chips: Step (To call / Sent to
// state / Ready to start), Who needs, Waiting on, Kind. Phone cards. The chips are remembered on this computer.
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
    const prof = "openLeadProfile('" + id + "')", log = "openPipelineEdit('" + id + "')";
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
    if (a && a.name) {
      const steps = typeof ATT_STEPS !== 'undefined' ? ATT_STEPS : [];
      const n = steps.filter(([k]) => a[k]).length;
      if (a.backgroundResult === 'failed') cells[5] = late('Find another', prof, a.name + ': background failed');
      else if (a.backgroundResult === 'clear' && n >= steps.length) cells[5] = ok(a.name);
      else cells[5] = wait(a.name + (a.backgroundResult === 'clear' ? ', ' + n + ' of ' + steps.length + ' steps' : ', check not back'));
    } else if (c.cg === 'has') cells[5] = { s: 'none', t: 'Has one' };
    /* 7 Move to Consumers */
    if (c.step === 'ready') {
      cells[6] = todo('Move to Consumers', "convertToConsumer('" + id + "')");
      if (cur < 4) { cur = 6; hold = 'office'; holdNote = ''; }
    }
    if (c.step === 'ready' && cells[5].s === 'wait' && cur === 6) { hold = 'attendant'; holdNote = 'Attendant: ' + cells[5].t; }
    const urg = c.tone === 'late' ? 'now' : c.tone === 'today' || c.tone === 'ready' ? 'today' : '';
    return { id, p, c, name: p.name || 'No name', county: p.county || '', phone: p.phone || '', type, step: c.step, cells, cur, job: COLS[cur].k, hold, holdNote,
      followup: p.followup || '', days, urg, prof, closed: false };
  }
  function closedRow(p, c) {
    const id = String(p.id).replace(/[^\w.-]/g, '');
    return { id, p, c, name: p.name || 'No name', county: p.county || '', phone: p.phone || '', type: KIND[p.type] ? p.type : 'lead', step: 'closed', cells: COLS.map(none), cur: -1, job: '', hold: '',
      holdNote: c.due, followup: '', days: null, urg: '', prof: "openLeadProfile('" + id + "')", closed: true,
      reopen: (typeof PIPELINE_CLOSED_STATUSES !== 'undefined' && PIPELINE_CLOSED_STATUSES.includes(p.status)) ? "reopenLead('" + id + "')" : '' };
  }

  /* filters, remembered on this computer */
  let F = { step: null, job: null, hold: null, kind: null };
  try { const s = JSON.parse(ls('ldTableF') || 'null'); if (s && typeof s === 'object') F = Object.assign(F, s); } catch (e) { /* none saved */ }
  const save = () => ls('ldTableF', JSON.stringify(F));
  const pass = (r, skip) => (skip === 'step' || !F.step || r.step === F.step) && (skip === 'job' || !F.job || r.job === F.job)
    && (skip === 'hold' || !F.hold || r.hold === F.hold) && (skip === 'kind' || !F.kind || r.type === F.kind);

  function cellHTML(x, r, i) {
    const hi = i === r.cur ? ' lt-hi' : '';
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
    const x = r.cells[r.cur] || {};
    const btn = x.s === 'todo' || x.s === 'late' ? '<button type="button" class="lt-b' + (x.s === 'late' ? ' lt-b-late' : '') + '" onclick="' + E(x.go) + '">' + E(x.t) + '</button>'
      : r.reopen ? '<button type="button" class="lt-b lt-b-q" onclick="' + E(r.reopen) + '">Reopen</button>' : '<button type="button" class="lt-b lt-b-q" onclick="' + E(r.prof) + '">Open</button>';
    return '<div class="lt-card' + (r.urg ? ' lt-' + r.urg : '') + '"><div class="lt-card-top"><div><button type="button" class="lt-name" onclick="' + E(r.prof) + '">' + E(r.name) + '</button><div class="lt-sub">' + E(facts(r)) + '</div></div>'
      + (r.followup ? '<div class="lt-sub">Call back ' + E(day(r.followup)) + '</div>' : '') + '</div>'
      + (r.closed ? '' : '<div class="lt-pms">' + COLS.map((k, i) => { const y = r.cells[i] || {}; return '<span class="lt-pm' + (y.s && y.s !== 'none' ? ' lt-pm-' + y.s : '') + (i === r.cur ? ' lt-pm-hi' : '') + '">' + E(k.h) + '</span>'; }).join('') + '</div>')
      + '<div class="lt-card-b">' + (r.closed ? '<span class="lt-sub">' + E(r.holdNote) + '</span>' : '<span class="lt-who lt-who-' + r.hold + '">' + HOLD[r.hold] + '</span>' + (r.holdNote ? '<span class="lt-sub">' + E(r.holdNote) + '</span>' : '')) + btn + '</div></div>';
  }
  /* 2026-11-04 her "the filters are taking up too much space at top": one row of small menus instead of rows of chips */
  function menu(label, key, labels, rows, cur, pick) {
    const v = cur === undefined ? F[key] : cur;
    return '<label class="lt-m' + (v && v !== 'all' ? ' on' : '') + '"><span>' + label + '</span><select onchange="' + (pick || 'LDT.pick(\'' + key + '\',this.value)') + '">'
      + '<option value="">All</option>' + Object.keys(labels).map(k => {
        const n = rows.filter(r => (key === 'kind' ? r.type : key === 'who' ? r.c.whoCalled : r[key]) === k && (key === 'who' || pass(r, key))).length;
        return '<option value="' + k + '"' + (v === k ? ' selected' : '') + '>' + E(labels[k]) + ' (' + n + ')</option>';
      }).join('') + '</select></label>';
  }
  /* draw the table into the Leads list box (renderPipeline hands over what it already worked out) */
  function draw(o) {
    const { open, closed, showClosed, match, today, calls, cardsEl, stepsEl, pager, who, whoOn } = o;
    /* the cards' step tabs and sort are the table's Step chips and order now (the CSS display wins over hidden, so set it) */
    if (stepsEl) stepsEl.style.display = 'none';
    const sp = document.getElementById('ldSort'); if (sp && sp.closest('label')) sp.closest('label').style.display = 'none';
    if (pager) pager.innerHTML = '';
    cardsEl.classList.add('lt-host');
    const rows = open.map(x => row(x.p, x.c, today, calls));
    const urgRank = { now: 0, today: 1, '': 2 };
    rows.sort((a, b) => urgRank[a.urg] - urgRank[b.urg] || a.c.sort - b.c.sort || String(a.followup || '9').localeCompare(String(b.followup || '9')) || String(a.name).localeCompare(String(b.name)));
    const q = (document.getElementById('ldSearch') || {}).value || '';
    const county = r => !q || String(r.county).toLowerCase().indexOf(q.trim().toLowerCase()) > -1;
    /* the Who called chips above the table still pick who shows */
    let list = rows.filter(r => (match({ p: r.p }) || county(r)) && pass(r) && (!who || who === 'all' || r.c.whoCalled === who));
    if (showClosed) list = list.concat(closed.filter(x => match(x)).map(x => closedRow(x.p, x.c)));
    const cnt = document.getElementById('ldCount'); if (cnt) cnt.textContent = list.length + (list.length === 1 ? ' lead' : ' leads');
    const n = f => rows.filter(f).length;
    const jobs = {}; COLS.forEach(c => { jobs[c.k] = c.job; });
    const any = F.step || F.job || F.hold || F.kind || (whoOn && who && who !== 'all');
    const WHO = whoOn && window.CDSRules && CDSRules.WHO_CALLED;
    cardsEl.innerHTML = '<div class="lt">'
      + '<div class="lt-bar">' + menu('Step', 'step', STEP, rows) + menu('Who needs', 'job', jobs, rows) + menu('Waiting on', 'hold', HOLD, rows) + menu('Kind', 'kind', KIND, rows)
      + (WHO ? menu('Who called', 'who', WHO, rows, who, 'ldWhoFilter(this.value||\'all\')') : '')
      + (any ? '<button type="button" class="lt-link" onclick="LDT.clear()">Clear filters</button>' : '')
      /* the page's own line above already says how many people and who needs you now */
      + '<span class="lt-sum"><span><b>' + n(r => r.hold === 'state') + '</b> with the state</span><span><b>' + n(r => r.hold === 'consumer') + '</b> waiting on the consumer</span><span><b>' + n(r => r.step === 'ready') + '</b> ready to start</span></span></div>'
      + '<div class="lt-wrap"><table class="lt-t"><thead><tr class="lt-grp"><th class="lt-n"></th><th colspan="2">To call</th><th colspan="2" class="lt-sep">Sent to state</th><th colspan="3" class="lt-sep">Ready to start</th><th colspan="3" class="lt-sep"></th></tr>'
      + '<tr><th class="lt-n">Person</th>' + COLS.map((c, i) => '<th' + (i === 2 || i === 4 ? ' class="lt-sep"' : '') + '>' + E(c.h) + '</th>').join('') + '<th class="lt-sep">Waiting on</th><th>Call back on</th><th>Days on this step</th></tr></thead><tbody>'
      + (list.length ? list.map(rowHTML).join('') : '<tr><td colspan="' + (COLS.length + 4) + '" class="lt-empty">' + (rows.length ? 'Nobody matches these filters.' : 'No open leads right now.') + '</td></tr>') + '</tbody></table></div>'
      + '<div class="lt-cards">' + (list.length ? list.map(cardHTML).join('') : '<div class="lt-empty">' + (rows.length ? 'Nobody matches these filters.' : 'No open leads right now.') + '</div>') + '</div>'
      + '<div class="lt-key"><span><b class="lt-red">Red edge</b> needs you now</span> · <span><b class="lt-gold">Gold edge</b> today</span> · <span>✓ done</span> · <span>Search finds a name, phone or county</span>'
      + (live() ? ' · <button type="button" class="lt-link" onclick="LDT.view(\'cards\')">Show the cards instead (this computer)</button>' : '') + '</div></div>';
  }
  /* the cards again: the step tabs and the sort come back */
  function restore(stepsEl, cardsEl) {
    if (stepsEl) stepsEl.style.display = '';
    const sp = document.getElementById('ldSort'); if (sp && sp.closest('label')) sp.closest('label').style.display = '';
    if (cardsEl) cardsEl.classList.remove('lt-host');
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
    on, live, draw, restore, switchHtml, COLS, _PK: PK, _F: () => F,
    set(k, v) { F[k] = F[k] === v ? null : v; save(); again(); },
    pick(k, v) { F[k] = v || null; save(); again(); },
    clear() { F = { step: null, job: null, hold: null, kind: null }; save(); if (typeof _ldWhoFilter !== 'undefined') _ldWhoFilter = 'all'; again(); },
    preview(v) { ls('ldTable', v ? '1' : null); again(); },
    view(v) { ls('ldView', v === 'cards' ? 'cards' : null); again(); },
    async flip(v) { if (!owner()) return; await setObj('leadsTable', { live: !!v, by: typeof _ldWhoBy === 'function' ? _ldWhoBy() : 'office', at: new Date().toISOString() }); again(); },
  };
})();
