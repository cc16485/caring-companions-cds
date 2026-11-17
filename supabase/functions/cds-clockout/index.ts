// cds-clockout: forgot to clock out (2026-11-17). Logic: _shared/office/clockout.js.
// From the schedule (header x-cron-secret = secret CDS_JOB_SECRET): { action: 'sweep' } every hour.
// From the EVV form (no sign-in, only the private link): { action: 'form_get' | 'form_submit', token, answer }.
// From the CDS hub (the person's sign-in, office staff list only): { action: 'list' | 'approve' | 'deny' | 'done' | 'skip' | 'link', id }.
// Texts only attendants, only while setting clockout_texts.live is true (starts false). Deploy with --no-verify-jwt (the form has no sign-in).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { db, scheduled } from '../_shared/office/server.ts';
import { createClockout, ClockoutError } from '../_shared/office/clockout.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';   // Caring Companions CDS, the only location this may use
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function ghl(path: string, body: unknown) {
  const r = await fetch(GHL + path, { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'),
    Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GoHighLevel ' + r.status + ': ' + (j.message || ''));
  return j;
}

const fix = createClockout({
  db,
  // Only reached when clockout_texts.live is true. Finds the contact by phone only, so the attendant's name in GoHighLevel is never changed.
  async send({ to, body }: { to: string; body: string }) {
    if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
    const c = await ghl('/contacts/upsert', { locationId: CDS_LOCATION, phone: to });
    const contactId = c?.contact?.id ?? c?.id;
    if (!contactId) throw new Error('GoHighLevel did not return a contact');
    await ghl('/conversations/messages', { type: 'SMS', contactId, message: body });
  },
});

const job = scheduled(async (b) => b.action === 'sweep' ? fix.sweep() : { ok: false, error: "action must be 'sweep'" });

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== null) return job(req);
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body && (body.action === 'form_get' || body.action === 'form_submit')) return json(await fix.form(body));
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const u = await admin.auth.getUser(jwt);
    if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS hub.' }, 401);
    return json(await fix.act(u.data.user.email, body));
  } catch (e) {
    if (e instanceof ClockoutError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Nothing changed. Please call (417) 218-2888.' }, 500);
  }
});
