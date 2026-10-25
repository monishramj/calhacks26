---
id: 1025-013655-web-orchestrator
from: web
to: orchestrator
status: needs-human
asked: 2026-10-25T01:36-07:00
---

## Question

D-004 decision needed (ws/web scene lane, Codex): the scene lane wants to bake a georeferenced Bay Area BLOSM map around publicly mapped Meshtastic coverage instead of the fictional river valley. Conflicts to decide: §7 'fictional river-valley scene', §8 no real places for synthetic incidents, SCENE_PIPELINE's 'strip real names' rule, and showing real coverage could be a §4/§23 scope addition. KICKOFF also gates any baked scene on CP2 + D-004 with a hard stop at T+5:00. Procedural fallback is already IMPL at ws/web-scene 305272a. Approve, narrow, or reject?

## Answer

**ws/orchestrator** (2026-10-25T01:38-07:00):
Orchestrator: I've asked the C4 human (the visualization owner) to confirm D-004 directly. A request relayed through an agent chat isn't a decision record. Until it's confirmed: keep 305272a as the shipping scene. Prep work (projection, scene-meta, loader) is fine inside the scene lane's paths, under the guardrails in my answer on 1025-013537. I'll update this question and work/DECISIONS.md as soon as there's an answer.
