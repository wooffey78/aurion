import type { FastifyInstance } from "fastify";
import { pricingToWorkbookInputs, calculatePricingXlsx, comparePricingResults } from "../services/calc-engine/pricing-adapter.js";
import { computePricing } from "../services/pricing.js";
import { getCalculationStatus, CalcEngineError } from "../services/calc-engine/engine.js";

/**
 * Diagnostics du moteur de calcul classeur (réf. chantier « classeur Excel central »).
 * - /calc-engine/status : disponibilité du classeur, versions, LibreOffice, mode actif.
 * - /calc-engine/preview : double calcul d'une entrée pricing (Phase C) — ancien moteur vs
 *   classeur recalculé, divergence par divergence. Outil de validation, jamais utilisé pour
 *   servir les écrans (ceux-ci passent par l'adaptateur intégré au calcul des documents).
 */
export async function calcEngineRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);
  /** Diagnostic en lecture seule : versions, disponibilité de LibreOffice, mode actif et contrat. */
  app.get('/calc-engine/status', async () => getCalculationStatus());
  // 15.4.69 — diagnostic coûteux (recalcul LibreOffice en mode xlsx) : débit limité par compte
  // et corps strictement vérifié avant tout calcul.
  /**
   * Double calcul de diagnostic : moteur historique vs classeur recalculé, divergence par
   * divergence. Réservé à la validation, jamais utilisé pour servir un écran ou un document.
   * Réponse 400 si le corps n'est pas un objet, 503 si le classeur est indisponible.
   */
  app.post('/calc-engine/preview', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request: any, reply: any) => {
    const input = request.body;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      reply.code(400);
      return { error: 'INVALID_INPUT', message: 'Corps de requête invalide : objet JSON attendu.' };
    }
    const legacy = computePricing(input);
    try {
      const { result, raw } = await calculatePricingXlsx(input);
      return {
        mode: String(process.env.AURION_CALC_ENGINE || 'legacy'),
        legacy, engine: result,
        divergences: comparePricingResults(legacy, result),
        engineMeta: { traceId: raw.traceId, durationMs: raw.durationMs, recalcMs: raw.recalcMs, workbookVersion: raw.workbookVersion },
      };
    } catch (error: any) {
      const code = error instanceof CalcEngineError ? error.code : 'UNKNOWN';
      reply.code(503);
      return { error: code, message: error?.message || 'Calcul classeur indisponible', legacy };
    }
  });
}
