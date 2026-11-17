"""Claims for eMOMED (Samantha 2026-11-16: "build it"). The real hub page, served from THIS checkout, offline (Supabase is
blocked and stood in for), MADE-UP people only. Saves desktop and phone screenshots to $OUT. python3 tests/claims_look.py.
Nothing is sent anywhere."""
import os, threading, functools, datetime, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
T = datetime.date.today()
day = lambda n: (T + datetime.timedelta(days=n)).isoformat()
us = lambda d: d[5:7] + '/' + d[8:10] + '/' + d[:4]
M1 = T.replace(day=1).isoformat()
MEND = ((T.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)).isoformat()

def sec(label, pa, rows):
    return ('Service Type\nStart Date\nEnd Date\nProvider\nGHE 1\nGHE 2\nPrior Authorization\n' + label + '\n' + us(M1) + '\n' + us(MEND) +
            '\nSOME AGENCY LLC, 4170000000\nN/A\nN/A\n' + pa + '\nStart Date\nEnd Date\nProcedure Code\nAuthorized Units\n' + '\n'.join('\n'.join(r) for r in rows) + '\n')
PDF = ('Participant Information: JAN EXAMPLE\nDCN: 11111111\nCare Plan Information ' + us(M1) + ' - ' + us(MEND) + '\nPC - CDS\n' +
       sec('PC - CDS', '20260900000001', [[us(M1), us(MEND), 'T1019', '40']]) + sec('FMS', '20260900000002', [[us(M1), us(MEND), 'T2040', '1']]) +
       sec('CDS - ILW', '20260900000003', [[us(M1), us(MEND), 'T1019', '20']]) + sec('CM', '20260900000005', [[us(M1), us(MEND), 'T2024', '1']]))

D1, D2 = day(-3), day(-2)
if D1 < M1: D1, D2 = M1, day(1) if day(1) < day(0) else M1   # early in a month: keep both days in this month
LOGS = {'logs': [
    {'consumer': 'Example, Jan', 'clockIn': D1 + 'T08:00:00', 'clockOut': D1 + 'T16:00:00'},     # 8 h = 32 units
    {'consumer': 'Example, Jan', 'clockIn': D2 + 'T08:00:00', 'clockOut': D2 + 'T14:00:00'},     # 6 h = 24 units -> 40 U2 + 16 U6
    {'consumer': 'Sample, Sam', 'clockIn': D1 + 'T09:00:00', 'clockOut': None}],                  # never clocked out
    'coverage': [{'from': M1, 'to': day(-1)}]}
CONSUMERS = [{'id': 'c1', 'name': 'Jan Example', 'dcn': '11111111', 'status': 'active'},
             {'id': 'c2', 'name': 'Sam Sample', 'dcn': '22222222', 'status': 'active'}]
