/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SCENE_METADATA } from './georeference';
import { heatmapGeometry } from './valley';
import { HEATMAP_BASE, HEATMAP_HEIGHT_SCALE } from './model';
import { incident } from './fixtures.test-support';

describe('bundled BLOSM model', () => {
  it('stays within the asset budget and matches its metadata fingerprint', () => {
    expect(JSON.parse(readFileSync(resolve('public/scene/scene-meta.json'), 'utf8'))).toEqual(SCENE_METADATA);
    const bytes = readFileSync(resolve('public/scene/bay-area.glb'));
    expect(bytes.byteLength).toBeLessThan(3_000_000);
    expect(bytes.byteLength).toBe(SCENE_METADATA.assetBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SCENE_METADATA.assetSha256);
    const length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
    expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    expect(json.images ?? []).toHaveLength(0);
  });

  it('decodes locally and preserves Blender-to-glTF place anchor axes', async () => {
    const bytes = Uint8Array.from(readFileSync(resolve('public/scene/bay-area.glb'))).buffer;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, '');
    gltf.scene.updateMatrixWorld(true);
    for (const [name, x, z] of [['school', 0, 0], ['residence', 80, 20], ['shelter', -120, 40]] as const) {
      // Three sanitizes glTF names; original name lives in userData.name.
      let anchor: { position: Vector3 } | null = null;
      gltf.scene.traverse((object) => {
        if (object.userData.name === `place:${name}` || object.name === `place${name}` || object.name === `place_${name}`) {
          anchor = { position: object.getWorldPosition(new Vector3()) };
        }
      });
      expect(anchor, `missing ${name} anchor`).not.toBeNull();
      const position = (anchor as unknown as { position: Vector3 }).position;
      expect(position.x).toBeCloseTo(x, 4);
      expect(position.y).toBeCloseTo(0, 4);
      expect(position.z).toBeCloseTo(z, 4);
    }
  });
});

describe('rendered heatmap mesh', () => {
  it('uses the same fixed density heights as the rule at known vertices', () => {
    const geometry = heatmapGeometry([incident()]);
    try {
      const vertices = geometry.getAttribute('position');
      let center = -1, distant = -1;
      for (let index = 0; index < vertices.count; index++) {
        if (vertices.getX(index) === 0 && vertices.getZ(index) === 0) center = index;
        if (vertices.getX(index) === -350 && vertices.getZ(index) === -250) distant = index;
      }
      expect(center).toBeGreaterThanOrEqual(0);
      expect(vertices.getY(center)).toBe(HEATMAP_BASE + HEATMAP_HEIGHT_SCALE);
      expect(vertices.getY(distant)).toBe(HEATMAP_BASE);
      expect(HEATMAP_BASE).toBeGreaterThan(SCENE_METADATA.terrainMaxY);
    } finally { geometry.dispose(); }
  });
});
