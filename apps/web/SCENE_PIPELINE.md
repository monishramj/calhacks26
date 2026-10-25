# Scene pipeline: BLOSM bake to glTF to Three.js

**Status:** proposal D-004 (not approved yet) · **Spec:** §7, §18, 3D scene and heatmap

Goal: a better-looking but still lightweight scene on the left. Blender and BLOSM bake the geometry **once, offline** into a static `.glb` file that is bundled with the app. Nothing loads from the network at runtime, so replay stays fully offline (§7, §10).

## Constraints from the spec

- **Data contracts do not change.** Reports and incidents carry `placeId` only. Scene positions are a web-only lookup.
- **The §18 coordinates stay true.** `school (0,0)`, `residence (80,20)`, and `shelter (-120,40)` in scene units. Use 1 unit = 1 m. Map §18 `(a, b)` to Three.js `(x=a, y=0, z=b)`.
- **Heatmap height is not terrain.** Height is the concentration of confirmed open located incidents, on a fixed scale (§7). Real terrain relief next to a heatmap is easy to misread. Keep the crop mostly flat. Render the heatmap as a separate translucent surface above the highest terrain point. Dim the buildings in heatmap mode. Keep the legend.
- **"Fictional exercise" stays honest.** §7 says "fictional river-valley scene." Real geometry is fine only if the place is **not** associated with Helene (no western NC or east TN towns). Remove real names. Label the scene "Fictional Helene-inspired exercise · incidents are synthetic." Otherwise a fictional "person may be upstairs" lands on a real school in a real disaster town, which §8 forbids. This is why D-004 needs sign-off.
- **2D fallback** when WebGL fails (3D scene and heatmap).

## Build order (do not let Blender block the 3D scene and heatmap)

1. Build and test the 3D scene and heatmap against a **procedural placeholder**: a ground plane, three box clusters at the §18 coordinates, and a flat blue river strip. Markers and heatmap read place positions from one lookup.
2. Bake the BLOSM scene in parallel. **Time limit: 90 minutes.**
3. Swap `PlaceholderScene` for `BakedScene`. Markers and heatmap do not change, because they use the same lookup.
4. If the bake is not ready by M1, ship the placeholder. Camera and scene polish are the first things to cut (§23).

## Bake steps

1. **Pick the area** (about 400 x 300 m): a school-sized building, a house about 80 m away, a larger building about 125 m away, and a river. Do not pick a place Helene affected.
2. **Blender 4.x with BLOSM:** import **OSM** (buildings, water) and **Terrain**. Skip Google Photorealistic 3D Tiles. Google's Map Tiles terms restrict storing or exporting that content and require live attribution. The meshes are also heavy textured photogrammetry, so they are the wrong fit for a bundled offline asset.
3. **Clean up:** delete roads and labels you do not need. Join the buildings into one mesh. Decimate the terrain to about 10-20k triangles. Use 3-4 flat vertex-color materials (ground, buildings, water, highlighted place buildings). Apply transforms and put the school at the origin.
4. **Place empties** named `place:school`, `place:residence`, `place:shelter`, and `marker:command` at the §18 positions. Scale or rotate the scene so the right buildings sit under them. Three.js reads empties by name. It falls back to the §18 coordinates if one is missing.
5. **2D fallback image:** render a top-down orthographic PNG with the same framing (1024-2048 px). Save its ortho bounds, so SVG markers line up in the WebGL-off view.
6. **Export** glTF Binary (`.glb`) with +Y up, modifiers applied, and no cameras, lights, or animation. Lighting lives in Three.js.
7. **Optimize:** `npx @gltf-transform/cli optimize valley-raw.glb valley.glb --compress meshopt`. Target at most 3 MB and at most 100k triangles.

## Loading in Three.js

- Use `GLTFLoader` and `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`). It is bundled JS, so it works offline.
- **Avoid Draco** unless you host its decoder files locally. drei's `useGLTF` fetches the Draco decoder from a CDN by default, which breaks offline replay.
- With react-three-fiber, use `frameloop="demand"` and cap DPR at about 1.5. Measure 30 FPS on the actual demo laptop (§13).

## What gets committed

```text
apps/web/public/scene/valley.glb          optimized bake
apps/web/public/scene/topdown.png         2D fallback
apps/web/public/scene/scene-meta.json     bbox, scale, ortho bounds, BLOSM version, bake date, data sources
```

`.blend` files stay out of git (they are ignored). Keep the source file on a shared drive.

**Attribution:** show "Map data © OpenStreetMap contributors (ODbL)" and the terrain source BLOSM used, in a corner of the scene.

## Fallback without Blender

Fetch one Overpass extract as GeoJSON. Then use a small Node script to extrude the footprints with Three.js and write a `.glb` with `GLTFExporter`. It is less pretty but reproducible, and it needs no GUI.
