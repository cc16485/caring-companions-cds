// 454 · evv-notify run for real against a fake database and a fake GoHighLevel. Made-up people only.
//   node evv_notify_454_test.mjs
import fs from 'fs'; import path from 'path'
const res = []; const ck = (n, c, note) => res.push([n, !!c, c ? '' : JSON.stringify(note ?? null).slice(0, 700)])
let T, SENT, UPS, FAILSEND = false
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const reset = () => { SENT = []; UPS = []; FAILSEND = false; T = { evv_submissions: [
  { id: U(1), agency_id: 'caring-companions-cds', attendant: 'Jane Doe (fake)', consumer: 'Bob Roe (fake)', visitdate: '2026-10-03', orig_in: '09:00:00', orig_out: null, new_in: '09:00:00', new_out: '13:30:00',
    reason: 'Phone died', tasks_performed: ['Bathing', 'Meal preparation'], notes: null, sig_attendant: 'data:x', sig_consumer: 'data:y', submitted_at: ago(0.01), notified_at: null },
  { id: U(2), agency_id: 'caring-companions-cds', attendant: 'Old Missed (fake)', consumer: 'C (fake)', visitdate: '2026-10-04', reason: 'App crashed', submitted_at: ago(3), notified_at: null },
  { id: U(3), agency_id: 'caring-companions-cds', attendant: 'Done Before (fake)', consumer: 'D (fake)', visitdate: '2026-10-04', submitted_at: ago(2), notified_at: ago(2) },
  { id: U(4), agency_id: 'caring-companions-cds', attendant: 'Too Old (fake)', consumer: 'E (fake)', visitdate: '2026-09-01', submitted_at: ago(48), notified_at: null } ] } }
const q = (t) => { const f = []; let op = 'select', patch = null, wantRows = false; const rows = () => (T[t] || []).filter((r) => f.every((fn) => fn(r)))
  const b = { select() { wantRows = true; return b }, eq(c, v) { f.push((r) => r[c] === v); return b }, is(c, v) { f.push((r) => (r[c] ?? null) === v); return b },
    gte(c, v) { f.push((r) => String(r[c] ?? '') >= v); return b }, order() { return b }, limit() { return b },
    update(p) { op = 'update'; patch = p; return b },
    maybeSingle() { return b.then((x) => ({ data: Array.isArray(x.data) ? (x.data[0] ?? null) : x.data, error: null })) },
    then(ok) { let out; if (op === 'update') { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); out = { data: hit.map((r) => ({ id: r.id })), error: null } }
      else out = { data: rows().map((r) => ({ ...r })), error: null }; return Promise.resolve(out).then(ok) } }; return b }
globalThis.__db = { from: q }
globalThis.fetch = async (url, o) => { url = String(url); const body = o?.body ? JSON.parse(o.body) : {}
  if (url.endsWith('/contacts/upsert')) { UPS.push(body.email); return new Response(JSON.stringify({ contact: { id: 'C:' + body.email } }), { status: 200 }) }
  if (url.endsWith('/conversations/messages')) { if (FAILSEND) return new Response('{}', { status: 400 }); SENT.push(body); return new Response('{}', { status: 200 }) }
  return new Response('{}', { status: 404 }) }
