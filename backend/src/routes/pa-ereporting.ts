// Bloc 5 — routes E-REPORTING (données de transaction et de paiement) via la plateforme
// agréée (PA). Authentifiées (session utilisateur, isolation RLS 074/077) :
//
//   POST /pa/ereporting/preview                    — aperçu (dry-run) d'une déclaration de
//                                                    période : lignes, écarts, exclusions, totaux
//   POST /pa/ereporting/declarations               — prépare et scelle la déclaration
//                                                    (rapport d'écarts bloquant : 422 sinon)
//   GET  /pa/ereporting/declarations               — liste (+ filtre statut)
//   GET  /pa/ereporting/declarations/:id           — détail + lignes figées + journal complet
//   GET  /pa/ereporting/declarations/:id/file      — flux structuré archivé (JSON scellé)
//   GET  /pa/ereporting/declarations/:id/ack       — accusé PA archivé sans altération
//   POST /pa/ereporting/declarations/:id/transmit  — transmet à la PA ; seul un accusé signé
//                                                    règle l'état ; re-tentatives idempotentes
//   POST /pa/ereporting/declarations/:id/corrections — prépare une CORRECTION de la même
//                                                    période (l'originale reste archivée)
//
// Doctrine officielle vérifiée le 14 novembre 2026 (impots.gouv.fr ; BOFiP ACTU-2026-00145) :
// deux composantes (transaction + paiement), B2C domestique et B2B international concernés,
// échéances 1er septembre 2026 (GE/ETI) et 1er septembre 2027 (micro/PME, option d'anticipation).

import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import {
  EreportingError,
  getEreportingDeclaration,
  listEreportingDeclarations,
  prepareEreportingDeclaration,
  previewEreportingDeclaration,
  readEreportingAck,
  readEreportingPayload,
  transmitEreportingDeclaration,
} from '../services/electronic-ereporting.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function mapError(error: unknown): { statusCode: number; body: Record<string, unknown> } | null {
  if (!(error instanceof EreportingError)) return null;
  return { statusCode: error.statusCode, body: { error: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) } };
}

function parsePeriodInput(body: any): { periodStart: string; periodEnd: string; periodicity: string; kind?: 'initial' | 'correction'; correctsDeclarationId?: string | null } | null {
  const periodStart = String(body?.periodStart ?? '');
  const periodEnd = String(body?.periodEnd ?? '');
  const periodicity = String(body?.periodicity ?? 'monthly');
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) return null;
  if (!['monthly', 'quarterly'].includes(periodicity)) return null;
  const kind = body?.kind === 'correction' ? 'correction' : 'initial';
  const correctsDeclarationId = body?.correctsDeclarationId == null ? null : String(body.correctsDeclarationId);
  return { periodStart, periodEnd, periodicity, kind, correctsDeclarationId };
}

export async function paEreportingRoutes(app: FastifyInstance) {
  app.register(async (priv: FastifyInstance) => {
    priv.addHook('preHandler', app.requireAuth);

    // ---------------------------------------------------------- aperçu (dry-run)
    priv.post('/pa/ereporting/preview', async (request, reply) => {
      const input = parsePeriodInput(request.body || {});
      if (!input) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Période (periodStart, periodEnd ISO) et périodicité (monthly|quarterly) requises.' });
      try {
        return await previewEreportingDeclaration(request.auth!.organizationId, input);
      } catch (error) {
        const mapped = mapError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    });

    // ---------------------------------------------------------- préparation scellée
    priv.post('/pa/ereporting/declarations', async (request, reply) => {
      const input = parsePeriodInput(request.body || {});
      if (!input) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Période (periodStart, periodEnd ISO) et périodicité (monthly|quarterly) requises.' });
      if (!['owner', 'admin'].includes(request.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const result = await prepareEreportingDeclaration(request.auth!.organizationId, request.auth!.userId, input);
        return reply.code(201).send(result);
      } catch (error) {
        const mapped = mapError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    });

    // ---------------------------------------------------------- correction d'une déclaration
    priv.post('/pa/ereporting/declarations/:id/corrections', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      if (!['owner', 'admin'].includes(request.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        // Périodes lues en ISO textuel (::text) : les colonnes date arrivent sinon en Date locale.
        const original = (await query(
          `select id,kind,status,period_start::text period_start,period_end::text period_end,periodicity
             from ereporting_declarations where id=$1 and organization_id=$2`,
          [id, request.auth!.organizationId],
        )).rows[0];
        if (!original) return reply.code(404).send({ error: 'NOT_FOUND' });
        const result = await prepareEreportingDeclaration(request.auth!.organizationId, request.auth!.userId, {
          periodStart: String(original.period_start),
          periodEnd: String(original.period_end),
          periodicity: String(original.periodicity),
          kind: 'correction',
          correctsDeclarationId: id,
        });
        return reply.code(201).send(result);
      } catch (error) {
        const mapped = mapError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    });

    // ---------------------------------------------------------- transmission + accusés
    priv.post('/pa/ereporting/declarations/:id/transmit', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      try {
        return await transmitEreportingDeclaration(request.auth!.organizationId, request.auth!.userId, id);
      } catch (error) {
        const mapped = mapError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    });

    priv.get('/pa/ereporting/declarations', async request => {
      const q: any = request.query || {};
      return {
        declarations: await listEreportingDeclarations(request.auth!.organizationId, {
          status: q.status ? String(q.status) : null,
          limit: Number(q.limit) || 50,
        }),
      };
    });

    priv.get('/pa/ereporting/declarations/:id', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const item = await getEreportingDeclaration(request.auth!.organizationId, id);
      if (!item) return reply.code(404).send({ error: 'NOT_FOUND' });
      return item;
    });

    priv.get('/pa/ereporting/declarations/:id/file', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      let file: { filename: string; mimeType: string; bytes: Buffer } | null = null;
      try { file = await readEreportingPayload(request.auth!.organizationId, id); }
      catch (e: any) {
        if (e?.message === 'INVALID_STORAGE_KEY') return reply.code(500).send({ error: 'INTERNAL_ERROR' });
        throw e;
      }
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND' });
      return reply
        .header('Content-Type', file.mimeType)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
        .header('Cache-Control', 'no-store')
        .send(file.bytes);
    });

    priv.get('/pa/ereporting/declarations/:id/ack', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      let file: { filename: string; mimeType: string; bytes: Buffer } | null = null;
      try { file = await readEreportingAck(request.auth!.organizationId, id); }
      catch (e: any) {
        if (e?.message === 'INVALID_STORAGE_KEY') return reply.code(500).send({ error: 'INTERNAL_ERROR' });
        throw e;
      }
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Aucun accusé archivé pour cette déclaration.' });
      return reply
        .header('Content-Type', file.mimeType)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
        .header('Cache-Control', 'no-store')
        .send(file.bytes);
    });
  });
}
