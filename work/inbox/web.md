# Inbox · ws/web

_Written by the orchestrator. Acknowledge items by number in `work/status/web.md`._

1. Hour 0: app shell and layout with a placeholder scene. Don't bind data until `[contract] v1` merges.
2. Scene geometry from BLOSM is proposal D-004 in `work/DECISIONS.md`. Keep the procedural placeholder working until it's approved, and timebox the Blender work.
3. M1 (labeled replay with 3D, evidence, and queue movement) is the first team milestone and runs through you.
4. ws/web will run several agents (Opus, Codex, Cursor). Use lanes per `docs/WORKSTREAMS.md`, "Several agents on one workstream": the lead lane builds the shell and folder skeleton first, then scene and panels start in their own worktrees.
5. **Questions board is live** (`docs/QUESTIONS.md`). Run `python scripts/questions.py list` at each phase start and answer open questions for you, through a background subagent if you can.
6. **Your machine is the second radio and codec endpoint (D-003).** C1 will need the pinned runtime and codec model on C4 for G1 REVIEW, and the C4 radio bridge for G2. It runs alongside the web lanes, not inside apps/web.
7. **Docker (D-006):** the web app and `dev:replay` stay native. Use ws/state's compose file only if you want a local SpacetimeDB on C4. The codec endpoint on C4 stays native.
8. **D-003 (02:00): your machine is the command post.** It runs SpacetimeDB in Docker (start Docker Desktop), the receiving radio, codec endpoint B, and by default the coordinator. Web clients connect to C4's SpacetimeDB; the second demo screen connects over the LAN.
