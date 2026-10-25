"""mesh_codec: compress short emergency reports into Meshtastic-sized packets.

Packet layout (big-endian):
  byte 0  : model id (high 4 bits) | method (low 4 bits: 0 raw, 1 unishox2, 2 language model)
  byte 1  : type (high 4 bits) | priority (2 bits) | has_location (1 bit) | has_people (1 bit)
  [1 byte : people count]                       if has_people
  [4 bytes: two uint16 offsets from area origin] if has_location
  body    : compressed text
  2 bytes : CRC-16/CCITT over header bytes + original UTF-8 text (computed before compression)

Determinism: every step after the model's logits is integer arithmetic. Logits are snapped
to a 1/16-nat grid and mapped through a weight table computed with exact decimal math, so two
machines that produce bit-identical logits produce bit-identical frequency tables.
"""
import struct
from decimal import Decimal, getcontext

import numpy as np

TYPES = ["status_ok", "trapped", "medical", "need", "hazard", "damage", "info"]
RAW, UNISHOX, LLM = 0, 1, 2
MAX_PAYLOAD = 233

# ---------------------------------------------------------------- CRC-16/CCITT-FALSE
def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return crc

# ---------------------------------------------------------------- integer probability tables
GRID = 16            # logits snapped to 1/16 nat
DMAX = 16 * 32       # weights below e^-32 of the top token are treated as 0 (still get freq 1)
WSCALE = 1 << 30
TOTAL = 1 << 24

def _weight_table():
    getcontext().prec = 50
    return np.array([int((Decimal(WSCALE) * (Decimal(-d) / Decimal(GRID)).exp()).to_integral_value(rounding="ROUND_FLOOR"))
                     for d in range(DMAX + 1)], dtype=np.int64)

WTABLE = _weight_table()

def freq_table(logits) -> np.ndarray:
    """float32 logits -> integer cumulative frequency table summing to TOTAL (deterministic)."""
    q = np.rint(np.asarray(logits, dtype=np.float32).astype(np.float64) * GRID).astype(np.int64)
    d = np.minimum(q.max() - q, DMAX)
    w = WTABLE[d]
    v = w.shape[0]
    s = int(w.sum())
    f = (w * (TOTAL - v)) // s + 1
    f[int(np.argmax(f))] += TOTAL - int(f.sum())
    cum = np.zeros(v + 1, dtype=np.int64)
    np.cumsum(f, out=cum[1:])
    return cum

# ---------------------------------------------------------------- arithmetic coder (32-bit, bit level)
PREC = 32
FULL, HALF, QUARTER = (1 << PREC) - 1, 1 << (PREC - 1), 1 << (PREC - 2)

class Encoder:
    def __init__(self):
        self.low, self.high, self.pending, self.bits = 0, FULL, 0, []
    def _emit(self, b):
        self.bits.append(b); self.bits.extend([1 - b] * self.pending); self.pending = 0
    def encode(self, cum, s):
        r = self.high - self.low + 1
        self.high = self.low + r * int(cum[s + 1]) // TOTAL - 1
        self.low = self.low + r * int(cum[s]) // TOTAL
        while True:
            if self.high < HALF:
                self._emit(0)
            elif self.low >= HALF:
                self._emit(1); self.low -= HALF; self.high -= HALF
            elif self.low >= QUARTER and self.high < 3 * QUARTER:
                self.pending += 1; self.low -= QUARTER; self.high -= QUARTER
            else:
                break
            self.low, self.high = 2 * self.low, 2 * self.high + 1
    def finish(self) -> bytes:
        self.pending += 1
        self._emit(0 if self.low < QUARTER else 1)
        bits = self.bits + [0] * (-len(self.bits) % 8)
        return bytes(int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8))

class Decoder:
    def __init__(self, data: bytes):
        self.bits = [int(b) for byte in data for b in f"{byte:08b}"]
        self.pos, self.low, self.high, self.value = 0, 0, FULL, 0
        for _ in range(PREC):
            self.value = 2 * self.value + self._next()
    def _next(self):
        b = self.bits[self.pos] if self.pos < len(self.bits) else 0
        self.pos += 1
        return b
    def decode(self, cum):
        r = self.high - self.low + 1
        target = ((self.value - self.low + 1) * TOTAL - 1) // r
        s = int(np.searchsorted(cum, target, side="right")) - 1
        self.high = self.low + r * int(cum[s + 1]) // TOTAL - 1
        self.low = self.low + r * int(cum[s]) // TOTAL
        while True:
            if self.high < HALF:
                pass
            elif self.low >= HALF:
                self.value -= HALF; self.low -= HALF; self.high -= HALF
            elif self.low >= QUARTER and self.high < 3 * QUARTER:
                self.value -= QUARTER; self.low -= QUARTER; self.high -= QUARTER
            else:
                break
            self.low, self.high = 2 * self.low, 2 * self.high + 1
            self.value = 2 * self.value + self._next()
        return s

