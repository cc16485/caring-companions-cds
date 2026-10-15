// cds-match: the one server function behind CDS Caregiver Match.
// DEPLOYED 2026-10-15 (Checkpoint 1) with messages off; no site page calls it yet.
//
// POST { role, action, input }
//   public    : no sign-in (counts, request access)
//   family    : x-cds-session header after the invite + code sign-in
//   caregiver : input.link, the caregiver's private link token
//   staff     : Authorization: Bearer <CDS Hub sign-in>; the email comes from
//               the verified sign-in, never from the request body.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL (built in),
//          CDS_GHL_TOKEN, CDS_GHL_LOCATION_ID, CDS_MATCH_SSN_KEY (64 hex chars),
//          CDS_MATCH_SITE (https://findcdscaregivers.com)
import postgres from 'npm:postgres@3.4.4';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createMatch, MatchError } from '../_shared/match/handlers.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const SITE = env('CDS_MATCH_SITE') || 'https://findcdscaregivers.com';
const ALLOWED_ORIGINS = [SITE, 'https://hub.caringcds.com', 'https://www.findcdscaregivers.com'];
const GHL = 'https://services.leadconnectorhq.com';
const GHL_LOC = env('CDS_GHL_LOCATION_ID');
const MEDIA_BUCKET = 'cds-directory-media';
const PROOF_BUCKET = 'cds-screening-proof';

