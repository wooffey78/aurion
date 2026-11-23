// Bloc 4 — cycle de vie d'ÉMISSION des factures électroniques (UBL 2.1 / CII D16B) via la
// plateforme agréée choisie par l'entrepreneur.
//
// Garanties implémentées :
//   - Les quatre mentions du 1er septembre 2026 sont exigées au bon endroit : catégorie de
//     l'opération (LB/PS/LBPS) et SIREN du client OBLIGATOIRES (refus explicite sinon, jamais
//     de valeur inventée) ; option TVA sur les débits et adresse de livraison conditionnelles.
//   - Le document structuré est généré de façon déterministe, validé (arithmétique EN 16931)
//     puis archivé dans le stockage privé (SHA-256 scellé) AVANT toute transmission.
//   - Idempotence : un identifiant de transmission STABLE est envoyé à la PA (en-tête
//     X-Aurion-PA-Transmission-Id). Une re-tentative après timeout re-transmet le MÊME
//     identifiant : la PA ré-acquitte le premier verdict, aucun doublon possible. L'index
//     unique partiel (une transmission ouverte par facture) ferme la porte côté schéma.
//   - Une facture n'est JAMAIS marquée transmise sans accusé signé de la PA : seul un accusé
//     authentifié (signature vérifiée) fait passer l'état à accepted/rejected ; tout autre
//     résultat (transport indisponible, délai dépassé, accusé douteux) => « timeout », état
//     « issue non confirmée », la facture réglementaire reste non transmise.
//   - Chaque étape est journalisée (outgoing_transmission_events) et les accusés sont archivés
//     sans altération dans le stockage privé (clé + SHA-256 scellés en base).
//
// État honnête (15.4.3) : AUCUNE PA contractuelle n'est connectée. Le contrat sortant
// « generic » est testé de bout en bout contre un serveur HTTP de recette réel (boucle locale) ;
// la transmission n'est pas déclarée opérationnelle en production tant qu'aucune PA n'a été
// validée en sandbox (cf. PLATEFORME-AGREEE.md § 9).

import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { query, db, applyTenant, withTenant } from '../db.js';
import { writePrivateObject, readPrivateObject, deletePrivateObject } from './storage.js';
import { decryptSecret, encryptSecret } from './secrets.js';
import { resolvePaOutgoingAdapter } from './pa/index.js';
import { generateUblInvoice, OPERATION_CATEGORIES, type EinvoiceDocument, type EinvoiceLine, type OperationCategory } from './electronic-invoice-ubl.js';
import { generateCiiInvoice } from './electronic-invoice-cii.js';
import { validateUbl, validateCii } from './electronic-invoice-validate.js';
import type { PaOutgoingResult } from './pa/outgoing/types.js';

const sha256Hex = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const CENT = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100);
const euros = (cents: number) => cents / 100;

export type ElectronicFormat = 'ubl' | 'cii';

export class ElectronicOutgoingError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode: number = 400, readonly detail?: unknown) {
    super(message);
  }
}

/** Nettoie un nom de fichier pour le stockage privé (basename, caractères sûrs, longueur bornée). */
function safeFilename(value: string): string {
  const base = String(value || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 120);
  return base || 'facture.xml';
}

async function journal(client: PoolClient, organizationId: string, kind: string, options: { transmissionId?: string | null; quoteId?: string | null; detail?: unknown } = {}) {
  await client.query(
    `insert into outgoing_transmission_events(organization_id,transmission_id,quote_id,kind,detail)
     values($1,$2,$3,$4,$5::jsonb)`,
    [organizationId, options.transmissionId ?? null, options.quoteId ?? null, kind, JSON.stringify(options.detail ?? null)],
  );
}

// ------------------------------------------------------------------ endpoint d'émission

export type PaOutgoingEndpointView = {
  configured: boolean;
  provider: string | null;
  baseUrl: string | null;
  identifier: string | null;
  createdAt: string | null;
  note?: string;
};

