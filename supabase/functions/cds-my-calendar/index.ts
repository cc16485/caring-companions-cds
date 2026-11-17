// cds-my-calendar: the server behind My Week, Samantha's own calendar (2026-11-17). The SAME calendar shows in the
// CDS hub (hub.caringcds.com) and the Caring Companions hub (cc.mo-care.com), so it lives here, in one place.
// POST { action: 'list' | 'mark' | 'add' | 'remove', ... } with the person's hub sign-in. A CDS hub sign-in is checked
// with this project; a Caring Companions hub sign-in is checked with the Caring Companions sign-in server.
// Only Samantha's two sign-ins get in. Logic: _shared/office/my-calendar.js. Table: my_calendar.sql.
// Deploy: supabase functions deploy cds-my-calendar --project-ref siivpekcaryeyttszwav --no-verify-jwt
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createCalendar, CalError } from '../_shared/office/my-calendar.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com', 'https://cc.mo-care.com'];
// The Caring Companions hub's public sign-in server and its public key (the same key its page carries).
const CC_URL = 'https://zngsgedlsxinbygwmxwn.supabase.co';
const CC_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZ3NnZWRsc3hpbmJ5Z3dteHduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NDIzNDQsImV4cCI6MjA5ODExODM0NH0.L_31_UKdccyRH9n7p1GaBlZTqcJipB008H-GIvxwLxM';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cal = createCalendar({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
});

async function whoCds(jwt: string) {
  const u = await admin.auth.getUser(jwt);
  return u.error ? '' : (u.data.user?.email || '');
}
async function whoCc(jwt: string) {
  const r = await fetch(CC_URL + '/auth/v1/user', { headers: { apikey: CC_ANON, Authorization: 'Bearer ' + jwt } });
  if (!r.ok) return '';
  const u = await r.json().catch(() => ({}));
  return String(u?.email || '');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-hub' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Please sign in.' }, 401);
  const cc = req.headers.get('x-hub') === 'cc';
  let email = cc ? await whoCc(jwt) : await whoCds(jwt);
  if (!email) email = cc ? await whoCds(jwt) : await whoCc(jwt);
  if (!email) return json({ error: 'Please sign in again.' }, 401);
  try { return json(await cal.handle(email, await req.json().catch(() => ({})))); }
  catch (e) {
    if (e instanceof CalError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Nothing changed.' }, 500);
  }
});
