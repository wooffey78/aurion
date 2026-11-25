import AdmZip from 'adm-zip';
import { promises as fs, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCells, writeCells, worksheetPath, type CellValue } from './xlsx-io.js';

/**
 * Moteur de calcul Aurion — exécution du classeur central `aurion-moteur-calcul.xlsx`.
 * Cycle (prompt §7) : demande → vérification des données → plages nommées → instance isolée du
 * classeur (copie temporaire) → écriture des entrées (valeurs, jamais des formules) → recalcul
 * complet réel (LibreOffice, recalcul forcé au chargement) → lecture des sorties → vérification
 * des cellules de contrôle → résultat structuré → traçabilité → nettoyage.
 * Règle 12 du référentiel : un échec est signalé clairement, jamais remplacé par une valeur par défaut.
 */

export const ENGINE_VERSION = '1.0.0';

export type CalcEngineErrorCode =
  | 'LIBREOFFICE_MISSING' | 'WORKBOOK_MISSING' | 'WORKBOOK_CORRUPT' | 'WORKBOOK_INCOMPATIBLE'
  | 'MAPPING_MISSING' | 'INVALID_INPUT' | 'UNKNOWN_INPUT' | 'RECALC_FAILED' | 'CONTROLS_FAILED'
  | 'TIMEOUT' | 'INVALID_RESULT';

