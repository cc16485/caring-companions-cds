// The CDS Coordinator and paper (2026-11-18, her words: "build complete 2 and 3 now").
//
//   faxes    Tax forms out. When a consumer's signed SS-4, 2643A or 2827 is saved in Tax Setup (packetForms, after the
//            agent signature) and it has not gone yet (no fax queued, sent or delivered for it, and not marked sent on
//            Tax Setup), the Coordinator gets the fax ready, through the very same one-click fax code as the button
//            (fax.js queue: the same fixed fax numbers, the same rules: SS-4 only with no EIN on file and none at the
//            IRS; the Missouri forms only once the EIN is in). Switch "The Coordinator faxes tax forms" (fax_sends.live,
//            starts off = Practice: a 'fax' draft waits on the profile for Send). On: Monday to Friday, 8 AM to 4 PM
//            Central. One-click fax (faxLive) must be on as well. Never twice.
//   mail     State faxes in. Each fax that arrives (cds_fax direction 'in', the PDF saved by the Google script) is read
//            once by Claude: is it from the state about one of our people (an authorization, a start date, a denial,
//            a request for information, an assessment)? Matched by name to a Starting or active consumer or an open
//            lead, it becomes items on their profile: a start date waits for Use it; a denial, a request or anything
//            that needs a person becomes a "needs you" concern (My Week today and the 4:30 email); anything else is a
//            'state_doc' note to check. It never writes a consumer record and never stores a DCN or Medicaid number.
// No em dashes in anything a person reads (her rule).
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const noDash = t => String(t || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v));
const real = x => x && !/^(example|test)\b/i.test(String(x.name || '').trim());
export const FAX_KEYS = ['IRS-SS-4', 'MO-2643A', 'MO-2827'];
export const FAX_LABEL = { 'IRS-SS-4': 'Form SS-4 to the IRS', 'MO-2643A': 'Form 2643A to the Missouri Department of Revenue', 'MO-2827': 'Form 2827 to the Missouri Department of Revenue' };

// Which tax forms are ready to fax. faxes: cds_fax out rows { consumer_id, form_key, status }.
export function planFaxes({ consumers, faxes }) {
  const out = [];
  const gone = new Set((faxes || []).filter(f => ['queued', 'sending', 'sent', 'delivered'].includes(f.status)).map(f => f.consumer_id + '|' + f.form_key));
  (consumers || []).filter(c => c && real(c) && ['starting', 'active'].includes(c.status)).forEach(c => {
    const ein = !!String(c.ein || '').trim();
    FAX_KEYS.forEach(k => {
      const form = (Array.isArray(c.packetForms) ? c.packetForms : []).find(p => p && p.file === k && p.path);
      if (!form || gone.has(c.id + '|' + k)) return;
      if (c.filings && c.filings[k] && c.filings[k].sentAt) return;   // sent another way, marked on Tax Setup
      if (k === 'IRS-SS-4') { if (ein || c.einCheck === 'has' || (c.taxKind === 'transfer' && c.einCheck !== 'none')) return; }
      else if (!ein) return;   // Missouri forms wait for the EIN
      out.push({ kind: 'fax', key: 'fax:' + c.id + ':' + k, person_id: String(c.id), person_name: c.name, to_name: FAX_LABEL[k].replace(/^Form \S+ to /, ''),
        data: { consumer_id: String(c.id), form_key: k }, body: 'Fax ' + c.name + "'s signed " + FAX_LABEL[k] + ' (one-click fax, the same as the Fax it now button on Tax Setup).' });
    });
  });
  return out;
}
export function faxHours(nowMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(nowMs)).map(x => [x.type, x.value]));
  return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 16;
}

