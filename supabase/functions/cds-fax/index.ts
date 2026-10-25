// cds-fax: one-click fax from Tax & Enrollment Setup, and incoming faxes on Today (2026-10-25, her yes).
// From the CDS hub, with the person's sign-in: { action: 'list' | 'queue' | 'cancel' | 'dismiss' | 'applied' | 'handled' }.
// From the Google script in zach@caringcds.com (header x-fax-key = secret FAX_GOOGLE_KEY, kept in
// cds-security, never in this public repo): { kind: 'ping' | 'next' | 'sent' | 'result' | 'incoming' }.
// Only the three forms in FAX_FORMS, only to their own fax numbers, only the signed form saved for that
// consumer. Her switch 'faxLive' off = nothing sent, nothing new taken in. Logic: _shared/office/fax.js.
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createFax, FaxError } from '../_shared/office/fax.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const BUCKET = 'ein-proof';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const fax = createFax({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
  store: {
    async download(path: string) {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error('not found');
      return new Uint8Array(await data.arrayBuffer());
    },
    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error('upload failed');
    },
  },
  token: () => crypto.randomUUID().replace(/-/g, '').slice(0, 8),
});

function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const key = req.headers.get('x-fax-key');
    if (key !== null) {
      if (!same(key, env('FAX_GOOGLE_KEY'))) return json({ ok: false, error: 'not allowed' }, 401);
      return json(await fax.google(body));
    }
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const u = await admin.auth.getUser(jwt);
    if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS hub.' }, 401);
    return json(await fax.hub(u.data.user.email, body));
  } catch (e) {
    if (e instanceof FaxError) return json({ ok: false, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, error: 'Something went wrong on our side. Nothing was sent.' }, 500);
  }
});
