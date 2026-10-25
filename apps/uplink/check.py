"""Cloud uplink check against two real SpacetimeDB servers (stdlib only).

    LOCAL_URI=http://127.0.0.1:3000 MIRROR_URI=http://127.0.0.1:3100 \
    OPERATOR_TOKEN=<publisher token> python3 apps/uplink/check.py

Expects a freshly published local desk (`spacetime publish -c incident-desk`) and mirror
(`spacetime publish -c incident-desk-mirror`), both published by the OPERATOR_TOKEN identity
(it is the desk's first operator and the mirror's admin). "Offline" points the uplink at a
port nothing listens on, which is what an unreachable mirror looks like to it.
"""
import json, os, subprocess, tempfile, urllib.request, urllib.error

LOCAL = os.environ.get("LOCAL_URI", "http://127.0.0.1:3000")
MIRROR = os.environ["MIRROR_URI"]
OP = os.environ["OPERATOR_TOKEN"]
DESK, MDB, SITE = "incident-desk", "incident-desk-mirror", "cp-check"
UPLINK = os.path.join(os.path.dirname(__file__), "src", "uplink.mjs")
TOKEN_FILE = os.path.join(tempfile.mkdtemp(), "uplink-token")


def http(uri, method, path, token=None, body=None):
    req = urllib.request.Request(uri + path, method=method, data=None if body is None else body.encode())
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json" if "/call/" in path else "text/plain")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def call(uri, db, token, reducer, *args):
    return http(uri, "POST", f"/v1/database/{db}/call/{reducer}", token, json.dumps(list(args)))


