"""Something changed (Samantha 2026-11-05: "build the something-changed checklist (hospital stay, move, health change: DSDS
within 10 days, pause WellSky shifts, call when home)"). The real hub page, served from THIS checkout, offline (Supabase is
blocked), MADE-UP people only. Saves desktop and phone screenshots to $OUT. python3 tests/changes_look.py. Nothing is sent."""
import os, threading, functools, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
day = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
ANN = {'id': 'c1', 'name': 'Ann Example', 'status': 'active', 'county': 'Greene', 'cdsStartDate': '2025-01-06', 'contacts': {}}
SETUP = r"""
async([ANN, on, shifts])=>{
  _store.consumers = [ANN]; _store.pipeline = []; _store.attendants = []; _leadCalls = [];
  _store.changes = on ? { live: true } : {};
  _store.wellskyCheck = { shifts };
  document.getElementById('header_user').textContent = 'krystal@mo-care.com';
  cdsMatchApi = async () => ({});
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  window.confirm = () => true; window._alerts = []; window.alert = m => _alerts.push(m);
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
    SH = {'at': day(0) + 'T11:00:00Z', 'from': day(-30), 'consumers': [{'name': 'Example, Ann', 'shifts': [{'date': day(-1), 'attendant': 'Pat Helper'}, {'date': day(2), 'attendant': 'Pat Helper'}]}]}
    con = lambda: pg.evaluate("()=>getData('consumers')[0]")
    prof = lambda: pg.inner_text('#prof_body') if pg.locator('#prof_body').count() else pg.inner_text('body')
    def today_lines(): return pg.evaluate("()=>CDSRules.closureItems(getData('consumers'), new Date(), null, getObj('wellskyCheck').shifts).map(i=>i.t)")
    def opn(): pg.evaluate("()=>openProfile('c1')"); pg.wait_for_timeout(250)

    pg.evaluate(SETUP, [ANN, False, SH]); opn()
    ck('switch off: no Something changed link', pg.locator('a:has-text("Something changed")').count() == 0)
    pg.evaluate(SETUP, [ANN, True, SH]); opn()
    ck('switch on: Something changed on the profile', pg.locator('a:has-text("Something changed")').count() == 1)
    pg.click('a:has-text("Something changed")'); pg.wait_for_timeout(150)
    ml = pg.inner_text('#changeModal')
    ck('the picker: hospital stay, move, health change, and endings pointed elsewhere', all(x in ml for x in ['hospital or rehab', 'Moved to a new address in our area', 'A change in their health', 'Ending or pausing services', 'within 10 days']), ml)
    pg.screenshot(path=os.path.join(OUT, 'x01-picker-desktop.png'))

    # Move
    pg.check('input[name=ch_kind][value=moved]'); pg.click('#changeModal button:has-text("Start")'); pg.wait_for_timeout(250)
    ck('move: checklist on the profile, status unchanged', 'SOMETHING CHANGED' in prof() and 'Told DSDS about the new address' in prof() and con()['status'] == 'active')
    pg.locator('.end-card input[type=date]').first.fill(day(-8)); pg.locator('.end-card input[type=date]').first.dispatch_event('change'); pg.wait_for_timeout(200)
    due = (datetime.date.today() + datetime.timedelta(days=2)).strftime('%b %-d')
    ck('move: DSDS due 10 days after the move, shown on the step', 'Due by' in prof(), prof()[:1500])
    ck('move: on Today, red (2 days left)', any('moved to a new address in our area. Tell DSDS by' in t for t in today_lines()) and pg.evaluate("()=>CDSRules.closureItems(getData('consumers'), new Date(), null, null)[0].bad"), today_lines())
    pg.screenshot(path=os.path.join(OUT, 'x02-move-card-desktop.png'), full_page=True)
    pg.click('.end-card button:has-text("Done")'); pg.wait_for_timeout(100)
    ck('Done refused while steps are missing', pg.evaluate("()=>_alerts.length") == 1 and 'Still needed' in pg.evaluate("()=>_alerts[0]") and not con()['changes'][0].get('doneAt'))
    dates = pg.locator('.end-card input[type=date]')
    for i in range(1, 5):
        dates = pg.locator('.end-card input[type=date]'); dates.nth(i).fill(day(-1)); dates.nth(i).dispatch_event('change'); pg.wait_for_timeout(150)
    pg.fill('.end-card textarea', 'New address: 12 Example St, Springfield. DSDS form sent.'); pg.dispatch_event('.end-card textarea', 'change'); pg.wait_for_timeout(150)
    pg.click('.end-card button:has-text("Done")'); pg.wait_for_timeout(150)
    c = con()
    ck('move done: every step dated with who, log kept, off Today', c['changes'][0].get('doneAt') and all(c['changes'][0]['steps'][k]['by'] == 'krystal' for k in ['learned', 'dsds', 'address', 'wellsky']) and len(c['changes'][0]['log']) >= 6 and not today_lines(), c['changes'][0])
    pg.evaluate("()=>{_profTab='closings'; renderProfile();}"); pg.wait_for_timeout(150)
    ck('Closings and pauses keeps the done change', 'Changes reported' in prof() and 'Moved to a new address in our area' in prof() and '12 Example St' in prof())
    pg.evaluate("()=>{_profTab='overview'; renderProfile();}")

    # Hospital stay through the same button (the existing hospital pause)
    pg.click('a:has-text("Something changed")'); pg.wait_for_timeout(100); pg.check('input[name=ch_kind][value=hospital]'); pg.click('#changeModal button:has-text("Start")'); pg.wait_for_timeout(250)
    c = con()
    ck('hospital: the existing pause, status paused', c['ending']['kind'] == 'hospital' and c['status'] == 'paused' and 'PAUSED' in prof())
    ck('hospital: the new WellSky step is on the card', 'Shifts stopped in WellSky, and the attendant told not to clock in' in prof())
    ck('hospital: Today says stop the shifts first', any('Stop their shifts in WellSky' in t for t in today_lines()), today_lines())
    pg.evaluate("d=>{ const l=getData('consumers'); l[0].ending.eventDate=d; l[0].ending.steps.shiftsStopped={date:d,by:'krystal'}; setData('consumers', l); renderProfile(); }", day(-3))
    ck('hospital: WellSky shifts during the stay are flagged (worked and booked ahead)', any('WellSky has 2 shifts during the hospital stay' in t for t in today_lines()), today_lines())
    pg.screenshot(path=os.path.join(OUT, 'x03-hospital-desktop.png'), full_page=True)
    pg.click('a:has-text("Something changed")'); pg.wait_for_timeout(100)
    ck('while paused: no second hospital stay offered', pg.locator('input[name=ch_kind][value=hospital]').count() == 0)
    pg.evaluate("()=>closeModal('changeModal')")
    pg.click('button:has-text("Back home, active again")'); pg.wait_for_timeout(250)
    c = con()
    ck('back home: active, and a back-home checklist made by itself', c['status'] == 'active' and not c.get('ending') and any(ch['kind'] == 'home' and not ch.get('doneAt') for ch in c['changes']))
    ck('back home: Today asks for the call first', any('back home from the hospital. Next, called them now they are home' in t for t in today_lines()), today_lines())
    ck('back home: card shows the call and the WellSky restart', 'Called them now they are home' in prof() and 'Shifts restarted in WellSky' in prof())

    # Health change
    pg.click('a:has-text("Something changed")'); pg.wait_for_timeout(100); pg.check('input[name=ch_kind][value=health]'); pg.click('#changeModal button:has-text("Start")'); pg.wait_for_timeout(200)
    ck('health: checklist with the self-direction question', 'A change in their health or the help they need' in prof() and 'Asked whether they can still direct their own care' in prof())
    ck('two open changes at once: both on the profile', prof().count('SOMETHING CHANGED') == 2)
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(OUT, 'x04-changes-mobile.png'), full_page=True)
    ck('phone: the profile fits a 390px screen', pg.evaluate("()=>document.documentElement.scrollWidth <= innerWidth + 1"), pg.evaluate("()=>document.documentElement.scrollWidth"))
    pg.set_viewport_size({'width': 1440, 'height': 1000})
    out = pg.evaluate("()=>{ try { renderDailyRoutine(); const t = (document.getElementById('dailyRoutine') || {}).textContent || ''; return t.includes('back home from the hospital') ? 'shown' : 'missing: ' + t.slice(0, 300); } catch (e) { return 'error: ' + e.message; } }")
    ck('the real Today page draws, with the back-home step on it', out == 'shown', out)
    ck('no page errors', not errs, errs[:3])
    b.close()
print(f"\n{sum(res)} passed, {len(res) - sum(res)} failed")
raise SystemExit(0 if all(res) else 1)
