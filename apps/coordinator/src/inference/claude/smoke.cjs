// Preflight (§19): one official-SDK call with CLAUDE_MODEL. Prints the model that answered and latency, never the key.
// Run: node --env-file=.env apps/coordinator/src/inference/claude/smoke.cjs
const Anthropic = require('@anthropic-ai/sdk');

const model = process.env.CLAUDE_MODEL;
if (!process.env.ANTHROPIC_API_KEY || !model) {
  console.error('unavailable: ANTHROPIC_API_KEY and CLAUDE_MODEL must be set in .env');
  process.exit(2);
}

const t0 = Date.now();
new Anthropic()
  .messages.create({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the word ok.' }] })
  .then((r) => console.log(JSON.stringify({ requested: model, answered: r.model, ms: Date.now() - t0, stop: r.stop_reason, text: r.content[0]?.text })))
  .catch((e) => { console.error(`failed: ${e.status ?? ''} ${e.message}`); process.exit(1); });
