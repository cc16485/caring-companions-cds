#!/usr/bin/env python3
# 454 · CDS EVV FORM: SAVES AGAIN, AND EMAILS SAMANTHA AND KRYSTAL. Samantha, 2026-10-05: "please make sure the evv form for
# the cds sub account shows the form and also sends an email to samantha@mo-care.com and krystal@mo-care.com when an evv
# form is completed".
# Found: every submission of hub.caringcds.com/evv-form was refused ("permission denied for table evv_submissions"), so no
# form ever reached the CDS hub's EVV Corrections list. Same gap as July's fix_table_grants.sql, on a table it missed.
#   SQL (CDS project): the public form may ADD a form for this agency (never read, change or delete); office staff read
#     and mark processed; notified_at for the email.
#   evv-notify (new, CDS project): after a form saves, emails Samantha and Krystal once, through the CDS GoHighLevel
#     sub-account (the same way transfer-nudge tells the office). Only a real form from the last day; fixed addresses.
# NOTHING IS SENT by this step and no form is added: the proofs are a save that the database must refuse anyway (a form
# with no attendant), a read the public form must not be allowed, and an email request for a form that doesn't exist.
import json, os, re, hashlib, subprocess, urllib.request, urllib.error, datetime as dt, sys, tempfile, shutil, time
REPORT = os.environ["SB_REPORT"]; TOKEN = os.environ.get("SB_TOKEN", "").strip().strip('"').strip("'")
SUPA = os.environ.get("SB_SUPA_CLI", ""); API = os.environ.get("SB_API_BASE", "https://api.supabase.com")
HUB_REF = "siivpekcaryeyttszwav"   # the CDS project (its own, not the shared hub project)
HUB = os.environ["SB_REPO"]; HUB_BASE = os.environ.get("SB_BASE", "")
HUB_SHAS = json.loads(os.environ["SB_SHAS"])
FNB = os.environ.get("SB_FN_BASE", f"https://{HUB_REF}.supabase.co")
FNS = ["evv-notify"]
SQLFILE = "evv_form_454.sql"
PUBKEY = "sb_publishable_iDJ00Ve4hw5iw2YtVmiulg__FmjShmO"   # the form's own public key (in evv-form.html)
POLL = float(os.environ.get("SB_POLL", "2")); POLL_MAX = float(os.environ.get("SB_POLL_MAX", "40"))
lines = []; fails = []; HIDE = []
def say(s=""):
    s = str(s)
    for h in HIDE:
        if h: s = s.replace(h, "(hidden)")
    s = re.sub(r"(sbp_|eyJ|sb_secret_|sb_publishable_)[A-Za-z0-9._\-]+", "(hidden)", s); s = re.sub(r"[\w.%+\-]+@[\w.\-]+\.[A-Za-z]{2,}", "(an email)", s)
    print(s, flush=True); lines.append(s)
def bad(s): say("  ✗ " + s); fails.append(s)
def done(c): open(REPORT, "w").write("\n".join(lines) + "\n"); raise SystemExit(c)
def _crash(t, e, tb):
    say(); say("  ✗ STOPPED unexpectedly: " + type(e).__name__ + ": " + str(e)[:200]); say("  Anything done above stays done; nothing after it ran. Tell Claude.")
    try: open(REPORT, "w").write("\n".join(lines) + "\n")
    except Exception: pass
sys.excepthook = _crash
def http(method, url, body=None, headers=None, timeout=200, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=dict({"Content-Type": "application/json", "User-Agent": "cc-454/1.0"}, **(headers or {})))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            b = r.read(); return r.status, (b if raw else b.decode(errors="replace"))
    except urllib.error.HTTPError as e: return e.code, (b"" if raw else e.read().decode(errors="replace"))
    except Exception as e: return None, (b"" if raw else type(e).__name__)
MG = lambda: {"Authorization": "Bearer " + TOKEN}
def sql(q):
    s, b = http("POST", f"{API}/v1/projects/{HUB_REF}/database/query", {"query": q}, MG())
    if s not in (200, 201): return False, f"HTTP {s}: {b[:300]}"
    try: return True, json.loads(b)
    except Exception: return False, b[:200]
def fmeta(ref, fn):
    s, b = http("GET", f"{API}/v1/projects/{ref}/functions/{fn}", headers=MG())
    try: return s, (json.loads(b) if s == 200 else None)
    except Exception: return s, None
def secrets(ref):
    s, b = http("GET", f"{API}/v1/projects/{ref}/secrets", headers=MG())
    try: return {x.get("name") for x in json.loads(b)} if s == 200 else set()
    except Exception: return set()
def keys(ref):
    usable = lambda v: isinstance(v, str) and (v.startswith("eyJ") or v.startswith("sb_publishable_") or v.startswith("sb_secret_")) and "·" not in v and "*" not in v
    for q in ("?reveal=true", ""):
        s, b = http("GET", f"{API}/v1/projects/{ref}/api-keys{q}", headers=MG())
        if s != 200: continue
        try: arr = json.loads(b)
        except Exception: continue
        if isinstance(arr, dict): arr = arr.get("keys") or []
        got = {k.get("name"): k.get("api_key", "") for k in arr if isinstance(k, dict)}
        got = {k: v for k, v in got.items() if usable(v)}
        if got.get("anon"): return got
    return {}
