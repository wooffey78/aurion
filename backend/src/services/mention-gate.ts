// 15.4.53 (PROMPT C2) — Porte des mentions obligatoires : détermine quelles mentions
// « needs_confirmation » du moteur (services/mentions.ts) sont BLOQUANTES à l'émission d'une
// facture. Aurion n'invente jamais une valeur juridique : une mention bloquante manquante
// refuse l'émission avec la liste exacte des champs à compléter (référence : docs/MENTIONS-OBLIGATOIRE.md).
// Décision de blocage consignée (PROMPT C1) :
//   - identity  : SIRET/SIREN de l'entreprise — obligatoire sur toute facture ;
//   - insurance : assurance professionnelle/décennale — profils travaux (liste WORKS du moteur) ;
//   - mediator  : médiateur de la consommation — vente aux particuliers (liste CONSUMER du moteur) ;
//   - vat / payment / validity / legal-warranty : formulées automatiquement ou détectées →
//     non bloquantes (aucune donnée manquante à saisir par l'utilisateur).
// Le périmètre est l'émission de factures NOUVELLES uniquement : aucun re-contrôle rétroactif
// des documents émis avant 15.4.53 (grandfathering documenté).
import type { Mention } from './mentions.js';

export const BLOCKING_MENTION_KEYS = ['identity', 'insurance', 'mediator'] as const;

/** Fonction PURE : renvoie les mentions bloquantes manquantes (source needs_confirmation). */
export function blockingMentionGaps(mentions: Mention[]): Mention[] {
  return (mentions || []).filter(m => m.source === 'needs_confirmation' && (BLOCKING_MENTION_KEYS as readonly string[]).includes(m.key));
}
