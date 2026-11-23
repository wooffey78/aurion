// Bloc 14 (prompt 14) + Bloc 16 (prompt 16) — partage public de document par lien : la
// fondation du portail client. Le partage est EXPLICITE (créé par l'entrepreneur), RÉVOCABLE
// (token hashé, révocation immédiate) et HISTORISÉ (compteur d'accès, dernière date, IP).
// Aucune donnée au-delà du fichier partagé : ni notes internes, ni marges, ni coûts, ni
// données comptables, ni autres documents. Aucun succès simulé : fichier absent → 404.
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { query } from '../db.js';
import { readPrivateObject } from '../services/storage.js';

export async function shareLinkRoutes(app: FastifyInstance) {
  // Route PUBLIQUE volontairement sans requireAuth : l'autorisation est portée par le jeton
  // (SHA-256 stocké, jamais le jeton lui-même), l'expiration, la révocation et l'état du
  // document. Rate-limité contre le balayage de jetons.
  app.get('/share/:token/download', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (r, reply) => {
    const token = String((r.params as any).token || '');
    if (!/^[0-9a-f-]{16,64}$/i.test(token)) return reply.code(404).send({ error: 'NOT_FOUND' });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const share = (await query(
      `select s.id,s.document_id as "documentId",s.expires_at as "expiresAt",s.revoked_at as "revokedAt",s.organization_id as organizationId,
              d.original_name as "originalName",d.mime_type as "mimeType",d.storage_key as "storageKey",d.status as "documentStatus"
       from document_shares s join documents d on d.id=s.document_id and d.organization_id=s.organization_id
       where s.token_hash=$1`,
      [tokenHash],
    )).rows[0];
    if (!share || share.revokedAt) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ce lien de partage n\'existe pas (ou n\'existe plus).' });
    if (share.expiresAt && new Date(String(share.expiresAt)).getTime() < Date.now()) {
      return reply.code(410).send({ error: 'SHARE_EXPIRED', message: 'Ce lien de partage a expiré.' });
    }
    // Seule une version validée (clean) du dépôt central est partageable ; corbeille/purge → 404.
    if (String(share.documentStatus) !== 'clean') {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Le document partagé n\'est plus disponible.' });
    }
    try {
      const buffer = await readPrivateObject(String(share.storageKey));
      // Historisation de l'accès : compteur, date, IP (RGPD : adresse tronquée — pas de
      // stockage de l'IP complète, seuls préfixes utiles à la détection d'abus).
      const ip = String(r.headers['x-forwarded-for'] || r.ip || '').split(',')[0].trim();
      const ipPrefix = ip.split('.').slice(0, 2).join('.') + (ip.includes('.') ? '.x.x' : '');
      await query(
        `update document_shares set access_count=access_count+1,last_accessed_at=now(),last_accessed_ip=$2 where id=$1`,
        [share.id, ipPrefix.slice(0, 64)],
      );
      return reply
        .header('Content-Type', String(share.mimeType))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'")
        .header('Cache-Control', 'no-store')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(share.originalName))}`)
        .send(buffer);
    } catch {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Le fichier partagé est introuvable sur le stockage.' });
    }
  });
}
