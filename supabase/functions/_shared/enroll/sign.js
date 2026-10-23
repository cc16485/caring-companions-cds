// Missouri forms for consumers already on the roster (2026-10-22, Samantha approved the mockup
// claude.ai/artifact/L4Sq459wGcwy7JBX5A5yGb and "build them in practice, switches off").
// One form per request, signed on the consumer's phone at caringcds.com/sign:
//   rights        19 CSR 15-8.400(5)(H)7: signed notice of hearing rights (15-8.500) and consumer
//                 responsibilities (15-8.200(6)). Once.
//   office        MMAC CDS Program Requirements 2.3(e): office address, phones and hours in writing. Once.
//   pandemic      19 CSR 15-8.400(2): the pandemic policy, given every year (signed for the year).
//   pandemic_att  19 CSR 15-8.400(2): the consumer trained their attendant on it, every year
//                 (consumer and attendant both type their names).
// Runs inside createMatch like the enrollment packet: same outbox, settings, audit log and crypto.
// Texts and emails to consumers wait in Messages until the switch consumer_forms is on (the office's
// own test phones still get them). Each signature is write-once and keeps the text's fingerprint.
// No em dashes in anything a person reads.
import { AGENCY } from './forms.js';
import { fill } from './messages.js';

const LINK_DAYS = 30;
const V = '2026-10-22';
const OFFICE = '(417) 218-2888';
const SIGN_OFF = 'Caring Companions CDS\n' + OFFICE + ' (toll free (866) 863-5151)';

// The pandemic policy as the consumer reads it. Her full policy (approved 2026-10-22) is the doc
// claude.ai/artifact/23cZNgtd2264rB42LbkdW6; when she changes it, change this text AND the version.
export const PANDEMIC_VERSION = '2026-10-22';   // approved by Samantha 2026-10-22

export const SIGN_FORMS = {
  rights: { version: V, yearly: false, title: 'Your Rights and Responsibilities in CDS', what: 'Your right to a hearing, and what you are responsible for as the employer.',
    agree: 'I was told my hearing rights and my responsibilities in CDS, and I got a copy.' },
  office: { version: V, yearly: false, title: 'How to Reach Caring Companions', what: 'Our office address, phone numbers and office hours.',
    agree: 'I got Caring Companions’ office address, phone numbers and office hours in writing.' },
  pandemic: { version: PANDEMIC_VERSION, yearly: true, title: 'Pandemic Preparedness Policy', what: 'What happens to your care during a pandemic. Missouri asks us to give it to you every year.',
    agree: 'I received Caring Companions’ Pandemic Preparedness Policy for this year.' },
  pandemic_att: { version: PANDEMIC_VERSION, yearly: true, attendant: true, title: 'Pandemic Policy: Attendant Training', what: 'You went over the pandemic policy with your attendant. You both sign.',
    agree: 'I, the consumer, went over the Pandemic Preparedness Policy with my attendant. I, the attendant, was trained on it.' },
};
export const SIGN_KEYS = Object.keys(SIGN_FORMS);

const full = a => [a.first, a.last].filter(Boolean).join(' ');

