// Bloc 13 — Adaptateur de paiement isolé (décision D3 non tranchée).
//
// Conformément au cahier des charges : le choix du prestataire (carte + virement SEPA, frais,
// mandats, revue juridique) est DÉCISION D3 — non tranchée à ce jour. Aucun prestataire réel
// n'est codé en dur : un contrat générique signé (miroir du contrat PA du bloc 3) est livré
// avec ses tests de contrat de bout en bout ; sans AURION_PAY_PROVIDER, la fonction est
// DÉSACTIVÉE explicitement (503) et n'est JAMAIS déclarée opérationnelle.
export interface PaymentLinkRequest {
  amountTtc: number;
  currency: 'EUR';
  reference: string;
  description: string;
}

export interface PaymentLinkResponse {
  checkoutUrl: string;
  providerRef: string;
}

/** Contrat minimal d'un adaptateur de paiement : créer un lien pour un montant figé. */
export interface PayAdapter {
  code: string;
  createPaymentLink(req: PaymentLinkRequest, fetcher?: typeof fetch): Promise<PaymentLinkResponse>;
}
