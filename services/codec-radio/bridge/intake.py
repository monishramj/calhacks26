"""Deliver verified radio reports to the incident desk exactly once (G0 contract, packages/domain).

Transports (packages/domain/README.md, "Radio intake transport (frozen in v1)"):
* spacetimedb: POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DATABASE}/call/receive_report with the bridge's
  bearer token and body [<ReportInput JSON string>]. The token comes from `radio_bridge.py identity` and stays outside git.
* http: the same body POSTed to INTAKE_URL (the D-007 coordinator fallback).
* none: log only. Clearly labelled; nothing reaches the desk.

The DeliveryStore persists every accepted (sourceId, messageId, text) before intake is attempted, so a repeat, a
retry, a late packet or a bridge restart never produces a second intake of the same report. Failed intakes stay
pending and are retried; they are never dropped.
"""
from __future__ import annotations

import hashlib
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "domain" / "python"))
import domain_contract  # noqa: E402  (G0 contract; needs jsonschema)

ENCODING = {0: "raw", 1: "lightweight", 2: "llm"}   # mesh_codec methods RAW, UNISHOX, LLM


def report_input(run_id: str, sender_node: str, msg_id: int, text: str, method: int, sent_at: int,
                 frame_bytes: int) -> dict:
    """A schema-valid radio ReportInput. Raises ValueError listing every contract violation."""
    payload = {
        "runId": run_id,
        "sourceId": domain_contract.mesh_source_id(sender_node),
        "messageId": f"m{msg_id:08x}",
        "text": text,
        "origin": "radio",
        "sentAt": (datetime.fromtimestamp(sent_at, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                   if sent_at else None),
        "reportedEventAt": None,
        "reportedLocation": None,   # the codec's synthetic grid offsets are never trusted incident data (§19)
        "transport": {
            "verification": "verified",
            "encoding": ENCODING[method],
            "measurementSource": "measured",
            "originalBytes": len(text.encode("utf-8")),
            "applicationPacketBytes": frame_bytes,
        },
    }
    errors = domain_contract.validate("ReportInput", payload)
    if errors:
        raise ValueError("; ".join(errors))
    return payload


class Transport:
    label = "none"

    def post(self, body: str) -> tuple[bool, str]:
        return True, "intake disabled (log only)"


class HttpTransport(Transport):
    def __init__(self, url: str, token: str | None = None, label: str = "http", timeout: float = 10.0):
        self.url, self.token, self.label, self.timeout = url, token, label, timeout

    def post(self, body: str) -> tuple[bool, str]:
        data = json.dumps([body], ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.url, data=data, method="POST",
                                     headers={"Content-Type": "application/json"})
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return 200 <= resp.status < 300, f"HTTP {resp.status}"
        except urllib.error.HTTPError as e:
            detail = e.read(300).decode("utf-8", "replace").replace("\n", " ")
            return False, f"HTTP {e.code}: {detail}"
        except (urllib.error.URLError, OSError) as e:
            return False, f"unreachable: {e}"


def spacetimedb_transport(uri: str, database: str, token: str) -> HttpTransport:
    return HttpTransport(f"{uri.rstrip('/')}/v1/database/{database}/call/receive_report", token, "spacetimedb")


def create_identity(uri: str, token_file: Path) -> str:
    """POST /v1/identity once; save {identity, token} outside git. Returns the identity (never prints the token)."""
    req = urllib.request.Request(f"{uri.rstrip('/')}/v1/identity", data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        got = json.loads(resp.read())
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(json.dumps({"identity": got["identity"], "token": got["token"]}), encoding="utf-8")
    return got["identity"]


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


class DeliveryStore:
    """Append-only JSONL of accepted reports and intake results; reloaded on start."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.texts: dict[tuple[str, int], set[str]] = {}   # (sender, msg_id) -> text hashes accepted
        self.pending: dict[str, dict] = {}                   # entry key -> record awaiting intake
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                rec = json.loads(line)
                if rec["event"] == "accepted":
                    self.texts.setdefault((rec["sender"], rec["msg_id"]), set()).add(rec["text_hash"])
                    self.pending[rec["entry"]] = rec
                elif rec["event"] == "intake_ok":
                    self.pending.pop(rec["entry"], None)

    def _append(self, rec: dict):
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def classify(self, sender: str, msg_id: int, text: str) -> str:
        """'new', 'duplicate' (same id and text) or 'conflict' (same id, different text)."""
        with self.lock:
            seen = self.texts.get((sender, msg_id))
            if not seen:
                return "new"
            return "duplicate" if text_hash(text) in seen else "conflict"

    def accept(self, sender: str, msg_id: int, text: str, report: dict) -> dict | None:
        """Persist before intake. Returns the record, or None if this exact (id, text) was already accepted."""
        with self.lock:
            h = text_hash(text)
            key = (sender, msg_id)
            if h in self.texts.get(key, set()):
                return None
            self.texts.setdefault(key, set()).add(h)
            rec = {"event": "accepted", "entry": f"{sender}/{msg_id:08x}/{h}", "sender": sender, "msg_id": msg_id,
                   "text_hash": h, "report": report, "t": time.time()}
            self._append(rec)
            self.pending[rec["entry"]] = rec
            return rec

    def done(self, entry: str, detail: str):
        with self.lock:
            self.pending.pop(entry, None)
            self._append({"event": "intake_ok", "entry": entry, "detail": detail, "t": time.time()})


class IntakeWorker:
    """Posts accepted reports; keeps failures pending and retries them every `retry_s` seconds."""

    def __init__(self, store: DeliveryStore, transport: Transport, log, retry_s: float = 10.0):
        self.store, self.transport, self.log, self.retry_s = store, transport, log, retry_s
        self._wake = threading.Event()
        self._stop = False
        self.thread = threading.Thread(target=self._run, daemon=True, name="intake")

    def start(self):
        self.thread.start()

    def kick(self):
        self._wake.set()

    def flush(self) -> int:
        """Try every pending report once, now. Returns how many are still pending."""
        for entry, rec in list(self.store.pending.items()):
            body = domain_contract.dumps(rec["report"])
            ok, detail = self.transport.post(body)
            self.log({"event": "intake", "transport": self.transport.label, "ok": ok, "detail": detail,
                      "messageId": rec["report"]["messageId"], "sourceId": rec["report"]["sourceId"]})
            if ok:
                self.store.done(entry, detail)
        return len(self.store.pending)

    def _run(self):
        while not self._stop:
            self.flush()
            self._wake.wait(self.retry_s)
            self._wake.clear()

    def stop(self):
        self._stop = True
        self._wake.set()
