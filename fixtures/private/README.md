# fixtures/private

**Never model input.** Nothing in this folder may appear in a Laya or Claude context, in a live-visible SpacetimeDB table, or in the web bundle (§18).

| Folder | Contents |
|---|---|
| `exercise/` | The §18 script R01–R12, with places, aliases, R11's earlier sent time, the authored starting state, and the expected interpretations as private assertions. A human reviews it. The scenario injector delivers events from here one at a time. |
| `heldout/` | At least 24 held-out cases beyond the script (§13): paraphrase, hearsay, negation, rescue questions, partial all-clear, and delayed old reports. Only `npm run evaluate` uses it. |

Authored labels are reviewed exercise expectations, not clinical ground truth. The messages are synthetic. Never present them as historical Helene transcripts.
