"""The sign-up questions on a lead's own link (Samantha 2026-11-05: "Give each lead their own link that a coordinator sends, save the
answers on that lead's profile, and fill in the guided call so it's just a quick confirm"). The real hub page, served from THIS checkout,
offline, MADE-UP people only. The card on the lead, Send, the answers with OK, and the guided call filled from them.
python3 tests/lead_questions_look.py (OUT=<dir> for screenshots). Needs playwright. Nothing is sent or saved."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
today = datetime.date.today().isoformat()
PIPE = [{'id': 'l1', 'name': 'Caller: Pat', 'type': 'lead', 'status': 'new', 'county': 'Polk', 'phone': '', 'firstContact': today, 'notes': [],
         'relatedPeople': [{'id': 'r1', 'name': 'Pat Example', 'relation': 'son', 'phone': '(417) 555-0142', 'role': 'family'}]}]
ANS = {'who': 'Mom or dad', 'decide': 'Yes', 'county': 'Greene', 'medicaid': 'Not sure', 'tasks': ['Bathing and grooming', 'Meals', 'Getting around'], 'hours': 15,
       'basics': 'Yes', 'first': 'Pat', 'last': 'Example', 'phone': '4175550142', 'email': 'pat@example.com', 'cared': 'Mae', 'when': 'Morning',
       'consName': 'Mae Example', 'consDob': '1944-03-04'}
SETUP = r"""
async([PIPE, ANS, on])=>{
  _store.pipeline = PIPE; _store.consumers = []; _leadCalls = []; LeadQs.forget();
  _store.starting = { live: true, by: 'samantha' };
  document.getElementById('header_user').textContent = 'krystal@caringcds.com';
  window.SENT = [];
  window.LINKS = on ? [{ id: 'L1', lead: 'l1', channel: 'sms', status: 'sent', by: 'kim@caringcds.com', at: new Date(Date.now() - 864e5).toISOString(), answers: ANS, answered: new Date().toISOString(), count: 1, kept: [] }] : [];
  cdsMatchApi = async (a, b) => { SENT.push([a, b]);
    if (a === 'leadQuestionsFor') return { links: LINKS };
    if (a === 'leadQuestionsSend') return { message: { id: 'O1', channel: b.channel, to: '***0142', status: 'held', at: new Date().toISOString() } };
    if (a === 'leadQuestionsDecide') { LINKS[0].decided = 'now'; LINKS[0].decided_by = 'krystal@caringcds.com'; LINKS[0].kept = b.kept; return { ok: true }; }
    if (a === 'prescreen') return { found: false };
    return {}; };
  window._commCall = async b => b.action === 'history' ? { items: [], phones: [] } : { ok: true };
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  openLeadProfile('l1'); await new Promise(r => setTimeout(r, 300));
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, h, tag in [(1440, 1000, 'desktop'), (390, 844, 'phone')]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
        pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)

        # ---- a lead with no link yet
        pg.evaluate(SETUP, [PIPE, ANS, False]); pg.wait_for_timeout(300)
        card = pg.inner_text('.lq-card')
        ck(tag + ': a new lead shows Send the sign-up questions', 'Send the sign-up questions' in card, card)
        pg.evaluate("()=>LeadQs.openSend('l1')"); pg.wait_for_timeout(200)
        body = pg.input_value('#lqBody'); to = pg.input_value('#lqTo')
        ck(tag + ': the text is drafted to Pat with [link] and STOP', body.startswith('Hi Pat,') and '[link]' in body and 'Reply STOP' in body and to == '(417) 555-0142', [body, to])
        ck(tag + ': no em dashes in the draft', '—' not in body, body)
        pg.locator('#lqSendModal .modal').screenshot(path=os.path.join(OUT, 'lq_send_' + tag + '.png'))
        pg.click('#lqSendBtn'); pg.wait_for_timeout(300)
        sent = pg.evaluate("()=>SENT.find(x => x[0] === 'leadQuestionsSend')")
        ck(tag + ': Send asks the server, for this lead, by text', sent and sent[1]['person']['id'] == 'l1' and sent[1]['channel'] == 'sms' and '[link]' in sent[1]['body'], sent)
        ck(tag + ': switch off says it is waiting in Messages', 'Waiting in Messages' in pg.inner_text('#lqSendBody'), pg.inner_text('#lqSendBody'))
        pg.evaluate("()=>closeModal('lqSendModal')")

        # ---- they answered
        pg.evaluate(SETUP, [PIPE, ANS, True]); pg.wait_for_timeout(400)
        rows = pg.evaluate("""()=>[...document.querySelectorAll('.lq-card .cn-ans-row')].map(r => ({ k: r.querySelector('input').id.split('_').pop(), t: r.innerText.replace(/\\s+/g,' ').trim(), on: r.querySelector('input').checked }))""")
        by = {r['k']: r for r in rows}
        ck(tag + ': What they told us online, with their answers', 'What they told us online' in pg.inner_text('.lq-card') and set(by) >= {'who', 'name', 'dob', 'county', 'help', 'attendant'}, rows)
        ck(tag + ': new answers ticked; Greene differs from Polk and is not ticked', by['name']['on'] and by['dob']['on'] and by['help']['on'] and not by['county']['on'] and 'lead says Polk' in by['county']['t'], rows)
        pg.locator('.lq-card').screenshot(path=os.path.join(OUT, 'lq_card_' + tag + '.png'))
        pg.evaluate("()=>[...document.querySelectorAll('.lq-card button')].find(b => b.textContent === 'OK, save it').click()"); pg.wait_for_timeout(500)
        dec = pg.evaluate("()=>SENT.find(x => x[0] === 'leadQuestionsDecide')")
        p = pg.evaluate("()=>_store.pipeline.find(x => x.id === 'l1')")
        ck(tag + ': OK puts the ticked answers on the lead, not the county', p['name'] == 'Mae Example' and p['dob'] == '1944-03-04' and p['county'] == 'Polk' and 'bathing' in p['helpNeeded'] and dec[1]['decision'] == 'ok', [p, dec])
        ck(tag + ': a note says they answered online', p['notes'][-1]['text'] == 'Answered the sign-up questions online.' and p['notes'][-1]['fromQuestions'] == 'L1', p['notes'])

        # ---- the guided call fills in from them
        pg.evaluate(SETUP, [[dict(PIPE[0])], ANS, True]); pg.wait_for_timeout(300)
        pg.evaluate("()=>StartCall.open('l1')"); pg.wait_for_timeout(800)
        side = pg.inner_text('#stCallSide') if pg.locator('#stCallSide').count() else ''
        modal = pg.inner_text('#stCallModal')
        ck(tag + ': the call shows Their sign-up questions', 'Their sign-up questions' in modal and 'Mae Example' in modal, modal[:800])
        ck(tag + ': the call is filled and tagged to confirm', 'from their online form, confirm it' in modal, modal[:800])
        pg.locator('#stCallModal .modal').screenshot(path=os.path.join(OUT, 'lq_call_' + tag + '.png'))
        ck(tag + ': no page errors', not errs, errs)
        pg.close()
    b.close()
print(f'{sum(res)} passed, {len(res) - sum(res)} failed')
