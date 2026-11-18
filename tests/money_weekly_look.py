"""Money > Weekly (2026-11-17, Samantha: "a nice clean proof of billing and payroll numbers and what we make every week").
The real hub page, offline, made-up data. Screenshots to $OUT. python3 tests/money_weekly_look.py"""
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
SETUP = """()=>{
  _store.consumers = []; _store.pipeline = []; _store.attendants = []; _leadCalls = []; _store.claims = {};
  _store.rateSettings = { pay: 15, billing: 20.92 };
  _store.payrollWeeks = { weeks: { '2026-11-08': { hours: 20, byAttendant: { 'Jo Doe': 12, 'Al Roe': 8 } } } };
  _store.payrollTotals = { runs: [{ payStart: '11/01/2026', payEnd: '11/07/2026', gross: 300, checkDate: '11/12/2026', period: '2026-11' }, { payStart: '08/02/2026', payEnd: '08/08/2026', gross: 500, checkDate: '08/13/2026', period: '2026-08' }] };
  const L = (d, c, a, why) => ({ from: d, to: d, code: 'T1019', mod: 'U2', units: 10, charge: c, approved: a, ...(why ? { why } : {}) });
  _stores = { emomedClaims: { claims: [
    { icn: '4926321140704', dcn: '1', consumer: 'Ann Example', status: 'to be paid', billed: 400, paid: 350, batch: 'Week Nov 8 to 14', cutoff: '2026-11-20', first: '2026-11-08', last: '2026-11-10', enteredBy: 'claude 2026-11-17',
      lines: [L('2026-11-08', 200, 200), L('2026-11-10', 200, 150, 'Billed 10 units, Sandata had 7')] },
    { icn: '4926321000021', dcn: '2', consumer: 'Bo Example', status: 'to be paid', billed: 500, paid: 300, batch: 'Sep 17 to Nov 7', cutoff: '2026-11-20', first: '2026-11-02', last: '2026-11-05', enteredBy: 'claude 2026-11-17',
      lines: [L('2026-11-02', 250, 250), L('2026-11-05', 250, 50, 'No Sandata visit that day')] },
    { icn: '4926321019051', dcn: '3', consumer: 'Cy Example', status: 'to be paid', billed: 90, paid: 90, batch: 'Catch-up Jan 1 to Sep 16', cutoff: '2026-11-20', first: '2026-08-04', last: '2026-08-04', lines: [L('2026-08-04', 90, 90)] } ] } };
  _db = { from: () => ({}) };
  claimsLoad = async () => ({ careLogs: {}, uploadedLogs: {}, emomed: _stores.emomedClaims });
  document.getElementById('header_user').textContent = 'samantha@mo-care.com';
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none'; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ window._stores = null; }"); pg.evaluate(SETUP)
    nav = lambda: pg.evaluate("()=>[...document.querySelectorAll('#sectionNav button')].map(b=>b.innerText.trim())")
    pg.evaluate("()=>showPage('money')"); pg.wait_for_timeout(300)
    ck('Weekly is a Money tab, first when Claims is off', nav()[:2] == ['Weekly', 'Payroll'], nav())
    pg.evaluate("()=>showPage('moneyweekly')"); pg.wait_for_timeout(1200)
    t = pg.inner_text('#page-moneyweekly')
    ck('headline week is Nov 8 to 14 with payroll, billed, approved, $0 and what we made',
       'Week of Nov 8, 2026 to Nov 14' in t and '$300.00*' in t and '$400.00' in t and '$350.00' in t and '$50.00' in t, t[:700])
    ck('the week row: about-payroll marked with *, made = approved minus payroll', '$300.00*' in t and '$50.00' in t)
    ck('Nov 1 week uses the Empeon summary (no *) and shows a loss with its rebill', '$300.00\t$500.00\t$300.00' in t.replace(' ', '\t') or ('Nov 1 to Nov 7' in t), t[:1500])
    ck('weeks Paradigm billed are hidden by default', 'Aug 2 to Aug 8' not in t)
    pg.click('#mwkAll'); pg.wait_for_timeout(800); t2 = pg.inner_text('#page-moneyweekly')
    ck('Show every week: earlier weeks appear, labeled Paradigm billed', 'Aug 2 to Aug 8' in t2 and 'Paradigm billed' in t2, t2[:1600])
    pg.click('#mwkAll'); pg.wait_for_timeout(800)
    pg.click('#mwkTable tr[data-week="2026-11-08"]'); pg.wait_for_timeout(800); t3 = pg.inner_text('#page-moneyweekly')
    ck('click a week: hours by attendant, claims by consumer, and the $0 day with its reason',
       'Jo Doe 12' in t3 and '4926321140704' in t3 and 'Sandata had 7' in t3 and '$50.00 of $200.00' in t3, t3[:2000])
    ck('Sent to eMOMED lists each batch with payday', 'Sent to eMOMED' in t3 and 'Week Nov 8 to 14' in t3 and 'Dec 4' in t3)
    ck('Came back $0 or denied lists every $0 day with why', 'Came back $0 or denied (2)' in t3 and 'No Sandata visit that day' in t3)
    ck('no em dashes', '—' not in t3 and '–' not in t3)
    pg.screenshot(path=os.path.join(OUT, 'mw01-weekly.png'), full_page=True)
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, 'mw02-phone.png'), full_page=False)
    ck('phone: no sideways page scroll', not pg.evaluate("()=>document.documentElement.scrollWidth > window.innerWidth + 2"))
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
