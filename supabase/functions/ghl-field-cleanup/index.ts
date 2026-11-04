// Supabase Edge Function: ghl-field-cleanup  (CDS Hub project: siivpekcaryeyttszwav)
// -----------------------------------------------------------------------------
// ONE-TIME. Deletes the GoHighLevel contact custom fields Samantha approved on
// 2026-11-04 (the "safe to delete" group from the 1289 audit), and nothing else.
// The list and the rules are in _shared/office/ghl-field-cleanup.js.
//
// Desktop 1290 deploys this, runs { mode: 'look' }, asks her yes, runs
// { mode: 'delete' }, then removes this function from the server again.
//
//   look    every approved field, whether it is still there and how many
//           contacts have it filled now. Changes nothing.
//   delete  the same check again, then deletes only the fields that pass it.
//
// Auth: only a Desktop step's one-time code ("step-<code>", sha-256 stored under
// agency_data 'ghl_field_cleanup_code' { hash, expires }). No hub sign-in works.
// Secrets: CDS_GHL_TOKEN (needs locations/customFields.write to delete),
// CDS_GHL_LOCATION_ID (must be the CDS sub-account).
//
// Deploy: supabase functions deploy ghl-field-cleanup --no-verify-jwt --project-ref siivpekcaryeyttszwav
// -----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { plan } from '../_shared/office/ghl-field-cleanup.js'
import { fieldAudit } from '../_shared/office/ghl-contact.js'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const AGENCY_ID = 'caring-companions-cds'
const GHL_API = 'https://services.leadconnectorhq.com'
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9'

async function stepCodeOk(admin: ReturnType<typeof createClient>, code: string): Promise<boolean> {
  const { data } = await admin.from('agency_data').select('data_value')
    .eq('agency_id', AGENCY_ID).eq('data_key', 'ghl_field_cleanup_code').maybeSingle()
  const v = (data?.data_value ?? {}) as { hash?: string; expires?: string }
  if (!v.hash || !v.expires || Date.parse(v.expires) < Date.now()) return false
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === v.hash
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!/^step-[a-f0-9]{32,}$/.test(jwt) || !(await stepCodeOk(admin, jwt.slice(5)))) return json({ error: 'Not allowed.' }, 401)

  const token = Deno.env.get('CDS_GHL_TOKEN')
  const locationId = Deno.env.get('CDS_GHL_LOCATION_ID')
  if (!token || locationId !== CDS_LOCATION) return json({ error: 'GHL is not set up for the CDS sub-account here.' }, 500)
  const headers = { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' }

  const { mode } = await req.json().catch(() => ({})) as { mode?: string }
  if (mode !== 'look' && mode !== 'delete') return json({ error: 'mode must be look or delete' }, 400)

  const fr = await fetch(`${GHL_API}/locations/${locationId}/customFields?model=contact`, { headers })
  const fb = await fr.json().catch(() => ({}))
  if (!fr.ok) return json({ error: `Could not read the GHL custom fields (HTTP ${fr.status}).` }, 502)
  const fields = fb?.customFields ?? []

  // Fill counts across every contact, right now.
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
  const filled = Object.fromEntries(fieldAudit(fields, contacts).map((f: { id: string; filled: number }) => [f.id, f.filled]))
  const rows = plan(fields, filled)
  if (mode === 'look') return json({ ok: true, contacts: contacts.length, rows })

  for (const r of rows) {
    if (!r.ok) continue
    const d = await fetch(`${GHL_API}/locations/${locationId}/customFields/${encodeURIComponent(r.id!)}`, { method: 'DELETE', headers })
    if (d.ok) { r.why = 'deleted' } else {
      const db = await d.json().catch(() => ({}))
      r.ok = false; r.why = 'GHL refused: ' + (db?.message || `HTTP ${d.status}`)
    }
    await new Promise((res) => setTimeout(res, 200))
  }
  return json({ ok: true, contacts: contacts.length, rows })
})
