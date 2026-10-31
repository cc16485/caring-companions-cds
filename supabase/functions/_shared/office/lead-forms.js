// Every website form becomes a GoHighLevel contact with a note saying which form and what they
// answered; findcdscaregivers families show on Leads (2026-10-31, Samantha: "leads should make a
// contact if they came in from a website form, also i need a more clear view of what form they
// filled out and who they are"; her answers: yes to one note on the contact, and Leads gets
// families plus caregivers who already have someone to care for).
//
// Runs inside the 2-minute lead job, after lead-ghl.js. Four parts:
//   1. Form name + answers: every website lead (site_leads) gets form_name and form_answers, in
//      words, for the hub. Database only, so it runs in practice too.
//   2. Caregiver sign-ups (attendant_pool, not added by the office): found or added in GoHighLevel
//      the same way as website leads (lead-ghl.js: name, phone, email, nothing else).
//   3. Onto Leads: families who asked for access on findcdscaregivers.com, and caregivers who said
//      they already have someone to care for, are copied into site_leads, so the hub's Leads import
//      picks them up. Marked as alerted: they already had their own alert or task.
//   4. One note on each GoHighLevel contact: the form, the day, the answers. A note is not a tag or
//      a custom field; none of the 28 CDS workflows read 2026-10-20 starts on a note.
// Parts 2 to 4 need setting lead_forms.live; in practice they only count what they would do.
// No em dashes in anything a person reads (her rule).
import { AGENCY_ID } from './lead-alerts.js';
import { contactBody, checkBody } from './lead-ghl.js';
import { PROGRAMS, RELATIONSHIPS } from '../match/rules.js';

const ten = s => String(s ?? '').replace(/\D/g, '').slice(-10);
const RETRY_MS = 60 * 60000, MAX_TRIES = 3;
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const yesNo = v => v === true ? 'Yes' : v === false ? 'No' : '';

// The form's name, the way the office says it.
export function formName(source) {
  const s = String(source || '').toLowerCase();
  if (/findcdscaregivers request access/.test(s)) return 'findcdscaregivers.com: family asking for a caregiver';
  if (/eligib|check/.test(s)) return 'caringcds.com: Check if you qualify';
  if (/switch/.test(s)) return 'caringcds.com: Switch to Caring Companions CDS';
  if (/contact/.test(s)) return 'caringcds.com: Contact us';
  if (/home/.test(s)) return 'caringcds.com: Home page';
  if (/consumers/.test(s)) return 'caringcds.com: For consumers page';
  if (/service area/.test(s)) return 'caringcds.com: Service area page';
  return s ? 'Website: ' + clean(source) : 'Website form';
}

// A caregiver sign-up's form, from attendant_pool.source.
export function caregiverFormName(source) {
  const s = String(source || '').toLowerCase();
  if (/findcdscaregivers/.test(s)) return 'findcdscaregivers.com: caregiver sign-up';
  if (s === 'apply') return 'caringcds.com: attendant application';
  if (s === 'public' || !s) return 'caringcds.com: caregiver list sign-up';
  return 'Caregiver sign-up: ' + clean(source);
}

// A website lead's answers as [question, answer] pairs. The message box can hold "topic: ..." and
// "person: ..." lines from the form; anything else is what they wrote.
const MSG_KEYS = { topic: 'What it is about', person: 'Who they are', role: 'Who they are', program: 'Program now' };
export function siteAnswers(r) {
  const out = [];
  if (r.who_needs_care) out.push(['Who needs care', clean(r.who_needs_care)]);
  if (r.has_medicaid) out.push(['Medicaid', clean(r.has_medicaid)]);
  if (r.county) out.push(['County', clean(r.county)]);
  const said = [];
  for (const line of String(r.message || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([a-z_ ]{2,20}):\s*(.+)$/i);
    const k = m && MSG_KEYS[m[1].trim().toLowerCase()];
    if (k) out.push([k, clean(m[2])]); else if (line.trim()) said.push(line.trim());
  }
  if (said.length) out.push(['They wrote', said.join(' ').slice(0, 1500)]);
  return out;
}
export function caregiverAnswers(p) {
  const counties = Array.isArray(p.counties) ? p.counties.join(', ') : clean(p.counties);
  const certs = [p.cert_cpr && 'CPR', p.cert_cna && 'CNA', clean(p.cert_other)].filter(Boolean).join(', ');
  const has = p.has_potential_consumer;
  return [
    ['Who they are', 'A caregiver signing up to work'],
    ['Has someone to care for', clean(has)],
    has === 'Yes' && p.consumer_relationship ? ['That person is their', clean(p.consumer_relationship)] : null,
    has === 'Yes' && p.consumer_has_medicaid ? ['That person\'s Medicaid', clean(p.consumer_has_medicaid)] : null,
    ['Town', [clean(p.city), clean(p.zip)].filter(Boolean).join(' ')],
    ['Counties', counties],
    ['Hours wanted', clean(p.hours_wanted)],
    ['Has a car', yesNo(p.has_transport)],
    ['Experience', [clean(p.experience), clean(p.experience_notes)].filter(Boolean).join('. ')],
    ['Certificates', certs],
    ['Heard about us', clean(p.how_heard)],
    ['They wrote', clean(p.applicant_notes)],
  ].filter(a => a && a[1]);
}
export function prospectAnswers(p) {
  const n = typeof p.needs === 'string' ? JSON.parse(p.needs || '{}') : (p.needs || {});
  return [
    ['Who they are', 'A family asking for a caregiver'],
    ['Care is for', RELATIONSHIPS[n.relationship] || ''],
    ['Program now', PROGRAMS[n.program] || ''],
    ['Town', clean(p.town)],
    ['County', clean(p.county)],
    ['Best time to call', clean(n.best_time)],
  ].filter(a => a[1]);
}

