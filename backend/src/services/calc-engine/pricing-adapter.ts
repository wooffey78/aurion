import { computePricing, type PricingInput, type PricingResult, type PricingContribution } from '../pricing.js';
import { calculate, calcEngineMode, CalcEngineError, ENGINE_VERSION, type CalcEngineResult } from './engine.js';

/**
 * Adaptateur « pricing » : correspondance exhaustive entre les entrées du moteur applicatif
 * (computePricing) et les plages nommées du classeur, puis reconstruction du résultat.
 * Les validations reproduisent exactement celles du moteur (mêmes plages num(), mêmes
 * conversions virgule → point) : une donnée refusée par l'un est refusée par l'autre.
 */

type WorkbookInputs = Record<string, number | string | undefined>;

function num(value: unknown, name: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new CalcEngineError('INVALID_INPUT', `Valeur invalide : ${name}`);
  }
  return n;
}
const optional = (value: unknown): number | null =>
  value === undefined || value === null || value === '' ? null : num(value, 'valeur facultative', 0, 1e9);

export interface ContributionSpec { name: string; basis: 'ca_ht' | 'gross_margin' | 'profit'; mandatory: boolean; rate: number }

/** Normalisation des cotisations — identique au moteur : sans cotisation détaillée et avec un
 * taux agrégé fourni, une cotisation unique sur CA HT est créée. */
export function normalizeContributions(input: PricingInput): ContributionSpec[] {
  let contributions: { name?: unknown; rate?: unknown; basis?: unknown; mandatory?: unknown }[] =
    Array.isArray(input.contributions) ? [...input.contributions] : [];
  if (!contributions.length && input.urssafRate !== undefined && input.urssafRate !== null && input.urssafRate !== '') {
    contributions = [{ name: 'Cotisations sociales', rate: input.urssafRate, basis: 'ca_ht', mandatory: true }];
  }
  if (contributions.length > 5) {
    throw new CalcEngineError('INVALID_INPUT', 'Le classeur moteur accepte au plus 5 cotisations détaillées');
  }
  return contributions.map(contribution => {
    const rate = num(contribution.rate, 'taux de cotisation', 0, 99.99);
    const basis = String(contribution.basis || 'ca_ht');
    return {
      name: String(contribution.name || 'Cotisation'),
      basis: basis === 'gross_margin' || basis === 'profit' ? basis : 'ca_ht',
      mandatory: contribution.mandatory !== false,
      rate,
    };
  });
}

