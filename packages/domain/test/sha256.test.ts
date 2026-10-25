// Guards the pure SHA-256 behind inputSignature against node:crypto, including padding edges.
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { sha256Hex } from '../src/sha256.ts';
it('matches node crypto', () => {
  for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'Água 🙏'.repeat(40), 'x'.repeat(1000)])
    expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
});
