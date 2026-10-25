"""npm run evaluate: versioned report (evaluation/report-<date>.md + .json).

Laya: held-out cases (fixtures/private/heldout/cases.json) sent to a real worker at EVAL_LAYA_URL (default
LOCAL_LAYA_URL or http://127.0.0.1:8091). Expected labels are scored here after the fact and never sent.
Codec: raw vs zlib vs gzip vs the kit packet (raw/Unishox2) vs the model codec when CODEC_MODEL_PATH is set.
Every number is tagged [measured], [calculated] or [simulated]; nothing here is simulated.
"""
import gzip, json, os, statistics, subprocess, sys, time, urllib.request, zlib
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "services/local-laya/tests"), str(ROOT / "services/codec-radio/codec")]
from laya_g4_helpers import incident, make_job, report  # noqa: E402

URL = os.environ.get("EVAL_LAYA_URL") or os.environ.get("LOCAL_LAYA_URL") or "http://127.0.0.1:8091"
RANK = {"POSSIBLE_LIFE_SAFETY": 0, "ACTIVE_NEED": 1, "INFORMATION": 2}
LINKS = {"ATTACH_REPORT", "FLAG_CORRECTION", "FLAG_CONFLICT"}
FRAMING = 4  # packet header (2) + CRC (2); calculated, added to raw/zlib/gzip for an equal on-air comparison


def get(path):
    return json.load(urllib.request.urlopen(URL + path, timeout=10))


def build_job(spec, world):
    rep = lambda rid, t, seq, sent=None: report(rid, t, seq, sent)
    pool = {k: rep(k, v["text"], v["seq"]) for k, v in world["reports"].items()}
    relevant = []
    for r in spec.get("relevant") or []:
        relevant.append(pool[r["id"]] if "text" not in r else rep(r["id"], r["text"], r["seq"], r.get("sentAt")))
    if not spec.get("relevant"):
        seen = {rid for c in spec["candidates"] for rid in world["incidents"][c]["reports"]}
        relevant = [pool[rid] for rid in sorted(seen)]
    cands = [incident(c, world["incidents"][c]["attention"], world["incidents"][c]["reports"],
                      revision=world["incidents"][c]["revision"], start=pool[world["incidents"][c]["reports"][0]]["receiveSequence"])
             for c in spec["candidates"]]
    return make_job(spec["text"], candidates=cands, relevant=relevant, report_id="rep-" + spec["id"],
                    seq=spec.get("seq", 100), sent_at=spec.get("sentAt"), signature="sig-" + spec["id"])


def post(job):
    req = urllib.request.Request(URL + "/suggest", json.dumps(job).encode(), {"Content-Type": "application/json"})
    t = time.perf_counter()
    out = json.load(urllib.request.urlopen(req, timeout=120))
    return out, (time.perf_counter() - t) * 1000


def score(spec, out):
    e = spec["expect"]
    act, cand, att = out["action"], out["candidateIncidentId"], out["attention"]
    floor = "POSSIBLE_LIFE_SAFETY" if e.get("keeps_concern") else e.get("attention")
    f = {
        "false_link": act in LINKS and (e.get("action") == "NEW_INCIDENT" or ("candidate" in e and cand != e["candidate"])),
        "missed_correction": e.get("action") == "FLAG_CORRECTION" and act != "FLAG_CORRECTION",
        "attention_confusion": bool(e.get("attention")) and att is not None and att != e["attention"],
        "unjustified_downgrade": bool(floor) and att is not None and RANK[att] > RANK[floor],
        "review": act == "REQUEST_REVIEW" or att is None,
        "action_match": ("action" not in e) or act == e["action"],
    }
    return f


def laya():
    data = json.loads((ROOT / "fixtures/private/heldout/cases.json").read_text())
    health = get("/health")
    rows = []
    for spec in data["cases"]:
        out, ms = post(build_job(spec, data["world"]))
        rows.append({"id": spec["id"], "category": spec["category"], "ms": round(ms, 1), "action": out["action"],
                     "candidate": out["candidateIncidentId"], "attention": out["attention"], "expect": spec["expect"],
                     **score(spec, out)})
    ms = sorted(r["ms"] for r in rows)
    keys = ["false_link", "missed_correction", "attention_confusion", "unjustified_downgrade", "review", "action_match"]
    return {"worker": health, "url": URL, "n": len(rows), "totals": {k: sum(r[k] for r in rows) for k in keys},
            "timing_ms": {"first": rows[0]["ms"], "median": statistics.median(ms), "max": ms[-1],
                          "mean": round(statistics.mean(ms), 1)}, "cases": rows}


