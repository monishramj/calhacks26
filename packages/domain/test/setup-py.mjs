// Creates the pinned Python venv for the contract tests, on any OS.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { DOMAIN_ROOT, systemPython, venvPython } from './python-env.mjs';

const py = systemPython();
if (!py) {
  console.error('No Python 3 found (tried python3, python, py -3). Install Python 3 or set PYTHON.');
  process.exit(2);
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: DOMAIN_ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(py[0], [...py[1], '-m', 'venv', '.venv']);
run(venvPython(), ['-m', 'pip', 'install', '-q', '-r', join(DOMAIN_ROOT, 'requirements-test.txt')]);
console.log(`Python test env ready: ${venvPython()}`);
