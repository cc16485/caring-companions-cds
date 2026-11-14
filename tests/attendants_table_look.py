"""CDS attendant onboarding as one table (Samantha 2026-11-04: "Approve the CDS attendant onboarding table as shown in the
mockup, with your picks, including the new fingerprints check for anyone who lived out of state. Build it switched off.").
The real Attendants page code and the real hub page, served from THIS checkout by the test itself, offline (Supabase is
blocked), MADE-UP people only. Checks the table is always on with no switch (removed at her ask 2026-11-04), the columns, red and gold edges, the menus and
their memory, the two-tap buttons, Not needed fingerprints, phone cards, and the lead showing the packet's real step.
Saves screenshots. (python3 tests/attendants_table_look.py; OUT=<dir>). Needs playwright. Nothing is sent or saved."""
import os, threading, functools, datetime, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
now = datetime.datetime.now(datetime.timezone.utc)
at = lambda d: (now - datetime.timedelta(days=d)).isoformat()
D = lambda d: {'s': 'done', 't': at(d)}
OFF = {'s': 'off'}; NA = {'s': 'na', 't': 'Not needed'}
def cells(**k):
    base = dict(step1=OFF, orient=OFF, fcsr=OFF, edl=OFF, oig=OFF, fp=NA, invite=OFF, empeon=OFF, call=OFF, i9=OFF, counter=OFF); base.update(k); return base
def person(pid, name, consumer, waiting, c, hold, job, moved, note='', label='Run EDL and FCSR', tone='r', late=None, active=False):
    return {'pool_id': pid, 'name': name, 'consumer': consumer, 'consumer_waiting': waiting, 'label': label, 'tone': tone, 'next': 'Next thing.', 'active': active,
            'step1_at': at(20), 'started_at': at(21), 'updated_at': at(moved), 'late_since': late, 'active_at': at(1) if active else None,
            'table': None if active else {'cells': c, 'hold': hold, 'note': note, 'job': job, 'moved': at(moved), 'fp_needed': c['fp']['s'] != 'na'}}
