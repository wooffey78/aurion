// Doctor de parité local / staging / production.
//
// Il lit trois fichiers d'environnement (format .env) et compare six signatures :
//   - la présence des noms de variables du contrat backend/.env.example ;
//   - les URI de retour Google (Calendar/Gmail et Drive) ;
//   - le backend de stockage effectif (local ou S3) ;
//   - le mode Stripe (désactivé, test ou live) ;
//   - la version des migrations (préfixe numérique) ;
//   - le SHA du build (préfixe de 12 caractères).
//
// Aucune valeur, aucun nom de variable, aucune URI, aucune clé et aucun secret n'est affiché.
// Les cellules du rapport sont des références opaques : deux environnements qui partagent le
// même numéro ont la même signature. Un opérateur peut ainsi voir qui diverge sans exposer
// la configuration elle-même.
//
// Usage :
//   node tools/parity-doctor.mjs --local <fichier> --staging <fichier> --production <fichier>
//                                [--json] [--strict]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'backend', 'migrations');
const ENV_EXAMPLE = path.join(ROOT, 'backend', '.env.example');
const ENV_LABELS = ['local', 'staging', 'production'];
const STATUS_LABELS = { identical: 'OK', different: 'ÉCART', unavailable: 'INDISPONIBLE' };
const METADATA_VARIABLES = new Set([
  'AURION_MIGRATION_VERSION',
  'AURION_BUILD_SHA',
  'AURION_STRIPE_MODE',
  // Jetons opérationnels du pré-vol Google : ils ne font pas partie du contrat applicatif
  // et ne doivent jamais être exigés à l'identique sur les trois environnements.
  'GOOGLE_PREFLIGHT_REFRESH_TOKEN',
  'GOOGLE_PREFLIGHT_DRIVE_REFRESH_TOKEN',
  'RENDER_GIT_COMMIT',
  'GIT_COMMIT',
  'SOURCE_VERSION',
  'VERCEL_GIT_COMMIT_SHA',
]);

export const USAGE = `Usage :
  node tools/parity-doctor.mjs --local <fichier> --staging <fichier> --production <fichier> [--json] [--strict]

Compare, sans les afficher, les signatures de :
  - noms de variables du contrat backend/.env.example ;
  - GOOGLE_REDIRECT_URI et GOOGLE_DRIVE_REDIRECT_URI ;
  - AURION_STORAGE_BACKEND (backend effectif local ou s3) ;
  - mode Stripe : STRIPE_SECRET_KEY, ou AURION_STRIPE_MODE si la clé est masquée ;
  - AURION_MIGRATION_VERSION (préfixe numérique ; local : dernière migration du dépôt) ;
  - AURION_BUILD_SHA, RENDER_GIT_COMMIT, GIT_COMMIT (local : git HEAD).

Les fichiers sont lus localement. Aucune valeur, aucun nom de variable, aucune URI et aucun
secret n'est affiché. Les chiffres de référence sont opaques : deux environnements avec le
même chiffre partagent la même signature.

--json    Rapport JSON, également sans valeurs.
--strict  Code de sortie 1 si un champ diffère ou reste indisponible.`;

class ParityInputError extends Error {
  constructor(environment, message, code = 'ENV_UNREADABLE') {
    super(message);
    this.name = 'ParityInputError';
    this.environment = environment || null;
    this.code = code;
  }
}

class UsageError extends Error {}

/** Lecture .env volontairement minimale : aucune interpolation, aucune exécution. */
export function parseDotenv(text) {
  const values = new Map();
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      const quoted = value[0] === '"';
      value = value.slice(1, -1);
      if (quoted) {
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }
    values.set(match[1], value);
  }
  return values;
}

export function readReferenceVariableNames() {
  try {
    return [...parseDotenv(readFileSync(ENV_EXAMPLE, 'utf8')).keys()].filter(isComparableVariable).sort();
  } catch {
    throw new ParityInputError(null, 'contrat de variables indisponible', 'CONTRACT_UNAVAILABLE');
  }
}