export function pricingToWorkbookInputs(input: PricingInput): WorkbookInputs {
  const internalMileageRate = input.mileageInternalRate == null || input.mileageInternalRate === ''
    ? undefined : num(input.mileageInternalRate, 'coût kilométrique interne', 0, 1e4);
  const clientMileageRate = input.mileageClientRate == null || input.mileageClientRate === ''
    ? undefined : num(input.mileageClientRate, 'tarif kilométrique client', 0, 1e4);
  const inputs: WorkbookInputs = {
    IN_DOC_PART_COST: num(input.partCost, 'pièce', 0, 1e9),
    IN_DOC_SHIPPING_COST: num(input.shippingCost, 'livraison', 0, 1e9),
    IN_DOC_CONSUMABLES_COST: num(input.consumablesCostHt, 'consommables', 0, 1e9),
    IN_DOC_PART_QUANTITY: Math.max(1, num(input.partQuantity, 'quantité de pièces', 1, 1e7)),
    IN_DOC_LABOR_INTERNAL_COST: num(input.laborInternalCostHt, 'coût interne main-d’œuvre', 0, 1e9),
    IN_DOC_MILEAGE_KM: num(input.mileageKm, 'kilométrage', 0, 1e7),
    IN_DOC_MILEAGE_LEGACY_RATE: num(input.mileageRate, 'frais kilométriques', 0, 1e4),
    IN_DOC_VAT_RATE: num(input.vatRate, 'TVA', 0, 100),
    IN_DOC_TARGET_TTC: num(input.targetTtc, 'prix TTC', 0, 1e9),
    IN_DOC_TARGET_NET: num(input.targetNet, 'résultat net', -1e9, 1e9),
    IN_DOC_DISCOUNT_TTC: num(input.discountTtc, 'remise', 0, 1e9),
    IN_DOC_DRIVER: input.driver === 'net' ? 'net' : 'ttc',
    IN_DOC_MILEAGE_MODE: input.mileageMode === 'client_price' ? 'client_price' : 'margin',
    IN_DOC_COEFFICIENT_VALUE: Math.max(0, num(input.coefficientValue ?? input.coefficientPercent, 'coefficient', 0, 1e6)),
    IN_DOC_COEFFICIENT_UNIT: input.coefficientUnit === 'euro' ? 'euro' : 'percent',
    IN_DOC_COEFFICIENT_BASIS: String(input.coefficientBasis || 'purchase'),
  };
  if (internalMileageRate != null) inputs.IN_DOC_MILEAGE_INTERNAL_RATE = internalMileageRate;
  if (clientMileageRate != null) inputs.IN_DOC_MILEAGE_CLIENT_RATE = clientMileageRate;
  const laborSelling = input.laborSellingHt === undefined || input.laborSellingHt === null || input.laborSellingHt === ''
    ? null : num(input.laborSellingHt, 'prix de vente main-d’œuvre', 0, 1e9);
  if (laborSelling != null) inputs.IN_DOC_LABOR_SELLING = laborSelling;
  // Normalisation des cotisations — identique au moteur : sans cotisation détaillée et avec un
  // taux agrégé fourni, une cotisation unique sur CA HT est créée.
  const specs = normalizeContributions(input);
  specs.forEach((spec, index) => {
    const i = index + 1;
    inputs[`IN_CONTRIBUTION_${i}_RATE`] = spec.rate;
    inputs[`IN_CONTRIBUTION_${i}_NAME`] = spec.name;
    inputs[`IN_CONTRIBUTION_${i}_BASIS`] = spec.basis;
  });
  return inputs;
}

const r2 = (value: unknown): number => Math.round(Number(value || 0) * 100) / 100;
const r6 = (value: unknown): number => Math.round(Number(value || 0) * 1e6) / 1e6;
const o = (outputs: Record<string, unknown>, name: string): unknown => outputs[name] ?? 0;
const boolOf = (value: unknown): boolean => Number(value || 0) === 1;

const BASIS_LABELS: Record<string, string> = { gm: 'gross_margin', pr: 'profit', ca: 'ca_ht' };

