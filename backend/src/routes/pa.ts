// Bloc 3 — routes de réception des factures fournisseurs électroniques (plateforme agréée).
//
// Public (serveur-à-serveur, sans session utilisateur) :
//   POST /pa/webhook/:token — appel signé de la PA ; corps brut préservé pour la vérification.
// Authentifiées (session utilisateur, isolation RLS 074) :
//   GET   /pa/inbox                 — boîte de réception (+ événements en erreur pour reprise)
//   GET   /pa/inbox/:id             — détail d'une facture reçue + journal
//   GET   /pa/inbox/:id/file        — fichier original archivé (téléchargement, sans altération)
//   PATCH /pa/inbox/:id             — correction des champs internes / rattachement fournisseur /
//                                    statut (reviewed|approved|rejected) — jamais d'écriture
//                                    comptable automatique
//   POST  /pa/events/:id/reprocess  — reprise manuelle d'un événement en erreur
//   GET/POST /pa/endpoints          — provisionnement (et rotation) du point d'entrée webhook
//                                    à configurer dans la PA choisie

import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { processPaWebhook, listInbox, getInboxItem, readOriginalFile, reviewInboxItem, reprocessEvent, ensureWebhookEndpoint } from '../services/pa/inbox.js';
import { paReceptionConfigured, resolvePaAdapter } from '../services/pa/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function paRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------- webhook public (PA → Aurion)
  // La PA appelle cette route serveur-à-serveur : aucune session utilisateur n'est requise.
  // Le parseur local conserve les octets exacts nécessaires à la vérification de signature.
  // Le limiteur de débit borne l'exposition publique sans gêner les re-tentatives légitimes.
  app.register(async paWebhook => {
    paWebhook.removeContentTypeParser('application/json');
    paWebhook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    paWebhook.post('/pa/webhook/:token', {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      bodyLimit: Math.min(32 * 1024 * 1024, Math.ceil(config.AURION_PA_MAX_FILE_BYTES * 1.4) + 128 * 1024),
    }, async (request, reply) => {
      const token = String((request.params as any)?.token || '');
      if (!UUID_RE.test(token)) return reply.code(404).send({ error: 'WEBHOOK_NOT_FOUND' });
      const provider = config.AURION_PA_PROVIDER;
      if (!provider || !resolvePaAdapter(provider)) {
        return reply.code(503).send({ error: 'PA_NOT_CONFIGURED', message: 'Réception de factures électroniques non configurée.' });
      }
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body ?? ''), 'utf8');
      const outcome = await processPaWebhook({
        provider,
        token,
        rawBody,
        headers: request.headers as any,
        log: request.log,
      });
      return reply.code(outcome.statusCode).send(outcome.body);
    });
  });

  // ------------------------------------------------------------------- authentifiées (org)
  app.register(async (priv: FastifyInstance) => {
    priv.addHook('preHandler', app.requireAuth);

    priv.get('/pa/inbox', async request => listInbox(request.auth!.organizationId, {
      status: (request.query as any)?.status || null,
      limit: Number((request.query as any)?.limit) || 50,
    }));

    priv.get('/pa/inbox/:id', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const item = await getInboxItem(request.auth!.organizationId, id);
      if (!item) return reply.code(404).send({ error: 'NOT_FOUND' });
      return item;
    });

    priv.get('/pa/inbox/:id/file', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      let file: { filename: string; mimeType: string; bytes: Buffer } | null;
      try { file = await readOriginalFile(request.auth!.organizationId, id); }
      catch (e: any) {
        if (e?.message === 'INVALID_STORAGE_KEY') return reply.code(500).send({ error: 'INTERNAL_ERROR' });
        throw e;
      }
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Original non archivé pour cette entrée (copie de doublon).' });
      return reply
        .header('Content-Type', file.mimeType)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
        .header('Cache-Control', 'no-store')
        .send(file.bytes);
    });

    priv.patch('/pa/inbox/:id', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const body: any = request.body || {};
      const patch: any = {};
      if (body.accountingCategory !== undefined) patch.accountingCategory = body.accountingCategory;
      if (body.supplierId !== undefined) patch.supplierId = body.supplierId;
      if (body.status !== undefined) patch.status = body.status;
      const result = await reviewInboxItem(request.auth!.organizationId, id, request.auth!.userId, patch);
      if ('notFound' in result) return reply.code(404).send({ error: 'NOT_FOUND' });
      if ('badSupplier' in result) return reply.code(400).send({ error: 'INVALID_SUPPLIER' });
      if ('badCategory' in result) return reply.code(400).send({ error: 'INVALID_INPUT' });
      if ('badStatus' in result) return reply.code(400).send({ error: 'INVALID_STATUS' });
      if ('conflict' in result) return reply.code(409).send({ error: result.conflict, message: result.message });
      return { ok: true, invoice: result.updated };
    });

    priv.post('/pa/events/:id/reprocess', async (request, reply) => {
      const id = String((request.params as any).id);
      if (!UUID_RE.test(id)) return reply.code(404).send({ error: 'NOT_FOUND' });
      const result = await reprocessEvent(request.auth!.organizationId, id, request.auth!.userId);
      if ('notFound' in result) return reply.code(404).send({ error: 'NOT_FOUND' });
      if ('notConfigured' in result) return reply.code(503).send({ error: 'PA_NOT_CONFIGURED' });
      if ('conflict' in result) return reply.code(409).send({ error: result.conflict, message: result.message });
      if ('stillError' in result) return reply.code(422).send({ error: result.code, message: result.message });
      return { ok: true, invoiceId: result.invoiceId, status: result.status, duplicate: Boolean(result.duplicate) };
    });

    priv.get('/pa/endpoints', async request => {
      if (!paReceptionConfigured()) {
        return { configured: false, provider: null, webhookUrl: null, message: 'Réception de factures électroniques non configurée (AURION_PA_PROVIDER / AURION_PA_WEBHOOK_SECRET).' };
      }
      const result = await ensureWebhookEndpoint(request.auth!.organizationId, false);
      if ('notConfigured' in result) return { configured: false, provider: config.AURION_PA_PROVIDER || null, webhookUrl: null };
      return { configured: true, provider: result.provider, webhookUrl: result.webhookUrl, createdAt: result.createdAt };
    });

    priv.post('/pa/endpoints', async (request, reply) => {
      if (!['owner', 'admin'].includes(request.auth!.role)) return reply.code(403).send({ error: 'FORBIDDEN' });
      const rotate = Boolean((request.body as any)?.rotate);
      const result = await ensureWebhookEndpoint(request.auth!.organizationId, rotate);
      if ('notConfigured' in result) {
        return reply.code(503).send({ error: 'PA_NOT_CONFIGURED', message: 'Réception de factures électroniques non configurée.' });
      }
      return reply.code(rotate ? 201 : 200).send({
        configured: true, provider: result.provider, webhookUrl: result.webhookUrl, createdAt: result.createdAt,
        note: 'Configurez cette URL dans la plateforme agréée choisie ; le secret de signature reste côté serveur (AURION_PA_WEBHOOK_SECRET).',
      });
    });
  });
}
