"""My Week calendar (2026-11-17): Samantha's own calendar, a tab in Today. The real hub page, served from THIS checkout,
offline, with the calendar server replaced by an in-memory copy. Checks (tests/my_week_checks.js, the same file in the
Caring Companions hub): week, month and year views, check off, Undo, move to the next day, drag, pick a day, still open
from before, her own items, a failed save shows; someone else sees no tab and no schedule; my-week.js and the checks
match the Caring Companions hub's copies when that checkout is next to this one. python3 tests/my_week_look.py (OUT=<dir>)."""
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
def page(b, who, w=1440, h=1000):
    cx = b.new_context(viewport={'width': w, 'height': h}, timezone_id='America/Chicago'); pg = cx.new_page()
    pg.clock.install(time='2026-11-17T11:00:00-06:00'); pg.clock.resume()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate("w=>{ const lo=document.getElementById('loginOverlay'); if(lo) lo.style.display='none'; document.getElementById('header_user').textContent=w; showPage('dashboard'); }", who)
    pg.wait_for_timeout(300)
    return pg, errs
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg, errs = page(b, 'samantha@mo-care.com')
    ck('Samantha sees My Week in the Today tabs', 'My Week' in pg.inner_text('#sectionNav'), pg.inner_text('#sectionNav'))
    pg.evaluate("()=>{ window.__openMW=async()=>{ showPage('myweek'); }; }")
    R = pg.evaluate(open(os.path.join(HERE, 'my_week_checks.js')).read())
    for st, n, d in R: ck(n, st == 'PASS', d)
    ck('the page is open and Today is the lit section', pg.evaluate("()=>document.getElementById('page-myweek').classList.contains('active')") and pg.evaluate("()=>(document.querySelector('#mainTabs .tab.active')||{}).innerText")=='Today')
    pg.evaluate("()=>{ MW._state.view='week'; MW._state.anchor=null; MW._state.undo=null; MW._state.note=''; MW.render('mwWrap'); }"); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, 'cds_my_week.png'), full_page=True)
    pg.evaluate("()=>{ MW._state.view='month'; MW.render('mwWrap'); }"); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, 'cds_my_month.png'), full_page=True)
    pg.evaluate("()=>{ MW._state.view='year'; MW.render('mwWrap'); }"); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT, 'cds_my_year.png'), full_page=True)
    ck('no page errors', not errs, errs)
    pg2, errs2 = page(b, 'krystal@caringcds.com')
    ck('someone else sees no My Week tab', 'My Week' not in pg2.inner_text('#sectionNav'))
    pg2.evaluate("()=>showPage('myweek')"); pg2.wait_for_timeout(300)
    ck('someone else opening #myweek sees no schedule', 'Money in' not in pg2.inner_text('#page-myweek'))
    for name in ('cc-hub-my-calendar', 'cc-hub-myweek'):
        other = os.path.join(ROOT, '..', name)
        if os.path.exists(os.path.join(other, 'tests', 'browser', 'my_week_checks.js')):
            ck('my-week.js matches the Caring Companions hub copy', open(os.path.join(other, 'my-week.js')).read() == open(os.path.join(ROOT, 'my-week.js')).read())
            ck('the checks match the Caring Companions hub copy', open(os.path.join(other, 'tests', 'browser', 'my_week_checks.js')).read() == open(os.path.join(HERE, 'my_week_checks.js')).read())
            break
    b.close()
print(f'{sum(res)} passed, {len(res) - sum(res)} failed')
