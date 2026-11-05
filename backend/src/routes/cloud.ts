// Routes du stockage documentaire cloud. Toutes les routes (sauf le retour OAuth, protégé par un state à usage unique)
// exigent une session et sont strictement limitées à l'entreprise de la session.
import type { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { config } from '../config.js';
import { renderDocument } from '../services/document-renderer.js';
import { readPrivateObject } from '../services/storage.js';
import {
  CloudError, ALLOWED_UPLOAD_TYPES, MAX_CLOUD_UPLOAD_BYTES, SOURCE_FOLDER, authorizationUrl, businessFileName, cloudAudit, cloudStatus,
  detectMime, disconnect, downloadDocument, driveSetupStatus, ensureFolderTree, exchangeCode, refreshQuota, saveConnection, uploadDocument,
} from '../services/cloud-drive.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REF = /^[A-Za-z0-9_-]{8,80}$/;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function sendCloudError(reply: FastifyReply, error: unknown) {
  if (error instanceof CloudError) return reply.code(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

function callbackPage(reply: FastifyReply, title: string, message: string, ok: boolean, returnPath: string) {
  const target = `/#${returnPath.startsWith('/') ? returnPath : '/dashboard'}${returnPath.includes('?') ? '&' : '?'}cloud=${ok ? 'connected' : 'refused'}`;
  return reply.code(ok ? 200 : 400).type('text/html; charset=utf-8').header('Cache-Control', 'no-store')
    .send(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aurion — ${esc(title)}</title><body style="font-family:system-ui,sans-serif;background:#151a1f;color:#eef3f8;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:24px"><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a style="color:#8fb6ff" href="${esc(target)}">Revenir à Aurion</a></p></main></body></html>`);
}

export async function cloudRoutes(app: FastifyInstance) {
  // Retour OAuth : public (Google redirige le navigateur), mais validé par un state aléatoire à usage unique et expirant.
  app.get('/cloud/google/callback', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (r, reply) => {
    const q: any = r.query || {};
    const state = String(q.state || '');
    if (!/^[A-Za-z0-9_-]{32,120}$/.test(state)) return callbackPage(reply, 'Lien invalide', 'Ce lien de connexion n’est pas valide. Relancez la connexion du cloud depuis Aurion.', false, '/dashboard');
    const s = (await query('delete from cloud_oauth_states where state=$1 and expires_at>now() returning organization_id,user_id,return_path', [state])).rows[0];
    if (!s) return callbackPage(reply, 'Lien expiré', 'Ce lien de connexion a expiré ou a déjà été utilisé. Relancez la connexion du cloud depuis Aurion.', false, '/dashboard');
    if (q.error) {
      await cloudAudit(s.organization_id, s.user_id, 'cloud_consent_refused', { reason: String(q.error).slice(0, 40) });
      return callbackPage(reply, 'Autorisation refusée', 'Vous n’avez pas autorisé Aurion à enregistrer ses documents dans Google Drive. Rien n’a été modifié ; vous pourrez connecter le cloud plus tard dans Paramètres → Stockage.', false, s.return_path);
    }
    try {
      const tokens = await exchangeCode(String(q.code || ''));
      await saveConnection(s.organization_id, s.user_id, tokens);
      await ensureFolderTree(s.organization_id);
      await refreshQuota(s.organization_id, { force: true }).catch(() => null);
      return callbackPage(reply, 'Cloud connecté', 'Google Drive est connecté. Aurion a préparé le dossier « Aurion — Mon entreprise ». Vous pouvez revenir à Aurion.', true, s.return_path);
    } catch (error) {
      r.log.warn({ code: error instanceof CloudError ? error.code : 'CLOUD_CALLBACK_FAILED' }, 'cloud oauth callback failed');
      const message = error instanceof CloudError ? error.message : 'La connexion n’a pas pu être finalisée. Réessayez depuis Aurion.';
      return callbackPage(reply, 'Connexion impossible', message, false, s.return_path);
    }
  });

  app.register(async priv => {
    priv.addHook('onRequest', app.requireAuth);

    priv.get('/cloud/status', async r => cloudStatus(r.auth!.organizationId));

    priv.get('/cloud/google/start', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (r, reply) => {
      const setup = driveSetupStatus();
      if (!setup.configured) return reply.code(503).send({ error: 'CLOUD_NOT_CONFIGURED', message: 'La connexion à Google Drive n’est pas encore configurée sur ce serveur Aurion.', missingConfiguration: setup.missingConfiguration });
      const ret = String((r.query as any)?.returnTo || '/dashboard');
      const returnPath = ['/dashboard', '/onboarding'].includes(ret) ? ret : '/dashboard';
      const state = crypto.randomBytes(32).toString('base64url');
      await query(`delete from cloud_oauth_states where expires_at<now()`);
      await query(`insert into cloud_oauth_states(state,organization_id,user_id,return_path,expires_at) values($1,$2,$3,$4,now()+interval '10 minutes')`, [state, r.auth!.organizationId, r.auth!.userId, returnPath]);
      const email = (await query('select email from users where id=$1', [r.auth!.userId])).rows[0]?.email;
      return { url: authorizationUrl(state, email) };
    });

    priv.delete('/cloud/connection', async r => disconnect(r.auth!.organizationId, r.auth!.userId));

    priv.post('/cloud/quota/refresh', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (r, reply) => {
      try { await refreshQuota(r.auth!.organizationId, { force: Boolean((r.body as any)?.force) }); return cloudStatus(r.auth!.organizationId); }
      catch (error) { return sendCloudError(reply, error); }
    });

    priv.post('/cloud/folders/ensure', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (r, reply) => {
      try { const folders = await ensureFolderTree(r.auth!.organizationId); return { ok: true, folders: Object.keys(folders).length }; }
      catch (error) { return sendCloudError(reply, error); }
    });

    priv.get('/cloud/documents', async r => {
      const q: any = r.query || {};
      const params: unknown[] = [r.auth!.organizationId];
      let where = 'organization_id=$1';
      if (q.businessRef) { params.push(String(q.businessRef).slice(0, 160)); where += ` and business_ref=$${params.length}`; }
      if (q.sourceKind && SOURCE_FOLDER[String(q.sourceKind)]) { params.push(String(q.sourceKind)); where += ` and source_kind=$${params.length}`; }
      if (q.sourceId && UUID.test(String(q.sourceId))) { params.push(String(q.sourceId)); where += ` and source_id=$${params.length}`; }
      if (q.clientRefs) { const refs = String(q.clientRefs).split(',').filter(x => CLIENT_REF.test(x)).slice(0, 200); params.push(refs); where += ` and client_ref = any($${params.length}::text[])`; }
      const rows = (await query(`select id,client_ref as "clientRef",business_ref as "businessRef",source_kind as "sourceKind",source_id as "sourceId",folder_key as "folderKey",file_name as "fileName",mime_type as "mimeType",size_bytes as "sizeBytes",version,status,error_code as "errorCode",locked,synced_at as "syncedAt",updated_at as "updatedAt" from cloud_documents where ${where} order by updated_at desc limit 300`, params)).rows;
      return { documents: rows };
    });

    // Transfert d'un fichier de la file locale de l'appareil. Le contenu transite en mémoire et n'est jamais écrit sur le disque du serveur.
    priv.post('/cloud/documents', { bodyLimit: MAX_CLOUD_UPLOAD_BYTES + 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (r, reply) => {
      const fields: Record<string, string> = {}; let file: { name: string; mime: string; bytes: Buffer } | null = null;
      try {
        for await (const part of (r as any).parts({ limits: { fileSize: MAX_CLOUD_UPLOAD_BYTES, files: 1 } })) {
          if (part.type === 'file') {
            const bytes: Buffer = await part.toBuffer();
            if (part.file?.truncated) return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Le fichier dépasse 25 Mo.' });
            file = { name: String(part.filename || 'document').slice(0, 200), mime: String(part.mimetype || ''), bytes };
          } else fields[part.fieldname] = String(part.value ?? '').slice(0, 500);
        }
      } catch (error: any) {
        if (error?.statusCode === 413 || error?.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Le fichier dépasse 25 Mo.' });
        throw error;
      }
      if (!file || !file.bytes.length) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Aucun fichier reçu.' });
      if (!CLIENT_REF.test(fields.clientRef || '')) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Identifiant de transfert invalide.' });
      const sourceKind = SOURCE_FOLDER[fields.sourceKind] ? fields.sourceKind : 'file';
      if (fields.sourceId && !UUID.test(fields.sourceId)) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Référence métier invalide.' });
      const mime = detectMime(file.bytes, file.mime, file.name);
      if (!mime || !ALLOWED_UPLOAD_TYPES.has(mime)) return reply.code(415).send({ error: 'UNSUPPORTED_FILE', message: 'Type de fichier non accepté (PDF, images PNG/JPEG/WebP, CSV, TXT, ODT/ODS, DOCX/XLSX, ZIP).' });
      if (sourceKind === 'expense_receipt' && fields.sourceId) {
        const owns = await query('select 1 from expense_reports where id=$1 and organization_id=$2', [fields.sourceId, r.auth!.organizationId]);
        if (!owns.rowCount) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Note de frais introuvable.' });
      }
      try {
        const result = await uploadDocument({
          organizationId: r.auth!.organizationId, userId: r.auth!.userId, clientRef: fields.clientRef, sourceKind, sourceId: fields.sourceId || null,
          businessRef: fields.businessRef || null, fileName: file.name, mimeType: mime, bytes: file.bytes, expectedSha256: fields.sha256 || null,
          baseVersion: fields.baseVersion ? Number(fields.baseVersion) : null, allowNewVersion: fields.allowNewVersion === 'true', deviceLabel: fields.deviceLabel || null,
        });
        if (sourceKind === 'expense_receipt' && fields.sourceId) await query('update expense_reports set cloud_document_id=$1,updated_at=now() where id=$2 and organization_id=$3', [result.document.id, fields.sourceId, r.auth!.organizationId]);
        return reply.code(result.conflict ? 409 : 200).send({ status: result.document.status, conflict: Boolean(result.conflict), replay: result.replay, document: { id: result.document.id, clientRef: result.document.client_ref, fileName: result.document.file_name, version: result.document.version, syncedAt: result.document.synced_at } });
      } catch (error) { return sendCloudError(reply, error); }
    });

    // Archivage d'un devis ou d'une facture générés par Aurion : le PDF est produit puis envoyé directement au cloud.
    priv.post('/cloud/business/:kind/:id', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (r, reply) => {
      const { kind, id } = r.params as any;
      if (!['quote', 'invoice'].includes(kind) || !UUID.test(String(id))) return reply.code(400).send({ error: 'INVALID_INPUT' });
      const org = r.auth!.organizationId;
      const doc = (await query(`select q.id,q.number,q.document_type,q.status,c.name client_name from quotes q left join clients c on c.id=q.client_id where q.id=$1 and q.organization_id=$2`, [id, org])).rows[0];
      if (!doc || (kind === 'invoice') !== (doc.document_type === 'invoice')) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Document introuvable.' });
      try {
        const rendered = await renderDocument(org, id, kind);
        const bytes = await readPrivateObject(String((rendered.keys as any).pdf));
        const sha = crypto.createHash('sha256').update(bytes).digest('hex');
        const clientRef = `${kind}-${id.replace(/-/g, '')}-${sha.slice(0, 16)}`.slice(0, 80);
        const result = await uploadDocument({ organizationId: org, userId: r.auth!.userId, clientRef, sourceKind: kind, sourceId: id, businessRef: doc.number, fileName: businessFileName(String(doc.number || kind), doc.client_name, '.pdf'), mimeType: 'application/pdf', bytes, allowNewVersion: (r.body as any)?.allowNewVersion === true });
        return { status: result.document.status, replay: result.replay, document: { id: result.document.id, fileName: result.document.file_name, version: result.document.version, syncedAt: result.document.synced_at } };
      } catch (error: any) {
        if (error?.message === 'NOT_FOUND') return reply.code(404).send({ error: 'NOT_FOUND' });
        return sendCloudError(reply, error);
      }
    });

    priv.get('/cloud/documents/:id/content', async (r, reply) => {
      const id = String((r.params as any).id);
      if (!UUID.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
      try {
        const { row, bytes } = await downloadDocument(r.auth!.organizationId, id);
        const download = (r.query as any)?.download === '1';
        const name = String(row.file_name).replace(/[^A-Za-z0-9._-]/g, '_');
        return reply.header('Content-Type', row.mime_type).header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}"`).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'").send(bytes);
      } catch (error) { return sendCloudError(reply, error); }
    });
  });

  // Aucune valeur sensible n'est journalisée au démarrage : uniquement l'état de configuration.
  app.log.info({ cloudDriveConfigured: driveSetupStatus().configured, env: config.NODE_ENV }, 'cloud storage routes ready');
}
