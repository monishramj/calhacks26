"""Native, serialized HTTP worker: GET /health and POST /suggest."""
import argparse
import json
import logging
from http.server import BaseHTTPRequestHandler, HTTPServer

from .config import LAYA_REVISION, LAYA_RUNTIME, settings
from .runtime import LayaUnavailable, load
from .suggest import InvalidJob, domain_contract, suggest, validate_job


def error(code: str) -> dict:
    return {"error": {"code": code}}


class Worker:
    """Loads the runtime once through `loader` and serves requests against it."""

    def __init__(self, loader):
        self.scorer_provenance = None
        try:
            self.runtime = loader()
            scorer_path = settings().scorer_path
            if scorer_path:
                from finetune.scorer import load_scorer
                self.scorer_provenance = load_scorer(self.runtime, scorer_path)[2]
        except Exception:
            logging.getLogger(__name__).warning("Local model unavailable at startup")
            self.runtime = None

    def handle(self, method: str, path: str, body: bytes) -> tuple[int, dict]:
        if method == "GET" and path == "/health":
            if self.runtime is None:
                return 503, {"status": "unavailable"}
            health = {"status": "ready", "runtime": LAYA_RUNTIME, "revision": LAYA_REVISION}
            if self.scorer_provenance:
                health["scorer"] = self.scorer_provenance
            return 200, health
        if method != "POST" or path != "/suggest":
            return 404, error("NOT_FOUND")
        if len(body) > domain_contract.MAX_WIRE_BYTES:
            return 413, error("INVALID_INPUT")
        try:
            job = json.loads(body)
            validate_job(job)
        except (InvalidJob, ValueError, TypeError, RecursionError):
            return 400, error("INVALID_INPUT")
        try:
            return 200, suggest(job, self.runtime)
        except LayaUnavailable:
            return 503, error("SERVICE_UNAVAILABLE")
        except Exception:
            logging.getLogger(__name__).warning("Local suggestion failed")
            return 503, error("SERVICE_UNAVAILABLE")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8091)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    worker = Worker(load)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def respond(self, status, payload):
            raw = domain_contract.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(raw)
            self.close_connection = True

        def do_GET(self):
            self.respond(*worker.handle("GET", self.path, b""))

        def do_POST(self):
            lengths = self.headers.get_all("Content-Length", [])
            if (self.headers.get("Transfer-Encoding") or len(lengths) != 1
                    or not lengths[0].isascii() or not lengths[0].isdigit()):
                self.respond(400, error("INVALID_INPUT"))
                return
            try:
                length = int(lengths[0])
            except ValueError:
                self.respond(400, error("INVALID_INPUT"))
                return
            if length > domain_contract.MAX_WIRE_BYTES:
                self.respond(413, error("INVALID_INPUT"))
                return
            try:
                body = self.rfile.read(length)
            except TimeoutError:
                self.respond(408, error("INVALID_INPUT"))
                return
            if len(body) != length:
                self.respond(400, error("INVALID_INPUT"))
                return
            self.respond(*worker.handle("POST", self.path, body))

        def log_message(self, format, *args):
            pass  # Request paths and bodies may contain sensitive report data.

    # Serialize calls: the model is loaded once and its SDK is not assumed thread-safe.
    with HTTPServer((args.host, args.port), Handler) as server:
        logging.info("Laya HTTP worker listening on %s:%s", args.host, server.server_port)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
