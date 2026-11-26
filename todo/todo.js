/* =============================================================================
   TO-DO (2026-11-26, Samantha: "Katlins to-do needs to be in the Caring Companions CDS Subaccount").
   A tab in Today. Each office person has their own list; the owners see and change everyone's.
   Katlin sees "My to-do"; Samantha sees "Katlin's to-do" with a Whose picker.
     · Tonight: the every-night items for this Missouri day, plus one-time items that are due or late
     · Notes from Samantha sit on top until she clears them
     · Coming up: the other weekday items and future one-time items
     · Katlin can add one-time items for herself; the standing list is Samantha's
   Days are Missouri days. A computer elsewhere (Katlin in Vietnam) also sees its own day and time.
   Server: cds-todo (supabase/functions/_shared/office/todo.js). Nothing here texts or emails anyone.
   ============================================================================= */
(function () {
  const FN_URL = 'https://siivpekcaryeyttszwav.supabase.co/functions/v1/cds-todo';
  const TZ = 'America/Chicago';
  const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WORK = [1, 2, 3, 4, 5];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = (s) => esc(JSON.stringify(String(s)));
  const lc = (s) => String(s || '').trim().toLowerCase();
  const nameOf = (email) => { const f = String(email || '').split('@')[0].split(/[._-]/)[0]; return f ? f.charAt(0).toUpperCase() + f.slice(1) : 'Their'; };
  const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const longDay = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const shortDay = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const moDay = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const myTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || TZ; } catch (_) { return TZ; } };
  const PLACE = { 'Asia/Ho_Chi_Minh': 'Vietnam', 'Asia/Saigon': 'Vietnam' };

  function me() { return lc((document.getElementById('header_user') || {}).textContent || window.TD_EMAIL || ''); }
  function owner() { try { return typeof ldWhoOwner === 'function' && ldWhoOwner(); } catch (_) { return false; } }
  async function token() {
    try { const c = (typeof _db !== 'undefined' && _db) || null; if (!c || !c.auth) return ''; const s = await c.auth.getSession(); return (s && s.data && s.data.session && s.data.session.access_token) || ''; }
    catch (_) { return ''; }
  }
  async function call(body) {
    if (window.TD_API) return window.TD_API(body);   /* tests */
    const tk = await token();
    if (!tk) throw new Error('Please sign in again.');
    const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || ('The to-do server answered ' + r.status + '.'));
    return j;
  }

  /* ---------- state ---------- */
  const S = { target: 'tdWrap', who: '', day: '', data: null, loading: false, err: '', note: '', open: {}, form: null, probed: false, has: false, listed: [], picked: false };

  function shown() { return owner() || S.has; }
  /* an owner's tab is named for the one person who has a list ("Katlin's to-do"); with several, "To-do lists" */
  function label() {
    if (!owner()) return 'My to-do';
    const l = (S.listed || []).filter((p) => p !== me());
    return l.length === 1 ? nameOf(l[0]) + "'s to-do" : 'To-do lists';
  }
  /* after sign-in: does this person have a list? (owners always see the tab) */
  async function boot() {
    if (S.probed) return;
    S.probed = true;
    try { const r = await call({ action: 'list' }); S.has = (r.items || []).length > 0; S.listed = r.listed || []; }
    catch (_) { S.has = false; }
    refreshNav();
  }
  function refreshNav() {
    try {
      const a = document.querySelector('.page.active'); const id = a ? a.id.replace('page-', '') : '';
      if (typeof PAGE_TO_SECTION !== 'undefined' && PAGE_TO_SECTION[id] === 'today' && typeof renderSectionNav === 'function') renderSectionNav('today', id);
    } catch (_) {}
  }

  async function load() {
    S.loading = true; S.err = ''; paint();
    try {
      const body = { action: 'list' };
      if (S.who) body.who = S.who;
      if (S.day) body.day = S.day;
      S.data = await call(body);
      S.listed = S.data.listed || S.listed || [];
      /* an owner with no list of their own opens the first person who has one (Katlin) */
      if (S.data.owner && !S.picked && !(S.data.items || []).length) {
        const first = (S.data.listed || []).find((p) => p !== S.data.who);
        if (first) { S.who = first; S.picked = true; S.data = await call({ ...body, who: first }); }
      }
      if (!S.who) S.who = S.data.who;
      if (!S.day) S.day = S.data.day;
      S.has = S.has || (S.data.items || []).length > 0;
    } catch (e) { S.err = (e && e.message) || 'The list did not load.'; }
    S.loading = false; paint(); refreshNav();
  }

  /* ---------- words ---------- */
  function whenSay(x) {
    if (x.when === 'note') return 'Note';
    if (x.when === 'once') return shortDay(x.date);
    const d = (x.days || []).slice().sort();
    if (d.join() === WORK.join()) return 'Every work night (Mon to Fri)';
    if (d.length === 7) return 'Every day';
    if (d.length === 1) return ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][d[0]];
    return d.map((n) => DAY3[n]).join(', ');
  }
  function localLine() {
    const t = Date.now();
    const here = new Date(t).toLocaleString('en-US', { timeZone: myTZ(), weekday: 'long', hour: 'numeric', minute: '2-digit' });
    const mo = new Date(t).toLocaleString('en-US', { timeZone: TZ, weekday: 'long', hour: 'numeric', minute: '2-digit' });
    if (here === mo) return '';
    return 'Right now it is ' + mo + ' in Missouri and ' + here + (PLACE[myTZ()] ? ' in ' + PLACE[myTZ()] : ' where you are') + '.';
  }

  /* ---------- actions ---------- */
  async function tick(id, done) {
    const d = S.data; if (!d) return;
    const row = (d.tonight || []).find((x) => x.id === id) || (d.notes || []).find((x) => x.id === id);
    const was = row ? row.done : false;
    if (row) row.done = !!done;
    if (row) d.marks[id + '@' + S.day] = !!done;
    paint();
    try { await call({ action: 'mark', id, day: S.day, done: !!done }); S.note = ''; }
    catch (e) { if (row) row.done = was; S.note = 'Not saved: ' + ((e && e.message) || 'try again'); paint(); }
  }
  function openForm(id) {
    const it = id ? (S.data.items || []).find((x) => x.id === id) : null;
    const x = it ? it.data : {};
    S.form = { id: id || '', t: x.t || '', how: x.how || '', when: x.when || (owner() ? 'days' : 'once'), days: (x.days || WORK).slice(), date: x.date || S.day || moDay(), n: x.n, err: '' };
    paint();
    setTimeout(() => { const f = document.getElementById('tdT'); if (f) f.focus(); }, 30);
  }
  function readForm() {
    const f = S.form; if (!f) return;
    const g = (id) => document.getElementById(id);
    f.t = (g('tdT') || {}).value || ''; f.how = (g('tdHow') || {}).value || '';
    const w = document.querySelector('input[name="tdWhen"]:checked'); if (w) f.when = w.value;
    f.days = [...document.querySelectorAll('input[name="tdDay"]:checked')].map((x) => Number(x.value));
    if (f.when === 'work') { f.when = 'days'; f.days = WORK.slice(); f.work = true; } else f.work = false;
    f.date = (g('tdDate') || {}).value || f.date;
  }
  async function save() {
    readForm(); const f = S.form; if (!f) return;
    const item = { t: f.t, how: f.how, when: f.when };
    if (f.when === 'days') item.days = f.days;
    if (f.when === 'once') item.date = f.date;
    if (Number.isFinite(f.n)) item.n = f.n;
    const body = { action: 'save', who: S.who, item };
    if (f.id) body.id = f.id;
    f.err = ''; f.busy = true; paint();
    try { await call(body); S.form = null; S.note = 'Saved.'; await load(); }
    catch (e) { f.busy = false; f.err = (e && e.message) || 'Not saved.'; paint(); }
  }
  async function remove(id, sure) {
    if (!sure) { S.confirm = id; paint(); return; }
    S.confirm = null;
    try { await call({ action: 'remove', id }); S.note = 'Removed.'; await load(); }
    catch (e) { S.note = 'Not removed: ' + ((e && e.message) || 'try again'); paint(); }
  }

  /* ---------- drawing ---------- */
  const CSS = `
  .td{max-width:860px;font-size:14.5px;color:#1f2a37}
  .td h2{font-size:22px;color:#0D365F;margin:0}
  .td .sub{color:#57606a;margin:4px 0 0}
  .td .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 12px}
  .td .bar .day{font-weight:700;color:#0D365F;margin-right:6px}
  .td button{font:inherit;font-size:13px;font-weight:600;border:1px solid #d0d7de;background:#fff;color:#1F7A8C;border-radius:8px;padding:5px 11px;cursor:pointer}
  .td button.pri{background:#1F7A8C;border-color:#1F7A8C;color:#fff}
  .td button.red{color:#B91C1C}
  .td button:disabled{opacity:.6;cursor:default}
  .td select,.td input[type=text],.td input[type=date],.td textarea{font:inherit;border:1px solid #d0d7de;border-radius:8px;padding:6px 9px;background:#fff;color:#1f2a37}
  .td .local{background:#FEF3C7;color:#92400E;border-radius:10px;padding:7px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
  .td .notes{display:grid;gap:8px;margin-bottom:14px}
  .td .note{background:#EAF4F6;border-radius:10px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start}
  .td .note b{color:#0D365F}
  .td .sec{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#57606a;font-weight:700;margin:16px 0 6px}
  .td .list{border:1px solid #e4e1d8;border-radius:12px;background:#fff;overflow:hidden}
  .td .row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-top:1px solid #f0ede6}
  .td .row:first-child{border-top:0}
  .td .row input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:#1F7A8C;flex:none}
  .td .row .main{flex:1;min-width:0}
  .td .row .t{font-weight:600}
  .td .row.done .t{text-decoration:line-through;color:#8a978f}
  .td .row .how{color:#55677a;font-size:13px;margin-top:3px;white-space:pre-wrap}
  .td .row .meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
  .td .chip{font-size:11.5px;font-weight:600;border-radius:999px;padding:1px 9px;background:#f2f0e9;color:#55677a}
  .td .chip.late{background:#FEE2E2;color:#B91C1C}
  .td .chip.mine{background:#EEF6E3;color:#355C0D}
  .td .acts{display:flex;gap:6px;flex:none}
  .td .acts button{padding:3px 8px;font-size:12px}
  .td .empty{color:#57606a;padding:12px}
  .td .msg{font-size:13px;color:#14606F;margin:6px 0}
  .td .err{color:#B91C1C;font-size:13px;margin:6px 0}
  .td form{border:1px solid #c7dbee;background:#F5F9FC;border-radius:12px;padding:14px;display:grid;gap:10px;margin:12px 0}
  .td form label.l{font-weight:600;font-size:13px;color:#0D365F;display:grid;gap:4px}
  .td form .opts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px}
  .td form textarea{min-height:70px;resize:vertical}
  .td .sure{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:8px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}
  @media (max-width:560px){ .td .row{flex-wrap:wrap} .td .acts{width:100%;justify-content:flex-end} }`;

  function canEdit(it) {
    if (owner()) return true;
    const x = it.data || {};
    return x.when === 'once' && lc(x.by) === me();
  }
  function rowHtml(it, kind) {
    const x = it.data || {}, open = !!S.open[it.id];
    const box = kind === 'tonight' ? `<input type="checkbox" id="td_${esc(it.id)}" ${it.done ? 'checked' : ''} onchange="TD.tick(${enc(it.id)}, this.checked)" aria-label="Done: ${esc(x.t)}">` : '';
    const chips = [];
    if (it.late) chips.push(`<span class="chip late">Was due ${esc(shortDay(x.date))}</span>`);
    if (kind === 'later') chips.push(`<span class="chip">${esc(whenSay(x))}</span>`);
    else if (x.when === 'days' && (x.days || []).join() !== WORK.join()) chips.push(`<span class="chip">${esc(whenSay(x))}</span>`);
    if (lc(x.by) && lc(x.by) === lc(x.who)) chips.push('<span class="chip mine">Added by ' + (lc(x.who) === me() ? 'you' : esc(nameOf(x.who))) + '</span>');
    const how = x.how ? (open ? `<div class="how">${esc(x.how)}</div>` : '') : '';
    const acts = [];
    if (x.how) acts.push(`<button type="button" onclick="TD.toggle(${enc(it.id)})">${open ? 'Hide' : 'How'}</button>`);
    if (canEdit(it)) { acts.push(`<button type="button" onclick="TD.edit(${enc(it.id)})">Change</button>`); acts.push(`<button type="button" class="red" onclick="TD.remove(${enc(it.id)})">Remove</button>`); }
    const sure = S.confirm === it.id ? `<div class="sure">Remove "${esc(x.t)}" from the list for good? <button type="button" class="red" onclick="TD.remove(${enc(it.id)}, true)">Yes, remove</button><button type="button" onclick="TD.cancel()">Keep it</button></div>` : '';
    return `<div class="row${it.done ? ' done' : ''}">${box}<div class="main"><label class="t" for="td_${esc(it.id)}">${esc(x.t)}</label>${chips.length ? `<div class="meta">${chips.join('')}</div>` : ''}${how}${sure}</div><div class="acts">${acts.join('')}</div></div>`;
  }
  function formHtml() {
    const f = S.form; if (!f) return '';
    const isOwner = owner();
    const work = f.when === 'days' && f.days.slice().sort().join() === WORK.join();
    const pick = f.when === 'days' && !work;
    const radio = (v, l, on) => `<label><input type="radio" name="tdWhen" value="${v}" ${on ? 'checked' : ''} onchange="TD.formWhen(this.value)"> ${l}</label>`;
    return `<form onsubmit="event.preventDefault();TD.save()">
      <label class="l">What to do<input type="text" id="tdT" maxlength="160" value="${esc(f.t)}" placeholder="Call Harold back about the pay rate"></label>
      <label class="l">How (optional)<textarea id="tdHow" maxlength="1200" placeholder="Steps, links, what to say">${esc(f.how)}</textarea></label>
      <div class="l" style="font-weight:600;font-size:13px;color:#0D365F">When</div>
      <div class="opts">
        ${isOwner ? radio('work', 'Every work night (Mon to Fri)', work) + radio('days', 'On these days', pick) : ''}
        ${radio('once', 'One day', f.when === 'once')}
        ${isOwner ? radio('note', 'A note on top', f.when === 'note') : ''}
      </div>
      ${pick ? `<div class="opts">${DAY3.map((d, i) => `<label><input type="checkbox" name="tdDay" value="${i}" ${f.days.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div>` : ''}
      ${f.when === 'once' ? `<label class="l" style="max-width:220px">Day (Missouri)<input type="date" id="tdDate" value="${esc(f.date)}"></label>` : ''}
      ${f.err ? `<div class="err">${esc(f.err)}</div>` : ''}
      <div style="display:flex;gap:8px"><button type="submit" class="pri" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Saving…' : (f.id ? 'Save changes' : 'Add it')}</button><button type="button" onclick="TD.cancel()">Cancel</button></div>
    </form>`;
  }
  function paint() {
    const w = document.getElementById(S.target); if (!w) return;
    const d = S.data, isOwner = owner();
    const who = S.who || (d && d.who) || me();
    const mine = who === me();
    const title = mine ? 'My to-do' : nameOf(who) + "'s to-do";
    const picker = isOwner && d && (d.people || []).length ? `<label style="font-size:13px;color:#57606a">Whose list <select onchange="TD.setWho(this.value)">${d.people.map((p) => `<option value="${esc(p)}" ${p === who ? 'selected' : ''}>${esc(nameOf(p))}${p === me() ? ' (you)' : ''} · ${esc(p)}</option>`).join('')}</select></label>` : '';
    const day = S.day || (d && d.day) || moDay(), today = (d && d.today) || moDay();
    const dayName = day === today ? 'Tonight, ' + longDay(day) : longDay(day);
    const local = localLine();
    let body = '';
    if (S.err) body = `<div class="err">${esc(S.err)} <button type="button" onclick="TD.reload()">Try again</button></div>`;
    else if (!d) body = '<div class="empty">Loading the list…</div>';
    else {
      const notes = (d.notes || []).map((n) => `<div class="note"><div style="flex:1;min-width:0"><b>${esc(lc(n.data.by) === me() ? 'Your note' : 'From ' + nameOf(n.data.by))}:</b> ${esc(n.data.t)}${n.data.how ? `<div class="how" style="color:#55677a;font-size:13px;margin-top:3px">${esc(n.data.how)}</div>` : ''}</div>${isOwner ? `<div class="acts"><button type="button" onclick="TD.edit(${enc(n.id)})">Change</button><button type="button" class="red" onclick="TD.remove(${enc(n.id)}, true)">Clear</button></div>` : ''}</div>`).join('');
      const tonight = d.tonight || [], later = d.later || [];
      const doneN = tonight.filter((x) => x.done).length;
      body = (notes ? `<div class="notes">${notes}</div>` : '')
        + `<div class="sec">${esc(day === today ? 'Tonight' : 'This day')} · ${doneN} of ${tonight.length} done</div>`
        + `<div class="list">${tonight.length ? tonight.map((x) => rowHtml(x, 'tonight')).join('') : '<div class="empty">Nothing on the list for this day.</div>'}</div>`
        + (later.length ? `<div class="sec">Coming up</div><div class="list">${later.map((x) => rowHtml(x, 'later')).join('')}</div>` : '');
    }
    w.innerHTML = `<style>${CSS}</style><div class="td">
      <h2>${esc(title)}</h2>
      <p class="sub">${mine ? 'Check things off as you go. Days are Missouri days.' : 'What ' + esc(nameOf(who)) + ' sees. Add, change or remove anything; ' + esc(nameOf(who)) + ' checks things off.'}</p>
      <div class="bar"><span class="day">${esc(dayName)}</span>
        <button type="button" onclick="TD.shift(-1)" aria-label="Day before">‹</button>
        ${day !== today ? '<button type="button" onclick="TD.today()">Back to tonight</button>' : ''}
        <button type="button" onclick="TD.shift(1)" aria-label="Day after">›</button>
        <span style="flex:1"></span>${picker}
        ${S.form ? '' : `<button type="button" class="pri" onclick="TD.add()">+ Add</button>`}</div>
      ${local ? `<div class="local">${esc(local)}</div>` : ''}
      ${S.note ? `<div class="msg">${esc(S.note)}</div>` : ''}
      ${formHtml()}
      ${S.loading && d ? '<div class="msg">Refreshing…</div>' : ''}
      ${body}
    </div>`;
  }
  function render(target) {
    if (target) S.target = target;
    if (!S.who) S.who = me();
    paint();
    load();
  }

  window.TD = {
    render, boot, shown, label, _state: S,
    tick, remove, save,
    add() { openForm(''); },
    edit(id) { openForm(id); },
    cancel() { S.form = null; S.confirm = null; paint(); },
    toggle(id) { S.open[id] = !S.open[id]; paint(); },
    formWhen(v) { readForm(); const f = S.form; if (!f) return; if (v === 'work') { f.when = 'days'; f.days = WORK.slice(); } else if (v === 'days') { f.when = 'days'; if (f.days.slice().sort().join() === WORK.join()) f.days = []; } else f.when = v; paint(); },
    setWho(w) { S.who = lc(w); S.picked = true; S.form = null; S.data = null; load(); refreshNav(); },
    shift(n) { S.day = addDays(S.day || moDay(), n); S.form = null; load(); },
    today() { S.day = ''; S.data = null; load(); },
    reload() { load(); },
  };
})();
