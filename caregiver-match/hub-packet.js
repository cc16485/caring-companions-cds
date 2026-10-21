// CDS Hub · Attendants · Active Attendants (2026-10-21, Samantha: "a tab of Active
// Attendants that open to each attendant's profile" and "as easy as possible on
// the admin"). Two sources in one list:
//   - attendants who came through the new application (caringcds.com/apply): the
//     cds-match server (packetList / packetGet ...), full profile + onboarding tracker
//   - attendants already on the Roster (agency_data 'attendants'): their roster card,
//     with rechecks due worked out from the dates already typed there.
// mountHubPacket(el, { api, roster, openRoster, openMatch })
// No em dashes in anything a person reads.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = iso => (iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '');
const ymd = d => d.toISOString().slice(0, 10);
const addM = (iso, m) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return ymd(d); };
const CHECK_NAMES = { edl: 'EDL', edr: 'DMH EDR', oig: 'OIG', mo_medicaid: 'MO Medicaid exclusion', age18: 'Age 18+', id_match: 'ID matches (video call)' };

const CSS = `
.hp{font-family:inherit;color:#1d2a36;max-width:760px}
.hp .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.hp .tabs button,.hp .pill-btn{border:2px solid #dfe6ec;background:#fff;color:#0D365F;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:14px}
.hp .tabs button.on{background:#0D365F;color:#fff;border-color:#0D365F}
.hp .row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;width:100%;text-align:left;background:#fff;border:1px solid #dfe6ec;border-radius:12px;padding:12px 14px;margin-top:8px;cursor:pointer;font:inherit;color:inherit}
.hp .row b{color:#0D365F;font-size:16px}.hp .row .meta{grid-column:1/-1;font-size:13.5px;color:#5b6977}
.hp .pill{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap}
.hp .g{background:#e7f5ee;color:#1f7a4d}.hp .y{background:#f6e7b8;color:#6b4e00}.hp .r{background:#fdecea;color:#b42318}.hp .b{background:#e3f1f0;color:#0f5f61}
.hp .card{background:#fff;border:1px solid #dfe6ec;border-radius:14px;padding:16px;margin-top:10px}
.hp h2{font-size:22px;color:#0D365F;margin:4px 0}.hp h3{font-size:15px;color:#0D365F;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em}
.hp .next{border-radius:10px;padding:10px 12px;margin-top:10px;font-weight:600}
.hp dl{display:grid;grid-template-columns:minmax(120px,34%) 1fr;gap:5px 12px;margin:6px 0;font-size:14.5px}.hp dt{color:#5b6977}.hp dd{margin:0;overflow-wrap:anywhere}
.hp ol.steps{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.hp ol.steps li{display:grid;grid-template-columns:24px 1fr;gap:8px;font-size:14.5px}
.hp ol.steps li::before{content:"";width:18px;height:18px;border-radius:50%;border:2px solid #c9d3dc;margin-top:2px}
.hp ol.steps li.done::before{content:"✓";border:0;background:#e7f5ee;color:#1f7a4d;display:grid;place-items:center;font-size:12px}
.hp ol.steps li.now::before{background:#0f7a7c;border-color:#0f7a7c}
.hp ol.steps span{display:block;color:#5b6977;font-size:13px}
.hp table{width:100%;border-collapse:collapse;font-size:14px}.hp th,.hp td{text-align:left;padding:7px 6px;border-bottom:1px solid #eef2f5;vertical-align:top}
.hp th{font-size:11px;text-transform:uppercase;color:#5b6977;letter-spacing:.05em}
.hp .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.hp .btn{border:0;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer;font:inherit;font-size:14px;background:#0D365F;color:#fff}
.hp .btn.o{background:#fff;color:#0D365F;border:2px solid #dfe6ec}
.hp .copy{border:1px dashed #c9d3dc;border-radius:10px;padding:8px 10px;margin-top:8px}
.hp .copy div{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0;font-size:14px;flex-wrap:wrap}
.hp .small{font-size:13px;color:#5b6977}.hp .err{color:#b42318;font-weight:700;margin-top:6px}
.hp input[type=text],.hp input[type=date]{font:inherit;padding:7px 9px;border:2px solid #dfe6ec;border-radius:8px}
`;

