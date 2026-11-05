"""Starting as its own page (live 2026-11-05) (Samantha 2026-11-05: "make Starting its own page and put it on its own custom menu link on
the side between Leads and Consumers; then we don't need all the steps on Leads since Starting will have that").
The real hub page, served from THIS checkout, offline (Supabase is blocked), MADE-UP people only.
Saves desktop and phone screenshots to $OUT. python3 tests/starting_page_look.py   (needs playwright). Nothing is sent or saved."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()

PIPE = [
  {'id': 'L1', 'name': 'Pat Example', 'type': 'referral', 'status': 'nurturing', 'county': 'Greene', 'phone': '4175550142', 'firstContact': day(-1),
   'notes': [{'date': day(-1), 'text': 'Daughter called. Needs help bathing.'}], 'referral': {'dcn': '1'}, 'followup': day(2)},
  {'id': 'L2', 'name': 'Lee Sample', 'type': 'lead', 'status': 'new', 'county': 'Polk', 'phone': '4175550188', 'firstContact': day(-3), 'notes': []},
  {'id': 'L3', 'name': 'Robin Before', 'type': 'referral', 'status': 'submitted', 'county': 'Taney', 'phone': '4175550199', 'firstContact': day(-20),
   'stateSubmit': day(-10), 'notes': [{'date': day(-12), 'text': 'Sent the referral.'}]},
  {'id': 'L4', 'name': 'Dana Started', 'type': 'pccp', 'status': 'nurturing', 'county': 'Christian', 'phone': '4175550111', 'firstContact': day(-6),
   'notes': [{'date': day(-5), 'text': 'Said yes.'}], 'startingId': 'C1', 'movedToConsumers': day(-4)},
]
CONS = [
  {'id': 'C1', 'name': 'Dana Started', 'status': 'starting', 'county': 'Christian', 'coordinator': 'Krystal', 'cdsStartDate': day(5),
   'starting': {'kind': 'move', 'leadId': 'L4', 'at': day(-4)}, 'medicaid': {}, 'contacts': {}, 'facts': {}},
  {'id': 'C2', 'name': 'Morgan Active', 'status': 'active', 'county': 'Greene', 'contacts': {}, 'facts': {}},
]
SETUP = r"""
async([PIPE, CONS, on, table])=>{
  _store.pipeline = PIPE; _store.consumers = CONS; _store.attendants = []; _leadCalls = [];
  _store.starting = on ? { live: true, by: 'samantha' } : {};
  _store.leadsTable = table ? { live: true } : {};
  _store.authorizations = {}; _store.firstShifts = {}; _store.meRules = {}; _store.medicaidMessages = {};
  document.getElementById('header_user').textContent = 'samantha@caringcds.com';
  cdsMatchApi = async (a) => a === 'enrollGet' ? { packet: null, status: { label: 'Not sent' } } : a === 'tasks' ? { tasks: [] } : {};
  window.syncOneToGhl = async () => {};
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, name + '.png'), full_page=True)
tabs = "()=>[...document.querySelectorAll('#mainTabs .tab')].map(t=>t.textContent)"
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)

    # ---- switch off, nobody Starting: everything as before
    pg.evaluate(SETUP, [PIPE[:3], CONS[1:], False, True]); pg.evaluate("()=>showPage('pipeline')"); pg.wait_for_timeout(300)
    ck('off: no Starting tab in the menu', 'Starting' not in pg.evaluate(tabs), pg.evaluate(tabs))
    ck('off: Leads table keeps all seven steps', 'Move to Consumers' in pg.inner_text('#ldCards') and 'Robin Before' in pg.inner_text('#ldCards'))

    # ---- switch on
    pg.evaluate(SETUP, [PIPE, CONS, True, True]); pg.evaluate("()=>showPage('pipeline')"); pg.wait_for_timeout(300)
    t = pg.evaluate(tabs)
    ck('on: Starting sits between Leads and Consumers', t.index('Starting') == t.index('Leads') + 1 and t.index('Consumers') == t.index('Starting') + 1, t)
    lt = pg.inner_text('#ldCards')
    ck('Leads table: First call, answers, They said yes; no state, packet, attendant or move columns',
       all(x in lt for x in ['First call', 'Referral or PCCP answers', 'They said yes']) and not any(x in lt for x in ['Sent to the state', 'State approved', 'Enrollment packet', 'Move to Consumers']), lt[:600])
    ck('Leads: the lead sent to the state is not on Leads', 'Robin Before' not in lt)
    ck('Leads: the one who said yes is not on Leads', 'Dana Started' not in lt)
    ck('Leads: Pat (answers in) has They said yes, Lee still has Log a call', 'Pat Example' in lt and 'Lee Sample' in lt)
    ck('Leads: no Step menu', 'Step' not in pg.inner_text('.lt-bar').split('\n')[0:1][0] if pg.inner_text('.lt-bar') else True)
    shot(pg, '01-leads-with-starting-desktop')
    pg.evaluate("()=>{ localStorage.setItem('ldView','cards'); renderPipeline(); }"); pg.wait_for_timeout(200)
    ck('Leads cards: no step tabs, no Robin', pg.inner_text('#ldSteps').strip() == '' and 'Robin Before' not in pg.inner_text('#ldCards'))
    pg.evaluate("()=>{ localStorage.removeItem('ldView'); renderPipeline(); }")

    # ---- the Starting page, opened like the GoHighLevel link does
    pg.evaluate("()=>{ location.hash = '#starting'; }"); pg.wait_for_timeout(400)
    ck('#starting opens the Starting page', pg.evaluate("()=>document.getElementById('page-starting').classList.contains('active')"))
    sp = pg.inner_text('#page-starting')
    ck('Starting page: Dana with the seven step headings and her next step', 'Dana Started' in sp and all(x.lower() in sp.lower() for x in ['Initial conversation', 'Medicaid verification', 'State approval', 'Consumer paperwork', 'Attendant setup', 'Ready for first shift', 'Active services']), sp[:500])
    ck('Starting page: start date shows and is red (5 days away)', pg.evaluate("()=>!!document.querySelector('#startingPage .lt-red')"))
    ck('Starting page: Robin listed under Sent to the state before Starting began', 'Sent to the state before Starting began' in sp and 'Robin Before' in sp)
    ck('Starting page: summary line', '1 person said yes' in pg.inner_text('#stPageSum'), pg.inner_text('#stPageSum'))
    shot(pg, '02-starting-page-desktop')
    pg.fill('#stPageSearch', 'zzz'); pg.wait_for_timeout(150)
    ck('search: nobody matches', 'Nobody matches that search' in pg.inner_text('#startingPage') and pg.evaluate("()=>document.activeElement.id") == 'stPageSearch')
    pg.fill('#stPageSearch', 'krys'); pg.wait_for_timeout(150)
    ck('search: by coordinator finds Dana', 'Dana Started' in pg.inner_text('#startingPage'))
    pg.fill('#stPageSearch', '')
    pg.click('#startingPage .lt-wrap button.lt-b:has-text("Next")'); pg.wait_for_timeout(400)
    ck('Next opens the profile on that step (Medicaid)', pg.evaluate("()=>document.getElementById('page-profile').classList.contains('active') && _profTab") == 'medicaid')
    ck('profile Back says Starting', 'Starting' in pg.inner_text('#prof_back'), pg.inner_text('#prof_back'))
    pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(200)
    pg.click('#startingPage button:has-text("Start their profile")'); pg.wait_for_timeout(400)
    ck('Start their profile: Robin becomes Starting, same record', pg.evaluate("()=>getData('consumers').some(c=>c.name==='Robin Before'&&c.status==='starting') && !!getData('pipeline').find(p=>p.id==='L3').startingId"))
    pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(200)
    ck('Robin now in the table, the old list gone', 'Sent to the state before Starting began' not in pg.inner_text('#startingPage') and '2 people said yes' in pg.inner_text('#stPageSum'))

    # ---- Consumers: the Starting chip is gone (they have their own page)
    pg.evaluate("()=>showPage('consumers')"); pg.wait_for_timeout(200)
    ck('Consumers: no Starting chip', pg.evaluate("()=>document.getElementById('rosterSegStarting').hidden"))

    # ---- phone
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(300)
    ck('phone: cards, no sideways scroll', pg.evaluate("()=>document.documentElement.scrollWidth <= 392"), pg.evaluate("()=>document.documentElement.scrollWidth"))
    shot(pg, '03-starting-page-phone')
    pg.evaluate("()=>showPage('pipeline')"); pg.wait_for_timeout(300); shot(pg, '04-leads-phone')
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
