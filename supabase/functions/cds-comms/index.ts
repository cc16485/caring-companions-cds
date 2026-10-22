// cds-comms: the CDS Communication & Follow-Up Center, step 1 (2026-10-22). Logic: _shared/office/comms.js.
//   - The schedule (every 5 minutes, header x-cron-secret = CDS_JOB_SECRET) reads new calls and texts
//     from GoHighLevel and keeps follow-ups up to date.
//   - The hub page (a signed-in CDS hub user) asks for the queue, a person's calls and texts,
//     "Who is this?" answers and Done.
// It only READS GoHighLevel (conversations, messages, users) in the CDS sub-account. It never
// sends, calls, or changes a contact.
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createComms, CommsError } from '../_shared/office/comms.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const ORIGINS = ['https://hub.caringcds.com'];
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';   // Caring Companions CDS, the only location this may read
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

function cdsOnly() {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
}
// GoHighLevel sits behind Cloudflare, which refuses requests without a normal User-Agent.
async function get(path: string, version = '2021-04-15') {
  cdsOnly();
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(GHL + path, { headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: version,
      Accept: 'application/json', 'User-Agent': 'CaringCompanionsCDSHub/1.0 (+https://hub.caringcds.com)' } });
    if (r.status === 429) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('GoHighLevel ' + r.status + ' on ' + path.split('?')[0] + ': ' + (j.message || ''));
    return j;
  }
  throw new Error('GoHighLevel kept saying slow down (429)');
}

const comms = createComms({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
  ghl: {
    async users() {
      const j = await get('/users/?' + new URLSearchParams({ locationId: CDS_LOCATION }), '2021-07-28');
      return (j.users ?? []) as Record<string, unknown>[];
    },
    // Conversations whose last message is newer than sinceMs, newest first.
    async conversations(sinceMs: number) {
      const out: Record<string, unknown>[] = [];
      let after: number | null = null;
      for (let page = 0; page < 40; page++) {
        const p = new URLSearchParams({ locationId: CDS_LOCATION, limit: '100', sortBy: 'last_message_date', sort: 'desc' });
        if (after) p.set('startAfterDate', String(after));
        const list = ((await get('/conversations/search?' + p)).conversations ?? []) as Record<string, unknown>[];
        if (!list.length) break;
        let older = false;
        for (const c of list) {
          const last = Number(c.lastMessageDate) || Date.parse(String(c.lastMessageDate || '')) || 0;
          if (last && last < sinceMs) { older = true; break; }
          out.push(c);
        }
        if (older || list.length < 100) break;
        const lastOne = list[list.length - 1];
        after = Number(lastOne.lastMessageDate) || Date.parse(String(lastOne.lastMessageDate || '')) || null;
        if (!after) break;
      }
      return out;
    },
    // The contact's own phone, for conversations that carry none (read only).
    async contact(id: string) {
      const j = await get('/contacts/' + encodeURIComponent(id), '2021-07-28');
      return (j.contact ?? {}) as Record<string, unknown>;
    },
    // A conversation's messages newer than sinceMs.
    async messages(conversationId: string, sinceMs: number) {
      const out: Record<string, unknown>[] = [];
      let lastId = '';
      for (let page = 0; page < 20; page++) {
        const p = new URLSearchParams({ limit: '100' });
        if (lastId) p.set('lastMessageId', lastId);
        const j = await get('/conversations/' + encodeURIComponent(conversationId) + '/messages?' + p);
        const box = j.messages ?? {};
        const list = (Array.isArray(box) ? box : box.messages ?? []) as Record<string, unknown>[];
        if (!list.length) break;
        let older = false;
        for (const m of list) {
          if (Date.parse(String(m.dateAdded || '')) < sinceMs) { older = true; continue; }
          out.push(m);
        }
        if (older || !box.nextPage) break;
        lastId = String(box.lastMessageId || list[list.length - 1].id || '');
        if (!lastId) break;
      }
      return out;
    },
  },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // the schedule
  if (req.headers.has('x-cron-secret')) {
    const secret = env('CDS_JOB_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'not allowed' }, 401);
    // body { rescan: true } (Desktop steps only) reads the whole history window again; ids keep it safe.
    const body = await req.json().catch(() => ({}));
    try { return json(await comms.run({ rescan: body?.rescan === true })); }
    catch (e) { console.error(e); return json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
  }

  // the hub page
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await admin.auth.getUser(jwt);
  if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS hub.' }, 401);
  try { return json(await comms.handle(u.data.user.email, await req.json().catch(() => ({})))); }
  catch (e) {
    if (e instanceof CommsError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Nothing changed.' }, 500);
  }
});
