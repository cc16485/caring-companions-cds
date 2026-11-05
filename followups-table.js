// CDS Hub · Follow-ups as one table (2026-11-05, Samantha: "Approve the CDS Follow-ups table as shown, with all five of
// your picks. Build it switched off."; mockup https://claude.ai/artifact/6KUYJYUQJ5T2KVph4CWdpa). window.FUT.
// Today > Follow-ups: a glance row (Care or safety today, Call or text back today, Later this week, the check-ins tile,
// and a "how long they have waited" bar), one row of menus (When, Need, Owner), then one table, care or safety first:
// Who | What came in | Need | Owner | When | Waiting | Call or text | Move it | Done. "Who is this?" and "Is this X?"
// stay as rows, answered in the row. Phones get short cards with a More button.
// Her switch: agency_data 'followupsTable' {live} on the Switches page. Off = the cards exactly as before; an owner can
// preview the table in this browser (localStorage fuTable). Once it is on, anyone can go back to the cards on their own
// computer (fuView). It only READS what renderFollowups already has (the cds-comms queue); every button calls what the
// cards call (fuSet, fuLater, commDone, commPick, fuAttendant). Nothing is sent to anyone. No em dashes in anything a
// person reads.
(function () {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const live = () => typeof getObj === 'function' && getObj('followupsTable').live === true;
  const owner = () => typeof ldWhoOwner === 'function' && ldWhoOwner();
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; };
  const preview = () => ls('fuTable') === '1';
  /* on for this browser: live (unless they chose the cards here), or an owner previewing it */
  const on = () => live() ? ls('fuView') !== 'cards' : owner() && preview();
  const again = () => { if (typeof renderFollowups === 'function') renderFollowups(false); };

  /* the menus, remembered on this computer. Need and Owner are the cards' own _fuNeed / _fuOwner. */
  let when = null, loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    try {
      const s = JSON.parse(ls('fuTableF') || 'null');
      if (s && typeof s === 'object') { when = s.when || null; if (s.owner) _fuOwner = s.owner; if (s.need) _fuNeed = s.need; }
    } catch (e) { /* none saved */ }
  }
  const save = () => ls('fuTableF', JSON.stringify({ when, owner: _fuOwner, need: _fuNeed }));

  const WHEN = { urgent: 'Care or safety today', today: 'Call or text back today', later: 'Later this week' };
  const RANK = { urgent: 0, today: 1, later: 2 };
  const phoneOf = p10 => p10 ? '(' + p10.slice(0, 3) + ') ' + p10.slice(3, 6) + '-' + p10.slice(6) : '';
  /* how long since it came in: "37 m", "2 h 5 m", "Since yesterday", "Since Mon Nov 3" */
  function waited(iso, now) {
    if (!iso) return { t: '', mins: 0, old: false };
    const d = new Date(iso), mins = Math.max(0, Math.round((now - d) / 60000));
    if (d.toDateString() !== new Date(now).toDateString()) {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { t: d.toDateString() === y.toDateString() ? 'Since yesterday' : 'Since ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), mins, old: true };
    }
    return { t: mins < 60 ? mins + ' m' : Math.floor(mins / 60) + ' h ' + (mins % 60) + ' m', mins, old: false };
  }

  function model(o) {
    const { d, cards, secOf, myName } = o, now = Date.now();
    const ownerOk = c => _fuOwner === 'all' || (_fuOwner === 'nobody' ? !c.owner : _fuOwner === 'mine' ? !!c.owner && commOwnerName(c.owner) === myName : c.owner === _fuOwner);
    const needOk = c => _fuNeed === 'all' || (c.need || 'not_sure') === _fuNeed;
    const rows = cards.map(c => ({ c, sec: secOf(c), w: waited(c.since, now) }));
    rows.sort((a, b) => RANK[a.sec] - RANK[b.sec] || (a.sec === 'later' ? String(a.c.later).localeCompare(String(b.c.later)) : 0) || String(a.c.since || '').localeCompare(String(b.c.since || '')));
    return { rows, ownerOk, needOk, shown: rows.filter(r => ownerOk(r.c) && needOk(r.c) && (!when || r.sec === when)) };
  }

  /* the consumer is the boss (switch consumerComms): same rule as the cards */
  function bossOf(c) {
    if (!(hubSwitchOn('consumerComms') && (c.forConsumers || []).length && !['pay', 'evv'].includes(c.need))) return null;
    return c.forConsumers.filter(f => !f.past)[0] || c.forConsumers[0];
  }
  function callLink(c) {
    const boss = bossOf(c), first = boss ? String(boss.name).split(' ')[0] : '';
    if (boss) return boss.contactId ? '<a class="lt-b" href="' + E(CDS_GHL_APP + '/contacts/detail/' + encodeURIComponent(boss.contactId)) + '" target="_blank" rel="noopener">Call or text ' + E(first) + '</a>'
      : '<button type="button" class="lt-b" onclick="openProfile(\'' + E(boss.id) + '\')">Open ' + E(first) + '\'s profile</button>';
    const link = c.contactId ? CDS_GHL_APP + '/contacts/detail/' + encodeURIComponent(c.contactId)
      : c.conversationId ? CDS_GHL_APP + '/conversations/conversations/' + encodeURIComponent(c.conversationId) : CDS_GHL_APP + '/conversations/conversations';
    return '<a class="lt-b' + (c.urgent ? ' lt-b-late' : '') + '" href="' + E(link) + '" target="_blank" rel="noopener">' + (c.kind === 'hidden_number' ? 'Open in GoHighLevel' : 'Call or text back') + '</a>';
  }
  /* tap the name: their profile, when the hub knows who it is */
  function nameHtml(c) {
    const t = c.kind === 'who_is_this' ? 'Who is this?' : c.kind === 'hidden_number' ? 'Number not shown' : c.name;
    const r = typeof _cnRefOf === 'function' ? _cnRefOf(c.ref) : null;
    const go = r ? (r.kind === 'lead' ? "openLeadProfile('" + E(r.id) + "')" : "openProfile('" + E(r.id) + "')") : '';
    return go ? '<button type="button" class="lt-name" onclick="' + go + '">' + E(t) + '</button>' : '<span class="lt-name">' + E(t) + '</span>';
  }
  function whoCell(c) {
    const role = c.kind === 'who_is_this' ? 'Number we do not know' : c.kind === 'hidden_number' ? '' : [c.role, c.detail].filter(Boolean).join(': ');
    const boss = bossOf(c), bossFirst = boss ? String(boss.name).split(' ')[0] : '';
    const p = phoneOf(c.phone10);
    return nameHtml(c) + (role ? '<div class="lt-sub">' + E(role) + '</div>' : '') + (p ? '<a class="lt-tel" href="tel:' + E(c.phone10) + '">' + E(p) + '</a>' : '')
      + (hubSwitchOn('consumerComms') && (c.forConsumers || []).length ? '<div class="fut-boss">' + c.forConsumers.map(f => (f.past ? 'Past attendant for ' : 'Attendant for ')
        + '<button type="button" class="lt-link" onclick="openProfile(\'' + E(f.id) + '\')">' + E(f.name) + '</button>').join(' · ')
        + (boss ? '. ' + E(bossFirst) + ' is the boss, so this goes to ' + E(bossFirst) + '.' : '. Pay and clock-in stay with the attendant.') + '</div>' : '');
  }
  function cameIn(c) {
    const ev = (c.events || []).slice(-6).map(e => '<li><span>' + E(_commWhen(e.at)) + '</span>' + E(e.text) + '</li>').join('');
    return '<ul class="fut-ev">' + ev + '</ul>'
      + (c.voicemailNote ? '<div class="fut-said"><b>' + (c.newLead ? 'Sounds like a new lead. ' : '') + 'They said:</b> ' + E(c.voicemailNote) + '</div>' : '')
      + (c.urgent && c.urgentWhy ? '<div class="fut-why">' + E(c.urgentWhy) + '</div>' : '');
  }
  function needSel(c, d, step2) {
    if (!step2) return '<span class="lt-none">–</span>';
    const id = E(c.id);
    return '<select class="fut-sel" id="futNeed_' + id + '" aria-label="Need" onchange="fuSet(\'' + id + '\',\'set_need\',{need:this.value})">'
      + (d.needs || []).map(n => '<option value="' + E(n.key) + '"' + ((c.need || 'not_sure') === n.key ? ' selected' : '') + '>' + E(n.label) + '</option>').join('') + '</select>'
      + (c.needByHub ? '<div class="lt-sub">The hub picked it</div>' : '');
  }
  function ownerSel(c, d, step2) {
    if (!step2) return '<span class="lt-none">–</span>';
    const id = E(c.id);
    return '<select class="fut-sel" id="futOwner_' + id + '" aria-label="Owner" onchange="fuSet(\'' + id + '\',\'set_owner\',{owner:this.value})">'
      + '<option value=""' + (!c.owner ? ' selected' : '') + '>Nobody yet</option>'
      + (d.people || []).map(p => '<option value="' + E(p.email) + '"' + (c.owner === p.email ? ' selected' : '') + '>' + E(p.name) + '</option>').join('')
      + (c.owner && !(d.people || []).some(p => p.email === c.owner) ? '<option value="' + E(c.owner) + '" selected>' + E(commOwnerName(c.owner)) + '</option>' : '') + '</select>';
  }
  const whenPill = r => r.sec === 'urgent' ? '<span class="fut-pill fut-red">Care or safety today</span>'
    : r.sec === 'later' ? '<span class="fut-pill fut-blue">Back ' + E(_fuDay(r.c.later)) + '</span>' : '<span class="fut-pill fut-gold">Today</span>';
  function waitHtml(r) {
    if (r.sec === 'later' || !r.w.t) return '<span class="lt-none">–</span>';
    return r.w.old || r.sec === 'urgent' ? '<span class="lt-red"><b>' + E(r.w.t) + '</b></span>' : r.w.mins >= 120 ? '<span class="lt-gold">' + E(r.w.t) + '</span>' : E(r.w.t);
  }
  function moveHtml(r, step2, todayIso) {
    if (!step2) return '<span class="lt-none">–</span>';
    const c = r.c, id = E(c.id);
    return '<div class="fut-acts"><button type="button" class="lt-b lt-b-q" aria-pressed="' + (c.urgent ? 'true' : 'false') + '" onclick="fuSet(\'' + id + '\',\'urgent\',{on:' + (!c.urgent) + '})">' + (c.urgent ? 'Not care or safety' : 'Care or safety') + '</button>'
      + '<button type="button" class="lt-b lt-b-q" onclick="fuLaterPick(\'' + (_fuLaterOpen === c.id ? '' : id) + '\')">' + (r.sec === 'later' ? 'Change the day' : 'Later this week') + '</button></div>'
      + (_fuLaterOpen === c.id ? '<div class="fut-days" role="group" aria-label="Move to a later day">' + _fuNextDays(todayIso).map(x => '<button type="button" onclick="fuLater(\'' + id + '\',\'' + x + '\')">' + E(_fuDay(x)) + '</button>').join('')
        + (c.later ? '<button type="button" onclick="fuLater(\'' + id + '\',null)">Back to today</button>' : '') + '<button type="button" onclick="fuLaterPick(\'\')">Cancel</button></div>' : '');
  }
  const doneBtn = c => '<button type="button" class="lt-b lt-b-q" onclick="commDone(\'' + E(c.id) + '\')">Done</button>';
  const edge = r => r.sec === 'urgent' ? ' lt-now' : r.sec === 'today' ? ' lt-today' : '';

  function rowHTML(r, o) {
    const c = r.c, id = E(c.id);
    /* "Is this Tonya Reed?": GoHighLevel's name matches an attendant in payroll. Nothing is tied until Yes. */
    if (c.kind === 'attendant_confirm') {
      const m = ((c.events || [])[0] || {}).suggest || { name: c.name, ties: [] };
      const forWho = (m.ties || []).map(t => E(t.name) + (t.past ? ' (before)' : '')).join(', ');
      return '<tr class="lt-r"><td class="lt-n"><span class="lt-name">Is this ' + E(m.name) + '?</span><div class="lt-sub">Attendant, from payroll</div>' + (c.phone10 ? '<a class="lt-tel" href="tel:' + E(c.phone10) + '">' + E(phoneOf(c.phone10)) + '</a>' : '') + '</td>'
        + '<td colspan="5">GoHighLevel has this number as <b>' + E(m.contact || m.name) + '</b>. Payroll pays ' + E(m.name) + ' as the attendant for ' + forWho + '. If it is them, their calls and texts go on ' + forWho + '\'s Communication tab from now on.</td>'
        + '<td class="lt-sep" colspan="3"><div class="fut-acts"><button type="button" class="lt-b" onclick="fuAttendant(\'' + id + '\',true)">Yes, it is ' + E(String(m.name).split(' ')[0]) + '</button>'
        + '<button type="button" class="lt-b lt-b-q" onclick="fuAttendant(\'' + id + '\',false)">No</button></div><div class="field-note" id="fuAttErr_' + id + '"></div></td></tr>';
    }
    const who = c.kind === 'who_is_this';
    return '<tr class="lt-r' + edge(r) + '"><td class="lt-n">' + whoCell(c) + '</td><td>' + cameIn(c) + '</td>'
      + '<td class="lt-sep">' + needSel(c, o.d, o.step2) + '</td><td>' + ownerSel(c, o.d, o.step2) + '</td>'
      + '<td class="lt-sep">' + whenPill(r) + '</td><td>' + waitHtml(r) + '</td>'
      + (who ? '<td class="lt-sep fut-whocell" colspan="3">' + commWhoHtml(c) + '</td>'
        : '<td class="lt-sep">' + callLink(c) + (c.kind === 'hidden_number' ? '<div class="lt-sub">No number to call back. Look in GoHighLevel, then press Done.</div>' : '') + '</td>'
          + '<td>' + moveHtml(r, o.step2, o.todayIso) + '</td><td>' + doneBtn(c) + '</td>') + '</tr>';
  }
  /* phones: a short card, More opens Need, Owner, Care or safety and Later this week */
  let more = '';
  function cardHTML(r, o) {
    const c = r.c, id = E(c.id);
    if (c.kind === 'attendant_confirm' || c.kind === 'who_is_this') return '<div class="lt-card' + edge(r) + '"><table class="fut-one"><tbody>' + rowHTML(r, o) + '</tbody></table></div>';
    const meta = [c.role || '', o.step2 ? (c.needLabel || '') : '', c.owner ? commOwnerName(c.owner) : ''].filter(Boolean).join(' · ');
    const last = (c.events || []).slice(-1)[0];
    return '<div class="lt-card' + edge(r) + '"><div class="lt-card-top"><div>' + nameHtml(c) + '<div class="lt-sub">' + E(meta) + '</div></div>'
      + (r.sec === 'urgent' ? '<span class="fut-pill fut-red">Care or safety</span>' : r.sec === 'later' ? '<span class="fut-pill fut-blue">Back ' + E(_fuDay(c.later)) + '</span>' : '<span class="fut-pill fut-gold">' + E(r.w.t || 'Today') + '</span>') + '</div>'
      + (c.voicemailNote ? '<div class="fut-said"><b>They said:</b> ' + E(c.voicemailNote) + '</div>' : last ? '<div class="lt-sub">' + E(_commWhen(last.at)) + ' · ' + E(last.text) + '</div>' : '')
      + '<div class="lt-card-b">' + callLink(c) + (o.step2 ? '<button type="button" class="lt-b lt-b-q" aria-expanded="' + (more === c.id) + '" onclick="FUT.more(\'' + id + '\')">More</button>' : '') + doneBtn(c) + '</div>'
      + (more === c.id ? '<div class="fut-more"><label>Need ' + needSel(c, o.d, o.step2) + '</label><label>Owner ' + ownerSel(c, o.d, o.step2) + '</label>' + moveHtml(r, o.step2, o.todayIso) + '</div>' : '') + '</div>';
  }

  function menu(label, cur, opts, js) {
    return '<label class="lt-m' + (cur && cur !== 'all' ? ' on' : '') + '"><span>' + label + '</span><select onchange="' + js + '">'
      + opts.map(([k, l]) => '<option value="' + E(k) + '"' + ((cur || 'all') === k ? ' selected' : '') + '>' + E(l) + '</option>').join('') + '</select></label>';
  }

  /* the glance row, the menus and the table. renderFollowups hands over what it already worked out. */
  function draw(o) {
    load();
    const { d, cards, step2, doneN, total, monthWord, myName } = o;
    const M = model(o), rows = M.rows;
    const cnt = k => rows.filter(r => r.sec === k).length;
    const tile = (k, sub) => '<button type="button" class="fu-tile ' + k + (when === k ? ' fut-on' : '') + '" aria-pressed="' + (when === k) + '" onclick="FUT.when(\'' + k + '\')"><b>' + cnt(k) + '</b><span>' + WHEN[k] + '</span><small>' + sub + '</small></button>';
    const oldN = rows.filter(r => r.sec === 'today' && r.w.old).length;
    const nextLater = rows.filter(r => r.sec === 'later').map(r => r.c.later).sort()[0];
    /* how long they have waited, the open ones for today (care or safety and today) */
    const open = rows.filter(r => r.sec !== 'later' && r.w.t);
    const B = [['Under 1 hour', r => !r.w.old && r.w.mins < 60, ''], ['1 to 4 hours', r => !r.w.old && r.w.mins >= 60 && r.w.mins < 240, 'g'],
      ['Over 4 hours today', r => !r.w.old && r.w.mins >= 240, 'g'], ['Since yesterday or more', r => r.w.old, 'r']].map(([l, f, k]) => [l, open.filter(f).length, k]);
    const top = Math.max(1, ...B.map(b => b[1]));
    document.getElementById('fuTiles').innerHTML = '<div class="fut-glance">'
      + tile('urgent', when === 'urgent' ? 'Showing only these. Tap to show all.' : 'Tap to show only these')
      + tile('today', oldN ? oldN + ' waiting since yesterday or before' : 'Tap to show only these')
      + tile('later', nextLater ? 'Next one ' + E(_fuDay(nextLater)) : 'Nothing moved to later')
      + (step2 ? '<button type="button" class="fu-tile check" aria-expanded="' + (_fuCheckOpen ? 'true' : 'false') + '" onclick="fuCheckinsToggle()"><b>' + doneN + ' of ' + total + '</b><span>' + E(monthWord) + ' check-ins done</span>'
          + '<small>Kept apart. ' + (_fuCheckOpen ? 'Tap to hide the calls that could count.' : 'Tap to see calls that could count.') + '</small></button>'
        : '<div class="fu-tile later"><b>' + doneN + ' of ' + total + '</b><span>' + E(monthWord) + ' check-ins done</span><small>Kept apart. Only recorded check-ins count.</small></div>')
      + '<div class="fut-chart" role="img" aria-label="How long they have waited: ' + B.map(b => b[0] + ' ' + b[1]).join(', ') + '"><span class="fut-ct">How long they have waited (open for today)</span>'
      + B.map(([l, n, k]) => '<div class="fut-bar"><span>' + l + '</span><span class="fut-tr"><span class="fut-f' + (k ? ' fut-' + k : '') + '" style="width:' + Math.round(n / top * 100) + '%"></span></span><b>' + n + '</b></div>').join('')
      + '</div></div>';

    const ownN = k => rows.filter(r => M.needOk(r.c) && (!when || r.sec === when) && (k === 'all' || (k === 'nobody' ? !r.c.owner : k === 'mine' ? !!r.c.owner && commOwnerName(r.c.owner) === myName : r.c.owner === k))).length;
    const needN = k => rows.filter(r => M.ownerOk(r.c) && (!when || r.sec === when) && (k === 'all' || (r.c.need || 'not_sure') === k)).length;
    const whenN = k => rows.filter(r => M.ownerOk(r.c) && M.needOk(r.c) && r.sec === k).length;
    const any = when || _fuNeed !== 'all' || _fuOwner !== 'all';
    const owners = [['all', 'Everyone'], ['mine', 'Mine']].concat((d.people || []).map(p => [p.email, p.name])).concat([['nobody', 'Nobody yet']]);
    const toBoss = rows.filter(r => bossOf(r.c)).length, vm = rows.filter(r => r.c.voicemailNote).length;
    document.getElementById('fuFilters').innerHTML = cards.length ? '<div class="lt-bar">'
      + menu('When', when || 'all', [['all', 'All']].concat(Object.keys(WHEN).map(k => [k, WHEN[k] + ' (' + whenN(k) + ')'])), "FUT.when(this.value)")
      + (step2 ? menu('Need', _fuNeed, [['all', 'All']].concat((d.needs || []).map(n => [n.key, n.label + ' (' + needN(n.key) + ')'])), "FUT.pick('need',this.value)")
        + menu('Owner', _fuOwner, owners.map(([k, l]) => [k, l + ' (' + ownN(k) + ')']), "FUT.pick('owner',this.value)") : '')
      + (any ? '<button type="button" class="lt-link" onclick="FUT.clear()">Clear filters</button>' : '')
      + '<span class="lt-sum">' + (toBoss ? '<span><b>' + toBoss + '</b> attendant ' + (toBoss === 1 ? 'call goes' : 'calls go') + ' to the consumer</span>' : '') + (vm ? '<span><b>' + vm + '</b> ' + (vm === 1 ? 'voicemail' : 'voicemails') + '</span>' : '') + '</span></div>' : '';

    const host = document.getElementById('fuCards');
    if (!cards.length) { host.innerHTML = '<div class="ld-grid"><div class="ld-empty">Nothing waiting. Every call and text has been answered.</div></div>' + keyHtml(); return; }
    const empty = 'Nothing here for these filters.';
    host.innerHTML = '<div class="lt fut">'
      + '<div class="lt-wrap"><table class="lt-t fut-t"><thead><tr><th class="lt-n">Who</th><th>What came in</th><th class="lt-sep">Need</th><th>Owner</th><th class="lt-sep">When</th><th>Waiting</th>'
      + '<th class="lt-sep">Call or text</th><th>Move it</th><th>Done</th></tr></thead><tbody>'
      + (M.shown.length ? M.shown.map(r => rowHTML(r, o)).join('') : '<tr><td colspan="9" class="lt-empty">' + empty + '</td></tr>') + '</tbody></table></div>'
      + '<div class="lt-cards">' + (M.shown.length ? M.shown.map(r => cardHTML(r, o)).join('') : '<div class="lt-empty">' + empty + '</div>') + '</div>'
      + keyHtml() + '</div>';
  }
  function keyHtml() {
    return '<div class="lt-key"><span><b class="lt-red">Red edge</b> care or safety</span> · <span><b class="lt-gold">Gold edge</b> today</span> · <span>A row closes itself when someone calls or texts back</span> · <span>Tap a name to open their profile</span>'
      + (live() ? ' · <button type="button" class="lt-link" onclick="FUT.view(\'cards\')">Show the cards instead (this computer)</button>' : '') + '</div>';
  }
  /* the owner's preview row, and everyone's way back to the table once it is on */
  function switchHtml() {
    if (live() && !on()) return '<div class="ld-switch"><span><strong>Follow-ups table:</strong> you are looking at the cards on this computer.</span><button type="button" class="btn btn-sm btn-primary" onclick="FUT.view(\'table\')">Show the table</button></div>';
    if (!owner() || live()) return '';
    const pv = preview();
    return '<div class="ld-switch"><span><strong>Follow-ups as a table:</strong> ' + (pv ? 'Off (you are previewing it, only in this browser)' : 'Off') + '. Turn it on for everyone on the Switches page. Only you see this.</span>'
      + '<button type="button" class="btn btn-sm btn-outline" onclick="FUT.preview(' + !pv + ')">' + (pv ? 'Back to the cards' : 'Preview it (only me)') + '</button></div>';
  }
  window.FUT = {
    on, live, draw, switchHtml, waited,
    when(k) { load(); when = !k || k === 'all' || when === k ? null : k; save(); again(); },
    pick(k, v) { load(); if (k === 'need') _fuNeed = v || 'all'; else _fuOwner = v || 'all'; save(); again(); },
    clear() { when = null; _fuNeed = 'all'; _fuOwner = 'all'; save(); again(); },
    more(id) { more = more === id ? '' : id; again(); },
    preview(v) { ls('fuTable', v ? '1' : null); again(); },
    view(v) { ls('fuView', v === 'cards' ? 'cards' : null); again(); },
  };
})();
