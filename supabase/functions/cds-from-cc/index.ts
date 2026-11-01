// cds-from-cc: a caller the Caring Companions office sends over to CDS (2026-11-01). Called only by the
// Caring Companions server (send-to-cds in the shared Hub project), with header x-cc-handoff = secret
// CC_HANDOFF_SECRET, the same value set in both projects. Adds one row to site_leads; the 2-minute lead
// job then alerts the office, adds the plain GoHighLevel contact and the note. Never contacts the family.
// Logic: _shared/office/lead-from-cc.js.
// Deploy: supabase functions deploy cds-from-cc --project-ref siivpekcaryeyttszwav --no-verify-jwt
import { fromCc } from '../_shared/office/server.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const same = (a: string, b: string) => { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = Deno.env.get('CC_HANDOFF_SECRET') ?? '';
  if (secret.length < 32 || !same(req.headers.get('x-cc-handoff') ?? '', secret)) return json({ error: 'not allowed' }, 401);
  const body = await req.json().catch(() => null);
  if (body && body.check === true) return json({ ok: true, check: true });
  try {
    const r = await fromCc.take(body);
    return json(r, r.ok ? 200 : 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
