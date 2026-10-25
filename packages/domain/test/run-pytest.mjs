// Runs the Python contract tests with the pinned venv (npm run setup:py creates it).
import { spawnSync } from 'node:child_process';
import { DOMAIN_ROOT, hasVenv, venvPython } from './python-env.mjs';

if (!hasVenv()) {
  console.error(`No Python env at ${venvPython()}. Run: npm run setup:py -w @calhacks26/domain`);
  process.exit(2);
}
const r = spawnSync(venvPython(), ['-m', 'pytest', 'test/python', '-q', ...process.argv.slice(2)], { cwd: DOMAIN_ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
