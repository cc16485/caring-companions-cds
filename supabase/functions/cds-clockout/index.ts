// cds-clockout: the filled-in EVV form and the office card for never-clocked-out shifts (2026-11-17).
// Logic: _shared/office/clockout.js. The texts themselves are sent by cds-open-shifts (consumer only).
// From the EVV form (no sign-in, only the private link): { action: 'form_get' | 'form_submit', token, answer }.
// From the CDS hub (the person's sign-in, office staff list only): { action: 'list' | 'approve' | 'deny' | 'done' | 'skip' | 'link', id }.
// Never sends a message. Deploy with --no-verify-jwt (the form has no sign-in).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { db } from '../_shared/office/server.ts';
import { createClockout, ClockoutError } from '../_shared/office/clockout.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const fix = createClockout({ db });

Deno.serve(async (req) => {
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
