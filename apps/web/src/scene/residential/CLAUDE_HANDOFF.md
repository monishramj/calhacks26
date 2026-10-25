# Claude handoff: residential BLOSM scene

The human asked to move the old waterfront visualization to a residential Bay Area
setting, make it visually striking, then hand creative direction to Claude. They
explicitly asked for sparse trees, readable houses/streets, and no dense canopy.

## What is ready

Branch `ws/web-residential`, based on current main d3d3a1a. The current dashboard's
Outer Sunset scene is preserved. This is a separate working BLOSM candidate with
an interactive preview, ready for art direction and deliberate integration.

- Preview: `/src/scene/residential/preview.html` on the web Vite server.
- GLB: `public/scene/residential/montclair.glb` (about 395 KB, meshopt).
- North-up fallback: `public/scene/residential/topdown.png`.
- Exact metadata: `src/scene/residential/metadata.json` and matching public copy.
- Bake: `src/scene/residential/bake_blosm.py` using official BLOSM 2.7.28 / Blender
  4.5.15. Source extracts/tool cache live outside git in sibling
  `calhacks26-scene-assets`; source OSM hash is in metadata.

## Visual brief

Make a small neighborhood diorama, with houses as the hero. Real winding streets,
low homes, warm stucco, slate roofs, quiet green yards, warm sun/cool shadows.
The current candidate avoids the noisy office-window textures from the old SF
scene. Small crisp silhouettes and restrained building outlines are preferable
to wallpaper-like facades. Improve roof shape/material variation, daylight,
composition, and marker typography before adding detail.

Only 55 small authored trees over 700 x 500 m, spaced at least 24 m apart and kept
25 m away from the exercise anchors. The preview has a tree toggle. Keep their
canopies small; no forest carpet and no hiding streets or incidents. Trees are
illustrative landscaping, not OSM-surveyed locations. No texture API, Google tiles,
CDN decoder, or extra model download is needed at runtime.

## Coordinate rules (critical)

Montclair origin latitude37.8291 longitude-122.2046. BLOSM spherical transverse
Mercator, radius6378137, scale1. One unit = one meter. Blender(east,north,up) exports
as glTF/Three(east,up,south). Crop x[-350,350], z[-250,250]. Do NOT independently
center, rotate or scale this asset. Metadata includes forward-projection golden
coordinates, terrain vertical origin, and terrain heights for the exercise sites.

Keep school(0,0), residence(80,20), shelter(-120,40). They are fictional exercise
anchors; none of the actual residential buildings is being identified as a victim.
The preview pins use sampled terrain heights. The current production Outer Sunset
renderer uses a DIFFERENT equirectangular origin/projection and a larger extent.
Never drop this GLB under Sunset markers or its simulated radio geometry without
converting every overlay through a single selected-basemap coordinate adapter.
The scene asset should be selected as a whole with its metadata and 2D fallback.

## Honest labels / integration

Three preview markers and optional fixed-radius translucent density samples are
AUTHORED illustrations, not live incidents, flood heights, severity, or RF coverage.
Map footprints/elevation are real source data; default building heights/colors,
landscaping and exercise locations are approximate/authored. No private radio
node coordinates or IDs are included. BayMesh maps show node reports, not proof
of neighborhood coverage: https://bayme.sh/map/ .

Do not touch live adapters, backend, queue, inference or approvals as part of the
art pass. Preserve controlled incident selection, actual report provenance,
placeId contracts, fixed-scale heatmap semantics and aligned 2D fallback when
integrating. The human requested a visual handoff; no background machine-readiness
or codec work has resumed, and the old recurring automation remains paused.

## Quick run

From repository root: `npm ci`. From apps/web: `npx vite --host 127.0.0.1 --port 5186`.
Open `http://127.0.0.1:5186/src/scene/residential/preview.html`.
Existing app remains at `/`. This study is a Vite development entry, not yet part
of the production build's HTML entrypoints. Integrate its scene component into
the production app deliberately after visual review.

## Sources

OSM source bbox -122.2098,37.8255,-122.1994,37.8327 via OSM API. Attribution:
OpenStreetMap contributors (ODbL); elevation from Mapzen/Skadi via BLOSM.
Montclair's residential/hillside setting is described by Visit Oakland:
https://www.visitoakland.com/things-to-do/neighborhoods/montclair-hills/ .

## Validation at handoff

Actual Windows Edge WebGL preview rendered with zero page errors. Perspective,
top view, density and sparse-tree toggle exercised. Metadata copies/hash/budget,
meshopt requirement, embedded buffer and named anchor checks pass. Typecheck and
production app build pass; existing large-chunk advisories remain. The dashboard
was intentionally preserved and this study is not yet integrated into it.


## Road fix - latest handoff

Use the latest branch head, not the first preview commit038196e. Roads are now
sampled against the FINAL clipped terrain triangles (the original non-planar
BLOSM quads did not match the rendered surface). Roads are subdivided to 4 m
edges, placed 1.15 m above that mesh, and given a 1.3 m slab extending downward.
Out-of-terrain edge vertices are removed. This prevents both the original floating
roads and the subsequent surface/terrain flicker. This is illustrative roadway
thickness, not surveyed pavement elevation. Geographic x/z coordinates stay fixed.

The GLB is now about395 KB / 46543 triangles. Exact values and per-road face-center
sampling differences are in metadata.json. Worst sampled deviation from the target
road offset is under0.75 m, within the top clearance. Browser perspective and top
views checked after the fix, zero page errors; visible roads remain continuous.
The refreshed screenshot is in the human's outputs/montclair-residential.png.
Claude should continue visual styling/integration from this corrected asset.
