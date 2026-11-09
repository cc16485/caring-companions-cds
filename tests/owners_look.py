"""The Owners tab (Samantha 2026-11-09: the monthly content scorecard "in the owners area on the CDS hub"). The real hub
page, served from THIS checkout, offline, with a stand-in database and made-up rows. python3 tests/owners_look.py
(OUT=<dir> for screenshots). Needs playwright. Nothing is sent."""
import os, threading, functools, datetime as dt, json
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
now = dt.datetime.now(); first = now.replace(day=1, hour=12, minute=0, second=0, microsecond=0); last = (first - dt.timedelta(days=3)).replace(day=5)
T = first.astimezone(dt.timezone.utc).isoformat(); L = last.astimezone(dt.timezone.utc).isoformat()
TD, LD = first.strftime('%Y-%m-%d'), last.strftime('%Y-%m-%d')
DB = {
  'site_events': [{'created_at': T, 'session_id': 'a', 'event': 'page_view', 'came_from': 'm.facebook.com', 'from_tag': None},
                  {'created_at': T, 'session_id': 'b', 'event': 'page_view', 'came_from': None, 'from_tag': 'facebook'},
                  {'created_at': T, 'session_id': 'c', 'event': 'page_view', 'came_from': 'www.google.com', 'from_tag': None},
                  {'created_at': T, 'session_id': 'c', 'event': 'call_click', 'came_from': None, 'from_tag': None},
                  {'created_at': L, 'session_id': 'z', 'event': 'page_view', 'came_from': None, 'from_tag': 'flyer'}],
  'site_leads': [{'submitted_at': T}, {'submitted_at': T}, {'submitted_at': L}],
  'attendant_pool': [{'submitted_at': T, 'how_heard': 'Facebook'}, {'submitted_at': L, 'how_heard': None}],
}
PIPE = [{'id': 1, 'addedAt': T, 'source': 'Facebook', 'movedToConsumers': TD}, {'id': 2, 'firstContact': TD, 'source': 'DSDS referral'},
        {'id': 3, 'addedAt': T, 'fromWebsite': True, 'source': 'Website: get paid to care'}, {'id': 4, 'firstContact': LD, 'source': ''}]
CONS = [{'id': 'c1', 'starting': {'activeAt': T}}, {'id': 'c2', 'starting': {'activeAt': L}}, {'id': 'c3'}]
SETUP = """(args)=>{ const [db, pipe, cons, who, broken] = args;
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  document.getElementById('header_user').textContent = who;
  getData = k => k === 'pipeline' ? pipe : k === 'consumers' ? cons : [];
  _db = { from: t => { const q = { _a: 0, _b: 1e9 }; ['select','gte','order','eq','in','limit'].forEach(m => q[m] = () => q);
    q.range = (a, b) => { q._a = a; q._b = b; return q; };
    q.then = res => (broken && t === 'site_events') ? res({ data: null, error: { message: 'relation "site_events" does not exist' } }) : res({ data: (db[t] || []).slice(q._a, q._b + 1), error: null });
    return q; } };
  CDSOwners.refresh && null; showPage('owners'); }"""
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, h, tag in [(1440, 1000, 'desktop'), (390, 844, 'phone')]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
        pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
        pg.evaluate(SETUP, [DB, PIPE, CONS, 'samantha@mo-care.com', False]); pg.wait_for_timeout(800)
        rows = pg.evaluate("()=>[...document.querySelectorAll('#ownersBody tr')].map(t=>t.innerText.replace(/\\s+/g,' ').trim())")
        R = lambda p: next((x for x in rows if x.startswith(p)), '')
        txt = pg.inner_text('#page-owners')
        ck(tag + ': Owners page is open, in the menu and highlighted', pg.evaluate("()=>document.getElementById('page-owners').classList.contains('active')") and pg.evaluate("()=>(document.querySelector('#mainTabs .tab.active')||{}).innerText")=='Owners', pg.evaluate("()=>(document.querySelector('#mainTabs .tab.active')||{}).innerText"))
        ck(tag + ': views honestly not connected', 'not connected yet' in R('Facebook and YouTube views'))
        ck(tag + ': 3 visits this month, 1 last', R('Visits').endswith('3 1'), R('Visits'))
        ck(tag + ': Facebook 2 (site + utm tag), flyer last month', 'Facebook 2 0' in rows and 'Flyers 0 1' in rows, rows)
        ck(tag + ': website forms 2 vs 1', R('Website forms').endswith('2 1'))
        ck(tag + ': phone taps 1', R('Phone number tapped').endswith('1 0'))
        ck(tag + ': new leads 3 vs 1 by how they heard', R('New leads').endswith('3 1') and 'Facebook 1 0' in rows and 'DSDS referral 1 0' in rows and 'Not asked 0 1' in rows, rows)
        ck(tag + ': caregiver sign-ups 1 vs 1', R('Caregiver sign-ups').endswith('1 1'))
        ck(tag + ': said yes 1, first shift 1 vs 1', R('Said yes').endswith('1 0') and R('First shift').endswith('1 1'))
        ck(tag + ': no em dashes', '—' not in txt)
        ck(tag + ': no sideways scroll', pg.evaluate("()=>document.documentElement.scrollWidth <= innerWidth + 1"))
        pg.screenshot(path=os.path.join(OUT, 'owners_' + tag + '.png'), full_page=True)
        ck(tag + ': no page errors', not errs, errs)
        pg.close()
    # a non-owner: no tab, and #owners says it is for the owners
    pg = b.new_page(); pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ document.getElementById('header_user').textContent='krystal@caringcds.com'; showPage('dashboard'); }")
    ck('non-owner: no Owners tab', 'Owners' not in pg.inner_text('#mainTabs'))
    pg.evaluate("()=>showPage('owners')"); pg.wait_for_timeout(300)
    ck('non-owner opening #owners sees no numbers', 'for the owners' in pg.inner_text('#page-owners') and 'Visits' not in pg.inner_text('#page-owners'))
    # the visit table missing: says so, the rest still shows
    pg2 = b.new_page(); pg2.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg2.goto(f'http://127.0.0.1:{PORT}/index.html'); pg2.wait_for_timeout(1500)
    pg2.evaluate(SETUP, [DB, PIPE, CONS, 'samantha@mo-care.com', True]); pg2.wait_for_timeout(800)
    t2 = pg2.inner_text('#page-owners')
    ck('visits unreadable: says so in red, never a zero', 'could not read' in t2 and 'does not exist' in t2)
    ck('the other numbers still show', 'Website forms' in t2 and 'Said yes' in t2)
    b.close()
print(f'{sum(res)} passed, {len(res) - sum(res)} failed')
