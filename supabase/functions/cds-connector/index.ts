// cds-connector: the CDS Hub connector for Claude (2026-11-26, Samantha: "I want the cds hub connector"). Katlin's Claude
// team-account project adds it as a custom connector at
//   https://siivpekcaryeyttszwav.supabase.co/functions/v1/cds-connector
// Sign-in: this project's own OAuth 2.1 server (Supabase Auth). Claude registers itself, the person signs in with their
// CDS hub email and password on hub.caringcds.com/oauth/consent and presses Allow; every call then carries their token.
// MCP over HTTP: POST JSON-RPC, one JSON answer each (no streaming). Tools and rules: _shared/office/connector.js.
// Deploy: supabase functions deploy cds-connector --project-ref siivpekcaryeyttszwav --no-verify-jwt
//   (--no-verify-jwt so a request without a token gets OUR 401 with the sign-in pointer, which Claude needs.)
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createConnector, rpc } from '../_shared/office/connector.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const REF = 'siivpekcaryeyttszwav';
const BASE = `https://${REF}.supabase.co/functions/v1/cds-connector`;
const AUTH = `https://${REF}.supabase.co/auth/v1`;
const META = BASE + '/.well-known/oauth-protected-resource';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
// The CDS hub's own server, with the person's own sign-in (the attendants' onboarding table: Step 1 and background checks).
const PUB = 'sb_publishable_iDJ00Ve4hw5iw2YtVmiulg__FmjShmO';
async function matchApi(jwt: string, action: string, input: Record<string, unknown>) {
  const r = await fetch(`https://${REF}.supabase.co/functions/v1/cds-match`, { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', apikey: PUB, Authorization: 'Bearer ' + jwt }, body: JSON.stringify({ role: 'staff', action, input }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(j?.error || ('the CDS server answered ' + r.status)));
  return j;
}
const connector = createConnector({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
  matchApi,
});
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'Access-Control-Expose-Headers': 'WWW-Authenticate' };
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { ...H, 'Content-Type': 'application/json', ...extra } });
const challenge = (msg: string) => json({ error: 'unauthorized', error_description: msg }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${META}"` });

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  // RFC 9728: where to sign in. Claude reads this from the WWW-Authenticate header above.
  if (path.endsWith('/.well-known/oauth-protected-resource')) {
    return json({ resource: BASE, authorization_servers: [AUTH], bearer_methods_supported: ['header'], resource_name: 'Caring Companions CDS Hub',
      resource_documentation: 'https://hub.caringcds.com/#todo' });
  }
  if (req.method === 'GET') return json({ error: 'This connector answers POST requests only.' }, 405, { Allow: 'POST' });
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: H });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return challenge('Sign in with your CDS hub account.');
  const u = await admin.auth.getUser(jwt);
  const email = u.error ? '' : (u.data.user?.email || '');
  if (!email) return challenge('Your sign-in ran out. Connect again.');
  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => rpc(connector, email, m, { jwt })))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202, headers: H });
    }
    const out = await rpc(connector, email, body, { jwt });
    return out ? json(out) : new Response(null, { status: 202, headers: H });
  } catch (e) {
    console.error(e);
    return json({ jsonrpc: '2.0', id: (body as { id?: unknown })?.id ?? null, error: { code: -32603, message: 'Something went wrong on our side. Nothing changed.' } }, 500);
  }
});
