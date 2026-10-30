// cds-lead-link: the server behind hub.caringcds.com/lead/ (the CDS lead link page,
// 2026-10-19). POST { k, action: 'view' | 'called', outcome?, note? }. No sign-in:
// the private link in the person's own text or email is the key, for one lead, 7 days.
// Reads the lead; the only write is a logged call. Never contacts the lead.
// GoHighLevel (CDS sub-account only, read only here): finds the lead's contact for an
// "Open in GoHighLevel" link and their latest texts to us, when the key may read them.
// 2026-10-20 action 'ring' ("Ring my phone, then connect", _shared/office/call-bridge.js):
// the only GoHighLevel change it makes is the contact's "Assigned to" and the tag
// hub-call-bridge, on the person's own tap. Action 'setup' is the installer's check only
// (header x-setup-key = secret CDS_SETUP_KEY): names and yes/no, never ids or numbers.
// 2026-10-29 a link can be for a voicemail that sounds like a new lead (voicemail_leads): action
// 'recording' plays that one voicemail, read from GoHighLevel. Nothing else.
import postgres from 'npm:postgres@3.4.4';
import { createLeadLink, LinkError } from '../_shared/office/lead-link.js';
import { createCallBridge } from '../_shared/office/call-bridge.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';
const APP = 'https://app.hirecara.com/v2/location/' + CDS_LOCATION;   // her white-label GoHighLevel
const ORIGINS = ['https://hub.caringcds.com'];
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });

const ten = (s: unknown) => String(s ?? '').replace(/\D/g, '').slice(-10);
async function ghlGet(path: string) {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) return { status: 0, body: null };
  const r = await fetch(GHL + path, { headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28', Accept: 'application/json' } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
// The call bridge's GoHighLevel calls: CDS sub-account only, or nothing at all.
async function ghlSend(method: string, path: string, body?: unknown) {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) return { status: 0, body: null };
  const r = await fetch(GHL + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28', Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const bridge = createCallBridge({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
  locationId: CDS_LOCATION,
  ghl: {
    get: (path: string) => ghlSend('GET', path),
    put: (path: string, body: unknown) => ghlSend('PUT', path, body),
    post: (path: string, body: unknown) => ghlSend('POST', path, body),
    del: (path: string, body: unknown) => ghlSend('DELETE', path, body),
  },
});

// Search only, exactly one match by phone (last 10 digits) or email; never creates a contact.
// deno-lint-ignore no-explicit-any
async function findContact(who: { phone?: string; email?: string }): Promise<any> {
  const tries: [string, (c: Record<string, unknown>) => boolean][] = [];
  if (ten(who.phone).length === 10) tries.push([ten(who.phone), c => ten(c.phone) === ten(who.phone)]);
  if (who.email) tries.push([String(who.email).toLowerCase(), c => String(c.email || '').toLowerCase() === String(who.email).toLowerCase()]);
  for (const [query, keep] of tries) {
    const r = await ghlGet('/contacts/?' + new URLSearchParams({ locationId: CDS_LOCATION, query, limit: '20' }));
    const hits = ((r.body?.contacts ?? []) as Record<string, unknown>[]).filter(keep);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// The voicemail's recording (CDS sub-account only), as the browser gets it.
async function recording(commId: string) {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) throw new LinkError('GoHighLevel is not set up here.', 502);
  const r = await fetch(GHL + '/conversations/messages/' + encodeURIComponent(commId) + '/locations/' + CDS_LOCATION + '/recording',
    { headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-04-15', Accept: '*/*', 'User-Agent': 'CaringCompanionsCDSHub/1.0 (+https://hub.caringcds.com)' } });
  if (!r.ok) throw new LinkError(r.status === 404 ? 'GoHighLevel has no recording for this voicemail.' : 'The recording could not be read (' + r.status + ').', r.status === 404 ? 404 : 502);
  return r;
}

const link = createLeadLink({
  bridge, recording,
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
  ghl: {
    appUrl: (path: string) => APP + path,
    async contactUrl(who: { contactId?: string | null; phone?: string; email?: string }) {
      if (who.contactId) return APP + '/contacts/detail/' + encodeURIComponent(who.contactId);
      const c = await findContact(who);
      return c?.id ? APP + '/contacts/detail/' + encodeURIComponent(String(c.id)) : null;
    },
    // Their latest texts to us (inbound only). If the key may not read conversations,
    // say so and the page shows "Open the conversation in GoHighLevel" instead.
    async texts(who: { contactId?: string | null; phone?: string; email?: string }) {
      const c = who.contactId ? { id: who.contactId } : await findContact(who);
      if (!c?.id) return { ok: true, messages: [] };
      const s = await ghlGet('/conversations/search?' + new URLSearchParams({ locationId: CDS_LOCATION, contactId: String(c.id) }));
      if (s.status === 401 || s.status === 403) return { ok: false, messages: [] };
      const conv = (s.body?.conversations ?? [])[0];
      if (!conv?.id) return { ok: true, messages: [] };
      const m = await ghlGet('/conversations/' + encodeURIComponent(conv.id) + '/messages?limit=20');
      if (m.status === 401 || m.status === 403) return { ok: false, messages: [] };
      const list = (m.body?.messages?.messages ?? m.body?.messages ?? []) as Record<string, unknown>[];
      const inbound = list.filter(x => x.direction === 'inbound' && String(x.body || '').trim())
        .sort((a, b) => Date.parse(String(b.dateAdded)) - Date.parse(String(a.dateAdded))).slice(0, 3)
        .map(x => ({ body: String(x.body).slice(0, 500), at: String(x.dateAdded || '') }));
      return { ok: true, messages: inbound };
    },
  },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const h = { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'setup') {
      const key = env('CDS_SETUP_KEY');
      if (!key || key.length < 32 || req.headers.get('x-setup-key') !== key) return json({ error: 'not allowed' }, 401);
      return json(await bridge.setup());
    }
    if (body?.action === 'recording') {
      const r = await link.recording(body.k) as Response;
      return new Response(r.body, { headers: { ...h, 'Content-Type': r.headers.get('content-type') || 'audio/x-wav', 'Cache-Control': 'private, no-store' } });
    }
    return json(await link.handle(body));
  }
  catch (e) {
    if (e instanceof LinkError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Open Leads in the CDS hub.' }, 500);
  }
});