// Close idle connections before the database side drops them, so the first
// request after a quiet spell never lands on a dead connection.
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20, max_lifetime: 60 * 10 });
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let ssnKey: CryptoKey | null = null;
async function key() {
  if (!ssnKey) {
    const hex = env('CDS_MATCH_SSN_KEY');
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('CDS_MATCH_SSN_KEY is not set');
    ssnKey = await crypto.subtle.importKey('raw', new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16))), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return ssnKey;
}
async function ghlFetch(path: string, init: RequestInit = {}) {
  const r = await fetch(GHL + path, { ...init, headers: { Authorization: 'Bearer ' + env('CDS_GHL_TOKEN'), Version: '2021-07-28',
    'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('GoHighLevel ' + r.status + ': ' + (body.message || ''));
  return body;
}
function dataUrlBytes(data: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(data || '');
  if (!m) throw new MatchError('That file could not be read.');
  const bin = atob(m[2]);
  if (bin.length > 20 * 1024 * 1024) throw new MatchError('That file is too big (20 MB limit).');
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

const match = createMatch({
  mode: 'live',
  db: { query: async (text: string, params: unknown[] = []) => ({ rows: await sql.unsafe(text, params as never[]) }) },
  crypto: {
    token: async () => b64url(crypto.getRandomValues(new Uint8Array(24))),
    code: async () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)),
    hash: async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))).map(b => b.toString(16).padStart(2, '0')).join(''),
    encrypt: async (s: string) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return b64url(iv) + '.' + b64url(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(s)));
    },
    decrypt: async (t: string) => {
      const unb = (x: string) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((x.length + 3) % 4)), c => c.charCodeAt(0));
      const [iv, ct] = String(t).split('.');
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb(iv) }, await key(), unb(ct)));
    },
  },
  media: {
    async put({ pool_id, kind, mime, data, by }: { pool_id: string; kind: string; mime: string; data: string; by: string }) {
      const bytes = dataUrlBytes(data);
      const bucket = kind === 'proof' ? PROOF_BUCKET : MEDIA_BUCKET;
      const path = `${pool_id}/${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const up = await admin.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
      if (up.error) throw new Error('Upload failed: ' + up.error.message);
      const rows = await sql`insert into cds_media (pool_id, kind, storage_path, mime, bytes, created_by)
                             values (${pool_id}, ${kind}, ${bucket + '/' + path}, ${mime}, ${bytes.length}, ${by}) returning id`;
      return rows[0].id;
    },
    // Big videos: a one-time upload address (valid 2 hours) straight into the
    // private bucket; the row's size stays empty until confirm() finds the file.
    async signUpload({ pool_id, kind, mime, by }: { pool_id: string; kind: string; mime: string; by: string }) {
      const path = `${pool_id}/${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const s = await admin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
      if (s.error || !s.data) throw new Error('Upload link failed: ' + (s.error?.message || ''));
      const rows = await sql`insert into cds_media (pool_id, kind, storage_path, mime, created_by)
                             values (${pool_id}, ${kind}, ${MEDIA_BUCKET + '/' + path}, ${mime}, ${by}) returning id`;
      return { media_id: rows[0].id, upload_url: s.data.signedUrl };
    },
    async confirm(id: string) {
      const rows = await sql`select storage_path from cds_media where id=${id}`;
      if (!rows[0]) return false;
      const [bucket, folder, name] = String(rows[0].storage_path).split('/');
      const l = await admin.storage.from(bucket).list(folder, { search: name, limit: 1 });
      const f = (l.data || []).find(x => x.name === name);
      const size = Number(f?.metadata?.size) || 0;
      if (!size) return false;
      await sql`update cds_media set bytes=${size} where id=${id}`;
      return true;
    },
    // Short-lived links only: 10 minutes.
    async url(id: string) {
      const rows = await sql`select storage_path from cds_media where id=${id}`;
      if (!rows[0]) return null;
      const [bucket, ...rest] = String(rows[0].storage_path).split('/');
      const s = await admin.storage.from(bucket).createSignedUrl(rest.join('/'), 600);
      return s.data ? s.data.signedUrl : null;
    },
  },
  ghl: {
    async upsert(c: Record<string, unknown>) {
      const body = await ghlFetch('/contacts/upsert', { method: 'POST', body: JSON.stringify({ locationId: GHL_LOC,
        firstName: c.first_name, lastName: c.last_name || undefined, phone: c.phone || undefined, email: c.email || undefined, tags: c.tags }) });
      return body.contact?.id;
    },
    async update(id: string, fields: Record<string, unknown>) {
      await ghlFetch('/contacts/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ email: fields.email }) });
    },
    async get(id: string) {
      if (!id) return null;
      const body = await ghlFetch('/contacts/' + encodeURIComponent(id));
      const c = body.contact || {};
      return { first_name: c.firstName, phone: c.phone, email: c.email };
    },
  },
  // Only reached when the messages_live setting is true (it starts false).
  async send({ channel, to, subject, body }: { channel: string; to: string; subject?: string; body: string }) {
    const contact = await ghlFetch('/contacts/upsert', { method: 'POST', body: JSON.stringify({ locationId: GHL_LOC,
      ...(channel === 'sms' ? { phone: to } : { email: to }) }) });
    await ghlFetch('/conversations/messages', { method: 'POST', body: JSON.stringify({ type: channel === 'sms' ? 'SMS' : 'Email',
      contactId: contact.contact?.id, message: body, ...(channel === 'email' ? { subject, html: body.replace(/\n/g, '<br>') } : {}) }) });
  },
  links: { family: (t: string) => `${SITE}/directory/?i=${t}`, caregiver: (t: string) => `${SITE}/caregiver/?c=${t}` },
});

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : SITE;
  return { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-cds-session, apikey, x-client-info' };
}

Deno.serve(async req => {
  const h = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { role, action, input = {} } = await req.json();
    const i: Record<string, unknown> = { ...input };
    delete i.staff; delete i.session;
    if (role === 'family') i.session = req.headers.get('x-cds-session') || undefined;
    if (role === 'staff') {
      const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const u = await admin.auth.getUser(jwt);
      if (u.error || !u.data.user?.email) return json({ error: 'Please sign in to the CDS Hub.' }, 401);
      i.staff = u.data.user.email;
    }
    return json(await match.handle(role, action, i));
  } catch (e) {
    if (e instanceof MatchError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on our side. Please call 417-218-2888.' }, 500);
  }
});
