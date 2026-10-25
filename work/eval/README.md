# work/eval

**Owner:** ws/inference (C3), with ws/codec-radio for the codec comparison · **Command:** `npm run evaluate` · **Spec:** §13

Versioned reports, real versus stubbed:

- **Incident system:** false links, missed corrections, attention confusions, unjustified downgrades, source-reference validity, and Laya/Claude timings, measured separately on `fixtures/private/heldout/`. Never tune on that set, and never let the model be its only judge.
- **Codec:** exact accepted-text equality, cross-machine pass/fail, packet bytes including all overhead, timing, and delivery against raw and lightweight compression on the same workload. Keep measured, calculated, and simulated results separate.
