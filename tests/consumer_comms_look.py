"""The Communication tab (Samantha 2026-11-05: "all calls from the Consumers contacts, their family, attendants go onto the consumers
profile ... the consumer is the boss"; then "lets just do Communication and keep Documents to have its own tab"). The real hub page,
served from THIS checkout, offline (Supabase is blocked), MADE-UP people only, the server answered by a stand-in. Switch off: as
before. Switch on: Communication second, attendants named, Listen and Show the words, Documents kept, attendant follow-ups point to the
consumer except Pay and Clock-in & EVV. Saves screenshots to $OUT. python3 tests/consumer_comms_look.py. Nothing is sent."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
now = datetime.datetime.now(datetime.timezone.utc)
ago = lambda h: (now - datetime.timedelta(hours=h)).isoformat()
ITEMS = [
  {'id': 'm1', 'channel': 'call', 'direction': 'inbound', 'at': ago(2), 'phone10': '4175550144', 'answered': True, 'seconds': 260, 'staff_name': 'Zach Demo', 'has_transcript': True, 'who': 'Marcus Sample', 'attendant': 'now'},
  {'id': 'm2', 'channel': 'sms', 'direction': 'inbound', 'at': ago(5), 'phone10': '4175550155', 'body': 'Can I switch my Tuesday?', 'who': 'Dee Example', 'attendant': 'past'},
  {'id': 'm3', 'channel': 'call', 'direction': 'inbound', 'at': ago(8), 'phone10': '4175550177', 'answered': False, 'voicemail': True, 'seconds': 0, 'who': 'Lena Sample', 'family': True},
  {'id': 'm4', 'channel': 'call', 'direction': 'outbound', 'at': ago(30), 'phone10': '4175550131', 'answered': True, 'seconds': 400, 'staff_name': 'Krystal Demo', 'has_transcript': False, 'who': 'Ruth Sample'},
]
CARD = lambda cid, need: {'id': cid, 'kind': 'missed_call', 'phone10': '4175550144', 'name': 'Marcus Sample', 'role': 'Attendant', 'detail': 'Attendant for Ruth Sample',
  'events': [{'at': ago(1), 'text': 'Missed call'}], 'since': ago(1), 'need': need, 'needLabel': need, 'contactId': 'ATT1', 'candidates': [],
  'forConsumers': [{'id': 'c1', 'name': 'Ruth Sample', 'phone10': '4175550131', 'contactId': 'RUTH1', 'past': False, 'detail': 'Attendant for Ruth Sample'}]}
CONFIRM = {'id': 'k1', 'kind': 'attendant_confirm', 'phone10': '4175550133', 'name': 'Pat Worker', 'role': '', 'detail': '', 'candidates': [], 'forConsumers': [],
  'events': [{'at': ago(1), 'kind': 'confirm', 'text': 'x', 'suggest': {'name': 'Pat Worker', 'contact': 'Pat W', 'ties': [{'id': 'c1', 'name': 'Ruth Sample', 'past': False}]}}],
  'since': ago(1), 'need': 'not_sure', 'needLabel': 'Not sure yet'}
WHO = {'id': 'w1', 'kind': 'who_is_this', 'phone10': '4175550135', 'name': 'Unknown number', 'role': '', 'detail': '', 'candidates': [], 'forConsumers': [],
  'events': [{'at': ago(1), 'text': 'Missed call'}], 'since': ago(1), 'need': 'not_sure', 'needLabel': 'Not sure yet'}
SETUP = r"""
async([ITEMS, CARDS, on])=>{
  _store.consumers = [{ id: 'c1', name: 'Ruth Sample', phone: '4175550131', status: 'Active', relatedPeople: [] }];
  _store.pipeline = []; _store.attendants = [];
  _store.consumerComms = on ? { live: true } : {};
  window.ASKED = [];
  _db = { auth: { getSession: async () => ({ data: { session: { access_token: 'x', user: { email: 'samantha@caringcds.com' } } } }) } };
  _commCall = async (b) => { ASKED.push(JSON.parse(JSON.stringify(b)));
    if (b.action === 'history') return { items: JSON.parse(JSON.stringify(ITEMS)).filter(i => b.with_attendants || !i.attendant), phones: [] };
    if (b.action === 'people') return { people: [{ ref: 'consumer:c1', name: 'Ruth Sample', role: 'Consumer', detail: '' }, { ref: 'lead:l9', name: 'Lee Lead', role: 'Lead', detail: '' }] };
    if (b.action === 'attendant_answer' || b.action === 'pick') return { ok: true };
    if (b.action === 'note_transcript') return { transcript: 'Agent: Caring Companions CDS.\nCaller: Hi, it is Marcus about Ruth.' };
    if (b.action === 'queue') return { live: true, state: { last_run: new Date().toISOString() }, cards: CARDS,
      needs: [{ key: 'enrollment', label: 'Enrollment' }, { key: 'evv', label: 'Clock-in & EVV' }, { key: 'pay', label: 'Pay' }, { key: 'hours', label: 'Hours & care plan' }, { key: 'not_sure', label: 'Not sure yet' }],
      people: [], closedToday: [], today: new Date().toISOString().slice(0, 10) };
    return {};
  };
  _comm = null;
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    tabs = lambda: pg.evaluate("()=>[...document.querySelectorAll('.cp-tabs button')].map(b=>b.innerText.trim())")
    def profile(tab):
        pg.evaluate("t=>{ openProfile('c1'); _profTab=t; renderProfile(); }", tab); pg.wait_for_timeout(400)
    rows = lambda: pg.evaluate("()=>[...document.querySelectorAll('.cds-comm-history .ch-row')].map(r=>r.innerText.replace(/\\s+/g,' ').trim())")

    # ---- switch off: as before
    pg.evaluate(SETUP, [ITEMS, [CARD('t1', 'hours')], False]); profile('calls')
    ck('switch off: tabs as before (Calls and texts fifth, Documents its own)', tabs() == ['Overview', 'Hours and authorization', 'Tax and EIN', 'Money', 'Calls and texts', 'Closings and pauses', 'Documents', 'Notes'], tabs())
    ck('switch off: no attendants asked for or shown, no Listen on answered calls', not any(a.get('with_attendants') for a in pg.evaluate("()=>ASKED")) and len(rows()) == 2
       and pg.locator('.cds-comm-history .ch-play').count() == 0, rows())
    pg.evaluate("()=>{ showPage('followups'); }"); pg.evaluate("()=>renderFollowups(true)"); pg.wait_for_timeout(300)
    pg.evaluate(SETUP, [ITEMS, [WHO, CONFIRM], False]); pg.evaluate("()=>renderFollowups(true)"); pg.wait_for_timeout(300)
    ck('switch off: Who is this? has no attendant choice', pg.locator('#fuCards input[id^=fuAtt_]').count() == 0)
    pg.evaluate(SETUP, [ITEMS, [CARD('t1', 'hours')], False]); pg.evaluate("()=>renderFollowups(true)"); pg.wait_for_timeout(300)
    ck('switch off: the attendant card is as before (call the attendant back, no consumer line)', pg.locator('.fu-boss').count() == 0
       and pg.locator('#fuCards a.go').first.get_attribute('href').endswith('/contacts/detail/ATT1'))

    # ---- switch on
    pg.evaluate(SETUP, [ITEMS, [CARD('t1', 'hours'), dict(CARD('t2', 'pay'), id='t2'), dict(CARD('t3', 'evv'), id='t3')], True]); profile('calls')
    ck('Communication is second, right after Overview; Documents keeps its own tab', tabs() == ['Overview', 'Communication', 'Hours and authorization', 'Tax and EIN', 'Money', 'Closings and pauses', 'Documents', 'Notes'], tabs())
    ck('the tab asks for the attendants too', any(a.get('action') == 'history' and a.get('with_attendants') is True and a.get('refs') == ['consumer:c1'] for a in pg.evaluate("()=>ASKED")))
    r = rows()
    ck('every call and text, each named: attendant, past attendant, family, Ruth', len(r) == 4 and 'Marcus Sample (attendant) called. Zach Demo answered. 4 min.' in r[0]
       and 'Text from Dee Example (past attendant): "Can I switch my Tuesday?"' in r[1] and 'Missed call from Lena Sample (family). Voicemail.' in r[2] and 'Krystal Demo called Ruth Sample. Talked 7 min.' in r[3], r)
    ck('who-called buttons include the attendants', pg.evaluate("()=>[...document.querySelectorAll('.ch-filter button')].map(b=>b.innerText)") == ['Everyone', 'Marcus Sample', 'Dee Example', 'Lena Sample', 'Them'])
    ck('Listen on answered calls and the voicemail; Show the words only with a transcript; never on texts',
       pg.locator('.ch-row').nth(0).locator('button', has_text='Listen').count() == 1 and pg.locator('.ch-row').nth(0).locator('button', has_text='Show the words').count() == 1
       and pg.locator('.ch-row').nth(2).locator('button', has_text='Listen').count() == 1 and pg.locator('.ch-row').nth(3).locator('button', has_text='Show the words').count() == 0
       and pg.locator('.ch-row').nth(1).locator('.ch-play').count() == 0)
    pg.locator('.ch-row').nth(0).locator('button', has_text='Show the words').click(); pg.wait_for_timeout(200)
    ck('Show the words opens the words of that call', 'it is Marcus about Ruth' in pg.inner_text('#cnm_m1'))
    pg.locator('.ch-filter button', has_text='Marcus Sample').click(); pg.wait_for_timeout(100)
    ck('pick one person: only their calls', pg.evaluate("()=>[...document.querySelectorAll('.ch-row')].filter(r=>r.style.display!=='none').length") == 1)
    pg.locator('.ch-filter button', has_text='Everyone').click(); pg.wait_for_timeout(100)
    box = pg.locator('.cp-tabs').bounding_box(); hist = pg.locator('.cds-comm-history .card').bounding_box()
    pg.screenshot(path=os.path.join(OUT, 'cds_comm_desktop.png'), clip={'x': hist['x'] - 10, 'y': box['y'] - 10, 'width': hist['width'] + 20, 'height': hist['y'] + hist['height'] - box['y'] + 20}, full_page=True)
    profile('docs')
    ck('Documents is still its own tab with Add a document', 'Add a document' in pg.inner_text('#page-profile'))
    profile('overview')
    ck('Overview unchanged (no history drawn there)', pg.locator('.cds-comm-history').count() == 0)

    pg.evaluate("()=>{ showPage('followups'); }"); pg.evaluate("()=>renderFollowups(true)"); pg.wait_for_timeout(300)
    cards = pg.locator('#fuCards article')
    txt = [cards.nth(i).inner_text() for i in range(cards.count())]
    hrefs = [cards.nth(i).locator('.go').first.get_attribute('href') for i in range(cards.count())]
    gos = [cards.nth(i).locator('.go').first.inner_text() for i in range(cards.count())]
    ix = {k: next(i for i in range(cards.count()) if cards.nth(i).locator('select').first.input_value() == k) for k in ('hours', 'pay', 'evv')}
    ck('an attendant\'s call about care goes to the consumer: names Ruth, the button calls or texts Ruth', 'Attendant for Ruth Sample. Ruth is the boss, so this goes to Ruth.' in txt[ix['hours']]
       and gos[ix['hours']] == 'Call or text Ruth' and hrefs[ix['hours']].endswith('/contacts/detail/RUTH1') and 'Talk it over with Ruth, then press Done.' in txt[ix['hours']], txt[ix['hours']])
    ck('Pay and Clock-in & EVV stay with the attendant (her pick C), Ruth still named', all(gos[ix[k]] == 'Call or text back' and hrefs[ix[k]].endswith('/contacts/detail/ATT1')
       and 'Pay and clock-in stay with the attendant.' in txt[ix[k]] for k in ('pay', 'evv')), [txt[ix['pay']], txt[ix['evv']]])
    cards.nth(ix['hours']).screenshot(path=os.path.join(OUT, 'cds_comm_card.png'))
    # ---- confirm once, and Who is this? > their attendant
    pg.evaluate(SETUP, [ITEMS, [CONFIRM, WHO], True]); pg.evaluate("()=>renderFollowups(true)"); pg.wait_for_timeout(300)
    k = pg.locator('#fuCards article.fu-confirm')
    ck('the confirm card asks once, says who GoHighLevel and payroll say, and that nothing is tied before Yes',
       k.count() == 1 and 'Is this Pat Worker?' in k.inner_text() and 'GoHighLevel has this number as Pat W' in k.inner_text() and 'attendant for Ruth Sample' in k.inner_text()
       and k.locator('button', has_text='Yes, it is Pat').count() == 1 and k.locator('button', has_text='No').count() == 1 and k.locator('select').count() == 0, k.inner_text() if k.count() else '')
    k.screenshot(path=os.path.join(OUT, 'cds_comm_confirm.png'))
    k.locator('button', has_text='Yes, it is Pat').click(); pg.wait_for_timeout(300)
    ck('Yes sends the answer for that card', any(a.get('action') == 'attendant_answer' and a.get('id') == 'k1' and a.get('yes') is True for a in pg.evaluate("()=>ASKED")))
    w = pg.locator('#fuCards article').filter(has_text='Who is this?').first
    ck('Who is this? offers "their attendant" (with the switch on)', w.locator('input[id^=fuAtt_]').count() == 1)
    w.locator('input[id^=fuWho_]').fill('Lee Lead (Lead)'); w.locator('input[id^=fuAtt_]').check(); w.locator('button', has_text='Save').click(); pg.wait_for_timeout(200)
    ck('their attendant needs the consumer they work for', 'Pick the consumer they work for.' in w.inner_text())
    w.locator('input[id^=fuWho_]').fill('Ruth Sample (Consumer)'); w.locator('input[id^=fuAttName_]').fill('Sam Helper'); w.locator('button', has_text='Save').click(); pg.wait_for_timeout(300)
    ck('saved as Ruth\'s attendant, with the name typed', any(a.get('action') == 'pick' and a.get('attendant') is True and a.get('ref') == 'consumer:c1' and a.get('name') == 'Sam Helper' for a in pg.evaluate("()=>ASKED")))
    pg.evaluate(SETUP, [ITEMS, [CARD('t1', 'hours')], True])
    pg.evaluate("()=>{ _store.consumers[0].phone = ''; }")
    pg.evaluate("""()=>{ _commCall = (orig => async b => b.action === 'queue' ? Object.assign(await orig(b), { cards: [Object.assign({}, (await orig(b)).cards[0], { forConsumers: [{ id: 'c1', name: 'Ruth Sample', phone10: '', contactId: null, past: false }] })] }) : orig(b))(_commCall); }""")
    pg.evaluate("()=>renderFollowups(true)"); pg.wait_for_timeout(300)
    ck('no GoHighLevel contact for Ruth: the button opens her profile instead', pg.locator('#fuCards .go').first.inner_text() == "Open Ruth's profile")
    pg.locator('#fuCards .go').first.click(); pg.wait_for_timeout(300)
    ck('and it opens Ruth', pg.evaluate("()=>document.getElementById('page-profile').classList.contains('active')") and 'Ruth Sample' in pg.inner_text('#page-profile'))

    # ---- phone
    pg.set_viewport_size({'width': 390, 'height': 900}); profile('calls')
    ck('phone: nothing wider than the screen', pg.evaluate("()=>document.documentElement.scrollWidth <= window.innerWidth + 1"), pg.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]"))
    pg.locator('.cds-comm-history .card').screenshot(path=os.path.join(OUT, 'cds_comm_phone.png'))
    words = pg.evaluate("()=>document.getElementById('page-profile').innerText + ' ' + [...document.querySelectorAll('.fu-boss')].map(x=>x.innerText).join(' ')")
    ck('no em dashes and no "AI" in its words', '—' not in words and ' AI ' not in words)
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)} / {len(res)}'); print('screenshots: ' + ', '.join(os.path.join(OUT, f) for f in ['cds_comm_desktop.png', 'cds_comm_card.png', 'cds_comm_confirm.png', 'cds_comm_phone.png']))
raise SystemExit(0 if all(res) else 1)
