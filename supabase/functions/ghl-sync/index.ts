// Supabase Edge Function: ghl-sync  (CDS Hub project: siivpekcaryeyttszwav)
// -----------------------------------------------------------------------------
// Pushes the CDS hub's people into the Caring Companions CDS GHL sub-account as
// tagged contacts, so they can be messaged and campaigned from GHL:
//   pipeline   (agency_data key 'pipeline')   -> GHL contact tagged 'lead'
//   consumers  (agency_data key 'consumers')  -> GHL contact tagged 'consumer'
//   attendants (agency_data key 'attendants') -> GHL contact tagged 'attendant'
//
// Adding someone to the lead pipeline in the hub fires this for that one person,
// so the GHL contact is tagged the moment the lead is entered. The tag is always
// derived here from which list the person is in and the record is read from the
// database by id, so the browser cannot choose a tag or inject a contact.
//
// Direction is ONE WAY, hub -> GHL. Deliberately:
//   * Nothing in GHL is ever deleted or emptied. We only upsert and add tags.
//   * Nothing in the hub's own data is ever written. The last-synced record is
//     kept under its own agency_data key ('ghl_sync_state') so a sync can never
//     race the hub and clobber a consumer or attendant edit.
//   * /contacts/upsert is idempotent on phone/email within a location, so
//     re-running is safe and will not create duplicates.
//   * Tags go through the add-tags call, never the upsert, so a tag the office
//     put on in GHL (like 'active consumer') is never taken off by a sync.
//
// Address and county (2026-11-04): street, city, state and zip go into GHL's own
// address fields, county into the location's County custom field. Where they come
// from is in _shared/office/ghl-contact.js. Only values the hub has are sent.
//
// Other modes, both read only:
//   { dry: true }         what a full sync would send (counts), sends nothing
//   { audit: 'fields' }   every contact custom field and how many contacts have it
//                         filled (counts only, never a value)
//
// Auth: POST with a CDS-project user's access token (Authorization: Bearer).
// Any signed-in hub user may sync; the GHL token never leaves the server.
// A Desktop step signs in with a one-time code instead: it stores the code's
// sha-256 under agency_data 'ghl_sync_step_code' { hash, expires } and sends
// "step-<code>". (The server key was tried first, 2026-11-04 1288, and did not
// match the key the function sees.)
//
// Secrets required (function returns configured:false until both are set). CDS-only names (2026-10-08) so a
// Caring Companions (non-CDS) key can't be set here by mistake; any location but the CDS sub-account is refused:
//   CDS_GHL_TOKEN        - GHL Private Integration token for the CDS sub-account, scopes contacts.write
//                          and locations/customFields.readonly (cds-match already reads fields with it)
//   CDS_GHL_LOCATION_ID  - 4EFPkajwe0hHrqxvYkZ9  (Caring Companions CDS)
//
// Deploy:
//   supabase functions deploy ghl-sync --no-verify-jwt --project-ref siivpekcaryeyttszwav
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { placeFor, countyField, countyValue, fieldAudit } from '../_shared/office/ghl-contact.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const AGENCY_ID = 'caring-companions-cds'
const GHL_API = 'https://services.leadconnectorhq.com'

type Person = { id?: string; name?: string; phone?: string; email?: string; status?: string; type?: string; county?: string }
type Outcome = { name: string; ok: boolean; skipped?: string; error?: string; contactId?: string }
type Place = { address: Record<string, string>; county: string }

// The only lists that may be synced, and the tag each one confers. Tags are
// never taken from the request.
const LISTS: Record<string, string> = {
  pipeline: 'lead',
  consumers: 'consumer',
  attendants: 'attendant',
}

// Pipeline rows carry their own kind. A referral or PCCP transfer is still a
// lead for outreach purposes, but keep the distinction as a second tag rather
// than flattening everyone in the pipeline into one bucket.
function tagsFor(list: string, person: Person): string[] {
  const base = LISTS[list]
  const out = [base]
  if (list === 'pipeline') {
    const kind = (person.type || '').trim().toLowerCase()
    if (kind && kind !== base) out.push(kind)
  }
  return out
}

// "Mary Jo Van Dyke" -> first "Mary", last "Jo Van Dyke". GHL wants the two
// separately; the hub only ever captured a single name field.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// Digits only, then drop a leading US country code so the same person entered as
// "417-555-1234" and "+1 (417) 555-1234" resolves to one GHL contact.
function normPhone(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return ten.length === 10 ? `+1${ten}` : null
}

