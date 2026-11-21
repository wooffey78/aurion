// Porte CI : aucun test d'intégration PostgreSQL, Stripe ou Google ne peut être ignoré.
// Le contrôle découvre les fichiers par leurs marqueurs réels (suite PostgreSQL, webhook
// Stripe, import Google), les exécute, puis rend un rapport tests / réussis / ignorés / échecs.
// Un skip, un todo, un échec, un fichier absent ou un fichier sans test rend la porte rouge.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const testsDirectory = path.join(root, 'backend', 'tests');
const artifactDirectory = path.join(root, 'dist-artifacts');
const reportPath = path.join(artifactDirectory, 'integration-tests-report.md');
const eventsPath = path.join(artifactDirectory, 'integration-tests-events.jsonl');
const runLogPath = path.join(artifactDirectory, 'integration-tests-run.log');
const reporterPath = path.join(root, 'tools', 'integration-skip-reporter.mjs');

const CATEGORY_ORDER = ['PostgreSQL', 'Stripe', 'Google', 'Intégration'];

// Un import réel du SDK Google, du double de test Google ou des services Google/Drive.
const GOOGLE_IMPORT = /(?:from\s*|import\(\s*)['"][^'"]*(?:googleapis|google-auth-library|helpers\/fake-google|services\/(?:google|cloud-drive))[^'"]*['"]/;
// Un parcours de facturation Stripe réellement exercé, pas une simple mention de configuration.
const STRIPE_FLOW = /\/billing\/stripe\b|stripe-signature|checkout\.session\.completed/;

export function classifyIntegrationFile(relative, content) {
  const base = path.basename(relative);
  const integrationFile = base.endsWith('.integration.test.mjs');
  // Marqueur réellement lu par le test, pas une simple mention dans une chaîne (rapport, message).
  const databaseSuite = /env\.AURION_INTEGRATION_TESTS/.test(content);
  const google = GOOGLE_IMPORT.test(content);
  const stripe = STRIPE_FLOW.test(content);
  const protectedFile = integrationFile || databaseSuite || google || stripe;
  if (!protectedFile) return { relative, protected: false, categories: [] };

  const categories = [];
  if (integrationFile || databaseSuite || /(?:postgres|rls)/i.test(base)) categories.push('PostgreSQL');
  if (/stripe/i.test(base) || stripe || (integrationFile && /STRIPE_(?:SECRET|WEBHOOK_SECRET)/.test(content))) categories.push('Stripe');
  if (google || /(?:google|gmail|drive)/i.test(base)) categories.push('Google');
  if (!categories.length) categories.push('Intégration');
  return { relative, protected: true, categories };
}

export function discoverIntegrationTests({ directory = testsDirectory, rootDirectory = root } = {}) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map(entry => {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(rootDirectory, absolute).split(path.sep).join('/');
      return { ...classifyIntegrationFile(relative, readFileSync(absolute, 'utf8')), absolute };
    })
    .filter(file => file.protected)
    .sort((a, b) => a.relative.localeCompare(b.relative));
}

function relativeToRoot(file, rootDirectory) {
  return path.relative(rootDirectory, file).split(path.sep).join('/');
}

export function summarizeIntegrationRun({
  events = [],
  files = [],
  exitCode = 0,
  rootDirectory = root,
  configurationFailures = [],
} = {}) {
  const entries = new Map(files.map(file => [file.relative, {
    relative: file.relative,
    categories: file.categories,
    tests: 0,
    pass: 0,
    skip: 0,
    fail: 0,
  }]));
  const skipped = [];
  const failed = [];
  const suiteFailures = [];

  for (const event of events) {
    if (!event || !event.file) continue;
    const relative = relativeToRoot(event.file, rootDirectory);
    const entry = entries.get(relative);
    if (!entry) continue;
    if (event.type === 'fail') {
      // Node émet un échec de suite en plus de l'échec du test enfant : ne pas le compter deux fois.
      if (event.suite) {
        suiteFailures.push({ file: relative, name: event.name });
        continue;
      }
      entry.tests += 1;
      entry.fail += 1;
      failed.push({ file: relative, name: event.name, reason: event.reason || 'échec du test' });
      continue;
    }
    if (event.type !== 'pass') continue;
    entry.tests += 1;
    const skip = event.skip || event.todo;
    if (skip) {
      entry.skip += 1;
      const reason = typeof skip === 'string' ? skip : (event.todo ? 'todo' : 'ignoré sans raison déclarée');
      skipped.push({ file: relative, name: event.name, reason });
    } else {
      entry.pass += 1;
    }
  }

  const fileResults = [...entries.values()].sort((a, b) => a.relative.localeCompare(b.relative));
  const missing = fileResults.filter(entry => entry.tests === 0).map(entry => entry.relative);
  const totals = fileResults.reduce((sum, entry) => ({
    tests: sum.tests + entry.tests,
    pass: sum.pass + entry.pass,
    skip: sum.skip + entry.skip,
    fail: sum.fail + entry.fail,
  }), { tests: 0, pass: 0, skip: 0, fail: 0 });

  const categories = CATEGORY_ORDER
    .map(name => {
      const selected = fileResults.filter(entry => entry.categories.includes(name));
      return {
        name,
        files: selected.length,
        tests: selected.reduce((sum, entry) => sum + entry.tests, 0),
        pass: selected.reduce((sum, entry) => sum + entry.pass, 0),
        skip: selected.reduce((sum, entry) => sum + entry.skip, 0),
        fail: selected.reduce((sum, entry) => sum + entry.fail, 0),
      };
    })
    .filter(category => category.files > 0);

  const failures = [...configurationFailures];
  if (exitCode !== 0) failures.push(`Le runner de tests a terminé avec le code ${exitCode}. Consultez integration-tests-run.log.`);
  if (files.length === 0) failures.push('Aucun test d’intégration PostgreSQL, Stripe ou Google n’a été découvert : la porte ne peut rien prouver.');
  for (const item of skipped) failures.push(`Test ignoré — ${item.file} › ${item.name} (${item.reason})`);
  for (const item of failed) failures.push(`Test en échec — ${item.file} › ${item.name}`);
  for (const item of suiteFailures) failures.push(`Suite en échec — ${item.file} › ${item.name}`);
  for (const file of missing) failures.push(`Fichier protégé sans aucun test exécuté — ${file}`);

  return {
    ok: failures.length === 0,
    totals,
    categories,
    files: fileResults,
    skipped,
    failed,
    suiteFailures,
    missing,
    failures,
    exitCode,
  };
}

export function renderIntegrationReport(result) {
  const lines = [
    '# Tests d’intégration protégés — rapport',
    '',
    `Conclusion : **${result.ok ? 'RÉUSSI' : 'ÉCHEC'}**`,
    '',
    `Tests : ${result.totals.tests} · Réussis (pass) : ${result.totals.pass} · Ignorés (skip) : ${result.totals.skip} · Échecs (fail) : ${result.totals.fail}`,
    '',
    '## Synthèse par catégorie',
    '',
    '| Catégorie | Fichiers | Tests | Réussis | Ignorés | Échecs |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...result.categories.map(category =>
      `| ${category.name} | ${category.files} | ${category.tests} | ${category.pass} | ${category.skip} | ${category.fail} |`),
    '',
    'Un fichier peut couvrir plusieurs catégories ; le total global ci-dessus ne compte chaque test qu’une fois.',
    '',
    '## Détail par fichier',
    '',
    '| Fichier | Catégories | Tests | Réussis | Ignorés | Échecs |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...result.files.map(file =>
      `| ${file.relative} | ${file.categories.join(', ')} | ${file.tests} | ${file.pass} | ${file.skip} | ${file.fail} |`),
  ];

  if (result.skipped.length) {
    lines.push('', '## Tests ignorés (bloquants)', '');
    for (const item of result.skipped) lines.push(`- \`${item.file}\` › ${item.name} — ${item.reason}`);
  }
  if (result.failed.length) {
    lines.push('', '## Tests en échec', '');
    for (const item of result.failed) lines.push(`- \`${item.file}\` › ${item.name}`);
  }
  if (result.suiteFailures.length) {
    lines.push('', '## Suites en échec (hors comptage des tests)', '');
    for (const item of result.suiteFailures) lines.push(`- \`${item.file}\` › ${item.name}`);
  }
  if (result.missing.length) {
    lines.push('', '## Fichiers protégés sans test exécuté', '');
    for (const file of result.missing) lines.push(`- \`${file}\``);
  }
  if (result.failures.length) {
    lines.push('', '## Motifs du refus', '');
    for (const failure of result.failures) lines.push(`- ${failure}`);
  }

  lines.push(
    '',
    '---',
    'Cette porte échoue sur tout test ignoré, todo, en échec ou non exécuté : aucun test d’intégration ne peut être considéré comme exécuté sans preuve.',
    '',
  );
  return lines.join('\n');
}

