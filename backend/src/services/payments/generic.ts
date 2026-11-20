// Bloc 13 — Contrat générique de paiement signé de référence (aucune PA réelle codée en dur).
// Le prestataire réel (Stripe connecté à la facturation client, GoCardless SEPA, etc.) sera
// branché à la décision D3 : il suffira d'implémenter PayAdapter dans un nouveau fichier et de
// l'ajouter au registre — aucune route ni aucune donnée ne change.
import type { PayAdapter, PaymentLinkRequest, PaymentLinkResponse } from './types.js';
import { config } from '../../config.js';

export const genericPayAdapter: PayAdapter = {
  code: 'generic',
  async createPaymentLink(req: PaymentLinkRequest, fetcher: typeof fetch = fetch): Promise<PaymentLinkResponse> {
    const base = config.AURION_PAY_API_BASE;
    if (!base) throw new Error('AURION_PAY_API_BASE manquante : adaptateur générique non configuré.');
    const response = await fetcher(`${base.replace(/\/$/, '')}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${config.AURION_PAY_API_KEY || ''}` },
      body: JSON.stringify({ amount: Math.round(req.amountTtc * 100), currency: req.currency, reference: req.reference, description: req.description }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Le prestataire de paiement a répondu ${response.status}.`);
    const data: any = await response.json().catch(() => ({}));
    if (!data?.checkoutUrl || !data?.providerRef) throw new Error('Réponse du prestataire incomplète (checkoutUrl / providerRef requis).');
    return { checkoutUrl: String(data.checkoutUrl), providerRef: String(data.providerRef) };
  },
};
