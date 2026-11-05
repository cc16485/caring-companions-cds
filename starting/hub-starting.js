// CDS Hub · Starting profile (2026-11-04, her approved mockup version 5, built behind the hub
// switch 'starting', off). A lead who says yes becomes a consumer with status 'starting' and opens
// to one screen: seven enrollment steps, one Next step, what can happen at the same time, a
// Medicaid tab (eMOMED check, the required PDF, the ME code answer, the ME code review, history),
// the No Medicaid yet flow (instructions by text or email, sent only when a person presses Send,
// a follow-up owned by the coordinator), the Ready for first shift checklist, and Did not start.
// They move to Active by themselves the day WellSky shows their first shift.
//
// Reuses the hub: getData/setData, the consumer profile helpers, _saveConsumerDoc (ein-proof),
// the enrollment packet facts (_profPacket), authorizations (getAuths), firstShiftOf (WellSky),
// relatedPeople, and the cds-match server for sending (medicaidSend / medicaidSends).
// Rules live in supabase/functions/_shared/office/starting-rules.js (window.CDSStarting).
// No em dashes in anything a person reads.
(function () {
  'use strict';
  const S = window.CDSStarting;
  const on = () => typeof hubSwitchOn === 'function' && hubSwitchOn('starting');
  const me = () => String(_acWho() || '').trim().toLowerCase();
  const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const meName = () => cap(me().split('@')[0]) || 'Office';
  // Her rule 2026-11-05: any care coordinator resolves an ME code review (note + supporting document + server audit
  // record still required); 11-04 it was Samantha and Zach only. The ME code rules and messages in Admin stay
  // Samantha's (isOwner).
  const isSup = () => !!me();
  const isOwner = () => LD_WHO_OWNERS.includes(me());
  // Every Starting decision goes into the server's audit record (cds_audit). Review resolutions wait for it.
  function auditLog(kind, x, action, detail) {
    return cdsMatchApi('startingAudit', { person: { kind, id: String(x.id), name: x.name || '' }, action, detail: detail || {} });
  }
  const auditQuiet = (kind, x, action, detail) => { try { auditLog(kind, x, action, detail).catch(e => console.warn('Starting audit:', e && e.message)); } catch (e) {} };
  const nowIso = () => new Date().toISOString();
  const today = () => _todayIso();
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const day = iso => iso ? _niceDay(String(iso).slice(0, 10)) : '';
  const line = (k, v) => '<div class="cp-line"><span>' + k + '</span><span>' + v + '</span></div>';
  const btn = (label, js, quiet, extra) => '<button type="button" class="btn btn-sm ' + (quiet ? 'btn-outline' : 'btn-primary') + '" onclick="' + js + '"' + (extra || '') + '>' + label + '</button>';
  const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");


  // The few styles the Starting screens add; everything else uses the hub's own classes.
  document.head.insertAdjacentHTML('beforeend', '<style id="startingCss">' +
    '.st-bar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:14px}' +
    '.st-step{border-radius:10px;padding:8px 9px;background:var(--gray-200);font-size:12px;min-width:0}.st-step b{display:block;font-size:12px;line-height:1.3}.st-step small{color:var(--gray-600);font-size:11px}' +
    '.st-step.done{background:var(--success-pale)}.st-step.now{background:#fbf1dc;outline:2px solid #9C6410}.st-step.side{background:#e6eef7}' +
    '.st-also{margin-top:10px;padding:12px 14px;border-radius:12px;background:#e6eef7;font-size:13px}.st-also ul{margin:6px 0 0;padding-left:18px}' +
    '.st-medgrid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;margin-top:12px;align-items:start}' +
    '.st-box{border:1px solid var(--gray-300);border-radius:12px;padding:12px 14px;display:grid;gap:6px;font-size:13.5px}' +
    '.st-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.st-form label{display:grid;gap:4px;font-size:12.5px;color:var(--gray-600)}.st-form input,.st-form select,.st-form textarea{font:inherit;font-size:13px;color:var(--gray-800)}' +
    '.st-lookup{display:flex;flex-wrap:wrap;gap:8px}.st-lookup span{background:var(--gray-200);border-radius:8px;padding:4px 10px;font-weight:600}.st-lookup small{display:block;font-weight:400;color:var(--gray-600);font-size:11px}' +
    '.st-verdict{border:2px solid;border-radius:14px;padding:14px 16px}.st-sup{border:2px solid var(--primary);border-radius:12px;padding:12px 14px;font-size:13.5px}' +
    '.st-hist{display:flex;gap:12px;padding:6px 0;border-top:1px solid var(--gray-200);font-size:12.5px;flex-wrap:wrap}.st-hist span:first-child{color:var(--gray-600);min-width:90px}' +
    '.st-choice{display:inline-flex;gap:6px;align-items:center;border:1.5px solid var(--gray-300);border-radius:10px;padding:6px 10px;font-size:13px;cursor:pointer}' +
    '.st-cmp{border:1px solid var(--gray-300);border-radius:12px;padding:12px;display:grid;gap:8px;margin-top:8px;background:var(--gray-100)}' +
    '.st-seg{display:inline-flex;border:1.5px solid var(--primary);border-radius:999px;overflow:hidden}.st-seg button{font:600 12.5px Poppins,sans-serif;border:0;background:transparent;color:var(--primary);padding:6px 14px;cursor:pointer}.st-seg button[aria-pressed="true"]{background:var(--primary);color:#fff}' +
    '.st-abd{display:flex;gap:8px;align-items:flex-start;background:#fbf1dc;border-radius:10px;padding:8px 10px;font-size:13px}' +
    '.st-dup{background:#fbf1dc;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600}' +
    '.st-mini{display:flex;gap:3px;max-width:260px}.st-mini i{flex:1;height:7px;border-radius:4px;background:var(--gray-300)}.st-mini i.done{background:var(--accent)}.st-mini i.now{background:#9C6410}.st-mini i.side{background:#9cb8d6}' +
    '@media (max-width:820px){.st-bar{grid-template-columns:repeat(2,minmax(0,1fr))}.st-medgrid,.st-form{grid-template-columns:minmax(0,1fr)}}' +
    '</style>');
  function rules() { const r = getObj('meRules'); return r && Array.isArray(r.codes) && r.codes.length ? r : S.DEFAULT_RULES; }
  function messages() {
    const m = getObj('medicaidMessages');
    return { templates: Object.assign({}, S.DEFAULT_TEMPLATES, m.templates || {}),
             resources: Array.isArray(m.resources) && m.resources.length ? m.resources : S.DEFAULT_RESOURCES, log: m.log || [] };
  }
  function staffNames() {
    const list = (getData('officeStaff') || []).filter(x => x && !x.leftAt && x.name).map(x => String(x.name).trim().split(/\s+/)[0]);
    return [...new Set(list.concat(['Samantha', meName()]).filter(Boolean))].sort();
  }
  const ownerSelect = (id, val, js) => '<select id="' + id + '" onchange="' + js + '" style="font-size:13px">' +
    staffNames().concat(val && !staffNames().includes(val) ? [val] : []).map(n => '<option' + (n === val ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';

  function edit(kind, id, fn) {
    const key = kind === 'lead' ? 'pipeline' : 'consumers';
    const list = getData(key), x = list.find(r => String(r.id) === String(id));
    if (!x) return null;
    fn(x);
    setData(key, list);
    return x;
  }
  const logTo = (x, text) => { x.medicaid = x.medicaid || {}; (x.medicaid.log = x.medicaid.log || []).push({ at: nowIso(), by: meName(), text }); };
  const ageOf = dob => { const d = Date.parse(String(dob || '').slice(0, 10)); if (isNaN(d)) return null; return Math.floor((Date.now() - d) / (365.25 * 864e5)); };

  // ---------------------------------------------------------------- the lead
  function mountLead(p) {
    const el = document.getElementById('lpStarting');
    if (!el) return;
    if (!on()) { el.innerHTML = ''; return; }
    if (p.startingId) {
      el.innerHTML = '<div class="card" style="padding:18px 20px;margin-bottom:14px"><b style="color:var(--primary)">Starting</b>' +
        '<div class="field-note" style="margin:4px 0 10px">' + esc(p.name || '') + ' said yes ' + esc(day(p.movedToConsumers)) + ' and is on Consumers as Starting. The work happens on their profile now.</div>' +
        btn('Open their profile', "openProfile('" + q(p.startingId) + "')") + '</div>';
      return;
    }
    if (CDSRules.CLOSED.includes(p.status)) { el.innerHTML = ''; return; }
    const coord = p.coordinator || '';
    el.innerHTML = '<div class="card" style="padding:18px 20px;margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><b style="color:var(--primary)">Starting CDS</b>' +
        '<label class="field-note">Coordinator ' + ownerSelect('stCoord', coord || meName(), "StartHub.setCoordinator('lead','" + q(p.id) + "',this.value)") + '</label></div>' +
      '<div class="field-note" style="margin:4px 0 10px">When they want us to send the referral or the transfer, press They said yes. This same lead becomes their Starting profile on Consumers, with everything typed here.</div>' +
      '<div id="stYes">' + btn('They said yes', 'StartHub.yesAsk()') + '</div>' +
      '<div id="stYesAsk" hidden style="margin-top:10px;padding:12px 14px;background:var(--success-pale);border-radius:10px">' +
        '<b>Start ' + esc(p.name || 'their') + "'s profile?</b>" +
        '<div style="margin:6px 0;font-size:13px">They are <label><input type="radio" name="stKind" value="new"' + (p.type === 'pccp' ? '' : ' checked') + '> new to CDS (referral)</label> ' +
          '<label><input type="radio" name="stKind" value="move"' + (p.type === 'pccp' ? ' checked' : '') + '> moving from another agency (PCCP)</label></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btn('Yes, start the profile', "StartHub.startFromLead('" + q(p.id) + "')") + btn('Not yet', 'StartHub.yesCancel()', true) + '</div></div>' +
      noMedicaidHtml('lead', p) + '</div>';
    noMedicaidAfter('lead', p);
  }
  function yesAsk() { const a = document.getElementById('stYesAsk'); if (a) a.hidden = false; }
  function yesCancel() { const a = document.getElementById('stYesAsk'); if (a) a.hidden = true; }

  function setCoordinator(kind, id, name) {
    edit(kind, id, x => { const was = x.coordinator || ''; x.coordinator = name; logTo(x, 'Coordinator ' + (was ? 'changed from ' + was + ' to ' : 'set to ') + name + '.'); });
  }

  // They said yes: the same record becomes a Starting consumer (her design: no retyping, no lost history).
  function startFromLead(pid, kindArg) {
    const kind = kindArg || (document.querySelector('input[name="stKind"]:checked') || {}).value || 'new';
    const pipeline = getData('pipeline'), p = pipeline.find(x => x.id === pid);
    if (!p || p.startingId) return;
    const consumers = getData('consumers');
    if (consumers.some(c => prNorm(c.name || '') === prNorm(p.name || '') && CDSRules.isActive(c))) {
      alertBox('stYesAsk', 'Someone named ' + p.name + ' is already an active consumer. Open them from Consumers instead.'); return;
    }
    const R = p.referral || {}, id = Date.now().toString();
    const c = {
      id, name: p.name, phone: p.phone || '', email: p.email || '', dcn: p.dcn || R.dcn || '', county: p.county || '', hours: p.hours || '',
      plandate: '', status: 'starting', trained: 'no', notes: '', contacts: {}, homeVisitDate: '', backupPlan: false,
      facts: { street: p.street || R.street || '', apt: p.apt || R.apt || '', city: p.city || R.city || '', zip: p.zip || R.zip || '', dob: p.dob || R.dob || '' },
      starting: { kind, at: nowIso(), by: meName(), leadId: p.id, attendantName: (p.attendant && p.attendant.name) || '' },
      coordinator: p.coordinator || meName(),
      medicaid: p.medicaid ? JSON.parse(JSON.stringify(p.medicaid)) : {},
      relatedPeople: CDSRules.relatedPeople(p)
    };
    logTo(c, 'Started from their lead (' + (kind === 'move' ? 'moving from another agency' : 'new to CDS') + ').');
    auditQuiet('consumer', c, 'starting_started', { lead: p.id, kind });
    consumers.push(c);
    // Contacts move over, like Move to Consumers does; leads linked to this lead now point at the consumer.
    p.relatedPeople = [];
    pipeline.forEach(x => { if (x.linkedTo && x.linkedTo.kind === 'lead' && x.linkedTo.id === p.id) x.linkedTo = Object.assign({}, x.linkedTo, { kind: 'consumer', id }); });
    p.startingId = id; p.movedToConsumers = today();
    if (p.medicaid && p.medicaid.followup) p.medicaid.followup.done = true;   // the follow-up moves to the profile
    setData('consumers', consumers);
    setData('pipeline', pipeline);
    openProfile(id);
  }
  function alertBox(hostId, msg) { const h = document.getElementById(hostId); if (h) h.insertAdjacentHTML('beforeend', '<div style="color:var(--danger);font-size:13px;margin-top:8px">' + esc(msg) + '</div>'); }

  // ---------------------------------------------------------------- No Medicaid yet (lead or Starting profile)
  const STAGE_LABEL = { applied: 'Already applied', help: 'Needs help applying', plans: 'Plans to apply on their own' };
  function noMedicaidHtml(kind, x) {
    const m = x.medicaid || {}, a = m.application || {}, f = m.followup || {};
    const stage = a.stage || 'help';
    return '<div class="st-nomed" style="margin-top:14px;border-top:1px solid var(--gray-200);padding-top:12px">' +
      '<b style="color:var(--primary)">No Medicaid yet?</b>' +
      '<div class="field-note" style="margin:2px 0 8px">Application progress is kept apart from verified Medicaid. Nothing closes while it is pending.</div>' +
      '<div style="font-size:13px;font-weight:600">Where are they with applying?</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px">' + Object.keys(STAGE_LABEL).map(k =>
        '<label class="st-choice"><input type="radio" name="stStage_' + kind + '" value="' + k + '"' + (k === stage && a.stage ? ' checked' : '') + ' onchange="StartHub.setStage(\'' + kind + "','" + q(x.id) + "',this.value)\"> " + STAGE_LABEL[k] + '</label>').join('') + '</div>' +
      '<div>' + btn('Send Medicaid application instructions', "StartHub.compose('" + kind + "','" + q(x.id) + "')") + '</div>' +
      '<div id="stCmp_' + kind + '"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:13px">Follow-up: check the application' +
        ' <input type="date" id="stFuDate_' + kind + '" value="' + esc(f.date || addDays(today(), S.FOLLOWUP_DAYS[stage])) + '" style="font-size:13px">' +
        ' with ' + ownerSelect('stFuOwner_' + kind, f.owner || x.coordinator || meName(), '') +
        ' ' + btn(f.date ? 'Save changes' : 'Set the follow-up', "StartHub.saveFollowup('" + kind + "','" + q(x.id) + "')", true) + '</div>' +
      '<div class="field-note" id="stFuNote_' + kind + '">' + (f.date && !f.done ? 'On ' + esc(f.owner || '') + "'s Today on " + esc(day(f.date)) + '.' : 'My picks: 3 days if they need help, 1 week if they plan to apply, 2 weeks if they already applied. Change it if you need to.') + '</div>' +
      '<div style="margin-top:10px">' + btn('Family says Medicaid is approved', "StartHub.familyApproved('" + kind + "','" + q(x.id) + "')", true) + '</div>' +
      '<div id="stSends_' + kind + '" style="margin-top:10px"></div></div>';
  }
  function noMedicaidAfter(kind, x) { loadSends(kind, x); }

  function setStage(kind, id, stage) {
    const x = edit(kind, id, r => { r.medicaid = r.medicaid || {}; r.medicaid.application = { stage, at: nowIso(), by: meName() }; logTo(r, 'Medicaid application: ' + STAGE_LABEL[stage].toLowerCase() + '.'); });
    const d = document.getElementById('stFuDate_' + kind);
    if (x && d && !(x.medicaid.followup && x.medicaid.followup.date)) d.value = addDays(today(), S.FOLLOWUP_DAYS[stage]);
  }
  function saveFollowup(kind, id) {
    const date = (document.getElementById('stFuDate_' + kind) || {}).value, owner = (document.getElementById('stFuOwner_' + kind) || {}).value;
    if (!date) return;
    const x = edit(kind, id, r => {
      r.medicaid = r.medicaid || {};
      const was = r.medicaid.followup || {};
      r.medicaid.followup = { date, owner, done: false, by: meName(), at: nowIso() };
      if (!r.medicaid.application) r.medicaid.application = { stage: (document.querySelector('input[name="stStage_' + kind + '"]:checked') || {}).value || 'help', at: nowIso(), by: meName() };
      logTo(r, was.date ? 'Follow-up changed to ' + day(date) + ' with ' + owner + '.' : 'Follow-up set for ' + day(date) + ' with ' + owner + '.');
      if (kind === 'lead' && (!r.followup || r.followup > date)) r.followup = date;   // the lead's own call back date, so Leads sorts it
    });
    const n = document.getElementById('stFuNote_' + kind);
    if (x && n) n.textContent = 'Saved. "Check the Medicaid application" is on ' + owner + "'s Today on " + day(date) + '.';
    if (kind === 'consumer') rerender();
  }
  // Her safeguard 1: never marks Medicaid active. Only a saved eMOMED check with the PDF does.
  function familyApproved(kind, id) {
    edit(kind, id, r => { r.medicaid = r.medicaid || {}; r.medicaid.familyReport = { at: nowIso(), by: meName() };
      if (r.medicaid.followup) r.medicaid.followup.done = true;
      logTo(r, 'Family reports Medicaid approved. Verification needed.'); });
    auditQuiet(kind, (kind === 'lead' ? getData('pipeline') : getData('consumers')).find(x => String(x.id) === String(id)) || { id }, 'family_reports_approved', {});
    if (kind === 'consumer') { _profTab = 'medicaid'; rerender(); }
    else { const n = document.getElementById('stFuNote_lead'); if (n) n.textContent = 'Saved: the family reports Medicaid approved. Verify it in eMOMED once they say yes and their profile opens.'; }
  }

  // ---------------------------------------------------------------- the message composer
  const cmp = {};
  function recipients(x) {
    const out = [];
    CDSRules.relatedPeople(x).forEach(r => out.push({ name: r.name, rel: r.relation || '', phone: r.phone || '', email: r.email || '' }));
    out.push({ name: x.name, rel: 'themself', phone: x.phone || '', email: x.email || '' });
    return out.filter(r => r.phone || r.email || r.rel !== 'themself');
  }
  function compose(kind, id, host) {
    const x = (kind === 'lead' ? getData('pipeline') : getData('consumers')).find(r => String(r.id) === String(id));
    if (!x) return;
    const age = ageOf((x.facts && x.facts.dob) || x.dob || (x.referral || {}).dob);
    const rec = recipients(x);
    cmp[kind] = { host: host || 'stCmp_' + kind, sends: host ? host.replace('stCmp_', 'stSends_') : 'stSends_' + kind, id, ch: 'sms', abd: age !== null ? age >= 65 : false, age, rec, to: 0, body: {}, dirty: {}, name: x.name, coord: meName() };   // signed by whoever sends it
    build(kind, 'sms'); build(kind, 'email');
    drawCmp(kind);
  }
  function build(kind, ch) {
    const c = cmp[kind], r = c.rec[c.to] || {}, M = messages();
    const vars = { caller: String(r.name || '').split(' ')[0], consumer: String(c.name || '').split(' ')[0], coordinator: c.coord, abd: c.abd };
    c.body[ch] = S.fillTemplate(ch === 'sms' ? M.templates.text : M.templates.email, vars, M.resources);
    c.subject = S.fillTemplate(M.templates.emailSubject, vars, M.resources);
    c.dirty[ch] = false;
  }
  function drawCmp(kind, msg, dup) {
    const c = cmp[kind], host = c && document.getElementById(c.host);
    if (!c || !host) return;
    const r = c.rec[c.to] || {}, dest = c.ch === 'sms' ? r.phone : r.email, t = c.body[c.ch] || '';
    host.innerHTML = '<div class="st-cmp">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<div class="st-seg" role="group" aria-label="Send as"><button type="button" aria-pressed="' + (c.ch === 'sms') + '" onclick="StartHub.cmpCh(\'' + kind + '\',\'sms\')">Text</button><button type="button" aria-pressed="' + (c.ch === 'email') + '" onclick="StartHub.cmpCh(\'' + kind + '\',\'email\')">Email</button></div>' +
        '<label class="field-note">To <select onchange="StartHub.cmpTo(\'' + kind + '\',this.value)" style="font-size:13px">' + c.rec.map((p, i) =>
          '<option value="' + i + '"' + (i === c.to ? ' selected' : '') + '>' + esc(p.name + (p.rel ? ' (' + p.rel + ')' : '')) + '</option>').join('') + '</select></label></div>' +
      '<div class="field-note">' + (dest ? esc(c.ch === 'sms' ? 'Text to ' + dest : 'Email to ' + dest) : '<span style="color:var(--danger)">No ' + (c.ch === 'sms' ? 'cell phone' : 'email') + ' on file for this person. Add it with Edit details or Contacts.</span>') + '</div>' +
      (c.ch === 'email' ? '<div style="font-size:13px"><b>Subject:</b> ' + esc(c.subject) + '</div>' : '') +
      '<label class="st-abd"><input type="checkbox"' + (c.abd ? ' checked' : '') + ' onchange="StartHub.cmpAbd(\'' + kind + '\',this.checked)"> <span><b>Include the Aged, Blind and Disabled form (IM-1ABD).</b> ' +
        (c.age !== null && c.age >= 65 ? 'Ticked because ' + esc(String(c.name).split(' ')[0]) + ' is ' + c.age + '. ' : '') + 'Tick it for anyone 65 or older, blind, or with a disability.</span></label>' +
      '<label class="field-note" style="display:grid;gap:4px">Message (edit anything before you send)<textarea rows="' + (c.ch === 'sms' ? 7 : 14) + '" oninput="StartHub.cmpEdit(\'' + kind + '\',this.value)" style="font-size:13px;width:100%">' + esc(t) + '</textarea></label>' +
      (c.ch === 'sms' ? '<div class="field-note">' + t.length + ' characters, about ' + Math.ceil(t.length / 153) + ' text messages. The email has the full guide.</div>' : '') +
      (msg ? '<div style="font-size:13px;color:' + (/^Sent|^Saved/.test(msg) ? 'var(--success)' : 'var(--danger)') + '">' + esc(msg) + '</div>' : '') +
      (dup ? '<div class="st-dup">' + esc(dup) + '<div style="margin-top:6px;display:flex;gap:8px">' + btn('Send it again anyway', "StartHub.cmpSend('" + kind + "',true)") + btn('Do not send', "StartHub.cmpClose('" + kind + "')", true) + '</div></div>'
           : '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btn(c.ch === 'sms' ? 'Send text' : 'Send email', "StartHub.cmpSend('" + kind + "',false)", false, dest ? '' : ' disabled') +
             btn('Start over', "StartHub.cmpReset('" + kind + "')", true) + btn('Cancel', "StartHub.cmpClose('" + kind + "')", true) + '</div>') +
      '<div class="field-note">Nothing goes out until you press Send. It never includes Medicaid numbers or eligibility details.</div></div>';
  }
  function cmpCh(kind, ch) { cmp[kind].ch = ch; drawCmp(kind); }
  function cmpTo(kind, i) { const c = cmp[kind]; c.to = +i; ['sms', 'email'].forEach(ch => { if (!c.dirty[ch]) build(kind, ch); }); drawCmp(kind); }
  function cmpAbd(kind, v) {
    const c = cmp[kind]; c.abd = v;
    ['sms', 'email'].forEach(ch => { if (!c.dirty[ch]) build(kind, ch); });
    drawCmp(kind, c.dirty[c.ch] ? 'Your edits are kept, so the form line did not change. Press Start over to rebuild the message.' : '');
  }
  function cmpEdit(kind, v) { const c = cmp[kind]; c.body[c.ch] = v; c.dirty[c.ch] = true; }
  function cmpReset(kind) { build(kind, cmp[kind].ch); drawCmp(kind); }
  function cmpClose(kind) { const c = cmp[kind], h = document.getElementById(c ? c.host : 'stCmp_' + kind); if (h) h.innerHTML = ''; delete cmp[kind]; }
  async function cmpSend(kind, force) {
    const c = cmp[kind]; if (!c) return;
    const x = (kind === 'lead' ? getData('pipeline') : getData('consumers')).find(r => String(r.id) === String(c.id));
    const r = c.rec[c.to] || {}, dest = c.ch === 'sms' ? r.phone : r.email;
    const problems = S.identifierProblems((c.ch === 'email' ? c.subject + '\n' : '') + c.body[c.ch], { dcn: x && x.dcn });
    if (problems.length) { drawCmp(kind, 'Take out ' + problems.join(' and ') + '. Texts and emails never carry Medicaid numbers or eligibility details.'); return; }
    try {
      const res = await cdsMatchApi('medicaidSend', { person: { kind, id: String(c.id), name: c.name }, channel: c.ch, to: dest,
        subject: c.ch === 'email' ? c.subject : '', body: c.body[c.ch], force: !!force, ids: { dcn: x && x.dcn } });
      if (res.duplicate) {
        const d = res.duplicate[0];
        drawCmp(kind, '', 'Instructions already went to this family ' + day(d.at) + ' by ' + (d.channel === 'sms' ? 'text' : 'email') + '. Send them again?');
        return;
      }
      const m = res.message, label = { sent: 'Sent', held: 'Saved, waiting: the Medicaid application texts switch is off', practice: 'Practice only, not sent', failed: 'FAILED: ' + (m.error || '') }[m.status] || m.status;
      edit(kind, c.id, rr => logTo(rr, (c.ch === 'sms' ? 'Text' : 'Email') + ' to ' + (r.name || '') + ': Medicaid application instructions' + (c.abd ? ' with IM-1ABD' : '') + '. ' + label.split(':')[0] + '.'));
      const sendsId = c.sends;
      if (m.status === 'failed') { drawCmp(kind, label + ' It is on Today under Needs attention.'); }
      else { cmpClose(kind); }
      await loadSends(kind, x, sendsId);
      if (m.status !== 'failed') { const s = document.getElementById(sendsId); if (s) s.insertAdjacentHTML('afterbegin', '<div style="font-size:13px;color:var(--success);margin-bottom:6px">' + esc(label) + '.</div>'); }
    } catch (e) { drawCmp(kind, 'Not sent: ' + (e.message || e)); }
  }
  // Her decision 2026-11-04: Sent, Delivered, Failed or Unknown; Delivered only when GoHighLevel confirms it.
  function deliveryLabel(m) {
    const d = String(m.delivery || '').toLowerCase();
    if (m.status === 'failed' || ['failed', 'undelivered', 'bounced', 'rejected'].includes(d)) return 'Failed';
    if (['delivered', 'read', 'opened'].includes(d)) return 'Delivered';
    if (m.status === 'held') return 'Waiting (switch off)';
    if (m.status === 'practice') return 'Practice, not sent';
    if (m.status === 'sent') return 'Sent, delivery unknown';
    return 'Unknown';
  }
  async function loadSends(kind, x, hostId) {
    const host = document.getElementById(hostId || 'stSends_' + kind);
    if (!host || !x) return;
    try {
      const r = await cdsMatchApi('medicaidSends', { person: { kind, id: String(x.id), name: x.name } });
      host.innerHTML = (r.messages || []).length ? '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Instructions sent</div>' + r.messages.map(m => {
        const st = deliveryLabel(m);
        return '<div style="font-size:12.5px;padding:2px 0">' + esc(day(m.at)) + ' · ' + (m.channel === 'sms' ? 'Text' : 'Email') + ' to ' + esc(m.to || '') + ' · <b style="color:' + (st === 'Failed' ? 'var(--danger)' : 'inherit') + '">' + esc(st) + '</b>' +
          (m.by ? ' · by ' + esc(cap(String(m.by).split('@')[0])) : '') + (m.error ? '<div class="field-note">' + esc(m.error) + '</div>' : '') + '</div>';
      }).join('') : '';
    } catch (e) { host.innerHTML = '<div class="field-note" style="color:var(--danger)">Could not read the sent messages: ' + esc(e.message || e) + '</div>'; }
  }

  // ---------------------------------------------------------------- the Starting profile
  function ctxFor(c) {
    const auth = Object.values(getAuths().records).find(a => prNorm(a.consumer || '') === prNorm(c.name));
    const P = (_profPacket[c.id] || {}).packet || null;
    const att = (getData('attendants') || []).filter(a => a.status !== 'inactive' && String(a.consumer || '').split(',').map(prNorm).includes(prNorm(c.name)))[0] || null;
    const fs = typeof firstShiftOf === 'function' ? firstShiftOf(c) : '';
    return { today: today(), firstShift: fs || '', auth: !!auth, authRec: auth || null, rulesVersion: rules().version,
             packet: { signed: !!(P && P.signed_at), done: !!(P && P.status === 'Done'), status: P ? P.status : '' },
             attendant: att ? { name: att.name, linked: true, ready: true } : (c.starting && c.starting.attendantName ? { name: c.starting.attendantName, linked: true, ready: false } : { linked: false, ready: false }) };
  }

  // Called from renderProfile: draws the whole profile for a Starting consumer. Returns true when it did.
  function renderProfile(c, host) {
    // Drawn for any Starting person, even if the switch was turned off later (so they never look Inactive).
    if (!S.isStarting(c)) return false;
    if (promote(c)) return false;   // WellSky shows the first shift: they are Active now; the usual profile draws
    if (typeof profPacketFetch === 'function') profPacketFetch(c);
    const ctx = ctxFor(c), st = S.startingSteps(c, ctx), med = st.medicaid;
    if (!['overview', 'medicaid', 'state', 'ready', 'tax', 'calls', 'docs', 'notes'].includes(_profTab)) _profTab = 'overview';
    const tab = _profTab;
    const tabs = [['overview', 'Overview'], ['medicaid', 'Medicaid'], ['state', 'State and authorization'], ['ready', 'Ready for first shift'], ['tax', 'Tax and EIN'], ['calls', 'Calls and texts'], ['docs', 'Documents'], ['notes', 'Notes']]
      .map(([k, l]) => '<button type="button" class="' + (tab === k ? 'on' : '') + '" onclick="_profTab=\'' + k + '\';renderProfile()">' + l + '</button>').join('');
    const bar = '<div class="st-bar" aria-label="Enrollment steps">' + st.steps.map(s => '<div class="st-step ' + s.state + '"><b>' + (s.state === 'done' ? '✓ ' : '') + esc(s.t) + '</b>' +
      '<small>' + (s.state === 'side' ? 'can start now' : s.state === 'now' ? 'next' : '') + '</small></div>').join('') + '</div>';
    const actBtn = { medicaid: btn('Open Medicaid', "_profTab='medicaid';renderProfile()"), state: btn('Open State and authorization', "_profTab='state';renderProfile()"),
                     ready: btn('Open the checklist', "_profTab='ready';renderProfile()"), paperwork: btn('Open their lead for the packet', "StartHub.openLead('" + q(c.id) + "')"),
                     attendant: btn('Open Attendants', "showPage('attendants')"), active: '' }[st.next.act] || '';
    const next = '<div class="cp-next warn"' + (st.next.urgent ? ' style="outline:2px solid var(--danger)"' : '') + '><div style="flex:1 1 300px"><div style="font-weight:600;color:#0D365F">Next step: ' + esc(st.next.t) + '</div>' +
      '<div style="font-size:13px;color:#55677a">' + esc(st.next.d) + '</div></div>' + actBtn + '</div>';
    const also = st.also.length ? '<div class="st-also"><b>You can also do now, while you wait</b><ul>' + st.also.map(a => '<li>' + esc(a.t) + '</li>').join('') + '</ul></div>' : '';
    let body = '';
    if (tab === 'overview') body = overviewHtml(c, ctx, st);
    else if (tab === 'medicaid') body = medicaidHtml(c, ctx, st);
    else if (tab === 'state') body = stateHtml(c, ctx);
    else if (tab === 'ready') body = readyHtml(c, st);
    else if (tab === 'tax') body = '<div class="field-note" style="margin:10px 0">The same Tax Setup as every consumer, open from day one.' + (st.transfer ? ' Moving from another agency: they already have an EIN; type it from Fusion.' : '') + '</div>' + btn('Tax setup', "openTaxSetup('" + q(c.id) + "')", true);
    else if (tab === 'docs') body = consumerDocsHtml(c);
    else if (tab === 'calls') body = '<div class="cds-comm-history" data-refs="consumer:' + esc(c.id) + '" data-phones="' + esc(rpPhones(c)) + '" data-names="' + esc(rpNames(c)) + '"></div>';
    else body = (c.notes ? '<div style="font-size:14px;line-height:1.7;white-space:pre-wrap;margin-top:10px">' + esc(c.notes) + '</div>' : '<p style="font-size:14px;color:#55677a;margin-top:10px">No notes yet.</p>');
    host.innerHTML = '<div class="card" style="padding:26px">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div>' +
        '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><div class="cute-title" style="font-size:30px">' + esc(c.name) + '</div>' +
        '<span class="badge" style="background:var(--success-pale);color:var(--success)">Starting</span><span class="badge" style="background:var(--gray-100)">' + (st.transfer ? 'Moving from another agency' : 'New to CDS') + '</span></div>' +
        '<div style="font-size:13.5px;color:#55677a;margin-top:4px">' + [c.county ? esc(c.county) + ' County' : '', 'Coordinator ' + esc(c.coordinator || 'not set'), 'said yes ' + esc(day(c.starting && c.starting.at))].filter(Boolean).join(' · ') + '</div></div>' +
        '<div style="text-align:right"><div class="field-note">Enrollment progress</div><b style="color:var(--primary);font-size:18px">' + st.count + ' of ' + st.of + '</b></div></div>' +
      bar + next + also + rpCardHtml('consumer', c) +
      '<div class="cp-tabs" role="tablist">' + tabs + '</div>' + body + '</div>';
    if (tab === 'medicaid') { preview(c.id); if (!med.verified) noMedicaidAfter('consumer', c); }
    if (window.cdsCommHistory) window.cdsCommHistory(host);
    return true;
  }
  function openLead(cid) { const c = getData('consumers').find(x => x.id === cid); const lid = c && c.starting && c.starting.leadId; if (lid) openLeadProfile(lid); }

  function overviewHtml(c, ctx, st) {
    const med = st.medicaid, P = (_profPacket[c.id] || {}).packet;
    return '<h4 style="margin:12px 0 4px;color:var(--primary)">Enrollment details</h4>' +
      line('Medicaid', '<span style="color:' + (med.verified ? 'var(--success)' : '#9C6410') + '">' + esc(med.label) + '</span>' + (med.application && !med.verified ? ' <span class="field-note">(application: ' + esc((STAGE_LABEL[med.application.stage] || '').toLowerCase()) + ')</span>' : '')) +
      line('DSDS', ctx.auth ? 'Authorization on file' : st.transfer ? '<span style="color:#9C6410">Transfer: confirm the current authorization</span>' : c.starting && c.starting.referralSent ? 'Referral sent ' + esc(day(c.starting.referralSent)) + ', waiting' : '<span style="color:#9C6410">Referral needed</span>') +
      line('Attendant', ctx.attendant.linked ? esc(ctx.attendant.name || '') + (ctx.attendant.ready ? ', on the roster' : ', onboarding') : '<span style="color:#9C6410">Nobody linked yet</span>') +
      line('Consumer packet', P ? esc(P.status || '') : '<span style="color:#9C6410">Not sent</span>') +
      line('Start date from the state', c.cdsStartDate ? esc(day(c.cdsStartDate)) + (st.startAlert && st.startAlert.soon ? ' <span style="color:var(--danger);font-weight:600">' + (st.startAlert.late ? 'passed, not ready' : st.startAlert.days + ' days left, not ready') + '</span>' : '') : '<span style="color:#9C6410">not on file yet</span>') +
      line('First shift', ctx.firstShift ? esc(day(ctx.firstShift)) : 'Not yet in WellSky') +
      line('Coordinator', ownerSelect('stCoordC', c.coordinator || meName(), "StartHub.setCoordinator('consumer','" + q(c.id) + "',this.value)")) +
      '<h4 style="margin:14px 0 4px;color:var(--primary)">About them</h4>' +
      line('Phone', esc(c.phone || 'none on file')) + factsLines(c, line) +
      line('Monthly call, yearly visit, EIN clock', '<span style="color:#55677a;font-style:italic">quiet until the first shift</span>');
  }

  // ---------------------------------------------------------------- the Medicaid tab
  function medicaidHtml(c, ctx, st) {
    const med = st.medicaid, last = med.last, m = c.medicaid || {};
    const f = (last && !med.verified) ? last : {};
    const R = rules();
    const name = String(c.name || '').split(/\s+/);
    const dob = (c.facts && c.facts.dob) || c.dob || '';
    const banner = med.reported ? '<div class="alert alert-warn" style="font-size:13.5px;margin:10px 0"><div><b>Family reports Medicaid approved. Verification needed.</b> Look them up in eMOMED, upload the eligibility page, type the ME code and Lock Ins, and save. Medicaid shows Verified Active only after that.</div></div>'
      : med.ruleChanged ? '<div class="alert alert-warn" style="font-size:13.5px;margin:10px 0"><div><b>The ME code rules changed since this check.</b> The answer below was not changed. Look again and save a new check if it should change.</div></div>' : '';
    const verdictId = 'stVerdict';
    return banner +
      '<div class="st-medgrid"><div style="display:grid;gap:10px">' +
        '<div class="st-box"><b>1. Look them up in eMOMED</b>' +
          (c.dcn ? '<div style="font-size:13px">DCN on file: ' + esc(c.dcn) + '</div>' : '<div class="field-note">No DCN yet? Search by first name, last name and date of birth:</div>') +
          '<div class="st-lookup"><span><small>First</small>' + esc(name[0] || '') + '</span><span><small>Last</small>' + esc(name.slice(1).join(' ')) + '</span><span><small>Date of birth</small>' + esc(dob ? day(dob) : 'add it in Overview') + '</span></div>' +
          '<div class="field-note">Use what eMOMED shows, not what was said on the phone.</div></div>' +
        '<div class="st-box"><b>2. Upload the eligibility page from eMOMED <span style="color:var(--danger);font-size:11px">REQUIRED</span></b>' +
          '<input type="file" id="stPdf" accept="application/pdf,image/*" style="font-size:12px"><div class="field-note">Saved to their Documents as "eMOMED eligibility page".</div></div>' +
        '<div class="st-box"><b>3. Type what eMOMED shows</b><div class="st-form">' +
          '<label>Medicaid status<select id="stStatus" onchange="StartHub.preview(\'' + q(c.id) + '\')">' + [['active', 'Active'], ['nomed', 'Does not have Medicaid'], ['pending', 'Application pending'], ['inactive', 'Inactive (had Medicaid before)']].map(([v, l]) =>
            '<option value="' + v + '"' + ((f.status || 'active') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
          '<label>DCN (when you have it)<input type="text" id="stDcn" value="' + esc(f.dcn || c.dcn || '') + '"></label>' +
          '<label>ME code (two codes? type both: 13, 55)<input type="text" id="stCodes" value="' + esc((f.codes || []).join(', ')) + '" oninput="StartHub.preview(\'' + q(c.id) + '\')" autocomplete="off"></label>' +
          '<label>Managed care in Lock Ins<select id="stMc" onchange="StartHub.preview(\'' + q(c.id) + '\')">' + [['no', 'Does not show managed care'], ['yes', 'Shows Managed Care'], ['unsure', 'Not sure, could not tell']].map(([v, l]) =>
            '<option value="' + v + '"' + ((f.managedCare || 'no') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
          '<label style="grid-column:1/-1">Other lock-ins<select id="stLock" onchange="StartHub.preview(\'' + q(c.id) + '\')">' + [['none', 'None'], ['sd_met', 'Spenddown, met for today'], ['sd_not', 'Spenddown, not met for today'], ['tw_paid', 'Ticket to Work, premium paid'], ['tw_not', 'Ticket to Work, premium not paid']].map(([v, l]) =>
            '<option value="' + v + '"' + ((f.lockIn || 'none') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div></div>' +
        (med.verified ? '' : '<div id="stNoMedWrap"' + (showNoMed(c, med) ? '' : ' hidden') + '>' + noMedicaidHtml('consumer', c) + '</div>') +
      '</div><div style="display:grid;gap:10px;align-content:start">' +
        '<div id="' + verdictId + '"></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btn('Save: verified by ' + esc(meName()) + ' today', "StartHub.saveCheck('" + q(c.id) + "')") + btn('Flag for a second look', "StartHub.flag('" + q(c.id) + "')", true) + '</div>' +
        '<div id="stSaveMsg" class="field-note"></div>' +
        supervisorHtml(c, med) +
        '<div class="st-box"><b>History</b>' + historyHtml(c) + '</div>' +
        '<div class="field-note">Rules: ' + esc(S.SOURCES.chart.title) + ' (' + esc(S.SOURCES.chart.rev) + '), ' + esc(S.SOURCES.policy.title) + ' (' + esc(S.SOURCES.policy.rev) + '), ' + esc(S.SOURCES.cds.title) + ' (' + esc(S.SOURCES.cds.rev) + '). Version ' + esc(R.version) + '.</div>' +
      '</div></div>';
  }
  // The No Medicaid yet box shows when eMOMED says no or pending, or an application is under way.
  function showNoMed(c, med) { const l = med.last; return !!((c.medicaid || {}).application || (l && ['nomed', 'pending', 'inactive'].includes(l.status))); }
  function currentInput(c) {
    const v = id => (document.getElementById(id) || {}).value || '';
    return { status: v('stStatus') || 'active', codes: S.normCodes(v('stCodes')), managedCare: v('stMc') || 'no', lockIn: v('stLock') || 'none', dcn: v('stDcn').trim(), name: String(c.name || '').split(' ')[0] };
  }
  function preview(cid) {
    const c = getData('consumers').find(x => x.id === cid), el = document.getElementById('stVerdict');
    if (!c || !el) return;
    const inp = currentInput(c), d = S.decide(inp, rules());
    const w = document.getElementById('stNoMedWrap');
    if (w && ['nomed', 'pending', 'inactive'].includes(inp.status)) w.hidden = false;
    const tone = { ok: ['var(--success-pale)', 'var(--success)'], rev: ['#fbf1dc', '#9C6410'], no: ['#fbe9e6', 'var(--danger)'], pend: ['#e6eef7', '#1a5e9b'] }[d.k];
    el.innerHTML = '<div class="st-verdict" style="background:' + tone[0] + ';border-color:' + tone[1] + '"><span class="badge" style="background:var(--white);color:' + tone[1] + '">' + esc(d.label) + '</span>' +
      '<div style="margin-top:8px;font-size:13.5px"><b>Why:</b> ' + esc(d.why) + '</div><div style="margin-top:6px;font-size:13.5px"><b>Next action:</b> ' + esc(d.next) + '</div>' +
      (d.k === 'ok' ? '<div style="margin-top:8px;font-weight:600;color:var(--primary);font-size:13px">Medicaid looks right for CDS. This is not DSDS approval: the state still has to assess them and authorize CDS.</div>' : '') +
      (d.k === 'no' ? '<div style="margin-top:8px;font-weight:600;color:var(--primary);font-size:13px">They stay in Starting. Nothing closes without a review with a note and a document.</div>' : '') +
      '<div style="margin-top:10px;padding:10px 12px;background:var(--white);border-radius:10px;font-size:13px"><b>What we say to families</b><div style="margin-top:4px">' + esc(d.fam) + '</div><div class="field-note" style="margin-top:4px">A starting point. Say it in your own words.</div></div></div>';
  }
  async function saveCheck(cid) {
    const c0 = getData('consumers').find(x => x.id === cid), msg = document.getElementById('stSaveMsg');
    if (!c0) return;
    const input = currentInput(c0), file = (document.getElementById('stPdf') || {}).files ? document.getElementById('stPdf').files[0] : null;
    if (!file) { msg.innerHTML = '<span style="color:var(--danger)">Upload the eMOMED page first. It is required.</span>'; return; }
    if (input.status === 'active' && !input.codes.length) { msg.innerHTML = '<span style="color:var(--danger)">Type the ME code from eMOMED.</span>'; return; }
    msg.textContent = 'Saving the eMOMED page…';
    let doc;
    try { doc = await _saveConsumerDoc(c0, file, { kind: 'emomed', date: today(), note: 'eMOMED eligibility page' }); }
    catch (e) { msg.innerHTML = '<span style="color:var(--danger)">The file did not save: ' + esc(e.message || e) + '. Nothing else was saved.</span>'; return; }
    const d = S.decide(input, rules()), at = nowIso();
    edit('consumer', cid, c => {
      c.docs = (c.docs || []).concat([doc]);
      c.medicaid = c.medicaid || {};
      (c.medicaid.checks = c.medicaid.checks || []).push({ at, by: meName(), status: input.status, codes: input.codes, managedCare: input.managedCare, lockIn: input.lockIn,
        dcn: input.dcn, pdf: doc.path, result: { k: d.k, label: d.label, sup: d.sup }, rulesVersion: rules().version });
      if (input.dcn && !c.dcn) c.dcn = input.dcn;
      if (input.status === 'active' && c.medicaid.followup) c.medicaid.followup.done = d.k === 'ok';
      logTo(c, 'eMOMED check: ' + d.label + (input.codes.length ? ', code ' + input.codes.join(', ') : '') + '. Checked by ' + meName() + '.');
    });
    auditQuiet('consumer', c0, 'emomed_check', { status: input.status, codes: input.codes, managedCare: input.managedCare, lockIn: input.lockIn, result: d.label, pdf: doc.path, rules: rules().version });
    rerender();
  }
  function flag(cid) {
    const note = prompt('What should get a second look?');
    if (note === null) return;
    edit('consumer', cid, c => { c.medicaid = c.medicaid || {}; (c.medicaid.flags = c.medicaid.flags || []).push({ at: nowIso(), by: meName(), note: String(note).slice(0, 300), open: true });
      logTo(c, 'Second look asked' + (note ? ': ' + note : '') + '.'); });
    auditQuiet('consumer', getData('consumers').find(x => x.id === cid), 'review_requested', { note: String(note).slice(0, 300) });
    rerender();
  }
  function supervisorHtml(c, med) {
    if (!med.needsSupervisor) return '';
    const last = med.last, flags = ((c.medicaid || {}).flags || []).filter(f => f.open);
    const why = [last && last.result && last.result.sup && !med.review ? last.result.label + (last.codes && last.codes.length ? ' (code ' + last.codes.join(', ') + ')' : '') : '', ...flags.map(f => 'Review asked by ' + f.by + ': ' + (f.note || ''))].filter(Boolean).join('. ');
    if (!isSup()) return '<div class="st-sup"><b>Waiting on supervisor review</b><div class="field-note" style="margin-top:4px">' + esc(why) + '. Sign in to resolve it.</div></div>';
    return '<div class="st-sup"><b>ME code review</b><div style="font-size:13px;margin:4px 0 8px">' + esc(why) + '.</div>' +
      '<label class="field-note" for="stSupNote">Note (required, goes in the history and the audit record)</label><input type="text" id="stSupNote" style="width:100%;font-size:13px">' +
      '<label class="field-note" for="stSupFile" style="display:block;margin-top:6px">Supporting document (required): the eMOMED page, a letter, or a screenshot of what you checked</label><input type="file" id="stSupFile" accept="application/pdf,image/*" style="font-size:12px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + btn('Approve and continue', "StartHub.supAct('" + q(c.id) + "','approve')") + btn('Keep in Starting, follow up', "StartHub.supAct('" + q(c.id) + "','hold')", true) +
        btn('Did not start', "StartHub.supAct('" + q(c.id) + "','close')", true) + '</div>' +
      '<div id="stCloseAsk" hidden style="margin-top:8px;font-size:13px">Reason <select id="stCloseWhy">' + ['No Medicaid', 'The state said no', 'Needs more care than CDS', 'Not interested', 'Went with another agency', 'Other'].map(r => '<option>' + r + '</option>').join('') + '</select> ' +
        btn('Close the profile', "StartHub.closeStarting('" + q(c.id) + "')") + '</div><div id="stSupMsg" class="field-note"></div></div>';
  }
  // Note + document + audit record first; nothing is resolved unless all three are in (her decision 2026-11-04).
  async function supProof(cid, action, extra) {
    const msg = document.getElementById('stSupMsg');
    const note = ((document.getElementById('stSupNote') || {}).value || '').trim();
    const f = document.getElementById('stSupFile'), file = f && f.files && f.files[0];
    if (!note) { msg.innerHTML = '<span style="color:var(--danger)">Add a note first. It goes in the history.</span>'; return null; }
    if (!file) { msg.innerHTML = '<span style="color:var(--danger)">Attach the supporting document first.</span>'; return null; }
    const c0 = getData('consumers').find(x => x.id === cid);
    msg.textContent = 'Saving the document and the audit record…';
    let doc;
    try { doc = await _saveConsumerDoc(c0, file, { kind: 'review', date: today(), note: 'ME code review: ' + note.slice(0, 80) }); }
    catch (e) { msg.innerHTML = '<span style="color:var(--danger)">The document did not save: ' + esc(e.message || e) + '. Nothing was resolved.</span>'; return null; }
    const med = S.medicaidState(c0);
    try { await auditLog('consumer', c0, 'supervisor_' + action, Object.assign({ note, doc: doc.path, checkAt: med.last ? med.last.at : null, codes: med.last ? med.last.codes : [] }, extra || {})); }
    catch (e) { msg.innerHTML = '<span style="color:var(--danger)">The audit record did not save: ' + esc(e.message || e) + '. Nothing was resolved.</span>'; return null; }
    return { note, doc, med };
  }
  async function supAct(cid, action) {
    if (!isSup()) return;
    if (action === 'close') {
      const n = ((document.getElementById('stSupNote') || {}).value || '').trim();
      if (!n) { document.getElementById('stSupMsg').innerHTML = '<span style="color:var(--danger)">Add a note first. It goes in the history.</span>'; return; }
      document.getElementById('stCloseAsk').hidden = false; return;
    }
    const p = await supProof(cid, action);
    if (!p) return;
    edit('consumer', cid, c => {
      c.docs = (c.docs || []).concat([p.doc]);
      (c.medicaid.reviews = c.medicaid.reviews || []).push({ at: nowIso(), by: meName(), action, note: p.note, doc: p.doc.path, checkAt: p.med.last ? p.med.last.at : null });
      (c.medicaid.flags || []).forEach(f => { if (f.open && action === 'approve') { f.open = false; f.closedBy = meName(); f.closedAt = nowIso(); } });
      logTo(c, (action === 'approve' ? 'Approved and continued' : 'Kept in Starting') + ' by ' + meName() + ': ' + p.note + ' (document attached)');
    });
    rerender();
  }
  const CLOSE_LEAD = { 'No Medicaid': 'closed_no_medicaid', 'The state said no': 'closed_state_no', 'Needs more care than CDS': 'closed_more_care', 'Not interested': 'closed_ni', 'Went with another agency': 'closed_other' };
  async function closeStarting(cid) {
    if (!isSup()) return;
    const why = (document.getElementById('stCloseWhy') || {}).value || 'Other';
    const p = await supProof(cid, 'close', { why });
    if (!p) return;
    const note = p.note;
    const c = edit('consumer', cid, c => {
      c.docs = (c.docs || []).concat([p.doc]);
      c.status = 'inactive'; c.inactiveAt = today(); c.inactiveReason = 'Did not start: ' + why;
      c.starting = Object.assign({}, c.starting, { closedAt: nowIso(), closedBy: meName(), closedWhy: why });
      (c.medicaid = c.medicaid || {}).reviews = (c.medicaid.reviews || []).concat([{ at: nowIso(), by: meName(), action: 'close', note, doc: p.doc.path }]);
      if (c.medicaid.followup) c.medicaid.followup.done = true;
      logTo(c, 'Did not start (' + why + ') by ' + meName() + ': ' + note + ' (document attached)');
    });
    const lid = c && c.starting && c.starting.leadId;
    if (lid) edit('lead', lid, p2 => { p2.status = CLOSE_LEAD[why] || 'closed_other'; p2.closedAt = today(); (p2.notes = p2.notes || []).push({ date: today(), text: 'Did not start: ' + why + '. ' + note }); });
    rerender();
  }
  function historyHtml(c) {
    const log = ((c.medicaid || {}).log || []).slice().reverse();
    const docs = (c.docs || []).filter(d => d.kind === 'emomed');
    const pdfLink = path => ' <a href="#" onclick="openProofFile(\'' + q(path) + '\');return false">eMOMED page</a>';
    const checks = ((c.medicaid || {}).checks || []);
    return log.length ? log.map(e => {
      const ch = /^eMOMED check/.test(e.text) ? checks.find(k => k.at === e.at || Math.abs(Date.parse(k.at) - Date.parse(e.at)) < 2000) : null;
      return '<div class="st-hist"><span>' + esc(day(e.at)) + '</span><span>' + esc(e.text) + (ch && ch.pdf ? pdfLink(ch.pdf) : '') + '</span></div>';
    }).join('') + (docs.length ? '' : '') : '<div class="field-note">Nothing yet.</div>';
  }

  // ---------------------------------------------------------------- State and authorization, Ready
  function stateHtml(c, ctx) {
    const s = c.starting || {}, move = s.kind === 'move';
    return '<div class="alert alert-info" style="font-size:13.5px;margin:10px 0"><div><b>Medicaid eligibility is not authorization.</b> A good ME code means Medicaid can pay for CDS. Only DSDS decides whether they get CDS, after its assessment.</div></div>' +
      (move ? line('Transfer entered in the state portal', dateField(c, 'transferEntered')) : line('Referral sent to DSDS', dateField(c, 'referralSent')) + line('DSDS assessment', dateField(c, 'assessment'))) +
      line('Start date from the state', '<input type="date" value="' + esc(c.cdsStartDate || '') + '" onchange="StartHub.setStart(\'' + q(c.id) + '\',this.value)" style="font-size:13px"> <span class="field-note">The consumer and the attendant must be ready to clock in that day.</span>') +
      line('Authorization', ctx.auth ? '<span style="color:var(--success)">On file' + (ctx.authRec && ctx.authRec.planEnd ? ', ends ' + esc(day(ctx.authRec.planEnd)) : '') + '</span>'
        : '<span style="color:#9C6410">Not uploaded yet</span> ' + btn('Upload it on Authorizations', "showPage('authorizations')", true));
  }
  function dateField(c, k) {
    const v = (c.starting || {})[k] || '';
    return '<input type="date" value="' + esc(v) + '" onchange="StartHub.setDate(\'' + q(c.id) + "','" + k + '\',this.value)" style="font-size:13px">';
  }
  function setStart(cid, v) { edit('consumer', cid, c => { const was = c.cdsStartDate || ''; c.cdsStartDate = v; logTo(c, 'Start date from the state ' + (was ? 'changed from ' + day(was) + ' to ' : 'set to ') + day(v) + '.'); }); auditQuiet('consumer', getData('consumers').find(x => x.id === cid) || { id: cid }, 'start_date', { date: v }); rerender(); }
  function setDate(cid, k, v) { edit('consumer', cid, c => { c.starting = Object.assign({}, c.starting, { [k]: v }); }); rerender(); }
  function readyHtml(c, st) {
    return '<div class="field-note" style="margin:10px 0">Ready for first shift stays locked until every line is true. The Hub checks each one from the profile.</div>' +
      st.gate.map(g => '<div style="padding:4px 0;font-size:13.5px;' + (g.ok ? 'color:var(--success);font-weight:600' : '') + '">' + (g.ok ? '✓' : '○') + ' ' + esc(g.t) + '</div>').join('') +
      '<div style="margin-top:10px">' + (c.starting && c.starting.readyAt ? '<span style="color:var(--success);font-weight:600">Marked ready ' + esc(day(c.starting.readyAt)) + '. They move to Active by themselves when WellSky shows the first shift.</span>'
        : btn('Mark ready for first shift', "StartHub.markReady('" + q(c.id) + "')", false, st.gateOk ? '' : ' disabled')) + '</div>' +
      '<div class="field-note" style="margin-top:8px">Press each one when it is done. The rest the Hub checks by itself.</div>' +
      btn('WellSky: authorization is in', "StartHub.prep('" + q(c.id) + "','authWellSky')", true) + ' ' + btn('WellSky: tasks are in', "StartHub.prep('" + q(c.id) + "','tasksWellSky')", true) + ' ' +
      btn('Told the consumer how to clock in', "StartHub.prep('" + q(c.id) + "','toldClockIn')", true) + ' ' + btn('The attendant can clock in (WellSky app set up)', "StartHub.attClock('" + q(c.id) + "')", true);
  }
  function markReady(cid) {
    const c = getData('consumers').find(x => x.id === cid);
    if (!c || !S.startingSteps(c, ctxFor(c)).gateOk) return;
    edit('consumer', cid, x => { x.starting = Object.assign({}, x.starting, { readyAt: today(), readyBy: meName() }); logTo(x, 'Marked ready for first shift.'); });
    rerender();
  }
  function attClock(cid) { edit('consumer', cid, x => { x.starting = Object.assign({}, x.starting, { attClockIn: { at: nowIso(), by: meName() } }); logTo(x, 'The attendant can clock in (WellSky app set up).'); }); rerender(); }
  function prep(cid, k) { edit('consumer', cid, x => { x.firstShiftPrep = Object.assign({}, x.firstShiftPrep, { [k]: { at: nowIso(), by: meName() } }); }); rerender(); }

  // WellSky shows the first shift: Starting becomes Active (her pick, approved with version 5).
  function promote(c) {
    if (!S.isStarting(c)) return false;   // also with the switch off, so nobody stays Starting after their first shift
    const fs = typeof firstShiftOf === 'function' ? firstShiftOf(c) : '';
    if (!fs) return false;
    edit('consumer', c.id, x => { x.status = 'active'; x.starting = Object.assign({}, x.starting, { activeAt: today(), firstShift: fs }); logTo(x, 'WellSky shows the first shift ' + day(fs) + '. Moved to Active.'); });
    return true;
  }
  function promoteAll() { getData('consumers').filter(S.isStarting).forEach(promote); }

  // ---------------------------------------------------------------- Consumers list, Today
  function startingRows() {
    return getData('consumers').filter(S.isStarting).map(c => ({ c, st: S.startingSteps(c, ctxFor(c)) }))
      .sort((a, b) => (a.st.medicaid.needsSupervisor === b.st.medicaid.needsSupervisor ? a.st.count - b.st.count : a.st.medicaid.needsSupervisor ? -1 : 1));
  }
  function rosterHtml() {
    const rows = startingRows();
    if (!rows.length) return '<tr><td colspan="5"><div class="empty"><p>Nobody is Starting. Press They said yes on a lead to start someone.</p></div></td></tr>';
    return rows.map(({ c, st }) => '<tr><td><a href="javascript:void(0)" onclick="openProfile(\'' + q(c.id) + '\')" style="color:inherit;text-decoration:none"><b>' + esc(c.name) + '</b></a>' +
      '<div style="font-size:12px;color:var(--gray-600)">' + (st.transfer ? 'Moving from another agency' : 'New to CDS') + (c.county ? ', ' + esc(c.county) : '') + ' · ' + esc(c.coordinator || '') + '</div></td>' +
      '<td colspan="3"><div class="st-mini">' + st.steps.map(s => '<i class="' + s.state + '"></i>').join('') + '</div><div style="font-size:12.5px;margin-top:3px">' + esc(st.next.t) + '</div></td>' +
      '<td>' + btn('Open', "openProfile('" + q(c.id) + "')", true) + '</td></tr>').join('');
  }
  // Today: Medicaid application follow-ups (owner shown) and Starting people waiting on an ME code review.
  function todayHtml() {
    if (!on()) return '';
    const f = S.applicationFollowups({ consumers: getData('consumers'), pipeline: getData('pipeline') }, today());
    const sup = getData('consumers').filter(S.isStarting).filter(c => S.medicaidState(c).needsSupervisor);
    const sd = S.startDateAlerts({ consumers: getData('consumers') }, today(), c => Object.assign(ctxFor(c), _profPacket[c.id] && 'packet' in _profPacket[c.id] ? {} : { skipKeys: ['packet'] }));
    if (!f.length && !sup.length && !sd.length) return '';
    const open = (x) => x.kind === 'lead' ? "openLeadProfile('" + q(x.id) + "')" : "openProfile('" + q(x.id) + "')";
    return '<div class="card" style="padding:16px 18px;margin-bottom:12px"><b style="color:var(--primary)">Starting</b>' +
      sd.map(x => '<div style="font-size:13.5px;padding:6px 0;border-top:1px solid var(--gray-200)"><b>' + esc(x.name) + '</b>: ' + esc(x.why) + '. <span style="color:var(--danger)">' + (x.late ? 'Start date was ' : 'Start date ') + esc(day(x.due)) + '</span> · ' + esc(x.owner || 'no owner') +
        ' <a href="#" onclick="_profTab=\'ready\';openProfile(\'' + q(x.id) + '\');return false">Open</a></div>').join('') +
      sup.map(c => '<div style="font-size:13.5px;padding:6px 0;border-top:1px solid var(--gray-200)"><b>' + esc(c.name) + '</b>: Medicaid waiting on an ME code review. ' +
        '<a href="#" onclick="_profTab=\'medicaid\';openProfile(\'' + q(c.id) + '\');return false">Open</a></div>').join('') +
      f.map(x => '<div style="font-size:13.5px;padding:6px 0;border-top:1px solid var(--gray-200)"><b>' + esc(x.name) + '</b>: ' + esc(x.why) + '. ' +
        '<span style="color:' + (x.late ? 'var(--danger)' : '#9C6410') + '">' + (x.late ? 'Was due ' : 'Due ') + esc(day(x.due)) + '</span> · ' + esc(x.owner || 'no owner') +
        ' <a href="#" onclick="' + open(x) + ';return false">Open</a></div>').join('') + '</div>';
  }
  // Failed Medicaid messages: red on Today under Needs attention (her safeguard 2).
  function failedHtml(tasks) {
    return (tasks || []).filter(t => t.kind === 'medicaid_failed' && !t.done_at).map(t =>
      '<div class="alert alert-danger" style="font-size:13px;margin-bottom:10px"><div><strong>Needs attention:</strong> ' + esc(t.title) +
      ' <a href="#" onclick="StartHub.handled(\'' + q(t.id) + '\');return false" style="color:inherit;font-weight:600;text-decoration:underline">Mark handled</a></div></div>').join('');
  }
  async function handled(id) { try { await cdsMatchApi('completeTask', { id }); } catch (e) {} if (typeof loadTodayAttendants === 'function') loadTodayAttendants(true); else if (typeof renderDailyRoutine === 'function') renderDailyRoutine(); }


  // ---------------------------------------------------------------- Admin: ME code rules and the Medicaid messages
  // Only Samantha changes them. Every change needs a reason and is kept in the record's history. A rule change
  // never rewrites an answer already saved: profiles checked under the old version get "rules changed, look again".
  const KIND_LABEL = { ok: 'Eligible ME code', mc: 'Managed care code (Lock Ins decides)', rcf: 'Not for in-home CDS (RCF/ALF only)', notsp: 'Not eligible for CDS (not State Plan)',
                       child: 'Not eligible: under 18', e2: 'E2 exception (CDS only)', review: 'Always needs review' };
  let _adm = { code: null, msg: '' };
  function adminHtml() {
    const R = rules(), M = messages(), can = isOwner(), log = (getObj('meRules').log || []).concat(M.log).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const edit = _adm.code ? R.codes.find(r => r.code === _adm.code) || { code: _adm.code === '+' ? '' : _adm.code, kind: 'review', why: '', what: '', src: 'chart' } : null;
    return '<div class="card" style="padding:18px 20px;margin-top:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
        '<b style="color:var(--primary)">Starting: ME code rules</b><span class="field-note">Version ' + esc(R.version) + (can ? '' : '. Only Samantha can change them.') + '</span></div>' +
      '<div class="field-note" style="margin:4px 0 8px">From ' + esc(S.SOURCES.chart.title) + ' (' + esc(S.SOURCES.chart.rev) + '), ' + esc(S.SOURCES.policy.title) + ' (' + esc(S.SOURCES.policy.rev) + ') and ' + esc(S.SOURCES.cds.title) + ' (' + esc(S.SOURCES.cds.rev) + '). A change never rewrites an answer already saved.</div>' +
      (edit && can ? '<div class="st-box" style="margin-bottom:10px"><b>' + (edit.code ? 'Change code ' + esc(edit.code) : 'Add a code') + '</b><div class="st-form">' +
        (edit.code ? '' : '<label>Code<input id="admCode" type="text"></label><label>What it is<input id="admWhat" type="text"></label>') +
        '<label>For CDS<select id="admKind">' + Object.keys(KIND_LABEL).map(k => '<option value="' + k + '"' + (k === edit.kind ? ' selected' : '') + '>' + KIND_LABEL[k] + '</option>').join('') + '</select></label>' +
        '<label>Source and revision<input id="admSrc" type="text" value="' + esc((S.SOURCES[edit.src] || {}).title ? S.SOURCES[edit.src].title + ', ' + S.SOURCES[edit.src].rev : edit.src || '') + '"></label>' +
        '<label style="grid-column:1/-1">Why (shown to coordinators)<input id="admWhy" type="text" value="' + esc(edit.why || '') + '"></label>' +
        '<label style="grid-column:1/-1">Reason for this change (required)<input id="admReason" type="text" placeholder="for example: DHSS chart revised; code now allowed for CDS"></label></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' + btn('Save the change', 'StartHub.admSaveRule()') + btn('Cancel', 'StartHub.admEdit(null)', true) + '</div>' +
        (_adm.msg ? '<div style="color:var(--danger);font-size:13px;margin-top:6px">' + esc(_adm.msg) + '</div>' : '') + '</div>' : '') +
      '<div style="max-height:340px;overflow:auto"><table class="table"><thead><tr><th>Code</th><th>What it is</th><th>For CDS</th><th>Why</th>' + (can ? '<th></th>' : '') + '</tr></thead><tbody>' +
        R.codes.map(r => '<tr><td><b>' + esc(r.code) + '</b></td><td>' + esc(r.what || '') + '</td><td>' + esc(KIND_LABEL[r.kind] || r.kind) + '</td><td style="font-size:12px">' + esc(r.why || '') + '</td>' +
          (can ? '<td>' + btn('Change', "StartHub.admEdit('" + q(r.code) + "')", true) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
      (can ? '<div style="margin-top:8px">' + btn('Add a code', "StartHub.admEdit('+')", true) + '</div>' : '') +
    '</div>' +
    '<div class="card" style="padding:18px 20px;margin-top:14px"><b style="color:var(--primary)">Starting: Medicaid application messages</b>' +
      '<div class="field-note" style="margin:4px 0 8px">The text and email a coordinator sends from a lead or Starting profile. {caller}, {consumer} and {coordinator} fill in by themselves; {apply_online} and the other words in braces come from the list below. Lines between [[abd]] and [[/abd]] appear only when the Aged, Blind and Disabled form applies.</div>' +
      '<div class="st-form"><label style="grid-column:1/-1">After-call text ({next} is the sentence Finish call picks)<textarea id="admCallText" rows="3"' + (can ? '' : ' readonly') + '>' + esc(M.templates.callText) + '</textarea></label>' +
        '<label style="grid-column:1/-1">Medicaid instructions, text<textarea id="admText" rows="7"' + (can ? '' : ' readonly') + '>' + esc(M.templates.text) + '</textarea></label>' +
        '<label style="grid-column:1/-1">Email subject<input id="admSubject" type="text" value="' + esc(M.templates.emailSubject) + '"' + (can ? '' : ' readonly') + '></label>' +
        '<label style="grid-column:1/-1">Email<textarea id="admEmail" rows="12"' + (can ? '' : ' readonly') + '>' + esc(M.templates.email) + '</textarea></label></div>' +
      '<div style="font-weight:600;font-size:13px;margin:10px 0 4px">Application resources</div>' +
      '<table class="table"><thead><tr><th>Word in braces</th><th>What it is</th><th>Phone, link or address</th></tr></thead><tbody>' +
        M.resources.map((r, i) => '<tr><td>{' + esc(r.key) + '}</td><td>' + esc(r.label) + '</td><td><input type="text" id="admRes' + i + '" value="' + esc(r.value) + '" style="width:100%;font-size:12.5px"' + (can ? '' : ' readonly') + '></td></tr>').join('') + '</tbody></table>' +
      (can ? '<div class="st-form" style="margin-top:8px"><label style="grid-column:1/-1">Reason for this change (required)<input id="admMsgReason" type="text"></label></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' + btn('Save the messages', 'StartHub.admSaveMsgs()') + '</div><div id="admMsgNote" class="field-note"></div>' : '') +
    '</div>' +
    '<div class="card" style="padding:18px 20px;margin-top:14px"><b style="color:var(--primary)">Starting: change history</b>' +
      (log.length ? log.slice(0, 40).map(e => '<div class="st-hist"><span>' + esc(day(e.at)) + '</span><span>' + esc(e.text) + ' <span class="field-note">by ' + esc(e.by) + '. Reason: ' + esc(e.reason || '') + '</span></span></div>').join('')
        : '<div class="field-note">No changes yet. The first version is the DHSS pages read Nov 4, 2026.</div>') + '</div>';
  }
  function renderAdmin() { const h = document.getElementById('startingAdmin'); if (h) h.innerHTML = (on() || isOwner()) ? adminHtml() : ''; }
  function admEdit(code) { _adm = { code, msg: '' }; renderAdmin(); }
  function admSaveRule() {
    if (!isOwner()) return;
    const v = id => ((document.getElementById(id) || {}).value || '').trim();
    const reason = v('admReason');
    if (!reason) { _adm.msg = 'Add the reason for this change.'; renderAdmin(); return; }
    const cur = rules(), codes = JSON.parse(JSON.stringify(cur.codes));
    const code = _adm.code === '+' ? v('admCode').toUpperCase() : _adm.code;
    if (!code) { _adm.msg = 'Type the code.'; renderAdmin(); return; }
    let r = codes.find(x => x.code === code);
    const before = r ? { kind: r.kind, why: r.why } : null;
    if (!r) { r = { code, what: v('admWhat'), chart: '', kind: 'review', why: '', src: '' }; codes.push(r); codes.sort((a, b) => a.code.localeCompare(b.code)); }
    r.kind = v('admKind') || r.kind; r.why = v('admWhy'); r.src = v('admSrc') || r.src;
    const o = getObj('meRules'), log = (o.log || []).concat([{ at: nowIso(), by: meName(), reason,
      text: (before ? 'Code ' + code + ': ' + (KIND_LABEL[before.kind] || before.kind) + ' to ' + (KIND_LABEL[r.kind] || r.kind) : 'Added code ' + code + ' as ' + (KIND_LABEL[r.kind] || r.kind)) + '. Source: ' + r.src + '.' }]);
    setObj('meRules', { version: today() + '.' + (log.length), codes, log });
    auditQuiet('admin', { id: 'meRules', name: 'ME code rules' }, 'rule_changed', log[log.length - 1]);
    _adm = { code: null, msg: '' }; renderAdmin();
  }
  function admSaveMsgs() {
    if (!isOwner()) return;
    const v = id => ((document.getElementById(id) || {}).value || '');
    const reason = v('admMsgReason').trim(), note = document.getElementById('admMsgNote');
    if (!reason) { note.innerHTML = '<span style="color:var(--danger)">Add the reason for this change.</span>'; return; }
    const M = messages();
    const templates = { callText: v('admCallText'), text: v('admText'), emailSubject: v('admSubject'), email: v('admEmail') };
    const resources = M.resources.map((r, i) => Object.assign({}, r, { value: v('admRes' + i).trim() || r.value }));
    const bad = S.identifierProblems(templates.text + '\n' + templates.email, {});
    if (bad.length) { note.innerHTML = '<span style="color:var(--danger)">Take out ' + esc(bad.join(' and ')) + '. These messages never carry Medicaid numbers or eligibility details.</span>'; return; }
    const changed = [];
    ['callText', 'text', 'emailSubject', 'email'].forEach(k => { if (templates[k] !== M.templates[k]) changed.push({ callText: 'the after-call text', text: 'the instructions text', email: 'the instructions email', emailSubject: 'the email subject' }[k]); });
    resources.forEach((r, i) => { if (r.value !== M.resources[i].value) changed.push(r.label + ' (was ' + M.resources[i].value + ')'); });
    if (!changed.length) { note.textContent = 'Nothing changed.'; return; }
    setObj('medicaidMessages', { templates, resources, log: M.log.concat([{ at: nowIso(), by: meName(), reason, text: 'Changed ' + changed.join(', ') + '.' }]) });
    auditQuiet('admin', { id: 'medicaidMessages', name: 'Medicaid messages' }, 'messages_changed', { reason, changed });
    renderAdmin();
  }
  // window.renderProfile is the hub's; renderProfile inside this file is the Starting one.
  function rerender() { const pp = document.getElementById('page-profile'); if (pp && pp.classList.contains('active')) window.renderProfile(); if (typeof renderConsumers === 'function') renderConsumers(); }

  window.StartHub = { on, mountLead, yesAsk, yesCancel, setCoordinator, startFromLead, setStage, saveFollowup, familyApproved, compose, cmpCh, cmpTo, cmpAbd, cmpEdit, cmpReset, cmpClose, cmpSend,
    renderProfile, openLead, preview, saveCheck, flag, supAct, closeStarting, setDate, setStart, attClock, markReady, prep, promote, promoteAll, rosterHtml, startingRows, todayHtml, failedHtml, handled, rules, messages, ctxFor, deliveryLabel, renderAdmin, admEdit, admSaveRule, admSaveMsgs };
})();
