"""Starting profile, end to end (Samantha 2026-11-04: "Build and test in a separate branch using fictional consumer information.
Test the complete flow from first call through Medicaid application instructions, follow-up, family-reported approval, eMOMED
verification, DSDS authorization, and first completed shift."). The real hub page, served from THIS checkout, offline (Supabase is
blocked), MADE-UP people only. The server is a stand-in that answers like cds-match does (its own test runs the real server code).
Saves desktop and phone screenshots to $OUT. python3 tests/starting_look.py   (needs playwright). Nothing is sent or saved."""
import os, threading, functools, datetime, tempfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
PDF = os.path.join(tempfile.mkdtemp(), 'eMOMED-fictional.pdf'); open(PDF, 'wb').write(b'%PDF-1.4\n% fictional test page\n')

LEAD = {'id': 'L1', 'name': 'Pat Example', 'type': 'referral', 'status': 'nurturing', 'county': 'Greene', 'phone': '4175550142', 'firstContact': day(-1),
        'dob': '1951-03-12', 'notes': [{'date': day(-1), 'text': 'Daughter Linda called. Pat needs help bathing and with meals.'}],
        'relatedPeople': [{'id': 'r1', 'name': 'Linda Example', 'relation': 'daughter', 'phone': '4175550177', 'email': 'linda@example.com', 'role': 'family'}]}
