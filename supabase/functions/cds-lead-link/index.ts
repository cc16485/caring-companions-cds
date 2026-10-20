// cds-lead-link: the server behind hub.caringcds.com/lead/ (the CDS lead link page,
// 2026-10-19). POST { k, action: 'view' | 'called', outcome?, note? }. No sign-in:
// the private link in the person's own text or email is the key, for one lead, 7 days.
// Reads the lead; the only write is a logged call. Never contacts the lead.
// GoHighLevel (CDS sub-account only, read only here): finds the lead's contact for an
// "Open in GoHighLevel" link and their latest texts to us, when the key may read them.
import postgres from 'npm:postgres@3.4.4';
import { createLeadLink, LinkError } from '../_shared/office/lead-link.js';

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

const link = createLeadLink({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
  ghl: {
    async contactUrl(who: { phone?: string; email?: string }) {
      const c = await findContact(who);
      return c?.id ? APP + '/contacts/detail/' + encodeURIComponent(String(c.id)) : null;
    },
    // Their latest texts to us (inbound only). If the key may not read conversations,
    // say so and the page shows "Open the conversation in GoHighLevel" instead.
    async texts(who: { phone?: string; email?: string }) {
      const c = await findContact(who);
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
  try { return json(await link.handle(await req.json().catch(() => ({})))); }
  catch (e) {
    if (e instanceof LinkError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Open Leads in the CDS hub.' }, 500);
  }
});
