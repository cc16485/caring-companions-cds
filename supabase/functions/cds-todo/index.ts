// cds-todo: the server behind each office person's to-do list in the CDS hub (2026-11-26, Samantha: "Katlins to-do
// needs to be in the Caring Companions CDS Subaccount"). POST { action: 'list' | 'mark' | 'save' | 'remove', ... } with
// the person's CDS hub sign-in. Staff (staff_emails) see their own list; owners (switch_owners) see and change everyone's.
// Logic: _shared/office/todo.js. Table: todo.sql.
// Deploy: supabase functions deploy cds-todo --project-ref siivpekcaryeyttszwav --no-verify-jwt
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createTodo, TodoError } from '../_shared/office/todo.js';
// 2026-11-26: steps Claude marked done (CDS Hub connector) that the hub page applies (hub-updates.js)
import { createHubUpdates } from '../_shared/office/hub-updates.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const hubUpdates = createHubUpdates({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
});
const todo = createTodo({
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
  if (!jwt) return json({ error: 'Please sign in.' }, 401);
  const u = await admin.auth.getUser(jwt);
  const email = u.error ? '' : (u.data.user?.email || '');
  if (!email) return json({ error: 'Please sign in again.' }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    if (body && (body.action === 'hub_updates' || body.action === 'hub_applied')) {
      const a = await todo.access(email);   // office team only, the same as the to-do
      return json(body.action === 'hub_updates' ? { ok: true, updates: await hubUpdates.pending() } : await hubUpdates.applied(a.me, body.ids));
    }
    return json(await todo.handle(email, body));
  }
  catch (e) {
    if (e instanceof TodoError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Nothing changed.' }, 500);
  }
});
