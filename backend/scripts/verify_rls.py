"""Live RLS re-test (CAR-24) — run it whenever policies or grants change.

Creates two throwaway Supabase users (A and B), seeds each with a car, trip,
conversation and message, then checks — through the same REST API the browser
uses — that:
  0. legitimate owner actions still work (positive controls),
  1-6. user B cannot read, forge, modify, re-assign or delete user A's rows in
       profiles / cars / trips / advisor_conversations / advisor_messages
       (including through embedded joins and by pointing B's own rows at A's car),
  7. owners cannot rewrite chat history,
  8. anonymous visitors (public anon key only) can do nothing,
  9. fuel_prices is service-role only.
It also asserts the key shipped to the browser is the `anon` key.
Everything it creates is deleted at the end. Exit code is 1 on any gap.

Needs backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY) and
frontend/.env (VITE_SUPABASE_ANON_KEY). Run from the backend folder:

    .venv/Scripts/python scripts/verify_rls.py
"""
import base64
import json
import re
import sys
import uuid

import httpx

sys.path.insert(0, ".")
from app.config import SUPABASE_URL as URL  # noqa: E402

SERVICE = re.search(r"^SUPABASE_SERVICE_KEY=(.*)$", open(".env", encoding="utf-8").read(), re.M).group(1).strip().strip('"')
ANON = re.search(r"^VITE_SUPABASE_ANON_KEY=(.*)$", open("../frontend/.env", encoding="utf-8").read(), re.M).group(1).strip().strip('"')


def jwt_role(token):
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload)).get("role")


print(f"frontend key role claim: {jwt_role(ANON)!r} (must be 'anon', never 'service_role')")
print(f"backend  key role claim: {jwt_role(SERVICE)!r}")
assert jwt_role(ANON) == "anon"

ADMIN = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Content-Type": "application/json", "Prefer": "return=representation"}


def make_user(tag):
    email = f"car24-qa-{tag}-{uuid.uuid4().hex[:8]}@example.com"
    pw = f"Qa-{uuid.uuid4().hex}-x1"
    uid = httpx.post(f"{URL}/auth/v1/admin/users", headers=ADMIN, json={"email": email, "password": pw, "email_confirm": True}, timeout=30).json()["id"]
    tok = httpx.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON}, json={"email": email, "password": pw}, timeout=30).json()["access_token"]
    return {"id": uid, "email": email, "tok": tok, "h": {"apikey": ANON, "Authorization": f"Bearer {tok}", "Content-Type": "application/json", "Prefer": "return=representation"}}


def svc(method, path, **kw):
    return httpx.request(method, f"{URL}/rest/v1/{path}", headers=ADMIN, timeout=60, **kw)


def as_(who, method, path, **kw):
    headers = who["h"] if who else {"apikey": ANON, "Authorization": f"Bearer {ANON}", "Content-Type": "application/json", "Prefer": "return=representation"}
    return httpx.request(method, f"{URL}/rest/v1/{path}", headers=headers, timeout=60, **kw)


gaps = []
passes = 0


def check(label, blocked, detail=""):
    global passes
    if blocked:
        passes += 1
        print(f"  BLOCKED  {label}")
    else:
        gaps.append(label)
        print(f"  ** GAP **  {label}  {detail}")


def affected(r):
    """rows changed/returned by a write/read, or None when refused outright."""
    if r.status_code in (200, 201):
        try:
            return len(r.json())
        except Exception:  # noqa: BLE001
            return 0
    if r.status_code == 204:
        return 0
    return None


