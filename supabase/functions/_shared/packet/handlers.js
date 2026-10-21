// CDS attendant packet: the server logic (2026-10-21, Samantha: "build it").
// Runs inside createMatch (supabase/functions/_shared/match/handlers.js), so it
// shares the caregiver's private link, their attendant_pool row, the sealed SSN
// (cds_screening_secret), the FCSR steps and the outbox with Caregiver Match.
//
// Public  : applyStart (the one link everyone forwards: caringcds.com/apply)
// Attendant (their private link): packet, packetSave, packetEsign, packetIdentity,
//           packetSign, packetBookCall, packetSelf (orientation / Empeon done)
// Office  : packetList, packetGet, packetMark, packetCountersign, packetCopy
// Job     : packetJob (reminders, Step 2 opening, orientation completions)
//
// Her rules built in: as little office work as possible; nothing signed in Step 2
// before checks are clear; each form saved write-once the moment it is signed;
// messages held until the packet switches are on; office texts only in office
// hours (weekdays 9 to 4 Central), email any time. No em dashes.
import { FORMS, STEP1, STEP2, CONTRACT_PARTS, formText, COMPANY, HANDBOOK_URL, ORIENTATION_URL } from './forms.js';
import * as P from './rules.js';
import { PACKET_TEMPLATES, fill } from './messages.js';
import { CONSENT_WORDING } from '../match/messages.js';

