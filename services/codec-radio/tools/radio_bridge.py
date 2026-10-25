"""Meshtastic radio bridge CLI. C4 runs `rx` (receive, verify, decode-ACK, intake); C1 runs `send`.

    # once on C4: get the bridge's SpacetimeDB identity (token saved in services/codec-radio/state/, never in git)
    python services/codec-radio/tools/radio_bridge.py identity --uri http://127.0.0.1:3000

    # C4 receiver (radio "MeshSOS A")
    python services/codec-radio/tools/radio_bridge.py rx --port COM5 --run-id <run> --intake spacetimedb
    python services/codec-radio/tools/radio_bridge.py rx --port COM5 --run-id test --intake none     # radio test only

    # C1 sender (radio "MeshSOS B"); without --text it prompts for reports, one per line
    python services/codec-radio/tools/radio_bridge.py send --port COM4 --dest !f99260d4 --text "School gym ..."

Environment defaults (§19 names): RADIO_SERIAL_PORT, RADIO_DESTINATION_ID, CODEC_MODEL_PATH, SPACETIMEDB_URI,
SPACETIMEDB_DATABASE; plus BRIDGE_RUN_ID and INTAKE_URL (coordinator fallback). Every event is appended to
services/codec-radio/logs/bridge-<role>-<host>-<time>.jsonl.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE / "codec"))
sys.path.insert(0, str(SERVICE))
import runtime  # noqa: E402  (before llama_cpp)

STATE = SERVICE / "state"
TOKEN_FILE = STATE / "bridge-token.json"


def make_log(role: str):
    d = SERVICE / "logs"
    d.mkdir(exist_ok=True)
    path = d / f"bridge-{role}-{socket.gethostname()}-{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    lock = threading.Lock()
    f = open(path, "a", encoding="utf-8")
    print(f"log: {path}")

    def log(rec: dict):
        rec = {"t": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **rec}
        with lock:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            f.flush()
        show(rec)
    return log


def show(r: dict):
    e = r["event"]
    if e == "decoded":
        print(f"  RX {r['kind'].upper():9s} msg {r['msg_id']} try {r['attempt']} from {r['from']} "
              f"{r['frame_bytes']} B snr={r['snr']} rssi={r['rssi']}\n     {r['text']!r}")
    elif e in ("decode_failed", "rejected", "rx_error"):
        print(f"  RX REJECTED {r.get('msg_id', '')} from {r.get('from')}: {r.get('reason') or r.get('error')}")
    elif e == "decode_ack_sent":
        print(f"  -> decode ACK {r['status']} for msg {r['msg_id']} try {r['attempt']}")
    elif e == "intake":
        print(f"  INTAKE {'OK' if r['ok'] else 'FAILED (will retry)'} via {r['transport']}: {r['messageId']} "
              f"({r['detail']})")
    elif e == "send":
        print(f"  TX msg {r['msg_id']} try {r['attempt']} method {r['method']} {r['frame_bytes']} B")
    elif e == "radio_ack":
        print(f"     radio ACK try {r['attempt']}: {'yes' if r['ok'] else 'NO (' + str(r['detail']) + ')'}")
    elif e == "late_success":
        print(f"  LATE decode ACK VERIFIED for msg {r['msg_id']} try {r['attempt']}")
    elif e == "outcome":
        print(f"  RESULT {r['state']}  msg {r['msg_id']}  {r['text_bytes']} B text -> {r['total_air_bytes']} B on air"
              + (f"  ({r['reason']})" if r['reason'] else ""))
        print("     radio ACK != decoded; 'read by a person' is shown only on the incident desk")


def load_model(required: bool):
    if not os.environ.get("CODEC_MODEL_PATH"):
        if required:
            sys.exit("Set CODEC_MODEL_PATH to SmolLM2-360M.Q8_0.gguf (the receiver must decode LLM packets).")
        print("CODEC_MODEL_PATH not set: sending raw/Unishox2 only (no LLM compression)")
        return None
    m = runtime.load()
    fp = runtime.fingerprint(m)
    if fp != runtime.REFERENCE_FINGERPRINT:
        sys.exit(f"codec fingerprint {fp} != {runtime.REFERENCE_FINGERPRINT}: this machine cannot interoperate")
    print(f"codec fingerprint {fp} OK")
    return m


def open_radio(port):
    from bridge.radio import MeshtasticRadio
    if not port:
        sys.exit("Pass --port (e.g. COM5) or set RADIO_SERIAL_PORT. List ports: python -m serial.tools.list_ports -v")
    r = MeshtasticRadio(port)
    print("radio", r.describe())
    return r


def cmd_identity(a):
    from bridge.intake import create_identity
    ident = create_identity(a.uri, TOKEN_FILE)
    print(f"bridge identity: {ident}\ntoken saved to {TOKEN_FILE} (outside git). An operator must grant this "
          f"identity the 'bridge' role before reports are accepted.")


def cmd_rx(a):
    from bridge.core import Bridge
    from bridge.intake import DeliveryStore, HttpTransport, IntakeWorker, Transport, spacetimedb_transport
    if a.intake == "spacetimedb":
        if not (a.uri and a.database):
            sys.exit("--intake spacetimedb needs SPACETIMEDB_URI and SPACETIMEDB_DATABASE (or --uri/--database)")
        if not TOKEN_FILE.exists():
            sys.exit(f"no bridge token at {TOKEN_FILE}: run `radio_bridge.py identity --uri {a.uri}` first")
        transport = spacetimedb_transport(a.uri, a.database, json.loads(TOKEN_FILE.read_text())["token"])
    elif a.intake == "http":
        if not a.intake_url:
            sys.exit("--intake http needs INTAKE_URL (or --intake-url)")
        transport = HttpTransport(a.intake_url)
    else:
        transport = Transport()
        print("INTAKE DISABLED (--intake none): verified reports are logged, nothing reaches the incident desk")
    model = load_model(required=True)
    log = make_log("rx")
    store = DeliveryStore(STATE / f"delivered-{a.run_id}.jsonl")
    worker = IntakeWorker(store, transport, log)
    radio = open_radio(a.port)
    Bridge(radio, model, log, store=store, intake=worker, run_id=a.run_id, ack_delay=a.ack_delay)
    worker.start()
    print(f"receiving on {radio.node_id} | run {a.run_id} | intake {transport.label} | "
          f"{len(store.pending)} report(s) pending from before. Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pending = worker.flush()
        print(f"stopped; {pending} report(s) still pending intake (kept in {store.path}, retried next start)")
    finally:
        radio.close()


def cmd_send(a):
    from bridge.core import Bridge
    import mesh_codec as mc
    if not a.dest:
        sys.exit("Pass --dest (the receiver's node id, e.g. !f99260d4) or set RADIO_DESTINATION_ID")
    model = load_model(required=False)
    log = make_log("tx")
    radio = open_radio(a.port)
    b = Bridge(radio, model, log, ack_timeout=a.ack_timeout)
    force = {"raw": mc.RAW, "unishox": mc.UNISHOX, "llm": mc.LLM}.get(a.force_method)
    msg_id = int(a.msg_id, 16) if a.msg_id else None
    texts = a.text or []
    interactive = not texts
    try:
        while True:
            if interactive:
                try:
                    line = input("report> ")
                except EOFError:
                    break
                if not line.strip():
                    continue
                texts = [line]
            for t in texts:
                for _ in range(a.repeat):
                    b.send_report(t, a.dest, msg_id=msg_id, force_method=force, corrupt_first=a.corrupt_first)
            if not interactive:
                break
    except KeyboardInterrupt:
        pass
    finally:
        time.sleep(a.linger)   # keep listening briefly for late decode ACKs
        radio.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("identity", help="create the bridge's SpacetimeDB identity (once, on the receiver)")
    i.add_argument("--uri", default=os.environ.get("SPACETIMEDB_URI"), required=not os.environ.get("SPACETIMEDB_URI"))
    r = sub.add_parser("rx", help="receive, verify, decode-ACK and intake")
    r.add_argument("--port", default=os.environ.get("RADIO_SERIAL_PORT"))
    r.add_argument("--run-id", default=os.environ.get("BRIDGE_RUN_ID"), required=not os.environ.get("BRIDGE_RUN_ID"))
    r.add_argument("--intake", choices=["spacetimedb", "http", "none"], default="spacetimedb")
    r.add_argument("--uri", default=os.environ.get("SPACETIMEDB_URI"))
    r.add_argument("--database", default=os.environ.get("SPACETIMEDB_DATABASE"))
    r.add_argument("--intake-url", default=os.environ.get("INTAKE_URL"))
    r.add_argument("--ack-delay", type=float, default=0.0, help="test: delay decode ACKs by N seconds")
    s = sub.add_parser("send", help="send reports")
    s.add_argument("--port", default=os.environ.get("RADIO_SERIAL_PORT"))
    s.add_argument("--dest", default=os.environ.get("RADIO_DESTINATION_ID"))
    s.add_argument("--text", action="append", help="report text (repeatable); omit to type reports")
    s.add_argument("--msg-id", help="test: fixed message id (hex) to exercise duplicates/conflicts")
    s.add_argument("--repeat", type=int, default=1, help="test: send each report N times with the same id "
                                                         "(only meaningful with --msg-id)")
    s.add_argument("--force-method", choices=["raw", "unishox", "llm"])
    s.add_argument("--corrupt-first", action="store_true", help="test: corrupt attempt 1 to force the raw retry")
    s.add_argument("--ack-timeout", type=float, default=45.0)
    s.add_argument("--linger", type=float, default=5.0)
    a = ap.parse_args()
    {"identity": cmd_identity, "rx": cmd_rx, "send": cmd_send}[a.cmd](a)


if __name__ == "__main__":
    main()
