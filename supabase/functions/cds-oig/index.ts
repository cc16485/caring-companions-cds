// cds-oig: the automatic OIG exclusion check for CDS attendants (2026-10-21). Schedule only
// (header x-cron-secret = secret CDS_JOB_SECRET). Logic: _shared/office/oig.js.
//   { action: 'import' }                 on the 11th: downloads OIG's UPDATED.csv and replaces the list
//   { action: 'recheck_all' }            after the import: every active attendant on the Attendants list
//   { action: 'check', people: [...] }   people = [{ ref, first, last, middle, dob, state }]
// Practice until setting oig_check.live is true: results are saved, no office to-dos.
// Reads only OIG's public file. Never sends a message to anyone.
import { db, scheduled } from '../_shared/office/server.ts';
import { createOig, LEIE_URL } from '../_shared/office/oig.js';

const oig = createOig({
  db,
  async fetchList() {
    const r = await fetch(LEIE_URL, { headers: { 'User-Agent': 'Caring Companions CDS exclusion check' } });
    if (!r.ok) throw new Error('OIG download ' + r.status);
    return { text: await r.text(), lastModified: r.headers.get('last-modified') };
  },
});

Deno.serve(scheduled(async (b) => {
  if (b.action === 'import') return oig.download({ force: b.force === true });
  if (b.action === 'recheck_all') return oig.recheckAll();
  if (b.action === 'check') return oig.check({ people: Array.isArray(b.people) ? b.people : [] });
  return { ok: false, error: "action must be 'import', 'recheck_all' or 'check'" };
}));