LIST = [
  person('a1', 'Jeana Wise', 'Shasta Reed', True, cells(step1=D(7), orient=D(6), fcsr={'s': 'todo', 't': 'Copy for FCSR', 'act': 'open'}, edl={'s': 'todo', 't': 'Copy for EDL', 'act': 'open'}, oig=D(6)), 'office', 'fcsr', 4),
  person('a2', 'Nora Kidd', 'Opal Henning', False, cells(step1={'s': 'done', 't': '2026-11-02T19:14:00Z'}, orient=D(13), fcsr=D(12), edl={'s': 'done', 't': '2026-11-03'}, oig=D(12), fp={'s': 'wait', 't': 'Sent', 'at': at(11), 'act': 'open', 'btn': 'Clear: add the result'}), 'fingerprints', 'fp', 11, 'Lived outside Missouri: fingerprints sent', 'Waiting on fingerprints', 'y'),
  person('a3', 'Ray Holcomb', 'Ida Kessler', False, cells(step1=D(9), orient=D(8), fcsr={'s': 'wait', 't': 'Good Cause Waiver', 'warn': True}, edl=D(8), oig=D(8)), 'state', 'fcsr', 3, 'Waiting on Good Cause Waiver', 'Waiting on Good Cause Waiver', 'y'),
  person('a4', 'Dee Ashford', 'Vernon Pike', False, cells(step1=D(10), orient=D(9), fcsr=D(7), edl=D(7), oig=D(7), invite={'s': 'todo', 't': 'Empeon invite sent', 'act': 'empeon_invited'}, counter={'s': 'todo', 't': 'Countersign', 'act': 'open'}), 'office', 'invite', 1, '', 'Send Empeon invite', 'r', at(2)),
  person('a5', 'Lena Fry', 'Leona Marsh', False, cells(step1=D(12), orient=D(11), fcsr=D(9), edl=D(9), oig=D(9), invite=D(5), empeon=D(4), call=D(2), i9={'s': 'todo', 't': 'I-9 done in Empeon', 'act': 'i9_done'}, counter=D(2)), 'office', 'i9', 1, '', 'Finish in Empeon'),
  person('a6', 'Marcus Lane', 'Hazel Dunn', True, cells(step1={'s': 'wait', 't': 'Not started', 'warn': True}), 'attendant', 'step1', 1, '', 'Filling out Step 1', 'b'),
  person('a7', 'Gail Reyes', 'Curtis Bell', False, None, 'none', None, 2, label='Active', tone='g', active=True),
]
LIST[5]['step1_at'] = None
SETUP = r"""
async([LIST, mode])=>{
  try { ['hpTable','hpTableF'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  window.SW = { live: mode === 'live', owner: mode !== 'staff', flips: [] };
  window.CALLS = [];
  const api = async (a, b) => { CALLS.push([a, b]); if (a === 'packetList') return { attendants: JSON.parse(JSON.stringify(LIST)) };
    if (a === 'packetGet') return { pool: { first: 'Jeana', last: 'Wise' }, packet: {}, status: { steps: [], label: 'Run EDL and FCSR', tone: 'r', next: 'x' }, screening: { checks: window.CHECKS || [] }, forms: {}, answers: {} };
    if (a === 'recordCheck' && window.CHECKS) { const c = window.CHECKS.find(x => x.key === b.check_key); if (c && b.result === 'clear') { c.clear = true; c.at = b.checked_on; } } return { ok: true }; };
  const { mountHubPacket } = await import('./caregiver-match/hub-packet.js?v=28');
  let host = document.getElementById('att_test'); if (host) host.remove();
  host = document.createElement('div'); host.id = 'att_test'; host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#f6f7f5;z-index:99999;padding:16px';
  document.body.appendChild(host);
  const el = document.createElement('div'); host.appendChild(el);
  mountHubPacket(el, { api, roster: () => [], wellsky: () => null });
  await new Promise(r => setTimeout(r, 400));
  return true;
}"""
READ = r"""
()=>{
  const el = document.getElementById('att_test');
  const rows = [...el.querySelectorAll('table.at tbody tr')].map(tr => { const td = [...tr.children];
    return { name: td[0].querySelector('.at-name').textContent.trim(), cls: tr.className, cells: td.slice(1).map(x => x.textContent.trim()) }; });
  return { rows, heads: [...el.querySelectorAll('table.at thead tr:last-child th')].map(x => x.textContent.trim()),
    sw: (el.querySelector('.at-switch') || {}).textContent || '', sum: (el.querySelector('.at-menus .sumr') || {}).textContent || '',
    list: el.querySelectorAll('.row').length, text: el.textContent };
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)

    pg.evaluate(SETUP, [LIST, 'live']); R = pg.evaluate(READ); by = {r['name']: r for r in R['rows']}
    ck('the table, one row per attendant onboarding, with no switch bar', len(R['rows']) == 7 and not R['sw'] and 'Turn off for everyone' not in R['text'], R['sw'])
    ck('the columns as on the mockup', R['heads'] == ['Attendant', 'Step 1', 'Orientation', 'FCSR', 'EDL', 'OIG', 'Fingerprints', 'Empeon invite', 'Empeon', 'ID video check', 'I-9 Section 2', 'Countersign', 'Waiting on', 'Consumer', 'Days quiet'], R['heads'])
    ck('Jeana: red edge (consumer waiting, quiet 4 days), FCSR Order or record, EDL Record (2026-11-06), fingerprints Not needed', by['Jeana Wise']['cls'] == 'now' and 'Order or record' in by['Jeana Wise']['cells'][2] and by['Jeana Wise']['cells'][3] == 'Record' and by['Jeana Wise']['cells'][5] == 'Not needed' and 'Office' in by['Jeana Wise']['cells'][11], by['Jeana Wise'])
    ck('Nora: gold edge (quiet 11 days), fingerprints Sent with Record (2026-11-06), waiting on Fingerprints', by['Nora Kidd']['cls'] == 'quiet' and 'Sent' in by['Nora Kidd']['cells'][5] and 'Record' in by['Nora Kidd']['cells'][5] and by['Nora Kidd']['cells'][11].startswith('Fingerprints'), by['Nora Kidd'])
    T = pg.evaluate('''() => { const tr = [...document.querySelectorAll('table.at tbody tr')].find(r => r.textContent.includes('Nora Kidd'));
      return [...tr.querySelectorAll('td')].map(td => { const x = td.querySelector('[title]'); return x ? x.title + ' | ' + x.textContent : ''; }); }''')
    ck('hover on a done cell: what finished and the full date with the time', T[1] == 'Step 1 signed Monday, November 2, 2026 at 1:14 PM | Nov 2', T[1])
    ck('a check date is that day, not the day before (2026-11-03 shows Nov 3)', T[4] == 'EDL and DMH registry clear Tuesday, November 3, 2026 | Nov 3', T[4])
    ck('hover on fingerprints Sent: the full sent date', T[6].startswith('Sent ') and ' 2026' in T[6], T[6])
    ck('every done cell has a hover date', all(T[i] for i in (1, 2, 3, 4, 5)), T)
    ck('Ray: Good Cause Waiver, waiting on the State', 'Good Cause Waiver' in by['Ray Holcomb']['cells'][2] and by['Ray Holcomb']['cells'][11].startswith('State'), by['Ray Holcomb'])
    ck('Dee: to-do late -> red, the late button says since when', by['Dee Ashford']['cls'] == 'now' and 'To-do late since' in by['Dee Ashford']['cells'][6], by['Dee Ashford'])
    ck('Gail: every step done, waiting on a first shift', 'Every step done' in ' '.join(by['Gail Reyes']['cells']) and 'first shift' in ' '.join(by['Gail Reyes']['cells']), by['Gail Reyes'])
    ck('summary: 7 onboarding, 2 need you now, 2 with a consumer waiting', '7 onboarding' in R['sum'] and '2 need you now' in R['sum'] and '2 with a consumer waiting' in R['sum'], R['sum'])
    ck('dates show as a day, checks with a tick', '✓' not in by['Lena Fry']['cells'][0] and pg.evaluate("()=>getComputedStyle(document.querySelector('#att_test .at-ok'),'::before').content").find('✓') >= 0)
    os.makedirs(OUT, exist_ok=True); pg.screenshot(path=os.path.join(OUT, 'cds-attendants-table.png'), full_page=False)
    hs = pg.evaluate("()=>[...document.querySelectorAll('#att_test table.at tbody tr')].map(tr=>tr.offsetHeight)")
    ck('rows stay short (no row taller than 2 lines of buttons)', max(hs) <= 100, hs)
    pg.evaluate("()=>{const s=document.querySelector('#att_test .at-scroll'); s.scrollLeft=s.scrollWidth}"); pg.wait_for_timeout(100)
    pg.screenshot(path=os.path.join(OUT, 'cds-attendants-table-right.png'), full_page=False)

    # menus
    pg.select_option('#att_test select[data-atk="show"]', 'now'); pg.wait_for_timeout(100); R = pg.evaluate(READ)
    ck('Show: Need you now -> Jeana and Dee', sorted(r['name'] for r in R['rows']) == ['Dee Ashford', 'Jeana Wise'], [r['name'] for r in R['rows']])
    pg.select_option('#att_test select[data-atk="job"]', 'invite'); pg.wait_for_timeout(100); R = pg.evaluate(READ)
    ck('menus combine: Need you now + Empeon invite -> Dee', [r['name'] for r in R['rows']] == ['Dee Ashford'], R['rows'])
    ck('menus remembered in this browser', json.loads(pg.evaluate("()=>localStorage.getItem('hpTableF')")) == {'show': 'now', 'job': 'invite', 'hold': ''})
    pg.click('#att_test [data-act="at-clear"]'); pg.wait_for_timeout(100)
    pg.select_option('#att_test select[data-atk="hold"]', 'fingerprints'); pg.wait_for_timeout(100); R = pg.evaluate(READ)
    ck('Waiting on: Fingerprints -> Nora', [r['name'] for r in R['rows']] == ['Nora Kidd'], R['rows'])
    pg.click('#att_test [data-act="at-clear"]'); pg.wait_for_timeout(100)

    # two taps to save a one-tap step
    pg.click('#att_test [data-atmark="i9_done"]'); pg.wait_for_timeout(100)
    ck('first tap asks again, saves nothing', pg.evaluate("()=>!CALLS.some(c=>c[0]==='packetMark')") and 'Tap again to save' in pg.evaluate(READ)['text'])
    pg.click('#att_test [data-atmark="i9_done"]'); pg.wait_for_timeout(300)
    ck('second tap saves I-9 for Lena, then the list reloads', pg.evaluate("()=>CALLS.some(c=>c[0]==='packetMark'&&c[1].what==='i9_done'&&c[1].pool_id==='a5')"), pg.evaluate('()=>CALLS'))
    pg.click('#att_test [data-open="packet:a1"].at-name'); pg.wait_for_timeout(200)
    ck('a name opens their packet', pg.evaluate("()=>CALLS.some(c=>c[0]==='packetGet'&&c[1].pool_id==='a1')") and '← All attendants' in pg.evaluate(READ)['text'])

    # Record a check from the table (2026-11-06, her ask: like the Caring Companions Onboarding tab)
    pg.evaluate(SETUP, [LIST, 'live'])
    pg.evaluate("()=>{ window.CHECKS=[{key:'edl',label:'EDL',clear:false},{key:'edr',label:'DMH EDR',clear:false},{key:'oig',label:'OIG',clear:true,at:'2026-10-31'}]; }")
    pg.click('#att_test tr:has(.at-name:text("Jeana Wise")) [data-atrec="edl"]'); pg.wait_for_timeout(250)
    box = pg.evaluate("()=>{ const b=document.querySelector('#att_test .rc-box'); return b ? { text:b.innerText, dates:[...b.querySelectorAll('input[type=date]')].map(i=>[i.value,i.max]) } : null; }")
    today = datetime.date.today().isoformat()
    ck('Record on EDL opens a window over the table with EDL and the DMH registry, today filled in, no later date allowed', box and 'Record EDL and DMH registry: Jeana Wise' in box['text'] and 'EDL' in box['text'] and 'DMH EDR' in box['text'] and len(box['dates']) == 2 and all(d[0] == d[1] for d in box['dates']), box)
    ck('...the table stays put behind it (no packet page)', '← All attendants' not in pg.evaluate(READ)['text'] and len(pg.evaluate(READ)['rows']) >= 6, len(pg.evaluate(READ)['rows']))
    pg.click('#att_test [data-rcsave="edl"]'); pg.wait_for_timeout(150)
    ck('...Clear with no screenshot is refused, nothing saved', 'needs its proof' in pg.evaluate("()=>document.querySelector('#rc_err').textContent") and not pg.evaluate("()=>CALLS.some(c=>c[0]==='recordCheck')"))
    pg.evaluate("()=>{ const i=document.querySelector('#rc_date_edl'); i.removeAttribute('max'); i.value='2099-01-01'; }")
    pg.set_input_files('#rc_file_edl', files=[{'name': 'edl.png', 'mimeType': 'image/png', 'buffer': b'\x89PNG\r\n\x1a\nfake'}])
    pg.click('#att_test [data-rcsave="edl"]'); pg.wait_for_timeout(150)
    ck('...a future date is refused, nothing saved', 'today or earlier' in pg.evaluate("()=>document.querySelector('#rc_err').textContent") and not pg.evaluate("()=>CALLS.some(c=>c[0]==='recordCheck')"))
    pg.evaluate("()=>{ document.querySelector('#rc_date_edl').value='2026-11-02'; }")
    pg.click('#att_test [data-rcsave="edl"]'); pg.wait_for_timeout(400)
    rc = pg.evaluate("()=>CALLS.filter(c=>c[0]==='recordCheck').map(c=>({k:c[1].check_key, r:c[1].result, on:c[1].checked_on, id:c[1].id, proof:!!(c[1].proof&&c[1].proof.data)}))")
    ck('...EDL saved as clear on the picked day with its screenshot', rc == [{'k': 'edl', 'r': 'clear', 'on': '2026-11-02', 'id': 'a1', 'proof': True}], rc)
    left = pg.evaluate("()=>{ const b=document.querySelector('#att_test .rc-box'); return b ? b.innerText : ''; }")
    ck('...the window stays open for the DMH registry, EDL now shows clear', 'DMH EDR' in left and 'Clear' in left and 'data-rcsave="edl"' not in pg.evaluate("()=>document.querySelector('#att_test .rc-box').innerHTML"), left)
    pg.select_option('#rc_res_edr', 'not_clear'); pg.click('#att_test [data-rcsave="edr"]'); pg.wait_for_timeout(400)
    rc2 = pg.evaluate("()=>CALLS.filter(c=>c[0]==='recordCheck'&&c[1].check_key==='edr').map(c=>({r:c[1].result, on:c[1].checked_on, proof:!!(c[1].proof&&c[1].proof.data)}))")
    ck('...Not clear saves without a screenshot (the owners review it)', rc2 == [{'r': 'not_clear', 'on': today, 'proof': False}], rc2)
    pg.click('#att_test .rc-box [data-rcclose]'); pg.wait_for_timeout(150)
    ck('...Close shuts the window', not pg.evaluate("()=>!!document.querySelector('#att_test .rc-box')"))
    pg.click('#att_test tr:has(.at-name:text("Jeana Wise")) [data-atrec="fcsr"]'); pg.wait_for_timeout(250)
    ck('FCSR: Order or record offers Mark as ordered and Save as clear', 'Mark as ordered' in pg.evaluate("()=>document.querySelector('#att_test .rc-box').innerText") and 'Save as clear' in pg.evaluate("()=>document.querySelector('#att_test .rc-box').innerText"))
    pg.click('#att_test [data-rcfcsr="clear"]'); pg.wait_for_timeout(150)
    ck('...FCSR clear with no result page is refused', 'FCSR result page' in pg.evaluate("()=>document.querySelector('#rc_err').textContent") and not pg.evaluate("()=>CALLS.some(c=>c[0]==='packetFcsr')"))
    pg.click('#att_test [data-rcfcsr="pending"]'); pg.wait_for_timeout(400)
    ck('...Mark as ordered records it pending at the state and closes', pg.evaluate("()=>CALLS.some(c=>c[0]==='packetFcsr'&&c[1].result==='pending'&&c[1].pool_id==='a1')") and not pg.evaluate("()=>!!document.querySelector('#att_test .rc-box')"))
    pg.click('#att_test tr:has(.at-name:text("Nora Kidd")) [data-atrec="fp"]'); pg.wait_for_timeout(250)
    ck('Fingerprints sent: Record opens the fingerprint result', 'Record Fingerprints' in pg.evaluate("()=>document.querySelector('#att_test .rc-box').innerText"))
    pg.click('#att_test .rc-box [data-rcopen]'); pg.wait_for_timeout(250)
    ck('...Open their packet goes to the full packet page', '← All attendants' in pg.evaluate(READ)['text'] and not pg.evaluate("()=>!!document.querySelector('#att_test .rc-box')"))

    pg.evaluate(SETUP, [LIST, 'live'])
    # phone
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(200)
    ph = pg.evaluate("()=>({cards: [...document.querySelectorAll('#att_test .at-card')].filter(c=>c.offsetParent).length, table: !!document.querySelector('#att_test .at-scroll').offsetParent, wide: document.getElementById('att_test').scrollWidth > 400})")
    ck('phone: cards, no table, no sideways scroll', ph['cards'] == 7 and not ph['table'] and not ph['wide'], ph)
    pg.screenshot(path=os.path.join(OUT, 'cds-attendants-table-phone.png'), full_page=False)
    pg.set_viewport_size({'width': 1440, 'height': 1000})
    pg.evaluate("()=>document.getElementById('att_test').remove()")

    # the lead shows the packet's real step (always)
    LEAD = r"""
    async([LIST, live])=>{
      _store.attendantsTable = live ? { live: true } : {};
      try { localStorage.removeItem('hpTable'); } catch (e) {}
      _store.pipeline = [{ id: 'L1', name: 'Hazel Dunn', type: 'referral', status: 'authorized', county: 'Greene', notes: [] },
                         { id: 'L2', name: 'Ida Kessler', type: 'referral', status: 'authorized', county: 'Stone', notes: [], attendant: { name: 'Ray Holcomb', backgroundResult: null } },
                         { id: 'L3', name: 'Nobody Matched', type: 'referral', status: 'authorized', county: 'Stone', notes: [], attendant: { name: 'Sam Helper', backgroundResult: null } }];
      _attPk = { at: 0, list: null, busy: false };
      cdsMatchApi = async (a) => a === 'packetList' ? { attendants: LIST } : { packet: null, status: { label: 'Not sent' } };
      attPacketFor(_store.pipeline[0]); await new Promise(r => setTimeout(r, 150));
      return _store.pipeline.map(p => { const k = attPacketFor(p); return k ? k.name + ' | ' + k.label : null; });
    }"""
    got = pg.evaluate(LEAD, [LIST, True])
    ck('lead with no attendant yet: found by the consumer name (Hazel Dunn -> Marcus Lane)', got[0] == 'Marcus Lane | Filling out Step 1', got)
    ck('lead with an attendant: found by their name (Ray Holcomb, waiver)', got[1] == 'Ray Holcomb | Waiting on Good Cause Waiver', got)
    ck('attendant with no packet: the hand-typed list stays', got[2] is None, got)
    prof = pg.evaluate("""()=>{ _lprofId = 'L2'; const pg = document.getElementById('page-leadprofile'); document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); pg.classList.add('active'); pg.style.display = 'block';
      for (let el = pg; el; el = el.parentElement) if (getComputedStyle(el).display === 'none') el.style.display = 'block';
      renderLeadProfile(); return pg.textContent; }""")
    ck('lead profile: the packet step, no hand-typed checklist', 'Waiting on Good Cause Waiver' in prof and 'Open Attendants' in prof and 'Invited into Empeon' not in prof, prof[:400])
    got = pg.evaluate(LEAD, [LIST, False])
    ck('old switch setting cleared: leads still show the packet step', got[1] == 'Ray Holcomb | Waiting on Good Cause Waiver', got)
    ck('no page errors', not errs, errs)
    b.close()
print(f"{sum(res)} passed, {len(res) - sum(res)} failed")
raise SystemExit(0 if all(res) else 1)
