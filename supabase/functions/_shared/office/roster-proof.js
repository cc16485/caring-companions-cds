// Background check proof for Roster attendants (2026-10-22, Samantha: "Yes, build the pull of the
// GHL check PDFs and dates into the hub").
//
// Missouri wants proof of every check kept 5 years (MMAC CDS Program Requirements 4.2.2 and 5.2;
// 19 CSR 15-7.021(24)(C) says what to keep: who, when, the result). Until now the PDFs lived only on
// each attendant's GHL contact (folder "Attendant Screening & Onboarding": Upload FCSR / Upload EDL /
// Upload OIG, one file each, no date), and the hub's Roster had no check dates at all.
//
//   rosterProofScan    finds each active Roster attendant's GHL contact (phone, email, then name),
//                      copies their FCSR, EDL and OIG files into the private proof bucket, and reads
//                      the date each PDF was saved (the browser's print date = the day of the check).
//                      Read only on GHL. Safe to run again: a file already brought in is not copied twice.
//   rosterProofList    the proof on file for one attendant (10-minute view links).
//   rosterProofConfirm the office's dates after review; each row keeps who confirmed it and when.
//   rosterProofAdd     a recheck the office ran today: the PDF or screenshot plus its date.
//
// The Roster's own dates (edlDate, fcsrDate, leieDate) are saved by the hub page, like the date
// boxes on the card, so the recheck schedule keeps working the same way.
// Runs inside createMatch (staff only, on the office staff list). No em dashes in anything a person reads.

const AGENCY_ID = 'caring-companions-cds';
export const CHECKS = { fcsr: 'FCSR', edl: 'EDL', oig: 'OIG' };
export const CHECK_KEYS = Object.keys(CHECKS);
const EARLIEST = '2015-01-01';
const MAX_BYTES = 20 * 1024 * 1024;

// "Upload FCSR", "📄 Upload EDL", "Anita Smith Prehire OIG Search Results.pdf" -> the one check named.
export function checkOf(text) {
  const s = String(text || '').toUpperCase();
  const hits = CHECK_KEYS.filter(k => new RegExp('(^|[^A-Z])' + k.toUpperCase() + '([^A-Z]|$)').test(s));
  return hits.length === 1 ? hits[0] : null;
}

const digits = s => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export function nameKey(name) {
  return String(name || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/).map(t => t.replace(/^-+|-+$/g, '')).filter(t => t.length > 1).sort().join(' ');
}
const contactName = c => [c.firstName || c.first_name, c.lastName || c.last_name].filter(Boolean).join(' ') || c.contactName || c.name || '';

// The GHL contact that is this Roster attendant: same phone, else same email, else same name
// ("Pham, Nuong" = "Nuong Pham"). Two different people with the name and no phone or email
// match is not a match (null), so a file never lands on the wrong attendant.
export function matchContact(att, contacts) {
  const list = (contacts || []).filter(c => c && c.id);
  const ph = digits(att.phone), em = String(att.email || '').trim().toLowerCase();
  if (ph.length === 10) { const c = list.find(x => digits(x.phone) === ph); if (c) return c; }
  if (em) { const c = list.find(x => String(x.email || '').trim().toLowerCase() === em); if (c) return c; }
  const k = nameKey(att.name);
  const same = list.filter(x => nameKey(contactName(x)) === k);
  return k && same.length === 1 ? same[0] : null;
}

// File-upload values on a GHL contact. GHL keeps each upload as { <id>: { meta: { originalname,
// mimetype, size }, url } } (an object keyed by file); a list of the same is accepted too.
// fields: { [fieldId]: name } when the custom field list could be read, else {}.
export function filesOf(contact, fields = {}) {
  const out = [];
  for (const cf of (contact && (contact.customFields || contact.customField)) || []) {
    const v = cf && cf.value;
    if (!v || typeof v !== 'object') continue;
    const files = Array.isArray(v) ? v : Object.values(v);
    for (const f of files) {
      const url = f && (f.url || (f.meta && f.meta.url));
      if (!url || typeof url !== 'string') continue;
      const name = (f.meta && (f.meta.originalname || f.meta.name)) || f.name || decodeURIComponent(url.split('?')[0].split('/').pop() || '');
      const fieldName = fields[cf.id] || '';
      const check = checkOf(fieldName) || checkOf(name);
      out.push({ field_id: cf.id, field_name: fieldName, name: String(name).slice(0, 200), url, mime: (f.meta && f.meta.mimetype) || '', size: Number(f.meta && f.meta.size) || 0, check });
    }
  }
  return out;
}

