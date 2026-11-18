"""Rules check fixes (Samantha 2026-11-17: "yes, build the 4 hub fixes"): F&S reports due the 30th, weekly EVV
aggregator log-in on the checklist and Today, suspected fraud to MMAC within 2 business days (complaint log + Today),
bulk-entered monthly calls flagged as weak evidence. The real hub page, served from THIS checkout, offline (Supabase is
blocked), MADE-UP people only. python3 tests/rules_fixes_look.py (OUT=dir for screenshots). Nothing is sent."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
today = datetime.date.today(); m = lambda n: (today.replace(day=1) - datetime.timedelta(days=28 * n)).strftime('%Y-%m')
ANN = {'id': 'c1', 'name': 'Ann Example', 'status': 'active', 'county': 'Greene', 'cdsStartDate': '2025-01-06',
       'contacts': {m(1): {'date': m(1) + '-15', 'backfilled': True, 'notes': 'Entered in bulk.'}, m(2): {'date': m(2) + '-15', 'backfilled': True, 'notes': 'Entered in bulk.'}}}
SETUP = r"""
async([ANN])=>{
  _store.consumers = [ANN]; _store.pipeline = []; _store.attendants = []; _store.complaints = []; _leadCalls = [];
  document.getElementById('header_user').textContent = 'krystal@mo-care.com';
  cdsMatchApi = async () => ({});
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  window.confirm = () => true; window._alerts = []; window.alert = m => _alerts.push(m);
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP, [ANN])

    # 1 report dates
    ck('Deadlines table: Q2 July 30, Q3 October 30, Q4 January 30', all(x in pg.content() for x in ['<strong>July 30</strong>', '<strong>October 30</strong>', '<strong>January 30</strong>']))

    # 2 weekly aggregator box
    ck('Compliance checklist has the weekly EVV aggregator box and the MMAC fraud box', pg.locator('#evv8').count() == 1 and pg.locator('#evv9').count() == 1)
    due = pg.evaluate("()=>CDSRules.dailyRoutine({consumers:[],pipeline:[],checks:{}}, new Date()).find(s=>s.n===3).items.flatMap(i=>(i.people||[]).map(p=>p.key))")
    ck('Today step 3 asks for the aggregator log-in this week', 'evv8' in due, due)

    # 3 complaint -> MMAC
    pg.evaluate("()=>{ showPage('quarterly'); openComplaintModal(); }"); pg.wait_for_timeout(200)
    ck('fraud box hidden for a blank category', not pg.is_visible('#cmp_fraudBox'))
    pg.select_option('#cmp_category', 'falsification'); pg.wait_for_timeout(100)
    ck('Falsification shows the 2-business-day MMAC box', pg.is_visible('#cmp_fraudBox') and '573-751-3285' in pg.inner_text('#cmp_fraudBox'))
    pg.screenshot(path=os.path.join(OUT, 'rf01-complaint-desktop.png'))
    pg.select_option('#cmp_consumer', 'c1'); pg.select_option('#cmp_reporter', 'attendant'); pg.fill('#cmp_description', 'Clock-out times look made up (practice).')
    pg.evaluate("()=>saveComplaint()"); pg.wait_for_timeout(200)
    s1 = pg.evaluate("()=>{const st=CDSRules.dailyRoutine({consumers:getData('consumers'),pipeline:[],complaints:getData('complaints')}, new Date()).find(s=>s.n===1); return st.items.filter(i=>/MMAC/.test(i.t)).map(i=>({t:i.t, p:i.people.map(p=>p.act+':'+p.name)}))}")
    ck('saved complaint is on Today step 1 with a Reported button', s1 and s1[0]['p'] == ['mmac:Ann Example'], s1)
    pg.evaluate("()=>{ showPage('dashboard'); renderDailyRoutine(); }"); pg.wait_for_timeout(300)
    btn = pg.locator('button.td-btn:has-text("Reported")')
    ck('Today shows the Reported button', btn.count() >= 1, pg.inner_text('body')[:800])
    if btn.count():
        btn.first.click(); pg.wait_for_timeout(200)
    c0 = pg.evaluate("()=>getData('complaints')[0]")
    ck('Reported saves the date and who', c0.get('mmacReported') == today.isoformat() and c0.get('mmacBy'), c0)
    pg.evaluate("()=>openComplaintModal(getData('complaints')[0].id)"); pg.wait_for_timeout(100)
    ck('editing shows the saved MMAC date', pg.input_value('#cmp_mmac') == today.isoformat())
    pg.evaluate("()=>closeModal('complaintModal')")

    # 4 bulk calls
    pg.evaluate("()=>openProfile('c1')"); pg.wait_for_timeout(300)
    body = pg.inner_text('body')
    ck('profile flags the bulk months', '2 months were entered in bulk with no call notes' in body, body[:1500])
    pg.screenshot(path=os.path.join(OUT, 'rf02-profile-desktop.png'), full_page=False)
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT, 'rf03-profile-phone.png'), full_page=False)
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)} passed, {len(res) - sum(res)} failed')
if not all(res): raise SystemExit(1)
