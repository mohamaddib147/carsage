"""Live backend-authentication re-test (CAR-24) — needs the API running.

Against the RUNNING FastAPI backend (http://localhost:8000), checks that every
route except /health refuses callers without a valid Supabase session:
  - no / malformed / wrong-scheme Authorization headers,
  - forged tokens (alg=none, wrong secret, service-role claim, expired),
  - the public anon key used as a user token,
  - a token reused after sign-out, and a deleted user's token,
  - and that no other route answers without credentials.
Uses one throwaway user, always deleted. Exit code is 1 on any problem.

Run from the backend folder, with the server started (uvicorn app.main:app):

    .venv/Scripts/python scripts/verify_backend_auth.py
"""
import base64
import hashlib
import hmac
import json
import re
import sys
import time
import uuid

import httpx

sys.path.insert(0, ".")
from app.config import SUPABASE_URL as URL  # noqa: E402

SERVICE = re.search(r"^SUPABASE_SERVICE_KEY=(.*)$", open(".env", encoding="utf-8").read(), re.M).group(1).strip().strip('"')
ANON = re.search(r"^VITE_SUPABASE_ANON_KEY=(.*)$", open("../frontend/.env", encoding="utf-8").read(), re.M).group(1).strip().strip('"')
BASE = "http://localhost:8000"
ADMIN = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Content-Type": "application/json"}


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def forge(header, payload, secret=None):
    h, p = b64(json.dumps(header).encode()), b64(json.dumps(payload).encode())
    sig = b64(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()) if secret else ""
    return f"{h}.{p}.{sig}"


def make_user():
    email = f"car24-qa-{uuid.uuid4().hex[:8]}@example.com"
    pw = f"Qa-{uuid.uuid4().hex}-x1"
    uid = httpx.post(f"{URL}/auth/v1/admin/users", headers=ADMIN, json={"email": email, "password": pw, "email_confirm": True}, timeout=30).json()["id"]
    s = httpx.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON}, json={"email": email, "password": pw}, timeout=30).json()
    return uid, s["access_token"], s.get("refresh_token")


def probe(label, token_header, want, method="POST", path="/ai-advisor/classify", body=None):
    headers = {"Content-Type": "application/json"}
    if token_header is not None:
        headers["Authorization"] = token_header
    r = httpx.request(method, BASE + path, headers=headers, json=body, timeout=60)
    ok = r.status_code in want
    print(f"  {'PASS' if ok else '** FAIL **'}  [{r.status_code}] {label}" + ("" if ok else f"   wanted {want}, body={r.text[:80]}"))
    return ok


uid = tok = None
fails = 0
try:
    uid, tok, refresh = make_user()
    body = {"car_id": str(uuid.uuid4()), "description": "squeaky brakes"}   # 404 (car not found) when authenticated: proves auth passed
    print("== JWT verification on /ai-advisor/classify (401 = rejected, 404 = authenticated but car not found) ==")
    now = int(time.time())
    real_payload = json.loads(base64.urlsafe_b64decode(tok.split(".")[1] + "=="))
    cases = [
        ("valid token (control: must get past auth)", f"Bearer {tok}", (404,)),
        ("no Authorization header", None, (401,)),
        ("empty header", "", (401,)),
        ("'Bearer' with no token", "Bearer", (401,)),
        ("wrong scheme (Basic)", f"Basic {tok}", (401,)),
        ("random garbage token", "Bearer not.a.jwt", (401,)),
        ("real token with the last char of the signature changed", f"Bearer {tok[:-2]}{'A' if tok[-2] != 'A' else 'B'}{tok[-1]}", (401,)),
        ("real payload, signature stripped", f"Bearer {'.'.join(tok.split('.')[:2])}.", (401,)),
        ("alg=none forged token for the real user", "Bearer " + forge({"alg": "none", "typ": "JWT"}, real_payload), (401,)),
        ("HS256 forged with a guessed secret ('secret')", "Bearer " + forge({"alg": "HS256", "typ": "JWT"}, real_payload, "secret"), (401,)),
        ("HS256 forged, claims to be the service role", "Bearer " + forge({"alg": "HS256", "typ": "JWT"}, {**real_payload, "role": "service_role"}, "secret"), (401,)),
        ("expired token (forged exp in the past)", "Bearer " + forge({"alg": "HS256", "typ": "JWT"}, {**real_payload, "exp": now - 3600}, "secret"), (401,)),
        ("the public ANON key used as a user token", f"Bearer {ANON}", (401,)),
    ]
    for label, header, want in cases:
        if not probe(label, header, want, body=body):
            fails += 1

    print("\n== Positive controls: a VALID session can still use every protected endpoint ==")
    good = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    for label, method, path, payload in [
        ("fuel prices", "GET", "/trip-planner/fuel-prices", None),
        ("directions (real Google call)", "POST", "/trip-planner/directions", {"origin": "Beirut, Lebanon", "destination": "Byblos, Lebanon"}),
        ("spec suggestions (real lookups)", "GET", "/cars/spec-suggestions?make=Toyota&model=Camry&year=2016", None),
    ]:
        r = httpx.request(method, BASE + path, headers=good, json=payload, timeout=120)
        ok = r.status_code == 200
        print(f"  {'PASS' if ok else '** FAIL **'}  [{r.status_code}] {label} with a valid session")
        if not ok:
            fails += 1

    print("\n== Revoked sessions ==")
    # Sign out (revokes the session server-side), then reuse the old access token.
    httpx.post(f"{URL}/auth/v1/logout", headers={"apikey": ANON, "Authorization": f"Bearer {tok}"}, timeout=30)
    if not probe("token reused AFTER the user signed out", f"Bearer {tok}", (401, 404), body=body):
        fails += 1
    uid2, tok2, _ = make_user()
    httpx.delete(f"{URL}/auth/v1/admin/users/{uid2}", headers=ADMIN, timeout=30)
    if not probe("token of a user whose account was DELETED", f"Bearer {tok2}", (401,), body=body):
        fails += 1

    print("\n== Which routes work with NO credentials at all? (401 expected everywhere except /health) ==")
    routes = [
        ("GET", "/health", None), ("GET", "/trip-planner/fuel-prices", None),
        ("POST", "/trip-planner/directions", {"origin": "Beirut", "destination": "Byblos"}),
        ("POST", "/trip-planner/estimate", {"car_id": str(uuid.uuid4()), "origin": "Beirut", "destination": "Byblos"}),
        ("GET", "/cars/spec-suggestions?make=Toyota&model=Camry&year=2016", None),
        ("POST", "/ai-advisor/classify", body),
    ]
    for method, path, b in routes:
        r = httpx.request(method, BASE + path, json=b, timeout=90)
        public = r.status_code != 401
        tag = "public" if public else "requires login"
        expected_public = path == "/health"
        flag = "" if public == expected_public else "   <-- UNAUTHENTICATED ACCESS" if public else ""
        print(f"  [{r.status_code}] {method:4s} {path[:58]:58s} {tag}{flag}")
        if flag:
            fails += 1
finally:
    if uid:
        httpx.delete(f"{URL}/auth/v1/admin/users/{uid}", headers=ADMIN, timeout=30)
    print(f"\nRESULT: {fails} problem(s)")

sys.exit(1 if fails else 0)
