// cds-open-shifts (2026-11-17): texts the consumer and the attendant once when a WellSky shift was
// clocked in and never clocked out, so they can send the EVV form. Logic: _shared/office/open-shift-texts.js.
// Called hourly by the schedule (header x-cron-secret = CDS_JOB_SECRET). Sends only when switch
// open_shift_texts is on; while off, the texts are saved as practice and nobody gets one.
// Sends through the CDS GoHighLevel sub-account only. It never changes a contact's name or anything else.
import postgres from 'npm:postgres@3.4.4';
import { createOpenShiftTexts } from '../_shared/office/open-shift-texts.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';   // Caring Companions CDS, the only location this may use
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20, max_lifetime: 60 * 10 });
const HEAD = () => ({ Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28', Accept: 'application/json',
  'Content-Type': 'application/json', 'User-Agent': 'CaringCompanionsCDSHub/1.0 (+https://hub.caringcds.com)' });

async function ghl(method: string, path: string, body?: unknown) {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
  const r = await fetch(GHL + path, { method, headers: HEAD(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GoHighLevel ' + r.status + ' on ' + path.split('?')[0] + ': ' + (j.message || ''));
  return j;
}

// The person's existing contact by phone; only if there is none, a new contact with their name.
async function contactFor(phone10: string, name: string) {
  const j = await ghl('GET', '/contacts/?' + new URLSearchParams({ locationId: CDS_LOCATION, query: phone10, limit: '20' }));
  const hit = ((j.contacts ?? []) as Record<string, unknown>[]).find(c => String(c.phone || '').replace(/\D/g, '').endsWith(phone10));
  if (hit && hit.id) return String(hit.id);
  const [first, ...rest] = String(name || '').trim().split(/\s+/);
  const c = await ghl('POST', '/contacts/upsert', { locationId: CDS_LOCATION, phone: '+1' + phone10, firstName: first || '', lastName: rest.join(' ') });
  const id = c?.contact?.id ?? c?.id;
  if (!id) throw new Error('GoHighLevel did not return a contact');
  return String(id);
}

const job = createOpenShiftTexts({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) },
  async sms(phone10: string, text: string, name: string) {
    const contactId = await contactFor(phone10, name);
    await ghl('POST', '/conversations/messages', { type: 'SMS', contactId, message: text });
  },
});

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = env('CDS_JOB_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'not allowed' }, 401);
  const body = await req.json().catch(() => ({}));
  try { return json(await job.run({ force: body?.force === true })); }
  catch (e) { console.error(e); return json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
});
