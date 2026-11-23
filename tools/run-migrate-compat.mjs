import { spawnSync } from 'node:child_process';
import { hasProductionBackendConfig, missingProductionBackendConfig } from './render-backend-config.mjs';

const isRender = Boolean(process.env.RENDER_SERVICE_ID);
if (isRender && !hasProductionBackendConfig()) {
  console.warn(`[Aurion] Migration de build ignorée : configuration Render incomplète. Variables à renseigner ou corriger : ${missingProductionBackendConfig().join(', ')}`);
  process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['--prefix', 'backend', 'run', 'migrate:prod'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('[Aurion] Échec du lancement de la migration:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
