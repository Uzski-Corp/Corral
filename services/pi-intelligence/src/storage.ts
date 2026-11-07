import { open, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
export async function atomicJSON(path: string, value: unknown) {
  const file = await open(`${path}.tmp`, 'w', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  await rename(`${path}.tmp`, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export async function acquireOwner(directory: string) {
  const file = await open(join(directory, '.owner.lock'), 'a+', 0o600);
  const result = spawnSync('/usr/bin/flock', ['--exclusive', '--nonblock', '3'], { stdio: ['ignore', 'ignore', 'pipe', file.fd] });
  if (result.error || result.status !== 0) { await file.close(); throw new Error('Pi data volume must have exactly one owner; Linux flock required'); }
  return file;
}