const normEmail = (raw: string): string | null => {
  const e = (raw || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

async function upsertContact(
  person: Person,
  tags: string[],
  headers: Record<string, string>,
  locationId: string,
  place: Place,
  countyId: string | null,
): Promise<Outcome> {
  const name = (person.name || '').trim()
  if (!name) return { name: '(unnamed)', ok: false, skipped: 'no name' }

  const phone = normPhone(person.phone || '')
  const email = normEmail(person.email || '')
  // GHL needs at least one of these to identify a contact. Without either it
  // would create a fresh nameless duplicate on every single run.
  if (!phone && !email) return { name, ok: false, skipped: 'no usable phone or email' }

  const { firstName, lastName } = splitName(name)
  try {
    const r = await fetch(`${GHL_API}/contacts/upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId,
        firstName,
        lastName,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...place.address,
        ...(countyId && place.county ? { customFields: [{ id: countyId, field_value: place.county }] } : {}),
        source: 'CDS Hub',
      }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      return { name, ok: false, error: body?.message || body?.error || `HTTP ${r.status}` }
    }
    const contactId = body?.contact?.id ?? body?.id ?? undefined
    if (!contactId) return { name, ok: false, error: 'GHL did not say which contact it saved' }
    // Adds only. The upsert above carries no tags on purpose.
    const t = await fetch(`${GHL_API}/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: 'POST', headers, body: JSON.stringify({ tags }),
    })
    if (!t.ok) {
      const tb = await t.json().catch(() => ({}))
      return { name, ok: false, contactId, error: 'saved, but the tag was not added: ' + (tb?.message || `HTTP ${t.status}`) }
    }
    return { name, ok: true, contactId }
  } catch (e) {
    return { name, ok: false, error: (e as Error).message }
  }
}

// GHL rate-limits per location, so walk the list in small batches rather than
// firing every contact at once.
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
    if (i + size < items.length) await new Promise((r) => setTimeout(r, 350))
  }
  return out
}

// A Desktop step's one-time code: right hash, not expired.
async function stepCodeOk(admin: ReturnType<typeof createClient>, code: string): Promise<boolean> {
  const { data } = await admin.from('agency_data').select('data_value')
    .eq('agency_id', AGENCY_ID).eq('data_key', 'ghl_sync_step_code').maybeSingle()
  const v = (data?.data_value ?? {}) as { hash?: string; expires?: string }
  if (!v.hash || !v.expires || Date.parse(v.expires) < Date.now()) return false
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === v.hash
}