function isComparableVariable(name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
  if (METADATA_VARIABLES.has(name) || name.startsWith('RENDER_')) return false;
  return true;
}

// Le contrat .env.example évite d'oublier une variable absente des trois fichiers ; les noms
// réellement présents dans les fichiers ajoutent les variables d'exploitation non documentées.
function defaultVariableNames(envs) {
  const contract = readReferenceVariableNames();
  const discovered = ENV_LABELS.flatMap(label => [...envs[label].keys()].filter(isComparableVariable));
  return [...new Set([...contract, ...discovered])].sort();
}

export function readEnvironmentFile(file, environment) {
  try {
    return parseDotenv(readFileSync(file, 'utf8'));
  } catch {
    throw new ParityInputError(environment, 'fichier d’environnement absent ou illisible');
  }
}

function valueOf(env, key) {
  return String(env.get(key) ?? '').trim();
}

function firstValue(env, keys) {
  for (const key of keys) {
    const value = valueOf(env, key);
    if (value) return value;
  }
  return '';
}

/** Normalise une URI de retour OAuth sans jamais la restituer. */
export function normalizeRedirectUri(value, expectedPath) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== expectedPath) return null;
  const defaultPort = (url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80');
  const port = url.port && !defaultPort ? `:${url.port}` : '';
  return `${url.protocol}//${url.hostname}${port}${url.pathname}`;
}

export function googleSignature(env) {
  const calendar = valueOf(env, 'GOOGLE_REDIRECT_URI');
  let drive = valueOf(env, 'GOOGLE_DRIVE_REDIRECT_URI');
  const configured = Boolean(valueOf(env, 'GOOGLE_CLIENT_ID') || valueOf(env, 'GOOGLE_CLIENT_SECRET'));
  // Google désactivé : ne pas déduire une URI Drive de APP_BASE_URL, sinon l'absence
  // normale des deux URI serait signalée à tort comme une configuration incomplète.
  if (!calendar && !drive) {
    return configured
      ? { available: false, reason: 'Google configuré sans URI de retour' }
      : { available: true, value: 'désactivé' };
  }
  if (!drive) {
    const base = valueOf(env, 'APP_BASE_URL');
    if (base) {
      try {
        drive = new URL('/cloud/google/callback', base).toString();
      } catch {
        drive = '';
      }
    }
  }
  if (!calendar || !drive) return { available: false, reason: 'URI de retour Google incomplète' };
  const normalizedCalendar = normalizeRedirectUri(calendar, '/integrations/google/callback');
  const normalizedDrive = normalizeRedirectUri(drive, '/cloud/google/callback');
  if (!normalizedCalendar || !normalizedDrive) return { available: false, reason: 'URI de retour Google invalide' };
  return { available: true, value: `${normalizedCalendar}\n${normalizedDrive}` };
}

/** Backend effectif, aligné sur storage.ts : un bucket renseigné active S3 même si le mode est vide. */
export function storageSignature(env) {
  const declared = valueOf(env, 'AURION_STORAGE_BACKEND').toLowerCase();
  const bucket = valueOf(env, 'AURION_S3_BUCKET');
  if (declared && !['local', 's3'].includes(declared)) {
    return { available: false, reason: 'backend de stockage non reconnu' };
  }
  if (declared === 's3' || bucket) return { available: true, value: 's3' };
  return { available: true, value: 'local' };
}

/** Mode Stripe déduit de la clé ; la clé elle-même n'est jamais conservée dans le rapport. */
export function stripeSignature(env) {
  const key = valueOf(env, 'STRIPE_SECRET_KEY');
  if (/^(?:sk|rk)_live_/.test(key)) return { available: true, value: 'live' };
  if (/^(?:sk|rk)_test_/.test(key)) return { available: true, value: 'test' };
  const declared = valueOf(env, 'AURION_STRIPE_MODE').toLowerCase();
  if (declared) {
    return ['disabled', 'test', 'live'].includes(declared)
      ? { available: true, value: declared }
      : { available: false, reason: 'mode Stripe déclaré invalide' };
  }
  if (!key) return { available: true, value: 'disabled' };
  return { available: false, reason: 'mode Stripe indéterminable' };
}

