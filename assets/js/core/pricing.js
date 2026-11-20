// GÉNÉRÉ depuis backend/src/services/pricing.ts — moteur financier commun serveur/navigateur.
const BASIS_POINTS = 10000n;
const UNIT_SCALE = 1000000n;
function num(value, name, min, max) {
    if (value === undefined || value === null || value === '')
        return 0;
    const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < min || n > max)
        throw new Error(`Valeur invalide : ${name}`);
    return n;
}
/** Convertit une décimale en unité entière sans opération monétaire flottante. */
function decimalUnits(value, decimalPlaces, name) {
    const raw = value === undefined || value === null || value === '' ? '0' : String(value).trim().replace(',', '.');
    const match = raw.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match)
        throw new Error(`Valeur invalide : ${name}`);
    const negative = match[1] === '-';
    const fraction = match[3] || '';
    const exponent = Number(match[4] || 0);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100)
        throw new Error(`Valeur invalide : ${name}`);
    const digits = BigInt(`${match[2]}${fraction}` || '0');
    const shift = decimalPlaces - fraction.length + exponent;
    let units;
    if (shift >= 0)
        units = digits * (10n ** BigInt(shift));
    else {
        const denominator = 10n ** BigInt(-shift);
        units = (digits + denominator / 2n) / denominator;
    }
    return negative ? -units : units;
}
function roundHalfUp(numerator, denominator) {
    if (denominator <= 0n)
        throw new RangeError('Le dénominateur doit être positif.');
    const negative = numerator < 0n;
    const absolute = negative ? -numerator : numerator;
    const rounded = (absolute + denominator / 2n) / denominator;
    return negative ? -rounded : rounded;
}
function safeCents(value, name) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new RangeError(`${name} dépasse la précision entière sûre.`);
    }
    return value;
}
function euros(cents) { return Number(safeCents(cents, 'Montant')) / 100; }
function multiplyRate(amountCents, rateBps) {
    return roundHalfUp(amountCents * rateBps, BASIS_POINTS);
}
function grossTtc(htCents, vatBps) {
    return roundHalfUp(htCents * (BASIS_POINTS + vatBps), BASIS_POINTS);
}
function contributionBasis(value) {
    const normalized = String(value || 'ca_ht');
    return normalized === 'gross_margin' ? 'gross_margin' : normalized === 'profit' ? 'profit' : 'ca_ht';
}
export function computePricing(input) {
    const partValue = num(input.partCost, 'pièce', 0, 1e9);
    const shipValue = num(input.shippingCost, 'livraison', 0, 1e9);
    const kmValue = num(input.mileageKm, 'kilométrage', 0, 1e7);
    const legacyMileageValue = num(input.mileageRate, 'frais kilométriques', 0, 1e4);
    const internalMileageValue = input.mileageInternalRate == null || input.mileageInternalRate === ''
        ? legacyMileageValue : num(input.mileageInternalRate, 'coût kilométrique interne', 0, 1e4);
    const clientMileageValue = input.mileageClientRate == null || input.mileageClientRate === ''
        ? legacyMileageValue : num(input.mileageClientRate, 'tarif kilométrique client', 0, 1e4);
    const vatValue = num(input.vatRate, 'TVA', 0, 100);
    const coefficientValue = Math.max(0, num(input.coefficientValue ?? input.coefficientPercent, 'coefficient', 0, 1e6));
    const partQuantityValue = Math.max(1, num(input.partQuantity, 'quantité de pièces', 1, 1e7));
    const internalLaborValue = num(input.laborInternalCostHt, 'coût interne main-d’œuvre', 0, 1e9);
    const explicitLaborValue = input.laborSellingHt === undefined || input.laborSellingHt === null || input.laborSellingHt === ''
        ? null : num(input.laborSellingHt, 'prix de vente main-d’œuvre', 0, 1e9);
    const targetTtcValue = num(input.targetTtc, 'prix TTC', 0, 1e9);
    const targetNetValue = num(input.targetNet, 'résultat net', -1e9, 1e9);
    const part = decimalUnits(partValue, 2, 'pièce');
    const ship = decimalUnits(shipValue, 2, 'livraison');
    const km = decimalUnits(kmValue, 6, 'kilométrage');
    const legacyMileage = decimalUnits(legacyMileageValue, 6, 'frais kilométriques');
    const internalMileageRate = input.mileageInternalRate == null || input.mileageInternalRate === ''
        ? legacyMileage : decimalUnits(internalMileageValue, 6, 'coût kilométrique interne');
    const clientMileageRate = input.mileageClientRate == null || input.mileageClientRate === ''
        ? legacyMileage : decimalUnits(clientMileageValue, 6, 'tarif kilométrique client');
    const vatBps = decimalUnits(vatValue, 2, 'TVA');
    const coefficient = decimalUnits(coefficientValue, 2, 'coefficient');
    const partQuantity = decimalUnits(partQuantityValue, 6, 'quantité de pièces');
    const internalLabor = decimalUnits(internalLaborValue, 2, 'coût interne main-d’œuvre');
    const explicitLabor = explicitLaborValue === null ? null : decimalUnits(explicitLaborValue, 2, 'prix de vente main-d’œuvre');
    const targetTtc = decimalUnits(targetTtcValue, 2, 'prix TTC');
    const targetNet = decimalUnits(targetNetValue, 2, 'résultat net');
    // Distances et tarifs sont convertis en micro-unités : le résultat reste calculé en centimes.
    const mileageInternal = roundHalfUp(km * internalMileageRate, 10000000000n);
    const mileageClient = roundHalfUp(km * clientMileageRate, 10000000000n);
    const mileageMode = input.mileageMode === 'client_price' ? 'client_price' : 'margin';
    const driver = input.driver === 'net' ? 'net' : 'ttc';
    const unit = input.coefficientUnit === 'euro' ? 'euro' : 'percent';
    const coefficientBasisValue = String(input.coefficientBasis || 'purchase');
    // Le coefficient commercial s'applique au coût d'achat, il ne modifie jamais le prix du fournisseur.
    const coefficientMarkup = coefficientBasisValue === 'purchase'
        ? unit === 'percent' ? multiplyRate(part, coefficient) : roundHalfUp(coefficient * partQuantity, UNIT_SCALE)
        : 0n;
    const adjustedPart = part + coefficientMarkup;
    const minimumSelling = adjustedPart + ship + mileageInternal;
    const contributionsInput = Array.isArray(input.contributions) ? [...input.contributions] : [];
    if (!contributionsInput.length && input.urssafRate !== undefined) {
        contributionsInput.push({ name: 'Cotisations sociales', rate: input.urssafRate, basis: 'ca_ht', mandatory: true });
    }
    const contributions = contributionsInput.map((contribution) => {
        const rateValue = num(contribution.rate, 'taux de cotisation', 0, 99.99);
        return {
            name: String(contribution.name || 'Cotisation'),
            rateBps: decimalUnits(rateValue, 2, 'taux de cotisation'),
            basis: contributionBasis(contribution.basis),
            mandatory: contribution.mandatory !== false,
        };
    });
    const billedMileage = mileageMode === 'client_price' ? mileageClient : 0n;
    let baseRevenue;
    let baseTtc;
    let baseTargetTtc;
    let totalHt;
    let laborSelling;
    if (driver === 'net' && explicitLabor === null) {
        // Refuse les paramètres qui ne permettent pas un inverse fiable et monotone.
        // La recherche utilise exactement le même ordre d'arrondi que le calcul final,
        // y compris les cotisations assises sur la marge ou le résultat intermédiaire.
        const totalRate = contributions.reduce((sum, c) => sum + c.rateBps, 0n);
        if (totalRate >= BASIS_POINTS)
            throw new Error('Le cumul des taux pour le calcul inverse doit rester inférieur à 100 %.');
        const direct = adjustedPart + ship + mileageInternal + internalLabor;
        const netForRevenue = (revenue) => {
            const gross = revenue + billedMileage - direct;
            let accumulated = 0n;
            let provisional = gross;
            for (const contribution of contributions) {
                const basis = contribution.basis === 'gross_margin'
                    ? gross
                    : contribution.basis === 'profit' ? provisional : revenue;
                const amount = multiplyRate(basis > 0n ? basis : 0n, contribution.rateBps);
                accumulated += amount;
                provisional = gross - accumulated;
            }
            return gross - accumulated;
        };
        let low = 0n;
        let high = 0n;
        if (netForRevenue(0n) < targetNet) {
            high = direct + targetNet - billedMileage;
            if (high < 1n)
                high = 1n;
            while (netForRevenue(high) < targetNet) {
                if (high > BigInt(Number.MAX_SAFE_INTEGER) / 2n) {
                    throw new RangeError('Le prix nécessaire dépasse la plage de calcul sûre.');
                }
                high *= 2n;
            }
            while (low < high) {
                const middle = (low + high) / 2n;
                if (netForRevenue(middle) >= targetNet)
                    high = middle;
                else
                    low = middle + 1n;
            }
        }
        baseRevenue = low;
        baseTargetTtc = grossTtc(baseRevenue, vatBps);
        baseTtc = baseTargetTtc;
        totalHt = baseRevenue + billedMileage;
        laborSelling = baseRevenue - adjustedPart - ship - mileageInternal;
        if (laborSelling < 0n)
            laborSelling = 0n;
    }
    else if (driver === 'net' && explicitLabor !== null) {
        laborSelling = explicitLabor;
        baseRevenue = adjustedPart + ship + mileageInternal + laborSelling;
        baseTargetTtc = grossTtc(baseRevenue, vatBps);
        baseTtc = baseTargetTtc;
        totalHt = baseRevenue + billedMileage;
    }
    else if (explicitLabor !== null && targetTtc <= 0n) {
        laborSelling = explicitLabor;
        baseRevenue = adjustedPart + ship + mileageInternal + laborSelling;
        baseTargetTtc = grossTtc(baseRevenue, vatBps);
        baseTtc = baseTargetTtc;
        totalHt = baseRevenue + billedMileage;
    }
    else {
        // Le TTC saisi est la référence métier : on le conserve au centime près.
        baseTargetTtc = targetTtc;
        baseTtc = targetTtc;
        baseRevenue = roundHalfUp(targetTtc * BASIS_POINTS, BASIS_POINTS + vatBps);
        laborSelling = explicitLabor ?? (baseRevenue - adjustedPart - ship - mileageInternal);
        if (explicitLabor === null && laborSelling < 0n)
            laborSelling = 0n;
        totalHt = baseRevenue + billedMileage;
    }
    const directCosts = adjustedPart + ship + mileageInternal + internalLabor;
    const grossMargin = totalHt - directCosts;
    const contributionRows = [];
    let contributionsTotal = 0n;
    let provisionalProfit = grossMargin;
    for (const contribution of contributions) {
        const base = contribution.basis === 'gross_margin' ? grossMargin : contribution.basis === 'profit' ? provisionalProfit : baseRevenue;
        const amount = multiplyRate(base > 0n ? base : 0n, contribution.rateBps);
        contributionsTotal += amount;
        provisionalProfit = grossMargin - contributionsTotal;
        contributionRows.push({ name: contribution.name, rate: Number(contribution.rateBps) / 100, basis: contribution.basis, amount: euros(amount), mandatory: contribution.mandatory });
    }
    const netResult = grossMargin - contributionsTotal;
    const mileageBilledTtc = grossTtc(billedMileage, vatBps);
    const totalTtc = baseTtc + mileageBilledTtc;
    const vat = totalTtc - totalHt;
    const safeGrossMargin = safeCents(grossMargin, 'Marge brute');
    const safeNetResult = safeCents(netResult, 'Résultat net');
    const grossMarginRate = baseRevenue > 0n ? Number(roundHalfUp(grossMargin * 10000n, baseRevenue)) / 100 : 0;
    const netResultRate = baseRevenue > 0n ? Number(roundHalfUp(netResult * 10000n, baseRevenue)) / 100 : 0;
    return {
        purchaseHt: euros(part),
        coefficientMarkupHt: euros(coefficientMarkup),
        shippingHt: euros(ship),
        directCostsHt: euros(directCosts),
        internalLaborCostHt: euros(internalLabor),
        mileageKm: Number(km) / 1_000_000,
        mileageInternalRate: euros(mileageInternal),
        mileageClientRate: euros(mileageClient),
        mileageTotal: euros(mileageMode === 'margin' ? mileageInternal : mileageClient),
        billedMileageHt: euros(billedMileage),
        mileageBilledTtc: euros(mileageBilledTtc),
        totalHt: euros(totalHt),
        vat: euros(vat),
        totalTtc: euros(totalTtc),
        baseTargetTtc: euros(baseTargetTtc),
        baseTtc: euros(baseTtc),
        baseRevenueHt: euros(baseRevenue),
        laborHt: euros(safeGrossMargin),
        laborSellingHt: euros(laborSelling),
        grossMargin: euros(safeGrossMargin),
        grossMarginRate,
        contributionsTotal: euros(contributionsTotal),
        contributions: contributionRows,
        urssafEstimate: contributionRows[0]?.amount || 0,
        netMargin: euros(safeNetResult),
        netResult: euros(safeNetResult),
        marginRate: netResultRate,
        netResultRate,
        minimumSellingHt: euros(minimumSelling),
        belowMinimumPrice: baseRevenue < minimumSelling,
        loss: grossMargin < 0n,
        driver,
        mileageMode,
    };
}
