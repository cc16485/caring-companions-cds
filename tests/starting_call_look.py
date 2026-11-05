"""The first call (Samantha 2026-11-04: "build the first-call screen redesign in the same branch"; guided, one question at a time, 2026-11-05). The real hub page, served from
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
    def nxt(): pg.locator(M + ' .st-nav button', has_text=re.compile('^Next$')).click(); pg.wait_for_timeout(80)
    def step(): return pg.evaluate("()=>document.querySelector('#stCallModal .st-step').dataset.step")
    def to(label): pg.locator('#stBar button', has_text=label).first.click(); pg.wait_for_timeout(80)
    def say(): return ' '.join(pg.locator(M + ' .st-say').all_inner_texts())
    def finish_call(): pg.locator(M + ' #stCallSide button', has_text='Finish call').click(); pg.wait_for_timeout(200)

    # ---- 1. Consumer calling for themself, Medicaid active with a DCN, new to CDS, ready: start the profile
    new_call()
    ck('the call screen opens from Add someone, on Who is calling', pg.evaluate("()=>document.getElementById('stCallModal').classList.contains('open')") and step() == 'who')
    ck('a greeting to say, and Next waits for who is calling', 'Thank you for calling Caring Companions CDS, this is Samantha' in say() and pg.locator(M + ' .st-nav button', has_text='Next').is_disabled())
    chipc('Consumer, for themself')
    ck('prompt changes with who is calling', 'what kind of help do you need' in pg.inner_text(M))
    ck('the step bar shows the whole call', pg.inner_text('#stBar').split()[:3] == ['Who', 'CDS', 'now'] and 'Birth date' in pg.inner_text('#stBar') and 'Question 1 of 13' in pg.inner_text(M), pg.inner_text('#stBar'))
    nxt(); ck('CDS now is asked second', step() == 'cds')
    chipc('No, new to CDS'); nxt()
    ck('one question at a time: names', step() == 'names' and pg.locator(M).get_by_label('Their phone').count() == 0 and 'Can I get your first and last name?' in say())
    fill('First name', 'Opal'); fill('Last name', 'Test'); nxt()
    fill('Their phone', '4175550111'); nxt()
    ck('date of birth is asked, with why', step() == 'dob' and 'date of birth' in say() and 'eMOMED' in pg.inner_text(M))
    fill('Date of birth', '1950-06-15'); pg.wait_for_timeout(100)
    ck('age shows, with the 65 and older note', 'Age 7' in pg.inner_text('#stAge') and '65 and older' in pg.inner_text('#stAge'))
    shot(pg, 'c00-dob-desktop')
    nxt(); pg.locator(M + ' .st-step select').first.select_option('Greene'); pg.wait_for_timeout(60); nxt()
    chipc('Yes')
    ck('Medicaid yes asks for the DCN, says we can look it up, never in a text', 'DCN' in say() and 'we can look it up' in say() and 'never goes in a text or email' in pg.inner_text(M))
    fill('DCN', '12345678'); shot(pg, 'c00b-medicaid-dcn-desktop'); nxt()
    ck('help asks why first, a physical disability', step() == 'help' and 'a stroke, a heart condition, arthritis' in say())
    fill('Why they need help', 'Stroke last spring'); chipc('Bathing'); chipc('Meals'); chipc('Hands-on help')
    shot(pg, 'c00c-help-desktop'); nxt()
    ck('their decisions: boss of their care, guardian', step() == 'decide' and 'clock in and out' in say() and 'guardianship or conservatorship' in say())
    pg.locator(M + ' .st-chip').filter(has_text=re.compile('^Yes$')).first.click(); pg.wait_for_timeout(50)
    pg.locator(M + ' .st-chip').filter(has_text=re.compile('^No$')).first.click(); pg.wait_for_timeout(50); nxt()
    ck('where they live and other help', step() == 'living' and 'another agency or DMH' in say())
    chipc('Their own home'); chipc('No'); nxt()
    ck('attendant line: they choose their own', 'you choose your own attendant' in say())
    chipc('No, needs us to find someone'); nxt()
    ck('go ahead asks about the referral', 'send the referral to the state' in say())
    chipc('Yes'); shot(pg, 'c01-call-self-desktop'); nxt()
    ck('wrap up: what happens next and what to tell them', step() == 'wrap' and re.search(r"What happens next:\s*Start Opal's profile", pg.inner_text(M)) and 'Thank you for calling. We' in say() and 'Tell them before you hang up' in pg.inner_text(M))
    ck('the step bar ticks what was answered', pg.locator('#stBar button.done').count() == 12, pg.inner_text('#stBar'))
    finish_call()
    side = pg.inner_text('#stCallSide')
    ck('Finish: summary, nothing missing, one next step, owner, date, message', all(x in side for x in ['Call saved', 'Opal Test called for themself', 'Lives in Greene County' if False else 'Greene County', 'Has Medicaid, DCN given', 'Still missing: nothing', 'Next step: Start Opal', 'Who:', 'Follow up:', 'Message to Opal']) and '12345678' not in side, side)
    shot(pg, 'c02-finish-self-desktop')
    L = [x for x in leads() if x['name'] == 'Opal Test'][0]
    ck('birth date, county and DCN saved on the lead', L['dob'] == '1950-06-15' and L['county'] == 'Greene' and L['dcn'] == '12345678', L)
    ck('the call note in the lead history has no DCN', not any('12345678' in n['text'] for n in L['notes']))
    ck('eligibility answers kept on the lead, nothing to look at', L['screening']['condition'] == 'Stroke last spring' and L['screening']['handsOn'] == 'hands' and L['screening']['living'] == 'home' and L['screening']['flags'] == [], L.get('screening'))
    pg.locator(M + ' button', has_text='Yes, start their profile').click(); pg.wait_for_timeout(400)
    L = [x for x in leads() if x['name'] == 'Opal Test']; C = [x for x in cons() if x['name'] == 'Opal Test']
    ck('one lead, one Starting consumer, linked', len(L) == 1 and len(C) == 1 and C[0]['status'] == 'starting' and L[0]['startingId'] == C[0]['id'] and C[0]['starting']['kind'] == 'new', [L, C])
    ck('the profile has the birth date, county and DCN', C[0]['dcn'] == '12345678' and C[0]['county'] == 'Greene' and C[0]['facts']['dob'] == '1950-06-15', C[0])
    ck('the call note is on the lead', any(n.get('call') and 'Opal Test called for themself' in n['text'] for n in L[0]['notes']))

    # ---- 2. Daughter for a parent, no Medicaid yet, wants help applying, not ready: instructions, follow-up, message
    new_call(); chipc('Family, for a loved one'); nxt(); chipc('No, new to CDS'); nxt()
    ck('family: names step asks who needs care and the caller', 'Who are we helping get started?' in say())
    fill('First name', 'Mae'); fill('Last name', 'Example'); fill("Caller's name", 'Linda Example')
    pg.locator(M).get_by_label('Relationship').select_option('daughter'); pg.wait_for_timeout(50); nxt()
    fill("The caller's phone", '4175550177'); fill('Email (if they gave one)', 'linda@example.com')
    ck("someone else calling: Mae's own phone and email asked too", pg.locator(M).get_by_label("The consumer's phone").count() == 1)
    fill("The consumer's phone", '4175550178'); nxt()
    ck("the birth date line uses Mae's name", "What is Mae's date of birth?" in say())
    fill('Date of birth', '1944-02-02'); nxt()
    ck('Skip for now moves on without an answer', pg.locator(M + ' .st-nav button', has_text='Skip for now').count() == 1)
    pg.locator(M + ' .st-nav button', has_text='Skip for now').click(); pg.wait_for_timeout(80)
    chipc('No')
    ck('no Medicaid: explains why and asks how they want to apply', 'CDS is paid for by Medicaid' in say() and pg.locator(M + ' .st-chip', has_text='Would like help applying').count() == 1)
    chipc('Would like help applying'); shot(pg, 'c03a-no-medicaid-desktop'); nxt()
    fill('Why they need help', 'Arthritis'); chipc('Dressing and grooming'); chipc('Mostly reminders or someone nearby'); nxt()
    pg.locator(M + ' .st-chip', has_text='Memory or decision-making concerns').click(); pg.wait_for_timeout(50)
    pg.locator(M + ' .st-chip').filter(has_text=re.compile('^No$')).first.click(); pg.wait_for_timeout(50); nxt()
    chipc('With family'); chipc('No'); nxt()
    chipc('Yes'); fill('Their name', 'Amy Example'); fill('Their phone', '4175550199')
    pg.locator(M).get_by_label('How are they related').select_option('spouse'); pg.wait_for_timeout(120)
    ck('spouse as attendant: shown right away, they can choose someone else', 'A spouse cannot be the paid attendant' in pg.inner_text(M) and 'choose someone else' in pg.inner_text(M))
    shot(pg, 'c03c-spouse-desktop')
    pg.locator(M).get_by_label('How are they related').select_option('granddaughter' if False else 'grandchild'); pg.wait_for_timeout(120)
    ck('a grandchild is fine', 'cannot be the paid attendant' not in pg.inner_text(M)); nxt()
    chipc('Not yet'); nxt()
    ck('wrap up lists the skipped county', 'their county' in pg.inner_text(M))
    to('County'); pg.locator(M + ' .st-step select').first.select_option('Other'); pg.wait_for_timeout(120); fill('Which county?', 'Jackson')
    ck('another county: outside our 27 counties, the coordinator looks into it first, no promise', 'Outside our 27 counties' in pg.inner_text(M) and 'we will call you back either way' in say())
    shot(pg, 'c10-outside-area-desktop')
    to('Wrap up'); ck('wrap up lists the service area', 'Lives outside our 27-county service area (Jackson)' in pg.inner_text(M))
    ck('wrap up lists what to look into, and says not to tell them yes or no', 'Look into before sending to the state' in pg.inner_text(M) and 'Samantha or Zach' not in pg.inner_text(M) and 'reminders' in pg.inner_text(M) and 'direct their own care' in pg.inner_text(M) and 'Do not tell the family they qualify' in pg.inner_text(M))
    to('County'); ck('the step bar jumps back', step() == 'county')
    pg.locator(M + ' .st-step select').first.select_option('Other'); pg.wait_for_timeout(60); to('Wrap up')
    shot(pg, 'c03-call-family-desktop')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(150); shot(pg, 'c03b-call-family-mobile')
    ck('phone: the call screen fits a 390px screen', pg.evaluate("()=>{const m=document.querySelector('#stCallModal .modal').getBoundingClientRect(); return m.right <= innerWidth + 1 && document.querySelector('#stCallModal .modal').scrollWidth <= document.querySelector('#stCallModal .modal').clientWidth + 1}"))
    pg.set_viewport_size({'width': 1440, 'height': 1000})
    finish_call()
    side = pg.inner_text('#stCallSide')
    ck('things to look at: the coordinator looks into it first, instructions still ready', 'Next step: Look into the items below' in side and 'Samantha or Zach' not in side and 'To look at:' in side and 'Medicaid application instructions' in side, side)
    p = [x for x in leads() if x['name'] == 'Mae Example'][0]
    ck('caller saved as family contact, attendant in mind saved, not ready keeps them in Leads', any(r['name'] == 'Linda Example' and r['relation'] == 'daughter' for r in p['relatedPeople']) and p['attendant']['name'] == 'Amy Example' and not p.get('startingId'), p)
    ck('application stage saved: needs help applying, the other county saved', p['medicaid']['application']['stage'] == 'help' and p['county'] == 'Jackson' and p['dob'] == '1944-02-02', p.get('medicaid'))
    ck("Mae's own phone on the lead, Linda's on her contact; attendant relation and the things to look at saved", p['phone'] == '4175550178' and any(r['phone'] == '4175550177' for r in p['relatedPeople']) and p['attendant']['relation'] == 'grandchild' and len(p['screening']['flags']) == 3, p)
    pg.select_option('#stFinOwner', 'Krystal'); pg.locator(M + ' button', has_text='Save').last.click(); pg.wait_for_timeout(100)
    p = [x for x in leads() if x['name'] == 'Mae Example'][0]
    ck('follow-up owned by Krystal, next day (the coordinator looks into it first), on the lead and the Medicaid follow-up', p['coordinator'] == 'Krystal' and p['followup'] == day(1) and p['medicaid']['followup']['owner'] == 'Krystal', p)
    pg.locator(M + ' button', has_text='Send Medicaid application instructions').click(); pg.wait_for_timeout(150)
    ck('instructions open on this screen, to Linda, with the 65 and older form ticked from her birth date', 'Hi Linda' in pg.input_value('#stCmp_call textarea') and pg.locator('#stCmp_call .st-abd input').first.is_checked())
    shot(pg, 'c04-finish-family-medicaid-desktop')
    pg.locator('#stCmp_call button', has_text='Send text').click(); pg.wait_for_timeout(300)
    ck('instructions sent only after Send', pg.evaluate("()=>CALLS.filter(c=>c[0]==='medicaidSend').length") == 1)
    t = pg.input_value('#stFinBody')
    ck('after-call text drafted, no identifiers, no promise', t.startswith('Hi Linda') and "look at a few things on our end" in t and pg.evaluate("t=>CDSStarting.identifierProblems(t,{}).length", t) == 0, t)
    pg.locator(M + ' button').filter(has_text=re.compile('^Send$')).click(); pg.wait_for_timeout(300)
    ck('after-call text sent after review', pg.evaluate("()=>CALLS.filter(c=>c[0]==='callFollowupSend').length") == 1 and 'Sent.' in pg.inner_text('#stCallSide'))
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(150); shot(pg, 'c04b-finish-family-mobile'); pg.set_viewport_size({'width': 1440, 'height': 1000})

    # ---- 3. Son for a parent, Medicaid applied and waiting (jumping straight to Medicaid)
    new_call(); chipc('Family, for a loved one'); nxt(); nxt(); fill('First name', 'Gus'); fill('Last name', 'Sample'); fill("Caller's name", 'Tom Sample')
    pg.locator(M).get_by_label('Relationship').select_option('son'); nxt(); fill("The caller's phone", '4175550133'); to('Medicaid'); chipc('Applied, waiting')
    ck('applied: an encouraging line, no promise', 'let us know and we will take the next step together' in say())
    finish_call()
    ck('Medicaid pending: instructions offered, follow-up 2 weeks', pg.input_value('#stFinDate') == day(14) and 'Medicaid application instructions' in pg.inner_text('#stCallSide'))
    g = [x for x in leads() if x['name'] == 'Gus Sample'][0]
    ck('pending saved on the lead', g['medicaidStatus'] == 'pending' and g['medicaid']['application']['stage'] == 'applied')

    # ---- 4. Attendant calling about a specific consumer: intake + attendant linked, no attendant question
    new_call(); chipc('An attendant, about someone')
    nxt(); nxt(); fill('First name', 'Hal'); fill('Last name', 'Example'); fill("Caller's name", 'Sam Helper'); nxt(); fill("The caller's phone", '4175550144')
    to('Medicaid'); chipc('Yes'); chipc("They don't have it handy"); to('CDS now'); chipc('No, new to CDS'); to('Attendant')
    ck('attendant calling: asked how they are related, not who the attendant is', 'How are you related to Hal' in say() and pg.locator(M).get_by_label('Their name').count() == 0)
    pg.locator(M).get_by_label('How are they related').select_option('son'); pg.wait_for_timeout(100); fill('Attendant email', 'sam@example.com')
    to('Go ahead'); chipc('Yes'); nxt()
    ck('no DCN and no birth date: the wrap up says what to get', 'their DCN or birth date' in pg.inner_text(M))
    finish_call()
    shot(pg, 'c05-finish-attendant-pair-desktop')
    p = [x for x in leads() if x['name'] == 'Hal Example'][0]
    ck('consumer intake started, caller linked as the attendant', p['whoCalled'] == 'pair' and p['attendant']['name'] == 'Sam Helper' and p['attendant']['email'] == 'sam@example.com' and p['attendant']['relation'] == 'son' and any(r['role'] == 'attendant' for r in p['relatedPeople']), p)
    pg.locator(M + ' button', has_text='Yes, start their profile').click(); pg.wait_for_timeout(400)
    c = [x for x in cons() if x['name'] == 'Hal Example'][0]
    ck('Starting profile knows the attendant', c['starting']['attendantName'] == 'Sam Helper' and 'Sam Helper' in pg.inner_text('#prof_body'))

    # ---- 5. Attendant with no one to care for: Caregiver Pool, no consumer
    pg.evaluate("()=>{ window._dbWas = _db; _db = { from: t => ({ insert: async r => { POOL.push([t, r]); return { error: null }; }, upsert: () => Promise.resolve({ error: null }) }) }; }")
    new_call(); chipc('An attendant, no one to care for yet')
    ck('attendant-only: three short steps', pg.inner_text('#stBar').split() == ['Who', 'Names', 'Wrap', 'up'], pg.inner_text('#stBar'))
    nxt()
    ck('attendant-only: just name and phone asked', pg.locator(M).get_by_label('Their name').count() == 1 and pg.locator(M).get_by_label('First name').count() == 0)
    fill('Their name', 'Jo Caregiver'); fill('Best phone', '4175550155'); nxt()
    finish_call()
    ck('next step: the Caregiver Pool', 'Next step: Move them to the Caregiver Pool' in pg.inner_text('#stCallSide'))
    pg.locator(M + ' button', has_text='Move them to the Caregiver Pool').click(); pg.wait_for_timeout(400)
    p = [x for x in leads() if x['name'] == 'Jo Caregiver'][0]
    ck('moved with the existing Caregiver Pool step; lead closed; no consumer', p['status'] == 'closed_pool' and pg.evaluate("()=>POOL.length") == 1 and pg.evaluate("()=>POOL[0][0]") == 'attendant_pool' and not [x for x in cons() if x['name'] == 'Jo Caregiver'])
    shot(pg, 'c06-finish-attendant-pool-desktop')
    pg.evaluate("()=>{ _db = window._dbWas; }")

    # ---- 6. Transfer from another CDS agency: the short path (her 11-05 ask)
    new_call(); chipc('Family, for a loved one'); nxt(); chipc('Yes, with another agency'); fill('Which agency', 'Other CDS Co')
    ck('transfer: only the short path, with the county', pg.inner_text('#stBar').replace('✓ ', '').split() == ['Who', 'CDS', 'now', 'Names', 'Birth', 'date', 'County', 'Phone', 'Attendant', 'Go', 'ahead', 'Wrap', 'up'], pg.inner_text('#stBar'))
    ck('no Medicaid, help or eligibility questions', all(x not in pg.inner_text('#stBar') for x in ['Medicaid', 'Help at home', 'Their decisions', 'Where they live']))
    nxt(); fill('First name', 'Vi'); fill('Last name', 'Sample'); fill("Caller's name", 'Lou Sample'); pg.locator(M).get_by_label('Relationship').select_option('son'); nxt()
    fill('Date of birth', '1952-08-08'); nxt()
    pg.locator(M + ' .st-step select').first.select_option('Taney'); pg.wait_for_timeout(80); nxt()
    fill("The caller's phone", '4175550165'); fill("The consumer's phone", '4175550166'); fill("The consumer's email", 'vi@example.com'); nxt()
    ck('transfer: asks who the attendant is now', 'Who is Vi' in say())
    chipc('Yes'); fill('Their name', 'Amy Helper'); fill('Their phone', '4175550167'); fill('Their email', 'amy@example.com')
    pg.locator(M).get_by_label('How are they related').select_option('friend'); pg.wait_for_timeout(100)
    shot(pg, 'c08-transfer-attendant-desktop'); nxt()
    ck('transfer: go ahead asks about the transfer', 'start the transfer' in say()); chipc('Yes'); nxt()
    ck('transfer: nothing missing', 'Still missing' not in pg.inner_text(M + ' .st-step'), pg.inner_text(M + ' .st-step'))
    finish_call()
    shot(pg, 'c09-transfer-finish-desktop')
    pg.locator(M + ' button', has_text='Yes, start their profile').click(); pg.wait_for_timeout(400)
    p = [x for x in leads() if x['name'] == 'Vi Sample'][0]; c = [x for x in cons() if x['name'] == 'Vi Sample'][0]
    ck('transfer: PCCP lead with the agency, Starting as moving from another agency', p['type'] == 'pccp' and p['leavingAgency'] == 'Other CDS Co' and c['starting']['kind'] == 'move' and 'Moving from another agency' in pg.inner_text('#prof_body'))
    ck("transfer: Vi's own phone and email, Lou's on his contact, the attendant's phone and email, no eligibility record",
       p['phone'] == '4175550166' and p['email'] == 'vi@example.com' and p['dob'] == '1952-08-08' and any(r['name'] == 'Lou Sample' and r['phone'] == '4175550165' for r in (p.get('relatedPeople') or []) + (c.get('relatedPeople') or []))
       and p['attendant']['name'] == 'Amy Helper' and p['attendant']['email'] == 'amy@example.com' and 'screening' not in p, {k: p.get(k) for k in ['phone', 'email', 'dob', 'relatedPeople', 'attendant', 'screening']})
    ck('transfer: the Starting profile has her phone, email and birth date', c['phone'] == '4175550166' and c['email'] == 'vi@example.com' and c['facts']['dob'] == '1952-08-08', c)

    # ---- 7. Returning caller with an existing lead
    n0 = len(leads())
    new_call(); pg.fill('#stFind', 'Ruth'); pg.wait_for_timeout(100)
    ck('returning caller found by name', 'Ruth Sample' in pg.inner_text('#stFindList'))
    pg.fill('#stFind', '550109'); pg.wait_for_timeout(100)
    ck('returning caller found by phone', 'Ruth Sample' in pg.inner_text('#stFindList'))
    pg.locator('#stFindList button', has_text='Ruth Sample').click(); pg.wait_for_timeout(150)
    ck('her lead fills the screen and starts at the first question not answered', 'Ruth Sample' in pg.inner_text('#stCallTitle') and step() == 'cds', step())
    to('Names'); ck('what is on file is filled in', pg.locator(M).get_by_label('First name').input_value() == 'Ruth')
    to('Medicaid'); chipc('Yes'); finish_call()
    r = [x for x in leads() if x['name'] == 'Ruth Sample']
    ck('no new lead; the call is added to her lead', len(leads()) == n0 and len(r) == 1 and r[0]['notes'][-1].get('call') and r[0]['medicaidStatus'] == 'active')

    # ---- 8. Same person typed again without searching: asked, no duplicate
    new_call(); chipc('Family, for a loved one'); nxt(); nxt(); fill('First name', 'Mae'); fill('Last name', 'Example'); fill("Caller's name", 'Linda Example')
    pg.locator(M + ' #stCallSide button', has_text='Save').first.click(); pg.wait_for_timeout(150)
    ck('duplicate caught before saving', 'Mae Example is already on Leads' in pg.inner_text('#stCallSide') and len([x for x in leads() if x['name'] == 'Mae Example']) == 1)
    pg.locator(M + ' button', has_text="Use Mae's lead").click(); pg.wait_for_timeout(200)
    ck('used the existing lead, still one', len([x for x in leads() if x['name'] == 'Mae Example']) == 1 and pg.evaluate("()=>StartCall.state().leadId") == [x for x in leads() if x['name'] == 'Mae Example'][0]['id'])
    ck('her saved birth date and county came back (outside our list: Another county, Jackson)', pg.evaluate("()=>StartCall.state().dob") == '1944-02-02' and pg.evaluate("()=>StartCall.state().county") == 'Other' and pg.evaluate("()=>StartCall.state().countyOther") == 'Jackson')

    # ---- 9. Saving an incomplete call, then picking it up again
    pg.evaluate("()=>closeModal('stCallModal')"); new_call(); chipc('Family, for a loved one'); nxt(); nxt(); fill("Caller's name", 'Bea Caller')
    pg.locator(M + ' #stCallSide button', has_text='Save').first.click(); pg.wait_for_timeout(150)
    inc = [x for x in leads() if x['name'] == 'Caller: Bea Caller']
    ck('incomplete call saved with what was known', len(inc) == 1 and 'Saved' in pg.inner_text('#stCallMsg'))
    ck('still-missing list shown', "the consumer's name" in pg.inner_text('#stCallSide'))
    pg.evaluate("id=>{closeModal('stCallModal'); ldLogCall(id);}", inc[0]['id']); pg.wait_for_timeout(150)
    ck('Log a call on that lead reopens the call screen with Bea, on CDS now', pg.evaluate("()=>document.getElementById('stCallModal').classList.contains('open')") and step() == 'cds' and pg.evaluate("()=>StartCall.state().caller.name") == 'Bea Caller')
    to('Names'); pg.locator(M + ' a', has_text='Just a quick note instead').click(); pg.wait_for_timeout(150)
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
