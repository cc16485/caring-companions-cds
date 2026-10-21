// cds-oig: the automatic OIG exclusion check for CDS attendants (2026-10-21). Logic: _shared/office/oig.js.
// From the schedule (header x-cron-secret = secret CDS_JOB_SECRET):
//   { action: 'import' }                 on the 11th: downloads OIG's UPDATED.csv and replaces the list
//   { action: 'recheck_all' }            after the import: every active attendant (Roster + new applications)
//   { action: 'check', people: [...] }   people = [{ ref, first, last, middle, dob, state }]
// From the CDS hub (the person's sign-in, office staff list only):
//   { action: 'list' }                   the OIG card: list month, last recheck, possible matches to decide
//   { action: 'review', id, decision }   decision 'not_them' | 'is_them'; recorded as that person
// Practice until setting oig_check.live is true: results are saved, no office to-dos.
// Reads only OIG's public file. Never sends a message to anyone.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { db, scheduled } from '../_shared/office/server.ts';
import { createOig, OigError, LEIE_URL } from '../_shared/office/oig.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const oig = createOig({
  db,
  async fetchList() {
    const r = await fetch(LEIE_URL, { headers: { 'User-Agent': 'Caring Companions CDS exclusion check' } });
    if (!r.ok) throw new Error('OIG download ' + r.status);
    return { text: await r.text(), lastModified: r.headers.get('last-modified') };
  },
});

const job = scheduled(async (b) => {
  if (b.action === 'import') return oig.download({ force: b.force === true });
  if (b.action === 'recheck_all') return oig.recheckAll();
  if (b.action === 'check') return oig.check({ people: Array.isArray(b.people) ? b.people : [] });
  return { ok: false, error: "action must be 'import', 'recheck_all' or 'check'" };
});

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== null) return job(req);
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await admin.auth.getUser(jwt);
  if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS hub.' }, 401);
  try { return json(await oig.office(u.data.user.email, await req.json().catch(() => ({})))); }
  catch (e) {
    if (e instanceof OigError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Nothing changed.' }, 500);
  }
});