export function engineOutputsToPricingResult(outputs: Record<string, number | string>, specs: ContributionSpec[] = []): PricingResult {
  const rows: PricingContribution[] = specs.map((spec, index) => ({
    name: spec.name,
    rate: r2(o(outputs, `OUT_QUOTE_CONTRIBUTION_${index + 1}_RATE`)),
    basis: spec.basis,
    amount: r2(o(outputs, `OUT_QUOTE_CONTRIBUTION_${index + 1}_AMOUNT`)),
    mandatory: spec.mandatory,
  }));
  const grossMargin = r2(o(outputs, 'OUT_QUOTE_GROSS_MARGIN'));
  const netResultRate = r2(o(outputs, 'OUT_QUOTE_NET_RESULT_RATE'));
  return {
    purchaseHt: r2(o(outputs, 'OUT_QUOTE_PURCHASE_HT')),
    coefficientMarkupHt: r2(o(outputs, 'OUT_QUOTE_COEFFICIENT_MARKUP_HT')),
    shippingHt: r2(o(outputs, 'OUT_QUOTE_SHIPPING_HT')),
    directCostsHt: r2(o(outputs, 'OUT_QUOTE_DIRECT_COSTS_HT')),
    consumablesCostHt: r2(o(outputs, 'OUT_QUOTE_CONSUMABLES_COST_HT')),
    internalLaborCostHt: r2(o(outputs, 'OUT_QUOTE_INTERNAL_LABOR_COST_HT')),
    mileageKm: r6(o(outputs, 'OUT_QUOTE_MILEAGE_KM')),
    mileageInternalRate: r2(o(outputs, 'OUT_QUOTE_MILEAGE_INTERNAL_TOTAL')),
    mileageClientRate: r2(o(outputs, 'OUT_QUOTE_MILEAGE_CLIENT_TOTAL')),
    mileageTotal: r2(o(outputs, 'OUT_QUOTE_MILEAGE_TOTAL')),
    billedMileageHt: r2(o(outputs, 'OUT_QUOTE_BILLED_MILEAGE_HT')),
    mileageBilledTtc: r2(o(outputs, 'OUT_QUOTE_MILEAGE_BILLED_TTC')),
    totalHt: r2(o(outputs, 'OUT_QUOTE_TOTAL_HT')),
    vat: r2(o(outputs, 'OUT_QUOTE_VAT')),
    totalTtc: r2(o(outputs, 'OUT_QUOTE_TOTAL_TTC')),
    listPriceTtc: r2(o(outputs, 'OUT_QUOTE_LIST_PRICE_TTC')),
    discountTtc: r2(o(outputs, 'OUT_QUOTE_DISCOUNT_TTC')),
    baseTargetTtc: r2(o(outputs, 'OUT_QUOTE_BASE_TTC')),
    baseTtc: r2(o(outputs, 'OUT_QUOTE_BASE_TTC')),
    baseRevenueHt: r2(o(outputs, 'OUT_QUOTE_BASE_REVENUE_HT')),
    laborHt: grossMargin,
    laborSellingHt: r2(o(outputs, 'OUT_QUOTE_LABOR_SELLING_HT')),
    grossMargin,
    grossMarginRate: r2(o(outputs, 'OUT_QUOTE_GROSS_MARGIN_RATE')),
    markupRate: r2(o(outputs, 'OUT_QUOTE_MARKUP_RATE')),
    contributionsTotal: r2(o(outputs, 'OUT_QUOTE_CONTRIBUTIONS_TOTAL')),
    contributions: rows,
    urssafEstimate: rows[0]?.amount || 0,
    netMargin: r2(o(outputs, 'OUT_QUOTE_NET_MARGIN')),
    netResult: r2(o(outputs, 'OUT_QUOTE_NET_RESULT')),
    marginRate: netResultRate,
    netResultRate,
    minimumSellingHt: r2(o(outputs, 'OUT_QUOTE_MINIMUM_SELLING_HT')),
    belowMinimumPrice: boolOf(o(outputs, 'OUT_QUOTE_BELOW_MINIMUM_PRICE')),
    loss: boolOf(o(outputs, 'OUT_QUOTE_LOSS')),
    driver: (String(o(outputs, 'OUT_QUOTE_DRIVER') || 'ttc') === 'net' ? 'net' : 'ttc') as PricingResult['driver'],
    mileageMode: (String(o(outputs, 'OUT_QUOTE_MILEAGE_MODE') || 'margin') === 'client_price' ? 'client_price' : 'margin') as PricingResult['mileageMode'],
  };
}

/** Calcule un document via le classeur (recalcul LibreOffice réel). */
export async function calculatePricingXlsx(input: PricingInput): Promise<{ result: PricingResult; raw: CalcEngineResult }> {
  const raw = await calculate(pricingToWorkbookInputs(input));
  return { result: engineOutputsToPricingResult(raw.outputs, normalizeContributions(input)), raw };
}

const NUMERIC_FIELDS: (keyof PricingResult)[] = [
  'purchaseHt', 'coefficientMarkupHt', 'shippingHt', 'directCostsHt', 'consumablesCostHt', 'internalLaborCostHt',
  'mileageKm', 'mileageInternalRate', 'mileageClientRate', 'mileageTotal', 'billedMileageHt', 'mileageBilledTtc',
  'totalHt', 'vat', 'totalTtc', 'listPriceTtc', 'discountTtc', 'baseTargetTtc', 'baseTtc', 'baseRevenueHt',
  'laborHt', 'laborSellingHt', 'grossMargin', 'grossMarginRate', 'markupRate', 'contributionsTotal',
  'urssafEstimate', 'netMargin', 'netResult', 'marginRate', 'netResultRate', 'minimumSellingHt',
];

