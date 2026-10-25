"""Two-radio link test with the fixed codec: C1 sends, C4 receives and decodes. A test tool, not the G2 bridge
(no intake, no retry, no message-ID framing yet).

Receiver (C4, radio "MeshSOS A"):
    python services/codec-radio/tools/radio_test.py rx [--port COM5]
Sender (C1, radio "MeshSOS B" on COM4):
    python services/codec-radio/tools/radio_test.py tx --port COM4 --dest !f99260d4 [--text "..."]

Packets go as Meshtastic direct messages on PRIVATE_APP (256) with want_ack. With no --text, tx sends the 8 probe
texts from tools/endpoint_ref.json. rx decodes every PRIVATE_APP packet with mesh_codec.parse_packet and, for probe
texts, checks the result is byte-for-byte the text that was sent. Both sides append JSON lines to
services/codec-radio/logs/radio-<rx|tx>-<host>-<time>.jsonl. CODEC_MODEL_PATH must point at the model on both
machines (LLM packets need it; raw/Unishox2 packets don't).
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

TOOLS = Path(__file__).resolve().parent
SERVICE = TOOLS.parent
sys.path.insert(0, str(SERVICE / "codec"))
import runtime  # noqa: E402  (before llama_cpp)

PRIVATE_APP = 256
MAX_DM_PAYLOAD = 216   # measured on T3 V1.6.1 / fw 2.7.26 (C1 preflight); bigger direct messages were dropped
PROBES = {p["text"] for p in json.loads((TOOLS / "endpoint_ref.json").read_text(encoding="utf-8"))["probes"]}


def log_file(role: str):
    d = SERVICE / "logs"
    d.mkdir(exist_ok=True)
    path = d / f"radio-{role}-{socket.gethostname()}-{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    print(f"log: {path}")
    f = open(path, "a", encoding="utf-8")

    def write(rec: dict):
        rec["t"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        f.flush()
    return write


def pick_port(port: str | None) -> str:
    if port:
        return port
    from serial.tools import list_ports
    found = [p for p in list_ports.comports() if p.vid in (0x1A86, 0x10C4, 0x303A, 0x0403)]
    if len(found) != 1:
        listing = "\n".join(f"  {p.device}  {p.description}" for p in list_ports.comports()) or "  (none)"
        sys.exit(f"Pass --port. Serial ports seen:\n{listing}")
    return found[0].device


def open_radio(port: str):
    import meshtastic.serial_interface
    iface = meshtastic.serial_interface.SerialInterface(devPath=port)
    info = iface.getMyNodeInfo() or {}
    num = info.get("num") or iface.myInfo.my_node_num
    name = (info.get("user") or {}).get("longName") or port
    lora = iface.localNode.localConfig.lora
    ch = iface.localNode.channels[0].settings.name if iface.localNode.channels else "?"
    print(f"radio {name} !{num:08x} on {port} | channel {ch or '(default)'} | preset {lora.modem_preset} "
          f"| region {lora.region}")
    return iface, num, name


def load_model():
    if not os.environ.get("CODEC_MODEL_PATH"):
        print("CODEC_MODEL_PATH not set: LLM packets will be reported as undecodable (unavailable), not passed")
        return None
    m = runtime.load()
    fp = runtime.fingerprint(m)
    print(f"codec fingerprint {fp} ({'OK' if fp == runtime.REFERENCE_FINGERPRINT else 'MISMATCH'})")
    return m


def cmd_rx(args):
    model = load_model()
    import mesh_codec as mc
    from pubsub import pub
    write = log_file("rx")
    iface, me, _ = open_radio(pick_port(args.port))
    seen = {"n": 0, "ok": 0}

    def on_receive(packet, interface):
        dec = packet.get("decoded") or {}
        if dec.get("portnum") not in ("PRIVATE_APP", PRIVATE_APP) or "payload" not in dec:
            return
        payload = bytes(dec["payload"])
        res = mc.parse_packet(payload, model)
        seen["n"] += 1
        ok = bool(res.get("ok"))
        seen["ok"] += ok
        exact = res.get("text") in PROBES if ok else None
        rec = {"from": f"!{packet.get('from', 0):08x}", "packet_id": packet.get("id"), "bytes": len(payload),
               "packet": payload.hex(), "ok": ok, "reason": res.get("reason"), "method": res.get("method"),
               "text": res.get("text"), "matches_probe": exact, "snr": packet.get("rxSnr"),
               "rssi": packet.get("rxRssi")}
        write(rec)
        status = "DECODED" if ok else f"REJECTED ({res.get('reason')})"
        tag = " [exact probe text]" if exact else ""
        print(f"#{seen['n']} {status} {len(payload)} B from {rec['from']} snr={rec['snr']} rssi={rec['rssi']}{tag}")
        if ok:
            print(f"    {res.get('text')!r}")

    pub.subscribe(on_receive, "meshtastic.receive")
    print(f"listening on !{me:08x} for PRIVATE_APP packets. Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print(f"received {seen['n']}, decoded {seen['ok']}")
        iface.close()


def cmd_tx(args):
    model = load_model()
    import mesh_codec as mc
    write = log_file("tx")
    iface, me, _ = open_radio(pick_port(args.port))
    dest = int(args.dest.lstrip("!"), 16) if args.dest.startswith("!") else int(args.dest)
    texts = args.text or [p["text"] for p in json.loads((TOOLS / "endpoint_ref.json").read_text(encoding="utf-8"))["probes"]]
    acked = 0
    for i, text in enumerate(texts, 1):
        pkt, method = mc.build_packet(text, model)
        if len(pkt) > MAX_DM_PAYLOAD:
            print(f"[{i}] NOT SENT: {len(pkt)} B exceeds {MAX_DM_PAYLOAD} B")
            write({"text": text, "bytes": len(pkt), "sent": False, "reason": "oversized"})
            continue
        done, result = threading.Event(), {}

        def on_ack_nak(p):   # meshtastic only calls handlers named onAckNak for plain ACKs
            err = (p.get("decoded") or {}).get("routing", {}).get("errorReason", "NONE")
            result.update(ack=err == "NONE", err=err, from_=f"!{p.get('from', 0):08x}")
            done.set()
        on_ack_nak.__name__ = "onAckNak"

        t0 = time.time()
        mp = iface.sendData(pkt, destinationId=dest, portNum=PRIVATE_APP, wantAck=True,
                            onResponse=on_ack_nak, onResponseAckPermitted=True)
        done.wait(args.timeout)
        rtt = round(time.time() - t0, 1)
        ack = result.get("ack", False)
        acked += ack
        state = (f"RADIO ACK from {result['from_']} in {rtt}s" if ack else
                 f"NAK {result['err']}" if result else f"NO ACK within {args.timeout}s")
        print(f"[{i}] {len(pkt)} B method {method}: {state}  {text!r}")
        write({"text": text, "method": method, "bytes": len(pkt), "packet": pkt.hex(), "packet_id": mp.id,
               "radio_ack": ack, "ack_detail": result.get("err"), "ack_from": result.get("from_"), "rtt_s": rtt})
        time.sleep(args.gap)
    print(f"sent {len(texts)}, radio-acked {acked}. Radio ACK is not decode proof: check the receiver's output.")
    iface.close()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("rx")
    r.add_argument("--port")
    t = sub.add_parser("tx")
    t.add_argument("--port")
    t.add_argument("--dest", required=True, help="receiver node id, e.g. !f99260d4")
    t.add_argument("--text", action="append", help="text to send (repeatable); default: the 8 probe texts")
    t.add_argument("--timeout", type=float, default=60.0)
    t.add_argument("--gap", type=float, default=5.0, help="seconds between packets")
    args = ap.parse_args()
    cmd_rx(args) if args.cmd == "rx" else cmd_tx(args)


if __name__ == "__main__":
    main()
