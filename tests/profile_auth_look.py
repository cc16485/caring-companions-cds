"""Upload the DSDS authorization from a consumer's profile (2026-11-06, her ask). The real hub page, served from
THIS checkout, offline; the PDF reader and file storage are stand-ins. MADE-UP people only.
(python3 tests/profile_auth_look.py; OUT=<dir> for screenshots). Needs playwright. Nothing is sent or saved."""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
TEXT = "Participant Information: MAE TESTERSON\nDCN: {dcn}\nCare Plan Information 11/01/2026 - 10/31/2027\n12345678901234\nPC - CDS\n11/01/2026\n11/30/2026\nT1019\n240\n"
SETUP = r"""
(t)=>{
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  _db = { storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: () => ({ upsert: () => Promise.resolve({ error: null }) }) };
  _store.consumers = [{ id: 'C1', name: 'Mae Testerson', status: 'active', dcn: '00123456' }, { id: 'C2', name: 'Nodcn Person', status: 'active' }];
  _store.authorizations = {};
  window.PDFTEXT = t; prLoadPdfJs = async () => {}; pdfText = async () => window.PDFTEXT;
  _saveConsumerDoc = async (c, f, m) => ({ name: f.name, kind: m.kind });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); _profileId = 'C1'; _profTab = 'hours'; showPage('profile'); renderProfile();
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(ok); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 1000}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500); errs.clear()
    pg.evaluate(SETUP, TEXT.format(dcn='123456')); pg.wait_for_timeout(300)
    btn = pg.locator('#prof_body button', has_text='Upload the authorization (PDF)')
    ck('Hours tab has the upload button', btn.count() == 1)
    pg.locator('#prof_body').screenshot(path=os.path.join(OUT, 'profile_auth_before.png'))
    # Wrong person's DCN: refused, nothing saved.
    pg.evaluate("t=>{PDFTEXT=t}", TEXT.format(dcn='999999'))
    pg.evaluate("()=>profAuthUpload('C1', new File(['x'], 'auth.pdf'))"); pg.wait_for_timeout(300)
    ck('another DCN is refused', 'Nothing was saved' in pg.inner_text('#profAuthMsg') and not pg.evaluate("()=>Object.keys(getAuths().records).length"), pg.inner_text('#profAuthMsg'))
    # Not an authorization.
    pg.evaluate("()=>{PDFTEXT='hello'}")
    pg.evaluate("()=>profAuthUpload('C1', new File(['x'], 'other.pdf'))"); pg.wait_for_timeout(300)
    ck('not an authorization is refused', 'does not look like a DSDS authorization' in pg.inner_text('#profAuthMsg'), pg.inner_text('#profAuthMsg'))
    # Matching DCN (leading zeros ignored): saved, shown, PDF kept.
    pg.evaluate("t=>{PDFTEXT=t}", TEXT.format(dcn='123456'))
    pg.evaluate("()=>profAuthUpload('C1', new File(['x'], 'auth.pdf'))"); pg.wait_for_timeout(400)
    body = pg.inner_text('#prof_body')
    ck('matching DCN saves and shows it', 'Authorization saved' in body and '240' in body and 'No authorization on file' not in body, body[:400])
    ck('PDF kept in Documents', pg.evaluate("()=>(getData('consumers')[0].docs||[]).length") == 1)
    ck('button now says upload a new one', pg.locator('#prof_body button', has_text='Upload a new authorization (PDF)').count() == 1)
    pg.locator('#prof_body').screenshot(path=os.path.join(OUT, 'profile_auth_after.png'))
    # No DCN on the profile: name must match; then the DCN is filled in.
    pg.evaluate("()=>{ _profileId='C2'; renderProfile(); }")
    pg.evaluate("()=>profAuthUpload('C2', new File(['x'], 'auth.pdf'))"); pg.wait_for_timeout(300)
    ck('no DCN and another name is refused', 'not Nodcn Person' in pg.inner_text('#profAuthMsg'), pg.inner_text('#profAuthMsg'))
    pg.evaluate("t=>{PDFTEXT=t}", TEXT.format(dcn='555555').replace('MAE TESTERSON', 'NODCN PERSON'))
    pg.evaluate("()=>profAuthUpload('C2', new File(['x'], 'auth.pdf'))"); pg.wait_for_timeout(300)
    ck('no DCN, same name: saved and DCN filled in', pg.evaluate("()=>getData('consumers')[1].dcn") == '555555')
    ck('no em dashes', '—' not in pg.inner_text('#prof_body'))
    ck('no page errors', not [e for e in errs if 'createClient' not in e], errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed')
raise SystemExit(0 if all(res) else 1)