/** Enregistre (ou remplace) le point d'entrée d'émission de l'organisation. Secret chiffré au repos. */
export async function ensurePaOutgoingEndpoint(organizationId: string, input: {
  provider?: string; baseUrl: string; secret: string; identifier?: string | null;
}): Promise<{ ok: true; endpoint: PaOutgoingEndpointView } | { ok: false; code: string; message: string }> {
  const provider = String(input.provider || config.AURION_PA_PROVIDER || '').trim().toLowerCase();
  if (!provider) return { ok: false, code: 'PA_NOT_CONFIGURED', message: 'Aucun fournisseur de plateforme agréée configuré (AURION_PA_PROVIDER).' };
  if (!resolvePaOutgoingAdapter(provider)) return { ok: false, code: 'PA_PROVIDER_UNKNOWN', message: 'Fournisseur de plateforme agréée inconnu.' };
  const baseUrl = String(input.baseUrl || '').trim();
  const secret = String(input.secret || '');
  if (secret.length < 32) return { ok: false, code: 'SECRET_TOO_SHORT', message: 'Le secret de signature doit comporter au moins 32 caractères.' };
  let url: URL;
  try { url = new URL(baseUrl); }
  catch { return { ok: false, code: 'INVALID_BASE_URL', message: 'URL du point d’entrée d’émission invalide.' }; }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:';
  if (config.NODE_ENV === 'production' && (url.protocol !== 'https:' || isLoopback)) {
    return { ok: false, code: 'INVALID_BASE_URL', message: 'En production, le point d’entrée d’émission doit être une URL HTTPS publique.' };
  }
  if (url.protocol !== 'https:' && !isLoopback) {
    return { ok: false, code: 'INVALID_BASE_URL', message: 'Le point d’entrée d’émission doit être en HTTPS (HTTP réservé à la boucle locale hors production).' };
  }
  if (url.username || url.password) return { ok: false, code: 'INVALID_BASE_URL', message: 'L’URL ne doit pas contenir d’identifiants.' };
  const identifier = input.identifier == null ? null : String(input.identifier).trim().slice(0, 120) || null;
  const encrypted = encryptSecret(secret);
  const client = await db.connect();
  try {
    await client.query('begin');
    await applyTenant(client, organizationId);
    await client.query(`update pa_outgoing_endpoints set active=false, updated_at=now() where organization_id=$1 and provider=$2 and active=true`, [organizationId, provider]);
    await client.query(
      `insert into pa_outgoing_endpoints(organization_id,provider,base_url,secret_encrypted,identifier,active)
       values($1,$2,$3,$4,$5,true)`,
      [organizationId, provider, baseUrl, encrypted, identifier],
    );
    await journal(client, organizationId, 'outgoing.endpoint_configured', { detail: { provider, baseUrl, rotated: true } });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { ok: true, endpoint: await getPaOutgoingEndpoint(organizationId) };
}

/** État (non secret) du point d'entrée d'émission de l'organisation. */
export async function getPaOutgoingEndpoint(organizationId: string): Promise<PaOutgoingEndpointView> {
  const row = (await query(
    `select provider,base_url,identifier,created_at from pa_outgoing_endpoints
      where organization_id=$1 and active=true order by created_at desc limit 1`,
    [organizationId],
  )).rows[0];
  if (!row) return { configured: false, provider: null, baseUrl: null, identifier: null, createdAt: null, note: 'Configurez le point d’entrée d’émission fourni par votre plateforme agréée (POST /pa/outgoing-endpoints).' };
  return { configured: true, provider: row.provider, baseUrl: row.base_url, identifier: row.identifier, createdAt: row.created_at };
}

async function resolveEndpoint(organizationId: string): Promise<{ baseUrl: string; secret: string; identifier: string | null; provider: string }> {
  const row = (await query(
    `select provider,base_url,secret_encrypted,identifier from pa_outgoing_endpoints
      where organization_id=$1 and active=true order by created_at desc limit 1`,
    [organizationId],
  )).rows[0];
  if (!row) throw new ElectronicOutgoingError('PA_OUT_NOT_CONFIGURED', 'Point d’entrée d’émission de la plateforme agréée non configuré pour cette organisation.', 503);
  const adapter = resolvePaOutgoingAdapter(row.provider);
  if (!adapter) throw new ElectronicOutgoingError('PA_PROVIDER_UNKNOWN', 'Fournisseur de plateforme agréée inconnu.', 503);
  let secret: string;
  try { secret = decryptSecret(row.secret_encrypted); }
  catch { throw new ElectronicOutgoingError('PA_ENDPOINT_SECRET_ERROR', 'Secret du point d’entrée d’émission illisible (rotation des clés de chiffrement ?).', 500); }
  return { baseUrl: row.base_url, secret, identifier: row.identifier, provider: row.provider };
}

// ------------------------------------------------------------------ préparation du document

/** Lignes de facture électroniques : composition facturée réelle (pièces, livraison, kilométrage,
 * main-d'œuvre). La main-d'œuvre est le solde qui garantit Σ lignes = total HT (BR-CO-10),
 * reproduisant exactement ce que la facture PDF présente au client. */
function buildElectronicLines(row: any): EinvoiceLine[] {
  const cents = (v: unknown) => Math.max(0, CENT(Number(v ?? 0)));
  const parts = cents(row.part_cost);
  const shipping = cents(row.shipping_cost);
  const mileageMode = String(row.mileage_mode || 'margin');
  const mileage = mileageMode === 'client_price' ? cents(row.mileage_total) : 0;
  const total = Math.max(0, CENT(Number(row.total_ht ?? 0)));
  let labor = total - parts - shipping - mileage;
  if (labor < 0) {
    throw new ElectronicOutgoingError(
      'EINVOICE_TOTALS_INCONSISTENT',
      'Composition de la facture incohérente : pièces + livraison + kilométrage facturé dépassent le total HT. Corrigez la facture avant l’émission électronique.',
      422,
      { parts: euros(parts), shipping: euros(shipping), mileage: euros(mileage), totalHt: euros(total) },
    );
  }
  const lines: EinvoiceLine[] = [];
  if (parts > 0) lines.push({ label: 'Pièces et fournitures', quantity: 1, unitPrice: euros(parts), net: euros(parts) });
  if (shipping > 0) lines.push({ label: 'Frais de livraison', quantity: 1, unitPrice: euros(shipping), net: euros(shipping) });
  if (mileage > 0) lines.push({ label: 'Frais kilométriques', quantity: 1, unitPrice: euros(mileage), net: euros(mileage) });
  if (labor > 0) lines.push({ label: 'Main-d’œuvre', quantity: 1, unitPrice: euros(labor), net: euros(labor) });
  if (!lines.length) {
    throw new ElectronicOutgoingError('EINVOICE_EMPTY_TOTALS', 'La facture est vide (total HT nul) : émission électronique refusée.', 422);
  }
  return lines;
}

function formatExtension(format: ElectronicFormat): string {
  return format === 'ubl' ? 'ubl.xml' : 'cii.xml';
}

export type PrepareInput = {
  format: ElectronicFormat;
  operationCategory: OperationCategory;
  buyerSiren: string;
  vatOnPayment: boolean;
  deliveryAddress: string | null;
};

/** Prépare le document structuré d'une facture : génération, validation, archivage, journal. */
export async function prepareElectronicInvoice(
  organizationId: string,
  userId: string,
  invoiceId: string,
  input: PrepareInput,
): Promise<{ id: string; status: string; format: string; payloadSha256: string; created: boolean; regenerated: boolean }> {
  if (!OPERATION_CATEGORIES.includes(input.operationCategory)) {
    throw new ElectronicOutgoingError('EINVOICE_MENTION_MISSING', 'La catégorie de l’opération est obligatoire (LB : livraison de biens, PS : prestation de services, LBPS : mixte).', 422);
  }
  const buyerSiren = String(input.buyerSiren || '').replace(/[\s.]/g, '');
  if (!/^\d{9}$/.test(buyerSiren)) {
    throw new ElectronicOutgoingError('EINVOICE_MENTION_MISSING', 'Le SIREN du client est obligatoire (9 chiffres) : mention obligatoire du 1er septembre 2026.', 422);
  }
  const format: ElectronicFormat = input.format === 'cii' ? 'cii' : 'ubl';
  const deliveryAddress = input.deliveryAddress == null ? null : String(input.deliveryAddress).trim().slice(0, 500) || null;

  const row = (await query(
    `select q.*,c.name client_name,c.email client_email,c.address client_address,o.name company_name,
            o.siren,o.siret,o.address,o.postal_code,o.city
       from quotes q
       left join clients c on c.id=q.client_id
       join organizations o on o.id=q.organization_id
      where q.id=$1 and q.organization_id=$2 and q.document_type='invoice'`,
    [invoiceId, organizationId],
  )).rows[0];
  if (!row) throw new ElectronicOutgoingError('NOT_FOUND', 'Facture introuvable.', 404);
  if (row.status !== 'issued') throw new ElectronicOutgoingError('EINVOICE_NOT_ISSUED', 'Seule une facture émise peut être préparée pour l’émission électronique.', 409);

  const lines = buildElectronicLines(row);
  const issueDate = row.created_at;
  const doc: EinvoiceDocument = {
    number: String(row.number),
    issueDate,
    dueDate: row.due_at ?? null,
    currency: 'EUR',
    operationCategory: input.operationCategory,
    vatOnPayment: Boolean(input.vatOnPayment),
    deliveryAddress,
    seller: {
      name: String(row.company_name || ''),
      siren: row.siren ? String(row.siren) : null,
      siret: row.siret ? String(row.siret) : null,
      address: [row.address, row.postal_code, row.city].filter(Boolean).map(v => String(v)).join('\n') || null,
      email: null,
    },
    buyer: {
      name: String(row.client_name || row.billing_address_snapshot || 'Client'),
      siren: buyerSiren,
      address: row.billing_address_snapshot || row.client_address || null,
      email: row.client_email ? String(row.client_email) : null,
    },
    lines,
    vatRate: Number(row.vat_rate || 0),
    vatAmount: Number(row.total_tva || 0),
    netTotal: Number(row.total_ht || 0),
    grossTotal: Number(row.total_ttc || 0),
  };
  if (!doc.seller.siren) {
    throw new ElectronicOutgoingError('EINVOICE_SELLER_SIREN_MISSING', 'Le SIREN de votre entreprise est absent du profil : complétez-le avant l’émission électronique.', 422);
  }

  const xml = format === 'ubl' ? generateUblInvoice(doc) : generateCiiInvoice(doc);
  const expected = {
    operationCategory: doc.operationCategory, buyerSiren: doc.buyer.siren,
    vatOnPayment: doc.vatOnPayment, deliveryAddress: doc.deliveryAddress,
    netTotal: doc.netTotal, vatAmount: doc.vatAmount, grossTotal: doc.grossTotal,
    vatRate: doc.vatRate, lineCount: lines.length,
  };
  const validation = format === 'ubl' ? validateUbl(xml, expected) : validateCii(xml, expected);
  if (!validation.ok) {
    throw new ElectronicOutgoingError('EINVOICE_VALIDATION_FAILED', 'Le document électronique généré est invalide : transmission refusée.', 500, validation.issues);
  }

  const bytes = Buffer.from(xml, 'utf8');
  const digest = sha256Hex(bytes);
  const year = new Date().toISOString().slice(0, 4);
  const filename = safeFilename(`${doc.number}-${formatExtension(format)}`);

  const client = await db.connect();
  try {
    await client.query('begin');
    await applyTenant(client, organizationId);
    const existing = (await client.query(
      `select id,status,pa_transmission_id,payload_sha256 from outgoing_electronic_invoices
        where organization_id=$1 and quote_id=$2 and status in ('prepared','submitted')
        order by created_at limit 1 for update`,
      [organizationId, invoiceId],
    )).rows[0];
    if (existing && existing.status === 'submitted') {
      throw new ElectronicOutgoingError('EINVOICE_IN_FLIGHT', 'Une transmission est en cours pour cette facture ; attendez son accusé.', 409);
    }
    let transmissionId: string;
    let regenerated = false;
    if (existing && existing.payload_sha256 === digest) {
      // Document identique : préparation idempotente (aucune ligne ni archive supplémentaire).
      await client.query('commit');
      return { id: existing.id, status: 'prepared', format, payloadSha256: digest, created: false, regenerated: false };
    }
    if (existing) {
      // Document différent : régénération (l'ancienne archive reste dans le stockage privé pour audit).
      transmissionId = existing.pa_transmission_id;
      regenerated = true;
      const storageKey = `private/${organizationId}/pa-out/${year}/${invoiceId}/${transmissionId}-${digest.slice(0, 10)}-${filename}`;
      await writePrivateObject(storageKey, bytes, 'application/xml');
      await client.query(
        `update outgoing_electronic_invoices
            set format=$3,payload_storage_key=$4,payload_filename=$5,payload_sha256=$6,
                error_code=null,error_message=null,rejection_code=null,rejection_message=null,
                updated_at=now()
          where id=$2 and organization_id=$1`,
        [organizationId, existing.id, format, storageKey, filename, digest],
      );
      await journal(client, organizationId, 'outgoing.regenerated', {
        transmissionId: existing.id, quoteId: invoiceId,
        detail: { format, payloadSha256: digest, previousSha256: existing.payload_sha256 },
      });
      await client.query('commit');
      return { id: existing.id, status: 'prepared', format, payloadSha256: digest, created: false, regenerated: true };
    }
    // Première préparation : identifiant d'idempotence stable (les re-tentatives réutilisent le même).
    transmissionId = randomUUID();
    const storageKey = `private/${organizationId}/pa-out/${year}/${invoiceId}/${transmissionId}-${filename}`;
    await writePrivateObject(storageKey, bytes, 'application/xml');
    const inserted = (await client.query(
      `insert into outgoing_electronic_invoices(
         organization_id,quote_id,format,pa_transmission_id,status,payload_storage_key,payload_filename,
         payload_mime,payload_sha256,created_by)
       values($1,$2,$3,$4,'prepared',$5,$6,'application/xml',$7,$8)
       returning id`,
      [organizationId, invoiceId, format, transmissionId, storageKey, filename, digest, userId],
    )).rows[0];
    await journal(client, organizationId, 'outgoing.prepared', {
      transmissionId: inserted.id, quoteId: invoiceId,
      detail: { format, payloadSha256: digest, mentions: { operationCategory: input.operationCategory, buyerSiren, vatOnPayment: Boolean(input.vatOnPayment), deliveryAddress } },
    });
    await client.query(`update quotes set electronic_status='ready',updated_at=now() where id=$1 and organization_id=$2`, [invoiceId, organizationId]);
    await client.query('commit');
    return { id: inserted.id, status: 'prepared', format, payloadSha256: digest, created: true, regenerated: false };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------ transmission + accusés

export type TransmitOutcome =
  | { kind: 'accepted'; id: string; paReference: string | null; attempts: number }
  | { kind: 'rejected'; id: string; code: string; message: string | null; attempts: number }
  | { kind: 'unconfirmed'; id: string; errorCode: string; message: string; attempts: number };

/** Transmet (ou re-transmet) la facture préparée ; seul un accusé signé règle l'état. */
export async function transmitElectronicInvoice(
  organizationId: string,
  userId: string,
  transmissionId: string,
): Promise<TransmitOutcome> {
  const endpoint = await resolveEndpoint(organizationId);
  const adapter = resolvePaOutgoingAdapter(endpoint.provider);
  if (!adapter) throw new ElectronicOutgoingError('PA_PROVIDER_UNKNOWN', 'Fournisseur de plateforme agréée inconnu.', 503);

  // 1) Réservation : une seule transmission en vol par facture (index unique partiel + verrou ligne).
  const client = await db.connect();
  let claimed: any;
  try {
    await client.query('begin');
    await applyTenant(client, organizationId);
    claimed = (await client.query(
      `select id,quote_id,format,pa_transmission_id,status,attempts,payload_storage_key,payload_filename,
              payload_mime,payload_sha256,pa_reference
         from outgoing_electronic_invoices
        where organization_id=$1 and id=$2 and status in ('prepared','timeout','rejected')
        order by created_at limit 1 for update`,
      [organizationId, transmissionId],
    )).rows[0];
    if (!claimed) {
      const open = (await client.query(
        `select status from outgoing_electronic_invoices where organization_id=$1 and id=$2 order by created_at desc limit 1`,
        [organizationId, transmissionId],
      )).rows[0];
      await client.query('commit');
      if (!open) throw new ElectronicOutgoingError('EINVOICE_NOT_PREPARED', 'Préparez le document électronique avant la transmission (POST /pa/outgoing/prepare/:invoiceId).', 409);
      if (open.status === 'accepted') throw new ElectronicOutgoingError('EINVOICE_ALREADY_ACCEPTED', 'Cette facture est déjà transmise et acceptée par la plateforme agréée.', 409);
      if (open.status === 'submitted') throw new ElectronicOutgoingError('EINVOICE_IN_FLIGHT', 'Une transmission est déjà en cours pour cette facture.', 409);
      throw new ElectronicOutgoingError('EINVOICE_STATE_INVALID', 'État de transmission inattendu.', 409);
    }
    const invoiceId: string = claimed.quote_id;
    await client.query(
      `update outgoing_electronic_invoices
          set status='submitted',attempts=attempts+1,last_attempt_at=now(),submitted_at=now(),
              error_code=null,error_message=null,updated_at=now()
        where id=$1 and organization_id=$2`,
      [claimed.id, organizationId],
    );
    await journal(client, organizationId, 'outgoing.transmission_started', {
      transmissionId: claimed.id, quoteId: invoiceId,
      detail: { attempt: Number(claimed.attempts) + 1, transmissionIdStable: claimed.pa_transmission_id, format: claimed.format },
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // 2) Transport (hors transaction : lecture du document archivé, appel HTTP signé).
  let bytes: Buffer;
  try { bytes = await readPrivateObject(claimed.payload_storage_key); }
  catch {
    await withTenant(organizationId, () => query(
      `update outgoing_electronic_invoices set status='timeout',error_code='EINVOICE_PAYLOAD_MISSING',updated_at=now() where id=$1`,
      [claimed.id],
    ));
    await withTenant(organizationId, () => query(
      `insert into outgoing_transmission_events(organization_id,transmission_id,quote_id,kind,detail)
       values($1,$2,$3,'outgoing.transport_error',$4::jsonb)`,
      [organizationId, claimed.id, claimed.quote_id, JSON.stringify({ code: 'EINVOICE_PAYLOAD_MISSING' })],
    ));
    return { kind: 'unconfirmed', id: claimed.id, errorCode: 'EINVOICE_PAYLOAD_MISSING', message: 'Document archivé illisible ; transmission non confirmée.', attempts: Number(claimed.attempts) + 1 };
  }
  // Intégrité : le document transmis est exactement celui scellé à la préparation.
  if (sha256Hex(bytes) !== claimed.payload_sha256) {
    await withTenant(organizationId, () => query(
      `update outgoing_electronic_invoices set status='timeout',error_code='EINVOICE_PAYLOAD_TAMPERED',updated_at=now() where id=$1`,
      [claimed.id],
    ));
    await withTenant(organizationId, () => query(
      `insert into outgoing_transmission_events(organization_id,transmission_id,quote_id,kind,detail)
       values($1,$2,$3,'outgoing.transport_error',$4::jsonb)`,
      [organizationId, claimed.id, claimed.quote_id, JSON.stringify({ code: 'EINVOICE_PAYLOAD_TAMPERED' })],
    ));
    return { kind: 'unconfirmed', id: claimed.id, errorCode: 'EINVOICE_PAYLOAD_TAMPERED', message: 'Empreinte du document archivé différente du sceau : transmission refusée.', attempts: Number(claimed.attempts) + 1 };
  }

  const result: PaOutgoingResult = await adapter.transmit(
    { baseUrl: endpoint.baseUrl, secret: endpoint.secret, identifier: endpoint.identifier },
    { transmissionId: claimed.pa_transmission_id, format: claimed.format === 'cii' ? 'cii' : 'ubl', filename: claimed.payload_filename, bytes },
    config.AURION_PA_OUT_TIMEOUT_MS,
  );

  // 3) Règlement : seul un accusé authentifié change l'état réglementaire.
  const client2 = await db.connect();
  try {
    await client2.query('begin');
    await applyTenant(client2, organizationId);
    const current = (await client2.query(
      `select id,status,attempts,pa_transmission_id from outgoing_electronic_invoices
        where id=$1 and organization_id=$2 for update`,
      [claimed.id, organizationId],
    )).rows[0];
    if (!current || current.status !== 'submitted') {
      // État modifié entre-temps : aucune écriture d'accusé, le journal conserve l'anomalie.
      await journal(client2, organizationId, 'outgoing.settle_skipped', {
        transmissionId: claimed.id, quoteId: claimed.quote_id,
        detail: { currentStatus: current?.status ?? null, resultKind: result.kind },
      });
      await client2.query('commit');
      return { kind: 'unconfirmed', id: claimed.id, errorCode: 'EINVOICE_SETTLE_SKIPPED', message: 'État de transmission modifié pendant l’appel ; vérifiez le journal.', attempts: Number(current?.attempts ?? claimed.attempts) };
    }

    const year = new Date().toISOString().slice(0, 4);
    if (result.kind === 'accepted' || result.kind === 'rejected') {
      // Accusé archivé sans altération, SHA-256 scellé en base.
      const ackBytes = result.raw;
      const ackSha = sha256Hex(ackBytes);
      const ackKey = `private/${organizationId}/pa-out/${year}/${claimed.quote_id}/${claimed.pa_transmission_id}-ack-${ackSha.slice(0, 10)}.json`;
      await writePrivateObject(ackKey, ackBytes, result.rawContentType || 'application/json');
      if (result.kind === 'accepted') {
        await client2.query(
          `update outgoing_electronic_invoices
              set status='accepted',pa_reference=$3,ack_storage_key=$4,ack_filename=$5,ack_mime=$6,ack_sha256=$7,
                  settled_at=now(),error_code=null,error_message=null,updated_at=now()
            where id=$2 and organization_id=$1`,
          [organizationId, claimed.id, result.paReference, ackKey, `${claimed.pa_transmission_id}-accuse.json`, result.rawContentType || 'application/json', ackSha],
        );
        await client2.query(`update quotes set electronic_status='accepted',updated_at=now() where id=$1 and organization_id=$2`, [claimed.quote_id, organizationId]);
        await journal(client2, organizationId, 'outgoing.ack_accepted', {
          transmissionId: claimed.id, quoteId: claimed.quote_id,
          detail: { paReference: result.paReference, ackSha256: ackSha, transmissionIdStable: claimed.pa_transmission_id, attempt: Number(claimed.attempts) + 1 },
        });
        await client2.query('commit');
        return { kind: 'accepted', id: claimed.id, paReference: result.paReference, attempts: Number(claimed.attempts) + 1 };
      }
      await client2.query(
        `update outgoing_electronic_invoices
            set status='rejected',rejection_code=$3,rejection_message=$4,ack_storage_key=$5,ack_filename=$6,
                ack_mime=$7,ack_sha256=$8,settled_at=now(),updated_at=now()
          where id=$2 and organization_id=$1`,
        [organizationId, claimed.id, result.code, result.message, ackKey, `${claimed.pa_transmission_id}-accuse.json`, result.rawContentType || 'application/json', ackSha],
      );
      await client2.query(`update quotes set electronic_status='rejected',updated_at=now() where id=$1 and organization_id=$2`, [claimed.quote_id, organizationId]);
      await journal(client2, organizationId, 'outgoing.ack_rejected', {
        transmissionId: claimed.id, quoteId: claimed.quote_id,
        detail: { code: result.code, message: result.message, ackSha256: ackSha, transmissionIdStable: claimed.pa_transmission_id, attempt: Number(claimed.attempts) + 1 },
      });
      await client2.query('commit');
      return { kind: 'rejected', id: claimed.id, code: result.code, message: result.message, attempts: Number(claimed.attempts) + 1 };
    }

    // Transport indisponible / accusé douteux : « issue non confirmée » (timeout). La facture
    // réglementaire reste NON transmise ; la re-tentative réutilise le MÊME identifiant PA.
    const errorCode = result.kind === 'transport_error'
      ? (result.timedOut ? 'PA_OUT_TIMEOUT' : 'PA_OUT_TRANSPORT_ERROR')
      : 'PA_OUT_INVALID_ACK';
    await client2.query(
      `update outgoing_electronic_invoices
          set status='timeout',error_code=$3,error_message=$4,updated_at=now()
        where id=$2 and organization_id=$1`,
      [organizationId, claimed.id, errorCode, result.message],
    );
    await journal(client2, organizationId, 'outgoing.issue_unconfirmed', {
      transmissionId: claimed.id, quoteId: claimed.quote_id,
      detail: { code: errorCode, message: result.message, transmissionIdStable: claimed.pa_transmission_id, attempt: Number(claimed.attempts) + 1 },
    });
    await client2.query('commit');
    return { kind: 'unconfirmed', id: claimed.id, errorCode, message: result.message, attempts: Number(claimed.attempts) + 1 };
  } catch (error) {
    await client2.query('rollback').catch(() => {});
    throw error;
  } finally {
    client2.release();
  }
}

// ------------------------------------------------------------------ consultation

export async function listElectronicOutgoing(organizationId: string, options: { invoiceId?: string | null; status?: string | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
  const clauses = ['organization_id=$1'];
  const values: unknown[] = [organizationId];
  if (options.invoiceId) { clauses.push(`quote_id=$${values.length + 1}`); values.push(options.invoiceId); }
  if (options.status) { clauses.push(`status=$${values.length + 1}`); values.push(options.status); }
  return (await query(
    `select id,quote_id,format,pa_transmission_id,status,pa_reference,payload_filename,payload_sha256,
            ack_filename,ack_sha256,rejection_code,error_code,error_message,attempts,submitted_at,settled_at,created_at,updated_at
       from outgoing_electronic_invoices where ${clauses.join(' and ')} order by created_at desc limit ${limit}`,
    values,
  )).rows;
}

export async function getElectronicOutgoing(organizationId: string, id: string) {
  const row = (await query(
    `select o.*,q.number invoice_number from outgoing_electronic_invoices o
       left join quotes q on q.id=o.quote_id
      where o.id=$1 and o.organization_id=$2`,
    [id, organizationId],
  )).rows[0];
  if (!row) return null;
  const events = (await query(
    `select id,kind,detail,created_at from outgoing_transmission_events
      where transmission_id=$1 and organization_id=$2 order by created_at,id`,
    [id, organizationId],
  )).rows;
  return { transmission: row, events };
}

export async function readOutgoingPayload(organizationId: string, id: string) {
  const row = (await query(
    `select payload_storage_key,payload_filename,payload_mime from outgoing_electronic_invoices
      where id=$1 and organization_id=$2`,
    [id, organizationId],
  )).rows[0];
  if (!row) return null;
  const bytes = await readPrivateObject(row.payload_storage_key);
  return { filename: row.payload_filename, mimeType: row.payload_mime, bytes };
}

export async function readOutgoingAck(organizationId: string, id: string) {
  const row = (await query(
    `select ack_storage_key,ack_filename,ack_mime from outgoing_electronic_invoices
      where id=$1 and organization_id=$2 and ack_storage_key is not null`,
    [id, organizationId],
  )).rows[0];
  if (!row) return null;
  const bytes = await readPrivateObject(row.ack_storage_key);
  return { filename: row.ack_filename, mimeType: row.ack_mime, bytes };
}
