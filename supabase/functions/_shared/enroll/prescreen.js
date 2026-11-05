// CDS Hub · the first call · the online pre-screen in GoHighLevel (2026-11-05, her ask: "fill the call from the online
// form"). Read only. Finds the CDS GoHighLevel contact by phone or email (never by name alone, so another person's
// answers never land on this call) and returns only the pre-screen fields on the allowed list (CDSStarting.PRESCREEN_KEYS:
// never the Workflow Trigger fields, SSN, IDs, files or signatures). Nothing is written to GoHighLevel. Every read is
// in the audit record without the answers.
import '../office/starting-rules.js';

const S = globalThis.CDSStarting;
const digits = v => String(v || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

// The contact that is this caller: the same 10-digit phone, else the same email. Two different contacts
// with that phone is not a match.
export function pickContact(contacts, phones, emails) {
  const list = (contacts || []).filter(c => c && c.id);
  for (const ph of phones) {
    const hits = list.filter(c => digits(c.phone) === ph || (c.additionalPhones || []).some(x => digits(x && (x.phone || x)) === ph));
    if (new Set(hits.map(c => c.id)).size === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  for (const em of emails) {
    const hits = list.filter(c => String(c.email || '').trim().toLowerCase() === em);
    if (new Set(hits.map(c => c.id)).size === 1) return hits[0];
  }
  return null;
}

// fields: GoHighLevel custom field list. contact.customFields: [{ id, value }]. Returns [{ key, value }] on the list only.
export function prescreenAnswers(contact, fields) {
  const keyOf = {};
  for (const f of fields || []) if (f && f.id && f.fieldKey) keyOf[f.id] = f.fieldKey;
  const out = [];
  for (const cf of (contact && (contact.customFields || contact.customField)) || []) {
    const key = keyOf[cf && cf.id];
    if (!key || !S.PRESCREEN_KEYS.includes(key)) continue;
    const v = cf.value;
    if (v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v))) continue;
    out.push({ key, value: Array.isArray(v) ? v.map(x => String(x).slice(0, 200)) : String(v).slice(0, 2000) });
  }
  return out;
}

export function createPrescreen(h) {
  const { audit, fail, deps } = h;
  const office = {
    // person: { kind: 'lead', id, phones: [], emails: [] }. The phones and emails are the lead's own and its contacts'.
    async prescreen({ staff, person }) {
      if (!staff) fail('Please sign in to the CDS Hub.', 401);
      const p = person || {};
      const phones = [...new Set((p.phones || []).map(digits).filter(x => x.length === 10))].slice(0, 4);
      const emails = [...new Set((p.emails || []).map(x => String(x || '').trim().toLowerCase()).filter(x => /@/.test(x)))].slice(0, 3);
      if (!phones.length && !emails.length) return { found: false, why: 'No phone or email yet.' };
      if (!deps.ghl || !deps.ghl.find || !deps.ghl.contact || !deps.ghl.fields) return { found: false, why: 'GoHighLevel is not connected.' };
      let found = null;
      for (const q of phones.concat(emails)) {
        const c = pickContact(await deps.ghl.find(q), phones, emails);
        if (c) { found = c; break; }
      }
      const target = (p.kind === 'lead' ? 'lead:' : 'call:') + String(p.id || 'new').slice(0, 80);
      if (!found) { await audit('staff:' + staff, 'prescreen_read', target, { found: false }); return { found: false, why: 'No GoHighLevel contact with that phone or email.' }; }
      const [contact, fields] = await Promise.all([deps.ghl.contact(found.id), deps.ghl.fields()]);
      const answers = prescreenAnswers(contact, fields);
      await audit('staff:' + staff, 'prescreen_read', target, { found: true, contact: found.id, answers: answers.length });
      return { found: true, contactId: found.id, answers, at: contact && (contact.dateUpdated || contact.dateAdded) || null };
    },
  };
  return { office };
}