// The words of each form, as blocks ({h} heading, {p} paragraph, {li} list, {kv} pairs).
export function signDoc(key, a = {}) {
  if (key === 'rights') return [
    { h: 'Your right to a hearing' },
    { li: ['If DHSS denies, reduces, suspends or ends your CDS, or you disagree with your plan of care, you may ask for a hearing in writing.',
      'Ask DHSS in writing within 90 days of the decision.',
      'If you ask within 10 days of the notice being mailed, your services stay the same until the hearing decides, unless you ask in writing for them to stop.',
      'If DHSS’s decision is upheld, you may have to repay services used while you waited.'] },
    { h: 'Your responsibilities' },
    { li: ['Choose, hire, train and supervise your attendant.',
      'Make sure your attendant clocks in and out (EVV) for every shift.',
      'Never let hours go over what your plan of care allows.',
      'Tell DHSS or us within 10 days of changes to your care or a move.',
      'Tell us about problems with your attendant’s care. If we can’t fix it, tell DHSS.',
      'Let us do the monthly check-in and the yearly visit in your home.',
      'Tell DHSS about big changes in your health or your ability to direct your care.'] },
    { p: 'These come from Missouri’s rules: 19 CSR 15-8.500 (hearings) and 19 CSR 15-8.200 (consumer responsibilities).' },
  ];
  if (key === 'office') return [
    { kv: [['Office', AGENCY.street + ', ' + AGENCY.city + ', ' + AGENCY.state + ' ' + AGENCY.zip],
      ['Phone, answered 24 hours a day', OFFICE], ['Toll free', '(866) 863-5151'], ['Fax', AGENCY.fax], ['Email', AGENCY.email],
      ['Office hours', a.hours || '']] },
    { p: 'If any of this changes, we will tell you in writing.' },
  ];
  if (key === 'pandemic' || key === 'pandemic_att') return [
    { h: 'When this policy starts' },
    { p: 'When the CDC, the Governor of Missouri, DHSS or your local health department declares a pandemic or a public health emergency, or limits home visits. We tell you when it starts and ends.' },
    { h: 'Getting ready, all year' },
    { li: ['Keep your back-up plan current: at least one back-up person and an emergency contact.',
      'Keep phone numbers for us, your attendant, your back-up person, your doctor and your pharmacy where your attendant can see them.',
      'Keep about two weeks of medicines, food, water and cleaning supplies when you can.',
      'Keep a short care sheet your attendant and back-up person can follow.'] },
    { h: 'During a pandemic' },
    { li: ['Your attendant washes hands when arriving, before and after care, and before leaving, and wears a mask or gloves when told to or when anyone is sick.',
      'Your attendant does not come to work sick. They tell you and call us right away.',
      'If your attendant can’t come, call your back-up person, then call us. We help find another attendant. A new attendant still needs clear background checks first.',
      'Your attendant keeps clocking in and out for every shift. Hours never go over your plan of care.',
      'Our monthly check-in call keeps going by phone or video.'] },
    { h: 'If services have to stop' },
    { li: ['We call you the same day to make sure someone can care for you.',
      'We tell your DHSS case manager right away, and we tell you and your attendant in writing.',
      'We call you at least once a week until services start again, and we tell your DHSS case manager when they restart.'] },
    { p: 'Questions any time: ' + OFFICE + ', answered 24 hours a day.' },
    ...(key === 'pandemic_att' ? [{ kv: [['Attendant', a.att_name || '']] }] : []),
  ];
  return [];
}
// The exact text a signature is fingerprinted against.
export function signText(key, a = {}, year = 0) {
  const f = SIGN_FORMS[key];
  const body = signDoc(key, a).map(b => b.h || b.p || (b.li || []).join('\n') || (b.kv || []).map(([k, v]) => k + ': ' + v).join('\n')).join('\n');
  return [f.title, f.version, year || '', full(a), body, f.agree].join('\n');
}

const SIGN_TEMPLATES = {
  link: {
    sms: 'Hi {first}, this is Caring Companions. Please sign "{title}" on your phone. It takes about 2 minutes: {link} Questions? Call ' + OFFICE + '.',
    email_subject: 'Please sign: {title}',
    email: 'Hi {first},\n\nPlease read and sign "{title}". {what} It takes about 2 minutes:\n\n{link}\n\nThe link works only for you, so please do not share it.\n\n' + SIGN_OFF },
};