let handler; globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'k', GHL_TOKEN: 'g', GHL_LOCATION_ID: 'loc' })[k] }, serve: (h) => { handler = h } }
const FN = 'supabase/functions/evv-notify/index.ts'
const src = fs.readFileSync(FN, 'utf8').replace(/^import \{ createClient \} from .*$/m, 'const createClient = () => globalThis.__db')
const tmp = path.join(process.cwd(), 'supabase/functions/evv-notify/_t.ts'); fs.writeFileSync(tmp, src)
let M; try { M = await import(tmp) } finally { fs.unlinkSync(tmp) }
const call = async (body) => { const r = await handler(new Request('https://x/f', { method: 'POST', body: JSON.stringify(body) })); return [r.status, await r.json()] }
reset()
const m = M.message(T.evv_submissions[0])
ck('the email: who, consumer, visit, original and corrected times (12-hour), reason, tasks, signed, and the hub button', m.subject === 'CDS EVV correction form: Jane Doe (fake) for Bob Roe (fake), Sat, Oct 3, 2026'
  && /Original times<\/td><td[^>]*><b>9am<\/b>/.test(m.html) && /Corrected times<\/td><td[^>]*><b>9am to 1:30pm<\/b>/.test(m.html) && /Phone died/.test(m.html) && /Bathing, Meal preparation/.test(m.html)
  && /attendant and consumer/.test(m.html) && m.html.includes('https://hub.caringcds.com/#evvcorrections') && !/data:x/.test(m.html), m)
ck('to Samantha and Krystal only, fixed in the code', JSON.stringify(M.RECIPIENTS) === JSON.stringify(['samantha@mo-care.com', 'krystal@mo-care.com']))
let [s, r] = await call({ id: U(1) })
ck('a new form: emailed to both (and the earlier one whose email never went), each once', s === 200 && r.emailed === 2 && SENT.length === 4 && UPS.filter((e) => e === 'samantha@mo-care.com').length === 2 && UPS.filter((e) => e === 'krystal@mo-care.com').length === 2, [r, SENT.length])
ck('...marked as emailed; the one already emailed and the 2-day-old one are not sent', !!T.evv_submissions[0].notified_at && !!T.evv_submissions[1].notified_at && !SENT.some((x) => /Done Before|Too Old/.test(x.subject)) && !T.evv_submissions[3].notified_at)
SENT = []; ;[s, r] = await call({ id: U(1) })
ck('pressing it again (or a replay) sends nothing', s === 200 && r.emailed === 0 && SENT.length === 0)
;[s, r] = await call({ id: U(9) }); ck('a form id that does not exist: refused, nothing sent', s === 404 && SENT.length === 0)
;[s, r] = await call({ id: U(4) }); ck('a form older than a day: refused', s === 404)
;[s, r] = await call({ id: 'nope' }); ck('not a form id: refused', s === 400)
;[s, r] = await call({ id: U(1), to: 'someone@else.com', subject: 'hi' }); ck('the caller cannot add an address or words', !UPS.includes('someone@else.com') && SENT.length === 0)
reset(); FAILSEND = true; ;[s, r] = await call({ id: U(1) })
ck('if GoHighLevel refuses both, the form is NOT marked emailed (the next form tries again)', r.failed === 2 && !T.evv_submissions[0].notified_at, [r, T.evv_submissions[0]])
const sql = fs.readFileSync('evv_form_454.sql', 'utf8'), form = fs.readFileSync('evv-form.html', 'utf8')
ck('SQL: the public form may only ADD a form for this agency; staff read; nothing dropped', /grant insert on public\.evv_submissions to anon;/.test(sql) && /revoke select, update, delete on public\.evv_submissions from anon;/.test(sql) && /with check \(agency_id = 'caring-companions-cds'/.test(sql) && !/drop table|truncate|delete from/i.test(sql))
ck('the form gives each submission its own id and asks for the email after saving, never before', /id:\s+formId,/.test(form) && form.indexOf("_db.from('evv_submissions').insert") < form.indexOf('/functions/v1/evv-notify') && /body: JSON\.stringify\(\{ id: formId \}\)/.test(form))
ck('no em dash on the form or in the email', !/—/.test(form) && !/[—―]/.test(m.html + m.subject))
let pass = 0; for (const [n, ok, note] of res) { console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (ok ? '' : '  ' + note)); if (ok) pass++ }
console.log(pass === res.length ? `ALL ${res.length} CHECKS PASS` : `${res.length - pass} OF ${res.length} FAILED`); process.exit(pass === res.length ? 0 : 1)
