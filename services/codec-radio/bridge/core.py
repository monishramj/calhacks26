"""The radio bridge: send reports with a stable ID and one bounded raw retry; receive, verify, ACK, intake once.

Sender (send_report):
  1. build_packet picks the smallest exact method (LLM, Unishox2 or raw). Invalid or oversized text fails visibly
     before anything is sent: no truncation, no fragmentation.
  2. Attempt 1 goes out as a direct message with want_ack. The sender then waits for the receiver's DECODE_ACK.
  3. If a DECODE_ACK says DECODE_FAILED, or none arrives within ack_timeout, the sender makes exactly one more
     attempt, as raw text with the same message ID. A raw packet that would be oversized fails visibly instead.
  4. The outcome keeps three things apart: the radio ACK (Meshtastic routing), the decode ACK (verified on the
     receiver) and human reading (only the incident desk knows that). A DECODE_ACK that arrives after the sender
     gave up is logged as a late success.

Receiver (_on_frame):
  * Frames not addressed to this node, from this node, or malformed are logged and dropped, never crash.
  * Each REPORT is decoded with mesh_codec.parse_packet. Failure -> DECODE_ACK DECODE_FAILED.
  * Success -> classify (sender node, message id, text) against the persistent DeliveryStore:
    new -> persist, queue for intake, ACK VERIFIED; duplicate -> ACK VERIFIED again, no second intake;
    conflict (same id, other text) -> persisted and forwarded so the backend shows the conflict, ACK CONFLICT.
  * DECODE_ACKs are sent without want_ack and are never answered, so ACKs cannot loop. At most one DECODE_ACK goes
    out per (sender, message id, attempt, status) per `ack_repeat_s` window.
Relays need nothing: stock Meshtastic firmware forwards the frames without any model.
"""
from __future__ import annotations

import queue
import secrets
import threading
import time
from dataclasses import dataclass, field

import mesh_codec as mc

from . import envelope as env
from .intake import DeliveryStore, IntakeWorker, report_input

MAX_DM_PAYLOAD = 216   # largest direct message measured on T3 V1.6.1 / fw 2.7.26 (C1 preflight); configurable


@dataclass
class Attempt:
    number: int
    method: int
    frame_bytes: int
    codec_bytes: int
    radio_ack: bool | None = None       # None = no routing answer yet
    radio_detail: str | None = None
    decode_status: str | None = None    # VERIFIED / DECODE_FAILED / CONFLICT, None = no decode ACK
    rtt_s: float | None = None


@dataclass
class SendOutcome:
    msg_id: int
    text_bytes: int
    state: str                         # VERIFIED, CONFLICT, RADIO_ACK_ONLY, DECODE_FAILED, NOT_DELIVERED, REJECTED
    reason: str | None = None
    attempts: list[Attempt] = field(default_factory=list)
    ack_bytes_received: int = 0

    @property
    def total_air_bytes(self) -> int:
        """Every byte this report cost on air: all report frames plus the decode ACKs received."""
        return sum(a.frame_bytes for a in self.attempts) + self.ack_bytes_received


