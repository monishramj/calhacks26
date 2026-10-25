# Scene

The basemap is a 1280 x 940 m crop of the Outer Sunset, San Francisco, from OpenStreetMap. It is bundled as `sunset.json` (about 330 KB) and drawn in Three.js at runtime: extruded building footprints, a painted ground texture (streets, parks, beach), an animated ocean, trees and parked cars. The app fetches no tiles, fonts or imagery. The three exercise sites are synthetic, with generic labels, placed on real houses. They are not claims about those buildings.

## Coordinates

One scene unit is one metre: x east, y up, z south. The origin is the centroid of the school building in the crop, so the spec positions hold exactly: school (0, 0), residence (80, 20), shelter (-120, 40). The residence and shelter use the buildings nearest those points (within about 16 m). `georeference.ts` converts between scene metres and latitude/longitude with a local equirectangular projection around `sunset.json`'s origin. Public contracts stay `placeId` only.

## Rebuild the map data

1. Download one Overpass export: `way[building|highway|natural|leisure|landuse]` in bbox `37.7535,-122.5135,37.7615,-122.4985` with `out geom tags`. Keep it outside git. `sunset.json` records its SHA-256.
2. Run `python3 tools/build_sunset.py OVERPASS_JSON src/scene/sunset.json` from `apps/web`.

Building heights use `building:levels` when OSM has it, and otherwise a stable per-building height for a typical two-storey house over a garage.

## Views and heatmap

- **3D:** Overview, Top and Selected camera views. Selecting an incident flies the camera to it. Drag to orbit, right-drag to pan, scroll to zoom.
- **2D:** an SVG map drawn from the same data and coordinates. It is shown when WebGL is unavailable or the context is lost, and the selection is kept.
- **Heatmap:** draped on the ground as a colour layer, with an optional raised translucent surface. Each OPEN located confirmed incident adds one unit at its centre with a cosine falloff over a fixed 60 m radius. The raised surface adds a fixed 30 m per unit. Repeated reports, attention and confidence never change the height. The legend scale is fixed (0 to 3+) and is never normalised to the current maximum.

## Checks

From `apps/web`: `npm test`, and `npx playwright test --config src/scene/tools/playwright.config.ts` for the browser suite (port 5182).

Attribution: Map data © OpenStreetMap contributors (ODbL).
