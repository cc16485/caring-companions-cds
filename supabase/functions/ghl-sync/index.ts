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
//
// Auth: POST with a CDS-project user's access token (Authorization: Bearer).
// Any signed-in hub user may sync; the GHL token never leaves the server.
//
// Secrets required (function returns configured:false until both are set):
//   GHL_TOKEN        - GHL Private Integration token, scope contacts.write
//   GHL_LOCATION_ID  - 4EFPkajwe0hHrqxvYkZ9  (Caring Companions CDS)
//
// Deploy:
//   supabase functions deploy ghl-sync --no-verify-jwt --project-ref siivpekcaryeyttszwav
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const AGENCY_ID = 'caring-companions-cds'
const GHL_API = 'https://services.leadconnectorhq.com'

type Person = { id?: string; name?: string; phone?: string; email?: string; status?: string; type?: string }
type Outcome = { name: string; ok: boolean; skipped?: string; error?: string; contactId?: string }

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
        tags,
        source: 'CDS Hub',
      }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      return { name, ok: false, error: body?.message || body?.error || `HTTP ${r.status}` }
    }
    return { name, ok: true, contactId: body?.contact?.id ?? body?.id ?? undefined }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Gate on the caller's hub login. Every CDS hub user has a real Supabase
  // account, so there is no separate shared key to leak.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(jwt)
  const email = u?.user?.email
  if (!email) return json({ error: 'Sign in to the CDS hub first.' }, 401)

  const token = Deno.env.get('GHL_TOKEN')
  const locationId = Deno.env.get('GHL_LOCATION_ID')
  if (!token || !locationId) {
    return json({
      configured: false,
      error: 'GHL is not connected yet. Set the GHL_TOKEN and GHL_LOCATION_ID secrets on this function.',
    })
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const body = await req.json().catch(() => ({}))
  const { only, id } = body as { only?: string; id?: string }
  if (only && !LISTS[only]) return json({ error: `Unknown list "${only}".` }, 400)
  if (id && !only) return json({ error: 'Syncing one person needs the list it is in.' }, 400)

  const keys = only ? [only] : Object.keys(LISTS)

  const { data: rows, error: readErr } = await admin
    .from('agency_data')
    .select('data_key, data_value')
    .eq('agency_id', AGENCY_ID)
    .in('data_key', keys)
  if (readErr) return json({ error: 'Could not read hub data: ' + readErr.message }, 500)

  const byKey: Record<string, Person[]> = {}
  for (const k of keys) byKey[k] = []
  for (const r of rows ?? []) {
    if (Array.isArray(r.data_value)) byKey[r.data_key] = r.data_value as Person[]
  }

  const report: Record<string, { total: number; synced: number; skipped: Outcome[]; failed: Outcome[] }> = {}

  for (const key of keys) {
    // Adding one lead syncs just that lead. Read it from the database by id so
    // the caller can neither invent a contact nor pick its tag.
    const people = id
      ? (byKey[key] ?? []).filter((p) => String(p.id) === String(id))
      : (byKey[key] ?? [])
    if (id && !people.length) return json({ error: 'That person is no longer in the ' + key + ' list.' }, 404)

    const results = await inBatches(people, 3, (p) => upsertContact(p, tagsFor(key, p), headers, locationId))
    report[key] = {
      total: people.length,
      synced: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok && r.skipped),
      failed: results.filter((r) => !r.ok && r.error),
    }
  }

  // Record what happened under a key of our own. Never touches the people lists,
  // so this cannot collide with an edit happening in the hub. Skipped for
  // single-person syncs, which fire on every lead added and would otherwise
  // bury the last full run's report.
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

  return json({ configured: true, ok: true, report })
})
