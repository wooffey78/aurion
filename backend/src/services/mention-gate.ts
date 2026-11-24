// 15.4.54 (correctif médiateur) — Porte des mentions obligatoires : détermine quelles mentions
// « needs_confirmation » du moteur (services/mentions.ts) sont BLOQUANTES à l'émission d'une
// facture. Aurion n'invente jamais une valeur juridique : une mention bloquante manquante
// refuse l'émission avec la liste exacte des champs à compléter (référence : docs/MENTIONS-OBLIGATOIRE.md).
// Décision de blocage (révisée 15.4.54 — choix produit : l'émission ne doit plus être refusée
// faute de médiateur ; la mention reste configurable et signalée comme simple rappel) :
//   - identity  : SIRET/SIREN de l'entreprise — obligatoire sur toute facture → BLOQUANT ;
//   - insurance : assurance professionnelle/décennale — profils travaux (liste WORKS du moteur) → BLOQUANT ;
//   - mediator  : médiateur de la consommation — vente aux particuliers (liste CONSUMER du moteur)
//                 → NON bloquant : configurable dans Paramètres → Activités → Facturation et
//                 documents ; tant qu'il n'est pas renseigné, il apparaît comme simple rappel
//                 (REMINDER_MENTION_KEYS) sans jamais refuser l'émission ;
//   - vat / payment / validity / legal-warranty : formulées automatiquement ou détectées →
//     non bloquantes (aucune donnée manquante à saisir par l'utilisateur).
// Le périmètre reste l'émission de factures NOUVELLES uniquement : aucun re-contrôle rétroactif
// des documents émis avant 15.4.53 (grandfathering documenté).
import type { Mention } from './mentions.js';

export const BLOCKING_MENTION_KEYS = ['identity', 'insurance'] as const;
/** 15.4.54 — mentions manquantes signalées à l'utilisateur sans bloquer l'émission (ex. médiateur). */
export const REMINDER_MENTION_KEYS = ['mediator'] as const;

/** Fonction PURE : renvoie les mentions bloquantes manquantes (source needs_confirmation). */
export function blockingMentionGaps(mentions: Mention[]): Mention[] {
  return (mentions || []).filter(m => m.source === 'needs_confirmation' && (BLOCKING_MENTION_KEYS as readonly string[]).includes(m.key));
}

/** Fonction PURE : renvoie les rappels non bloquants (à compléter, sans refuser l'émission). */
export function mentionReminders(mentions: Mention[]): Mention[] {
  return (mentions || []).filter(m => m.source === 'needs_confirmation' && (REMINDER_MENTION_KEYS as readonly string[]).includes(m.key));
}
