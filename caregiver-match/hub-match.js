// CDS Hub · Attendants · Caregiver Match (office screens H1 to H6).
// mountHubMatch(el, { api, onOpenLink, practice })
//   api(action, input) -> calls the cds-match server as staff (the Hub passes its sign-in).
// Every button goes through the server, which checks the rules again.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r) => r.querySelector(s), $$ = (s, r) => Array.from(r.querySelectorAll(s));
const who2 = o => String(o || '').replace(/@.*/, '').replace(/^\w/, m => m.toUpperCase());
const fmtD = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '';
const fmtW = iso => iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : '';
const today = () => new Date().toISOString().slice(0, 10);
const fmtPh = p => { const d = String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : p || ''; };
const STAGE_OPTS = [['new_request', 'New directory request'], ['medicaid_needed', 'Medicaid verification needed'], ['cds_review_pending', 'Medicaid active, CDS eligibility review pending'],
  ['potential_review', 'Potential CDS consumer, office review'], ['access_approved', 'Directory access approved'], ['invited', 'Private invitation sent'], ['browsing', 'Browsing caregivers'],
  ['intro_requested', 'Introduction requested'], ['caregiver_identified', 'Potential caregiver identified'], ['transition_requested', 'CDS referral or transition requested'],
  ['authorization_pending', 'CDS eligibility and authorization pending'], ['attendant_onboarding', 'Attendant onboarding'], ['ready_to_begin', 'Ready to begin services'],
  ['services_started', 'Services started'], ['on_hold', 'On hold'], ['not_eligible', 'Not eligible right now'], ['follow_up_later', 'Follow up later'], ['closed', 'Closed']];
const STAGE_NAME = Object.fromEntries(STAGE_OPTS);
const HELP_NAME = { personal_care: 'personal care', meals_housekeeping: 'meals and housekeeping', mobility_transfers: 'getting around and transfers', memory_care: 'memory care', companionship: 'companionship', errands: 'errands' };
function famNeeds(n) {
  if (!n) return '';
  const D = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }, P = { am: 'mornings', pm: 'afternoons', eve: 'evenings', night: 'overnights' };
  return [n.county && n.county + ' County', (n.days || []).map(d => D[d]).join(', '), (n.parts || []).map(x => P[x]).join(', '), n.hours && 'about ' + n.hours + ' hrs/week',
    (n.help || []).map(h => HELP_NAME[h]).join(', '), n.drives && 'needs a car', n.language].filter(Boolean).join(' · ');
}

