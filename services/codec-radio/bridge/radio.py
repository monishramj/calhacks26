"""Radio adapters. MeshtasticRadio drives a USB board; FakeAir connects in-process endpoints for tests.

Both give the same small interface:
    radio.node_id                      -> "!06fca5ec"
    radio.on_frame(cb)                 cb(frame: bytes, meta: dict) with meta keys from, to, packet_id, snr, rssi
    radio.send(frame, dest, want_ack, on_radio_ack=None) -> packet id
        on_radio_ack(ok: bool, detail: str) fires when the Meshtastic routing ACK/NAK arrives (want_ack only).
"""
from __future__ import annotations

import threading
from typing import Callable, Optional

PRIVATE_APP = 256


def node_hex(num: int) -> str:
    return f"!{num & 0xFFFFFFFF:08x}"


def parse_node(node: str | int) -> int:
    if isinstance(node, int):
        return node
    s = node.strip()
    return int(s[1:], 16) if s.startswith("!") else int(s, 0)


class MeshtasticRadio:
    def __init__(self, port: str):
        import meshtastic.serial_interface
        from pubsub import pub
        self.port = port
        self.iface = meshtastic.serial_interface.SerialInterface(devPath=port)
        info = self.iface.getMyNodeInfo() or {}
        self.num: int = info.get("num") or self.iface.myInfo.my_node_num
        self.node_id = node_hex(self.num)
        self.name = (info.get("user") or {}).get("longName") or port
        self._cb: Optional[Callable] = None
        pub.subscribe(self._on_receive, "meshtastic.receive")

    def describe(self) -> str:
        node = self.iface.localNode
        lora = node.localConfig.lora
        ch = node.channels[0].settings.name if node.channels else "?"
        meta = getattr(self.iface, "metadata", None)
        fw = getattr(meta, "firmware_version", "?") if meta else "?"
        return (f"{self.name} {self.node_id} on {self.port} | fw {fw} | channel {ch or '(default)'} "
                f"| preset {lora.modem_preset} | region {lora.region}")

    def on_frame(self, cb: Callable[[bytes, dict], None]):
        self._cb = cb

    def _on_receive(self, packet, interface):
        if interface is not self.iface or self._cb is None:
            return
        dec = packet.get("decoded") or {}
        if dec.get("portnum") not in ("PRIVATE_APP", PRIVATE_APP) or "payload" not in dec:
            return
        meta = {"from": node_hex(packet.get("from", 0)), "to": node_hex(packet.get("to", 0)),
                "packet_id": packet.get("id"), "snr": packet.get("rxSnr"), "rssi": packet.get("rxRssi")}
        try:
            self._cb(bytes(dec["payload"]), meta)
        except Exception as e:  # an app bug must never kill the meshtastic reader thread
            print(f"[bridge] frame handler error: {e!r}")

    def send(self, frame: bytes, dest: str | int, want_ack: bool, on_radio_ack=None) -> int:
        def on_ack_nak(p):  # meshtastic only delivers plain ACKs to handlers named onAckNak
            err = (p.get("decoded") or {}).get("routing", {}).get("errorReason", "NONE")
            if on_radio_ack:
                on_radio_ack(err == "NONE", err)
        on_ack_nak.__name__ = "onAckNak"
        mp = self.iface.sendData(bytes(frame), destinationId=parse_node(dest), portNum=PRIVATE_APP,
                                 wantAck=want_ack, onResponse=on_ack_nak if (want_ack and on_radio_ack) else None,
                                 onResponseAckPermitted=True)
        return mp.id

    def close(self):
        try:
            self.iface.close()
        except Exception:
            pass


class FakeAir:
    """In-process 'air' for tests. tamper(frame, src, dst) may return modified bytes or None to drop a frame."""

    def __init__(self):
        self.radios: dict[str, "FakeRadio"] = {}
        self.tamper: Optional[Callable[[bytes, str, str], Optional[bytes]]] = None
        self.log: list[tuple[str, str, bytes]] = []
        self._ids = 0
        self.lock = threading.Lock()

    def radio(self, node_id: str) -> "FakeRadio":
        r = FakeRadio(self, node_id)
        self.radios[node_id] = r
        return r

    def deliver(self, frame: bytes, src: str, dst: str, want_ack: bool, on_radio_ack) -> int:
        with self.lock:
            self._ids += 1
            pid = self._ids
        self.log.append((src, dst, bytes(frame)))
        out = self.tamper(frame, src, dst) if self.tamper else frame
        target = self.radios.get(dst)
        if out is None or target is None:
            if want_ack and on_radio_ack:
                on_radio_ack(False, "MAX_RETRANSMIT")
            return pid
        if want_ack and on_radio_ack:
            on_radio_ack(True, "NONE")
        if target._cb:
            target._cb(bytes(out), {"from": src, "to": dst, "packet_id": pid, "snr": 0.0, "rssi": -40})
        return pid


class FakeRadio:
    def __init__(self, air: FakeAir, node_id: str):
        self.air, self.node_id, self.name = air, node_id, node_id
        self._cb = None

    def describe(self) -> str:
        return f"fake radio {self.node_id}"

    def on_frame(self, cb):
        self._cb = cb

    def send(self, frame, dest, want_ack, on_radio_ack=None) -> int:
        dest = dest if isinstance(dest, str) else node_hex(dest)
        return self.air.deliver(frame, self.node_id, dest, want_ack, on_radio_ack)

    def close(self):
        pass
