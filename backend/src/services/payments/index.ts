// Bloc 13 — Registre des adaptateurs de paiement (aucun endpoint de prestataire réel codé en
// dur, garde-fou de test inclus) + configuration validée par zod dans config.ts.
import type { PayAdapter } from './types.js';
import { genericPayAdapter } from './generic.js';
import { config } from '../../config.js';

const ADAPTERS: Record<string, PayAdapter> = { generic: genericPayAdapter };

export function resolvePayAdapter(code: string | undefined): PayAdapter | null {
  if (!code) return null;
  return ADAPTERS[code] || null;
}

export function paymentsConfigured(): boolean {
  const a = resolvePayAdapter(config.AURION_PAY_PROVIDER);
  return Boolean(a && config.AURION_PAY_API_BASE && config.AURION_PAY_WEBHOOK_SECRET);
}

export const listPayAdapters = () => Object.keys(ADAPTERS);
