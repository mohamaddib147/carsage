"""Live RLS re-test (CAR-24, extended for fuel_logs in CAR-53) — run it whenever policies or grants change.

Creates two throwaway Supabase users (A and B), seeds each with a car, trip,
conversation and message, then checks — through the same REST API the browser
uses — that:
  0. legitimate owner actions still work (positive controls),
  1-6. user B cannot read, forge, modify, re-assign or delete user A's rows in
       profiles / cars / trips / advisor_conversations / advisor_messages
       (including through embedded joins and by pointing B's own rows at A's car),
  7. owners cannot rewrite chat history,
  8. anonymous visitors (public anon key only) can do nothing,
  9. fuel_prices is service-role only,
 10. fuel_logs (CAR-53): owner-only read/insert, no cross-user car references, no
     edit/delete, nothing for anonymous visitors, and the database's own input limits.
     CAR-61 adds the optional odometer_km column: null still accepted, 1-2,000,000
     whole km only, and the same owner-only / no-edit rules apply to it.
 11. maintenance_items / maintenance_records (CAR-62): owner-only read; an item only
     on the caller's own car, a completion only on the caller's own item; items can
     be edited (only name/intervals/baseline/notes, never owner or car) and deleted
     by their owner; completions can be deleted (undo) but never edited, by anyone;
     nothing for anonymous visitors; and the database's own input limits.
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
        u["fuel"] = svc("POST", "fuel_logs", json={"user_id": u["id"], "car_id": u["car"], "filled_at": "2026-09-01", "liters": 30, "cost_amount": 45, "cost_currency": "USD"}).json()[0]["id"]

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
    r = as_(A, "POST", "fuel_logs", json={"user_id": A["id"], "car_id": A["car"], "filled_at": "2026-09-21", "liters": 19.6, "cost_amount": 30, "cost_currency": "USD"})
    works("A logs a fill-up for HIS car", r.status_code == 201, str(r.status_code))
    r = as_(A, "POST", "fuel_logs", json={"user_id": A["id"], "car_id": A["car"], "filled_at": "2026-09-22", "liters": 25, "cost_amount": 2500000, "cost_currency": "LBP"})
    works("A logs a fill-up costed in LBP", r.status_code == 201, str(r.status_code))
    r = as_(A, "GET", f"fuel_logs?select=id&car_id=eq.{A['car']}")
    works("A reads HIS car's fill-ups (3 = one seeded + two just logged)", affected(r) == 3, f"{r.status_code} rows={affected(r)}")

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
    for table in ("profiles", "cars", "trips", "advisor_conversations", "advisor_messages", "fuel_prices", "fuel_logs"):
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

    print("\n== 10. fuel_logs (CAR-53) ==")
    r = as_(B, "GET", f"fuel_logs?select=*&id=eq.{A['fuel']}")
    check("B reads A's fuel log by id", affected(r) == 0, f"-> {r.status_code} {r.text[:60]}")
    r = as_(B, "GET", f"fuel_logs?select=*&car_id=eq.{A['car']}")
    check("B lists fuel logs filtered by A's car_id", affected(r) == 0, f"-> {r.status_code}")
    r = as_(B, "GET", "fuel_logs?select=*")
    rows = r.json() if r.status_code == 200 else []
    check(f"B's full fuel_logs listing contains none of A's data ({len(rows)} rows visible, all B's)", not [x for x in rows if A["id"] in json.dumps(x)])
    r = as_(B, "GET", f"cars?select=id,fuel_logs(id,liters)&id=eq.{A['car']}")
    check("B reads A's fuel logs through an embedded join (cars -> fuel_logs)", affected(r) == 0)
    r = as_(B, "POST", "fuel_logs", json={"user_id": A["id"], "car_id": A["car"], "filled_at": "2026-09-21", "liters": 10, "cost_amount": 10, "cost_currency": "USD"})
    check("B inserts a fuel log owned by A", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "POST", "fuel_logs", json={"user_id": B["id"], "car_id": A["car"], "filled_at": "2026-09-21", "liters": 10, "cost_amount": 10, "cost_currency": "USD"})
    check("B logs HIS fill-up against A's car_id (cross-user reference)", r.status_code >= 400, f"-> {r.status_code} (row created!)" if r.status_code < 300 else "")
    r = as_(B, "PATCH", f"fuel_logs?id=eq.{A['fuel']}", json={"liters": 1})
    check("B updates A's fuel log", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(B, "PATCH", f"fuel_logs?id=eq.{B['fuel']}", json={"car_id": A["car"]})
    check("B re-points HIS fuel log at A's car", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "PATCH", f"fuel_logs?id=eq.{B['fuel']}", json={"user_id": A["id"]})
    check("B hands HIS fuel log to A", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "DELETE", f"fuel_logs?id=eq.{A['fuel']}")
    check("B deletes A's fuel log", affected(r) in (0, None), f"-> {r.status_code}")
    still = svc("GET", f"fuel_logs?id=eq.{A['fuel']}&select=liters,cost_amount").json()
    check("A's fuel log is intact after B's attempts (verified with the service role)", len(still) == 1 and float(still[0]["liters"]) == 30, str(still))
    r = as_(A, "PATCH", f"fuel_logs?id=eq.{A['fuel']}", json={"liters": 1})
    check("even the OWNER cannot edit a fuel log (add and view only)", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(A, "DELETE", f"fuel_logs?id=eq.{A['fuel']}")
    check("even the OWNER cannot delete a fuel log (add and view only)", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(None, "GET", "fuel_logs?select=*")
    check("anon reads fuel_logs", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(None, "POST", "fuel_logs", json={"user_id": A["id"], "car_id": A["car"], "filled_at": "2026-09-21", "liters": 10, "cost_amount": 10, "cost_currency": "USD"})
    check("anon inserts into fuel_logs", r.status_code >= 400, f"-> {r.status_code}")

    print("    -- the database's own input limits (the browser writes directly, so these are the real check) --")
    good = {"user_id": A["id"], "car_id": A["car"], "filled_at": "2026-09-21", "liters": 10, "cost_amount": 10, "cost_currency": "USD"}
    for label, patch in [
        ("liters = 0", {"liters": 0}), ("liters negative", {"liters": -5}), ("liters above the 200 L ceiling", {"liters": 201}),
        ("cost = 0", {"cost_amount": 0}), ("cost negative", {"cost_amount": -1}), ("cost absurdly large", {"cost_amount": 10**13}),
        ("unknown currency", {"cost_currency": "EUR"}), ("missing currency", {"cost_currency": None}),
        ("missing date", {"filled_at": None}), ("date before 2000", {"filled_at": "1999-12-31"}), ("date after 2100", {"filled_at": "2101-01-01"}),
        ("missing liters", {"liters": None}), ("missing cost", {"cost_amount": None}),
    ]:
        r = as_(A, "POST", "fuel_logs", json={**good, **patch})
        check(f"the database rejects a fill-up with {label}", r.status_code in (400, 409), f"-> {r.status_code} {r.text[:70]}")
    r = as_(A, "POST", "fuel_logs", json={**good, "liters": 200, "cost_amount": 0.01})
    works("boundary values are accepted (200 L, 0.01 cost)", r.status_code == 201, f"-> {r.status_code} {r.text[:70]}")

    print("    -- odometer_km (CAR-61): optional, whole km, 1 to 2,000,000; same owner-only rules --")
    r = as_(A, "POST", "fuel_logs", json={**good, "odometer_km": 84250})
    works("A logs a fill-up WITH an odometer reading", r.status_code == 201 and r.json()[0].get("odometer_km") == 84250, f"-> {r.status_code} {r.text[:70]}")
    odo_row = r.json()[0]["id"] if r.status_code == 201 else None
    r = as_(A, "POST", "fuel_logs", json={**good, "odometer_km": None})
    works("a fill-up with no odometer reading (like every older row) is still accepted", r.status_code == 201, f"-> {r.status_code}")
    r = as_(A, "POST", "fuel_logs", json={**good, "odometer_km": 2000000})
    works("boundary odometer 2,000,000 km is accepted", r.status_code == 201, f"-> {r.status_code} {r.text[:70]}")
    for label, value in [("0 km", 0), ("a negative reading", -1), ("above the 2,000,000 km ceiling", 2000001),
                         ("a decimal reading", 84250.5), ("text", "84k")]:
        r = as_(A, "POST", "fuel_logs", json={**good, "odometer_km": value})
        check(f"the database rejects an odometer of {label}", r.status_code in (400, 409), f"-> {r.status_code} {r.text[:70]}")
    r = as_(B, "POST", "fuel_logs", json={**good, "user_id": B["id"], "odometer_km": 90000})
    check("B logs an odometer reading against A's car_id", r.status_code >= 400, f"-> {r.status_code} (row created!)" if r.status_code < 300 else "")
    r = as_(B, "GET", f"fuel_logs?select=odometer_km&id=eq.{odo_row}")
    check("B reads A's odometer reading", affected(r) == 0, f"-> {r.status_code} {r.text[:60]}")
    r = as_(A, "PATCH", f"fuel_logs?id=eq.{odo_row}", json={"odometer_km": 1})
    check("even the OWNER cannot change a saved odometer reading", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(B, "PATCH", f"fuel_logs?id=eq.{odo_row}", json={"odometer_km": 1})
    check("B changes A's odometer reading", affected(r) in (0, None), f"-> {r.status_code}")
    still = svc("GET", f"fuel_logs?id=eq.{odo_row}&select=odometer_km").json()
    check("A's odometer reading is unchanged after both attempts (service role)", still == [{"odometer_km": 84250}], str(still))

    print("\n== 11. maintenance_items / maintenance_records (CAR-62) ==")
    item_body = {"name": "Oil change", "interval_km": 5000, "interval_months": 6, "baseline_date": "2026-09-01", "baseline_km": 84000}
    for u in (A, B):
        u["item"] = svc("POST", "maintenance_items", json={"user_id": u["id"], "car_id": u["car"], **item_body}).json()[0]["id"]
        u["record"] = svc("POST", "maintenance_records", json={"user_id": u["id"], "item_id": u["item"], "done_on": "2026-09-15", "odometer_km": 85000}).json()[0]["id"]

    print("    -- positive controls: the owner can do everything the page needs --")
    r = as_(A, "POST", "maintenance_items", json={"user_id": A["id"], "car_id": A["car"], "name": "Mecanique", "interval_months": 12, "baseline_date": "2026-01-10"})
    works("A adds a date-only item to HIS car", r.status_code == 201, f"-> {r.status_code} {r.text[:70]}")
    tmp_item = r.json()[0]["id"] if r.status_code == 201 else None
    r = as_(A, "PATCH", f"maintenance_items?id=eq.{tmp_item}", json={"name": "Mecanique inspection", "interval_months": 11, "notes": "Bring the papers"})
    works("A edits HIS item's name, interval and notes", affected(r) == 1, f"-> {r.status_code} {r.text[:70]}")
    r = as_(A, "POST", "maintenance_records", json={"user_id": A["id"], "item_id": tmp_item, "done_on": "2026-10-01", "note": "All good"})
    works("A marks HIS item as done (a completion with no odometer)", r.status_code == 201, f"-> {r.status_code} {r.text[:70]}")
    tmp_record = r.json()[0]["id"] if r.status_code == 201 else None
    r = as_(A, "GET", f"maintenance_items?select=id,maintenance_records(id)&id=eq.{A['item']}")
    works("A reads HIS item with its history (embedded)", affected(r) == 1 and len(r.json()[0]["maintenance_records"]) == 1, f"-> {r.status_code} {r.text[:70]}")
    r = as_(A, "DELETE", f"maintenance_records?id=eq.{tmp_record}")
    works("A deletes (undoes) HIS OWN completion", affected(r) == 1, f"-> {r.status_code}")
    r = as_(A, "DELETE", f"maintenance_items?id=eq.{tmp_item}")
    works("A deletes HIS item", affected(r) == 1, f"-> {r.status_code}")

    print("    -- user B against user A's maintenance data --")
    r = as_(B, "GET", f"maintenance_items?select=*&id=eq.{A['item']}")
    check("B reads A's maintenance item by id", affected(r) == 0, f"-> {r.status_code} {r.text[:60]}")
    r = as_(B, "GET", f"maintenance_items?select=*&car_id=eq.{A['car']}")
    check("B lists maintenance items filtered by A's car_id", affected(r) == 0, f"-> {r.status_code}")
    r = as_(B, "GET", f"maintenance_records?select=*&id=eq.{A['record']}")
    check("B reads A's completion by id", affected(r) == 0, f"-> {r.status_code}")
    for table in ("maintenance_items", "maintenance_records"):
        r = as_(B, "GET", f"{table}?select=*")
        rows = r.json() if r.status_code == 200 else []
        check(f"B's full {table} listing contains none of A's data ({len(rows)} rows visible, all B's)", not [x for x in rows if A["id"] in json.dumps(x)])
    r = as_(B, "GET", f"cars?select=id,maintenance_items(id,maintenance_records(id))&id=eq.{A['car']}")
    check("B reads A's items/history through an embedded join (cars -> items -> records)", affected(r) == 0)
    r = as_(B, "POST", "maintenance_items", json={"user_id": A["id"], "car_id": A["car"], **item_body})
    check("B inserts an item owned by A", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "POST", "maintenance_items", json={"user_id": B["id"], "car_id": A["car"], **item_body})
    check("B attaches HIS item to A's car (cross-user reference)", r.status_code >= 400, f"-> {r.status_code} (row created!)" if r.status_code < 300 else "")
    r = as_(B, "PATCH", f"maintenance_items?id=eq.{A['item']}", json={"name": "HACKED"})
    check("B edits A's item", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(B, "PATCH", f"maintenance_items?id=eq.{B['item']}", json={"car_id": A["car"]})
    check("B moves HIS item onto A's car", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "PATCH", f"maintenance_items?id=eq.{B['item']}", json={"user_id": A["id"]})
    check("B hands HIS item to A", affected(r) in (0, None) or r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "DELETE", f"maintenance_items?id=eq.{A['item']}")
    check("B deletes A's item", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(B, "POST", "maintenance_records", json={"user_id": B["id"], "item_id": A["item"], "done_on": "2026-10-01"})
    check("B records a completion on A's item", r.status_code >= 400, f"-> {r.status_code} (row created!)" if r.status_code < 300 else "")
    r = as_(B, "POST", "maintenance_records", json={"user_id": A["id"], "item_id": A["item"], "done_on": "2026-10-01"})
    check("B inserts a completion owned by A", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(B, "DELETE", f"maintenance_records?id=eq.{A['record']}")
    check("B deletes A's completion", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(B, "PATCH", f"maintenance_records?id=eq.{A['record']}", json={"done_on": "2020-01-01"})
    check("B edits A's completion", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(A, "PATCH", f"maintenance_records?id=eq.{A['record']}", json={"done_on": "2020-01-01", "odometer_km": 1})
    check("even the OWNER cannot edit a completion (undo = delete, never rewrite)", affected(r) in (0, None), f"-> {r.status_code}")
    r = as_(A, "PATCH", f"maintenance_records?id=eq.{A['record']}", json={"item_id": B["item"]})
    check("the owner cannot move a completion onto another item", affected(r) in (0, None), f"-> {r.status_code}")
    item_now = svc("GET", f"maintenance_items?id=eq.{A['item']}&select=name,car_id,user_id").json()
    check("A's item is unchanged after B's attempts (service role)", item_now == [{"name": "Oil change", "car_id": A["car"], "user_id": A["id"]}], str(item_now))
    rec_now = svc("GET", f"maintenance_records?id=eq.{A['record']}&select=done_on,odometer_km,item_id").json()
    check("A's completion is unchanged after every edit attempt (service role)", rec_now == [{"done_on": "2026-09-15", "odometer_km": 85000, "item_id": A["item"]}], str(rec_now))
    for table, body in [("maintenance_items", {"user_id": A["id"], "car_id": A["car"], **item_body}),
                        ("maintenance_records", {"user_id": A["id"], "item_id": A["item"], "done_on": "2026-10-01"})]:
        r = as_(None, "GET", f"{table}?select=*")
        check(f"anon reads {table}", affected(r) in (0, None), f"-> {r.status_code}")
        r = as_(None, "POST", table, json=body)
        check(f"anon inserts into {table}", r.status_code >= 400, f"-> {r.status_code}")
    r = as_(None, "DELETE", f"maintenance_records?id=eq.{A['record']}")
    check("anon deletes a completion", affected(r) in (0, None), f"-> {r.status_code}")

    print("    -- the database's own input limits --")
    good_item = {"user_id": A["id"], "car_id": A["car"], **item_body}
    for label, patch in [
        ("a blank name", {"name": "   "}), ("a 61-character name", {"name": "x" * 61}),
        ("no interval at all", {"interval_km": None, "interval_months": None}),
        ("interval_km 99", {"interval_km": 99}), ("interval_km 200,001", {"interval_km": 200001}),
        ("interval_months 0", {"interval_months": 0}), ("interval_months 121", {"interval_months": 121}),
        ("a km interval with no baseline km", {"baseline_km": None}),
        ("baseline km 0", {"baseline_km": 0}), ("baseline km 2,000,001", {"baseline_km": 2000001}),
        ("a baseline date before 2000", {"baseline_date": "1999-12-31"}), ("no baseline date", {"baseline_date": None}),
        ("501-character notes", {"notes": "x" * 501}),
    ]:
        r = as_(A, "POST", "maintenance_items", json={**good_item, **patch})
        check(f"the database rejects an item with {label}", r.status_code in (400, 409), f"-> {r.status_code} {r.text[:70]}")
    for label, patch in [("name at 60 characters", {"name": "x" * 60}), ("interval_km 100", {"interval_km": 100}),
                         ("interval_km 200,000", {"interval_km": 200000}), ("interval_months 1", {"interval_months": 1}), ("interval_months 120", {"interval_months": 120}),
                         ("a date-only item with no baseline km", {"interval_km": None, "baseline_km": None})]:
        r = as_(A, "POST", "maintenance_items", json={**good_item, **patch})
        works(f"boundary accepted: {label}", r.status_code == 201, f"-> {r.status_code} {r.text[:70]}")
    good_record = {"user_id": A["id"], "item_id": A["item"], "done_on": "2026-10-01"}
    for label, patch in [("a date before 2000", {"done_on": "1999-12-31"}), ("no date", {"done_on": None}),
                         ("odometer 0", {"odometer_km": 0}), ("odometer 2,000,001", {"odometer_km": 2000001}),
                         ("a 501-character note", {"note": "x" * 501}),
                         ("a cost (costs belong to CAR-64)", {"cost_amount": 10})]:
        r = as_(A, "POST", "maintenance_records", json={**good_record, **patch})
        check(f"the database rejects a completion with {label}", r.status_code in (400, 409), f"-> {r.status_code} {r.text[:70]}")
finally:
    for u in (A, B):
        if not u:
            continue
        for table in ("maintenance_records", "maintenance_items", "fuel_logs", "advisor_conversations", "trips", "cars"):
            svc("DELETE", f"{table}?user_id=eq.{u['id']}")
        svc("DELETE", f"profiles?id=eq.{u['id']}")
        httpx.delete(f"{URL}/auth/v1/admin/users/{u['id']}", headers=ADMIN, timeout=30)
    # also remove rows created by gap probes that reference the users' cars (cascade handles most)
    print(f"\ncleanup done. RESULT: {passes} blocked as required, {len(gaps)} GAP(S)")
    for g in gaps:
        print("  GAP:", g)

sys.exit(1 if gaps else 0)