def codec():
    sets = {"Outer Sunset exercise reports": [r["text"] for r in json.loads(
                (ROOT / "fixtures/replay/sunset-exercise.json").read_text())["reports"].values()],
            "sample.jsonl first 100": [json.loads(l)["text"] for l in
                                       (ROOT / "services/codec-radio/data/sample.jsonl").read_text().splitlines()[:100]]}
    import mesh_codec
    model, why = None, "CODEC_MODEL_PATH not configured"
    if os.environ.get("CODEC_MODEL_PATH"):
        try:
            import runtime
            model, why = runtime.load(), ""
        except Exception as e:
            why = f"{type(e).__name__}: {str(e)[:120]}"
    res = {"model_codec": "run" if model else f"not run ({why})", "sets": {}}
    for name, texts in sets.items():
        raw = [t.encode() for t in texts]
        m = {"texts": len(texts), "raw": sum(map(len, raw)),
             "zlib9": sum(len(zlib.compress(b, 9)) for b in raw), "gzip9": sum(len(gzip.compress(b, 9)) for b in raw)}
        m["raw+framing"], m["zlib9+framing"], m["gzip9+framing"] = (m[k] + FRAMING * len(texts) for k in ("raw", "zlib9", "gzip9"))
        for label, mdl in (("kit_packet_nomodel", None),) + ((("model_packet", model),) if model else ()):
            tot, n, methods, enc = 0, 0, {}, []
            for t in texts:
                try:
                    t0 = time.perf_counter()
                    pkt, meth = mesh_codec.build_packet(t, mdl)
                    enc.append((time.perf_counter() - t0) * 1000)
                except ValueError:
                    continue
                tot, n = tot + len(pkt), n + 1
                methods[meth] = methods.get(meth, 0) + 1
            m[label] = {"bytes": tot, "packets": n, "methods(0 raw,1 unishox,2 model)": methods,
                        "encode_ms_median": round(statistics.median(enc), 2) if enc else None}
        res["sets"][name] = m
    return res


def md(rep):
    L, C = rep["laya"], rep["codec"]
    o = [f"# Evaluation report {rep['date']}", "",
         f"Commit {rep['commit']}. Tags: [measured] timed or counted here, [calculated] derived from measured values, [simulated] none.", "",
         "## Laya held-out cases", "",
         f"Worker {L['url']}: {json.dumps(L['worker'])}. {L['n']} authored cases beyond R01-R12 "
         "(`fixtures/private/heldout/cases.json`); labels are reviewed expectations, never model input. "
         "Counts below are [measured] per case, scored by rule, not by a model. Review = REQUEST_REVIEW or null attention "
         "(a safe boundary decision, not a miss).", "",
         "| Metric | Count |", "|---|---|"]
    for k, v in L["totals"].items():
        o.append(f"| {k} | {v} / {L['n']} |")
    t = L["timing_ms"]
    o += ["", f"Read zero false links with care: {L['totals']['review']} of {L['n']} went to review, so few labels were committed. "
          "Zero errors among committed labels is not evidence of accuracy."]
    o += ["", f"Per-call time [measured], ms: first {t['first']}, median {t['median']}, mean {t['mean']}, max {t['max']}. "
          "Laya only; Claude time is reported separately and was not part of this run.", "",
          "| Case | Category | Action | Candidate | Attention | Flags | ms |", "|---|---|---|---|---|---|---|"]
    for r in L["cases"]:
        flags = ",".join(k for k in ("false_link", "missed_correction", "attention_confusion", "unjustified_downgrade", "review") if r[k]) or "-"
        o.append(f"| {r['id']} | {r['category']} | {r['action']}{'' if r['action_match'] else ' (!)'} | {r['candidate'] or '-'} | {r['attention'] or '-'} | {flags} | {r['ms']} |")
    o += ["", "## Codec", "", f"Model codec: {C['model_codec']}. Framing of {FRAMING} bytes (header + CRC) is added to raw/zlib/gzip as "
          "[calculated] so all columns are on-air bytes; kit packet and model packet are [measured] from `mesh_codec.build_packet`. "
          "Only packets that fit and carry the text exactly are counted (`packets`).", ""]
    for name, m in C["sets"].items():
        o += [f"### {name} ({m['texts']} texts)", "", "| Method | Total bytes | Note |", "|---|---|---|",
              f"| raw UTF-8 | {m['raw']} | [measured] payload, no overhead |",
              f"| raw + framing | {m['raw+framing']} | [calculated] |",
              f"| zlib level 9 | {m['zlib9']} | [measured] includes 6-byte zlib header/checksum |",
              f"| zlib + framing | {m['zlib9+framing']} | [calculated] |",
              f"| gzip level 9 | {m['gzip9']} | [measured] includes 18-byte gzip header/trailer |",
              f"| gzip + framing | {m['gzip9+framing']} | [calculated] |"]
        for k in ("kit_packet_nomodel", "model_packet"):
            if k in m:
                p = m[k]
                o.append(f"| {k} | {p['bytes']} | [measured] {p['packets']} packets, methods {p['methods(0 raw,1 unishox,2 model)']}, median encode {p['encode_ms_median']} ms |")
        if "model_packet" not in m:
            o.append("| model_packet | not run | codec model not available |")
        o.append("")
    o.append("Small texts make zlib/gzip headers dominate; compare against the framed columns, not the unframed ones.")
    return "\n".join(o) + "\n"


if __name__ == "__main__":
    day = date.today().isoformat()
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    rep = {"date": day, "commit": commit, "laya": laya(), "codec": codec()}
    out = ROOT / "evaluation"
    out.mkdir(exist_ok=True)
    (out / f"report-{day}.json").write_text(json.dumps(rep, indent=1) + "\n")
    (out / f"report-{day}.md").write_text(md(rep))
    print(f"wrote evaluation/report-{day}.md and .json")
