// CDS Caregiver Match: the server logic behind every screen.
// One module, run by the cds-match edge function (live) and by the practice
// preview (in the browser, against an in-browser copy of the same database).
//
// deps = {
//   db:     { query(sql, params) -> Promise<{ rows }> }
//   mode:   'practice' | 'live'
//   crypto: { token(), hash(s), code(), encrypt(s) }          (all async)
//   media:  { put({ pool_id, kind, mime, data, by }) -> id, url(id) -> string|null }
//   ghl:    { upsert({ first_name, last_name, phone, email, tags }) -> id, get(id) -> contact|null }
//           live also find(query), contact(id), fields(), documents({ contactId, documentType, folderId }) for Roster papers (read only)
//   files:  { fetch(url) -> { bytes, mime } }  (live: GHL file hosts only)
//   send:   async ({ channel, to, subject, body }) -> void   (only called when messages are live)
//   links:  { family(token), caregiver(token) } -> full URL
// }

import * as R from './rules.js';
import { TEMPLATES, fill, CONSENT_WORDING, FCSR_EXPLAINER, PROVIDER_CHOICE, FCSR_EMPLOYER } from './messages.js';
import { createPacket } from '../packet/handlers.js';
import { createEnroll } from '../enroll/handlers.js';
import { createSign } from '../enroll/sign.js';
import { createMedicaidMessages } from '../enroll/medicaid.js';
import { createRosterProof } from '../office/roster-proof.js';
import { createPrescreen } from '../enroll/prescreen.js';

export class MatchError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (m, s) => { throw new MatchError(m, s); };

const iso = v => (v instanceof Date ? v.toISOString() : v);
function clean(row) {
  if (!row) return row;
  const o = {};
  for (const k in row) o[k] = iso(row[k]);
  return o;
}
const addDays = (nowIso, d) => new Date(new Date(nowIso).getTime() + d * 86400000).toISOString();
const addMin = (nowIso, m) => new Date(new Date(nowIso).getTime() + m * 60000).toISOString();
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;   // the CDS project's storage limit per file

