# fixtures/private

**Never model input.** Nothing in this folder may appear in a Laya or Claude context, a live-visible SpacetimeDB table, or the web bundle (§18).

| Folder | Owner | Contents |
|---|---|---|
| `exercise/` | ws/state, reviewed by a human | The §18 script R01–R12 with places, aliases, R11's earlier sent time, the authored starting state, and expected interpretations as private assertions. The scenario injector delivers events from here one at a time. |
| `heldout/` | PM (pitch role) | ≥24 held-out cases beyond the script (§13): paraphrase, hearsay, negation, rescue questions, partial all-clear, delayed old reports. Used only by `npm run evaluate`. |

Authored labels are reviewed exercise expectations, not clinical ground truth. These messages are synthetic and are never presented as historical Helene transcripts.
