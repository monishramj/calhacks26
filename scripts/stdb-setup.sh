#!/bin/sh
# Idempotent local live setup: start SpacetimeDB, publish the module (-c: fresh run state each time),
# grant roles, write apps/web/.env.local. Optional: WORKER_IDENTITY=<hex> grants that identity `worker`.
set -eu
cd "$(dirname "$0")/.."
URI=${SPACETIMEDB_URI:-http://127.0.0.1:3000}
DB=incident-desk
S="docker compose exec -T spacetimedb"

docker compose up -d spacetimedb >/dev/null
until curl -sf "$URI/v1/ping" >/dev/null; do sleep 1; done
# The image has no node; the module build only runs `tsc --noEmit` through it.
$S sh -c '[ -x /usr/local/bin/node ] || { printf "#!/bin/sh\nexit 0\n" > /usr/local/bin/node && chmod +x /usr/local/bin/node; }'
(cd spacetimedb && { [ -d node_modules ] || npm install --no-audit --no-fund; })
$S sh -c "cd /repo/spacetimedb && spacetime publish --server http://127.0.0.1:3000 -y -c $DB"

TOKEN=$($S spacetime login show --token | grep -o 'eyJ[A-Za-z0-9._-]*' | head -1)
call() { curl -sf -X POST "$URI/v1/database/$DB/call/$1" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -d "$3"; }
identity_of() { printf %s "$1" | cut -d. -f2 | tr '_-' '/+' | python3 -c 'import sys,base64,json;s=sys.stdin.read().strip();print(json.loads(base64.b64decode(s+"="*(-len(s)%4)))["hex_identity"])'; }

# A role is exclusive per identity, so `simulator` goes to a second identity (used only by "Send next report").
SIM=$(curl -s -X POST "$URI/v1/identity" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
call grant_role "$TOKEN" "[\"$(identity_of "$SIM")\",\"simulator\"]"
[ -z "${WORKER_IDENTITY:-}" ] || call grant_role "$TOKEN" "[\"$WORKER_IDENTITY\",\"worker\"]"

# Exercise places (and subarea aliases): without them every sender-stated location is dropped as unknown.
python3 -c 'import json;[print(json.dumps([p["placeId"],json.dumps(p["aliases"]+[a for s in p.get("subareas",[]) for a in s["aliases"]])])) for p in json.load(open("fixtures/private/exercise/exercise.json"))["places"]]' |
  while read -r args; do call put_place "$TOKEN" "$args"; done

cat > apps/web/.env.local <<EOF
VITE_STDB_URI=ws://127.0.0.1:3000
VITE_STDB_DATABASE=$DB
VITE_STDB_TOKEN=$TOKEN
VITE_STDB_SIM_TOKEN=$SIM
EOF
echo "ok: operator + simulator tokens written to apps/web/.env.local"