// The note on the GoHighLevel contact.
export function noteText(name, at, answers) {
  const day = at ? new Date(at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return ['Filled out: ' + name + (day ? ' on ' + day : '') + '.']
    .concat(answers.map(([k, v]) => k + ': ' + v)).join('\n').slice(0, 4000);
}

// deps: { db: { query(text, params) -> { rows } }, now?: () => ms,
//         ghl: { search(query), create(body) -> id, get(id) -> contact|null, note(id, body) } }
export function createLeadForms(deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const q = async (t, p) => (await deps.db.query(t, p)).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const err = e => String((e && e.message) || e).slice(0, 200);

  async function find(r) {
    const p = ten(r.phone), e = String(r.email || '').trim().toLowerCase();
    if (p.length === 10) {
      const hits = (await deps.ghl.search(p)).filter(c => ten(c.phone) === p);
      if (hits.length) return hits;
    }
    if (e) return (await deps.ghl.search(e)).filter(c => String(c.email || '').trim().toLowerCase() === e);
    return [];
  }

  // 1. Form name and answers on every website lead (practice too: database only).
  async function names() {
    let n = 0;
    for (const r of await q(`select * from site_leads where agency_id=$1 and form_name is null`, [AGENCY_ID])) {
      await q(`update site_leads set form_name=$2, form_answers=$3::jsonb where id=$1`, [r.id, formName(r.source), JSON.stringify(siteAnswers(r))]);
      n++;
    }
    return n;
  }

  // 2. Caregiver sign-ups into GoHighLevel, the same rules as website leads.
  async function caregivers(live, sum, limit) {
    const t = new Date(now()).toISOString(), retryBefore = new Date(now() - RETRY_MS).toISOString();
    const rows = await q(`select * from attendant_pool
       where agency_id=$1 and not coalesce(archived,false) and ghl_contact_id is null and coalesce(source,'') <> 'staff'
         and (ghl_at is null
              or (ghl_status like 'failed%' and ghl_tries < $2 and ghl_at < $3)
              or ($4 and ghl_status = 'practice: would create'))
       order by submitted_at limit $5`, [AGENCY_ID, MAX_TRIES, retryBefore, live, limit]);
    for (const r of rows) {
      const mine = await one(`update attendant_pool set ghl_at=$2, ghl_tries=ghl_tries+1 where id=$1 and ghl_contact_id is null
                              and (ghl_at is distinct from $3) returning id`, [r.id, t, t]);
      if (!mine) continue;
      const mark = (status, id = null) => q(`update attendant_pool set ghl_status=$2, ghl_contact_id=coalesce($3, ghl_contact_id) where id=$1`,
        [r.id, String(status).slice(0, 300), id]);
      try {
        const body = checkBody(contactBody(r));
        if (!body.phone && !body.email) { await mark('skipped: no phone or email'); sum.cgSkipped++; continue; }
        const hits = await find(r);
        if (hits.length === 1) { await mark('found', String(hits[0].id)); sum.cgFound++; continue; }
        if (hits.length > 1) { await mark('several matches, not linked'); sum.cgSeveral++; continue; }
        if (!live) { await mark('practice: would create'); sum.cgPractice++; continue; }
        try { await mark('created', String(await deps.ghl.create(body))); sum.cgCreated++; }
        catch (e) { if (e && e.contactId) { await mark('found', String(e.contactId)); sum.cgFound++; } else throw e; }
      } catch (e) { await mark('failed: ' + err(e)); sum.cgFailed++; }
    }
  }

  // 3. Families and caregivers with someone to care for, onto Leads.
  async function toLeads(live, sum) {
    const fams = await q(`select p.* from cds_prospects p
       where p.source = 'findcdscaregivers request access' and p.stage <> 'closed'
         and not exists (select 1 from site_leads s where s.from_kind='prospect' and s.from_id=p.id::text)
       order by p.created_at`, []);
    const cgs = await q(`select a.* from attendant_pool a
       where a.agency_id=$1 and not coalesce(a.archived,false) and a.has_potential_consumer = 'Yes' and coalesce(a.source,'') <> 'staff'
         and not exists (select 1 from site_leads s where s.from_kind='caregiver' and s.from_id=a.id::text)
       order by a.submitted_at`, [AGENCY_ID]);
    if (!live) { sum.leadsWouldAdd = fams.length + cgs.length; return; }
    const ins = (kind, id, row) => q(`insert into site_leads (agency_id, source, first_name, last_name, phone, email, county, message, submitted_at,
         from_kind, from_id, form_name, form_answers, ghl_contact_id, ghl_status, ghl_at, alert_at, alert_texted_at, reminder_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,now(),now(),now(),now())
       on conflict (from_kind, from_id) where from_kind is not null do nothing`,
      [AGENCY_ID, row.source, row.first || null, row.last || null, row.phone || null, row.email || null, row.county || null, row.message || null,
       row.at, kind, String(id), row.name || formName(row.source), JSON.stringify(row.answers), row.contact || null, row.contact ? 'found' : null]);
    for (const p of fams) {
      try {
        // The family's phone and email live in GoHighLevel only (findcdscaregivers keeps them there).
        const c = p.ghl_contact_id ? (await deps.ghl.get(p.ghl_contact_id)) || {} : {};
        const answers = prospectAnswers(p);
        const d = ten(c.phone);
        await ins('prospect', p.id, { source: p.source, first: p.first_name, last: c.lastName || '', email: c.email || '',
          phone: d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : (c.phone || ''),
          county: p.county, at: p.created_at, answers, contact: p.ghl_contact_id,
          message: answers.map(([k, v]) => k + ': ' + v).join('\n') });
        sum.leadsAdded++;
      } catch (e) { sum.leadsFailed++; sum.errors.push('family ' + p.id + ': ' + err(e)); }
    }
    for (const a of cgs) {
      try {
        const answers = caregiverAnswers(a);
        await ins('caregiver', a.id, { source: a.source || 'public', name: caregiverFormName(a.source), first: a.first_name, last: a.last_name, phone: a.phone, email: a.email,
          county: Array.isArray(a.counties) ? a.counties[0] : '', at: a.submitted_at, answers, contact: a.ghl_contact_id,
          message: answers.map(([k, v]) => k + ': ' + v).join('\n') });
        sum.leadsAdded++;
      } catch (e) { sum.leadsFailed++; sum.errors.push('caregiver ' + a.id + ': ' + err(e)); }
    }
  }

  // 4. One note per GoHighLevel contact. Claimed first so two runs never both write one.
  async function notes(live, sum, limit) {
    const t = new Date(now()).toISOString(), retryBefore = new Date(now() - RETRY_MS).toISOString();
    const due = `ghl_contact_id is not null and (ghl_note_at is null or (ghl_note_status like 'failed%' and ghl_note_tries < ${MAX_TRIES} and ghl_note_at < $1))`;
    // A caregiver copied onto Leads gets its note from the caregiver row, not twice.
    const leads = await q(`select * from site_leads where ${due} and form_name is not null and coalesce(from_kind,'') <> 'caregiver'
                           and not coalesce(archived,false) order by submitted_at limit ${limit}`, [retryBefore]);
    const cgs = await q(`select * from attendant_pool where ${due} and not coalesce(archived,false) and coalesce(source,'') <> 'staff'
                         order by submitted_at limit ${limit}`, [retryBefore]);
    if (!live) { sum.notesWould = leads.length + cgs.length; return; }
    const jobs = leads.map(r => ({ table: 'site_leads', r, text: noteText(r.form_name, r.submitted_at, Array.isArray(r.form_answers) ? r.form_answers : []) }))
      .concat(cgs.map(r => ({ table: 'attendant_pool', r, text: noteText(caregiverFormName(r.source), r.submitted_at, caregiverAnswers(r)) })));
    for (const { table, r, text } of jobs) {
      const mine = await one(`update ${table} set ghl_note_at=$2, ghl_note_tries=ghl_note_tries+1, ghl_note_status='sending'
                              where id=$1 and (ghl_note_at is distinct from $2) and (ghl_note_status is null or ghl_note_status like 'failed%') returning id`, [r.id, t]);
      if (!mine) continue;
      try {
        await deps.ghl.note(r.ghl_contact_id, { body: text });
        await q(`update ${table} set ghl_note_status='added' where id=$1`, [r.id]); sum.notesAdded++;
      } catch (e) {
        await q(`update ${table} set ghl_note_status=$2 where id=$1`, [r.id, 'failed: ' + err(e)]); sum.notesFailed++;
      }
    }
  }

  async function run({ limit = 20 } = {}) {
    const cfg = (await one(`select value from cds_match_settings where key='lead_forms'`)) || { value: { live: false } };
    const live = !!(cfg.value && cfg.value.live === true);
    const sum = { ok: true, live, named: 0, cgFound: 0, cgCreated: 0, cgPractice: 0, cgSeveral: 0, cgSkipped: 0, cgFailed: 0,
      leadsAdded: 0, leadsWouldAdd: 0, leadsFailed: 0, notesAdded: 0, notesWould: 0, notesFailed: 0, errors: [] };
    sum.named = await names();
    await caregivers(live, sum, limit);
    await toLeads(live, sum);
    await names();   // the copied rows already carry theirs; this is a no-op unless a form arrived meanwhile
    await notes(live, sum, limit);
    if (sum.leadsFailed || sum.errors.length) sum.ok = sum.leadsFailed === 0;
    return sum;
  }
  return { run };
}
