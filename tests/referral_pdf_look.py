"""Referral PDF on State and authorization (Samantha 2026-11-27: "put a place in cds hub to upload the fusion pccp request or
referral ID and upload the pdf as well"). The real hub page from THIS checkout, offline, MADE-UP people only. Nothing is sent or saved.
python3 tests/referral_pdf_look.py   (needs playwright). Screenshots to $OUT."""
import os, sys, threading, functools, tempfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
PDF = os.path.join(tempfile.mkdtemp(), 'referral-fictional.pdf'); open(PDF, 'wb').write(b'%PDF-1.4\n% fictional\n')
fails = 0
def ck(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  ' + str(extra)[:400])); fails += 0 if cond else 1
SETUP = r"""
(kind)=>{
  _store.pipeline = []; _store.attendants = []; _store.starting = { live: true, by: 'samantha' };
  _store.consumers = [{ id: 'C1', name: 'Pat Example', status: 'starting', county: 'Greene', phone: '4175550142', docs: [],
    starting: kind === 'move' ? { kind: 'move', transferEntered: '2026-11-20' } : { kind: 'new', referralSent: '2026-11-27', requestId: 'REF-TEST-0001' } }];
  _store.authorizations = {}; _store.firstShifts = {}; _store.meRules = {}; _store.medicaidMessages = {};
  document.getElementById('header_user').textContent = 'samantha@caringcds.com';
  cdsMatchApi = async () => ({ tasks: [], attendants: [], packet: null, forms: [], messages: [] });
  window.SAVED = [];
  window._saveConsumerDoc = async (c, file, meta) => { const d = Object.assign({ id: 'd' + SAVED.length, path: c.id + '/docs/' + meta.kind + '_t' + SAVED.length + '.pdf', name: file.name, at: _todayIso(), by: 'samantha' }, meta); SAVED.push(d); return d; };
  window.syncOneToGhl = async () => {};
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  openProfile('C1'); _profTab = 'state'; renderProfile();
}"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP, 'new'); pg.wait_for_timeout(400)
    body = pg.inner_text('#prof_body')
    ck('State tab shows Referral PDF, not uploaded yet', 'Referral PDF' in body and 'Not uploaded yet' in body, body[:600])
    ck('request ID box keeps the ID', pg.locator('#prof_body input[placeholder="From the state portal"]').input_value() == 'REF-TEST-0001')
    pg.click('#prof_body button:has-text("Upload the referral PDF")'); pg.wait_for_timeout(200)
    ck('no file: asks to pick the PDF', 'Pick the PDF first' in pg.inner_text('#stReqMsg'))
    pg.set_input_files('#stReqPdf', PDF); pg.click('#prof_body button:has-text("Upload the referral PDF")'); pg.wait_for_timeout(400)
    c = pg.evaluate("()=>getData('consumers')[0]")
    d = (c.get('docs') or [{}])[-1]
    ck('saved as kind referral with the sent date and the ID', d.get('kind') == 'referral' and d.get('date') == '2026-11-27' and 'REF-TEST-0001' in (d.get('about') or ''), d)
    ck('history line written', any('Referral PDF saved (REF-TEST-0001)' in (e.get('text') or '') for e in (c.get('medicaid') or {}).get('log', []) + (c.get('log') or [])) or 'Referral PDF saved' in str(c), str(c)[:500])
    body = pg.inner_text('#prof_body')
    ck('State tab now links the PDF', 'referral-fictional.pdf' in body and 'Add another' in body, body[:600])
    pg.locator('#prof_body').screenshot(path=os.path.join(OUT, 'referral_pdf_state.png'))
    pg.evaluate("()=>{_profTab='docs'; renderProfile();}"); pg.wait_for_timeout(300)
    body = pg.inner_text('#prof_body')
    ck('Documents tab groups it under State referrals', 'State referrals and transfer requests' in body and 'referral-fictional.pdf' in body, body[:800])
    ck('Documents kind list offers the referral kind', pg.locator('#doc_kind option[value=referral]').count() == 1)
    pg.screenshot(path=os.path.join(OUT, 'referral_pdf_docs.png'), full_page=True)
    pg.evaluate(SETUP, 'move'); pg.wait_for_timeout(400)
    body = pg.inner_text('#prof_body')
    ck('transfer (PCCP) consumer: Provider change request PDF', 'Provider change request PDF' in body and 'Upload the request PDF' in body, body[:600])
    errs = [e for e in errs if 'createClient' not in e]   # offline: the Supabase script is blocked on purpose
    ck('no page errors', not errs, errs)
    b.close()
print('%d failed' % fails); sys.exit(1 if fails else 0)