SETUP = r"""
async([consumers, logs, on])=>{
  window._saved = {}; window._stores = { careLogs: logs, careLogsUploaded: {}, emomedClaims: {} };
  _db = { from: () => ({ upsert: (row) => { _saved[row.data_key] = row.data_value; return Promise.resolve({ error: null }); },
                         select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) }) };
  claimsLoad = async () => ({ careLogs: _stores.careLogs, uploadedLogs: _stores.careLogsUploaded, emomed: _stores.emomedClaims });
  claimsSaveStore = async (k, v) => { _stores[k === 'careLogsUploaded' ? 'careLogsUploaded' : k] = v; _saved[k] = v; };
  _store.consumers = consumers; _store.pipeline = []; _store.attendants = []; _leadCalls = [];
  _store.authorizations = { records: {} }; _store.claimsWork = {};
  _store.claims = on ? { live: true } : {};
  document.getElementById('header_user').textContent = 'samantha@mo-care.com';
  const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none';
  window.confirm = () => true; window._alerts = []; window.alert = m => _alerts.push(m);
  _claims = null;
  return true;
}"""
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:900]))
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    card = lambda: pg.inner_text('#claimsCard')

    pg.evaluate(SETUP, [CONSUMERS, LOGS, False]); pg.evaluate("()=>showPage('payroll')"); pg.wait_for_timeout(300)
    ck('switch off: no Claims card', not pg.locator('#claimsCard').is_visible())
    ck('the switch is listed in Settings', pg.evaluate("()=>HUB_SWITCHES.some(h=>h.key==='claims')"))

    # The authorization reader keeps each section (the real parser in the page)
    pg.wait_for_function("()=>!!window.CDSClaims")
    r = pg.evaluate("(t)=>parseAuthorizationPdf(t, 'x.pdf')", PDF)
    ck('authorization: every row keeps its section and prior authorization', [m['svc'] for m in r['months']] == ['PC - CDS', 'FMS', 'CDS - ILW', 'CM'] and r['months'][2]['pa'] == '20260900000003', r)
    ck('authorization: the rest of the record is as before', r['dcn'] == '11111111' and r['procedureCode'] == 'T1019', r)
    r['consumer'] = 'Jan Example'
    pg.evaluate("(r)=>{ _store.authorizations = { records: { '11111111': r } }; }", r)

    pg.evaluate("()=>{ _store.claims = { live: true }; showPage('payroll'); }"); pg.wait_for_timeout(700)
    ck('switch on: the card shows on Money', pg.locator('#claimsCard').is_visible())
    pg.fill('#clFrom', D1); pg.fill('#clTo', D2); pg.click('#clGo'); pg.wait_for_timeout(200)
    t = card()
    ck('next cutoff and payday', 'Next cutoff' in t and 'Paid' in t, t[:400])
    ck('rates not set: named', 'T1019 U2' in t and 'not set' in t, t[:800])
    ck('Jan stopped: no diagnosis code, no rate', 'No diagnosis code saved' in t and 'No rate saved for T1019 U2' in t, t)
    ck('Sam stopped: never clocked out, no authorization', 'never clocked out' in t and 'No DSDS authorization in the hub' in t, t)
    pg.screenshot(path=os.path.join(OUT, 'cl01-stopped-desktop.png'), full_page=True)

    for k, v in [('T1019 U2', '5.23'), ('T1019 U6', '5.23'), ('T2040 U6', '100'), ('T2024 U6', '120')]:
        pg.fill(f'[data-rate="{k}"]', v)
    pg.click('#clRates'); pg.wait_for_timeout(150)
    pg.fill('[data-dx="c1"]', 'r26.89'); pg.dispatch_event('[data-dx="c1"]', 'change'); pg.wait_for_timeout(150)
    ck('rates and diagnosis saved in claimsWork', pg.evaluate("()=>_saved.claimsWork && _saved.claimsWork.rates['T1019 U2']===5.23 && _saved.claimsWork.dx.c1==='R26.89'"), pg.evaluate("()=>_saved.claimsWork"))
    t = card()
    rows = pg.evaluate("()=>[...document.querySelectorAll('#claimsCard tbody tr')].map(r=>r.innerText.replace(/\\s+/g,' ').trim())")
    ck('Jan ready: 40 State Plan units then 16 waiver units', any('T1019 U2' in x and ' 40 $209.20' in x for x in rows) and any('T1019 U6' in x and ' 16 $83.68' in x for x in rows), rows)
    ck('the waiver line carries its prior authorization', any('20260900000003' in x for x in rows), rows)
    monthEnds = D2 == MEND
    ck('FMS and case management wait for the claim that ends the month', ('FMS is billed once' in t) or monthEnds, t)
    ck('a bad diagnosis code is refused', (pg.fill('[data-dx="c1"]', 'hello'), pg.dispatch_event('[data-dx="c1"]', 'change'), pg.wait_for_timeout(100), pg.evaluate("()=>[_saved.claimsWork.dx.c1, document.querySelector('[data-dx=c1]').value]"))[-1] == ['R26.89', 'R26.89'])
    pg.screenshot(path=os.path.join(OUT, 'cl02-ready-desktop.png'), full_page=True)

    # Mark sent needs a 13-digit ICN
    k = pg.evaluate("()=>document.querySelector('[data-sent]').dataset.sent")
    pg.click('[data-sent]'); pg.wait_for_timeout(100)
    ck('Mark sent without an ICN is refused', k not in (pg.evaluate("()=>_saved.claimsWork.sent") or {}))
    pg.fill(f'[data-icn="{k}"]', '4926320000001'); pg.click(f'[data-sent="{k}"]'); pg.wait_for_timeout(150)
    ck('Mark sent saves the ICN and who', pg.evaluate("(k)=>_saved.claimsWork.sent[k].icn==='4926320000001' && _saved.claimsWork.sent[k].by==='samantha'", k))
    ck('the sent line says so', 'Sent, ICN 4926320000001' in card())

    # eMOMED claim list upload: a denial shows up, and days already billed are left out
    csv = ('ICN,NPI,Participant DCN,Claim Status,Claim Type,Billed Amt,Paid Amt,First D.O.S.,Last D.O.S.\n'
           f'4926300000001,1000000000,11111111,P - Paid,MEDICAL,167.36,167.36,{us(D1)},{us(D1)}\n'
           f'4926300000002,1000000000,22222222,N - Denied,MEDICAL,92.80,0.00,{us(D1)},{us(D1)}\n')
    p = os.path.join(OUT, 'emomed_export.csv'); open(p, 'w').write(csv)
    pg.set_input_files('#clEmFile', p); pg.wait_for_timeout(400)
    t = card()
    ck('claim list read: 2 claims, 1 denied', 'Read 2 claims (1 denied)' in t, t[:1500])
    pg.fill('#clFrom', D1); pg.fill('#clTo', D2); pg.click('#clGo'); pg.wait_for_timeout(200)
    t = card()
    ck('a day already billed in eMOMED is left out and said', 'already on a claim in eMOMED' in t, t)
    ck('the denial is named with its ICN', 'Denied in eMOMED: claim 4926300000002' in t, t)

    # WellSky care log upload for a day the hub is missing
    p2 = os.path.join(OUT, 'carelogs.csv')
    open(p2, 'w').write('Client Name,Caregiver Name,Clock In,Clock Out,Status\n"Example, Jan","Helper, Pat",' + us(M1) + ' 9:00 AM,' + us(M1) + ' 11:30 AM,Complete\n"Example, Jan","Helper, Pat",' + us(M1) + ' 1:00 PM,,Cancelled\n')
    pg.set_input_files('#clLogFile', p2); pg.wait_for_timeout(400)
    ck('care log upload saved, the cancelled row skipped', 'Saved 1 care logs' in card() and '1 rows were not care logs' in card(), card()[:1200])
    ck('the upload is its own store with its covered days', pg.evaluate("()=>_saved.careLogsUploaded.logs.length===1 && _saved.careLogsUploaded.coverage[0].from===_saved.careLogsUploaded.logs[0].clockIn.slice(0,10)"))

    # Days the hub has no care logs for stop the claim
    pg.evaluate("()=>{ _stores.careLogs = Object.assign({}, _stores.careLogs, { coverage: [] }); _stores.careLogsUploaded = {}; _claims = null; renderClaimsCard(); }"); pg.wait_for_timeout(400)
    pg.fill('#clFrom', D1); pg.fill('#clTo', D2); pg.click('#clGo'); pg.wait_for_timeout(200)
    ck('no care logs for the days: stopped and said', 'The hub has no WellSky care logs for' in card() and 'does not have WellSky care logs' in card(), card()[:1500])

    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT, 'cl03-phone.png'), full_page=True)
    wide = pg.evaluate("()=>document.documentElement.scrollWidth > window.innerWidth + 2")
    ck('phone: the page does not scroll sideways', not wide)
    ck('no page errors', not errs, errs)
    b.close()
print(f'{sum(res)}/{len(res)} passed'); raise SystemExit(0 if all(res) else 1)
