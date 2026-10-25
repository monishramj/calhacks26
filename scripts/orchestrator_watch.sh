#!/usr/bin/env bash
# Orchestrator watcher: prints one line only when the orchestrator should act.
#   board items for the orchestrator, new PRs, [contract]/REVIEW commits, new health problems.
# Run it from a clone on main, ideally under Claude Code's Monitor tool (each line wakes the session):
#   bash scripts/orchestrator_watch.sh
cd "$(dirname "$0")/.." || exit 1
PY=python3; "$PY" -c 'import sys' 2>/dev/null || PY=python
REPO=monishramj/calhacks26
seen="$(git rev-parse --git-common-dir)/health-seen.txt"; touch "$seen"
open_prs() { curl -s "https://api.github.com/repos/$REPO/pulls?state=open" | "$PY" -c "import json,sys; print(' '.join(str(p['number']) for p in json.load(sys.stdin)))" 2>/dev/null; }
prev=$(git ls-remote --heads origin 2>/dev/null | sort); i=0
lastq=$("$PY" scripts/questions.py list 2>/dev/null | cksum)
prs=$(open_prs)
while true; do
  sleep 60; i=$((i+1))
  cur=$(git ls-remote --heads origin 2>/dev/null | sort)
  if [ -n "$cur" ] && [ "$cur" != "$prev" ]; then
    git fetch -q origin 2>/dev/null || true
    changed=$(comm -13 <(echo "$prev") <(echo "$cur"))
    echo "$changed" | while read -r sha ref; do
      [ -z "$ref" ] && continue
      b=${ref#refs/heads/}; subj=$(git log -1 --format='%s' "$sha" 2>/dev/null)
      [ "$b" = questions ] && continue
      echo "$subj" | grep -q '^\[orchestrator\]' && continue
      echo "$subj" | grep -qE '\[contract\]|REVIEW' && echo "gate: $b -> ${sha:0:7} ${subj:0:110}"
    done
    if echo "$changed" | grep -q 'refs/heads/questions$'; then
      out=$("$PY" scripts/questions.py list 2>/dev/null); h=$(echo "$out" | cksum)
      if [ "$h" != "$lastq" ]; then
        lastq=$h
        echo "$out" | grep -q '^\[' && { echo "board for orchestrator:"; echo "$out" | grep '^\[' | cut -c1-150; }
      fi
    fi
    prev=$cur
  fi
  if [ $((i % 5)) -eq 0 ]; then
    now=$(open_prs)
    for n in $now; do echo " $prs " | grep -q " $n " || echo "new PR #$n opened"; done
    [ -n "$now" ] || [ -z "$prs" ] && prs=$now
  fi
  if [ $((i % 20)) -eq 0 ]; then
    "$PY" scripts/health.py --quiet 2>&1 | grep -E '^(PROBLEM|health:|Traceback)' | while read -r line; do
      key=$(echo "$line" | sed -E 's/[0-9]+ min/N min/')
      grep -qxF "$key" "$seen" || { echo "health $line"; echo "$key" >> "$seen"; }
    done
  fi
done
