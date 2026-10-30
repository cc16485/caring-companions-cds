// CDS new-lead alerts and the CDS morning email (2026-10-19, Samantha: "build it in
// practice mode"). The two server functions cds-lead-alert and cds-morning are thin
// wrappers around this file; the tests run it against a local Postgres copy.
//
// WHO HEARS: the office only (setting lead_alerts.recipients, morning_email.emails).
// Nothing here ever contacts a lead, a family or a caregiver.
//
// PRACTICE: while lead_alerts.live / morning_email.live are false, every message is
// written to cds_outbox with status 'practice' and nothing is sent. Live: 'sent' or
// 'failed', and a failed lead alert is written onto the lead (site_leads.alert_failed)
// so the Dashboard shows it in red. Nothing fails silently (her rule).
//
// TEXT HOURS: weekdays 9am to 4pm Central, CDS office hours (her call 2026-10-19) (settings text_days, text_from, text_until).
// Emails go any hour; a lead outside text hours gets its text when they open.
// REMINDER: one more text when nobody has called after 30 minutes of text hours.
// "Called" = the lead's status in Leads moved off New, or somebody added a note.
//
// No em dashes in anything a person reads (her rule).
import './cds-rules.js';
import './wellsky.js';
import './cds-attendant-check.js';
import { maskPhone, maskEmail } from '../match/rules.js';
const R = globalThis.CDSRules;

export const AGENCY_ID = 'caring-companions-cds';
export const HUB = 'https://hub.caringcds.com/';
// Each text and email carries a private link to that one lead for that one person
// (the lead link page, 2026-10-19). Only a fingerprint of it is stored; 7 days.
export const LINK = 'hub.caringcds.com/lead/?k=';
export const LINK_DAYS = 7;
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => B62[x % 62]).join('');   // 16 characters, about 95 bits
}
export async function tokenHash(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t)));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}
const TZ = 'America/Chicago';
const noDash = s => String(s ?? '').replace(/\s*[—―–]\s*/g, ', ');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Central time ----------
export function chi(ms) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, dow, wk: p.weekday,
           date: p.year + '-' + p.month + '-' + p.day };
}
export function inTextHours(ms, cfg) {
  const c = chi(ms);
  return (cfg.text_days || [1, 2, 3, 4, 5]).includes(c.dow) && c.h >= (cfg.text_from ?? 9) && c.h < (cfg.text_until ?? 16);
}
// Minutes of text hours between two moments (a lead that came in at 7pm Friday
// has had 0 minutes of them until 9am Monday).
export function textMinutesBetween(fromMs, toMs, cfg) {
  let n = 0;
  const start = Math.ceil(fromMs / 60000) * 60000;
  const stop = Math.min(toMs, fromMs + 10 * 864e5);
  for (let t = start; t < stop; t += 60000) if (inTextHours(t, cfg)) n++;
  return n;
}
// "2:14pm" and "2:14pm Sun"
export function time12(ms) {
  const c = chi(ms); const h = c.h % 12 || 12;
  return h + ':' + String(c.min).padStart(2, '0') + (c.h < 12 ? 'am' : 'pm');
}
// Within the last 6 days "7:12pm Fri", older "Sep 29".
export const whenShort = (ms, nowMs) => (nowMs && nowMs - ms > 6 * 864e5)
  ? new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })
  : time12(ms) + ' ' + chi(ms).wk;