shab = lambda b: hashlib.sha256(b).hexdigest()
sha = lambda p: shab(open(p, "rb").read())
def chk(good, msg): (say if good else bad)(("  ✓ " if good else "") + msg)
pinpath = lambda k: f"supabase/functions/{k}.ts" if k.startswith("_shared/") else f"supabase/functions/{k}/index.ts"
def git(root, *a): return subprocess.run(["git", *a], cwd=root, capture_output=True)
def deps(path, seen):
    if path in seen or not os.path.exists(path): return
    seen.add(path)
    for m in re.findall(r"""from\s+['"](\.{1,2}/[^'"]+)['"]|import\s+['"](\.{1,2}/[^'"]+)['"]""", open(path).read()):
        deps(os.path.normpath(os.path.join(os.path.dirname(path), m[0] or m[1])), seen)
def need(root, fn):
    s = set(); deps(os.path.join(root, f"supabase/functions/{fn}/index.ts"), s)
    return {os.path.relpath(x, root).replace(os.sep, "/") for x in s}
def live_files(ref, fn):
    tmp = tempfile.mkdtemp(prefix="cds454-"); os.makedirs(os.path.join(tmp, "supabase"), exist_ok=True)
    d = subprocess.run([SUPA, "functions", "download", fn, "--project-ref", ref, "--use-api"], cwd=tmp, env=dict(os.environ, SUPABASE_ACCESS_TOKEN=TOKEN), capture_output=True, text=True)
    live = {}
    for r, _, files in os.walk(tmp):
        for f in files:
            lp = os.path.join(r, f).replace(os.sep, "/")
            if "/functions/" in lp: live["supabase/functions/" + lp.split("/functions/", 1)[1]] = sha(lp)
    shutil.rmtree(tmp, ignore_errors=True)
    return d.returncode == 0, live
def base_sha(root, base, rel):
    b = git(root, "show", f"{base}:{rel}")
    return shab(b.stdout) if b.returncode == 0 else None
def reviewed(root, base, shas, label, extra=()):
    if not base or git(root, "cat-file", "-e", base + "^{commit}").returncode != 0: bad(f"the reviewed starting point isn't in the {label} history"); say("  STOP. Nothing was run."); done(2)
    changed = set(git(root, "diff", "--name-only", base, "HEAD").stdout.decode().split())
    for rel, want in [(pinpath(k), v) for k, v in shas.items()] + list(extra):
        if rel not in changed or not os.path.exists(os.path.join(root, rel)) or sha(os.path.join(root, rel)) != want:
            bad(f"{label}: {rel.split('functions/')[-1]} is not the reviewed build"); say("  STOP. Nothing was run."); done(2)
    return changed
def state(ref, root, base, fn, pinned):
    """'new' | 'base' | 'this' | 'other' for one live function, with its gateway setting."""
    s, m = fmeta(ref, fn)
    if s == 404: return "new", None
    vj = (m or {}).get("verify_jwt")
    okd, live = live_files(ref, fn)
    if not okd or not isinstance(vj, bool): return "unreadable", vj
    nd = need(root, fn)
    if all(k in live and live[k] == sha(os.path.join(root, k)) for k in nd): return "this", vj
    if all((k in live and live[k] == base_sha(root, base, k)) or (k not in live and base_sha(root, base, k) is None and k in pinned) for k in nd): return "base", vj
    return "other", vj
def deploy(ref, root, fn, vj, label):
    p = subprocess.run([SUPA, "functions", "deploy", fn, "--project-ref", ref, "--use-api"] + ([] if vj in (True, None) else ["--no-verify-jwt"]), cwd=root, env=dict(os.environ, SUPABASE_ACCESS_TOKEN=TOKEN), capture_output=True, text=True)
    okd, live = live_files(ref, fn)
    good = okd and all(k in live and live[k] == sha(os.path.join(root, k)) for k in need(root, fn))
    if not good: bad(f"{label} {fn} didn't deploy: " + (p.stderr or p.stdout)[-200:]); return False
    want = True if vj is None else vj
    sN, mN = fmeta(ref, fn)
    if (mN or {}).get("verify_jwt") != want:
        http("PATCH", f"{API}/v1/projects/{ref}/functions/{fn}", {"verify_jwt": want}, MG()); sN, mN = fmeta(ref, fn)
    chk((mN or {}).get("verify_jwt") == want, f"{label}: {fn} deployed, version {(mN or {}).get('version', '?')} (gateway sign-in check {'on' if want else 'off'})")
    return True


