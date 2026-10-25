# apps/web

**Owner:** ws/web (Windows laptop) · **Areas:** 3D scene and heatmap, queue and history UI, resilience replay, e2e · **Spec:** §5, §7, §10, §20 queue and history, 3D scene and heatmap, resilience

The React/Three.js dashboard and the isolated browser replay.

- **Left:** one scene with selectable incident markers and a toggle to the elevated heatmap. Placeholder first; baked scene per `SCENE_PIPELINE.md`.
- **Right, collapsible:** incoming reports, pinned review band, confirmed incident queue, and the selected incident's history and proposals.
- **Mode banner:** LIVE / LOCAL DEGRADED / LOCAL REPLAY, with source and inference provenance shown separately (§10).
- Written labels with every color, keyboard support, and a 2D fallback if WebGL fails.
- **No client-side truth mutation.** All changes go through the adapter. No secrets, no external tiles or fonts, no chat or voice.

Replay uses the same adapter interface as live (`packages/domain`), labels every output `fixture` or `recording`, and can never write into live state after a reconnect (resilience).