const digits10 = v => String(v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const fmtPhone = d => (d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d);
const normName = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();
const chicagoYear = iso => +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' }).format(new Date(iso));

export function createSign(h) {
  const { q, one, nowIso, audit, setting, crypto, links, R, fail, deps, isTestRecipient } = h;
  const signLink = t => (links.sign ? links.sign(t) : 'https://www.caringcds.com/sign/?c=' + t);

  async function send({ channel, to, vars, cid, by }) {
    const t = SIGN_TEMPLATES.link;
    const body = fill(t[channel], vars), subject = channel === 'email' ? fill(t.email_subject, vars) : null;
    const sw = await setting('consumer_forms', { live: false });
    let status, error = null;
    if (deps.mode === 'practice') status = 'practice';
    else if (!sw.live && !(isTestRecipient && await isTestRecipient(channel, to))) { status = 'held'; error = 'Missouri forms texts are switched off (Switches card).'; }
    else { try { await deps.send({ channel, to, subject, body }); status = 'sent'; } catch (e) { status = 'failed'; error = String(e && e.message || e).slice(0, 300); } }
    return one(`insert into cds_outbox (audience, channel, template, to_display, body, status, error, automatic, created_by)
      values ('family',$1,'sign_link',$2,$3,$4,$5,false,$6) returning id, status`,
      [channel, channel === 'sms' ? R.maskPhone(to) : R.maskEmail(to), (subject ? subject + '\n\n' : '') + body, status, error, 'sign:' + cid + (by ? ':' + by : '')]);
  }

  const who = s => { if (!s) fail('Please sign in to the CDS Hub.', 401); return s; };
  const pub = r => ({ form: r.form_key, year: r.year || null, sent_at: r.sent_at, opened_at: r.opened_at, signed_at: r.signed_at, signed_name: r.signed_name,
    att_signed_name: r.att_signed_name || null, signer_role: r.signer_role || null, version: r.version || null });

  const office = {
    // The button on a consumer's profile.
    async signSend({ staff, consumer, form, att_name, hours }) {
      who(staff);
      const f = SIGN_FORMS[form];
      if (!f) fail('Unknown form');
      const C = consumer || {};
      const cid = String(C.id || '').trim().slice(0, 80);
      if (!cid) fail('Open a consumer first.');
      const phone = digits10(C.phone), email = String(C.email || '').trim().toLowerCase();
      const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      if (phone.length !== 10 && !okEmail) fail('This consumer needs a cell phone or an email address on their profile first.');
      const parts = String(C.name || '').trim().split(/\s+/);
      const answers = { first: parts[0] || '', last: parts.slice(1).join(' ') };
      if (f.attendant) { answers.att_name = String(att_name || '').trim().replace(/\s+/g, ' ').slice(0, 120); if (answers.att_name.split(' ').length < 2) fail('Type the attendant’s full name first.'); }
      if (form === 'office') { answers.hours = String(hours || '').trim().slice(0, 120); if (!answers.hours) fail('Add the office hours on the Settings page first.'); }
      const now = await nowIso(), year = f.yearly ? chicagoYear(now) : 0;
      let r = await one('select * from cds_sign_requests where consumer_id=$1 and form_key=$2 and year=$3', [cid, form, year]);
      if (r && r.signed_at) fail('Already signed' + (year ? ' for ' + year : '') + '. Nothing was sent.');
      if (!r) r = await one(`insert into cds_sign_requests (consumer_id, consumer_name, form_key, year, answers) values ($1,$2,$3,$4,$5::jsonb) returning *`,
        [cid, String(C.name || '').slice(0, 120), form, year, JSON.stringify(answers)]);
      else await q('update cds_sign_requests set consumer_name=$2, answers=$3::jsonb where id=$1', [r.id, String(C.name || '').slice(0, 120), JSON.stringify(answers)]);
      const token = await crypto.token();
      await q('insert into cds_sign_links (token_hash, request_id, created_by, expires_at) values ($1,$2,$3,$4)', [await crypto.hash(token), r.id, staff, addDays(now, LINK_DAYS)]);
      const link = signLink(token);
      const vars = { first: answers.first || 'there', link, title: f.title, what: f.what };
      const out = [];
      if (phone.length === 10) out.push(await send({ channel: 'sms', to: fmtPhone(phone), vars, cid, by: staff }));
      if (okEmail) out.push(await send({ channel: 'email', to: email, vars, cid, by: staff }));
      await q('update cds_sign_requests set sent_by=$2, sent_at=now() where id=$1', [r.id, staff]);
      await audit('staff:' + staff, 'sign_sent', 'consumer:' + cid, { form, year, sms: phone.length === 10, email: okEmail });
      return { ok: true, messages: out.filter(Boolean).map(m => m.status), practice_link: deps.mode === 'practice' ? link : undefined };
    },
    // Where each consumer stands, for the profile and the roster.
    async signStatus({ staff, consumer_ids }) {
      who(staff);
      const ids = (Array.isArray(consumer_ids) ? consumer_ids : []).map(String).slice(0, 500);
      if (!ids.length) return { consumers: {} };
      const rows = await q('select * from cds_sign_requests where consumer_id = any($1) order by year, created_at', [ids]);
      const out = {};
      for (const r of rows) { const o = out[r.consumer_id] = out[r.consumer_id] || {}; (o[r.form_key] = o[r.form_key] || []).push(pub(r)); }
      return { consumers: out, year: chicagoYear(await nowIso()) };
    },
  };

  async function mine(link) {
    if (!link || String(link).length < 20) fail('This link is not complete. Please open the whole link from your text or email, or call ' + OFFICE + '.', 404);
    const l = await one('select request_id, expires_at from cds_sign_links where token_hash=$1', [await crypto.hash(String(link))]);
    if (!l) fail('We could not find this form. Please call ' + OFFICE + ' and we will send a new link.', 404);
    const now = await nowIso();
    if (new Date(l.expires_at) < new Date(now)) fail('This link has expired. Please call ' + OFFICE + ' and we will send you a new one.', 410);
    const r = await one('select * from cds_sign_requests where id=$1', [l.request_id]);
    if (!r.opened_at) await q('update cds_sign_requests set opened_at=now() where id=$1', [r.id]);
    return r;
  }

  const consumer = {
    async signGet({ link }) {
      const r = await mine(link);
      const f = SIGN_FORMS[r.form_key], a = r.answers || {};
      return { form: r.form_key, title: f.title, what: f.what, agree: f.agree, year: r.year || null, doc: signDoc(r.form_key, a),
        name: full(a), first: a.first || '', attendant: !!f.attendant, att_name: a.att_name || '',
        signed: r.signed_at ? { at: r.signed_at, name: r.signed_name, att_name: r.att_signed_name } : null };
    },
    async signDo({ link, typed_name, rep, att_typed, agree, ip, agent }) {
      const r = await mine(link);
      if (r.signed_at) return { ok: true, already: true };
      const f = SIGN_FORMS[r.form_key], a = r.answers || {};
      if (agree !== true) fail('Please tick the box to say you read it and agree.');
      const name = String(typed_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (name.split(' ').length < 2) fail('Please type your full name, first and last, to sign.');
      let role = 'consumer', repRel = '';
      if (rep && rep.rel) {
        role = 'rep'; repRel = String(rep.rel).trim().slice(0, 60);
        if (!repRel) fail('Say how you are related to ' + full(a) + '.');
      } else if (normName(name) !== normName(full(a))) fail('Please type the name exactly as ' + full(a) + ', or tick that you sign for them as their legal representative.');
      let att = null;
      if (f.attendant) {
        att = String(att_typed || '').trim().replace(/\s+/g, ' ').slice(0, 120);
        if (att.split(' ').length < 2) fail('The attendant types their full name too.');
        if (a.att_name && normName(att) !== normName(a.att_name)) fail('The attendant types their name exactly as ' + a.att_name + '.');
      }
      const fp = await crypto.hash(signText(r.form_key, a, r.year));
      const done = await one(`update cds_sign_requests set signed_at=now(), signed_name=$2, signer_role=$3, rep_rel=$4, att_signed_name=$5, version=$6, fingerprint=$7,
          signed_ip=$8, signed_agent=$9 where id=$1 and signed_at is null returning id`,
        [r.id, name, role, repRel || null, att, f.version, fp, String(ip || '').slice(0, 60), String(agent || '').slice(0, 300)]);
      if (done) await audit('consumer:' + r.consumer_id, 'sign_signed', 'consumer:' + r.consumer_id, { form: r.form_key, year: r.year, version: f.version });
      return { ok: true };
    },
  };

  return { office, consumer };
}
