"""G3 smoke run against a real SpacetimeDB (stdlib only).

    SPACETIMEDB_URI=http://127.0.0.1:3000 OPERATOR_TOKEN=<publisher token> python3 spacetimedb/smoke.py

OPERATOR_TOKEN is the publishing identity's token (`spacetime login show --token`); it
is the first operator. Bridge and worker identities are minted fresh each run.
Expects a freshly published database (`spacetime publish -c incident-desk`).
"""
import json, os, urllib.request, urllib.error

URI = os.environ.get("SPACETIMEDB_URI", "http://127.0.0.1:3000")
DB = os.environ.get("SPACETIMEDB_DATABASE", "incident-desk")
OP = os.environ["OPERATOR_TOKEN"]


def http(method, path, token=None, body=None):
    req = urllib.request.Request(URI + path, method=method, data=None if body is None else body.encode())
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json" if path.startswith("/v1/database") and "/call/" in path else "text/plain")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def call(token, reducer, *args):
    return http("POST", f"/v1/database/{DB}/call/{reducer}", token, json.dumps(list(args)))


def sql(q):
    status, text = http("POST", f"/v1/database/{DB}/sql", OP, q)
    assert status == 200, text
    res = json.loads(text)[0]
    names = [e["name"]["some"] for e in res["schema"]["elements"]]
    return [dict(zip(names, row)) for row in res["rows"]]


def identity():
    status, text = http("POST", "/v1/identity")
    assert status == 200, text
    j = json.loads(text)
    return j["identity"], j["token"]


def expect(label, result, ok, code=None):
    status, text = result
    passed = (status == 200) == ok and (code is None or code in text)
    print(f"{'PASS' if passed else 'FAIL'} {label}: {status} {text[:160]}")
    assert passed


run = sql("SELECT * FROM desk")[0]["run_id"]
bridge_id, bridge = identity()
worker_id, worker = identity()
expect("grant bridge", call(OP, "grant_role", bridge_id, "bridge"), True)
expect("grant worker", call(OP, "grant_role", worker_id, "worker"), True)

report = {
    "runId": run, "sourceId": "mesh-f99260d4", "messageId": "m-0001",
    "text": "Water rising at the school gym, two people on the roof — need boat",
    "origin": "radio", "sentAt": "2026-10-25T09:00:00Z", "reportedEventAt": None,
    "reportedLocation": {"placeId": "school", "source": "sender_explicit"},
    "transport": {"verification": "verified", "encoding": "llm", "measurementSource": "measured",
                  "originalBytes": 66, "applicationPacketBytes": 31},
}
wire = json.dumps(report, ensure_ascii=False)
_, anon = identity()
expect("anonymous identity cannot receive_report", call(anon, "receive_report", wire), False, "UNAUTHORIZED")
expect("bridge receive_report", call(bridge, "receive_report", wire), True)
expect("bridge retransmission (same messageId)", call(bridge, "receive_report", wire), True)
changed = json.dumps({**report, "text": report["text"] + "!"}, ensure_ascii=False)
expect("same messageId, different text", call(bridge, "receive_report", changed), False, "INVALID_INPUT")

reports = sql("SELECT * FROM report")
assert len(reports) == 1, reports
stored = json.loads(reports[0]["json"])
assert stored["input"] == report, "original not preserved verbatim"
print(f"PASS one stored report {stored['reportId']} seq={stored['receiveSequence']} receivedAt={stored['receivedAt']} sentAt={stored['input']['sentAt']}")
rid = stored["reportId"]

# Worker: claim the local-suggestion job, submit a suggestion, then try to approve.
expect("worker claim_job", call(worker, "claim_job", json.dumps({"runId": run, "kinds": ["LOCAL_SUGGESTION"]})), True)
job = next(j for j in sql("SELECT * FROM job") if j["state"] == "CLAIMED")
job_input = json.loads(job["input_json"])
suggestion = {
    "runId": run, "reportId": rid, "action": "NEW_INCIDENT", "candidateIncidentId": None,
    "attention": "POSSIBLE_LIFE_SAFETY", "scores": [{"label": "POSSIBLE_LIFE_SAFETY", "value": 0.9, "kind": "probability"}],
    "evidenceReportIds": [rid], "baseIncidentVersions": json.loads(job["json"])["baseIncidentVersions"],
    "inputSignature": job_input["inputSignature"], "provider": "local_laya",
}
expect("worker fixture provider rejected in live run",
       call(worker, "submit_local_suggestion", json.dumps({"jobId": job["job_id"], "suggestion": {**suggestion, "provider": "fixture"}})), False, "INVALID_SOURCE")
expect("worker submit_local_suggestion", call(worker, "submit_local_suggestion", json.dumps({"jobId": job["job_id"], "suggestion": suggestion})), True)

# Operator-authored proposal for a new incident, signature copied from the desk.
sig = sql("SELECT * FROM desk")[0]["new_incident_signature"]
proposal = {
    "runId": run, "proposalId": "op-p1", "incidentId": "inc-school", "baseIncidentVersions": {"inc-school": 0},
    "inputSignature": sig, "addReportIds": [rid], "relations": [], "suggestedStatus": "OPEN",
    "suggestedAttention": "POSSIBLE_LIFE_SAFETY", "suggestedSummary": "Two people on the school gym roof; water rising.",
    "evidenceReportIds": [rid], "uncertainties": [], "provider": "operator",
}
expect("worker cannot submit as operator", call(worker, "submit_incident_proposal", json.dumps({"jobId": None, "proposal": proposal})), False, "UNAUTHORIZED")
expect("operator submit_incident_proposal", call(OP, "submit_incident_proposal", json.dumps({"jobId": None, "proposal": proposal})), True)

approve = {"commandId": "cmd-approve-1", "runId": run, "proposalId": "op-p1", "inputSignature": sig, "baseIncidentVersions": {"inc-school": 0}}
expect("worker cannot approve", call(worker, "approve_proposal", json.dumps(approve)), False, "UNAUTHORIZED")
expect("operator approve", call(OP, "approve_proposal", json.dumps(approve)), True)
expect("same commandId again (idempotent)", call(OP, "approve_proposal", json.dumps(approve)), True)
expect("second approval, new commandId", call(OP, "approve_proposal", json.dumps({**approve, "commandId": "cmd-approve-2"})), False, "STALE_REVISION")

incident = json.loads(sql("SELECT * FROM incident")[0]["json"])
events = sql("SELECT * FROM review_event")
assert incident["revision"] == 1 and incident["confirmedReportIds"] == [rid], incident
assert len(events) == 1, events
print(f"PASS confirmed incident {incident['incidentId']} rev={incident['revision']} attention={incident['attention']}; review events={len(events)}")

edit = {"commandId": "cmd-edit-1", "runId": run, "incidentId": "inc-school", "baseRevision": 0,
        "changes": {"summary": "edited"}, "reason": "operator check", "sourceReportIds": []}
expect("operator edit on old baseRevision", call(OP, "operator_edit", json.dumps(edit)), False, "STALE_REVISION")
expect("operator edit on current revision", call(OP, "operator_edit", json.dumps({**edit, "baseRevision": 1})), True)

expect("reset run", call(OP, "reset_run", json.dumps({"commandId": "cmd-reset-1", "runId": run})), True)
expect("old-run report after reset", call(bridge, "receive_report", json.dumps({**report, "messageId": "m-0002"})), False, "WRONG_RUN")
print("smoke done")
