"""HTTP surface at LOCAL_LAYA_URL: GET /health, POST /suggest. G4 harness only."""


class Worker:
    """Loads the runtime once through `loader` and serves requests against it."""

    def __init__(self, loader):
        self.loader = loader

    def handle(self, method: str, path: str, body: bytes) -> tuple[int, dict]:
        raise NotImplementedError("G4 IMPLEMENT")
