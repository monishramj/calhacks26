"""G1: malformed packets and bad metadata are rejected cleanly (§3, §17, §20 G1).

Receiver side: parse_packet never raises on radio input. It returns {'ok': False, 'reason': ...} for anything
it cannot verify, and the reason names the problem.
Sender side: build_packet raises ValueError for metadata it cannot encode, instead of clipping or wrapping it.
"""
import os
import random
import struct
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

CODEC_DIR = Path(__file__).resolve().parent.parent / "codec"


def header(mc, method, type_idx=6, priority=0, people=None, location=None, model_id=0):
    """Hand-built header so tests can express byte layouts the builder refuses to produce."""
    h = bytes([(model_id & 0xF) << 4 | (method & 0xF),
               (type_idx & 0xF) << 4 | (priority & 3) << 2 | (location is not None) << 1 | (people is not None)])
    if people is not None:
        h += bytes([people])
    if location is not None:
        h += struct.pack(">HH", *location)
    return h


def raw_packet(mc, text_bytes, **kw):
    head = header(mc, mc.RAW, **kw)
    return head + text_bytes + struct.pack(">H", mc.crc16(head + text_bytes))


def assert_rejected(res, *words):
    assert isinstance(res, dict) and res.get("ok") is False, f"expected rejection, got {res!r}"
    if words:
        reason = str(res.get("reason", "")).lower()
        assert any(w in reason for w in words), f"reason {reason!r} should mention one of {words}"


# ---------------------------------------------------------------------------------------------- receiver

def test_empty_packet_is_rejected_without_exception(mc):
    assert_rejected(mc.parse_packet(b""))


@pytest.mark.parametrize("data", [b"\x00", b"\x06", b"\x00\x60", b"\x00\x60\x00"])
def test_too_short_packets_are_rejected_without_exception(mc, data):
    assert_rejected(mc.parse_packet(data))


def test_every_truncation_of_a_valid_packet_is_rejected(mc):
    """Cutting a valid packet anywhere (header, optional fields, body, CRC) is a rejection, never a crash."""
    full = raw_packet(mc, "Shelter needs blankets".encode(), people=4, location=(1200, 3400))
    assert mc.parse_packet(full).get("ok"), "control: the untruncated packet must decode"
    for n in range(len(full)):
        assert_rejected(mc.parse_packet(full[:n]))


@pytest.mark.parametrize("people,location", [(3, None), (None, (10, 20)), (3, (10, 20))])
def test_flags_announcing_missing_optional_fields_are_rejected(mc, people, location):
    """Header flags say people/location follow, but the packet ends first."""
    head = header(mc, mc.RAW, people=people, location=location)
    flags_only = head[:2]
    assert_rejected(mc.parse_packet(flags_only + b"\x12\x34"))


@pytest.mark.parametrize("method", list(range(3, 16)))
def test_unknown_method_is_rejected_by_name(mc, method):
    head = header(mc, method)
    body = b"anything"
    pkt = head + body + struct.pack(">H", mc.crc16(head + body))
    assert_rejected(mc.parse_packet(pkt), "method")


@pytest.mark.parametrize("type_idx", list(range(7, 16)))
def test_unknown_type_is_rejected_by_name(mc, type_idx):
    pkt = raw_packet(mc, b"School gym clear", type_idx=type_idx)
    assert_rejected(mc.parse_packet(pkt), "type")


def test_bad_checksum_is_rejected(mc):
    pkt = bytearray(raw_packet(mc, b"School gym clear"))
    pkt[-1] ^= 0x01
    assert_rejected(mc.parse_packet(bytes(pkt)), "checksum")


def test_invalid_utf8_raw_body_is_rejected_even_if_crc_matches_replacement(mc):
    """Invalid UTF-8 must not be repaired into U+FFFD and accepted. Craft the CRC over the 'repaired' text so
    only an explicit UTF-8 check can catch it."""
    head = header(mc, mc.RAW)
    body = b"School \xff gym"
    repaired = body.decode("utf-8", "replace").encode()
    pkt = head + body + struct.pack(">H", mc.crc16(head + repaired))
    assert_rejected(mc.parse_packet(pkt), "utf")


def test_llm_packet_without_matching_model_is_rejected(mc):
    head = header(mc, mc.LLM, model_id=2)
    pkt = head + b"\x01\x02\x03" + b"\x00\x00"
    assert_rejected(mc.parse_packet(pkt, None), "model")


