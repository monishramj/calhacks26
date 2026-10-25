#!/bin/sh
# npm run preflight [-- --smoke]: ready / not ready for dev:live. Never prints secret values.
# Required: node, python, docker, SpacetimeDB + incident-desk, Laya weights. Everything else is reported only.
cd "$(dirname "$0")/.."
ENV_FILE=${ENV_FILE:-.env}
[ -f "$ENV_FILE" ] || ENV_FILE=../calhacks26/.env   # linked worktrees keep no .env of their own
# Non-empty values only, as in dev-live.sh.
[ -f "$ENV_FILE" ] && { set -a; eval "$(grep -E '^[A-Z_]+=.+' "$ENV_FILE")"; set +a; }
URI=${SPACETIMEDB_URI:-http://127.0.0.1:3000}
LAYA_URL=${LOCAL_LAYA_URL:-http://127.0.0.1:8091}
PINNED=$(grep -o '[0-9a-f]\{64\}' services/local-laya/laya_worker/config.py | head -1)
FAIL=0
row() { printf '%-9s %-22s %s\n' "$1" "$2" "$3"; }
need() { row "$1" "$2" "$3"; [ "$1" = ok ] || FAIL=1; }

echo "env file: $([ -f "$ENV_FILE" ] && echo "$ENV_FILE" || echo none)"
NV=$(node -v 2>/dev/null); case $NV in v2[2-9]*|v[3-9]*) need ok node "$NV";; *) need FAIL node "${NV:-missing} (need >=22)";; esac
PY=$(python3 -V 2>&1); need ok python "$PY"
LPY=${LAYA_PY:-../laya-env/bin/python}
[ -x "$LPY" ] && row ok laya-python "$($LPY -V 2>&1)" || row warn laya-python "$LPY missing"
docker info >/dev/null 2>&1 && need ok docker running || need FAIL docker "not running"
if curl -sf -m3 "$URI/v1/ping" >/dev/null; then
  need ok spacetimedb "$URI"
  curl -sf -m3 "$URI/v1/database/incident-desk" >/dev/null \
    && need ok "db incident-desk" published || need FAIL "db incident-desk" "not published (dev:live publishes it)"
else need FAIL spacetimedb "unreachable at $URI"; need FAIL "db incident-desk" unknown; fi
W="${LAYA_MODEL_PATH:+$LAYA_MODEL_PATH/model.safetensors}"
if [ -z "$W" ]; then need FAIL laya-model "LAYA_MODEL_PATH not set"
elif [ ! -f "$W" ]; then need FAIL laya-model "model.safetensors not found"
else
  GOT=$(shasum -a 256 "$W" | cut -d' ' -f1)
  [ "$GOT" = "$PINNED" ] && need ok laya-model "sha256 matches pin" || need FAIL laya-model "sha256 mismatch"
fi
curl -sf -m3 "$LAYA_URL/health" >/dev/null && row ok laya-worker "$LAYA_URL healthy" || row warn laya-worker "not running at $LAYA_URL (dev:live starts it)"
[ -n "${ANTHROPIC_API_KEY:-}" ] && K=set || K=missing
[ -n "${CLAUDE_MODEL:-}" ] && M=$CLAUDE_MODEL || M=missing
[ "$K$M" = "setmissing" ] || [ "$K" = missing ] && row warn claude "ANTHROPIC_API_KEY $K, CLAUDE_MODEL $M (summary step off)" || row ok claude "ANTHROPIC_API_KEY set, CLAUDE_MODEL=$M"
if [ "${1:-}" = "--smoke" ] || [ "${2:-}" = "--smoke" ]; then
  OUT=$(node apps/coordinator/src/inference/claude/smoke.cjs 2>&1) && row ok claude-smoke "$OUT" || row FAIL claude-smoke "$(echo "$OUT" | head -c 200)"
fi
for v in CODEC_MODEL_PATH CODEC_CONTEXT_PATH; do
  eval "p=\${$v:-}"
  if [ -z "$p" ]; then row optional "$v" "not configured"; elif [ -e "$p" ]; then row ok "$v" present; else row warn "$v" "path missing"; fi
done
if [ -z "${RADIO_SERIAL_PORT:-}" ]; then row optional radio "not configured"
elif [ -e "$RADIO_SERIAL_PORT" ]; then row ok radio "serial port present"; else row warn radio "serial port absent"; fi
[ $FAIL = 0 ] && echo "READY" || echo "NOT READY"
exit $FAIL
