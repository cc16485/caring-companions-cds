"""An attendant typed on a lead (2026-11-05, her yes): Save puts them in Attendants, Onboarding and GoHighLevel and says so,
the lead card shows their onboarding steps from the Onboarding list, and "Text their application link" is the office's own
button. The real hub page, served from THIS checkout, offline, with a stand-in CDS server. MADE-UP people only.
(python3 tests/lead_attendant_look.py; OUT=<dir> for screenshots). Needs playwright. Nothing is sent or saved."""
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
  _store.pipeline = [{ id: 'L1', name: 'Dora Testwell', type: 'lead', status: 'new', notes: [], attendant: { name: 'Anna', phone: 'Testly', empeonInvited: '2026-11-05' } }];
  _store.consumers = []; _leadCalls = [];
  window.CALLS = []; window.GHL_OK = true; window.SEND_STATUS = 'held'; window.POOL = [];
  window.confirm = () => true;
  cdsMatchApi = async (a, i) => {
    CALLS.push([a, i]);
    if (a === 'packetStartFromLead') {
      POOL = [{ pool_id: 'pool-1', name: 'Anna Testly', consumer: i.consumer, label: 'Filling out Step 1', tone: 'b', next: 'Nothing to do. Reminder texts go out on their own.',
        active: false, consumer_waiting: true, step1_at: null, table: { cells: { step1: { s: 'wait', t: 'Not started', warn: true }, orient: { s: 'off' }, fcsr: { s: 'off' },
        edl: { s: 'off' }, oig: { s: 'off' }, fp: { s: 'na', t: 'Not needed' }, invite: { s: 'off' }, empeon: { s: 'off' }, call: { s: 'off' }, i9: { s: 'off' }, counter: { s: 'off' } } } }];
      return { ok: true, pool_id: 'pool-1', repeat: false, ghl: GHL_OK ? { ok: true } : { ok: false, error: 'GoHighLevel 503: down' } };
    }
    if (a === 'packetSendLink') return { ok: true, status: SEND_STATUS };
    if (a === 'packetList') return { attendants: POOL };
    return {};
  };
  _attPk = { at: 0, list: null, busy: false };
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  openLeadProfile('L1');
  return true;
}"""
toasts = "()=>[...document.querySelectorAll('body > div')].filter(d => d.style.position === 'fixed' && /bottom/.test(d.style.cssText)).map(d => d.textContent)"
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP); pg.wait_for_timeout(400)
    card = lambda: pg.evaluate("()=>{ const c = [...document.querySelectorAll('#page-leadprofile .card')].find(c => c.textContent.includes('Their attendant')); return c ? c.innerText : ''; }")
    ck('before: the hand-typed list (not linked yet)', 'Invited into Empeon' in card() and 'Text their application link' not in card(), card())

    # Change: the last name comes back from the phone box; a number and Save.
    pg.evaluate("()=>openLeadAttendant('L1')")
    ck('the box says what Save does now', 'puts them in Attendants, Onboarding' in pg.inner_text('#leadAttModal'))
    pg.fill('#la_phone', '4175550190'); pg.click('#leadAttModal .btn-primary'); pg.wait_for_timeout(600)
    start = [c for c in pg.evaluate('()=>CALLS') if c[0] == 'packetStartFromLead']
    ck('Save starts them for this consumer', len(start) == 1 and start[0][1]['name'] == 'Anna Testly' and start[0][1]['phone'] == '(417) 555-0190' and start[0][1]['consumer'] == 'Dora Testwell', start)
    ck('nothing texted on Save', not [c for c in pg.evaluate('()=>CALLS') if c[0] == 'packetSendLink'])
    t = pg.evaluate(toasts)
    ck('says Onboarding and GoHighLevel, nothing sent', any('in Attendants, Onboarding, and in GoHighLevel' in x and 'Nothing was sent' in x for x in t), t)
    lead = pg.evaluate("()=>_store.pipeline[0]")
    ck('lead keeps the link and her dates', lead['attendant']['pool_id'] == 'pool-1' and lead['attendant']['empeonInvited'] == '2026-11-05' and 'put in Attendants, Onboarding' in lead['notes'][-1]['text'], lead)
    pg.evaluate("()=>{ _attPk.at = 0; renderLeadProfile(); }"); pg.wait_for_timeout(500)
    c = card()
    ck('card shows their onboarding steps', 'Filling out Step 1' in c and 'Step 1 application' in c and 'Countersign' in c and 'Fingerprints' not in c, c)
    ck('card shows phone and the text button', '(417) 555-0190' in c and 'Text their application link' in c, c)
    ck('earlier dates are kept on the card', 'Typed on this lead earlier: Invited into Empeon 2026-11-05' in c, c)
    ck('no hand-typed date boxes any more', pg.evaluate("()=>![...document.querySelectorAll('#page-leadprofile .card')].find(c => c.textContent.includes('Their attendant')).querySelector('input[type=date]')"))
    el = pg.locator('#page-leadprofile .card', has_text='Their attendant').first
    el.screenshot(path=os.path.join(OUT, 'lead_att_card.png'))

    # The button: switch off -> held, said plainly.
    pg.click('text=Text their application link'); pg.wait_for_timeout(400)
    sends = [c for c in pg.evaluate('()=>CALLS') if c[0] == 'packetSendLink']
    ck('button texts the link for that attendant', len(sends) == 1 and sends[0][1]['pool_id'] == 'pool-1', sends)
    ck('held is said out loud', any('switched off' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))
    pg.evaluate("()=>SEND_STATUS='sent'"); pg.click('text=Text their application link'); pg.wait_for_timeout(400)
    ck('sent is said and noted on the lead', any('Texted Anna Testly' in x for x in pg.evaluate(toasts)) and pg.evaluate("()=>_store.pipeline[0].notes.slice(-1)[0].text") == 'Texted Anna Testly their application link.')

    # GoHighLevel down: said, with how to retry.
    pg.evaluate(SETUP); pg.evaluate("()=>{ GHL_OK = false; _store.pipeline[0].attendant = { name: 'Anna Testly', phone: '(417) 555-0190' }; }")
    pg.evaluate("()=>{ openLeadAttendant('L1'); saveLeadAttendant(); }"); pg.wait_for_timeout(500)
    ck('GoHighLevel failure said, with how to retry', any('not in GoHighLevel: GoHighLevel 503' in x and 'Save, to try again' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))

    # No phone: saved on the lead only, and it says why.
    pg.evaluate(SETUP); pg.evaluate("()=>{ _store.pipeline[0].attendant = null; openLeadAttendant('L1'); document.getElementById('la_name').value = 'Ben Nophone'; saveLeadAttendant(); }"); pg.wait_for_timeout(300)
    ck('no phone: not started, says why', not [c for c in pg.evaluate('()=>CALLS') if c[0] == 'packetStartFromLead'] and any('Add their phone number' in x for x in pg.evaluate(toasts)), pg.evaluate(toasts))
    ck('no em dashes on the card', '—' not in c)
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed')
