"""How-to tab for the CDS coordinator (2026-11-13, her ask: the step by step in its own tab and sub tabs). The real hub
page, served from THIS checkout, offline, MADE-UP people only. python3 tests/howto_tab_look.py (needs playwright; OUT=<dir> for pictures)."""
import os, sys, threading, functools, datetime, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
SETUP = r"""
async([d])=>{
  window._saves = 0; _dbUpsert = async () => { window._saves++; };
  _store.pipeline = []; _store.attendants = [{ id: '5', name: 'Sam Helper', consumer: 'Morgan Active', fcsrDate: d.m2, edlDate: d.m1, leieDate: d.m1, status: 'active' }];
  _store.consumers = [
    { id: 'C1', name: 'Dana Started', status: 'starting', county: 'Christian', coordinator: 'Zach', cdsStartDate: d.p5, starting: { kind: 'move', at: d.m4, attendantName: 'Nora New' }, medicaid: {}, contacts: {}, facts: {} },
    { id: 'C3', name: 'Ruth Caldwell', status: 'active', county: 'Greene', cdsStartDate: d.m400, contacts: {}, facts: {} }];
  _store.starting = { live: true }; _store.attendantsTable = { live: true };
  _store.authorizations = {}; _store.firstShifts = {}; _store.meRules = {}; _store.medicaidMessages = {};
  _store.wellskyCheck = { analytics: { firstLast: { consumers: [{ name: 'Ruth Caldwell', attendant: 'Marcus Webb', last: d.m1 }, { name: 'Morgan Active', attendant: 'Sam Helper', last: d.m1 }], attendants: [{ name: 'Marcus Webb', first: d.m400 }] } } };
  document.getElementById('header_user').textContent = 'zach@caringcds.com';
  const packets = [
    { pool_id: 'P1', name: 'Marcus Webb', active: true, consumer: 'Ruth Caldwell', step1_at: d.m400 + 'T15:00:00Z', active_at: d.m395 + 'T15:00:00Z', label: 'Active', tone: 'g' },
    { pool_id: 'P2', name: 'Nora New', active: true, consumer: 'Dana Started', step1_at: d.m4 + 'T15:00:00Z', active_at: d.m1 + 'T15:00:00Z', label: 'Active', tone: 'g' }];
  const G = id => ({ pool: { first: id === 'P1' ? 'Marcus' : 'Nora', last: id === 'P1' ? 'Webb' : 'New', phone: '4175550151', email: '' }, packet: { updated_at: d.m1 }, forms: {}, answers: {},
    screening: { screened: true, result_at: (id === 'P1' ? d.m398 : d.m3) + 'T16:00:00Z', checks: [{ key: 'edl', clear: true, at: (id === 'P1' ? d.m398 : d.m3) + 'T16:00:00Z' }, { key: 'oig', clear: true, at: (id === 'P1' ? d.m398 : d.m3) + 'T16:00:00Z' }] }, status: { steps: [], active: true, label: 'Active' } });
  window._gets = 0;
  cdsMatchApi = async (a, b) => a === 'packetList' ? { attendants: packets } : a === 'packetGet' ? (window._gets++, G(b.pool_id)) : a === 'tasks' ? { tasks: [] } : a === 'rosterProofList' ? { items: [] } : a === 'enrollGet' ? { packet: null, status: { label: 'Not sent' } } : {};
  window.syncOneToGhl = async () => {};
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  return true;
}"""
d = {k: day(v) for k, v in dict(p5=5, m1=-1, m2=-60, m3=-3, m4=-4, m395=-395, m398=-398, m400=-400).items()}
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width':1440,'height':1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP, [d])
    R=[]
    ok=lambda n,c,d='': R.append(('PASS' if c else 'FAIL')+' '+n+('' if c else ' '+str(d)[:300]))
    pg.evaluate("()=>{ try{localStorage.removeItem('cdsHowTo')}catch(e){}; showPage('dashboard'); }"); pg.wait_for_timeout(300)
    nav=pg.evaluate("()=>[...document.querySelectorAll('#sectionNav *')].filter(e=>e.children.length===0).map(e=>e.textContent.trim()).filter(Boolean)")
    ok('Today row has a How-to tab', 'How-to' in nav, nav)
    pg.evaluate("()=>showPage('howto')"); pg.wait_for_timeout(300)
    vis=lambda: pg.evaluate("()=>[...document.querySelectorAll('#page-howto .howto-sub')].filter(e=>e.offsetParent!==null).map(e=>e.dataset.ht)")
    ok('the page opens on Your day, one sub tab showing', pg.evaluate("()=>document.getElementById('page-howto').classList.contains('active')") and vis()==['day'], vis())
    ok('five sub tabs', pg.evaluate("()=>[...document.querySelectorAll('#howtoTabs .howto-tab')].map(b=>b.textContent).join('|')")=='Your day|New consumer|New attendant|Active consumers|Ending services')
    want={'day':'EVERY MORNING','consumer':'First call, the same day','attendant':'CDS Attendant Onboarding','active':'Hospital or rehab stay','ending':'Our 21-day notice'}
    for k,w in want.items():
        pg.click('#howtoTabs [data-ht="%s"]'%k); pg.wait_for_timeout(150)
        t=pg.inner_text('#page-howto')
        ok('sub tab '+k+' shows its steps and only its own', vis()==[k] and w in t and pg.evaluate("k=>[...document.querySelectorAll('#howtoTabs .howto-tab')].find(b=>b.dataset.ht===k).classList.contains('btn-primary')",k), [vis(), w in t])
        pg.screenshot(path=os.path.join(OUT,'howto-'+k+'.png'), full_page=True)
    ok('no dashes or "plain language" in the How-to', not pg.evaluate("()=>/[\u2014\u2013]|plain (language|English)/i.test(document.getElementById('page-howto').textContent)"))
    pg.evaluate("()=>{ showPage('dashboard'); location.hash='#howto-attendant'; }"); pg.wait_for_timeout(400)
    ok('#howto-attendant opens that sub tab', vis()==['attendant'], vis())
    pg.evaluate("()=>{ showPage('dashboard'); showPage('howto'); }"); pg.wait_for_timeout(200)
    ok('it remembers the last sub tab', vis()==['attendant'], vis())
    pg.evaluate("()=>showPage('onboarding')"); pg.wait_for_timeout(300); t=pg.inner_text('#page-guides')
    ok('Help > Onboarding points to it and no longer repeats the steps', 'Open Today > How-to' in t and 'First call, the same day' not in t and 'Orientation Completions' in t, t[:300])
    pg.click('text=Open Today > How-to'); pg.wait_for_timeout(300)
    ok('the pointer opens the How-to', pg.evaluate("()=>document.getElementById('page-howto').classList.contains('active')"))
    ok('each card id is on the page once', pg.evaluate("()=>['guide-coordinator-rhythm','guide-new-consumer','guide-something-changed','guide-ending','guide-attendant-onboarding'].every(i=>document.querySelectorAll('#'+i).length===1 && document.getElementById(i).closest('#page-howto'))"))
    ok('no page errors', not [e for e in errs if 'supabase' not in e.lower() and 'createClient' not in e], errs[:2])
    print('\n'.join(R)); print(sum(r.startswith('PASS') for r in R), '/', len(R))
sys.exit(0 if all(r.startswith('PASS') for r in R) else 1)