// The result dropdown for a check ("FCSR RESULTS", "EDL RESULTS", "OIG RESULTS"), when the field
// names could be read.
export function resultOf(contact, fields, check) {
  for (const cf of (contact && (contact.customFields || contact.customField)) || []) {
    const n = fields[cf.id] || '';
    if (!/result/i.test(n) || checkOf(n) !== check) continue;
    const v = Array.isArray(cf.value) ? cf.value.join(', ') : cf.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// The day a PDF was saved, from its own record (/CreationDate (D:20251017...) or the XMP
// xmp:CreateDate). A search result printed to PDF is saved the day the search was run, so this is
// the check date. Nothing before 2015 or after today counts. Returns 'YYYY-MM-DD' or ''.
export function pdfDate(bytes, today) {
  if (!bytes || !bytes.length) return '';
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== '%PDF-') return '';
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.slice(i, i + 32768));
  const found = [];
  const ok = (y, m, d) => { const iso = `${y}-${m}-${d}`; if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 && iso >= EARLIEST && iso <= today) found.push(iso); };
  for (const m of s.matchAll(/\/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})/g)) ok(m[1], m[2], m[3]);
  if (!found.length) for (const m of s.matchAll(/(?:xmp:CreateDate|<xmp:CreateDate>)\s*=?\s*["']?(\d{4})-(\d{2})-(\d{2})/g)) ok(m[1], m[2], m[3]);
  if (!found.length) for (const m of s.matchAll(/\/ModDate\s*\(D:(\d{4})(\d{2})(\d{2})/g)) ok(m[1], m[2], m[3]);
  return found.sort()[0] || '';
}

const validDay = (d, today) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && d >= EARLIEST && d <= today;

export function createRosterProof({ q, one, nowIso, audit, fail, crypto, deps }) {
  const who = s => { if (!s) fail('Please sign in to the CDS Hub.', 401); return s; };
  const today = async () => new Date(await nowIso()).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  async function roster() {
    const r = await one(`select data_value from agency_data where agency_id=$1 and data_key='attendants'`, [AGENCY_ID]);
    return (r && Array.isArray(r.data_value) ? r.data_value : []).filter(a => a && a.id && a.status !== 'inactive' && String(a.name || '').trim());
  }
  const view = async r => ({ id: r.id, attendant_id: r.attendant_id, name: r.attendant_name, check: r.check_key, file_name: r.file_name,
    ghl_result: r.ghl_result || '', date_found: r.date_found ? String(r.date_found).slice(0, 10) : '',
    checked_on: r.checked_on ? String(r.checked_on).slice(0, 10) : '', confirmed_by: r.confirmed_by || '', source: r.source,
    created_at: r.created_at, url: r.media_id && deps.media && deps.media.url ? await deps.media.url(r.media_id) : null });

  async function findContact(att) {
    const tries = [digits(att.phone), String(att.email || '').trim(), String(att.name || '').trim()].filter(x => x && x.length >= 3);
    for (const t of [...new Set(tries)]) {
      const c = matchContact(att, await deps.ghl.find(t));
      if (c) return c;
    }
    return null;
  }

  const office = {
    async rosterProofScan({ staff: s }) {
      who(s);
      if (!deps.ghl || !deps.ghl.find || !deps.ghl.contact || !deps.files || !deps.media || !deps.media.putFile) fail('Bringing in proof from GHL works on the live hub only.');
      const day = await today(), people = await roster();
      let fieldNames = {};
      try { for (const f of (await deps.ghl.fields()) || []) if (f && f.id) fieldNames[f.id] = String(f.name || ''); } catch { fieldNames = {}; }
      const have = await q('select * from cds_roster_proof where source = $1', ['ghl']);
      const items = [], skipped = [];
      let added = 0;
      for (const att of people) {
        let c;
        try { c = await findContact(att); } catch (e) { skipped.push({ attendant_id: att.id, name: att.name, why: 'GHL could not be searched: ' + String(e.message || e).slice(0, 120) }); continue; }
        if (!c) { skipped.push({ attendant_id: att.id, name: att.name, why: 'No GHL contact with the same phone, email or name' }); continue; }
        let full;
        try { full = await deps.ghl.contact(c.id); } catch (e) { skipped.push({ attendant_id: att.id, name: att.name, why: 'GHL contact could not be read' }); continue; }
        const files = filesOf(full, fieldNames).filter(f => f.check);
        if (!files.length) { skipped.push({ attendant_id: att.id, name: att.name, why: 'No FCSR, EDL or OIG file on their GHL contact' }); continue; }
        for (const f of files) {
          const hash = await crypto.hash('ghl-file:' + f.url);
          let row = have.find(r => r.attendant_id === att.id && r.source_hash === hash);
          if (!row) {
            let got;
            try { got = await deps.files.fetch(f.url); } catch (e) { skipped.push({ attendant_id: att.id, name: att.name, why: CHECKS[f.check] + ' file could not be copied: ' + String(e.message || e).slice(0, 120) }); continue; }
            if (!got || !got.bytes || !got.bytes.length || got.bytes.length > MAX_BYTES) { skipped.push({ attendant_id: att.id, name: att.name, why: CHECKS[f.check] + ' file is empty or too big' }); continue; }
            const mime = got.mime || f.mime || 'application/pdf';
            const media_id = await deps.media.putFile({ folder: 'roster/' + att.id, name: f.check, mime, bytes: got.bytes, by: 'staff:' + s });
            const found = /pdf/i.test(mime) || /\.pdf$/i.test(f.name) ? pdfDate(got.bytes, day) : '';
            row = await one(`insert into cds_roster_proof (attendant_id, attendant_name, check_key, media_id, file_name, source, source_hash, ghl_contact_id, ghl_result, date_found, created_by)
              values ($1,$2,$3,$4,$5,'ghl',$6,$7,$8,$9,$10) on conflict (attendant_id, source_hash) do update set ghl_result = excluded.ghl_result returning *`,
              [att.id, att.name, f.check, media_id, f.name, hash, c.id, resultOf(full, fieldNames, f.check) || null, found || null, s]);
            added++;
          }
          items.push(await view(row));
        }
      }
      await audit('staff:' + s, 'roster_proof_scan', 'roster', { attendants: people.length, files: items.length, added, skipped: skipped.length });
      return { items, skipped, added, fields_read: Object.keys(fieldNames).length > 0,
        roster: people.map(a => ({ id: a.id, name: a.name, edlDate: a.edlDate || '', fcsrDate: a.fcsrDate || '', leieDate: a.leieDate || '' })) };
    },

    async rosterProofList({ staff: s, attendant_id }) {
      who(s);
      const rows = await q('select * from cds_roster_proof where attendant_id = $1 order by check_key, coalesce(checked_on, date_found) desc nulls last, created_at desc', [String(attendant_id || '')]);
      return { items: await Promise.all(rows.map(view)) };
    },

    async rosterProofConfirm({ staff: s, items }) {
      who(s);
      const day = await today(), list = Array.isArray(items) ? items.slice(0, 200) : [];
      if (!list.length) fail('Nothing to save.');
      for (const it of list) if (!validDay(it.checked_on, day)) fail('Each date must be a real day between 2015 and today.');
      let saved = 0;
      for (const it of list) {
        const r = await one(`update cds_roster_proof set checked_on=$2, confirmed_by=$3, confirmed_at=now() where id=$1 returning id`, [String(it.id || ''), it.checked_on, s]);
        if (r) saved++;
      }
      await audit('staff:' + s, 'roster_proof_confirm', 'roster', { saved });
      return { ok: true, saved };
    },

    async rosterProofAdd({ staff: s, attendant_id, check_key, checked_on, result, proof }) {
      who(s);
      const day = await today();
      if (!CHECK_KEYS.includes(check_key)) fail('Pick FCSR, EDL or OIG.');
      if (!validDay(checked_on, day)) fail('Pick the day the check was run (not in the future).');
      if (result !== 'clear') fail('Only a clear result is recorded here. If the search found something, call Samantha before anything else.');
      if (!proof || !proof.data) fail('Add the PDF or screenshot of the search result.');
      const att = (await roster()).find(a => a.id === attendant_id);
      if (!att) fail('That attendant is not on the active Roster.');
      if (!deps.media || !deps.media.putFile) fail('Saving proof works on the live hub only.');
      const media_id = await deps.media.putFile({ folder: 'roster/' + att.id, name: check_key, mime: proof.mime || 'application/pdf', data: proof.data, by: 'staff:' + s });
      const row = await one(`insert into cds_roster_proof (attendant_id, attendant_name, check_key, media_id, file_name, source, source_hash, checked_on, confirmed_by, confirmed_at, created_by)
        values ($1,$2,$3,$4,$5,'hub',$6,$7,$8,now(),$8) returning *`,
        [att.id, att.name, check_key, media_id, String(proof.name || CHECKS[check_key] + ' result').slice(0, 200), 'hub:' + media_id, checked_on, s]);
      await audit('staff:' + s, 'roster_proof_add', 'attendant:' + att.id, { check: check_key, checked_on });
      return { ok: true, item: await view(row) };
    },
  };
  return { office };
}
