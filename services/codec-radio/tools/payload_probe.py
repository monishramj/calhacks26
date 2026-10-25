"""Preflight: find the largest PRIVATE_APP (port 256) payload two boards actually deliver.

    python services/codec-radio/tools/payload_probe.py --ports COM4 COM5 [--sizes 64 128 200 216 220 233]

Sends random bytes A -> B as a direct message with want_ack, and as a broadcast, at each size.
A size passes only if B receives the identical bytes. Prints one line per attempt and a summary.
Measurement only: no codec, no application framing. Record the boards' distance and TX power with it,
because SX1276 receivers overload at very close range and long frames then fail CRC.
"""
import argparse
import os
import threading
import time

from pubsub import pub
import meshtastic.serial_interface
from meshtastic.protobuf import portnums_pb2

PRIVATE_APP = portnums_pb2.PortNum.PRIVATE_APP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ports", nargs=2, required=True)
    ap.add_argument("--sizes", nargs="+", type=int, default=[64, 128, 180, 200, 210, 214, 216, 218, 220, 224, 228, 233])
    ap.add_argument("--tries", type=int, default=2)
    ap.add_argument("--timeout", type=float, default=20)
    a = ap.parse_args()

    ia = meshtastic.serial_interface.SerialInterface(devPath=a.ports[0])
    ib = meshtastic.serial_interface.SerialInterface(devPath=a.ports[1])
    num_b = ib.getMyNodeInfo()["num"]
    got, cv = [], threading.Condition()

    def on_rx(packet, interface):
        d = packet.get("decoded") or {}
        if interface is ib and d.get("portnum") in ("PRIVATE_APP", PRIVATE_APP):
            with cv:
                got.append(bytes(d.get("payload", b"")))
                cv.notify_all()
    pub.subscribe(on_rx, "meshtastic.receive")

    def wait_for(blob):
        with cv:
            return cv.wait_for(lambda: blob in got, timeout=a.timeout)

    lora = ia.localNode.localConfig.lora
    meta = getattr(ia, "metadata", None)
    print(f"A={a.ports[0]} B={a.ports[1]} fw={getattr(meta, 'firmware_version', '?')} "
          f"preset={lora.modem_preset} tx_power={lora.tx_power}")
    results = {}
    for mode in ("direct", "broadcast"):
        for size in a.sizes:
            ok = 0
            for t in range(a.tries):
                blob = os.urandom(size)
                t0 = time.time()
                err = None
                try:
                    if mode == "direct":
                        ia.sendData(blob, destinationId=num_b, portNum=PRIVATE_APP, wantAck=True)
                    else:
                        ia.sendData(blob, portNum=PRIVATE_APP)
                    hit = wait_for(blob)
                except Exception as e:      # the library rejects payloads it knows are too large
                    hit, err = False, repr(e)
                ok += bool(hit)
                print(f"{mode:9s} {size:4d} B  try {t + 1}: {'received identical' if hit else 'NOT received'}"
                      f"{f' in {time.time() - t0:.1f}s' if hit else ''}{f'  ({err})' if err else ''}", flush=True)
                time.sleep(3)
            results[(mode, size)] = ok
    print("\nsummary (received/tries):")
    for mode in ("direct", "broadcast"):
        passed = [s for s in a.sizes if results[(mode, s)] == a.tries]
        print(f"  {mode:9s} " + "  ".join(f"{s}:{results[(mode, s)]}/{a.tries}" for s in a.sizes)
              + f"   -> largest always delivered: {max(passed) if passed else 'none'} B")
    ia.close()
    ib.close()


if __name__ == "__main__":
    main()