// Reading a fax that came in.
export const MAIL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['from_state', 'kind', 'person_name', 'start_date', 'end_date', 'amount', 'summary', 'needs_person', 'note'],
  properties: {
    from_state: { type: 'boolean' },
    kind: { type: 'string', enum: ['authorization', 'start_date', 'denial', 'needs_info', 'assessment', 'closure', 'other'] },
    person_name: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' }, amount: { type: 'string' },
    summary: { type: 'string' }, needs_person: { type: 'boolean' }, note: { type: 'string' }
  }
};
const MAIL_SYSTEM = [
  'You read one fax that came in to Caring Companions Direct Services (CDS), a Missouri Medicaid consumer directed services vendor. Consumers get care at home; DSDS (the Division of Senior and Disability Services, part of DHSS) assesses them and authorizes their hours. Faxes also come from MO HealthNet, the IRS, the Missouri Department of Revenue, doctors and others.',
  'from_state: true only when it is from DSDS, DHSS, MO HealthNet or another Missouri state office about a consumer.',
  'kind: authorization (hours or units authorized, a plan of care, a prior authorization), start_date (a service start date given), denial (not eligible, closed, denied), needs_info (they need something from us or the consumer), assessment (an assessment scheduled or done), closure (services ending), other.',
  'person_name: the consumer\'s full name as printed (first and last), empty if none. start_date and end_date: YYYY-MM-DD when printed, else empty. amount: the hours or units authorized in a few words, else empty.',
  'summary: one or two plain sentences for the office. needs_person: true when someone at the office must do something (a denial, a request, a deadline, anything unclear). note: what they must do, in a few words.',
  'Never copy a DCN, Medicaid number, Social Security number or date of birth into any field. Never use em dashes.'
].join('\n');
export function mailRequest(pdfBase64, model) {
  return { model, max_tokens: 1500, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: MAIL_SCHEMA } }, system: MAIL_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } }, { type: 'text', text: 'Read this fax.' }] }] };
}
const LONGNUM = /\d{7,}/g;
export function cleanMail(resp) {
  if (!resp || resp.stop_reason === 'refusal') return { error: 'declined' };
  let j; try { j = JSON.parse((resp.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('')); } catch { return { error: 'could not be read' }; }
  const t = (v, n) => noDash(v).replace(LONGNUM, '(number left out)').slice(0, n);
  return { fromState: j.from_state === true, kind: MAIL_SCHEMA.properties.kind.enum.includes(j.kind) ? j.kind : 'other', name: t(j.person_name, 80),
    start: isDay(j.start_date) ? j.start_date : '', end: isDay(j.end_date) ? j.end_date : '', amount: t(j.amount, 80), summary: t(j.summary, 400), needsPerson: j.needs_person === true, note: t(j.note, 160) };
}
// Who it is about: one Starting or active consumer, else one open lead, by full name. Two with the name: nobody (never guess).
export function matchPerson(name, consumers, pipeline) {
  const k = norm(name); if (!k || String(name).trim().split(/\s+/).length < 2) return null;
  const cs = (consumers || []).filter(c => c && real(c) && ['starting', 'active'].includes(c.status) && norm(c.name) === k);
  if (cs.length === 1) return { kind: 'consumer', id: String(cs[0].id), name: cs[0].name, start: cs[0].cdsStartDate || '' };
  if (cs.length > 1) return null;
  const ls = (pipeline || []).filter(p => p && p.id && real(p) && !/^closed|^lost/i.test(String(p.status || '')) && norm(p.name) === k);
  return ls.length === 1 ? { kind: 'lead', id: String(ls[0].id), name: ls[0].name, start: '' } : null;
}
// The items one state fax becomes.
export function mailItems(person, fax, x, today) {
  const src = { line: 'fax', kind: 'fax', id: 'fax:' + fax.id, at: new Date(fax.requested_at).toISOString(), who: 'the state', summary: x.summary };
  const base = (kind, data, status) => ({ key: person.kind + ':' + person.id + ':' + kind + ':fax:' + fax.id, person_kind: person.kind, person_id: person.id, person_name: person.name, kind, data, source: src, status, due: today });
  const out = [];
  if (x.start && x.start !== person.start && person.kind === 'consumer') out.push(base('start_date', { date: x.start, saidBy: 'state', note: 'from a state fax' + (x.amount ? ', ' + x.amount : '') }, 'suggested'));
  if (x.needsPerson || ['denial', 'needs_info', 'closure'].includes(x.kind)) out.push(base('concern', { text: 'State fax: ' + (x.note || x.summary || x.kind) }, 'open'));
  else out.push(base('state_doc', { text: x.summary || ('State fax: ' + x.kind), kind: x.kind, amount: x.amount, end: x.end }, 'open'));
  return out;
}

export function createPaper({ db, ai, model, faxQueue, download, nowMs = () => Date.now() }) {
  const q = async (t, p) => (await db.query(t, p || [])).rows;
  const one = async (t, p) => (await q(t, p))[0] || null;
  const data = async k => { const r = await one('select data_value from agency_data where agency_id = $1 and data_key = $2', ['caring-companions-cds', k]); return (r && r.data_value) || null; };
  const chicagoDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  async function faxes() {
    const sw = await one(`select value, updated_at from cds_match_settings where key = 'fax_sends'`);
    const live = !!(sw && sw.value && sw.value.live === true);
    const consumers = (await data('consumers')) || [];
    const rows = await q(`select consumer_id, form_key, status from cds_fax where direction = 'out'`);
    let made = 0, sent = 0, failed = 0;
    for (const d of planFaxes({ consumers, faxes: rows })) {
      const r = await one(`insert into cds_coord_msgs (key, kind, person_kind, person_id, person_name, to_name, phone, body, status, data)
        values ($1, 'fax', 'consumer', $2, $3, $4, '', $5, 'draft', $6::jsonb) on conflict (key) do nothing returning id`, [d.key, d.person_id, d.person_name, d.to_name, d.body, JSON.stringify(d.data)]);
      if (r) made++;
    }
    if (live && faxHours(nowMs())) for (const m of await q(`select id from cds_coord_msgs where kind = 'fax' and status = 'draft' and created_at >= $1 order by id limit 6`, [sw.updated_at])) {
      const x = await sendFax(m.id, 'coordinator'); x.ok ? sent++ : failed++;
    }
    return { live, made, sent, failed };
  }
  async function sendFax(id, by) {
    const m = await one(`select * from cds_coord_msgs where id = $1`, [+id]);
    if (!m || m.kind !== 'fax') return { ok: false, error: 'That fax is gone.' };
    if (m.status === 'sent') return { ok: true, already: true };
    const d = m.data || {};
    try { await faxQueue(d.consumer_id, d.form_key, by); }
    catch (e) {
      const err = String(e && e.message || e).slice(0, 200);
      if (/already on its way|already has a federal EIN|already has an EIN/i.test(err)) {
        await q(`update cds_coord_msgs set status = 'skipped', error = $2, sent_by = $3, sent_at = now() where id = $1`, [m.id, err, by]); return { ok: true, already: true };
      }
      await q(`update cds_coord_msgs set status = 'failed', error = $2 where id = $1`, [m.id, err]); return { ok: false, error: err };
    }
    await q(`update cds_coord_msgs set status = 'sent', sent_at = now(), sent_by = $2, error = null where id = $1`, [m.id, by]);
    await q(`insert into cds_audit (actor, action, target, detail) values ($1, 'coordinator_fax', $2, $3::jsonb)`, [by, 'coordmsg:' + m.id, JSON.stringify(d)]);
    return { ok: true };
  }

  async function mail() {
    const consumers = (await data('consumers')) || [], pipeline = (await data('pipeline')) || [], today = chicagoDay(nowMs());
    const rows = await q(`select f.id, f.file_path, f.requested_at from cds_fax f where f.direction = 'in' and f.file_path is not null and f.requested_at > now() - interval '30 days'
      and not exists (select 1 from cds_coord_seen s where s.source_id = 'fax:' || f.id and (s.ok or s.tries >= 3)) order by f.requested_at limit 3`);
    let read = 0, added = 0, other = 0, failed = 0;
    for (const f of rows) {
      let x;
      try { const bytes = await download(f.file_path); x = cleanMail(await ai(mailRequest(b64(bytes), model))); }
      catch (e) { x = { error: String(e && e.message || e).slice(0, 160) }; }
      if (x.error) { failed++; await q(`insert into cds_coord_seen (source_id, at, ok, tries, note) values ($1, now(), false, 1, $2) on conflict (source_id) do update set tries = cds_coord_seen.tries + 1, note = excluded.note, at = now()`, ['fax:' + f.id, x.error]); continue; }
      read++;
      const who = x.fromState ? matchPerson(x.name, consumers, pipeline) : null;
      await q(`insert into cds_coord_seen (source_id, at, ok, tries, note, person_ref, summary) values ($1, now(), true, 1, $2, $3, $4)
        on conflict (source_id) do update set ok = true, note = excluded.note, person_ref = excluded.person_ref, summary = excluded.summary, at = now()`,
        ['fax:' + f.id, !x.fromState ? 'not from the state' : who ? null : 'no one matched by name', who ? who.kind + ':' + who.id : null, x.summary || null]);
      if (!who) { other++; continue; }
      for (const it of mailItems(who, f, x, today)) {
        const r = await one(`insert into cds_coord_items (key, person_kind, person_id, person_name, kind, data, source, status, due) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
          on conflict (key) do nothing returning id`, [it.key, it.person_kind, it.person_id, it.person_name, it.kind, JSON.stringify(it.data), JSON.stringify(it.source), it.status, it.due]);
        if (r) added++;
      }
    }
    return { read, added, not_ours: other, failed };
  }
  return { faxes, sendFax, mail };
}
function b64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s);
}