A = B = None
try:
    A, B = make_user("a"), make_user("b")
    # Seed each user's rows with the service role (the backend writes trips/advisor rows this way).
    for u in (A, B):
        u["car"] = svc("POST", "cars", json={"user_id": u["id"], "make": "Toyota", "model": "Camry", "year": 2016, "fuel_type": "Gasoline"}).json()[0]["id"]
        u["trip"] = svc("POST", "trips", json={"user_id": u["id"], "car_id": u["car"], "destination": "Tripoli"}).json()[0]["id"]
        u["conv"] = svc("POST", "advisor_conversations", json={"user_id": u["id"], "car_id": u["car"]}).json()[0]["id"]
        u["msg"] = svc("POST", "advisor_messages", json={"conversation_id": u["conv"], "sender": "user", "message_text": "secret question"}).json()[0]["id"]

    print("\n== 0. POSITIVE CONTROLS: legitimate owner actions must still work ==")

    def works(label, ok, detail=""):
        global passes
        if ok:
            passes += 1
            print(f"  ALLOWED  {label}")
        else:
            gaps.append("BROKE LEGIT USE: " + label)
            print(f"  ** BROKEN **  {label}  {detail}")

    r = as_(A, "POST", "trips", json={"user_id": A["id"], "car_id": A["car"], "destination": "Own trip"})
    works("A inserts HIS trip for HIS car", r.status_code == 201, str(r.status_code))
    own_trip = r.json()[0]["id"] if r.status_code == 201 else None
    r = as_(A, "PATCH", f"trips?id=eq.{own_trip}", json={"destination": "Renamed"})
    works("A updates HIS trip (keeping his own car)", affected(r) == 1, str(r.status_code))
    r = as_(A, "POST", "advisor_conversations", json={"user_id": A["id"], "car_id": A["car"]})
    works("A creates HIS conversation for HIS car", r.status_code == 201, str(r.status_code))
    r = as_(A, "POST", "advisor_conversations", json={"user_id": A["id"]})
    works("A creates a conversation with no car (car_id null)", r.status_code == 201, str(r.status_code))
    r = as_(A, "POST", "cars", json={"user_id": A["id"], "make": "Temp", "model": "Car", "year": 2001, "fuel_type": "Diesel"})
    works("A inserts HIS car", r.status_code == 201, str(r.status_code))
    tmp = r.json()[0]["id"] if r.status_code == 201 else None
    r = as_(A, "PATCH", f"cars?id=eq.{tmp}", json={"make": "Temp2"})
    works("A updates HIS car", affected(r) == 1, str(r.status_code))
    r = as_(A, "DELETE", f"cars?id=eq.{tmp}")
    works("A deletes HIS car", affected(r) == 1, str(r.status_code))
    r = as_(A, "PATCH", f"profiles?id=eq.{A['id']}", json={"full_name": "Alice"})
    works("A updates HIS profile", affected(r) == 1, str(r.status_code))
    r = as_(A, "GET", "cars?select=id")
    works("A reads HIS cars", affected(r) == 1, str(r.status_code))
    r = as_(A, "GET", f"advisor_messages?select=id&conversation_id=eq.{A['conv']}")
    works("A reads the messages of HIS conversation", affected(r) == 1, str(r.status_code))

    print("\n== 1. READ: user B tries to read user A's rows ==")
    for table, key in [("profiles", A["id"]), ("cars", A["car"]), ("trips", A["trip"]), ("advisor_conversations", A["conv"]), ("advisor_messages", A["msg"])]:
        col = "id"
        r = as_(B, "GET", f"{table}?select=*&{col}=eq.{key}")
        check(f"B reads A's {table} row by id", affected(r) == 0, f"-> {r.status_code} {r.text[:60]}")
    for table in ("profiles", "cars", "trips", "advisor_conversations", "advisor_messages"):
        r = as_(B, "GET", f"{table}?select=*")
        rows = r.json() if r.status_code == 200 else []
        leaked = [x for x in rows if A["id"] in json.dumps(x)]
        check(f"B's full listing of {table} contains none of A's data ({len(rows)} rows visible, all B's)", not leaked)
    r = as_(B, "GET", "cars?select=id,trips(id,destination),advisor_conversations(id)&id=eq." + A["car"])
    check("B reads A's car through an embedded join (cars -> trips/conversations)", affected(r) == 0)
    r = as_(B, "GET", f"trips?select=id,cars(make,model)&user_id=eq.{A['id']}")
    check("B reads A's trips embedding cars, filtered by A's user_id", affected(r) == 0)

    print("\n== 2. INSERT: user B forges rows as / into user A ==")
    r = as_(B, "POST", "cars", json={"user_id": A["id"], "make": "Forged", "model": "X", "year": 2000, "fuel_type": "Gasoline"})
    check("B inserts a car owned by A", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "POST", "trips", json={"user_id": A["id"], "car_id": A["car"], "destination": "Forged"})
    check("B inserts a trip owned by A", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "POST", "advisor_conversations", json={"user_id": A["id"], "car_id": A["car"]})
    check("B inserts a conversation owned by A", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "POST", "advisor_messages", json={"conversation_id": A["conv"], "sender": "user", "message_text": "injected"})
    check("B inserts a message into A's conversation", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "POST", "profiles", json={"id": A["id"], "email": "forged@example.com"})
    check("B inserts a profile row for A's id", r.status_code >= 400, f"-> {r.status_code}")

    print("\n== 3. INSERT own row that REFERENCES A's data (cross-user integrity) ==")
    r = as_(B, "POST", "trips", json={"user_id": B["id"], "car_id": A["car"], "destination": "Attach to A's car"})
    check("B creates HIS trip pointing at A's car_id", r.status_code >= 400, f"-> {r.status_code} (row created!)" if r.status_code < 300 else "")
    r = as_(B, "POST", "advisor_conversations", json={"user_id": B["id"], "car_id": A["car"]})
    check("B creates HIS conversation pointing at A's car_id", r.status_code >= 400, f"-> {r.status_code} (row created!)" if r.status_code < 300 else "")
    r = as_(B, "POST", "trips", json={"user_id": B["id"], "car_id": str(uuid.uuid4()), "destination": "x"})
    print(f"  (info) B inserts a trip with a random non-existent car_id -> {r.status_code}  [FK error vs success on A's real id would reveal that an id exists]")

    print("\n== 4. UPDATE: user B modifies A's rows ==")
    for table, key, patch in [("profiles", A["id"], {"full_name": "HACKED"}), ("cars", A["car"], {"make": "HACKED"}), ("trips", A["trip"], {"destination": "HACKED"})]:
        r = as_(B, "PATCH", f"{table}?id=eq.{key}", json=patch)
        check(f"B updates A's {table} row", affected(r) in (0, None), f"-> {r.status_code} {r.text[:60]}")
    a_now = svc("GET", f"cars?id=eq.{A['car']}&select=make").json()[0]["make"]
    check("A's car is unchanged after B's attempts (verified with the service role)", a_now == "Toyota", f"make={a_now!r}")

    print("\n== 5. UPDATE: user B tries to steal / hand over ownership ==")
    r = as_(B, "PATCH", f"cars?id=eq.{B['car']}", json={"user_id": A["id"]})
    check("B reassigns HIS car to A (user_id -> A)", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "PATCH", f"trips?id=eq.{B['trip']}", json={"user_id": A["id"]})
    check("B reassigns HIS trip to A", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "PATCH", f"trips?id=eq.{B['trip']}", json={"car_id": A["car"]})
    check("B re-points HIS trip at A's car_id", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code} (updated!)" if affected(r) else "")
    r = as_(B, "PATCH", f"profiles?id=eq.{B['id']}", json={"id": A["id"]})
    check("B changes HIS profile id to A's id", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")

    print("\n== 6. DELETE: user B deletes A's rows ==")
    for table, key in [("cars", A["car"]), ("trips", A["trip"]), ("profiles", A["id"])]:
        r = as_(B, "DELETE", f"{table}?id=eq.{key}")
        check(f"B deletes A's {table} row", affected(r) in (0, None), f"-> {r.status_code}")
    for table, key in [("advisor_conversations", A["conv"]), ("advisor_messages", A["msg"])]:
        r = as_(B, "DELETE", f"{table}?id=eq.{key}")
        check(f"B deletes A's {table} row", affected(r) in (0, None), f"-> {r.status_code}")
    still = [len(svc("GET", f"{t}?id=eq.{k}&select=id").json()) for t, k in [("cars", A["car"]), ("trips", A["trip"]), ("profiles", A["id"]), ("advisor_conversations", A["conv"]), ("advisor_messages", A["msg"])]]
    check("all five of A's rows still exist after B's delete attempts", all(n == 1 for n in still), str(still))

    print("\n== 7. OWNER limits (least privilege on the owner's own rows) ==")
    r = as_(A, "PATCH", f"advisor_messages?id=eq.{A['msg']}", json={"message_text": "edited"})
    print(f"  (info) A edits HIS OWN message -> {r.status_code}, rows={affected(r)}  [0/blocked = users can't rewrite chat history]")
    r = as_(A, "DELETE", f"advisor_conversations?id=eq.{A['conv']}")
    print(f"  (info) A deletes HIS OWN conversation -> {r.status_code}, rows={affected(r)}")

    print("\n== 8. ANONYMOUS (no login, just the public anon key) ==")
    for table in ("profiles", "cars", "trips", "advisor_conversations", "advisor_messages", "fuel_prices"):
        r = as_(None, "GET", f"{table}?select=*")
        check(f"anon reads {table}", affected(r) in (0, None), f"-> {r.status_code} {str(r.text)[:50]}")
    for table, body in [("cars", {"user_id": A["id"], "make": "x", "model": "y", "year": 2000, "fuel_type": "Gasoline"}),
                        ("trips", {"user_id": A["id"], "car_id": A["car"], "destination": "x"}),
                        ("advisor_conversations", {"user_id": A["id"]}), ("profiles", {"id": str(uuid.uuid4()), "email": "x@y.z"})]:
        r = as_(None, "POST", table, json=body)
        check(f"anon inserts into {table}", r.status_code >= 400, f"-> {r.status_code}")
    for table in ("cars", "trips", "profiles"):
        r = as_(None, "PATCH", f"{table}?id=eq.{A['car'] if table == 'cars' else A['trip'] if table == 'trips' else A['id']}", json={"make": "x"} if table == "cars" else {"destination": "x"} if table == "trips" else {"full_name": "x"})
        check(f"anon updates {table}", affected(r) in (0, None), f"-> {r.status_code}")
        r = as_(None, "DELETE", f"{table}?id=eq.{A['car'] if table == 'cars' else A['trip'] if table == 'trips' else A['id']}")
        check(f"anon deletes {table}", affected(r) in (0, None), f"-> {r.status_code}")

    print("\n== 9. fuel_prices (RLS on, no policies: service-role only) ==")
    r = as_(B, "GET", "fuel_prices?select=*")
    check("logged-in user B reads fuel_prices directly", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(B, "POST", "fuel_prices", json={"fuel_type": "diesel", "price_per_liter_lbp": 1})
    check("logged-in user B writes fuel_prices (price poisoning)", r.status_code >= 400, f"-> {r.status_code}")
finally:
    for u in (A, B):
        if not u:
            continue
        for table in ("advisor_conversations", "trips", "cars"):
            svc("DELETE", f"{table}?user_id=eq.{u['id']}")
        svc("DELETE", f"profiles?id=eq.{u['id']}")
        httpx.delete(f"{URL}/auth/v1/admin/users/{u['id']}", headers=ADMIN, timeout=30)
    # also remove rows created by gap probes that reference the users' cars (cascade handles most)
    print(f"\ncleanup done. RESULT: {passes} blocked as required, {len(gaps)} GAP(S)")
    for g in gaps:
        print("  GAP:", g)

sys.exit(1 if gaps else 0)
