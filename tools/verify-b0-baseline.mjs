import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareWithBaseline, evaluateCommand, parseTapFailures } from './ci-gate-policy.mjs';

const root = process.cwd();
const artifactDir = path.join(root, 'dist-artifacts');
mkdirSync(artifactDir, { recursive: true });
const baseline = JSON.parse(readFileSync(path.join(root, 'docs/BASELINE-TESTS-B0-15.3.20.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const findings = [];
const summaries = [];

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

function summarizeFailure(label, result) {
  const evaluation = evaluateCommand({ exitCode: result.code, output: result.output });
  if (evaluation.ok) {
    addFinding(true, label + ' : code 0, aucun échec TAP.');
    return evaluation;
  }
  const detail = evaluation.failures.length
    ? evaluation.failures.join(' | ')
    : (result.error || 'code de sortie ' + evaluation.exitCode + ' sans détail TAP');
  addFinding(false, label + ' : échec obligatoire — ' + detail + '. Journal : ' + result.logPath);
  return evaluation;
}

function baselineDiagnostics(label, observed, historical) {
  const comparison = compareWithBaseline(observed, historical);
  summaries.push('DIAGNOSTIC — ' + label + ' : ' + comparison.stillHistorical.length +
    ' échec(s) correspondant à l’ancienne baseline, ' + comparison.newFailures.length +
    ' nouveau(x), ' + comparison.resolvedHistorical.length +
    ' ancien(s) non reproduit(s). Cette comparaison n’accorde aucune tolérance.');
}

async function main() {
  console.log('Validation CI stricte Aurion');
  console.log('Référence historique à titre de diagnostic uniquement : ' + baseline.reference.version + ' / ' + baseline.reference.commit);
  console.log('Politique : tout code non nul, toute assertion TAP en échec et tout échec navigateur bloquent la validation.');

  const check = await run(['run', 'check'], 'controle-complet');
  const reachedSmoke = /^> aurion@\S+ test:smoke$/m.test(check.output);
  const reachedBrowser = /^> aurion@\S+ test:browser$/m.test(check.output);
  const checkEvaluation = summarizeFailure('npm run check (build, typecheck, frontend, lint, smoke, navigateur)', check);
  if (!reachedSmoke) addFinding(false, 'Le pipeline npm run check n’a pas atteint la suite smoke.');
  if (reachedSmoke) baselineDiagnostics('Smoke', parseTapFailures(check.output), baseline.smoke.failures);

  if (!reachedBrowser) {
    const browser = await run(['run', 'test:browser'], 'controle-navigateur');
    summarizeFailure('Playwright indépendant', browser);
  } else if (!checkEvaluation.ok) {
    summaries.push('INFO — Playwright a été appelé dans npm run check ; consulter controle-complet.log pour son diagnostic détaillé.');
  }

  const full = await run(['test'], 'regression-complete');
  const fullEvaluation = summarizeFailure('npm test (suite backend complète)', full);
  baselineDiagnostics('Suite complète', parseTapFailures(full.output), baseline.full.failures);

  const report = [
    '# Résultat de validation CI stricte Aurion',
    'Référence historique (diagnostic uniquement) : ' + baseline.reference.version + ' — ' + baseline.reference.commit,
    'Run historique : ' + baseline.reference.workflowRunUrl,
    'Politique : zéro tolérance ; la baseline ne permet jamais de faire passer un échec.',
    '',
    ...summaries.map(item => '- ' + item),
    '',
    'Échecs smoke observés : ' + (reachedSmoke ? parseTapFailures(check.output).length : 'suite non atteinte'),
    '',
    'Échecs suite complète observés : ' + parseTapFailures(full.output).length,
    '',
    'Conclusion : ' + (findings.length ? 'ÉCHEC — CORRECTIONS REQUISES' : 'VALIDATION STRICTE'),
    ''
  ].join('\n');
  writeFileSync(path.join(artifactDir, 'validation-b0.txt'), report, 'utf8');
  console.log(report);
  process.exitCode = findings.length || !fullEvaluation.ok ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