def sql(uri, db, q):
    status, text = http(uri, "POST", f"/v1/database/{db}/sql", None, q)
    assert status == 200, text
    res = json.loads(text)[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    return [dict(zip(names, row)) for row in res["rows"]]


def identity(uri):
    status, text = http(uri, "POST", "/v1/identity")
    assert status == 200, text
    j = json.loads(text)
    return j["identity"], j["token"]


def check(label, ok):
    print(f"{'PASS' if ok else 'FAIL'} {label}")
    assert ok, label


def expect(label, result, ok, code=None):
    status, text = result
    check(f"{label}: {status} {text[:140]}", (status == 200) == ok and (code is None or code in text))


def uplink(mirror=MIRROR):
    env = {**os.environ, "SPACETIMEDB_URI": LOCAL, "MIRROR_URI": mirror, "MIRROR_SITE": SITE, "UPLINK_TOKEN_FILE": TOKEN_FILE}
    p = subprocess.run(["node", UPLINK, "once"], env=env, capture_output=True, text=True)
    last = json.loads(p.stdout.strip().splitlines()[-1])
    return p.returncode, last.get("result")


# Local desk: one report, approved into an incident (the same path the demo uses).
run = sql(LOCAL, DESK, "SELECT * FROM desk")[0]["run_id"]
bridge_id, bridge = identity(LOCAL)
expect("grant bridge", call(LOCAL, DESK, OP, "grant_role", bridge_id, "bridge"), True)


def report(mid, text):
    r = {"runId": run, "sourceId": "mesh-f99260d4", "messageId": mid, "text": text, "origin": "radio",
         "sentAt": "2026-10-25T09:00:00Z", "reportedEventAt": None,
         "reportedLocation": {"placeId": "school", "source": "sender_explicit"},
         "transport": {"verification": "verified", "encoding": "llm", "measurementSource": "measured",
                       "originalBytes": len(text.encode()), "applicationPacketBytes": 31}}
    expect(f"local receive_report {mid}", call(LOCAL, DESK, bridge, "receive_report", json.dumps(r, ensure_ascii=False)), True)
    return next(json.loads(x["json"])["reportId"] for x in sql(LOCAL, DESK, "SELECT * FROM report") if x["message_id"] == mid)


r1 = report("m-0001", "Water rising at the school gym, two people on the roof — need boat")
sig = sql(LOCAL, DESK, "SELECT * FROM desk")[0]["new_incident_signature"]
proposal = {"runId": run, "proposalId": "op-p1", "incidentId": "inc-school", "baseIncidentVersions": {"inc-school": 0},
            "inputSignature": sig, "addReportIds": [r1], "relations": [], "suggestedStatus": "OPEN",
            "suggestedAttention": "POSSIBLE_LIFE_SAFETY", "suggestedSummary": "Two people on the school gym roof.",
            "evidenceReportIds": [r1], "uncertainties": [], "provider": "operator"}
expect("local proposal", call(LOCAL, DESK, OP, "submit_incident_proposal", json.dumps({"jobId": None, "proposal": proposal})), True)
expect("local approve", call(LOCAL, DESK, OP, "approve_proposal", json.dumps(
    {"commandId": "cmd-a1", "runId": run, "proposalId": "op-p1", "inputSignature": sig, "baseIncidentVersions": {"inc-school": 0}})), True)

# Uplink identity: not granted yet, so the mirror refuses it.
env = {**os.environ, "MIRROR_URI": MIRROR, "MIRROR_SITE": SITE, "UPLINK_TOKEN_FILE": TOKEN_FILE}
out = subprocess.run(["node", UPLINK, "identity"], env=env, capture_output=True, text=True, check=True).stdout
uplink_id = json.loads(out.strip().splitlines()[-1])["identity"]
code, _ = uplink()
check("ungranted uplink is refused by the mirror (exit 1)", code == 1)
expect("mirror admin grants the uplink", call(MIRROR, MDB, OP, "grant_uploader", uplink_id, SITE), True)
_, anon = identity(MIRROR)
expect("anonymous identity cannot grant", call(MIRROR, MDB, anon, "grant_uploader", uplink_id, "other"), False, "UNAUTHORIZED")

# Online: first sync sends the confirmed picture, the second sends nothing.
code, res = uplink()
check(f"first sync sends report, review event, incident: {res}", code == 0 and res["reports"] == 1 and res["reviewEvents"] == 1 and res["incidents"] == 1)
code, res = uplink()
check(f"repeat sync sends nothing: {res}", code == 0 and res["sent"] == 0)
local_inc = sql(LOCAL, DESK, "SELECT * FROM incident")[0]["json"]
mirror_inc = sql(MIRROR, MDB, f"SELECT * FROM mirror_incident WHERE site_id = '{SITE}'")[0]["json"]
local_rep = next(x["json"] for x in sql(LOCAL, DESK, "SELECT * FROM report") if json.loads(x["json"])["reportId"] == r1)
mirror_rep = sql(MIRROR, MDB, f"SELECT * FROM mirror_report WHERE site_id = '{SITE}'")[0]["json"]
check("mirror incident and report are byte-identical to local", local_inc == mirror_inc and local_rep == mirror_rep)

# Offline: the mirror is unreachable; the desk keeps working, the uplink does nothing.
before_events = len(sql(LOCAL, DESK, "SELECT * FROM review_event"))
r2 = report("m-0002", "Correction: three people on the gym roof, one child")
expect("local operator edit while offline", call(LOCAL, DESK, OP, "operator_edit", json.dumps(
    {"commandId": "cmd-e1", "runId": run, "incidentId": "inc-school", "baseRevision": 1,
     "changes": {"summary": "Three people on the gym roof, one child."}, "reason": "correction from field", "sourceReportIds": [r2]})), True)
code, res = uplink("http://127.0.0.1:1")
check("offline cycle exits 2 and sends nothing", code == 2 and res is None)
r3 = report("m-0003", "Unreviewed: smoke seen near the library")

# Back online: only what changed goes up; the unreviewed report stays at the command post.
code, res = uplink()
check(f"catch-up sends only the new report, event and incident revision: {res}",
      code == 0 and res["reports"] == 1 and res["reviewEvents"] == 1 and res["incidents"] == 1)
mirror_reports = {json.loads(x["json"])["reportId"] for x in sql(MIRROR, MDB, f"SELECT * FROM mirror_report WHERE site_id = '{SITE}'")}
check(f"unreviewed {r3} is not shared; {r1} and {r2} are", mirror_reports == {r1, r2})
m = sql(MIRROR, MDB, f"SELECT * FROM mirror_incident WHERE site_id = '{SITE}'")[0]
check(f"mirror incident at revision {m['revision']}", m["revision"] == 2)
check("uplink wrote nothing locally", len(sql(LOCAL, DESK, "SELECT * FROM review_event")) == before_events + 1)

# The mirror's own rules, called directly with the uplink's token.
token = open(TOKEN_FILE).read().strip()
epoch = sql(MIRROR, MDB, "SELECT * FROM site")[0]["epoch"]
base = {"siteId": SITE, "epoch": epoch, "runId": run, "runNumber": 1, "reports": [], "relations": [], "reviewEvents": []}
old = json.loads(local_inc)
expect("stale incident revision is accepted as a no-op", call(MIRROR, MDB, token, "ingest", json.dumps({**base, "incidents": [local_inc]})), True)
check("stale upload did not roll the mirror back", sql(MIRROR, MDB, f"SELECT * FROM mirror_incident WHERE site_id = '{SITE}'")[0]["revision"] == 2)
tampered = json.loads(local_rep)
tampered["input"]["text"] += " (edited)"
expect("changed text under an existing report id", call(MIRROR, MDB, token, "ingest", json.dumps(
    {**base, "incidents": [], "reports": [json.dumps(tampered, ensure_ascii=False)]})), False, "CONFLICT")
expect("uploading for another site", call(MIRROR, MDB, token, "ingest", json.dumps({**base, "siteId": "someone-else", "incidents": []})), False, "UNAUTHORIZED")
bad = {**old, "attention": "VERY_URGENT"}
expect("row outside the contract", call(MIRROR, MDB, token, "ingest", json.dumps({**base, "incidents": [json.dumps(bad)]})), False, "INVALID_INPUT")
print("uplink check done")
