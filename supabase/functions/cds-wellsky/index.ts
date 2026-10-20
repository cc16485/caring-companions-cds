// cds-wellsky: receives the WellSky report text from the daily CDS check (2026-10-19).
// The morning task on Samantha's Mac runs two WellSky reports in her logged-in Chrome
// and posts each one here straight from the WellSky page (wellsky/pull.js), so the
// report never passes through anything else. Logic: _shared/office/wellsky-ingest.js.
//
// POST { kind: 'shifts' | 'auths', text } or { kind: 'failed', why }, with header
// x-wellsky-key = secret WELLSKY_INGEST_KEY (kept on the Mac in cds-security, never in
// this public repo). The only browser origin allowed is the WellSky reports site.
// Writes only agency_data 'wellskyCheck'. Never sends a message to anyone.
import postgres from 'npm:postgres@3.4.4';
import { ingest } from '../_shared/office/wellsky-ingest.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGIN = 'https://troutman.clearcareonline.com';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const db = { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) };

const cors = (req: Request) => req.headers.get('origin') === ORIGIN
  ? { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-wellsky-key', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
  : { Vary: 'Origin' };

function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  const h = cors(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (!same(req.headers.get('x-wellsky-key') ?? '', env('WELLSKY_INGEST_KEY'))) return json({ ok: false, error: 'not allowed' }, 401);
  try {
    return json(await ingest({ db }, await req.json().catch(() => ({}))));
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'the hub could not save it' }, 500);
  }
});