class Bridge:
    def __init__(self, radio, model, log, store: DeliveryStore | None = None, intake: IntakeWorker | None = None,
                 run_id: str | None = None, max_payload: int = MAX_DM_PAYLOAD, ack_timeout: float = 45.0,
                 ack_delay: float = 0.0, ack_repeat_s: float = 5.0):
        self.radio, self.model, self.log = radio, model, log
        self.store, self.intake, self.run_id = store, intake, run_id
        self.max_payload, self.ack_timeout = max_payload, ack_timeout
        self.ack_delay, self.ack_repeat_s = ack_delay, ack_repeat_s
        self._waiting: dict[int, tuple[threading.Event, dict]] = {}
        self._finished: dict[int, SendOutcome] = {}
        self._acks_sent: dict[tuple, float] = {}
        self._lock = threading.Lock()
        # llama.cpp contexts are not thread-safe: one lock per model serializes encode (sender) and decode (receiver)
        self._mlock = model.__dict__.setdefault("_bridge_lock", threading.Lock()) if model is not None else threading.Lock()
        self._rx: queue.Queue = queue.Queue()
        self._worker = threading.Thread(target=self._rx_loop, daemon=True, name="bridge-rx")
        self._worker.start()
        radio.on_frame(lambda frame, meta: self._rx.put((frame, meta)))

    # ------------------------------------------------------------------ sender
    def send_report(self, text: str, dest: str, msg_id: int | None = None, force_method: int | None = None,
                    corrupt_first: bool = False, mtype: str = "info", priority: int = 0) -> SendOutcome:
        msg_id = secrets.randbits(32) if msg_id is None else msg_id
        sent_at = int(time.time())
        text_bytes = len(text.encode("utf-8")) if isinstance(text, str) else 0
        out = SendOutcome(msg_id, text_bytes, "REJECTED")
        try:
            with self._mlock:
                pkt, method = mc.build_packet(text, self.model, mtype=mtype, priority=priority,
                                              force_method=force_method)
        except ValueError as e:
            out.reason = f"not sent: {e}"
            self._log_outcome(out, text)
            return out
        frame = env.encode_report(msg_id, 1, sent_at, pkt)
        if len(frame) > self.max_payload:
            out.reason = f"not sent: {len(frame)} B frame exceeds the {self.max_payload} B radio limit"
            self._log_outcome(out, text)
            return out
        if corrupt_first:   # test hook: flip one body bit so the receiver's checksum fails
            b = bytearray(frame)
            b[env.REPORT_HEADER + 2] ^= 0x01
            frame = bytes(b)

        status = self._attempt(out, 1, method, frame, len(pkt), dest)
        if status in ("VERIFIED", "CONFLICT"):
            out.state = status
            self._log_outcome(out, text)
            return out

        # exactly one bounded raw retry, same message id
        try:
            raw_pkt, raw_method = mc.build_packet(text, None, mtype=mtype, priority=priority, force_method=mc.RAW)
            raw_frame = env.encode_report(msg_id, 2, sent_at, raw_pkt)
            if len(raw_frame) > self.max_payload:
                raise ValueError(f"{len(raw_frame)} B raw frame exceeds the {self.max_payload} B radio limit")
        except ValueError as e:
            out.state = self._failure_state(out)
            out.reason = f"raw fallback impossible: {e}"
            self._log_outcome(out, text)
            return out
        status = self._attempt(out, 2, raw_method, raw_frame, len(raw_pkt), dest)
        out.state = status if status in ("VERIFIED", "CONFLICT") else self._failure_state(out)
        if out.state not in ("VERIFIED", "CONFLICT"):
            out.reason = "no verified decode after the raw retry"
        self._log_outcome(out, text)
        return out

    @staticmethod
    def _failure_state(out: SendOutcome) -> str:
        if any(a.decode_status == "DECODE_FAILED" for a in out.attempts):
            return "DECODE_FAILED"
        if any(a.radio_ack for a in out.attempts):
            return "RADIO_ACK_ONLY"
        return "NOT_DELIVERED"

    def _attempt(self, out: SendOutcome, number: int, method: int, frame: bytes, codec_bytes: int, dest: str) -> str | None:
        att = Attempt(number, method, len(frame), codec_bytes)
        out.attempts.append(att)
        ev, box = threading.Event(), {}
        with self._lock:
            self._waiting[out.msg_id] = (ev, box)

        def on_radio_ack(ok, detail):
            att.radio_ack, att.radio_detail = ok, detail
            self.log({"event": "radio_ack", "msg_id": f"{out.msg_id:08x}", "attempt": number, "ok": ok,
                      "detail": detail})

        t0 = time.time()
        self.log({"event": "send", "msg_id": f"{out.msg_id:08x}", "attempt": number, "method": method,
                  "frame_bytes": len(frame), "codec_bytes": codec_bytes, "dest": dest})
        self.radio.send(frame, dest, want_ack=True, on_radio_ack=on_radio_ack)
        deadline = t0 + self.ack_timeout
        while True:
            if not ev.wait(max(0.0, deadline - time.time())):
                break
            ev.clear()
            ack = box.get("ack")
            if ack is None:
                continue
            out.ack_bytes_received += env.ACK_SIZE
            if ack.attempt == number:
                att.decode_status = env.STATUS_NAMES[ack.status]
                att.rtt_s = round(time.time() - t0, 2)
                break
            if ack.status == env.VERIFIED and 1 <= ack.attempt <= len(out.attempts):
                out.attempts[ack.attempt - 1].decode_status = "VERIFIED"   # an earlier attempt landed late
                self.log({"event": "late_success", "msg_id": f"{out.msg_id:08x}", "attempt": ack.attempt})
                with self._lock:
                    self._waiting.pop(out.msg_id, None)
                return "VERIFIED"
        with self._lock:
            self._waiting.pop(out.msg_id, None)
        return att.decode_status

    def _log_outcome(self, out: SendOutcome, text: str):
        with self._lock:
            self._finished[out.msg_id] = out
        self.log({"event": "outcome", "msg_id": f"{out.msg_id:08x}", "state": out.state, "reason": out.reason,
                  "text_bytes": out.text_bytes, "total_air_bytes": out.total_air_bytes,
                  "attempts": [a.__dict__ for a in out.attempts], "text": text,
                  "human_read": "unknown to the bridge (incident desk only)"})

    # ------------------------------------------------------------------ receiver
    def _rx_loop(self):
        while True:
            frame, meta = self._rx.get()
            try:
                self._on_frame(frame, meta)
            except Exception as e:   # radio input must never stop the receiver
                self.log({"event": "rx_error", "error": repr(e), "from": meta.get("from")})

    def _on_frame(self, frame: bytes, meta: dict):
        src = meta.get("from")
        if src == self.radio.node_id or meta.get("to") != self.radio.node_id:
            self.log({"event": "ignored", "reason": "not a direct message to this node", "from": src,
                      "to": meta.get("to"), "bytes": len(frame)})
            return
        try:
            f = env.decode(frame)
        except env.EnvelopeError as e:
            self.log({"event": "rejected", "reason": f"envelope: {e}", "from": src, "bytes": len(frame),
                      "frame": frame.hex()})
            return
        if isinstance(f, env.DecodeAck):
            self._on_decode_ack(f, src)
            return
        with self._mlock:
            res = mc.parse_packet(f.packet, self.model)
        base = {"from": src, "msg_id": f"{f.msg_id:08x}", "attempt": f.attempt, "frame_bytes": len(frame),
                "snr": meta.get("snr"), "rssi": meta.get("rssi")}
        if not res.get("ok"):
            self.log({"event": "decode_failed", **base, "reason": res.get("reason"), "frame": frame.hex()})
            self._ack(src, f, env.DECODE_FAILED)
            return
        text = res["text"]
        kind = self.store.classify(src, f.msg_id, text) if self.store else "new"
        self.log({"event": "decoded", **base, "kind": kind, "method": res.get("method"), "text": text})
        if kind == "duplicate":
            self._ack(src, f, env.VERIFIED)
            return
        if self.store is not None and self.run_id:
            report = report_input(self.run_id, src, f.msg_id, text, res["method"], f.sent_at, len(frame))
            if self.store.accept(src, f.msg_id, text, report) and self.intake:
                self.intake.kick()
        self._ack(src, f, env.CONFLICT if kind == "conflict" else env.VERIFIED)

    def _ack(self, dest: str, f: env.Report, status: int):
        key = (dest, f.msg_id, f.attempt, status)
        now = time.time()
        with self._lock:
            if now - self._acks_sent.get(key, -1e9) < self.ack_repeat_s:
                return
            self._acks_sent[key] = now
        if self.ack_delay:
            time.sleep(self.ack_delay)   # test hook: deliberately late decode ACK
        frame = env.encode_ack(f.msg_id, f.attempt, status)
        self.radio.send(frame, dest, want_ack=False)
        self.log({"event": "decode_ack_sent", "to": dest, "msg_id": f"{f.msg_id:08x}", "attempt": f.attempt,
                  "status": env.STATUS_NAMES[status], "bytes": len(frame)})

    def _on_decode_ack(self, ack: env.DecodeAck, src: str):
        with self._lock:
            waiting = self._waiting.get(ack.msg_id)
            finished = self._finished.get(ack.msg_id)
        self.log({"event": "decode_ack", "from": src, "msg_id": f"{ack.msg_id:08x}", "attempt": ack.attempt,
                  "status": env.STATUS_NAMES[ack.status],
                  "late": waiting is None and finished is not None, "unknown": waiting is None and finished is None})
        if waiting:
            ev, box = waiting
            box["ack"] = ack
            ev.set()
        elif finished is not None and ack.status == env.VERIFIED and finished.state != "VERIFIED":
            finished.state = "VERIFIED_LATE"
            self.log({"event": "late_success", "msg_id": f"{ack.msg_id:08x}", "attempt": ack.attempt})
