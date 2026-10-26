/** Moteur de calcul Aurion v2 — source unique des calculs commerciaux. */
export type Driver = 'ttc' | 'net';
export type MileageMode = 'margin' | 'client_price';
export type ContributionBasis = 'ca_ht' | 'gross_margin' | 'profit';

export interface ContributionInput {
  name?: unknown;
  rate?: unknown;
  basis?: unknown;
  mandatory?: unknown;
}

export interface PricingInput {
  partCost?: unknown;
  shippingCost?: unknown;
  laborSellingHt?: unknown;
  laborInternalCostHt?: unknown;
  mileageKm?: unknown;
  mileageRate?: unknown;
  mileageInternalRate?: unknown;
  mileageClientRate?: unknown;
  vatRate?: unknown;
  urssafRate?: unknown;
  contributions?: ContributionInput[];
  coefficientPercent?: unknown;
  coefficientValue?: unknown;
  coefficientUnit?: unknown;
  partQuantity?: unknown;
  coefficientBasis?: unknown;
  targetTtc?: unknown;
  targetNet?: unknown;
  driver?: unknown;
  mileageMode?: unknown;
  targetIncludesMileage?: unknown;
}

export interface PricingContribution {
  name: string;
  rate: number;
  basis: ContributionBasis;
  amount: number;
  mandatory: boolean;
}

