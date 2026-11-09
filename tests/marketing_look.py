"""The Marketing tab (Samantha 2026-11-05: "I dont want this to get lost, please put somewhere in the cds subaccount in a marketing
materials page/tab"). The real hub page, served from THIS checkout, offline. Videos, ads, photos and text are all there, every file
loads, and the tab shows in the menu. python3 tests/marketing_look.py (OUT=<dir> for screenshots). Needs playwright. Nothing is sent."""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
OUT = os.environ.get('OUT', '/tmp'); os.makedirs(OUT, exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def ck(name, ok, info=''):
    res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  ' + str(info)[:500]))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, h, tag in [(1440, 1000, 'desktop'), (390, 844, 'phone')]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)) if 'createClient' not in str(e) and 'supabase' not in str(e).lower() else None)
        pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.continue_())
        pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_timeout(1500)
        pg.evaluate("()=>{ const lo = document.getElementById('loginOverlay'); if (lo) lo.style.display = 'none'; showPage('marketing'); }"); pg.wait_for_timeout(600)
        pg.evaluate("()=>document.querySelectorAll('#page-marketing img').forEach(i => i.loading = 'eager')"); pg.wait_for_timeout(1500)
        ck(tag + ': Marketing page is open', pg.evaluate("()=>document.getElementById('page-marketing').classList.contains('active')"))
        ck(tag + ': Marketing is in the menu', 'Marketing' in pg.evaluate("()=>document.body.innerText.slice(0, 4000)"))
        nv = pg.evaluate("()=>document.querySelectorAll('#page-marketing video').length")
        ck(tag + ': 14 videos + 37 weekly Reels', nv == 51, nv)
        imgs = pg.evaluate("()=>[...document.querySelectorAll('#page-marketing img')].map(i => [i.getAttribute('src'), i.naturalWidth])")
        ck(tag + ': 4 covers, 6 ad images and 6 photos, all load', len(imgs) == 16 and all(n > 0 for _, n in imgs), imgs)
        vids = pg.evaluate("""async()=>Promise.all([...document.querySelectorAll('#page-marketing video')].map(v => fetch(v.getAttribute('src'), { method: 'HEAD' }).then(r => r.status)))""")
        ck(tag + ': every video file is there', vids == [200] * 51, [x for x in vids if x != 200])
        dls = pg.evaluate("()=>[...document.querySelectorAll('#page-marketing a.mk-dl')].length")
        ck(tag + ': a Download button for every file (14 videos, 37 Reels, 4 covers, 6 ads, 6 photos)', dls == 67, dls)
        txt = pg.inner_text('#page-marketing')
        ck(tag + ': sign-up links, texts, post and rules are there', all(x in txt for x in ['caringcds.com/start/?for=self', 'Texts for leads', 'Did you know?', 'Employment special ad category']), txt[:300])
        ck(tag + ': no em dashes', '—' not in txt)
        ck(tag + ': no sideways scroll', pg.evaluate("()=>document.documentElement.scrollWidth <= innerWidth + 1"), pg.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]"))
        pg.screenshot(path=os.path.join(OUT, 'marketing_' + tag + '.png'), full_page=False)
        pg.evaluate("()=>document.getElementById('mk-ads').scrollIntoView()"); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, 'marketing_ads_' + tag + '.png'), full_page=False)
        ck(tag + ': no page errors', not errs, errs)
        pg.close()
    b.close()
print(f'{sum(res)} passed, {len(res) - sum(res)} failed')
