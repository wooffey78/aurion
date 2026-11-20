// Bloc 3 — boîte de réception des factures fournisseurs électroniques reçues d'une PA.
//
// Flux d'un appel webhook (POST /pa/webhook/:token) :
//   1. résolution du point d'entrée par jeton (pool d'administration journalisé, RLS respectée) ;
//   2. vérification de la signature par l'adaptateur du provider configuré ;
//   3. décodage/validation de l'enveloppe et de la charge utile (adaptateur, zod strict) ;
//   4. transaction tenant (RLS 074) : registre d'idempotence (provider, event_id, organisation),
//      détection de doublon de contenu (SHA-256), archivage de l'original sans altération dans
//      le stockage privé, rapprochement fournisseur (email, nom normalisé), écriture de la
//      facture reçue et journal d'événements ;
//   5. en cas d'erreur non permanente : l'événement est conservé en statut « error » avec sa
//      charge utile — la PA peut re-tenter (re-traitement automatique) et l'exploitation peut
//      relancer manuellement (POST /pa/events/:id/reprocess). Aucune donnée n'est perdue.
//
// Aucune écriture comptable n'est produite automatiquement : l'approbation est un geste
// utilisateur explicite et journalisé. Le fichier JSON de préparation interne
// (services/electronic-invoice.ts) n'est ni consommé ni modifié ici.

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { config } from '../../config.js';
import { query, db, applyTenant, withTenant, adminQuery, logAdminAccess } from '../../db.js';
import { writePrivateObject, readPrivateObject, deletePrivateObject } from '../storage.js';
import { resolvePaAdapter, paReceptionConfigured } from './index.js';
import { GENERIC_PA_SIGNATURE_HEADER } from './generic.js';
import type { PaEvent, PaWebhookHeaders } from './types.js';

const sha256Hex = (value: Buffer) => createHash('sha256').update(value).digest('hex');

export type PaWebhookOutcome = { statusCode: number; body: Record<string, unknown> };

/** Nettoie un identifiant d'événement pour un usage sûr comme segment de clé de stockage. */
function safeEventSegment(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
  return clean || 'event';
}

/** Nettoie un nom de fichier fourni par la PA (basename, jeux de caractères sûrs, longueur bornée). */
function safeFilename(value: string): string {
  const base = path.basename(String(value || '')).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 120);
  return base || 'facture.bin';
}

/** Normalisation déterministe pour le rapprochement fournisseur (minuscules, accents, espaces). */
function normalizeName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type SupplierMatch = { supplierId: string | null; matchStatus: 'matched' | 'ambiguous' | 'unmatched' };

/**
 * Rapprochement fournisseur : email exact (insensible à la casse) prioritaire, sinon nom
 * normalisé. Zéro correspondance → « unmatched » ; plusieurs → « ambiguous » (l'utilisateur
 * tranche, aucune fusion automatique). La normalisation d'accents reste interne au
 * rapprochement ; la recherche utilisateur tolérante aux accents est le bloc 12.
 */
async function matchSupplier(
  client: PoolClient,
  organizationId: string,
  supplier: { name: string; email: string | null },
): Promise<SupplierMatch> {
  const rows = (await client.query('select id, name, email from suppliers where organization_id=$1', [organizationId])).rows;
  const email = (supplier.email || '').trim().toLowerCase();
  const nameKey = normalizeName(supplier.name);
  if (!nameKey && !email) return { supplierId: null, matchStatus: 'unmatched' };
  const byEmail = email ? rows.filter(r => String(r.email || '').trim().toLowerCase() === email) : [];
  const byName = nameKey ? rows.filter(r => normalizeName(String(r.name || '')) === nameKey) : [];
  const candidates = byEmail.length ? byEmail : byName;
  if (candidates.length === 1) return { supplierId: candidates[0].id, matchStatus: 'matched' };
  if (candidates.length > 1) return { supplierId: null, matchStatus: 'ambiguous' };
  return { supplierId: null, matchStatus: 'unmatched' };
}

type LedgerOutcome =
  | { kind: 'reserved'; ledgerId: string }
  | { kind: 'duplicate-event' }
  | { kind: 'retry-after-error'; ledgerId: string };

