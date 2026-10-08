// CDS fix 2 (2026-10-08): ghl-sync and evv-notify read only the CDS-specific secret names (CDS_GHL_TOKEN,
// CDS_GHL_LOCATION_ID) and refuse any location but the CDS sub-account. Runs both real functions against a fake
// database and a fake GoHighLevel. Made-up people and a made-up token only.   node cds_ghl_names_test.mjs
import fs from 'fs'; import path from 'path'
const res = []; const ck = (n, c, note) => res.push([n, !!c, c ? '' : JSON.stringify(note ?? null).slice(0, 500)])
const CDS = '4EFPkajwe0hHrqxvYkZ9'
let ENV = {}, GHL = [], ROWS = {}, FORMS = []
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const q = (t) => { const f = []; let op = 'select', patch = null
  const rows = () => (t === 'agency_data' ? Object.entries(ROWS).map(([k, v]) => ({ agency_id: 'caring-companions-cds', data_key: k, data_value: v })) : FORMS).filter((r) => f.every((fn) => fn(r)))
  const b = { select() { return b }, eq(c, v) { f.push((r) => r[c] === v); return b }, in(c, v) { f.push((r) => v.includes(r[c])); return b }, is(c, v) { f.push((r) => (r[c] ?? null) === v); return b },
    gte(c, v) { f.push((r) => String(r[c] ?? '') >= v); return b }, order() { return b }, upsert() { return Promise.resolve({ error: null }) }, update(p) { op = 'update'; patch = p; return b },
    maybeSingle() { return b.then((x) => ({ data: x.data[0] ?? null, error: null })) },
    then(ok) { let out; if (op === 'update') { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); out = { data: hit.map((r) => ({ id: r.id })), error: null } } else out = { data: rows().map((r) => ({ ...r })), error: null }; return Promise.resolve(out).then(ok) } }
  return b }
globalThis.__db = { from: q, auth: { getUser: async (j) => ({ data: { user: j === 'staff' ? { email: 'staff@example.com' } : null } }) } }
globalThis.fetch = async (url, o) => { GHL.push({ url: String(url), auth: o?.headers?.Authorization, body: o?.body ? JSON.parse(o.body) : {} })
  return new Response(JSON.stringify({ contact: { id: 'C1' } }), { status: 200 }) }
const load = async (fn) => { let handler; globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h } }
  const src = fs.readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8').replace(/^import \{ createClient \} from .*$/m, 'const createClient = () => globalThis.__db')
  const tmp = path.join(process.cwd(), `supabase/functions/${fn}/_t${Date.now()}.ts`); fs.writeFileSync(tmp, src)
  try { await import(tmp) } finally { fs.unlinkSync(tmp) } return handler }
const sync = await load('ghl-sync'), notify = await load('evv-notify')
const base = { SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'k' }
const callSync = async (body, jwt = 'staff') => { const r = await sync(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: JSON.stringify(body) })); return [r.status, await r.json()] }
const callNotify = async (id) => { const r = await notify(new Request('https://x/f', { method: 'POST', body: JSON.stringify({ id }) })); return [r.status, await r.json()] }
const reset = () => { GHL = []; ROWS = { pipeline: [{ id: 'p1', name: 'Pat Lead (fake)', phone: '4175550101', type: 'lead' }], consumers: [{ id: 'c1', name: 'Cal Consumer (fake)', email: 'cal@example.com' }], attendants: [] }
  FORMS = [{ id: U(1), agency_id: 'caring-companions-cds', attendant: 'Ann (fake)', consumer: 'Bo (fake)', visitdate: '2026-10-07', reason: 'Phone died', submitted_at: new Date().toISOString(), notified_at: null }] }

// 1. the new names, CDS location: both work exactly as before
ENV = { ...base, CDS_GHL_TOKEN: 'fake-token', CDS_GHL_LOCATION_ID: CDS }; reset()
let [s, r] = await callSync({})
ck('ghl-sync with the new names: syncs the lead and the consumer into the CDS location, with their tags', s === 200 && r.ok && r.report.pipeline.synced === 1 && r.report.consumers.synced === 1
  && GHL.every((g) => g.body.locationId === CDS && g.auth === 'Bearer fake-token') && GHL.some((g) => (g.body.tags || []).includes('lead')) && GHL.some((g) => (g.body.tags || []).includes('consumer')), [s, r, GHL])
reset(); ;[s, r] = await callSync({ only: 'pipeline', id: 'p1' })
ck('...adding one lead still syncs just that lead', s === 200 && r.report.pipeline.synced === 1 && GHL.length === 1, [r, GHL.length])
reset(); ;[s, r] = await callSync({}, 'nobody')
ck('...still refuses anyone not signed in to the CDS hub', s === 401 && GHL.length === 0)
reset(); ;[s, r] = await callNotify(U(1))
ck('evv-notify with the new names: the form is emailed to both office addresses from the CDS location', s === 200 && r.emailed === 1 && GHL.filter((g) => g.url.endsWith('/conversations/messages')).length === 2 && GHL.every((g) => !g.body.locationId || g.body.locationId === CDS), [s, r])
// 2. only the OLD names set (what is live today): both refuse cleanly, nothing goes to GoHighLevel
ENV = { ...base, GHL_TOKEN: 'fake-token', GHL_LOCATION_ID: CDS }; reset()
;[s, r] = await callSync({}); ck('only the old names: ghl-sync says not connected, nothing sent', r.configured === false && /CDS_GHL_TOKEN/.test(r.error) && GHL.length === 0, r)
;[s, r] = await callNotify(U(1)); ck('only the old names: evv-notify says not set up, the form stays waiting (the next form retries it)', s === 503 && GHL.length === 0 && FORMS[0].notified_at === null, [s, r])
// 3. a non-CDS location set by mistake (e.g. the main Caring Companions sub-account): refused before anything is sent
ENV = { ...base, CDS_GHL_TOKEN: 'fake-token', CDS_GHL_LOCATION_ID: 'SOME-OTHER-LOCATION' }; reset()
;[s, r] = await callSync({}); ck('a different location: ghl-sync refuses, nothing sent', r.configured === false && /not the CDS sub-account/.test(r.error) && GHL.length === 0, r)
;[s, r] = await callNotify(U(1)); ck('a different location: evv-notify refuses, nothing sent, form not marked', s === 503 && GHL.length === 0 && FORMS[0].notified_at === null, [s, r])
// 4. no old name is read anywhere in the two functions
const both = ['ghl-sync', 'evv-notify'].map((f) => fs.readFileSync(`supabase/functions/${f}/index.ts`, 'utf8')).join('\n')
ck('neither function reads GHL_TOKEN or GHL_LOCATION_ID any more', !/Deno\.env\.get\('GHL_/.test(both))
for (const [n, okk, d] of res) console.log((okk ? 'PASS  ' : 'FAIL  ') + n + (okk ? '' : '  ' + d))
const pass = res.filter((x) => x[1]).length; console.log(`\n${pass} / ${res.length}`); process.exit(pass === res.length ? 0 : 1)
