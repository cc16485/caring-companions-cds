// CDS Hub · the first call (2026-11-04, her ask: "one connected workflow, starting the moment someone calls").
// Behind the hub switch 'starting'. One screen for a phone call: who is calling (the hub's Who called
// choices), a few questions that appear as they matter, unknown answers allowed, Save at any point, and
// Finish call (summary, what is still missing, one next step, who owns it, the follow-up date, a message
// the coordinator reviews before sending, the Medicaid application instructions when there is no Medicaid).
// It writes to the same lead record the Leads page uses (notes, contacts, call back date, coordinator,
// Who called, attendant), finds a returning caller instead of adding them twice, starts the Starting profile
// from the same lead, and sends an attendant with no one to care for to the Caregiver Pool (ldToPool).
// Log a call and Add someone still work: links on this screen open them.
// No em dashes in anything a person reads.
(function () {
  'use strict';
  const S = window.CDSStarting;
  const H = () => window.StartHub;
  const me = () => String(_acWho() || '').trim().toLowerCase();
  const meName = () => { const n = me().split('@')[0]; return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Office'; };
  const digits = v => String(v || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const addDays = (n) => { const d = new Date(_todayIso() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const chip = (group, val, label, on, multi) => '<button type="button" class="st-chip' + (on ? ' on' : '') + '" aria-pressed="' + !!on + '" onclick="StartCall.pick(\'' + group + "','" + val + '\'' + (multi ? ',true' : '') + ')">' + label + '</button>';
  const unk = (group) => chip(group, 'unsure', "Don't know yet", call[group] === 'unsure');

  const WHO = [['self', 'Consumer, for themself'], ['family', 'Family, for a loved one'], ['pair', 'An attendant, about someone'], ['solo', 'An attendant, no one to care for yet'], ['unsure', 'Not sure yet']];
  const SAY = {
    self: '"We can help you get started. Are you on Medicaid right now, and what kind of help do you need at home?"',
    family: '"Absolutely, we can help you understand the process. Who are you hoping to get services started for, and are they on Medicaid right now?"',
    pair: '"It helps that you already have each other. Can I get their name, a good phone number, and whether they have Medicaid?"',
    solo: '"Thank you! Families often ask us for an attendant. Let me get your name and number."',
    unsure: '"Are you the person needing care, calling for someone, or wanting to be an attendant?"'
  };
  const REL = ['daughter', 'son', 'spouse', 'sister', 'brother', 'grandchild', 'friend', 'other'];
  let call = null, dup = null, finish = null, savedAt = '', drawnStage = -1, drawing = false;

  document.body.insertAdjacentHTML('beforeend', '<div class="modal-overlay" id="stCallModal"><div class="modal st-call"><div class="modal-header">' +
    '<div class="modal-title cute-title" style="font-size:24px" id="stCallTitle">On a call</div><button class="modal-close" onclick="StartCall.close()" aria-label="Close">×</button></div>' +
    '<div id="stCallBody"></div></div></div>');
  document.head.insertAdjacentHTML('beforeend', '<style id="startingCallCss">' +
    '.st-call{width:min(1080px,96vw);max-height:94vh;overflow:auto;background:var(--cute-cream,#FAF9F6)}' +
    '.st-callgrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start}' +
    '.st-q{background:var(--white);border:1px solid var(--gray-300);border-radius:14px;padding:12px 14px;display:grid;gap:8px;font-size:13.5px}' +
    '.st-q > b{color:var(--primary)}.st-chips{display:flex;flex-wrap:wrap;gap:6px}' +
    '.st-chip{font:500 13px Poppins,sans-serif;border:1.5px solid var(--gray-300);background:var(--white);color:var(--gray-800);border-radius:999px;padding:7px 12px;cursor:pointer;min-height:36px}' +
    '.st-chip.on{background:var(--primary);border-color:var(--primary);color:#fff}' +
    '.st-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.st-row label{display:grid;gap:3px;font-size:12px;color:var(--gray-600)}.st-row input,.st-row select{font:inherit;font-size:14px;padding:7px 9px}' +
    '.st-say{border-left:3px solid var(--accent);padding:6px 12px;font-style:italic;background:var(--white);border-radius:0 10px 10px 0;font-size:13.5px}' +
    '.st-side{position:sticky;top:0;display:grid;gap:10px}.st-sum{background:var(--white);border:2px solid var(--primary);border-radius:14px;padding:12px 14px;font-size:13.5px}' +
    '.st-find{display:grid;gap:4px;margin-top:6px}.st-find button{text-align:left;font:inherit;font-size:13px;border:1px solid var(--gray-300);background:var(--white);border-radius:10px;padding:7px 10px;cursor:pointer}' +
    '@media (max-width:820px){.st-callgrid{grid-template-columns:minmax(0,1fr)}.st-side{position:static}.st-row{grid-template-columns:minmax(0,1fr)}}' +
    '</style>');

  function blank() {
    return { leadId: '', who: '', consumer: { first: '', last: '' }, caller: { name: '', relation: '' }, phone: '', email: '', medicaid: '', cds: '', agency: '',
             help: [], helpNote: '', attendant: '', attName: '', attPhone: '', county: '', note: '', ready: '', showAll: false };
  }
  // A returning caller's lead fills the screen (nothing typed twice).
  function fromLead(p) {
    const c = blank(), bits = String(p.name || '').trim().split(/\s+/);
    const rel = CDSRules.relatedPeople(p).find(r => r.role === 'family') || CDSRules.relatedPeople(p)[0];
    c.leadId = p.id; c.who = CDSRules.WHO_CALLED[p.whoCalled] ? p.whoCalled : '';
    c.consumer = { first: p.firstName || bits[0] || '', last: p.lastName || bits.slice(1).join(' ') };
    if (rel) c.caller = { name: rel.name || '', relation: rel.relation || '' };
    c.phone = (rel && rel.phone) || p.phone || ''; c.email = (rel && rel.email) || p.email || '';
    c.medicaid = { active: 'yes', inactive: 'no', pending: 'applied' }[p.medicaidStatus] || '';
    c.cds = p.type === 'pccp' ? 'move' : p.type === 'referral' ? 'new' : '';
    c.agency = p.leavingAgency || p.currentAgency || '';
    c.help = Array.isArray(p.helpNeeded) ? p.helpNeeded.slice() : [];
    c.attendant = p.attendant && p.attendant.name ? 'has' : ({ has: 'has', find: 'find' }[p.caregiverPlan] || '');
    c.attName = (p.attendant && p.attendant.name) || ''; c.attPhone = (p.attendant && p.attendant.phone) || '';
    c.county = p.county || '';
    c.showAll = true;
    return c;
  }

  function open(pid) {
    if (!(H() && H().on())) { if (pid) openPipelineEdit(pid); else openModal('addSomeoneModal'); return; }
    const p = pid && getData('pipeline').find(x => x.id === pid);
    call = p ? fromLead(p) : blank(); dup = null; finish = null; savedAt = '';
    openModal('stCallModal'); draw();
  }
  function close() { closeModal('stCallModal'); if (call && call.leadId && document.getElementById('page-leadprofile') && document.getElementById('page-leadprofile').classList.contains('active')) renderLeadProfile(); if (typeof renderPipeline === 'function') renderPipeline(); }

  function pick(group, val, multi) {
    if (multi) { const a = call[group] || []; call[group] = a.includes(val) ? a.filter(x => x !== val) : a.concat([val]); }
    else call[group] = call[group] === val ? '' : val;
    if (group === 'who' && val === 'pair') { call.attendant = 'has'; if (!call.caller.relation) call.caller.relation = 'attendant'; }
    if (group === 'who' && val === 'self') call.caller = { name: '', relation: '' };
    draw();
  }
  function set(path, v) {
    const [a, b] = path.split('.');
    if (b) call[a][b] = v; else call[a] = v;
    drawSide();
  }
  // A text box lost focus: redraw only when new questions should appear, so a click that follows is never lost.
  function changed() { if (stage() !== drawnStage) setTimeout(draw, 0); }

  // Progressive: the next questions appear once who is calling is known and a name or phone is in.
  function stage() {
    if (!call.who) return 0;
    if (call.who === 'solo') return 1;
    return call.showAll || call.consumer.first || digits(call.phone) ? 2 : 1;
  }

  function draw() {
    const host = document.getElementById('stCallBody');
    if (!host || !call || drawing) return;
    drawing = true;
    try { drawNow(host); } finally { drawing = false; }
  }
  function drawNow(host) {
    drawnStage = stage();
    const p = call.leadId && getData('pipeline').find(x => x.id === call.leadId);
    document.getElementById('stCallTitle').textContent = p ? 'On a call: ' + (p.name || 'this lead') : 'On a call';
    const st = stage(), who = call.who;
    const inp = (path, val, ph, type) => '<input type="' + (type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '" oninput="StartCall.set(\'' + path + '\',this.value)" onchange="StartCall.changed()">';
    let left = '';
    if (!p) left += '<div class="st-q"><b>Is this someone we know?</b><input type="search" id="stFind" placeholder="Name or phone number" oninput="StartCall.find(this.value)" style="font-size:14px;padding:7px 9px"><div class="st-find" id="stFindList"></div></div>';
    left += '<div class="st-q"><b>Who is calling?</b><div class="st-chips">' + WHO.map(([k, l]) => chip('who', k, l, who === k)).join('') + '</div>' +
      (who ? '<div class="st-say">' + esc(SAY[who]) + '</div><div class="field-note">' + esc(CDSRules.WHO_NEXT[who] || '') + '</div>' : '') + '</div>';
    if (st >= 1 && who === 'solo') {
      left += '<div class="st-q"><b>About them</b><div class="st-row"><label>Their name' + inp('caller.name', call.caller.name, 'First and last') + '</label>' +
        '<label>Best phone' + inp('phone', call.phone, '(417) 555-0100', 'tel') + '</label></div>' +
        '<div class="field-note">Someone with no one to care for yet goes to the Caregiver Pool, the same list Caregiver Match uses. Nobody is added to Leads as a consumer.</div></div>';
    } else if (st >= 1) {
      left += '<div class="st-q"><b>' + (who === 'self' ? 'Their name' : 'Who needs care') + '</b><div class="st-row"><label>First name' + inp('consumer.first', call.consumer.first, '') + '</label><label>Last name' + inp('consumer.last', call.consumer.last, '') + '</label></div></div>';
      if (who !== 'self') left += '<div class="st-q"><b>' + (who === 'pair' ? 'The attendant calling' : 'Who is calling') + '</b><div class="st-row"><label>Caller\'s name' + inp('caller.name', call.caller.name, '') + '</label>' +
        '<label>Relationship<select onchange="StartCall.set(\'caller.relation\',this.value)"><option value="">pick one</option>' + (who === 'pair' ? ['attendant'] : []).concat(REL).map(r => '<option' + (call.caller.relation === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label></div></div>';
      left += '<div class="st-q"><b>Best phone number</b><div class="st-row"><label>' + (who === 'self' ? 'Their phone' : "The caller's phone") + inp('phone', call.phone, '(417) 555-0100', 'tel') + '</label><label>Email (if they gave one)' + inp('email', call.email, '', 'email') + '</label></div></div>';
      if (st >= 2) {
        left += '<div class="st-q"><b>Do they have Medicaid right now?</b><div class="st-chips">' + chip('medicaid', 'yes', 'Yes', call.medicaid === 'yes') + chip('medicaid', 'no', 'No', call.medicaid === 'no') +
          chip('medicaid', 'applied', 'Applied, waiting', call.medicaid === 'applied') + unk('medicaid') + '</div>' +
          (call.medicaid === 'no' || call.medicaid === 'applied' ? '<div class="field-note">The Medicaid application instructions are ready to send from Finish call.</div>' : '') + '</div>';
        left += '<div class="st-q"><b>Do they get CDS now?</b><div class="st-chips">' + chip('cds', 'new', 'No, new to CDS', call.cds === 'new') + chip('cds', 'move', 'Yes, with another agency', call.cds === 'move') + unk('cds') + '</div>' +
          (call.cds === 'move' ? '<div class="st-row"><label>Which agency' + inp('agency', call.agency, '') + '</label></div>' : '') + '</div>';
        left += '<div class="st-q"><b>What help do they need at home?</b><div class="st-chips">' + Object.keys(S.HELP).map(k => chip('help', k, S.HELP[k].charAt(0).toUpperCase() + S.HELP[k].slice(1), (call.help || []).includes(k), true)).join('') + '</div>' +
          '<input type="text" value="' + esc(call.helpNote) + '" placeholder="Anything else, in their words" oninput="StartCall.set(\'helpNote\',this.value)" style="font-size:13.5px;padding:7px 9px"></div>';
        if (who !== 'pair') left += '<div class="st-q"><b>Someone in mind to be their attendant?</b><div class="st-chips">' + chip('attendant', 'has', 'Yes', call.attendant === 'has') + chip('attendant', 'find', 'No, needs us to find someone', call.attendant === 'find') + unk('attendant') + '</div>' +
          (call.attendant === 'has' ? '<div class="st-row"><label>Their name' + inp('attName', call.attName, '') + '</label><label>Their phone' + inp('attPhone', call.attPhone, '', 'tel') + '</label></div>' : '') + '</div>';
        left += '<div class="st-q"><b>Do they want to go ahead?</b><div class="field-note">Yes means they want us to send the referral or the transfer.</div><div class="st-chips">' + chip('ready', 'yes', 'Yes', call.ready === 'yes') + chip('ready', 'not_yet', 'Not yet', call.ready === 'not_yet') + '</div></div>';
      } else left += '<div><button type="button" class="btn btn-sm btn-outline" onclick="StartCall.set(\'showAll\',true);StartCall.changed()">Show the other questions</button></div>';
    }
    if (st >= 1) left += '<div class="st-q"><b>Call note</b><textarea rows="3" oninput="StartCall.set(\'note\',this.value)" placeholder="Anything worth remembering" style="font:inherit;font-size:13.5px">' + esc(call.note) + '</textarea></div>';
    left += '<div class="field-note">' + (p ? '<a href="#" onclick="closeModal(\'stCallModal\');openPipelineEdit(\'' + q(p.id) + '\');return false">Just a quick note instead (Log a call)</a>'
      : '<a href="#" onclick="closeModal(\'stCallModal\');openModal(\'addSomeoneModal\');return false">Use the full Add someone form instead</a>') + '</div>';
    host.innerHTML = '<div class="st-callgrid"><div style="display:grid;gap:10px">' + left + '</div><div class="st-side" id="stCallSide"></div></div>';
    drawSide();
  }

  function drawSide() {
    const side = document.getElementById('stCallSide');
    if (!side || !call) return;
    if (finish) { side.innerHTML = finishHtml(); afterFinish(); return; }
    const plan = S.callPlan(call);
    side.innerHTML = '<div class="st-sum"><b style="color:var(--primary)">The call so far</b><div style="margin-top:6px">' + esc(call.who ? plan.summary : 'Pick who is calling to start.') + '</div>' +
      (call.who && plan.missing.length ? '<div class="field-note" style="margin-top:8px">Still missing: ' + esc(plan.missing.join('; ')) + '. That is fine; save anyway.</div>' : '') + '</div>' +
      (dup ? dupHtml() : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-outline" onclick="StartCall.save(false)"' + (call.who ? '' : ' disabled') + '>Save</button>' +
      '<button type="button" class="btn btn-primary" onclick="StartCall.save(true)"' + (call.who ? '' : ' disabled') + '>Finish call</button></div>' +
      '<div class="field-note" id="stCallMsg">' + (savedAt ? 'Saved ' + esc(savedAt) + '.' : 'Nothing is saved until you press Save or Finish call.') + '</div>';
  }

  // ---- returning caller
  function find(text) {
    const list = document.getElementById('stFindList');
    if (!list) return;
    const t = String(text || '').trim().toLowerCase(), d = digits(text);
    if (t.length < 3 && d.length < 4) { list.innerHTML = ''; return; }
    const hit = r => (t.length >= 3 && String(r.name || '').toLowerCase().includes(t)) || (d.length >= 4 && [r.phone, ...CDSRules.relatedPeople(r).map(x => x.phone)].some(ph => digits(ph).includes(d)));
    const leads = getData('pipeline').filter(hit).slice(0, 6), cons = getData('consumers').filter(hit).slice(0, 3);
    list.innerHTML = leads.map(p => '<button type="button" onclick="StartCall.useLead(\'' + q(p.id) + '\')"><b>' + esc(p.name || 'No name') + '</b> · lead, came in ' + esc(p.firstContact ? _niceDay(p.firstContact) : '') +
        (CDSRules.CLOSED.includes(p.status) ? ' · closed' : '') + (p.startingId ? ' · Starting' : '') + '</button>').join('') +
      cons.map(c => '<button type="button" onclick="closeModal(\'stCallModal\');openProfile(\'' + q(c.id) + '\')"><b>' + esc(c.name) + '</b> · on Consumers (' + esc(c.status || '') + '): open their profile</button>').join('') +
      (leads.length || cons.length ? '' : '<div class="field-note">Nobody yet. Keep going; this is a new caller.</div>');
  }
  function useLead(id) {
    const p = getData('pipeline').find(x => x.id === id);
    if (!p) return;
    if (p.startingId) { closeModal('stCallModal'); openProfile(p.startingId); return; }
    const keep = call;
    call = fromLead(p);
    // what was already typed on this call wins over the old lead
    ['who', 'medicaid', 'cds', 'attendant', 'ready', 'note', 'helpNote', 'agency', 'attName', 'attPhone'].forEach(k => { if (keep && keep[k]) call[k] = keep[k]; });
    if (keep && keep.help && keep.help.length) call.help = keep.help;
    if (keep && keep.phone) call.phone = keep.phone;
    if (keep && keep.caller && keep.caller.name) call.caller = keep.caller;
    dup = null; draw();
  }
  // Same person already on Leads? Asked once before a new lead is added (no duplicates).
  function findDup() {
    const name = (call.who === 'solo' ? call.caller.name : [call.consumer.first, call.consumer.last].filter(Boolean).join(' ')).trim().toLowerCase();
    const d = digits(call.phone);
    return getData('pipeline').find(p => (name.length > 3 && String(p.name || '').trim().toLowerCase() === name) ||
      (d.length === 10 && [p.phone, ...CDSRules.relatedPeople(p).map(x => x.phone)].some(ph => digits(ph) === d))) || null;
  }
  function dupHtml() {
    return '<div class="alert alert-warn" style="font-size:13px"><div><b>' + esc(dup.name || 'Someone') + ' is already on Leads</b> (came in ' + esc(dup.firstContact ? _niceDay(dup.firstContact) : 'earlier') + ').' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn btn-sm btn-primary" onclick="StartCall.useLead(\'' + q(dup.id) + '\');StartCall.save(' + (call._finishing ? 'true' : 'false') + ')">Use ' + esc(String(dup.name || '').split(' ')[0]) + '\'s lead</button>' +
      '<button type="button" class="btn btn-sm btn-outline" onclick="StartCall.notDup()">It is someone else</button></div></div></div>';
  }
  function notDup() { call._dupOk = true; dup = null; save(!!call._finishing); }

  // ---- save into the lead (the same record Leads uses)
  function save(finishing) {
    if (!call || !call.who) return;
    call._finishing = finishing;
    const pipeline = getData('pipeline');
    let p = call.leadId && pipeline.find(x => x.id === call.leadId);
    if (!p && !call._dupOk) { const d = findDup(); if (d) { dup = d; drawSide(); return; } }
    const today = _todayIso(), now = new Date().toISOString(), by = meName();
    const isNew = !p;
    if (!p) { p = { id: Date.now().toString(), type: 'lead', status: 'new', firstContact: today, addedAt: now, notes: [], relatedPeople: [] }; pipeline.unshift(p); }
    const cn = call.who === 'solo' ? call.caller.name.trim() : [call.consumer.first, call.consumer.last].map(s => s.trim()).filter(Boolean).join(' ');
    if (cn) { p.name = cn; if (call.who !== 'solo') { p.firstName = call.consumer.first.trim(); p.lastName = call.consumer.last.trim(); } }
    if (!p.name) p.name = (call.caller.name ? 'Caller: ' + call.caller.name : 'Unknown caller');
    if (call.who && p.whoCalled !== call.who) {
      p.whoCalled = call.who; p.whoCalledBy = by; p.whoCalledAt = now;
      p.notes = (p.notes || []).concat({ date: today, text: 'Who called: ' + CDSRules.WHO_CALLED[call.who] + ' (set by ' + by + ').', whoCalled: true });
    }
    const ph = digits(call.phone);
    if (call.who === 'self' || call.who === 'solo') { if (ph) p.phone = call.phone.trim(); if (call.email) p.email = call.email.trim(); }
    else if (call.caller.name.trim()) {
      const rp = CDSRules.relatedPeople(p), same = rp.find(r => (ph && digits(r.phone) === ph) || String(r.name || '').toLowerCase() === call.caller.name.trim().toLowerCase());
      if (same) { if (ph) same.phone = call.phone.trim(); if (call.email) same.email = call.email.trim(); if (call.caller.relation) same.relation = call.caller.relation; }
      else { CDSRules.addContact(p, { name: call.caller.name.trim(), phone: call.phone.trim(), role: call.who === 'pair' ? 'attendant' : 'family', relation: call.caller.relation }, { by }); const n = CDSRules.relatedPeople(p); if (call.email) n[n.length - 1].email = call.email.trim(); }
    }
    const medMap = { yes: 'active', no: 'inactive', applied: 'pending' };
    if (medMap[call.medicaid]) p.medicaidStatus = medMap[call.medicaid];
    if (call.cds === 'move') { p.type = 'pccp'; if (call.agency) p.leavingAgency = call.agency.trim(); }
    else if (call.cds === 'new' && call.ready === 'yes' && p.type === 'lead') p.type = 'referral';
    if ((call.help || []).length) p.helpNeeded = call.help.slice();
    if (call.who === 'pair' && call.caller.name.trim()) { p.attendant = Object.assign({}, p.attendant, { name: call.caller.name.trim(), phone: call.phone.trim() || null }); p.caregiverPlan = 'has'; }
    else if (call.attendant === 'has') { if (call.attName) p.attendant = Object.assign({}, p.attendant, { name: call.attName.trim(), phone: call.attPhone.trim() || null }); p.caregiverPlan = 'has'; }
    else if (call.attendant === 'find') p.caregiverPlan = 'find';
    if (call.county) p.county = call.county;
    if (!p.coordinator) p.coordinator = by;
    if (p.status === 'new' && call.who !== 'solo') p.status = 'nurturing';
    if (finishing) {
      const plan = S.callPlan(call);
      p.notes = (p.notes || []).concat({ date: today, text: 'Call: ' + plan.summary + (call.note ? ' Note: ' + call.note.trim() : ''), call: true, by });
      call.note = '';
    } else if (call.note.trim()) { p.notes = (p.notes || []).concat({ date: today, text: call.note.trim(), by }); call.note = ''; }
    call.leadId = p.id;
    setData('pipeline', pipeline);
    if (isNew && typeof syncOneToGhl === 'function') try { syncOneToGhl('pipeline', p.id, p.name); } catch (e) {}
    savedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    dup = null;
    if (finishing) { const plan = S.callPlan(call); finish = { plan, owner: p.coordinator || by, date: plan.followDays ? addDays(plan.followDays) : '', ch: 'sms', body: '', sent: '' }; finish.body = callText(p, plan); }
    draw();
  }

  // ---- Finish call
  function callText(p, plan) {
    if (!plan.say) return '';
    const M = H().messages(), callerFirst = String((call.who === 'self' || call.who === 'solo') ? (call.caller.name || p.name) : call.caller.name).split(' ')[0] || 'there';
    const tpl = M.templates.callText || "Hi {caller}, it's {coordinator} with Caring Companions CDS. {next} Questions? Call or text us at {cds_phone}.";
    return S.fillTemplate(tpl.replace('{next}', plan.say), { caller: callerFirst, consumer: call.consumer.first, coordinator: meName() }, M.resources);
  }
  function finishHtml() {
    const p = getData('pipeline').find(x => x.id === call.leadId), f = finish, plan = f.plan;
    const rp = CDSRules.relatedPeople(p).find(r => r.role !== 'attendant') || null;
    const to = f.ch === 'sms' ? (call.who === 'self' || call.who === 'solo' ? p.phone : rp && rp.phone) : (call.who === 'self' || call.who === 'solo' ? p.email : rp && rp.email);
    const staff = (getData('officeStaff') || []).filter(x => x && !x.leftAt && x.name).map(x => String(x.name).split(/\s+/)[0]).concat(['Samantha', meName()]);
    const owners = [...new Set(staff.concat(f.owner ? [f.owner] : []))].sort();
    const primary = plan.next.k === 'pool' ? '<button type="button" class="btn btn-primary" onclick="StartCall.toPool()">Move them to the Caregiver Pool</button>'
      : p.startingId ? '<button type="button" class="btn btn-primary" onclick="closeModal(\'stCallModal\');openProfile(\'' + q(p.startingId) + '\')">Open their profile</button>'
      : '<button type="button" class="btn ' + (plan.next.k === 'start' ? 'btn-primary' : 'btn-outline') + '" onclick="StartCall.startProfile()">Yes, start their profile</button>';
    return '<div class="st-sum"><b style="color:var(--primary)">Call saved</b><div style="margin-top:6px">' + esc(plan.summary) + '</div>' +
      '<div style="margin-top:8px"><b>Still missing:</b> ' + esc(plan.missing.length ? plan.missing.join('; ') : 'nothing') + '</div>' +
      '<div style="margin-top:8px;padding:8px 10px;background:#fbf1dc;border-radius:10px"><b>Next step:</b> ' + esc(plan.next.t) + '</div>' +
      (plan.next.k !== 'pool' ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;font-size:13px">Who: <select id="stFinOwner" style="font-size:13px">' + owners.map(o => '<option' + (o === f.owner ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>' +
        ' Follow up: <input type="date" id="stFinDate" value="' + esc(f.date) + '" style="font-size:13px"> <button type="button" class="btn btn-sm btn-outline" onclick="StartCall.saveFollow()">Save</button></div><div class="field-note" id="stFinNote"></div>' : '') + '</div>' +
      (f.body !== '' || plan.say ? '<div class="st-q"><b>Message to ' + esc((call.who === 'self' || call.who === 'solo') ? (p.name || 'them') : (rp && rp.name) || 'the caller') + '</b>' +
        '<div class="st-seg" role="group"><button type="button" aria-pressed="' + (f.ch === 'sms') + '" onclick="StartCall.ch(\'sms\')">Text</button><button type="button" aria-pressed="' + (f.ch === 'email') + '" onclick="StartCall.ch(\'email\')">Email</button></div>' +
        '<div class="field-note">' + (to ? esc((f.ch === 'sms' ? 'Text to ' : 'Email to ') + to) : '<span style="color:var(--danger)">No ' + (f.ch === 'sms' ? 'phone' : 'email') + ' for them yet.</span>') + '</div>' +
        '<textarea id="stFinBody" rows="5" oninput="StartCall.body(this.value)" style="font:inherit;font-size:13px">' + esc(f.body) + '</textarea>' +
        (f.sent ? '<div style="font-size:13px;font-weight:600;color:' + (/^FAILED/.test(f.sent) ? 'var(--danger)' : 'var(--success)') + '">' + esc(f.sent) + '</div>'
          : '<div style="display:flex;gap:8px"><button type="button" class="btn btn-sm btn-primary" onclick="StartCall.send()"' + (to ? '' : ' disabled') + '>Send</button><span class="field-note">Read it first. Nothing goes out until you press Send.</span></div>') + '</div>' : '') +
      (call.medicaid === 'no' || call.medicaid === 'applied' ? '<div class="st-q"><b>Medicaid application instructions</b><div class="field-note">Ready to send now. You review it first.</div>' +
        '<div><button type="button" class="btn btn-sm btn-primary" onclick="StartHub.compose(\'lead\',\'' + q(p.id) + '\',\'stCmp_call\')">Send Medicaid application instructions</button></div><div id="stCmp_call"></div><div id="stSends_call"></div></div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + primary + '<button type="button" class="btn btn-outline" onclick="StartCall.done()">Done</button></div>' +
      '<div class="field-note" id="stFinMsg"></div>';
  }
  function afterFinish() {}
  function ch(c) { const p = getData('pipeline').find(x => x.id === call.leadId); finish.ch = c; if (!finish.dirty) finish.body = callText(p, finish.plan); drawSide(); }
  function body(v) { finish.body = v; finish.dirty = true; }
  function saveFollow() {
    const owner = (document.getElementById('stFinOwner') || {}).value, date = (document.getElementById('stFinDate') || {}).value;
    const pipeline = getData('pipeline'), p = pipeline.find(x => x.id === call.leadId);
    if (!p) return;
    p.coordinator = owner || p.coordinator;
    if (date) p.followup = date;
    if (date && (call.medicaid === 'no' || call.medicaid === 'applied')) {
      p.medicaid = p.medicaid || {};
      p.medicaid.application = p.medicaid.application || { stage: call.medicaid === 'applied' ? 'applied' : 'help', at: new Date().toISOString(), by: meName() };
      p.medicaid.followup = { date, owner, done: false, by: meName(), at: new Date().toISOString() };
    }
    setData('pipeline', pipeline);
    finish.owner = owner; finish.date = date;
    const n = document.getElementById('stFinNote');
    if (n) n.textContent = 'Saved: ' + owner + ' calls back ' + (date ? _niceDay(date) : '') + '. It is on Today that day.';
  }
  async function send() {
    const p = getData('pipeline').find(x => x.id === call.leadId), rp = CDSRules.relatedPeople(p).find(r => r.role !== 'attendant');
    const self = call.who === 'self' || call.who === 'solo';
    const to = finish.ch === 'sms' ? (self ? p.phone : rp && rp.phone) : (self ? p.email : rp && rp.email);
    const bad = S.identifierProblems(finish.body, { dcn: p.dcn });
    if (bad.length) { finish.sent = ''; document.getElementById('stFinMsg').textContent = 'Take out ' + bad.join(' and ') + '.'; return; }
    try {
      const r = await cdsMatchApi('callFollowupSend', { person: { kind: 'lead', id: String(p.id), name: p.name }, channel: finish.ch, to, subject: finish.ch === 'email' ? 'Thank you for calling Caring Companions' : '', body: finish.body, ids: { dcn: p.dcn } });
      const m = r.message;
      finish.sent = { sent: 'Sent.', held: 'Saved, waiting: the Starting texts to families switch is off.', practice: 'Practice only, not sent.', failed: 'FAILED: ' + (m.error || '') + ' It is on Today under Needs attention.' }[m.status] || m.status;
      edit(p.id, x => { x.notes = (x.notes || []).concat({ date: _todayIso(), text: (finish.ch === 'sms' ? 'Text' : 'Email') + ' after the call: ' + finish.sent.split(':')[0], by: meName() }); });
    } catch (e) { finish.sent = 'FAILED: ' + (e.message || e); }
    drawSide();
  }
  function edit(id, fn) { const list = getData('pipeline'), x = list.find(r => r.id === id); if (x) { fn(x); setData('pipeline', list); } }
  function startProfile() {
    const p = getData('pipeline').find(x => x.id === call.leadId);
    if (!p) return;
    closeModal('stCallModal');
    H().startFromLead(p.id, call.cds === 'move' || p.type === 'pccp' ? 'move' : 'new');
  }
  async function toPool() {
    const id = call.leadId;
    await ldToPool(id);
    const p = getData('pipeline').find(x => x.id === id);
    const msg = document.getElementById('stFinMsg');
    if (p && p.status === 'closed_pool') { if (msg) msg.innerHTML = '<span style="color:var(--success);font-weight:600">Moved to the Caregiver Pool. This lead is closed; nothing was sent.</span>'; }
    else if (msg) msg.innerHTML = '<span style="color:var(--danger)">' + esc(typeof _ldPoolErr === 'string' && _ldPoolErr ? _ldPoolErr : 'Not moved.') + '</span>';
  }
  function done() { const id = call && call.leadId; closeModal('stCallModal'); if (id) openLeadProfile(id); else if (typeof renderPipeline === 'function') renderPipeline(); }

  window.StartCall = { open, close, pick, set, changed, find, useLead, notDup, save, ch, body, saveFollow, send, startProfile, toPool, done, state: () => call, finishState: () => finish };
})();
