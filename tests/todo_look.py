"""To-do lists (2026-11-26, her ask: "Katlins to-do needs to be in the Caring Companions CDS Subaccount"). The real hub
page, served from THIS checkout, offline. The cds-todo server is the real server logic (todo.js) running in the page on
an in-memory table seeded with Katlin's starter list. Checks: Samantha sees "Katlin's to-do" in Today and opens Katlin's
list, adds a note and an item; Katlin (on a Vietnam clock) sees "My to-do", tonight's list on the Missouri day with her
Vietnam time, checks things off, adds her own one-time item, cannot change the standing list; Krystal (no list) sees no
tab; nothing errors. python3 tests/todo_look.py (OUT=<dir> for pictures)."""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:600]))

SEED = open(os.path.join(ROOT, 'todo.sql')).read()
# the server logic in the page, on a table seeded from todo.sql's own starter rows
FAKE = r"""
async (seedSql) => {
  const m = await import('/supabase/functions/_shared/office/todo.js');
  const rows = window.__rows = new Map();
  for (const x of seedSql.matchAll(/\('(i:[a-z0-9]+)', 'item', '(\{.*?\})', 'todo.sql'\)/g)) rows.set(x[1], { id: x[1], kind: 'item', data: JSON.parse(x[2].replace(/''/g, "'")) });
  const settings = { switch_owners: ['samantha@mo-care.com', 'samantha@caringcds.com'], staff_emails: ['samantha@caringcds.com', 'samantha@mo-care.com', 'katlin@mo-care.com', 'krystal@mo-care.com'] };
  const db = { query: async (t, p = []) => {
    if (/^select value from cds_match_settings/.test(t)) return { rows: p[0] in settings ? [{ value: settings[p[0]] }] : [] };
    if (/^select id, kind, data, updated_at from cds_todo where data->>'who'/.test(t)) return { rows: [...rows.values()].filter((r) => r.data.who === p[0]).sort((a, b) => a.id.localeCompare(b.id)) };
    if (/^select distinct data->>'who'/.test(t)) return { rows: [...new Set([...rows.values()].filter((r) => r.kind === 'item').map((r) => r.data.who))].map((who) => ({ who })) };
    if (/^select data from cds_todo where id = \$1 and kind = 'item'/.test(t)) { const r = rows.get(p[0]); return { rows: r && r.kind === 'item' ? [r] : [] }; }
    if (/^insert into cds_todo/.test(t)) { rows.set(p[0], { id: p[0], kind: /'item'/.test(t) ? 'item' : 'mark', data: JSON.parse(p[1]) }); return { rows: [] }; }
    if (/^delete from cds_todo where id = \$1 or id like/.test(t)) { const pre = p[1].slice(0, -1); for (const k of [...rows.keys()]) if (k === p[0] || k.startsWith(pre)) rows.delete(k); return { rows: [] }; }
    if (/^delete from cds_todo where id = \$1/.test(t)) { rows.delete(p[0]); return { rows: [] }; }
    throw new Error('unexpected sql ' + t);
  } };
  const srv = m.createTodo({ db });
  window.__calls = [];
  window.TD_API = async (b) => { window.__calls.push(b.action); try { return await srv.handle(document.getElementById('header_user').textContent, b); } catch (e) { throw new Error(e.message); } };
  return rows.size;
}
"""
def page(b, who, tz='America/Chicago', w=1300):
    cx = b.new_context(viewport={'width': w, 'height': 1000}, timezone_id=tz); pg = cx.new_page()
    pg.clock.install(time='2026-11-26T17:45:00-06:00'); pg.clock.resume()   # Thursday 5:45 PM Missouri
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
    n = pg.evaluate(FAKE, SEED)
    pg.evaluate("async w=>{ const lo=document.getElementById('loginOverlay'); if(lo) lo.style.display='none'; document.getElementById('header_user').textContent=w; TD._state.probed=false; await TD.boot(); showPage('dashboard'); }", who)
    pg.wait_for_timeout(300)
    return pg, errs, n

