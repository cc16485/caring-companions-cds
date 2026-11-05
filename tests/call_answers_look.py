"""Answers from recorded calls on the lead (Samantha 2026-11-05: "Mock up recorded calls filling the lead answers for the office to
OK, then build it"; mockup W47w6qkzLLB3FF91iEJ8J1). The real hub page, served from THIS checkout, offline, MADE-UP people only.
A waiting call note with answers on the lead profile: the ticks, OK, what lands on the lead, and Listen on the saved note.
python3 tests/call_answers_look.py (OUT=<dir> for screenshots). Needs playwright. Nothing is sent or saved."""
import os, threading, functools, datetime, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
today = datetime.date.today().isoformat()
AT = today + 'T19:14:00Z'
PIPE = [{'id': 'l1', 'name': 'Caller: Carol', 'type': 'lead', 'status': 'new', 'county': 'Greene', 'dcn': '12345678', 'phone': '', 'firstContact': today, 'notes': [],
         'relatedPeople': [{'id': 'r1', 'name': 'Carol Example', 'relation': 'daughter', 'phone': '(417) 555-0123', 'role': 'family'}]}]
NOTE = {'comm_id': 'c1', 'status': 'waiting', 'note': 'Carol called for her mom Ruth, 81. Ruth has Medicaid and is new to CDS.', 'followup': '', 'people': [],
        'answers': {'who': 'family', 'first': 'Ruth', 'last': 'Example', 'dob': '1945-03-14', 'county': 'Greene', 'medicaid': 'yes', 'dcn': '12345687', 'cds': 'new',
                    'help': ['bathing', 'meals'], 'attendant': 'has', 'att_name': 'Carol Example', 'att_phone': '4175550123', 'att_relation': 'daughter'},
        'at': AT, 'seconds': 1080, 'direction': 'inbound', 'staff_name': 'Krystal', 'phone10': '4175550123', 'ref': 'family:lead:l1', 'who': 'Carol Example'}
