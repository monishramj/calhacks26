"""Proof-of-concept driver: encode and decode in SEPARATE processes, packets passed as hex.

encode <model.gguf> <model_id> <context.txt> <sample.jsonl> <packets.jsonl> <a:b>
    appends one line per message: id, text, chosen packet (smallest method), forced LLM packet
decode <model.gguf> <model_id> <context.txt> <packets.jsonl> <results.jsonl> <a:b>
    decodes both packets of each line and appends pass/fail
"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesh_codec as mc

mode, model_path, mid, ctxf, inp, outp, rng = sys.argv[1:8]
a, b = map(int, rng.split(":"))
ctx = open(ctxf, encoding="utf-8").read()
t0 = time.time()
model = mc.SharedModel(model_path, ctx, int(mid))
load_s = time.time() - t0
done = set()
if Path(outp).exists():
    done = {json.loads(l)["id"] for l in open(outp, encoding="utf-8")}
rows = [json.loads(l) for l in open(inp, encoding="utf-8")][a:b]
out = open(outp, "a", encoding="utf-8")
n = 0
for i, r in enumerate(rows, start=a):
    if r["id"] in done:
        continue
    t = time.time()
    if mode == "encode":
        text = " ".join(r["text"].split())
        # exercise the structured header on some messages
        people = (i % 7) + 1 if i % 3 == 0 else None
        loc = ((i * 2654435761) & 0xFFFF, (i * 40503) & 0xFFFF) if i % 2 == 0 else None
        mtype = mc.TYPES[i % len(mc.TYPES)]
        chosen, method = mc.build_packet(text, model, mtype, i % 4, people, loc)
        enc_s = time.time() - t
        try:
            forced, _ = mc.build_packet(text, model, mtype, i % 4, people, loc, force_method=mc.LLM)
            forced = forced.hex()
        except (KeyError, ValueError):
            forced = None
        rec = {"id": r["id"], "text": text, "utf8_bytes": len(text.encode()), "method": method,
               "packet": chosen.hex(), "llm_packet": forced, "enc_s": round(enc_s, 3)}
    else:
        res = mc.parse_packet(bytes.fromhex(r["packet"]), model)
        ok_chosen = res.get("ok") and res["text"] == r["text"]
        ok_llm = None
        if r["llm_packet"]:
            res2 = mc.parse_packet(bytes.fromhex(r["llm_packet"]), model)
            ok_llm = bool(res2.get("ok") and res2["text"] == r["text"])
        rec = {"id": r["id"], "ok_chosen": bool(ok_chosen), "ok_llm": ok_llm, "dec_s": round(time.time() - t, 3)}
        if not ok_chosen or ok_llm is False:
            rec["got"] = (res.get("text"), res.get("reason"))
    out.write(json.dumps(rec) + "\n"); out.flush(); n += 1
print(f"{mode}: {n} new rows in {time.time()-t0:.1f}s (model load {load_s:.1f}s)")