export function dayLong(ms) {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- the words ----------
const countyOf = r => { const c = String((r && typeof r === 'object' ? r.county : r) || '').trim(); return !c ? '' : /county/i.test(c) ? c : c + ' County'; };
const fromWhere = r => String(r.source || '').trim() || 'the website';
// The phone number is left out of the texts on purpose: the link page has it, and
// nobody should call a lead from their own cell by habit (her call 2026-10-19).
export function leadText(r, nowMs, link) {
  const name = R.siteLeadName(r), county = countyOf(r);
  const late = nowMs && r.submitted_at && (nowMs - Date.parse(r.submitted_at)) > 60 * 60000;
  return noDash('New CDS lead: ' + name + (county ? ', ' + county : '') + '.' +
    (late ? ' Came in ' + whenShort(Date.parse(r.submitted_at)) + '.' : '')) +
    ' Tap to see what they wrote and call: ' + (link || 'hub.caringcds.com/#pipeline');
}
export function reminderText(r, nowMs, link) {
  const at = Date.parse(r.submitted_at);
  const ago = (nowMs - at) < 90 * 60000 ? Math.round((nowMs - at) / 60000) + ' minutes ago' : 'at ' + whenShort(at);
  return noDash('Still waiting: ' + R.siteLeadName(r) + ' (CDS lead) came in ' + ago + ' and nobody has called yet.') +
    ' Tap to call: ' + (link || 'hub.caringcds.com/#pipeline');
}
// A voicemail that sounds like a new lead (2026-10-29, her approved wording). No name, number or
// details: the private link has them.
export function voicemailText(atMs, nowMs, link) {
  const sameDay = chi(atMs).date === chi(nowMs).date;
  return 'New CDS lead left a voicemail at ' + (sameDay ? time12(atMs) : whenShort(atMs, nowMs)) + '. Open to hear it and call back: ' + (link || 'hub.caringcds.com/#followups');
}
export function leadEmail(r, link) {
  const name = R.siteLeadName(r), county = countyOf(r);
  const at = Date.parse(r.submitted_at);
  const subject = noDash('New CDS lead: ' + name + (county ? ', ' + county : '')).slice(0, 180);
  const rows = [
    ['Name', name], ['Phone', r.phone || 'not given'], ['Email', r.email || 'not given'], ['County', county || 'not given'],
    ['Who needs care', r.who_needs_care || 'not given'], ['Has Medicaid', r.has_medicaid || 'not given'],
    ['They said', r.message || 'nothing written'], ['Came in', isNaN(at) ? 'just now' : dayLong(at) + ', ' + time12(at)],
  ];
  const intro = 'A new lead just came in from ' + fromWhere(r) + '.';
  const foot = 'Sent to the CDS office only. Nothing was sent to the family.';
  const page = link ? 'https://' + link : HUB + '#pipeline';
  const text = [intro, '', ...rows.map(([k, v]) => k + ': ' + noDash(v)), '',
    (link ? 'See what they wrote, log the call and start the intake questions: ' : 'Open Leads in the CDS hub: ') + page, '', foot].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2a36">` +
    `<p>${esc(intro)}</p><table style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#57606a;vertical-align:top">${esc(k)}</td><td style="padding:3px 0"><b>${esc(noDash(v))}</b></td></tr>`).join('') +
    `</table><p><a href="${esc(page)}" style="background:#0D365F;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${link ? 'Open this lead' : 'Open Leads in the CDS hub'}</a></p>` +
    (link ? `<p style="color:#57606a;font-size:13px">See what they wrote, log the call and start the intake questions. This link is just for you and works for 7 days.</p>` : '') +
    `<p style="color:#57606a">${esc(foot)}</p></div>`;
  return { subject, text, html };
}

const monthDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// steps from CDSRules.dailyRoutine; extra = { evv, signups, heldFailed, alertFailures: [{name, why}],
//   systemItems?, staleNote? }. systemItems = problems with the WellSky check itself (wellsky.js
//   system: true); only the owner's copy carries them (her ask 2026-10-22: Zach cannot fix them).
//   staleNote = the one grey line everyone else gets instead, like Today in the hub.
export function morningEmail(steps, extra, nowMs) {
  const also = [
    extra.alertFailures?.length && { t: extra.alertFailures.length + ' new lead alert' + (extra.alertFailures.length !== 1 ? 's' : '') + ' did not send', go: 'pipeline', bad: true,
                                     people: extra.alertFailures.map(f => ({ name: f.name, why: f.why })) },
    extra.ghlFailures?.length && { t: extra.ghlFailures.length + ' lead' + (extra.ghlFailures.length !== 1 ? 's' : '') + ' could not be added to GoHighLevel', go: 'pipeline', bad: true,
                                   people: extra.ghlFailures.map(f => ({ name: f.name, why: f.why })) },
    extra.voicemails && { t: extra.voicemails + ' voicemail' + (extra.voicemails !== 1 ? 's' : '') + ' could not be read or its text did not send. Listen to ' + (extra.voicemails !== 1 ? 'them' : 'it'), go: 'followups', bad: true },
    ...(extra.attendantItems || []),   // the daily attendant check against WellSky, once live (2026-10-20)
    extra.evv        && { t: extra.evv + ' EVV correction form' + (extra.evv !== 1 ? 's' : '') + ' to review', go: 'evvcorrections' },
    extra.signups    && { t: extra.signups + ' caregiver sign-up' + (extra.signups !== 1 ? 's' : '') + ' to call', go: 'caregivermatch' },
    extra.heldFailed && { t: extra.heldFailed + ' message' + (extra.heldFailed !== 1 ? 's' : '') + ' held or failed', go: 'caregivermatch', bad: true },
  ].filter(Boolean);
  const sys = extra.systemItems || [];
  // The owner of each part (build step 5, 2026-10-23), by first name, as on Today.
  const ownerName = e => { const p = (extra.people || []).find(x => String(x.email || '').toLowerCase() === e); return p && p.name ? p.name : e ? e.split('@')[0].replace(/^./, c => c.toUpperCase()) : ''; };
  const all = (sys.length ? [{ n: '', title: 'For you, Samantha (the team does not see this)', items: sys, clear: '' }] : [])
    .concat(steps.map(s => ({ n: s.n + '.', title: s.title + (s.owner ? ' (' + ownerName(s.owner) + ')' : ''), items: s.items, clear: 'Nothing waiting here.' })))
    .concat([{ n: '', title: 'Also waiting', items: also, clear: 'Nothing waiting here.' }]);
  const count = all.reduce((t, s) => t + s.items.length, 0);
  const subject = 'CDS morning, ' + dayLong(nowMs) + ': ' + (count ? count + ' thing' + (count !== 1 ? 's' : '') + ' waiting' : 'nothing waiting');
  const intro = count ? 'Good morning. Here is what is waiting in the CDS hub today.' : 'Good morning. Nothing is waiting in the CDS hub today.';
  const foot = 'Sent to Samantha and Krystal every weekday at 8am. Nothing here goes to families.';
  // p.due (names on Today, 2026-10-22): the date goes after the reason, like the pill in the hub.
  const dueTxt = p => !p.due ? '' : (p.due < new Date(nowMs).toISOString().slice(0, 10) ? ', late, was due ' : ', due ') + monthDay(p.due);
  const who = p => p.name + (p.why ? ' (' + p.why + dueTxt(p) + ')' : (p.county ? ', ' + countyOf(p.county) : '') + (p.at && !isNaN(Date.parse(p.at)) ? ', came in ' + whenShort(Date.parse(p.at), nowMs) : '') + dueTxt(p));
  const textLines = [intro, ''].concat(extra.staleNote ? [extra.staleNote, ''] : []);
  all.forEach(s => {
    textLines.push((s.n ? s.n + ' ' : '') + s.title);
    if (!s.items.length) textLines.push('   ' + s.clear);
    s.items.forEach(i => {
      textLines.push('   ' + i.t + ' (' + HUB + '#' + i.go + ')');
      (i.people || []).forEach(p => textLines.push('      ' + noDash(who(p))));
    });
    textLines.push('');
  });
  textLines.push(foot);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2a36">` +
    `<p>${esc(intro)}</p>` + (extra.staleNote ? `<p style="color:#57606a;font-size:13px">${esc(extra.staleNote)}</p>` : '') +
    all.map(s => `<p style="margin:16px 0 4px"><b>${esc((s.n ? s.n + ' ' : '') + s.title)}</b></p>` +
      (s.items.length
        ? `<ul style="margin:0;padding-left:20px">` + s.items.map(i =>
            `<li style="margin:2px 0;color:${i.bad ? '#b42318' : '#1f2a36'}">${esc(i.t)} <a href="${HUB}#${i.go}" style="color:#0D365F">open</a>` +
            ((i.people || []).length ? `<ul style="margin:2px 0;padding-left:18px;color:#1f2a36">` + i.people.map(p => `<li>${esc(noDash(who(p)))}</li>`).join('') + `</ul>` : '') +
            `</li>`).join('') + `</ul>`
        : `<p style="margin:0;color:#57606a">${esc(s.clear)}</p>`)).join('') +
    `<p style="margin-top:20px"><a href="${HUB}" style="background:#0D365F;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Open the CDS hub</a></p>` +
    `<p style="color:#57606a">${esc(foot)}</p></div>`;
  return { subject: noDash(subject), text: noDash(textLines.join('\n')), html, count };
}