export interface PricingResult {
  purchaseHt: number;
  coefficientMarkupHt: number;
  shippingHt: number;
  directCostsHt: number;
  internalLaborCostHt: number;
  mileageKm: number;
  mileageInternalRate: number;
  mileageClientRate: number;
  mileageTotal: number;
  billedMileageHt: number;
  mileageBilledTtc: number;
  totalHt: number;
  vat: number;
  totalTtc: number;
  baseTargetTtc: number;
  baseTtc: number;
  baseRevenueHt: number;
  laborHt: number;
  laborSellingHt: number;
  grossMargin: number;
  grossMarginRate: number;
  contributionsTotal: number;
  contributions: PricingContribution[];
  urssafEstimate: number;
  netMargin: number;
  netResult: number;
  marginRate: number;
  netResultRate: number;
  minimumSellingHt: number;
  belowMinimumPrice: boolean;
  loss: boolean;
  driver: Driver;
  mileageMode: MileageMode;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function num(value: unknown, name: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Valeur invalide : ${name}`);
  return n;
}

function contributionBasis(value: unknown): ContributionBasis {
  const normalized = String(value || 'ca_ht');
  return normalized === 'gross_margin' ? 'gross_margin' : normalized === 'profit' ? 'profit' : 'ca_ht';
}

export function computePricing(input: PricingInput): PricingResult {
  const part = num(input.partCost, 'pièce', 0, 1e9);
  const ship = num(input.shippingCost, 'livraison', 0, 1e9);
  const km = num(input.mileageKm, 'kilométrage', 0, 1e7);
  const legacyMileage = num(input.mileageRate, 'frais kilométriques', 0, 1e4);
  const internalMileage = input.mileageInternalRate == null || input.mileageInternalRate === ''
    ? legacyMileage
    : num(input.mileageInternalRate, 'coût kilométrique interne', 0, 1e4);
  const clientMileage = input.mileageClientRate == null || input.mileageClientRate === ''
    ? legacyMileage
    : num(input.mileageClientRate, 'tarif kilométrique client', 0, 1e4);
  const mileageInternal = km * internalMileage;
  const mileageClient = km * clientMileage;
  const mileageMode: MileageMode = input.mileageMode === 'client_price' ? 'client_price' : 'margin';
  const vatRate = num(input.vatRate, 'TVA', 0, 100);
  const vr = vatRate / 100;
  const driver: Driver = input.driver === 'net' ? 'net' : 'ttc';
  const unit = input.coefficientUnit === 'euro' ? 'euro' : 'percent';
  const coeff = Math.max(0, num(input.coefficientValue ?? input.coefficientPercent, 'coefficient', 0, 1e6));
  const partQuantity = Math.max(1, num(input.partQuantity, 'quantité de pièces', 1, 1e7));
  // Le coefficient Aurion concerne le coût des pièces. Le mode historique
  // `margin` reste accepté pour compatibilité, mais n'ajoute pas un coefficient
  // au coût fournisseur : il est réservé à la branche de pilotage par marge.
  const appliesToParts = String(input.coefficientBasis || 'purchase') === 'purchase';
  const partMarkup = appliesToParts
    ? (unit === 'percent' ? part * (coeff / 100) : coeff * partQuantity)
    : 0;
  const adjustedPartCostHt = part + partMarkup;
  const internalMileageForMargin = mileageInternal;
  const minimumSellingHt = adjustedPartCostHt + ship + internalMileageForMargin;
  const internalLabor = num(input.laborInternalCostHt, 'coût interne main-d’œuvre', 0, 1e9);
  const explicitLabor = input.laborSellingHt === undefined || input.laborSellingHt === null || input.laborSellingHt === ''
    ? null
    : num(input.laborSellingHt, 'prix de vente main-d’œuvre', 0, 1e9);
  const contributionsInput: ContributionInput[] = Array.isArray(input.contributions) ? [...input.contributions] : [];
  if (!contributionsInput.length && input.urssafRate !== undefined) {
    contributionsInput.push({ name: 'Cotisations sociales', rate: input.urssafRate, basis: 'ca_ht', mandatory: true });
  }
  const targetTtc = num(input.targetTtc, 'prix TTC', 0, 1e9);
  const targetNet = num(input.targetNet, 'résultat net', -1e9, 1e9);
  // Le tarif client au km est saisi en HT : il est ajouté au prix de base puis soumis à la TVA.
  // `targetIncludesMileage` est conservé uniquement pour compatibilité avec les anciens appels.
  const billedMileageHt = mileageMode === 'client_price' ? mileageClient : 0;

  let baseTargetTtc = targetTtc;
  let baseRevenueHt = targetTtc / (1 + vr);
  let totalHt: number;
  let laborSellingHt: number;

  if (driver === 'net' && explicitLabor === null) {
    let assumedRate = 0;
    for (const contribution of contributionsInput) {
      const rate = num(contribution.rate, 'taux de cotisation', 0, 99.99) / 100;
      if (contributionBasis(contribution.basis) === 'ca_ht') assumedRate += rate;
    }
    const direct = adjustedPartCostHt + ship + internalMileageForMargin + internalLabor;
    baseRevenueHt = (targetNet + direct) / Math.max(0.000001, 1 - assumedRate);
    baseTargetTtc = baseRevenueHt * (1 + vr);
    totalHt = baseRevenueHt + billedMileageHt;
    laborSellingHt = Math.max(0, baseRevenueHt - adjustedPartCostHt - ship - internalMileageForMargin);
  } else if (driver === 'net' && explicitLabor !== null) {
    laborSellingHt = explicitLabor;
    baseRevenueHt = adjustedPartCostHt + ship + internalMileageForMargin + laborSellingHt;
    baseTargetTtc = baseRevenueHt * (1 + vr);
    totalHt = baseRevenueHt + billedMileageHt;
  } else if (explicitLabor !== null && targetTtc <= 0) {
    laborSellingHt = explicitLabor;
    baseRevenueHt = adjustedPartCostHt + ship + internalMileageForMargin + laborSellingHt;
    baseTargetTtc = baseRevenueHt * (1 + vr);
    totalHt = baseRevenueHt + billedMileageHt;
  } else {
    // Règle commerciale : le Prix client TTC saisi est la référence de base.
    // En mode client_price, les frais kilométriques sont ajoutés en HT puis soumis à la TVA.
    laborSellingHt = explicitLabor ?? Math.max(0, baseRevenueHt - adjustedPartCostHt - ship - internalMileageForMargin);
    totalHt = baseRevenueHt + billedMileageHt;
  }

  const directCosts = adjustedPartCostHt + ship + internalMileageForMargin + internalLabor;
  // La marge porte sur le montant réellement facturé : le km ajouté au client est un produit,
  // tandis que son coût interne reste un coût direct.
  const grossMargin = totalHt - directCosts;
  const contributionRows: PricingContribution[] = [];
  let contributionsTotal = 0;
  let provisionalProfit = grossMargin;
  for (const contribution of contributionsInput) {
    const rate = num(contribution.rate, 'taux de cotisation', 0, 99.99) / 100;
    const basis = contributionBasis(contribution.basis);
    const contributionBase = basis === 'gross_margin' ? grossMargin : basis === 'profit' ? provisionalProfit : baseRevenueHt;
    const amount = Math.max(0, contributionBase * rate);
    contributionsTotal += amount;
    provisionalProfit = grossMargin - contributionsTotal;
    contributionRows.push({
      name: String(contribution.name || 'Cotisation'),
      rate: r2(rate * 100),
      basis,
      amount: r2(amount),
      mandatory: contribution.mandatory !== false,
    });
  }

  const netResult = grossMargin - contributionsTotal;
  const baseTtc = baseRevenueHt * (1 + vr);
  const mileageBilledTtc = billedMileageHt * (1 + vr);
  const totalTtc = totalHt * (1 + vr);
  const vat = totalTtc - totalHt;
  const belowMinimumPrice = baseRevenueHt + 1e-9 < minimumSellingHt;

  return {
    purchaseHt: r2(part),
    coefficientMarkupHt: r2(partMarkup),
    shippingHt: r2(ship),
    directCostsHt: r2(directCosts),
    internalLaborCostHt: r2(internalLabor),
    mileageKm: r2(km),
    mileageInternalRate: r2(internalMileage),
    mileageClientRate: r2(clientMileage),
    mileageTotal: r2(mileageMode === 'margin' ? mileageInternal : mileageClient),
    billedMileageHt: r2(billedMileageHt),
    mileageBilledTtc: r2(mileageBilledTtc),
    totalHt: r2(totalHt),
    vat: r2(vat),
    totalTtc: r2(totalTtc),
    baseTargetTtc: r2(baseTargetTtc),
    baseTtc: r2(baseTtc),
    baseRevenueHt: r2(baseRevenueHt),
    laborHt: r2(grossMargin),
    laborSellingHt: r2(laborSellingHt),
    grossMargin: r2(grossMargin),
    grossMarginRate: baseRevenueHt > 0 ? r2(grossMargin / baseRevenueHt * 100) : 0,
    contributionsTotal: r2(contributionsTotal),
    contributions: contributionRows,
    urssafEstimate: r2(contributionRows[0]?.amount || 0),
    netMargin: r2(netResult),
    netResult: r2(netResult),
    marginRate: baseRevenueHt > 0 ? r2(netResult / baseRevenueHt * 100) : 0,
    netResultRate: baseRevenueHt > 0 ? r2(netResult / baseRevenueHt * 100) : 0,
    minimumSellingHt: r2(minimumSellingHt),
    belowMinimumPrice,
    loss: grossMargin < 0,
    driver,
    mileageMode,
  };
}
