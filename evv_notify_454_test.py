#!/usr/bin/env python3
# Rehearsal of 454 against a FAKE CDS Supabase project and a fake supabase CLI, run from a FRESH copy of this repository
# (as the Desktop step runs). Never touches a real project.   python3 evv_notify_454_test.py
import json, os, re, subprocess, sys, tempfile, threading, http.server, hashlib, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); REF = "siivpekcaryeyttszwav"
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
BASE = os.environ.get("CDS_BASE") or "56792b4668d27eb0c132b32a19f3d65b9ffe8e11"
res = []; ck = lambda n, c, note="": res.append((n, bool(c), "" if c else str(note)[:1500]))
M = {}; SEEN = []; CALLS = []
class Hd(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = self.path
        if re.match(r"/v1/projects/\w+/functions/evv-notify$", p):
            if "evv-notify" not in open(STATE).read().split() and not M.get("other"): return self._send(404, {})
            return self._send(200, {"verify_jwt": False, "version": 1})
        if re.match(r"/v1/projects/\w+/secrets", p): return self._send(200, [] if M.get("nosecrets") else [{"name": "GHL_TOKEN"}, {"name": "GHL_LOCATION_ID"}, {"name": "SUPABASE_URL"}])
        if re.match(r"/v1/projects/\w+/api-keys", p): return self._send(200, [{"name": "anon", "api_key": "sb_publishable_x"}])
        if p.startswith("/rest/v1/evv_submissions"): CALLS.append(("GET", p)); return self._send(401, {"code": "42501", "message": "permission denied for table evv_submissions"})
        self._send(404, {})
    def do_PATCH(self): self._send(200, {})
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); raw = self.rfile.read(n) or b"{}"; p = self.path
        if p.endswith("/database/query"):
            q = json.loads(raw)["query"]; SEEN.append(q)
            if "revoke all privileges on public.evv_submissions from anon" in q:
                if M.get("sqlfail"): return self._send(400, {"message": "boom"})
                M["fixed"] = True; return self._send(201, [])
            if "role_table_grants" in q:
                if M.get("extra"): return self._send(201, [{"grantee": "anon", "p": "INSERT,TRUNCATE"}, {"grantee": "authenticated", "p": "DELETE,INSERT,SELECT,UPDATE"}])
                return self._send(201, [{"grantee": "anon", "p": "INSERT"}, {"grantee": "authenticated", "p": "DELETE,INSERT,SELECT,UPDATE"}] if M.get("fixed") else [])
            if "column_name = 'notified_at'" in q: return self._send(201, [{"n": 1 if M.get("fixed") else 0}])
            if "count(*)::int as n from public.evv_submissions" in q: return self._send(201, [{"n": 0}])
            return self._send(201, [])
        CALLS.append(("POST", p))
        if p.startswith("/rest/v1/evv_submissions"):
            if M.get("fixed"): return self._send(400, {"code": "23502", "message": "null value in column \"attendant\" violates not-null constraint"})
            return self._send(401, {"code": "42501", "message": "permission denied for table evv_submissions"})
        if p.startswith("/functions/v1/evv-notify"): return self._send(404, {"error": "That form was not found."})
        self._send(404, {})
H = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Hd); threading.Thread(target=H.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{H.server_address[1]}"
tmp = tempfile.mkdtemp(prefix="t454-"); LOG = os.path.join(tmp, "log"); STATE = os.path.join(tmp, "state"); CLI = os.path.join(tmp, "supabase")
WH = os.path.join(tmp, "wt", "cds")
subprocess.run(["git", "worktree", "add", "-q", "--detach", WH, "HEAD"], cwd=HERE, check=True)
open(CLI, "w").write(f"""#!/bin/sh
cmd="$2"; fn="$3"
echo "$*" >> "{LOG}.args"
if [ "$cmd" = "download" ]; then
  grep -qx "$fn" "{STATE}" 2>/dev/null || [ -n "$OTHER" ] || exit 1
  mkdir -p "supabase/functions/$fn"; cp "{WH}/supabase/functions/$fn/index.ts" "supabase/functions/$fn/index.ts"
  [ -n "$OTHER" ] && echo "// someone else's" >> "supabase/functions/$fn/index.ts"
  exit 0
fi
if [ "$cmd" = "deploy" ]; then echo "$fn" >> "{LOG}"; echo "$fn" >> "{STATE}"; exit 0; fi
exit 1
""")
os.chmod(CLI, 0o755)
HS = {"evv-notify": sha(os.path.join(HERE, "supabase/functions/evv-notify/index.ts"))}
SQLSHA = sha(os.path.join(HERE, "evv_form_454.sql"))
def run(keep=False, mode=None, **over):
    M.clear(); M.update(mode or {}); SEEN.clear(); CALLS.clear(); open(LOG, "w").close(); open(LOG + ".args", "w").close()
    if not keep: open(STATE, "w").close()
    rep = os.path.join(tmp, "r.txt")
    if os.path.exists(rep): os.unlink(rep)
    env = dict(os.environ, SB_REPORT=rep, SB_TOKEN="sbp_fake", SB_SUPA_CLI=CLI, SB_API_BASE=URL, SB_REPO=WH, SB_BASE=BASE,
               SB_SHAS=json.dumps(HS), SB_SQL_SHA=SQLSHA, SB_FN_BASE=URL, SB_SETTLE="0")
    env.update(over)
    p = subprocess.run([sys.executable, os.path.join(WH, "evv_notify_454.py")], env=env, capture_output=True, text=True)
    return p.returncode, (open(rep).read() if os.path.exists(rep) else p.stdout + p.stderr), open(LOG).read().split(), open(LOG + ".args").read()
rc, r, d, args = run(); print(r)
ck("DONE: the database fix, then evv-notify deployed, from a fresh copy", rc == 0 and "RESULT: DONE" in r and d == ["evv-notify"] and "✗" not in r, r)
ck("it says what you found before (the form refused), then that it is let in", "REFUSED (permission denied), as you found" in r and "the public form is now let in" in r, r)
ck("evv-notify deployed without the sign-in gate (the form's public key is not a sign-in)", re.search(r"deploy evv-notify .*--no-verify-jwt", args), args)
ck("the tests ran here (fake data only)", "evv_notify_454_test.mjs: ALL 13 CHECKS PASS" in r, r)
ck("the GoHighLevel keys are checked before anything changes", "has its GoHighLevel keys" in r)
ck("the only calls are: a save the database must refuse, a read that must be refused, an email request for a form that doesn't exist", all(c[0] == "GET" or c[1].startswith(("/rest/v1/evv_submissions", "/functions/v1/evv-notify")) for c in CALLS)
   and sum(1 for c in CALLS if c[1].startswith("/functions/v1/evv-notify")) == 1, CALLS)
ck("no form is written, changed or deleted by the step", not any(re.search(r"\binsert into|\bupdate public\.|\bdelete from", q, re.I) for q in SEEN), [q for q in SEEN if re.search(r"insert into|update |delete from", q, re.I)])
ck("no keys or tokens in the report", not re.search(r"sbp_|sb_publishable|eyJ", r), r)
rc, r, d, _ = run(keep=True); ck("run again: already has it, nothing redeployed, still DONE (the SQL is safe twice)", rc == 0 and "already has this build" in r and not d and "RESULT: DONE" in r, r)
rc, r, d, _ = run(OTHER="1", mode={"other": True}); ck("a different evv-notify already live: nothing is changed at all", rc != 0 and "different evv-notify live" in r and not d and not any("revoke all privileges" in q for q in SEEN), r)
rc, r, d, _ = run(mode={"nosecrets": True}); ck("no GoHighLevel keys in the CDS project: stops before changing anything", rc != 0 and "no GoHighLevel keys" in r and not d and not any("revoke all privileges" in q for q in SEEN), r)
rc, r, d, _ = run(mode={"sqlfail": True}); ck("if the database fix fails: stops, the helper is not deployed", rc != 0 and not d, r)
rc, r, d, _ = run(mode={"extra": True}); ck("if the public form still had another permission, it says which and stops before the helper", rc != 0 and "(it has: INSERT,TRUNCATE)" in r and not d, r)
rc, r, d, _ = run(SB_SQL_SHA="0" * 64); ck("a database fix that isn't the reviewed one: stops before anything", rc != 0 and "not the reviewed build" in r and not d, r)
H.shutdown(); subprocess.run(["git", "worktree", "remove", "--force", WH], cwd=HERE); shutil.rmtree(tmp, ignore_errors=True)
for n, ok, note in res: print(("PASS " if ok else "FAIL ") + n + ("" if ok else "\n      " + note))
print("ALL %d CHECKS PASS" % len(res) if all(x[1] for x in res) else "FAILED"); sys.exit(0 if all(x[1] for x in res) else 1)