// The only GoHighLevel location this function may ever touch (Caring Companions CDS).
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Gate on the caller's hub login. Every CDS hub user has a real Supabase
  // account, so there is no separate shared key to leak.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const server = /^step-[a-f0-9]{32,}$/.test(jwt) && await stepCodeOk(admin, jwt.slice(5))
  const { data: u } = server ? { data: null } : await admin.auth.getUser(jwt)
  const email = server ? 'desktop step' : u?.user?.email
  if (!email) return json({ error: 'Sign in to the CDS hub first.' }, 401)

  const token = Deno.env.get('CDS_GHL_TOKEN')
  const locationId = Deno.env.get('CDS_GHL_LOCATION_ID')
  if (!token || !locationId) {
    return json({
      configured: false,
      error: 'GHL is not connected yet. Set the CDS_GHL_TOKEN and CDS_GHL_LOCATION_ID secrets on this function.',
    })
  }
  if (locationId !== CDS_LOCATION) {
    return json({ configured: false, error: 'CDS_GHL_LOCATION_ID is not the CDS sub-account, so nothing was sent.' })
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const body = await req.json().catch(() => ({}))
  const { only, id, dry, audit } = body as { only?: string; id?: string; dry?: boolean; audit?: string }
  if (only && !LISTS[only]) return json({ error: `Unknown list "${only}".` }, 400)
  if (id && !only) return json({ error: 'Syncing one person needs the list it is in.' }, 400)

  // The location's contact custom fields. Needed for the County field and the audit.
  const fr = await fetch(`${GHL_API}/locations/${encodeURIComponent(locationId)}/customFields?model=contact`, { headers })
  const fieldsBody = await fr.json().catch(() => ({}))
  const fields = fr.ok ? (fieldsBody?.customFields ?? []) : null

  if (audit === 'fields') {
    if (!fields) return json({ error: `Could not read the GHL custom fields (HTTP ${fr.status}).` }, 502)
    // Walk every contact, 100 at a time, keeping only which fields have something in them.
    const contacts: unknown[] = []
    let after: { startAfterId?: string; startAfter?: number } = {}
    for (let page = 0; page < 300; page++) {
      const qs = new URLSearchParams({ locationId, limit: '100' })
      if (after.startAfterId) qs.set('startAfterId', after.startAfterId)
      if (after.startAfter) qs.set('startAfter', String(after.startAfter))
      const cr = await fetch(`${GHL_API}/contacts/?${qs}`, { headers })
      const cb = await cr.json().catch(() => ({}))
      if (!cr.ok) return json({ error: `Could not read GHL contacts (HTTP ${cr.status}).` }, 502)
      const got = (cb?.contacts ?? []).map((c: { customFields?: unknown }) => ({ customFields: c.customFields }))
      contacts.push(...got)
      if (got.length < 100 || !cb?.meta?.startAfterId) break
      after = { startAfterId: cb.meta.startAfterId, startAfter: cb.meta.startAfter }
      await new Promise((r) => setTimeout(r, 150))
    }
    const cf = countyField(fields)
    return json({ configured: true, ok: true, contacts: contacts.length, countyField: cf ? cf.id : null, fields: fieldAudit(fields, contacts) })
  }

  const cField = fields ? countyField(fields) : null

  const keys = only ? [only] : Object.keys(LISTS)
  // A consumer's address can come from their old lead, so the lead list is read with them.
  const readKeys = keys.includes('consumers') && !keys.includes('pipeline') ? [...keys, 'pipeline'] : keys

  const { data: rows, error: readErr } = await admin
    .from('agency_data')
    .select('data_key, data_value')
    .eq('agency_id', AGENCY_ID)
    .in('data_key', readKeys)
  if (readErr) return json({ error: 'Could not read hub data: ' + readErr.message }, 500)

  const byKey: Record<string, Person[]> = {}
  for (const k of readKeys) byKey[k] = []
  for (const r of rows ?? []) {
    if (Array.isArray(r.data_value)) byKey[r.data_key] = r.data_value as Person[]
  }

  // Enrollment packets, address and name only. The SSN and the rest of the answers are never read.
  let packets: unknown[] = []
  if (keys.includes('consumers')) {
    const { data: pk, error: pkErr } = await admin
      .from('cds_enroll_packets')
      .select('consumer_id, sent_at, signed_at, created_at, first:answers->>first, last:answers->>last, street:answers->>street, apt:answers->>apt, city:answers->>city, state:answers->>state, zip:answers->>zip, county:answers->>county')
    if (pkErr) return json({ error: 'Could not read the enrollment packets: ' + pkErr.message }, 500)
    packets = pk ?? []
  }

  type ListReport = { total: number; synced: number; skipped: Outcome[]; failed: Outcome[];
    withAddress: number; withCounty: number; countyLeftOut: string[] }
  const report: Record<string, ListReport> = {}

  for (const key of keys) {
    // Adding one lead syncs just that lead. Read it from the database by id so
    // the caller can neither invent a contact nor pick its tag.
    // Starting consumers (2026-11-04) are not served yet: they keep their lead tag and get 'consumer' once Active.
    const notStarting = (p: Person) => !(key === 'consumers' && String((p as Record<string, unknown>).status || '').toLowerCase() === 'starting')
    const people = (id
      ? (byKey[key] ?? []).filter((p) => String(p.id) === String(id))
      : (byKey[key] ?? [])).filter(notStarting)
    if (id && !people.length) return json({ error: 'That person is no longer in the ' + key + ' list.' }, 404)

    // County only when GHL has one County field and the value is one it takes.
    const left = new Set<string>()
    const places = new Map<Person, Place>()
    for (const p of people) {
      const pl = placeFor(key, p, { packets, pipeline: byKey.pipeline })
      const v = cField ? countyValue(cField, pl.county) : null
      if (pl.county && !v) left.add(pl.county)
      places.set(p, { address: pl.address, county: v || '' })
    }
    const counts = {
      withAddress: [...places.values()].filter((x) => Object.keys(x.address).length).length,
      withCounty: [...places.values()].filter((x) => x.county).length,
      countyLeftOut: [...left].sort(),
    }

    if (dry) {
      report[key] = { total: people.length, synced: 0, skipped: [], failed: [], ...counts }
      continue
    }
    const results = await inBatches(people, 3, (p) =>
      upsertContact(p, tagsFor(key, p), headers, locationId, places.get(p)!, cField ? cField.id : null))
    report[key] = {
      total: people.length,
      synced: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok && r.skipped),
      failed: results.filter((r) => !r.ok && r.error),
      ...counts,
    }
  }

  // Record what happened under a key of our own. Never touches the people lists,
  // so this cannot collide with an edit happening in the hub. Skipped for
  // single-person syncs, which fire on every lead added and would otherwise
  // bury the last full run's report.
  if (dry) return json({ configured: true, ok: true, dry: true, countyField: cField ? cField.id : null, fieldsRead: !!fields, report })
  if (!id) {
    await admin.from('agency_data').upsert({
      agency_id: AGENCY_ID,
      data_key: 'ghl_sync_state',
      data_value: {
        lastRunAt: new Date().toISOString(),
        lastRunBy: email,
        report,
      },
    }, { onConflict: 'agency_id,data_key' })
  }

  return json({ configured: true, ok: true, countyField: cField ? cField.id : null, fieldsRead: !!fields, report })
})
