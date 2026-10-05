// Supabase Edge Function: evv-notify  (CDS project, siivpekcaryeyttszwav) · Desktop 454, 2026-10-05
// -----------------------------------------------------------------------------
// Samantha: "make sure the evv form for the cds sub account shows the form and also sends an email to samantha@mo-care.com
// and krystal@mo-care.com when an evv form is completed".
//
// The public EVV correction form (hub.caringcds.com/evv-form) saves the form, then calls this with the form's own id.
// This looks the form up itself and emails the office once: who, which consumer, the visit, the original and corrected
// times, the reason and the tasks, and where to find it in the CDS hub (EVV Corrections). It sends through the CDS
// GoHighLevel sub-account, the same way transfer-nudge tells the office.
//
// SAFE TO LEAVE OPEN (the form page has no sign-in):
//   · the caller only names a form id; every word and every address is fixed here. It can never email anyone else.
//   · only a form saved in the last 24 hours that has not been emailed yet; notified_at is claimed BEFORE sending, so
//     a double press or a replay sends nothing.
//   · it also catches any form from the last 24 hours whose email never went (the page lost its connection), so one
//     real submission is enough to send what is waiting.
//   · nothing private goes in the email beyond what the office already sees in the hub; no signatures.
// No em dashes anywhere (her rule).
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const GHL_API = 'https://services.leadconnectorhq.com'
export const RECIPIENTS = ['samantha@mo-care.com', 'krystal@mo-care.com']
export const AGENCY_ID = 'caring-companions-cds'
const HUB = 'https://hub.caringcds.com/#evvcorrections'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const noDash = (s: unknown) => String(s ?? '').replace(/\s*[—―]\s*/g, ', ')
// deno-lint-ignore no-explicit-any
type Any = any

/* "9:05am" from "09:05:00"; her 12-hour rule */
export function t12(v: unknown): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '')); if (!m) return ''
  let h = Number(m[1]); const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12
  return h + (m[2] === '00' ? '' : ':' + m[2]) + ap
}
export function day(v: unknown): string {
  const s = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  return new Date(s.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
/* The email, from the saved form. Plain words, one per line. */
export function message(f: Any) {
  const span = (a: unknown, b: unknown) => [t12(a), t12(b)].filter(Boolean).join(' to ') || 'not given'
  const tasks = Array.isArray(f.tasks_performed) && f.tasks_performed.length ? f.tasks_performed.map(String).join(', ') : 'none ticked'
  const rows: [string, string][] = [
    ['Attendant', f.attendant], ['Consumer', f.consumer], ['Visit date', day(f.visitdate)],
    ['Original times', span(f.orig_in, f.orig_out)], ['Corrected times', span(f.new_in, f.new_out)],
    ['Reason', f.reason || 'not given'], ['Tasks performed', tasks], ['Notes', f.notes || 'none'],
    ['Signed', [f.sig_attendant ? 'attendant' : '', f.sig_consumer ? 'consumer' : ''].filter(Boolean).join(' and ') || 'no signatures'],
  ]
  const subject = noDash(`CDS EVV correction form: ${f.attendant} for ${f.consumer}, ${day(f.visitdate)}`).slice(0, 180)
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2a36">` +
    `<p>An EVV correction form was just completed on the CDS form.</p>` +
    `<table style="border-collapse:collapse">` + rows.map(([k, v]) =>
      `<tr><td style="padding:3px 14px 3px 0;color:#57606a;vertical-align:top">${esc(k)}</td><td style="padding:3px 0"><b>${esc(noDash(v))}</b></td></tr>`).join('') +
    `</table>` +
    `<p><a href="${HUB}" style="background:#0D365F;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Open EVV Corrections in the CDS hub</a></p>` +
    `<p style="color:#57606a">The signatures are in the hub. Sent by the CDS EVV form to the office only.</p></div>`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const b: Any = await req.json().catch(() => ({}))
  const id = String(b?.id ?? '')
  if (!UUID.test(id)) return json({ error: 'Which form?' }, 400)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const { data: mine } = await db.from('evv_submissions').select('id').eq('id', id).eq('agency_id', AGENCY_ID).gte('submitted_at', since).maybeSingle()
  if (!mine) return json({ error: 'That form was not found.' }, 404)

  const token = Deno.env.get('GHL_TOKEN'), locationId = Deno.env.get('GHL_LOCATION_ID')
  if (!token || !locationId) return json({ ok: false, error: 'email is not set up on the server' }, 503)
  const h = { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' }

  /* this form, plus any recent one whose email never went */
  const { data: waiting } = await db.from('evv_submissions').select('*').eq('agency_id', AGENCY_ID).gte('submitted_at', since).is('notified_at', null).order('submitted_at')
  const out: Any[] = []
  for (const f of (waiting ?? []) as Any[]) {
    const now = new Date().toISOString()
    /* claim it first: only the call that flips notified_at sends */
    const { data: claimed } = await db.from('evv_submissions').update({ notified_at: now }).eq('id', f.id).is('notified_at', null).select('id')
    if (!claimed || !claimed.length) continue
    const m = message(f)
    let sent = 0
    for (const email of RECIPIENTS) {
      try {
        const up = await fetch(`${GHL_API}/contacts/upsert`, { method: 'POST', headers: h, body: JSON.stringify({ locationId, email, firstName: 'Caring Companions' }) })
        const uj: Any = await up.json().catch(() => ({}))
        const contactId = uj?.contact?.id ?? uj?.id
        if (!contactId) continue
        const r = await fetch(`${GHL_API}/conversations/messages`, { method: 'POST', headers: h, body: JSON.stringify({ type: 'Email', contactId, subject: m.subject, html: m.html }) })
        if (r.ok) sent++
      } catch { /* the next recipient still gets it */ }
    }
    /* nobody got it: release the claim so the next form's call tries again */
    if (!sent) await db.from('evv_submissions').update({ notified_at: null }).eq('id', f.id)
    out.push({ id: f.id, sent })
  }
  return json({ ok: true, emailed: out.filter((x) => x.sent).length, failed: out.filter((x) => !x.sent).length })
})
