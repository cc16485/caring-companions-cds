"""Did not start on every Starting profile (Samantha 2026-11-05: "Yes, add Did not start to every Starting profile, sending them to the
matching Leads tab"). Before that: Starting as its own page (live 2026-11-05) (Samantha 2026-11-05: "make Starting its own page and put it on its own custom menu link on
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
  {'id': 'L5', 'name': 'Sky Nomed', 'type': 'referral', 'status': 'nurturing', 'county': 'Greene', 'phone': '4175550171', 'firstContact': day(-8),
   'notes': [{'date': day(-4), 'text': 'Said yes.'}], 'startingId': 'C3', 'movedToConsumers': day(-3), 'relatedPeople': []},
  {'id': 'L6', 'name': 'Kin Caller', 'type': 'lead', 'status': 'closed_linked', 'linkedTo': {'kind': 'consumer', 'id': 'C3', 'name': 'Sky Nomed'}, 'notes': []},
]
CONS = [
  {'id': 'C1', 'name': 'Dana Started', 'status': 'starting', 'county': 'Christian', 'coordinator': 'Krystal', 'cdsStartDate': day(5),
   'starting': {'kind': 'move', 'leadId': 'L4', 'at': day(-4)}, 'medicaid': {}, 'contacts': {}, 'facts': {}},
  {'id': 'C3', 'name': 'Sky Nomed', 'status': 'starting', 'county': 'Greene', 'starting': {'kind': 'new', 'leadId': 'L5', 'at': day(-3)}, 'medicaid': {}, 'contacts': {}, 'facts': {},
   'relatedPeople': [{'id': 'r1', 'name': 'June Nomed', 'relation': 'daughter', 'phone': '4175550170'}]},
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
    pg.evaluate(SETUP, [PIPE, CONS, True, True]); pg.evaluate("()=>openProfile('C1')"); pg.wait_for_timeout(400)
    ck('every Starting profile has a Did not start button', pg.evaluate("()=>[...document.querySelectorAll('#page-profile button, .page.active button')].some(b => b.textContent === 'Did not start')"))
    pg.evaluate("()=>StartHub.dnsOpen('C1')"); pg.wait_for_timeout(200)
    t = pg.evaluate("()=>document.querySelector('.st-dns').innerText")
    ck('the box asks why, with each reason saying which Leads tab it goes to', all(x in t for x in ['did not start. Why?', 'No Medicaid', 'The state said no', 'No attendant', 'Passed away', 'Goes to State Said No', 'Goes to Needs an Attendant', 'Goes to Closed for Good']), t[:600])
    shot(pg, 'dns_box')
    ck('saving with no reason says to pick one, and changes nothing', pg.evaluate("()=>{ StartHub.dnsSave('C1'); return document.querySelector('.st-dns').innerText.includes('Pick why they did not start') && _store.consumers.find(c=>c.id==='C1').status === 'starting'; }"))
    pg.evaluate("()=>{ StartHub.dnsSet('why','closed_state_no'); StartHub.dnsSave('C1'); }"); pg.wait_for_timeout(100)
    ck('The state said no needs the why', 'Pick why the state said no' in pg.evaluate("()=>document.querySelector('.st-dns').innerText"))
    pg.evaluate("()=>{ StartHub.dnsSet('stateNo','level'); StartHub.dnsSet('note','Assessor said not enough need.'); StartHub.dnsSave('C1'); }"); pg.wait_for_timeout(300)
    r = pg.evaluate("""()=>{ const c = _store.consumers.find(x=>x.id==='C1'), p = _store.pipeline.find(x=>x.id==='L4');
      return { cs: c.status, why: c.inactiveReason, closed: !!c.starting.closedAt, ps: p.status, psw: p.stateNoWhy, note: p.notes.slice(-1)[0].text,
        page: getComputedStyle(document.getElementById('csub-pipeline')).display !== 'none' && document.getElementById('page-consumers').classList.contains('active'), tab: LDT._tab(), on: document.getElementById('ldCards').innerText.includes('Dana Started'),
        log: (c.medicaid.log||[]).slice(-1)[0].text }; }""")
    ck('Dana: profile Inactive (Did not start), lead closed as State said no, level of care, with the note', r['cs'] == 'inactive' and r['why'] == 'Did not start: The state said no' and r['closed'] and r['ps'] == 'closed_state_no' and r['psw'] == 'level'
       and 'did not meet the level of care' in r['note'] and 'Assessor said not enough need. Back from Starting.' in r['note'] and 'Did not start' in r['log'], r)
    ck('it opens Leads on the State Said No tab, with Dana there', r['page'] and r['tab'] == 'stateno' and r['on'], r)
    shot(pg, 'dns_leads_tab')
    ck('Dana is off the Starting page', pg.evaluate("()=>{ showPage('starting'); return !document.getElementById('page-starting').innerText.includes('Dana Started') && document.getElementById('page-starting').innerText.includes('Sky Nomed'); }"))
    # No Medicaid: applying + check back, Contacts and linked callers go back to the lead
    pg.evaluate("()=>{ openProfile('C3'); StartHub.dnsOpen('C3'); StartHub.dnsSet('why','closed_no_medicaid'); StartHub.dnsSave('C3'); }"); pg.wait_for_timeout(100)
    ck('No Medicaid needs applying yes or no', 'Say if they are applying' in pg.evaluate("()=>document.querySelector('.st-dns').innerText"))
    ck('the check back date starts 30 days out', pg.evaluate("()=>document.getElementById('stDnsCheck').value") == day(30))
    pg.evaluate("()=>{ StartHub.dnsSet('applying','yes'); StartHub.dnsSave('C3'); }"); pg.wait_for_timeout(300)
    r = pg.evaluate("""()=>{ const p = _store.pipeline.find(x=>x.id==='L5'), k = _store.pipeline.find(x=>x.id==='L6');
      return { ps: p.status, ap: p.medicaidApplying, ck: p.medicaidCheck, rp: (p.relatedPeople||[]).map(r=>r.name), link: k.linkedTo, tab: LDT._tab(), on: document.getElementById('ldCards').innerText.includes('Sky Nomed') }; }""")
    ck('Sky: lead on No Medicaid, applying, check back in 30 days, on the No Medicaid tab', r['ps'] == 'closed_no_medicaid' and r['ap'] is True and r['ck'] == day(30) and r['tab'] == 'med' and r['on'], r)
    ck('their Contacts and the caller linked to them go back to the lead', r['rp'] == ['June Nomed'] and r['link']['kind'] == 'lead' and r['link']['id'] == 'L5', r)
    # Reopen on Leads: a lead again, able to say yes and start over
    r = pg.evaluate("""()=>{ reopenLead('L4'); const p = _store.pipeline.find(x=>x.id==='L4'); LDT.tab('active');
      return { st: p.status, sid: 'startingId' in p, mv: 'movedToConsumers' in p, active: document.getElementById('ldCards').innerText.includes('Dana Started') }; }""")
    ck('Reopen on Leads makes Dana a lead again (no longer tied to the closed Starting profile), on Active Leads', r['st'] == 'nurturing' and not r['sid'] and not r['mv'] and r['active'], r)
    ck('a lead still Starting keeps its Starting tie when reopened from something else', pg.evaluate("""()=>{ _store.pipeline.push({ id:'L9', name:'Still Going', status:'closed_ni', startingId:'C9', notes:[] }); _store.consumers.push({ id:'C9', name:'Still Going', status:'starting', starting:{ leadId:'L9' }, medicaid:{}, contacts:{}, facts:{} });
      reopenLead('L9'); const ok = _store.pipeline.find(x=>x.id==='L9').startingId === 'C9'; _store.pipeline = _store.pipeline.filter(x=>x.id!=='L9'); _store.consumers = _store.consumers.filter(x=>x.id!=='C9'); return ok; }"""))
    ck('no em dashes in the box', pg.evaluate("()=>{ openProfile('C3'); return true; }") and '—' not in t)
    ck('no script errors', not errs, errs)
    m = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    m.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    m.goto(f'http://127.0.0.1:{PORT}/index.html'); m.wait_for_timeout(1500)
    m.evaluate(SETUP, [PIPE, CONS, True, True]); m.evaluate("()=>{ openProfile('C1'); StartHub.dnsOpen('C1'); StartHub.dnsSet('why','closed_no_medicaid'); }"); m.wait_for_timeout(300)
    ck('phone: the box fits the screen', m.evaluate("()=>document.querySelector('.st-dns').getBoundingClientRect().right <= 392 && document.documentElement.scrollWidth <= 392"))
    m.locator('.st-dns').screenshot(path=os.path.join(OUT, 'dns_phone.png'))
    b.close()
print(f'\n{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
