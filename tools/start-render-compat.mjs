import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { hasProductionBackendConfig } from './render-backend-config.mjs';

const isRender = Boolean(process.env.RENDER_SERVICE_ID);
if (isRender && !hasProductionBackendConfig()) {
  const productionOrigin = process.env.AURION_PUBLIC_ORIGIN || 'https://aurion-2hye.onrender.com';
  const serviceOrigin = process.env.RENDER_EXTERNAL_URL || 'https://aurion-2hye.onrender.com';
  let isCanonicalService = false;
  try { isCanonicalService = new URL(productionOrigin).origin === new URL(serviceOrigin).origin; } catch { isCanonicalService = true; }
  const server = createServer((request, response) => {
    if (isCanonicalService) {
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : 'Aurion à Francfort attend sa configuration de production.');
      return;
    }

    let destination;
    try {
      const incoming = new URL(request.url || '/', serviceOrigin);
      destination = new URL(productionOrigin);
      destination.pathname = incoming.pathname;
      destination.search = incoming.search;
    } catch {
      response.writeHead(400, { 'Cache-Control': 'no-store' });
      response.end('Requête invalide.');
      return;
    }

    const status = request.method === 'GET' || request.method === 'HEAD' ? 302 : 307;
    response.writeHead(status, { Location: destination.href, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : 'Aurion est accessible à son adresse canonique.');
  });

  const port = Number(process.env.PORT) || 10000;
  server.listen(port, '0.0.0.0', () => {
    if (isCanonicalService) console.error('[Aurion] Configuration de production incomplète sur l’origine canonique; service fermé en sécurité.');
    else console.warn(`[Aurion] Configuration backend absente; redirection temporaire vers ${productionOrigin}.`);
  });
} else {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['--prefix', 'backend', 'start'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('error', error => {
    console.error('[Aurion] Impossible de démarrer le backend:', error.message);
    process.exit(1);
  });
  child.on('exit', code => process.exit(code ?? 1));
}
