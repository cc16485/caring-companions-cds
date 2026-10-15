// Practice-mode plumbing for CDS Caregiver Match. Never used live.
// Same interface the cds-match edge function provides, backed by the
// in-browser (or test) database instead of Storage, GoHighLevel and texting.

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function practiceDeps(db, { familyBase, caregiverBase }) {
  const c = globalThis.crypto;
  let keyPromise = null;
  async function key() {
    if (!keyPromise) keyPromise = (async () => {
      const r = await db.query(`select value from cds_match_settings where key='practice_key'`);
      let raw = r.rows[0] && r.rows[0].value;
      if (typeof raw === 'string' && raw.startsWith('"')) raw = JSON.parse(raw);
      if (!raw) {
        raw = Array.from(c.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
        await db.query(`insert into cds_match_settings (key, value) values ('practice_key', $1::jsonb) on conflict (key) do nothing`, [JSON.stringify(raw)]);
      }
      const bytes = new Uint8Array(raw.match(/../g).map(h => parseInt(h, 16)));
      return c.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    })();
    return keyPromise;
  }
  return {
    db,
    mode: 'practice',
    crypto: {
      async token() { return b64url(c.getRandomValues(new Uint8Array(24))); },
      async code() { return String(100000 + (c.getRandomValues(new Uint32Array(1))[0] % 900000)); },
      async hash(s) { return Array.from(new Uint8Array(await c.subtle.digest('SHA-256', enc.encode(String(s))))).map(b => b.toString(16).padStart(2, '0')).join(''); },
      async encrypt(s) {
        const iv = c.getRandomValues(new Uint8Array(12));
        const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(s));
        return b64url(iv) + '.' + b64url(ct);
      },
      async decrypt(t) {
        const unb = x => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((x.length + 3) % 4)), ch => ch.charCodeAt(0));
        const [iv, ct] = String(t).split('.');
        return new TextDecoder().decode(await c.subtle.decrypt({ name: 'AES-GCM', iv: unb(iv) }, await key(), unb(ct)));
      },
    },
    media: {
      async put({ pool_id, kind, mime, data, by }) {
        const r = await db.query(`insert into cds_media (pool_id, kind, mime, practice_data, bytes, created_by) values ($1,$2,$3,$4,$5,$6) returning id`,
          [pool_id, kind, mime, data, Math.round(String(data).length * 0.75), by]);
        return r.rows[0].id;
      },
      // Practice stand-in for the one-time storage upload address: the browser
      // fills practice_data instead of sending the file anywhere.
      async signUpload({ pool_id, kind, mime, by }) {
        const r = await db.query(`insert into cds_media (pool_id, kind, mime, created_by) values ($1,$2,$3,$4) returning id`, [pool_id, kind, mime, by]);
        return { media_id: r.rows[0].id, upload_url: 'practice-upload:' + r.rows[0].id };
      },
      async confirm(id) {
        const r = await db.query('select practice_data from cds_media where id=$1', [id]);
        return !!(r.rows[0] && r.rows[0].practice_data);
      },
      async url(id) {
        const r = await db.query('select practice_data from cds_media where id=$1', [id]);
        return r.rows[0] ? r.rows[0].practice_data : null;
      },
    },
    ghl: {
      // Like GoHighLevel, the same phone or email finds the same contact.
      async upsert({ first_name, last_name, phone, email, tags }) {
        const digits = String(phone || '').replace(/\D/g, '').slice(-10);
        const found = await db.query(`select id from practice_ghl_contacts where ($1 <> '' and right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1) or ($2 <> '' and lower(email) = lower($2)) limit 1`, [digits, email || '']);
        if (found.rows[0]) return found.rows[0].id;
        const id = 'practice-' + b64url(c.getRandomValues(new Uint8Array(6)));
        await db.query('insert into practice_ghl_contacts (id, first_name, last_name, phone, email, tags) values ($1,$2,$3,$4,$5,$6::jsonb)',
          [id, first_name, last_name || '', phone || '', email || '', JSON.stringify(tags || [])]);
        return id;
      },
      async update(id, fields) {
        if (fields.email !== undefined) await db.query('update practice_ghl_contacts set email=$2 where id=$1', [id, fields.email]);
      },
      async get(id) {
        const r = await db.query('select * from practice_ghl_contacts where id=$1', [id]);
        return r.rows[0] || null;
      },
    },
    async send() { throw new Error('Practice mode never sends.'); },
    links: {
      family: t => familyBase + '?i=' + t,
      caregiver: t => caregiverBase + '?c=' + t,
    },
  };
}
