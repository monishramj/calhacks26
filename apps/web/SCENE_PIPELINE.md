# Scene pipeline: BLOSM bake → glTF → Three.js

**Owner:** ws/web (C4) · **Status:** proposal D-004 in `work/DECISIONS.md` (not approved yet) · **Spec:** §7, §18, G7

Goal: a better-looking but still lightweight left-hand scene. Blender + BLOSM bake the geometry **once, offline** into a static `.glb` that's bundled with the app. Nothing loads from the network at runtime, so replay stays fully offline (§7, §10).

## Ground-truth constraints this must respect

- **Data contracts don't change.** Reports and incidents carry `placeId` only. Scene positions are a web-only lookup.
- **§18 coordinates stay true.** `school (0,0)`, `residence (80,20)`, `shelter (-120,40)` in scene units. Use 1 unit = 1 m, with §18 `(a, b)` mapping to Three.js `(x=a, y=0, z=b)`.
- **Heatmap height isn't terrain.** Height = confirmed open located incident concentration with a fixed scale (§7). Real terrain relief next to a heatmap is easy to misread. Keep the crop mostly flat, render the heatmap as a separate translucent surface floating above the highest terrain point, and dim the buildings in heatmap mode. Keep the legend.
- **"Fictional exercise" stays honest.** §7 says "fictional river-valley scene." Real geometry is fine only if the place is **not** associated with Helene (no western NC or east TN towns). Strip real names and label the scene "Fictional Helene-inspired exercise · incidents are synthetic." Otherwise a fictional "person may be upstairs" lands on a real school in a real disaster town, which is exactly what §8 forbids. This is why D-004 needs sign-off.
- **2D fallback** when WebGL fails (G7).

## Build order (don't let Blender block G7)

1. G7 TEST and IMPLEMENT against a **procedural placeholder:** ground plane, three box clusters at the §18 coordinates, a flat blue river strip. Markers and heatmap read place positions from one lookup.
2. Bake the BLOSM scene in parallel. **Timebox: 90 minutes.**
3. Swap `PlaceholderScene` for `BakedScene`. Markers and heatmap don't change because they use the same lookup.
4. If the bake isn't ready by M1, ship the placeholder. Camera and scene polish are the first cuts (§23).

## Bake steps

1. **Pick the area** (~400 × 300 m): a school-sized building, a house ~80 m away, a larger building ~125 m away, and a river. Not a Helene-affected place.
2. **Blender 4.x + BLOSM:** import **OSM** (buildings, water) and **Terrain**. Skip Google Photorealistic 3D Tiles. Google's Map Tiles terms restrict storing or exporting that content and require live attribution, and the meshes are heavy textured photogrammetry, so they're the wrong fit for a bundled offline asset.
3. **Clean up:** delete roads and labels you don't need. Join buildings into one mesh. Decimate terrain to ~10–20k triangles. Use 3–4 flat vertex-color materials (ground, buildings, water, highlighted place buildings). Apply transforms, and put the school at the origin.
4. **Place empties** named `place:school`, `place:residence`, `place:shelter`, `marker:command` at the §18 positions; scale or rotate the scene so the right buildings sit under them. Three.js reads empties by name and falls back to the §18 coordinates if one is missing.
5. **2D fallback image:** render a top-down orthographic PNG with the same framing (1024–2048 px) and save its ortho bounds, so SVG markers line up in the WebGL-off view.
6. **Export** glTF Binary (`.glb`), +Y up, modifiers applied, no cameras, lights, or animation. Lighting lives in Three.js.
7. **Optimize:** `npx @gltf-transform/cli optimize valley-raw.glb valley.glb --compress meshopt`. Target ≤ 3 MB and ≤ 100k triangles.

## Loading in Three.js

- `GLTFLoader` + `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`). It's bundled JS, so it works offline.
- **Avoid Draco** unless you host its decoder files locally. drei's `useGLTF` fetches the Draco decoder from a CDN by default, which breaks offline replay.
- With react-three-fiber, use `frameloop="demand"` and cap DPR at ~1.5. Measure 30 FPS on the actual demo laptop (§13).

## What gets committed

```text
apps/web/public/scene/valley.glb          optimized bake
apps/web/public/scene/topdown.png         2D fallback
apps/web/public/scene/scene-meta.json     bbox, scale, ortho bounds, BLOSM version, bake date, data sources
```

`.blend` files stay out of git (ignored). Keep the source file on a shared drive.

**Attribution:** show "Map data © OpenStreetMap contributors (ODbL)" plus the terrain source BLOSM used, in a corner of the scene.

## Fallback without Blender

Fetch one Overpass extract as GeoJSON, then have a small Node script extrude the footprints with Three.js and write a `.glb` with `GLTFExporter`. It's less pretty but reproducible, and needs no GUI.
