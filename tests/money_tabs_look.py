"""Money sub tabs (Samantha 2026-11-16: "money page is one long page, please look at adding sub tabs"). The real hub page,
offline, made-up data. Screenshots to $OUT. python3 tests/money_tabs_look.py"""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate("""()=>{ _store.consumers = [{ id: 'c1', name: 'Jan Example', dcn: '11111111', status: 'active' }]; _store.pipeline = []; _store.attendants = []; _leadCalls = [];
      _store.claims = {}; document.getElementById('header_user').textContent = 'samantha@mo-care.com';
      const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none'; }""")
    nav = lambda: pg.evaluate("()=>[...document.querySelectorAll('#sectionNav button')].map(b=>b.innerText.trim())")
    on = lambda: pg.evaluate("()=>(document.querySelector('#sectionNav button.on')||{}).innerText")
    vis = lambda sel: pg.locator(sel).first.is_visible()

    pg.evaluate("()=>showPage('money')"); pg.wait_for_timeout(300)
    ck('switch off: Payroll, Billing, Dashboard, Quarterly report, Annual report (no Claims tab)', nav() == ['Payroll', 'Billing', 'Dashboard', 'Quarterly report', 'Annual report'], nav())
    ck('Money opens on Payroll', on() == 'Payroll' and vis('text=Upload Empeon PDFs'), on())
    ck('Payroll no longer carries billing, claims or the dashboard', not vis('text=Upload a month of billing') and not vis('#claimsCard') and not vis('#page-financials'))
    pg.screenshot(path=os.path.join(OUT, 'mt01-payroll.png'), full_page=True)
    pg.click('#sectionNav button:has-text("Billing")'); pg.wait_for_timeout(200)
    ck('Billing tab: the WellSky billing upload and Actual against estimate', vis('text=Upload a month of billing') and vis('text=Actual against estimate') and not vis('text=Upload Empeon PDFs'))
    pg.screenshot(path=os.path.join(OUT, 'mt02-billing.png'), full_page=True)
    pg.click('#sectionNav button:has-text("Dashboard")'); pg.wait_for_timeout(200)
    ck('Dashboard tab: the Financial Dashboard alone', vis('#page-financials') and not vis('text=Upload Empeon PDFs'))
    pg.click('#sectionNav button:has-text("Quarterly report")'); pg.wait_for_timeout(200)
    ck('Quarterly report tab opens the quarterly report', vis('#page-quarterly') and on() == 'Quarterly report')
    pg.evaluate("()=>showPage('financials')"); pg.wait_for_timeout(200)
    ck('the old #financials link opens the Dashboard tab', on() == 'Dashboard' and vis('#page-financials'))

    pg.evaluate("()=>{ _store.claims = { live: true }; showPage('money'); }"); pg.wait_for_timeout(200)
    ck('switch on: Claims tab first', nav()[0] == 'Claims', nav())
    pg.evaluate("()=>showPage('moneyclaims')"); pg.wait_for_timeout(300)
    ck('Claims tab shows the Claims for eMOMED card', vis('#claimsCard'))
    pg.evaluate("()=>{ _store.claims = {}; showPage('moneyclaims'); }"); pg.wait_for_timeout(200)
    ck('switched off but opened by link: says how to turn it on', vis('#claimsOff') and not vis('#claimsCard'))

    pg.set_viewport_size({'width': 390, 'height': 844}); pg.evaluate("()=>showPage('payroll')"); pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT, 'mt03-phone.png'), full_page=False)
    ck('phone: no sideways scroll', not pg.evaluate("()=>document.documentElement.scrollWidth > window.innerWidth + 2"))
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
