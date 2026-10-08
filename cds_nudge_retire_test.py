#!/usr/bin/env python3
# CDS fix 3 (2026-10-08): transfer-nudge retired. The real hub page, offline: a transfer's profile no longer says that
# dating a step sends anything; old automatic messages (if any) show only as "Sent automatically before 2026-10-08".
# The function is archived, not deployable.   python3 cds_nudge_retire_test.py
import os, threading, http.server, functools
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HERE); h.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
T = """async () => {
  const R = [], ok = (n, c, d) => R.push([n, !!c, c ? '' : String(d || '').slice(0, 400)]);
  const pipe = [{ id:'p1', name:'Pat Transfer (fake)', type:'pccp', transfer:{ fusionSubmitted:'2026-10-01' } },
                { id:'p2', name:'Old Sent (fake)', type:'pccp', transfer:{ fusionSubmitted:'2026-09-01', toldSubmitted:'2026-09-02T15:00:00Z' } }];
  _store.pipeline = pipe; _store.consumers = []; _store.attendants = [];
  openLeadProfile('p1'); await new Promise(r => setTimeout(r, 100));
  let txt = document.getElementById('lprof_body').innerText;
  ok('a transfer with nothing sent: no "sent" card, and the steps say nothing is sent automatically', !/What we have already sent|Sent automatically before/.test(txt) && /Nothing is sent automatically/.test(txt) && !/sets the automation off/.test(txt), txt);
  openLeadProfile('p2'); await new Promise(r => setTimeout(r, 100));
  txt = document.getElementById('lprof_body').innerText;
  ok('a transfer the old automation did text: shown as "Sent automatically before 2026-10-08", with that message', /Sent automatically before 2026-10-08/.test(txt) && /Told them the request is with the state/.test(txt) && /Nothing more will be sent automatically/.test(txt), txt);
  return R; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route('**/*', lambda r: r.abort() if 'supabase.co' in r.request.url else r.continue_())
    pg.goto(f'http://127.0.0.1:{srv.server_port}/index.html'); pg.wait_for_timeout(1500)
    R = pg.evaluate(T); b.close()
R.append(['the function is archived, not in supabase/functions', not os.path.exists(os.path.join(HERE, 'supabase/functions/transfer-nudge')) and os.path.exists(os.path.join(HERE, 'archive/transfer-nudge/index.ts')), ''])
R.append(['no page errors', not errs, errs])
for n, c, d in R: print('PASS' if c else 'FAIL', '·', n, '' if c else '→ ' + str(d))
print(f"{sum(1 for r in R if r[1])} / {len(R)}"); raise SystemExit(0 if all(r[1] for r in R) else 1)
