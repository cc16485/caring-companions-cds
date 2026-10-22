// CDS consumer enrollment packet: the server logic (2026-10-22, Samantha: "build
// the consumer packet into the hub to send easily with the click of a button").
// Runs inside createMatch (supabase/functions/_shared/match/handlers.js), like the
// attendant packet, so it shares the outbox, settings, audit log and to-do list.
//
// Office   : enrollSend (the button on the lead), enrollStatus, enrollGet,
//            enrollOfficeSign (2643A + agent parts of 2678 and 2827), enrollPdfData
//            (everything the PDFs need, SSN included, audited), enrollList, enrollLinkConsumer
// Consumer : (their private link) enroll, enrollSave, enrollEsign, enrollIdentity, enrollSign
// Job      : enrollJob (the 2 reminders), run from the attendant packet's 15-minute job
//
// Her rules built in: one click for the office; each form saved write-once the
// moment it is signed; the SSN sealed the moment it is typed and never sent by
// text or email; messages held until the enroll switches are on; office texts only
// weekdays 9 to 4 Central, email any time. No em dashes.
import { FORMS, formsFor, consumerForms, formText, ourDoc, taxRows, AGENCY, EVV_CHOICES } from './forms.js';
import { ENROLL_TEMPLATES, fill } from './messages.js';

