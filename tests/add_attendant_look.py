"""Add an attendant from the Attendants page or a consumer's profile (2026-11-06, her yes): pick the consumer (or an open
lead), type the attendant, Save only or Save and text their application link. Same server calls as a lead's attendant
box. The real hub page, served from THIS checkout, offline, with a stand-in CDS server. MADE-UP people only.
(python3 tests/add_attendant_look.py; OUT=<dir> for screenshots). Needs playwright. Nothing is sent or saved."""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

SETUP = r"""
()=>{
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  _store.pipeline = [{ id: 'L1', name: 'Dora Testwell', type: 'lead', status: 'new', notes: [] },
    { id: 'L2', name: 'Hal Hasone', type: 'lead', status: 'new', notes: [], attendant: { name: 'Rita Already', phone: '(417) 555-0111' } },
    { id: 'L3', name: 'Gone Closed', type: 'lead', status: CDSRules.CLOSED[0], notes: [] }];
  _store.consumers = [{ id: 'C1', name: 'Mae Testerson', status: 'active' }];
  _leadCalls = [];
  window.CALLS = []; window.GHL_OK = true; window.SEND_STATUS = 'sent'; window.REPEAT = false;
  window.confirm = () => true;
  cdsMatchApi = async (a, i) => {
    CALLS.push([a, i]);
    if (a === 'packetStartFromLead') return { ok: true, pool_id: 'pool-' + CALLS.length, repeat: REPEAT, ghl: GHL_OK ? { ok: true } : { ok: false, error: 'GoHighLevel 503: down' } };
    if (a === 'packetSendLink') return { ok: true, status: SEND_STATUS };
    if (a === 'packetList') return { attendants: window.ONB || [] };
    return {};
  };
  _attPk = { at: 0, list: null, busy: false };
  window.RELOADS = 0;
  return true;
}"""
toasts = "()=>[...document.querySelectorAll('body > div')].filter(d => d.style.position === 'fixed' && /bottom/.test(d.style.cssText)).map(d => d.textContent)"
calls = lambda pg, a: [c for c in pg.evaluate('()=>CALLS') if c[0] == a]
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
def fill(pg, who, name, phone, email=''):
    pg.evaluate("(w)=>openAddAttendant(w, () => RELOADS++)", who)
    pg.fill('#aa_name', name); pg.fill('#aa_phone', phone); pg.fill('#aa_email', email)
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP)

    # The pick list: consumers and open leads, not closed leads.
    pg.evaluate("()=>openAddAttendant('')")
    opts = pg.evaluate("()=>[...document.querySelectorAll('#aa_for option')].map(o => o.value + '|' + o.textContent)")
    ck('pick list has consumers and open leads only', 'c:C1|Mae Testerson' in opts and 'l:L1|Dora Testwell (lead)' in opts and not any('Gone Closed' in o for o in opts), opts)
    ck('the box says what Save does', 'puts them in Attendants, Onboarding' in pg.inner_text('#addAttModal'))
    pg.locator('#addAttModal').screenshot(path=os.path.join(OUT, 'add_att_box.png'))

    # Checks before anything is sent to the server.
    pg.click('#aa_save'); ck('no consumer picked: says so', 'Pick who' in pg.inner_text('#aa_err'))
    pg.select_option('#aa_for', 'c:C1'); pg.click('#aa_save'); ck('no name: says so', 'Type their first and last name' in pg.inner_text('#aa_err'))
    pg.fill('#aa_name', 'Tess Tester'); pg.fill('#aa_phone', 'Tester'); pg.click('#aa_save'); ck('bad phone: says so', '10-digit' in pg.inner_text('#aa_err'))
    ck('nothing went to the server yet', not calls(pg, 'packetStartFromLead'))
    pg.evaluate("()=>closeModal('addAttModal')")

    # A consumer, Save only: Onboarding for that consumer, nothing texted.
    fill(pg, 'c:C1', 'Tess  Tester', '417-555-0190', 'tess@x.test')
    ck('opened from a profile: consumer already picked', pg.input_value('#aa_for') == 'c:C1')
    pg.click('#aa_save'); pg.wait_for_timeout(400)
    st = calls(pg, 'packetStartFromLead')
    ck('Save starts them for that consumer', len(st) == 1 and st[0][1] == {'name': 'Tess Tester', 'phone': '(417) 555-0190', 'email': 'tess@x.test', 'consumer': 'Mae Testerson'}, st)
    ck('Save only texts nothing', not calls(pg, 'packetSendLink'))
    t = pg.evaluate(toasts)
    ck('says Onboarding, consumer, GoHighLevel, nothing sent', any('Onboarding, for Mae Testerson, and in GoHighLevel. Nothing was sent' in x for x in t), t)
    ck('box closes and the Attendants list reloads', not pg.evaluate("()=>document.getElementById('addAttModal').classList.contains('open')") and pg.evaluate('()=>RELOADS') == 1)

    # A consumer, Save and text.
    pg.evaluate(SETUP); fill(pg, 'c:C1', 'Tess Tester', '4175550190'); pg.click('#aa_text'); pg.wait_for_timeout(400)
    sl = calls(pg, 'packetSendLink'); st = calls(pg, 'packetStartFromLead')
    ck('Save and text: texts that same attendant', len(sl) == 1 and len(st) == 1 and sl[0][1]['pool_id'].startswith('pool-'), pg.evaluate('()=>CALLS'))
    ck('says saved and texted', any('was texted their application link' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))
    pg.evaluate(SETUP); pg.evaluate("()=>SEND_STATUS='held'"); fill(pg, 'c:C1', 'Tess Tester', '4175550190'); pg.click('#aa_text'); pg.wait_for_timeout(400)
    ck('switch off: held said plainly', any('switched off' in x and 'Nothing went out' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))

    # Same phone already on file: said, nothing changed.
    pg.evaluate(SETUP); pg.evaluate("()=>REPEAT=true"); fill(pg, 'c:C1', 'Tess Tester', '4175550190'); pg.click('#aa_save'); pg.wait_for_timeout(400)
    ck('same phone: says already in Attendants', any('already in Attendants (same phone)' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))
    # GoHighLevel down: said.
    pg.evaluate(SETUP); pg.evaluate("()=>GHL_OK=false"); fill(pg, 'c:C1', 'Tess Tester', '4175550190'); pg.click('#aa_save'); pg.wait_for_timeout(400)
    ck('GoHighLevel failure said', any('not in GoHighLevel: GoHighLevel 503' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))

    # An open lead: goes on the lead too, then texted.
    pg.evaluate(SETUP); fill(pg, 'l:L1', 'Lena Leadly', '4175550122'); pg.click('#aa_text'); pg.wait_for_timeout(600)
    lead = pg.evaluate("()=>_store.pipeline[0]")
    st = calls(pg, 'packetStartFromLead'); sl = calls(pg, 'packetSendLink')
    ck('lead: attendant saved on the lead with the link', lead['attendant']['name'] == 'Lena Leadly' and lead['attendant']['phone'] == '(417) 555-0122' and lead['attendant'].get('pool_id', '').startswith('pool-'), lead)
    ck('lead: started for that consumer and texted', len(st) == 1 and st[0][1]['consumer'] == 'Dora Testwell' and len(sl) == 1, pg.evaluate('()=>CALLS'))
    ck('lead: texted is noted on the lead', lead['notes'][-1]['text'] == 'Texted Lena Leadly their application link.', lead['notes'])
    # A lead that already has a different attendant: not changed from here.
    pg.evaluate(SETUP); fill(pg, 'l:L2', 'Someone Else', '4175550133'); pg.click('#aa_save'); pg.wait_for_timeout(300)
    ck('lead with another attendant: says open the lead, nothing saved', 'already has an attendant' in pg.inner_text('#aa_err') and not calls(pg, 'packetStartFromLead')
       and pg.evaluate("()=>_store.pipeline[1].attendant.name") == 'Rita Already', pg.inner_text('#aa_err'))
    pg.evaluate("()=>closeModal('addAttModal')")

    # The consumer profile button.
    pg.evaluate(SETUP)
    pg.evaluate("()=>{ document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); _profileId = 'C1'; _profTab = 'overview'; showPage('profile'); renderProfile(); }"); pg.wait_for_timeout(500)
    btn = pg.locator('#prof_body button', has_text='+ Add an attendant')
    ck('profile Overview has the button', btn.count() == 1)
    if btn.count():
        btn.first.click(); pg.wait_for_timeout(200)
        ck('profile button opens the box with that consumer', pg.evaluate("()=>document.getElementById('addAttModal').classList.contains('open')") and pg.input_value('#aa_for') == 'c:C1')
        pg.evaluate("()=>closeModal('addAttModal')")
        pg.locator('#prof_body .cp-line', has_text='Attendant').first.screenshot(path=os.path.join(OUT, 'add_att_profile.png'))

    # 2026-11-06: an attendant added for them and still onboarding shows on the profile (not only payroll).
    pg.evaluate(SETUP)
    pg.evaluate("()=>{ ONB = [{ pool_id: 'p9', name: 'Kris Newperson', consumer: 'Mae Testerson', label: 'Application link sent', active: false }, { pool_id: 'p8', name: 'Other Person', consumer: 'Someone Else', label: 'x', active: false }]; renderProfile(); }"); pg.wait_for_timeout(600)
    att = pg.locator('#prof_body .cp-line', has_text='Attendant').first.inner_text()
    ck('onboarding attendant shows on the profile', 'Kris Newperson' in att and 'onboarding' in att and 'Other Person' not in att and 'none in payroll yet' not in att, att)

    # The Attendants page button.
    pg.evaluate("async ()=>{ const { mountHubPacket } = await import('./caregiver-match/hub-packet.js?v=28'); const el = document.createElement('div'); el.id = 'hp_test'; document.body.prepend(el);"
                " mountHubPacket(el, { api: cdsMatchApi, roster: () => [], addAttendant: reload => openAddAttendant('', reload) }); }"); pg.wait_for_timeout(800)
    hb = pg.locator('#hp_test button', has_text='+ Add an attendant')
    ck('Attendants page has the button', hb.count() == 1)
    if hb.count():
        pg.locator('#hp_test .hp-head').screenshot(path=os.path.join(OUT, 'add_att_page.png'))
        hb.first.click(); pg.wait_for_timeout(200)
        ck('Attendants button opens the box, nobody picked', pg.evaluate("()=>document.getElementById('addAttModal').classList.contains('open')") and pg.input_value('#aa_for') == '')
    ck('no em dashes in the box', '—' not in pg.inner_text('#addAttModal'))
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed')