/**
 * Réserve l'événement dans le registre d'idempotence. Si l'événement existe déjà :
 *   - traité/reçu → doublon d'événement (acquittement sans re-traitement) ;
 *   - en erreur avec la MÊME charge utile → reprise autorisée (re-traitement) ;
 *   - en erreur avec une charge utile DIFFÉRENTE (même event_id) → refus explicite (409).
 */
async function reserveLedgerEvent(
  client: PoolClient,
  organizationId: string,
  provider: string,
  eventId: string,
  eventType: string,
  payloadJson: unknown,
  endpointId: string,
  payloadDigest: string,
): Promise<LedgerOutcome> {
  const inserted = await client.query(
    `insert into pa_webhook_events(organization_id,provider,event_id,endpoint_id,event_type,payload,payload_sha256)
     values($1,$2,$3,$4,$5,$6::json,$7)
     on conflict (provider, event_id, organization_id) do nothing returning id`,
    [organizationId, provider, eventId, endpointId, eventType, JSON.stringify(payloadJson), payloadDigest],
  );
  if (inserted.rowCount === 1) return { kind: 'reserved', ledgerId: inserted.rows[0].id };
  const existing = (await client.query(
    `select id, status, payload_sha256 from pa_webhook_events where provider=$1 and event_id=$2 and organization_id=$3`,
    [provider, eventId, organizationId],
  )).rows[0];
  if (existing.status === 'error') {
    if (existing.payload_sha256 !== payloadDigest) {
      throw Object.assign(new Error('Un événement au même identifiant a déjà été reçu avec un contenu différent.'), { code: 'PA_EVENT_PAYLOAD_CHANGED' });
    }
    return { kind: 'retry-after-error', ledgerId: existing.id };
  }
  return { kind: 'duplicate-event' };
}

async function journal(
  client: PoolClient,
  organizationId: string,
  kind: string,
  options: { invoiceId?: string | null; providerEventId?: string | null; detail?: unknown } = {},
): Promise<void> {
  await client.query(
    `insert into supplier_electronic_invoice_events(organization_id,invoice_id,provider_event_id,kind,detail)
     values($1,$2,$3,$4,$5::jsonb)`,
    [organizationId, options.invoiceId ?? null, options.providerEventId ?? null, kind, JSON.stringify(options.detail ?? null)],
  );
}

/** Charge utile conservée pour audit/reprise : l'événement complet SANS le fichier binaire,
 *  remplacé par son empreinte SHA-256 (le fichier lui-même est archivé ; l'empreinte scelle le
 *  contenu dans le registre et rend le rejeu détectable). */
function safeEventPayload(event: PaEvent): unknown {
  if (!event.invoice) return { ...event, invoice: null };
  const doc = event.invoice.document;
  return {
    ...event,
    invoice: {
      ...event.invoice,
      document: { filename: doc.filename, contentType: doc.contentType, contentSha256: sha256Hex(doc.bytes) },
    },
  };
}

function safeRawPayload(rawBody: Buffer): unknown {
  try { return JSON.parse(rawBody.toString('utf8')); } catch { return { unreadable: true }; }
}

/** Digest canonique de la charge utile : sérialisation JSON déterministe de l'objet stocké,
 *  indépendante des octets/espacements exacts envoyés par la PA (rejeux et reprise stables). */
function canonicalPayloadDigest(payloadJson: unknown): string {
  return sha256Hex(Buffer.from(JSON.stringify(payloadJson), 'utf8'));
}

