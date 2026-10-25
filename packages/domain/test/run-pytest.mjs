// Runs the Python contract tests with the pinned venv (npm run setup:py creates it).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = process.env.DOMAIN_PYTHON ?? join(root, '.venv', 'bin', 'python');
if (!existsSync(python)) {
  console.error(`No Python env at ${python}. Run: npm run setup:py -w @calhacks26/domain`);
  process.exit(2);
}
const r = spawnSync(python, ['-m', 'pytest', 'test/python', '-q', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
