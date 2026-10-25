"""Local-only Laya runtime: load once, answer typed questions over plain-language state.

Ported from flyby server/triage/laya_runtime.py. Acquisition belongs to tools/setup_laya.py.
"""
import hashlib
from importlib.metadata import version
from math import isfinite
from pathlib import Path
from time import perf_counter

from .config import LAYA_RUNTIME, LAYA_WEIGHTS_SHA256, Settings, settings as default_settings

REQUIRED_FILES = ("model.safetensors", "rl_agent_config.json", "encoder/config.json", "tokenizer/tokenizer.json")


class LayaUnavailable(RuntimeError):
    """The model cannot be loaded or called. Callers report SERVICE_UNAVAILABLE, never a default label."""


def check_answers(answers: dict, questions: dict) -> dict:
    """Reject anything that is not the typed shape the SDK documents. Raises ValueError."""
    if not isinstance(answers, dict) or set(answers) != set(questions):
        raise ValueError("Laya returned unexpected answer keys")
    for qid, question in questions.items():
        answer = answers[qid]
        if not isinstance(answer, dict):
            raise ValueError(f"{qid}: answer must be an object")
        if question["type"] == "choice":
            probs = answer.get("probabilities", {})
            if not isinstance(probs, dict) or set(probs) != set(question["criteria"]):
                raise ValueError(f"{qid}: labels differ from the options asked")
            if any(type(v) not in (int, float) or not 0 <= v <= 1 or not isfinite(v) for v in probs.values()):
                raise ValueError(f"{qid}: probability outside [0, 1]")
            if abs(sum(probs.values()) - 1) > 1e-3:
                raise ValueError(f"{qid}: probabilities do not sum to one")
            if not isinstance(answer.get("choice"), str) or answer["choice"] not in probs:
                raise ValueError(f"{qid}: unknown choice")
            if probs[answer["choice"]] != max(probs.values()):
                raise ValueError(f"{qid}: choice does not match probabilities")
        elif question["type"] == "score":
            value, top = answer.get("score"), len(question["criteria"]) - 1
            if type(value) not in (int, float) or not 0 <= value <= top or not isfinite(value):
                raise ValueError(f"{qid}: expected ordinal outside [0, {top}]")
        else:
            value = answer.get("noul")
            if type(value) not in (int, float) or not 0 <= value <= 1 or not isfinite(value):
                raise ValueError(f"{qid}: P(true) outside [0, 1]")
    return answers


class LayaRuntime:
    def __init__(self, agent, load_ms: float):
        self.agent = agent
        self.device = str(agent.device)
        self.load_ms = load_ms
        self.max_len = int(agent.cfg.get("max_len", 512))
        self.head_max_len = int(agent.cfg.get("head_max_len", 192))

    def count_tokens(self, text: str) -> int:
        return len(self.agent.tok(text, add_special_tokens=False)["input_ids"])

    def state_room(self, question: dict) -> int:
        """Tokens left for the state after this question's header and options.

        The SDK silently right-truncates state beyond this (laya/common.py build_sequence), so callers
        must check it themselves and refuse rather than lose a correction.
        """
        from laya.common import build_sequence
        internal = self.agent._to_internal(question)
        ids, _ = build_sequence(self.agent.tok, "", internal, self.max_len, self.head_max_len, state_ids=[])
        return self.max_len - len(ids)

    def ask(self, text: str, questions: dict) -> dict:
        start = perf_counter()
        try:
            result = self.agent.system_one(text, questions)
        except Exception as error:  # noqa: BLE001 - any runtime failure is an unavailable model
            raise LayaUnavailable(f"Laya call failed: {type(error).__name__}") from error
        latency_ms = (perf_counter() - start) * 1000
        return {"answers": check_answers(result["answers"], questions), "latency_ms": latency_ms}


def load(cfg: Settings | None = None) -> LayaRuntime:
    cfg = cfg or default_settings()
    directory = Path(cfg.model_path)
    if not str(cfg.model_path) or str(cfg.model_path) == ".":
        raise LayaUnavailable("LAYA_MODEL_PATH is not set")
    missing = [name for name in REQUIRED_FILES if not (directory / name).is_file()]
    if missing:
        raise LayaUnavailable("Laya model is not installed at LAYA_MODEL_PATH. Missing: " + ", ".join(missing))
    start = perf_counter()
    try:
        if f"laya=={version('laya')}" != LAYA_RUNTIME:
            raise LayaUnavailable("Unexpected Laya runtime version")
        with (directory / "model.safetensors").open("rb") as weights:
            if hashlib.file_digest(weights, "sha256").hexdigest() != LAYA_WEIGHTS_SHA256:
                raise LayaUnavailable("Unexpected Laya checkpoint digest")
        from laya import Agent
        agent = Agent(str(directory.resolve()), device=cfg.device, compile=False)
    except LayaUnavailable:
        raise
    except Exception as error:
        raise LayaUnavailable("Local model could not be loaded") from error
    return LayaRuntime(agent, (perf_counter() - start) * 1000)
