import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// 15.4.56 — LibreOffice pour la conversion des modèles téléversés (DOCX/ODT → PDF). L'installation
// vit dans le build npm (appelé par la commande de build, y compris tant que le blueprint Render
// n'a pas été resynchronisé) : sans LibreOffice, le PDF des documents retombait silencieusement
// sur la mise en page native. Best effort : jamais bloquant, sauté quand soffice est déjà présent
// (CI, après installation blueprint) ou quand apt-get est indisponible (macOS, Windows).
function ensureLibreOffice(){
  const sofficePaths=['/usr/bin/soffice','/usr/bin/libreoffice','/usr/local/bin/soffice'];
  if(sofficePaths.some(p=>existsSync(p)))return;
  if(process.platform!=='linux'||!existsSync('/usr/bin/apt-get'))return;
  try{
    console.log('[Aurion] LibreOffice absent : installation pour la conversion des modèles téléversés (best effort)…');
    spawnSync('apt-get',['update','-qq'],{stdio:'ignore',timeout:180000});
    const install=spawnSync('apt-get',['install','-y','-qq','--no-install-recommends','libreoffice-writer','fonts-dejavu-core'],{stdio:'ignore',timeout:600000});
    if(install.status===0)console.log('[Aurion] LibreOffice installé : les modèles DOCX/ODT téléversés seront convertis en PDF.');
    else console.warn('[Aurion] Installation LibreOffice impossible sur ce serveur : le PDF des modèles téléversés reste au modèle natif.');
  }catch(error){
    console.warn('[Aurion] Installation LibreOffice sautée :',error?.message||error);
  }
}
ensureLibreOffice();

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
