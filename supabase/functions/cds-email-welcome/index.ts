// cds-email-welcome: the 4 welcome emails for people who signed up for the Getting Paid worksheets on
// caringcds.com (2026-11-11). The schedule calls it every 10 minutes (header x-cron-secret = CDS_JOB_SECRET).
// Body {"preview": true} sends all 4 as [Test] emails to setting email_welcome.test_to only.
// Practice until setting email_welcome.live is true: then nothing is sent and GoHighLevel is not touched.
// GoHighLevel: CDS sub-account only; a contact is found by email or made with first name + email only
// (checkBody refuses tags and anything else); one note; emails go out through Conversations.
// Logic: _shared/office/email-welcome.js.
import { db, scheduled } from '../_shared/office/server.ts';
import { createEmailWelcome } from '../_shared/office/email-welcome.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const GHL = 'https://services.leadconnectorhq.com';
const CDS_LOCATION = '4EFPkajwe0hHrqxvYkZ9';   // Caring Companions CDS, the only location this may use
function cdsOnly() {
  if (!env('CDS_GHL_TOKEN') || env('CDS_GHL_LOCATION_ID') !== CDS_LOCATION) throw new Error('GoHighLevel is not set to the CDS sub-account on the server');
}
async function call(method: string, path: string, body?: unknown, version = '2021-07-28') {
  cdsOnly();
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(GHL + path, { method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: version, 'Content-Type': 'application/json',
        Accept: 'application/json', 'User-Agent': 'CaringCompanionsCDSHub/1.0 (+https://hub.caringcds.com)' } });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 1500 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error('GoHighLevel ' + r.status + ' on ' + path.split('?')[0] + ': ' + (j.message || '')) as Error & { contactId?: string };
      if (j?.meta?.contactId) err.contactId = String(j.meta.contactId);
      throw err;
    }
    return j;
  }
  throw new Error('GoHighLevel kept saying slow down (429)');
}

const welcome = createEmailWelcome({
  db,
  ghl: {
    async search(email: string) {
      const j = await call('GET', '/contacts/?' + new URLSearchParams({ locationId: CDS_LOCATION, query: email, limit: '20' }));
      return (j.contacts ?? []) as Record<string, unknown>[];
    },
    async create(body: Record<string, unknown>) {
      const j = await call('POST', '/contacts/', { locationId: CDS_LOCATION, ...body });
      if (!j?.contact?.id) throw new Error('GoHighLevel did not return a contact');
      return j.contact.id;
    },
    async note(id: string, { body }: { body: string }) {
      await call('POST', '/contacts/' + encodeURIComponent(id) + '/notes', { body: String(body).slice(0, 4000) });
    },
    // Has this contact sent us anything (any channel) since they signed up? Read only.
    async inboundSince(contactId: string, iso: string) {
      const since = Date.parse(iso);
      const convs = ((await call('GET', '/conversations/search?' + new URLSearchParams({ locationId: CDS_LOCATION, contactId, limit: '20' }), undefined, '2021-04-15'))
        .conversations ?? []) as Record<string, unknown>[];
      for (const c of convs) {
        const j = await call('GET', '/conversations/' + encodeURIComponent(String(c.id)) + '/messages?limit=50', undefined, '2021-04-15');
        const list = (j?.messages?.messages ?? j?.messages ?? []) as Record<string, unknown>[];
        if (list.some((m) => m.direction === 'inbound' && Date.parse(String(m.dateAdded)) > since)) return true;
      }
      return false;
    },
    async sendEmail(contactId: string, { subject, html }: { subject: string; html: string }) {
      await call('POST', '/conversations/messages', { type: 'Email', contactId, subject, html });
    },
    // Test copies: the same way the 8am email reaches the office (find or make the contact by email).
    async sendTest(to: string, { subject, html }: { subject: string; html: string }) {
      const c = await call('POST', '/contacts/upsert', { locationId: CDS_LOCATION, email: to, firstName: 'Caring Companions' });
      const contactId = c?.contact?.id ?? c?.id;
      if (!contactId) throw new Error('GoHighLevel did not return a contact');
      await call('POST', '/conversations/messages', { type: 'Email', contactId, subject, html });
    },
  },
});

Deno.serve(scheduled((b) => (b.preview === true ? welcome.preview() : welcome.run())));