export function createMatch(deps) {
  const { db, crypto, media, ghl, links } = deps;
  const q = async (sql, params = []) => (await db.query(sql, params)).rows.map(clean);
  const one = async (sql, params) => (await q(sql, params))[0] || null;
  const nowIso = async () => (await one('select now() as n')).n;

  async function audit(actor, action, target, detail = {}) {
    await q('insert into cds_audit (actor, action, target, detail) values ($1,$2,$3,$4::jsonb)',
      [actor, action, target || null, JSON.stringify(detail)]);
  }
  async function setting(key, fallback) {
    const r = await one('select value from cds_match_settings where key=$1', [key]);
    return r ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : fallback;
  }
  // poolId: that attendant's list, with fingerprints added when their Step 1 says they lived outside Missouri.
  async function requiredChecks(poolId) {
    const keys = await setting('required_checks', R.DEFAULT_REQUIRED_CHECKS.map(c => c.key));
    const list = keys.map(k => R.DEFAULT_REQUIRED_CHECKS.find(c => c.key === k) || { key: k, label: k, source: 'office' });
    if (poolId && !list.some(c => c.key === R.FINGERPRINT_CHECK.key)) {
      let more = false;
      try { more = !!(await one(`select 1 as y from cds_packets where pool_id=$1 and answers->>'mo_only'='more'`, [poolId])); } catch { /* no packets table: nobody needs it */ }
      if (more) list.push(R.FINGERPRINT_CHECK);
    }
    return list;
  }
  async function task(kind, title, refs, dedupe, dueAt) {
    await q(`insert into cds_tasks (kind, title, pool_id, prospect_id, intro_id, dedupe_key, due_at)
             values ($1,$2,$3,$4,$5,$6,$7) on conflict (dedupe_key) do nothing`,
      [kind, title, refs.pool_id || null, refs.prospect_id || null, refs.intro_id || null, dedupe, dueAt || null]);
  }
  async function finishTask(dedupe, by) {
    await q('update cds_tasks set done_at=now(), done_by=$2 where dedupe_key=$1 and done_at is null', [dedupe, by]);
  }

  async function event(prospectId, actor, kind, from, to, note) {
    await q('insert into cds_prospect_events (prospect_id, actor, kind, from_stage, to_stage, note) values ($1,$2,$3,$4,$5,$6)', [prospectId, actor, kind, from, to, note ? String(note).slice(0, 500) : null]);
  }
  async function stageIf(prospectId, fromStages, to, actor, note) {
    const p = await one('select stage from cds_prospects where id=$1', [prospectId]);
    if (!p || !fromStages.includes(p.stage)) return false;
    await q('update cds_prospects set stage=$2, updated_at=now() where id=$1', [prospectId, to]);
    await event(prospectId, actor, 'stage', p.stage, to, note);
    return true;
  }
  async function allChecks(prospectId) {
    return q('select * from cds_medicaid_checks where prospect_id=$1 order by checked_on desc, recorded_at desc', [prospectId]);
  }
  async function chosenFor(p) {
    if (!p.chosen_pool_id) return null;
    const c = await loadCaregiver(p.chosen_pool_id);
    return c ? { id: c.pool.id, first_name: c.pool.first_name, eligible: c.screening.eligible } : null;
  }
  async function readiness(p) {
    const e = await one('select * from cds_eligibility where prospect_id=$1', [p.id]);
    return R.readyToBegin({ prospect: p, eligibility: e, checks: await allChecks(p.id), chosen: await chosenFor(p) });
  }
  async function needsAttention(p, title, actor, dueIso) {
    await task('needs_attention', title, { prospect_id: p.id }, 'attention:' + p.id + ':' + Date.parse(await nowIso()), dueIso);
  }
  async function lastCheck(prospectId) {
    return one('select * from cds_medicaid_checks where prospect_id=$1 order by checked_on desc, recorded_at desc limit 1', [prospectId]);
  }
  async function gateFor(p) {
    const e = await one('select * from cds_eligibility where prospect_id=$1', [p.id]);
    return R.inviteGate({ prospect: { ...p, needs: typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs || {} }, ihsInvitesAllowed: await setting('ihs_invites_allowed', false) });
  }

  // ---------- messages: every one is recorded, nothing fails silently ----------
  // While messages are off, the office's own test phones and emails (setting
  // test_recipients) still get real messages, so the team can test end to end.
  async function isTestRecipient(channel, to) {
    const t = (await setting('test_recipients', {})) || {};
    if (channel === 'sms') {
      const d = String(to || '').replace(/\D/g, '').slice(-10);
      return d.length === 10 && (t.phones || []).some(p => String(p).replace(/\D/g, '').slice(-10) === d);
    }
    return (t.emails || []).some(e => String(e).trim().toLowerCase() === String(to || '').trim().toLowerCase());
  }
  async function message({ template, channel, audience, pool_id, prospect_id, to, vars, by, automatic = false }) {
    const t = TEMPLATES[template];
    if (!t) fail('Unknown message');
    if (t.audience !== audience) fail('Wrong audience for this message');
    if (!['sms', 'email'].includes(channel)) fail('Choose text or email');
    if (!to) fail(channel === 'sms' ? 'No phone number on file' : 'No email on file');
    const body = fill(t[channel], vars);
    const subject = channel === 'email' ? fill(t.email_subject, vars) : null;
    const display = channel === 'sms' ? R.maskPhone(to) : R.maskEmail(to);
    let status, error = null;
    if (deps.mode === 'practice') status = 'practice';
    else if (!(await setting('messages_live', false)) && !(await isTestRecipient(channel, to))) { status = 'held'; error = 'Messages are switched off until Samantha approves them.'; }
    else {
      try { await deps.send({ channel, to, subject, body }); status = 'sent'; }
      catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); }
    }
    const row = await one(`insert into cds_outbox (audience, pool_id, prospect_id, channel, template, to_display, body, status, error, automatic, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [audience, pool_id || null, prospect_id || null, channel, template, display, (subject ? subject + '\n\n' : '') + body, status, error, automatic, by]);
    return row;
  }

  // Office alert for a caregiver sign-up: one email per address in setting
  // office_alerts, each recorded in the outbox. Held until office_alerts.live is
  // true. A failed email is written onto the sign-up to-do so it can't go unseen.
  async function officeSignupAlert(p, repeat) {
    const cfg = await setting('office_alerts', { emails: [], live: false });
    const t = TEMPLATES.office_cg_signup;
    const counties = (Array.isArray(p.counties) ? p.counties : []).join(', ');
    const has = p.has_potential_consumer === 'Yes'
      ? 'Yes' + (p.consumer_relationship ? ' (' + p.consumer_relationship.toLowerCase() + ')' : '') + (p.consumer_has_medicaid ? '. Medicaid: ' + p.consumer_has_medicaid : '')
      : (p.has_potential_consumer || 'not answered');
    const vars = {
      flag: p.has_potential_consumer === 'Yes' ? 'Has someone to care for. ' : '',
      headline: repeat ? 'Caregiver signed up again' : 'New CDS caregiver sign-up',
      did: repeat ? 'signed up again for' : 'signed up for',
      next: repeat ? 'They already had a record with this phone, so their private link was NOT shown on screen. Call to say hello, then send their profile link from the Hub.'
        : 'They went straight to building their profile. Call to say hello within 1 business day.',
      name: [p.first_name, p.last_name].filter(Boolean).join(' '),
      name_short: p.first_name + (p.last_name ? ' ' + p.last_name.slice(0, 1) + '.' : ''),
      phone: p.phone || 'none', email: p.email || 'none', town: p.city || 'not given', counties: counties || 'none picked',
      hours: p.hours_wanted || 'asked in their profile', experience: p.experience || 'asked in their profile', has,
      fcsr: { yes: 'Yes', no: 'No', not_sure: 'Not sure' }[p.fcsr_registered_answer] || 'asked in their profile',
    };
    const subject = fill(t.email_subject, vars), body = fill(t.email, vars);
    let failed = 0;
    for (const to of (cfg.emails || [])) {
      let status, error = null;
      if (deps.mode === 'practice') status = 'practice';
      else if (!cfg.live) { status = 'held'; error = 'Office alerts are switched off until Samantha turns them on.'; }
      else {
        try { await deps.send({ channel: 'email', to, subject, body }); status = 'sent'; }
        catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); failed++; }
      }
      await q(`insert into cds_outbox (audience, pool_id, channel, template, to_display, body, status, error, automatic, created_by)
               values ('office',$1,'email','office_cg_signup',$2,$3,$4,$5,true,'public')`,
        [p.id, R.maskEmail(to), subject + '\n\n' + body, status, error]);
    }
    if (failed) await q(`update cds_tasks set title = left(title || ' Email alert failed, see Messages.', 300)
                         where pool_id=$1 and kind='cg_signup' and done_at is null and title not like '%Email alert failed%'`, [p.id]);
    return { emails: (cfg.emails || []).length, failed };
  }

  // ---------- loading a caregiver with everything the rules need ----------
  async function loadCaregiver(poolId) {
    const pool = await one('select * from attendant_pool where id=$1', [poolId]);
    if (!pool) return null;
    const profile = await one('select * from cds_cg_profiles where pool_id=$1', [poolId]);
    const consents = await q('select * from cds_consents where pool_id=$1 order by given_at', [poolId]);
    const scrRow = await one('select * from cds_screening where pool_id=$1', [poolId]);
    const checks = await q('select * from cds_screening_checks where pool_id=$1', [poolId]);
    const summary = R.screeningSummary(scrRow, checks, await requiredChecks(poolId));
    summary.raw = scrRow || {};
    const listing = R.listingState({ pool, profile: profile && { ...profile, approved: !!profile.approved }, consents, screening: summary });
    return { pool, profile, consents, screening: summary, checks, listing };
  }

  // What families may see about a caregiver. Nothing internal goes in here.
  async function familyCard(c, nowIso, filters, needs) {
    const a = c.profile.approved || {};
    const facts = { ...a, availability: c.profile.availability, has_video: !!c.profile.video_approved, hours_min: c.profile.hours_min, hours_max: c.profile.hours_max };
    const match = R.matchCaregiver(facts, filters);
    if (!match) return null;
    const fit = needs && R.hasNeeds(needs) ? R.needsMatch(facts, needs) : null;
    if (needs && R.hasNeeds(needs) && !fit) return null;
    return {
      id: c.pool.id,
      first_name: c.pool.first_name,
      town: a.town || '',
      counties: a.counties || [],
      section: c.listing.state,
      availability: c.profile.availability,
      availability_text: R.availabilitySummary(c.profile.availability),
      hours_min: c.profile.hours_min, hours_max: c.profile.hours_max,
      availability_confirmed_at: c.profile.availability_confirmed_at,
      confirmed_text: R.agoText(c.profile.availability_confirmed_at, nowIso),
      has_video: !!c.profile.video_approved,
      direct_contact: R.hasConsent(c.consents, 'contact') && !!contactFor(c.pool),
      photo_url: c.profile.photo_approved ? await media.url(c.profile.photo_approved) : null,
      help_types: (a.help_types || []).map(h => R.HELP_TYPES[h]),
      quote: a.about_me ? String(a.about_me).split(/(?<=[.!?])\s/)[0].slice(0, 140) : '',
      match: fit ? { reasons: fit.reasons, gaps: fit.gaps, matched: fit.matched, total: fit.total } : match,
    };
  }
  async function familyProfile(c, nowIso) {
    const card = await familyCard(c, nowIso, {});
    const a = c.profile.approved || {};
    return {
      ...card,
      about_me: a.about_me || '', enjoy_most: a.enjoy_most || '', interests: a.interests || '',
      setting_pref: a.setting_pref || '', experience: a.experience || '',
      help_types: (a.help_types || []).map(h => R.HELP_TYPES[h]),
      languages: a.languages || [], has_car: !!a.has_car, travel_miles: a.travel_miles || null,
      certs_verified: a.certs || [],
      current_cds_hours: !!a.current_cds_hours,
      video_url: c.profile.video_approved && R.hasConsent(c.consents, 'video') ? await media.url(c.profile.video_approved) : null,
      // Only with the caregiver's own OK (consent 'contact', her word 11-25). Never the address or last name.
      contact: R.hasConsent(c.consents, 'contact') ? contactFor(c.pool) : null,
    };
  }
  function contactFor(pool) {
    const d = String(pool.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    const phone = d.length === 10 ? d : null;
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(pool.email || '').trim()) ? String(pool.email).trim() : null;
    if (!phone && !email) return null;
    return { phone: phone ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : null, phone_e164: phone ? '+1' + d : null, email };
  }

  async function listedCaregivers() {
    const ids = await q(`select p.id from attendant_pool p join cds_cg_profiles g on g.pool_id=p.id
                         where coalesce(p.archived,false)=false and g.approved is not null and p.office_reviewed_at is not null`);
    const out = [];
    for (const { id } of ids) {
      const c = await loadCaregiver(id);
      if (c && c.listing.state !== 'not_listed') out.push(c);
    }
    return out;
  }

  // ---------- personal sign-up links for former caregivers (2026-11-24) ----------
  const digits10 = v => String(v || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  async function inviteFor(token) {
    if (!token) return null;
    const v = await one('select * from cds_cg_invites where token_hash=$1', [await crypto.hash(String(token))]);
    if (!v || new Date(v.expires_at) <= new Date(await nowIso())) return null;
    return v;
  }
  async function newCaregiverLink(poolId, by) {
    const token = await crypto.token();
    await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)',
      [poolId, await crypto.hash(token), by, addDays(await nowIso(), R.CAREGIVER_LINK_DAYS)]);
    return links.caregiver(token);
  }

  // ---------- finish-your-profile reminders (2026-11-24) ----------
  // Runs with the 15-minute job. Only while setting cg_profile_reminders.live is
  // true, 9am to 6pm Central Monday to Saturday, for people who signed up on the
  // website in the last window_days and haven't sent their profile in. Two at most:
  // the next day, then 3 days later. Nothing is recorded while it is off.
  async function profileReminders(at) {
    const cfg = await setting('cg_profile_reminders', { live: false });
    if (!cfg || cfg.live !== true) return { live: false, sent: 0 };
    // Tests pass a clock time; live always uses the database clock.
    const now = deps.mode === 'practice' && at ? at : await nowIso();
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(now));
    if (hour < 9 || hour >= 18 || day === 'Sun') return { live: true, quiet: true, sent: 0 };
    const first = Number(cfg.first_after_hours) || 20, second = Number(cfg.second_after_hours) || 72, windowDays = Number(cfg.window_days) || 14;
    const due = await q(`select p.id, p.first_name, p.phone, p.email, p.submitted_at,
        (select max(o.created_at) from cds_outbox o where o.pool_id=p.id and o.template='cg_profile_nudge1') as n1,
        (select count(*)::int from cds_outbox o where o.pool_id=p.id and o.template='cg_profile_nudge2') as n2,
        (select max(l.last_used_at) from cds_cg_links l where l.pool_id=p.id) as used
      from attendant_pool p left join cds_cg_profiles g on g.pool_id=p.id
      where p.source='findcdscaregivers.com' and not coalesce(p.archived,false)
        and p.submitted_at > $2::timestamptz - make_interval(days => $1)
        and coalesce(g.review_status,'draft') not in ('submitted','approved') and g.withdrawn_at is null
        and exists (select 1 from cds_cg_links l where l.pool_id=p.id)
      order by p.submitted_at limit 25`, [windowDays, now]);
    let sent = 0;
    for (const p of due) {
      const usedRecently = p.used && (Date.parse(now) - Date.parse(p.used)) < 12 * 3600000;
      let template = null;
      if (!p.n1 && (Date.parse(now) - Date.parse(p.submitted_at)) >= first * 3600000) template = 'cg_profile_nudge1';
      else if (p.n1 && !p.n2 && (Date.parse(now) - Date.parse(p.n1)) >= second * 3600000) template = 'cg_profile_nudge2';
      if (!template || usedRecently) continue;
      const c = await loadCaregiver(p.id);
      const hasAuth = !!(c.screening.raw && c.screening.raw.authorization_signed_at);
      const todo = R.caregiverChecklist({ profile: c.profile, consents: c.consents, screening: c.screening, hasAuth })
        .filter(x => !x.done && !x.optional).map(x => x.label.replace(/ \(FCSR\)$/, '').toLowerCase());
      const link = await newCaregiverLink(p.id, 'reminder');
      const vars = { first: p.first_name, link, todo: todo.length ? todo.join(', ') : 'send it in on the last step' };
      await message({ template, channel: 'sms', audience: 'caregiver', pool_id: p.id, to: p.phone, vars, by: 'reminder', automatic: true });
      if (p.email) await message({ template, channel: 'email', audience: 'caregiver', pool_id: p.id, to: p.email, vars, by: 'reminder', automatic: true });
      await audit('job', 'caregiver_profile_reminder', 'pool:' + p.id, { template });
      sent++;
    }
    return { live: true, sent };
  }

  // ---------- every CDS consumer gets the caregiver directory (2026-11-25) ----------
  // Active and starting consumers on the roster (agency_data 'consumers') get a directory
  // record with access approved, automatically. A consumer marked inactive loses access.
  // Invitation texts wait for setting consumer_directory.invites_live and enough listed
  // caregivers; the office can send one by hand from the consumer's page.
  const CD_LIVE = ['active', 'starting'];
  async function consumerRoster() {
    const r = await one(`select data_value from agency_data where agency_id='caring-companions-cds' and data_key='consumers' limit 1`).catch(() => null);
    let v = r && r.data_value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
    return Array.isArray(v) ? v.filter(c => c && c.id) : [];
  }
  const cdFirst = c => String(c.name || '').trim().split(/\s+/)[0].slice(0, 60);
  const cdTown = c => { const a = c.address; const t = typeof a === 'string' ? (a.split(',').slice(-2, -1)[0] || '') : (a && (a.city || a.town)) || ''; return String(t).trim().slice(0, 60); };
  async function ensureConsumerAccess(c, by) {
    let p = await one('select * from cds_prospects where consumer_id=$1', [String(c.id)]);
    const phone = String(c.phone || '').trim(), email = String(c.email || '').trim();
    if (!p) {
      if (!phone && !email) return { state: 'no_contact' };
      const parts = String(c.name || '').trim().split(/\s+/);
      const contactId = await ghl.upsert({ first_name: parts[0], last_name: parts.slice(1).join(' '), phone, email, tags: ['cds-directory'] });
      p = await one(`insert into cds_prospects (ghl_contact_id, first_name, town, county, kind, source, consumer_id, stage, access_status, access_path, access_decided_by, access_decided_at, access_note)
                     values ($1,$2,$3,$4,'consumer','consumer-roster',$5,'access_approved','approved','cds_consumer',$6,now(),'Caring Companions CDS consumer: access given automatically') returning *`,
        [contactId, cdFirst(c) || 'there', cdTown(c), R.COUNTIES.includes(c.county) ? c.county : null, String(c.id), by]);
      await q(`insert into cds_eligibility (prospect_id, dsds_cds, dsds_cds_on, dsds_cds_by, dsds_note) values ($1,'confirmed',current_date,$2,'Existing Caring Companions CDS consumer')
               on conflict (prospect_id) do nothing`, [p.id, by]);
      await event(p.id, by, 'created', null, 'access_approved', 'CDS consumer: directory access given automatically');
      await audit(by, 'consumer_directory_access', 'prospect:' + p.id, { consumer: String(c.id) });
    } else if (p.access_status !== 'approved') {
      await q(`update cds_prospects set access_status='approved', access_path='cds_consumer', hold_reason=null, access_decided_by=$2, access_decided_at=now(), updated_at=now() where id=$1`, [p.id, by]);
      await audit(by, 'consumer_directory_access', 'prospect:' + p.id, { consumer: String(c.id), again: true });
      p = await one('select * from cds_prospects where id=$1', [p.id]);
    }
    return { state: 'approved', prospect: p };
  }
  // Phone and email: the consumer roster first (the office keeps it current), then GoHighLevel.
  async function consumerContact(p) {
    const r = p.consumer_id ? (await consumerRoster()).find(x => String(x.id) === String(p.consumer_id)) : null;
    const g = (await ghl.get(p.ghl_contact_id)) || {};
    return { phone: String((r && r.phone) || g.phone || '').trim(), email: String((r && r.email) || g.email || '').trim() };
  }
  // Text AND email (her word 2026-11-25), each with its own link; the earlier links stop working.
  async function inviteConsumer(p, by) {
    const { phone, email } = await consumerContact(p);
    if (!phone && !email) fail('No phone or email on file for this consumer.');
    await q('update cds_access set revoked_at=now(), revoked_by=$2 where prospect_id=$1 and revoked_at is null', [p.id, by + ' (replaced by a new link)']);
    const sent = [];
    for (const [ch, to] of [['sms', phone], ['email', email]]) {
      if (!to) continue;
      const token = await crypto.token();
      const a = await one('insert into cds_access (prospect_id, token_hash, invited_by, expires_at) values ($1,$2,$3,null) returning id', [p.id, await crypto.hash(token), by]);
      const m = await message({ template: 'fam_invite_consumer', channel: ch, audience: 'family', prospect_id: p.id, to, vars: { first: p.first_name, link: links.family(token) }, by, automatic: by === 'automatic' });
      await audit(by, 'invited_consumer', 'prospect:' + p.id, { access: a.id, channel: ch, status: m.status });
      sent.push(m);
    }
    const okOne = sent.find(m => m.status === 'sent' || m.status === 'practice');
    if (okOne) await stageIf(p.id, ['access_approved'], 'invited', by, 'Directory link ' + (okOne.status === 'practice' ? 'recorded (practice)' : 'sent'));
    // One answer for the Hub: sent if any went, else the first problem.
    return okOne || sent[0];
  }
  // Every quarter (her word 2026-11-25): an email reminding the consumer they have their own
  // directory link. Only to consumers who were already sent their link, have an email, and
  // only while invitations are switched on. A new link each time; earlier links keep working.
  async function consumerQuarterlyEmails(now) {
    const due = await q(`select p.* from cds_prospects p where p.consumer_id is not null and p.access_status='approved'
      and exists (select 1 from cds_outbox o where o.prospect_id=p.id and o.template='fam_invite_consumer' and o.status in ('sent','practice'))
      and coalesce((select max(o.created_at) from cds_outbox o where o.prospect_id=p.id and o.channel='email' and o.template in ('fam_invite_consumer','fam_directory_quarterly') and o.status in ('sent','practice')),
                   (select min(o.created_at) from cds_outbox o where o.prospect_id=p.id and o.template='fam_invite_consumer' and o.status in ('sent','practice'))) <= $1::timestamptz - interval '90 days'
      order by p.created_at limit 20`, [now]);
    let n = 0;
    for (const p of due) {
      const { email } = await consumerContact(p);
      if (!email) continue;
      const token = await crypto.token();
      await q('insert into cds_access (prospect_id, token_hash, invited_by, expires_at) values ($1,$2,$3,null)', [p.id, await crypto.hash(token), 'quarterly email']);
      const m = await message({ template: 'fam_directory_quarterly', channel: 'email', audience: 'family', prospect_id: p.id, to: email, vars: { first: p.first_name, link: links.family(token) }, by: 'automatic', automatic: true });
      if (m.status === 'sent' || m.status === 'practice') n++;
    }
    return n;
  }
  async function listedCompleteCount() {
    let n = 0;
    for (const c of await listedCaregivers()) if (c.listing.state === 'complete') n++;
    return n;
  }
  async function consumerDirectorySync(at) {
    const cfg = await setting('consumer_directory', { auto_access: false });
    if (!cfg || cfg.auto_access !== true) return { live: false };
    const roster = await consumerRoster();
    let given = 0, ended = 0, noContact = 0, invited = 0, quarterly = 0;
    for (const c of roster) {
      const st = String(c.status || '').toLowerCase();
      if (CD_LIVE.includes(st)) {
        const had = await one('select access_status from cds_prospects where consumer_id=$1', [String(c.id)]);
        const r = await ensureConsumerAccess(c, 'automatic');
        if (r.state === 'no_contact') noContact++; else if (!had || had.access_status !== 'approved') given++;
      } else {
        const p = await one(`select * from cds_prospects where consumer_id=$1 and access_status='approved'`, [String(c.id)]);
        if (!p) continue;
        await q('update cds_access set revoked_at=now(), revoked_by=$2 where prospect_id=$1 and revoked_at is null', [p.id, 'automatic: no longer an active CDS consumer']);
        await q(`update cds_sessions set ended_at=now() where ended_at is null and access_id in (select id from cds_access where prospect_id=$1)`, [p.id]);
        await q(`update cds_prospects set access_status='on_hold', hold_reason='No longer an active CDS consumer', updated_at=now() where id=$1`, [p.id]);
        await audit('automatic', 'consumer_directory_ended', 'prospect:' + p.id, { consumer: String(c.id) });
        ended++;
      }
    }
    // Invitations: only when switched on, enough caregivers are listed, and in the daytime.
    if (cfg.invites_live === true) {
      const now = deps.mode === 'practice' && at ? at : await nowIso();
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
      const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(now));
      const need = cfg.invite_after_listed == null || isNaN(Number(cfg.invite_after_listed)) ? 10 : Number(cfg.invite_after_listed);
      const enough = (await listedCompleteCount()) >= need;
      if (enough && hour >= 9 && hour < 18 && day !== 'Sun') {
        const waiting = await q(`select p.* from cds_prospects p where p.consumer_id is not null and p.access_status='approved'
                                 and not exists (select 1 from cds_access a where a.prospect_id=p.id) order by p.created_at limit 10`);
        for (const p of waiting) { try { const m = await inviteConsumer(p, 'automatic'); if (m && (m.status === 'sent' || m.status === 'practice')) invited++; } catch { /* no contact: shows on the consumer's page */ } }
      }
      if (hour >= 9 && hour < 18 && day !== 'Sun') quarterly = await consumerQuarterlyEmails(now);
    }
    return { live: true, roster: roster.length, given, ended, no_contact: noContact, invited, quarterly };
  }

  // ---------- one-time "photo upload is fixed" text (2026-11-26) ----------
  // Once setting photo_fixed_send.live is true and start_at has passed, each 15-minute run texts
  // the next group (9am to 6pm Central, Monday to Saturday): caregivers on the Hub's Caregivers
  // list with a phone, no photo yet, profile not sent in or approved, not withdrawn. One text per
  // phone number (duplicate sign-ups share it), never twice. Each gets a fresh private link.
  async function photoFixedSend(at) {
    const cfg = await setting('photo_fixed_send', { live: false });
    if (!cfg || cfg.live !== true || !cfg.start_at) return { live: false };
    const now = deps.mode === 'practice' && at ? at : await nowIso();
    if (new Date(now) < new Date(cfg.start_at)) return { live: true, waiting: true, sent: 0 };
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(now));
    if (hour < 9 || hour >= 18 || day === 'Sun') return { live: true, quiet: true, sent: 0 };
    const size = Math.max(1, Math.min(100, Number(cfg.batch_size) || 40));
    const rows = await photoFixedDue(size);
    let sent = 0;
    for (const p of rows) {
      await ensureProfile(p.id);
      const link = await newCaregiverLink(p.id, 'photo-fixed');
      const m = await message({ template: 'cg_photo_fixed', channel: 'sms', audience: 'caregiver', pool_id: p.id, to: p.phone,
        vars: { first: p.first_name, link }, by: 'photo-fixed', automatic: true });
      if (m.status === 'sent' || m.status === 'practice') sent++;
    }
    const left = (await photoFixedDue(1000)).length;
    if (rows.length) await audit('job', 'photo_fixed_send_group', 'cg_photo_fixed', { tried: rows.length, sent, left });
    return { live: true, tried: rows.length, sent, left };
  }
  async function photoFixedDue(limit) {
    return q(`select * from (
        select distinct on (regexp_replace(p.phone, '\\D', '', 'g')) p.id, p.first_name, p.phone, regexp_replace(p.phone, '\\D', '', 'g') as digits
        from attendant_pool p left join cds_cg_profiles g on g.pool_id = p.id
        where coalesce(p.archived, false) = false
          and (coalesce(p.source, '') <> 'apply' or exists (select 1 from cds_packets k where k.pool_id = p.id and k.list_choice = 'join'))
          and length(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g')) >= 10
          and g.photo_draft is null and g.photo_approved is null and g.withdrawn_at is null
          and coalesce(g.review_status, 'draft') not in ('submitted', 'approved')
        order by regexp_replace(p.phone, '\\D', '', 'g'), p.submitted_at desc) d
      where not exists (select 1 from cds_outbox o join attendant_pool x on x.id = o.pool_id
        where o.template = 'cg_photo_fixed' and regexp_replace(x.phone, '\\D', '', 'g') = d.digits)
      order by d.first_name, d.id limit $1`, [limit]);
  }

  // ---------- the invitation to past caregivers (the "545" send, 2026-11-25) ----------
  // Once setting former_send.live is true and start_at has passed, each 15-minute run sends the
  // next group (batch_size) between 9am and 6pm Central, Monday to Saturday: a text from the CDS
  // line and an email, each with the person's own sign-up link (made at send time). Each person
  // is tried once; known opt-outs are skipped per channel.
  async function formerSend(at) {
    const cfg = await setting('former_send', { live: false });
    if (!cfg || cfg.live !== true || !cfg.start_at) return { live: false };
    const now = deps.mode === 'practice' && at ? at : await nowIso();
    if (new Date(now) < new Date(cfg.start_at)) return { live: true, waiting: true, sent: 0 };
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now)));
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(now));
    if (hour < 9 || hour >= 18 || day === 'Sun') return { live: true, quiet: true, sent: 0 };
    const size = Math.max(1, Math.min(100, Number(cfg.batch_size) || 50));
    const rows = await q(`select * from cds_cg_invites where batch=$1 and sent_at is null order by created_at, id limit $2`, [cfg.batch, size]);
    let sent = 0;
    for (const v of rows) {
      const token = await crypto.token();
      // Claim the row first, so a slow run can never send to the same person twice.
      const claimed = await one(`update cds_cg_invites set token_hash=$2, sent_at=now() where id=$1 and sent_at is null returning id`, [v.id, await crypto.hash(token)]);
      if (!claimed) continue;
      const vars = { first: v.first_name, link: links.signup(token), past: v.never_hired ? 'applied with' : 'worked with' };
      let smsStatus = 'none', emailStatus = 'none', err = [];
      if (v.phone && !v.skip_sms) {
        const m = await message({ template: 'cg_former_invite', channel: 'sms', audience: 'caregiver', to: v.phone, vars, by: 'former-send', automatic: true });
        smsStatus = m.status; if (m.error) err.push('text: ' + m.error);
      } else if (v.phone) smsStatus = 'skipped (opted out)';
      if (v.email && !v.skip_email) {
        const m = await message({ template: 'cg_former_invite', channel: 'email', audience: 'caregiver', to: v.email, vars, by: 'former-send', automatic: true });
        emailStatus = m.status; if (m.error) err.push('email: ' + m.error);
      } else if (v.email) emailStatus = 'skipped (opted out)';
      await q(`update cds_cg_invites set sms_status=$2, email_status=$3, send_error=$4 where id=$1`, [v.id, smsStatus, emailStatus, err.join('; ').slice(0, 300) || null]);
      if (smsStatus === 'sent' || emailStatus === 'sent' || smsStatus === 'practice' || emailStatus === 'practice') sent++;
    }
    const left = (await one(`select count(*)::int n from cds_cg_invites where batch=$1 and sent_at is null`, [cfg.batch])).n;
    if (rows.length) await audit('job', 'former_send_group', 'batch:' + cfg.batch, { tried: rows.length, sent, left });
    return { live: true, tried: rows.length, sent, left };
  }

  // ================= PUBLIC =================
  const pub = {
    // Counts of fully screened, listed caregivers by county. People never.
    async counts() {
      const counts = {};
      const now = await nowIso();
      for (const c of await listedCaregivers()) {
        if (c.listing.state !== 'complete') continue;
        if (!R.availabilityCurrent(c.profile, now)) continue;
        for (const k of (c.profile.approved || {}).counties || []) counts[k] = (counts[k] || 0) + 1;
      }
      return { counts };
    },
    // A former caregiver's personal sign-up link (?i=...). Shows their first name
    // and fills the form. The phone is never sent back in full.
    async inviteLookup({ invite }) {
      const v = await inviteFor(invite);
      if (!v) return { ok: false };
      if (!v.opened_at) await q('update cds_cg_invites set opened_at=now() where id=$1', [v.id]);
      return { ok: true, first_name: v.first_name || '', last_name: v.last_name || '', email: v.email || '', city: v.city || '',
        phone_hint: R.maskPhone(v.phone), used: !!v.used_at, never_hired: v.never_hired === true };
    },
    // The caregiver sign-up form (findcdscaregivers.com/caregivers/). Saves to
    // the caregiver list, the database trigger adds the Hub to-do, and the
    // office gets an email. The same phone signing up again updates the person.
    async joinList(i) {
      if (i.website) return { ok: true };   // spam trap field
      const inv = await inviteFor(i.invite);
      if (inv) {
        i = { ...i };
        for (const k of ['first_name', 'last_name', 'email']) if (!String(i[k] || '').trim() && inv[k]) i[k] = inv[k];
        if (!String(i.city || '').trim() && inv.city) i.city = inv.city;
        if (!digits10(i.phone) && inv.phone) i.phone = inv.phone;
        i.worked_here_before = true;
        if (!i.how_heard) i.how_heard = 'Former Caring Companions caregiver (personal link)';
      }
      const s = (v, n) => String(v ?? '').trim().slice(0, n);
      const opt = v => s(v, 300) || null;
      const first = s(i.first_name, 60), last = s(i.last_name, 60);
      const digits = String(i.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (!first || !last) fail('Please add your first and last name.');
      if (digits.length !== 10) fail('Please give us a 10-digit phone number, with area code.');
      const counties = (Array.isArray(i.counties) ? i.counties : []).filter(c => R.COUNTIES.includes(c));
      if (!counties.length) fail('Please pick at least one county you would work in.');
      const hasSomeone = ['Yes', 'No', 'Not sure'].includes(i.has_potential_consumer) ? i.has_potential_consumer : null;
      if (!hasSomeone) fail('Please tell us whether you already have someone you would care for.');
      if (i.background_ok !== true) fail('Please tick the background screening box.');
      const miles = [10, 20, 30, 45, 100].includes(Number(i.max_miles)) ? Number(i.max_miles) : null;
      const row = {
        first_name: first, last_name: last, phone: '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6),
        email: opt(i.email), city: s(i.city, 60) || null, zip: String(i.zip || '').replace(/\D/g, '').slice(0, 5) || null,
        counties: JSON.stringify(counties),
        availability: JSON.stringify((Array.isArray(i.availability) ? i.availability : []).map(a => s(a, 60)).filter(Boolean).slice(0, 12)),
        hours_wanted: opt(i.hours_wanted), max_miles: miles,
        has_transport: i.has_transport === true ? true : i.has_transport === false ? false : null,
        experience: opt(i.experience), experience_notes: s(i.experience_notes, 2000) || null,
        cert_cpr: i.cert_cpr === true, cert_cna: i.cert_cna === true, cert_other: opt(i.cert_other),
        worked_here_before: i.worked_here_before === true,
        has_potential_consumer: hasSomeone,
        knows_consumer: hasSomeone === 'Yes' ? opt(i.consumer_name) : null,
        consumer_relationship: hasSomeone === 'Yes' ? opt(i.consumer_relationship) : null,
        consumer_has_medicaid: hasSomeone === 'Yes' ? opt(i.consumer_has_medicaid) : null,
        how_heard: opt(i.how_heard), applicant_notes: s(i.applicant_notes, 2000) || null,
        fcsr_registered_answer: ['yes', 'no', 'not_sure'].includes(i.fcsr_registered_answer) ? i.fcsr_registered_answer : null,
      };
      // Leave out what the short form no longer asks, so a repeat sign-up keeps it.
      for (const k of Object.keys(row)) if (row[k] === null) delete row[k];
      if (i.cert_cpr === undefined) delete row.cert_cpr;
      if (i.cert_cna === undefined) delete row.cert_cna;
      if (i.worked_here_before === undefined) delete row.worked_here_before;
      if (i.availability === undefined) delete row.availability;
      const cols = Object.keys(row);
      const existing = await one(`select id from attendant_pool where coalesce(archived,false)=false
        and right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = $1 order by submitted_at limit 1`, [digits]);
      let id;
      if (existing) {
        // Keep what we had where the new answer is blank.
        await q(`update attendant_pool set ${cols.map((c, n) => `${c} = coalesce($${n + 2}${c === 'counties' || c === 'availability' ? '::jsonb' : ''}, ${c})`).join(', ')} where id=$1`,
          [existing.id, ...cols.map(c => row[c])]);
        id = existing.id;
        const today = (await nowIso()).slice(0, 10);
        await q(`insert into cds_tasks (kind, title, pool_id, dedupe_key, due_at)
                 values ('cg_signup', $2, $1, $3, cds_next_business_4pm(now())) on conflict (dedupe_key) do nothing`,
          [id, ('Signed up again: ' + first + ' ' + last + (row.city ? ', ' + row.city : '') + '. Call to say hello, then use Send profile link (their link was not shown on screen).').slice(0, 300), 'cg_signup_again:' + id + ':' + today]);
        await audit('public', 'caregiver_signup_repeat', 'pool:' + id, {});
        if (inv) await q('update cds_cg_invites set used_at=coalesce(used_at, now()), pool_id=$2 where id=$1', [inv.id, id]);
      } else {
        const r = await one(`insert into attendant_pool (agency_id, source, status, background_ok, show_anonymously, ${cols.join(', ')})
          values ('caring-companions-cds', 'findcdscaregivers.com', 'new', true, false, ${cols.map((c, n) => '$' + (n + 1) + (c === 'counties' || c === 'availability' ? '::jsonb' : '')).join(', ')}) returning id`,
          cols.map(c => row[c]));
        id = r.id;
        await audit('public', 'caregiver_signup', 'pool:' + id, {});
        if (inv) await q('update cds_cg_invites set used_at=coalesce(used_at, now()), pool_id=$2 where id=$1', [inv.id, id]);
      }
      const p = await one('select * from attendant_pool where id=$1', [id]);
      const alert = await officeSignupAlert(typeof p.counties === 'string' ? { ...p, counties: JSON.parse(p.counties) } : p, !!existing);
      // Someone signing up again with a phone we already have never gets a link
      // on screen: whoever typed the form might not be that person. The office
      // sends their link to the phone on file instead.
      // Except a personal link sent to this same phone: that is the person, so
      // they go straight back to their profile.
      if (existing && inv && digits10(inv.phone) === digits) {
        await ensureProfile(id);
        const link = await newCaregiverLink(id, 'sign-up');
        await audit('public', 'caregiver_signup_link', 'pool:' + id, { invite: true });
        return { ok: true, alerted: alert.emails > 0 && !alert.failed, link };
      }
      if (existing) return { ok: true, repeat: true, alerted: alert.emails > 0 && !alert.failed };
      // New person: straight to their profile. Start it with what they just told us.
      await ensureProfile(id);
      const certs = [i.cert_cpr === true && 'cpr', i.cert_cna === true && 'cna'].filter(Boolean);
      const { profile: draft } = R.cleanProfileDraft({ town: row.city || '', counties, certs, ...(row.cert_other ? { cert_other: row.cert_other } : {}),
        ...(row.has_transport !== null ? { has_car: row.has_transport } : {}), ...(miles ? { travel_miles: miles } : {}) });
      await q('update cds_cg_profiles set draft = draft || $2::jsonb, updated_at=now() where pool_id=$1', [id, JSON.stringify(draft)]);
      const token = await crypto.token();
      await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)',
        [id, await crypto.hash(token), 'sign-up', addDays(await nowIso(), R.CAREGIVER_LINK_DAYS)]);
      const link = links.caregiver(token);
      // A copy of the link so they can come back later. Held while messages are off.
      const m = await message({ template: 'cg_profile_link', channel: 'sms', audience: 'caregiver', pool_id: id, to: p.phone,
        vars: { first: p.first_name, link }, by: 'sign-up', automatic: true });
      await q(`update cds_tasks set title = left(replace(title, '. Call to say hello within 1 business day.', '. Has their profile link. Call to say hello within 1 business day.'), 300)
               where dedupe_key=$1`, ['cg_signup:' + id]);
      await audit('public', 'caregiver_signup_link', 'pool:' + id, { message: m.status });
      return { ok: true, alerted: alert.emails > 0 && !alert.failed, link };
    },
    // Step 1 of the request form: only name, phone and town are needed.
    async requestAccess(i) {
      const first = String(i.first_name || '').trim().slice(0, 60);
      const phone = String(i.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
      const town = String(i.town || '').trim().slice(0, 60);
      if (i.website) return { ok: true };   // spam trap field
      if (!first) fail('Please tell us your first name.');
      if (phone.replace(/\D/g, '').length < 10) fail('Please give us a phone number we can call, with area code.');
      if (!town) fail('Please tell us your town.');
      const program = R.PROGRAMS[i.program] ? i.program : null;
      const contactId = await ghl.upsert({ first_name: first, last_name: String(i.last_name || '').trim().slice(0, 60), phone, tags: ['cds-directory-request'] });
      const followup = await crypto.token();
      // Same person asking again (GoHighLevel matches them by phone): update, don't duplicate.
      const existing = contactId ? await one('select * from cds_prospects where ghl_contact_id=$1 order by created_at limit 1', [contactId]) : null;
      if (existing) {
        const needs = { ...(typeof existing.needs === 'string' ? JSON.parse(existing.needs) : existing.needs || {}), ...(program ? { program } : {}) };
        await q(`update cds_prospects set town=coalesce(nullif($2,''), town), needs=$3::jsonb, followup_hash=$4, followup_expires=now() + interval '2 hours',
                 stage = case when stage in ('follow_up_later','closed') then 'new_request' else stage end, updated_at=now() where id=$1`,
          [existing.id, town, JSON.stringify(needs), await crypto.hash(followup)]);
        await task('call_inquiry', 'Call ' + first + ' back: asked again on the website', { prospect_id: existing.id }, 'call_inquiry_again:' + existing.id + ':' + (await nowIso()).slice(0, 10));
        await audit('public', 'request_access_repeat', 'prospect:' + existing.id, { program });
        return { ok: true, followup };
      }
      const p = await one(`insert into cds_prospects (ghl_contact_id, first_name, town, source, needs, followup_hash, followup_expires)
        values ($1,$2,$3,'findcdscaregivers request access',$4::jsonb,$5, now() + interval '2 hours') returning id`,
        [contactId, first, town, JSON.stringify({ program }), await crypto.hash(followup)]);
      await task('call_inquiry', 'Call ' + first + ': explain CDS and ask permission to check Medicaid' + (program === 'ihs' ? ' (currently on IHS: present every provider choice)' : ''), { prospect_id: p.id }, 'call_inquiry:' + p.id);
      await event(p.id, 'public', 'created', null, 'new_request', 'Asked for access on the website');
      await audit('public', 'request_access', 'prospect:' + p.id, { program });
      return { ok: true, followup };
    },
    // Optional step 2, right after step 1. Uses the short-lived token step 1 returned.
    async requestAccessMore(i) {
      if (!i.followup) fail('This form has expired. We have your request and will call you.', 400);
      const p = await one(`select * from cds_prospects where followup_hash=$1 and followup_expires > now()`, [await crypto.hash(i.followup)]);
      if (!p) fail('This form has expired. We have your request and will call you.', 400);
      const email = String(i.email || '').trim().slice(0, 200);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That email doesn\'t look right. You can leave it blank.');
      const needs = { ...(typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs || {}),
        relationship: R.RELATIONSHIPS[i.relationship] ? i.relationship : undefined,
        best_time: String(i.best_time || '').slice(0, 80) || undefined };
      await q(`update cds_prospects set county=coalesce($2, county), needs=$3::jsonb, followup_hash=null, followup_expires=null, updated_at=now() where id=$1`,
        [p.id, R.COUNTIES.includes(i.county) ? i.county : null, JSON.stringify(needs)]);
      if (email) await ghl.update(p.ghl_contact_id, { email });
      await audit('public', 'request_access_details', 'prospect:' + p.id);
      return { ok: true };
    },
  };

  // ================= FAMILY =================
  async function accessByInvite(invite) {
    if (!invite) fail('This invitation link is incomplete. Call us and we\'ll send a new one.', 404);
    const a = await one('select * from cds_access where token_hash=$1', [await crypto.hash(invite)]);
    if (!a) fail('We don\'t recognize this invitation. Call us and we\'ll send you your own.', 404);
    return a;
  }
  async function familySession(token) {
    if (!token) fail('Please sign in.', 401);
    const s = await one(`select s.*, a.prospect_id, a.expires_at as access_expires, a.revoked_at as access_revoked
      from cds_sessions s join cds_access a on a.id=s.access_id where s.token_hash=$1`, [await crypto.hash(token)]);
    const now = await nowIso();
    if (!s || s.ended_at || new Date(s.expires_at) <= new Date(now)) fail('Your sign-in has ended. Open your invitation link again.', 401);
    if (!R.accessOpen({ expires_at: s.access_expires, revoked_at: s.access_revoked }, now)) fail('Your access has ended. Call us and we can open it again.', 403);
    return { ...s, now };
  }

  const family = {
    async startSignIn({ invite }) {
      const a = await accessByInvite(invite);
      const now = await nowIso();
      const p = await one('select * from cds_prospects where id=$1', [a.prospect_id]);
      if (!R.accessOpen(a, now)) return { open: false, first_name: p.first_name, message: 'This invitation has ended. Call us at 417-218-2888 and we can open it again.' };
      const c = await ghl.get(p.ghl_contact_id) || {};
      return { open: true, first_name: p.first_name, expires_at: a.expires_at,
        invited_by: a.invited_by.split('@')[0].replace(/^\w/, m => m.toUpperCase()),
        channels: [c.phone && { channel: 'sms', to: R.maskPhone(c.phone) }, c.email && { channel: 'email', to: R.maskEmail(c.email) }].filter(Boolean) };
    },
    // Sends a code ONLY because the invited person asked for it (decision 3).
    async sendCode({ invite, channel }) {
      const a = await accessByInvite(invite);
      const now = await nowIso();
      if (!R.accessOpen(a, now)) fail('This invitation has ended. Call us and we can open it again.', 403);
      const recent = await one(`select count(*)::int as n from cds_codes where access_id=$1 and created_at > now() - interval '15 minutes'`, [a.id]);
      if (recent.n >= 3) fail('Too many codes asked for. Please wait 15 minutes or call us.', 429);
      const p = await one('select * from cds_prospects where id=$1', [a.prospect_id]);
      const c = await ghl.get(p.ghl_contact_id) || {};
      const to = channel === 'email' ? c.email : c.phone;
      const code = await crypto.code();
      await q('insert into cds_codes (access_id, code_hash, channel, expires_at) values ($1,$2,$3,$4)',
        [a.id, await crypto.hash(a.id + ':' + code), channel, addMin(now, R.CODE_MINUTES)]);
      const sent = await message({ template: 'fam_code', channel, audience: 'family', prospect_id: p.id, to, vars: { code }, by: 'system', automatic: true });
      await audit('family:' + p.id, 'code_requested', 'access:' + a.id, { channel, status: sent.status });
      if (sent.status === 'held' || sent.status === 'failed') {
        return { sent: false, message: 'We couldn\'t send your code right now. Please call us at 417-218-2888 and we\'ll help you sign in.' };
      }
      return { sent: true, to: sent.to_display, practice_code: deps.mode === 'practice' ? code : undefined };
    },
    async verifyCode({ invite, code }) {
      const a = await accessByInvite(invite);
      const now = await nowIso();
      if (!R.accessOpen(a, now)) fail('This invitation has ended. Call us and we can open it again.', 403);
      const c = await one(`select * from cds_codes where access_id=$1 and used_at is null order by created_at desc limit 1`, [a.id]);
      if (!c || new Date(c.expires_at) <= new Date(now)) fail('That code has expired. Ask for a new one.', 400);
      if (c.tries >= R.CODE_MAX_TRIES) fail('Too many tries. Ask for a new code.', 429);
      const ok = c.code_hash === await crypto.hash(a.id + ':' + String(code || '').replace(/\D/g, ''));
      if (!ok) {
        await q('update cds_codes set tries=tries+1 where id=$1', [c.id]);
        fail('That code doesn\'t match. Check the numbers and try again.', 400);
      }
      await q('update cds_codes set used_at=now() where id=$1', [c.id]);
      const token = await crypto.token();
      const sessEnd = a.expires_at && new Date(a.expires_at) < new Date(addDays(now, R.SESSION_DAYS)) ? a.expires_at : addDays(now, R.SESSION_DAYS);
      await q('insert into cds_sessions (access_id, token_hash, expires_at) values ($1,$2,$3)', [a.id, await crypto.hash(token), sessEnd]);
      await q('update cds_access set last_sign_in_at=now() where id=$1', [a.id]);
      await stageIf(a.prospect_id, ['access_approved', 'invited'], 'browsing', 'family:' + a.prospect_id, 'First sign-in');
      await audit('family:' + a.prospect_id, 'signed_in', 'access:' + a.id);
      return { session: token };
    },
    async me({ session }) {
      const s = await familySession(session);
      const p = await one('select first_name, kind, needs from cds_prospects where id=$1', [s.prospect_id]);
      const needs = R.cleanNeeds((typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs || {}).match || {});
      const saved = await one('select count(*)::int n from cds_saved where prospect_id=$1', [s.prospect_id]);
      return { first_name: p.first_name, kind: p.kind, access_expires: s.access_expires, provider_choice: PROVIDER_CHOICE, needs, has_needs: R.hasNeeds(needs), saved_count: saved.n };
    },
    async browse({ session, filters, useNeeds }) {
      const s = await familySession(session);
      let needs = null;
      if (useNeeds) {
        const p = await one('select needs from cds_prospects where id=$1', [s.prospect_id]);
        needs = R.cleanNeeds((typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs || {}).match || {});
      }
      const saved = new Set((await q('select pool_id from cds_saved where prospect_id=$1', [s.prospect_id])).map(r => r.pool_id));
      const rows = [];
      for (const c of await listedCaregivers()) {
        const card = await familyCard(c, s.now, filters || {}, needs);
        if (card) rows.push({ ...card, saved: saved.has(card.id) });
      }
      const total = (await listedCaregivers()).length;
      await audit('family:' + s.prospect_id, 'browsed', null, { filters: filters || {}, shown: rows.length });
      return { caregivers: R.sortMatches(rows), total, using_needs: !!(needs && R.hasNeeds(needs)) };
    },
    async profile({ session, id }) {
      const s = await familySession(session);
      const c = await loadCaregiver(id);
      if (!c || c.listing.state === 'not_listed') fail('This caregiver isn\'t available in the directory right now.', 404);
      await audit('family:' + s.prospect_id, 'viewed_profile', 'pool:' + id);
      const open = await one(`select status from cds_introductions where prospect_id=$1 and pool_id=$2 and status not in ('closed','caregiver_no','not_available')`, [s.prospect_id, id]);
      const sv = await one('select 1 as x from cds_saved where prospect_id=$1 and pool_id=$2', [s.prospect_id, id]);
      const pr = await one('select needs from cds_prospects where id=$1', [s.prospect_id]);
      const needs = R.cleanNeeds((typeof pr.needs === 'string' ? JSON.parse(pr.needs) : pr.needs || {}).match || {});
      const facts = { ...(c.profile.approved || {}), availability: c.profile.availability, hours_min: c.profile.hours_min, hours_max: c.profile.hours_max };
      const fit = R.hasNeeds(needs) ? (R.needsMatch(facts, needs) || { ...R.needsMatch(facts, { ...needs, county: null }), outside_county: needs.county }) : null;
      return { caregiver: { ...(await familyProfile(c, s.now)), fit }, open_request: open ? R.INTRO_STATUS[open.status].family : null, saved: !!sv };
    },
    async requestIntro({ session, pool_id, how, preferred_times }) {
      const s = await familySession(session);
      if (!R.INTRO_HOW[how]) fail('Choose how you\'d like to meet.');
      const c = await loadCaregiver(pool_id);
      if (!c || c.listing.state === 'not_listed') fail('This caregiver isn\'t available right now.', 404);
      const exists = await one(`select id from cds_introductions where prospect_id=$1 and pool_id=$2 and status not in ('closed','caregiver_no','not_available')`, [s.prospect_id, pool_id]);
      if (exists) fail('You already asked to meet ' + c.pool.first_name + '. You can see where it stands on My requests.');
      const intro = await one(`insert into cds_introductions (prospect_id, pool_id, how, preferred_times) values ($1,$2,$3,$4) returning *`,
        [s.prospect_id, pool_id, how, String(preferred_times || '').slice(0, 300)]);
      const p = await one('select first_name from cds_prospects where id=$1', [s.prospect_id]);
      await stageIf(s.prospect_id, ['access_approved', 'invited', 'browsing'], 'intro_requested', 'family:' + s.prospect_id, 'Asked to meet ' + c.pool.first_name);
      await task('ask_caregiver', 'Ask ' + c.pool.first_name + ' about meeting ' + p.first_name, { intro_id: intro.id, pool_id, prospect_id: s.prospect_id }, 'ask_caregiver:' + intro.id);
      await audit('family:' + s.prospect_id, 'requested_intro', 'intro:' + intro.id, { pool_id, how });
      return { ok: true, status: R.INTRO_STATUS.sent.family };
    },
    async setNeeds({ session, needs }) {
      const s = await familySession(session);
      const clean = R.cleanNeeds(needs);
      await q(`update cds_prospects set needs = needs || jsonb_build_object('match', $2::jsonb), updated_at=now() where id=$1`, [s.prospect_id, JSON.stringify(clean)]);
      await audit('family:' + s.prospect_id, 'set_needs', 'prospect:' + s.prospect_id);
      return { ok: true, needs: clean };
    },
    // A private shortlist. Saving never contacts the caregiver or the office.
    async saveCaregiver({ session, pool_id, saved }) {
      const s = await familySession(session);
      if (saved) {
        const c = await loadCaregiver(pool_id);
        if (!c || c.listing.state === 'not_listed') fail('This caregiver isn\'t available in the directory right now.', 404);
        await q('insert into cds_saved (prospect_id, pool_id) values ($1,$2) on conflict do nothing', [s.prospect_id, pool_id]);
      } else await q('delete from cds_saved where prospect_id=$1 and pool_id=$2', [s.prospect_id, pool_id]);
      const n = await one('select count(*)::int n from cds_saved where prospect_id=$1', [s.prospect_id]);
      return { ok: true, saved: !!saved, saved_count: n.n };
    },
    async saved({ session }) {
      const s = await familySession(session);
      const p = await one('select needs from cds_prospects where id=$1', [s.prospect_id]);
      const needs = R.cleanNeeds((typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs || {}).match || {});
      const rows = await q('select pool_id, saved_at from cds_saved where prospect_id=$1 order by saved_at desc', [s.prospect_id]);
      const out = [];
      for (const r of rows) {
        const c = await loadCaregiver(r.pool_id);
        if (!c || c.listing.state === 'not_listed') { out.push({ id: r.pool_id, first_name: c ? c.pool.first_name : 'Caregiver', unavailable: true, saved_at: r.saved_at }); continue; }
        const card = await familyCard(c, s.now, {}, null);
        const full = await familyProfile(c, s.now);
        const fit = R.hasNeeds(needs) ? R.needsMatch({ ...(c.profile.approved || {}), availability: c.profile.availability, hours_min: c.profile.hours_min, hours_max: c.profile.hours_max }, { ...needs, county: null }) : null;
        out.push({ ...full, ...card, fit, saved_at: r.saved_at, saved: true });
      }
      return { saved: out, has_needs: R.hasNeeds(needs) };
    },
    async myRequests({ session }) {
      const s = await familySession(session);
      const rows = await q(`select i.*, p.first_name as cg_first from cds_introductions i join attendant_pool p on p.id=i.pool_id
                            where i.prospect_id=$1 order by i.created_at desc`, [s.prospect_id]);
      return { requests: rows.map(r => ({
        id: r.id, pool_id: r.pool_id, caregiver: r.cg_first, how: R.INTRO_HOW[r.how], status: r.status,
        status_text: R.INTRO_STATUS[r.status].family, meet_at: r.status === 'scheduled' ? r.meet_at : null,
        meet_details: r.status === 'scheduled' ? r.meet_details : null, created_at: r.created_at,
        steps: ['sent', 'asked', 'caregiver_yes', 'scheduled', 'met'].map(k => ({ key: k, label: R.INTRO_STATUS[k].family,
          done: ['sent', 'asked', 'caregiver_yes', 'scheduled', 'met'].indexOf(k) <= ['sent', 'asked', 'caregiver_yes', 'scheduled', 'met'].indexOf(r.status) })),
      })) };
    },
    async signOut({ session }) {
      if (session) await q('update cds_sessions set ended_at=now() where token_hash=$1', [await crypto.hash(session)]);
      return { ok: true };
    },
  };

  // ================= CAREGIVER =================
  async function caregiverLink(token) {
    if (!token) fail('This link is incomplete. Call us and we\'ll send a new one.', 401);
    const l = await one('select * from cds_cg_links where token_hash=$1', [await crypto.hash(token)]);
    const now = await nowIso();
    if (!l || l.revoked_at || new Date(l.expires_at) <= new Date(now)) fail('This link has ended. Call us at 417-218-2888 and we\'ll send a new one.', 401);
    await q('update cds_cg_links set last_used_at=now() where id=$1', [l.id]);
    return { pool_id: l.pool_id, now };
  }
  async function ensureProfile(poolId) {
    await q('insert into cds_cg_profiles (pool_id) values ($1) on conflict (pool_id) do nothing', [poolId]);
    await q('insert into cds_screening (pool_id) values ($1) on conflict (pool_id) do nothing', [poolId]);
  }

  const caregiver = {
    async home({ link }) {
      const { pool_id, now } = await caregiverLink(link);
      await ensureProfile(pool_id);
      const c = await loadCaregiver(pool_id);
      const hasAuth = !!c.screening.raw.authorization_signed_at;
      const intros = await q(`select i.id, i.how, i.preferred_times, i.status, i.meet_at, i.meet_details, f.first_name, f.town
        from cds_introductions i join cds_prospects f on f.id=i.prospect_id where i.pool_id=$1 and i.status in ('asked','caregiver_yes','scheduled') order by i.created_at`, [pool_id]);
      const reg = c.screening.raw;
      return {
        first_name: c.pool.first_name,
        worked_here_before: c.pool.worked_here_before === true,
        checklist: R.caregiverChecklist({ profile: c.profile, consents: c.consents, screening: c.screening, hasAuth }),
        draft: c.profile.draft || {},
        verified_certs: ((c.profile.approved || {}).certs) || [],
        review_status: c.profile.review_status, review_note: c.profile.review_status === 'changes_requested' ? c.profile.review_note : null,
        photo_url: c.profile.photo_draft ? await media.url(c.profile.photo_draft) : (c.profile.photo_approved ? await media.url(c.profile.photo_approved) : null),
        video_url: c.profile.video_draft ? await media.url(c.profile.video_draft) : (c.profile.video_approved ? await media.url(c.profile.video_approved) : null),
        video_status: c.profile.video_draft ? (c.profile.video_draft === c.profile.video_approved ? 'approved' : 'waiting') : (c.profile.video_approved ? 'approved' : 'none'),
        availability: c.profile.availability || {}, hours_min: c.profile.hours_min, hours_max: c.profile.hours_max,
        availability_confirmed_text: R.agoText(c.profile.availability_confirmed_at, now),
        accepting_intros: c.profile.accepting_intros, paused: c.profile.paused, withdrawn: !!c.profile.withdrawn_at,
        consents: { profile: R.hasConsent(c.consents, 'profile'), video: R.hasConsent(c.consents, 'video'), contact: R.hasConsent(c.consents, 'contact'), public: R.hasConsent(c.consents, 'public') },
        contact_preview: contactFor(c.pool),
        consent_wording: CONSENT_WORDING,
        requirements: {
          explainer: FCSR_EXPLAINER,
          registered_told_us: !!(reg.reg_pending_at || reg.reg_verified_at),
          authorization_done: hasAuth,
          // Caregivers see progress only, never screening details.
          screening_text: c.screening.eligible ? 'Screening complete' : 'Screening in progress',
        },
        listing_text: { complete: 'Listed: Screening complete', in_progress: 'Listed: Screening in progress', not_listed: 'Not listed yet' }[c.listing.state],
        // Caregiver-safe explanation. Never reveals screening results.
        listing_note: c.listing.state === 'complete' ? 'Families can find you, and your screening is complete.'
          : c.listing.state === 'in_progress' ? 'Families can find you. Your profile says your screening is still in progress.'
          : c.screening.findings ? 'You aren\'t listed right now. Our office will call you about next steps.'
          : ({ 'Waiting for office review': 'Our office will call you soon to get started.', 'Profile not approved yet': c.profile.review_status === 'submitted' ? 'Your profile is with our office for review.' : 'Finish the steps below and send your profile for review.',
               'No listing consent': 'Give your OK to be listed on the last step.', 'Paused': 'You paused introductions. Turn them back on any time.', 'Not accepting introductions': 'You paused introductions. Turn them back on any time.',
               'Caregiver removed their listing': 'You removed your listing. You can set it up again any time.', 'FCSR steps not started': 'Finish the state requirements step to be listed.', 'Screening in progress': 'Your screening is in progress. Families will see your profile as soon as it\'s complete.' }[c.listing.reason] || 'Finish the steps below to be listed.'),
        intros: intros.map(i => ({ id: i.id, family: i.first_name, town: i.town, how: R.INTRO_HOW[i.how], preferred_times: i.preferred_times,
          status: i.status, meet_at: i.status === 'scheduled' ? i.meet_at : null, meet_details: i.status === 'scheduled' ? i.meet_details : null })),
      };
    },
    async saveProfile({ link, draft }) {
      const { pool_id } = await caregiverLink(link);
      await ensureProfile(pool_id);
      const { profile, errors } = R.cleanProfileDraft(draft || {});
      if (errors.length) fail('Some answers are too long: ' + errors.join(', '));
      await q(`update cds_cg_profiles set draft = draft || $2::jsonb,
               review_status = case when review_status='approved' then 'draft' else review_status end, updated_at=now() where pool_id=$1`,
        [pool_id, JSON.stringify(profile)]);
      if (typeof (draft || {}).worked_here_before === 'boolean') await q('update attendant_pool set worked_here_before=$2 where id=$1', [pool_id, draft.worked_here_before]);
      await audit('caregiver:' + pool_id, 'saved_profile', 'pool:' + pool_id, { fields: Object.keys(profile) });
      return { ok: true };
    },
    // Days and times go live straight away. No office approval needed.
    async saveAvailability({ link, availability, hours_min, hours_max, accepting_intros }) {
      const { pool_id } = await caregiverLink(link);
      await ensureProfile(pool_id);
      const av = R.cleanAvailability(availability || {});
      const hmin = hours_min === '' || hours_min == null ? null : Math.max(0, Math.min(80, parseInt(hours_min, 10) || 0));
      const hmax = hours_max === '' || hours_max == null ? null : Math.max(0, Math.min(80, parseInt(hours_max, 10) || 0));
      await q(`update cds_cg_profiles set availability=$2::jsonb, hours_min=$3, hours_max=$4, accepting_intros=coalesce($5, accepting_intros),
               availability_confirmed_at=now(), paused = case when $5 is true then false else paused end, updated_at=now() where pool_id=$1`,
        [pool_id, JSON.stringify(av), hmin, hmax, accepting_intros === undefined ? null : !!accepting_intros]);
      await audit('caregiver:' + pool_id, 'updated_availability', 'pool:' + pool_id);
      return { ok: true };
    },
    async uploadMedia({ link, kind, mime, data }) {
      const { pool_id } = await caregiverLink(link);
      await ensureProfile(pool_id);
      if (!['photo', 'video'].includes(kind)) fail('Only a photo or a video can be added here.');
      if (kind === 'photo' && !/^image\/(jpeg|png|webp|heic)$/.test(mime)) fail('Please choose a photo (JPG, PNG or HEIC).');
      if (kind === 'video' && !/^video\//.test(mime)) fail('Please choose a video.');
      const id = await media.put({ pool_id, kind, mime, data, by: 'caregiver:' + pool_id });
      await q(`update cds_cg_profiles set ${kind}_draft=$2, review_status = case when review_status='approved' then 'draft' else review_status end, updated_at=now() where pool_id=$1`, [pool_id, id]);
      await audit('caregiver:' + pool_id, 'uploaded_' + kind, 'media:' + id);
      return { ok: true };
    },
    // Videos go straight from the phone to private storage (too big to pass
    // through the server): start gives a one-time upload address, finish checks
    // the file arrived and puts it up for office review.
    async startVideoUpload({ link, mime, size }) {
      const { pool_id } = await caregiverLink(link);
      await ensureProfile(pool_id);
      if (!/^video\//.test(String(mime || ''))) fail('Please choose a video.');
      const n = Number(size) || 0;
      if (n <= 0) fail('That video could not be read.');
      if (n > VIDEO_MAX_BYTES) fail('That video file is too big (the limit is 50 MB). Try recording it right here on this page, or record a shorter video, about 1 minute.');
      const up = await media.signUpload({ pool_id, kind: 'video', mime, by: 'caregiver:' + pool_id });
      return { media_id: up.media_id, upload_url: up.upload_url };
    },
    async finishVideoUpload({ link, media_id }) {
      const { pool_id } = await caregiverLink(link);
      const m = await one(`select id from cds_media where id=$1 and pool_id=$2 and kind='video'`, [media_id, pool_id]);
      if (!m) fail('That video could not be found. Please try again.');
      if (!(await media.confirm(media_id))) fail('The video didn\'t finish sending. Please try again.');
      await q(`update cds_cg_profiles set video_draft=$2, review_status = case when review_status='approved' then 'draft' else review_status end, updated_at=now() where pool_id=$1`, [pool_id, media_id]);
      await audit('caregiver:' + pool_id, 'uploaded_video', 'media:' + media_id);
      return { ok: true };
    },
    async removeVideo({ link }) {
      const { pool_id } = await caregiverLink(link);
      await q('update cds_cg_profiles set video_draft=null, video_approved=null, updated_at=now() where pool_id=$1', [pool_id]);
      await audit('caregiver:' + pool_id, 'removed_video', 'pool:' + pool_id);
      return { ok: true };
    },
    async setRegistration({ link, answer }) {
      const { pool_id } = await caregiverLink(link);
      await ensureProfile(pool_id);
      if (!['already', 'done'].includes(answer)) fail('Choose an answer.');
      await q(`update cds_screening set reg_pending_at=coalesce(reg_pending_at, now()), reg_pending_how=$2, updated_at=now() where pool_id=$1`,
        [pool_id, answer === 'already' ? 'Caregiver says already registered' : 'Caregiver tapped "I\'ve registered"']);
      const p = await one('select first_name from attendant_pool where id=$1', [pool_id]);
      await task('verify_registration', 'Verify ' + p.first_name + '\'s FCSR registration and request the screening', { pool_id }, 'verify_registration:' + pool_id);
      await audit('caregiver:' + pool_id, 'registration_told_us', 'pool:' + pool_id, { answer });
      return { ok: true };
    },
    async submitAuthorization({ link, legal_first, legal_middle, legal_last, legal_suffix, other_names, dob, ssn, agree }) {
      const { pool_id, now } = await caregiverLink(link);
      await ensureProfile(pool_id);
      if (!agree) fail('Please check the box to authorize the screening.');
      const digits = String(ssn || '').replace(/\D/g, '');
      if (digits.length !== 9) fail('Please enter all 9 digits of your Social Security number.');
      if (deps.mode === 'practice' && digits[0] !== '9') fail('Practice mode: use a made-up number that starts with 9. Never a real one.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ''))) fail('Please enter your date of birth.');
      const age = R.ageOn(dob, now);
      if (age === null || age < 14 || age > 110) fail('Please check your date of birth.');
      if (!String(legal_first || '').trim() || !String(legal_last || '').trim()) fail('Please enter your legal first and last name.');
      await q(`update cds_screening set legal_first=$2, legal_middle=$3, legal_last=$4, dob=$5, ssn_last4=$6, legal_suffix=$7, other_names=$8, authorization_signed_at=now(), updated_at=now() where pool_id=$1`,
        [pool_id, String(legal_first).trim().slice(0, 60), String(legal_middle || '').trim().slice(0, 60), String(legal_last).trim().slice(0, 60), dob, digits.slice(-4),
         ['', 'Jr.', 'Sr.', 'II', 'III', 'IV'].includes(legal_suffix || '') ? (legal_suffix || null) : null, String(other_names || '').trim().slice(0, 120) || null]);
      await q(`insert into cds_screening_secret (pool_id, ssn_ciphertext) values ($1,$2)
               on conflict (pool_id) do update set ssn_ciphertext=excluded.ssn_ciphertext, created_at=now()`, [pool_id, await crypto.encrypt(digits)]);
      await audit('caregiver:' + pool_id, 'signed_screening_authorization', 'pool:' + pool_id);
      return { ok: true };
    },
    async giveConsent({ link, kind }) {
      const { pool_id } = await caregiverLink(link);
      const w = CONSENT_WORDING[kind];
      if (!w) fail('Unknown consent');
      await q(`update cds_consents set withdrawn_at=now() where pool_id=$1 and kind=$2 and withdrawn_at is null`, [pool_id, kind]);
      await q('insert into cds_consents (pool_id, kind, wording_version, wording) values ($1,$2,$3,$4)', [pool_id, kind, w.version, w.text]);
      await audit('caregiver:' + pool_id, 'consent_given', 'pool:' + pool_id, { kind, version: w.version });
      return { ok: true };
    },
    async withdrawConsent({ link, kind }) {
      const { pool_id } = await caregiverLink(link);
      await q(`update cds_consents set withdrawn_at=now() where pool_id=$1 and kind=$2 and withdrawn_at is null`, [pool_id, kind]);
      if (kind === 'video') await q('update cds_cg_profiles set video_approved=null where pool_id=$1', [pool_id]);
      await audit('caregiver:' + pool_id, 'consent_withdrawn', 'pool:' + pool_id, { kind });
      return { ok: true };
    },
    async submitForReview({ link }) {
      const { pool_id } = await caregiverLink(link);
      const c = await loadCaregiver(pool_id);
      const d = c.profile.draft || {};
      const missing = [];
      if (!d.about_me) missing.push('About me');
      if (!d.town) missing.push('Your town');
      if (!(d.counties || []).length) missing.push('Counties you work in');
      if (!c.profile.photo_draft && !c.profile.photo_approved) missing.push('Your photo');
      if (!R.hasConsent(c.consents, 'profile')) missing.push('Your consent to be listed');
      if (missing.length) fail('Before sending for review, please add: ' + missing.join(', ') + '.');
      await q(`update cds_cg_profiles set review_status='submitted', review_note=null, updated_at=now() where pool_id=$1`, [pool_id]);
      await task('review_profile', 'Review ' + c.pool.first_name + '\'s profile', { pool_id }, 'review_profile:' + pool_id + ':' + Date.parse(await nowIso()));
      await audit('caregiver:' + pool_id, 'submitted_for_review', 'pool:' + pool_id);
      return { ok: true };
    },
    async setPaused({ link, paused }) {
      const { pool_id } = await caregiverLink(link);
      await q('update cds_cg_profiles set paused=$2, accepting_intros = not $2, updated_at=now() where pool_id=$1', [pool_id, !!paused]);
      await audit('caregiver:' + pool_id, paused ? 'paused' : 'unpaused', 'pool:' + pool_id);
      return { ok: true };
    },
    async withdrawListing({ link }) {
      const { pool_id } = await caregiverLink(link);
      await q('update cds_cg_profiles set withdrawn_at=now(), photo_approved=null, video_approved=null, approved=null, review_status=\'draft\', updated_at=now() where pool_id=$1', [pool_id]);
      await q('update cds_consents set withdrawn_at=now() where pool_id=$1 and withdrawn_at is null', [pool_id]);
      await audit('caregiver:' + pool_id, 'withdrew_listing', 'pool:' + pool_id);
      return { ok: true };
    },
    async respondIntro({ link, id, answer }) {
      const { pool_id } = await caregiverLink(link);
      const i = await one('select * from cds_introductions where id=$1 and pool_id=$2', [id, pool_id]);
      if (!i) fail('We couldn\'t find that request.', 404);
      const to = answer === 'yes' ? 'caregiver_yes' : 'caregiver_no';
      if (!R.canMoveIntro(i.status, to)) fail('This request has already been answered.');
      await q('update cds_introductions set status=$2, updated_at=now() where id=$1', [id, to]);
      const p = await one('select first_name from cds_prospects where id=$1', [i.prospect_id]);
      const cg = await one('select first_name from attendant_pool where id=$1', [pool_id]);
      if (to === 'caregiver_yes') await task('schedule_meeting', 'Call ' + p.first_name + ' to set a time with ' + cg.first_name, { intro_id: id, pool_id, prospect_id: i.prospect_id }, 'schedule:' + id);
      else await task('tell_family', 'Let ' + p.first_name + ' know ' + cg.first_name + ' isn\'t available, and offer help finding someone', { intro_id: id, prospect_id: i.prospect_id }, 'tell_family:' + id);
      await audit('caregiver:' + pool_id, 'answered_intro', 'intro:' + id, { answer });
      return { ok: true };
    },
  };

  // ================= STAFF (office) =================
  function who(staff) { if (!staff) fail('Please sign in to the CDS Hub.', 401); return staff; }

  async function staffCaregiverRow(c, now) {
    const tasksOpen = await one('select count(*)::int n from cds_tasks where pool_id=$1 and done_at is null', [c.pool.id]);
    return {
      id: c.pool.id, first_name: c.pool.first_name, last_name: c.pool.last_name, city: c.pool.city,
      joined: c.pool.submitted_at, source: c.pool.source,
      reviewed: !!c.pool.office_reviewed_at,
      fcsr_answer: c.pool.fcsr_registered_answer,
      screening_step: c.screening.current, screening_label: c.screening.current ? R.SCREENING_STEPS[c.screening.current - 1].label : 'Not started',
      eligible: c.screening.eligible, findings: c.screening.findings,
      review_status: c.profile ? c.profile.review_status : 'none',
      has_photo: !!(c.profile && (c.profile.photo_approved || c.profile.photo_draft)),
      video: c.profile ? (c.profile.video_approved ? 'approved' : c.profile.video_draft ? 'waiting' : 'none') : 'none',
      confirmed_text: c.profile ? R.agoText(c.profile.availability_confirmed_at, now) : 'not confirmed yet',
      confirmed_days: c.profile ? R.daysSince(c.profile.availability_confirmed_at, now) : null,
      listing: c.listing, open_tasks: tasksOpen.n,
    };
  }

  const staff = {
    async overview({ staff: s }) {
      who(s);
      const now = await nowIso();
      const ids = await q("select id from attendant_pool where coalesce(archived,false)=false and (coalesce(source,'') <> 'apply' or exists (select 1 from cds_packets k where k.pool_id = attendant_pool.id and k.list_choice = 'join'))");
      let listed = 0, complete = 0, toReview = 0, stale = 0, notReviewed = 0;
      for (const { id } of ids) {
        const c = await loadCaregiver(id);
        if (!c.pool.office_reviewed_at) notReviewed++;
        if (c.listing.state !== 'not_listed') listed++;
        if (c.screening.eligible) complete++;
        if (c.profile && c.profile.review_status === 'submitted') toReview++;
        if (c.listing.state !== 'not_listed' && (R.daysSince(c.profile.availability_confirmed_at, now) ?? 99) > 30) stale++;
      }
      const waitingCg = await one(`select count(*)::int n from cds_introductions where status in ('sent','asked')`);
      const meetings = await one(`select count(*)::int n from cds_introductions where status='scheduled'`);
      const tasks = await one(`select count(*)::int n from cds_tasks where done_at is null and coalesce(area, 'match') = 'match'`);
      const outboxHeld = await one(`select count(*)::int n from cds_outbox where status in ('held','failed')`);
      const review = await one(`select count(*)::int n from cds_prospects where stage in ('new_request','medicaid_needed','cds_review_pending','potential_review')`);
      const toInvite = await one(`select count(*)::int n from cds_prospects where access_status='approved' and stage='access_approved'`);
      return { tiles: { requests_waiting: waitingCg.n, meetings: meetings.n, to_review: toReview, not_reviewed: notReviewed,
        stale, listed, eligible: complete, open_tasks: tasks.n, messages_not_sent: outboxHeld.n, eligibility_review: review.n, approved_not_invited: toInvite.n }, mode: deps.mode };
    },
    async caregivers({ staff: s }) {
      who(s);
      const now = await nowIso();
      // Applicants with a consumer (caringcds.com/apply) show here only if they chose to be listed.
      const ids = await q("select id from attendant_pool where coalesce(archived,false)=false and (coalesce(source,'') <> 'apply' or exists (select 1 from cds_packets k where k.pool_id = attendant_pool.id and k.list_choice = 'join')) order by submitted_at desc");
      const out = [];
      for (const { id } of ids) out.push(await staffCaregiverRow(await loadCaregiver(id), now));
      return { caregivers: out };
    },
    async caregiver({ staff: s, id }) {
      who(s);
      const c = await loadCaregiver(id);
      if (!c) fail('Not found', 404);
      const now = await nowIso();
      const scr = c.screening.raw;
      const proofUrl = async mid => (mid ? await media.url(mid) : null);
      return {
        row: await staffCaregiverRow(c, now),
        internal: { first_name: c.pool.first_name, last_name: c.pool.last_name, phone: c.pool.phone, email: c.pool.email, city: c.pool.city,
          zip: c.pool.zip, experience: c.pool.experience, experience_notes: c.pool.experience_notes, applicant_notes: c.pool.applicant_notes,
          staff_notes: c.pool.staff_notes, how_heard: c.pool.how_heard, office_reviewed_at: c.pool.office_reviewed_at, office_reviewed_by: c.pool.office_reviewed_by },
        screening: {
          steps: await Promise.all(c.screening.steps.map(async st => ({ ...st, proof_url: await proofUrl(st.proof),
            checks: st.checks ? await Promise.all(st.checks.map(async ch => ({ ...ch, proof_url: await proofUrl(ch.proof) }))) : undefined }))),
          eligible: c.screening.eligible, findings: c.screening.findings, missing: c.screening.missing,
          legal_name: [scr.legal_first, scr.legal_middle, scr.legal_last, scr.legal_suffix].filter(Boolean).join(' '), dob: scr.dob,
          request_form: scr.authorization_signed_at ? { last: [scr.legal_last, scr.legal_suffix].filter(Boolean).join(' '), first: scr.legal_first, mi: (scr.legal_middle || '').slice(0, 1).toUpperCase(),
            dob: scr.dob ? String(scr.dob).slice(0, 10) : null, other_names: scr.other_names || '', provider_type: 'Personal Care: CDS/CIL (confirm with FCSR)', employer: FCSR_EMPLOYER } : null,
          ssn_last4: scr.ssn_last4, authorization_signed_at: scr.authorization_signed_at,
          ssn_on_file: !!(await one('select 1 as x from cds_screening_secret where pool_id=$1', [id])),
          follow_up: scr.follow_up, follow_up_due: scr.follow_up_due,
          age: R.ageOn(scr.dob, now),
        },
        profile: c.profile ? {
          draft: c.profile.draft, approved: c.profile.approved, review_status: c.profile.review_status, review_note: c.profile.review_note,
          photo_draft_url: await proofUrl(c.profile.photo_draft), photo_approved_url: await proofUrl(c.profile.photo_approved),
          video_draft_url: await proofUrl(c.profile.video_draft), video_approved_url: await proofUrl(c.profile.video_approved),
          availability_text: R.availabilitySummary(c.profile.availability), hours_min: c.profile.hours_min, hours_max: c.profile.hours_max,
          accepting_intros: c.profile.accepting_intros, paused: c.profile.paused, withdrawn_at: c.profile.withdrawn_at,
        } : null,
        consents: c.consents,
        family_preview: c.profile && c.profile.approved ? await familyProfile(c, now) : null,
        listing: c.listing,
        outbox: await q('select * from cds_outbox where pool_id=$1 order by created_at desc limit 20', [id]),
        audit: await q(`select * from cds_audit where target=$1 order by at desc limit 30`, ['pool:' + id]),
      };
    },
    async markReviewed({ staff: s, id, note }) {
      who(s);
      await q(`update attendant_pool set office_reviewed_at=coalesce(office_reviewed_at, now()), office_reviewed_by=coalesce(office_reviewed_by,$2),
               staff_notes = case when $3::text <> '' then concat_ws(E'\\n', staff_notes, $3::text) else staff_notes end where id=$1`, [id, s, String(note || '').slice(0, 1000)]);
      await ensureProfile(id);
      const pool = await one('select fcsr_registered_answer from attendant_pool where id=$1', [id]);
      if (pool.fcsr_registered_answer && pool.fcsr_registered_answer !== 'yes') {
        await q(`update cds_screening set reg_needed_at=coalesce(reg_needed_at, now()), reg_needed_source=coalesce(reg_needed_source, 'Sign-up form: ' || $2) where pool_id=$1`,
          [id, pool.fcsr_registered_answer === 'no' ? 'not registered' : 'not sure']);
      }
      await audit('staff:' + s, 'office_review_done', 'pool:' + id);
      return { ok: true };
    },
    // Creates the caregiver's private link and records the message. Practice
    // mode returns the link so the preview can open it; nothing is sent.
    async sendProfileLink({ staff: s, id, channel }) {
      who(s);
      const pool = await one('select * from attendant_pool where id=$1', [id]);
      if (!pool.office_reviewed_at) fail('Finish the office review first.');
      await ensureProfile(id);
      const token = await crypto.token();
      const now = await nowIso();
      await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)', [id, await crypto.hash(token), s, addDays(now, R.CAREGIVER_LINK_DAYS)]);
      const link = links.caregiver(token);
      const m = await message({ template: 'cg_profile_link', channel: channel || 'sms', audience: 'caregiver', pool_id: id,
        to: (channel || 'sms') === 'sms' ? pool.phone : pool.email, vars: { first: pool.first_name, link }, by: s });
      // Sending the profile link means the hello call happened: close the sign-up to-dos.
      await q(`update cds_tasks set done_at=now(), done_by=$2 where pool_id=$1 and kind='cg_signup' and done_at is null`, [id, s]);
      await audit('staff:' + s, 'sent_profile_link', 'pool:' + id, { status: m.status });
      return { status: m.status, error: m.error, practice_link: deps.mode === 'practice' ? link : undefined };
    },
    // The Directory line on a consumer's Hub page (2026-11-25): where each consumer stands.
    async consumerDirectory({ staff: s, consumer_ids }) {
      who(s);
      const ids = (Array.isArray(consumer_ids) ? consumer_ids : []).map(String).slice(0, 500);
      const cfg = await setting('consumer_directory', {});
      const out = {};
      for (const id of ids) {
        const p = await one('select id, stage, access_status, hold_reason, ghl_contact_id, consumer_id from cds_prospects where consumer_id=$1', [id]);
        if (!p) { out[id] = { state: 'none' }; continue; }
        const a = await one('select invited_at, last_sign_in_at, revoked_at from cds_access where prospect_id=$1 order by invited_at desc limit 1', [p.id]);
        const m = await one(`select status, error, created_at from cds_outbox where prospect_id=$1 and template='fam_invite_consumer' order by created_at desc limit 1`, [p.id]);
        const ct = await consumerContact(p);
        const lastQ = await one(`select created_at from cds_outbox where prospect_id=$1 and template='fam_directory_quarterly' and status='sent' order by created_at desc limit 1`, [p.id]);
        out[id] = { has_phone: !!ct.phone, has_email: !!ct.email, last_quarterly: lastQ && lastQ.created_at, state: p.access_status !== 'approved' ? 'ended' : !a ? 'approved' : a.revoked_at ? 'approved' : a.last_sign_in_at ? 'signed_in' : 'invited',
          invited_at: a && a.invited_at, last_sign_in_at: a && a.last_sign_in_at, message: m ? { status: m.status, error: m.error, at: m.created_at } : null, hold_reason: p.hold_reason };
      }
      return { consumers: out, listed: await listedCompleteCount(), invites_live: cfg.invites_live === true, invite_after_listed: cfg.invite_after_listed == null ? 10 : Number(cfg.invite_after_listed) };
    },
    async consumerDirectoryInvite({ staff: s, consumer_id }) {
      who(s);
      const c = (await consumerRoster()).find(x => String(x.id) === String(consumer_id));
      if (!c) fail('That consumer was not found on the roster.');
      if (!CD_LIVE.includes(String(c.status || '').toLowerCase())) fail('Only active and starting consumers get the directory.');
      const r = await ensureConsumerAccess(c, 'staff:' + s);
      if (r.state === 'no_contact') fail('Add a phone or email for this consumer first.');
      const m = await inviteConsumer(r.prospect, s);
      return { status: m.status, error: m.error };
    },
    // Personal sign-up links for former Caring Companions caregivers (2026-11-24).
    // Makes the links only. Sending them is a separate step she approves.
    // people: [{ first_name, last_name, phone, email, city }]
    async createInvites({ staff: s, people, batch }) {
      who(s);
      const list = Array.isArray(people) ? people.slice(0, 1000) : [];
      const b = String(batch || 'former-caregivers').trim().slice(0, 60);
      const out = [];
      for (const x of list) {
        const d = digits10(x.phone);
        const first = String(x.first_name || '').trim().slice(0, 60);
        if (!first || (d.length !== 10 && !String(x.email || '').includes('@'))) { out.push({ first_name: first, skipped: 'needs a first name and a phone or email' }); continue; }
        const token = await crypto.token();
        const phone = d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : null;
        await q(`insert into cds_cg_invites (token_hash, first_name, last_name, phone, email, city, batch, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [await crypto.hash(token), first, String(x.last_name || '').trim().slice(0, 60) || null, phone,
           String(x.email || '').trim().slice(0, 200) || null, String(x.city || '').trim().slice(0, 60) || null, b, s]);
        out.push({ first_name: first, phone, link: links.signup(token) });
      }
      await audit('staff:' + s, 'created_signup_invites', 'batch:' + b, { made: out.filter(o => o.link).length, skipped: out.filter(o => o.skipped).length });
      return { batch: b, invites: out };
    },
    async sendRegistrationSteps({ staff: s, id, channel }) {
      who(s);
      const pool = await one('select * from attendant_pool where id=$1', [id]);
      await ensureProfile(id);
      const l = await one('select id from cds_cg_links where pool_id=$1 and revoked_at is null and expires_at > now()', [id]);
      if (!l) fail('Send the profile link first, so the caregiver has a place to tell us they registered.');
      // Each message carries its own link (tokens are never stored in plain text).
      // Earlier links keep working until they expire or the office ends them.
      const token = await crypto.token();
      const now = await nowIso();
      await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)', [id, await crypto.hash(token), s, addDays(now, R.CAREGIVER_LINK_DAYS)]);
      const link = links.caregiver(token) + '#requirements';
      const ch = channel || 'sms';
      const m = await message({ template: 'cg_fcsr_steps', channel: ch, audience: 'caregiver', pool_id: id, to: ch === 'sms' ? pool.phone : pool.email,
        vars: { first: pool.first_name, link }, by: s });
      if (m.status === 'sent' || m.status === 'practice') {
        await q(`update cds_screening set instructions_sent_at=now(), instructions_sent_by=$2, instructions_channel=$3,
                 reg_needed_at=coalesce(reg_needed_at, now()), reg_needed_source=coalesce(reg_needed_source,'Office'), updated_at=now() where pool_id=$1`, [id, s, ch]);
      }
      await audit('staff:' + s, 'sent_registration_steps', 'pool:' + id, { status: m.status });
      return { status: m.status, error: m.error, practice_link: deps.mode === 'practice' ? link : undefined };
    },
    // Records one screening status with who, when and proof.
    async recordScreening({ staff: s, id, step, date, method, result, proof, note }) {
      who(s);
      await ensureProfile(id);
      const when = date ? date + 'T12:00:00Z' : await nowIso();
      let proofId = null;
      if (proof && proof.data) proofId = await media.put({ pool_id: id, kind: 'proof', mime: proof.mime, data: proof.data, by: 'staff:' + s });
      const pool = await one('select first_name from attendant_pool where id=$1', [id]);
      if (step === 'reg_needed') {
        await q('update cds_screening set reg_needed_at=$2, reg_needed_source=$3, updated_at=now() where pool_id=$1', [id, when, 'Office lookup: not registered']);
      } else if (step === 'reg_verified') {
        if (!proofId) fail('Add proof of the registry lookup (a screenshot or PDF).');
        await q('update cds_screening set reg_verified_at=$2, reg_verified_by=$3, reg_verified_proof=$4, updated_at=now() where pool_id=$1', [id, when, s, proofId]);
        await finishTask('verify_registration:' + id, s);
      } else if (step === 'screen_pending') {
        if (!['phone', 'form', 'online'].includes(method)) fail('How was the screening requested?');
        const scr = await one('select reg_verified_at, authorization_signed_at from cds_screening where pool_id=$1', [id]);
        if (!scr.reg_verified_at) fail('Verify the registration first. The state needs the person registered before it can screen.');
        if (!scr.authorization_signed_at) fail('The caregiver hasn\'t signed the screening authorization yet.');
        await q('update cds_screening set screen_requested_at=$2, screen_requested_by=$3, screen_requested_method=$4, updated_at=now() where pool_id=$1', [id, when, s, method]);
        await task('fcsr_result', 'Follow up on ' + pool.first_name + '\'s FCSR result (FCSR 866-422-6872)', { pool_id: id }, 'fcsr_result:' + id, addDays(when, 7));
      } else if (step === 'screen_complete') {
        if (!['no_findings', 'findings'].includes(result)) fail('Choose the result.');
        if (!proofId) fail('Add the state\'s result letter as proof.');
        const scr = await one('select screen_requested_at from cds_screening where pool_id=$1', [id]);
        if (!scr.screen_requested_at) fail('Record the screening request first.');
        await q('update cds_screening set screen_result_at=$2, screen_result=$3, screen_proof=$4, screen_recorded_by=$5, updated_at=now() where pool_id=$1', [id, when, result, proofId, s]);
        // The full SSN is no longer needed once the result is in.
        await q('delete from cds_screening_secret where pool_id=$1', [id]);
        await finishTask('fcsr_result:' + id, s);
        if (result === 'findings') await task('owner_review', 'Owner review: ' + pool.first_name + '\'s FCSR result', { pool_id: id }, 'owner_review:' + id);
      } else if (step === 'follow_up') {
        await q('update cds_screening set follow_up=$2, follow_up_due=$3, updated_at=now() where pool_id=$1', [id, String(note || '').slice(0, 500), date || null]);
      } else fail('Unknown step');
      await audit('staff:' + s, 'screening_' + step, 'pool:' + id, { result: result || null, method: method || null, proof: !!proofId });
      return { ok: true };
    },
    // Full SSN for the FCSR request, shown to staff only while the screening is
    // open, and every view is recorded.
    async revealSsn({ staff: s, id, reason }) {
      who(s);
      const sec = await one('select ssn_ciphertext from cds_screening_secret where pool_id=$1', [id]);
      if (!sec) fail('The full number isn\'t on file. It\'s deleted once the FCSR result is recorded. Ask the caregiver to sign the authorization again if a new screening is needed.');
      const digits = await crypto.decrypt(sec.ssn_ciphertext);
      // Any other number they said they used (sealed on the application): FCSR and EDL run on every
      // number (MMAC CDS Program Requirements 4.2.3, 2026-10-22). Shown in the same recorded view.
      const pk = await one(`select answers->>'other_ssn_sealed' o from cds_packets where pool_id=$1`, [id]);
      let other = '';
      if (pk && pk.o) { try { other = String(await crypto.decrypt(pk.o)).split(/[,; ]+/).map(d => d.replace(/\D/g, '')).filter(d => d.length === 9).map(d => d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5)).join(', '); } catch { other = ''; } }
      await audit('staff:' + s, 'ssn_viewed_for_fcsr', 'pool:' + id, { reason: String(reason || 'FCSR screening request').slice(0, 80), other: !!other });
      return { ssn: digits.slice(0, 3) + '-' + digits.slice(3, 5) + '-' + digits.slice(5), other };
    },
    async recordCheck({ staff: s, id, check_key, result, checked_on, proof, note }) {
      who(s);
      const req = await requiredChecks(id);
      if (!req.find(c => c.key === check_key)) fail('That check isn\'t on the required list.');
      if (!['clear', 'not_clear'].includes(result)) fail('Choose clear or not clear.');
      let proofId = null;
      if (proof && proof.data) proofId = await media.put({ pool_id: id, kind: 'proof', mime: proof.mime, data: proof.data, by: 'staff:' + s });
      const scr = await one('select dob from cds_screening where pool_id=$1', [id]);
      const now = await nowIso();
      if (check_key === 'age18') {
        const age = R.ageOn(scr && scr.dob, now);
        if (age === null) fail('No date of birth on file yet.');
        result = age >= 18 ? 'clear' : 'not_clear';
      } else if (!proofId && result === 'clear') fail('Add proof for this check.');
      await q('insert into cds_screening_checks (pool_id, check_key, result, checked_on, proof_media_id, note, recorded_by) values ($1,$2,$3,$4,$5,$6,$7)',
        [id, check_key, result, checked_on || now.slice(0, 10), proofId, String(note || '').slice(0, 500), s]);
      if (result === 'not_clear') {
        const pool = await one('select first_name from attendant_pool where id=$1', [id]);
        await task('owner_review', 'Owner review: ' + pool.first_name + ' did not clear a required check', { pool_id: id }, 'owner_review_check:' + id + ':' + check_key);
      }
      await audit('staff:' + s, 'check_recorded', 'pool:' + id, { check_key, result });
      return { ok: true };
    },
    async reviewProfile({ staff: s, id, decision, note, verified_certs }) {
      who(s);
      const g = await one('select * from cds_cg_profiles where pool_id=$1', [id]);
      if (!g) fail('No profile yet.');
      if (decision === 'approve') {
        const draft = typeof g.draft === 'string' ? JSON.parse(g.draft) : (g.draft || {});
        const approved = { ...draft, certs: (verified_certs || []).filter(c => (draft.certs || []).includes(c)) };
        await q(`update cds_cg_profiles set approved=$2::jsonb, review_status='approved', review_note=null, reviewed_at=now(), reviewed_by=$3,
                 photo_approved=coalesce(photo_draft, photo_approved), video_approved=coalesce(video_draft, video_approved), withdrawn_at=null, updated_at=now() where pool_id=$1`,
          [id, JSON.stringify(approved), s]);
      } else if (decision === 'changes') {
        if (!String(note || '').trim()) fail('Tell the caregiver what to change.');
        await q(`update cds_cg_profiles set review_status='changes_requested', review_note=$2, reviewed_at=now(), reviewed_by=$3, updated_at=now() where pool_id=$1`, [id, String(note).slice(0, 500), s]);
      } else fail('Choose approve or ask for changes.');
      await q(`update cds_tasks set done_at=now(), done_by=$2 where pool_id=$1 and kind='review_profile' and done_at is null`, [id, s]);
      await audit('staff:' + s, 'profile_' + decision, 'pool:' + id);
      return { ok: true };
    },
    async revokeCaregiverLinks({ staff: s, id }) {
      who(s);
      await q('update cds_cg_links set revoked_at=now() where pool_id=$1 and revoked_at is null', [id]);
      await audit('staff:' + s, 'ended_caregiver_links', 'pool:' + id);
      return { ok: true };
    },
    async setListingPaused({ staff: s, id, paused }) {
      who(s);
      await q('update cds_cg_profiles set paused=$2, updated_at=now() where pool_id=$1', [id, !!paused]);
      await audit('staff:' + s, paused ? 'paused_listing' : 'unpaused_listing', 'pool:' + id);
      return { ok: true };
    },

    // ----- families -----
    async prospects({ staff: s }) {
      who(s);
      const now = await nowIso(), days = await setting('medicaid_recheck_days', R.MEDICAID_RECHECK_DAYS);
      const rows = await q(`select p.*, (select row_to_json(a) from (select id, expires_at, revoked_at, invited_at, last_sign_in_at from cds_access where prospect_id=p.id order by invited_at desc limit 1) a) as access,
        (select count(*)::int from cds_introductions where prospect_id=p.id) as intro_count,
        (select count(*)::int from cds_saved where prospect_id=p.id) as saved_count from cds_prospects p order by p.updated_at desc`);
      const out = [];
      for (const r of rows) {
        const a = typeof r.access === 'string' ? JSON.parse(r.access) : r.access;
        const e = await one('select consent_at, dsds_cds, referral_needed from cds_eligibility where prospect_id=$1', [r.id]) || {};
        const last = await lastCheck(r.id);
        const nv = R.nextVerification({ prospect: r, checks: await allChecks(r.id), nowIso: now });
        out.push({ ...r, needs: typeof r.needs === 'string' ? JSON.parse(r.needs) : r.needs, stage_label: R.STAGE_LABEL[r.stage],
          access: a ? { ...a, open: R.accessOpen(a, now), days_left: a.expires_at ? Math.ceil((new Date(a.expires_at) - new Date(now)) / 86400000) : null } : null,
          consent: !!e.consent_at, dsds_cds: e.dsds_cds || 'unknown', referral_needed: e.referral_needed,
          medicaid: last ? { coverage: last.coverage, checked_on: last.checked_on, checked_by: last.checked_by, restrictions: last.restrictions } : null,
          next_verification: nv,
          recheck_due: nv.due,
          statuses: R.fourStatuses({ prospect: r, eligibility: e, lastCheck: last, nowIso: now }),
          gate: await gateFor(r) });
      }
      return { prospects: out };
    },
    async addProspect({ staff: s, first_name, last_name, phone, email, town, county, kind, notes }) {
      who(s);
      if (!String(first_name || '').trim()) fail('First name is needed.');
      if (!phone && !email) fail('A phone or email is needed to send the invitation and codes.');
      const contactId = await ghl.upsert({ first_name, last_name, phone, email, tags: ['cds-directory'] });
      const p = await one(`insert into cds_prospects (ghl_contact_id, first_name, town, county, kind, source, notes) values ($1,$2,$3,$4,$5,'office',$6) returning *`,
        [contactId, String(first_name).trim().slice(0, 60), String(town || '').slice(0, 60), R.COUNTIES.includes(county) ? county : null, kind === 'consumer' ? 'consumer' : 'prospect', String(notes || '').slice(0, 1000)]);
      await event(p.id, 'staff:' + s, 'created', null, 'new_request', kind === 'consumer' ? 'Added by office: existing CDS consumer' : 'Added by office');
      await audit('staff:' + s, 'added_family', 'prospect:' + p.id);
      return { id: p.id };
    },
    async invite({ staff: s, prospect_id, channel }) {
      who(s);
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      if (!p) fail('Not found', 404);
      const g = await gateFor(p);
      if (!g.ok) fail('The invitation can\'t be sent yet. ' + g.why + '.');
      const c = await ghl.get(p.ghl_contact_id) || {};
      const ch = channel || (c.phone ? 'sms' : 'email');
      const to = ch === 'sms' ? c.phone : c.email;
      if (!to) fail('No ' + (ch === 'sms' ? 'phone' : 'email') + ' on file for this family.');
      const now = await nowIso();
      const days = await setting('access_days', R.ACCESS_DAYS);
      const token = await crypto.token();
      await q('update cds_access set revoked_at=now(), revoked_by=$2 where prospect_id=$1 and revoked_at is null', [prospect_id, s + ' (replaced by a new invitation)']);
      const a = await one('insert into cds_access (prospect_id, token_hash, invited_by, expires_at) values ($1,$2,$3,$4) returning id',
        [prospect_id, await crypto.hash(token), s, p.kind === 'consumer' ? null : addDays(now, days)]);
      const link = links.family(token);
      const m = await message({ template: 'fam_invite', channel: ch, audience: 'family', prospect_id, to,
        vars: { first: p.first_name, link, staff: s.split('@')[0].replace(/^\w/, x => x.toUpperCase()) }, by: s });
      if (m.status === 'sent' || m.status === 'practice') {
        await stageIf(prospect_id, ['access_approved'], 'invited', 'staff:' + s, 'Invitation ' + (m.status === 'practice' ? 'recorded (practice)' : 'sent'));
        await q('update cds_prospects set next_action=$2, next_owner=$3, next_due=$4 where id=$1', [prospect_id, 'Check in: did they sign in and find anyone?', s, addDays(now, 7).slice(0, 10)]);
      }
      await finishTask('call_inquiry:' + prospect_id, s);
      await audit('staff:' + s, 'invited_family', 'prospect:' + prospect_id, { access: a.id, status: m.status });
      return { status: m.status, error: m.error, practice_link: deps.mode === 'practice' ? link : undefined };
    },
    async extendAccess({ staff: s, prospect_id, days }) {
      who(s);
      const d = Math.max(1, Math.min(90, parseInt(days, 10) || R.ACCESS_DAYS));
      const a = await one('select * from cds_access where prospect_id=$1 and revoked_at is null order by invited_at desc limit 1', [prospect_id]);
      if (!a) fail('No open invitation to extend. Send a new invitation.');
      const now = await nowIso();
      const base = a.expires_at && new Date(a.expires_at) > new Date(now) ? a.expires_at : now;
      await q('update cds_access set expires_at=$2 where id=$1', [a.id, addDays(base, d)]);
      await audit('staff:' + s, 'extended_access', 'prospect:' + prospect_id, { days: d });
      return { ok: true };
    },
    async revokeAccess({ staff: s, prospect_id }) {
      who(s);
      await q('update cds_access set revoked_at=now(), revoked_by=$2 where prospect_id=$1 and revoked_at is null', [prospect_id, s]);
      await q(`update cds_sessions set ended_at=now() where ended_at is null and access_id in (select id from cds_access where prospect_id=$1)`, [prospect_id]);
      await audit('staff:' + s, 'revoked_access', 'prospect:' + prospect_id);
      return { ok: true };
    },
    async setStage({ staff: s, prospect_id, stage, note }) {
      who(s);
      if (!R.STAGE_LABEL[stage]) fail('Unknown stage');
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      if (!p) fail('Not found', 404);
      const gated = ['access_approved', 'invited', 'browsing', 'intro_requested', 'caregiver_identified'];
      if (gated.includes(stage) && p.access_status !== 'approved') fail('Approve directory access first. Use the eligibility review.');
      const last = await lastCheck(prospect_id), now = await nowIso(), days = await setting('medicaid_recheck_days', R.MEDICAID_RECHECK_DAYS);
      if (stage === 'transition_requested' && !R.medicaidCurrent(last, now, days)) fail('Recheck Medicaid in eMOMED first. Moving toward enrollment needs a check from the last ' + days + ' days, in this calendar month.');
      if (['ready_to_begin', 'services_started'].includes(stage)) {
        if (!p.services_authorized_at) fail('Record the CDS service authorization first. Directory access is not service approval.');
        const r = await readiness(p);
        if (!r.ok) fail('Not ready to begin services yet. Still needed: ' + r.missing.join('; ') + '.');
      }
      if (R.SIDE_STAGES.includes(stage) && !String(note || '').trim()) fail('Add a short reason so the history makes sense later.');
      await q(`update cds_prospects set stage=$2, next_action = case when next_action='Send the private invitation' and $2 <> 'access_approved' then null else next_action end,
               next_due = case when next_action='Send the private invitation' and $2 <> 'access_approved' then null else next_due end, updated_at=now() where id=$1`, [prospect_id, stage]);
      await event(prospect_id, 'staff:' + s, 'stage', p.stage, stage, note);
      await audit('staff:' + s, 'family_stage', 'prospect:' + prospect_id, { stage });
      return { ok: true };
    },

    // ----- eligibility review (office only) -----
    async eligibility({ staff: s, prospect_id }) {
      who(s);
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      if (!p) fail('Not found', 404);
      const e = await one('select * from cds_eligibility where prospect_id=$1', [prospect_id]) || {};
      const checks = await q('select * from cds_medicaid_checks where prospect_id=$1 order by checked_on desc, recorded_at desc', [prospect_id]);
      const now = await nowIso(), days = await setting('medicaid_recheck_days', R.MEDICAID_RECHECK_DAYS);
      const contact = await ghl.get(p.ghl_contact_id) || {};
      return {
        prospect: { ...p, stage_label: R.STAGE_LABEL[p.stage], needs: typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs },
        contact: { phone: contact.phone || '', email: contact.email || '' },
        eligibility: e, checks,
        statuses: R.fourStatuses({ prospect: p, eligibility: e, lastCheck: checks[0], nowIso: now }),
        gate: await gateFor(p),
        next_verification: R.nextVerification({ prospect: p, checks, nowIso: now }),
        readiness: await readiness(p),
        chosen: await chosenFor(p),
        eligible_caregivers: await Promise.all((await q('select id from attendant_pool where coalesce(archived,false)=false order by first_name')).map(async r => {
          const c = await loadCaregiver(r.id); return { id: c.pool.id, first_name: c.pool.first_name, eligible: c.screening.eligible }; })),
        events: await q('select * from cds_prospect_events where prospect_id=$1 order by at desc, id desc', [prospect_id]),
        invited: !!(await one('select 1 as x from cds_access where prospect_id=$1', [prospect_id])),
        saved_caregivers: await q(`select a.first_name, s.saved_at from cds_saved s join attendant_pool a on a.id=s.pool_id where s.prospect_id=$1 order by s.saved_at desc`, [prospect_id]),
        family_needs: R.cleanNeeds((typeof p.needs === 'string' ? JSON.parse(p.needs) : p.needs || {}).match || {}),
        recheck_days: days,
      };
    },
    async recordConsent({ staff: s, prospect_id, from, how }) {
      who(s);
      if (!['consumer', 'authorized_rep'].includes(from)) fail('Who gave permission?');
      if (!String(how || '').trim()) fail('How was permission given? For example: verbally on the phone.');
      await q(`insert into cds_eligibility (prospect_id, consent_at, consent_by, consent_from, consent_how) values ($1, now(), $2, $3, $4)
               on conflict (prospect_id) do update set consent_at=now(), consent_by=$2, consent_from=$3, consent_how=$4, updated_at=now()`, [prospect_id, s, from, String(how).slice(0, 200)]);
      await stageIf(prospect_id, ['new_request'], 'medicaid_needed', 'staff:' + s, 'Permission to check Medicaid given (' + (from === 'consumer' ? 'consumer' : 'authorized representative') + ')');
      await finishTask('call_inquiry:' + prospect_id, s);
      const p = await one('select first_name from cds_prospects where id=$1', [prospect_id]);
      await task('check_medicaid', 'Check ' + p.first_name + '\'s Medicaid coverage in eMOMED', { prospect_id }, 'check_medicaid:' + prospect_id + ':' + (await nowIso()).slice(0, 10));
      await audit('staff:' + s, 'medicaid_consent', 'prospect:' + prospect_id, { from });
      return { ok: true };
    },
    async recordMedicaidCheck({ staff: s, prospect_id, checked_on, method, coverage, restrictions, note }) {
      who(s);
      const e = await one('select consent_at from cds_eligibility where prospect_id=$1', [prospect_id]);
      if (!e || !e.consent_at) fail('Record permission to check Medicaid first.');
      if (!['emomed_web', 'emomed_phone', 'emomed_batch'].includes(method)) fail('How was it checked?');
      if (!['active', 'inactive', 'unable'].includes(coverage)) fail('Choose active, inactive, or unable to verify.');
      if (/\b\d{8,}\b/.test(String(note || '') + ' ' + String(restrictions || ''))) fail('Please don\'t record Medicaid ID numbers or SSNs in notes.');
      const now = await nowIso();
      const day = checked_on || now.slice(0, 10);
      await q(`insert into cds_medicaid_checks (prospect_id, checked_on, method, coverage, restrictions, note, checked_by) values ($1,$2,$3,$4,$5,$6,$7)`,
        [prospect_id, day, method, coverage, String(restrictions || '').slice(0, 300), String(note || '').slice(0, 500), s]);
      await q(`update cds_tasks set done_at=now(), done_by=$2 where prospect_id=$1 and kind in ('check_medicaid','recheck_medicaid') and done_at is null`, [prospect_id, s]);
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      const approved = p.access_status === 'approved';
      if (coverage === 'active') {
        await stageIf(prospect_id, ['new_request', 'medicaid_needed', 'on_hold'], 'cds_review_pending', 'staff:' + s, 'Medicaid active in eMOMED');
        if (p.access_status === 'on_hold') await q(`update cds_prospects set access_status='pending', hold_reason=null where id=$1`, [prospect_id]);
        if (String(restrictions || '').trim()) {
          await q('update cds_prospects set next_action=$2, next_owner=$3, next_due=$4, updated_at=now() where id=$1',
            [prospect_id, 'Review the Medicaid restriction and what it means for CDS', s, addDays(now, 3).slice(0, 10)]);
          await needsAttention(p, 'Needs attention: ' + p.first_name + '\'s Medicaid is active with a restriction (' + String(restrictions).slice(0, 80) + '). Review what it means for CDS.', s, addDays(now, 3));
        }
      } else {
        const reason = coverage === 'inactive' ? 'Medicaid inactive in eMOMED' : 'Couldn\'t verify Medicaid';
        const action = coverage === 'inactive' ? 'Call to talk about Medicaid coverage and next steps' : 'Confirm details and try eMOMED again';
        await q('update cds_prospects set next_action=$2, next_owner=$3, next_due=$4, updated_at=now() where id=$1', [prospect_id, action, s, addDays(now, 7).slice(0, 10)]);
        if (!approved) {
          // Not yet approved: the directory request goes on hold.
          await q(`update cds_prospects set access_status='on_hold', hold_reason=$2 where id=$1`, [prospect_id, reason]);
          if (p.stage !== 'on_hold') { await q(`update cds_prospects set stage='on_hold' where id=$1`, [prospect_id]); await event(prospect_id, 'staff:' + s, 'stage', p.stage, 'on_hold', reason); }
        }
        // Already approved: access stays, but services can't begin and the office is alerted.
        await needsAttention(p, 'Needs attention: ' + p.first_name + ': ' + reason.toLowerCase() + (approved ? ' (directory access stays open; services can\'t begin until coverage is active)' : '') + '. Next: ' + action.toLowerCase() + '.', s, addDays(now, 7));
      }
      await event(prospect_id, 'staff:' + s, 'medicaid_check', null, null, 'eMOMED: ' + coverage + (restrictions ? ' (' + String(restrictions).slice(0, 80) + ')' : ''));
      await audit('staff:' + s, 'medicaid_check', 'prospect:' + prospect_id, { coverage, method });
      return { ok: true };
    },
    async setDsds({ staff: s, prospect_id, dsds_cds, dsds_cds_on, referral_needed, note }) {
      who(s);
      if (!['unknown', 'not_yet', 'confirmed', 'denied'].includes(dsds_cds)) fail('Choose the DSDS status.');
      await q(`insert into cds_eligibility (prospect_id) values ($1) on conflict (prospect_id) do nothing`, [prospect_id]);
      await q(`update cds_eligibility set dsds_cds=$2, dsds_cds_on=$3, dsds_cds_by=$4, referral_needed=$5, dsds_note=$6, updated_at=now() where prospect_id=$1`,
        [prospect_id, dsds_cds, dsds_cds_on || null, s, referral_needed === undefined ? null : !!referral_needed, String(note || '').slice(0, 500)]);
      await event(prospect_id, 'staff:' + s, 'dsds', null, null, 'DSDS CDS eligibility: ' + { unknown: 'unknown', not_yet: 'not determined yet', confirmed: 'confirmed', denied: 'not approved' }[dsds_cds] + (referral_needed ? '. CDS referral or assessment needed.' : ''));
      await audit('staff:' + s, 'dsds_status', 'prospect:' + prospect_id, { dsds_cds });
      return { ok: true };
    },
    async markPotential({ staff: s, prospect_id, note }) {
      who(s);
      const last = await lastCheck(prospect_id), now = await nowIso();
      if (!R.accessCheckCurrent(last, now)) fail('An active Medicaid check from the last 30 days is needed first.');
      await stageIf(prospect_id, ['cds_review_pending'], 'potential_review', 'staff:' + s, 'Potential CDS consumer. ' + String(note || '').slice(0, 300));
      return { ok: true };
    },
    // The directory-access gate (her decision 2026-10-15).
    async approveAccess({ staff: s, prospect_id, path, note, existing_consumer }) {
      who(s);
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      if (!p) fail('Not found', 404);
      const e = await one('select * from cds_eligibility where prospect_id=$1', [prospect_id]) || {};
      const last = await lastCheck(prospect_id), now = await nowIso(), days = await setting('medicaid_recheck_days', R.MEDICAID_RECHECK_DAYS);
      if (path === 'cds_consumer') {
        if (!(p.kind === 'consumer' && existing_consumer) && !R.accessCheckCurrent(last, now)) fail('Verify Medicaid in eMOMED first (an active check from the last 30 days).');
        if (e.dsds_cds !== 'confirmed') {
          // Streamlined path for people already on our CDS roster: no duplicate eMOMED check.
          if (!(p.kind === 'consumer' && existing_consumer)) fail('CDS eligibility isn\'t confirmed. For a current Caring Companions CDS consumer, check the box that confirms it.');
          await q(`insert into cds_eligibility (prospect_id, dsds_cds, dsds_cds_on, dsds_cds_by, dsds_note) values ($1,'confirmed',$2,$3,'Existing Caring Companions CDS consumer')
                   on conflict (prospect_id) do update set dsds_cds='confirmed', dsds_cds_on=$2, dsds_cds_by=$3, dsds_note='Existing Caring Companions CDS consumer', updated_at=now()`, [prospect_id, now.slice(0, 10), s]);
        }
      } else if (path === 'potential_cds') {
        if (!R.accessCheckCurrent(last, now)) fail('An active Medicaid check from the last 30 days is needed for the Potential CDS consumer path.');
        if (!String(note || '').trim()) fail('Add a short office review note.');
      } else fail('Choose how access is being approved.');
      await q(`update cds_prospects set access_status='approved', access_path=$2, access_decided_by=$3, access_decided_at=now(), access_note=$4, hold_reason=null,
               next_action='Send the private invitation', next_owner=$3, next_due=$5, updated_at=now() where id=$1`, [prospect_id, path, s, String(note || '').slice(0, 500), now.slice(0, 10)]);
      if (!['invited', 'browsing', 'intro_requested', 'caregiver_identified', 'transition_requested', 'authorization_pending', 'attendant_onboarding', 'ready_to_begin', 'services_started'].includes(p.stage)) {
        await q(`update cds_prospects set stage='access_approved' where id=$1`, [prospect_id]);
        await event(prospect_id, 'staff:' + s, 'stage', p.stage, 'access_approved', path === 'cds_consumer' ? 'Approved: CDS consumer' : 'Approved: potential CDS consumer');
      }
      const g = await gateFor(await one('select * from cds_prospects where id=$1', [prospect_id]));
      if (!g.ok) await q('update cds_prospects set next_action=$2 where id=$1', [prospect_id, g.why.replace(/^Held for legal review: .*/, 'Wait for the IHS legal review before inviting')]);
      await audit('staff:' + s, 'access_approved', 'prospect:' + prospect_id, { path });
      return { ok: true, gate: g };
    },
    async holdAccess({ staff: s, prospect_id, reason, next_action, due }) {
      who(s);
      if (!String(reason || '').trim()) fail('Add the reason for the hold.');
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      await q(`update cds_prospects set access_status='on_hold', hold_reason=$2, next_action=$3, next_owner=$4, next_due=$5, stage='on_hold', updated_at=now() where id=$1`,
        [prospect_id, String(reason).slice(0, 300), String(next_action || 'Follow up').slice(0, 200), s, due || null]);
      await event(prospect_id, 'staff:' + s, 'stage', p.stage, 'on_hold', reason);
      await task('eligibility_followup', 'Follow up with ' + p.first_name + ': ' + String(next_action || reason).slice(0, 80), { prospect_id }, 'hold:' + prospect_id + ':' + Date.now(), due ? due + 'T15:00:00Z' : null);
      return { ok: true };
    },
    async markNotEligible({ staff: s, prospect_id, reason }) {
      who(s);
      if (!String(reason || '').trim()) fail('Add the reason.');
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      await q(`update cds_prospects set access_status='not_eligible', hold_reason=$2, stage='not_eligible', updated_at=now() where id=$1`, [prospect_id, String(reason).slice(0, 300)]);
      await q('update cds_access set revoked_at=now(), revoked_by=$2 where prospect_id=$1 and revoked_at is null', [prospect_id, s + ' (not eligible)']);
      await event(prospect_id, 'staff:' + s, 'stage', p.stage, 'not_eligible', reason);
      return { ok: true };
    },
    async setNextAction({ staff: s, prospect_id, action, owner, due }) {
      who(s);
      await q('update cds_prospects set next_action=$2, next_owner=$3, next_due=$4, updated_at=now() where id=$1', [prospect_id, String(action || '').slice(0, 200), String(owner || '').slice(0, 120), due || null]);
      await event(prospect_id, 'staff:' + s, 'next_action', null, null, (action || '') + (owner ? ' · ' + owner : '') + (due ? ' · by ' + due : ''));
      return { ok: true };
    },
    async setExpectedStart({ staff: s, prospect_id, date }) {
      who(s);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) fail('Choose the expected start date.');
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      const before = p.expected_start_date ? String(p.expected_start_date).slice(0, 7) : null;
      await q('update cds_prospects set expected_start_date=$2, updated_at=now() where id=$1', [prospect_id, date]);
      const moved = before && before !== date.slice(0, 7);
      await event(prospect_id, 'staff:' + s, 'expected_start', null, null, 'Expected start ' + date + (moved ? '. New month: Medicaid must be checked again in that month.' : ''));
      return { ok: true, new_month_check_needed: !R.serviceMonthCheck(await allChecks(prospect_id), date) };
    },
    async setChosenCaregiver({ staff: s, prospect_id, pool_id }) {
      who(s);
      const c = pool_id ? await loadCaregiver(pool_id) : null;
      if (pool_id && !c) fail('Caregiver not found.');
      await q('update cds_prospects set chosen_pool_id=$2, attendant_onboarding_done_at=null, attendant_onboarding_done_by=null, updated_at=now() where id=$1', [prospect_id, pool_id || null]);
      await event(prospect_id, 'staff:' + s, 'attendant', null, null, c ? 'Chosen attendant: ' + c.pool.first_name : 'Chosen attendant cleared');
      return { ok: true };
    },
    async markOnboardingDone({ staff: s, prospect_id, date }) {
      who(s);
      const p = await one('select * from cds_prospects where id=$1', [prospect_id]);
      if (!p.chosen_pool_id) fail('Choose the attendant first.');
      const c = await chosenFor(p);
      if (!c.eligible) fail(c.first_name + ' isn\'t fully screened yet (Eligible to begin CDS services).');
      await q('update cds_prospects set attendant_onboarding_done_at=$2, attendant_onboarding_done_by=$3, updated_at=now() where id=$1', [prospect_id, date || (await nowIso()).slice(0, 10), s]);
      await event(prospect_id, 'staff:' + s, 'onboarding', null, null, c.first_name + '\'s attendant onboarding complete');
      return { ok: true };
    },

    // The fourth status. Only after DSDS authorizes CDS services.
    async authorizeServices({ staff: s, prospect_id, date, note }) {
      who(s);
      const e = await one('select dsds_cds from cds_eligibility where prospect_id=$1', [prospect_id]);
      if (!e || e.dsds_cds !== 'confirmed') fail('DSDS must confirm CDS eligibility before services can be authorized.');
      if (!date) fail('Add the authorization date.');
      await q('update cds_prospects set services_authorized_at=$2, services_authorized_by=$3, services_authorized_note=$4, updated_at=now() where id=$1', [prospect_id, date, s, String(note || '').slice(0, 300)]);
      await event(prospect_id, 'staff:' + s, 'services_authorized', null, null, 'CDS services authorized ' + date);
      return { ok: true };
    },

    // ----- introductions -----
    async intros({ staff: s }) {
      who(s);
      const rows = await q(`select i.*, f.first_name as family, f.town as family_town, p.first_name as caregiver
        from cds_introductions i join cds_prospects f on f.id=i.prospect_id join attendant_pool p on p.id=i.pool_id order by i.updated_at desc`);
      return { intros: rows.map(r => ({ ...r, how_text: R.INTRO_HOW[r.how], status_text: R.INTRO_STATUS[r.status].office })) };
    },
    async askCaregiver({ staff: s, intro_id, channel }) {
      who(s);
      const i = await one('select * from cds_introductions where id=$1', [intro_id]);
      if (!i || !R.canMoveIntro(i.status, 'asked')) fail('This request has already moved on.');
      const pool = await one('select * from attendant_pool where id=$1', [i.pool_id]);
      const f = await one('select * from cds_prospects where id=$1', [i.prospect_id]);
      const token = await crypto.token();
      const now = await nowIso();
      await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)', [i.pool_id, await crypto.hash(token), s, addDays(now, R.CAREGIVER_LINK_DAYS)]);
      const link = links.caregiver(token) + '#intros';
      const ch = channel || 'sms';
      const m = await message({ template: 'cg_intro_request', channel: ch, audience: 'caregiver', pool_id: i.pool_id, to: ch === 'sms' ? pool.phone : pool.email,
        vars: { first: pool.first_name, town: f.town || 'you', how: R.INTRO_HOW[i.how].toLowerCase(), link }, by: s });
      if (m.status === 'sent' || m.status === 'practice') {
        await q(`update cds_introductions set status='asked', updated_at=now() where id=$1`, [intro_id]);
        await finishTask('ask_caregiver:' + intro_id, s);
      }
      await audit('staff:' + s, 'asked_caregiver', 'intro:' + intro_id, { status: m.status });
      return { status: m.status, error: m.error, practice_link: deps.mode === 'practice' ? link : undefined };
    },
    async updateIntro({ staff: s, intro_id, status, meet_at, meet_details, note }) {
      who(s);
      const i = await one('select * from cds_introductions where id=$1', [intro_id]);
      if (!i) fail('Not found', 404);
      if (status && status !== i.status && !R.canMoveIntro(i.status, status)) fail('That step doesn\'t follow from "' + R.INTRO_STATUS[i.status].office + '".');
      if (status === 'scheduled' && !meet_at) fail('Add the meeting date and time.');
      await q(`update cds_introductions set status=coalesce($2,status), meet_at=coalesce($3,meet_at), meet_details=coalesce($4,meet_details),
               office_note = case when $5::text <> '' then concat_ws(E'\\n', office_note, $5::text) else office_note end, updated_at=now() where id=$1`,
        [intro_id, status || null, meet_at || null, meet_details || null, String(note || '').slice(0, 500)]);
      if (status === 'scheduled') {
        await finishTask('schedule:' + intro_id, s);
      }
      if (status === 'not_available' || status === 'closed') await q(`update cds_tasks set done_at=now(), done_by=$2 where intro_id=$1 and done_at is null`, [intro_id, s]);
      await audit('staff:' + s, 'intro_' + (status || 'note'), 'intro:' + intro_id);
      return { ok: true };
    },
    async sendMeetDetails({ staff: s, intro_id, channel }) {
      who(s);
      const i = await one('select * from cds_introductions where id=$1', [intro_id]);
      if (!i || i.status !== 'scheduled') fail('Set the meeting first.');
      const pool = await one('select * from attendant_pool where id=$1', [i.pool_id]);
      const f = await one('select * from cds_prospects where id=$1', [i.prospect_id]);
      const c = await ghl.get(f.ghl_contact_id) || {};
      const ch = channel || 'sms';
      const when = new Date(i.meet_at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
      const how = R.INTRO_HOW[i.how];
      const details = i.meet_details || '';
      const a = await message({ template: 'meet_family', channel: ch, audience: 'family', prospect_id: f.id, to: ch === 'sms' ? c.phone : c.email,
        vars: { first: f.first_name, cg: pool.first_name, when, how, details }, by: s });
      const b = await message({ template: 'meet_caregiver', channel: ch, audience: 'caregiver', pool_id: pool.id, to: ch === 'sms' ? pool.phone : pool.email,
        vars: { first: pool.first_name, family: f.first_name, when, how, details }, by: s });
      await audit('staff:' + s, 'sent_meet_details', 'intro:' + intro_id, { family: a.status, caregiver: b.status });
      return { family: a.status, caregiver: b.status };
    },

    // ----- tasks, messages, settings -----
    async tasks({ staff: s }) {
      who(s);
      return { tasks: await q(`select t.*, p.first_name as caregiver, f.first_name as family from cds_tasks t
        left join attendant_pool p on p.id=t.pool_id left join cds_prospects f on f.id=t.prospect_id
        where t.done_at is null and coalesce(t.area, 'match') = 'match' order by coalesce(t.due_at, t.created_at)`) };
    },
    async completeTask({ staff: s, id }) {
      who(s);
      await q(`update cds_tasks set done_at=now(), done_by=$2 where id=$1 and coalesce(area, 'match') = 'match'`, [id, s]);
      await audit('staff:' + s, 'task_done', 'task:' + id);
      return { ok: true };
    },
    async outbox({ staff: s }) {
      who(s);
      return { messages: await q('select * from cds_outbox order by created_at desc limit 100') };
    },
    async templates({ staff: s }) {
      who(s);
      return { templates: TEMPLATES };
    },
  };

  // The attendant packet (2026-10-21): same link, pool row and screening records.
  const packet = createPacket({ q, one, nowIso, audit, setting, task, finishTask, media, crypto, links, ensureProfile, caregiverLink, loadCaregiver, R, fail, deps });
  Object.assign(pub, packet.pub); Object.assign(caregiver, packet.att); Object.assign(staff, packet.office);
  // The consumer enrollment packet (2026-10-22): consumers on their own private link.
  const enroll = createEnroll({ q, one, nowIso, audit, setting, task, crypto, links, R, fail, deps, isTestRecipient });
  Object.assign(staff, enroll.office);
  // Missouri forms for consumers on the roster (2026-10-22): rights, office details, pandemic policy.
  const sign = createSign({ q, one, nowIso, audit, setting, crypto, links, R, fail, deps, isTestRecipient });
  Object.assign(staff, sign.office);
  // Medicaid application instructions from the Starting profile (2026-11-04): staff press Send, switch medicaid_messages.
  Object.assign(staff, createMedicaidMessages({ q, one, audit, setting, task, R, fail, deps, isTestRecipient }).office);
  // Background check proof for Roster attendants, brought in from GHL (2026-10-22).
  Object.assign(staff, createRosterProof({ q, one, nowIso, audit, fail, crypto, deps }).office);
  Object.assign(staff, createPrescreen({ audit, fail, deps }).office);   // the online pre-screen, read only (2026-11-05)
  // 'job' is only reachable with the schedule's secret (checked in the edge function).
  // One 15-minute job runs both packets' reminders; one failing never stops the other.
  const job = { packetJob: async () => {
    const r = await packet.packetJob();
    let e; try { e = await enroll.enrollJob(); } catch (err) { e = { ok: false, error: String(err && err.message || err).slice(0, 200) }; }
    let pr; try { pr = await profileReminders(); } catch (err) { pr = { ok: false, error: String(err && err.message || err).slice(0, 200) }; }
    let cd; try { cd = await consumerDirectorySync(); } catch (err) { cd = { ok: false, error: String(err && err.message || err).slice(0, 200) }; }
    let fs; try { fs = await formerSend(); } catch (err) { fs = { ok: false, error: String(err && err.message || err).slice(0, 200) }; }
    let pf; try { pf = await photoFixedSend(); } catch (err) { pf = { ok: false, error: String(err && err.message || err).slice(0, 200) }; }
    return { ...r, enroll: e, profile_reminders: pr, consumer_directory: cd, former_send: fs, photo_fixed: pf };
  },
  formerSend: ({ at } = {}) => formerSend(at),
  photoFixedSend: ({ at } = {}) => photoFixedSend(at),
  consumerDirectorySync: ({ at } = {}) => consumerDirectorySync(at),
  profileReminders: ({ at } = {}) => profileReminders(at),
  // The CDS Coordinator sends packets (2026-11-18, her ask) through the very same code as the hub's buttons, as
  // 'cds-coordinator'. Never twice: a packet that already went out (from the hub or before) is not sent again.
  async coordEnrollSend({ lead, consumer_id }) {
    const L = lead || {}, id = String(L.id || '').trim().slice(0, 80), cid = String(consumer_id || '').trim().slice(0, 80);
    if (!id) fail('No lead');
    const had = await one(`select lead_id from cds_enroll_packets where sent_at is not null and (lead_id = $1 or ($2 <> '' and consumer_id = $2)) limit 1`, [id, cid]);
    if (had) return { ok: true, already: true };
    const r = await enroll.office.enrollSend({ staff: 'cds-coordinator', lead: L });
    if (cid) { try { await enroll.office.enrollLinkConsumer({ staff: 'cds-coordinator', lead_id: id, consumer_id: cid }); } catch { /* the profile still finds it by name */ } }
    const m = r.messages || [];
    return { ok: true, status: m.includes('sent') ? 'sent' : m.includes('practice') ? 'practice' : m.includes('failed') ? 'failed' : m.length ? 'held' : 'failed', messages: m };
  },
  async coordAttendantSend({ name, phone, email, consumer }) {
    const s = await packet.office.packetStartFromLead({ staff: 'cds-coordinator', name, phone, email, consumer });
    const had = await one(`select 1 as y from cds_outbox where pool_id = $1 and template = 'packet_att_link' and status = 'sent' limit 1`, [s.pool_id]);
    if (had) return { ok: true, already: true, pool_id: s.pool_id };
    const r = await packet.office.packetSendLink({ staff: 'cds-coordinator', pool_id: s.pool_id });
    return { ok: true, status: r.status, pool_id: s.pool_id };
  } };
  const ROLES = { public: pub, family, caregiver, staff, job, consumer: { ...enroll.consumer, ...sign.consumer } };
  return {
    async handle(role, action, input = {}) {
      const r = ROLES[role];
      if (!r || !Object.prototype.hasOwnProperty.call(r, action)) fail('Unknown request', 404);
      // Live: signing in to the CDS Hub isn't enough; the email must be on the
      // office's staff list (setting staff_emails).
      if (role === 'staff' && deps.mode === 'live') {
        const list = (await setting('staff_emails')) || [];
        const me = String(input.staff || '').toLowerCase();
        if (!me || !list.map(e => String(e).toLowerCase()).includes(me)) fail('This sign-in isn\'t on the CDS office staff list.', 403);
      }
      return r[action](input);
    },
    roles: ROLES,
    deps,
  };
}
