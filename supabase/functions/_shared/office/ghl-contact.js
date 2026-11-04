// Address and county for the CDS GoHighLevel contact sync (2026-11-04, her ask: "push all the contacts in
// hubs address and county into GHL contact"). Pure functions, used by ghl-sync and tests/ghl_contact_test.mjs.
//
// Where the hub keeps an address, in the same order the consumer's profile Overview shows it:
//   lead      the lead's own street/city/zip, else the HCBS-1 referral answers; county on the lead
//   consumer  typed on the profile (c.facts), else the Hub enrollment packet, else their old lead
// Attendants carry no address or county in the hub, so they get none.
// Only fields with a value are ever returned: the sync never blanks something GoHighLevel already has.

export const normName = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const clean = v => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

// { street, apt, city, state, zip } -> GHL's own address fields. Missouri when a street has no state,
// as the profile does.
function ghlAddress(o) {
  if (!o) return {};
  const street = [clean(o.street), clean(o.apt)].filter(Boolean).join(' ');
  const out = {};
  if (street) out.address1 = street;
  if (clean(o.city)) out.city = clean(o.city);
  const state = clean(o.state) || (street ? 'MO' : '');
  if (state) out.state = state;
  if (clean(o.zip)) out.postalCode = clean(o.zip);
  return out;
}
const hasAddr = o => !!(o && (clean(o.street) || clean(o.city)));

function leadAddr(p) {
  const R = (p && p.referral) || {};
  return { street: p.street || R.street, apt: p.apt || R.apt, city: p.city || R.city, state: p.state || R.state, zip: p.zip || R.zip };
}

// The consumer's enrollment packet: the one linked to them, else an unlinked packet with their name
// (same rule as the profile). packets = rows of { consumer_id, first, last, street, ..., signed_at, created_at }.
export function packetFor(c, packets) {
  const newest = (a, b) => String(b.signed_at || '').localeCompare(String(a.signed_at || '')) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
  const list = (packets || []).slice().sort(newest);
  const linked = list.find(p => p.consumer_id && String(p.consumer_id) === String(c.id));
  if (linked) return linked;
  const nm = normName(c.name);
  return (nm && list.find(p => !p.consumer_id && p.sent_at && normName([p.first, p.last].filter(Boolean).join(' ')) === nm)) || null;
}

export function leadFor(c, pipeline) {
  const nm = normName(c.name);
  return (nm && (pipeline || []).find(p => p.movedToConsumers && normName(p.name) === nm)) || null;
}

// What this person's GHL contact should say. { address: {address1, city, state, postalCode}, county, from }
export function placeFor(list, person, { packets = [], pipeline = [] } = {}) {
  if (list === 'pipeline') {
    const a = leadAddr(person);
    return { address: ghlAddress(a), county: clean(person.county) || clean((person.referral || {}).county), from: hasAddr(a) ? 'lead' : '' };
  }
  if (list === 'consumers') {
    const own = person.facts || {}, P = packetFor(person, packets), L = leadFor(person, pipeline);
    const pick = hasAddr(own) ? ['profile', own] : hasAddr(P) ? ['packet', P] : L && hasAddr(leadAddr(L)) ? ['lead', leadAddr(L)] : ['', null];
    const county = clean(person.county) || clean(P && P.county) || clean(L && (L.county || (L.referral || {}).county));
    return { address: ghlAddress(pick[1]), county, from: pick[0] };
  }
  return { address: {}, county: '', from: '' };
}

// GoHighLevel's County custom field, by name. null when there isn't exactly one.
export function countyField(fields) {
  const hits = (fields || []).filter(f => f && (/^\s*county\s*$/i.test(f.name || '') || f.fieldKey === 'contact.county'));
  return hits.length === 1 ? hits[0] : null;
}

// The value to store. A pick-list field only takes one of its own options, so "Greene" matches
// "Greene County" and the other way round; anything else is left out (reported, never forced).
const bare = s => clean(s).toLowerCase().replace(/\s+county$/, '').replace(/\s+/g, ' ');
export function countyValue(field, county) {
  const v = clean(county);
  if (!field || !v) return null;
  const opts = field.picklistOptions || (field.options || []).map(o => (o && typeof o === 'object' ? o.label || o.key : o));
  if (!opts || !opts.length) return v;
  return opts.find(o => bare(o) === bare(v)) || null;
}

// The custom-field audit: how many contacts have each field filled. Counts only, never a value.
export function fieldAudit(fields, contacts) {
  const filled = {};
  for (const c of contacts || []) {
    for (const cf of (c && (c.customFields || c.customField)) || []) {
      const v = cf && cf.value;
      const has = Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : clean(v) !== '';
      if (cf && cf.id && has) filled[cf.id] = (filled[cf.id] || 0) + 1;
    }
  }
  return (fields || []).map(f => ({ id: f.id, name: f.name, fieldKey: f.fieldKey, dataType: f.dataType, folder: f.parentId || null,
    created: f.dateAdded || null, filled: filled[f.id] || 0 }))
    .sort((a, b) => b.filled - a.filled || String(a.name).localeCompare(String(b.name)));
}
