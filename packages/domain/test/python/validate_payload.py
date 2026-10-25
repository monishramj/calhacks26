"""Consumer check for TypeScript-produced payloads: validate stdin JSON as <Type> with
jsonschema against the committed schema. Exit 0 = valid, 1 = invalid (errors on stderr)."""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

DOMAIN = Path(__file__).resolve().parents[2]
schema = json.loads((DOMAIN / "schema" / "contract.schema.json").read_text(encoding="utf-8"))
root = {k: v for k, v in schema.items() if k != "$id"}
errors = list(Draft202012Validator({"$ref": f"#/$defs/{sys.argv[1]}", **root}).iter_errors(json.loads(sys.stdin.read())))
for e in errors:
    print(f"{list(e.absolute_path)}: {e.message}", file=sys.stderr)
sys.exit(1 if errors else 0)
