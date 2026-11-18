// cds-coordinator: the CDS Coordinator, part 1, it listens (2026-11-17, her ask). Logic: _shared/office/coordinator.js.
//   - The schedule (every 15 minutes, header x-cron-secret = CDS_JOB_SECRET) reads new calls and texts on both lines for
//     everyone on the start tracker and every open lead, and turns them into promises and suggestions. Body
//     {"backfill": true} (Desktop step only) reads the last 45 days once. Body {"selftest": true} reads a made-up call.
//   - The hub page (a signed-in CDS hub user) asks for the open items and answers one (done, undo, dismiss, used).
// Reads the Caring Companions line through the Caring Companions server's cds-call-feed (header x-cc-handoff =
// CC_HANDOFF_SECRET, the secret both servers already share). Claude through ANTHROPIC_API_KEY (the BAA-covered account).
// It never texts, emails or calls anyone. Deploy: supabase functions deploy cds-coordinator --project-ref siivpekcaryeyttszwav --no-verify-jwt
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createCoordinator, extractRequest, cleanExtract, COORD_MODEL } from '../_shared/office/coordinator.js';
import { createHands } from '../_shared/office/coordinator-hands.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const CC_FEED = 'https://zngsgedlsxinbygwmxwn.supabase.co/functions/v1/cds-call-feed';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function ai(req: Record<string, unknown>) {
  const key = env('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the CDS server');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify(req), signal: AbortSignal.timeout(90000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude ' + r.status + ': ' + String(j?.error?.message || '').slice(0, 160));
  return j;
}
async function ccFeed(body: { phones: string[]; since: string }) {
  const secret = env('CC_HANDOFF_SECRET');
  if (secret.length < 32) throw new Error('CC_HANDOFF_SECRET is not set on the CDS server');
  const r = await fetch(CC_FEED, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'x-cc-handoff': secret }, signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Caring Companions server ' + r.status + ': ' + String(j?.error || '').slice(0, 120));
  return j;
}
// Part 2 (2026-11-17): texts and the 4:30 email go through the CDS GoHighLevel sub-account only, like every CDS sender.
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';
async function ghl(path: string, body: unknown) {
  const r = await fetch(GHL + path, { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'),
    Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'CaringCompanionsCDSHub/1.0 (+https://hub.caringcds.com)' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GoHighLevel ' + r.status + ': ' + (j.message || ''));
  return j;
}
async function send({ phone, email, text, subject, html }: { phone?: string; email?: string; text: string; subject?: string; html?: string }) {
  const locationId = env('CDS_GHL_LOCATION_ID');
  if (!env('CDS_GHL_TOKEN') || locationId !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
  const c = await ghl('/contacts/upsert', { locationId, ...(phone ? { phone } : { email }) });
  const contactId = c?.contact?.id ?? c?.id;
  if (!contactId) throw new Error('GoHighLevel did not return a contact');
  await ghl('/conversations/messages', phone ? { type: 'SMS', contactId, message: text } : { type: 'Email', contactId, subject, html: html || text });
}
const coord = createCoordinator({
  ai, ccFeed,
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
});

const db2 = { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) };
const hands = createHands({ db: db2, ai, send, model: COORD_MODEL });
async function settingsNow() { const r = await sql`select value from cds_match_settings where key = 'coordinator'`; return (r[0]?.value || {}) as Record<string, unknown>; }

// A made-up call, for the Desktop step's proof. Saves nothing.
async function selftest() {
  const person = { kind: 'consumer', id: 'test', name: 'Pat Example', start: '', attendant: '' };
  const transcript = 'Speaker 1: Caring Companions, this is Krystal.\nSpeaker 2: Hi, this is Pat Example. My son Lee will be my caregiver.\n' +
    'Speaker 1: Great. What is his phone and email?\nSpeaker 2: 417-555-0142, and lee.example at example dot com.\n' +
    'Speaker 1: I will text Lee the application today and we will run his background check. The state gave you a start date of December 8th.\n' +
    'Speaker 2: Yes. I will call you Friday with my new address. Do I need to buy anything for the clock in?\nSpeaker 1: Okay, thank you, bye.';
  const x = cleanExtract(await ai(extractRequest(person, { line: 'cds', kind: 'call', id: 'test', at: '2026-11-17T15:00:00Z', transcript }, '2026-11-17')), '2026-11-17');
  return { ok: !x.error, promises: (x.promises || []).length, start: x.startDate && x.startDate.date, attendant: x.attendant && x.attendant.name, email: !!(x.attendant && x.attendant.email),
    their_word: (x.theirWord || []).length, questions: (x.questions || []).length, error: x.error || null };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (req.headers.has('x-cron-secret')) {
    const secret = env('CDS_JOB_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'not allowed' }, 401);
    const body = await req.json().catch(() => ({}));
    try {
      if (body?.selftest === true) return json(await selftest());
      // body {"email_test": true} (Desktop step only): the 4:30 email now, so she sees it arrive.
      if (body?.email_test === true) return json(await hands.dailyEmail(await settingsNow(), { force: true }));
      const heard = await coord.run({ backfill: body?.backfill === true });
      const set = await settingsNow();
      if (set.live === false) return json(heard);
      const did = body?.backfill === true ? { texts: 'not during a backfill' } : await hands.work(set);
      const mail = body?.backfill === true ? {} : await hands.dailyEmail(set);
      return json({ ...heard, texts: did, ...mail });
    }
    catch (e) { console.error(e); return json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
  }
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await admin.auth.getUser(jwt);
  if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS hub.' }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === 'list') return json(await coord.list({ all: body.all === true }));
    if (body?.action === 'decide') return json(await coord.decide(u.data.user.email, body));
    if (body?.action === 'msgs') return json(await hands.list());
    if (body?.action === 'send') { const r = await hands.sendOne(body.id, u.data.user.email, typeof body.body === 'string' ? body.body : undefined); return json(r, r.ok ? 200 : 400); }
    if (body?.action === 'skip') { const r = await hands.skip(body.id, u.data.user.email); return json(r, r.ok ? 200 : 400); }
    return json({ error: 'Unknown request' }, 400);
  } catch (e) { return json({ error: String((e as Error)?.message || e).slice(0, 200) }, 400); }
});
