// Finds Python on macOS, Linux, and Windows. On Windows `python3` is often the
// Microsoft Store stub (exits 9009, prints nothing), so each candidate must prove
// it runs Python 3 before it's used.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOMAIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATES = [
  ['python3', []],
  ['python', []],
  ['py', ['-3']],
];

function runsPython3(cmd, args) {
  const r = spawnSync(cmd, [...args, '-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '3';
}

/** A system Python 3 as [command, leadingArgs], or null. `PYTHON` overrides. */
export function systemPython() {
  if (process.env.PYTHON) return [process.env.PYTHON, []];
  return CANDIDATES.find(([cmd, args]) => runsPython3(cmd, args)) ?? null;
}

/** The pinned venv interpreter path (may not exist yet). `DOMAIN_PYTHON` overrides. */
export function venvPython() {
  if (process.env.DOMAIN_PYTHON) return process.env.DOMAIN_PYTHON;
  return process.platform === 'win32'
    ? join(DOMAIN_ROOT, '.venv', 'Scripts', 'python.exe')
    : join(DOMAIN_ROOT, '.venv', 'bin', 'python');
}

export const hasVenv = () => existsSync(venvPython());
