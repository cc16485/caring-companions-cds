// CDS Hub · the first call (2026-11-04, her ask: "one connected workflow, starting the moment someone calls").
// Behind the hub switch 'starting'. One screen for a phone call: who is calling (the hub's Who called
// choices), then one question at a time with a line to say (guided call 2026-11-05, her ask: "really guide
// through the conversation"; date of birth, county and DCN asked on the call), Back, Skip and a step bar
// to jump around, unknown answers allowed, Save at any point, and
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
  let call = null, dup = null, finish = null, savedAt = '', drawing = false;

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
    '.st-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}.st-q > *{min-width:0}.st-row label{display:grid;gap:3px;font-size:12px;color:var(--gray-600);min-width:0}.st-row input,.st-row select{font:inherit;font-size:14px;padding:7px 9px;width:100%;min-width:0;max-width:100%;box-sizing:border-box;justify-self:stretch}' +
    '.st-say{border-left:3px solid var(--accent);padding:6px 12px;font-style:italic;background:var(--white);border-radius:0 10px 10px 0;font-size:13.5px}' +
    '.st-side{position:sticky;top:0;display:grid;gap:10px}.st-sum{background:var(--white);border:2px solid var(--primary);border-radius:14px;padding:12px 14px;font-size:13.5px}' +
    '.st-steps{display:flex;gap:4px;flex-wrap:wrap}.st-steps button{font:500 11.5px Poppins,sans-serif;border:1px solid var(--gray-300);background:var(--white);color:var(--gray-600);border-radius:999px;padding:4px 9px;cursor:pointer}' +
    '.st-steps button.done{background:#e7f3ec;border-color:#9fcfb2;color:#24603d}.st-steps button.here{background:var(--primary);border-color:var(--primary);color:#fff}' +
    '.st-step{background:var(--white);border:2px solid var(--primary);border-radius:16px;padding:16px 18px;display:grid;gap:12px;font-size:14px}.st-step > *{min-width:0}' +
    '.st-step h3{margin:0;font:600 19px Poppins,sans-serif;color:var(--primary)}.st-why{font-size:12.5px;color:var(--gray-600)}' +
    '.st-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.st-nav .grow{flex:1}' +
    '.st-find{display:grid;gap:4px;margin-top:6px}.st-find button{text-align:left;font:inherit;font-size:13px;border:1px solid var(--gray-300);background:var(--white);border-radius:10px;padding:7px 10px;cursor:pointer}' +
    '@media (max-width:820px){.st-callgrid{grid-template-columns:minmax(0,1fr)}.st-side{position:static}.st-row{grid-template-columns:minmax(0,1fr)}}' +
    '</style>');

  function blank() {
    return { leadId: '', who: '', consumer: { first: '', last: '' }, caller: { name: '', relation: '' }, phone: '', email: '', medicaid: '', cds: '', agency: '',
             help: [], helpNote: '', attendant: '', attName: '', attPhone: '', county: '', note: '', ready: '',
             dob: '', dobSkip: false, dcn: '', dcnUnknown: false, appStage: '', step: 0,
             countyOther: '', condition: '', handsOn: '', selfDirect: '', guardian: '', living: '', other: '', attRel: '', attEmail: '', attCds: '', consPhone: '', consEmail: '' };
  }
  // A returning caller's lead fills the screen (nothing typed twice).
  function fromLead(p) {
    // "Caller: Bea" and "Unknown caller" are placeholders for a name nobody gave yet, not the consumer's name.
    const c = blank(), bits = /^(Caller: |Unknown caller$)/.test(String(p.name || '')) ? [] : String(p.name || '').trim().split(/\s+/);
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
    c.attEmail = (p.attendant && p.attendant.email) || ''; c.attRel = (p.attendant && p.attendant.relation) || '';
    if (rel) { c.consPhone = p.phone || ''; c.consEmail = p.email || ''; }
    const sc = p.screening || {};
    ['condition', 'handsOn', 'selfDirect', 'guardian', 'living', 'other', 'attCds'].forEach(k => { if (sc[k]) c[k] = sc[k]; });
    c.county = p.county || '';
    if (c.county && AREA().length && !AREA().includes(c.county)) { c.countyOther = c.county; c.county = 'Other'; }
    c.dob = typeof ldtIsoDay === 'function' ? ldtIsoDay(p.dob || (p.referral || {}).dob) || '' : String(p.dob || '').slice(0, 10);
    c.dcn = p.dcn || (p.referral || {}).dcn || '';
    c.appStage = (p.medicaid && p.medicaid.application && p.medicaid.application.stage !== 'applied' && p.medicaid.application.stage) || '';
    // A returning caller starts on the first question not answered yet.
    const st = steps(c), at = st.findIndex(k => k !== 'who' && !answered(c, k));
    c.step = at < 0 ? st.length - 1 : at;
    return c;
  }

  function open(pid) {
    if (!(H() && H().on())) { if (pid) openPipelineEdit(pid); else openModal('addSomeoneModal'); return; }
    const p = pid && getData('pipeline').find(x => x.id === pid);
    call = p ? fromLead(p) : blank(); call.area = AREA(); dup = null; finish = null; savedAt = '';
    openModal('stCallModal'); draw();
  }
  function close() { closeModal('stCallModal'); if (call && call.leadId && document.getElementById('page-leadprofile') && document.getElementById('page-leadprofile').classList.contains('active')) renderLeadProfile(); if (typeof renderPipeline === 'function') renderPipeline(); }

  function pick(group, val, multi) {
    if (group === 'dcnUnknown' || group === 'dobSkip') { call[group] = !call[group]; draw(); return; }
    if (multi) { const a = call[group] || []; call[group] = a.includes(val) ? a.filter(x => x !== val) : a.concat([val]); }
    else call[group] = call[group] === val ? '' : val;
    if (group === 'who' && val === 'pair') { call.attendant = 'has'; if (!call.caller.relation) call.caller.relation = 'attendant'; }
    if (group === 'who' && val === 'self') call.caller = { name: '', relation: '' };
    if (group === 'medicaid') { if (call.medicaid !== 'yes') call.dcnUnknown = false; if (call.medicaid !== 'no') call.appStage = ''; }
    if (group === 'who') call.step = Math.min(call.step, steps(call).length - 1);
    draw();
  }
  function set(path, v) {
    const [a, b] = path.split('.');
    if (b) call[a][b] = v; else call[a] = v;
    if (a === 'dcn' && v) call.dcnUnknown = false;
    if (a === 'dob' && v) call.dobSkip = false;
    drawSide();
  }
  // A text box lost focus: redraw only the parts that depend on it (age, the step bar), never the box itself,
  // so a click that follows is never lost.
  function changed() { setTimeout(() => { drawBar(); drawSide(); const a = document.getElementById('stAge'); if (a) a.textContent = ageText(); }, 0); }

  // ---- the guided steps: one question at a time
  function steps(c) {
    c = c || call;
    if (!c.who) return ['who'];
    if (c.who === 'solo') return ['who', 'names', 'wrap'];
    // Already in CDS with another agency: the state approved them, so only who they are and how to reach them (her 11-05 ask).
    if (c.cds === 'move') return ['who', 'cds', 'names', 'dob', 'county', 'phone', 'attendant', 'ready', 'wrap'];
    return ['who', 'cds', 'names', 'phone', 'dob', 'county', 'medicaid', 'help', 'decide', 'living'].concat(['attendant', 'ready', 'wrap']);
  }
  const STEP_LABEL = { who: 'Who', names: 'Names', phone: 'Phone', dob: 'Birth date', county: 'County', medicaid: 'Medicaid', cds: 'CDS now', help: 'Help at home', decide: 'Their decisions', living: 'Where they live', attendant: 'Attendant', ready: 'Go ahead', wrap: 'Wrap up' };
  // Our service area: the hub's CDS_COUNTIES (the same 27 counties as caringcds.com/service-area, checked 2026-11-05).
  const AREA = () => (typeof CDS_COUNTIES !== 'undefined' ? CDS_COUNTIES : []);
  const ATT_REL = ['daughter', 'son', 'grandchild', 'sister', 'brother', 'niece or nephew', 'friend', 'neighbor', 'other family', 'spouse', 'legal guardian', 'other'];
  function answered(c, k) {
    switch (k) {
      case 'who': return !!c.who;
      case 'names': return c.who === 'solo' ? !!(c.caller.name && digits(c.phone)) : !!(c.consumer.first && (c.who === 'self' || c.caller.name));
      case 'phone': return !!digits(c.phone) && (c.cds !== 'move' || c.who === 'self' || !!digits(c.consPhone));
      case 'dob': return !!(c.dob || c.dobSkip);
      case 'county': return !!c.county && (c.county !== 'Other' || !!String(c.countyOther || '').trim());
      case 'medicaid': return !!c.medicaid && (c.medicaid !== 'yes' || !!(c.dcn || c.dcnUnknown)) && (c.medicaid !== 'no' || !!c.appStage);
      case 'cds': return !!c.cds;
      case 'help': return !!((c.help || []).length || c.helpNote) && !!c.condition && !!c.handsOn;
      case 'decide': return !!c.selfDirect && !!c.guardian;
      case 'living': return !!c.living && !!c.other;
      case 'attendant': return c.who === 'pair' ? !!c.attRel : !!c.attendant && (c.attendant !== 'has' || !!(c.attName && c.attRel));
      case 'ready': return !!c.ready;
      default: return false;
    }
  }
  function go(i) { const n = steps().length; call.step = Math.max(0, Math.min(n - 1, i)); draw(); const b = document.getElementById('stCallBody'); if (b && b.scrollIntoView) { const m = b.closest('.modal'); if (m) m.scrollTop = 0; } }
  function next() { go(call.step + 1); }
  function back() { go(call.step - 1); }
  // Who the conversation is about, for the lines to say.
  function them() { return call.who === 'self' ? 'you' : (call.consumer.first || 'them'); }
  function theirs() { return call.who === 'self' ? 'your' : (call.consumer.first ? call.consumer.first + "'s" : 'their'); }
  function ageText() { const a = S.ageOn(call.dob); return a === null ? '' : 'Age ' + a + (a >= 65 ? '. The application instructions will include the form for 65 and older.' : a < 18 ? '. Under 18: CDS is for adults 18 and older (policy 3.25). Look into it before anything is sent to the state.' : '.'); }

  function draw() {
    const host = document.getElementById('stCallBody');
    if (!host || !call || drawing) return;
    drawing = true;
    try { drawNow(host); } finally { drawing = false; }
  }
  function drawBar() {
    const bar = document.getElementById('stBar');
    if (!bar || !call) return;
    const st = steps();
    bar.innerHTML = st.map((k, i) => '<button type="button" class="' + (i === call.step ? 'here' : answered(call, k) ? 'done' : '') + '" onclick="StartCall.go(' + i + ')">' + (answered(call, k) && i !== call.step ? '✓ ' : '') + esc(STEP_LABEL[k]) + '</button>').join('');
  }
  function drawNow(host) {
    const p = call.leadId && getData('pipeline').find(x => x.id === call.leadId);
    document.getElementById('stCallTitle').textContent = p ? 'On a call: ' + (p.name || 'this lead') : 'On a call';
    const who = call.who, st = steps();
    if (call.step >= st.length) call.step = st.length - 1;
    const k = st[call.step];
    const inp = (path, val, ph, type, label) => '<label>' + label + '<input type="' + (type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '" oninput="StartCall.set(\'' + path + '\',this.value)" onchange="StartCall.changed()"></label>';
    const say = t => '<div class="st-say">"' + esc(t) + '"</div>';
    const why = t => '<div class="st-why">' + esc(t) + '</div>';
    let body = '';
    if (k === 'who') {
      body = (!p ? '<div style="display:grid;gap:6px"><b style="font-size:13.5px">Is this someone we know?</b><input type="search" id="stFind" placeholder="Name or phone number" oninput="StartCall.find(this.value)" style="font-size:14px;padding:7px 9px"><div class="st-find" id="stFindList"></div></div>' : '') +
        '<h3>Who is calling?</h3>' + say('Thank you for calling Caring Companions CDS, this is ' + meName() + '. Are you calling for yourself, for a loved one, or about being an attendant?') +
        '<div class="st-chips">' + WHO.map(([v, l]) => chip('who', v, l, who === v)).join('') + '</div>' +
        (who ? say(SAY[who].replace(/^"|"$/g, '')) + why(CDSRules.WHO_NEXT[who] || '') : '');
    } else if (k === 'names' && who === 'solo') {
      body = '<h3>Their name and number</h3>' + say('Thank you! Families often ask us for an attendant. Can I get your first and last name, and the best number to reach you?') +
        '<div class="st-row">' + inp('caller.name', call.caller.name, 'First and last', 'text', 'Their name') + inp('phone', call.phone, '(417) 555-0100', 'tel', 'Best phone') + '</div>' +
        why('Someone with no one to care for yet goes to the Caregiver Pool, the same list Caregiver Match uses. Nobody is added to Leads as a consumer.');
    } else if (k === 'names') {
      body = '<h3>' + (who === 'self' ? 'Their name' : 'Who needs care, and who is calling') + '</h3>' +
        say(who === 'self' ? 'Can I get your first and last name?' : who === 'pair' ? 'What is the name of the person you would be caring for? And can I get your name too?' : 'Who are we helping get started? And can I get your name too?') +
        '<div class="st-row">' + inp('consumer.first', call.consumer.first, '', 'text', 'First name') + inp('consumer.last', call.consumer.last, '', 'text', 'Last name') + '</div>' +
        (who !== 'self' ? '<div class="st-row">' + inp('caller.name', call.caller.name, '', 'text', "Caller's name") +
          '<label>Relationship<select onchange="StartCall.set(\'caller.relation\',this.value)"><option value="">pick one</option>' + (who === 'pair' ? ['attendant'] : []).concat(REL).map(r => '<option' + (call.caller.relation === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label></div>' : '');
    } else if (k === 'phone') {
      body = '<h3>Best phone number and email</h3>' + say('What is the best number to reach you? And is there an email where I can send you information?') +
        '<div class="st-row">' + inp('phone', call.phone, '(417) 555-0100', 'tel', who === 'self' ? 'Their phone' : "The caller's phone") + inp('email', call.email, '', 'email', 'Email (if they gave one)') + '</div>' +
        (who !== 'self' ? say('And what is the best phone number and email for ' + them() + '?') +
          '<div class="st-row">' + inp('consPhone', call.consPhone, call.cds === 'move' ? '' : 'if different', 'tel', "The consumer's phone") + inp('consEmail', call.consEmail, '', 'email', "The consumer's email") + '</div>' : '') +
        why('Texts and emails after the call go to the caller. Nothing is sent until you press Send.');
    } else if (k === 'dob') {
      body = '<h3>Date of birth</h3>' + say(who === 'self' ? 'And what is your date of birth? That helps us look up your Medicaid.' : 'What is ' + theirs() + ' date of birth? That helps us look up ' + (call.consumer.first ? 'their' : 'the') + ' Medicaid.') +
        '<div class="st-row">' + inp('dob', call.dob, '', 'date', 'Date of birth') + '<div></div></div><div id="stAge" style="font-weight:600;color:var(--primary)">' + esc(ageText()) + '</div>' +
        '<div class="st-chips">' + chip('dobSkip', 'yes', "They don't know or would rather not say", call.dobSkip) + '</div>' +
        why('With first name, last name and date of birth we can look them up in eMOMED when there is no DCN.');
    } else if (k === 'county') {
      const list = AREA().slice().sort();
      const listed = call.county && call.county !== 'Other' && !list.includes(call.county);
      if (listed) list.unshift(call.county);
      body = '<h3>Where do they live?</h3>' + say('What county ' + (who === 'self' ? 'do you' : 'does ' + them()) + ' live in?') +
        '<div class="st-row"><label>County<select onchange="StartCall.set(\'county\',this.value);StartCall.changed();StartCall.draw()"><option value="">pick one</option>' + list.map(c => '<option' + (call.county === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '<option value="Other"' + (call.county === 'Other' ? ' selected' : '') + '>Another county</option></select></label>' +
        (call.county === 'Other' ? inp('countyOther', call.countyOther, 'For example, Jackson', 'text', 'Which county?') : '<div></div>') + '</div>' +
        (S.outsideArea(Object.assign({}, call, { area: AREA() }))
          ? '<div class="alert alert-warn" style="font-size:13px;display:block">Outside our 27 counties in Southwest Missouri. Look into this before anything is sent to the state.</div>' +
            say('We serve 27 counties in Southwest Missouri. Let me check with our team, and we will call you back either way.')
          : why('The list is our service area: the same 27 counties as caringcds.com/service-area.'));
    } else if (k === 'medicaid') {
      body = '<h3>Medicaid</h3>' + say((who === 'self' ? 'Do you' : 'Does ' + them()) + ' have Medicaid right now?') +
        '<div class="st-chips">' + chip('medicaid', 'yes', 'Yes', call.medicaid === 'yes') + chip('medicaid', 'no', 'No', call.medicaid === 'no') + chip('medicaid', 'applied', 'Applied, waiting', call.medicaid === 'applied') + unk('medicaid') + '</div>';
      if (call.medicaid === 'yes') body += say('Do you happen to have ' + theirs() + ' DCN? It is the number on the Medicaid card or letters. No worries if not; we can look it up.') +
        '<div class="st-row">' + inp('dcn', call.dcn, '', 'text', 'DCN') + '<div></div></div>' +
        '<div class="st-chips">' + chip('dcnUnknown', 'yes', "They don't have it handy", call.dcnUnknown) + '</div>' +
        why('The DCN stays on the profile. It never goes in a text or email.' + (call.dob ? '' : ' Without it, the date of birth is how we look them up.'));
      else if (call.medicaid === 'no') body += say('CDS is paid for by Medicaid, so the first step is applying. Would you like some help with the application, or would you rather apply on your own?') +
        '<div class="st-chips">' + chip('appStage', 'help', 'Would like help applying', call.appStage === 'help') + chip('appStage', 'plans', 'Will apply on their own', call.appStage === 'plans') + '</div>' +
        why('At Finish call you can send the Medicaid application instructions by text or email.');
      else if (call.medicaid === 'applied') body += say('That is a great first step. When the letter comes, let us know and we will take the next step together.') +
        why('At Finish call you can send the instructions too; they include how to check on the application.');
      else if (call.medicaid === 'unsure') body += why('That is fine. We look them up in eMOMED by name and date of birth.');
    } else if (k === 'cds') {
      body = '<h3>CDS now?</h3>' + say((who === 'self' ? 'Are you' : 'Is ' + them()) + ' getting CDS services with another agency right now, or would this be new?') +
        '<div class="st-chips">' + chip('cds', 'new', 'No, new to CDS', call.cds === 'new') + chip('cds', 'move', 'Yes, with another agency', call.cds === 'move') + unk('cds') + '</div>' +
        (call.cds === 'move' ? '<div class="st-row">' + inp('agency', call.agency, '', 'text', 'Which agency') + '<div></div></div>' + why('A transfer: the state already approved them, so the call is short. Names, birth date, phone and email for the consumer and the attendant.') : '');
    } else if (k === 'help') {
      body = '<h3>Help at home</h3>' + say('What is the diagnosis or health condition that makes daily tasks hard for ' + (who === 'self' ? 'you' : them()) + '? For example, a stroke, a heart condition, arthritis, a fall or a surgery.') +
        '<input type="text" value="' + esc(call.condition) + '" placeholder="In their words" aria-label="Why they need help" oninput="StartCall.set(\'condition\',this.value)" onchange="StartCall.changed()" style="font-size:13.5px;padding:7px 9px">' +
        why('CDS is for a physical disability: the body needs another person\'s help with routine tasks (RSMo 208.900).') +
        say('What kind of help ' + (who === 'self' ? 'do you' : 'does ' + them()) + ' need at home?') +
        '<div class="st-chips">' + Object.keys(S.HELP).map(h => chip('help', h, S.HELP[h].charAt(0).toUpperCase() + S.HELP[h].slice(1), (call.help || []).includes(h), true)).join('') + '</div>' +
        '<input type="text" value="' + esc(call.helpNote) + '" placeholder="Anything else, in their words" oninput="StartCall.set(\'helpNote\',this.value)" onchange="StartCall.changed()" style="font-size:13.5px;padding:7px 9px">' +
        say((who === 'self' ? 'Do you' : 'Does ' + them()) + ' need hands-on help, or mostly reminders and someone nearby?') +
        '<div class="st-chips">' + chip('handsOn', 'hands', 'Hands-on help', call.handsOn === 'hands') + chip('handsOn', 'reminders', 'Mostly reminders or someone nearby', call.handsOn === 'reminders') + unk('handsOn') + '</div>' +
        why('The state pays for hands-on help only, not reminders, standby or waiting time (policy 3.25). The state\'s assessment decides eligibility; never tell a family they will qualify.');
    } else if (k === 'decide') {
      body = '<h3>Their decisions</h3>' + say('CDS asks ' + (who === 'self' ? 'you' : them()) + ' to direct ' + (who === 'self' ? 'your' : 'their') + ' own services: managing the attendant\'s schedule, making sure they clock in and out, and asking for the help ' + (who === 'self' ? 'you need' : 'they need') + '. ' + (who === 'self' ? 'Are you' : 'Is ' + them()) + ' able to do this?') +
        '<div class="st-chips">' + chip('selfDirect', 'yes', 'Yes', call.selfDirect === 'yes') + chip('selfDirect', 'concern', 'Memory or decision-making concerns', call.selfDirect === 'concern') + unk('selfDirect') + '</div>' +
        say('Does anyone have guardianship or conservatorship for ' + (who === 'self' ? 'you' : them()) + '?') +
        '<div class="st-chips">' + chip('guardian', 'no', 'No', call.guardian === 'no') + chip('guardian', 'yes', 'Yes', call.guardian === 'yes') + unk('guardian') + '</div>' +
        why('A concern or a guardian is not a no. Look into it before anything is sent to the state.');
    } else if (k === 'living') {
      body = '<h3>Where they live</h3>' + say('Where ' + (who === 'self' ? 'are you' : 'is ' + them()) + ' living right now? At home, or in a nursing facility or residential care community?') +
        '<div class="st-chips">' + chip('living', 'home', 'Their own home', call.living === 'home') + chip('living', 'family', 'With family', call.living === 'family') + chip('living', 'hospital', 'Hospital or rehab', call.living === 'hospital') +
          chip('living', 'facility', 'Nursing home, RCF or assisted living', call.living === 'facility') + unk('living') + '</div>' +
        say((who === 'self' ? 'Are you' : 'Is ' + them()) + ' getting any other help at home right now, from another agency or DMH?') +
        '<div class="st-chips">' + chip('other', 'none', 'No', call.other === 'none') + chip('other', 'agency', 'Another agency', call.other === 'agency') + chip('other', 'dmh', 'DMH services', call.other === 'dmh') + unk('other') + '</div>';
    } else if (k === 'attendant') {
      const relSel = '<label>How are they related to ' + esc(who === 'self' ? 'the consumer' : them()) + '?<select onchange="StartCall.set(\'attRel\',this.value);StartCall.changed();StartCall.draw()"><option value="">pick one</option>' + ATT_REL.map(r => '<option' + (call.attRel === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>';
      const attCds = '<div style="display:grid;gap:6px"><span style="font-size:12.5px;color:var(--gray-600)">Do they get CDS services themselves?</span><div class="st-chips">' + chip('attCds', 'no', 'No', call.attCds === 'no') + chip('attCds', 'yes', 'Yes', call.attCds === 'yes') + unk('attCds') + '</div></div>';
      if (who === 'pair') {
        body = '<h3>You, the attendant</h3>' + say('How are you related to ' + them() + '? And what is a good email for you?') +
          '<div class="st-row">' + relSel + inp('attEmail', call.attEmail, '', 'email', 'Attendant email') + '</div>' + attCds;
      } else {
        body = '<h3>An attendant</h3>' + say(call.cds === 'move' ? 'Who is ' + (who === 'self' ? 'your' : theirs()) + ' attendant now? Can I get their phone number and email?'
            : 'With CDS, ' + (who === 'self' ? 'you choose your' : them() + ' chooses their') + ' own attendant, often a family member or friend. Do ' + (who === 'self' ? 'you' : 'they') + ' have someone in mind?') +
          '<div class="st-chips">' + chip('attendant', 'has', 'Yes', call.attendant === 'has') + chip('attendant', 'find', 'No, needs us to find someone', call.attendant === 'find') + unk('attendant') + '</div>' +
          (call.attendant === 'has' ? '<div class="st-row">' + inp('attName', call.attName, '', 'text', 'Their name') + inp('attPhone', call.attPhone, '', 'tel', 'Their phone') + '</div>' +
            '<div class="st-row">' + inp('attEmail', call.attEmail, '', 'email', 'Their email') + relSel + '</div>' + attCds : '') +
          (call.attendant === 'find' ? why('We work on a match from the Caregiver Pool. Do not promise a person or a start date yet.') : '');
      }
      const af = S.callFlags(call).filter(x => x.k === 'att');
      if (af.length) body += '<div class="alert alert-warn" style="font-size:13px">' + af.map(x => esc(x.t)).join('<br>') + ' They can choose someone else.</div>';
    } else if (k === 'ready') {
      body = '<h3>Go ahead?</h3>' + say(call.cds === 'move' ? 'Would you like us to go ahead and start the transfer?' : 'Would you like us to go ahead and send the referral to the state?') +
        why('Yes means they want us to send the referral or the transfer. It starts their profile at Finish call.') +
        '<div class="st-chips">' + chip('ready', 'yes', 'Yes', call.ready === 'yes') + chip('ready', 'not_yet', 'Not yet', call.ready === 'not_yet') + '</div>';
    } else if (k === 'wrap') {
      const plan = S.callPlan(call);
      body = '<h3>Before you hang up</h3>' + (who === 'solo' ? '' : say('Is there anything else I should know about ' + them() + '?')) +
        '<textarea rows="3" oninput="StartCall.set(\'note\',this.value)" placeholder="Call note: anything worth remembering" style="font:inherit;font-size:13.5px">' + esc(call.note) + '</textarea>' +
        '<div style="padding:10px 12px;background:#fbf1dc;border-radius:10px"><b>What happens next:</b> ' + esc(plan.next.t) + '</div>' +
        (plan.say ? '<div><b style="font-size:13px">Tell them before you hang up:</b>' + say(plan.say) + '</div>' : '') +
        (plan.flags.length ? '<div class="alert alert-warn" style="font-size:13px;display:block"><b>Look into before sending to the state:</b><ul style="margin:6px 0 0 18px;padding:0">' + plan.flags.map(x => '<li>' + esc(x.t) + '</li>').join('') + '</ul><div style="margin-top:6px">Do not tell the family they qualify or do not qualify.</div></div>' : '') +
        (plan.missing.length ? why('Still missing: ' + plan.missing.join('; ') + '. Tap a step above to go back, or save anyway.') : '') +
        '<div><button type="button" class="btn btn-primary" onclick="StartCall.save(true)">Finish call</button></div>';
    }
    const last = call.step === st.length - 1;
    const nav = '<div class="st-nav">' + (call.step > 0 ? '<button type="button" class="btn btn-outline btn-sm" onclick="StartCall.back()">Back</button>' : '') + '<span class="grow"></span>' +
      (!last && k !== 'who' && !answered(call, k) ? '<button type="button" class="btn btn-outline btn-sm" onclick="StartCall.next()">Skip for now</button>' : '') +
      (!last || k === 'who' ? '<button type="button" class="btn btn-primary btn-sm" onclick="StartCall.next()"' + (k === 'who' && !who ? ' disabled' : '') + '>Next</button>' : '') + '</div>';
    let left = (st.length > 1 ? '<div class="field-note">Question ' + (call.step + 1) + ' of ' + st.length + '</div><div class="st-steps" id="stBar"></div>' : '') +
      '<div class="st-step" data-step="' + k + '">' + body + nav + '</div>';
    left += '<div class="field-note">' + (p ? '<a href="#" onclick="closeModal(\'stCallModal\');openPipelineEdit(\'' + q(p.id) + '\');return false">Just a quick note instead (Log a call)</a>'
      : '<a href="#" onclick="closeModal(\'stCallModal\');openModal(\'addSomeoneModal\');return false">Use the full Add someone form instead</a>') + '</div>';
    host.innerHTML = '<div class="st-callgrid"><div style="display:grid;gap:10px;align-content:start">' + left + '</div><div class="st-side" id="stCallSide"></div></div>';
    drawBar(); drawSide();
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
    call = fromLead(p); call.area = AREA();
    // what was already typed on this call wins over the old lead
    ['who', 'medicaid', 'cds', 'attendant', 'ready', 'note', 'helpNote', 'agency', 'attName', 'attPhone', 'dob', 'dcn', 'county', 'appStage', 'dobSkip', 'dcnUnknown', 'condition', 'handsOn', 'selfDirect', 'guardian', 'living', 'other', 'attRel', 'attEmail', 'attCds', 'consPhone', 'consEmail', 'countyOther'].forEach(k => { if (keep && keep[k]) call[k] = keep[k]; });
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
    else if (digits(call.consPhone) || call.consEmail.trim()) { if (digits(call.consPhone)) p.phone = call.consPhone.trim(); if (call.consEmail.trim()) p.email = call.consEmail.trim(); }
    if (call.who !== 'self' && call.who !== 'solo' && call.caller.name.trim()) {
      const rp = CDSRules.relatedPeople(p), same = rp.find(r => (ph && digits(r.phone) === ph) || String(r.name || '').toLowerCase() === call.caller.name.trim().toLowerCase());
      if (same) { if (ph) same.phone = call.phone.trim(); if (call.email) same.email = call.email.trim(); if (call.caller.relation) same.relation = call.caller.relation; }
      else { CDSRules.addContact(p, { name: call.caller.name.trim(), phone: call.phone.trim(), role: call.who === 'pair' ? 'attendant' : 'family', relation: call.caller.relation }, { by }); const n = CDSRules.relatedPeople(p); if (call.email) n[n.length - 1].email = call.email.trim(); }
    }
    const medMap = { yes: 'active', no: 'inactive', applied: 'pending' };
    if (medMap[call.medicaid]) p.medicaidStatus = medMap[call.medicaid];
    if (call.cds === 'move') { p.type = 'pccp'; if (call.agency) p.leavingAgency = call.agency.trim(); }
    else if (call.cds === 'new' && call.ready === 'yes' && p.type === 'lead') p.type = 'referral';
    if ((call.help || []).length) p.helpNeeded = call.help.slice();
    const attMore = a => { if (call.attEmail.trim()) a.email = call.attEmail.trim(); if (call.attRel) a.relation = call.attRel; if (call.attCds) a.getsCds = call.attCds; return a; };
    if (call.who === 'pair' && call.caller.name.trim()) { p.attendant = attMore(Object.assign({}, p.attendant, { name: call.caller.name.trim(), phone: call.phone.trim() || null })); p.caregiverPlan = 'has'; }
    else if (call.attendant === 'has') { if (call.attName) p.attendant = attMore(Object.assign({}, p.attendant, { name: call.attName.trim(), phone: call.attPhone.trim() || null })); p.caregiverPlan = 'has'; }
    else if (call.attendant === 'find') p.caregiverPlan = 'find';
    if (call.county && call.county !== 'Other') p.county = call.county;
    else if (call.county === 'Other' && call.countyOther.trim()) p.county = call.countyOther.trim().replace(/\s+county$/i, '');
    if (call.dob) { p.dob = call.dob; if (p.referral) p.referral.dob = call.dob; }
    if (call.dcn.trim()) { p.dcn = call.dcn.trim(); if (p.referral) p.referral.dcn = p.dcn; }
    if (call.medicaid === 'no' || call.medicaid === 'applied') {
      const stage = call.medicaid === 'applied' ? 'applied' : (call.appStage || 'help');
      p.medicaid = p.medicaid || {};
      if (!p.medicaid.application || p.medicaid.application.stage !== stage) p.medicaid.application = { stage, at: now, by };
    }
    // The eligibility answers (new to CDS), with what needs a second look. Kept on the lead, never sent anywhere.
    if (call.who !== 'solo' && ((call.cds !== 'move' && ['condition', 'handsOn', 'selfDirect', 'guardian', 'living', 'other'].some(k => call[k])) || S.callFlags(call).length)) {
      const sc = { at: now, by }; ['condition', 'handsOn', 'selfDirect', 'guardian', 'living', 'other'].forEach(k => { if (call[k]) sc[k] = typeof call[k] === 'string' ? call[k].trim() : call[k]; });
      sc.flags = S.callFlags(call).map(x => x.t);
      p.screening = sc;
    }
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
      (plan.flags.length ? '<div style="margin-top:8px;font-size:13px"><b>To look at:</b> ' + esc(plan.flags.map(x => x.t).join(' ')) + '</div>' : '') +
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
      p.medicaid.application = p.medicaid.application || { stage: call.medicaid === 'applied' ? 'applied' : (call.appStage || 'help'), at: new Date().toISOString(), by: meName() };
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
      finish.sent = { sent: 'Sent. Delivery not confirmed yet.', held: 'Saved, waiting: the Starting texts to families switch is off.', practice: 'Practice only, not sent.', failed: 'FAILED: ' + (m.error || '') + ' It is on Today under Needs attention.' }[m.status] || m.status;
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

  window.StartCall = { open, close, pick, set, changed, go, next, back, draw, find, useLead, notDup, save, ch, body, saveFollow, send, startProfile, toPool, done, state: () => call, finishState: () => finish };
})();
