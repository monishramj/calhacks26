"""G1: accepted report text survives the codec byte for byte, or is rejected explicitly (§3, §17, §20 G1).

"Exact" means the decoded string equals the input string, so its UTF-8 bytes are identical. Collapsing,
trimming or otherwise normalizing whitespace is a silent change and fails these tests.
"""
from pathlib import Path

import pytest

CODEC_DIR = Path(__file__).resolve().parent.parent / "codec"

# Whitespace and Unicode a field report can legitimately contain.
EXACT_CASES = {
    "leading_spaces": "   Water rising at the school gym",
    "trailing_spaces": "Water rising at the school gym   ",
    "repeated_spaces": "Two  people   waiting upstairs",
    "tab": "Shelter\tneeds blankets tonight",
    "line_break": "Gym is clear.\nMain building not checked.",
    "crlf_line_break": "Gym is clear.\r\nMain building not checked.",
    "trailing_newline": "Shelter needs blankets tonight\n",
    "accents": "Ça va? Água potável à l'école, café fermé",
    "cjk": "学校主楼可能还有人",
    "emoji": "Need rescue 🆘 two people on the roof",
    "nbsp": "Room 204 still occupied",
}


def round_trip(mc, text, model=None, force_method=None):
    pkt, method = mc.build_packet(text, model, "info", 0, None, None, force_method=force_method)
    return pkt, method, mc.parse_packet(pkt, model)


# ---------------------------------------------------------------------------------------------- model-free

@pytest.mark.parametrize("name", list(EXACT_CASES))
def test_auto_method_returns_exact_text_without_model(mc, name):
    """With no model the sender picks raw or Unishox2; either way the receiver must get the exact text."""
    text = EXACT_CASES[name]
    pkt, method, res = round_trip(mc, text)
    assert res.get("ok"), f"decode failed: {res}"
    assert res["text"] == text, f"method {method} changed the text: {res['text']!r} != {text!r}"


@pytest.mark.parametrize("method_name", ["RAW", "UNISHOX"])
@pytest.mark.parametrize("name", list(EXACT_CASES))
def test_forced_method_is_exact_or_explicitly_rejected(mc, name, method_name):
    """A specific method may refuse text it cannot carry (ValueError at build), but must never alter it."""
    text = EXACT_CASES[name]
    try:
        pkt, method, res = round_trip(mc, text, force_method=getattr(mc, method_name))
    except ValueError:
        return  # explicit rejection is allowed
    assert res.get("ok") and res["text"] == text, f"{method_name} altered {text!r} -> {res}"


@pytest.mark.parametrize("text", ["", "   "])
def test_empty_or_blank_report_is_rejected(mc, text):
    """A report with no content is refused at the sender instead of being sent as an empty or collapsed body."""
    with pytest.raises(ValueError):
        mc.build_packet(text, None)


def test_highly_compressible_text_round_trips(mc):
    """300 repeated characters do not fit raw (>233 B), so Unishox2 carries them and must expand them in full.
    Runs in a child process: the kit's decompressor writes past its buffer here and aborts the interpreter."""
    import subprocess
    import sys
    import textwrap
    code = textwrap.dedent(f"""
        import sys
        sys.path.insert(0, {str(CODEC_DIR)!r})
        import mesh_codec as mc
        text = "help " * 60
        pkt, method = mc.build_packet(text, None)
        res = mc.parse_packet(pkt)
        print("OK" if len(pkt) <= mc.MAX_PAYLOAD and res.get("ok") and res.get("text") == text else f"WRONG {{res}}")
    """)
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, f"decoder process died (exit {proc.returncode}): {proc.stderr[-600:]}"
    assert proc.stdout.strip() == "OK", proc.stdout[-500:]


def test_oversized_text_is_rejected_not_truncated(mc):
    """Text that cannot fit even compressed raises; nothing is cut to fit (regression)."""
    import random
    rnd = random.Random(7)
    text = "".join(rnd.choice("qzxjkvbpgwyfmcl0123456789#@%&") for _ in range(600))
    with pytest.raises(ValueError):
        mc.build_packet(text, None)


# ---------------------------------------------------------------------------------------------- real model

MODEL_CASES = ["repeated_spaces", "line_break", "trailing_spaces", "accents", "emoji"]


@pytest.mark.model
@pytest.mark.parametrize("name", MODEL_CASES)
def test_auto_method_returns_exact_text_with_model(mc, model, name):
    """With the real model the smallest method wins; whichever it is, the text must come back exactly."""
    text = EXACT_CASES[name]
    pkt, method, res = round_trip(mc, text, model)
    assert res.get("ok"), f"decode failed: {res}"
    assert res["text"] == text, f"method {method} changed the text: {res['text']!r} != {text!r}"


@pytest.mark.model
@pytest.mark.parametrize("name", ["line_break", "repeated_spaces", "emoji"])
def test_forced_llm_is_exact_or_explicitly_rejected(mc, model, name):
    """Newline is the model coder's terminator; text it cannot represent must be refused, never reshaped."""
    text = EXACT_CASES[name]
    try:
        pkt, method, res = round_trip(mc, text, model, force_method=mc.LLM)
    except (ValueError, KeyError) as e:   # the kit signals "LLM unavailable for this text" with KeyError today
        if isinstance(e, KeyError):
            pytest.fail("forced LLM refusal must be a ValueError, not a KeyError")
        return
    assert res.get("ok") and res["text"] == text, f"LLM altered {text!r} -> {res}"


@pytest.mark.model
def test_plain_report_still_uses_llm_and_round_trips(mc, model):
    """Guard against 'fixing' G1 by never using the model: an ordinary one-line report is smallest as LLM."""
    text = "Water is rising into the school gym on 5th Street, two families on the roof."
    pkt, method, res = round_trip(mc, text, model)
    assert method == mc.LLM
    assert res.get("ok") and res["text"] == text