// ---------- the jobs ----------
// deps: { db: { query(text, params) -> { rows } }, send({ channel, to, subject, text, html }), now?: () => ms }
export function createLeadAlerts(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const setting = async (k, d) => { const r = await one('select value from cds_match_settings where key=$1', [k]); return r ? r.value : d; };
  async function store(keys) {
    const rows = await q('select data_key, data_value from agency_data where agency_id=$1 and data_key = any($2)', [AGENCY_ID, keys]);
    const o = {}; rows.forEach(r => { o[r.data_key] = r.data_value; }); return o;
  }

  // One message: practice, sent or failed, always recorded.
  async function deliver({ live, lead, channel, to, toName, template, subject, text, html }) {
    let status, error = null;
    if (!to) { status = live ? 'failed' : 'practice'; error = 'No ' + (channel === 'sms' ? 'phone' : 'email') + ' on file for ' + toName + (live ? '' : ' yet'); }
    else if (!live) status = 'practice';
    else {
      try { await deps.send({ channel, to, subject, text, html }); status = 'sent'; }
      catch (e) { status = 'failed'; error = String((e && e.message) || e).slice(0, 300); }
    }
    await q(`insert into cds_outbox (audience, site_lead_id, channel, template, to_display, body, status, error, automatic, created_by)
             values ('office',$1,$2,$3,$4,$5,$6,$7,true,$8)`,
      [lead ? lead.id : null, channel, template, to ? (channel === 'sms' ? maskPhone(to) : maskEmail(to)) : toName,
       (subject ? subject + '\n\n' : '') + text, status, error, template === 'morning_email' ? 'cds-morning' : 'cds-lead-alert']);
    return { status, error, toName, channel };
  }
  async function noteFailures(lead, results) {
    const bad = results.filter(r => r.status === 'failed');
    if (!bad.length) return;
    const why = bad.map(r => (r.channel === 'sms' ? 'text' : 'email') + ' to ' + r.toName + (r.error ? ' (' + r.error + ')' : '')).join('; ');
    await q('update site_leads set alert_failed = left(coalesce(alert_failed || \'; \', \'\') || $2, 1000) where id=$1', [lead.id, 'Did not send: ' + why]);
  }
  // A private link for this person to this lead (practice too, so the words are real).
  async function linkFor(lead, p) {
    if (!p || !p.email) return null;
    const t = newToken();
    await q(`insert into cds_lead_links (token_hash, site_lead_id, person_name, person_email, expires_at)
             values ($1,$2,$3,$4,$5)`, [await tokenHash(t), lead.id, p.name || p.email, String(p.email).toLowerCase(),
             new Date(now() + LINK_DAYS * 864e5).toISOString()]);
    return LINK + t;
  }
  // The same private link for a voicemail (cds_lead_links.comm_id).
  async function voicemailLinkFor(commId, p) {
    if (!p || !p.email) return null;
    const t = newToken();
    await q(`insert into cds_lead_links (token_hash, comm_id, person_name, person_email, expires_at)
             values ($1,$2,$3,$4,$5)`, [await tokenHash(t), commId, p.name || p.email, String(p.email).toLowerCase(),
             new Date(now() + LINK_DAYS * 864e5).toISOString()]);
    return LINK + t;
  }
  const callsFor = async ids => ids.length ? q('select site_lead_id, outcome, at from cds_lead_calls where site_lead_id = any($1)', [ids]) : [];
  // Calls and texts read from GoHighLevel by the Communication Center (cds_comms, 2026-10-22). Her
  // point: a lead somebody already called, or texted, or who called in and was answered, is not
  // waiting, even if nobody tapped anything. After the lead came in, any call we made counts,
  // answered or not, and any text we sent. And (her case, same day) a family who called first and
  // talked to us, then became a lead, is not waiting either: an answered call in the 24 hours
  // BEFORE the lead came in counts too. Older calls do not. Read only; if that table is not
  // there yet, nothing changes.
  async function commsCallsFor(leads) {
    const byPhone = new Map();
    for (const l of leads) { const p = String(l.phone || '').replace(/\D/g, '').slice(-10); if (p.length === 10) byPhone.set(l.id, p); }
    if (!byPhone.size) return [];
    let rows;
    try {
      rows = await q(`select phone10, at, channel, direction, answered from cds_comms where phone10 = any($1)
                      and (direction='outbound' or (channel='call' and answered))`, [[...new Set(byPhone.values())]]);
    } catch (e) { return []; }
    const out = [];
    for (const l of leads) {
      const p = byPhone.get(l.id); if (!p) continue;
      const came = Date.parse(l.submitted_at || 0);
      const hit = rows.filter(r => r.phone10 === p).map(r => ({ t: Date.parse(r.at), talk: r.channel === 'call' && r.answered }))
        .filter(r => r.t >= came || (r.talk && r.t >= came - 864e5)).sort((x, y) => y.t - x.t)[0];
      if (hit) out.push({ site_lead_id: l.id, outcome: 'gohighlevel', at: new Date(hit.t).toISOString() });
    }
    return out;
  }
  const claim = (col, id) => one(`update site_leads set ${col} = $2 where id=$1 and ${col} is null returning id`, [id, new Date(now()).toISOString()]);

  async function texts(cfg, lead, template, words) {
    const out = [];
    for (const p of cfg.recipients || []) out.push(await deliver({ live: !!cfg.live, lead, channel: 'sms', to: p.phone, toName: p.name, template, text: words(await linkFor(lead, p)) }));
    return out;
  }

  // Voicemails the call notes marked as a new lead (comms.js, 2026-10-29): one text each to the people in
  // voicemail_leads.emails, in text hours, unless someone already called or texted them back. Practice
  // until voicemail_leads.live. Phones come from lead_alerts.recipients (the repo never holds them).
  async function voicemailLeads(cfg, t) {
    const vs = await setting('voicemail_leads', null);
    if (!vs) return { voicemailTexted: 0 };
    if (!inTextHours(t, cfg)) return { voicemailTexted: 0, voicemailWaitingForHours: true };
    const emails = (Array.isArray(vs.emails) ? vs.emails : []).map(e => String(e).toLowerCase());
    const people = emails.map(e => (cfg.recipients || []).find(p => String(p.email || '').toLowerCase() === e) || { email: e, name: e.split('@')[0].replace(/^./, c => c.toUpperCase()) });
    let todo;
    try {
      todo = await q(`select n.comm_id, c.at, c.phone10 from cds_call_notes n join cds_comms c on c.id = n.comm_id
        where n.voicemail and n.new_lead and n.lead_texted_at is null and c.at > $1 order by c.at`, [new Date(t - 3 * 864e5).toISOString()]);
    } catch (e) { return { voicemailTexted: 0, voicemailError: 'run voicemail_leads.sql first' }; }
    let texted = 0, skipped = 0;
    for (const v of todo) {
      const back = v.phone10 ? await one(`select 1 from cds_comms where phone10=$1 and at > $2 and (direction='outbound' or (channel='call' and answered)) limit 1`, [v.phone10, v.at]) : null;
      const mine = await one(`update cds_call_notes set lead_texted_at=$2, lead_text_skipped=$3 where comm_id=$1 and lead_texted_at is null returning comm_id`,
        [v.comm_id, new Date(t).toISOString(), back ? 'called back before the text' : null]);
      if (!mine) continue;
      if (back) { skipped++; continue; }
      const results = [];
      for (const p of people) {
        try {
          results.push(await deliver({ live: vs.live === true, lead: null, channel: 'sms', to: p.phone, toName: p.name, template: 'voicemail_lead_text',
            text: voicemailText(Date.parse(v.at), t, await voicemailLinkFor(v.comm_id, p)) }));
        } catch (e) { results.push({ status: 'failed', toName: p.name, error: String((e && e.message) || e).slice(0, 200) }); }
      }
      const bad = results.filter(r => r.status === 'failed');
      if (bad.length) await q(`update cds_call_notes set lead_alert_failed = left($2, 1000) where comm_id=$1`,
        [v.comm_id, bad.map(r => 'text to ' + r.toName + (r.error ? ' (' + r.error + ')' : '')).join('; ')]);
      texted++;
    }
    return { voicemailTexted: texted, voicemailCalledBack: skipped, voicemailLive: vs.live === true };
  }

  // Every 2 minutes.
  async function run() {
    const cfg = await setting('lead_alerts', null);
    if (!cfg) return { ok: false, error: 'lead_alerts is not set up' };
    const t = now(), live = !!cfg.live, open = inTextHours(t, cfg);
    let vm;
    try { vm = await voicemailLeads(cfg, t); } catch (e) { vm = { voicemailError: String((e && e.message) || e).slice(0, 300) }; }
    const since = new Date(Math.max(t - 5 * 864e5, Date.parse(cfg.started_at || 0) || 0)).toISOString();
    const leads = await q(`select * from site_leads where agency_id=$1 and not coalesce(archived,false) and submitted_at >= $2 order by submitted_at`, [AGENCY_ID, since]);
    if (!leads.length) return { ok: true, live, leads: 0, emailed: 0, texted: 0, reminded: 0, ...vm };
    const pipeline = ((await store(['pipeline'])).pipeline) || [];
    const calls = (await callsFor(leads.map(l => l.id))).concat(await commsCallsFor(leads));
    const sum = { ok: true, live, leads: leads.length, emailed: 0, texted: 0, reminded: 0, ...vm };
    for (const lead of leads) {
      const waiting = R.siteLeadWaiting(lead, pipeline, calls);
      const results = [];
      if (!lead.alert_at) {
        if (!(await claim('alert_at', lead.id))) continue;
        for (const p of cfg.recipients || []) results.push(await deliver({ live, lead, channel: 'email', to: p.email, toName: p.name, template: 'lead_alert_email', ...leadEmail(lead, await linkFor(lead, p)) }));
        sum.emailed++;
        if (open && (await claim('alert_texted_at', lead.id))) { results.push(...await texts(cfg, lead, 'lead_alert_text', l => leadText(lead, t, l))); sum.texted++; }
      } else if (!lead.alert_texted_at && open) {
        if (!(await claim('alert_texted_at', lead.id))) continue;
        if (waiting) { results.push(...await texts(cfg, lead, 'lead_alert_text', l => leadText(lead, t, l))); sum.texted++; }
      } else if (lead.alert_texted_at && !lead.reminder_at && open
                 && textMinutesBetween(Date.parse(lead.submitted_at), t, cfg) >= (cfg.reminder_minutes || 30)) {
        if (!(await claim('reminder_at', lead.id))) continue;
        if (waiting) { results.push(...await texts(cfg, lead, 'lead_reminder_text', l => reminderText(lead, t, l))); sum.reminded++; }
      }
      await noteFailures(lead, results);
    }
    return sum;
  }

  // Weekdays at 8am Central (two schedules cover summer and winter time; the
  // first to find it is 8am sends, the date mark stops a second one).
  async function morning({ force = false } = {}) {
    const cfg = await setting('morning_email', null);
    if (!cfg) return { ok: false, error: 'morning_email is not set up' };
    const t = now(), c = chi(t);
    if (!force && (c.dow > 5 || c.h !== (cfg.hour ?? 8))) return { ok: true, skipped: 'not 8am on a weekday in Central time' };
    const mine = await one(`update cds_match_settings set value = jsonb_set(value, '{last_sent}', to_jsonb($1::text)), updated_at = now()
                            where key='morning_email' and coalesce(value->>'last_sent','') <> $1 returning key`, [c.date]);
    if (!mine && !force) return { ok: true, skipped: 'already sent today' };
    const s = await store(['consumers', 'pipeline', 'authorizations', 'attendantWages']);
    const siteLeads = await q('select * from site_leads where agency_id=$1 and not coalesce(archived,false)', [AGENCY_ID]);
    const calls = (await callsFor(siteLeads.map(r => r.id))).concat(await commsCallsFor(siteLeads));
    // Communication Center (2026-10-22): once live, its follow-ups join step 4. (Website leads the office
    // already called or texted count as called above, live or not: commsCallsFor.)
    const comm = await setting('comm_center', null);
    let followups;
    if (comm && comm.live === true) {
      // Step 2: care or safety first, whose it is, and a card moved to a later day waits for that day.
      const people = Array.isArray(comm.people) ? comm.people : [];
      const nameOf = e => { const p = people.find(x => String(x.email || '').toLowerCase() === String(e || '').toLowerCase()); return p ? p.name : (e ? String(e).split('@')[0].replace(/^./, x => x.toUpperCase()) : ''); };
      followups = (await q(`select title as name, due_at as since, urgent, owner, later_until::text as later from cds_tasks where area='followup' and done_at is null order by urgent desc, due_at`))
        .map(f => ({ name: f.name, since: f.since, urgent: !!f.urgent, owner: nameOf(f.owner), later: f.later || null }));
    }
    // Central noon today, read in the server's own (UTC) clock, so "today" is Missouri's today.
    const noon = new Date(Date.UTC(c.y, c.m - 1, c.d, 12));
    // The daily WellSky check joins the email only once it is live (setting wellsky_check.live).
    const wcfg = await setting('wellsky_check', null);
    const W = globalThis.CDSWellSky;
    const ws = wcfg && wcfg.live === true ? await store(['wellskyCheck', 'wellskyReviewed', 'firstShifts', 'cdsGoal']) : {};
    const wsAll = wcfg && wcfg.live === true
      ? W.items(Object.assign({}, ws.wellskyCheck || { lastRun: { ok: false, why: 'never ran' } }, { live: true }), ws.wellskyReviewed || {}, noon)
      : [];
    // 2026-10-22 (her ask, for Zach): problems with the WellSky check itself go to the owners only,
    // and the email counts active consumers the same way as Today (CDSRules.activeNow).
    const systemItems = wsAll.filter(i => i.system), wellskyItems = wsAll.filter(i => !i.system);
    const staleSince = (systemItems.find(i => i.since) || {}).since;
    const staleNote = systemItems.length ? (staleSince ? 'WellSky numbers in this email are from ' + monthDay(staleSince) + '.' : 'WellSky numbers in this email may be out of date.') +
      ' Samantha has been told and is fixing the WellSky check.' : '';
    const sh = (ws.wellskyCheck || {}).shifts;
    const pulledOn = sh && sh.at ? W.isoLocal(new Date(sh.at)) : '';
    const cn = sh ? W.consumersNow(sh, pulledOn, ws.firstShifts || {}, s.consumers || [], ws.cdsGoal || {}) : null;
    const wsPeople = cn ? cn.people.concat(cn.leftOut) : null;
    // 2026-10-23 (her rule: the email and Today never disagree): the same WellSky inputs Today uses.
    // No worked shift in 30+ days (Chrome pull or the emailed First and Last Carelog, freshest wins),
    // and an Active WellSky authorization is "upload the new care plan", not "expired". Both only read
    // wellskyCheck, so they apply whether or not the daily check's own lines are live.
    const wsc = ws.wellskyCheck || (await store(['wellskyCheck'])).wellskyCheck || {};
    const wscOn = wsc.shifts && wsc.shifts.at ? W.isoLocal(new Date(wsc.shifts.at)) : '';
    const noShift = W.noShifts(wsc.shifts, wscOn, s.consumers || [], 0, wsc.analytics && wsc.analytics.firstLast);
    const wsAuths = W.wsActiveAuths(wsc, noon);
    const wsAuth = name => wsAuths[W.nameKey(name)] || null;
    // Attendants (2026-10-22, same rule as Today): office to-dos for new attendants and OIG matches
    // from cds_tasks, rechecks from the Roster, the automatic OIG clears once the OIG check is live.
    // The hub also lists applications waiting on the office with no to-do yet; the email cannot.
    const attendantWork = { tasks: [], roster: [], autoOig: {} };
    try {
      attendantWork.tasks = await q(`select t.id, t.kind, t.title, t.due_at, t.pool_id, p.first_name as caregiver from cds_tasks t
        left join attendant_pool p on p.id = t.pool_id where t.done_at is null and coalesce(t.area, 'match') = 'match'
        and (t.kind like 'packet\\_%' or t.kind = 'oig_check')`);
      attendantWork.roster = ((await store(['attendants'])).attendants || []).filter(a => a && a.status !== 'inactive');
      const ocfg = await setting('oig_check', null);
      if (ocfg && ocfg.live === true) {
        for (const r of await q(`select distinct on (person_ref) person_ref, result, review, checked_at from cds_oig_results
                                  where person_ref like 'attendant:%' order by person_ref, checked_at desc`))
          if (r.result === 'clear' || r.review === 'not_them')
            attendantWork.autoOig[r.person_ref.slice(10)] = new Date(r.checked_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      }
    } catch (e) { attendantWork.error = String((e && e.message) || e).slice(0, 200); }
    // Approved due dates (2026-10-23), same as Today: reports and tax filings, EVV forms, payroll uploads.
    const due = await store(['quarterStatus', 'evvCorrections', 'payrollTotals']);
    let evvSubs = [];
    try { evvSubs = await q(`select consumer, attendant, visitdate::text as visitdate, sig_attendant is not null and sig_attendant <> '' as sig_attendant,
                                    sig_consumer is not null and sig_consumer <> '' as sig_consumer, processed from evv_submissions
                             where agency_id = $1 and not coalesce(processed, false)`, [AGENCY_ID]); }
    catch (e) { evvSubs = [{ consumer: 'EVV forms sent in online could not be read: ' + String((e && e.message) || e).slice(0, 120), sig_attendant: true, sig_consumer: true }]; }
    const steps = R.dailyRoutine({ consumers: s.consumers || [], pipeline: s.pipeline || [], authorizations: s.authorizations || {},
                                   attendantWages: s.attendantWages || {}, siteLeads, calls, wellskyItems, followups,
                                   wsPeople, nameKey: W.nameKey, attendantWork, noShift, wsAuth,
                                   quarterStatus: due.quarterStatus || {},
                                   evv: { corrections: Array.isArray(due.evvCorrections) ? due.evvCorrections : [], submissions: evvSubs },
                                   payroll: { runs: (due.payrollTotals || {}).runs || [], registers: (s.attendantWages || {}).registers || [] },
                                   ...(await (async () => { const o = await store(['todayOwners', 'complianceChecks', 'agencyDates']);
                                     return { owners: (o.todayOwners || {}).owners || {}, checks: o.complianceChecks || {}, agencyDates: o.agencyDates || {} }; })()) }, noon);
    const pipeline = s.pipeline || [];
    // The attendant check against WellSky joins the email only once setting attendant_check.live is true.
    const acfg = await setting('attendant_check', null);
    let attendantItems = [];
    if (acfg && acfg.live === true) {
      const ac = await store(['attendants', 'wellskyCheck', 'attendantCheckReviewed']);
      attendantItems = globalThis.CDSAttendantCheck.items(globalThis.CDSAttendantCheck.compare({ attendants: ac.attendants || [],
        shifts: (ac.wellskyCheck || {}).shifts, reviewed: ac.attendantCheckReviewed || {}, now: noon }));
    }
    const extra = {
      people: comm && Array.isArray(comm.people) ? comm.people : [],
      attendantItems,
      evv: (await one(`select count(*)::int n from evv_submissions where agency_id=$1 and not coalesce(processed,false)`, [AGENCY_ID])).n,
      signups: (await one(`select count(*)::int n from cds_tasks where kind='cg_signup' and done_at is null`)).n,
      // Same rule as the red line on Today (comms.js voicemailProblems).
      voicemails: await one(`select count(*)::int n from cds_call_notes n join cds_comms c on c.id = n.comm_id
        where n.voicemail and c.at > now() - interval '7 days' and (n.status = 'no_transcript' or (n.status = 'failed' and n.attempts >= 3) or n.lead_alert_failed is not null)
          and (c.phone10 is null or exists (select 1 from cds_tasks t where t.area='followup' and t.done_at is null and t.phone10 = c.phone10))`).then(r => r.n, () => 0),
      heldFailed: (await one(`select count(*)::int n from cds_outbox where status in ('held','failed') and created_at > now() - interval '1 day'`)).n,
      alertFailures: siteLeads.filter(r => r.alert_failed && R.siteLeadWaiting(r, pipeline, calls)).map(r => ({ name: R.siteLeadName(r), why: r.alert_failed })),
      // website leads that could not be added to GoHighLevel (lead-ghl.js), once it is trying
      ghlFailures: siteLeads.filter(r => String(r.ghl_status || '').startsWith('failed')).map(r => ({ name: R.siteLeadName(r), why: String(r.ghl_status).replace(/^failed: /, '') })),
    };
    const ownersRow = await setting('switch_owners', []);
    const owners = (Array.isArray(ownersRow) ? ownersRow : []).map(e => String(e).toLowerCase());
    const m = morningEmail(steps, Object.assign({}, extra, { staleNote }), t);
    const mOwner = systemItems.length ? morningEmail(steps, Object.assign({}, extra, { systemItems }), t) : m;
    const results = [];
    for (const to of cfg.emails || []) {
      const mine = owners.includes(String(to).toLowerCase()) ? mOwner : m;
      results.push(await deliver({ live: !!cfg.live, lead: null, channel: 'email', to, toName: to, template: 'morning_email', ...mine }));
    }
    return { ok: true, live: !!cfg.live, things: m.count, emails: results.map(r => r.status) };
  }

  return { run, morning };
}