export function normalizeMigrationVersion(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,4})(?:_|$)/);
  return match ? match[1].padStart(3, '0') : null;
}

export function latestMigrationVersion() {
  try {
    let latest = null;
    for (const file of readdirSync(MIGRATIONS_DIR)) {
      const match = file.match(/^(\d+)_[^/]+\.sql$/i);
      if (!match) continue;
      const version = Number(match[1]);
      if (latest === null || version > latest) latest = version;
    }
    return latest === null ? null : String(latest).padStart(3, '0');
  } catch {
    return null;
  }
}

export function migrationSignature(env, environment) {
  const explicit = valueOf(env, 'AURION_MIGRATION_VERSION');
  const raw = explicit || (environment === 'local' ? latestMigrationVersion() : '');
  const normalized = normalizeMigrationVersion(raw);
  return normalized
    ? { available: true, value: normalized }
    : { available: false, reason: 'version des migrations indisponible' };
}

export function normalizeBuildSha(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(text)) return null;
  return text.slice(0, 12);
}

function localGitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function buildSignature(env, environment) {
  const explicit = firstValue(env, ['AURION_BUILD_SHA', 'RENDER_GIT_COMMIT', 'GIT_COMMIT', 'SOURCE_VERSION', 'VERCEL_GIT_COMMIT_SHA']);
  const raw = explicit || (environment === 'local' ? localGitSha() : '');
  const normalized = normalizeBuildSha(raw);
  return normalized
    ? { available: true, value: normalized }
    : { available: false, reason: 'SHA du build indisponible' };
}

function toMap(value) {
  return value instanceof Map ? value : new Map(Object.entries(value || {}));
}

function compareField(id, label, envs, compute) {
  const cells = {};
  const groups = new Map();
  const warnings = [];
  let nextGroup = 0;
  for (const environment of ENV_LABELS) {
    let result;
    try {
      result = compute(envs[environment], environment);
    } catch {
      result = { available: false, reason: 'signature indisponible' };
    }
    if (!result || !result.available) {
      cells[environment] = { available: false };
      warnings.push(`${environment} : ${result?.reason || 'signature indisponible'}`);
      continue;
    }
    const key = String(result.value);
    if (!groups.has(key)) groups.set(key, ++nextGroup);
    const cell = { available: true, group: groups.get(key) };
    if (result.counts) cell.counts = result.counts;
    cells[environment] = cell;
  }
  const available = ENV_LABELS.filter(environment => cells[environment].available);
  let status = 'unavailable';
  if (available.length === ENV_LABELS.length) {
    status = new Set(available.map(environment => cells[environment].group)).size === 1 ? 'identical' : 'different';
  }
  return { id, label, status, cells, warnings };
}

export function compareEnvironments({ local, staging, production, referenceNames } = {}) {
  const envs = { local: toMap(local), staging: toMap(staging), production: toMap(production) };
  const names = referenceNames || defaultVariableNames(envs);
  const fields = [
    compareField('variables', 'Noms de variables', envs, env => {
      const present = names.filter(name => env.has(name));
      return {
        available: true,
        value: present.join('\n'),
        counts: { present: present.length, expected: names.length },
      };
    }),
    compareField('google', 'URI de retour Google', envs, googleSignature),
    compareField('storage', 'Backend de stockage', envs, storageSignature),
    compareField('stripe', 'Mode Stripe', envs, stripeSignature),
    compareField('migrations', 'Version des migrations', envs, migrationSignature),
    compareField('build', 'SHA du build', envs, buildSignature),
  ];
  const summary = { identical: 0, different: 0, unavailable: 0 };
  for (const field of fields) summary[field.status] += 1;
  return {
    environments: ENV_LABELS,
    variableNameCount: names.length,
    fields,
    summary,
    warnings: [...new Set(fields.flatMap(field => field.warnings))],
    ok: summary.different === 0 && summary.unavailable === 0,
  };
}