/** Persistance complète d'une facture reçue (doublon de contenu inclus) dans la transaction tenant. */
async function persistInvoice(
  client: PoolClient,
  organizationId: string,
  provider: string,
  event: PaEvent,
  ledgerId: string,
): Promise<{ duplicate: boolean; duplicateOf?: string; invoiceId: string; status: string }> {
  const invoice = event.invoice!;
  const digest = sha256Hex(invoice.document.bytes);

  // 1) Doublon de contenu : même organisation + provider + SHA-256, hors copies de doublon.
  const existing = (await client.query(
    `select id from supplier_electronic_invoices
      where organization_id=$1 and provider=$2 and content_sha256=$3 and status <> 'duplicate'
      order by received_at limit 1`,
    [organizationId, provider, digest],
  )).rows[0];

  if (existing) {
    const dup = (await client.query(
      `insert into supplier_electronic_invoices(
         organization_id,provider,event_id,pa_invoice_id,status,content_sha256,payload,
         supplier_name,supplier_siren,supplier_siret,invoice_number,issue_date,due_date,currency,
         total_ht,total_tva,total_ttc,size_bytes,mime_type,original_filename,duplicate_of)
       values($1,$2,$3,$4,'duplicate',$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       returning id`,
      [
        organizationId, provider, event.eventId, invoice.invoiceId, digest,
        JSON.stringify(safeEventPayload(event)),
        invoice.supplier.name, invoice.supplier.siren, invoice.supplier.siret, invoice.number,
        invoice.issueDate, invoice.dueDate, invoice.currency,
        invoice.totals.net.toFixed(2), invoice.totals.tax.toFixed(2), invoice.totals.gross.toFixed(2),
        invoice.document.bytes.length, invoice.document.contentType, safeFilename(invoice.document.filename),
        existing.id,
      ],
    )).rows[0];
    await journal(client, organizationId, 'invoice.duplicate_detected', {
      invoiceId: dup.id, providerEventId: event.eventId,
      detail: { duplicateOf: existing.id, contentSha256: digest, paInvoiceId: invoice.invoiceId },
    });
    await client.query(`update pa_webhook_events set status='processed',processed_at=now() where id=$1`, [ledgerId]);
    return { duplicate: true, duplicateOf: existing.id, invoiceId: dup.id, status: 'duplicate' };
  }

  // 2) Rapprochement fournisseur (email, nom normalisé) — aucune création ni fusion automatique.
  const match = await matchSupplier(client, organizationId, { name: invoice.supplier.name, email: invoice.supplier.email });

  // 3) Archivage de l'original, sans altération : clé déterministe (event + fichier), écriture
  //    unique dans le stockage privé de l'organisation ; le SHA-256 scelle le contenu.
  const year = new Date().toISOString().slice(0, 4);
  const storageKey = `private/${organizationId}/pa-inbox/${year}/${safeEventSegment(event.eventId)}/${safeFilename(invoice.document.filename)}`;
  await writePrivateObject(storageKey, invoice.document.bytes, invoice.document.contentType);

  try {
    const row = (await client.query(
      `insert into supplier_electronic_invoices(
         organization_id,provider,event_id,pa_invoice_id,status,original_storage_key,original_filename,
         mime_type,size_bytes,content_sha256,payload,supplier_id,supplier_match_status,
         supplier_name,supplier_siren,supplier_siret,invoice_number,issue_date,due_date,currency,
         total_ht,total_tva,total_ttc)
       values($1,$2,$3,$4,'received',$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       returning id`,
      [
        organizationId, provider, event.eventId, invoice.invoiceId, storageKey,
        safeFilename(invoice.document.filename), invoice.document.contentType, invoice.document.bytes.length, digest,
        JSON.stringify(safeEventPayload(event)),
        match.supplierId, match.matchStatus,
        invoice.supplier.name, invoice.supplier.siren, invoice.supplier.siret, invoice.number,
        invoice.issueDate, invoice.dueDate, invoice.currency,
        invoice.totals.net.toFixed(2), invoice.totals.tax.toFixed(2), invoice.totals.gross.toFixed(2),
      ],
    )).rows[0];
    await journal(client, organizationId, 'invoice.stored', {
      invoiceId: row.id, providerEventId: event.eventId,
      detail: {
        contentSha256: digest, sizeBytes: invoice.document.bytes.length,
        supplierMatch: match.matchStatus, storageKey,
        notice: 'Original archivé sans altération ; aucune écriture comptable produite automatiquement.',
      },
    });
    await client.query(`update pa_webhook_events set status='processed',processed_at=now() where id=$1`, [ledgerId]);
    return { duplicate: false, invoiceId: row.id, status: 'received' };
  } catch (error) {
    // Le fichier ne doit pas subsister sans sa ligne (pas d'orphelin) : nettoyage best-effort.
    await deletePrivateObject(storageKey).catch(() => {});
    throw error;
  }
}

/** Enregistre l'échec de traitement d'un événement dans le journal (transaction tenant, un client). */
async function markLedgerError(
  client: PoolClient,
  organizationId: string,
  ledgerId: string,
  code: string,
  message: string,
  providerEventId: string | null,
): Promise<void> {
  await journal(client, organizationId, 'invoice.parse_error', {
    providerEventId, detail: { code, message },
  });
  await client.query(
    `update pa_webhook_events set status='error',error_code=$2,error_message=$3,processed_at=now() where id=$1`,
    [ledgerId, code, message],
  );
}

