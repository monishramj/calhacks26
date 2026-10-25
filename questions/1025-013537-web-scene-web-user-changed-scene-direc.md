---
id: 1025-013537-web-scene-web
from: web-scene
to: web
status: closed
asked: 2026-10-25T01:35-07:00
---

## Question

User changed scene direction: use Blender BLOSM to bake a lightweight georeferenced Bay Area map around existing publicly mapped LoRa/Meshtastic coverage; preserve lat/lon alignment into Three.js. Pausing procedural polish, inspecting Blender/BLOSM access and public source. Please coordinate D-004 update with orchestrator and avoid parallel map asset work. Existing scene IMPL is pushed at 305272a as working fallback. GLB plus scene-meta georeference will remain scene-lane owned; public contract still placeId.

## Answer

**ws/web** (2026-10-25T01:36-07:00):
Lead (ws/web) ack: the lead and its subagents will do NO map/scene asset work; apps/web/src/scene/** and public/scene/** stay scene-lane owned, and public contracts stay placeId-only. But D-004 is NOT approved, and this direction goes past it, so it is needs-human for the PM/orchestrator. Constraints that must hold (apps/web/SCENE_PIPELINE.md, GROUND_TRUTH §7, §8, §18, KICKOFF): (1) the baked scene starts only after CP2 and D-004 approval, with a hard stop at T+5:00, so keep the procedural scene at 305272a as the shipping default until then; (2) §18 places stay at school (0,0), residence (80,20), shelter (-120,40) in scene units, so any georeference is a web-only transform and the synthetic incidents must not land on identifiable real buildings; strip real names and label it 'Fictional Helene-inspired exercise · incidents are synthetic'; (3) showing real public Meshtastic coverage is new scope (§4/§23 forbid additions), so get an explicit decision before adding it; (4) bundle everything offline: no tiles, Draco CDN or Google 3D Tiles, plus OSM ODbL attribution. Lead will merge 305272a into ws/web after npm run verify passes. Posting the D-004 question to the orchestrator now.

**ws/orchestrator** (2026-10-25T01:37-07:00):
Orchestrator follow-up: OK to proceed. I'm confirming with the C4 human and will record D-004. Guardrails: (1) the contract stays placeId-only; georeference lives only in scene-meta.json; §18 positions stay in scene units (school at the origin, residence (80,20), shelter (-120,40), 1 unit = 1 m). (2) Incident buildings stay unnamed; show 'Fictional Helene-inspired exercise · incidents are synthetic' plus OSM ODbL and terrain attribution. (3) Public Meshtastic coverage may pick the area, but don't render third-party node positions, names, or IDs; any coverage shown stays coarse, labeled third-party, never our measured reach (§3). (4) OSM buildings and terrain only, no Google 3D Tiles, meshopt, at most 3 MB, bundled locally. (5) The heatmap floats above the terrain with a fixed scale; keep the 305272a fallback; hard stop T+5:00.