LEAD2 = {'id': 'L2', 'name': 'Lee Sample', 'type': 'referral', 'status': 'nurturing', 'county': 'Polk', 'phone': '4175550188', 'firstContact': day(-3), 'notes': []}
SETUP = r"""
async([LEAD, LEAD2, on])=>{
  _store.pipeline = [LEAD, LEAD2]; _store.consumers = []; _store.attendants = []; _leadCalls = [];
  _store.starting = on ? { live: true, by: 'samantha' } : {};
  _store.officeStaff = [{ id: 's1', name: 'Krystal Demo' }, { id: 's2', name: 'Zach Demo' }];
  _store.authorizations = {}; _store.firstShifts = {}; _store.meRules = {}; _store.medicaidMessages = {};
  document.getElementById('header_user').textContent = 'samantha@caringcds.com';
  window.CALLS = []; window.SENT = []; window.PKT = { packet: null };
  cdsMatchApi = async (a, b) => {
    CALLS.push([a, JSON.parse(JSON.stringify(b || {}))]);
    if (a === 'medicaidSend') {
      const key = b.person.kind + ':' + b.person.id;
      const recent = SENT.filter(s => s.key === key);
      if (recent.length && !b.force) return { duplicate: [{ at: recent[0].at, channel: recent[0].channel, status: 'sent' }] };
      const m = { id: 'm' + (SENT.length + 1), channel: b.channel, to: b.channel === 'sms' ? '(***) ***-0177' : 'l***@example.com', status: 'sent', delivery: null, at: new Date().toISOString(), by: 'samantha@caringcds.com' };
      SENT.unshift(Object.assign({ key }, m)); return { message: m };
    }
    if (a === 'medicaidSends') return { messages: SENT.filter(s => s.key === b.person.kind + ':' + b.person.id).map(s => Object.assign({}, s, { delivery: s.channel === 'sms' ? 'delivered' : null })) };
    if (a === 'enrollProfile') return PKT;
    if (a === 'enrollGet') return { packet: null, status: { label: 'Not sent' }, forms: [], messages: [] };
    if (a === 'tasks') return { tasks: [] };
    if (a === 'packetList') return { attendants: [] };
    return {};
  };
  window._saveConsumerDoc = async (c, file, meta) => Object.assign({ id: 'd' + Date.now(), path: c.id + '/docs/emomed_test.pdf', name: file.name, at: _todayIso(), by: _acWho() }, meta);
  window.syncOneToGhl = async () => {};   // offline: GoHighLevel tagging is not part of this test
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  return true;
}"""
SHOW = r"""(id)=>{ document.querySelectorAll('.page').forEach(p => p.style.display = 'none'); const box = document.getElementById(id); box.style.display = 'block';
  for (let el = box; el; el = el.parentElement) { if (getComputedStyle(el).display === 'none') el.style.display = 'block'; } }"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
def shot(pg, name, sel=None):
    p = os.path.join(OUT, name + '.png')
    (pg.locator(sel).first.screenshot(path=p) if sel else pg.screenshot(path=p, full_page=True))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.on('dialog', lambda d: d.accept('Check the Lock Ins line with Samantha') if d.type == 'prompt' else d.accept())
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    ck('the page loads the Starting files', pg.evaluate('()=>!!window.StartHub && !!window.CDSStarting'))

    # ---- switch off: nothing changes
    pg.evaluate(SETUP, [LEAD, LEAD2, False]); pg.evaluate("()=>openLeadProfile('L1')"); pg.wait_for_timeout(400)
    ck('switch off: no Starting card on the lead', pg.evaluate("()=>document.getElementById('lpStarting').innerHTML === ''"))
    pg.evaluate("()=>{showPage('consumers'); renderConsumers();}"); pg.wait_for_timeout(200)
    ck('switch off: no Starting tab on Consumers', pg.evaluate("()=>document.getElementById('rosterSegStarting').hidden"))

    # ---- 1. the lead: first call done, No Medicaid yet
    pg.evaluate(SETUP, [LEAD, LEAD2, True]); pg.evaluate("()=>openLeadProfile('L1')"); pg.wait_for_timeout(500)
    ck('lead: Starting card with They said yes', 'They said yes' in pg.inner_text('#lpStarting'))
    pg.click('#lpStarting input[name="stStage_lead"][value="help"]'); pg.wait_for_timeout(100)
    ck('lead: application stage saved', pg.evaluate("()=>getData('pipeline')[0].medicaid.application.stage") == 'help')
    pg.click('#lpStarting button:has-text("Send Medicaid application instructions")'); pg.wait_for_timeout(200)
    t = pg.input_value('#stCmp_lead textarea')
    ck('text draft: Linda, the coordinator, the apply line, help line, IM-1ABD for a 75 year old', all(x in t for x in ['Hi Linda', 'Samantha', '855-373-9994', 'Jordan Valley', 'IM-1ABD']), t)
    ck('text draft carries no identifiers', pg.evaluate("t=>CDSStarting.identifierProblems(t,{}).length", t) == 0)
    shot(pg, '01-lead-text-preview-desktop', '#lpStarting')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(200); shot(pg, '01b-lead-text-preview-mobile', '#lpStarting'); pg.set_viewport_size({'width': 1440, 'height': 1000})
    pg.click('#stCmp_lead .st-seg button:has-text("Email")'); pg.wait_for_timeout(100)
    e = pg.input_value('#stCmp_lead textarea')
    ck('email draft: full guide, mail, fax, upload, all three helpers', all(x in e for x in ['P.O. Box 2700', '573-526-9400', 'mydssupload.mo.gov', 'APO', 'SeniorAge', 'IM-1ABD']), e[:300])
    shot(pg, '02-lead-email-preview-desktop', '#lpStarting')
    pg.click('#stCmp_lead .st-seg button:has-text("Text")'); pg.click('#stCmp_lead button:has-text("Send text")'); pg.wait_for_timeout(400)
    ck('send: the server was asked once, as a text to Linda', pg.evaluate("()=>CALLS.filter(c=>c[0]==='medicaidSend').length") == 1 and pg.evaluate("()=>CALLS.find(c=>c[0]==='medicaidSend')[1].to") == '4175550177')
    ck('sent message listed with its real status', 'Delivered' in pg.inner_text('#stSends_lead'), pg.inner_text('#stSends_lead'))
    pg.click('#lpStarting button:has-text("Send Medicaid application instructions")'); pg.click('#stCmp_lead button:has-text("Send text")'); pg.wait_for_timeout(300)
    ck('duplicate: warned, not sent', 'already went to this family' in pg.inner_text('#stCmp_lead') and pg.evaluate("()=>SENT.length") == 1)
    shot(pg, '03-lead-duplicate-warning', '#lpStarting')
    pg.click('#stCmp_lead button:has-text("Send it again anyway")'); pg.wait_for_timeout(300)
    ck('resend allowed after the warning', pg.evaluate("()=>SENT.length") == 2 and pg.evaluate("()=>CALLS.filter(c=>c[0]==='medicaidSend').pop()[1].force") is True)
    pg.select_option('#stFuOwner_lead', 'Krystal'); pg.fill('#stFuDate_lead', day(3)); pg.click('#lpStarting button:has-text("Set the follow-up")'); pg.wait_for_timeout(150)
    f = pg.evaluate("()=>getData('pipeline')[0].medicaid.followup")
    ck('follow-up: date and owner (Krystal, not Zach)', f['date'] == day(3) and f['owner'] == 'Krystal', f)
    ck('follow-up is on Today for its owner on the day', pg.evaluate("d=>CDSStarting.applicationFollowups({consumers:getData('consumers'),pipeline:getData('pipeline')}, d)[0].owner", day(3)) == 'Krystal')
    pg.evaluate("()=>StartHub.familyApproved('lead','L1')")
    ck('lead: family report saved, not verified', pg.evaluate("()=>CDSStarting.medicaidState(getData('pipeline')[0]).label") == 'Family reports Medicaid approved. Verification needed')

    # ---- 2. They said yes: same record becomes Starting
    pg.click('#lpStarting button:has-text("They said yes")'); pg.click('#stYesAsk button:has-text("Yes, start the profile")'); pg.wait_for_timeout(500)
    c = pg.evaluate("()=>getData('consumers')[0]")
    ck('consumer created as Starting, coordinator and Medicaid history carried over', c['status'] == 'starting' and c['name'] == 'Pat Example' and c['medicaid']['application']['stage'] == 'help' and len(c['relatedPeople']) == 1, c)
    ck('lead points at the profile and leaves the call list', pg.evaluate("()=>{const p=getData('pipeline')[0]; return p.startingId && CDSRules.leadCard(p,[],_todayIso(),!!p.movedToConsumers).due}") == 'Starting')
    ck('Starting is not active (no monthly calls, counts, billing)', pg.evaluate("()=>!CDSRules.isActive(getData('consumers')[0])"))
    body = pg.inner_text('#prof_body')
    ck('profile: Starting header, 7 steps, Next step for Medicaid, also-do-now', all(x in body for x in ['Starting', '1 of 7', 'Next step', 'You can also do now']), body[:400])
    ck('profile: Medicaid shows the family report, not Verified', 'Family reports Medicaid approved. Verification needed' in body)
    shot(pg, '04-starting-profile-overview-desktop')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(200); shot(pg, '04b-starting-profile-overview-mobile'); pg.set_viewport_size({'width': 1440, 'height': 1000})

    # ---- 3. Medicaid tab: verify in eMOMED
    pg.evaluate("()=>{_profTab='medicaid'; renderProfile();}"); pg.wait_for_timeout(300)
    ck('Medicaid tab: verification banner, name and birth date for the lookup', 'Verification needed' in pg.inner_text('#prof_body') and 'Pat' in pg.inner_text('.st-lookup'))
    pg.fill('#stCodes', '05'); pg.select_option('#stMc', 'yes'); pg.wait_for_timeout(100)
    ck('05 with managed care shown: Not eligible under current coverage, next action, family words', 'Not eligible for CDS under current coverage' in pg.inner_text('#stVerdict') and 'Next action' in pg.inner_text('#stVerdict') and 'What we say to families' in pg.inner_text('#stVerdict'))
    pg.click('#prof_body button:has-text("Save: verified by")'); pg.wait_for_timeout(200)
    ck('save refused without the eMOMED PDF', 'Upload the eMOMED page first' in pg.inner_text('#stSaveMsg') and not pg.evaluate("()=>(getData('consumers')[0].medicaid.checks||[]).length"))
    pg.set_input_files('#stPdf', PDF); pg.click('#prof_body button:has-text("Save: verified by")'); pg.wait_for_timeout(500)
    ck('saved: waiting on an ME code review, never closed by itself', pg.evaluate("()=>getData('consumers')[0].status") == 'starting' and 'ME code review' in pg.inner_text('#prof_body') and 'upervisor' not in pg.inner_text('#prof_body') and 'Supporting document' in pg.inner_text('#prof_body'))
    ck('PDF filed in their Documents', pg.evaluate("()=>getData('consumers')[0].docs.some(d=>d.kind==='emomed')"))
    shot(pg, '05-medicaid-review-desktop')
    pg.evaluate("()=>{document.getElementById('header_user').textContent='office@caringcds.com'; renderProfile();}"); pg.wait_for_timeout(200)
    ck('her 11-05 rule: any care coordinator sees the review buttons', pg.locator('#prof_body button:has-text("Approve and continue")').count() == 1 and 'Samantha or Zach' not in pg.inner_text('#prof_body'))
    pg.click('#prof_body button:has-text("Approve and continue")'); pg.wait_for_timeout(100)
    ck('a review needs a note', 'Add a note first' in pg.inner_text('#stSupMsg'))
    pg.fill('#stSupNote', 'Called the family: the health plan letter was old. Re-check in eMOMED.'); pg.click('#prof_body button:has-text("Keep in Starting, follow up")'); pg.wait_for_timeout(200)
    ck('a resolution needs its supporting document', 'Attach the supporting document' in pg.inner_text('#stSupMsg'))
    pg.evaluate("()=>{renderProfile();}"); pg.wait_for_timeout(200)
    pg.fill('#stSupNote', 'Called the family: the health plan letter was old. Re-check in eMOMED.'); pg.set_input_files('#stSupFile', PDF)
    pg.click('#prof_body button:has-text("Keep in Starting, follow up")'); pg.wait_for_timeout(400)
    ck('resolution saved with the document and an audit record', pg.evaluate("()=>CALLS.some(c=>c[0]==='startingAudit' && c[1].action==='supervisor_hold' && c[1].detail.doc)") and pg.evaluate("()=>getData('consumers')[0].docs.some(d=>d.kind==='review')"))
    pg.evaluate("()=>{document.getElementById('header_user').textContent='samantha@caringcds.com'; renderProfile();}"); pg.wait_for_timeout(150)
    pg.fill('#stCodes', '13'); pg.select_option('#stMc', 'no'); pg.set_input_files('#stPdf', PDF); pg.click('#prof_body button:has-text("Save: verified by")'); pg.wait_for_timeout(500)
    st = pg.evaluate("()=>CDSStarting.medicaidState(getData('consumers')[0])")
    ck('new check with code 13: Verified Active', st['verified'] and st['label'] == 'Verified Active', st)
    ck('history keeps every step', len(pg.evaluate("()=>getData('consumers')[0].medicaid.log")) >= 8 and 'Kept in Starting' in pg.inner_text('#prof_body'))
    shot(pg, '06-medicaid-verified-desktop')
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(200)
    shot(pg, '07-medicaid-verified-mobile')
    wide = "()=>[...document.querySelectorAll('#prof_body *')].filter(e=>e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('table')).map(e=>e.tagName+'.'+e.className).slice(0,5)"
    ck('phone: nothing on the Starting profile runs off the screen', pg.evaluate(wide) == [], pg.evaluate(wide))
    ck('phone: the whole page fits, header included (fixed in this branch)', pg.evaluate("()=>document.documentElement.scrollWidth") <= 391, pg.evaluate("()=>document.documentElement.scrollWidth"))
    pg.set_viewport_size({'width': 1440, 'height': 1000})

    # ---- 4. DSDS authorization is separate
    pg.evaluate("()=>{_profTab='overview'; renderProfile();}")
    ck('after Medicaid: Next step is the DSDS referral (eligibility is not approval)', 'Send the DSDS referral' in pg.inner_text('#prof_body'))
    pg.evaluate("()=>{_profTab='state'; renderProfile();}"); pg.fill('#prof_body input[type=date]', day(-1)); pg.dispatch_event('#prof_body input[type=date]', 'change'); pg.wait_for_timeout(200)
    ck('referral date saved, waiting on DSDS', pg.evaluate("()=>getData('consumers')[0].starting.referralSent") == day(-1) and 'Waiting on DSDS' in pg.inner_text('#prof_body'))
    # Referral request ID and waiting on the state (2026-11-05)
    pg.fill('#prof_body input[placeholder="From the state portal"]', 'R-2026-0042'); pg.dispatch_event('#prof_body input[placeholder="From the state portal"]', 'change'); pg.wait_for_timeout(200)
    c0 = pg.evaluate("()=>getData('consumers')[0]")
    ck('request ID saved and in the history, with the referral date', c0['starting']['requestId'] == 'R-2026-0042' and any('Request ID R-2026-0042' in str(e) for e in c0['medicaid']['log']) and any('Referral sent to DSDS' in str(e) for e in c0['medicaid']['log']), c0['medicaid'].get('log'))
    ck('the State tab says when Today will ask', 'within 14 days' in pg.inner_text('#prof_body'))
    ck('1 day after the referral: not on Today yet', 'no authorization yet' not in pg.evaluate("()=>StartHub.todayHtml()"))
    pg.evaluate("d=>{ const list=getData('consumers'); list[0].starting.referralSent=d; setData('consumers', list); }", day(-20))
    ck('20 days, no authorization: on Today with the request ID', 'Referral sent 20 days ago, no authorization yet. Check with DSDS (request R-2026-0042)' in pg.evaluate("()=>StartHub.todayHtml()"), pg.evaluate("()=>StartHub.todayHtml()"))
    shot(pg, '06b-state-request-id-desktop')
    pg.evaluate("()=>{ _store.authorizations = { records: { a1: { consumer: 'Pat Example', planStart: '%s', planEnd: '%s', months: [] } } }; renderProfile(); }" % (day(0), day(180)))
    ck('authorization on file moves the step', 'On file' in pg.inner_text('#prof_body'))
    ck('with the authorization in, the Hub asks for the start date', 'Add the start date the state gave' in pg.inner_text('#prof_body'))
    pg.evaluate("d=>StartHub.setStart(getData('consumers')[0].id, d)", day(5)); pg.wait_for_timeout(200)
    ck('start date saved; five days out and not ready shows urgent', 'Start date in 5 days' in pg.inner_text('#prof_body'))
    ck('Today lists the start date that is not ready, with its owner', 'start date, not ready' in pg.evaluate("()=>StartHub.todayHtml()"))
    t5 = pg.evaluate("()=>{ try { renderDailyRoutine(); return (document.getElementById('dailyRoutine')||{}).textContent || ''; } catch (e) { return 'error: ' + e.message; } }")
    ck('Today step 5 lists Starting people getting ready, with the checklist count (2026-11-05)', 'Starting consumer getting ready for the first shift' in t5 and 'of 11 ready' in t5, t5[:600])

    # ---- 5. paperwork, attendant, WellSky, ready
    pg.evaluate("()=>{ PKT = { packet: { status: 'Done', signed_at: new Date().toISOString(), answers: {} } }; delete _profPacket[getData('consumers')[0].id]; _store.attendants = [{ id: 'a1', name: 'Amy Example', consumer: 'Pat Example', status: 'active' }]; _profTab='ready'; renderProfile(); }"); pg.wait_for_timeout(400)
    pg.evaluate("()=>renderProfile()"); pg.wait_for_timeout(200)
    ck('ready: locked until WellSky lines are done', pg.locator('#prof_body button:has-text("Mark ready for first shift")').is_disabled())
    pg.click('#prof_body button:has-text("WellSky: authorization is in")'); pg.click('#prof_body button:has-text("WellSky: tasks are in")'); pg.wait_for_timeout(200)
    ck('still locked until both can clock in', pg.locator('#prof_body button:has-text("Mark ready for first shift")').is_disabled())
    pg.click('#prof_body button:has-text("Told the consumer how to clock in")'); pg.click('#prof_body button:has-text("The attendant can clock in")'); pg.wait_for_timeout(200)
    shot(pg, '08-ready-checklist-desktop')
    pg.click('#prof_body button:has-text("Mark ready for first shift")'); pg.wait_for_timeout(200)
    ck('marked ready, 6 of 7', '6 of 7' in pg.inner_text('#prof_body') and 'Waiting for the first shift in WellSky' in pg.inner_text('#prof_body'))
    ck('ready: no start-date alert on Today any more', 'start date, not ready' not in pg.evaluate("()=>StartHub.todayHtml()"))

    # ---- 6. Consumers list, then the first completed shift
    pg.evaluate("()=>{showPage('consumers'); setRosterView('starting');}"); pg.wait_for_timeout(300)
    ck('Consumers: Starting tab lists Pat with the next step', 'Pat Example' in pg.inner_text('#consumerTableBody') and not pg.evaluate("()=>document.getElementById('rosterSegStarting').hidden"))
    shot(pg, '09-consumers-starting-tab-desktop')
    pg.evaluate("()=>{ _store.firstShifts = { people: { 'Pat Example': { date: _todayIso() } } }; setRosterView('active'); }"); pg.wait_for_timeout(300)
    ck('first shift in WellSky: Active by itself, on the Active list', pg.evaluate("()=>getData('consumers')[0].status") == 'active' and 'Pat Example' in pg.inner_text('#consumerTableBody'), pg.evaluate("()=>[getData('consumers')[0].status, firstShiftOf(getData('consumers')[0])]"))
    pg.evaluate("()=>openProfile(getData('consumers')[0].id)"); pg.wait_for_timeout(300)
    ck('Active: the usual profile again (monthly call box back)', 'Monthly check-in call' in pg.inner_text('#prof_body') and 'Enrollment progress' not in pg.inner_text('#prof_body'))

    # ---- 7. Did not start (second fictional person), Admin rules, Today
    pg.evaluate("()=>openLeadProfile('L2')"); pg.wait_for_timeout(300)
    pg.click('#lpStarting button:has-text("They said yes")'); pg.click('#stYesAsk button:has-text("Yes, start the profile")'); pg.wait_for_timeout(400)
    pg.evaluate("()=>{_profTab='medicaid'; renderProfile();}"); pg.fill('#stCodes', '15'); pg.set_input_files('#stPdf', PDF); pg.click('#prof_body button:has-text("Save: verified by")'); pg.wait_for_timeout(400)
    ck('15: Not eligible for standard in-home CDS under this ME category', 'Not eligible for standard in-home CDS under this ME category' in pg.inner_text('#prof_body'))
    shot(pg, '10-medicaid-15-review-desktop')
    pg.fill('#stSupNote', 'Lives in assisted living; family will ask FSD.'); pg.set_input_files('#stSupFile', PDF); pg.click('#prof_body button:has-text("Did not start")'); pg.select_option('#stCloseWhy', 'Other'); pg.click('#prof_body button:has-text("Close the profile")'); pg.wait_for_timeout(500)
    lee = pg.evaluate("()=>getData('consumers').find(c=>c.name==='Lee Sample')"); lead2 = pg.evaluate("()=>getData('pipeline').find(p=>p.id==='L2')")
    ck('Did not start: inactive with the reason, lead closed, with a note and a document', lee['status'] == 'inactive' and lee['inactiveReason'].startswith('Did not start') and lead2['status'] == 'closed_other')
    pg.evaluate(SHOW, 'page-automations'); pg.evaluate("()=>{ document.getElementById('page-automations').insertAdjacentHTML('afterbegin','<div id=\"startingAdmin\"></div>'); StartHub.renderAdmin(); }"); pg.wait_for_timeout(200)
    ck('Admin: 35 codes with source and version', pg.locator('#startingAdmin table').first.locator('tbody tr').count() == 35 and 'February 2026' in pg.inner_text('#startingAdmin'))
    pg.evaluate("()=>StartHub.admEdit('15')"); pg.click('#startingAdmin button:has-text("Save the change")'); pg.wait_for_timeout(100)
    ck('Admin: a change needs a reason', 'Add the reason' in pg.inner_text('#startingAdmin'))
    pg.select_option('#admKind', 'review'); pg.fill('#admReason', 'Test only: fictional rule change'); pg.click('#startingAdmin button:has-text("Save the change")'); pg.wait_for_timeout(200)
    ck('Admin: change saved with history and a new version', 'Test only: fictional rule change' in pg.inner_text('#startingAdmin') and pg.evaluate("()=>getObj('meRules').version") != '2026-11-04')
    ck('old answers are not rewritten', pg.evaluate("()=>getData('consumers').find(c=>c.name==='Lee Sample').medicaid.checks[0].result.label") == 'Not eligible for standard in-home CDS under this ME category')
    pg.fill('#admRes1', '855-555-0000'); pg.click('#startingAdmin button:has-text("Save the messages")'); pg.wait_for_timeout(100)
    ck('Admin: message change needs a reason', 'Add the reason' in pg.inner_text('#admMsgNote'))
    pg.fill('#admMsgReason', 'Test only'); pg.click('#startingAdmin button:has-text("Save the messages")'); pg.wait_for_timeout(200)
    ck('Admin: resource change logged with the old value', 'was 855-373-9994' in pg.inner_text('#startingAdmin'))
    pg.fill('#admWaitRef', '10'); pg.evaluate("()=>StartHub.admSaveWaits()"); pg.wait_for_timeout(100)
    ck('Admin: waiting days need a reason', 'Add the reason' in pg.inner_text('#admWaitNote'))
    pg.fill('#admWaitReason', 'Test only'); pg.evaluate("()=>StartHub.admSaveWaits()"); pg.wait_for_timeout(150)
    ck('Admin: waiting days saved and in the change history', pg.evaluate("()=>StartHub.waits().referral") == 10 and 'referral 14 to 10 days' in pg.inner_text('#startingAdmin'))
    shot(pg, '11-admin-rules-desktop', '#startingAdmin')
    th = pg.evaluate("()=>StartHub.failedHtml([{ id: 't1', kind: 'medicaid_failed', title: 'Medicaid application instructions to Pat Example did not go through. GoHighLevel says undelivered.' }])")
    ck('Today: a failed message is a red Needs attention item', 'Needs attention' in th and 'alert-danger' in th)
    ck('Today: nothing new with the switch off', pg.evaluate("()=>{ _store.starting = {}; return StartHub.todayHtml(); }") == '')
    ck('no page errors', not errs, errs[:3])
    b.close()
print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
raise SystemExit(0 if all(res) else 1)
