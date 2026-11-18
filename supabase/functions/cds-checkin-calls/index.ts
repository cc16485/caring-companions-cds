// cds-checkin-calls (2026-11-17): the monthly check-in calls to CDS consumers. Logic: _shared/office/checkin-calls.js.
// Called hourly by the schedule (header x-cron-secret = CDS_JOB_SECRET). Calls only while switch checkin_calls is on.
// GoHighLevel (CDS sub-account only): finds the consumer's existing contact by phone (never creates one), sets the
// "Monthly check-in result" field to WAITING, and removes then adds the tag cds-checkin-call, which starts the
// published workflow's Voice AI call. Later runs read the field the agent fills after the call.
// Body: {} (the hourly run), { force: true }, { test: '4175551234' } (one test call to that contact),
// { read: '<contactId>' } (what the agent wrote for that contact).
import postgres from 'npm:postgres@3.4.4';
import { createCheckinCalls, FIELD_KEY } from '../_shared/office/checkin-calls.js';

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

const db = { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text.replace(/\$(\d+)::jsonb/g, '($$$1::text)::jsonb'), params as never[]) }) };
const job = createCheckinCalls({
  db,
  ghl: {
    async fieldId() {
      const j = await ghl('GET', '/locations/' + CDS_LOCATION + '/customFields?model=contact');
      const f = ((j.customFields ?? []) as Record<string, unknown>[]).find(x => x.fieldKey === FIELD_KEY);
      if (!f || !f.id) throw new Error('The "Monthly check-in result" contact field is missing in GoHighLevel');
      return String(f.id);
    },
    async findContact(phone10: string) {
      const j = await ghl('GET', '/contacts/?' + new URLSearchParams({ locationId: CDS_LOCATION, query: phone10, limit: '20' }));
      const hit = ((j.contacts ?? []) as Record<string, unknown>[]).find(c => String(c.phone || '').replace(/\D/g, '').endsWith(phone10));
      return hit && hit.id ? String(hit.id) : null;
    },
    async setField(contactId: string, fieldId: string, value: string) {
      await ghl('PUT', '/contacts/' + encodeURIComponent(contactId), { customFields: [{ id: fieldId, field_value: value }] });
    },
    async retag(contactId: string, tag: string) {
      // removing first makes "tag added" fire again every month
      await ghl('DELETE', '/contacts/' + encodeURIComponent(contactId) + '/tags', { tags: [tag] }).catch(() => {});
      await ghl('POST', '/contacts/' + encodeURIComponent(contactId) + '/tags', { tags: [tag] });
    },
    async readField(contactId: string, fieldId: string) {
      const j = await ghl('GET', '/contacts/' + encodeURIComponent(contactId));
      const cf = ((j.contact?.customFields ?? []) as Record<string, unknown>[]).find(x => x.id === fieldId);
      return cf ? String(cf.value ?? '') : '';
    },
  },
});

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = env('CDS_JOB_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'not allowed' }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.test) return json(await job.test(String(body.test)));
    if (body?.read) return json(await job.read(String(body.read)));
    return json(await job.run({ force: body?.force === true }));
  } catch (e) { console.error(e); return json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
});
