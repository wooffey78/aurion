import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { hasProductionBackendConfig } from './render-backend-config.mjs';

const isRender = Boolean(process.env.RENDER_SERVICE_ID);
if (isRender && !hasProductionBackendConfig()) {
  const productionOrigin = 'https://aurion-web-o6ah.onrender.com';
  const server = createServer((request, response) => {
    let destination;
    try {
      const incoming = new URL(request.url || '/', 'https://aurion-2hye.onrender.com');
      destination = new URL(productionOrigin);
      destination.pathname = incoming.pathname;
      destination.search = incoming.search;
    } catch {
      response.writeHead(400, { 'Cache-Control': 'no-store' });
      response.end('Requête invalide.');
      return;
    }

    const status = request.method === 'GET' || request.method === 'HEAD' ? 302 : 307;
    response.writeHead(status, {
      Location: destination.href,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : 'Aurion est accessible à son adresse de production.');
  });

  const port = Number(process.env.PORT) || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.warn('[Aurion] Cette adresse Render ne possède pas de configuration backend; redirection vers la production active.');
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
