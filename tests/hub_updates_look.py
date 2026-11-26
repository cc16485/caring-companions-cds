"""Steps Claude marked done (2026-11-26, Katlin's Night Desk): the real CDS hub page, served from THIS checkout, offline,
made-up people. The server's waiting updates are a stand-in (window.TD_HUB_API). Checks: the page applies "WellSky: tasks
are in" and "The attendant can clock in" to the right Starting consumer, with who did it and a note in the log, leaves one
already done alone, asks the server to mark all of them applied (including one for someone no longer on the list), does
nothing when nothing waits, and does not run twice within 5 minutes. python3 tests/hub_updates_look.py"""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
T = r"""
async()=>{
  _store.consumers = [
    { id: 'C1', name: 'Joe Madeup', status: 'starting', cdsStartDate: '2026-12-08', firstShiftPrep: { authWellSky: { at: '2026-11-20', by: 'Samantha' } }, starting: {}, medicaid: {} },
    { id: 'C2', name: 'Linda Testcase', status: 'starting', starting: {}, medicaid: {} } ];
  window.__saved = 0; const realSet = setData; (0,eval)('setData = function(k, v){ window.__saved++; _store[k] = v; }');
  const calls = []; let pending = [
    { id: 1, target_id: 'C1', target_name: 'Joe Madeup', step: 'wellsky_tasks', by_email: 'katlin@mo-care.com', at: '2026-11-26T23:50:00Z' },
    { id: 2, target_id: 'C1', target_name: 'Joe Madeup', step: 'wellsky_authorization', by_email: 'katlin@mo-care.com', at: '2026-11-26T23:51:00Z' },
    { id: 3, target_id: 'C2', target_name: 'Linda Testcase', step: 'attendant_clock_in', by_email: 'katlin@mo-care.com', at: '2026-11-26T23:52:00Z' },
    { id: 4, target_id: 'C9', target_name: 'Gone Person', step: 'wellsky_tasks', by_email: 'katlin@mo-care.com', at: '2026-11-26T23:53:00Z' },
    { id: 5, target_id: 'C2', target_name: 'Linda Testcase', step: 'referral_sent', value: '2026-11-19', by_email: 'katlin@mo-care.com', at: '2026-11-26T23:54:00Z' } ];
  window.TD_HUB_API = async (b) => { calls.push(JSON.parse(JSON.stringify(b))); if (b.action === 'hub_updates') return { ok: true, updates: pending }; if (b.action === 'hub_applied') { pending = pending.filter(u => !b.ids.includes(u.id)); return { ok: true, applied: b.ids.length }; } };
  const n = await StartHub.applyPending(true);
  const c1 = _store.consumers.find(x => x.id === 'C1'), c2 = _store.consumers.find(x => x.id === 'C2');
  const again = await StartHub.applyPending();
  const empty = await StartHub.applyPending(true);
  return { n, again, empty, calls, c1prep: c1.firstShiftPrep, c1log: (c1.medicaid.log || []).map(l => l.text), c2st: c2.starting, c2log: (c2.medicaid.log || []).map(l => l.text) };
}
"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ const lo=document.getElementById('loginOverlay'); if(lo) lo.style.display='none'; document.getElementById('header_user').textContent='samantha@caringcds.com'; }")
    R = pg.evaluate(T)
    ck('it handled all 5 waiting updates', R['n'] == 5, R)
    ck('Linda: "Referral sent to DSDS" set to Nov 19, with a log line', R['c2st'].get('referralSent') == '2026-11-19' and any(t.startswith('Referral sent to DSDS: ') and '(Katlin, with Claude).' in t for t in R['c2log']), [R['c2st'], R['c2log']])
    ck('Joe: "WellSky: tasks are in" applied, by Katlin, at the time she said it', R['c1prep'].get('tasksWellSky', {}).get('by') == 'Katlin' and R['c1prep']['tasksWellSky']['at'] == '2026-11-26T23:50:00Z', R['c1prep'])
    ck('...his authorization, already done by Samantha, is left alone', R['c1prep']['authWellSky']['by'] == 'Samantha', R['c1prep'])
    ck('...a note in his log says Katlin did it with Claude', any('WellSky: tasks are in (Katlin, with Claude).' == t for t in R['c1log']) and not any('authorization' in t for t in R['c1log']), R['c1log'])
    ck('Linda: the attendant can clock in, by Katlin', (R['c2st'].get('attClockIn') or {}).get('by') == 'Katlin' and any('The attendant can clock in' in t for t in R['c2log']), R['c2st'])
    applied = [c for c in R['calls'] if c['action'] == 'hub_applied']
    ck('all 5 marked applied on the server, including the one for someone no longer listed', applied and sorted(applied[0]['ids']) == [1, 2, 3, 4, 5], applied)
    ck('it does not run again within 5 minutes', R['again'] == 0 and len([c for c in R['calls'] if c['action'] == 'hub_updates']) == 2, R['calls'])
    ck('nothing waiting: nothing changes', R['empty'] == 0)
    ck('no page errors', not errs, errs[:3])
    b.close()
print(sum(res), '/', len(res))
raise SystemExit(0 if all(res) else 1)
