// What both CDS office jobs share on the server: the database, GoHighLevel sending
// (CDS sub-account only) and the schedule's secret check. 2026-10-19.
import postgres from 'npm:postgres@3.4.4';
import { createLeadAlerts } from './lead-alerts.js';
import { createLeadGhl, checkBody } from './lead-ghl.js';
import { createLeadForms } from './lead-forms.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';   // Caring Companions CDS, the only location this may use

const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });

async function ghl(path: string, body: unknown) {
  const r = await fetch(GHL + path, { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'),
    Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GoHighLevel ' + r.status + ': ' + (j.message || ''));
  return j;
}

export const jobs = createLeadAlerts({
  // Same fix as cds-match: keep JSON parameters exactly as sent.
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
  // Only reached when the job's live setting is true (both start false).
  async send({ channel, to, subject, text, html }: { channel: string; to: string; subject?: string; text: string; html?: string }) {
    const locationId = env('CDS_GHL_LOCATION_ID');
    if (!env('CDS_GHL_TOKEN') || locationId !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
    const c = await ghl('/contacts/upsert', { locationId, ...(channel === 'sms' ? { phone: to } : { email: to }), firstName: 'Caring Companions' });
    const contactId = c?.contact?.id ?? c?.id;
    if (!contactId) throw new Error('GoHighLevel did not return a contact');
    await ghl('/conversations/messages', channel === 'sms'
      ? { type: 'SMS', contactId, message: text }
      : { type: 'Email', contactId, subject, html: html || text.replace(/\n/g, '<br>') });
  },
});

// Website leads into GoHighLevel (2026-10-20): read-only search; create sends ONLY the four
// fields checkBody() allows. Creating is reached only when setting lead_ghl.live is true.
function cdsOnly() {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
}
const leadGhlDeps = {
    async search(query: string) {
      cdsOnly();
      const r = await fetch(GHL + '/contacts/?' + new URLSearchParams({ locationId: CDS_LOCATION, query, limit: '20' }),
        { headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28', Accept: 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('GoHighLevel search ' + r.status);
      return (j.contacts ?? []) as Record<string, unknown>[];
    },
    async create(body: Record<string, unknown>) {
      cdsOnly();
      const r = await fetch(GHL + '/contacts/', { method: 'POST', body: JSON.stringify({ locationId: CDS_LOCATION, ...checkBody(body) }),
        headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.contact?.id) return j.contact.id;
      // already there (duplicate setting on): link that contact, change nothing
      const dup = j?.meta?.contactId;
      const err = new Error('GoHighLevel create ' + r.status + ': ' + (j.message || '')) as Error & { contactId?: string };
      if (dup) err.contactId = String(dup);
      throw err;
    },
};
export const leadGhl = createLeadGhl({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
  ghl: leadGhlDeps,
});

// Every website form (2026-10-31): caregiver sign-ups use the same search and create as above, plus
// reading one contact (a findcdscaregivers family's phone and email) and adding one note. Writing
// to GoHighLevel is reached only when setting lead_forms.live is true.
const ghlHeaders = () => ({ Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' });
export const leadForms = createLeadForms({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
  ghl: {
    search: (query: string) => leadGhlDeps.search(query),
    create: (body: Record<string, unknown>) => leadGhlDeps.create(body),
    async get(id: string) {
      cdsOnly();
      const r = await fetch(GHL + '/contacts/' + encodeURIComponent(id), { headers: ghlHeaders() });
      if (r.status === 404) return null;
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('GoHighLevel contact ' + r.status);
      return j.contact ?? null;
    },
    // A note only: the body is the one key sent.
    async note(id: string, { body }: { body: string }) {
      cdsOnly();
      const r = await fetch(GHL + '/contacts/' + encodeURIComponent(id) + '/notes', { method: 'POST', body: JSON.stringify({ body: String(body).slice(0, 4000) }), headers: ghlHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('GoHighLevel note ' + r.status + ': ' + (j.message || ''));
    },
  },
});

// For jobs that only read and write the database (cds-oig). Same JSON fix as above.
export const db = { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) };

// Called only by the schedule (header x-cron-secret = secret CDS_JOB_SECRET).
export function scheduled(handler: (body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request) => {
    const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const secret = env('CDS_JOB_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'not allowed' }, 401);
    try { return json(await handler(await req.json().catch(() => ({})))); }
    catch (e) { console.error(e); return json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
  };
}
