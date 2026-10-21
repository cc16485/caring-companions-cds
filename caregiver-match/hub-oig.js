// CDS Hub · Attendants · Active Attendants · the OIG card (2026-10-21, Samantha: yes to "build the
// review screen and the OIG switch"). The OIG check runs itself (server function cds-oig); this card
// is where a person decides a possible match: "Not them" or "This is them". Software never decides.
// The confirm step is inside the card, not a pop-up (pop-ups can be blocked inside GoHighLevel).
// mountOigCard(el, { call }) where call(body) posts to cds-oig with the person's sign-in.
// No em dashes in anything a person reads.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const day = iso => { if (!iso) return ''; const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
  return MON[+d.toLocaleString('en-US', { month: 'numeric', timeZone: 'America/Chicago' }) - 1] + ' ' + d.toLocaleString('en-US', { day: 'numeric', timeZone: 'America/Chicago' }); };
export const born = iso => iso ? +iso.slice(5, 7) + '/' + +iso.slice(8, 10) + '/' + iso.slice(0, 4) : 'not given';
export const monthName = ym => ym ? MONTH[+ym.slice(5, 7) - 1] : '';
// The next monthly recheck: the 11th of this month if it is still ahead, else next month's.
export function nextRun(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const d = now.getDate() < 11 ? new Date(y, m, 11) : new Date(y, m + 1, 11);
  return MON[d.getMonth()] + ' ' + d.getDate();
}

const CSS = `
.oc{background:#fff;border:1px solid #dfe6ec;border-radius:14px;padding:16px;margin:0 0 14px;max-width:760px;color:#1d2a36}
.oc h3{margin:0;font-size:17px;color:#0D365F;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.oc .pill{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px}
.oc .g{background:#e7f5ee;color:#1f7a4d}.oc .y{background:#f6e7b8;color:#6b4e00}.oc .r{background:#fdecea;color:#b42318}
.oc p{margin:6px 0;font-size:14.5px}.oc .small{font-size:13px;color:#5b6977}
.oc .m{border:2px solid #f6e7b8;border-radius:12px;padding:12px;margin-top:12px}
.oc .m h4{margin:0 0 6px;font-size:16px;color:#0D365F}
.oc .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:560px){.oc .two{grid-template-columns:1fr}}
.oc .side{background:#f7f9fb;border-radius:10px;padding:10px;font-size:14px}
.oc .side b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5b6977;margin-bottom:4px}
.oc .side div{padding:1px 0}
.oc .why{font-weight:700}.oc .why.strong{color:#b42318}
.oc .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
.oc button{border:0;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer;font:inherit;font-size:14px;background:#0D365F;color:#fff}
.oc button.o{background:#fff;color:#0D365F;border:2px solid #dfe6ec}
.oc button.bad{background:#b42318}
.oc .ask{background:#f7f9fb;border-radius:10px;padding:10px;margin-top:10px;font-size:14.5px}
.oc .note{margin-top:8px;font-weight:700}.oc .note.ok{color:#1f7a4d}.oc .note.err{color:#b42318}
.oc a{color:#0f5f61}
`;

// The words on the card, from the cds-oig 'list' answer. Kept apart from the drawing so it is tested.
export function cardWords(d, now = new Date()) {
  const out = { title: 'OIG exclusion check', practice: !d.live, lines: [], bad: null, clear: null, people: [] };
  if (d.list) out.lines.push('Runs by itself. The ' + monthName(d.list.file_month) + ' OIG list is loaded (' + Number(d.list.people || 0).toLocaleString('en-US') + ' people, ' + day(d.list.loaded_at) + ').');
  else out.bad = 'The OIG list is not loaded yet. Check exclusions.oig.hhs.gov by hand until it is.';
  out.lines.push(d.last_recheck ? 'Everyone was last rechecked ' + day(d.last_recheck) + '. Next recheck ' + nextRun(now) + '.' : 'The first monthly recheck of everyone is ' + nextRun(now) + '.');
  if (!d.live) out.lines.push('Practice: results show here, but they do not count as anyone\'s OIG check yet and make no to-dos.');
  if (d.failed) out.bad = 'The OIG list did not download on ' + day(d.failed.at) + '. Last month\'s list is still in use. If this stays, check exclusions.oig.hhs.gov by hand.';
  if (!d.open.length) out.clear = 'No possible matches. Nobody to look at.';
  out.people = d.open.map(o => {
    const name = [o.person.first, o.person.middle, o.person.last].filter(Boolean).join(' ');
    return { id: o.id, name, title: name + ' may be on the OIG list',
      we: [['Name', name], ['Born', born(o.person.dob)], ['State', o.person.state || 'not given'],
           ['Checked', day(o.checked_at) + (o.source === 'recheck' ? ' (monthly recheck)' : ' (application)')]],
      them: o.matches.map(m => ({ why: m.why, strong: m.strength === 'strong', rows: [['Name', m.name], ['Born', born(m.dob)],
        ['Lives', [m.city, m.state].filter(Boolean).join(', ') || 'not given'], ['Job', m.specialty || 'not given'],
        ['Excluded since', m.excl_date ? born(m.excl_date) : 'not given']] })) };
  });
  return out;
}

