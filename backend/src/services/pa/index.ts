// Registre des adaptateurs PA (bloc 3). Un fournisseur PA réel = un fichier d'adaptateur +
// une entrée ici. Aucune URL, clé ou endpoint de PA réelle n'est codé en dur : la connexion
// d'une PA contractuelle exige un adaptateur dédié et une validation sandbox documentée.

import { config } from '../../config.js';
import { genericPaAdapter, GENERIC_PA_PROVIDER } from './generic.js';
import { genericPaOutgoingAdapter } from './outgoing/generic.js';
import type { PaAdapter } from './types.js';
import type { PaOutgoingAdapter } from './outgoing/types.js';

const adapters: Record<string, PaAdapter> = {
  [GENERIC_PA_PROVIDER]: genericPaAdapter,
};

/** Registre des adaptateurs d'ÉMISSION (bloc 4) : un fournisseur PA réel = un fichier + une entrée. */
const outgoingAdapters: Record<string, PaOutgoingAdapter> = {
  generic: genericPaOutgoingAdapter,
};

/** Retourne l'adaptateur du provider configuré, ou null si aucun/inconnu. */
export function resolvePaAdapter(provider: string): PaAdapter | null {
  return adapters[provider] || null;
}

/** Retourne l'adaptateur d'émission du provider configuré, ou null si aucun/inconnu. */
export function resolvePaOutgoingAdapter(provider: string): PaOutgoingAdapter | null {
  return outgoingAdapters[provider] || null;
}

/** Vrai si la réception PA est configurée (provider connu + secret webhook défini). */
export function paReceptionConfigured(): boolean {
  if (!config.AURION_PA_PROVIDER || !config.AURION_PA_WEBHOOK_SECRET) return false;
  return resolvePaAdapter(config.AURION_PA_PROVIDER) !== null;
}

export { genericPaAdapter, GENERIC_PA_PROVIDER };
export type { PaAdapter } from './types.js';
export { genericPaOutgoingAdapter } from './outgoing/generic.js';
export type { PaOutgoingAdapter } from './outgoing/types.js';
