// Bloc 4 — routes d'ÉMISSION des factures électroniques via la plateforme agréée (PA).
//
// Authentifiées (session utilisateur, isolation RLS 074) :
//   GET  /pa/outgoing-endpoints            — état (non secret) du point d'entrée d'émission
//   POST /pa/outgoing-endpoints            — configure/renouvelle le point d'entrée + secret
//                                            (owner/admin ; secret chiffré au repos, jamais journalisé)
//   GET  /pa/outgoing                      — liste des transmissions (+ filtre facture/statut)
//   GET  /pa/outgoing/:id                  — détail d'une transmission + journal complet
//   GET  /pa/outgoing/:id/file             — document structuré archivé (UBL/CII)
//   GET  /pa/outgoing/:id/ack              — accusé PA archivé sans altération
//   POST /pa/outgoing/prepare/:invoiceId   — prépare le document structuré (mentions obligatoires
//                                            exigées) et l'archive (SHA-256 scellé)
//   POST /pa/outgoing/:id/transmit         — transmet à la PA ; seul un accusé signé règle l'état ;
//                                            re-tentatives idempotentes (même identifiant PA)
//
// Les quatre mentions du 1er septembre 2026 (SIREN client, catégorie d'opération, option TVA
// sur les débits le cas échéant, adresse de livraison si différente) sont saisies sur la
// facture (PATCH /quotes/:id) et exigées/transportées à la préparation du document.

import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  ElectronicOutgoingError,
  ensurePaOutgoingEndpoint,
  getPaOutgoingEndpoint,
  prepareElectronicInvoice,
  transmitElectronicInvoice,
  listElectronicOutgoing,
  getElectronicOutgoing,
  readOutgoingPayload,
  readOutgoingAck,
} from '../services/electronic-outgoing.js';
import { OPERATION_CATEGORIES } from '../services/electronic-invoice-ubl.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapError(error: unknown): { statusCode: number; body: Record<string, unknown> } | null {
  if (!(error instanceof ElectronicOutgoingError)) return null;
  return { statusCode: error.statusCode, body: { error: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) } };
}

export async function paOutgoingRoutes(app: FastifyInstance) {
  app.register(async (priv: FastifyInstance) => {
    priv.addHook('preHandler', app.requireAuth);

    // ------------------------------------------------- point d'entrée d'émission (config)
    priv.get('/pa/outgoing-endpoints', async request => {
      const view = await getPaOutgoingEndpoint(request.auth!.organizationId);
      return { ...view, timeoutMs: config.AURION_PA_OUT_TIMEOUT_MS };
    });

    priv.post('/pa/outgoing-endpoints', async (request, reply) => {
      if (!['owner', 'admin'].includes(request.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
      const body: any = request.body || {};
      const result = await ensurePaOutgoingEndpoint(request.auth!.organizationId, {
        provider: typeof body.provider === 'string' ? body.provider : undefined,
        baseUrl: String(body.baseUrl ?? ''),
        secret: String(body.secret ?? ''),
        identifier: body.identifier == null ? null : String(body.identifier),
      });
      if (!result.ok) {
        const statusCode = result.code === 'SECRET_TOO_SHORT' || result.code === 'INVALID_BASE_URL' || result.code === 'PA_PROVIDER_UNKNOWN' ? 400 : 503;
        return reply.code(statusCode).send({ error: result.code, message: result.message });
      }
      return reply.code(201).send({
        ...result.endpoint,
        note: 'Point d’entrée d’émission enregistré. Le secret de signature reste côté serveur (chiffré au repos, jamais journalisé).',
      });
    });

    // ------------------------------------------------- préparation du document structuré
    priv.post('/pa/outgoing/prepare/:invoiceId', async (request, reply) => {
      const invoiceId = String((request.params as any).invoiceId);
      if (!UUID_RE.test(invoiceId)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const body: any = request.body || {};
      const format = String(body.format || 'ubl').toLowerCase() === 'cii' ? 'cii' : 'ubl';
      const operationCategory = String(body.operationCategory || '').trim().toUpperCase();
      try {
        const result = await prepareElectronicInvoice(request.auth!.organizationId, request.auth!.userId, invoiceId, {
          format: format as 'ubl' | 'cii',
          operationCategory: operationCategory as any,
          buyerSiren: String(body.buyerSiren ?? ''),
          vatOnPayment: Boolean(body.vatOnPayment),
          deliveryAddress: body.deliveryAddress == null ? null : String(body.deliveryAddress),
        });
        return reply.code(result.created ? 201 : 200).send({
          ok: true, id: result.id, status: result.status, format: result.format,
          payloadSha256: result.payloadSha256, regenerated: result.regenerated,
        });
      } catch (error) {
        const mapped = mapError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    });

    // ------------------------------------------------- transmission + accusés
    priv.post('/pa/outgoing/:id/transmit', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      try {
        const result = await transmitElectronicInvoice(request.auth!.organizationId, request.auth!.userId, id);
        return result;
      } catch (error) {
        const mapped = mapError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    });

    priv.get('/pa/outgoing', async request => {
      const q: any = request.query || {};
      return {
        transmissions: await listElectronicOutgoing(request.auth!.organizationId, {
          invoiceId: q.invoiceId && UUID_RE.test(String(q.invoiceId)) ? String(q.invoiceId) : null,
          status: q.status ? String(q.status) : null,
          limit: Number(q.limit) || 50,
        }),
      };
    });

    priv.get('/pa/outgoing/:id', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const item = await getElectronicOutgoing(request.auth!.organizationId, id);
      if (!item) return reply.code(404).send({ error: 'NOT_FOUND' });
      return item;
    });

    priv.get('/pa/outgoing/:id/file', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      let file: { filename: string; mimeType: string; bytes: Buffer } | null = null;
      try { file = await readOutgoingPayload(request.auth!.organizationId, id); }
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

    priv.get('/pa/outgoing/:id/ack', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      let file: { filename: string; mimeType: string; bytes: Buffer } | null = null;
      try { file = await readOutgoingAck(request.auth!.organizationId, id); }
      catch (e: any) {
        if (e?.message === 'INVALID_STORAGE_KEY') return reply.code(500).send({ error: 'INTERNAL_ERROR' });
        throw e;
      }
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Aucun accusé archivé pour cette transmission.' });
      return reply
        .header('Content-Type', file.mimeType)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
        .header('Cache-Control', 'no-store')
        .send(file.bytes);
    });
  });

  // Valeur documentaire : codes de catégorie d'opération acceptés (introspection sans session
  // n'est pas exposée ; cette constante est re-exportée pour les tests de contrat).
  void OPERATION_CATEGORIES;
}
