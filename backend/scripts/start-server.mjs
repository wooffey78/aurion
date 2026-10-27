import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// La chaîne du rôle propriétaire n'est utilisée que par migrate.js. Ne la transmettez
// jamais au serveur web, qui doit se connecter avec DATABASE_URL (rôle runtime).
const serverPath = fileURLToPath(new URL('../dist/server.js', import.meta.url));
const env = { ...process.env };
delete env.AURION_MIGRATION_DATABASE_URL;
const child = spawn(process.execPath, [serverPath], { env, stdio: 'inherit' });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  });
}
child.on('error', error => {
  console.error('[AURION] Impossible de démarrer le serveur web.');
  console.error(`[AURION] Code: ${error?.code || 'SERVER_START_FAILED'}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
});