export class CalcEngineError extends Error {
  code: CalcEngineErrorCode;
  detail?: unknown;
  constructor(code: CalcEngineErrorCode, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export interface CalcEngineMappingInput { sheet: string; cell: string; type: string; unit: string; description: string }
export interface CalcEngineMappingTable { key: string; sheet: string; firstRow: number; lastRow: number; columns: Record<string, string>; description: string }
export interface CalcEngineMapping {
  workbookVersion: string; engineRequires: string; updated: string; sheets: string[];
  inputs: Record<string, CalcEngineMappingInput>;
  outputs: Record<string, CalcEngineMappingInput>;
  params: Record<string, CalcEngineMappingInput>;
  tables: CalcEngineMappingTable[];
}

export interface CalcEngineResult {
  outputs: Record<string, number | string>;
  controls: { status: string; failed: number; failedChecks: string[] };
  workbookVersion: string;
  durationMs: number;
  recalcMs: number;
  traceId: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultModelPath = path.resolve(here, '../../../assets/engine/aurion-moteur-calcul.xlsx');
const defaultMappingPath = path.resolve(here, '../../../assets/engine/engine-mapping.json');

const modelPath = () => process.env.AURION_CALC_MODEL_PATH || defaultModelPath;
const mappingPath = () => process.env.AURION_CALC_MAPPING_PATH || defaultMappingPath;
export const calcEngineMode = (): 'legacy' | 'dual' | 'xlsx' => {
  const raw = String(process.env.AURION_CALC_ENGINE || 'legacy').toLowerCase();
  return raw === 'dual' || raw === 'xlsx' ? raw : 'legacy';
};
const timeoutMs = () => Math.max(2000, Number(process.env.AURION_CALC_TIMEOUT_MS || 20000));
const concurrencyLimit = () => Math.max(1, Number(process.env.AURION_CALC_CONCURRENCY || 1));

let cachedMappingPath = '';
let cachedMapping: CalcEngineMapping | null = null;
let cachedModelPath = '';
let contractCheckedPath = '';
let cachedModel: Buffer | null = null;

async function loadMapping(): Promise<CalcEngineMapping> {
  if (cachedMapping && cachedMappingPath === mappingPath()) return cachedMapping;
  if (!existsSync(mappingPath())) throw new CalcEngineError('MAPPING_MISSING', `Contrat de correspondance introuvable : ${mappingPath()}`);
  try {
    cachedMapping = JSON.parse(await fs.readFile(mappingPath(), 'utf8')) as CalcEngineMapping;
    cachedMappingPath = mappingPath();
  } catch (error: any) {
    throw new CalcEngineError('MAPPING_MISSING', 'Contrat de correspondance illisible', error?.message);
  }
  return cachedMapping;
}
async function loadModel(): Promise<{ zip: AdmZip; workbookVersion: string; mapping: CalcEngineMapping }> {
  const mapping = await loadMapping();
  if (!existsSync(modelPath())) throw new CalcEngineError('WORKBOOK_MISSING', `Classeur moteur absent : ${modelPath()}`);
  if (!cachedModel || cachedModelPath !== modelPath()) {
    cachedModel = await fs.readFile(modelPath());
    cachedModelPath = modelPath();
  }
  let zip: AdmZip;
  try {
    zip = new AdmZip(cachedModel);
    // Fichier réellement exploitable : le classeur doit contenir la feuille d'accueil.
    worksheetPath(zip, mapping.sheets[0]);
  } catch (error: any) {
    throw new CalcEngineError('WORKBOOK_CORRUPT', 'Classeur moteur illisible ou corrompu', error?.message);
  }
  if (mapping.engineRequires !== ENGINE_VERSION) {
    throw new CalcEngineError('WORKBOOK_INCOMPATIBLE', `Classeur ${mapping.workbookVersion} requiert le moteur ${mapping.engineRequires} ; moteur présent : ${ENGINE_VERSION}`);
  }
  // 15.4.69 — le contrat est vérifié une seule fois par classeur : une sortie mappée absente
  // faisait échouer le calcul APRÈS un recalcul LibreOffice complet (20 s perdues) ; elle est
  // désormais refusée immédiatement, avec la liste des cellules manquantes.
  if (contractCheckedPath !== modelPath()) {
    const missing = missingMappedCells(zip, mapping, 'outputs');
    if (missing.length) {
      throw new CalcEngineError('WORKBOOK_INCOMPATIBLE', `Classeur incomplet : ${missing.length} sortie(s) du contrat absente(s)`, { missing: missing.slice(0, 8) });
    }
    contractCheckedPath = modelPath();
  }
  return { zip, workbookVersion: mapping.workbookVersion, mapping };
}

export function findSoffice(): string | null {
  if (process.env.AURION_SOFFICE_PATH && existsSync(process.env.AURION_SOFFICE_PATH)) return process.env.AURION_SOFFICE_PATH;
  for (const candidate of ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice']) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** File d'attente : limite les recalculs simultanés (LibreOffice ≈ 150-300 Mo par instance). */
class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  // 15.4.69 — champ déclaré puis affecté (et non « parameter property ») : le moteur reste
  // importable tel quel par le vérificateur de types de Node, sans compilation préalable.
  private readonly limit: number;
  constructor(limit: number) { this.limit = limit; }
  async acquire(): Promise<void> {
    if (this.active < this.limit) { this.active++; return; }
    await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}
const semaphore = new Semaphore(concurrencyLimit());

const RECALC_PROFILE_XCU = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`;

interface RecalcOutcome { zip: AdmZip; recalcMs: number }

async function recalculate(inputZip: AdmZip, workDir: string): Promise<RecalcOutcome> {
  const soffice = findSoffice();
  if (!soffice) throw new CalcEngineError('LIBREOFFICE_MISSING', 'LibreOffice indisponible sur ce serveur : recalcul du classeur impossible.');
  const profileDir = path.join(workDir, 'profile');
  await mkdir(path.join(profileDir, 'user'), { recursive: true });
  await writeFile(path.join(profileDir, 'user', 'registrymodifications.xcu'), RECALC_PROFILE_XCU, 'utf8');
  const inputPath = path.join(workDir, 'calcul.xlsx');
  const outDir = path.join(workDir, 'out');
  await mkdir(outDir, { recursive: true });
  await writeFile(inputPath, inputZip.toBuffer());
  const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(soffice, [
      '--headless', '--norestore', '--nologo', '--nofirststartwizard', '--nolockcheck',
      `-env:UserInstallation=${pathToFileUrl(profileDir)}`,
      '--convert-to', 'xlsx', '--outdir', outDir, inputPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new CalcEngineError('TIMEOUT', `Recalcul du classeur dépassé (${timeoutMs()} ms)`));
    }, timeoutMs());
    child.on('error', error => { clearTimeout(timer); reject(new CalcEngineError('RECALC_FAILED', 'Lancement de LibreOffice impossible', error?.message)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && existsSync(path.join(outDir, 'calcul.xlsx'))) resolve();
      else reject(new CalcEngineError('RECALC_FAILED', `Recalcul interrompu (code ${code})`, stderr.slice(0, 800)));
    });
  });
  const recalcMs = Date.now() - started;
  return { zip: new AdmZip(path.join(outDir, 'calcul.xlsx')), recalcMs };
}
function pathToFileUrl(p: string): string {
  return 'file://' + p.split(path.sep).map(seg => encodeURIComponent(seg)).join('/');
}

export type CalcInputs = Record<string, CellValue | undefined>;

function round6(value: number): number { return Math.round(value * 1e6) / 1e6; }

/**
 * Exécute le classeur sur une copie isolée et renvoie les sorties mappées.
 * Les entrées sont validées contre le contrat (mapping.inputs) : entrée inconnue, non numérique
 * ou trop longue refusée avant tout lancement de LibreOffice.
 */
export async function calculate(rawInputs: CalcInputs, options: { traceId?: string } = {}): Promise<CalcEngineResult> {
  const traceId = options.traceId || `calc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  await semaphore.acquire();
  let workDir: string | null = null;
  try {
    const { zip, workbookVersion, mapping } = await loadModel();
    // 2-3) Vérification des données et résolution des plages nommées (contrat mapping).
    const writes: Record<string, CellValue> = {};
    for (const [name, value] of Object.entries(rawInputs)) {
      const meta = mapping.inputs[name];
      if (!meta) throw new CalcEngineError('UNKNOWN_INPUT', `Entrée inconnue pour le classeur : ${name}`);
      if (value === undefined || value === null || value === '') continue; // facultatif = cellule vide
      if (meta.type === 'number') {
        const numeric = typeof value === 'string' ? Number(String(value).trim().replace(',', '.')) : Number(value);
        if (!Number.isFinite(numeric)) throw new CalcEngineError('INVALID_INPUT', `Entrée non numérique : ${name}=${JSON.stringify(value)}`);
        writes[name] = round6(numeric);
      } else {
        const text = String(value);
        if (text.length > 500) throw new CalcEngineError('INVALID_INPUT', `Entrée trop longue : ${name}`);
        writes[name] = text;
      }
    }
    writes.WORKBOOK_VERSION_EXPECTED = workbookVersion;
    // Écriture groupée par feuille, cellules cibles issues du contrat (jamais de coordonnées codées).
    const byWriteSheet = new Map<string, Record<string, CellValue>>();
    for (const [name, value] of Object.entries(writes)) {
      const meta = mapping.inputs[name];
      if (!byWriteSheet.has(meta.sheet)) byWriteSheet.set(meta.sheet, {});
      byWriteSheet.get(meta.sheet)![meta.cell] = value;
    }
    for (const [sheetName, values] of byWriteSheet) writeCells(zip, sheetName, values);
    // 5-6-7) Instance isolée + recalcul complet réel.
    workDir = await mkdtemp(path.join(os.tmpdir(), 'aurion-calc-'));
    const { zip: resultZip, recalcMs } = await recalculate(zip, workDir);
    // 8-10) Contrôles puis lecture des sorties.
    const outAddrs = Object.entries(mapping.outputs).map(([name, meta]) => ({ name, sheet: meta.sheet, cell: meta.cell }));
    const bySheet = new Map<string, { name: string; cell: string }[]>();
    for (const item of outAddrs) {
      if (!bySheet.has(item.sheet)) bySheet.set(item.sheet, []);
      bySheet.get(item.sheet)!.push(item);
    }
    const outputs: Record<string, number | string> = {};
    for (const [sheetName, items] of bySheet) {
      const values = readCells(resultZip, sheetName, items.map(i => i.cell));
      for (const item of items) {
        const v = values[item.cell];
        if (v === undefined) throw new CalcEngineError('INVALID_RESULT', `Sortie absente du résultat recalculé : ${item.name} (${sheetName}!${item.cell})`);
        outputs[item.name] = typeof v === 'number' ? round6(v) : v;
      }
    }
    const status = String(outputs.OUT_CONTROLS_STATUS ?? 'KO');
    const failed = Number(outputs.OUT_CONTROLS_FAILED ?? 1);
    const failedChecks = Object.entries(mapping.outputs)
      .filter(([name]) => name.startsWith('CHK_') && Number(outputs[name] ?? 0) !== 1)
      .map(([name]) => name);
    if (status !== 'OK' || failed !== 0 || failedChecks.length) {
      throw new CalcEngineError('CONTROLS_FAILED', 'Contrôles de cohérence du classeur en échec', { status, failed, failedChecks });
    }
    const durationMs = Date.now() - started;
    trace({ traceId, event: 'calculate', status: 'OK', workbookVersion, durationMs, recalcMs, inputs: Object.keys(rawInputs).length });
    return { outputs, controls: { status, failed, failedChecks }, workbookVersion, durationMs, recalcMs, traceId };
  } catch (error) {
    trace({ traceId, event: 'calculate', status: 'ERROR', code: error instanceof CalcEngineError ? error.code : 'UNKNOWN', message: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    semaphore.release();
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
/** 15.4.69 — contrôle du contrat classeur : chaque cellule mappée doit exister dans sa feuille. */
function missingMappedCells(zip: AdmZip, mapping: CalcEngineMapping, kind: 'inputs' | 'outputs' | 'params'): string[] {
  const bySheet = new Map<string, { name: string; cell: string }[]>();
  for (const [name, meta] of Object.entries(mapping[kind])) {
    if (!bySheet.has(meta.sheet)) bySheet.set(meta.sheet, []);
    bySheet.get(meta.sheet)!.push({ name, cell: meta.cell });
  }
  const missing: string[] = [];
  for (const [sheet, items] of bySheet) {
    let xml = '';
    try { xml = zip.readAsText(worksheetPath(zip, sheet)); } catch { /* feuille absente : toutes ses cellules manquent */ }
    for (const item of items) {
      if (!xml.includes(`<c r="${item.cell}"`)) missing.push(`${item.name} (${sheet}!${item.cell})`);
    }
  }
  return missing;
}

function workbookContract(zip: AdmZip, mapping: CalcEngineMapping) {
  return {
    inputs: Object.keys(mapping.inputs).length,
    outputs: Object.keys(mapping.outputs).length,
    controls: Object.keys(mapping.outputs).filter(name => name.startsWith('CHK_')).length,
    tables: mapping.tables.length,
    missingOutputs: missingMappedCells(zip, mapping, 'outputs'),
    missingInputs: missingMappedCells(zip, mapping, 'inputs'),
  };
}

/** Contrat public du classeur (diagnostic) : cellules mappées présentes, contrôles déclarés. */
export async function inspectWorkbookContract(): Promise<ReturnType<typeof workbookContract>> {
  const mapping = await loadMapping();
  if (!existsSync(modelPath())) throw new CalcEngineError('WORKBOOK_MISSING', `Classeur moteur absent : ${modelPath()}`);
  let zip: AdmZip;
  try { zip = new AdmZip(await fs.readFile(modelPath())); }
  catch (error: any) { throw new CalcEngineError('WORKBOOK_CORRUPT', 'Classeur moteur illisible', error?.message); }
  return workbookContract(zip, mapping);
}

function trace(payload: Record<string, unknown>): void {
  // Traçabilité : version du classeur, durée, statut — jamais de données métier.
  console.log('[calc-engine]', JSON.stringify({ ts: new Date().toISOString(), engineVersion: ENGINE_VERSION, ...payload }));
}

export async function getCalculationStatus(): Promise<{
  engineVersion: string; mode: string; workbookPresent: boolean; workbookVersion: string | null;
  engineRequires: string | null; libreOfficePath: string | null; concurrency: number; timeoutMs: number; modelPath: string;
  contract: ReturnType<typeof workbookContract> | null;
}> {
  const modelPresent = existsSync(modelPath());
  let workbookVersion: string | null = null;
  let contract: ReturnType<typeof workbookContract> | null = null;
  let engineRequires: string | null = null;
  if (modelPresent) {
    try {
      const mapping = await loadMapping();
      engineRequires = mapping.engineRequires;
      const zip = new AdmZip(await fs.readFile(modelPath()));
      const sheet = mapping.sheets[0];
      contract = workbookContract(zip, mapping);
      const versionCell = Object.values(mapping.outputs).find(o => o.sheet === sheet)?.cell;
      if (versionCell) {
        const values = readCells(zip, sheet, [versionCell]);
        workbookVersion = values[versionCell] != null ? String(values[versionCell]) : null;
      }
    } catch { workbookVersion = null; }
  }
  return {
    engineVersion: ENGINE_VERSION, mode: calcEngineMode(), workbookPresent: modelPresent, workbookVersion, engineRequires,
    libreOfficePath: findSoffice(), concurrency: concurrencyLimit(), timeoutMs: timeoutMs(),
    // 15.4.69 — le diagnostic n'expose plus le chemin absolu du serveur : le nom du fichier suffit
    // à l'exploitant et ne révèle pas l'arborescence de l'hôte à un compte authentifié.
    modelPath: path.basename(modelPath()), contract,
  };
}
