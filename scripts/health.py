#!/usr/bin/env python3
"""Repo health check for the orchestrator. Read-only: it fetches and inspects, never edits.

  python scripts/health.py          # report every finding
  python scripts/health.py --quiet  # print PROBLEM lines only (for the background watcher)

Checks every origin/ws/* branch (lanes included) for: merge conflicts with main and with the
other branches, edits outside the workstream's owned paths (AGENTS.md), contract changes from
anyone but ws/state, committed secrets or .env files, large files, contract drift since the
branch last merged main, and staleness. Also counts questions-board items waiting too long.
"""

import argparse
import re
import subprocess
import sys
import time
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent

# Owned paths per workstream (AGENTS.md). Every branch may also touch its status and validation files.
OWNED = {
    "codec-radio": ["services/codec-radio/"],
    "state": ["packages/domain/", "packages/live-adapter/", "spacetimedb/", "fixtures/private/exercise/",
              "package.json", "package-lock.json", "docker-compose.yml", "tsconfig"],
    "inference": ["services/local-laya/", "apps/coordinator/", "work/eval/"],
    "web": ["apps/web/", "fixtures/replay/", "tests/e2e/"],
}
NOT_OWNED = {}
SHARED = ["work/status/", "work/validation/"]
SECRET = re.compile(r"sk-ant-[A-Za-z0-9_-]{10,}|ANTHROPIC_API_KEY\s*=\s*\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----")
BIG_BYTES = 5_000_000
RUNTIME_BIG_BYTES = 25_000_000   # D-005 allows the pinned codec runtime
STALE_S = 90 * 60
QUESTION_WAIT_S = 30 * 60


def git(*args, check=False):
    r = subprocess.run(["git", *args], cwd=HERE, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and r.returncode:
        sys.exit(f"health: git {' '.join(args)} failed: {r.stderr.strip()}")
    return r


def workstream(branch):
    rest = branch.removeprefix("origin/ws/")
    for ws in sorted(OWNED, key=len, reverse=True):
        if rest == ws or rest.startswith(ws + "-"):
            return ws
    return None


def owned(ws, path):
    if any(path.startswith(p) for p in NOT_OWNED.get(ws, [])):
        return False
    return any(path.startswith(p) for p in OWNED[ws] + SHARED)


def conflicts(a, b):
    r = git("merge-tree", "--write-tree", "--name-only", "--no-messages", a, b)
    if r.returncode == 0:
        return []
    return [f for f in r.stdout.splitlines()[1:] if f.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    git("fetch", "--quiet", "--prune", "origin", check=True)
    branches = [b for b in git("branch", "-r", "--format=%(refname:short)").stdout.split() if b.startswith("origin/ws/")]
    found = []

    def report(level, msg):
        found.append((level, msg))

    now = time.time()
    for b in branches:
        ws, name = workstream(b), b.removeprefix("origin/")
        if not ws:
            report("PROBLEM", f"{name}: branch name doesn't map to a workstream")
            continue
        base = git("merge-base", "origin/main", b).stdout.strip()
        changed = git("diff", "--name-only", f"{base}..{b}").stdout.split()
        stray = [p for p in changed if not owned(ws, p)]
        if stray:
            report("PROBLEM", f"{name}: edits outside ws/{ws}'s owned paths: {', '.join(stray[:6])}"
                              + (f" (+{len(stray) - 6} more)" if len(stray) > 6 else ""))
        if ws != "state" and any(p.startswith("packages/domain/") for p in changed):
            report("PROBLEM", f"{name}: changes packages/domain, which only ws/state may change")
        bad = conflicts("origin/main", b)
        if bad:
            report("PROBLEM", f"{name}: won't merge cleanly into main: {', '.join(bad[:6])}")
        added = git("diff", "-U0", f"{base}..{b}").stdout
        if SECRET.search("\n".join(l for l in added.splitlines() if l.startswith("+") and not l.startswith("+++"))):
            report("PROBLEM", f"{name}: added lines look like a secret (API key or private key)")
        envs = [p for p in changed if re.search(r"(^|/)\.env(\.|$)", p) and not p.endswith(".env.example")]
        if envs:
            report("PROBLEM", f"{name}: commits env files: {', '.join(envs)}")
        for p in changed:
            size = git("cat-file", "-s", f"{b}:{p}").stdout.strip()
            limit = RUNTIME_BIG_BYTES if p.startswith("services/codec-radio/runtime/") else BIG_BYTES
            if size.isdigit() and int(size) > limit:
                report("PROBLEM", f"{name}: large file {p} ({int(size) / 1e6:.1f} MB)")
        domain_moved = git("diff", "--name-only", f"{base}..origin/main", "--", "packages/domain/").stdout.strip()
        if domain_moved and ws != "state":
            report("PROBLEM", f"{name}: main changed packages/domain since this branch last merged main; merge main")
        last = git("log", "-1", "--format=%ct %s", b).stdout.strip()
        if last:
            ts, subject = last.split(" ", 1)
            age = now - int(ts)
            if age > STALE_S:
                report("INFO", f"{name}: no push for {int(age // 60)} min (last: {subject[:70]})")

    heads = [b for b in branches if workstream(b)]
    for a, b in combinations(heads, 2):
        if workstream(a) == workstream(b):
            continue  # lanes of one workstream merge through their lead
        bad = conflicts(a, b)
        if bad:
            report("PROBLEM", f"{a.removeprefix('origin/')} and {b.removeprefix('origin/')} conflict: {', '.join(bad[:4])}")

    if git("rev-parse", "--verify", "--quiet", "origin/questions").returncode == 0:
        files = git("ls-tree", "--name-only", "origin/questions", "questions/").stdout.split()
        for f in files:
            if not f.endswith(".md"):
                continue
            text = git("show", f"origin/questions:{f}").stdout
            status = re.search(r"^status:\s*(\S+)", text, re.M)
            if not status or status.group(1) not in ("open", "action", "needs-human"):
                continue
            touched = git("log", "-1", "--format=%ct", "origin/questions", "--", f).stdout.strip()
            if touched and now - int(touched) > QUESTION_WAIT_S:
                mins = int((now - int(touched)) // 60)
                report("PROBLEM" if status.group(1) == "needs-human" else "INFO",
                       f"question {Path(f).stem[:40]} has been '{status.group(1)}' for {mins} min")

    for level, msg in found:
        if level == "PROBLEM" or not args.quiet:
            print(f"{level}: {msg}", flush=True)
    if not args.quiet and not any(l == "PROBLEM" for l, _ in found):
        print(f"OK: {len(branches)} branches checked, no problems.")


if __name__ == "__main__":
    main()
