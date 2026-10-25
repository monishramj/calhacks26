"""Run the worker: LAYA_MODEL_PATH=<dir> python -m laya_worker  (from services/local-laya).

Binds the port from LOCAL_LAYA_URL (default 8765) on LAYA_HOST (default 0.0.0.0, LAN-reachable).
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from .runtime import LayaUnavailable, load
from .server import MAX_BODY_BYTES, Worker


def _loader():
    try:
        return load()
    except LayaUnavailable as error:
        print(f"local Laya unavailable: {error}", file=sys.stderr)
        raise


def main():
    url = urlparse(os.environ.get("LOCAL_LAYA_URL") or "http://127.0.0.1:8765")
    host, port = os.environ.get("LAYA_HOST", "0.0.0.0"), url.port or 8765
    worker = Worker(_loader)

    class Handler(BaseHTTPRequestHandler):
        def _reply(self, status, payload):
            data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self._reply(*worker.handle("GET", self.path, b""))

        def do_POST(self):
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                self._reply(413, {"error": {"code": "INVALID_INPUT", "message": "request body too large"}})
                return
            self._reply(*worker.handle("POST", self.path, self.rfile.read(length)))

        def log_message(self, fmt, *args):
            sys.stderr.write("laya-worker %s\n" % (fmt % args))

    state = "ready" if worker.runtime else "unavailable"
    print(f"laya-worker {state} on http://{host}:{port} (GET /health, POST /suggest)", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