/** Rapport de divergences ancien moteur ↔ classeur (Phase C — double calcul). */
export function comparePricingResults(legacy: PricingResult, engine: PricingResult): { field: string; legacy: unknown; engine: unknown }[] {
  const divergences: { field: string; legacy: unknown; engine: unknown }[] = [];
  for (const field of NUMERIC_FIELDS) {
    const a = Number(legacy[field] ?? 0);
    const b = Number(engine[field] ?? 0);
    if (Math.abs(a - b) > 1e-9) divergences.push({ field: String(field), legacy: a, engine: b });
  }
  for (const field of ['belowMinimumPrice', 'loss', 'driver', 'mileageMode'] as const) {
    const a = legacy[field];
    const b = engine[field];
    const aNorm = typeof a === 'boolean' ? (a ? 1 : 0) : a;
    const bNorm = typeof b === 'boolean' ? (b ? 1 : 0) : b;
    if (String(aNorm) !== String(bNorm)) divergences.push({ field, legacy: aNorm, engine: bNorm });
  }
  const legacyTotal = (legacy.contributions || []).reduce((s, c) => s + c.amount, 0);
  const engineTotal = (engine.contributions || []).reduce((s, c) => s + c.amount, 0);
  if (Math.abs(legacyTotal - engineTotal) > 0.005) {
    divergences.push({ field: 'contributions.sum', legacy: legacyTotal, engine: engineTotal });
  }
  return divergences;
}

export interface PricingEngineOutcome {
  result: PricingResult;
  mode: 'legacy' | 'dual' | 'xlsx';
  engine: { traceId: string; durationMs: number; recalcMs: number; workbookVersion: string } | null;
  divergences: { field: string; legacy: unknown; engine: unknown }[];
  engineError: string | null;
}

/**
 * Point d'entrée unique pour les appels métier : exécute l'ancien moteur (référence), puis,
 * selon AURION_CALC_ENGINE — dual : compare sans modifier le résultat servi ; xlsx : sert le
 * résultat du classeur (Phase E) et laisse remonter toute erreur (règle 12 : jamais de repli
 * silencieux) ; legacy : aucun calcul classeur.
 */
export async function pricingWithWorkbookEngine(input: PricingInput, legacy: PricingResult): Promise<PricingEngineOutcome> {
  const mode = calcEngineMode();
  if (mode === 'legacy') return { result: legacy, mode, engine: null, divergences: [], engineError: null };
  try {
    const { result, raw } = await calculatePricingXlsx(input);
    const divergences = comparePricingResults(legacy, result);
    console.log('[calc-engine]', JSON.stringify({
      ts: new Date().toISOString(), event: 'dual-compare', mode, engineVersion: ENGINE_VERSION,
      traceId: raw.traceId, workbookVersion: raw.workbookVersion, durationMs: raw.durationMs,
      recalcMs: raw.recalcMs, divergenceCount: divergences.length,
      divergences: divergences.slice(0, 12),
    }));
    return { result: mode === 'xlsx' ? result : legacy, mode, engine: { traceId: raw.traceId, durationMs: raw.durationMs, recalcMs: raw.recalcMs, workbookVersion: raw.workbookVersion }, divergences, engineError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('[calc-engine]', JSON.stringify({
      ts: new Date().toISOString(), event: 'dual-error', mode, engineVersion: ENGINE_VERSION,
      code: error instanceof CalcEngineError ? error.code : 'UNKNOWN', message,
    }));
    if (mode === 'xlsx') throw error;
    return { result: legacy, mode, engine: null, divergences: [], engineError: message };
  }
}
