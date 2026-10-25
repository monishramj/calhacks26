# apps/web

**Spec:** §5, §7, §10, §20 queue and history, 3D scene and heatmap, resilience

This is the React/Three.js dashboard and the isolated browser replay.

- **Left:** one scene with selectable incident markers and a toggle to the elevated heatmap. A placeholder scene comes first. The baked scene follows `SCENE_PIPELINE.md`.
- **Right (collapsible):** incoming reports, the pinned review band, the confirmed incident queue, and the selected incident's history and proposals.
- **Mode banner:** LIVE, LOCAL DEGRADED, or LOCAL REPLAY. Source and inference provenance are shown separately (§10).
- Every color has a written label. Controls work with the keyboard. A 2D fallback is shown if WebGL fails.
- **No client-side change to truth.** All changes go through the adapter. No secrets, no external tiles or fonts, no chat or voice.

Replay uses the same adapter interface as live (`packages/domain`). It labels every output `fixture` or `recording`. After a reconnect it can never write into live state (resilience).
