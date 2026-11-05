"""The first call (Samantha 2026-11-04: "build the first-call screen redesign in the same branch"). The real hub page, served from
THIS checkout, offline (Supabase is blocked), MADE-UP people only, the server answered by a stand-in. Her 12 cases, no duplicates,
and the old Log a call still working. Saves desktop and phone screenshots to $OUT. python3 tests/starting_call_look.py. Nothing is sent."""
import os, re, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
OLD = [{'id': 'L9', 'name': 'Ruth Sample', 'type': 'lead', 'status': 'nurturing', 'county': 'Greene', 'phone': '4175550109', 'firstContact': day(-20),
        'notes': [{'date': day(-20), 'text': 'Asked about CDS for herself.'}], 'whoCalled': 'self'}]
SETUP = r"""
async([OLD, on])=>{
  _store.pipeline = JSON.parse(JSON.stringify(OLD)); _store.consumers = []; _store.attendants = []; _leadCalls = [];
  _store.starting = on ? { live: true, by: 'samantha' } : {};
  _store.officeStaff = [{ id: 's1', name: 'Krystal Demo' }, { id: 's2', name: 'Zach Demo' }];
  _store.authorizations = {}; _store.firstShifts = {}; _store.meRules = {}; _store.medicaidMessages = {};
  document.getElementById('header_user').textContent = 'samantha@caringcds.com';
  window.CALLS = []; window.POOL = [];
  cdsMatchApi = async (a, b) => {
    CALLS.push([a, JSON.parse(JSON.stringify(b || {}))]);
    if (a === 'medicaidSend' || a === 'callFollowupSend') return { message: { id: 'm' + CALLS.length, channel: b.channel, to: '(***) ***-' + String(b.to).slice(-4), status: 'sent', at: new Date().toISOString(), by: 'samantha' } };
    if (a === 'medicaidSends') return { messages: [] };
    if (a === 'enrollProfile') return { packet: null };
    if (a === 'enrollGet') return { packet: null, status: { label: 'Not sent' }, forms: [], messages: [] };
    return {};
  };
  window.syncOneToGhl = async () => {};   // offline: GoHighLevel tagging is not part of this test
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
def shot(pg, name, sel='#stCallModal .modal'):
    pg.locator(sel).first.screenshot(path=os.path.join(OUT, name + '.png'))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    M = '#stCallModal'
    def chipc(text): pg.locator(M + ' .st-chip').filter(has_text=re.compile('^' + re.escape(text) + '$')).first.click(); pg.wait_for_timeout(60)
    def fill(label, v):
        loc = pg.locator(M).get_by_label(label, exact=False).first; loc.fill(v); loc.dispatch_event('change'); pg.wait_for_timeout(60)
    def leads(): return pg.evaluate("()=>getData('pipeline')")
    def cons(): return pg.evaluate("()=>getData('consumers')")
    def new_call(): pg.evaluate("()=>StartCall.open()"); pg.wait_for_timeout(150)

    # ---- switch off: today's Add someone and Log a call
    pg.evaluate(SETUP, [OLD, False])
    pg.evaluate("()=>{showPage('pipeline');}"); pg.locator('.ld-add').first.click(); pg.wait_for_timeout(150)
    ck('switch off: Add someone opens the usual chooser', pg.evaluate("()=>document.getElementById('addSomeoneModal').classList.contains('open') && !document.getElementById('stCallModal').classList.contains('open')"))
    pg.evaluate("()=>{closeModal('addSomeoneModal'); ldLogCall('L9');}"); pg.wait_for_timeout(150)
    ck('switch off: Log a call opens the usual Log a call', pg.evaluate("()=>document.getElementById('editPipelineModal').classList.contains('open')"))
    pg.fill('#ep_notes', 'Old Log a call still works.'); pg.evaluate("()=>savePipelineUpdate()")
    ck('old Log a call saves its note', leads()[0]['notes'][-1]['text'] == 'Old Log a call still works.')

    pg.evaluate(SETUP, [OLD, True])
    # ---- 1. Consumer calling for themself, Medicaid active, new to CDS, ready: start the profile
    new_call()
    ck('the call screen opens from Add someone', pg.evaluate("()=>document.getElementById('stCallModal').classList.contains('open')"))
    chipc('Consumer, for themself')
    ck('prompt changes with who is calling', 'what kind of help do you need' in pg.inner_text(M))
    fill('First name', 'Opal'); fill('Last name', 'Test'); fill('Their phone', '4175550111')
    chipc('Yes'); chipc('No, new to CDS'); chipc('Bathing'); chipc('Meals')
    pg.locator(M + ' .st-q', has_text='attendant').locator('.st-chip', has_text='No, needs us to find someone').click()
    pg.locator(M + ' .st-q', has_text='go ahead').locator('.st-chip').filter(has_text=re.compile('^Yes$')).click(); pg.wait_for_timeout(80)
    shot(pg, 'c01-call-self-desktop')
    pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    side = pg.inner_text('#stCallSide')
    ck('Finish: summary, missing, one next step, owner, date, message', all(x in side for x in ['Call saved', 'Opal Test called for themself', 'Has Medicaid', 'Next step: Start Opal', 'Who:', 'Follow up:', 'Message to Opal']), side)
    shot(pg, 'c02-finish-self-desktop')
    pg.locator(M + ' button', has_text='Yes, start their profile').click(); pg.wait_for_timeout(400)
    L = [x for x in leads() if x['name'] == 'Opal Test']; C = [x for x in cons() if x['name'] == 'Opal Test']
    ck('one lead, one Starting consumer, linked', len(L) == 1 and len(C) == 1 and C[0]['status'] == 'starting' and L[0]['startingId'] == C[0]['id'] and C[0]['starting']['kind'] == 'new', [L, C])
    ck('the call note is on the lead', any(n.get('call') and 'Opal Test called for themself' in n['text'] for n in L[0]['notes']))

    # ---- 2. Daughter for a parent, no Medicaid yet, not ready: instructions, follow-up, message
    new_call(); chipc('Family, for a loved one')
    fill('First name', 'Mae'); fill('Last name', 'Example'); fill("Caller's name", 'Linda Example')
    pg.locator(M).get_by_label('Relationship').select_option('daughter'); pg.wait_for_timeout(50)
    fill("The caller's phone", '4175550177'); fill('Email (if they gave one)', 'linda@example.com')
    chipc('No'); chipc('No, new to CDS'); chipc('Dressing')
    pg.locator(M + ' .st-q', has_text='attendant').locator('.st-chip').filter(has_text=re.compile('^Yes$')).click(); pg.wait_for_timeout(50)
    fill('Their name', 'Amy Example'); fill('Their phone', '4175550199')
    pg.locator(M + ' .st-q', has_text='go ahead').locator('.st-chip').filter(has_text=re.compile('^Not yet$')).click(); pg.wait_for_timeout(80)
    shot(pg, 'c03-call-family-desktop')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(150); shot(pg, 'c03b-call-family-mobile')
    ck('phone: the call screen fits a 390px screen', pg.evaluate("()=>{const m=document.querySelector('#stCallModal .modal').getBoundingClientRect(); return m.right <= innerWidth + 1}"))
    pg.set_viewport_size({'width': 1440, 'height': 1000})
    pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    side = pg.inner_text('#stCallSide')
    ck('no Medicaid: next step is the instructions, ready from this screen', 'Next step: Send the Medicaid application instructions' in side and 'Medicaid application instructions' in side)
    p = [x for x in leads() if x['name'] == 'Mae Example'][0]
    ck('caller saved as family contact, attendant in mind saved, not ready keeps them in Leads', any(r['name'] == 'Linda Example' and r['relation'] == 'daughter' for r in p['relatedPeople']) and p['attendant']['name'] == 'Amy Example' and not p.get('startingId'), p)
    pg.select_option('#stFinOwner', 'Krystal'); pg.locator(M + ' button', has_text='Save').last.click(); pg.wait_for_timeout(100)
    p = [x for x in leads() if x['name'] == 'Mae Example'][0]
    ck('follow-up owned by Krystal, 3 days out, on the lead and the Medicaid follow-up', p['coordinator'] == 'Krystal' and p['followup'] == day(3) and p['medicaid']['followup']['owner'] == 'Krystal', p)
    pg.locator(M + ' button', has_text='Send Medicaid application instructions').click(); pg.wait_for_timeout(150)
    ck('instructions open on this screen, to Linda, with IM-1ABD box', 'Hi Linda' in pg.input_value('#stCmp_call textarea') and pg.locator('#stCmp_call .st-abd').count() == 1)
    shot(pg, 'c04-finish-family-medicaid-desktop')
    pg.locator('#stCmp_call button', has_text='Send text').click(); pg.wait_for_timeout(300)
    ck('instructions sent only after Send', pg.evaluate("()=>CALLS.filter(c=>c[0]==='medicaidSend').length") == 1)
    t = pg.input_value('#stFinBody')
    ck('after-call text drafted, no identifiers', t.startswith('Hi Linda') and "sending you the steps to apply" in t and pg.evaluate("t=>CDSStarting.identifierProblems(t,{}).length", t) == 0, t)
    pg.locator(M + ' button').filter(has_text=re.compile('^Send$')).click(); pg.wait_for_timeout(300)
    ck('after-call text sent after review', pg.evaluate("()=>CALLS.filter(c=>c[0]==='callFollowupSend').length") == 1 and 'Sent.' in pg.inner_text('#stCallSide'))
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(150); shot(pg, 'c04b-finish-family-mobile'); pg.set_viewport_size({'width': 1440, 'height': 1000})

    # ---- 3. Son for a parent, Medicaid applied and waiting
    new_call(); chipc('Family, for a loved one'); fill('First name', 'Gus'); fill('Last name', 'Sample'); fill("Caller's name", 'Tom Sample')
    pg.locator(M).get_by_label('Relationship').select_option('son'); fill("The caller's phone", '4175550133'); chipc('Applied, waiting')
    pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    ck('Medicaid pending: instructions offered, follow-up 2 weeks', pg.input_value('#stFinDate') == day(14) and 'Medicaid application instructions' in pg.inner_text('#stCallSide'))
    ck('pending saved on the lead', [x for x in leads() if x['name'] == 'Gus Sample'][0]['medicaidStatus'] == 'pending')

    # ---- 4. Attendant calling about a specific consumer: intake + attendant linked
    new_call(); chipc('An attendant, about someone')
    fill('First name', 'Hal'); fill('Last name', 'Example'); fill("Caller's name", 'Sam Helper'); fill("The caller's phone", '4175550144')
    chipc('Yes'); chipc('No, new to CDS')
    pg.locator(M + ' .st-q', has_text='go ahead').locator('.st-chip').filter(has_text=re.compile('^Yes$')).click(); pg.wait_for_timeout(80)
    pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    shot(pg, 'c05-finish-attendant-pair-desktop')
    p = [x for x in leads() if x['name'] == 'Hal Example'][0]
    ck('consumer intake started, caller linked as the attendant', p['whoCalled'] == 'pair' and p['attendant']['name'] == 'Sam Helper' and any(r['role'] == 'attendant' for r in p['relatedPeople']), p)
    pg.locator(M + ' button', has_text='Yes, start their profile').click(); pg.wait_for_timeout(400)
    c = [x for x in cons() if x['name'] == 'Hal Example'][0]
    ck('Starting profile knows the attendant', c['starting']['attendantName'] == 'Sam Helper' and 'Sam Helper' in pg.inner_text('#prof_body'))

    # ---- 5. Attendant with no one to care for: Caregiver Pool, no consumer
    pg.evaluate("()=>{ window._dbWas = _db; _db = { from: t => ({ insert: async r => { POOL.push([t, r]); return { error: null }; }, upsert: () => Promise.resolve({ error: null }) }) }; }")
    new_call(); chipc('An attendant, no one to care for yet')
    ck('attendant-only: just name and phone asked', pg.locator(M).get_by_label('Their name').count() == 1 and pg.locator(M).get_by_label('First name').count() == 0)
    fill('Their name', 'Jo Caregiver'); fill('Best phone', '4175550155')
    pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    ck('next step: the Caregiver Pool', 'Next step: Move them to the Caregiver Pool' in pg.inner_text('#stCallSide'))
    pg.locator(M + ' button', has_text='Move them to the Caregiver Pool').click(); pg.wait_for_timeout(400)
    p = [x for x in leads() if x['name'] == 'Jo Caregiver'][0]
    ck('moved with the existing Caregiver Pool step; lead closed; no consumer', p['status'] == 'closed_pool' and pg.evaluate("()=>POOL.length") == 1 and pg.evaluate("()=>POOL[0][0]") == 'attendant_pool' and not [x for x in cons() if x['name'] == 'Jo Caregiver'])
    shot(pg, 'c06-finish-attendant-pool-desktop')
    pg.evaluate("()=>{ _db = window._dbWas; }")

    # ---- 6. Transfer from another CDS agency
    new_call(); chipc('Consumer, for themself'); fill('First name', 'Vi'); fill('Last name', 'Sample'); fill('Their phone', '4175550166')
    chipc('Yes'); chipc('Yes, with another agency'); fill('Which agency', 'Other CDS Co')
    pg.locator(M + ' .st-q', has_text='go ahead').locator('.st-chip').filter(has_text=re.compile('^Yes$')).click(); pg.wait_for_timeout(80)
    pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    pg.locator(M + ' button', has_text='Yes, start their profile').click(); pg.wait_for_timeout(400)
    p = [x for x in leads() if x['name'] == 'Vi Sample'][0]; c = [x for x in cons() if x['name'] == 'Vi Sample'][0]
    ck('transfer: PCCP lead with the agency, Starting as moving from another agency', p['type'] == 'pccp' and p['leavingAgency'] == 'Other CDS Co' and c['starting']['kind'] == 'move' and 'Moving from another agency' in pg.inner_text('#prof_body'))

    # ---- 7. Returning caller with an existing lead
    n0 = len(leads())
    new_call(); pg.fill('#stFind', 'Ruth'); pg.wait_for_timeout(100)
    ck('returning caller found by name', 'Ruth Sample' in pg.inner_text('#stFindList'))
    pg.fill('#stFind', '550109'); pg.wait_for_timeout(100)
    ck('returning caller found by phone', 'Ruth Sample' in pg.inner_text('#stFindList'))
    pg.locator('#stFindList button', has_text='Ruth Sample').click(); pg.wait_for_timeout(150)
    ck('her lead fills the screen', pg.locator(M).get_by_label('First name').input_value() == 'Ruth' and 'Ruth Sample' in pg.inner_text('#stCallTitle'))
    chipc('Yes'); pg.locator(M + ' button', has_text='Finish call').click(); pg.wait_for_timeout(200)
    r = [x for x in leads() if x['name'] == 'Ruth Sample']
    ck('no new lead; the call is added to her lead', len(leads()) == n0 and len(r) == 1 and r[0]['notes'][-1].get('call') and r[0]['medicaidStatus'] == 'active')

    # ---- 8. Same person typed again without searching: asked, no duplicate
    new_call(); chipc('Family, for a loved one'); fill('First name', 'Mae'); fill('Last name', 'Example'); fill("Caller's name", 'Linda Example')
    pg.locator(M + ' button', has_text='Save').first.click(); pg.wait_for_timeout(150)
    ck('duplicate caught before saving', 'Mae Example is already on Leads' in pg.inner_text('#stCallSide') and len([x for x in leads() if x['name'] == 'Mae Example']) == 1)
    pg.locator(M + ' button', has_text="Use Mae's lead").click(); pg.wait_for_timeout(200)
    ck('used the existing lead, still one', len([x for x in leads() if x['name'] == 'Mae Example']) == 1 and pg.evaluate("()=>StartCall.state().leadId") == [x for x in leads() if x['name'] == 'Mae Example'][0]['id'])

    # ---- 9. Saving an incomplete call, then picking it up again
    pg.evaluate("()=>closeModal('stCallModal')"); new_call(); chipc('Family, for a loved one'); fill("Caller's name", 'Bea Caller')
    pg.locator(M + ' button', has_text='Save').first.click(); pg.wait_for_timeout(150)
    inc = [x for x in leads() if x['name'] == 'Caller: Bea Caller']
    ck('incomplete call saved with what was known', len(inc) == 1 and 'Saved' in pg.inner_text('#stCallMsg'))
    ck('still-missing list shown', "the consumer's name" in pg.inner_text('#stCallSide'))
    pg.evaluate("id=>{closeModal('stCallModal'); ldLogCall(id);}", inc[0]['id']); pg.wait_for_timeout(150)
    ck('Log a call on that lead reopens the call screen with Bea', pg.evaluate("()=>document.getElementById('stCallModal').classList.contains('open')") and pg.locator(M).get_by_label("Caller's name").input_value() == 'Bea Caller')
    pg.locator(M + ' a', has_text='Just a quick note instead').click(); pg.wait_for_timeout(150)
    ck('the quick Log a call is one click away', pg.evaluate("()=>document.getElementById('editPipelineModal').classList.contains('open')"))
    pg.evaluate("()=>closeModal('editPipelineModal')")

    # ---- totals: nothing doubled
    names = [x['name'] for x in leads()]
    ck('no duplicate leads', len(names) == len(set(names)), names)
    cn = [x['name'] for x in cons()]
    ck('no duplicate consumers; only the three who said yes', sorted(cn) == sorted(['Opal Test', 'Hal Example', 'Vi Sample']), cn)
    ck('every lead touched by a call has a coordinator', all(x.get('coordinator') for x in leads()), [(x['name'], x.get('coordinator')) for x in leads()])
    ck('Leads list still draws', pg.evaluate("()=>{showPage('pipeline'); renderPipeline(); return document.querySelectorAll('#ldCards .ld-row, #ldCards tr').length > 0}"))
    ck('no page errors', not errs, errs[:3])
    b.close()
print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
raise SystemExit(0 if all(res) else 1)
