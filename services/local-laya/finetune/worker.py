"""Convenience entry point for the standard worker, including optional scorer health."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from laya_worker.server import main


if __name__ == '__main__':
    main()
