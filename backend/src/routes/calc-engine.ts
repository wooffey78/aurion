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
  app.get('/calc-engine/status', async () => getCalculationStatus());
  app.post('/calc-engine/preview', async (request: any, reply: any) => {
    const input = request.body || {};
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
