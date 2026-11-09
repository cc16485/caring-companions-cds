// CDS Hub · Owners (2026-11-09, Samantha: put the monthly content scorecard "in the owners area on the CDS hub").
// window.CDSOwners. The Owners tab shows only for owners (LD_WHO_OWNERS, the same people as the switches). Its first card
// is "Did our content work this month?": Seen (views, not connected yet), Visited caringcds.com (site_events, the site's
// own cookie-free counter), Reached out (website forms, phone taps, new leads by how they heard about us, caregiver
// sign-ups), Became (said yes, first shift), this month so far next to last month. Counts only, never a person.
// Anything that cannot be read says so in red instead of showing a zero. No em dashes.
(function (root) {
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function channel(tag, host) {
    const t = String(tag || '').toLowerCase();
    if (t) {
      if (/(^|[-_])(yt|youtube)([-_]|$)/.test(t)) return 'youtube';
      if (/(^|[-_])(ig|instagram)([-_]|$)/.test(t)) return 'instagram';
      if (/(^|[-_])(fb|facebook)([-_]|$)/.test(t)) return 'facebook';
      if (/(^|[-_])(google|gbp)([-_]|$)/.test(t)) return 'google';
      if (/(^|[-_])(flyer|print)([-_]|$)/.test(t)) return 'print';
      if (/(^|[-_])(text|sms|email)([-_]|$)/.test(t)) return 'texts';
      if (/(^|[-_])(mo-care|caringcds|site)([-_]|$)/.test(t)) return 'our_sites';
      return 'tagged';
    }
    const h = String(host || '').toLowerCase();
    if (!h) return 'direct';
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h)) return 'facebook';
    if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
    if (/(^|\.)google\.[a-z.]+$/.test(h) || /googlequicksearchbox/.test(h)) return 'google';
    if (/(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(h)) return 'other_search';
    if (/(^|\.)(mo-care\.com|findcdscaregivers\.com)$/.test(h)) return 'our_sites';
    return 'other_site';
  }
  const CH = [['facebook', 'Facebook'], ['youtube', 'YouTube'], ['instagram', 'Instagram'], ['google', 'Google'], ['other_search', 'Bing, DuckDuckGo or Yahoo'],
    ['print', 'Flyers'], ['texts', 'Texts and emails'], ['our_sites', 'Our other websites'], ['tagged', 'Other tracked links'], ['direct', 'Typed the address, or an app'], ['other_site', 'Other websites']];

  // D = { ev, siteLeads, pool: {rows}|{error}, pipeline:[], consumers:[] }; f, t = Date. cameIn = CDSRules.cameInIso.
  function numbers(D, f, t, cameIn) {
    const inP = iso => { if (!iso) return false; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso); return d >= f && d < t; };
    const N = {};
    if (D.ev && !D.ev.error) {
      const vis = {}, by = {}, calls = {};
      D.ev.rows.forEach(r => { if (!inP(r.created_at)) return;
        if (r.event === 'page_view' && !vis[r.session_id]) { vis[r.session_id] = 1; const c = channel(r.from_tag, r.came_from); by[c] = (by[c] || 0) + 1; }
        if (r.event === 'call_click') calls[r.session_id] = 1; });
      N.visits = Object.keys(vis).length; N.visitsBy = by; N.calls = Object.keys(calls).length;
    }
    if (D.siteLeads && !D.siteLeads.error) N.forms = D.siteLeads.rows.filter(r => inP(r.submitted_at)).length;
    if (D.pool && !D.pool.error) {
      const p = D.pool.rows.filter(r => inP(r.submitted_at));
      N.pool = p.length; N.poolBy = {}; p.forEach(r => { const k = String(r.how_heard || '').trim() || 'Not asked'; N.poolBy[k] = (N.poolBy[k] || 0) + 1; });
    }
    const leads = (D.pipeline || []).filter(p => p && inP(cameIn ? cameIn(p) : (p.addedAt || p.firstContact)));
    N.leads = leads.length; N.leadsBy = {};
    leads.forEach(p => { const k = String(p.source || '').trim() || 'Not asked'; N.leadsBy[k] = (N.leadsBy[k] || 0) + 1; });
    N.yes = (D.pipeline || []).filter(p => p && inP(p.movedToConsumers)).length;
    N.started = (D.consumers || []).filter(c => c && c.starting && inP(c.starting.activeAt)).length;
    return N;
  }

  let D = null, busy = false;
  async function readAll(db, q) {
    let out = [];
    for (let i = 0; i < 60; i++) {
      const r = await q(db).range(i * 1000, i * 1000 + 999);
      if (r.error) throw new Error(r.error.message || 'could not read');
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < 1000) return out;
    }
    throw new Error('too many rows to count here');
  }
  const read = async (db, q) => { try { return { rows: await readAll(db, q) }; } catch (x) { return { error: (x && x.message) || 'error' }; } };

  async function load(from) {
    const db = typeof _db !== 'undefined' ? _db : null;
    if (!db) { const e = { error: 'not signed in' }; return { ev: e, siteLeads: e, pool: e }; }
    return {
      ev: await read(db, d => d.from('site_events').select('created_at, session_id, event, came_from, from_tag').gte('created_at', from).order('created_at')),
      siteLeads: await read(db, d => d.from('site_leads').select('submitted_at').eq('agency_id', 'caring-companions-cds').gte('submitted_at', from).order('submitted_at')),
      pool: await read(db, d => d.from('attendant_pool').select('submitted_at, how_heard').gte('submitted_at', from).order('submitted_at')),
    };
  }

  function isOwner() { return typeof ldWhoOwner === 'function' && ldWhoOwner(); }

  function html(D, now) {
    const mS = new Date(now.getFullYear(), now.getMonth(), 1), pS = new Date(now.getFullYear(), now.getMonth() - 1, 1), end = new Date(now.getTime() + 864e5);
    const cameIn = root.CDSRules && root.CDSRules.cameInIso;
    const A = numbers(D, mS, end, cameIn), B = numbers(D, pS, mS, cameIn);
    const mn = d => d.toLocaleDateString('en-US', { month: 'long' });
    const red = t => '<span style="color:#b42318;font-size:12px">' + t + '</span>';
    const num = (src, k) => src && D[src] && D[src].error ? red('could not read') : String(A[k] || 0);
    const was = (src, k) => src && D[src] && D[src].error ? '' : String(B[k] || 0);
    const td = 'padding:7px 8px;border-top:1px solid #e3e8ef';
    const row = (lab, a, b, note) => '<tr><td style="' + td + '">' + lab + (note ? '<div style="font-size:11px;color:#6b7785">' + note + '</div>' : '') + '</td><td style="' + td + ';text-align:right;font-weight:700">' + a + '</td><td style="' + td + ';text-align:right;font-weight:700">' + b + '</td></tr>';
    const step = t => '<tr><td colspan="3" style="padding:14px 8px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:#14304d">' + t + '</td></tr>';
    const sub = lab => '<span style="padding-left:14px;color:#55606e">' + esc(lab) + '</span>';
    const splitCh = (src, k) => { if (D[src] && D[src].error) return ''; let h = ''; CH.forEach(c => { const a = (A[k] || {})[c[0]] || 0, b = (B[k] || {})[c[0]] || 0; if (a || b) h += row(sub(c[1]), a, b); }); return h; };
    const splitText = (src, k) => { if (src && D[src] && D[src].error) return ''; const keys = Array.from(new Set(Object.keys(A[k] || {}).concat(Object.keys(B[k] || {}))));
      keys.sort((x, y) => (((A[k] || {})[y] || 0) - ((A[k] || {})[x] || 0)) || x.localeCompare(y));
      return keys.map(x => row(sub(x), (A[k] || {})[x] || 0, (B[k] || {})[x] || 0)).join(''); };
    let h = '<div class="card" style="padding:16px 18px"><div style="font-size:16px;font-weight:800;color:#14304d">Did our content work this month?</div>' +
      '<div style="font-size:12px;color:#6b7785;margin:2px 0 10px">Did the posts, ads and videos turn into families and caregivers? Counts only, never a person.</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:380px"><thead><tr style="color:#6b7785"><th></th><th style="text-align:right;padding:4px 8px">' + esc(mn(mS)) + ' so far</th><th style="text-align:right;padding:4px 8px">' + esc(mn(pS)) + '</th></tr></thead><tbody>' +
      step('1 Seen') + row('Facebook and YouTube views', '<span style="color:#6b7785;font-weight:500">not connected yet</span>', '', 'Views will show here once they are connected.') +
      step('2 Visited caringcds.com') + row('Visits', num('ev', 'visits'), was('ev', 'visits'), 'One visit = one browser tab, however many pages. Counting started when the counter went live. Where they came from:') + splitCh('ev', 'visitsBy') +
      step('3 Reached out') +
      row('Website forms filled in', num('siteLeads', 'forms'), was('siteLeads', 'forms')) +
      row('Phone number tapped on the website', num('ev', 'calls'), was('ev', 'calls'), 'They may or may not have finished the call.') +
      row('New leads (every way they reached us)', num(null, 'leads'), was(null, 'leads'), 'From Leads. By How Did They Hear About Us:') + splitText(null, 'leadsBy') +
      row('Caregiver sign-ups', num('pool', 'pool'), was('pool', 'pool'), 'From the caregiver list. By how they heard about us:') + splitText('pool', 'poolBy') +
      step('4 Became') +
      row('Said yes (moved to Starting)', num(null, 'yes'), was(null, 'yes')) +
      row('First shift (became active)', num(null, 'started'), was(null, 'started')) +
      '</tbody></table></div>';
    const errs = ['ev', 'siteLeads', 'pool'].filter(k => D[k] && D[k].error);
    if (errs.length) h += '<div style="color:#b42318;font-size:12px;margin-top:10px">Some numbers could not be read (' + esc(errs.map(k => D[k].error).join('; ')) + '), so they are not shown rather than guessed. Tell Claude. <button class="btn btn-sm" onclick="CDSOwners.refresh()">Try again</button></div>';
    h += '<div style="font-size:11px;color:#6b7785;margin-top:10px">The visit counter on caringcds.com uses no cookies. Tracked links for every place are on the Marketing tab.</div></div>';
    return h;
  }

  async function render() {
    const box = document.getElementById('ownersBody'); if (!box) return;
    if (!isOwner()) { box.innerHTML = '<div class="card" style="padding:16px">This tab is for the owners.</div>'; return; }
    const now = new Date();
    const pipeline = typeof getData === 'function' ? getData('pipeline') : [], consumers = typeof getData === 'function' ? getData('consumers') : [];
    if (!D) {
      box.innerHTML = html({ ev: { rows: [] }, siteLeads: { rows: [] }, pool: { rows: [] }, pipeline, consumers }, now).replace(/<td style="([^"]*)text-align:right;font-weight:700">0<\/td>/g, '<td style="$1text-align:right;color:#6b7785">counting</td>');
      if (busy) return; busy = true;
      const got = await load(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
      busy = false; D = got;
    }
    box.innerHTML = html(Object.assign({}, D, { pipeline, consumers }), now);
  }
  function refresh() { D = null; return render(); }
  const api = { render, refresh, numbers, channel, html, isOwner };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CDSOwners = api;
})(typeof window !== 'undefined' ? window : globalThis);