export function mountOigCard(el, { call }) {
  if (!document.getElementById('oc_css')) { const s = document.createElement('style'); s.id = 'oc_css'; s.textContent = CSS; document.head.appendChild(s); }
  let data = null, ask = null, note = null;
  async function load() {
    try { data = await call({ action: 'list' }); }
    catch (e) { el.innerHTML = `<div class="oc"><h3>OIG exclusion check</h3><p class="note err">Could not load: ${esc(e.message)}</p><div class="btns"><button class="o" data-act="reload">Try again</button></div></div>`; return; }
    draw();
  }
  function draw() {
    const w = cardWords(data);
    const side = (label, rows) => `<div class="side"><b>${esc(label)}</b>${rows.map(([k, v]) => `<div><span class="small">${esc(k)}:</span> ${esc(v)}</div>`).join('')}</div>`;
    el.innerHTML = `<div class="oc">
      <h3>${esc(w.title)} ${w.practice ? '<span class="pill y">Practice</span>' : '<span class="pill g">On</span>'}${w.people.length ? `<span class="pill r">${w.people.length} to look at</span>` : ''}</h3>
      ${w.lines.map(l => `<p class="small">${esc(l)}</p>`).join('')}
      ${w.bad ? `<p class="note err">${esc(w.bad)}</p>` : ''}
      ${w.clear ? `<p class="note ok">${esc(w.clear)}</p>` : ''}
      ${note && !w.people.some(p => p.id === note.id) ? `<p class="note ${note.bad ? 'err' : 'ok'}">${esc(note.text)}</p>` : ''}
      ${w.people.map(p => `<div class="m"><h4>${esc(p.title)}</h4>
        <div class="two">${side('We checked', p.we)}<div>${p.them.map(t => `<p class="why ${t.strong ? 'strong' : ''}">${esc(t.why)}</p>${side(p.them.length > 1 ? 'On the OIG list (' + (p.them.indexOf(t) + 1) + ' of ' + p.them.length + ')' : 'On the OIG list', t.rows)}`).join('')}</div></div>
        ${ask && ask.id === p.id
          ? `<div class="ask">${ask.decision === 'is_them'
              ? 'Save that ' + esc(p.name) + ' IS the person on the OIG list? They cannot work CDS shifts.'
              : 'Save that ' + esc(p.name) + ' is NOT the person on the OIG list? Only if the birth date or other details are clearly different.'}
              <div class="btns"><button class="${ask.decision === 'is_them' ? 'bad' : ''}" data-yes="${esc(p.id)}">Yes, save</button><button class="o" data-act="cancel">Cancel</button></div></div>`
          : `<div class="btns"><button class="o" data-ask="not_them:${esc(p.id)}">Not them</button><button class="o" data-ask="is_them:${esc(p.id)}">This is them</button></div>`}
        ${note && note.id === p.id ? `<p class="note ${note.bad ? 'err' : 'ok'}">${esc(note.text)}</p>` : ''}
      </div>`).join('')}
      ${w.people.length ? `<p class="small">How to decide: compare the birth date, city and job. Not sure? Search their name at <a href="https://exclusions.oig.hhs.gov/" target="_blank" rel="noopener">exclusions.oig.hhs.gov</a>, which can also check a Social Security number.</p>` : ''}
    </div>`;
  }
  el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'reload') return load();
    if (b.dataset.act === 'cancel') { ask = null; return draw(); }
    if (b.dataset.ask) { const [decision, id] = b.dataset.ask.split(':'); ask = { id, decision }; note = null; return draw(); }
    if (b.dataset.yes) {
      const id = b.dataset.yes, decision = ask && ask.decision; b.disabled = true;
      try { const r = await call({ action: 'review', id, decision }); ask = null; note = { id, text: r.message }; await load(); }
      catch (x) { note = { id, text: 'Not saved: ' + x.message, bad: true }; ask = null; draw(); }
    }
  });
  const ready = load();
  return { ready, reload: load, data: () => data };
}