def txt(pg): return pg.evaluate("()=>document.getElementById('tdWrap').textContent.replace(/\\s+/g,' ')")
with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ---- Samantha
    pg, errs, n = page(b, 'samantha@mo-care.com')
    ck('the starter list from todo.sql has 6 items', n == 6, n)
    nav = pg.inner_text('#sectionNav')
    ck("Samantha sees \"Katlin's to-do\" in the Today tabs", "Katlin's to-do" in nav, nav)
    pg.evaluate("showPage('todo')"); pg.wait_for_timeout(400)
    t = txt(pg)
    ck("it opens Katlin's list (Samantha has none of her own)", "Katlin's to-do" in t and 'What Katlin sees' in t, t[:300])
    ck('Thursday night shows the 5 every-night items, not the Monday one', 'Tonight, Thursday, Nov 26' in t and '0 of 5 done' in t and 'Call the leads that are ready' in t, t[:900])
    ck('the Monday EVV item is under Coming up as Mondays', 'Coming up' in t and 'Enter the EVV form fixes in WellSky' in t and 'Mondays' in t, t)
    ck('a Missouri computer shows no second clock', 'in Vietnam' not in t)
    ck('Samantha gets the Whose picker', pg.locator('#tdWrap select').count() == 1)
    # a note and a one-time item
    pg.click('text=+ Add'); pg.wait_for_timeout(100)
    pg.fill('#tdT', 'Ruth said evenings are best. Try her first.'); pg.check('input[name="tdWhen"][value="note"]'); pg.wait_for_timeout(100)
    pg.click('text=Add it'); pg.wait_for_timeout(400)
    t = txt(pg)
    ck('the note shows on top, as her note', 'Your note: Ruth said evenings are best' in t, t[:500])
    pg.click('text=+ Add'); pg.wait_for_timeout(100)
    pg.fill('#tdT', 'I-9 Section 2 video call with Pat'); pg.fill('#tdHow', 'Use the remote video steps.'); pg.check('input[name="tdWhen"][value="once"]'); pg.wait_for_timeout(50)
    pg.fill('#tdDate', '2026-11-26'); pg.click('text=Add it'); pg.wait_for_timeout(400)
    t = txt(pg)
    ck('the one-time item is on tonight\'s list', 'I-9 Section 2 video call with Pat' in t and '0 of 6 done' in t, t[:900])
    pg.click('text=+ Add'); pg.wait_for_timeout(100)
    pg.click('text=Add it'); pg.wait_for_timeout(300)
    ck('an empty item is refused with words', 'Please write what to do.' in txt(pg), txt(pg)[:400])
    pg.click('text=Cancel'); pg.wait_for_timeout(100)
    if OUT: os.makedirs(OUT, exist_ok=True); pg.screenshot(path=os.path.join(OUT, 'todo_samantha.png'), full_page=True)
    ck('no page errors (Samantha)', not errs, errs[:3])
    seeded = pg.evaluate("()=>[...window.__rows.values()].map(r=>({id:r.id,kind:r.kind,data:r.data}))")
    pg.close()

    # ---- Katlin, on a Vietnam clock, same table
    pg, errs, _ = page(b, 'katlin@mo-care.com', tz='Asia/Ho_Chi_Minh', w=420)
    pg.evaluate("rows=>{ window.__rows.clear(); rows.forEach(r=>window.__rows.set(r.id,r)); TD._state.probed=false; return TD.boot(); }", seeded); pg.wait_for_timeout(200)
    pg.evaluate("showPage('dashboard')"); pg.wait_for_timeout(200)
    nav = pg.inner_text('#sectionNav')
    ck('Katlin sees "My to-do"', 'My to-do' in nav, nav)
    pg.evaluate("showPage('todo')"); pg.wait_for_timeout(400)
    t = txt(pg)
    ck('her list is on the Missouri day (Thursday), not Friday in Vietnam', 'Tonight, Thursday, Nov 26' in t, t[:300])
    ck('she sees what time it is in both places', 'in Missouri and Friday' in t and 'in Vietnam' in t, t[:400])
    ck("Samantha's note and the I-9 item are there", 'From Samantha: Ruth said evenings are best' in t and 'I-9 Section 2 video call with Pat' in t)
    ck('she has no Whose picker', pg.locator('#tdWrap select').count() == 0)
    ck('she cannot change or remove the standing list', pg.locator('#tdWrap .row:has-text("Call the leads that are ready") button:has-text("Change")').count() == 0)
    pg.locator('#tdWrap .row:has-text("Call the leads that are ready") button:has-text("How")').click(); pg.wait_for_timeout(100)
    ck('How shows the steps', 'Talk with the consumer themselves' in txt(pg))
    pg.locator('#tdWrap .row:has-text("Call the leads that are ready") input[type=checkbox]').check(); pg.wait_for_timeout(300)
    ck('checking off saves on the Missouri day', pg.evaluate("()=>!!window.__rows.get('m:ktcall01@2026-11-26')") and '1 of 6 done' in txt(pg), txt(pg)[:600])
    pg.click('text=+ Add'); pg.wait_for_timeout(100)
    ck('her Add form offers only One day', pg.locator('input[name="tdWhen"]').count() == 1)
    pg.fill('#tdT', 'Call Harold back about the pay rate'); pg.fill('#tdDate', '2026-11-27'); pg.click('text=Add it'); pg.wait_for_timeout(400)
    t = txt(pg)
    ck('her own item is under Coming up for Friday, marked as added by her', 'Call Harold back about the pay rate' in t and 'Added by you' in t and 'Fri, Nov 27' in t, t)
    pg.click('button[aria-label="Day after"]'); pg.wait_for_timeout(400)
    t = txt(pg)
    ck('Friday: fresh every-night list, her item, and the I-9 item still open as late', 'Friday, Nov 27' in t and 'Was due Thu, Nov 26' in t and 'Call Harold back about the pay rate' in t and '0 of 7 done' in t, t[:800])
    pg.click('text=Back to tonight'); pg.wait_for_timeout(400)
    ck('the page fits a phone (no sideways scroll)', pg.evaluate("()=>document.documentElement.scrollWidth<=window.innerWidth+1"))
    if OUT: pg.screenshot(path=os.path.join(OUT, 'todo_katlin_phone.png'), full_page=True)
    ck('no page errors (Katlin)', not errs, errs[:3])
    pg.close()

    # ---- Krystal: no list
    pg, errs, _ = page(b, 'krystal@mo-care.com')
    ck('Krystal (no list) sees no to-do tab', 'to-do' not in pg.inner_text('#sectionNav').lower(), pg.inner_text('#sectionNav'))
    ck('no page errors (Krystal)', not errs, errs[:3])
    b.close()
print(sum(res), '/', len(res))
raise SystemExit(0 if all(res) else 1)