const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();
const digits10 = v => String(v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const fmtPhone = d => '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
const chicago = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...opts }).format(new Date(iso));
function officeHours(iso) {
  const wd = chicago(iso, { weekday: 'short' }), hr = +chicago(iso, { hour: 'numeric', hourCycle: 'h23' });
  return !['Sat', 'Sun'].includes(wd) && hr >= 9 && hr < 16;
}
// 10am Central, n days after iso (rounded to that day's 10am).
function tenAm(iso, n) {
  const d = new Date(new Date(iso).getTime() + n * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const off = chicago(d.toISOString(), { timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/);
  const h = 10 - (off ? +off[1] : -6);
  return new Date(ymd + 'T' + String(h).padStart(2, '0') + ':00:00Z').toISOString();
}

export function createPacket(h) {
  const { q, one, nowIso, audit, setting, crypto, links, ensureProfile, caregiverLink, loadCaregiver, R, fail, deps } = h;
  // Office to-dos close themselves when their step is done.
  const closeTasks = (poolId, kind, by) => q(`update cds_tasks set done_at=now(), done_by=$3 where pool_id=$1 and kind=$2 and done_at is null`, [poolId, kind, by || 'packet']);

  // ---------- sending (every message lands in the outbox, nothing fails silently) ----------
  async function send({ template, channel, audience, pool_id, to, vars, by }) {
    const t = PACKET_TEMPLATES[template];
    if (!t || !t[channel] || !to) return null;
    const body = fill(t[channel], vars), subject = channel === 'email' ? fill(t.email_subject, vars) : null;
    const sw = await setting(audience === 'office' ? 'packet_alerts' : 'packet_messages', { live: false });
    let status, error = null;
    if (deps.mode === 'practice') status = 'practice';
    else if (!sw.live) { status = 'held'; error = 'Attendant packet messages are switched off until Samantha turns them on.'; }
    else { try { await deps.send({ channel, to, subject, body }); status = 'sent'; } catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); } }
    return one(`insert into cds_outbox (audience, pool_id, channel, template, to_display, body, status, error, automatic, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) returning id, status`,
      [audience, pool_id || null, channel, 'packet_' + template, channel === 'sms' ? R.maskPhone(to) : R.maskEmail(to),
       (subject ? subject + '\n\n' : '') + body, status, error, by || 'packet']);
  }

  async function load(poolId) {
    const p = await one('select * from cds_packets where pool_id=$1', [poolId]);
    if (!p) return null;
    const rows = await q('select * from cds_packet_forms where pool_id=$1', [poolId]);
    const forms = Object.fromEntries(rows.map(r => [r.form_key, r]));
    const c = await loadCaregiver(poolId);
    const st = P.status(p, forms, c && c.screening, c && c.profile);
    return { p, forms, c, st };
  }
  async function ensurePacket(poolId, via, consumer) {
    await ensureProfile(poolId);
    await q(`insert into cds_packets (pool_id, via, consumer_name) values ($1,$2,$3) on conflict (pool_id) do nothing`, [poolId, via, consumer || null]);
  }
  // Her call 2026-10-21: the packet lives on caringcds.com (caringcds.com/apply/?c=...),
  // the agency's own site; findcdscaregivers.com is only the directory profile.
  const packetLink = token => (links.packet ? links.packet(token) : links.caregiver(token) + '&view=packet');
  // Date of birth on file and the SSN sealed.
  const identityDone = async (poolId, scr) => !!(scr && scr.dob) && !!(await one('select 1 as y from cds_screening_secret where pool_id=$1', [poolId]));
  const nameOf = (pool) => [pool.first_name, pool.last_name].filter(Boolean).join(' ');

  // ================= PUBLIC: the one application link =================
  const pub = {
    async applyStart(i) {
      if (i.website) return { ok: true };   // spam trap
      const first = String(i.first_name || '').trim().slice(0, 60), last = String(i.last_name || '').trim().slice(0, 60);
      const consumer = String(i.consumer_name || '').trim().slice(0, 120);
      const d = digits10(i.phone), email = String(i.email || '').trim().toLowerCase().slice(0, 120);
      if (!consumer) fail('Please tell us who you will care for.');
      if (!first || !last) fail('Please add your first and last name.');
      if (d.length !== 10) fail('Please give us a 10-digit cell phone number, with area code.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Please check your email address.');
      const existing = await one(`select id, first_name, phone, email from attendant_pool where coalesce(archived,false)=false
        and right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) = $1 order by submitted_at limit 1`, [d]);
      const now = await nowIso();
      if (existing) {
        // Whoever typed this might not be that person: the link goes only to the phone on file.
        await ensurePacket(existing.id, 'apply', consumer);
        const token = await crypto.token();
        await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)',
          [existing.id, await crypto.hash(token), 'apply-repeat', addDays(now, R.CAREGIVER_LINK_DAYS)]);
        await send({ template: 'att_link', channel: 'sms', audience: 'caregiver', pool_id: existing.id, to: existing.phone,
          vars: { first: existing.first_name, link: packetLink(token) }, by: 'apply' });
        await audit('public', 'packet_start_repeat', 'pool:' + existing.id, {});
        return { ok: true, repeat: true, message: 'We already have you on file, so we texted your private link to the phone number we have. Questions? Call (417) 218-2888.' };
      }
      const r = await one(`insert into attendant_pool (agency_id, source, status, background_ok, show_anonymously, first_name, last_name, phone, email,
          has_potential_consumer, knows_consumer) values ('caring-companions-cds', 'apply', 'new', true, false, $1,$2,$3,$4,'Yes',$5) returning id`,
        [first, last, fmtPhone(d), email, consumer]);
      await ensurePacket(r.id, 'apply', consumer);
      await q('update cds_packets set answers = $2::jsonb where pool_id=$1',
        [r.id, JSON.stringify(P.cleanAnswers({ first, last, phone: fmtPhone(d), email, consumer_name: consumer, has_consumer: 'yes' }))]);
      const token = await crypto.token();
      await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)',
        [r.id, await crypto.hash(token), 'apply', addDays(now, R.CAREGIVER_LINK_DAYS)]);
      const link = packetLink(token);
      await send({ template: 'att_link', channel: 'sms', audience: 'caregiver', pool_id: r.id, to: fmtPhone(d), vars: { first, link }, by: 'apply' });
      // Not finished in 2 and 4 days: one reminder each, daytime only.
      await q('update cds_packets set reminders = $2::jsonb where pool_id=$1',
        [r.id, JSON.stringify([{ kind: 'step1', due_at: tenAm(now, 2) }, { kind: 'step1', due_at: tenAm(now, 4) }])]);
      await audit('public', 'packet_start', 'pool:' + r.id, {});
      return { ok: true, link };
    },
  };

  // ================= ATTENDANT (private link) =================
  async function mine(link) {
    const { pool_id, now } = await caregiverLink(link);
    let x = await load(pool_id);
    if (!x) { const pool = await one('select knows_consumer from attendant_pool where id=$1', [pool_id]); await ensurePacket(pool_id, 'list', pool && pool.knows_consumer); x = await load(pool_id); }
    return { ...x, pool_id, now };
  }
  function vars(x) {
    const a = x.p.answers || {};
    return { attendant: [a.first || x.c.pool.first_name, a.last || x.c.pool.last_name].filter(Boolean).join(' '), consumer: x.p.consumer_name || a.consumer_name || 'your consumer' };
  }
  const att = {
    async packet({ link }) {
      const x = await mine(link);
      if (x.st.step2Open && !x.p.step2_opened_at) await q('update cds_packets set step2_opened_at=now() where pool_id=$1', [x.pool_id]);
      const v = vars(x);
      const docs = Object.fromEntries(Object.entries(FORMS).filter(([k, f]) => f.step === 1 || x.st.step2Open)
        .map(([k, f]) => [k, { title: f.title, version: f.version, initials: f.initials, doc: f.doc.map(b => b.p ? { p: b.p.replace(/\{(\w+)\}/g, (m, kk) => v[kk] ?? m) } : b) }]));
      const scr = x.c.screening.raw || {};
      return {
        first: (x.p.answers || {}).first || x.c.pool.first_name, via: x.p.via, consumer: x.p.consumer_name, list_choice: x.p.list_choice,
        answers: x.p.answers || {}, esign: !!x.p.esign_at,
        identity_done: await identityDone(x.pool_id, scr),
        signed: Object.fromEntries(Object.entries(x.forms).map(([k, f]) => [k, { at: f.signed_at, name: f.signed_name }])),
        step: !x.st.step1 ? 1 : !x.st.step2Open ? 'checks' : !x.st.step2Signed || !x.p.call_slot ? 2 : 'done',
        missing: { application: P.applicationMissing(x.p.answers || {}), background: P.backgroundMissing(x.p.answers || {}, await identityDone(x.pool_id, scr)) },
        docs, contract_parts: CONTRACT_PARTS, company: COMPANY,
        orientation_done: !!x.p.orientation_done_at, empeon_done: !!x.p.empeon_done_at, call_slot: x.p.call_slot,
        call_slots: x.st.step2Open && !x.p.call_slot ? P.callSlots(x.now) : [],
        handbook_url: HANDBOOK_URL, orientation_url: ORIENTATION_URL,
        listing_consent: CONSENT_WORDING.profile.text,
        profile: { photo: !!(x.c.profile && (x.c.profile.photo_draft || x.c.profile.photo_approved)), draft: (x.c.profile && x.c.profile.draft) || {},
          consent: R.hasConsent(x.c.consents || [], 'profile'), review_status: x.c.profile && x.c.profile.review_status },   // the wording approved for Caregiver Match (2026-10-15)
      };
    },
    async packetSave({ link, answers }) {
      const x = await mine(link);
      if (x.forms.application) fail('Your application is already signed. Call us at (417) 218-2888 to change an answer.');
      const clean = P.cleanAnswers(answers || {});
      await q('update cds_packets set answers = answers || $2::jsonb, list_choice = coalesce($3, list_choice), consumer_name = coalesce($4, consumer_name), updated_at=now() where pool_id=$1',
        [x.pool_id, JSON.stringify(clean), clean.list || null, clean.consumer_name || null]);
      return { ok: true };
    },
    async packetEsign({ link, ip, agent }) {
      const x = await mine(link);
      if (!x.p.esign_at) await q('update cds_packets set esign_at=now(), esign_ip=$2, esign_agent=$3 where pool_id=$1', [x.pool_id, String(ip || '').slice(0, 60), String(agent || '').slice(0, 300)]);
      return { ok: true };
    },
    // Date of birth, SSN and legal name go into the same sealed screening record
    // Caregiver Match uses. Never stored in answers, never shown back.
    async packetIdentity({ link, dob, ssn, ssn2, other_ssn }) {
      const x = await mine(link);
      if (x.st.step1) fail('Your application is already signed.');
      const dgt = String(ssn || '').replace(/\D/g, '');
      if (dgt.length !== 9) fail('Please enter all 9 digits of your Social Security number.');
      if (dgt !== String(ssn2 || '').replace(/\D/g, '')) fail('The two Social Security numbers do not match.');
      if (deps.mode === 'practice' && dgt[0] !== '9') fail('Practice mode: use a made-up number that starts with 9. Never a real one.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ''))) fail('Please enter your date of birth.');
      const age = R.ageOn(dob, x.now);
      if (age === null || age > 110) fail('Please check your date of birth.');
      if (age < 18) fail('CDS attendants must be at least 18. Please call us at (417) 218-2888.');
      const a = x.p.answers || {};
      await q(`update cds_screening set legal_first=coalesce(nullif($2,''), legal_first), legal_middle=coalesce(nullif($3,''), legal_middle), legal_last=coalesce(nullif($4,''), legal_last),
               dob=$5, ssn_last4=$6, other_names=coalesce(nullif($7,''), other_names), updated_at=now() where pool_id=$1`,
        [x.pool_id, a.first || '', a.mi || '', a.last || '', dob, dgt.slice(-4), a.aliases || '']);
      await q(`insert into cds_screening_secret (pool_id, ssn_ciphertext) values ($1,$2) on conflict (pool_id) do update set ssn_ciphertext=excluded.ssn_ciphertext, created_at=now()`,
        [x.pool_id, await crypto.encrypt(dgt)]);
      const other = String(other_ssn || '').replace(/[^\d,; ]/g, '').trim();
      if (other) await q(`update cds_packets set answers = answers || jsonb_build_object('other_ssn_sealed', $2::text) where pool_id=$1`, [x.pool_id, await crypto.encrypt(other)]);
      // Age 18 or older is proven by the date of birth: record it so the office doesn't have to.
      if (!(await one(`select 1 as y from cds_screening_checks where pool_id=$1 and check_key='age18' and result='clear'`, [x.pool_id])))
        await q(`insert into cds_screening_checks (pool_id, check_key, result, checked_on, note, recorded_by)
                 values ($1,'age18','clear',(now() at time zone 'America/Chicago')::date,'From the date of birth on the application','packet')`, [x.pool_id]);
      await audit('caregiver:' + x.pool_id, 'packet_identity', 'pool:' + x.pool_id, {});
      return { ok: true };
    },
    async packetSign({ link, form, typed_name, agree, initials, ip, agent }) {
      const x = await mine(link);
      const f = FORMS[form];
      if (!f) fail('Unknown form');
      if (x.forms[form]) return { ok: true, already: true };
      if (!x.p.esign_at) fail('Please agree to sign electronically first.');
      if (agree !== true) fail('Please tick the box to say you read it and agree.');
      const name = String(typed_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (name.split(' ').length < 2) fail('Please type your full name, first and last, to sign.');
      if (f.step === 2 && !x.st.step2Open) fail('This opens once your background checks are clear.');
      const a = x.p.answers || {};
      if (form === 'application') { const m = P.applicationMissing(a); if (m.length) fail('Before you sign, please add: ' + m.join('; ') + '.'); }
      if (form === 'background') {
        if (!x.forms.application) fail('Please sign your application first.');
        const m = P.backgroundMissing(a, await identityDone(x.pool_id, x.c.screening.raw || {}));
        if (m.length) fail('Before you sign, please add: ' + m.join('; ') + '.');
      }
      let ini = null;
      if (f.initials) {
        ini = {};
        for (const part of CONTRACT_PARTS) { const v = String((initials || {})[part] || '').trim().toUpperCase().slice(0, 4); if (!/^[A-Z]{2,4}$/.test(v)) fail('Please put your initials after every part of the contract.'); ini[part] = v; }
      }
      const fp = await crypto.hash(formText(form, vars(x)));
      const snapshot = form === 'application' ? a : form === 'background' ? { gender: a.gender, addrs: a.addrs, mo_only: a.mo_only } : {};
      await q(`insert into cds_packet_forms (pool_id, form_key, version, fingerprint, answers, initials, signed_name, signed_ip, signed_agent)
               values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9) on conflict (pool_id, form_key) do nothing`,
        [x.pool_id, form, f.version, fp, JSON.stringify(snapshot), ini ? JSON.stringify(ini) : null, name, String(ip || '').slice(0, 60), String(agent || '').slice(0, 300)]);
      await audit('caregiver:' + x.pool_id, 'packet_signed', 'pool:' + x.pool_id, { form, version: f.version });
      if (form === 'background') {
        // The screening authorization is this signature.
        await q('update cds_screening set authorization_signed_at=coalesce(authorization_signed_at, now()) where pool_id=$1', [x.pool_id]);
        await step1Done(x.pool_id);
      }
      if (f.step === 2) {
        const n = await one(`select count(*)::int c from cds_packet_forms where pool_id=$1 and form_key = any($2)`, [x.pool_id, STEP2]);
        if (n.c === STEP2.length) await q('update cds_packets set step2_signed_at=coalesce(step2_signed_at, now()) where pool_id=$1', [x.pool_id]);
      }
      return { ok: true };
    },
    async packetBookCall({ link, slot }) {
      const x = await mine(link);
      if (!x.st.step2Open) fail('This opens once your background checks are clear.');
      const ok = P.callSlots(x.now).find(s => s.value === slot);
      if (!ok) fail('Please pick one of the times shown.');
      await q('update cds_packets set call_slot=$2, call_booked_at=now() where pool_id=$1', [x.pool_id, ok.label]);
      await h.task('packet_call', ('5-minute ID check: ' + nameOf(x.c.pool) + ', ' + ok.label + '. See their ID live, then I-9 Section 2 in Empeon.').slice(0, 300),
        { pool_id: x.pool_id }, 'packet_call:' + x.pool_id + ':' + slot, null);
      return { ok: true, slot: ok.label };
    },
    // Things the attendant tells us they finished (the office sees who said so).
    async packetSelf({ link, what }) {
      const x = await mine(link);
      const col = { orientation: 'orientation_done_at', empeon: 'empeon_done_at' }[what];
      if (!col) fail('Unknown request');
      await q(`update cds_packets set ${col}=coalesce(${col}, now()), updated_at=now() where pool_id=$1`, [x.pool_id]);
      await audit('caregiver:' + x.pool_id, 'packet_self_' + what, 'pool:' + x.pool_id, {});
      return { ok: true };
    },
  };

  // Step 1 is fully signed: alert the office, send orientation + handbook, set reminders.
  async function step1Done(poolId) {
    const x = await load(poolId);
    if (x.p.step1_signed_at) return;
    const now = await nowIso();
    await q('update cds_packets set step1_signed_at=now(), reminders=$2::jsonb, updated_at=now() where pool_id=$1',
      [poolId, JSON.stringify([{ kind: 'orientation', due_at: tenAm(now, 1) }, { kind: 'orientation', due_at: tenAm(now, 3) }])]);
    const a = x.p.answers || {}, name = nameOf(x.c.pool);
    if (a.fcsr === 'no' || a.fcsr === 'notsure') await q(`update cds_screening set reg_needed_at=coalesce(reg_needed_at, now()), reg_needed_source=coalesce(reg_needed_source, 'application') where pool_id=$1`, [poolId]);
    if (x.p.list_choice === 'join') {
      const { profile: draft } = R.cleanProfileDraft({ town: a.city || '' });
      await q('update cds_cg_profiles set draft = draft || $2::jsonb, updated_at=now() where pool_id=$1', [poolId, JSON.stringify(draft)]);
    }
    await h.task('packet_checks', ('Run EDL and FCSR for ' + name + ' (Step 1 signed' + (x.p.consumer_name ? ', for ' + x.p.consumer_name : '') + ').').slice(0, 300),
      { pool_id: poolId }, 'packet_checks:' + poolId, (await one('select cds_next_business_4pm(now()) as d')).d);
    const v = { name, for: x.p.consumer_name ? ' for ' + x.p.consumer_name : '',
      oig: 'OIG: run automatically when the OIG check is switched on; until then, check it with EDL.',
      fcsr: { yes: 'already registered (no fee)', no: 'NOT registered yet: they get the registration steps', notsure: 'not sure' }[a.fcsr] || 'not answered',
      list: x.p.list_choice === 'join' ? 'yes, wants to be listed' : 'no, works for their consumer only' };
    const cfg = await setting('packet_alerts', { recipients: [] });
    const inHours = officeHours(now);
    for (const r of cfg.recipients || []) {
      if (r.email) await send({ template: 'office_step1', channel: 'email', audience: 'office', pool_id: poolId, to: r.email, vars: v });
      if (r.phone && inHours) await send({ template: 'office_step1', channel: 'sms', audience: 'office', pool_id: poolId, to: r.phone, vars: v });
    }
    const first = a.first || x.c.pool.first_name;
    await send({ template: 'att_after_step1', channel: 'sms', audience: 'caregiver', pool_id: poolId, to: x.c.pool.phone, vars: { first } });
    await send({ template: 'att_after_step1', channel: 'email', audience: 'caregiver', pool_id: poolId, to: x.c.pool.email, vars: { first } });
    await audit('system', 'packet_step1_done', 'pool:' + poolId, { office_texts: inHours });
  }

  // ================= OFFICE =================
  const who = s => { if (!s) fail('Please sign in to the CDS Hub.', 401); return s; };
  const office = {
    async packetList({ staff }) {
      who(staff);
      const rows = await q(`select k.pool_id, a.first_name, a.last_name, a.phone, k.consumer_name, k.updated_at from cds_packets k
                            join attendant_pool a on a.id=k.pool_id where coalesce(a.archived,false)=false order by k.created_at desc limit 300`);
      const out = [];
      for (const r of rows) { const x = await load(r.pool_id); out.push({ pool_id: r.pool_id, name: [r.first_name, r.last_name].join(' '), consumer: r.consumer_name,
        label: x.st.label, tone: x.st.tone, next: x.st.next, active: x.st.active, list_choice: x.p.list_choice }); }
      return { attendants: out };
    },
    async packetGet({ staff, pool_id }) {
      who(staff);
      const x = await load(pool_id);
      if (!x) fail('Not found', 404);
      return { pool: { first: x.c.pool.first_name, last: x.c.pool.last_name, phone: x.c.pool.phone, email: x.c.pool.email },
        packet: { ...x.p, answers: undefined, reminders: x.p.reminders }, answers: { ...(x.p.answers || {}), other_ssn_sealed: undefined },
        forms: Object.fromEntries(Object.entries(x.forms).map(([k, f]) => [k, { title: FORMS[k].title, version: f.version, signed_name: f.signed_name, signed_at: f.signed_at, countersigned_at: f.countersigned_at, countersigned_name: f.countersigned_name }])),
        screening: { missing: x.c.screening.missing, eligible: x.c.screening.eligible, findings: x.c.screening.findings, checks: x.c.screening.steps[6].checks },
        status: x.st, listing: x.c.listing };
    },
    async packetMark({ staff, pool_id, what }) {
      who(staff);
      const col = { empeon_invited: ['empeon_invited_at', 'empeon_invited_by'], id_checked: ['id_checked_at', 'id_checked_by'], i9_done: ['i9_done_at', 'i9_done_by'] }[what];
      if (!col) fail('Unknown step');
      const x = await load(pool_id);
      if (!x) fail('Not found', 404);
      if (what !== 'empeon_invited' && !x.st.checksClear) fail('Their background checks are not clear yet.');
      await q(`update cds_packets set ${col[0]}=coalesce(${col[0]}, now()), ${col[1]}=coalesce(${col[1]}, $2), updated_at=now() where pool_id=$1`, [pool_id, staff]);
      if (what === 'id_checked') await q(`insert into cds_screening_checks (pool_id, check_key, result, checked_on, note, recorded_by)
        values ($1,'id_match','clear', (now() at time zone 'America/Chicago')::date, 'Seen on the 5-minute ID video call', $2)`, [pool_id, staff]);
      await closeTasks(pool_id, { empeon_invited: 'packet_empeon', id_checked: 'packet_call' }[what] || '-', staff);
      await audit('staff:' + staff, 'packet_' + what, 'pool:' + pool_id, {});
      const y = await load(pool_id);
      if (y.st.active && !y.p.active_at) { await q('update cds_packets set active_at=now() where pool_id=$1', [pool_id]); await audit('system', 'packet_active', 'pool:' + pool_id, {}); }
      return { ok: true, status: y.st };
    },
    async packetCountersign({ staff, pool_id, typed_name }) {
      who(staff);
      const name = String(typed_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (name.split(' ').length < 2) fail('Type your full name to countersign.');
      const r = await one(`update cds_packet_forms set countersigned_name=$3, countersigned_by=$2, countersigned_at=now()
                           where pool_id=$1 and form_key='contract' and countersigned_at is null returning id`, [pool_id, staff, name]);
      if (!r) fail('There is no signed contract waiting for a countersignature.');
      await audit('staff:' + staff, 'packet_countersign', 'pool:' + pool_id, {});
      const y = await load(pool_id);
      if (y.st.active && !y.p.active_at) await q('update cds_packets set active_at=now() where pool_id=$1', [pool_id]);
      return { ok: true };
    },
    // Copy buttons: everything a form needs, in the order it asks, so the office pastes
    // instead of retyping. The SSN is never in here: "Show for the request" (revealSsn) does that, audited.
    async packetCopy({ staff, pool_id, kind }) {
      who(staff);
      const x = await load(pool_id);
      if (!x) fail('Not found', 404);
      const s = x.c.screening.raw || {}, a = x.p.answers || {};
      const dob = s.dob ? String(s.dob).slice(0, 10) : '';
      const fields = kind === 'empeon'
        ? [['First name', x.c.pool.first_name], ['Last name', x.c.pool.last_name], ['Email', x.c.pool.email], ['Phone', x.c.pool.phone], ['Consumer (employer)', x.p.consumer_name]]
        : kind === 'fcsr' || kind === 'edl'
          ? [['Legal last name', s.legal_last], ['Legal first name', s.legal_first], ['Middle initial', (s.legal_middle || '').slice(0, 1)], ['Other names', s.other_names],
             ['Date of birth', dob], ['SSN last 4 (full number: Show for the request)', s.ssn_last4], ['Address', [a.street, a.apt, a.city, a.state, a.zip].filter(Boolean).join(', ')]]
          : fail('Unknown copy');
      await audit('staff:' + staff, 'packet_copy_' + kind, 'pool:' + pool_id, {});
      return { fields: fields.map(([label, value]) => ({ label, value: value || '' })) };
    },
  };

  // ================= JOB (every 15 minutes) =================
  async function packetJob() {
    const now = await nowIso();
    let sent = 0, opened = 0;
    const rows = await q(`select pool_id from cds_packets where active_at is null and created_at > now() - interval '120 days'`);
    for (const { pool_id } of rows) {
      const x = await load(pool_id);
      if (!x) continue;
      const pool = x.c.pool, first = (x.p.answers || {}).first || pool.first_name;
      // Step 2 opens: tell them once.
      if (x.st.step2Open && !x.p.step2_opened_at) {
        await q('update cds_packets set step2_opened_at=now() where pool_id=$1', [pool_id]);
        await closeTasks(pool_id, 'packet_checks', 'checks clear');
        const token = await crypto.token();
        await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)', [pool_id, await crypto.hash(token), 'packet-step2', addDays(now, R.CAREGIVER_LINK_DAYS)]);
        const link = packetLink(token);
        await send({ template: 'att_step2_open', channel: 'sms', audience: 'caregiver', pool_id, to: pool.phone, vars: { first, link } });
        await send({ template: 'att_step2_open', channel: 'email', audience: 'caregiver', pool_id, to: pool.email, vars: { first, link } });
        await h.task('packet_empeon', ('Checks clear: send the Empeon invite to ' + nameOf(pool) + ' (Copy for Empeon).').slice(0, 300), { pool_id }, 'packet_empeon:' + pool_id,
          (await one('select cds_next_business_4pm(now()) as d')).d);
        opened++;
      }
      // Reminders: only daytime, only while still needed.
      const rem = Array.isArray(x.p.reminders) ? x.p.reminders : [];
      let changed = false;
      for (const r of rem) {
        if (r.sent_at || new Date(r.due_at) > new Date(now)) continue;
        const still = r.kind === 'step1' ? !x.st.step1 : r.kind === 'orientation' ? (!x.p.orientation_done_at && !x.p.step2_opened_at) : false;
        if (!still) { r.sent_at = 'not needed'; changed = true; continue; }
        { const hr = +chicago(now, { hour: 'numeric', hourCycle: 'h23' }); if (hr < 9 || hr >= 19) continue; }   // daytime only
        if (r.kind === 'step1') {
          const token = await crypto.token();
          await q('insert into cds_cg_links (pool_id, token_hash, created_by, expires_at) values ($1,$2,$3,$4)', [pool_id, await crypto.hash(token), 'packet-reminder', addDays(now, R.CAREGIVER_LINK_DAYS)]);
          await send({ template: 'att_step1_reminder', channel: 'sms', audience: 'caregiver', pool_id, to: pool.phone, vars: { first, link: packetLink(token) } });
        } else await send({ template: 'att_orient_reminder', channel: 'sms', audience: 'caregiver', pool_id, to: pool.phone, vars: { first } });
        r.sent_at = now; changed = true; sent++;
      }
      if (changed) await q('update cds_packets set reminders=$2::jsonb where pool_id=$1', [pool_id, JSON.stringify(rem)]);
    }
    return { ok: true, checked: rows.length, reminders: sent, step2_opened: opened };
  }

  return { pub, att, office, packetJob, step1Done };
}
