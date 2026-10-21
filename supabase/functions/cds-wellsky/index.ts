// cds-wellsky: receives the WellSky report text from the daily CDS check (2026-10-19).
// The morning task on Samantha's Mac runs three WellSky reports in her logged-in Chrome
// and posts each one here straight from the WellSky page (wellsky/pull.js), so the
// report never passes through anything else. Logic: _shared/office/wellsky-ingest.js.
//
// From the WellSky page (no key, origin must be the WellSky reports site): POST a report
// { kind: 'shifts' | 'auths' | 'open' | 'failed' | 'ping', ... } and get back a receipt; it is
// only parked (table wellsky_inbox). From the Mac (header x-wellsky-key = secret
// WELLSKY_INGEST_KEY, kept in cds-security, never in this public repo): { kind: 'confirm',
// receipt } uses the parked report; { kind: 'failed', why } and { kind: 'ping' } as before.
// The key never goes into a web page (2026-10-20).
// From Google (header x-wellsky-key = secret WELLSKY_GOOGLE_KEY, 2026-10-21): only
// { kind: 'analytics' | 'analytics_missing' | 'ping' }, the WellSky Analytics reports that
// arrive by email (wellsky/google-script.gs, _shared/office/wellsky-analytics.js).
// Writes only wellsky_inbox and agency_data 'wellskyCheck' and 'firstShifts'. Never sends a message to anyone.
import postgres from 'npm:postgres@3.4.4';
import { ingest, submit, confirm } from '../_shared/office/wellsky-ingest.js';

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
  const key = req.headers.get('x-wellsky-key');
  try {
    const body = await req.json().catch(() => ({}));
    // No key (the WellSky page, 2026-10-20): the report is only parked and a receipt
    // comes back. Nothing is used until the Mac confirms the receipt with the key.
    if (key === null) {
      if (req.headers.get('origin') !== ORIGIN) return json({ ok: false, error: 'not allowed' }, 401);
      const r = await submit({ db }, body);
      return json(r, r.ok ? 200 : 400);
    }
    // The Google script in samantha@mo-care.com (2026-10-21) has its own key, which can only
    // hand over the emailed WellSky Analytics reports (or say one did not arrive).
    const google = env('WELLSKY_GOOGLE_KEY');
    if (google && same(key, google)) {
      if (!body || !['analytics', 'analytics_missing', 'ping'].includes(body.kind)) return json({ ok: false, error: 'not allowed' }, 401);
      return json(await ingest({ db }, body));
    }
    if (!same(key, env('WELLSKY_INGEST_KEY'))) return json({ ok: false, error: 'not allowed' }, 401);
    if (body && body.kind === 'confirm') return json(await confirm({ db }, body.receipt));
    return json(await ingest({ db }, body));
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'the hub could not save it' }, 500);
  }
});
