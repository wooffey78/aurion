// Bloc 3 — socle d'intégration plateforme agréée (PA).
//
// Aurion est un logiciel de gestion/facturation connecté à la PA choisie par l'entrepreneur ;
// il n'est pas lui-même une PA, ne transmet rien à l'administration fiscale et ne prétend
// jamais être immatriculé. Chaque fournisseur PA se branche derrière l'interface `PaAdapter`
// ci-dessous, sans toucher au reste de l'application : le webhook, l'idempotence, l'archivage
// et le journal sont communs ; seuls la vérification de signature et le décodage de l'enveloppe
// sont propres à chaque PA (fichier d'adaptateur isolé, ex. generic.ts).
//
// État de la connexion (15.4.2) : AUCUNE PA réelle n'est connectée. L'adaptateur « generic »
// implémente le contrat générique documenté dans docs/PLATEFORME-AGREEE.md et sert de
// référence pour les tests de contrat. La réception n'est PAS déclarée opérationnelle en
// production tant qu'aucune PA contractuelle n'a été validée en sandbox.
//
// Le JSON de préparation interne (services/electronic-invoice.ts) reste un modèle métier
// interne : il n'est ni un format réglementaire, ni envoyé à une PA comme facture structurée.

import type { FastifyRequest } from 'fastify';

/** Enveloppe minimale commune à tout événement entrant de PA. */
export type PaEventEnvelope = {
  /** Identifiant d'événement généré par la PA ; base de l'idempotence avec (provider, organisation). */
  eventId: string;
  /** Type d'événement contractuel (ex. « invoice.received »). */
  type: string;
  /** Horodatage de l'événement côté PA (ISO 8601). */
  occurredAt: string;
};

/** Document original transmis par la PA (fichier facture, conservé sans altération). */
export type PaDocumentFile = {
  filename: string;
  contentType: string;
  bytes: Buffer;
};

/** Charge utile d'une facture fournisseur reçue (données structurées transmises par la PA). */
export type PaInvoicePayload = {
  invoiceId: string;
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  supplier: {
    name: string;
    siren: string | null;
    siret: string | null;
    email: string | null;
    vatNumber: string | null;
  };
  totals: { net: number; tax: number; gross: number };
  items: Array<{ label: string; quantity: number; unitPrice: number; total: number | null }>;
  document: PaDocumentFile;
};

/** Événement décodé et validé par un adaptateur. */
export type PaEvent = PaEventEnvelope & {
  invoice: PaInvoicePayload | null;
};

export type PaEventParseResult =
  | { ok: true; event: PaEvent }
  | { ok: false; code: 'INVALID_WEBHOOK_PAYLOAD' | 'UNSUPPORTED_EVENT_CONTENT'; message: string };

export type PaWebhookHeaders = Pick<FastifyRequest['headers'], 'x-aurion-pa-signature' | 'x-aurion-pa-event-id'> &
  Record<string, string | string[] | undefined>;

/**
 * Interface stable d'adaptateur PA : un fournisseur PA réel = un fichier + une entrée dans
 * le registre (index.ts). Aucun endpoint, identifiant ou URL de PA réelle n'est codé en dur.
 */
export interface PaAdapter {
  /** Identifiant du fournisseur (ex. « generic ») — valeur de AURION_PA_PROVIDER. */
  readonly provider: string;
  /** Types d'événements connus de l'adaptateur. */
  readonly eventTypes: readonly string[];
  /**
   * Vérifie l'authenticité de l'appel entrant : signature HMAC liée au corps brut, horodatage
   * et tolérance anti-rejeu. Doit être à comparaison à temps constant et sans fuite d'information.
   */
  verifySignature(rawBody: Buffer, headers: PaWebhookHeaders, secret: string): boolean;
  /** Décode et valide l'enveloppe + la charge utile métier. Ne touche jamais à la persistance. */
  parseEvent(rawBody: Buffer, maxFileBytes: number): Promise<PaEventParseResult>;
}
