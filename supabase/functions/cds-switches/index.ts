// cds-switches: the server behind the Switches card on the CDS hub's Automations page (2026-10-20).
// POST { action: 'list' } or { action: 'set', key, on }, with the person's CDS hub sign-in.
// Anyone signed in to the CDS hub can see the switches; only setting switch_owners can change one
// (Samantha for now). Every change goes to cds_audit. Logic: _shared/office/switches.js.
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createSwitches, SwitchError } from '../_shared/office/switches.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const sw = createSwitches({
  // keep JSON parameters exactly as sent (same fix as cds-match)
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await admin.auth.getUser(jwt);
  if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS hub.' }, 401);
  try { return json(await sw.handle(u.data.user.email, await req.json().catch(() => ({})))); }
  catch (e) {
    if (e instanceof SwitchError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Nothing changed.' }, 500);
  }
});
