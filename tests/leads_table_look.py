"""CDS Leads as one table (Samantha 2026-11-03: "Approve the CDS Leads table as shown, with all six of your picks. Build it
switched off."). The real hub page, served from THIS checkout by the test itself, offline (Supabase is blocked), MADE-UP
people only. Checks the columns, where each kind of lead lands, Waiting on, the chips and their memory, Show closed, the
owner preview, the switch, phone cards, and that with the switch off the Leads page is today's cards. Saves screenshots.
(python3 tests/leads_table_look.py; OUT=<dir> for the screenshots). Needs playwright. Nothing is sent or saved."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
note = lambda n, t='Talked to them.': {'date': day(n), 'text': t}

PIPE = [
  {'id': 'p1', 'name': 'Martha Quill', 'type': 'lead', 'status': 'new', 'fromWebsite': True, 'county': 'Greene', 'phone': '4175550101', 'addedAt': day(-2) + 'T15:00:00Z', 'firstContact': day(-2), 'notes': []},
  {'id': 'p2', 'name': 'Raymond Ortiz', 'type': 'lead', 'status': 'nurturing', 'county': 'Christian', 'phone': '4175550102', 'firstContact': day(-9), 'followup': day(5), 'notes': [note(-9)]},
  {'id': 'p3', 'name': 'Opal Henning', 'type': 'referral', 'status': 'nurturing', 'county': 'Taney', 'firstContact': day(-4), 'followup': day(1), 'notes': [note(-4)]},
  {'id': 'p4', 'name': 'Curtis Bell', 'type': 'referral', 'status': 'submitted', 'county': 'Greene', 'firstContact': day(-30), 'stateSubmit': day(-23), 'referral': {'referralStatus': 'we_did'}, 'notes': [note(-30)]},
  {'id': 'p5', 'name': 'Leona Marsh', 'type': 'pccp', 'status': 'processing', 'county': 'Webster', 'firstContact': day(-14), 'stateSubmit': day(-6), 'dcn': '12345678', 'leavingAgency': 'Other Co', 'transfer': {'emomedChecked': day(-8), 'fusionSubmitted': day(-6)}, 'notes': [note(-14)]},
  {'id': 'p6', 'name': 'Vernon Pike', 'type': 'referral', 'status': 'submitted', 'county': 'Polk', 'firstContact': day(-30), 'stateSubmit': day(-14), 'referral': {'referralStatus': 'we_did'}, 'notes': [note(-30)]},
  {'id': 'p7', 'name': 'Hazel Dunn', 'type': 'referral', 'status': 'authorized', 'county': 'Greene', 'firstContact': day(-40), 'stateSubmit': day(-35), 'referral': {'x': 1}, 'dcn': '87654321', 'hours': 20, 'notes': [note(-40)]},
  {'id': 'p8', 'name': 'Earl Simmons', 'type': 'pccp', 'status': 'transfer_complete', 'county': 'Christian', 'firstContact': day(-33), 'stateSubmit': day(-27), 'dcn': '11112222', 'notes': [note(-33)]},
  {'id': 'p9', 'name': 'Ida Kessler', 'type': 'referral', 'status': 'authorized', 'county': 'Stone', 'firstContact': day(-50), 'stateSubmit': day(-45), 'referral': {'x': 1}, 'notes': [note(-50)],
   'attendant': {'name': 'Sam Helper', 'backgroundResult': None}},
  {'id': 'p11', 'name': 'Office Added', 'type': 'lead', 'status': 'new', 'county': 'Greene', 'firstContact': day(0), 'notes': []},
  {'id': 'p10', 'name': 'Gone Person', 'type': 'lead', 'status': 'closed_inactive', 'county': 'Greene', 'firstContact': day(-60), 'notes': [note(-60)]},
]
PACK = {'p7': {'packet': {'sent_at': day(-2) + 'T15:00:00Z', 'opened_at': day(-1) + 'T15:00:00Z'}, 'status': {'label': '4 of 9 signed', 'done': False, 'consumer_done': False}},
        'p8': {'packet': {'sent_at': day(-5) + 'T15:00:00Z', 'signed_at': day(-1) + 'T15:00:00Z'}, 'status': {'label': 'Signed, needs your agent signature', 'done': False, 'consumer_done': True}},
        'p9': {'packet': {'sent_at': day(-9) + 'T15:00:00Z', 'office_signed_at': day(-3) + 'T15:00:00Z'}, 'status': {'label': 'Done', 'done': True, 'consumer_done': True}}}
SETUP = r"""
async([PIPE, PACK, mode])=>{
  _store.pipeline = PIPE; _store.consumers = []; _leadCalls = [];
  _store.leadsTable = mode === 'live' ? { live: true, by: 'samantha' } : {};
  document.getElementById('header_user').textContent = mode === 'staff' ? 'office@caringcds.com' : 'samantha@caringcds.com';
  window.PKCALLS = [];
  cdsMatchApi = async (a, b) => { PKCALLS.push([a, b]); if (a === 'packetList') return { attendants: [] }; return PACK[b.lead_id] || { packet: null, status: { label: 'Not sent' } }; };
  try { localStorage.removeItem('ldTable'); localStorage.removeItem('ldView'); localStorage.removeItem('ldTableF'); localStorage.removeItem('ldCalm'); } catch (e) {}
  if (mode === 'preview') localStorage.setItem('ldTable', '1');
  if (window.LDT) LDT.clear();
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';   // the sign-in screen (offline, nobody signs in)
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const box = document.getElementById('csub-pipeline'); box.style.display = 'block';
  for (let el = box; el; el = el.parentElement) { if (getComputedStyle(el).display === 'none') el.style.display = 'block'; }
  const cb = document.getElementById('pipeShowClosed'); if (cb) cb.checked = false;
  document.getElementById('ldSearch').value = '';
  renderPipeline(); await new Promise(r => setTimeout(r, 300)); renderPipeline();
  return true;
}"""
READ = r"""
()=>{
  const rows = [...document.querySelectorAll('#ldCards table.lt-t tbody tr')].map(tr => { const td = [...tr.children];
    return { name: td[0].querySelector('.lt-name') ? td[0].querySelector('.lt-name').textContent.trim() : td[0].textContent.trim(), cells: td.slice(1, 8).map(x => x.textContent.trim()),
      wait: td[8] && td[8].textContent.trim(), cb: td[9] && td[9].textContent.trim(), cls: tr.className }; });
  return { rows, heads: [...document.querySelectorAll('#ldCards table.lt-t thead tr:last-child th')].map(x => x.textContent.trim()),
    tabs: [...document.querySelectorAll('#ldSteps .ld-tab')].map(b => b.textContent.trim()), sortHidden: getComputedStyle(document.getElementById('ldSort').closest('label')).display === 'none',
    sw: (document.getElementById('ldWho') || {}).textContent || '' };
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) else None)  # the Supabase library is blocked on purpose (offline)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    ck('the page loads the table file', pg.evaluate('()=>!!window.LDT'))
    pg.evaluate(SETUP, [PIPE, PACK, 'off']); pg.wait_for_timeout(200)
    R0 = pg.evaluate(READ)
    ck('switch off: today\'s cards, step tabs showing, no table', not R0['rows'] and not R0['sortHidden'] and R0['tabs'][0].startswith('All') and pg.evaluate("()=>document.querySelectorAll('#ldCards .ld-row').length > 3"), R0)
    ck('switch off: the owner sees the switch row with Preview', 'Leads as a table: Off' in R0['sw'] and 'Preview it (only me)' in R0['sw'], R0['sw'])
    pg.evaluate(SETUP, [PIPE, PACK, 'staff']); pg.wait_for_timeout(200)
    ck('office staff (not an owner) see no switch and no table while it is off', 'Leads as a table' not in pg.evaluate(READ)['sw'] and not pg.evaluate(READ)['rows'])
    pg.evaluate(SETUP, [PIPE, PACK, 'preview']); pg.wait_for_timeout(400)
    R = pg.evaluate(READ); by = {r['name']: r for r in R['rows']}
    ck('owner preview: the table instead of the cards, the reason tabs on top, no Sort', len(R['rows']) == 10 and R['sortHidden'] and len(R['tabs']) == 8 and R['tabs'][0].startswith('Active Leads 10'), R)
    ck('the columns', R['heads'] == ['Person', 'First call', 'Referral or PCCP answers', 'Sent to the state', 'State approved', 'Enrollment packet', 'Attendant', 'Move to Consumers', 'Waiting on', 'Call back on', 'Days on this step'], R['heads'])
    ck('closed leads are not in the table', 'Gone Person' not in by)
    m = by.get('Martha Quill', {})
    ck('Martha (new, no call yet, came in 2 days ago): red Log a call, red edge, Office', m.get('cells', [''])[0].startswith('Log a call') and 'no call yet' in m['cells'][0] and 'lt-now' in m['cls'] and m['wait'].startswith('Office'), m)
    oa = by.get('Office Added', {})
    ck('a lead the office added with no call yet: Log a call in First call, nothing after it', oa.get('cells', [''])[0] == 'Log a call' and oa['cells'][1] == '–', oa)
    r2 = by.get('Raymond Ortiz', {})
    ck('Raymond (still deciding, call back set): First call done, Still deciding, Waiting on Consumer', r2.get('cells', ['', ''])[0].startswith('✓') and r2['cells'][1] == 'Still deciding' and r2['wait'].startswith('Consumer') and r2['cb'], r2)
    o = by.get('Opal Henning', {})
    ck('Opal (referral, no answers yet): Referral answers button, Office', o.get('cells', ['', ''])[1] == 'Referral answers' and o['wait'].startswith('Office'), o)
    c = by.get('Curtis Bell', {})
    ck('Curtis (23 days with the state): red Call DSDS, red edge', 'Call DSDS' in c.get('cells', [''] * 4)[3] and 'lt-now' in c['cls'] and c['cells'][2].startswith('✓'), c)
    l = by.get('Leona Marsh', {})
    ck('Leona (PCCP, day 6): sent with eMOMED and FUSION ticks, Day 6, Waiting on State', 'eMOMED ✓' in l.get('cells', [''] * 4)[2] and 'FUSION ✓' in l['cells'][2] and l['cells'][3].startswith('Day 6') and l['wait'].startswith('State'), l)
    v = by.get('Vernon Pike', {})
    ck('Vernon (day 14): gold, check in this week', v.get('cells', [''] * 4)[3].startswith('Day 14') and 'lt-today' in v['cls'] and 'Check in with the state' in v['wait'], v)
    h = by.get('Hazel Dunn', {})
    ck('Hazel (approved, packet 4 of 9): State approved with DCN and hours, packet waiting, Waiting on Consumer, Move button', 'DCN 87654321' in h.get('cells', [''] * 7)[3] and '20 hrs' in h['cells'][3] and h['cells'][4] == '4 of 9 signed' and h['wait'].startswith('Consumer') and h['cells'][6] == 'Move to Consumers', h)
    e = by.get('Earl Simmons', {})
    ck('Earl (packet signed by them): Sign as agent, Office', e.get('cells', [''] * 5)[4] == 'Sign as agent' and e['wait'].startswith('Office'), e)
    i = by.get('Ida Kessler', {})
    ck('Ida (packet done, attendant check not back): packet ticked, attendant waiting, Waiting on Attendant', i.get('cells', [''] * 6)[4].startswith('✓') and 'Sam Helper' in i['cells'][5] and i['wait'].startswith('Attendant'), i)
    ck('the top is just the title, Add someone, the tabs and search: no count, Show closed, help, summary or filter menus', pg.evaluate("""()=>{
      const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
      return !shown(document.getElementById('ldCount')) && !shown(document.getElementById('pipeShowClosed').closest('label')) && !shown(document.querySelector('#csub-pipeline .ld-helpbtn'))
        && !shown(document.getElementById('ldSummary')) && !document.querySelector('#ldCards .lt-bar') && !document.querySelector('#ldCards .lt-m') && shown(document.getElementById('ldSearch')) && shown(document.querySelector('#csub-pipeline .ld-add')); }"""))
    ck('the owner switch rows fold into one closed line, under the list', pg.evaluate("()=>{ const d = document.querySelector('#ldWho details.ld-sws'); const w = document.getElementById('ldWho'); return !!d && !d.open && d.textContent.includes('Leads as a table') && w.previousElementSibling === document.getElementById('ldPager'); }"))
    ck('call notes waiting still show at the top', pg.evaluate("()=>{ const o = window.cnFor; window.cnFor = (k, id) => id === 'p2' ? [{ id: 'n1' }] : []; const o2 = window.cnPanelHtml; window.cnPanelHtml = () => ''; renderPipeline(); const t = document.getElementById('ldSummary'); const ok = getComputedStyle(t).display !== 'none' && /1 call note is waiting/.test(t.textContent) && !/people right now/.test(t.textContent); window.cnFor = o; window.cnPanelHtml = o2; renderPipeline(); return ok; }"))
    ck('each packet is asked once, and the attendant list once (not on every redraw)', pg.evaluate("()=>{ const n = PKCALLS.length; renderPipeline(); renderPipeline(); return n > 0 && PKCALLS.length === n && PKCALLS.every(c => ['enrollGet', 'packetList'].includes(c[0])) && PKCALLS.filter(c => c[0] === 'packetList').length <= 1; }"))
    ck('an old saved filter from the menus can not hide anyone now', pg.evaluate("()=>{ localStorage.setItem('ldTableF', JSON.stringify({ hold: 'state' })); renderPipeline(); return document.querySelectorAll('#ldCards table.lt-t tbody tr').length === 10; }"))
    pg.evaluate("()=>{ LDT.clear(); document.getElementById('ldSearch').value = 'polk'; renderPipeline(); }"); pg.wait_for_timeout(150)
    ck('search finds a county', [r['name'] for r in pg.evaluate(READ)['rows']] == ['Vernon Pike'], pg.evaluate(READ)['rows'])
    pg.evaluate("()=>{ document.getElementById('ldSearch').value = ''; renderPipeline(); }")
    # ---- the reason tabs (her ask 2026-11-05)
    EXTRA = [
      {'id': 'm1', 'name': 'Due Medic', 'type': 'lead', 'status': 'closed_no_medicaid', 'county': 'Greene', 'phone': '4175550111', 'medicaidApplying': True, 'medicaidCheck': day(-2), 'closedAt': day(-32), 'notes': [note(-32, 'Closed: No Medicaid (applying for Medicaid)')]},
      {'id': 'm2', 'name': 'Later Medic', 'type': 'lead', 'status': 'closed_no_medicaid', 'county': 'Greene', 'medicaidApplying': False, 'medicaidCheck': day(20), 'closedAt': day(-3), 'notes': [note(-3)]},
      {'id': 'a1', 'name': 'Far Away', 'type': 'lead', 'status': 'closed_area', 'county': 'Jasper', 'closedAt': day(-5), 'notes': [note(-5)]},
      {'id': 'a2', 'name': 'Far Too', 'type': 'lead', 'status': 'closed_area', 'county': 'Jasper', 'closedAt': day(-4), 'notes': [note(-4)]},
      {'id': 's1', 'name': 'State Nope', 'type': 'referral', 'status': 'closed_state_no', 'stateNoWhy': 'level', 'closedAt': day(-6), 'notes': [note(-6)]},
      {'id': 'n1', 'name': 'No Helper', 'type': 'lead', 'status': 'closed_no_attendant', 'closedAt': day(-7), 'notes': [note(-7)]},
      {'id': 'g1', 'name': 'Rest Peace', 'type': 'lead', 'status': 'closed_passed', 'closedAt': day(-8), 'notes': [note(-8)]},
      {'id': 'v1', 'name': 'Moved Mary', 'type': 'referral', 'status': 'authorized', 'movedToConsumers': True, 'firstContact': day(-70), 'notes': [note(-70)]},
    ]
    pg.evaluate(SETUP, [PIPE + EXTRA, PACK, 'preview']); pg.wait_for_timeout(300)
    T = pg.evaluate(READ)
    names = [' '.join(w for w in t.split(' ') if not w[0].isdigit() and w not in ('late', 'due')) for t in T['tabs']]
    ck('eight tabs in order', names == ['Active Leads', 'No Medicaid', 'Needs an Attendant', 'State Said No', 'Out of Service Area', 'Inactive Leads', 'Moved to Consumers', 'Closed for Good'], T['tabs'])
    ck('Active Leads counts the due Medicaid check back; No Medicaid shows 2 with 1 due', T['tabs'][0].startswith('Active Leads 11') and T['tabs'][1] == 'No Medicaid 21 due', T['tabs'])
    ck('the due check back is the first row on Active Leads, red, with Log a call and They have Medicaid now', T['rows'][0]['name'] == 'Due Medic' and 'lt-now' in T['rows'][0]['cls'] and 'Log a call' in T['rows'][0]['cells'][0] and 'They have Medicaid now' in T['rows'][0]['cells'][0], T['rows'][:1])
    ck('Later Medic (check back in 20 days) is not on Active Leads', 'Later Medic' not in [r['name'] for r in T['rows']])
    CT = """()=>[...document.querySelectorAll('#ldCards table.lt-t tbody tr')].map(tr => [...tr.children].map(td => (td.querySelector('input') ? td.querySelector('input').value : td.textContent).trim()))"""
    pg.evaluate("()=>LDT.tab('med')"); pg.wait_for_timeout(100)
    med = pg.evaluate(CT)
    ck('No Medicaid tab: due one first, applying or not, the check back date, Log a call', [r[0][:9] for r in med] == ['Due Medic', 'Later Med'] and med[0][1] == 'Yes, applying' and med[1][1] == 'Not right now' and med[1][2] == day(20) and 'Log a call' in med[0][4], med)
    ck('changing the check back date saves it with a note', pg.evaluate("""()=>{ const i = document.getElementById('ltMed_m2'); i.value = '""" + day(40) + """'; i.dispatchEvent(new Event('change'));
      const p = _store.pipeline.find(x => x.id === 'm2'); return p.medicaidCheck === '""" + day(40) + """' && /Medicaid check back set/.test(p.notes.slice(-1)[0].text); }"""))
    ck('They have Medicaid now reopens them onto Active Leads', pg.evaluate("""()=>{ const tr = [...document.querySelectorAll('#ldCards tbody tr')].find(t => t.textContent.includes('Later Medic')); [...tr.querySelectorAll('button')].find(b => b.textContent === 'They have Medicaid now').click(); closeModal('editPipelineModal');
      const p = _store.pipeline.find(x => x.id === 'm2'); LDT.tab('active'); const on = [...document.querySelectorAll('#ldCards .lt-name')].some(b => b.textContent === 'Later Medic');
      const gone = p.status === 'nurturing' && !('medicaidCheck' in p); p.status = 'closed_no_medicaid'; p.medicaidCheck = '""" + day(20) + """'; renderPipeline(); return on && gone; }"""))
    ck('Close as No Medicaid asks if they are applying and sets a check back 30 days out', pg.evaluate("""()=>{ openCloseLead('p2'); clNoMedicaid(); const d = document.getElementById('cl_medDate').value;
      closeLeadAs('closed_no_medicaid', 'yes'); const p = _store.pipeline.find(x => x.id === 'p2');
      const ok = d === '""" + day(30) + """' && p.status === 'closed_no_medicaid' && p.medicaidApplying === true && p.medicaidCheck === d && /applying for Medicaid; check back/.test(p.notes.slice(-1)[0].text);
      reopenLead('p2'); p.followup = '""" + day(5) + """'; renderPipeline(); return ok; }"""))
    ck('Log a call on a No Medicaid lead: the call back date becomes the next check back, the lead stays closed', pg.evaluate("""()=>{ openPipelineEdit('m1'); const pre = document.getElementById('ep_followup').value;
      document.getElementById('ep_followup').value = '""" + day(30) + """'; savePipelineUpdate(); const p = _store.pipeline.find(x => x.id === 'm1');
      const ok = pre === '""" + day(-2) + """' && p.status === 'closed_no_medicaid' && p.medicaidCheck === '""" + day(30) + """' && !p.followup; p.medicaidCheck = '""" + day(-2) + """'; renderPipeline(); return ok; }"""))
    pg.evaluate("()=>LDT.tab('area')"); pg.wait_for_timeout(100)
    ck('Out of Service Area: both Jasper leads, with a count by county', pg.inner_text('#ldCards').count('Jasper County') == 2 and 'By county: Jasper 2' in pg.inner_text('#ldCards'), pg.inner_text('#ldCards')[:400])
    pg.evaluate("()=>LDT.tab('stateno')"); pg.wait_for_timeout(100)
    ck('State Said No shows why', 'Did not meet the level of care' in pg.inner_text('#ldCards'))
    pg.evaluate("()=>LDT.tab('att')"); pg.wait_for_timeout(100)
    ck('Needs an Attendant has No Helper with Reopen', 'No Helper' in pg.inner_text('#ldCards') and 'Reopen' in pg.inner_text('#ldCards'))
    pg.evaluate("()=>LDT.tab('inactive')"); pg.wait_for_timeout(100)
    ck('Inactive Leads has Gone Person', 'Gone Person' in pg.inner_text('#ldCards'))
    pg.evaluate("()=>LDT.tab('moved')"); pg.wait_for_timeout(100)
    ck('Moved to Consumers has Moved Mary with Open, no Reopen', 'Moved Mary' in pg.inner_text('#ldCards') and 'Reopen' not in pg.inner_text('#ldCards'))
    pg.evaluate("()=>LDT.tab('gone')"); pg.wait_for_timeout(100)
    ck('Closed for Good: passed away, and no Reopen for them', 'Rest Peace' in pg.inner_text('#ldCards') and 'Reopen' not in pg.inner_text('#ldCards'))
    box = pg.locator('#csub-pipeline').bounding_box()
    pg.evaluate("()=>LDT.tab('med')"); pg.wait_for_timeout(100)
    pg.screenshot(path=os.path.join(OUT, 'cds_lt_nomedicaid.png'), clip={'x': box['x'], 'y': box['y'], 'width': box['width'], 'height': 700}, full_page=True)
    pg.evaluate("()=>{ LDT.tab('active'); document.getElementById('ldSearch').value = 'jasper'; renderPipeline(); }"); pg.wait_for_timeout(100)
    ck('a search counts matches on every tab', pg.evaluate(READ)['tabs'][4] == 'Out of Service Area 2' and pg.evaluate(READ)['tabs'][0].startswith('Active Leads 0'), pg.evaluate(READ)['tabs'])
    pg.evaluate(SETUP, [PIPE, PACK, 'preview']); pg.wait_for_timeout(300)
    ck('a name opens the lead profile', pg.evaluate("""()=>{ let got = null; const o = window.openLeadProfile; window.openLeadProfile = id => { got = id; };
      [...document.querySelectorAll('#ldCards .lt-name')].find(b => b.textContent === 'Hazel Dunn').click(); window.openLeadProfile = o; return got === 'p7'; }"""))
    ck('Move to Consumers runs the same move as the card', pg.evaluate("""()=>{ let got = null; const o = window.convertToConsumer; window.convertToConsumer = id => { got = id; };
      const tr = [...document.querySelectorAll('#ldCards tbody tr')].find(t => t.textContent.includes('Hazel Dunn')); [...tr.querySelectorAll('button')].find(b => b.textContent === 'Move to Consumers').click();
      window.convertToConsumer = o; return got === 'p7'; }"""))
    ck('a lead with no attendant has an Add button in the Attendant column', '+' not in by['Hazel Dunn']['cells'][5] and by['Hazel Dunn']['cells'][5] == 'Add', by['Hazel Dunn']['cells'])
    ck('Add attaches an attendant (pick from the Caregiver Pool or type), saves a note, and the row shows them', pg.evaluate("""()=>{
      _store.pipeline.push({ id: 'pool1', name: 'Pat Pooler', type: 'lead', status: 'closed_pool', phone: '4175550199', notes: [] });
      const tr = [...document.querySelectorAll('#ldCards tbody tr')].find(t => t.textContent.includes('Hazel Dunn'));
      [...tr.querySelectorAll('button')].find(b => b.textContent === 'Add').click();
      const picks = [...document.querySelectorAll('#la_picks button')].map(b => b.textContent);
      const noRemove = getComputedStyle(document.getElementById('la_remove')).display === 'none';
      [...document.querySelectorAll('#la_picks button')].find(b => b.textContent.includes('Pat Pooler')).click();
      const phone = document.getElementById('la_phone').value; saveLeadAttendant();
      const h = _store.pipeline.find(x => x.id === 'p7'), row = [...document.querySelectorAll('#ldCards tbody tr')].find(t => t.textContent.includes('Hazel Dunn'));
      const ok = noRemove && picks.some(x => x.includes('Caregiver Pool')) && phone === '(417) 555-0199' && h.attendant.name === 'Pat Pooler' && h.caregiverPlan === 'has'
        && /Attendant added: Pat Pooler/.test(h.notes.slice(-1)[0].text) && row.children[6].textContent.includes('Pat Pooler');
      _store.pipeline = _store.pipeline.filter(x => x.id !== 'pool1'); h.attendant = null; delete h.caregiverPlan; renderPipeline(); return ok; }"""))
    ck('changing to a different person starts their checklist fresh; taking them off clears it', pg.evaluate("""()=>{
      const i = _store.pipeline.find(x => x.id === 'p9'); i.attendant.empeonInvited = '2026-11-01';
      openLeadAttendant('p9'); document.getElementById('la_name').value = 'New Person'; saveLeadAttendant();
      const fresh = i.attendant.name === 'New Person' && !i.attendant.empeonInvited && /changed from Sam Helper to New Person/.test(i.notes.slice(-1)[0].text);
      openLeadAttendant('p9'); removeLeadAttendant(); const off = i.attendant === null;
      i.attendant = { name: 'Sam Helper', backgroundResult: null }; renderPipeline(); return fresh && off; }"""))
    ck('no em dashes in the table', pg.evaluate("()=>document.getElementById('ldCards').textContent.indexOf('\\u2014') < 0"))
    box = pg.locator('#csub-pipeline').bounding_box()
    pg.screenshot(path=os.path.join(OUT, 'cds_lt_desktop.png'), clip={'x': box['x'], 'y': box['y'], 'width': box['width'], 'height': min(1200, box['height'])}, full_page=True)
    # live for everyone, then this computer picks the cards, then back
    pg.evaluate(SETUP, [PIPE, PACK, 'live']); pg.wait_for_timeout(300)
    ck('live: everyone sees the table (office staff too)', pg.evaluate("()=>{ document.getElementById('header_user').textContent='office@caringcds.com'; renderPipeline(); return document.querySelectorAll('#ldCards table.lt-t tbody tr').length === 10; }"))
    ck('live: a person can show the cards on their own computer, and get the table back', pg.evaluate("""()=>{ LDT.view('cards'); const cards = !document.querySelector('#ldCards table.lt-t') && document.querySelectorAll('#ldCards .ld-row').length > 3 && getComputedStyle(document.getElementById('ldSteps')).display !== 'none' && document.getElementById('ldWho').textContent.includes('Show the table');
      LDT.view('table'); return cards && !!document.querySelector('#ldCards table.lt-t'); }"""))
    ck('no script errors', not errs, errs)
    m2 = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    m2.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    m2.goto(f'http://127.0.0.1:{PORT}/index.html'); m2.wait_for_timeout(1500)
    m2.evaluate(SETUP, [PIPE, PACK, 'preview']); m2.wait_for_timeout(400)
    mob = m2.evaluate("()=>({ cards: document.querySelectorAll('#ldCards .lt-card').length, table: getComputedStyle(document.querySelector('#ldCards .lt-wrap')).display })")
    ck('phone: one card per person, no table', mob['cards'] == 10 and mob['table'] == 'none', mob)
    box = m2.locator('#csub-pipeline').bounding_box()
    m2.screenshot(path=os.path.join(OUT, 'cds_lt_phone.png'), clip={'x': 0, 'y': box['y'], 'width': 390, 'height': min(2400, box['height'])}, full_page=True)
    b.close()
print(f'\n{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
