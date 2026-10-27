import { config } from '../config.js';

/** Calcule un TTC à partir d'un montant HT en centimes et d'un taux en points de base.
 * Arrondi commercial au centime (demi vers le haut), sans arithmétique flottante.
 */
export function calculateTtcCents(priceHtCents: unknown, vatRateBps: unknown = config.BILLING_VAT_RATE_BPS): number {
  const ht = typeof priceHtCents === 'number' ? priceHtCents : Number(priceHtCents);
  const bps = typeof vatRateBps === 'number' ? vatRateBps : Number(vatRateBps);
  if (!Number.isSafeInteger(ht) || ht < 0) throw new TypeError('Le prix HT doit être un nombre entier de centimes positif ou nul.');
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 100_000) throw new TypeError('Le taux de TVA doit être exprimé en points de base.');
  const total = (BigInt(ht) * (10_000n + BigInt(bps)) + 5_000n) / 10_000n;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Le total TTC dépasse la précision entière sûre.');
  return Number(total);
}