/**
 * Traite un appel webhook entrant. Toute erreur non permanente renvoie 500 : la re-tentative
 * de la PA retrouve l'événement en statut « error » et déclenche la reprise automatique.
 */
export async function processPaWebhook(options: {
  provider: string;
  token: string;
  rawBody: Buffer;
  headers: PaWebhookHeaders;
  log: { warn: (o: unknown, msg: string) => void; error: (o: unknown, msg: string) => void };
}): Promise<PaWebhookOutcome> {
  const { provider, token, rawBody, headers, log } = options;
  const adapter = resolvePaAdapter(provider);
  if (!adapter || !paReceptionConfigured()) {
    return { statusCode: 503, body: { error: 'PA_NOT_CONFIGURED', message: 'Réception de factures électroniques non configurée.' } };
  }

  // 1) Résolution du point d'entrée : chemin inter-entreprises explicite (pool d'administration
  //    journalisé), jamais le pool applicatif sans contexte tenant.
  const endpoint = (await adminQuery(
    `select id, organization_id from pa_webhook_endpoints where token=$1 and provider=$2 and active=true`,
    [token, provider],
  )).rows[0];
  if (!endpoint) return { statusCode: 404, body: { error: 'WEBHOOK_NOT_FOUND' } };
  const organizationId: string = endpoint.organization_id;
  await logAdminAccess('pa.webhook.resolve', { provider, endpointId: endpoint.id });

  // 2) Signature : comparaison à temps constant sur le corps brut ; en cas d'échec la charge
  //    utile n'est ni décodée ni conservée (seule la présence de l'en-tête est journalisée).
  if (!adapter.verifySignature(rawBody, headers, config.AURION_PA_WEBHOOK_SECRET)) {
    await withTenant(organizationId, () => query(
      `insert into supplier_electronic_invoice_events(organization_id,provider_event_id,kind,detail)
       values($1,null,'webhook.signature_invalid',$2::jsonb)`,
      [organizationId, JSON.stringify({ provider, headerPresent: Boolean(headers[GENERIC_PA_SIGNATURE_HEADER]) })],
    ));
    return { statusCode: 400, body: { error: 'INVALID_WEBHOOK_SIGNATURE' } };
  }

  // 3) Décodage/validation par l'adaptateur (aucune persistance à ce stade).
  const parsed = await adapter.parseEvent(rawBody, config.AURION_PA_MAX_FILE_BYTES);
  const payloadJson = parsed.ok ? safeEventPayload(parsed.event) : safeRawPayload(rawBody);
  const payloadDigest = canonicalPayloadDigest(payloadJson);
  const envelopeHint = (() => {
    try { const j = JSON.parse(rawBody.toString('utf8')); return typeof j?.eventId === 'string' ? j.eventId.slice(0, 200) : null; } catch { return null; }
  })();

  // 4) Transaction tenant (RLS) : registre d'idempotence puis traitement.
  const client = await db.connect();
  try {
    // Webhook/services hors requête HTTP : pas de contexte ALS — le tenant est posé explicitement.
    await client.query('begin');
    await applyTenant(client, organizationId);
    let ledgerId: string;
    let retryAfterError = false;
    try {
      const outcome = await reserveLedgerEvent(
        client, organizationId, provider,
        parsed.ok ? parsed.event.eventId : (envelopeHint || `unparsable-${payloadDigest.slice(0, 16)}`),
        parsed.ok ? parsed.event.type : 'unknown',
        payloadJson,
        endpoint.id,
        payloadDigest,
      );
      if (outcome.kind === 'duplicate-event') {
        await client.query('commit');
        return { statusCode: 200, body: { received: true, duplicate: true } };
      }
      ledgerId = outcome.ledgerId;
      retryAfterError = outcome.kind === 'retry-after-error';
      if (retryAfterError) {
        await journal(client, organizationId, 'invoice.reprocessed', {
          providerEventId: parsed.ok ? parsed.event.eventId : null, detail: { trigger: 'webhook_retry' },
        });
      }
    } catch (error: any) {
      await client.query('rollback').catch(() => {});
      if (error?.code === 'PA_EVENT_PAYLOAD_CHANGED') {
        return { statusCode: 409, body: { error: 'PA_EVENT_PAYLOAD_CHANGED', message: error.message } };
      }
      throw error;
    }

    if (!parsed.ok || !parsed.event.invoice) {
      // Type d'événement connu sans facture : acquitté sans traitement (pas de boucle de re-tentatives).
      if (parsed.ok) {
        await journal(client, organizationId, 'webhook.ignored_type', {
          providerEventId: parsed.event.eventId, detail: { type: parsed.event.type },
        });
        await client.query(`update pa_webhook_events set status='processed',processed_at=now() where id=$1`, [ledgerId]);
        await client.query('commit');
        return { statusCode: 200, body: { received: true, ignored: true, type: parsed.event.type } };
      }
      await markLedgerError(client, organizationId, ledgerId, parsed.code, parsed.message, envelopeHint);
      await client.query('commit');
      return { statusCode: 422, body: { error: parsed.code, message: parsed.message } };
    }

    const result = await persistInvoice(client, organizationId, provider, parsed.event, ledgerId);
    await client.query('commit');
    return {
      statusCode: 200,
      body: result.duplicate
        ? { received: true, duplicate: true, duplicateOf: result.duplicateOf, invoiceId: result.invoiceId, status: result.status }
        : { received: true, invoiceId: result.invoiceId, status: result.status },
    };
  } catch (error: any) {
    await client.query('rollback').catch(() => {});
    log.error({ code: typeof error?.code === 'string' ? error.code : 'PA_WEBHOOK_FAILED' }, 'PA webhook processing failed');
    return { statusCode: 500, body: { error: 'WEBHOOK_PROCESSING_FAILED' } };
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------ consultation et reprise

const INBOX_COLUMNS = `id,provider,event_id,pa_invoice_id,status,supplier_id,supplier_match_status,supplier_name,supplier_siren,supplier_siret,
  invoice_number,issue_date,due_date,currency,total_ht,total_tva,total_ttc,accounting_category,
  original_filename,mime_type,size_bytes,content_sha256,duplicate_of,received_at,reviewed_at`;

export async function listInbox(organizationId: string, filters: { status?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const status = filters.status && ['received', 'duplicate', 'reviewed', 'approved', 'rejected'].includes(filters.status) ? filters.status : null;
  const result = status
    ? await query(`${inboxSelect()} where organization_id=$1 and status=$2 order by received_at desc limit $3`, [organizationId, status, limit])
    : await query(`${inboxSelect()} where organization_id=$1 order by received_at desc limit $2`, [organizationId, limit]);
  const errors = (await query(
    `select id,event_id,event_type,error_code,error_message,received_at from pa_webhook_events
      where organization_id=$1 and status='error' order by received_at desc limit 50`,
    [organizationId],
  )).rows;
  return { invoices: result.rows, pendingErrors: errors };
}

function inboxSelect(): string {
  return `select ${INBOX_COLUMNS} from supplier_electronic_invoices`;
}

export async function getInboxItem(organizationId: string, id: string) {
  const row = (await query(
    `select id,provider,event_id,pa_invoice_id,status,original_storage_key,original_filename,mime_type,size_bytes,
            content_sha256,payload,supplier_id,supplier_match_status,supplier_name,supplier_siren,supplier_siret,
            invoice_number,issue_date,due_date,currency,total_ht,total_tva,total_ttc,accounting_category,
            reviewed_by,reviewed_at,duplicate_of,received_at,updated_at
       from supplier_electronic_invoices where organization_id=$1 and id=$2`,
    [organizationId, id],
  )).rows[0];
  if (!row) return null;
  const journalRows = (await query(
    `select kind,detail,created_at from supplier_electronic_invoice_events
      where organization_id=$1 and invoice_id=$2 order by created_at desc limit 100`,
    [organizationId, id],
  )).rows;
  return { invoice: { ...row, payload: row.payload ?? null }, journal: journalRows };
}

/** Téléchargement de l'original archivé ; la clé doit rester dans le stockage privé de l'organisation. */
export async function readOriginalFile(organizationId: string, id: string) {
  const row = (await query(
    `select original_storage_key,original_filename,mime_type from supplier_electronic_invoices
      where organization_id=$1 and id=$2 and original_storage_key is not null`,
    [organizationId, id],
  )).rows[0];
  if (!row) return null;
  const key: string = row.original_storage_key;
  if (!key.startsWith(`private/${organizationId}/`)) throw new Error('INVALID_STORAGE_KEY');
  const bytes = await readPrivateObject(key);
  return { filename: row.original_filename || 'facture', mimeType: row.mime_type || 'application/octet-stream', bytes };
}

const REVIEW_TARGET_STATUSES = new Set(['reviewed', 'approved', 'rejected']);

export type ReviewPatch = {
  accountingCategory?: string | null;
  supplierId?: string | null;
  status?: 'reviewed' | 'approved' | 'rejected';
};

/**
 * Correction/validation utilisateur : catégories comptables, rattachement fournisseur et statut
 * de revue — en une seule transaction tenant (RLS). Jamais d'écriture comptable automatique :
 * l'approbation matérialise la décision de l'utilisateur, horodatée et journalisée.
 */
export async function reviewInboxItem(organizationId: string, id: string, userId: string, patch: ReviewPatch) {
  if (patch.status !== undefined && !(patch.status && REVIEW_TARGET_STATUSES.has(patch.status))) {
    return { badStatus: true as const };
  }
  const client = await db.connect();
  try {
    // Webhook/services hors requête HTTP : pas de contexte ALS — le tenant est posé explicitement.
    await client.query('begin');
    await applyTenant(client, organizationId);
    const current = (await client.query(
      `select id,status,supplier_id,accounting_category from supplier_electronic_invoices where organization_id=$1 and id=$2`,
      [organizationId, id],
    )).rows[0];
    if (!current) {
      await client.query('commit');
      return { notFound: true as const };
    }
    if (current.status === 'duplicate') {
      await client.query('commit');
      return { conflict: 'DUPLICATE_ROW' as const, message: 'Une copie de doublon ne se modifie pas : agissez sur la facture originale.' };
    }

    let supplierId = current.supplier_id;
    if (patch.supplierId !== undefined) {
      if (patch.supplierId === null) supplierId = null;
      else {
        const ok = (await client.query('select id from suppliers where id=$1 and organization_id=$2', [patch.supplierId, organizationId])).rowCount;
        if (!ok) {
          await client.query('commit');
          return { badSupplier: true as const };
        }
        supplierId = patch.supplierId;
      }
    }
    let accountingCategory = current.accounting_category;
    if (patch.accountingCategory !== undefined) {
      if (patch.accountingCategory === null) accountingCategory = null;
      else {
        const value = String(patch.accountingCategory).trim().slice(0, 80);
        if (!value) {
          await client.query('commit');
          return { badCategory: true as const };
        }
        accountingCategory = value;
      }
    }

    const targetStatus = patch.status ?? null;
    const updated = (await client.query(
      `update supplier_electronic_invoices
          set supplier_id=$3, supplier_match_status=case when $3::uuid is null then 'unmatched' else 'matched' end,
              accounting_category=$4,
              status=coalesce($5,status),
              reviewed_by=case when $5::text is null then reviewed_by else $6 end,
              reviewed_at=case when $5::text is null then reviewed_at else now() end,
              updated_at=now()
        where organization_id=$1 and id=$2
        returning status,supplier_id,supplier_match_status,accounting_category,reviewed_at`,
      [organizationId, id, supplierId, accountingCategory, targetStatus, userId],
    )).rows[0];

    if (targetStatus) {
      const kind = targetStatus === 'approved' ? 'invoice.approved' : targetStatus === 'rejected' ? 'invoice.rejected' : 'invoice.reviewed';
      const detail: Record<string, unknown> = { from: current.status, to: targetStatus };
      if (targetStatus === 'approved') detail.notice = 'Approbation enregistrée ; aucune écriture comptable générée automatiquement.';
      await journal(client, organizationId, kind, { invoiceId: id, detail });
    } else {
      await journal(client, organizationId, 'invoice.corrected', {
        invoiceId: id, detail: { supplierId, accountingCategory },
      });
    }
    await client.query('commit');
    return { updated };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Reprise manuelle d'un événement en erreur : re-validé depuis la charge utile conservée. */
export async function reprocessEvent(organizationId: string, ledgerId: string, userId: string) {
  const ledger = (await query(
    `select id,provider,event_id,event_type,payload from pa_webhook_events
      where organization_id=$1 and id=$2 and status='error'`,
    [organizationId, ledgerId],
  )).rows[0];
  if (!ledger) return { notFound: true as const };
  const adapter = resolvePaAdapter(ledger.provider);
  if (!adapter) return { notConfigured: true as const };

  // La colonne payload est de type json : le pilote renvoie le TEXTE exact reçu (audit sans
  // altération). Selon l'environnement/dialecte, un objet est toléré (jsonb) : on normalise.
  const storedText = typeof ledger.payload === 'string' ? ledger.payload : JSON.stringify(ledger.payload);
  const rawBody = Buffer.from(storedText, 'utf8');
  const parsed = await adapter.parseEvent(rawBody, config.AURION_PA_MAX_FILE_BYTES);
  const payloadDigest = canonicalPayloadDigest(parsed.ok ? safeEventPayload(parsed.event) : safeRawPayload(rawBody));

  const client = await db.connect();
  try {
    // Webhook/services hors requête HTTP : pas de contexte ALS — le tenant est posé explicitement.
    await client.query('begin');
    await applyTenant(client, organizationId);
    try {
      const existing = (await client.query(
        `select payload_sha256 from pa_webhook_events where id=$1 and organization_id=$2`,
        [ledgerId, organizationId],
      )).rows[0];
      if (!existing) throw Object.assign(new Error('Événement introuvable dans le registre.'), { code: 'PA_EVENT_GONE' });
      if (existing.payload_sha256 !== payloadDigest) {
        throw Object.assign(new Error('Charge utile modifiée depuis la réception.'), { code: 'PA_EVENT_PAYLOAD_CHANGED' });
      }
      await journal(client, organizationId, 'invoice.reprocessed', {
        providerEventId: ledger.event_id, detail: { trigger: 'manual', userId },
      });

      if (!parsed.ok || !parsed.event.invoice) {
        const code = parsed.ok ? 'UNEXPECTED_EVENT_SHAPE' : parsed.code;
        const message = parsed.ok ? 'Événement sans facture.' : parsed.message;
        await markLedgerError(client, organizationId, ledgerId, code, message, ledger.event_id);
        await client.query('commit');
        return { stillError: true as const, code, message };
      }
      const result = await persistInvoice(client, organizationId, ledger.provider, parsed.event, ledgerId);
      await client.query('commit');
      return { processed: true as const, ...result };
    } catch (error: any) {
      await client.query('rollback').catch(() => {});
      if (error?.code === 'PA_EVENT_PAYLOAD_CHANGED' || error?.code === 'PA_EVENT_GONE') {
        return { conflict: error.code as string, message: error.message };
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------ points d'entrée webhook

export type PaEndpointInfo = { id: string; token: string; webhookUrl: string; provider: string; createdAt: string };

/**
 * Provisionne (ou fait tourner) le point d'entrée webhook de l'organisation pour le provider
 * configuré. L'URL renvoyée est la seule donnée à configurer dans la PA choisie.
 */
export async function ensureWebhookEndpoint(organizationId: string, rotate: boolean): Promise<PaEndpointInfo | { notConfigured: true }> {
  const provider = config.AURION_PA_PROVIDER;
  if (!paReceptionConfigured()) return { notConfigured: true };
  const existing = (await query(
    `select id, token, created_at from pa_webhook_endpoints where organization_id=$1 and provider=$2 and active=true`,
    [organizationId, provider],
  )).rows[0];
  if (existing && !rotate) {
    return { id: existing.id, token: existing.token, webhookUrl: buildWebhookUrl(existing.token), provider, createdAt: existing.created_at };
  }
  if (existing && rotate) {
    await query(`update pa_webhook_endpoints set active=false, updated_at=now() where id=$1`, [existing.id]);
  }
  const row = (await query(
    `insert into pa_webhook_endpoints(organization_id,provider) values($1,$2) returning id, token, created_at`,
    [organizationId, provider],
  )).rows[0];
  return { id: row.id, token: row.token, webhookUrl: buildWebhookUrl(row.token), provider, createdAt: row.created_at };
}

function buildWebhookUrl(token: string): string {
  const base = (config.APP_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/pa/webhook/${token}`;
}
