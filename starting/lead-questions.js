// CDS Hub · the sign-up questions on a lead's own link (2026-11-05, her ask: "Give each lead their own link that a
// coordinator sends, save the answers on that lead's profile, and fill in the guided call so it's just a quick confirm").
// window.LeadQs.
//   On a lead: "Send the sign-up questions" opens a text or email to review; nothing goes until Send is pressed (server
//   action leadQuestionsSend, switch lead_questions). The private link is made on the server in place of [link].
//   When they answer on caringcds.com/start, the answers show on the lead next to what the lead has (CallAnswers.rows).
//   New ones are ticked; a different one is not. Ticked ones go on the lead with OK, marked "from their online answers".
//   The guided call fills empty questions from the answers, tagged "from their online form, confirm it".
// The questions are written for the family member or friend who would be the paid caregiver. No em dashes.
(function (root) {
  'use strict';
  const HELP_OF = { 'Bathing and grooming': 'bathing', Dressing: 'dressing', Meals: 'meals', Toileting: 'toileting',
    'Getting in and out of bed': 'mobility', 'Getting around': 'mobility', Housekeeping: 'housekeeping', 'Shopping and rides': 'errands' };
  // How the person answering is related to the one getting care (the guided call's attendant list).
  const REL_OF = { 'A grandparent': 'grandchild', 'Another relative': 'other family', 'My husband or wife': 'spouse' };
  const WHO_SAID = { 'Mom or dad': 'Their mom or dad', 'A grandparent': 'Their grandparent', 'Another relative': 'Another relative',
    'A friend or neighbor': 'A friend or neighbor', 'My husband or wife': 'Their husband or wife' };
  const DECIDE_SAID = { Yes: 'Yes, makes their own decisions', Guardian: 'Has a guardian', POA: 'Someone has power of attorney', 'Not sure': 'Not sure' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const phone = d => { d = String(d || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : ''; };
  const day = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  const helpOf = tasks => [...new Set((tasks || []).map(t => HELP_OF[t]).filter(Boolean))];
  // The hub's own top-level let/const names (shared by every page script, not on window).
  const area = () => (typeof CDS_COUNTIES !== 'undefined' ? CDS_COUNTIES : []);
  const openLead = () => (typeof _lprofId !== 'undefined' ? _lprofId : null);
  const whoBy = () => (typeof _ldWhoBy === 'function' ? _ldWhoBy() : 'office');
  const inArea = c => { const a = area(); return !!c && (!a.length || a.includes(c)); };

  // Their answers as the lead's answer set (the same shape the recorded-call answers use).
  // The person who needs help answered for themself (the consumer path): their caregiver in mind, if any.
  const HELPER_REL_OF = { Grandchild: 'grandchild', 'Another relative': 'other family', 'Friend or neighbor': 'friend', 'Husband or wife': 'spouse' };
  function selfAnswers(x) {
    const a = { who: 'self' };
    if (x.first) a.first = x.first; if (x.last) a.last = x.last;
    if (x.consDob) a.dob = x.consDob;
    if (inArea(x.county)) a.county = x.county;
    if (x.medicaid === 'Yes') a.medicaid = 'yes'; else if (x.medicaid === 'No') a.medicaid = 'no';
    const h = helpOf(x.tasks); if (h.length) a.help = h;
    if (x.helper === 'has' && x.helperName) { a.attendant = 'has'; a.att_name = x.helperName; if (HELPER_REL_OF[x.helperRel]) a.att_relation = HELPER_REL_OF[x.helperRel]; }
    else if (x.helper === 'find') a.attendant = 'find';
    return a;
  }
  function toAnswers(x) {
    x = x || {};
    if (x.path === 'self') return selfAnswers(x);
    const a = { who: 'pair' };
    const cn = String(x.consName || '').trim().split(/\s+/).filter(Boolean);
    if (cn.length > 1) { a.first = cn[0]; a.last = cn.slice(1).join(' '); } else if (x.cared || cn[0]) a.first = cn[0] || x.cared;
    if (x.consDob) a.dob = x.consDob;
    if (inArea(x.county)) a.county = x.county;
    if (x.medicaid === 'Yes') a.medicaid = 'yes'; else if (x.medicaid === 'No') a.medicaid = 'no';
    const h = helpOf(x.tasks); if (h.length) a.help = h;
    const nm = [x.first, x.last].filter(Boolean).join(' ');
    if (nm) { a.attendant = 'has'; a.att_name = nm; a.att_phone = x.phone || ''; if (REL_OF[x.who]) a.att_relation = REL_OF[x.who]; }
    return a;
  }
  // Their answers as guided call fields. The person who answered is the one calling, about someone else ('pair').
  function toCall(x) {
    x = x || {};
    if (x.path === 'self') {
      const s = { who: 'self' };
      if (x.first) s.first = x.first; if (x.last) s.last = x.last;
      if (x.consDob) s.dob = x.consDob;
      if (x.county && inArea(x.county)) s.county = x.county;
      if (x.medicaid) s.medicaid = { Yes: 'yes', No: 'no', 'Not sure': 'unsure' }[x.medicaid];
      const h = helpOf(x.tasks); if (h.length) s.help = h;
      if (x.decide === 'Yes') s.selfDirect = 'yes';
      if (x.decide === 'Guardian') s.guardian = 'yes';
      if (x.helper === 'has') { s.attendant = 'has'; if (x.helperName) s.attName = x.helperName; if (HELPER_REL_OF[x.helperRel]) s.attRel = HELPER_REL_OF[x.helperRel]; }
      if (x.helper === 'find') s.attendant = 'find';
      if (x.phone) s.callerPhone = phone(x.phone);
      if (x.email) s.callerEmail = x.email;
      return s;
    }
    const set = { who: 'pair' };
    const cn = String(x.consName || '').trim().split(/\s+/).filter(Boolean);
    if (cn.length) { set.first = cn[0]; set.last = cn.slice(1).join(' '); } else if (x.cared) set.first = x.cared;
    if (x.consDob) set.dob = x.consDob;
    if (x.county) { if (inArea(x.county)) set.county = x.county; }
    if (x.medicaid) set.medicaid = { Yes: 'yes', No: 'no', 'Not sure': 'unsure' }[x.medicaid];
    const h = helpOf(x.tasks); if (h.length) set.help = h;
    if (x.decide === 'Yes') set.selfDirect = 'yes';
    if (x.decide === 'Guardian') set.guardian = 'yes';
    if (REL_OF[x.who]) set.attRel = REL_OF[x.who];
    const nm = [x.first, x.last].filter(Boolean).join(' ');
    if (nm) set.callerName = nm;
    if (x.phone) set.callerPhone = phone(x.phone);
    if (x.email) set.callerEmail = x.email;
    return set;
  }
  // Every answer word for word, for the side panel and the lead card.
  function shown(x) {
    x = x || {};
    const out = [], add = (label, v) => { if (v) out.push({ label, value: String(v) }); };
    add('Filled out by', x.path === 'self' ? 'The person who needs care' : x.path === 'care' ? 'A family member or friend' : '');
    add('Who they care for', WHO_SAID[x.who]);
    add('Their first name', x.cared);
    add('Their full name', x.consName);
    add('Their date of birth', /^\d{4}-\d{2}-\d{2}$/.test(x.consDob || '') ? x.consDob.slice(5, 7) + '/' + x.consDob.slice(8) + '/' + x.consDob.slice(0, 4) : x.consDob);
    add('Makes their own decisions', DECIDE_SAID[x.decide]);
    add('County', x.county);
    add('Medicaid (MO HealthNet)', x.medicaid);
    add('Needs help with', (x.tasks || []).join(', '));
    add('Hours a week they pictured', x.hours);
    add('18+, can work in the US, background check', x.basics === 'Yes' ? 'Yes' : x.basics ? 'Has a question' : '');
    add(x.path === 'self' ? 'Their contact' : 'Caregiver', [[x.first, x.last].filter(Boolean).join(' '), phone(x.phone), x.email].filter(Boolean).join(', '));
    add('Caregiver in mind', { has: 'Yes', find: 'Wants help finding one', unsure: 'Not sure yet' }[x.helper]);
    add('Their caregiver', [x.helperName, x.helperRel].filter(Boolean).join(', '));
    add('Best time to call', x.when);
    return out;
  }

  // ---- the answers, kept per lead (read from the server when a lead or the call opens) ----
  const cache = {};   // leadId -> { at, links: [...] }
  let busy = '';
  async function load(leadId, force) {
    const c = cache[leadId];
    if (!force && c && Date.now() - c.at < 60000) return c.links;
    const r = await root.cdsMatchApi('leadQuestionsFor', { leadIds: [String(leadId)] });
    cache[leadId] = { at: Date.now(), links: (r && r.links) || [] };
    return cache[leadId].links;
  }
  const latestAnswered = links => (links || []).filter(l => l.answered).sort((a, b) => String(b.answered).localeCompare(String(a.answered)))[0] || null;
  function answersFor(leadId) { const c = cache[leadId]; return c ? latestAnswered(c.links) : null; }

  // ---- the card on the lead profile ----
  function cardHtml(p) {
    if (!p || !root.cdsMatchApi) return '';
    const id = String(p.id), c = cache[id];
    if (!c || Date.now() - c.at > 60000) { load(id, true).then(() => { if (String(openLead()) === id && typeof root.renderLeadProfile === 'function') root.renderLeadProfile(); }).catch(() => {}); }
    const links = c ? c.links : [], ans = latestAnswered(links), sent = links[0];
    let html = '<div class="card lq-card" style="padding:18px 20px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><b style="color:var(--primary)">Sign-up questions</b>' +
      '<button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="LeadQs.openSend(\'' + esc(id) + '\')">' + (sent ? 'Send again' : 'Send the sign-up questions') + '</button></div>';
    if (!c) return html + '<div class="field-note" style="margin-top:6px">Checking for answers...</div></div>';
    if (!sent) return html + '<div class="field-note" style="margin-top:6px">Text or email them their own link to the questions on caringcds.com/start. Their answers come back here, so the call is a quick confirm.</div></div>';
    const STATUS = { sent: 'Sent', practice: 'Practice (not sent)', held: 'Waiting in Messages (switch off)', failed: 'Did not go through' };
    html += '<div class="field-note" style="margin-top:6px">' + esc(STATUS[sent.status] || sent.status || 'Sent') + ' ' + esc(day(sent.at)) + (sent.by ? ' by ' + esc(String(sent.by).split('@')[0]) : '') + '. ' +
      (ans ? '' : 'No answers yet. The link works for 30 days.') + '</div>';
    if (!ans) return html + '</div>';
    html += '<div class="cn-ans" style="margin-top:10px"><div class="cn-ans-head"><b>What they told us online, ' + esc(day(ans.answered)) + '</b>' +
      (ans.decided ? '<span class="field-note">' + (ans.kept && ans.kept.length ? 'Saved to the lead' : 'Looked at') + ' by ' + esc(String(ans.decided_by || '').split('@')[0]) + '</span>' : '<span class="field-note">Ticked ones go on the lead when you press OK</span>') + '</div>';
    if (!ans.decided && root.CallAnswers) {
      const rows = root.CallAnswers.rows(p, toAnswers(ans.answers), typeof root._todayIso === 'function' ? root._todayIso() : '');
      const ST = { new: 'new', same: 'already on the lead', adds: 'adds to the lead' };
      html += rows.map(r => '<label class="cn-ans-row cn-' + r.state + '"><input type="checkbox" id="lqa_' + esc(ans.id) + '_' + r.k + '"' + (r.tick ? ' checked' : '') + (r.state === 'same' ? ' disabled' : '') + '>' +
        '<span class="cn-ans-l">' + esc(r.label) + '</span><b>' + esc(r.value) + '</b><span class="cn-ans-s">' + (r.state === 'differs' ? 'lead says ' + esc(r.current) : esc(ST[r.state] || '')) + '</span></label>').join('');
      if (rows.some(r => r.state === 'differs')) html += '<div class="field-note">A different answer than the lead has is not ticked for you. Ask on the call, then tick it if their answer is right.</div>';
    }
    html += '<details style="margin-top:8px"><summary class="field-note" style="cursor:pointer">Every answer, word for word</summary>' +
      shown(ans.answers).map(x => '<div style="display:flex;gap:10px;padding:3px 0;font-size:13px"><span style="color:var(--gray-600);min-width:190px">' + esc(x.label) + '</span><span>' + esc(x.value) + '</span></div>').join('') + '</details>';
    if (ans.answers.who === 'My husband or wife' || ans.answers.helperRel === 'Husband or wife' || ans.answers.decide === 'Guardian' || ans.answers.decide === 'POA')
      html += '<div class="alert alert-warning" style="margin-top:8px;font-size:13px">' +
        (ans.answers.who === 'My husband or wife' ? 'The person who answered is their spouse. A spouse cannot be the paid attendant. ' : '') +
        (ans.answers.helperRel === 'Husband or wife' ? 'The caregiver they have in mind is their spouse. A spouse cannot be the paid attendant. ' : '') +
        (ans.answers.decide === 'Guardian' ? 'They said someone has guardianship. A person with a guardian cannot be enrolled in CDS. ' : '') +
        (ans.answers.decide === 'POA' ? 'They said someone has power of attorney. Ask what it covers: it matters only if it lets someone else make the CDS decisions. ' : '') + '</div>';
    if (!ans.decided) html += '<div class="cn-btns" style="margin-top:10px"><button type="button" class="btn btn-primary btn-sm"' + (busy === ans.id ? ' disabled' : '') + ' onclick="LeadQs.decide(\'' + esc(id) + '\',\'' + esc(ans.id) + '\',\'ok\')">OK, save it</button>' +
      '<button type="button" class="btn btn-outline btn-sm"' + (busy === ans.id ? ' disabled' : '') + ' onclick="LeadQs.decide(\'' + esc(id) + '\',\'' + esc(ans.id) + '\',\'dismiss\')">Not now</button>' +
      '<span class="field-note" id="lqe_' + esc(ans.id) + '">Nothing goes on the lead until someone presses OK. The questions also fill in the guided call.</span></div>';
    return html + '</div></div>';
  }

  async function decide(leadId, linkId, decision) {
    const ans = answersFor(leadId);
    if (!ans || ans.id !== linkId) return;
    const pipeline = root.getData('pipeline'), p = pipeline.find(x => String(x.id) === String(leadId));
    const a = toAnswers(ans.answers);
    const kept = decision === 'ok' && root.CallAnswers ? root.CallAnswers.ORDER.filter(k => { const b = document.getElementById('lqa_' + linkId + '_' + k); return b && b.checked && !b.disabled; }) : [];
    busy = linkId;
    const err = document.getElementById('lqe_' + linkId);
    try { await root.cdsMatchApi('leadQuestionsDecide', { id: linkId, decision, kept }); }
    catch (e) { busy = ''; if (err) { err.textContent = e.message; err.style.color = 'var(--danger)'; } return; }
    if (decision === 'ok' && p) {
      const by = whoBy();
      const did = kept.length ? root.CallAnswers.apply(p, a, kept, { id: 'web:' + linkId, at: ans.answered, by }) : [];
      // The "from the call" tag on each kept field says where it came from.
      did.forEach(k => { if (p.fromCalls && p.fromCalls[k]) p.fromCalls[k].web = true; });
      p.notes = (Array.isArray(p.notes) ? p.notes : []).concat(Object.assign({ date: String(ans.answered).slice(0, 10), text: 'Answered the sign-up questions online.', fromQuestions: linkId, by }, did.length ? { kept: did } : {}));
      await root.setData('pipeline', pipeline);
    }
    busy = '';
    await load(leadId, true).catch(() => {});
    if (typeof root.renderLeadProfile === 'function') root.renderLeadProfile();
  }

  // ---- the message to send ----
  let send = null;
  function draftFor(p, to) {
    const first = String((to && to.name) || '').trim().split(/\s+/)[0];
    const me = String(whoBy() || '').trim();
    const meFirst = me && me !== 'office' ? me.charAt(0).toUpperCase() + me.slice(1).split(/[\s@.]/)[0] : '';
    if (p.whoCalled === 'self' && (!to || to.self)) return 'Hi' + (first ? ' ' + first : '') + ', this is ' + (meFirst ? meFirst + ' with ' : '') + 'Caring Companions CDS. Here are a few quick questions about getting care at home through CDS. It takes about 2 minutes, and it makes our call much shorter: [link]\nReply STOP to opt out.';
    return 'Hi' + (first ? ' ' + first : '') + ', this is ' + (meFirst ? meFirst + ' with ' : '') + 'Caring Companions CDS. Here are a few quick questions about getting paid to care for ' +
      (p.firstName || (p.name && !/^(caller:|unknown caller)/i.test(p.name) ? String(p.name).split(' ')[0] : 'your loved one')) + '. It takes about 2 minutes, and it makes our call much shorter: [link]\nReply STOP to opt out.';
  }
  function people(p) {
    const list = [];
    const rel = root.CDSRules && root.CDSRules.relatedPeople ? root.CDSRules.relatedPeople(p) : [];
    rel.forEach(r => { if (r.phone || r.email) list.push({ name: r.name || '', label: (r.name || 'Contact') + (r.relation ? ' (' + r.relation + ')' : ''), phone: r.phone || '', email: r.email || '' }); });
    if (p.attendant && (p.attendant.phone || p.attendant.email) && !list.some(x => x.name === p.attendant.name)) list.push({ name: p.attendant.name || '', label: (p.attendant.name || 'Attendant') + ' (attendant)', phone: p.attendant.phone || '', email: p.attendant.email || '' });
    if (p.phone || p.email) list.push({ self: true, name: /^(caller:|unknown caller)/i.test(p.name || '') ? '' : p.name || '', label: (p.name || 'The lead') + ' (the lead)', phone: p.phone || '', email: p.email || '' });
    // A consumer who called for themself: their own number first.
    if (p.whoCalled === 'self') list.sort((x, y) => (y.self ? 1 : 0) - (x.self ? 1 : 0));
    return list;
  }
  function ensureModal() {
    if (document.getElementById('lqSendModal')) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-overlay" id="lqSendModal"><div class="modal" style="max-width:560px"><div class="modal-header">' +
      '<h3 style="margin:0">Send the sign-up questions</h3><button class="modal-close" onclick="closeModal(\'lqSendModal\')">&times;</button></div><div class="modal-body" id="lqSendBody"></div></div></div>');
  }
  function openSend(leadId) {
    const p = root.getData('pipeline').find(x => String(x.id) === String(leadId));
    if (!p) return;
    const ppl = people(p), first = ppl[0] || { name: '', phone: '', email: '' };
    send = { leadId: String(p.id), ppl, who: 0, ch: first.phone ? 'sms' : 'email', to: first.phone || first.email || '', body: draftFor(p, first), result: null, err: '' };
    ensureModal(); drawSend(); root.openModal('lqSendModal');
  }
  function drawSend() {
    const box = document.getElementById('lqSendBody'); if (!box || !send) return;
    const p = root.getData('pipeline').find(x => String(x.id) === send.leadId) || {};
    if (send.result) {
      const m = send.result;
      const said = { sent: 'Sent.', practice: 'Saved as practice. Nothing was sent.', held: 'Waiting in Messages. The Sign-up questions link switch is off, so nothing was sent.', failed: 'It did not go through: ' + (m.error || '') };
      box.innerHTML = '<div class="alert ' + (m.status === 'failed' ? 'alert-danger' : 'alert-info') + '">' + esc(said[m.status] || m.status) + '</div>' +
        '<div class="field-note">When they answer, it shows on ' + esc(String(p.name || 'the lead').split(' ')[0]) + '’s lead and fills in the guided call.</div>' +
        '<div style="margin-top:12px;text-align:right"><button class="btn btn-primary" onclick="closeModal(\'lqSendModal\')">Done</button></div>';
      return;
    }
    box.innerHTML =
      '<div class="field-note" style="margin-bottom:10px">The page asks first whether they need help themselves or help someone they love, so it fits the consumer or the family caregiver.</div>' +
      (send.ppl.length > 1 ? '<label class="rp-lbl" for="lqWho">To</label><select id="lqWho" onchange="LeadQs.pick(this.value)">' + send.ppl.map((x, i) => '<option value="' + i + '"' + (i === send.who ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select>' : '') +
      '<div style="display:flex;gap:8px;margin:10px 0"><button type="button" class="btn btn-sm ' + (send.ch === 'sms' ? 'btn-primary' : 'btn-outline') + '" onclick="LeadQs.channel(\'sms\')">Text</button>' +
        '<button type="button" class="btn btn-sm ' + (send.ch === 'email' ? 'btn-primary' : 'btn-outline') + '" onclick="LeadQs.channel(\'email\')">Email</button></div>' +
      '<label class="rp-lbl" for="lqTo">' + (send.ch === 'sms' ? 'Cell phone' : 'Email') + '</label><input id="lqTo" value="' + esc(send.to) + '" oninput="LeadQs.field(\'to\',this.value)">' +
      '<label class="rp-lbl" for="lqBody" style="margin-top:10px">Message</label><textarea id="lqBody" rows="6" oninput="LeadQs.field(\'body\',this.value)">' + esc(send.body) + '</textarea>' +
      '<div class="field-note">[link] becomes their own private link when you press Send. It works for 30 days and only for this lead.</div>' +
      (send.err ? '<div class="alert alert-danger" style="margin-top:8px">' + esc(send.err) + '</div>' : '') +
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline" onclick="closeModal(\'lqSendModal\')">Cancel</button>' +
      '<button class="btn btn-primary" id="lqSendBtn" onclick="LeadQs.go()">Send</button></div>';
  }
  function pick(i) { const x = send.ppl[+i]; if (!x) return; const p = root.getData('pipeline').find(y => String(y.id) === send.leadId) || {}; send.who = +i; send.to = send.ch === 'sms' ? x.phone : x.email; send.body = draftFor(p, x); drawSend(); }
  function channel(ch) { send.ch = ch; const x = send.ppl[send.who] || {}; send.to = ch === 'sms' ? x.phone || '' : x.email || ''; drawSend(); }
  function field(k, v) { send[k] = v; }
  async function go() {
    const p = root.getData('pipeline').find(x => String(x.id) === send.leadId);
    if (!p) return;
    const btn = document.getElementById('lqSendBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      const r = await root.cdsMatchApi('leadQuestionsSend', { person: { kind: 'lead', id: String(p.id), name: p.name || '' }, channel: send.ch, to: send.to, body: send.body });
      send.result = r.message; send.err = '';
      delete cache[send.leadId];
      if (typeof root.renderLeadProfile === 'function' && String(openLead()) === send.leadId) root.renderLeadProfile();
    } catch (e) { send.err = e.message; }
    drawSend();
  }

  function forget() { Object.keys(cache).forEach(k => delete cache[k]); }
  root.LeadQs = { forget, toAnswers, toCall, shown, load, answersFor, latestAnswered, cardHtml, decide, openSend, pick, channel, field, go };
})(typeof globalThis !== 'undefined' ? globalThis : this);
