import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const artifactDir = path.join(root, 'dist-artifacts');
mkdirSync(artifactDir, { recursive: true });
const baseline = JSON.parse(readFileSync(path.join(root, 'docs/BASELINE-TESTS-B0-15.3.20.json'), 'utf8'));
const strict = process.env.AURION_BASELINE_STRICT === '1';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const findings = [];
const summaries = [];

function parseFailures(output) {
  return [...output.matchAll(/^\s*not ok \d+ - (.+?)\s*$/gm)].map(match => match[1].trim());
}

function addFinding(ok, message) {
  summaries.push((ok ? 'OK — ' : 'ÉCHEC — ') + message);
  if (!ok) findings.push(message);
}

function run(args, name) {
  return new Promise(resolve => {
    const logPath = path.join(artifactDir, name + '.log');
    const chunks = [];
    const child = spawn(npm, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    const collect = chunk => {
      const value = chunk.toString();
      chunks.push(value);
      process.stdout.write(value);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => {
      const output = chunks.join('');
      writeFileSync(logPath, output, 'utf8');
      resolve({ code: 127, output, error: error.message, logPath });
    });
    child.on('close', code => {
      const output = chunks.join('');
      writeFileSync(logPath, output, 'utf8');
      resolve({ code: code === null ? 1 : code, output, error: null, logPath });
    });
  });
}

function knownBrowserFailure(output) {
  return output.includes(baseline.browser.message) &&
    output.includes(baseline.browser.waitingFor) &&
    output.includes(baseline.browser.location);
}

async function main() {
  console.log('Validation Aurion — référence ' + baseline.reference.version + ' / ' + baseline.reference.commit);
  console.log('Mode : ' + (strict ? 'STRICT (zéro échec autorisé)' : 'BASELINE B0 (aucun nouvel échec autorisé)'));

  const check = await run(['run', 'check'], 'controle-complet');
  const reachedSmoke = check.output.includes('test:smoke');
  const reachedBrowser = check.output.includes('test:browser');
  const smokeFailures = parseFailures(check.output);

  if (!reachedSmoke) {
    addFinding(false, 'npm run check s’est arrêté avant les tests smoke (code ' + check.code + ').');
  } else {
    const added = smokeFailures.filter(name => !baseline.smoke.failures.includes(name));
    if (added.length) {
      addFinding(false, 'Nouveaux échecs smoke : ' + added.join(' | '));
    } else if (strict && smokeFailures.length) {
      addFinding(false, 'Mode strict : ' + smokeFailures.length + ' échec(s) smoke subsistent.');
    } else {
      const resolved = baseline.smoke.failures.filter(name => !smokeFailures.includes(name));
      addFinding(true, 'Smoke : ' + smokeFailures.length + ' échec(s) de référence, aucun nouveau ; résolus depuis B0 : ' + resolved.length + '.');
    }
  }

  if (check.code === 0) {
    addFinding(true, 'npm run check : toutes les commandes incluses ont réussi.');
  } else if (!reachedSmoke) {
    addFinding(false, 'npm run check a échoué avant la suite smoke. Consultez controle-complet.log.');
  } else if (smokeFailures.some(name => !baseline.smoke.failures.includes(name))) {
    addFinding(false, 'npm run check a échoué avec des tests smoke nouveaux.');
  } else if (reachedBrowser) {
    if (knownBrowserFailure(check.output) && !strict) {
      addFinding(true, 'Playwright dans npm run check : seul le timeout B0 exact est encore présent.');
    } else if (strict && knownBrowserFailure(check.output)) {
      addFinding(false, 'Mode strict : le timeout Playwright de B0 subsiste.');
    } else {
      addFinding(false, 'Playwright dans npm run check présente un échec navigateur nouveau ou différent.');
    }
  } else if (smokeFailures.length && !strict) {
    addFinding(true, 'npm run check s’arrête sur les échecs smoke de référence, après build/typecheck/frontend/lint.');
  } else {
    addFinding(false, 'npm run check a échoué sans échec de référence explicatif.');
  }

  if (!reachedBrowser) {
    const browser = await run(['run', 'test:browser'], 'controle-navigateur');
    if (browser.code === 0) {
      addFinding(true, 'Playwright indépendant : tests navigateur réussis.');
    } else if (knownBrowserFailure(browser.output) && !strict) {
      addFinding(true, 'Playwright indépendant : timeout strictement identique à la baseline B0, consigné.');
    } else {
      addFinding(false, 'Playwright indépendant : échec nouveau, différent ou interdit en mode strict.');
    }
  }

  const full = await run(['test'], 'regression-complete');
  const fullFailures = parseFailures(full.output);
  const newFullFailures = fullFailures.filter(name => !baseline.full.failures.includes(name));
  if (newFullFailures.length) {
    addFinding(false, 'Nouveaux échecs de régression complète : ' + newFullFailures.join(' | '));
  } else if (strict && fullFailures.length) {
    addFinding(false, 'Mode strict : ' + fullFailures.length + ' échec(s) de régression complète subsistent.');
  } else {
    const resolved = baseline.full.failures.filter(name => !fullFailures.includes(name));
    addFinding(true, 'Régression complète : ' + fullFailures.length + ' échec(s) de référence, aucun nouveau ; résolus depuis B0 : ' + resolved.length + '.');
  }
  if (full.code !== 0 && (!fullFailures.length || newFullFailures.length || strict)) {
    addFinding(false, 'npm test a terminé en erreur au-delà de la tolérance B0 (code ' + full.code + ').');
  }

  const report = [
    '# Résultat de validation Aurion',
    'Référence : ' + baseline.reference.version + ' — ' + baseline.reference.commit,
    'Run de référence : ' + baseline.reference.workflowRunUrl,
    'Mode : ' + (strict ? 'STRICT' : 'BASELINE B0'),
    '',
    ...summaries.map(item => '- ' + item),
    '',
    'Échecs smoke observés : ' + smokeFailures.length,
    ...smokeFailures.map(name => '  - ' + name),
    '',
    'Échecs suite complète observés : ' + fullFailures.length,
    ...fullFailures.map(name => '  - ' + name),
    '',
    'Conclusion : ' + (findings.length ? 'ÉCHEC' : 'VALIDATION BASELINE B0'),
    ''
  ].join('\n');
  writeFileSync(path.join(artifactDir, 'validation-b0.txt'), report, 'utf8');
  console.log(report);
  process.exitCode = findings.length ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