say("454 · CDS EVV FORM: SAVES AGAIN, AND EMAILS THE OFFICE"); say("Report " + dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")); say()
say("PART 1 · READ ONLY (nothing changes)")
if not TOKEN.startswith("sbp_"): bad("no Supabase access token"); done(2)
reviewed(HUB, HUB_BASE, HUB_SHAS, "the CDS hub", extra=[(SQLFILE, os.environ.get("SB_SQL_SHA", ""))])
say("  ✓ the email helper and the database fix are the reviewed build")
st, vj = state(HUB_REF, HUB, HUB_BASE, "evv-notify", {pinpath(k) for k in HUB_SHAS})
if st not in ("new", "this"): bad(f"there is already a different evv-notify live ({st}). Nothing was changed. Tell Claude."); done(3)
say("  ✓ evv-notify: " + ("is new" if st == "new" else "already has this build (an earlier run)"))
NODE = shutil.which("node") or next((p for p in ("/opt/homebrew/bin/node", "/usr/local/bin/node") if os.path.exists(p)), "")
if NODE:
    p = subprocess.run([NODE, "evv_notify_454_test.mjs"], cwd=HUB, capture_output=True, text=True)
    last = (p.stdout.strip().splitlines() or ["(no output)"])[-1]
    if p.returncode != 0: bad(f"evv_notify_454_test.mjs failed: {last}"); say("  STOP. Nothing was changed."); done(2)
    say(f"  ✓ evv_notify_454_test.mjs: {last.strip()} (fake data only)")
have = secrets(HUB_REF)
if not {"GHL_TOKEN", "GHL_LOCATION_ID"} <= have: bad("the CDS project has no GoHighLevel keys, so it couldn't email. Nothing was changed. Tell Claude."); done(3)
say("  ✓ the CDS project has its GoHighLevel keys (the same ones the transfer watcher emails the office with)")
ok, c0 = sql("select count(*)::int as n from public.evv_submissions")
if not ok or not c0: bad(f"couldn't read the EVV forms ({c0}). Nothing was changed."); done(3)
say(f"  · EVV forms saved so far: {c0[0]['n']}")
PUB = {"apikey": PUBKEY, "Authorization": "Bearer " + PUBKEY, "Content-Type": "application/json", "Prefer": "return=minimal"}
s, b = http("POST", f"{FNB}/rest/v1/evv_submissions", {"agency_id": "caring-companions-cds"}, PUB)
say("  · before: a form from the public page is " + ("REFUSED (permission denied), as you found" if "42501" in b else f"answered {s}"))

say(); say("PART 2 · CHANGE")
ok, r = sql(open(os.path.join(HUB, SQLFILE)).read())
ok2, g = sql("select string_agg(privilege_type, ',' order by privilege_type) as p from information_schema.role_table_grants where table_schema = 'public' and table_name = 'evv_submissions' and grantee = 'anon'")
ok3, col = sql("select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'evv_submissions' and column_name = 'notified_at'")
chk(ok and ok2 and g and g[0]["p"] == "INSERT" and ok3 and col and col[0]["n"] == 1, "the public form may add a form and nothing else; staff read and mark them; notified_at is there" + ("" if ok else f" ({str(r)[:160]})"))
if fails: say("  STOP. Tell Claude."); done(5)
if st != "this" and not deploy(HUB_REF, HUB, "evv-notify", False, "CDS"): say("  STOP. Tell Claude. (The database fix is in; the email helper is not.)"); done(6)

say(); say("PART 3 · PROOF (nothing is saved, nothing is sent)")
okd, live = live_files(HUB_REF, "evv-notify")
chk(okd and all(k in live and live[k] == sha(os.path.join(HUB, k)) for k in need(HUB, "evv-notify")), "evv-notify: the live copy is exactly the reviewed build")
time.sleep(float(os.environ.get("SB_SETTLE", "8")))
s, b = http("POST", f"{FNB}/rest/v1/evv_submissions", {"agency_id": "caring-companions-cds"}, PUB)
chk(s == 400 and "23502" in b, f"the public form is now let in (this test form, with no attendant, is still refused by the database, so nothing was saved) ({s})")
s, b = http("GET", f"{FNB}/rest/v1/evv_submissions?select=id&limit=1", None, PUB)
chk(s in (401, 403), f"the public form still cannot read anyone's forms ({s})")
s, b = http("POST", f"{FNB}/functions/v1/evv-notify", {"id": "00000000-0000-4000-8000-000000000000"}, {"apikey": PUBKEY, "Content-Type": "application/json"})
chk(s == 404, f"asking for an email about a form that doesn't exist: refused, nothing sent ({s})")
ok, c1 = sql("select count(*)::int as n from public.evv_submissions")
chk(ok and c1 and c1[0]["n"] == c0[0]["n"], f"no form was added ({c1[0]['n'] if ok and c1 else '?'}, as before)")
say()
say("RESULT: " + ("DONE · the CDS EVV form saves again, shows on the CDS hub's EVV Corrections list, and each new form emails samantha@mo-care.com and krystal@mo-care.com. It is live now; the next real form is the first email." if not fails else "PARTLY DONE · the ✗ lines above need Claude."))
say("Nothing was texted or emailed by this step.")
done(0 if not fails else 8)