SETUP = r"""
async([PIPE, NOTE])=>{
  _store.pipeline = PIPE; _store.consumers = []; _leadCalls = [];
  document.getElementById('header_user').textContent = 'krystal@caringcds.com';
  window.SENT = [];
  window._commCall = async b => { SENT.push(b); return b.action === 'history' ? { items: [], phones: [] } : { ok: true }; };
  _cnWaiting = [NOTE];
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  openLeadProfile('l1'); await new Promise(r => setTimeout(r, 200));
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate(SETUP, [PIPE, NOTE]); pg.wait_for_timeout(200)
    rows = pg.evaluate("""()=>[...document.querySelectorAll('.cn-ans-row')].map(r => ({ k: r.querySelector('input').id.split('_').pop(), t: r.innerText.replace(/\\s+/g,' ').trim(), on: r.querySelector('input').checked, off: r.querySelector('input').disabled, cls: r.className }))""")
    by = {r['k']: r for r in rows}
    ck('the call note on the lead shows Answers from this call', pg.evaluate("()=>document.querySelector('.cn-ans b').textContent") == 'Answers from this call', rows)
    ck('nine answers in the first call order', [r['k'] for r in rows] == ['who', 'name', 'dob', 'county', 'medicaid', 'dcn', 'cds', 'help', 'attendant'], rows)
    ck('new answers ticked: name, date of birth, Medicaid, help, attendant', all(by[k]['on'] for k in ['who', 'name', 'dob', 'medicaid', 'cds', 'help', 'attendant']), rows)
    ck('county already on the lead: greyed out', by['county']['off'] and 'already on the lead' in by['county']['t'], by['county'])
    ck('a different DCN is not ticked and says what the lead has', not by['dcn']['on'] and 'lead says 12345678' in by['dcn']['t'] and 'cn-differs' in by['dcn']['cls'], by['dcn'])
    ck('the listen-first line shows when an answer differs', 'Listen, then tick it' in pg.inner_text('.cn-ans'))
    pg.locator('.cn-panel').screenshot(path=os.path.join(OUT, 'call_answers_panel.png'))
    # untick help, then OK
    pg.evaluate("()=>{ document.getElementById('cna_c1_help').checked = false; }")
    pg.evaluate("()=>[...document.querySelectorAll('.cn-panel button')].find(b => b.textContent === 'OK, save it').click()"); pg.wait_for_timeout(400)
    sent = pg.evaluate("()=>SENT.find(b => b.action === 'note_decide')")
    ck('OK tells the server which answers were kept', sent and sent['decision'] == 'ok' and sent['kept'] == ['who', 'name', 'dob', 'medicaid', 'cds', 'attendant'], sent)
    p = pg.evaluate("()=>_store.pipeline.find(x => x.id === 'l1')")
    ck('the lead gets the ticked answers: name, date of birth, Medicaid, attendant', p['name'] == 'Ruth Example' and p['dob'] == '1945-03-14' and p['medicaidStatus'] == 'active' and p['attendant']['name'] == 'Carol Example' and p['whoCalled'] == 'family', p)
    ck('not the unticked or different ones: help and DCN stay as they were', 'helpNeeded' not in p and p['dcn'] == '12345678', p)
    n = p['notes'][-1]
    ck('the note is saved linked to its call, with what it filled in', n['fromCall'] == 'c1' and n['callAt'] == AT and n['kept'] == ['who', 'name', 'dob', 'medicaid', 'cds', 'attendant'] and 'Carol called' in n['text'], n)
    prof = pg.inner_text('#lprof_body')
    ck('the call note box is gone once answered', not pg.evaluate("()=>!!document.querySelector('.cn-panel')"))
    ck('Notes: Listen and Read the whole call on the saved note, with what it saved', 'Saved from this call: who called, name, date of birth, medicaid, new or moving, attendant.' in prof and 'Listen' in prof and 'Read the whole call' in prof, prof[-900:])
    ck('the lead shows where the date of birth and Medicaid came from', prof.count('from the call ') >= 2 and 'Has Medicaid' in prof, prof[:900])
    ck('Listen on the saved note asks for that call\'s recording', pg.evaluate("""async()=>{ let asked = null; const f = window.fetch; window.fetch = async (u, o) => { asked = JSON.parse(o.body); return new Response('x', { status: 404 }); };
      _db = _db || { auth: { getSession: async () => ({ data: null }) } };
      [...document.querySelectorAll('#lprof_body .lp-call button')].find(b => b.textContent === 'Listen').click(); await new Promise(r => setTimeout(r, 300)); window.fetch = f; return asked && asked.action === 'recording' && asked.id === 'c1'; }"""))
    ck('no em dashes', '—' not in prof)
    pg.locator('#lprof_body').screenshot(path=os.path.join(OUT, 'call_answers_lead.png'))
    # Not about: nothing lands on the lead
    pg.evaluate(SETUP, [PIPE, NOTE]); pg.wait_for_timeout(200)
    pg.evaluate("()=>[...document.querySelectorAll('.cn-panel button')].find(b => b.textContent === 'Not about them').click()"); pg.wait_for_timeout(300)
    p = pg.evaluate("()=>_store.pipeline.find(x => x.id === 'l1')")
    ck('Not about (says them, the lead has no name yet): no answers and no note on the lead', p['name'] == 'Caller: Carol' and not p['notes'] and pg.evaluate("()=>SENT.find(b => b.action === 'note_decide').kept.length === 0"), p)
    # a note with no answers (older notes): no Answers box
    pg.evaluate(SETUP, [PIPE, dict(NOTE, answers={})]); pg.wait_for_timeout(200)
    ck('a note without answers looks as before', not pg.evaluate("()=>!!document.querySelector('.cn-ans')") and pg.evaluate("()=>!!document.querySelector('.cn-panel')"))
    ck('no script errors', not errs, errs)
    m = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    m.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    m.goto(f'http://127.0.0.1:{PORT}/index.html'); m.wait_for_timeout(1500)
    m.evaluate(SETUP, [PIPE, NOTE]); m.wait_for_timeout(300)
    ck('phone: the answers fit the screen', m.evaluate("()=>document.documentElement.scrollWidth <= 392 && document.querySelector('.cn-ans').getBoundingClientRect().right <= 392"))
    m.locator('.cn-panel').screenshot(path=os.path.join(OUT, 'call_answers_phone.png'))
    b.close()
print(f'\n{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