function cellText(cell) {
  if (!cell.available) return '—';
  return cell.counts ? `${cell.group} (${cell.counts.present}/${cell.counts.expected})` : String(cell.group);
}

export function renderReport(report) {
  const rows = [
    ['Champ', ...report.environments, 'Parité'],
    ...report.fields.map(field => [
      field.label,
      ...report.environments.map(environment => cellText(field.cells[environment])),
      STATUS_LABELS[field.status],
    ]),
  ];
  const widths = rows[0].map((_value, index) => Math.max(...rows.map(row => row[index].length)));
  const line = row => row.map((value, index) => value.padEnd(widths[index])).join('  ').trimEnd();
  const conclusion = report.summary.different && report.summary.unavailable
    ? 'ÉCARTS ET INCOMPLET'
    : report.summary.unavailable
      ? 'INCOMPLET'
      : report.summary.different
        ? 'ÉCARTS'
        : 'PARITÉ';
  const lines = [
    'Doctor de parité — local / staging / production',
    'Aucune valeur, aucun nom de variable, aucune URI et aucun secret ne sont affichés.',
    '',
    line(rows[0]),
    line(widths.map(width => '-'.repeat(width))),
    ...rows.slice(1).map(line),
    '',
    `Bilan : ${report.summary.identical} identique(s) · ${report.summary.different} écart(s) · ${report.summary.unavailable} indisponible(s)`,
    `Conclusion : ${conclusion}`,
  ];
  if (report.warnings.length) {
    lines.push('', 'Indisponibilités :', ...report.warnings.map(warning => `- ${warning}`));
  }
  lines.push(
    '',
    'Les chiffres sont des références opaques : deux environnements avec le même chiffre partagent la même signature.',
  );
  return lines.join('\n');
}

export function reportToJson(report, { strict = false } = {}) {
  return {
    tool: 'aurion-parity-doctor',
    schemaVersion: 1,
    environments: report.environments,
    variableNameCount: report.variableNameCount,
    fields: report.fields.map(field => ({
      id: field.id,
      label: field.label,
      status: field.status,
      cells: Object.fromEntries(report.environments.map(environment => {
        const cell = field.cells[environment];
        return [environment, cell.available
          ? { group: cell.group, ...(cell.counts ? { counts: cell.counts } : {}) }
          : { available: false }];
      })),
    })),
    summary: report.summary,
    ok: report.ok,
    warnings: report.warnings,
    strict,
    exitCode: strict && !report.ok ? 1 : 0,
  };
}

export function parseCli(argv = []) {
  const options = { paths: {}, json: false, strict: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--strict') {
      options.strict = true;
      continue;
    }
    if (argument === '--local' || argument === '--staging' || argument === '--production') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new UsageError(`Option ${argument} sans fichier.`);
      options.paths[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new UsageError('Option inconnue.');
  }
  return options;
}

export function main(argv = process.argv.slice(2), io = console) {
  let options;
  try {
    options = parseCli(argv);
  } catch (error) {
    io.error(`Doctor de parité : ${error.message}`);
    io.error(USAGE);
    return 2;
  }
  if (options.help) {
    io.log(USAGE);
    return 0;
  }
  const missing = ENV_LABELS.filter(environment => !options.paths[environment]);
  if (missing.length) {
    io.error('Doctor de parité : les trois fichiers --local, --staging et --production sont requis.');
    io.error(USAGE);
    return 2;
  }
  try {
    const envs = Object.fromEntries(ENV_LABELS.map(environment => [
      environment,
      readEnvironmentFile(options.paths[environment], environment),
    ]));
    const report = compareEnvironments(envs);
    io.log(options.json
      ? JSON.stringify(reportToJson(report, { strict: options.strict }), null, 2)
      : renderReport(report));
    return options.strict && !report.ok ? 1 : 0;
  } catch (error) {
    const failure = {
      error: error.code || 'PARITY_DOCTOR_FAILED',
      environment: error.environment || null,
    };
    if (options.json) io.error(JSON.stringify(failure));
    else io.error(`Doctor de parité : ${error.environment ? `${error.environment} : ` : ''}${error.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = main();
