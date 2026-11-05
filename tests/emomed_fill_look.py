"""eMOMED fill and Edit name (2026-11-05, her asks: "we can't change her name on her consumer profile" and "it would be nice
if things fill in from the eMOMED upload"). The real hub page, served from THIS checkout, offline, MADE-UP people only.
pdf.js reading is stood in by the made-up page text in tests/fixtures/emomed_sample.txt (the parser test covers the text).
Saves desktop and phone screenshots to $OUT. python3 tests/emomed_fill_look.py   (needs playwright). Nothing is sent or saved."""
import os, threading, functools, tempfile, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
TMP = tempfile.mkdtemp()
PDF = os.path.join(TMP, 'eMOMED-fictional.pdf'); open(PDF, 'wb').write(b'%PDF-1.4\n% fictional test page\n')
PNG = os.path.join(TMP, 'eMOMED-screenshot.png'); open(PNG, 'wb').write(b'\x89PNG\r\n\x1a\n')
TEXT = open(os.path.join(HERE, 'fixtures', 'emomed_sample.txt')).read()
SETUP = r"""
async([TEXT])=>{
  _store.pipeline = [{ id: 'L1', name: 'Margie Sample', type: 'referral', status: 'new', startingId: 'c1', movedToConsumers: '2026-11-01', notes: [] }];
  _store.consumers = [
    { id: 'c1', name: 'Margie Sample', status: 'starting', county: 'Greene', phone: '4175550142', starting: { kind: 'referral', at: '2026-11-01T12:00:00Z', leadId: 'L1' }, medicaid: {}, facts: { street: '1 Old Rd', apt: '2', city: 'Ozark', zip: '65721' } },
    { id: 'c2', name: 'Lee Example', status: 'active', county: 'Polk', phone: '4175550188' }];
  _store.attendants = []; _store.starting = { live: true, by: 'samantha' };
  _store.authorizations = { records: { x: { consumer: 'Lee Example', planEnd: '2027-01-31', months: [] } } };
  _store.billing = { entries: [{ consumer: 'Lee Example', amount: 10, period: '2026-10' }] }; _store.attendantWages = { entries: [] };
  _store.firstShifts = {}; _store.meRules = {}; _store.medicaidMessages = {};
  document.getElementById('header_user').textContent = 'samantha@caringcds.com';
  cdsMatchApi = async () => ({ packet: null, tasks: [], attendants: [], messages: [], forms: [] });
  window._saveConsumerDoc = async (c, file, meta) => Object.assign({ id: 'd' + Date.now(), path: c.id + '/docs/emomed_test.pdf', name: file.name, at: _todayIso(), by: _acWho() }, meta);
  window.syncOneToGhl = async () => {};
  window.prLoadPdfJs = async () => {}; window.pdfText = async () => TEXT;
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
def shot(pg, name, sel=None):
    p = os.path.join(OUT, name + '.png'); (pg.locator(sel).first.screenshot(path=p) if sel else pg.screenshot(path=p, full_page=True))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.on('dialog', lambda d: d.accept())
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP, [TEXT])

    # ---- Starting profile: Edit name is on the title
    pg.evaluate("()=>{openProfile('c1'); _profTab='overview'; renderProfile();}"); pg.wait_for_timeout(400)
    ck('Starting profile has Edit name', pg.locator('#prof_body a:has-text("Edit name")').count() == 1)

    # ---- Medicaid tab: a picture is saved but not read
    pg.evaluate("()=>{_profTab='medicaid'; renderProfile();}"); pg.wait_for_timeout(300)
    pg.set_input_files('#stPdf', PNG); pg.wait_for_timeout(300)
    ck('a screenshot says it is not read, nothing filled', 'saved but not read' in pg.inner_text('#stFound') and pg.input_value('#stDcn') == '')

    # ---- the PDF fills in
    pg.set_input_files('#stPdf', PDF); pg.wait_for_timeout(500)
    found = pg.inner_text('#stFound')
    ck('box shows what eMOMED says', all(x in found for x in ['Active Coverage, MO HealthNet', '01234567', '22 NE Oak Ridge Dr', 'Medicare Part A', 'ME code (Plan Code)', 'Profile says Margie Sample']), found)
    ck('DCN, status and ME code filled on the form', pg.input_value('#stDcn') == '01234567' and pg.input_value('#stStatus') == 'active' and pg.input_value('#stCodes') == '11', pg.input_value('#stCodes'))
    ck('name box has the eMOMED name', pg.input_value('#stFoundName') == 'Margaret McDonald')
    shot(pg, '01-emomed-read-desktop')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(200); shot(pg, '02-emomed-read-mobile')
    ck('phone: no sideways scroll', pg.evaluate("()=>document.documentElement.scrollWidth <= 392"), pg.evaluate("()=>document.documentElement.scrollWidth"))
    pg.set_viewport_size({'width': 1440, 'height': 1000})

    # ---- Save: check saved, profile filled
    pg.click('#prof_body button:has-text("Save: verified by")'); pg.wait_for_timeout(600)
    c = pg.evaluate("()=>getData('consumers').find(x=>x.id==='c1')")
    ck('saved check and filled the profile', c['name'] == 'Margaret McDonald' and c['dcn'] == '01234567' and c['facts']['dob'] == '1940-04-12' and c['facts']['street'] == '22 NE Oak Ridge Dr' and c['facts']['city'] == 'Republic' and c['facts']['zip'] == '65738' and c['facts'].get('apt', '') == '' and len(c['medicaid']['checks']) == 1, c)
    ck('history says it was filled from eMOMED', any('filled in from the eMOMED page' in e['text'] for e in c['medicaid']['log']))
    ck('their lead has the new name', pg.evaluate("()=>getData('pipeline')[0].name") == 'Margaret McDonald')
    ck('title shows the new name', 'Margaret McDonald' in pg.inner_text('#prof_body .cute-title'))

    # ---- unchecked: check saves, profile left alone
    pg.evaluate(SETUP, [TEXT]); pg.evaluate("()=>{openProfile('c1'); _profTab='medicaid'; renderProfile();}"); pg.wait_for_timeout(300)
    pg.set_input_files('#stPdf', PDF); pg.wait_for_timeout(500); pg.uncheck('#stUseFound')
    pg.click('#prof_body button:has-text("Save: verified by")'); pg.wait_for_timeout(600)
    c = pg.evaluate("()=>getData('consumers').find(x=>x.id==='c1')")
    ck('saved check carries ME code 11', c['medicaid']['checks'][-1].get('codes') == ['11'], c['medicaid']['checks'][-1])
    ck('unchecked: name and address untouched', c['name'] == 'Margie Sample' and c['facts']['street'] == '1 Old Rd' and len(c['medicaid']['checks']) == 1, c)

    # ---- a code already typed is kept
    pg.evaluate(SETUP, [TEXT]); pg.evaluate("()=>{openProfile('c1'); _profTab='medicaid'; renderProfile();}"); pg.wait_for_timeout(300)
    pg.fill('#stCodes', '13'); pg.set_input_files('#stPdf', PDF); pg.wait_for_timeout(500)
    ck('a typed ME code is not replaced', pg.input_value('#stCodes') == '13', pg.input_value('#stCodes'))

    # ---- an active consumer: Edit name box, matched records move
    pg.evaluate("()=>{openProfile('c2'); _profTab='overview'; renderProfile();}"); pg.wait_for_timeout(400)
    pg.click('#prof_body a:has-text("Edit name")'); pg.wait_for_timeout(200)
    ck('Edit name box opens with their name', pg.input_value('#nm_name') == 'Lee Example')
    shot(pg, '03-edit-name-box', '#nameModal .modal')
    pg.fill('#nm_name', 'Margie Sample'); pg.click('#nameModal button:has-text("Save")'); pg.wait_for_timeout(200)
    ck('refuses a name another consumer has', 'Another consumer already has that name' in pg.inner_text('#nm_err'))
    pg.fill('#nm_name', 'Leigh Example'); pg.click('#nameModal button:has-text("Save")'); pg.wait_for_timeout(400)
    ck('renamed, with authorization and billing', pg.evaluate("()=>[getData('consumers')[1].name, getObj('authorizations').records.x.consumer, getObj('billing').entries[0].consumer].join('|')") == 'Leigh Example|Leigh Example|Leigh Example')
    ck('profile still finds their authorization', 'nothing on file' not in pg.inner_text('#prof_body').split('Authorization')[1][:80] if 'Authorization' in pg.inner_text('#prof_body') else False)
    shot(pg, '04-active-profile-renamed-desktop')
    ck('no page errors', not errs, errs)
    b.close()
print(f"{sum(res)} passed, {len(res) - sum(res)} failed"); raise SystemExit(0 if all(res) else 1)