if (typeof window !== 'undefined' && !window.__cmRejections) {
  window.__cmRejections = true;
  window.addEventListener('unhandledrejection', e => { if (e.reason && e.reason.shown) e.preventDefault(); });
}
function toast(msg, kind = 'ok') {
  let t = document.getElementById('cm-toast');
  if (!t) { t = document.createElement('div'); t.id = 'cm-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.className = 'cm-toast show ' + kind; t.textContent = msg; clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 4500);
}
async function act(btn, fn, ok) {
  const html = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Working…'; }
  try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return r; }
  catch (e) { toast(e.message || 'Something went wrong.', 'err'); if (e && typeof e === 'object') e.shown = true; throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}
const fileData = f => new Promise((res, rej) => { if (f.size > 15 * 1048576) return rej(new Error('Proof files must be under 15 MB.')); const r = new FileReader(); r.onload = () => res({ mime: f.type || 'application/octet-stream', data: r.result }); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(f); });
const practiceProof = label => ({ mime: 'text/plain', data: 'data:text/plain;base64,' + btoa('PRACTICE PROOF: ' + label + '. Fictional, not a real record.') });
function msgResult(r) {
  if (r.status === 'practice') return 'Practice: message recorded, nothing sent.';
  if (r.status === 'held') return 'Not sent: ' + (r.error || 'messages are switched off.');
  if (r.status === 'failed') return 'Failed to send: ' + (r.error || '');
  return 'Sent.';
}

export function mountHubMatch(el, opts) {
  const api = opts.api;
  const S = { tab: 'intros', cgFilter: 'all', cgId: null, famId: null, famFilter: 'review' };
  el.classList.add('cm');
  render();

  async function render() {
    let ov;
    try { ov = await api('overview'); } catch (e) { el.innerHTML = `<div class="cm-app wide"><div class="cm-card warn">${esc(e.message)}</div></div>`; return; }
    const t = ov.tiles;
    el.innerHTML = `<div class="cm-app wide">
      <div class="cm-row between cm-wrap"><div><h1 style="font-size:1.6rem">Caregiver Match</h1><p class="cm-sub">CDS Hub · Attendants</p></div>
        ${ov.mode === 'practice' ? '<span class="cm-pill prog">Practice mode: fictional people, nothing is sent</span>' : ''}</div>
      <div class="hm-tiles">
        ${tile(t.requests_waiting, 'Requests waiting on a caregiver', t.requests_waiting > 0, 'intros')}
        ${tile(t.meetings, 'Meetings scheduled', false, 'intros')}
        ${tile(t.to_review, 'Profiles to review', t.to_review > 0, 'review')}
        ${tile(t.not_reviewed, 'New caregivers to call', t.not_reviewed > 0, 'network')}
        ${tile(t.stale, 'Availability not confirmed 30+ days', t.stale > 0, 'network')}
        ${tile(t.eligible, 'Eligible attendants (fully verified)', false, 'network')}
        ${tile(t.eligibility_review, 'Families in eligibility review', t.eligibility_review > 0, 'families')}
        ${tile(t.approved_not_invited, 'Approved, invitation not sent', t.approved_not_invited > 0, 'families')}
        ${tile(t.open_tasks, 'Open tasks', t.open_tasks > 0, 'tasks')}
        ${tile(t.messages_not_sent, 'Messages held or failed', t.messages_not_sent > 0, 'messages')}
      </div>
      <div class="cm-tabs" role="tablist">${[['intros', 'Introductions'], ['families', 'Families and eligibility'], ['network', 'Caregiver Network'], ['review', 'Review queue'], ['tasks', 'Tasks'], ['messages', 'Messages']]
        .map(([k, l]) => `<button role="tab" data-t="${k}" aria-selected="${S.tab === k && !S.cgId && !S.famId}">${l}</button>`).join('')}</div>
      <div id="hv"></div></div>`;
    $$('[data-t]', el).forEach(b => b.onclick = () => { S.tab = b.dataset.t; S.cgId = null; S.famId = null; render(); });
    $$('[data-tile]', el).forEach(b => b.onclick = () => { S.tab = b.dataset.tile; S.cgId = null; S.famId = null; render(); });
    const hv = $('#hv', el);
    if (S.cgId) return caregiverDetail(hv, S.cgId);
    if (S.famId) return familyReview(hv, S.famId);
    await ({ intros, families, network, review, tasks, messages })[S.tab](hv);
  }
  const tile = (v, l, attn, tab) => `<button class="hm-tile ${attn ? 'attn' : ''}" data-tile="${tab}"><span class="v">${v}</span><span class="l">${esc(l)}</span></button>`;
  const openCg = id => { S.cgId = id; render(); };
  const practiceLink = (r, label) => r && r.practice_link && opts.onOpenLink ? `<button class="cm-btn sm ghost" data-open="${esc(r.practice_link)}">Practice: open ${esc(label)}</button>` : '';
  function wireOpen(root) { $$('[data-open]', root).forEach(b => b.onclick = () => opts.onOpenLink(b.dataset.open)); }
  function afterMsg(r, label, rerender) {
    toast(msgResult(r), r.status === 'held' || r.status === 'failed' ? 'err' : 'ok');
    if (r.practice_link && opts.onOpenLink) {
      const bar = document.createElement('div'); bar.className = 'cm-card tint hm-linkbar';
      bar.innerHTML = `<span class="cm-small">Practice: this is the link the message carries.</span>${practiceLink(r, label)}`;
      wireOpen(bar);
      rerender().then(() => { const hv = $('#hv', el); hv && hv.prepend(bar); });
    } else rerender();
  }

  // ---------- H5 Introductions ----------
  async function intros(v) {
    const { intros } = await api('intros');
    const lanes = [['sent', 'New requests'], ['asked', 'Waiting on caregiver'], ['caregiver_yes', 'Caregiver interested'], ['scheduled', 'Meeting scheduled'], ['met', 'Met, family deciding']];
    const closed = intros.filter(i => ['caregiver_no', 'not_available', 'closed'].includes(i.status));
    const next = i => ({ sent: 'Ask ' + i.caregiver + ' if they\'re interested', asked: 'Waiting for ' + i.caregiver + '. Call if no answer in 2 days.', caregiver_yes: 'Call ' + i.family + ' to set a time',
      scheduled: 'Follow up the day after the meeting', met: 'Ask ' + i.family + ' how it went' })[i.status];
    const stale = i => (Date.now() - new Date(i.updated_at)) / 86400000 > 2 && ['sent', 'asked', 'caregiver_yes'].includes(i.status);
    v.innerHTML = `<div class="hm-board">${lanes.map(([k, l]) => {
      const rows = intros.filter(i => i.status === k);
      return `<div class="hm-lane"><h3>${l} <span>${rows.length}</span></h3>${rows.map(i => `<div class="hm-ticket ${stale(i) ? 'late' : ''}" data-id="${i.id}">
        <b>${esc(i.family)} → ${esc(i.caregiver)}</b>
        <span class="cm-small">${esc(i.family_town || '')} · ${esc(i.how_text)}${i.preferred_times ? ' · ' + esc(i.preferred_times) : ''}</span>
        ${i.status === 'scheduled' ? `<span class="cm-small"><b>${esc(fmtW(i.meet_at))}</b> ${esc(i.meet_details || '')}</span>` : ''}
        <span class="hm-next">${esc(next(i))}</span>
        <div class="cm-row cm-wrap" style="gap:6px">${introButtons(i)}</div>
        <div class="hm-form" hidden></div>
      </div>`).join('') || '<p class="cm-small">None</p>'}</div>`;
    }).join('')}</div>
    ${closed.length ? `<details class="cm-card flat" style="margin-top:12px"><summary>Not a fit or closed (${closed.length})</summary>${closed.map(i => `<p class="cm-small">${esc(i.family)} → ${esc(i.caregiver)} · ${esc(i.status_text)} · ${esc(fmtD(i.updated_at))}${i.office_note ? ' · ' + esc(i.office_note) : ''}</p>`).join('')}</details>` : ''}`;
    $$('.hm-ticket', v).forEach(card => {
      const id = card.dataset.id, form = $('.hm-form', card);
      $$('[data-do]', card).forEach(b => b.onclick = async () => {
        const d = b.dataset.do;
        if (d === 'ask') { const r = await act(b, () => api('askCaregiver', { intro_id: id, channel: 'sms' })); afterMsg(r, 'as the caregiver', render); }
        else if (d === 'na') { await act(b, () => api('updateIntro', { intro_id: id, status: 'not_available', note: 'Not available' }), 'Marked not available. The family sees it on My requests.'); render(); }
        else if (d === 'met') { await act(b, () => api('updateIntro', { intro_id: id, status: 'met' }), 'Marked as met.'); render(); }
        else if (d === 'close') { await act(b, () => api('updateIntro', { intro_id: id, status: 'closed' }), 'Closed.'); render(); }
        else if (d === 'details') { const r = await act(b, () => api('sendMeetDetails', { intro_id: id, channel: 'sms' })); toast('Family: ' + r.family + ' · Caregiver: ' + r.caregiver + (r.family === 'practice' ? ' (practice: recorded, nothing sent)' : '')); render(); }
        else if (d === 'set') {
          form.hidden = false;
          form.innerHTML = `<div class="cm-field"><label>Date and time</label><input type="datetime-local" class="mt"></div>
            <div class="cm-field"><label>Where, or the video link</label><input class="md" placeholder="Google Meet link, or the address"></div>
            <span class="cm-small">For a live video meet-and-greet, create a Google Meet in the office calendar and paste the link.</span>
            <button class="cm-btn sm">Save meeting</button>`;
          $('button', form).onclick = async e => {
            const t = $('.mt', form).value;
            await act(e.currentTarget, () => api('updateIntro', { intro_id: id, status: 'scheduled', meet_at: t ? new Date(t).toISOString() : null, meet_details: $('.md', form).value }), 'Meeting saved. The family sees it on My requests.');
            render();
          };
        }
      });
    });
  }
  const introButtons = i => ({
    sent: `<button class="cm-btn sm" data-do="ask">Ask caregiver (text)</button><button class="cm-btn sm ghost" data-do="na">Not available</button>`,
    asked: `<button class="cm-btn sm ghost" data-do="na">Not available</button>`,
    caregiver_yes: `<button class="cm-btn sm" data-do="set">Set the meeting</button>`,
    scheduled: `<button class="cm-btn sm" data-do="details">Send meeting details</button><button class="cm-btn sm ghost" data-do="met">They met</button><button class="cm-btn sm ghost" data-do="set">Change</button>`,
    met: `<button class="cm-btn sm ghost" data-do="close">Close</button>`,
  })[i.status] || '';

  // ---------- H4 Families and eligibility (her design, 2026-10-15) ----------
  const COV = { active: '<span class="cm-pill ok">Active</span>', inactive: '<span class="cm-pill bad">Inactive</span>', unable: '<span class="cm-pill prog">Couldn\'t verify</span>' };
  const DSDS = { unknown: '<span class="cm-pill mute">Unknown</span>', not_yet: '<span class="cm-pill prog">Not determined yet</span>', confirmed: '<span class="cm-pill ok">Confirmed</span>', denied: '<span class="cm-pill bad">Not approved</span>' };
  const REVIEW_STAGES = ['new_request', 'medicaid_needed', 'cds_review_pending', 'potential_review'];
  const due = d => { if (!d) return ''; const late = String(d).slice(0, 10) < today(); return `<span class="${late ? 'hm-warn' : 'cm-small'}">${late ? 'Overdue · ' : 'Due '}${esc(fmtD(String(d).slice(0, 10) + 'T12:00:00Z'))}</span>`; };
  const nextFor = p => p.next_action ? { a: p.next_action, o: p.next_owner } :
    ({ new_request: { a: 'Call: explain CDS, ask permission to check Medicaid' }, medicaid_needed: { a: 'Check Medicaid in eMOMED' },
       cds_review_pending: { a: 'Record DSDS status, then decide on access' }, potential_review: { a: 'Office review: approve or hold' },
       access_approved: { a: p.gate.ok ? 'Send the private invitation' : p.gate.why },
       transition_requested: { a: 'Help with the DSDS referral or transfer request' }, authorization_pending: { a: 'Follow up with DSDS on the authorization' },
       attendant_onboarding: { a: 'Finish the attendant\'s hiring paperwork and orientation' }, ready_to_begin: { a: 'Confirm the first visit' } })[p.stage] || { a: '' };

  async function families(v) {
    const { prospects } = await api('prospects');
    const f = S.famFilter;
    const shown = prospects.filter(p => f === 'all' || (f === 'review' && REVIEW_STAGES.includes(p.stage)) || (f === 'approved' && p.access_status === 'approved') ||
      (f === 'hold' && ['on_hold', 'not_eligible', 'follow_up_later'].includes(p.stage)) || (f === 'recheck' && p.recheck_due));
    const count = k => prospects.filter(p => k === 'review' ? REVIEW_STAGES.includes(p.stage) : k === 'approved' ? p.access_status === 'approved' : k === 'hold' ? ['on_hold', 'not_eligible', 'follow_up_later'].includes(p.stage) : k === 'recheck' ? p.recheck_due : true).length;
    v.innerHTML = `<div class="cm-stack">
      <div class="cm-row between cm-wrap"><p class="cm-sub">Everyone who asked for the private directory. An eligibility review comes before any invitation. Phone and email stay in GoHighLevel.</p><button class="cm-btn sm" id="add">Add a family</button></div>
      <div class="cm-card warn"><p class="cm-small" style="margin:0"><b>Legal review hold:</b> invitations to people who receive IHS now (ours or another provider's) are held until the outreach wording is reviewed.</p></div>
      <form class="cm-card" id="addf" hidden>
        <div class="cm-grid2"><div class="cm-field"><label>First name</label><input name="first_name" required></div><div class="cm-field"><label>Last name</label><input name="last_name"></div></div>
        <div class="cm-grid2"><div class="cm-field"><label>Phone</label><input name="phone" type="tel"></div><div class="cm-field"><label>Email</label><input name="email" type="email"></div></div>
        <div class="cm-grid2"><div class="cm-field"><label>Town</label><input name="town"></div><div class="cm-field"><label>Type</label><select name="kind"><option value="prospect">Prospect (45-day access once approved)</option><option value="consumer">Current Caring Companions CDS consumer (ongoing access)</option></select></div></div>
        <div class="cm-field"><label>Notes</label><input name="notes"></div>
        <button class="cm-btn sm">Save family</button>
      </form>
      <div class="cm-chips">${[['review', 'Needs eligibility review'], ['approved', 'Access approved'], ['hold', 'On hold or not eligible'], ['recheck', 'Medicaid check needed now'], ['all', 'Everyone']].map(([k, l]) => `<button class="cm-chip" data-ff="${k}" aria-pressed="${f === k}">${l} (${count(k)})</button>`).join('')}</div>
      <div class="hm-table"><table class="hm-elig"><thead><tr><th>Who asked</th><th>Medicaid checked</th><th>Coverage</th><th>DSDS CDS eligibility</th><th>Potential CDS consumer</th><th>Next action</th><th>Invitation</th></tr></thead><tbody>
      ${shown.map(p => { const n = nextFor(p); return `<tr class="hm-click" data-id="${p.id}">
        <td><b>${esc(p.first_name)}</b>${p.kind === 'consumer' ? ' <span class="cm-pill info">CDS consumer</span>' : ''}<br><span class="cm-small">${esc(p.town || '')} · ${esc(fmtD(p.created_at))}${p.needs && p.needs.program === 'ihs' ? ' · <b>on IHS now</b>' : ''}</span><br><span class="cm-small">${esc(p.stage_label)}</span></td>
        <td>${p.medicaid ? esc(fmtD(String(p.medicaid.checked_on).slice(0, 10) + 'T12:00:00Z')) + `<br><span class="cm-small">by ${esc(who2(p.medicaid.checked_by))}</span>` : p.kind === 'consumer' && p.dsds_cds === 'confirmed' ? '<span class="cm-small">Not needed (CDS consumer)</span>' : p.consent ? '<span class="cm-pill prog">Not yet</span>' : '<span class="cm-small">Waiting for permission</span>'}
          ${/^Not needed/.test(p.next_verification.label) ? '' : `<br><span class="${p.next_verification.due ? 'hm-warn' : 'cm-small'}">Next: ${esc(p.next_verification.label)}</span>`}</td>
        <td>${p.medicaid ? COV[p.medicaid.coverage] + (p.medicaid.restrictions ? `<br><span class="cm-small">${esc(p.medicaid.restrictions)}</span>` : '') : p.kind === 'consumer' && p.dsds_cds === 'confirmed' ? '<span class="cm-small">On file (CDS consumer)</span>' : '<span class="cm-small">Not checked</span>'}</td>
        <td>${DSDS[p.dsds_cds]}${p.referral_needed ? '<br><span class="cm-small">Referral or assessment needed</span>' : ''}</td>
        <td>${p.access_path === 'potential_cds' || p.stage === 'potential_review' ? '<span class="cm-pill info">Yes</span>' : p.access_path === 'cds_consumer' ? '<span class="cm-small">Already CDS</span>' : '<span class="cm-small">Not yet</span>'}</td>
        <td><b>${esc(n.a || '')}</b>${n.o ? `<br><span class="cm-small">${esc(who2(n.o))}</span>` : ''}${p.next_due ? '<br>' + due(p.next_due) : ''}</td>
        <td>${p.access && !p.access.revoked_at ? `<span class="cm-pill ok">Sent</span><br><span class="cm-small">${p.access.days_left === null ? 'Ongoing' : p.access.open ? p.access.days_left + ' days left' : 'Expired'}</span>` : p.gate.ok ? '<span class="cm-pill ok">Can send</span>' : `<span class="cm-pill ${p.access_status === 'approved' ? 'prog' : 'mute'}">Not yet</span><br><span class="cm-small">${esc(p.gate.why)}</span>`}</td>
      </tr>`; }).join('') || '<tr><td colspan="7" class="cm-small">No one here.</td></tr>'}
      </tbody></table></div></div>`;
    $('#add', v).onclick = () => { $('#addf', v).hidden = !$('#addf', v).hidden; };
    $('#addf', v).onsubmit = async e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); const r = await act($('button', e.target), () => api('addProspect', fd), 'Family added.'); S.famId = r.id; render(); };
    $$('[data-ff]', v).forEach(b => b.onclick = () => { S.famFilter = b.dataset.ff; render(); });
    $$('tr[data-id]', v).forEach(tr => tr.onclick = () => { S.famId = tr.dataset.id; render(); });
  }

  async function familyReview(v, id) {
    const d = await api('eligibility', { prospect_id: id });
    const p = d.prospect, e = d.eligibility || {}, st = d.statuses, last = d.checks[0];
    const step = (n, title, done, body, open = !done) => `<details class="hm-estep ${done ? 'done' : ''}" ${open ? 'open' : ''}><summary><span class="num">${done ? '✓' : n}</span><b>${title}</b></summary><div class="hm-ebody">${body}</div></details>`;
    const badge = (on, yes, no) => `<div class="hm-four ${on ? 'on' : ''}"><span>${on ? '✓' : '·'}</span><b>${yes}</b><small>${on ? 'Yes' : no}</small></div>`;
    v.innerHTML = `<div class="cm-stack">
      <button class="cm-back" id="back">← Back to families</button>
      <div class="cm-row between cm-wrap"><div><h2>${esc(p.first_name)}</h2><span class="cm-small">${esc(p.town || '')} · asked ${esc(fmtD(p.created_at))} · ${esc(p.source || '')}${p.needs && p.needs.program ? ' · says: ' + esc({ ihs: 'receives IHS now', cds: 'uses CDS now', new: 'new to both', not_sure: 'not sure', prefer_not: 'prefers not to say' }[p.needs.program]) : ''}</span><br>
        <span class="cm-small">Phone ${esc(d.contact.phone || 'not on file')}${d.contact.email ? ' · ' + esc(d.contact.email) : ''} (from GoHighLevel)</span></div>
        <span class="cm-pill info">${esc(p.stage_label)}</span></div>
      <div class="hm-fours">
        ${badge(st.medicaid_verified, 'Medicaid coverage verified', last ? (last.coverage === 'active' ? 'Recheck due' : 'Not active') : 'Not checked')}
        ${badge(st.cds_eligibility_confirmed, 'CDS eligibility confirmed by DSDS', 'Not yet')}
        ${badge(st.directory_access_approved, 'Directory access approved', p.access_status === 'on_hold' ? 'On hold' : p.access_status === 'not_eligible' ? 'Not eligible' : 'Pending')}
        ${badge(st.services_authorized, 'CDS services authorized to begin', 'Not yet')}
      </div>
      <p class="cm-small">These four are separate. Active Medicaid doesn't mean CDS eligibility, and directory access doesn't mean services can begin.</p>
      <div class="hm-next-box"><div><span class="cm-label">Next step</span><b>${esc(p.next_action || nextFor({ ...p, gate: d.gate }).a || 'None set')}</b><span class="cm-small">${esc(who2(p.next_owner) || 'No owner yet')}${p.next_due ? ' · ' : ''}${p.next_due ? due(p.next_due) : ''}</span></div>
        <button class="cm-btn sm ghost" id="setNext">Change</button></div>
      <div class="cm-card" id="nextForm" hidden><div class="cm-grid2"><div class="cm-field"><label>Next action</label><input id="na" value="${esc(p.next_action || '')}"></div>
        <div class="cm-field"><label>Who</label><input id="no" list="owners" value="${esc(p.next_owner || '')}"><datalist id="owners"><option>Samantha</option><option>Krystal</option></datalist></div></div>
        <div class="cm-row" style="gap:8px"><input type="date" id="nd" class="hm-date" value="${esc(p.next_due ? String(p.next_due).slice(0, 10) : '')}"><button class="cm-btn sm" id="saveNext">Save next step</button></div></div>
      ${(d.saved_caregivers || []).length || Object.values(d.family_needs || {}).some(x => x && (!Array.isArray(x) || x.length)) ? `<div class="cm-card flat hm-fam-ctx"><b style="color:var(--navy)">What the family is looking at</b>
        ${famNeeds(d.family_needs) ? `<span class="cm-small"><b>Their needs:</b> ${esc(famNeeds(d.family_needs))}</span>` : ''}
        ${(d.saved_caregivers || []).length ? `<span class="cm-small"><b>Saved caregivers:</b> ${d.saved_caregivers.map(x => esc(x.first_name)).join(', ')}</span>` : ''}
        <span class="cm-small" style="opacity:.8">Families save caregivers privately. Use this to prepare for calls, not to contact caregivers.</span></div>` : ''}
      ${p.hold_reason ? `<div class="hm-banner ${p.access_status === 'not_eligible' ? 'bad' : ''}"><b>${p.access_status === 'not_eligible' ? 'Not eligible right now' : 'On hold'}:</b> ${esc(p.hold_reason)}</div>` : ''}
      <div class="hm-esteps">
        ${step(1, 'Permission to check Medicaid', !!e.consent_at, e.consent_at ? `<p class="cm-small">Given by the ${e.consent_from === 'consumer' ? 'consumer' : 'authorized representative'} · ${esc(e.consent_how)} · recorded ${esc(fmtD(e.consent_at))} by ${esc(e.consent_by)}</p>` : `
          <p class="cm-small">Explain CDS, then ask permission to check their Missouri Medicaid coverage.</p>
          <div class="cm-grid2"><div class="cm-field"><label>Permission from</label><select id="cf"><option value="consumer">The consumer</option><option value="authorized_rep">Authorized representative</option></select></div>
          <div class="cm-field"><label>How</label><input id="ch" value="Verbally on the phone"></div></div><button class="cm-btn sm" id="saveConsent">Record permission</button>`)}
        ${step(2, 'Check Medicaid in eMOMED', st.medicaid_verified && !d.next_verification.due, `
          ${d.checks.length ? `<div class="hm-checks">${d.checks.map(c => `<div><b>${esc(fmtD(String(c.checked_on).slice(0, 10) + 'T12:00:00Z'))}</b> ${COV[c.coverage]} <span class="cm-small">${esc({ emomed_web: 'eMOMED', emomed_phone: 'eMOMED phone line', emomed_batch: 'eMOMED batch' }[c.method])} · ${esc(c.checked_by)}${c.restrictions ? ' · ' + esc(c.restrictions) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span></div>`).join('')}</div>` : ''}
          <div class="hm-kv"><span>Last verified</span><b>${last ? esc(fmtD(String(last.checked_on).slice(0, 10) + 'T12:00:00Z')) + ' by ' + esc(who2(last.checked_by)) : 'Not yet'}</b>
            <span>Next required check</span><b class="${d.next_verification.due ? 'hm-warn' : ''}">${esc(d.next_verification.label)}</b></div>
          ${d.next_verification.due ? `<div class="hm-banner"><b>Check Medicaid now.</b> ${esc(d.next_verification.label)}.</div>` : ''}
          ${e.consent_at ? `<div class="cm-grid2"><div class="cm-field"><label>Date checked</label><input type="date" id="md" class="hm-date" value="${today()}"></div>
            <div class="cm-field"><label>How</label><select id="mm"><option value="emomed_web">eMOMED</option><option value="emomed_phone">eMOMED phone line</option><option value="emomed_batch">eMOMED batch</option></select></div></div>
            <div class="cm-field"><label>Coverage</label><select id="mc"><option value="active">Active</option><option value="inactive">Inactive</option><option value="unable">Couldn't verify</option></select></div>
            <div class="cm-field"><label>Coverage restrictions, if any</label><input id="mr" placeholder="For example: spend-down, lock-in, managed care plan"></div>
            <div class="cm-field"><label>Note</label><input id="mn"></div>
            <p class="cm-small hm-shield">Don't record Medicaid ID numbers, Social Security numbers, eMOMED passwords or screenshots here.</p>
            <button class="cm-btn sm" id="saveCheck">${d.checks.length ? 'Record a new check' : 'Record the check'}</button>` : '<p class="cm-small">Record permission first.</p>'}`, (!st.medicaid_verified || d.next_verification.due) && !!e.consent_at)}
        ${step(3, 'CDS eligibility (DSDS decides)', st.cds_eligibility_confirmed, `
          <p class="cm-small">Missouri's Division of Senior and Disability Services decides CDS eligibility. Record what you know. ${e.dsds_cds_by ? 'Last updated by ' + esc(e.dsds_cds_by) + '.' : ''}</p>
          <div class="cm-grid2"><div class="cm-field"><label>DSDS CDS eligibility</label><select id="ds">${[['unknown', 'Unknown'], ['not_yet', 'Not determined yet'], ['confirmed', 'Confirmed by DSDS'], ['denied', 'Not approved']].map(([k, l]) => `<option value="${k}" ${e.dsds_cds === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="cm-field"><label>Date (if confirmed)</label><input type="date" id="dd" class="hm-date" value="${esc(e.dsds_cds_on ? String(e.dsds_cds_on).slice(0, 10) : '')}"></div></div>
          <label class="cm-check"><input type="checkbox" id="dr" ${e.referral_needed ? 'checked' : ''}> A CDS referral or assessment is needed</label>
          <div class="cm-field"><label>Note</label><input id="dn" value="${esc(e.dsds_note || '')}"></div>
          <button class="cm-btn sm" id="saveDsds">Save</button>`, !st.cds_eligibility_confirmed && st.medicaid_verified)}
        ${step(4, 'Directory access decision', st.directory_access_approved, st.directory_access_approved ? `<p class="cm-small">Approved ${esc(fmtD(p.access_decided_at))} by ${esc(p.access_decided_by)} as ${p.access_path === 'cds_consumer' ? 'a CDS consumer' : 'a potential CDS consumer'}. ${esc(p.access_note || '')}</p>
          <p class="cm-small">Directory access is not approval to begin services.</p>` : `
          <div class="hm-paths">
            <div class="cm-card flat"><b>Approve as a CDS consumer</b><p class="cm-small" style="margin:0">DSDS has confirmed CDS eligibility.</p>
              ${p.kind === 'consumer' ? '<label class="cm-check"><input type="checkbox" id="exist"> This is a current Caring Companions CDS consumer (no new eMOMED check needed)</label>' : ''}
              <button class="cm-btn sm" id="apC" ${st.cds_eligibility_confirmed || p.kind === 'consumer' ? '' : 'disabled'}>Approve</button></div>
            <div class="cm-card flat"><b>Approve as a potential CDS consumer</b><p class="cm-small" style="margin:0">Medicaid active and current, exploring CDS, no DSDS decision yet.</p>
              ${p.stage === 'cds_review_pending' ? '<button class="cm-btn sm ghost" id="mkPot">Mark as potential CDS consumer</button>' : ''}
              <div class="cm-field"><label>Office review note</label><input id="apN"></div>
              <button class="cm-btn sm" id="apP" ${st.medicaid_verified ? '' : 'disabled'}>Approve</button></div>
          </div>
          <div class="cm-row cm-wrap" style="gap:8px">
            <button class="cm-btn sm ghost" id="hold">Put on hold</button><button class="cm-btn sm danger" id="ne">Not eligible right now</button></div>
          <div id="holdF" hidden class="cm-card flat"><div class="cm-field"><label>Reason</label><input id="hr"></div><div class="cm-grid2"><div class="cm-field"><label>Next action</label><input id="hn"></div><div class="cm-field"><label>Follow up by</label><input type="date" id="hd" class="hm-date"></div></div><button class="cm-btn sm" id="saveHold">Put on hold</button></div>
          <div id="neF" hidden class="cm-card flat"><div class="cm-field"><label>Reason (kept in their history)</label><input id="nr"></div><button class="cm-btn sm danger" id="saveNe">Mark not eligible</button></div>`, !st.directory_access_approved && (st.medicaid_verified || st.cds_eligibility_confirmed || p.kind === 'consumer'))}
        ${step(5, 'Private invitation', d.invited, `${d.invited ? '<p class="cm-small">Invitation sent. Directory access stays open even when an older Medicaid check expires.</p>' : ''}
          <div class="hm-banner ${d.gate.ok ? 'ok' : ''}"><b>${d.gate.ok ? 'Ready to send.' : 'Can\'t send yet.'}</b> ${d.gate.ok ? '' : esc(d.gate.why) + '.'}</div>
          <button class="cm-btn sm" id="inv" ${d.gate.ok ? '' : 'disabled'}>${d.invited ? 'Send a new invitation' : 'Send the private invitation'}</button>`, st.directory_access_approved && !d.invited)}
        ${step(6, 'Enrollment and ready to begin services', d.readiness.ok, `
          <div class="cm-grid2"><div class="cm-field"><label>Journey stage</label><select id="sg">${STAGE_OPTS.map(([k, l]) => `<option value="${k}" ${p.stage === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="cm-field"><label>Note</label><input id="sn" placeholder="Required for hold, not eligible, follow-up"></div></div>
          <button class="cm-btn sm ghost" id="saveStage">Update stage</button>
          <hr>
          <b style="color:var(--navy)">Before "Ready to begin services"</b>
          <ul class="hm-ready">${d.readiness.items.map(i => `<li class="${i.ok ? 'ok' : ''}"><span>${i.ok ? '✓' : ''}</span>${esc(i.label)}</li>`).join('')}</ul>
          <div class="cm-grid2">
            <div class="cm-field"><label>Expected service start</label><div class="cm-row" style="gap:6px"><input type="date" id="es" class="hm-date" value="${esc(p.expected_start_date ? String(p.expected_start_date).slice(0, 10) : '')}"><button class="cm-btn sm ghost" id="saveStart">Save</button></div>
              <span class="cm-small">Medicaid must be checked again in this calendar month. Changing the month means a new check.</span></div>
            <div class="cm-field"><label>CDS services authorized by DSDS</label>${p.services_authorized_at ? `<b>${esc(String(p.services_authorized_at).slice(0, 10))}</b><span class="cm-small">recorded by ${esc(who2(p.services_authorized_by))}</span>`
              : `<div class="cm-row" style="gap:6px"><input type="date" id="sa" class="hm-date"><button class="cm-btn sm ghost" id="saveAuth">Record</button></div>`}</div>
          </div>
          <div class="cm-grid2">
            <div class="cm-field"><label>Chosen attendant</label><div class="cm-row" style="gap:6px"><select id="ca"><option value="">Not chosen yet</option>${d.eligible_caregivers.map(c => `<option value="${c.id}" ${d.chosen && d.chosen.id === c.id ? 'selected' : ''}>${esc(c.first_name)}${c.eligible ? ' (fully screened)' : ' (screening not complete)'}</option>`).join('')}</select><button class="cm-btn sm ghost" id="saveCg">Save</button></div></div>
            <div class="cm-field"><label>Attendant onboarding</label>${p.attendant_onboarding_done_at ? `<b>Complete ${esc(String(p.attendant_onboarding_done_at).slice(0, 10))}</b>` : `<button class="cm-btn sm ghost" id="saveOnb" ${d.chosen ? '' : 'disabled'}>Mark onboarding complete</button>`}</div>
          </div>`, ['transition_requested', 'authorization_pending', 'attendant_onboarding', 'ready_to_begin'].includes(p.stage))}
      </div>
      <details class="cm-card flat" open><summary><b>History</b></summary>
        ${d.events.map(ev => `<p class="cm-small">${esc(fmtW(ev.at))} · ${esc(ev.actor === 'public' ? 'Website' : who2(ev.actor.replace(/^(staff|family|caregiver):/, '')))} · ${ev.to_stage ? esc(STAGE_NAME[ev.to_stage] || ev.to_stage) + (ev.note ? ': ' : '') : ''}${esc(ev.note || '')}</p>`).join('')}</details>
    </div>`;
    const re = () => familyReview(v, id), A = (a, i, ok) => act(null, () => api(a, { prospect_id: id, ...i }), ok).then(re);
    $('#back', v).onclick = () => { S.famId = null; render(); };
    $('#setNext', v).onclick = () => { $('#nextForm', v).hidden = !$('#nextForm', v).hidden; };
    $('#saveNext', v).onclick = () => A('setNextAction', { action: $('#na', v).value, owner: $('#no', v).value, due: $('#nd', v).value }, 'Next step saved.');
    const on = (sel, fn) => { const x = $(sel, v); if (x) x.onclick = fn; };
    on('#saveConsent', () => A('recordConsent', { from: $('#cf', v).value, how: $('#ch', v).value }, 'Permission recorded. Next: check eMOMED.'));
    on('#saveCheck', () => A('recordMedicaidCheck', { checked_on: $('#md', v).value, method: $('#mm', v).value, coverage: $('#mc', v).value, restrictions: $('#mr', v).value, note: $('#mn', v).value }, 'Check recorded.'));
    on('#saveDsds', () => A('setDsds', { dsds_cds: $('#ds', v).value, dsds_cds_on: $('#dd', v).value, referral_needed: $('#dr', v).checked, note: $('#dn', v).value }, 'Saved.'));
    on('#mkPot', () => A('markPotential', { note: $('#apN', v).value }, 'Marked as a potential CDS consumer.'));
    on('#apC', () => A('approveAccess', { path: 'cds_consumer', existing_consumer: $('#exist', v) ? $('#exist', v).checked : false, note: '' }, 'Directory access approved.'));
    on('#apP', () => A('approveAccess', { path: 'potential_cds', note: $('#apN', v).value }, 'Directory access approved.'));
    on('#hold', () => { $('#holdF', v).hidden = false; });
    on('#ne', () => { $('#neF', v).hidden = false; });
    on('#saveHold', () => A('holdAccess', { reason: $('#hr', v).value, next_action: $('#hn', v).value, due: $('#hd', v).value }, 'On hold. A follow-up task was added.'));
    on('#saveNe', () => A('markNotEligible', { reason: $('#nr', v).value }, 'Marked not eligible. History kept.'));
    on('#inv', async () => { const r = await act($('#inv', v), () => api('invite', { prospect_id: id })); afterMsg(r, 'as this family', re); });
    on('#saveStage', () => A('setStage', { stage: $('#sg', v).value, note: $('#sn', v).value }, 'Stage updated.'));
    on('#saveAuth', () => A('authorizeServices', { date: $('#sa', v).value }, 'Service authorization recorded.'));
    on('#saveStart', async () => { const r = await act(null, () => api('setExpectedStart', { prospect_id: id, date: $('#es', v).value })); toast(r.new_month_check_needed ? 'Saved. Check Medicaid again in that month before services begin.' : 'Saved.'); re(); });
    on('#saveCg', () => A('setChosenCaregiver', { pool_id: $('#ca', v).value }, 'Attendant saved.'));
    on('#saveOnb', () => A('markOnboardingDone', {}, 'Onboarding marked complete.'));
  }

  // ---------- H1 Caregiver Network ----------
  async function network(v) {
    const { caregivers } = await api('caregivers');
    const f = S.cgFilter;
    const shown = caregivers.filter(c => f === 'all' || (f === 'new' && !c.reviewed) || (f === 'listed' && c.listing.state !== 'not_listed') || (f === 'eligible' && c.eligible) || (f === 'screening' && c.reviewed && !c.eligible));
    const lp = c => c.listing.state === 'complete' ? '<span class="cm-pill ok">Listed: Screening complete</span>' : c.listing.state === 'in_progress' ? '<span class="cm-pill prog">Listed: Screening in progress</span>' : `<span class="cm-pill mute" title="${esc(c.listing.reason)}">Not listed</span><br><span class="cm-small">${esc(c.listing.reason)}</span>`;
    v.innerHTML = `<div class="cm-stack">
      <div class="cm-chips">${[['all', 'Everyone'], ['new', 'New, not reviewed'], ['screening', 'In screening'], ['eligible', 'Eligible'], ['listed', 'Listed']].map(([k, l]) => `<button class="cm-chip" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      <div class="hm-table"><table><thead><tr><th>Caregiver</th><th>Office review</th><th>FCSR status</th><th>Profile</th><th>Video</th><th>Days and times</th><th>Directory</th></tr></thead><tbody>
      ${shown.map(c => `<tr class="hm-click" data-id="${c.id}"><td><b>${esc(c.first_name)} ${esc(c.last_name)}</b><br><span class="cm-small">${esc(c.city || '')} · joined ${esc(fmtD(c.joined))}</span></td>
        <td>${c.reviewed ? '<span class="cm-pill ok">Done</span>' : '<span class="cm-pill prog">Call them</span>'}${c.fcsr_answer ? `<br><span class="cm-small">FCSR on form: ${esc({ yes: 'registered', no: 'not registered', not_sure: 'not sure' }[c.fcsr_answer])}</span>` : ''}</td>
        <td>${c.findings ? '<span class="cm-pill bad">Owner review</span>' : c.eligible ? '<span class="cm-pill ok">8 · Eligible</span>' : `<span class="cm-small">${c.screening_step ? c.screening_step + ' · ' : ''}${esc(c.screening_label)}</span>`}</td>
        <td>${esc({ none: 'Not started', draft: 'Draft', submitted: 'Waiting for review', approved: 'Approved', changes_requested: 'Changes asked' }[c.review_status] || c.review_status)}</td>
        <td>${esc({ none: 'None', waiting: 'To review', approved: 'Approved' }[c.video])}</td>
        <td class="${c.confirmed_days > 30 ? 'hm-warn' : ''}">${esc(c.confirmed_text)}</td>
        <td>${lp(c)}</td></tr>`).join('') || '<tr><td colspan="7" class="cm-small">No one here.</td></tr>'}
      </tbody></table></div></div>`;
    $$('[data-f]', v).forEach(b => b.onclick = () => { S.cgFilter = b.dataset.f; render(); });
    $$('.hm-click', v).forEach(tr => tr.onclick = () => openCg(tr.dataset.id));
  }

  // ---------- H3 Review queue ----------
  async function review(v) {
    const { caregivers } = await api('caregivers');
    const q = caregivers.filter(c => c.review_status === 'submitted' || c.video === 'waiting');
    v.innerHTML = `<div class="cm-stack">${q.length ? q.map(c => `<button class="cm-card cm-cgcard" data-id="${c.id}"><b style="color:var(--navy)">${esc(c.first_name)} ${esc(c.last_name)}</b>
      <span class="cm-small">${c.review_status === 'submitted' ? 'Profile and photo waiting for approval' : ''}${c.video === 'waiting' ? ' · Video waiting' : ''}</span></button>`).join('') : '<div class="cm-card cm-empty">Nothing waiting for review.</div>'}</div>`;
    $$('[data-id]', v).forEach(b => b.onclick = () => openCg(b.dataset.id));
  }

  // ---------- H6 Tasks ----------
  async function tasks(v) {
    const { tasks } = await api('tasks');
    v.innerHTML = `<div class="cm-stack"><p class="cm-sub">Created by the system as things happen. Nothing here is sent to anyone.</p>
      ${tasks.length ? tasks.map(t => `<div class="cm-card flat hm-task"><div class="cm-row between cm-wrap"><div><b>${esc(t.title)}</b><br><span class="cm-small">${t.due_at ? 'Due ' + esc(fmtD(t.due_at)) : 'Added ' + esc(fmtD(t.created_at))}</span></div>
        <div class="cm-row" style="gap:6px">${t.pool_id ? `<button class="cm-btn sm ghost" data-cg="${t.pool_id}">Open caregiver</button>` : ''}${t.prospect_id && !t.pool_id ? `<button class="cm-btn sm ghost" data-fam="${t.prospect_id}">Open review</button>` : ''}<button class="cm-btn sm" data-done="${t.id}">Done</button></div></div></div>`).join('')
      : '<div class="cm-card cm-empty">No open tasks.</div>'}</div>`;
    $$('[data-done]', v).forEach(b => b.onclick = async () => { await act(b, () => api('completeTask', { id: b.dataset.done }), 'Done.'); render(); });
    $$('[data-cg]', v).forEach(b => b.onclick = () => openCg(b.dataset.cg));
    $$('[data-fam]', v).forEach(b => b.onclick = () => { S.tab = 'families'; S.famId = b.dataset.fam; render(); });
  }

  // ---------- Messages (every message, sent or not) ----------
  async function messages(v) {
    const [{ messages }, { templates }] = await Promise.all([api('outbox'), api('templates')]);
    const pill = s => ({ practice: '<span class="cm-pill info">Practice: not sent</span>', held: '<span class="cm-pill prog">Held: messages off</span>', sent: '<span class="cm-pill ok">Sent</span>', failed: '<span class="cm-pill bad">Failed</span>' })[s];
    v.innerHTML = `<div class="cm-stack">
      <p class="cm-sub">Every message the system creates is listed here, including any that were held or failed. Nothing fails silently.</p>
      ${messages.map(m => `<details class="cm-card flat"><summary class="cm-row between cm-wrap" style="cursor:pointer"><span><b>${esc(templates[m.template] ? templates[m.template].label : m.template)}</b> · ${esc(m.audience)} · ${m.channel === 'sms' ? 'Text' : 'Email'} to ${esc(m.to_display)}${m.automatic ? ' · automatic' : ''}</span>
        <span class="cm-row" style="gap:6px">${pill(m.status)}<span class="cm-small">${esc(fmtW(m.created_at))}</span></span></summary>
        <pre class="hm-body">${esc(m.body)}</pre>${m.error ? `<p class="cm-small" style="color:var(--bad)">${esc(m.error)}</p>` : ''}
        ${opts.onOpenLink ? (m.body.match(/https?:\/\/\S+[?&](?:c|i)=[\w-]+(?:#\w+)?/g) || []).map(u => `<button class="cm-btn sm ghost" data-open="${esc(u)}">Practice: open this link</button>`).join('') : ''}
      </details>`).join('') || '<div class="cm-card cm-empty">No messages yet.</div>'}</div>`;
    wireOpen(v);
  }

  // ---------- H2 Caregiver record ----------
  async function caregiverDetail(v, id) {
    const d = await api('caregiver', { id });
    const r = d.row, scr = d.screening, p = d.profile, i = d.internal;
    const step = n => scr.steps[n - 1];
    const stepRow = (n, extra = '') => {
      const s = step(n);
      return `<tr class="${s.done ? 'done' : ''}"><td><b>${n} · ${esc(s.label)}</b>${s.skipped ? '<br><span class="cm-small">Not needed: already registered</span>' : ''}</td>
        <td>${s.at ? esc(fmtD(s.at)) : ''}</td><td class="cm-small">${esc(s.by || s.method || '')}${s.result ? (s.result === 'no_findings' ? ' <span class="cm-pill ok">No findings</span>' : ' <span class="cm-pill bad">Findings</span>') : ''}</td>
        <td>${s.proof_url ? `<a href="${esc(s.proof_url)}" target="_blank" rel="noopener">Proof</a>` : ''}</td><td>${extra}</td></tr>`;
    };
    v.innerHTML = `<div class="cm-stack">
      <button class="cm-back" id="back">← Back to ${S.tab === 'review' ? 'the review queue' : 'Caregiver Network'}</button>
      <div class="cm-row between cm-wrap"><div><h2>${esc(i.first_name)} ${esc(i.last_name)}</h2><span class="cm-small">${esc(i.city || '')} · joined ${esc(fmtD(r.joined))} · ${esc(r.source || '')}</span></div>
        ${d.listing.state === 'complete' ? '<span class="cm-pill ok">Listed: Screening complete</span>' : d.listing.state === 'in_progress' ? '<span class="cm-pill prog">Listed: Screening in progress</span>' : `<span class="cm-pill mute">Not listed: ${esc(d.listing.reason)}</span>`}</div>
      <div class="hm-three">
        <div class="cm-card">
          <h3>Internal record</h3>
          <p class="cm-small" style="margin:0">Office only. Never shown to families.</p>
          <div class="hm-kv"><span>Phone</span><b>${esc(fmtPh(i.phone))}</b><span>Email</span><b>${esc(i.email || '')}</b><span>Experience</span><b>${esc(i.experience || '')}</b><span>Heard about us</span><b>${esc(i.how_heard || '')}</b></div>
          ${i.applicant_notes ? `<p class="cm-small"><b>Their note:</b> ${esc(i.applicant_notes)}</p>` : ''}
          ${i.staff_notes ? `<p class="cm-small"><b>Staff notes:</b> ${esc(i.staff_notes)}</p>` : ''}
          ${i.office_reviewed_at ? `<span class="cm-pill ok">Office review done ${esc(fmtD(i.office_reviewed_at))}</span><span class="cm-small">by ${esc(i.office_reviewed_by)}</span>`
            : `<div class="cm-field"><label for="rvn">Office review note</label><input id="rvn" placeholder="Called, good fit, wants weekday mornings"></div><button class="cm-btn sm" id="rv">Mark office review done</button>`}
          ${i.office_reviewed_at ? `<div class="cm-row cm-wrap" style="gap:6px"><button class="cm-btn sm" id="pl">Send profile link (text)</button><button class="cm-btn sm ghost" id="ple">By email</button><button class="cm-btn sm danger" id="endl">End their links</button></div>` : ''}
        </div>
        <div class="cm-card hm-scr">
          <h3>Screening tracker</h3>
          ${scr.eligible ? '<div class="hm-banner ok"><b>8 · Eligible to begin CDS services.</b> Every required check is verified with proof.</div>'
            : scr.findings ? '<div class="hm-banner bad"><b>Owner review.</b> The FCSR result has findings. The caregiver is out of the directory.</div>'
            : `<div class="hm-banner"><b>Not eligible yet.</b> Still needed: ${esc(scr.missing.join(', '))}.</div>`}
          <div class="hm-kv"><span>Legal name</span><b>${esc(scr.legal_name || 'Not signed yet')}</b><span>Date of birth</span><b>${esc(scr.dob ? String(scr.dob).slice(0, 10) : '')}${scr.age != null ? ' (age ' + scr.age + ')' : ''}</b>
            <span>SSN</span><b>${scr.ssn_last4 ? '•••-••-' + esc(scr.ssn_last4) : 'Not given'}${scr.ssn_on_file ? ' · full number held encrypted until the result is recorded' : scr.ssn_last4 ? ' · full number deleted' : ''}</b></div>
          ${scr.request_form ? `<div class="hm-req"><div class="cm-row between cm-wrap"><b>FCSR Employer Background Screening Request</b><span class="cm-small">Provider type to check: ${esc(scr.request_form.provider_type)}</span></div>
            <div class="hm-req-grid">
              <span>Employer on the request</span><b>${esc(scr.request_form.employer || '')}</b>
              <span>Last name (current/legal)</span><b>${esc(scr.request_form.last)}</b>
              <span>First name (current/legal)</span><b>${esc(scr.request_form.first)}</b>
              <span>MI</span><b>${esc(scr.request_form.mi || '')}</b>
              <span>Social Security No.</span><b><span id="ssnv">•••-••-${esc(scr.ssn_last4 || '')}</span> ${scr.ssn_on_file ? '<button class="cm-btn sm ghost" id="rvSsn">Show for the request</button>' : '<span class="cm-small">full number deleted after the result</span>'}</b>
              <span>Date of birth</span><b>${esc(scr.request_form.dob ? scr.request_form.dob.slice(5, 7) + '/' + scr.request_form.dob.slice(8, 10) + '/' + scr.request_form.dob.slice(0, 4) : '')}</b>
              ${scr.request_form.other_names ? `<span>Other names used</span><b>${esc(scr.request_form.other_names)}</b>` : ''}
            </div><span class="cm-small">Request by phone (866-422-6872), the request form, or online. Each time you show the full number, it's recorded.</span></div>` : '<p class="cm-small">The caregiver hasn\'t signed the screening authorization yet, so the request details aren\'t ready.</p>'}
          <div class="hm-table tight"><table><thead><tr><th>Status</th><th>Date</th><th>By</th><th>Proof</th><th></th></tr></thead><tbody>
            ${stepRow(1, step(1).done || step(4).done ? '' : '<button class="cm-btn sm ghost" data-s="reg_needed">Registry lookup: not registered</button>')}
            ${stepRow(2, step(4).done ? '' : `<button class="cm-btn sm ghost" data-send="steps">${step(2).done ? 'Send again' : 'Send registration steps'}</button>`)}
            ${stepRow(3)}
            ${stepRow(4, step(4).done ? '' : '<button class="cm-btn sm" data-form="reg_verified">Record verified</button>')}
            ${stepRow(5, step(5).done || !step(4).done ? '' : '<button class="cm-btn sm" data-form="screen_pending">Record request</button>')}
            ${stepRow(6, step(6).done || !step(5).done ? '' : '<button class="cm-btn sm" data-form="screen_complete">Record result</button>')}
            <tr class="${step(7).done ? 'done' : ''}"><td colspan="5"><b>7 · EDL and other required checks</b></td></tr>
            ${step(7).checks.map(c => `<tr class="sub ${c.clear ? 'done' : ''}"><td>${esc(c.label)}</td><td>${esc(c.at ? fmtD(c.at) : '')}</td><td class="cm-small">${esc(c.by || '')} ${c.result ? (c.clear ? '<span class="cm-pill ok">Clear</span>' : '<span class="cm-pill bad">Not clear</span>') : ''}</td>
              <td>${c.proof_url ? `<a href="${esc(c.proof_url)}" target="_blank" rel="noopener">Proof</a>` : ''}</td><td><button class="cm-btn sm ghost" data-check="${c.key}">${c.result ? 'Re-record' : 'Record'}</button></td></tr>`).join('')}
            <tr class="${scr.eligible ? 'done' : ''}"><td colspan="5"><b>8 · Eligible to begin CDS services</b> <span class="cm-small">${scr.eligible ? 'Yes, calculated from the evidence above' : 'Calculated automatically. It can\'t be ticked by hand.'}</span></td></tr>
          </tbody></table></div>
          <div id="sform"></div>
          <div class="cm-field"><label for="fu">Follow-up note</label><input id="fu" value="${esc(scr.follow_up || '')}" placeholder="Called FCSR 10-15, result coming by mail"></div>
          <div class="cm-row" style="gap:6px"><input type="date" id="fud" value="${esc(scr.follow_up_due ? String(scr.follow_up_due).slice(0, 10) : '')}" aria-label="Follow-up date" class="hm-date"><button class="cm-btn sm ghost" id="fus">Save follow-up</button></div>
        </div>
        <div class="cm-card">
          <h3>What families see</h3>
          ${!p ? '<p class="cm-small">No profile yet. Send the profile link.</p>' : `
            <span class="cm-small">Profile: <b>${esc({ draft: 'Draft', submitted: 'Waiting for your review', approved: 'Approved', changes_requested: 'Changes asked' }[p.review_status])}</b> · days and times ${esc(p.availability_text)}</span>
            <div class="cm-row">${p.photo_draft_url ? `<figure class="hm-fig"><img src="${esc(p.photo_draft_url)}" alt="Photo waiting"><figcaption>${p.photo_draft_url === p.photo_approved_url ? 'Approved photo' : 'New photo'}</figcaption></figure>` : ''}
              ${p.video_draft_url ? `<span class="cm-pill ${p.video_draft_url === p.video_approved_url ? 'ok' : 'prog'}">${p.video_draft_url === p.video_approved_url ? 'Video approved' : 'New video to review'}</span>` : ''}</div>
            ${p.video_draft_url && p.video_draft_url.startsWith('practice-video:') ? '<span class="cm-small">Practice stand-in video</span>' : p.video_draft_url ? `<video src="${esc(p.video_draft_url)}" controls style="width:100%;border-radius:10px"></video>` : ''}
            <div class="hm-draft">${['about_me', 'enjoy_most', 'experience', 'interests', 'setting_pref'].filter(k => p.draft[k]).map(k => `<p class="cm-small"><b>${esc({ about_me: 'About me', enjoy_most: 'Enjoys most', experience: 'Experience', interests: 'Interests', setting_pref: 'Best setting' }[k])}:</b> ${esc(p.draft[k])}</p>`).join('')}
              <p class="cm-small"><b>Town:</b> ${esc(p.draft.town || '')} · <b>Counties:</b> ${esc((p.draft.counties || []).join(', '))}</p></div>
            ${(p.draft.certs || []).length ? `<span class="cm-label">Verify training before it shows</span><div class="cm-chips">${p.draft.certs.map(c => `<label class="cm-check"><input type="checkbox" class="vc" value="${c}" ${((p.approved || {}).certs || []).includes(c) ? 'checked' : ''}> ${esc({ cpr: 'CPR', cna: 'CNA', first_aid: 'First aid' }[c])} card seen</label>`).join('')}</div>` : ''}
            <div class="cm-row cm-wrap" style="gap:6px"><button class="cm-btn sm" id="ap">Approve profile${p.video_draft_url && p.video_draft_url !== p.video_approved_url ? ', photo and video' : ' and photo'}</button><button class="cm-btn sm ghost" id="ch">Ask for changes</button>
              <button class="cm-btn sm ghost" id="pz">${p.paused ? 'Unpause listing' : 'Pause listing'}</button></div>
            <div id="chf" hidden class="cm-stack"><div class="cm-field"><label for="chn">What should they change?</label><input id="chn" placeholder="Please use a photo where we can see your face"></div><button class="cm-btn sm" id="chs">Send back to caregiver</button></div>
            <span class="cm-small">Consents: ${d.consents.filter(c => !c.withdrawn_at).map(c => esc(c.kind) + ' (' + esc(fmtD(c.given_at)) + ')').join(', ') || 'none yet'}</span>`}
        </div>
      </div>
      <details class="cm-card flat"><summary>Messages and history for ${esc(i.first_name)}</summary>
        ${d.outbox.map(m => `<p class="cm-small">${esc(fmtW(m.created_at))} · ${esc(m.template)} · ${esc(m.status)}</p>`).join('') || '<p class="cm-small">No messages.</p>'}
        <hr>${d.audit.map(a => `<p class="cm-small">${esc(fmtW(a.at))} · ${esc(a.actor)} · ${esc(a.action)}</p>`).join('')}</details>
    </div>`;
    const re = () => caregiverDetail(v, id);
    $('#back', v).onclick = () => { S.cgId = null; render(); };
    if ($('#rv', v)) $('#rv', v).onclick = async e => { await act(e.currentTarget, () => api('markReviewed', { id, note: $('#rvn', v).value }), 'Office review recorded.'); re(); };
    if ($('#pl', v)) $('#pl', v).onclick = async e => { const x = await act(e.currentTarget, () => api('sendProfileLink', { id, channel: 'sms' })); afterMsg(x, 'as ' + i.first_name, re); };
    if ($('#ple', v)) $('#ple', v).onclick = async e => { const x = await act(e.currentTarget, () => api('sendProfileLink', { id, channel: 'email' })); afterMsg(x, 'as ' + i.first_name, re); };
    if ($('#endl', v)) $('#endl', v).onclick = async e => { await act(e.currentTarget, () => api('revokeCaregiverLinks', { id }), 'Their old links no longer work.'); re(); };
    $$('[data-send]', v).forEach(b => b.onclick = async () => { const x = await act(b, () => api('sendRegistrationSteps', { id, channel: 'sms' })); afterMsg(x, 'as ' + i.first_name, re); });
    $$('[data-s]', v).forEach(b => b.onclick = async () => { await act(b, () => api('recordScreening', { id, step: b.dataset.s }), 'Recorded.'); re(); });
    if ($('#rvSsn', v)) $('#rvSsn', v).onclick = async e => {
      const btn = e.currentTarget;
      const r = await act(btn, () => api('revealSsn', { id }));
      $('#ssnv', v).textContent = r.ssn; btn.hidden = true;
      setTimeout(() => { const x = $('#ssnv', v); if (x) x.textContent = '•••-••-' + (scr.ssn_last4 || ''); const b = $('#rvSsn', v); if (b) b.hidden = false; }, 60000);
    };
    $('#fus', v).onclick = async e => { await act(e.currentTarget, () => api('recordScreening', { id, step: 'follow_up', note: $('#fu', v).value, date: $('#fud', v).value }), 'Follow-up saved.'); };
    const sform = $('#sform', v);
    const proofPick = label => `<div class="cm-field"><label>Proof (screenshot or PDF)</label><input type="file" class="pf" accept="image/*,application/pdf"></div>${opts.practice ? `<label class="cm-check"><input type="checkbox" class="pp"> Practice: use a made-up proof file</label>` : ''}`;
    const getProof = async label => { const f = $('.pf', sform) && $('.pf', sform).files[0]; if (f) return fileData(f); if ($('.pp', sform) && $('.pp', sform).checked) return practiceProof(label); return null; };
    $$('[data-form]', v).forEach(b => b.onclick = () => {
      const k = b.dataset.form;
      sform.innerHTML = `<div class="cm-card tint hm-sform"><b>${esc({ reg_verified: '4 · Registration verified', screen_pending: '5 · Screening requested', screen_complete: '6 · Screening result' }[k])}</b>
        <div class="cm-field"><label>Date</label><input type="date" class="dt" value="${today()}"></div>
        ${k === 'screen_pending' ? '<div class="cm-field"><label>How it was requested</label><select class="mt"><option value="phone">Phone (866-422-6872)</option><option value="form">Employer request form</option><option value="online">Online</option></select></div>' : ''}
        ${k === 'screen_complete' ? '<div class="cm-field"><label>Result</label><select class="rs"><option value="no_findings">No findings</option><option value="findings">Findings: needs owner review</option></select></div>' : ''}
        ${k !== 'screen_pending' ? proofPick(k) : ''}
        <div class="cm-row" style="gap:6px"><button class="cm-btn sm" id="sv">Save</button><button class="cm-btn sm ghost" id="cx">Cancel</button></div></div>`;
      $('#cx', sform).onclick = () => { sform.innerHTML = ''; };
      $('#sv', sform).onclick = async e => {
        await act(e.currentTarget, async () => api('recordScreening', { id, step: k, date: $('.dt', sform).value, method: $('.mt', sform) && $('.mt', sform).value,
          result: $('.rs', sform) && $('.rs', sform).value, proof: k !== 'screen_pending' ? await getProof(k) : null }), 'Recorded.');
        re();
      };
    });
    $$('[data-check]', v).forEach(b => b.onclick = () => {
      const k = b.dataset.check;
      sform.innerHTML = `<div class="cm-card tint hm-sform"><b>Record: ${esc(step(7).checks.find(c => c.key === k).label)}</b>
        ${k === 'age18' ? '<p class="cm-small">Worked out from the date of birth the caregiver signed.</p>' : `
        <div class="cm-field"><label>Result</label><select class="rs"><option value="clear">Clear</option><option value="not_clear">Not clear</option></select></div>
        <div class="cm-field"><label>Checked on</label><input type="date" class="dt" value="${today()}"></div>
        ${['edl', 'edr'].includes(k) ? '<p class="cm-small">This comes from the FCSR result letter.</p>' : ''}${proofPick(k)}
        <div class="cm-field"><label>Note</label><input class="nt"></div>`}
        <div class="cm-row" style="gap:6px"><button class="cm-btn sm" id="sv">Save</button><button class="cm-btn sm ghost" id="cx">Cancel</button></div></div>`;
      $('#cx', sform).onclick = () => { sform.innerHTML = ''; };
      $('#sv', sform).onclick = async e => {
        await act(e.currentTarget, async () => api('recordCheck', { id, check_key: k, result: $('.rs', sform) ? $('.rs', sform).value : 'clear', checked_on: $('.dt', sform) && $('.dt', sform).value,
          note: $('.nt', sform) && $('.nt', sform).value, proof: k === 'age18' ? null : await getProof(k) }), 'Check recorded.');
        re();
      };
    });
    if (p) {
      $('#ap', v).onclick = async e => { await act(e.currentTarget, () => api('reviewProfile', { id, decision: 'approve', verified_certs: $$('.vc:checked', v).map(x => x.value) }), 'Approved.'); re(); };
      $('#ch', v).onclick = () => { $('#chf', v).hidden = false; };
      $('#chs', v).onclick = async e => { await act(e.currentTarget, () => api('reviewProfile', { id, decision: 'changes', note: $('#chn', v).value }), 'Sent back. The caregiver sees your note on their page.'); re(); };
      $('#pz', v).onclick = async e => { await act(e.currentTarget, () => api('setListingPaused', { id, paused: !p.paused }), p.paused ? 'Listing unpaused.' : 'Listing paused.'); re(); };
    }
  }
}
