"""Publish a baked + meshopt-compressed asset and synchronize its metadata.

python finalize_asset.py RAW_SCENE_META OPTIMIZED_GLB PUBLIC_SCENE_DIR
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys

raw_metadata, optimized, output = map(Path, sys.argv[1:])
metadata = json.loads(raw_metadata.read_text())
asset = optimized.read_bytes()
if len(asset) > 3_000_000:
    raise RuntimeError('Asset exceeds the 3MB scene budget')
metadata.update(
    assetBytes=len(asset), assetSha256=hashlib.sha256(asset).hexdigest(),
    compression='EXT_meshopt_compression', optimizerVersion='@gltf-transform/cli 4.2.1',
    positionQuantizationBits=16, blosmCommit='4adff00270f4492667f3bf1305d0b338f3cd1268',
    bakedAt='2026-10-25',
)
output.mkdir(parents=True, exist_ok=True)
shutil.copy2(optimized, output / metadata['asset'])
shutil.copy2(raw_metadata.with_name(metadata['topdown']), output / metadata['topdown'])
encoded = json.dumps(metadata, indent=2) + '\n'
(output / 'scene-meta.json').write_text(encoded, encoding='utf-8')
# Canonical import lives in src to comply with Vite's public-asset boundary.
(Path(__file__).resolve().parent.parent / 'scene-meta.json').write_text(encoded, encoding='utf-8')
print('PUBLISHED', len(asset), 'bytes,', metadata['triangleCount'], 'triangles')