const LINK_DAYS = 30;
const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();
const digits10 = v => String(v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const fmtPhone = d => (d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d);
const chicago = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...opts }).format(new Date(iso));
const officeHours = iso => { const wd = chicago(iso, { weekday: 'short' }), hr = +chicago(iso, { hour: 'numeric', hourCycle: 'h23' }); return !['Sat', 'Sun'].includes(wd) && hr >= 9 && hr < 16; };
function tenAm(iso, n) {
  const d = new Date(new Date(iso).getTime() + n * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const off = chicago(d.toISOString(), { timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/);
  return new Date(ymd + 'T' + String(10 - (off ? +off[1] : -6)).padStart(2, '0') + ':00:00Z').toISOString();
}
const normName = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

// Only these answers are kept, each cut to a sensible length. The SSN is never one of them.
const KEYS = { who: 3, rep_name: 120, rep_rel: 120, first: 60, last: 60, street: 120, apt: 30, city: 60, state: 2, zip: 10, county: 40, phone: 20, email: 120,
  mail_same: 3, mail_street: 120, mail_city: 60, mail_state: 2, mail_zip: 10, dob: 10, first_pay: 10, evv: 5,
  b1_name: 120, b1_rel: 60, b1_phone: 20, b2_name: 120, b2_rel: 60, b2_phone: 20, v1: 120, v1_phone: 20, v2: 120, v2_phone: 20 };
export function cleanAnswers(a) {
  const out = {};
  for (const [k, n] of Object.entries(KEYS)) if (a && a[k] != null) out[k] = String(a[k]).trim().slice(0, n);
  if (out.who && !['me', 'rep'].includes(out.who)) delete out.who;
  if (out.evv && !EVV_CHOICES[out.evv]) delete out.evv;
  if (out.mail_same && !['yes', 'no'].includes(out.mail_same)) delete out.mail_same;
  for (const k of ['dob', 'first_pay']) if (out[k] && !/^\d{4}-\d{2}-\d{2}$/.test(out[k])) delete out[k];
  if (out.state) out.state = out.state.toUpperCase();
  return out;
}

// What is still missing before a form can be signed (plain words for the consumer).
export function missingFor(key, a, hasSsn) {
  const m = [];
  const about = () => { if (!a.first || !a.last) m.push('your name'); if (!a.street || !a.city || !/^\d{5}/.test(a.zip || '')) m.push('your home address'); if (!a.county) m.push('your county'); };
  if (!a.who || (a.who === 'rep' && (!a.rep_name || !a.rep_rel))) m.push('who is signing');
  if (key === 'evv' && !a.evv) m.push('how your attendant clocks in');
  if (key === 'backup' && !(a.b1_name && a.b1_rel && digits10(a.b1_phone).length === 10)) m.push('your back-up person');
  if (key === 'prev' && !a.v1) m.push('your old CDS agency');
  if (['vendor', 'numbers'].includes(key)) about();
  if (FORMS[key] && FORMS[key].group === 'tax') { about(); if (!a.dob) m.push('your date of birth'); if (!hasSsn) m.push('your Social Security number'); }
  return [...new Set(m)];
}

// Where a packet stands, for the office.
export function status(p, forms) {
  const need = consumerForms(p.kind), got = need.filter(k => forms[k]);
  const label = !p.sent_at ? 'Not sent' : p.office_signed_at ? 'Done' : p.signed_at ? 'Signed, needs your agent signature' : got.length ? got.length + ' of ' + need.length + ' signed' : p.opened_at ? 'Opened, not signed yet' : 'Sent, waiting';
  const tone = p.office_signed_at ? 'g' : p.signed_at ? 'b' : got.length || p.opened_at ? 'b' : p.sent_at ? 'y' : '';
  return { label, tone, signed: got.length, total: need.length, done: !!p.office_signed_at, consumer_done: !!p.signed_at };
}

export function createEnroll(h) {
  const { q, one, nowIso, audit, setting, task, crypto, links, R, fail, deps, isTestRecipient } = h;
  const enrollLink = t => (links.enroll ? links.enroll(t) : 'https://www.caringcds.com/enroll/?c=' + t);

  async function send({ template, channel, to, vars, lead_id, by }) {
    const t = ENROLL_TEMPLATES[template];
    if (!t || !t[channel] || !to) return null;
    const office = t.audience === 'office';
    const body = fill(t[channel], vars), subject = channel === 'email' ? fill(t.email_subject, vars) : null;
    const sw = await setting(office ? 'enroll_alerts' : 'enroll_messages', { live: false });
    let status, error = null;
    if (deps.mode === 'practice') status = 'practice';
    // While switched off, the office's own test phones and emails (setting test_recipients) still get
    // real messages, so the team can try the packet end to end, as with Caregiver Match.
    else if (!sw.live && !(isTestRecipient && await isTestRecipient(channel, to))) { status = 'held'; error = office ? 'Enrollment packet alerts are switched off (Switches card).' : 'Enrollment packet texts are switched off (Switches card).'; }
    else { try { await deps.send({ channel, to, subject, body }); status = 'sent'; } catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); } }
    return one(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,true,$8) returning id, status`,
      [t.audience, channel, 'enroll_' + template, channel === 'sms' ? R.maskPhone(to) : R.maskEmail(to), (subject ? subject + '\n\n' : '') + body, status, error, 'enroll:' + lead_id + (by ? ':' + by : '')]);
  }

  async function load(where, val) {
    const p = await one(`select * from cds_enroll_packets where ${where}=$1`, [val]);
    if (!p) return null;
    const rows = await q('select * from cds_enroll_forms where packet_id=$1', [p.id]);
    const forms = Object.fromEntries(rows.map(r => [r.form_key, r]));
    return { p, forms, st: status(p, forms) };
  }
  async function newLink(packetId, by) {
    const token = await crypto.token(), now = await nowIso();
    await q('insert into cds_enroll_links (token_hash, packet_id, created_by, expires_at) values ($1,$2,$3,$4)', [await crypto.hash(token), packetId, by, addDays(now, LINK_DAYS)]);
    return enrollLink(token);
  }
  const fullName = a => [a.first, a.last].filter(Boolean).join(' ');

  // ================= CONSUMER (private link) =================
  async function mine(link) {
    if (!link || String(link).length < 20) fail('This link is not complete. Please open the whole link from your text or email, or call (417) 218-2888.', 404);
    const l = await one('select packet_id, expires_at from cds_enroll_links where token_hash=$1', [await crypto.hash(String(link))]);
    if (!l) fail('We could not find your forms with this link. Please call (417) 218-2888 and we will send a new one.', 404);
    const now = await nowIso();
    if (new Date(l.expires_at) < new Date(now)) fail('This link has expired. Please call (417) 218-2888 and we will send you a new one.', 410);
    const x = await load('id', l.packet_id);
    if (!x.p.opened_at) await q('update cds_enroll_packets set opened_at=now() where id=$1', [x.p.id]);
    return { ...x, now };
  }
  const signerName = a => (a.who === 'rep' ? a.rep_name : fullName(a));

  const consumer = {
    async enroll({ link }) {
      const x = await mine(link);
      const a = x.p.answers || {}, has = !!x.p.ssn_ciphertext;
      const keys = formsFor(x.p.kind);
      return {
        kind: x.p.kind, first: a.first, answers: a, esign: !!x.p.esign_at, identity_done: has && !!a.dob, ssn_last4: x.p.ssn_last4 || null,
        forms: keys.map(k => ({ key: k, title: FORMS[k].title, what: FORMS[k].what, group: FORMS[k].group, who: FORMS[k].who, agree: FORMS[k].agree || '',
          doc: FORMS[k].group === 'ours' ? ourDoc(k, a) : null, rows: FORMS[k].group === 'tax' ? taxRows(k, a, x.p.ssn_last4) : null,
          signed: x.forms[k] ? { at: x.forms[k].signed_at, name: x.forms[k].signed_name } : null,
          missing: FORMS[k].who === 'consumer' ? missingFor(k, a, has) : [] })),
        done: !!x.p.signed_at, signer: signerName(a) || '',
      };
    },
    async enrollSave({ link, answers }) {
      const x = await mine(link);
      if (x.p.signed_at) fail('Your forms are already signed. Call us at (417) 218-2888 to change an answer.');
      const clean = cleanAnswers(answers || {});
      // Answers already on a signed form stay as they were signed.
      await q('update cds_enroll_packets set answers = answers || $2::jsonb, updated_at=now() where id=$1', [x.p.id, JSON.stringify(clean)]);
      return { ok: true };
    },
    async enrollEsign({ link, ip, agent }) {
      const x = await mine(link);
      if (!x.p.esign_at) await q('update cds_enroll_packets set esign_at=now(), esign_ip=$2, esign_agent=$3 where id=$1', [x.p.id, String(ip || '').slice(0, 60), String(agent || '').slice(0, 300)]);
      return { ok: true };
    },
    // The SSN is sealed the moment it arrives. Never stored in answers, never shown back but the last 4.
    async enrollIdentity({ link, ssn, ssn2, dob }) {
      const x = await mine(link);
      if (Object.values(x.forms).some(f => FORMS[f.form_key].group === 'tax')) fail('Your tax forms are already signed. Call us at (417) 218-2888 to change this.');
      const d = String(ssn || '').replace(/\D/g, '');
      if (d.length !== 9) fail('Please enter all 9 digits of the Social Security number.');
      if (d !== String(ssn2 || '').replace(/\D/g, '')) fail('The two Social Security numbers do not match.');
      if (deps.mode === 'practice' && d[0] !== '9') fail('Practice mode: use a made-up number that starts with 9. Never a real one.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ''))) fail('Please enter the date of birth.');
      const age = R.ageOn(dob, x.now);
      if (age === null || age > 115 || age < 0) fail('Please check the date of birth.');
      await q(`update cds_enroll_packets set ssn_ciphertext=$2, ssn_last4=$3, answers = answers || jsonb_build_object('dob', $4::text), updated_at=now() where id=$1`,
        [x.p.id, await crypto.encrypt(d), d.slice(-4), dob]);
      await audit('enroll:' + x.p.lead_id, 'enroll_identity', 'lead:' + x.p.lead_id, {});
      return { ok: true, ssn_last4: d.slice(-4) };
    },
    async enrollSign({ link, form, typed_name, agree, ip, agent }) {
      const x = await mine(link);
      const f = FORMS[form];
      if (!f || f.who !== 'consumer' || !formsFor(x.p.kind).includes(form)) fail('Unknown form');
      if (x.forms[form]) return { ok: true, already: true };
      if (!x.p.esign_at) fail('Please agree to sign electronically first.');
      if (agree !== true) fail('Please tick the box to say you read it and agree.');
      const a = x.p.answers || {};
      const m = missingFor(form, a, !!x.p.ssn_ciphertext);
      if (m.length) fail('Before you sign, please add: ' + m.join('; ') + '.');
      const name = String(typed_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (name.split(' ').length < 2) fail('Please type your full name, first and last, to sign.');
      if (normName(name) !== normName(signerName(a))) fail('Please type your name exactly as ' + signerName(a) + ' to sign.');
      const fp = await crypto.hash(formText(form, a, x.p.ssn_last4));
      await q(`insert into cds_enroll_forms (packet_id, form_key, version, fingerprint, answers, signed_name, signer_role, signed_ip, signed_agent)
               values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) on conflict (packet_id, form_key) do nothing`,
        [x.p.id, form, f.version, fp, JSON.stringify(a), name, a.who === 'rep' ? 'rep' : 'consumer', String(ip || '').slice(0, 60), String(agent || '').slice(0, 300)]);
      await audit('enroll:' + x.p.lead_id, 'enroll_signed', 'lead:' + x.p.lead_id, { form, version: f.version });
      const n = await one('select count(*)::int c from cds_enroll_forms where packet_id=$1 and form_key = any($2)', [x.p.id, consumerForms(x.p.kind)]);
      if (n.c === consumerForms(x.p.kind).length) await allSigned(x.p.id);
      return { ok: true };
    },
  };

  // Every consumer form is signed: tell the office, make the to-do, stop the reminders.
  async function allSigned(packetId) {
    const x = await load('id', packetId);
    if (x.p.signed_at) return;
    await q(`update cds_enroll_packets set signed_at=now(), updated_at=now() where id=$1`, [packetId]);
    const a = x.p.answers || {}, name = fullName(a) || 'A consumer';
    await task('enroll_agent', ('Sign 2678 and 2827 as agent for ' + name + ', then send the tax forms (enrollment packet signed).').slice(0, 300), {}, 'enroll_agent:' + packetId,
      (await one('select cds_next_business_4pm(now()) as d')).d);
    const v = { name, rep: a.who === 'rep' ? ' (signed by ' + a.rep_name + ', ' + a.rep_rel + ')' : '',
      next: x.p.kind === 'move' ? 'Fax the Previous Vendor form to their old agency, then send 8821, 2678 and 2827.' : 'Apply for their EIN online, then send 8821, 2678, and 2643A with 2827 once the EIN is in.' };
    const now = await nowIso(), inHours = officeHours(now);
    const cfg = await setting('enroll_alerts', { recipients: [] });
    for (const r of cfg.recipients || []) {
      if (r.email) await send({ template: 'office_signed', channel: 'email', to: r.email, vars: v, lead_id: x.p.lead_id });
      if (r.phone && inHours) await send({ template: 'office_signed', channel: 'sms', to: r.phone, vars: v, lead_id: x.p.lead_id });
    }
    await audit('system', 'enroll_all_signed', 'lead:' + x.p.lead_id, { office_texts: inHours });
  }

  // ================= OFFICE =================
  const who = s => { if (!s) fail('Please sign in to the CDS Hub.', 401); return s; };
  const office = {
    // The button on the lead. The hub sends what the lead already holds, so the consumer starts with it filled in.
    async enrollSend({ staff, lead }) {
      who(staff);
      const L = lead || {};
      const id = String(L.id || '').trim().slice(0, 80);
      if (!id) fail('Open a lead first.');
      const phone = digits10(L.phone), email = String(L.email || '').trim().toLowerCase();
      const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      if (phone.length !== 10 && !okEmail) fail('This lead needs a cell phone or an email address before the packet can be sent.');
      const kind = L.type === 'pccp' ? 'move' : 'new';
      const parts = String(L.name || '').trim().split(/\s+/);
      const pre = cleanAnswers({ first: L.first || parts[0] || '', last: L.last || parts.slice(1).join(' '), phone: phone.length === 10 ? fmtPhone(phone) : '', email: okEmail ? email : '',
        county: L.county, street: L.street, apt: L.apt, city: L.city, zip: L.zip, state: 'MO', v1: kind === 'move' ? L.leavingAgency : '' });
      let x = await load('lead_id', id);
      if (x && x.p.signed_at) fail('This packet is already signed. Nothing was sent.');
      if (x && Object.keys(x.forms).length && x.p.kind !== kind) fail('Some forms are already signed for the other kind of lead. Call the consumer before changing it.');
      if (!x) await q('insert into cds_enroll_packets (lead_id, kind, answers) values ($1,$2,$3::jsonb)', [id, kind, JSON.stringify(Object.fromEntries(Object.entries(pre).filter(([, v]) => v)))]);
      else {
        // Fill only what the consumer has not answered themselves.
        const keep = x.p.answers || {}, add = Object.fromEntries(Object.entries(pre).filter(([k, v]) => v && !keep[k]));
        await q('update cds_enroll_packets set kind=$2, answers = $3::jsonb || answers, updated_at=now() where id=$1', [x.p.id, kind, JSON.stringify(add)]);
      }
      x = await load('lead_id', id);
      const link = await newLink(x.p.id, staff);
      const now = await nowIso(), first = (x.p.answers || {}).first || 'there';
      const out = [];
      if (phone.length === 10) out.push(await send({ template: 'link', channel: 'sms', to: fmtPhone(phone), vars: { first, link }, lead_id: id, by: staff }));
      if (okEmail) out.push(await send({ template: 'link', channel: 'email', to: email, vars: { first, link }, lead_id: id, by: staff }));
      await q(`update cds_enroll_packets set sent_by=$2, sent_at=now(), reminders=$3::jsonb, updated_at=now() where id=$1`,
        [x.p.id, staff, JSON.stringify([{ due_at: tenAm(now, 2) }, { due_at: tenAm(now, 4) }])]);
      await audit('staff:' + staff, 'enroll_sent', 'lead:' + id, { kind, sms: phone.length === 10, email: okEmail });
      const y = await load('lead_id', id);
      // The link itself only comes back in practice, so the office can open what the consumer sees.
      return { ok: true, status: y.st, messages: out.filter(Boolean).map(m => m.status), practice_link: deps.mode === 'practice' ? link : undefined };
    },
    async enrollStatus({ staff, lead_ids }) {
      who(staff);
      const ids = (Array.isArray(lead_ids) ? lead_ids : []).map(String).slice(0, 500);
      if (!ids.length) return { packets: {} };
      const out = {};
      for (const r of await q('select lead_id from cds_enroll_packets where lead_id = any($1)', [ids])) {
        const x = await load('lead_id', r.lead_id); out[r.lead_id] = { ...x.st, kind: x.p.kind, sent_at: x.p.sent_at, signed_at: x.p.signed_at };
      }
      return { packets: out };
    },
    async enrollGet({ staff, lead_id }) {
      who(staff);
      const x = await load('lead_id', String(lead_id || ''));
      if (!x) return { packet: null };
      const a = x.p.answers || {};
      const msgs = await q(`select channel, template, to_display, status, error, created_at from cds_outbox where created_by like $1 order by created_at desc limit 20`, ['enroll:' + x.p.lead_id + '%']);
      return { packet: { kind: x.p.kind, sent_at: x.p.sent_at, sent_by: x.p.sent_by, opened_at: x.p.opened_at, signed_at: x.p.signed_at,
          office_signed_at: x.p.office_signed_at, office_signed_by: x.p.office_signed_by, consumer_id: x.p.consumer_id, reminders: x.p.reminders,
          who: a.who === 'rep' ? a.rep_name + ' (' + a.rep_rel + ')' : null },
        status: x.st,
        forms: formsFor(x.p.kind).map(k => ({ key: k, title: FORMS[k].title, who: FORMS[k].who, agent: !!FORMS[k].agent,
          signed_at: x.forms[k] && x.forms[k].signed_at, signed_name: x.forms[k] && x.forms[k].signed_name, agent_at: x.forms[k] && x.forms[k].agent_at })),
        messages: msgs };
    },
    // Today Samantha signs 2643A herself and signs 2678 Part 3 and 2827 as the agent. One tap, typed name.
    async enrollOfficeSign({ staff, lead_id, typed_name }) {
      who(staff);
      const name = String(typed_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (name.split(' ').length < 2) fail('Type your full name to sign as agent.');
      const x = await load('lead_id', String(lead_id || ''));
      if (!x) fail('Not found', 404);
      if (!x.p.signed_at) fail('The consumer has not signed every form yet.');
      if (x.p.office_signed_at) return { ok: true, already: true };
      const a = x.p.answers || {};
      if (formsFor(x.p.kind).includes('mo2643a') && !x.forms.mo2643a)
        await q(`insert into cds_enroll_forms (packet_id, form_key, version, fingerprint, answers, signed_name, signer_role) values ($1,'mo2643a',$2,$3,$4::jsonb,$5,'office')`,
          [x.p.id, FORMS.mo2643a.version, await crypto.hash(formText('mo2643a', a, x.p.ssn_last4)), JSON.stringify(a), name]);
      await q(`update cds_enroll_forms set agent_name=$2, agent_by=$3, agent_at=now() where packet_id=$1 and form_key in ('f2678','mo2827') and agent_at is null`, [x.p.id, name, staff]);
      await q('update cds_enroll_packets set office_signed_at=now(), office_signed_by=$2, updated_at=now() where id=$1', [x.p.id, staff]);
      await q(`update cds_tasks set done_at=now(), done_by=$2 where dedupe_key=$1 and done_at is null`, ['enroll_agent:' + x.p.id, staff]);
      await audit('staff:' + staff, 'enroll_office_signed', 'lead:' + x.p.lead_id, {});
      return { ok: true };
    },
    // Everything the forms need, for the hub to fill the PDFs in the browser. Includes
    // the full SSN, so every call is in the audit log (her rule: office reveals, logged).
    async enrollPdfData({ staff, lead_id }) {
      who(staff);
      const x = await load('lead_id', String(lead_id || ''));
      if (!x) fail('Not found', 404);
      if (!x.p.signed_at) fail('The consumer has not signed every form yet.');
      const ssn = x.p.ssn_ciphertext ? await crypto.decrypt(x.p.ssn_ciphertext) : '';
      await audit('staff:' + staff, 'enroll_pdf_ssn', 'lead:' + x.p.lead_id, {});
      return { kind: x.p.kind, answers: x.p.answers || {}, ssn, agency: AGENCY, esign_at: x.p.esign_at,
        forms: Object.fromEntries(Object.entries(x.forms).map(([k, f]) => [k, { version: f.version, fingerprint: f.fingerprint, answers: f.answers, signed_name: f.signed_name,
          signer_role: f.signer_role, signed_at: f.signed_at, signed_ip: f.signed_ip, agent_name: f.agent_name, agent_at: f.agent_at }])),
        docs: Object.fromEntries(formsFor(x.p.kind).filter(k => FORMS[k].group === 'ours').map(k => [k, { title: FORMS[k].title, file: FORMS[k].file, doc: ourDoc(k, (x.forms[k] || {}).answers || x.p.answers || {}) }])),
        files: Object.fromEntries(formsFor(x.p.kind).map(k => [k, { file: FORMS[k].file, title: FORMS[k].title }])) };
    },
    // Finished packets, for Tax Setup's "Get the forms from the Hub packet".
    async enrollList({ staff }) {
      who(staff);
      const rows = await q(`select lead_id, kind, answers->>'first' as first, answers->>'last' as last, signed_at, office_signed_at, consumer_id from cds_enroll_packets where signed_at is not null order by signed_at desc limit 200`);
      return { packets: rows.map(r => ({ lead_id: r.lead_id, kind: r.kind, name: [r.first, r.last].filter(Boolean).join(' '), signed_at: r.signed_at, office_signed: !!r.office_signed_at, consumer_id: r.consumer_id })) };
    },
    async enrollLinkConsumer({ staff, lead_id, consumer_id }) {
      who(staff);
      const r = await one('update cds_enroll_packets set consumer_id=$2, updated_at=now() where lead_id=$1 returning id', [String(lead_id || ''), String(consumer_id || '').slice(0, 80) || null]);
      if (!r) fail('Not found', 404);
      await audit('staff:' + staff, 'enroll_linked', 'lead:' + lead_id, { consumer_id });
      return { ok: true };
    },
  };

  // ================= JOB (every 15 minutes, with the attendant packet's job) =================
  async function enrollJob() {
    const now = await nowIso();
    let sent = 0;
    const hr = +chicago(now, { hour: 'numeric', hourCycle: 'h23' });
    for (const p of await q(`select * from cds_enroll_packets where signed_at is null and sent_at is not null and created_at > now() - interval '60 days'`)) {
      const rem = Array.isArray(p.reminders) ? p.reminders : [];
      let changed = false;
      for (const r of rem) {
        if (r.sent_at || new Date(r.due_at) > new Date(now)) continue;
        if (hr < 9 || hr >= 19) continue;   // daytime only
        const a = p.answers || {}, phone = digits10(a.phone);
        if (phone.length === 10) {
          const link = await newLink(p.id, 'enroll-reminder');
          await send({ template: 'reminder', channel: 'sms', to: fmtPhone(phone), vars: { first: a.first || 'there', link }, lead_id: p.lead_id });
          r.sent_at = now; sent++;
        } else r.sent_at = 'no cell phone';
        changed = true;
      }
      if (changed) await q('update cds_enroll_packets set reminders=$2::jsonb where id=$1', [p.id, JSON.stringify(rem)]);
    }
    return { ok: true, reminders: sent };
  }

  return { consumer, office, enrollJob };
}
