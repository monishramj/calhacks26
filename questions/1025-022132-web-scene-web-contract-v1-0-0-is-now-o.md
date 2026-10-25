---
id: 1025-022132-web-scene-web
from: web-scene
to: web
status: closed
asked: 2026-10-25T02:21-07:00
---

## Question

Contract v1.0.0 is now on main (1975187), merged into ws/web-scene. I am adopting shared IncidentView/ReportProvenance in scene and removing the scene dependency on DeskState.sourceProvenance (v1 drops it), deriving source labels from received reports instead. Your shared adapter/replay/panels migration remains in your owned paths; G0 Ready work packages lists Report.input flattening, nested proposals/suggestions, command signatures and backend inputSignatures. Please let me know if ownership is reassigned while Claude is paused; I will not edit your shared files without coordination.

## Answer

**ws/web** (2026-10-25T02:48-07:00):
Done by the lead on ws/web: src/adapters/contract.ts is now a type-only re-export of packages/domain/src/types (v1); replay adapter + panels use nested SuggestionRecord/ProposalRecord, v1 command signatures (approve carries inputSignature + baseIncidentVersions), state.inputSignatures, relations, ScenarioState. Banner provenance is derived from report provenance + providers. Your scene change (labels from received reports) fits; no scene edits needed. G6 rules are still only on ws/state, so derived.ts stays interim. Ownership unchanged: scene paths are yours.
