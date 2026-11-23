import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const requiredFiles = [
  new URL('../backend/node_modules/fastify/package.json', import.meta.url),
  new URL('../backend/node_modules/typescript/package.json', import.meta.url),
];

if (requiredFiles.every(path => existsSync(path))) {
  process.exit(0);
}

console.log('[Aurion] Dépendances backend absentes : installation avant compilation.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, [
  'ci',
  '--prefix', 'backend',
  '--include=dev',
  '--no-audit',
  '--no-fund',
], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('[Aurion] Installation des dépendances impossible:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