// Roster attendants: next due dates from what was typed on the Roster.
// autoOig: the date the automatic OIG check (cds-oig) last found them clear, when the OIG switch is on.
function rosterDue(a, autoOig) {
  const t = ymd(new Date()), soon = ymd(new Date(Date.now() + 7 * 864e5));
  const oig = autoOig && (!a.leieDate || autoOig > a.leieDate) ? autoOig : a.leieDate;
  const rows = [['OIG', oig, 1, oig && oig === autoOig], ['EDL', a.edlDate, 3], ['FCSR', a.fcsrDate, 12]].map(([k, d, m, auto]) => {
    const due = d ? addM(d, m) : null;
    return { k, done: d, auto: !!auto, due, tone: !d ? 'r' : due < t ? 'r' : due <= soon ? 'y' : 'g' };
  });
  const worst = rows.find(r => r.tone === 'r') || rows.find(r => r.tone === 'y');
  return { rows, label: worst ? (worst.done ? worst.k + (worst.tone === 'r' ? ' overdue' : ' due soon') : worst.k + ' date missing') : 'Active', tone: worst ? worst.tone : 'g' };
}

export function mountHubPacket(el, opts) {
  const { api } = opts;
  const roster = () => (opts.roster ? opts.roster() : []).filter(a => a.status !== 'inactive');
  const autoOig = id => { const p = opts.oigPeople && (opts.oigPeople() || {})['attendant:' + id];
    return p && (p.result === 'clear' || p.review === 'not_them') ? String(p.checked_at || '').slice(0, 10) || null : null; };
  let tab = 'active', list = [], open = null, err = '';
  if (!document.getElementById('hp_css')) { const s = document.createElement('style'); s.id = 'hp_css'; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add('hp');
  el.addEventListener('click', onClick);
  load();

  async function load() {
    el.innerHTML = '<div class="small" style="padding:12px">Loading attendants…</div>';
    try { list = (await api('packetList')).attendants || []; err = ''; } catch (e) { list = []; err = e.message; }
    draw();
  }
  function rows() {
    // A consumer is waiting on every applicant from caringcds.com/apply: those go first,
    // oldest first, with how long it has been (her call 2026-10-21: these are urgent).
    const ago = iso => { if (!iso) return ''; const h = Math.round((Date.now() - new Date(iso)) / 36e5); return h < 1 ? 'just now' : h < 24 ? h + ' hr ago' : Math.round(h / 24) + (Math.round(h / 24) === 1 ? ' day ago' : ' days ago'); };
    const pk = list.map(a => ({ kind: 'packet', id: a.pool_id, name: a.name, label: a.label, tone: a.tone, active: a.active, waiting: a.consumer_waiting,
      since: a.step1_at || a.started_at,
      meta: a.consumer_waiting ? ['Consumer waiting: ' + a.consumer, a.step1_at ? 'Step 1 signed ' + ago(a.step1_at) : 'started ' + ago(a.started_at), a.next].filter(Boolean).join(' · ')
        : [a.consumer, a.next].filter(Boolean).join(' · ') }));
    const ro = roster().map(a => { const d = rosterDue(a, autoOig(a.id)); return { kind: 'roster', id: a.id, name: a.name, label: d.label, tone: d.tone, active: true,
      meta: [a.consumer, 'From the Roster'].filter(Boolean).join(' · ') }; });
    return { active: [...pk.filter(r => r.active), ...ro].sort((x, y) => x.name.localeCompare(y.name)), applying: pk.filter(r => !r.active).sort((x, y) => (y.waiting - x.waiting) || String(x.since).localeCompare(String(y.since))) };
  }
  function draw() {
    if (open) return;
    const r = rows(), show = r[tab];
    el.innerHTML = `<h2>Attendants</h2>
      <div class="tabs"><button class="${tab === 'active' ? 'on' : ''}" data-tab="active">Active (${r.active.length})</button><button class="${tab === 'applying' ? 'on' : ''}" data-tab="applying">Applying (${r.applying.length})</button>
      <button data-act="reload" class="pill-btn">Refresh</button></div>
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
      ${show.length ? show.map(x => `<button class="row" data-open="${x.kind}:${esc(x.id)}"${x.waiting ? ' style="border-left:5px solid #b42318"' : ''}><b>${esc(x.name)}</b><span class="pill ${x.tone}">${esc(x.label)}</span><span class="meta">${esc(x.meta)}</span></button>`).join('')
        : `<p class="small">${tab === 'applying' ? 'Nobody is applying right now. New attendants start at caringcds.com/apply; you get an alert when they sign Step 1.' : 'No active attendants yet.'}</p>`}
      <p class="small" style="margin-top:12px">New attendants apply at <b>caringcds.com/apply</b>. Attendants from the Roster show their recheck dates; edit them on the Roster.</p>`;
  }

  async function openPacket(id) {
    el.innerHTML = '<div class="small" style="padding:12px">Loading…</div>';
    let g;
    try { g = await api('packetGet', { pool_id: id }); } catch (e) { open = null; err = e.message; draw(); return; }
    open = { kind: 'packet', id, g };
    const st = g.status, p = g.packet;
    const nextCls = st.tone === 'r' ? 'r' : st.tone === 'y' ? 'y' : st.tone === 'g' ? 'g' : 'b';
    const nowKey = (st.steps.find(s => !s.done) || {}).key;
    const checks = (g.screening.checks || []);
    el.innerHTML = `<button class="pill-btn" data-act="back">← All attendants</button>
      <div class="card"><h2>${esc(g.pool.first + ' ' + g.pool.last)}</h2><span class="pill ${st.tone}">${esc(st.label)}</span>
      <div class="next ${nextCls}"><b>Next:</b> ${esc(st.next)}</div>
      <dl><dt>Phone</dt><dd>${esc(g.pool.phone)}</dd><dt>Email</dt><dd>${esc(g.pool.email)}</dd><dt>Works for</dt><dd>${esc(p.consumer_name || '')}</dd>
      <dt>Caregiver list</dt><dd>${p.list_choice === 'join' ? 'Yes, wants to be listed' : 'No, works for their consumer only'}</dd></dl>

      <h3>Onboarding</h3><ol class="steps">${st.steps.map(s => `<li class="${s.done ? 'done' : s.key === nowKey ? 'now' : ''}"><div><b>${esc(s.label)}</b><span>${esc(s.who)}${s.detail ? ' · ' + esc(s.detail) : ''}</span></div></li>`).join('')}</ol>

      <h3>Background checks</h3>
      <table><thead><tr><th>Check</th><th>Result</th><th>Done</th><th></th></tr></thead><tbody>
      <tr><td><b>FCSR</b></td><td>${g.screening.findings ? 'Findings' : (g.screening.missing || []).some(m => /FCSR|Registration/.test(m)) ? 'Not finished' : 'Clear'}</td><td></td><td><button class="btn o" data-act="match">Record in Caregiver Match</button></td></tr>
      ${checks.map(c => `<tr><td><b>${esc(CHECK_NAMES[c.key] || c.label)}</b></td><td>${c.clear ? 'Clear' : c.result === 'not_clear' ? 'Not clear' : 'To run'}</td><td>${esc(fmtD(c.at))}</td>
        <td>${c.clear || c.key === 'id_match' || c.key === 'age18' ? '' : `<button class="btn o" data-clear="${c.key}">Clear: add screenshot</button>`}</td></tr>`).join('')}
      </tbody></table>
      <input type="file" id="hp_proof" accept="image/*,application/pdf" hidden>
      <p class="small">Clear: pick the screenshot or PDF of the search result, and it is recorded as clear today with that proof. Age 18 records itself from the date of birth. The ID match is recorded by the 5-minute ID check below. FCSR registration and result need the proof upload in Caregiver Match.</p>
      <div class="btns"><button class="btn o" data-copy="fcsr">Copy for FCSR</button><button class="btn o" data-copy="edl">Copy for EDL</button><button class="btn o" data-act="ssn">Show SSN for the FCSR request</button></div>
      <div id="hp_copy"></div>

      <h3>Office steps</h3>
      <div class="btns">
        <button class="btn o" data-copy="empeon">Copy for Empeon</button>
        ${p.empeon_invited_at ? `<span class="pill g">Empeon invite sent ${esc(fmtD(p.empeon_invited_at))}</span>` : '<button class="btn" data-mark="empeon_invited">Empeon invite sent</button>'}
        ${p.id_checked_at ? `<span class="pill g">ID seen ${esc(fmtD(p.id_checked_at))}</span>` : st.checksClear ? `<button class="btn" data-mark="id_checked">ID seen on the video call</button>` : ''}
        ${p.i9_done_at ? `<span class="pill g">I-9 done ${esc(fmtD(p.i9_done_at))}</span>` : p.id_checked_at ? '<button class="btn" data-mark="i9_done">I-9 Section 2 done in Empeon</button>' : ''}
      </div>
      ${g.forms.contract && !g.forms.contract.countersigned_at ? `<div class="copy"><b>Countersign the Attendant Care Contract</b><div><input type="text" id="hp_cs" placeholder="Type your full name"><button class="btn" data-act="countersign">Countersign</button></div></div>` : ''}
      ${p.list_choice === 'join' ? `<p class="small">Their caregiver profile is in Caregiver Match. Approve it there (one tap) once their checks are clear.</p>` : ''}

      <h3>Signed forms</h3>
      <dl>${Object.values(g.forms).map(f => `<dt>${esc(f.title)}</dt><dd>${esc(f.signed_name)}, ${esc(fmtD(f.signed_at))}${f.countersigned_at ? ' · countersigned by ' + esc(f.countersigned_name) : ''}</dd>`).join('') || '<dt>None yet</dt><dd></dd>'}</dl>
      <div class="err" id="hp_err"></div></div>`;
  }
  function openRosterCard(id) {
    const a = roster().find(x => x.id === id); if (!a) { draw(); return; }
    open = { kind: 'roster', id };
    const d = rosterDue(a, autoOig(a.id));
    el.innerHTML = `<button class="pill-btn" data-act="back">← All attendants</button>
      <div class="card"><h2>${esc(a.name)}</h2><span class="pill ${d.tone}">${esc(d.label)}</span>
      <dl><dt>Phone</dt><dd>${esc(a.phone)}</dd><dt>Email</dt><dd>${esc(a.email)}</dd><dt>Works for</dt><dd>${esc(a.consumer)}</dd><dt>Hired</dt><dd>${esc(fmtD(a.hiredate))}</dd>
      <dt>FCSR number</dt><dd>${esc(a.fcsrNum)}</dd><dt>Empeon</dt><dd>${esc(a.empeon)}</dd><dt>Contract</dt><dd>${esc(a.contract)}</dd><dt>EVV</dt><dd>${esc(a.evv)}</dd></dl>
      <h3>Rechecks</h3>
      <table><thead><tr><th>Check</th><th>Last done</th><th>Next due</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr><td><b>${r.k}</b></td><td>${esc(fmtD(r.done)) || 'Not on the Roster'}${r.auto ? ' <span class="small">(checked automatically)</span>' : ''}</td><td>${r.due ? `<span class="pill ${r.tone}">${esc(fmtD(r.due))}</span>` : ''}</td></tr>`).join('')}
      </tbody></table>
      <p class="small">OIG every month, EDL every 3 months, FCSR every year (the hub's onboarding checklist).</p>
      <div class="btns"><button class="btn" data-act="roster">Update on the Roster</button></div></div>`;
  }

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const errEl = () => el.querySelector('#hp_err');
    const fail = m => { const x = errEl(); if (x) x.textContent = m; else alert(m); };
    try {
      if (b.dataset.tab) { tab = b.dataset.tab; draw(); return; }
      if (b.dataset.open) { const [k, id] = b.dataset.open.split(':'); return k === 'packet' ? openPacket(id) : openRosterCard(id); }
      const act = b.dataset.act;
      if (act === 'reload') return load();
      if (act === 'back') { open = null; return load(); }
      if (act === 'roster') return opts.openRoster && opts.openRoster(open.id);
      if (act === 'match') return opts.openMatch && opts.openMatch();
      if (b.dataset.copy) {
        const r = await api('packetCopy', { pool_id: open.id, kind: b.dataset.copy });
        el.querySelector('#hp_copy').innerHTML = `<div class="copy"><b>For ${esc(b.dataset.copy.toUpperCase())}</b>${r.fields.map(f => `<div><span><span class="small">${esc(f.label)}:</span> <b>${esc(f.value)}</b></span>${f.value ? `<button class="btn o" data-val="${esc(f.value)}">Copy</button>` : ''}</div>`).join('')}</div>`;
        if (b.dataset.copy === 'empeon') el.querySelector('#hp_copy').scrollIntoView({ block: 'nearest' });
        return;
      }
      if (b.dataset.val != null) { try { await navigator.clipboard.writeText(b.dataset.val); b.textContent = 'Copied'; } catch { b.textContent = 'Select it'; } return; }
      if (act === 'ssn') {
        const r = await api('revealSsn', { id: open.id, reason: 'FCSR screening request' });
        b.outerHTML = `<span class="pill y" style="user-select:all">${esc(r.ssn)}</span> <span class="small">Shown once for the FCSR request. This view is recorded.</span>`;
        return;
      }
      if (b.dataset.clear) {
        const inp = el.querySelector('#hp_proof'), key = b.dataset.clear;
        inp.value = '';
        inp.onchange = async () => {
          const f = inp.files[0]; if (!f) return;
          if (f.size > 15 * 1024 * 1024) return fail('That file is too big (15 MB limit).');
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
          try { await api('recordCheck', { id: open.id, check_key: key, result: 'clear', checked_on: ymd(new Date()), proof: { mime: f.type || 'image/png', data }, note: 'Recorded from Active Attendants' }); openPacket(open.id); }
          catch (x) { fail(x.message); }
        };
        inp.click();
        return;
      }
      if (b.dataset.mark) { await api('packetMark', { pool_id: open.id, what: b.dataset.mark }); return openPacket(open.id); }
      if (act === 'countersign') { await api('packetCountersign', { pool_id: open.id, typed_name: el.querySelector('#hp_cs').value }); return openPacket(open.id); }
    } catch (x) { fail(x.message || 'Something went wrong.'); }
  }
}
