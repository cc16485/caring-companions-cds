#!/usr/bin/env python3
# CDS fix 1 (2026-10-08): the hub page never holds, shows or copies a GoHighLevel key. Runs the real index.html offline
# against a fake database that still has an old key saved (a made-up value), and checks the outreach copy text.
#   python3 cds_ghl_key_test.py [base-sha-to-compare]   (needs playwright)
import os, sys, threading, http.server, functools, subprocess, tempfile
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
FAKE_KEY = "FAKE-KEY-FOR-TEST-0000"   # made up; never a real key
def serve(root):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root); h.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
FAKE = """async (KEY) => {
  const rows = [{ data_key:'outreachSettings', data_value:{ apiKey: KEY, locationId:'4EFPkajwe0hHrqxvYkZ9' } },
    { data_key:'attendants', data_value:[{ id:'a1', name:'Ann Test', phone:'4175550100', email:'ann@example.com' }] },
    { data_key:'pipeline', data_value:[] }, { data_key:'consumers', data_value:[] }];
  const q = { select(){ return q; }, eq(){ return Promise.resolve({ data: rows }); }, upsert(){ return Promise.resolve({ error:null }); } };
  _db = { from(t){ return t==='delivered_units' ? { select(){ return { eq(){ return Promise.resolve({ data:[] }); } }; } } : q; } };
  await _loadAllData();
  let clip = []; try { Object.defineProperty(navigator, 'clipboard', { value:{ writeText: async t => clip.push(t) }, configurable:true }); } catch(e) {}
  window.alert = () => {}; window.confirm = () => true;
  const R = [];
  R.push(['the page keeps no saved key in memory after loading', !JSON.stringify(_store).includes(KEY)]);
  R.push(['no key field, no Outreach/GHL Settings buttons', !document.getElementById('or_api_key') && !document.querySelector('[onclick^="openOutreachSettings"]') && typeof openOutreachSettings === 'undefined']);
  /* the welcome outreach and the universal outreach copy text */
  try { openWelcomeOutreach && openWelcomeOutreach('a1'); } catch(e) {}
  try { document.getElementById('wo_attendant_id').value='a1'; await sendWelcomeNow(); } catch(e) { R.push(['welcome send ran', false, String(e)]); }
  try { openOutreachModal('evv_bulk_reminder', { name:'Ann Test' }); await sendUniversalOutreachNow(); } catch(e) { R.push(['bulk send ran', false, String(e)]); }
  const one = Object.keys(OUTREACH_CONFIGS).find(k => k !== 'evv_bulk_reminder');
  /* an unrelated older bug: after one send the popup loses its Send button until a reload; put one back */
  document.getElementById('uom_footer').innerHTML='<button id="uom_send_btn"></button>';
  try { openOutreachModal(one, { id:'a1', name:'Ann Test', phone:'4175550100', email:'ann@example.com' }); await sendUniversalOutreachNow(); } catch(e) { R.push(['single send ran', false, String(e)]); }
  R.push(['3 outreach texts copied', clip.length === 3, clip.length]);
  R.push(['none of them carries the key', clip.length && clip.every(t => !t.includes(KEY))]);
  R.push(['none asks anyone to add a key', clip.length && clip.every(t => !/GHL_API_KEY|API Key|API key/.test(t)), clip.map(t=>t.slice(-200))]);
  R.push(['each says to send from GoHighLevel Conversations', clip.length && clip.every(t => /Send these from GoHighLevel → Conversations in the CDS sub-account/.test(t))]);
  R.push(['the welcome send still marks the attendant welcomed', getData('attendants')[0].welcomeSent === true]);
  return R; }"""
def run(root):
    srv = serve(root); out = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(); pg = b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.route('**/*', lambda r: r.abort() if 'supabase.co' in r.request.url else r.continue_())
        pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html'); pg.wait_for_timeout(1500)
        out = pg.evaluate(FAKE, FAKE_KEY); b.close()
    srv.shutdown(); return out, errs
res, errs = run(HERE)
for r in res: print('PASS' if r[1] else 'FAIL', '·', r[0], ('' if r[1] else '→ ' + str(r[2] if len(r) > 2 else '')[:300]))
if len(sys.argv) > 1:   # the same checks on the old page, to show what the fix changes
    d = tempfile.mkdtemp(); subprocess.run(['git', '-C', HERE, 'worktree', 'add', '-q', '--detach', d, sys.argv[1]], check=True)
    try:
        old, _ = run(d); print('\nOn the old page (' + sys.argv[1][:7] + '):')
        for r in old: print('   ', 'yes' if r[1] else 'NO ', '·', r[0])
    finally: subprocess.run(['git', '-C', HERE, 'worktree', 'remove', '--force', d])
print(f"{sum(1 for r in res if r[1])} / {len(res)}"); raise SystemExit(0 if all(r[1] for r in res) else 1)
