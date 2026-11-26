"""The connector's Allow page (2026-11-26): hub.caringcds.com/oauth/consent, served from THIS checkout, with the sign-in
library replaced by a stand-in. Checks: opened without its link it says so; signed out it asks for email and password;
a wrong password says so; signed in it names the person, lists what Claude may and may never do; Allow and No thanks go
to the address the sign-in server gives; an earlier Allow goes straight through; it fits a phone.
python3 tests/connector_consent_look.py (OUT=<dir> for pictures)"""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
FAKE = r"""
window.__go = []; window.__calls = [];
window.supabase = { createClient: function(){ var st = { user: window.__startUser || null };
  return { auth: {
    getSession: async function(){ return { data: { session: st.user ? { user: st.user } : null } }; },
    signInWithPassword: async function(c){ window.__calls.push('signin'); if (c.password !== 'right') return { error: { message: 'Invalid login credentials' } }; st.user = { email: c.email }; return { data: {} }; },
    signOut: async function(){ st.user = null; },
    oauth: {
      getAuthorizationDetails: async function(id){ window.__calls.push('details:' + id); return window.__already ? { data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=old' } } : { data: { authorization_id: id, client: { name: 'Claude' }, scope: 'email' } }; },
      approveAuthorization: async function(id){ window.__calls.push('approve:' + id); return { data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=abc' } }; },
      denyAuthorization: async function(id){ window.__calls.push('deny:' + id); return { data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?error=access_denied' } }; } } } }; } };
"""
def page(b, q='?authorization_id=auth123', user=None, already=False, w=1100):
    cx = b.new_context(viewport={'width': w, 'height': 900}); pg = cx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    went = []
    def route(r):
        u = r.request.url
        if u.startswith('https://claude.ai/'): went.append(u); return r.fulfill(status=200, body='<p>back in Claude</p>', content_type='text/html')
        if 'supabase-js' in u: return r.fulfill(status=200, body=FAKE, content_type='application/javascript')
        if not u.startswith(f'http://127.0.0.1:{PORT}'): return r.abort()
        return r.continue_()
    pg.route('**/*', route)
    pg.add_init_script("window.__startUser=%s; window.__already=%s;" % ('{"email":"%s"}' % user if user else 'null', 'true' if already else 'false'))
    pg.went = went
    pg.goto(f'http://127.0.0.1:{PORT}/oauth/consent/index.html' + q); pg.wait_for_timeout(500)
    return pg, errs
txt = lambda pg: pg.inner_text('#box')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg, errs = page(b, q='')
    ck('opened without its link: it says so', 'opened without its link' in txt(pg), txt(pg))
    pg, errs = page(b)
    ck('signed out: asks for email and password', 'Sign in with your CDS hub email and password' in txt(pg) and pg.locator('#pw').count() == 1, txt(pg))
    pg.fill('#em', 'katlin@mo-care.com'); pg.fill('#pw', 'wrong'); pg.click('#go'); pg.wait_for_timeout(300)
    ck('a wrong password says so in plain words', 'That email and password did not match.' in txt(pg), txt(pg))
    pg.fill('#em', 'katlin@mo-care.com'); pg.fill('#pw', 'right'); pg.click('#go'); pg.wait_for_timeout(400)
    t = txt(pg)
    ck('signed in: names Claude and the person', 'Let Claude use the CDS Hub?' in t and 'katlin@mo-care.com' in t, t)
    ck('lists what Claude may do and may never do', 'Save follow-up texts as drafts' in t and 'It will never: send a text or email' in t, t)
    if OUT: os.makedirs(OUT, exist_ok=True); pg.screenshot(path=os.path.join(OUT, 'connector_allow.png'), full_page=True)
    pg.click('#yes'); pg.wait_for_timeout(500)
    ck('Allow approves this request and goes back to Claude with the code', pg.went == ['https://claude.ai/api/mcp/auth_callback?code=abc'], pg.went)
    ck('no page errors', not errs, errs)
    pg, errs = page(b, user='samantha@caringcds.com')
    pg.click('#no'); pg.wait_for_timeout(500)
    ck('No thanks denies and goes back to Claude', pg.went == ['https://claude.ai/api/mcp/auth_callback?error=access_denied'], pg.went)
    pg, errs = page(b, user='samantha@caringcds.com', already=True)
    ck('allowed before: goes straight back to Claude', pg.went == ['https://claude.ai/api/mcp/auth_callback?code=old'], pg.went)
    pg, errs = page(b, user='katlin@mo-care.com', w=380)
    ck('fits a phone (no sideways scroll)', pg.evaluate('()=>document.documentElement.scrollWidth<=window.innerWidth+1'))
    if OUT: pg.screenshot(path=os.path.join(OUT, 'connector_allow_phone.png'), full_page=True)
    b.close()
print(sum(res), '/', len(res))
raise SystemExit(0 if all(res) else 1)
