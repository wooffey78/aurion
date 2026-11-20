// Blocs 21 et 22 — Installation Windows et LibreOffice ; fenêtre, barre des tâches et horloge.
// Audits au niveau des SOURCES : les scripts PowerShell ne sont pas exécutables dans ce
// environnement (Windows requis) — les garanties sont vérifiées statiquement et documentées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc21: répertoire d\u2019installation au choix, données à l\u2019emplacement Windows adapté, LibreOffice réutilisé ou facultatif', () => {
  const install = read('../../scripts/Install-Aurion.ps1');
  // Choix de répertoire : défaut utilisateur sans élévation + répertoire personnalisé vérifié avant acceptation.
  assert.match(install, /\[string\]\$InstallDir = ''/);
  assert.match(install, /Repertoire d'installation personnalise accepte/);
  assert.match(install, /non inscriptible : poursuite a l'emplacement utilisateur/);
  // Séparation programmes / données : base, journaux et données à l'emplacement Windows adapté.
  assert.match(install, /Get-AurionDataDir|donnees dans l'emplacement Windows/);
  const common = read('../../scripts/Aurion-Common.ps1');
  assert.match(common, /function Get-AurionDataDir/);
  assert.match(common, /LOCALAPPDATA\\Aurion\\data|LOCALAPPDATA 'Aurion\\data'/);
  assert.doesNotMatch(common, /Remove-Item[^ ]+.*\$script:DataDir -Recurse\s*$/m);
  // LibreOffice existant détecté (Program Files, registre) et RÉUTILISÉ ; jamais imposé.
  assert.match(common, /function Find-SystemLibreOffice/);
  assert.match(common, /LibreOffice\\program\\soffice\.exe/);
  assert.match(common, /HKLM:\\SOFTWARE\\LibreOffice\\UNO\\InstallPath/);
  assert.match(install, /LibreOffice existant detecte et reutilise/);
  assert.match(install, /resteront indisponibles/, 'LibreOffice reste facultatif (la génération PDF marche sans)');
  // Aucune élévation requise par défaut (aucun droit administrateur).
  assert.doesNotMatch(install, /Start-Process\s+.*-Verb\s+RunAs/);
  // Uninstall : l'arrêt ne supprime JAMAIS les données (désinstallation préservant les données).
  const stop = read('../../scripts/Stop-Aurion.ps1');
  assert.doesNotMatch(stop, /Remove-Item|del \/s|rd \/s/);
});

test('bloc22: fenêtre maximisée au-dessus de la barre des tâches, horloge locale française avec reprise après veille', () => {
  const launcher = read('../../scripts/Aurion-Launcher.ps1');
  // Fenêtre APPLI maximisée (la barre des tâches reste visible) — plus aucun plein écran système.
  assert.match(launcher, /--start-maximized/);
  assert.doesNotMatch(launcher, /--start-fullscreen/);
  // Horloge locale : composant partagé, fuseau système, 1 s, resynchronisation au retour de
  // veille (visibilitychange), affichée sur le tableau de bord. Bloc 11 : rendu sémantique
  // <time datetime>, HH:MM dominant (chiffres tabulaires) et secondes discrètes — la date est
  // construite depuis l'horloge locale de l'appareil (aucune fausse heure serveur).
  const ui = read('../../assets/js/core/ui.js');
  assert.match(ui, /export function startLocalClock/);
  assert.match(ui, /[<]time datetime=.{1,4}[\$]{hh}:[\$]{mm}:[\$]{ss}/);
  assert.match(ui, /clock-main/);
  assert.match(ui, /clock-sec/);
  assert.match(ui, /getHours\(\)/);
  assert.match(ui, /,1000\)/);
  assert.match(ui, /visibilitychange/);
  const other = read('../../assets/js/pages/dash/other.js');
  assert.match(other, /id="local-clock"/);
  assert.match(other, /startLocalClock\(document\.getElementById\('local-clock'\)\)/);
  // Aucune modification globale/permanente des paramètres Windows (aucun registre écrit par les scripts).
  for (const f of ['../../scripts/Aurion-Launcher.ps1', '../../scripts/Install-Aurion.ps1', '../../scripts/Stop-Aurion.ps1']) {
    const src = read(f);
    assert.doesNotMatch(src, /Set-ItemProperty\s+HKLM|New-ItemProperty\s+HKLM|reg add /i, `${f} ne modifie pas le registre système`);
  }
});
