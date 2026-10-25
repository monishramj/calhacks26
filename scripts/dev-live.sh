#!/bin/sh
# One command for the live demo on this Mac: SpacetimeDB, Laya worker, coordinator, dashboard.
# Ctrl-C stops everything this script started (the database container keeps running).
set -eu
cd "$(dirname "$0")/.."
# Load non-empty .env values only, so empty placeholders never mask keys exported by the shell.
[ -f .env ] && { set -a; eval "$(grep -E '^[A-Z_]+=.+' .env)"; set +a; }
URI=${SPACETIMEDB_URI:-http://127.0.0.1:3000}
export LOCAL_LAYA_URL=${LOCAL_LAYA_URL:-http://127.0.0.1:8091}
LAYA_PY=${LAYA_PY:-../laya-env/bin/python}

# The coordinator's worker identity: mint once, reuse after.
TOKEN_FILE=apps/coordinator/.worker-token
docker compose up -d spacetimedb >/dev/null
until curl -sf "$URI/v1/ping" >/dev/null; do sleep 1; done
[ -s "$TOKEN_FILE" ] || curl -s -X POST "$URI/v1/identity" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])' > "$TOKEN_FILE"
WORKER_IDENTITY=$(cut -d. -f2 "$TOKEN_FILE" | tr '_-' '/+' | python3 -c 'import sys,base64,json;s=sys.stdin.read().strip();print(json.loads(base64.b64decode(s+"="*(-len(s)%4)))["hex_identity"])')
WORKER_IDENTITY=$WORKER_IDENTITY sh scripts/stdb-setup.sh

trap 'kill 0' INT TERM EXIT
if [ -x "$LAYA_PY" ] && [ -n "${LAYA_MODEL_PATH:-}" ]; then
  PYTHONPATH=services/local-laya "$LAYA_PY" -m laya_worker.server --port 8091 &
  # Model load takes a while; give it up to 2 min so the coordinator starts with Laya on.
  i=0; until curl -sf "$LOCAL_LAYA_URL/health" >/dev/null || [ $i -ge 120 ]; do sleep 1; i=$((i+1)); done
else
  echo "unavailable: Laya worker (set LAYA_MODEL_PATH in .env and create ../laya-env); reports stay in manual review"
fi
[ -n "${ANTHROPIC_API_KEY:-}" ] || echo "unavailable: summary step (no ANTHROPIC_API_KEY)"
npm start -w @calhacks26/coordinator &
npm run dev:live -w @calhacks26/web &
wait
