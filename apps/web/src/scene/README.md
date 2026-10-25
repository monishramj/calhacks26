# Scene

The default basemap is an offline BLOSM bake of a 700 x 500 m crop of the San Francisco waterfront. D-004 approved it. The app fetches no tiles, external fonts, Google imagery, third-party radio node positions, or model results. The three exercise sites are synthetic generic boxes placed over the geography. They are not claims about real buildings.

## Geographic alignment

`scene-meta.json` records:

- the BLOSM origin (37.79545, -122.3949);
- its spherical transverse-Mercator projection (radius 6378137 m, scale factor 1);
- the crop bounds and elevation origin;
- versions, sources, fingerprints, and Python golden coordinates.

Blender uses `(east, north, altitude)`. The Y-up GLB export produces Three coordinates `(east, altitude, south)`. Do not center, rescale, or rotate the model separately from the markers. One scene unit is one meter. `georeference.ts` provides the forward and inverse transforms. Public contracts remain `placeId` only.

The places stay at school (0,0), residence (80,20), and shelter (-120,40). The incident button's tooltip shows its **synthetic anchor** latitude and longitude. Unknown places stay unplaced. The round-trip tests check the computation only. They do not show the survey accuracy of OSM or of the roughly 30 m source elevation grid. Missing building heights use BLOSM's default building levels. Footprints come from OSM. No real place names are exported.

## Assets and how to rebuild them

Public files: `public/scene/bay-area.glb`, `topdown.png`, and `scene-meta.json`. The copy of the metadata in this folder must equal the public copy. The integrity test checks this. `tools/finalize_asset.py` writes both together.

The bake tools run **outside the frontend**. Keep source extracts and caches outside git.

1. Use official Blender 4.5.15 LTS and the official `vvoovv/blosm` release commit `4adff00270f4492667f3bf1305d0b338f3cd1268` (BLOSM 2.7.28). Load the add-on only into the background Blender process. No preferences are saved.
2. Download the OSM API bbox `-122.3990,37.7929,-122.3908,37.7980`. The metadata records the SHA-256 of the original extract. The terrain is BLOSM's Skadi source (`elevation-tiles-prod`, N37W123). You need the network only for this step.
3. Prepare the shoreline with `python tools/prepare_water.py ADDON_PARENT OSM_FILE WATER_JSON`. This uses Shapely 2.1.2 and BLOSM's own projection code.
4. Run Blender with the command below. The crop is clipped in projected coordinates, and the terrain is intersected with the OSM shoreline. Shapely must match Blender's Python (3.11 for this bake). The exporter removes real object names, cameras, lights, animation, and extras. The orthographic PNG covers the same bounds as the GLB, with north at the top.
   ```text
   blender --background --factory-startup --python-exit-code 1 --python tools/bake_blosm.py -- --addon-parent ADDON_PARENT --cache CACHE --osm OSM_FILE --water WATER_JSON --geo-libs SHAPELY_FOR_BLENDER --textures TEXTURE_PACKS --output STAGING_DIR
   ```
5. Optimize the GLB. This keeps the world frame and the named place anchors. The decoder is bundled from Three. Draco and CDN decoders are not used.
   ```text
   npx --yes @gltf-transform/cli@4.2.1 meshopt STAGING_DIR/bay-area.glb OPTIMIZED_GLB --quantize-position 16
   ```
6. Finalize. This updates the asset fingerprint, both metadata copies, the GLB, and the fallback PNG.
   ```text
   python tools/finalize_asset.py STAGING_DIR/scene-meta.json OPTIMIZED_GLB PUBLIC_SCENE_DIR
   ```

The textured asset is about 1.8 MB and 10,023 triangles. The metadata holds the complete crop, the source and bake versions, and the exact byte count. Do not commit a `.blend` file, model weights, or source extracts.

## Behavior and checks

`Scene` uses `useDesk()` and a controlled selection. Optional scene-only input props support tests. If there is no adapter, the scene does not substitute fixtures. Native buttons and a written list of unplaced places work with the keyboard. Switching to 2D keeps the selection. If WebGL fails to start, the renderer fails, or the context is lost, the 2D map is shown. If the GLB fails to load, the procedural geometry stays and the fallback is labeled.

The elevated heatmap mesh uses a compact cosine kernel with a fixed 45 m radius. Each incident adds a fixed 14 scene units of height. The base height is 24 units above the highest terrain. Each distinct OPEN located confirmed incident adds one unit at its center. Linked report volume, attention, and confidence never change the height. The legend does not normalize against the current maximum. Buildings dim in heatmap mode.

Run these from `apps/web`:

```text
npm test
npm run typecheck
npm run test:e2e
npx playwright test --config src/scene/tools/playwright.config.ts
npm run build
```

The scene browser suite uses its own port (5182). The lead suite uses 5174 and the preview uses 5181. The suite tests real browser 3D and 2D selection, keyboard use, induced context loss, and WebGL being unavailable at startup. The Node-only asset tests need the pinned `@types/node`, which the lead package owner supplies.

Attribution: Map data © OpenStreetMap contributors (ODbL). Elevation from Mapzen terrain tiles (Skadi). Public BayMesh coverage informed the crop selection only.

## Generic facade materials

The user approved generic free materials. They are not photographs of the San Francisco buildings. Download ambientCG Facade001, Facade003, and RoofingTiles006 as 1K-JPG packs. Extract each one to `TEXTURE_PACKS/<assetId>/` and pass `--textures` to the bake. All three are CC0-1.0: https://docs.ambientcg.com/license/ . The scene metadata holds their source URLs, the SHA-256 hashes of the unchanged color JPEGs, their dimensions, and the license. Only albedo images are embedded. A scalar roughness value avoids extra texture memory.

Connected building components get one of two window materials. UVs in world meters repeat a facade over 24 m horizontally and 30 m vertically, so window scale stays consistent. Sloped roofs use the roof texture. Flat roofs keep the map palette. The old BLOSM UV sets and vertex colors are removed from buildings, so they cannot override or darken the new materials. The geometry and projection are unchanged. The 2D image is rendered from the same bake with Eevee and local lighting. The GLB holds the JPEGs as embedded buffer views, so no runtime asset service is needed.

The asset tests check the embedded images and the meshopt geometry separately. jsdom uses a texture placeholder only for the geometry and anchor test. The real browser test waits for all three 1024 x 1024 JPEGs to decode and checks that the renderer did not fall back. The scene selection test rejects external requests but allows local blob URLs created from GLB buffer views. The production build still warns about the size of the existing lazy Three renderer chunk.
