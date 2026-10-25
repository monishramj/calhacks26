"""Worker settings from the environment. Weights live outside git at LAYA_MODEL_PATH (§19)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent

LAYA_RUNTIME = "laya==0.3.20"
LAYA_MODEL_ID = "convaiinnovations/laya"
# Same pinned English root checkpoint flyby used (flyby server/config.py LAYA_REVISION).
LAYA_REVISION = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"


@dataclass(frozen=True)
class Settings:
    model_path: Path = field(default_factory=lambda: Path(os.environ.get("LAYA_MODEL_PATH", "")))
    device: str = field(default_factory=lambda: os.environ.get("LAYA_DEVICE", "cpu"))
    results_dir: Path = SERVICE_DIR / "results"


def settings() -> Settings:
    return Settings()
