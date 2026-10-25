# Scene lane

The default basemap is an offline BLOSM bake of a 700 × 500 m SF waterfront crop,
approved in D-004. No tiles, external fonts, Google imagery, third-party radio
node positions, or model results are fetched. The three exercise sites are
synthetic generic boxes over the geography, not claims about real buildings.

## Geographic alignment

`scene-meta.json` records the BLOSM origin (37.79545, -122.3949), its spherical
transverse-Mercator projection (radius 6378137 m, scale factor 1), crop bounds,
elevation origin, versions, sources, fingerprints, and Python golden coordinates.
Blender uses `(east, north, altitude)`; Y-up GLB export produces Three coordinates
`(east, altitude, south)`. Do not center, rescale, or rotate the model independently
of the markers. One scene unit is one meter. `georeference.ts` provides the forward
and inverse transforms. Public contracts remain placeId-only.

School remains (0,0), residence (80,20), shelter (-120,40). The incident button's
tooltip reports its **synthetic anchor** latitude/longitude. Unknown places stay
unplaced. Computational round-trip tests do not establish survey accuracy of OSM
or the roughly 30 m source elevation grid. Missing building heights use BLOSM's
default building levels; footprints come from OSM. No real place names are exported.

## Assets and reproduction

Public artifacts: `public/scene/bay-area.glb`, `topdown.png`, `scene-meta.json`.
The imported metadata copy in this folder must equal the public copy; the integrity
test enforces this. `tools/finalize_asset.py` writes both together.

Bake tools run **outside the frontend**, with source extracts/caches outside git:

1. Use official Blender 4.5.15 LTS and official `vvoovv/blosm` release commit
   `4adff00270f4492667f3bf1305d0b338f3cd1268` (BLOSM 2.7.28). The add-on is loaded
   only into the background Blender process; no preferences are saved.
2. Download the OSM API bbox `-122.3990,37.7929,-122.3908,37.7980`. The original
   extract's SHA-256 is recorded in the metadata. Terrain is BLOSM's Skadi source
   (`elevation-tiles-prod`, N37W123). Network is needed only for this preparation.
3. Prepare the shoreline with `python tools/prepare_water.py ADDON_PARENT OSM_FILE WATER_JSON`.
   This uses Shapely 2.1.2 and BLOSM's own projection implementation.
4. Run Blender with `--background --factory-startup --python-exit-code 1 --python
   tools/bake_blosm.py -- --addon-parent ADDON_PARENT --cache CACHE --osm OSM_FILE
   --water WATER_JSON --geo-libs SHAPELY_FOR_BLENDER --textures TEXTURE_PACKS --output STAGING_DIR`.
   The crop is clipped in projected coordinates, and the terrain is intersected
   with the OSM shoreline. Shapely must match Blender's Python (3.11 on this bake).
   The exporter removes real object names, cameras, lights, animation, and extras.
   The orthographic PNG covers the same bounds as the GLB, north at the top.
5. `npx --yes @gltf-transform/cli@4.2.1 meshopt STAGING_DIR/bay-area.glb OPTIMIZED_GLB --quantize-position 16`.
   This preserves the world frame and named place anchors. The decoder is bundled
   from Three; Draco/CDN decoders are not used.
6. `python tools/finalize_asset.py STAGING_DIR/scene-meta.json OPTIMIZED_GLB PUBLIC_SCENE_DIR`.
   It updates the asset fingerprint, both metadata copies, GLB and fallback PNG.

The textured asset is about 1.8 MB / 10,023 triangles. The complete crop, source/bake versions
and exact byte count live in the metadata. No `.blend`, model weights, or source
extracts belong in git.

## Behavior and checks

`Scene` consumes `useDesk()` and controlled selection. Optional scene-only input
props support tests; an absent adapter does not substitute fixtures. Native buttons
and a written unplaced list work with keyboard input. The 2D switch preserves
selection. WebGL startup failure, renderer failure, or context loss shows the 2D map;
GLB failure preserves procedural geometry and explicitly labels the fallback.

The elevated mesh uses a compact cosine kernel, fixed 45 m radius, fixed 14 scene
units of height per incident, and base height 24 units above the highest terrain.
Each distinct OPEN located confirmed incident contributes one unit at its center.
Linked report volume, attention, and confidence never affect height. The legend
does not normalize against current maxima. Buildings dim in heatmap mode.

From `apps/web`:

```text
npm test
npm run typecheck
npm run test:e2e
npx playwright test --config src/scene/tools/playwright.config.ts
npm run build
```

The scene browser suite has its own port (5182), separate from the lead suite
(5174) and the preview (5181). It tests actual browser 3D/2D selection, keyboard
use, induced context loss, and unavailable WebGL at startup. Node-only asset tests
need pinned `@types/node` supplied by the lead package owner.

Attribution: Map data © OpenStreetMap contributors (ODbL), elevation from Mapzen
terrain tiles (Skadi). Public BayMesh coverage informed crop selection only.


## Generic facade materials

The user approved generic free materials. These are not photographs of the SF
buildings. Download ambientCG Facade001, Facade003, and RoofingTiles006 as 1K-JPG
packs, extract each to TEXTURE_PACKS/<assetId>/, and pass --textures to the bake.
All three are CC0-1.0: https://docs.ambientcg.com/license/ . Their source URLs,
unchanged color JPEG SHA-256 hashes, dimensions and license are in scene metadata.
Only albedo images are embedded; scalar roughness avoids extra texture memory.

Connected building components receive one of two window materials. World-meter
UVs repeat a facade over 24 m horizontally and 30 m vertically, keeping window
scale consistent. Sloped roofs use the roof texture; flat roofs retain the map
palette. Old BLOSM UV sets and vertex colors are removed from buildings so they
cannot override or darken the new materials. Geometry/projection are unchanged.
The 2D image is rendered from the same bake using Eevee and local lighting.
The GLB contains embedded JPEG buffer views, with no runtime asset service.

Asset tests verify the embedded images and meshopt geometry separately; jsdom
uses a texture placeholder only for the geometry/anchor test. The real browser
test waits for all three 1024 x 1024 JPEGs to decode, checks no renderer fallback,
and the scene selection test rejects external requests while allowing local blob
URLs created from GLB buffer views. The production build still warns about the
size of the existing lazy Three renderer chunk.
