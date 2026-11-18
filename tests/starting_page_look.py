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
  (0,eval)("_db = (() => { const chain = new Proxy(function(){}, { get: (t, k) => k === 'then' ? (ok) => ok({ data: [], error: null }) : () => chain, apply: () => chain }); return { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) }, from: () => chain, storage: { from: () => chain }, functions: { invoke: async () => ({ data: {}, error: null }) }, channel: () => chain }; })()");
  window.__coordAsked = [];
  const realFetch = window.__realFetch || window.fetch; window.__realFetch = realFetch;
  window.fetch = async (u, o) => { if (String(u).includes('cds-coordinator')) { const b = JSON.parse(o.body); window.__coordAsked.push(b);
      return new Response(JSON.stringify(b.action === 'list' ? { items: window.__coordItems || [], state: { last_run: new Date().toISOString() } } : b.action === 'msgs' ? { msgs: window.__coordMsgs || [] } : b.action === 'chats' ? { chats: window.__coordChats || [] } : { ok: true }), { status: 200 }); }
    return realFetch(u, o); };
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
    ck('off: Leads table keeps all seven steps', 'move to consumers' in pg.inner_text('#ldCards').lower() and 'Robin Before' in pg.inner_text('#ldCards'))

    # ---- switch on
    pg.evaluate(SETUP, [PIPE, CONS, True, True]); pg.evaluate("()=>showPage('pipeline')"); pg.wait_for_timeout(300)
    t = pg.evaluate(tabs)
    ck('on: Starting sits between Leads and Consumers', t.index('Starting') == t.index('Leads') + 1 and t.index('Consumers') == t.index('Starting') + 1, t)
    lt = pg.inner_text('#ldCards')
    ck('Leads table: First call, answers, They said yes; no state, packet, attendant or move columns',
       all(x.lower() in lt.lower() for x in ['First call', 'Referral or PCCP answers', 'They said yes']) and not any(x.lower() in lt.lower() for x in ['Sent to the state', 'State approved', 'Enrollment packet', 'Move to Consumers']), lt[:600])
    ck('Leads: the lead sent to the state is not on Leads', 'Robin Before' not in lt)
    ck('Leads: the one who said yes is not on Leads', 'Dana Started' not in lt)
    ck('Leads: Pat (answers in) has They said yes, Lee still has Log a call', 'Pat Example' in lt and 'Lee Sample' in lt)
    ck('Leads: no Step menu (2026-11-05: no menus at all, the reason tabs instead)', pg.evaluate("()=>!document.querySelector('.lt-bar') && document.querySelector('#ldSteps .ld-tab').textContent.startsWith('Active Leads')"))
    shot(pg, '01-leads-with-starting-desktop')
    pg.evaluate("()=>{ localStorage.setItem('ldView','cards'); renderPipeline(); }"); pg.wait_for_timeout(200)
    ck('Leads cards: no step tabs, no Robin', pg.inner_text('#ldSteps').strip() == '' and 'Robin Before' not in pg.inner_text('#ldCards'))
    pg.evaluate("()=>{ localStorage.removeItem('ldView'); renderPipeline(); }")

    # ---- the Starting page, opened like the GoHighLevel link does
    pg.evaluate("()=>{ location.hash = '#starting'; }"); pg.wait_for_timeout(400)
    ck('#starting opens the Starting page', pg.evaluate("()=>document.getElementById('page-starting').classList.contains('active')"))
    sp = pg.inner_text('#page-starting')
    ck('Starting page: Dana with the start tracker headings (2026-11-17)', 'Dana Started' in sp and all(x.lower() in sp.lower() for x in ['Medicaid', 'Referral', 'Packet', 'Tax set up', 'Attendant checks', 'Empeon and I-9', 'Clock-in call', 'Start date', 'We promised', 'Next step']), sp[:500])
    ck('tracker: due dates count back from the start date', 'by ' in pg.inner_text('#startingPage .lt-wrap') and 'In 5 days' in sp, sp[:800])
    ck('Starting page: start date shows and is red (5 days away)', pg.evaluate("()=>!!document.querySelector('#startingPage .lt-red')"))
    ck('Starting page: Robin listed under Sent to the state before Starting began', 'Sent to the state before Starting began' in sp and 'Robin Before' in sp)
    ck('Starting page: summary line', '1 person said yes' in pg.inner_text('#stPageSum'), pg.inner_text('#stPageSum'))
    shot(pg, '02-starting-page-desktop')
    pg.fill('#stPageSearch', 'zzz'); pg.wait_for_timeout(150)
    ck('search: nobody matches', 'Nobody matches that search' in pg.inner_text('#startingPage') and pg.evaluate("()=>document.activeElement.id") == 'stPageSearch')
    pg.fill('#stPageSearch', 'krys'); pg.wait_for_timeout(150)
    ck('search: by coordinator finds Dana', 'Dana Started' in pg.inner_text('#startingPage'))
    pg.fill('#stPageSearch', '')
    pg.click('#startingPage .lt-wrap tr:has-text("Dana Started") td.lt-hi button.lt-b >> nth=0'); pg.wait_for_timeout(400)
    ck('Next opens the profile on that step (Medicaid)', pg.evaluate("()=>document.getElementById('page-profile').classList.contains('active') && _profTab") == 'medicaid')
    ck('profile Back says Starting', 'Starting' in pg.inner_text('#prof_back'), pg.inner_text('#prof_back'))
    # ---- 2026-11-17 the tracker on the profile: steps, What we promised, the clock-in call
    pg.evaluate("()=>{ _profTab='overview'; renderProfile(); }"); pg.wait_for_timeout(300)
    pv = pg.inner_text('#page-profile')
    ck('profile: Start tracker and What we promised', 'Start tracker' in pv and 'What we promised' in pv and 'Teach both to clock in' in pv, pv[:900])
    pg.fill('#stPrWhat', 'Text the daughter her application'); pg.fill('#stPrDue', day(-2))
    pg.click('#page-profile button:has-text("Add")'); pg.wait_for_timeout(300)
    ck('promise added, late, red', pg.evaluate("()=>getData('consumers').find(c=>c.id==='C1').starting.promises.length") == 1 and 'late, was due' in pg.inner_text('#page-profile'))
    shot(pg, '02c-profile-tracker')
    pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(300)
    ck('Starting row: late promise is the next step', 'We promised: Text the daughter' in pg.inner_text("#startingPage .lt-wrap tr:has-text('Dana Started')") and '1 open, 1 late' in pg.inner_text('#startingPage .lt-wrap'))
    pg.evaluate("()=>{ openProfile('C1'); _profTab='overview'; renderProfile(); }"); pg.wait_for_timeout(300)
    pg.click('#page-profile input[aria-label="Done"]'); pg.wait_for_timeout(300)
    ck('promise checked off', pg.evaluate("()=>!!getData('consumers').find(c=>c.id==='C1').starting.promises[0].done"))
    pg.evaluate("()=>{ _profTab='ready'; renderProfile(); }"); pg.wait_for_timeout(300)
    pg.fill('#stClockQs', 'Which app do I download?'); pg.click('#page-profile button:has-text("Clock-in call done")'); pg.wait_for_timeout(300)
    # ---- 2026-11-17 the CDS Coordinator: what it heard on calls
    pg.evaluate("""()=>{ window.__coordItems = [
      { id: 7, person_kind: 'consumer', person_id: 'C1', person_name: 'Dana Started', kind: 'promise', data: { what: 'Send Dana the clock-in steps' }, due: '2026-11-01', status: 'open', source: { line: 'cc', kind: 'call', at: '2026-10-30T15:00:00Z' } },
      { id: 8, person_kind: 'consumer', person_id: 'C1', person_name: 'Dana Started', kind: 'attendant', data: { name: 'Lee Sample', phone: '4175550160', email: 'lee@example.com', relation: 'son' }, status: 'suggested', source: { line: 'cc', kind: 'call', at: '2026-10-19T15:00:00Z', summary: 'Dana named her son.' } },
      { id: 9, person_kind: 'consumer', person_id: 'C1', person_name: 'Dana Started', kind: 'start_date', data: { date: '2026-12-01', saidBy: 'consumer', note: 'moving first' }, status: 'suggested', source: { line: 'cds', kind: 'call', at: '2026-11-16T15:00:00Z' } }];
      StartHub.coordRefresh(); }""")
    pg.wait_for_timeout(600); pg.evaluate("()=>{ showPage('starting'); }"); pg.wait_for_timeout(400)
    ck('Starting row: Heard on a call badge', 'Heard on a call: 2 to check' in pg.inner_text("#startingPage .lt-wrap tr:has-text('Dana Started')"), pg.inner_text("#startingPage .lt-wrap tr:has-text('Dana Started')"))
    pg.evaluate("()=>{ openProfile('C1'); _profTab='overview'; renderProfile(); }"); pg.wait_for_timeout(300)
    pv = pg.inner_text('#page-profile')
    ck('profile: Heard on calls and texts with the attendant and the start date', 'Heard on calls and texts' in pv and 'Lee Sample' in pv and 'Use Dec 1' in pv and 'Caring Companions line' in pv, pv[:1200])
    ck('profile: the promise it heard is on What we promised, late', 'Send Dana the clock-in steps' in pv and 'from the call' in pv)
    shot(pg, '02d-profile-heard')
    pg.click('#page-profile button:has-text("Use Dec 1")'); pg.wait_for_timeout(400)
    ck('Use the date: start date saved and the item answered', pg.evaluate("()=>getData('consumers').find(c=>c.id==='C1').cdsStartDate") == '2026-12-01' and pg.evaluate("()=>window.__coordAsked.some(b=>b.action==='decide'&&b.id===9&&b.answer==='used')"))
    pg.click('#page-profile button:has-text("Add them and text the application")'); pg.wait_for_timeout(300)
    ck('Add them: the Add attendant box opens filled in', pg.evaluate("()=>[document.getElementById('aa_name').value, document.getElementById('aa_email').value]") == ['Lee Sample', 'lee@example.com'] and pg.evaluate("()=>document.getElementById('aa_for').value") == 'c:C1')
    pg.evaluate("()=>closeModal('addAttModal')")
    pg.evaluate("()=>{ _profTab='overview'; renderProfile(); }"); pg.wait_for_timeout(200)
    pg.click('#page-profile input[aria-label="Done"] >> nth=0'); pg.wait_for_timeout(300)
    ck('checking off a heard promise answers it on the server', pg.evaluate("()=>window.__coordAsked.some(b=>b.action==='decide'&&b.id===7&&b.answer==='done')"), pg.evaluate("()=>window.__coordAsked"))
    # ---- part 2: texts it wrote, and the lead box
    pg.evaluate("""()=>{ window.__coordMsgs = [{ id: 31, kind: 'clock', person_kind: 'consumer', person_id: 'C1', person_name: 'Dana Started', to_name: 'Dana Started', last4: '0111', status: 'draft',
        body: 'Hi Dana, this is Krystal at Caring Companions. Your CDS care starts soon! Any questions? Just reply here or call (417) 218-2888.' },
      { id: 32, kind: 'check', person_kind: 'lead', person_id: 'L2', person_name: 'Lee Sample', to_name: 'Lee', last4: '0188', status: 'draft', body: 'Hi Lee, just checking in. Just reply here or call (417) 218-2888.' }];
      window.__coordChats = [{ id: 4, lead_id: 'L2', name: 'Lee Sample', status: 'ready', answers: { consumer_first: 'Linda', consumer_last: 'Sample', consumer_dob: '1948-03-02', relation: 'daughter', consumer_phone: '4175550177', county: 'Greene', medicaid: 'yes', help: 'bathing, dressing', attendant: 'Lee Sample' }, last4: '0188' }];
      window.__coordItems.push({ id: 12, person_kind: 'lead', person_id: 'L2', person_name: 'Lee Sample', kind: 'their_word', data: { what: 'Text us the DCN' }, due: '2026-11-17', status: 'open', source: { line: 'cds', kind: 'call', at: '2026-11-10T15:00:00Z' } });
      StartHub.coordRefresh(); }""")
    pg.wait_for_timeout(600); pg.evaluate("()=>{ _profTab='overview'; renderProfile(); }"); pg.wait_for_timeout(300)
    pv = pg.inner_text('#page-profile')
    ck('profile: Texts it wrote, with the words, Send and Skip', 'Texts it wrote' in pv and 'Clock-in help before the start date' in pv and 'phone ending 0111' in pv, pv[:1500])
    pg.fill('#stMsg31', 'Hi Dana, changed words. Just reply here or call (417) 218-2888.'); pg.click('#page-profile button:has-text("Send") >> nth=0'); pg.wait_for_timeout(400)
    ck('Send sends the words as changed', pg.evaluate("()=>window.__coordAsked.some(b=>b.action==='send'&&b.id===31&&/changed words/.test(b.body))"), pg.evaluate("()=>window.__coordAsked.slice(-3)"))
    shot(pg, '02e-profile-texts')
    pg.evaluate("()=>openLeadProfile('L2')"); pg.wait_for_timeout(500)
    lpv = pg.inner_text('#page-leadprofile')
    ck('lead profile: Heard on calls and texts with their word and the check-in draft', 'Heard on calls and texts' in lpv and 'Text us the DCN' in lpv and 'Checking in on what they said' in lpv, lpv[:1200])
    ck('lead profile: texting with them, ready to call the consumer, the answers', 'Ready: call the consumer' in lpv and 'Date of birth (check Medicaid)' in lpv and 'Linda Sample' in lpv and 'Put these answers on the lead' in lpv, lpv[:1500])
    shot(pg, '02f-lead-heard')
    pg.click('#lpHeard button:has-text("Put these answers on the lead")'); pg.wait_for_timeout(400)
    ck('Put these answers: a note on the lead, follow-up today, the date of birth, the caregiver', pg.evaluate("()=>{ const p=getData('pipeline').find(x=>x.id==='L2'); return /From texting with them/.test(JSON.stringify(p.notes)) && p.followup===_todayIso() && p.dob==='1948-03-02' && p.attendant && p.attendant.name==='Lee Sample'; }"))
    pg.click('#lpHeard button:has-text("Skip")'); pg.wait_for_timeout(400)
    ck('Skip on the lead answers it', pg.evaluate("()=>window.__coordAsked.some(b=>b.action==='skip'&&b.id===32)"))
    # ---- 2026-11-17 tax help: copy-and-paste sheets on the Tax and EIN tab
    pg.evaluate("""()=>{ const prev = cdsMatchApi; cdsMatchApi = async (a, b) => a === 'enrollPdfData' ? { ssn: '123456789', answers: { first: 'Dana', last: 'Started', street: '1 Main St', city: 'Nixa', zip: '65714', county: 'Christian', first_pay: '2026-11-26' }, agency: { street: '100 Office Way', city: 'Springfield', state: 'MO', zip: '65804', signer: 'Office Signer', legal: 'Example Agency LLC', dba: 'Example Agency', phone: '417-555-0100', fax: '417-555-0101' } } : prev(a, b);
      const c = getData('consumers').find(x=>x.id==='C1'); c.starting.leadId = 'L4'; openProfile('C1'); _profTab='tax'; renderProfile(); }"""); pg.wait_for_timeout(300)
    pg.click('#thHelp button:has-text("Open the copy-and-paste sheets")'); pg.wait_for_timeout(400)
    tv = pg.inner_text('#thHelp')
    ck('tax tab: the four copy-and-paste sheets, SSN hidden', all(x in tv for x in ['IRS EIN application', 'Missouri tax registration', 'UInteract', 'Empeon']) and '***-**-6789' not in tv, tv[:400])
    pg.evaluate("()=>document.querySelectorAll('#thHelp details').forEach(d=>d.open=true)"); pg.wait_for_timeout(200)
    ck('tax tab: answers from the packet with Copy buttons, SSN masked', 'Christian County, MO' in pg.inner_text('#thHelp') and '***-**-6789' in pg.inner_text('#thHelp') and pg.evaluate("()=>document.querySelectorAll('#thHelp [data-copy]').length") > 10)
    shot(pg, '02g-tax-sheets')
    pg.evaluate("()=>{ openProfile('C1'); _profTab='ready'; renderProfile(); }"); pg.wait_for_timeout(300)
    ck('clock-in call recorded with the question', pg.evaluate("()=>getData('consumers').find(c=>c.id==='C1').starting.clockCall.questions") == 'Which app do I download?' and 'Done' in pg.inner_text('#page-profile'))
    pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(200)
    pg.click('#startingPage button:has-text("Start their profile")'); pg.wait_for_timeout(400)
    ck('Start their profile: Robin becomes Starting, same record', pg.evaluate("()=>getData('consumers').some(c=>c.name==='Robin Before'&&c.status==='starting') && !!getData('pipeline').find(p=>p.id==='L3').startingId"))
    pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(200)
    ck('Robin now in the table, the old list gone', 'Sent to the state before Starting began' not in pg.inner_text('#startingPage') and '2 people said yes' in pg.inner_text('#stPageSum'))

    # ---- 2026-11-14 her ask: "make this easy to click and add the start date that we gave to the state"
    row = "#startingPage .lt-wrap tr:has-text('Robin Before')"
    ck('start date: Robin (no date yet) has an Add date button', pg.inner_text(row + ' .st-date-b') == 'Add date')
    pg.click(row + ' .st-date-b'); pg.wait_for_timeout(200)
    ck('start date: pressing it opens a date box in the row, ready to type', pg.evaluate("()=>document.activeElement.classList.contains('st-date-in')"))
    pg.evaluate("()=>StartHub.pageStart(getData('consumers').find(c=>c.name==='Robin Before').id,'0202-03-04')")
    ck('start date: a half-typed year saves nothing', pg.evaluate("()=>!getData('consumers').find(c=>c.name==='Robin Before').cdsStartDate"))
    pg.fill(row + ' .st-date-in', day(30)); pg.wait_for_timeout(300)
    ck('start date: picking a day saves it on the consumer', pg.evaluate("()=>getData('consumers').find(c=>c.name==='Robin Before').cdsStartDate") == day(30))
    ck('start date: the row now shows the date as a button, box closed', pg.evaluate("()=>!document.querySelector('#startingPage .st-date-in')") and pg.inner_text(row + ' .st-date-b') != 'Add date', pg.inner_text(row))
    ck('start date: written in the history', 'Start date from the state set to' in pg.evaluate("()=>JSON.stringify(getData('consumers').find(c=>c.name==='Robin Before'))"))
    pg.click(row + ' .st-date-b'); pg.wait_for_timeout(200); pg.fill(row + ' .st-date-in', day(40)); pg.wait_for_timeout(300)
    ck('start date: press the date to change it', pg.evaluate("()=>getData('consumers').find(c=>c.name==='Robin Before').cdsStartDate") == day(40))
    pg.click(row + ' .st-date-b'); pg.wait_for_timeout(150); pg.keyboard.press('Escape'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)   # the first one closes the calendar
    ck('start date: Escape closes the box, nothing changed', pg.evaluate("()=>!document.querySelector('#startingPage .st-date-in') && getData('consumers').find(c=>c.name==='Robin Before').cdsStartDate") == day(40))
    shot(pg, '02b-starting-page-start-date')

    # ---- Consumers: the Starting chip is gone (they have their own page)
    pg.evaluate("()=>showPage('consumers')"); pg.wait_for_timeout(200)
    ck('Consumers: no Starting chip', pg.evaluate("()=>document.getElementById('rosterSegStarting').hidden"))

    # ---- phone
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.evaluate("()=>showPage('starting')"); pg.wait_for_timeout(300)
    ck('phone: cards, no sideways scroll', pg.evaluate("()=>document.documentElement.scrollWidth <= 392"), pg.evaluate("()=>document.documentElement.scrollWidth"))
    pg.click("#startingPage .lt-cards .lt-card:has-text('Dana Started') .st-date-b"); pg.wait_for_timeout(200)
    ck('phone: the card has the date button and it opens the date box', pg.evaluate("()=>document.activeElement.classList.contains('st-date-in')"))
    pg.fill("#startingPage .lt-cards .st-date-in", day(12)); pg.wait_for_timeout(300)
    ck('phone: saved from the card', pg.evaluate("()=>getData('consumers').find(c=>c.id==='C1').cdsStartDate") == day(12))
    shot(pg, '03-starting-page-phone')
    pg.evaluate("()=>showPage('pipeline')"); pg.wait_for_timeout(300); shot(pg, '04-leads-phone')
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