function runTests(files) {
  return new Promise(resolve => {
    mkdirSync(artifactDirectory, { recursive: true });
    const chunks = [];
    const child = spawn(process.execPath, [
      '--test',
      '--test-concurrency=1',
      `--test-reporter=${reporterPath}`,
      '--test-reporter-destination=stdout',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      ...files.map(file => file.absolute),
    ], {
      cwd: root,
      env: { ...process.env, AURION_TEST_EVENTS: eventsPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = chunk => {
      const value = chunk.toString();
      chunks.push(value);
      process.stdout.write(value);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => {
      resolve({ code: 127, output: chunks.join(''), error: error.message });
    });
    child.on('close', code => {
      resolve({ code: code === null ? 1 : code, output: chunks.join(''), error: null });
    });
  });
}

function readEvents() {
  if (!existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export async function main() {
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(eventsPath, '', 'utf8');
  const files = discoverIntegrationTests();
  const configurationFailures = [];
  if (process.env.AURION_INTEGRATION_TESTS !== '1') {
    configurationFailures.push('AURION_INTEGRATION_TESTS doit valoir 1 : sinon les suites PostgreSQL et Stripe se déclarent ignorées.');
  }
  if (!process.env.DATABASE_URL) {
    configurationFailures.push('DATABASE_URL est requis pour exécuter les tests PostgreSQL au lieu de les ignorer.');
  }
  if (!process.env.AURION_ADMIN_DATABASE_URL) {
    configurationFailures.push('AURION_ADMIN_DATABASE_URL est requis pour les suites RLS et d’administration.');
  }

  console.log(`Porte d’intégration : ${files.length} fichier(s) protégé(s) — ${files.map(file => file.relative).join(', ')}`);
  const run = files.length ? await runTests(files) : { code: 1, output: '', error: 'aucun fichier protégé' };
  writeFileSync(runLogPath, run.output, 'utf8');
  if (run.error) console.error(`Runner : ${run.error}`);

  const result = summarizeIntegrationRun({
    events: readEvents(),
    files,
    exitCode: run.code,
    rootDirectory: root,
    configurationFailures,
  });
  const report = renderIntegrationReport(result);
  writeFileSync(reportPath, report, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  console.log(report);
  console.log(result.ok
    ? 'Porte d’intégration : RÉUSSIE — aucun test PostgreSQL, Stripe ou Google ignoré.'
    : `Porte d’intégration : ÉCHEC — ${result.failures.length} motif(s).`);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(error => {
    const fallback = [
      '# Tests d’intégration protégés — rapport',
      '',
      'Conclusion : **ÉCHEC**',
      '',
      `Erreur interne de la porte : ${error.message}`,
      '',
    ].join('\n');
    try {
      mkdirSync(artifactDirectory, { recursive: true });
      writeFileSync(reportPath, fallback, 'utf8');
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, fallback + '\n');
    } catch {
      // Le rapport est un secours : l'erreur d'origine reste la cause du rouge.
    }
    console.error(error);
    process.exitCode = 1;
  });
}