# ---------------------------------------------------------------- language model wrapper
class SharedModel:
    """Evaluates the shared context once (fixed batch size), then one token at a time.
    Encoder and decoder use exactly the same calls, which keeps their logits identical."""
    def __init__(self, model_path, context_text, model_id, threads=2):
        from llama_cpp import Llama
        self.llm = Llama(model_path=model_path, n_ctx=1024, n_threads=threads, n_batch=256,
                         logits_all=True, verbose=False, seed=0)
        self.ctx_text, self.model_id = context_text, model_id
        self.pre = self.llm.tokenize(context_text.encode(), add_bos=True)
        self.llm.reset(); self.llm.eval(self.pre)
        self.state = self.llm.save_state()
        self.first = np.array(self.llm.scores[len(self.pre) - 1], dtype=np.float32, copy=True)

    def _start(self):
        self.llm.load_state(self.state)
        return self.first

    def _step(self, tok):
        self.llm.eval([tok])
        return np.array(self.llm.scores[self.llm.n_tokens - 1], dtype=np.float32, copy=True)

    def body_tokens(self, text):
        full = self.llm.tokenize((self.ctx_text + " " + text + "\n").encode(), add_bos=True)
        if full[:len(self.pre)] != self.pre:
            return None
        body = full[len(self.pre):]
        if self.llm.detokenize(body) != (" " + text + "\n").encode():
            return None
        return body

    def compress(self, text):
        body = self.body_tokens(text)
        if body is None:
            return None
        enc, lg = Encoder(), self._start()
        for t in body:
            enc.encode(freq_table(lg), t)
            lg = self._step(t)
        return enc.finish()

    def explain(self, text):
        """Per-token cost for visualization: [{'piece': str, 'bits': float}], same tables as compress().
        Predictable pieces cost a fraction of a bit; surprising ones (names, numbers) cost many bits."""
        import math
        body = self.body_tokens(" ".join(text.split()))
        if body is None:
            return None
        lg, out = self._start(), []
        for t in body:
            cum = freq_table(lg)
            p = (int(cum[t + 1]) - int(cum[t])) / TOTAL
            out.append({"piece": self.llm.detokenize([t]).decode("utf-8", "replace"), "bits": round(-math.log2(p), 2)})
            lg = self._step(t)
        return out

    def decompress(self, data, max_tokens=300):
        dec, lg, out = Decoder(data), self._start(), []
        for _ in range(max_tokens):
            t = dec.decode(freq_table(lg))
            out.append(t)
            if b"\n" in self.llm.detokenize(out):
                break
            lg = self._step(t)
        raw = self.llm.detokenize(out)
        if not (raw.startswith(b" ") and raw.endswith(b"\n")):
            return None
        try:
            return raw[1:-1].decode("utf-8")
        except UnicodeDecodeError:
            return None

# ---------------------------------------------------------------- packet build / parse
def _header(model_id, method, mtype, priority, people, location):
    h = bytes([(model_id & 0xF) << 4 | method,
               TYPES.index(mtype) << 4 | (priority & 3) << 2 | (location is not None) << 1 | (people is not None)])
    if people is not None:
        h += bytes([min(people, 255)])
    if location is not None:
        h += struct.pack(">HH", *location)
    return h

def build_packet(text, model=None, mtype="info", priority=0, people=None, location=None, force_method=None):
    """Return (packet_bytes, method). Picks the smallest of the available methods."""
    text = " ".join(text.split())  # one line; the codec uses newline as the terminator
    import unishox2
    bodies = {RAW: text.encode(), UNISHOX: unishox2.compress(text)[0]}
    if model is not None:
        c = model.compress(text)
        if c is not None:
            bodies[LLM] = c
    method = force_method if force_method is not None else min(bodies, key=lambda m: len(bodies[m]))
    mid = model.model_id if model is not None else 0
    head = _header(mid, method, mtype, priority, people, location)
    crc = crc16(head + text.encode())
    pkt = head + bodies[method] + struct.pack(">H", crc)
    if len(pkt) > MAX_PAYLOAD:
        raise ValueError(f"packet {len(pkt)} bytes exceeds {MAX_PAYLOAD}")
    return pkt, method

def parse_packet(pkt, model=None):
    """Return dict with fields and text, or {'ok': False, 'reason': ...}."""
    import unishox2
    mid, method = pkt[0] >> 4, pkt[0] & 0xF
    flags = pkt[1]
    mtype, priority = TYPES[flags >> 4], (flags >> 2) & 3
    i = 2
    people = location = None
    if flags & 1:
        people = pkt[i]; i += 1
    if flags & 2:
        location = struct.unpack(">HH", pkt[i:i + 4]); i += 4
    head, body, crc = pkt[:i], pkt[i:-2], struct.unpack(">H", pkt[-2:])[0]
    text = None
    if method == RAW:
        text = body.decode("utf-8", "replace")
    elif method == UNISHOX:
        text = unishox2.decompress(body, 4 * len(body) + 64)
    elif method == LLM:
        if model is None or model.model_id != mid:
            return {"ok": False, "reason": "model mismatch"}
        text = model.decompress(body)
    if text is None or crc16(head + text.encode()) != crc:
        return {"ok": False, "reason": "checksum failed", "method": method}
    return {"ok": True, "text": text, "method": method, "type": mtype, "priority": priority,
            "people": people, "location": location}
