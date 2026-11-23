// Bloc 8 — reconstruction du répertoire web embarqué dans les paquets natifs (Capacitor).
// Usage éditeur : node tools/build-web-dist.mjs [--api-url=https:// domaine-canonique]
//   - copie les assets servis par le backend dans dist-web/ (webDir de capacitor.config.json) ;
//   - si --api-url est fournie, injecte window.AURION_API_URL AVANT config.js (priorité canonique) ;
//     sinon, l'enveloppe native pose l'URL au démarrage ou l'API est résolue par la méta du serveur.
// Aucune URL Render codée en dur ; le domaine de production OVH n'est posé que par l'éditeur au build.
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';

const apiUrlArg = process.argv.find(a => a.startsWith('--api-url='));
const apiUrl = apiUrlArg ? apiUrlArg.slice('--api-url='.length).replace(/\/$/, '') : '';

rmSync('dist-web', { recursive: true, force: true });
mkdirSync('dist-web');
cpSync('assets', 'dist-web', { recursive: true });
cpSync('index.html', 'dist-web/index.html');

if (apiUrl) {
  const shim = `<script>window.AURION_API_URL=${JSON.stringify(apiUrl)};</script>`;
  const html = readFileSync('dist-web/index.html', 'utf8').replace(/<head>/i, `<head>${shim}`);
  writeFileSync('dist-web/index.html', html);
  console.log('dist-web régénéré avec URL API canonique injectée (ni Render, ni URL en dur dans les sources).');
} else {
  console.log('dist-web régénéré (URL API : injectée nativement au démarrage ou méta canonique du serveur).');
}
console.log('Puis : npx cap sync android && npx cap sync ios (macOS requis pour iOS).');
