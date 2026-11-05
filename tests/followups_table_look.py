"""CDS Follow-ups as one table (Samantha 2026-11-05: "Approve the CDS Follow-ups table as shown, with all five of your
picks. Build it switched off."). The real hub page, served from THIS checkout by the test itself, offline (Supabase is
blocked), MADE-UP people only. Checks the columns and order, the glance row and waiting bar, the menus and their memory,
Who is this? and Is this X? rows, the consumer-is-the-boss link, Move it and Done calling what the cards call, phone cards,
the owner preview, the switch, and that with the switch off the page is today's cards. Saves screenshots.
(python3 tests/followups_table_look.py; OUT=<dir> for the screenshots). Needs playwright. Nothing is sent or saved."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
now = datetime.datetime.now(datetime.timezone.utc)
ago = lambda m: (now - datetime.timedelta(minutes=m)).isoformat()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
NEEDS = [{'key': 'enrollment', 'label': 'Enrollment'}, {'key': 'evv', 'label': 'Clock-in & EVV'}, {'key': 'pay', 'label': 'Pay'},
         {'key': 'attendant_change', 'label': 'Attendant change'}, {'key': 'hours', 'label': 'Hours & care plan'},
         {'key': 'concern', 'label': 'Concern or complaint'}, {'key': 'other', 'label': 'Other'}, {'key': 'not_sure', 'label': 'Not sure yet'}]
PEOPLE = [{'email': 'zach@mo-care.com', 'name': 'Zach'}, {'email': 'samantha@mo-care.com', 'name': 'Samantha'}]
CARDS = [
  {'id': 't1', 'kind': 'followup', 'phone10': '4175550148', 'ref': 'consumer:c1', 'name': 'Loretta Vance', 'role': 'Consumer', 'detail': '', 'owner': 'zach@mo-care.com', 'need': 'attendant_change',
   'needLabel': 'Attendant change', 'events': [{'at': ago(90), 'text': 'Missed call'}, {'at': ago(88), 'text': 'Voicemail, 0:48'}], 'since': ago(90), 'urgent': True, 'urgentWhy': 'has not eaten',
   'voicemailNote': 'attendant did not show this morning', 'contactId': 'g1'},
  {'id': 't2', 'kind': 'followup', 'phone10': '4175550192', 'ref': 'family:lead:p2', 'name': 'Dale Ortiz', 'role': 'Family', 'detail': 'Representative for Ruth Ortiz', 'owner': 'zach@mo-care.com', 'need': 'enrollment',
   'needLabel': 'Enrollment', 'needByHub': True, 'events': [{'at': ago(60 * 26), 'text': 'Text: did the state send the paperwork?'}], 'since': ago(60 * 26), 'urgent': False, 'contactId': 'g2'},
  {'id': 't3', 'kind': 'followup', 'phone10': '4175550107', 'ref': 'family:consumer:c3', 'name': 'Kayla Brooks', 'role': 'Attendant', 'detail': '', 'owner': 'zach@mo-care.com', 'need': 'hours',
   'needLabel': 'Hours & care plan', 'events': [{'at': ago(37), 'text': 'Missed call'}], 'since': ago(37), 'urgent': False, 'contactId': 'g3',
   'forConsumers': [{'id': 'c3', 'name': 'Harold Pierce', 'past': False, 'contactId': 'gh'}]},
  {'id': 't4', 'kind': 'followup', 'phone10': '5735550163', 'ref': None, 'name': 'Marcus Webb', 'role': 'Attendant', 'detail': '', 'owner': 'samantha@mo-care.com', 'need': 'pay',
   'needLabel': 'Pay', 'events': [{'at': ago(150), 'text': 'Text: my check was short'}], 'since': ago(150), 'urgent': False, 'contactId': 'g4',
   'forConsumers': [{'id': 'c3', 'name': 'Harold Pierce', 'past': False, 'contactId': 'gh'}]},
  {'id': 't5', 'kind': 'who_is_this', 'phone10': '8165550121', 'ref': None, 'name': 'Unknown number', 'role': '', 'detail': '', 'owner': 'zach@mo-care.com', 'need': None,
   'needLabel': 'Not sure yet', 'events': [{'at': ago(11), 'text': 'Missed call, no voicemail'}], 'since': ago(11), 'urgent': False, 'candidates': []},
  {'id': 't6', 'kind': 'attendant_confirm', 'phone10': '4175550175', 'ref': None, 'name': 'Tonya Reed', 'owner': None, 'need': None, 'since': ago(20), 'urgent': False,
   'events': [{'at': ago(20), 'text': 'x', 'suggest': {'name': 'Tonya Reed', 'contact': 'T Reed', 'ties': [{'name': 'Loretta Vance'}]}}]},
  {'id': 't7', 'kind': 'followup', 'phone10': '6605550139', 'ref': 'consumer:c7', 'name': 'Gloria Han', 'role': 'Consumer', 'detail': '', 'owner': 'zach@mo-care.com', 'need': 'evv',
   'needLabel': 'Clock-in & EVV', 'events': [{'at': ago(60 * 50), 'text': 'Text: app says no shift today'}], 'since': ago(60 * 50), 'urgent': False, 'later': day(2), 'contactId': 'g7'},
]
SETUP = r"""
async([CARDS, NEEDS, PEOPLE, mode])=>{
  _db = _db || { auth: { getSession: async () => ({ data: { session: null } }) } };
  _store.consumers = []; _store.pipeline = [];
  _store.followupsTable = mode === 'live' ? { live: true, by: 'samantha' } : {};
  _store.consumerComms = { live: true };
  document.getElementById('header_user').textContent = mode === 'staff' ? 'office@caringcds.com' : 'samantha@caringcds.com';
  _fuMe = 'zach@mo-care.com'; _commPeople = []; _fuOwner = 'all'; _fuNeed = 'all'; _fuLaterOpen = ''; _fuCheckOpen = false;
  const Q = () => ({ live: true, today: new Date().toLocaleDateString('en-CA'), state: { last_run: new Date().toISOString() }, cards: JSON.parse(JSON.stringify(CARDS)), needs: NEEDS, people: PEOPLE,
    closedToday: [{ title: 'Ruth Ortiz', done_by: 'Zach', closed_reason: 'called', done_at: new Date().toISOString() }] });
  _comm = Q();
  window.CALLS = []; _commCall = async b => { CALLS.push(b); return b.action === 'queue' ? Q() : {}; };
  try { ['fuTable', 'fuView', 'fuTableF'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  if (mode === 'preview') localStorage.setItem('fuTable', '1');
  if (window.FUT) FUT.clear();
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
  const pg = document.getElementById('page-followups'); pg.style.display = 'block'; pg.classList.add('active');
  for (let el = pg; el; el = el.parentElement) { if (getComputedStyle(el).display === 'none') el.style.display = 'block'; }
  await renderFollowups(false);
  return true;
}"""
READ = r"""
()=>{
  const rows = [...document.querySelectorAll('#fuCards table.fut-t tbody tr')].map(tr => { const td = [...tr.children];
    return { name: (td[0].querySelector('.lt-name') || td[0]).textContent.trim(), txt: tr.textContent, cells: td.map(x => x.textContent.trim()), cls: tr.className }; });
  return { rows, heads: [...document.querySelectorAll('#fuCards table.fut-t thead th')].map(x => x.textContent.trim()),
    tiles: [...document.querySelectorAll('#fuTiles .fu-tile')].map(x => x.textContent.trim()), chart: (document.querySelector('#fuTiles .fut-chart') || {}).textContent || '',
    menus: [...document.querySelectorAll('#fuFilters .lt-m > span')].map(x => x.textContent), banner: document.getElementById('fuBanner').textContent,
    oldCards: document.querySelectorAll('#fuCards article.ld-card').length, closed: document.getElementById('fuClosedSum').textContent };
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) else None)  # the Supabase library is blocked on purpose (offline)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    A = [CARDS, NEEDS, PEOPLE]
    ck('the page loads the table file', pg.evaluate('()=>!!window.FUT'))
    pg.evaluate(SETUP, A + ['off']); pg.wait_for_timeout(200)
    R0 = pg.evaluate(READ)
    ck('switch off: today\'s cards, no table', not R0['rows'] and R0['oldCards'] >= 6, R0)
    ck('switch off: the owner sees Preview it (only me)', 'Follow-ups as a table: Off' in R0['banner'] and 'Preview it (only me)' in R0['banner'], R0['banner'])
    pg.screenshot(path=os.path.join(OUT, 'fut_off_cards.png'))
    pg.evaluate(SETUP, A + ['staff']); pg.wait_for_timeout(200)
    R1 = pg.evaluate(READ)
    ck('office staff see no preview and no table while it is off', 'Follow-ups as a table' not in R1['banner'] and not R1['rows'], R1['banner'])
    pg.evaluate(SETUP, A + ['preview']); pg.wait_for_timeout(300)
    R = pg.evaluate(READ); by = {r['name']: r for r in R['rows']}
    ck('owner preview: the table instead of the cards', len(R['rows']) == 7 and R['oldCards'] == 0, R)
    ck('the columns', R['heads'] == ['Who', 'What came in', 'Need', 'Owner', 'When', 'Waiting', 'Call or text', 'Move it', 'Done'], R['heads'])
    names = [r['name'] for r in R['rows']]
    ck('care or safety first, later this week last', names[0] == 'Loretta Vance' and names[-1] == 'Gloria Han', names)
    ck('red edge on care or safety, gold on today', 'lt-now' in by['Loretta Vance']['cls'] and 'lt-today' in by['Dale Ortiz']['cls'] and 'lt-' not in by['Gloria Han']['cls'].replace('lt-r', ''), [r['cls'] for r in R['rows']])
    lv = by['Loretta Vance']
    ck('Loretta: events, voicemail, why, need, owner, Care or safety pill, waiting 1 h 30 m', 'Voicemail, 0:48' in lv['cells'][1] and 'attendant did not show' in lv['cells'][1] and 'has not eaten' in lv['cells'][1]
       and 'Care or safety today' in lv['cells'][4] and lv['cells'][5].startswith('1 h 3') and 'Not care or safety' in lv['cells'][7], lv['cells'])
    ck('Need and Owner are dropdowns with the saved values', pg.evaluate("()=>document.getElementById('futNeed_t1').value === 'attendant_change' && document.getElementById('futOwner_t1').value === 'zach@mo-care.com'"))
    ck('Dale: the hub picked it, since yesterday in red', 'The hub picked it' in by['Dale Ortiz']['cells'][2] and by['Dale Ortiz']['cells'][5] == 'Since yesterday' and 'lt-red' in pg.evaluate("()=>[...document.querySelectorAll('#fuCards tbody tr')][1].children[5].innerHTML"), by['Dale Ortiz']['cells'])
    ck('Kayla (attendant): the call goes to Harold, the boss', 'Call or text Harold' in by['Kayla Brooks']['cells'][6] and 'Harold is the boss' in by['Kayla Brooks']['cells'][0], by['Kayla Brooks']['cells'])
    ck('Marcus (pay): stays with the attendant', by['Marcus Webb']['cells'][6] == 'Call or text back' and 'Pay and clock-in stay with the attendant' in by['Marcus Webb']['cells'][0], by['Marcus Webb']['cells'])
    ck('Marcus (2 h 30 m): gold waiting', 'lt-gold' in pg.evaluate("()=>[...document.querySelectorAll('#fuCards tbody tr')].find(t => t.textContent.includes('Marcus')).children[5].innerHTML"))
    w = by.get('Who is this?', {})
    ck('Who is this?: picker right in the row, with Not for CDS', 'Not for CDS' in w.get('txt', '') and pg.evaluate("()=>!!document.getElementById('fuWho_t5')"), w)
    t = by.get('Is this Tonya Reed?', {})
    ck('Is this Tonya Reed?: Yes and No in the row', 'Yes, it is Tonya' in t.get('txt', '') and 'T Reed' in t.get('txt', ''), t)
    g = by['Gloria Han']
    ck('Gloria (later): Back <day>, no waiting, Change the day', 'Back ' in g['cells'][4] and g['cells'][5] == '–' and 'Change the day' in g['cells'][7], g['cells'])
    ck('the tiles: 1 care or safety, 5 today, 1 later, check-ins', R['tiles'][0].startswith('1') and R['tiles'][1].startswith('5') and R['tiles'][2].startswith('1') and 'check-ins done' in R['tiles'][3], R['tiles'])
    ck('the today tile says how many waited since yesterday', '1 waiting since yesterday' in R['tiles'][1], R['tiles'][1])
    ck('the waiting bar counts the open ones for today', 'Under 1 hour3' in R['chart'] and '1 to 4 hours2' in R['chart'] and 'Since yesterday or more1' in R['chart'], R['chart'])
    ck('menus: When, Need, Owner in one row', R['menus'] == ['When', 'Need', 'Owner'], R['menus'])
    ck('closed today still shows', '1 closed today' in R['closed'], R['closed'])
    pg.screenshot(path=os.path.join(OUT, 'fut_table.png'), full_page=False)
    pg.evaluate("()=>FUT.when('urgent')"); pg.wait_for_timeout(150)
    ck('tapping the care or safety tile shows only those, and is remembered', [r['name'] for r in pg.evaluate(READ)['rows']] == ['Loretta Vance'] and pg.evaluate("()=>JSON.parse(localStorage.getItem('fuTableF')).when === 'urgent'"))
    pg.evaluate("()=>{ FUT.clear(); const s = [...document.querySelectorAll('#fuFilters .lt-m')].find(l => l.textContent.startsWith('Owner')).querySelector('select'); s.value = 'samantha@mo-care.com'; s.dispatchEvent(new Event('change')); }"); pg.wait_for_timeout(150)
    ck('Owner menu filters and is remembered', [r['name'] for r in pg.evaluate(READ)['rows']] == ['Marcus Webb'] and pg.evaluate("()=>JSON.parse(localStorage.getItem('fuTableF')).owner === 'samantha@mo-care.com'"))
    pg.evaluate("()=>FUT.pick('need','evv')"); pg.wait_for_timeout(150)
    ck('nothing matches: says so', 'Nothing here for these filters' in pg.evaluate("()=>document.getElementById('fuCards').textContent"))
    pg.evaluate("()=>FUT.clear()"); pg.wait_for_timeout(150)
    ck('Clear filters brings everyone back', len(pg.evaluate(READ)['rows']) == 7)
    ck('changing Need saves with the same call as the card', pg.evaluate("""async()=>{ const s = document.getElementById('futNeed_t2'); s.value = 'pay'; s.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 100));
      return CALLS.some(c => c.action === 'set_need' && c.id === 't2' && c.need === 'pay'); }"""))
    ck('Care or safety button saves urgent', pg.evaluate("""async()=>{ const tr = [...document.querySelectorAll('#fuCards tbody tr')].find(t => t.textContent.includes('Dale Ortiz'));
      [...tr.querySelectorAll('button')].find(b => b.textContent === 'Care or safety').click(); await new Promise(r => setTimeout(r, 100));
      return CALLS.some(c => c.action === 'urgent' && c.id === 't2' && c.on === true); }"""))
    ck('Later this week opens the day picks under the row, a pick saves', pg.evaluate("""async()=>{ const tr = () => [...document.querySelectorAll('#fuCards tbody tr')].find(t => t.textContent.includes('Dale Ortiz'));
      [...tr().querySelectorAll('button')].find(b => b.textContent === 'Later this week').click(); await new Promise(r => setTimeout(r, 100));
      const picks = tr().querySelectorAll('.fut-days button'); if (picks.length < 6) return false; picks[0].click(); await new Promise(r => setTimeout(r, 100));
      return CALLS.some(c => c.action === 'later' && c.id === 't2' && /^\\d{4}-/.test(c.date)); }"""))
    ck('Done closes it with the same call as the card', pg.evaluate("""async()=>{ const tr = [...document.querySelectorAll('#fuCards tbody tr')].find(t => t.textContent.includes('Gloria Han'));
      [...tr.querySelectorAll('button')].find(b => b.textContent === 'Done').click(); await new Promise(r => setTimeout(r, 100)); return CALLS.some(c => c.action === 'done' && c.id === 't7'); }"""))
    ck('Yes, it is Tonya answers with the same call as the card', pg.evaluate("""async()=>{ const tr = [...document.querySelectorAll('#fuCards tbody tr')].find(t => t.textContent.includes('Is this Tonya'));
      [...tr.querySelectorAll('button')].find(b => b.textContent.startsWith('Yes')).click(); await new Promise(r => setTimeout(r, 100)); return CALLS.some(c => c.action === 'attendant_answer' && c.id === 't6' && c.yes === true); }"""))
    ck('a name opens their profile (consumer, and family of a lead opens the lead)', pg.evaluate("""()=>{ let a = null, l = null; const o1 = window.openProfile, o2 = window.openLeadProfile;
      window.openProfile = id => { a = id; }; window.openLeadProfile = id => { l = id; };
      const nb = n => [...document.querySelectorAll('#fuCards table.fut-t .lt-name')].find(b => b.textContent === n);
      nb('Loretta Vance').click(); nb('Dale Ortiz').click(); window.openProfile = o1; window.openLeadProfile = o2; return a === 'c1' && l === 'p2'; }"""))
    ck('Call or text back opens the GoHighLevel contact in a new tab', pg.evaluate("()=>{ const a = [...document.querySelectorAll('#fuCards table.fut-t a.lt-b')].find(x => x.closest('tr').textContent.includes('Loretta')); return a.target === '_blank' && a.href.endsWith('/contacts/detail/g1'); }"))
    ck('no em dashes in what a person reads', '—' not in pg.evaluate("()=>document.getElementById('page-followups').innerText"))
    ck('the page itself does not scroll sideways (only the table box does)', pg.evaluate("()=>document.documentElement.scrollWidth <= window.innerWidth + 1"))
    # phone
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.evaluate(SETUP, A + ['preview']); pg.wait_for_timeout(300)
    ck('phone: short cards, the wide table hidden', pg.evaluate("()=>getComputedStyle(document.querySelector('#fuCards .lt-wrap')).display === 'none' && document.querySelectorAll('#fuCards .lt-cards .lt-card').length === 7"))
    ck('phone: More opens Need, Owner and Move it', pg.evaluate("""async()=>{ const c = [...document.querySelectorAll('#fuCards .lt-card')].find(x => x.textContent.includes('Dale Ortiz'));
      [...c.querySelectorAll('button')].find(b => b.textContent === 'More').click(); await new Promise(r => setTimeout(r, 100));
      const c2 = [...document.querySelectorAll('#fuCards .lt-card')].find(x => x.textContent.includes('Dale Ortiz')); return !!c2.querySelector('.fut-more select') && c2.textContent.includes('Later this week'); }"""))
    ck('phone: the page does not scroll sideways', pg.evaluate("()=>document.documentElement.scrollWidth <= window.innerWidth + 1"), pg.evaluate("()=>document.documentElement.scrollWidth"))
    pg.screenshot(path=os.path.join(OUT, 'fut_phone.png'), full_page=True)
    pg.set_viewport_size({'width': 1440, 'height': 1000})
    # live
    pg.evaluate(SETUP, A + ['staff']); pg.evaluate("async()=>{ _store.followupsTable = { live: true }; await renderFollowups(false); }"); pg.wait_for_timeout(200)
    ck('switch on: office staff get the table', len(pg.evaluate(READ)['rows']) == 7)
    pg.evaluate("async()=>{ FUT.view('cards'); await new Promise(r => setTimeout(r, 100)); }"); pg.wait_for_timeout(150)
    R2 = pg.evaluate(READ)
    ck('switch on: anyone can go back to the cards on their own computer, and back to the table', not R2['rows'] and R2['oldCards'] >= 6 and 'Show the table' in R2['banner'], R2['banner'])
    pg.evaluate("()=>FUT.view('table')"); pg.wait_for_timeout(150)
    ck('Show the table brings it back', len(pg.evaluate(READ)['rows']) == 7)
    ck('the Switches page lists Follow-ups as a table', pg.evaluate("()=>HUB_SWITCHES.some(h => h.key === 'followupsTable' && h.label === 'Follow-ups as a table')"))
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed')
