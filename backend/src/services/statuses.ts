// Bloc 19 (prompt général §6) — référentiel partagé des états et cycle de vie.
// Les littéraux de statut étaient dupliqués inline dans les requêtes SQL (avec variantes
// d'accent : « annulé »/« annule »). Un seul point de définition est désormais consommé par
// tous les modules ; la sémantique reste inchangée pour ne rien casser.

/** Documents (devis et factures) annulés, refusés ou supprimés : jamais agrégés comme actifs. */
export const CANCELED_DOCUMENT_STATUSES = ['canceled', 'cancelled', 'annulé', 'annule', 'void', 'deleted'] as const;
/** Devis refusés : exclus des totaux de devis ouverts, comme les annulés. */
export const REJECTED_DOCUMENT_STATUSES = ['rejected', 'refused'] as const;
/** Devis expirés (prompt 07 : décision explicite ou expiration automatique à la date de validité). */
export const EXPIRED_DOCUMENT_STATUSES = ['expired'] as const;
/** Devis ouverts = ni annulés, ni refusés, ni expirés, ni supprimés. */
export const CLOSED_QUOTE_STATUSES = [...CANCELED_DOCUMENT_STATUSES, ...REJECTED_DOCUMENT_STATUSES, ...EXPIRED_DOCUMENT_STATUSES] as const;

/** Prompt 07 — décisions explicites du cycle commercial : états écrits par les routes dédiées. */
export const QUOTE_DECISION_STATUSES = ['accepted', 'rejected', 'expired', 'canceled'] as const;

/** Prompt 09 — origine d'un événement d'agenda (jamais de fausse origine). */
export const AGENDA_ORIGINS = ['internal', 'external_import', 'synchronized'] as const;

/** Prompt 05 — cycle de vie d'un événement de l'outbox transactionnel. */
export const OUTBOX_STATUSES = ['pending', 'processing', 'processed', 'failed', 'dead_lettered'] as const;

/** Statuts de paiement d'une facture (contrainte 020 inchangée). */
export const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid'] as const;

/** Cycle de vie d'une commande fournisseur (bloc 10). */
export const PURCHASE_ORDER_STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'] as const;

/** Cycle de vie d'une réservation de pièce (bloc 10). */
export const RESERVATION_STATUSES = ['active', 'consumed', 'released', 'cancelled'] as const;

/** Cycle de vie d'une demande comptable (bloc 15). */
export const ACCOUNTANT_REQUEST_STATES = ['open', 'answered', 'resolved', 'cancelled'] as const;

/** Cycle de vie d'un run de workflow (bloc 13) : demandé/simulé/exécuté/échoué/annulé. */
export const WORKFLOW_RUN_STATUSES = ['simulated', 'executed', 'failed', 'cancelled'] as const;

/** SQL-safe : liste citée pour `lower(coalesce(x,'')) not in (...)` — même ordre que les usages existants. */
export function sqlStatusList(statuses: readonly string[]): string {
  return statuses.map(s => `'${s}'`).join(',');
}

/**
 * Un objet est-il « clos » pour l'agrégation (annulé/refusé/supprimé) ?
 * Comparaison insensible à la casse, identique aux requêtes SQL existantes.
 */
export function isClosedStatus(status: string | null | undefined, closed: readonly string[] = CANCELED_DOCUMENT_STATUSES): boolean {
  return closed.includes(String(status ?? '').toLowerCase());
}
