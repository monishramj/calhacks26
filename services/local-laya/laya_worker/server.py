"""HTTP surface at LOCAL_LAYA_URL: GET /health, POST /suggest (body: JobInput, response: LocalSuggestion).

Errors are {"error": {"code", "message"}} with §17 codes and no provider internals.
"""
import json
import threading

from .config import LAYA_REVISION, LAYA_RUNTIME
from .runtime import LayaUnavailable
from .suggest import InvalidJob, suggest

MAX_BODY_BYTES = 1_048_576  # contract x-maxWireBytes


def _error(status, code, message):
    return status, {"error": {"code": code, "message": message}}


class Worker:
    """Loads the runtime once through `loader` and serves requests against it."""

    def __init__(self, loader):
        self.runtime = None
        try:
            self.runtime = loader()
        except LayaUnavailable:
            self.runtime = None
        self._lock = threading.Lock()

    def handle(self, method: str, path: str, body: bytes) -> tuple[int, dict]:
        if method == "GET" and path == "/health":
            if self.runtime is None:
                return 503, {"status": "unavailable", "runtime": LAYA_RUNTIME, "revision": LAYA_REVISION}
            return 200, {"status": "ready", "runtime": LAYA_RUNTIME, "revision": LAYA_REVISION,
                         "device": self.runtime.device, "loadMs": round(self.runtime.load_ms),
                         "maxLen": self.runtime.max_len}
        if method == "POST" and path == "/suggest":
            return self._suggest(body)
        return _error(404, "INVALID_INPUT", "unknown route")

    def _suggest(self, body: bytes):
        if len(body) > MAX_BODY_BYTES:
            return _error(413, "INVALID_INPUT", "request body is larger than the contract allows")
        try:
            job = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _error(400, "INVALID_INPUT", "request body is not JSON")
        if not isinstance(job, dict):
            return _error(400, "INVALID_INPUT", "request body must be a JobInput object")
        if self.runtime is None:
            return _error(503, "SERVICE_UNAVAILABLE", "local Laya is unavailable")
        try:
            with self._lock:
                return 200, suggest(job, self.runtime)
        except InvalidJob as error:
            return _error(400, "INVALID_INPUT", str(error))
        except LayaUnavailable:
            return _error(503, "SERVICE_UNAVAILABLE", "local Laya is unavailable")
