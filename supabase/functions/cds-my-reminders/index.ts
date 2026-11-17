// cds-my-reminders: My Week must-do reminders for Samantha (2026-11-17). Runs every 15 minutes on the schedule (the same
// secret as the other CDS jobs). Texts and emails her through the CDS GoHighLevel sub-account when a must-do item is past
// its time and not checked off. Body {"test": true} sends one test text and email now. Logic: _shared/office/my-reminders.js.
import postgres from 'npm:postgres@3.4.4';
import { scheduled } from '../_shared/office/server.ts';
import { createReminders } from '../_shared/office/my-reminders.js';

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

const reminders = createReminders({
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
  async send({ channel, to, subject, text, html }: { channel: string; to: string; subject?: string; text: string; html?: string }) {
    const locationId = env('CDS_GHL_LOCATION_ID');
    if (!env('CDS_GHL_TOKEN') || locationId !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
    const c = await ghl('/contacts/upsert', { locationId, ...(channel === 'sms' ? { phone: to } : { email: to }) });
    const contactId = c?.contact?.id ?? c?.id;
    if (!contactId) throw new Error('GoHighLevel did not return a contact');
    await ghl('/conversations/messages', channel === 'sms'
      ? { type: 'SMS', contactId, message: text }
      : { type: 'Email', contactId, subject, html: html || text });
  },
});

Deno.serve(scheduled((b) => reminders.run({ test: b.test === true })));
