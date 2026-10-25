"""Encode one message with the shared model, show the on-air bytes and per-word cost, decode it back."""
import math, sys, zlib
import numpy as np
from llama_cpp import Llama
MODEL, CTXF, TEXT = sys.argv[1], sys.argv[2], sys.argv[3]
TOTAL = 1 << 24; PREC = 32
FULL, HALF, QUARTER = (1 << PREC) - 1, 1 << (PREC - 1), 1 << (PREC - 2)
def quantize(lg):
    x = np.asarray(lg, dtype=np.float64); x = x - x.max(); p = np.exp(x); p /= p.sum(); v = p.shape[0]
    f = np.floor(p * (TOTAL - v)).astype(np.int64) + 1; f[int(np.argmax(f))] += TOTAL - int(f.sum())
    c = np.zeros(v + 1, dtype=np.int64); np.cumsum(f, out=c[1:]); return c
class Enc:
    def __init__(s): s.lo, s.hi, s.pend, s.bits = 0, FULL, 0, []
    def _e(s, b): s.bits.append(b); s.bits.extend([1 - b] * s.pend); s.pend = 0
    def enc(s, c, t):
        r = s.hi - s.lo + 1; s.hi = s.lo + r * int(c[t + 1]) // TOTAL - 1; s.lo = s.lo + r * int(c[t]) // TOTAL
        while True:
            if s.hi < HALF: s._e(0)
            elif s.lo >= HALF: s._e(1); s.lo -= HALF; s.hi -= HALF
            elif s.lo >= QUARTER and s.hi < 3 * QUARTER: s.pend += 1; s.lo -= QUARTER; s.hi -= QUARTER
            else: break
            s.lo, s.hi = 2 * s.lo, 2 * s.hi + 1
    def done(s): s.pend += 1; s._e(0 if s.lo < QUARTER else 1); return s.bits
class Dec:
    def __init__(s, bits):
        s.b, s.i, s.lo, s.hi, s.v = bits, 0, 0, FULL, 0
        for _ in range(PREC): s.v = 2 * s.v + s.n()
    def n(s): b = s.b[s.i] if s.i < len(s.b) else 0; s.i += 1; return b
    def dec(s, c):
        r = s.hi - s.lo + 1; tgt = ((s.v - s.lo + 1) * TOTAL - 1) // r
        t = int(np.searchsorted(c, tgt, side="right")) - 1
        s.hi = s.lo + r * int(c[t + 1]) // TOTAL - 1; s.lo = s.lo + r * int(c[t]) // TOTAL
        while True:
            if s.hi < HALF: pass
            elif s.lo >= HALF: s.v -= HALF; s.lo -= HALF; s.hi -= HALF
            elif s.lo >= QUARTER and s.hi < 3 * QUARTER: s.v -= QUARTER; s.lo -= QUARTER; s.hi -= QUARTER
            else: break
            s.lo, s.hi = 2 * s.lo, 2 * s.hi + 1; s.v = 2 * s.v + s.n()
        return t
ctx = open(CTXF, encoding="utf-8").read()
llm = Llama(model_path=MODEL, n_ctx=1024, n_threads=2, logits_all=True, verbose=False, seed=0)
pre = llm.tokenize(ctx.encode(), add_bos=True); full = llm.tokenize((ctx + " " + TEXT + "\n").encode(), add_bos=True)
assert full[:len(pre)] == pre
body = full[len(pre):]; NL = body[-1]
def start():
    llm.reset(); llm.eval(pre); return np.array(llm.scores[len(pre) - 1], copy=True)
# encode (token by token, exactly as the decoder will run)
lg, e, costs = start(), Enc(), []
for t in body:
    c = quantize(lg); p = (int(c[t + 1]) - int(c[t])) / TOTAL; costs.append((t, -math.log2(p)))
    e.enc(c, t); llm.eval([t]); lg = np.array(llm.scores[llm.n_tokens - 1], copy=True)
bits = e.done(); nbytes = math.ceil(len(bits) / 8)
payload = int("".join(map(str, bits + [0] * (nbytes * 8 - len(bits)))), 2).to_bytes(nbytes, "big")
crc = zlib.crc32(TEXT.encode()) & 0xFFFF
# decode
lg, d, out = start(), Dec(bits), []
while True:
    t = d.dec(quantize(lg)); out.append(t)
    if t == NL or len(out) > 200: break
    llm.eval([t]); lg = np.array(llm.scores[llm.n_tokens - 1], copy=True)
decoded = llm.detokenize(out).decode("utf-8").strip()
raw = TEXT.encode()
print("ORIGINAL :", TEXT)
print(f"raw size : {len(raw)} bytes")
print(f"on air   : {nbytes} bytes compressed text + 1 byte version + 2 byte CRC = {nbytes + 3} bytes")
print("hex      :", "01 " + payload.hex(" ") + f" {crc >> 8:02x} {crc & 0xff:02x}")
print(f"ratio    : {len(raw) / nbytes:.1f}x smaller (text only), {len(raw) / (nbytes + 3):.1f}x with header")
print("DECODED  :", decoded)
print("exact match:", decoded == TEXT, "| CRC ok:", (zlib.crc32(decoded.encode()) & 0xFFFF) == crc)
print("\nper-piece cost (bits) - low = model predicted it, high = surprise that had to be sent:")
print("  " + "  ".join(f"[{llm.detokenize([t]).decode('utf-8','replace')}]{b:.1f}" for t, b in costs))