def test_garbage_unishox_bodies_never_crash_and_are_rejected():
    """Random Unishox2 bodies run in a child process: an out-of-bounds write in the decompressor would kill it.
    Every one must come back as a clean rejection."""
    code = textwrap.dedent(f"""
        import os, random, struct, sys
        sys.path.insert(0, {str(CODEC_DIR)!r})
        import mesh_codec as mc
        rnd = random.Random(11)
        bad = 0
        for _ in range(300):
            head = bytes([mc.UNISHOX, 0x60])
            body = bytes(rnd.getrandbits(8) for _ in range(rnd.randint(1, 200)))
            res = mc.parse_packet(head + body + os.urandom(2))
            if not (isinstance(res, dict) and res.get("ok") is False):
                bad += 1
        print("BAD", bad)
    """)
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120)
    if "No module named 'unishox2'" in proc.stderr:
        pytest.skip("unavailable: no Unishox2 module")
    assert proc.returncode == 0, f"decoder process died (exit {proc.returncode}): {proc.stderr[-800:]}"
    assert "BAD 0" in proc.stdout, proc.stdout + proc.stderr[-800:]


def test_compressible_unishox_packet_decodes_in_full_in_child_process():
    """A legitimate packet whose text expands far beyond the decompressor's guessed buffer (4*len+64): must decode
    to the full text without a crash."""
    code = textwrap.dedent(f"""
        import sys
        sys.path.insert(0, {str(CODEC_DIR)!r})
        import mesh_codec as mc
        text = "x" * 400
        pkt, method = mc.build_packet(text, None, force_method=mc.UNISHOX)
        res = mc.parse_packet(pkt)
        print("OK" if res.get("ok") and res.get("text") == text else f"WRONG {{res}}")
    """)
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120)
    if "No module named 'unishox2'" in proc.stderr:
        pytest.skip("unavailable: no Unishox2 module")
    assert proc.returncode == 0, f"decoder process died (exit {proc.returncode}): {proc.stderr[-800:]}"
    assert proc.stdout.strip() == "OK", proc.stdout[-500:]


# ---------------------------------------------------------------------------------------------- sender

@pytest.mark.parametrize("priority", [-1, 4, 7])
def test_out_of_range_priority_is_rejected_not_wrapped(mc, priority):
    with pytest.raises(ValueError):
        mc.build_packet("Shelter needs blankets", None, "need", priority)


@pytest.mark.parametrize("people", [-1, 256, 1000])
def test_out_of_range_people_count_is_rejected_not_clipped(mc, people):
    with pytest.raises(ValueError):
        mc.build_packet("Two people upstairs", None, "trapped", 3, people)


@pytest.mark.parametrize("location", [(-1, 0), (0, 65536), (70000, 70000), (1, 2, 3), (1.5, 2)])
def test_invalid_location_is_rejected_with_value_error(mc, location):
    with pytest.raises(ValueError):
        mc.build_packet("Water rising downstairs", None, "trapped", 3, None, location)


def test_unknown_message_type_is_rejected(mc):
    with pytest.raises(ValueError):
        mc.build_packet("Shelter needs blankets", None, "dispatch")


@pytest.mark.parametrize("force_method", [3, 7, 15, -1])
def test_unknown_forced_method_is_rejected_with_value_error(mc, force_method):
    with pytest.raises(ValueError):
        mc.build_packet("Shelter needs blankets", None, force_method=force_method)


@pytest.mark.parametrize("priority,people,location", [(0, None, None), (3, 0, None), (2, 255, (0, 0)),
                                                      (1, 7, (65535, 65535))])
def test_valid_metadata_round_trips_exactly(mc, priority, people, location):
    """Control: the boundary values that are legal must survive unchanged."""
    pkt, _ = mc.build_packet("Shelter needs blankets", None, "need", priority, people, location)
    res = mc.parse_packet(pkt)
    assert res.get("ok")
    assert (res["priority"], res["people"], res["location"]) == (priority, people, location)


# ---------------------------------------------------------------------------------------------- real model

@pytest.mark.model
def test_garbage_llm_bodies_are_rejected_without_exception(mc, model):
    rnd = random.Random(5)
    for _ in range(3):
        head = header(mc, mc.LLM, model_id=model.model_id)
        body = bytes(rnd.getrandbits(8) for _ in range(rnd.randint(4, 60)))
        assert_rejected(mc.parse_packet(head + body + os.urandom(2), model))
