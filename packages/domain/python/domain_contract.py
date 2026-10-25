"""Python side of the wire contract, for the codec bridge and the Laya worker.

G0 TEST harness stub: G0 IMPLEMENT fills in validate() and dumps(). Python producers
should serialize with dumps() and check with validate() against the committed schema.
"""

from __future__ import annotations

from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "contract.schema.json"


def validate(type_name: str, payload: object) -> list[str]:
    """Return a list of contract violations for `payload` as `type_name` (empty = valid)."""
    return []  # G0 IMPLEMENT pending: accepts everything, like the placeholder schema


def dumps(payload: object) -> str:
    """Serialize for the wire: UTF-8 text kept as-is, NaN/Infinity refused."""
    return ""
