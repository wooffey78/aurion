// Bloc 5 — cycle de vie des DÉCLARATIONS e-reporting (données de transaction et de paiement)
// via la plateforme agréée choisie par l'entrepreneur. Miroir exact des garanties du bloc 4 :
//
//   - Aucune donnée inventée : la classification s'appuie exclusivement sur des DÉCLARATIONS
//     utilisateur (catégorie d'acheteur du client, exonération et motif sur la facture,
//     catégorie d'opération). Toute donnée manquante => rapport d'écarts et REFUS de
//     préparation (422) — jamais d'omission silencieuse ni de valeur par défaut réglementaire.
//   - Le flux est généré de façon déterministe, validé (structure, arithmétique, période) puis
//     archivé dans le stockage privé (SHA-256 scellé) AVANT toute transmission.
//   - Idempotence : identifiant de transmission STABLE entre re-tentatives (même contrat
//     sortant generic que le bloc 4, X-Aurion-PA-Format « ereporting ») — une reprise après
//     timeout ne peut jamais créer de doublon côté PA.
//   - Une déclaration n'est JAMAIS marquée transmise sans accusé signé de la PA : seul un
//     accusé authentifié fait passer l'état à accepted/rejected ; tout autre résultat =>
//     « timeout » (« issue non confirmée »), la déclaration reste réglementairement non
//     transmise.
//   - Corrections : une déclaration de CORRECTION référence la déclaration corrigée, fige ses
//     propres lignes recalculées à partir des données corrigées ; l'originale reste archivée
//     sans altération (aucune réécriture de l'historique).
//   - Chaque étape est journalisée (ereporting_events).
//
// État honnête (15.4.4) : AUCUNE PA contractuelle n'est connectée. Le contrat sortant
// « generic » est testé de bout en bout contre un serveur HTTP de recette réel ; la
// transmission e-reporting n'est pas déclarée opérationnelle en production tant qu'aucune PA
// n'a été validée en sandbox (cf. PLATEFORME-AGREEE.md § 10).

import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { query, db, applyTenant, withTenant } from '../db.js';
import { writePrivateObject, readPrivateObject } from './storage.js';
import { decryptSecret } from './secrets.js';
import { resolvePaOutgoingAdapter } from './pa/index.js';
import {
  buildEreportingPayload, buildPaymentLine, buildTransactionLine, classifyInvoice,
  validateEreportingPayload,
  type EreportingGap, type EreportingPayload, type MatrixInvoice, type MatrixPayment,
  type MatrixTransactionLine, type MatrixPaymentLine, type Periodicity,
} from './electronic-ereporting-matrix.js';
import type { PaOutgoingResult } from './pa/outgoing/types.js';
import { ElectronicOutgoingError } from './electronic-outgoing.js';

const sha256Hex = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const euros = (cents: number) => cents / 100;
const CENT = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100);

export class EreportingError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode: number = 400, readonly detail?: unknown) {
    super(message);
  }
}

function journal(client: PoolClient, organizationId: string, kind: string, options: { declarationId?: string | null; detail?: unknown } = {}) {
  return client.query(
    `insert into ereporting_events(organization_id,declaration_id,kind,detail)
     values($1,$2,$3,$4::jsonb)`,
    [organizationId, options.declarationId ?? null, kind, JSON.stringify(options.detail ?? null)],
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Valide la période selon la périodicité déclarée : mois civil ou trimestre civil. */
function validatePeriod(periodStart: string, periodEnd: string, periodicity: Periodicity): { start: string; end: string } {
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
    throw new EreportingError('INVALID_PERIOD', 'La période doit être exprimée en dates ISO (YYYY-MM-DD).', 400);
  }
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new EreportingError('INVALID_PERIOD', 'Période invalide.', 400);
  }
  if (periodEnd < periodStart) {
    throw new EreportingError('INVALID_PERIOD', 'La fin de période précède le début.', 400);
  }
  if (periodicity === 'monthly') {
    const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    if (start.getUTCDate() !== 1 || periodEnd !== monthEnd.toISOString().slice(0, 10)) {
      throw new EreportingError('INVALID_PERIOD', 'Une déclaration mensuelle couvre un mois civil exact (du premier au dernier jour).', 400);
    }
  } else {
    const quarter = Math.floor(start.getUTCMonth() / 3);
    const quarterStart = new Date(Date.UTC(start.getUTCFullYear(), quarter * 3, 1));
    const quarterEnd = new Date(Date.UTC(start.getUTCFullYear(), quarter * 3 + 3, 0));
    if (periodStart !== quarterStart.toISOString().slice(0, 10) || periodEnd !== quarterEnd.toISOString().slice(0, 10)) {
      throw new EreportingError('INVALID_PERIOD', 'Une déclaration trimestrielle couvre un trimestre civil exact.', 400);
    }
  }
  return { start: periodStart, end: periodEnd };
}

// ------------------------------------------------------------------ collecte et classification

type CollectedInvoice = MatrixInvoice & {
  vatOnPayment: boolean;
};

const INVOICE_PROJECTION = `
  q.id, q.number, q.created_at, q.einvoice_operation_category, q.vat_rate, q.total_ht, q.total_tva,
  q.total_ttc, q.einvoice_vat_on_payment, q.ereporting_exempt, q.ereporting_exempt_reason,
  c.name client_name, c.buyer_category client_buyer_category, c.country_code client_country_code,
  c.vat_number client_vat_number`;

function toMatrixInvoice(row: any): CollectedInvoice {
  return {
    id: String(row.id),
    number: row.number == null ? null : String(row.number),
    transactionDate: row.created_at,
    operationCategory: row.einvoice_operation_category == null ? null : String(row.einvoice_operation_category),
    vatRate: Number(row.vat_rate ?? 0),
    totalHt: Number(row.total_ht ?? 0),
    totalVat: Number(row.total_tva ?? 0),
    totalTtc: Number(row.total_ttc ?? 0),
    exemptDeclared: Boolean(row.ereporting_exempt),
    exemptReason: row.ereporting_exempt_reason == null ? null : String(row.ereporting_exempt_reason),
    clientName: row.client_name == null ? null : String(row.client_name),
    clientBuyerCategory: row.client_buyer_category == null ? null : String(row.client_buyer_category),
    clientCountryCode: row.client_country_code == null ? null : String(row.client_country_code),
    clientVatNumber: row.client_vat_number == null ? null : String(row.client_vat_number),
    vatOnPayment: Boolean(row.einvoice_vat_on_payment),
  };
}

export type EreportingPreview = {
  period: { start: string; end: string };
  periodicity: Periodicity;
  transactionLines: MatrixTransactionLine[];
  paymentLines: MatrixPaymentLine[];
  gaps: EreportingGap[];
  excluded: Array<{ quoteId: string; invoiceNumber: string | null; reason: string }>;
  totals: { ht: number; vat: number; ttc: number; payments: number };
  transactionCount: number;
  paymentCount: number;
};

/**
 * Collecte et classe les données de la période. Facturation : transactions = factures émises
 * dont la date d'émission (created_at) tombe dans la période ; données de paiement = paiements
 * encaissés dans la période sur toute facture émise du périmètre e-reporting (services TVA
 * exigible à l'encaissement, option « TVA sur les débits » non exercée).
 */
async function collectPeriod(
  organizationId: string,
  period: { start: string; end: string },
  periodicity: Periodicity,
): Promise<EreportingPreview> {
  const invoiceRows = (await query(
    `select ${INVOICE_PROJECTION}
       from quotes q
       left join clients c on c.id = q.client_id
      where q.organization_id = $1
        and q.document_type = 'invoice'
        and q.status = 'issued'`,
    [organizationId],
  )).rows.map(toMatrixInvoice);

  const paymentRows = ((await query(
    `select p.quote_id, p.amount, p.paid_at, p.payment_method
       from invoice_payments p
      where p.organization_id = $1
        and p.paid_at::date >= $2::date and p.paid_at::date <= $3::date`,
    [organizationId, period.start, period.end],
  )).rows).map(row => ({
    quoteId: String(row.quote_id),
    amount: Number(row.amount),
    paidAt: row.paid_at,
    method: row.payment_method == null ? null : String(row.payment_method),
  }));

  const invoicesById = new Map(invoiceRows.map(invoice => [invoice.id, invoice]));
  const transactionLines: MatrixTransactionLine[] = [];
  const paymentLines: MatrixPaymentLine[] = [];
  const gaps: EreportingGap[] = [];
  const excluded: EreportingPreview['excluded'] = [];

  // Émetteur : identification obligatoire (SIREN), comme à l'émission électronique.
  const emitterSirenGuard = (await query(`select siren from organizations where id=$1 and siren is not null`, [organizationId])).rows[0];
  if (!emitterSirenGuard) {
    gaps.push({ quoteId: '', invoiceNumber: null, code: 'BUYER_CATEGORY_MISSING', message: 'Le SIREN de votre entreprise est absent du profil : complétez-le avant toute déclaration e-reporting.' });
  }

  // 1) Transactions : factures émises dans la période.
  for (const invoice of invoiceRows) {
    const issuedDate = invoice.transactionDate instanceof Date
      ? invoice.transactionDate.toISOString().slice(0, 10)
      : String(invoice.transactionDate ?? '').slice(0, 10);
    const inPeriod = issuedDate >= period.start && issuedDate <= period.end;
    if (!inPeriod) continue;

    if (!invoice.operationCategory) {
      gaps.push({ quoteId: invoice.id, invoiceNumber: invoice.number, code: 'OPERATION_CATEGORY_MISSING', message: `Facture ${invoice.number || invoice.id.slice(0, 8)} : la catégorie de l'opération (LB, PS ou LBPS) est requise pour les données de transaction — saisissable dans l'éditeur de facture (« Facturation électronique »).` });
    }
    const classification = classifyInvoice(invoice);
    gaps.push(...classification.gaps);
    if (classification.kind === 'excluded') {
      excluded.push({ quoteId: invoice.id, invoiceNumber: invoice.number, reason: classification.reason });
      continue;
    }
    if (!invoice.operationCategory) continue; // ligne impossible sans catégorie : écart déjà signalé
    transactionLines.push(buildTransactionLine(invoice, classification.reason));
  }

  // 2) Paiements encaissés dans la période sur les factures du périmètre e-reporting :
  //    TVA exigible à l'encaissement (services/mixte) et option « TVA sur les débits » non exercée.
  for (const payment of paymentRows) {
    const invoice = invoicesById.get(payment.quoteId);
    if (!invoice) continue;
    const classification = classifyInvoice(invoice);
    if (classification.kind !== 'in_scope') continue;
    const category = invoice.operationCategory;
    if (category === 'LB' || invoice.vatOnPayment) continue; // TVA exigible à la livraison/facturation : données de paiement non dues
    if (!category) continue; // écart déjà signalé à la facture concernée
    paymentLines.push(buildPaymentLine(invoice, payment, classification.reason));
  }

  paymentLines.sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : a.paymentDate > b.paymentDate ? 1 : a.invoiceNumber.localeCompare(b.invoiceNumber)));
  transactionLines.sort((a, b) => (a.transactionDate < b.transactionDate ? -1 : a.transactionDate > b.transactionDate ? 1 : a.invoiceNumber.localeCompare(b.invoiceNumber)));

  const totals = {
    ht: round2(transactionLines.reduce((sum, line) => sum + line.amountHt, 0)),
    vat: round2(transactionLines.reduce((sum, line) => sum + line.amountVat, 0)),
    ttc: round2(transactionLines.reduce((sum, line) => sum + line.amountTtc, 0)),
    payments: round2(paymentLines.reduce((sum, line) => sum + line.paymentAmount, 0)),
  };
  return {
    period, periodicity, transactionLines, paymentLines, gaps, excluded, totals,
    transactionCount: transactionLines.length, paymentCount: paymentLines.length,
  };
}

/** Aperçu (dry-run) d'une déclaration : aucune écriture, mêmes calculs que la préparation. */
export async function previewEreportingDeclaration(
  organizationId: string,
  input: { periodStart: string; periodEnd: string; periodicity: string },
): Promise<EreportingPreview & { emitter: { name: string; siren: string | null; siret: string | null; address: string | null } }> {
  const periodicity = String(input.periodicity || 'monthly') as Periodicity;
  if (!['monthly', 'quarterly'].includes(periodicity)) {
    throw new EreportingError('INVALID_PERIODICITY', 'La périodicité doit être « monthly » ou « quarterly ».', 400);
  }
  const period = validatePeriod(String(input.periodStart || ''), String(input.periodEnd || ''), periodicity);
  const collected = await collectPeriod(organizationId, period, periodicity);
  const org = (await query(`select name,siren,siret,address,postal_code,city from organizations where id=$1`, [organizationId])).rows[0];
  return {
    ...collected,
    emitter: {
      name: String(org?.name || ''),
      siren: org?.siren ? String(org.siren) : null,
      siret: org?.siret ? String(org.siret) : null,
      address: [org?.address, org?.postal_code, org?.city].filter(Boolean).map(v => String(v)).join(', ') || null,
    },
  };
}

// ------------------------------------------------------------------ préparation (scellement)

export type PrepareDeclarationResult = {
  id: string; status: string; kind: string; period: { start: string; end: string };
  payloadSha256: string; transactionCount: number; paymentCount: number;
  totalHt: number; totalVat: number; totalTtc: number; totalPayments: number;
  created: boolean;
};

/** Prépare et scelle une déclaration e-reporting (initiale ou correction). */
export async function prepareEreportingDeclaration(
  organizationId: string,
  userId: string,
  input: { periodStart: string; periodEnd: string; periodicity: string; kind?: 'initial' | 'correction'; correctsDeclarationId?: string | null },
): Promise<PrepareDeclarationResult> {
  const kind = input.kind === 'correction' ? 'correction' : 'initial';
  const periodicity = String(input.periodicity || 'monthly') as Periodicity;
  if (!['monthly', 'quarterly'].includes(periodicity)) {
    throw new EreportingError('INVALID_PERIODICITY', 'La périodicité doit être « monthly » ou « quarterly ».', 400);
  }
  const period = validatePeriod(String(input.periodStart || ''), String(input.periodEnd || ''), periodicity);

  let correctsDeclaration: any = null;
  if (kind === 'correction') {
    if (!input.correctsDeclarationId || !/^[0-9a-f-]{36}$/i.test(String(input.correctsDeclarationId))) {
      throw new EreportingError('CORRECTION_REFERENCE_MISSING', 'Une déclaration de correction doit référencer la déclaration corrigée.', 400);
    }
    correctsDeclaration = (await query(
      `select id,kind,status,period_start::text period_start,period_end::text period_end,pa_transmission_id from ereporting_declarations
        where id=$1 and organization_id=$2`,
      [input.correctsDeclarationId, organizationId],
    )).rows[0];
    if (!correctsDeclaration) throw new EreportingError('NOT_FOUND', 'Déclaration à corriger introuvable.', 404);
    if (String(correctsDeclaration.period_start) !== period.start || String(correctsDeclaration.period_end) !== period.end) {
      throw new EreportingError('CORRECTION_PERIOD_MISMATCH', 'La correction doit couvrir exactement la même période que la déclaration corrigée.', 400);
    }
  }

  const collected = await collectPeriod(organizationId, period, periodicity);
  if (collected.gaps.length) {
    throw new EreportingError(
      'EREPORTING_CLASSIFICATION_INCOMPLETE',
      'Des données déclaratives sont manquantes ou incohérentes pour la période : préparation refusée (rapport d\'écarts joint). Corrigez les fiches concernées puis relancez.',
      422,
      { gaps: collected.gaps, excluded: collected.excluded },
    );
  }
  if (!collected.transactionLines.length && !collected.paymentLines.length && kind === 'initial') {
    throw new EreportingError('EREPORTING_EMPTY_PERIOD', 'Aucune transaction ni paiement du périmètre e-reporting sur la période : rien à déclarer.', 422, { excluded: collected.excluded });
  }

  const org = (await query(`select name,siren,siret,address,postal_code,city from organizations where id=$1`, [organizationId])).rows[0];
  const emitter = {
    name: String(org?.name || ''),
    siren: org?.siren ? String(org.siren) : null,
    siret: org?.siret ? String(org.siret) : null,
    address: [org?.address, org?.postal_code, org?.city].filter(Boolean).map(v => String(v)).join(', ') || null,
  };
  if (!emitter.siren) {
    throw new EreportingError('EREPORTING_EMITTER_IDENTIFICATION_MISSING', 'Le SIREN de votre entreprise est absent du profil : complétez-le avant toute déclaration e-reporting.', 422);
  }

  const payload: EreportingPayload = buildEreportingPayload({
    kind,
    correctsDeclarationId: kind === 'correction' ? String(correctsDeclaration.id) : null,
    periodStart: period.start,
    periodEnd: period.end,
    periodicity,
    emitter,
    generatedAt: new Date(),
    transactionLines: collected.transactionLines,
    paymentLines: collected.paymentLines,
    gapReport: [],
    excluded: collected.excluded,
    corrections: kind === 'correction'
      ? [{ correctedDeclarationId: String(correctsDeclaration.id), correctedTransmissionId: correctsDeclaration.pa_transmission_id ? String(correctsDeclaration.pa_transmission_id) : null, lineCount: collected.transactionLines.length + collected.paymentLines.length }]
      : [],
  });
  const validation = validateEreportingPayload(payload);
  if (!validation.ok) {
    throw new EreportingError('EREPORTING_PAYLOAD_INVALID', 'Le flux e-reporting généré est invalide : préparation refusée.', 500, { issues: validation.issues });
  }

  const bytes = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  const digest = sha256Hex(bytes);
  const year = period.start.slice(0, 4);
  const transmissionId = randomUUID();
  const filename = `ereporting-${period.start}-${period.end}-${kind}.json`;

  const client = await db.connect();
  try {
    await client.query('begin');
    await applyTenant(client, organizationId);
    // Une seule déclaration ouverte par organisation/période/kind (index unique partiel + verrou).
    const open = (await client.query(
      `select id,status from ereporting_declarations
        where organization_id=$1 and period_start=$2::date and period_end=$3::date and kind=$4
          and status in ('prepared','submitted') limit 1 for update`,
      [organizationId, period.start, period.end, kind],
    )).rows[0];
    if (open) {
      throw new EreportingError('EREPORTING_ALREADY_OPEN', 'Une déclaration est déjà préparée ou en transmission pour cette période ; consultez-la ou attendez son accusé.', 409);
    }
    const storageKey = `private/${organizationId}/pa-ereporting/${year}/${transmissionId}-${digest.slice(0, 10)}-${filename}`;
    await writePrivateObject(storageKey, bytes, 'application/json');
    const inserted = (await client.query(
      `insert into ereporting_declarations(
         organization_id,kind,corrects_declaration_id,period_start,period_end,periodicity,status,
         payload_storage_key,payload_filename,payload_mime,payload_sha256,pa_transmission_id,
         transaction_count,payment_count,total_ht,total_vat,total_ttc,created_by)
       values($1,$2,$3,$4::date,$5::date,$6,'prepared',$7,$8,'application/json',$9,$10,$11,$12,$13,$14,$15,$16)
       returning id`,
      [
        organizationId, kind, kind === 'correction' ? String(correctsDeclaration.id) : null,
        period.start, period.end, periodicity, storageKey, filename, digest, transmissionId,
        collected.transactionCount, collected.paymentCount,
        euros(CENT(collected.totals.ht)), euros(CENT(collected.totals.vat)), euros(CENT(collected.totals.ttc)), userId,
      ],
    )).rows[0];

    let lineNumber = 0;
    for (const line of collected.transactionLines) {
      lineNumber += 1;
      await client.query(
        `insert into ereporting_lines(
           organization_id,declaration_id,line_number,source_kind,quote_id,invoice_number,transaction_date,
           transaction_category,buyer_name,buyer_category,buyer_country,buyer_vat_number,vat_rate,
           amount_ht,amount_vat,amount_ttc,inclusion_reason)
         values($1,$2,$3,'transaction',$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          organizationId, inserted.id, lineNumber, line.quoteId, line.invoiceNumber, line.transactionDate,
          line.transactionCategory, line.buyerName, line.buyerCategory, line.buyerCountry, line.buyerVatNumber,
          line.vatRate, line.amountHt, line.amountVat, line.amountTtc, line.inclusionReason,
        ],
      );
    }
    for (const line of collected.paymentLines) {
      lineNumber += 1;
      await client.query(
        `insert into ereporting_lines(
           organization_id,declaration_id,line_number,source_kind,quote_id,invoice_number,transaction_category,
           buyer_name,buyer_category,buyer_country,buyer_vat_number,vat_rate,amount_ht,amount_vat,amount_ttc,
           payment_date,payment_amount,payment_method,inclusion_reason)
         values($1,$2,$3,'payment',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16,$17,$18)`,
        [
          organizationId, inserted.id, lineNumber, line.quoteId, line.invoiceNumber, line.transactionCategory,
          line.buyerName, line.buyerCategory, line.buyerCountry, line.buyerVatNumber, line.vatRate,
          line.amountHt, line.amountVat, line.amountTtc, line.paymentDate, line.paymentAmount,
          line.paymentMethod, line.inclusionReason,
        ],
      );
    }

    await journal(client, organizationId, kind === 'correction' ? 'ereporting.correction_prepared' : 'ereporting.prepared', {
      declarationId: inserted.id,
      detail: {
        period, periodicity, kind, payloadSha256: digest,
        transactionCount: collected.transactionCount, paymentCount: collected.paymentCount,
        totals: collected.totals,
        excluded: collected.excluded,
        correctsDeclarationId: kind === 'correction' ? String(correctsDeclaration.id) : null,
      },
    });
    await client.query('commit');
    return {
      id: inserted.id, status: 'prepared', kind, period,
      payloadSha256: digest, transactionCount: collected.transactionCount, paymentCount: collected.paymentCount,
      totalHt: collected.totals.ht, totalVat: collected.totals.vat, totalTtc: collected.totals.ttc,
      totalPayments: collected.totals.payments, created: true,
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------ transmission + accusés

export type TransmitDeclarationOutcome =
  | { kind: 'accepted'; id: string; paReference: string | null; attempts: number }
  | { kind: 'rejected'; id: string; code: string; message: string | null; attempts: number }
  | { kind: 'unconfirmed'; id: string; errorCode: string; message: string; attempts: number };

/** Transmet (ou re-transmet) la déclaration préparée ; seul un accusé signé règle l'état. */
export async function transmitEreportingDeclaration(
  organizationId: string,
  userId: string,
  declarationId: string,
): Promise<TransmitDeclarationOutcome> {
  void userId;
  const endpointRow = (await query(
    `select provider,base_url,secret_encrypted,identifier from pa_outgoing_endpoints
      where organization_id=$1 and active=true order by created_at desc limit 1`,
    [organizationId],
  )).rows[0];
  if (!endpointRow) {
    throw new EreportingError('PA_OUT_NOT_CONFIGURED', 'Point d’entrée de la plateforme agréée non configuré pour cette organisation (POST /pa/outgoing-endpoints).', 503);
  }
  const adapter = resolvePaOutgoingAdapter(String(endpointRow.provider));
  if (!adapter) throw new EreportingError('PA_PROVIDER_UNKNOWN', 'Fournisseur de plateforme agréée inconnu.', 503);
  let secret: string;
  try { secret = decryptSecret(String(endpointRow.secret_encrypted)); }
  catch { throw new EreportingError('PA_ENDPOINT_SECRET_ERROR', 'Secret du point d’entrée illisible (rotation des clés de chiffrement ?).', 500); }
  const endpoint = { baseUrl: String(endpointRow.base_url), secret, identifier: endpointRow.identifier ? String(endpointRow.identifier) : null };

  // 1) Réservation : une seule transmission en vol (index unique partiel + verrou ligne).
  const client = await db.connect();
  let claimed: any;
  try {
    await client.query('begin');
    await applyTenant(client, organizationId);
    claimed = (await client.query(
      `select id,kind,period_start,period_end,pa_transmission_id,status,attempts,payload_storage_key,payload_sha256
         from ereporting_declarations
        where organization_id=$1 and id=$2 and status in ('prepared','timeout','rejected')
        order by created_at limit 1 for update`,
      [organizationId, declarationId],
    )).rows[0];
    if (!claimed) {
      const open = (await client.query(
        `select status from ereporting_declarations where organization_id=$1 and id=$2`,
        [organizationId, declarationId],
      )).rows[0];
      await client.query('commit');
      if (!open) throw new EreportingError('EREPORTING_NOT_PREPARED', 'Déclaration introuvable.', 404);
      if (open.status === 'accepted') throw new EreportingError('EREPORTING_ALREADY_ACCEPTED', 'Cette déclaration est déjà transmise et acceptée par la plateforme agréée.', 409);
      if (open.status === 'submitted') throw new EreportingError('EREPORTING_IN_FLIGHT', 'Une transmission est déjà en cours pour cette déclaration.', 409);
      throw new EreportingError('EREPORTING_STATE_INVALID', 'État de déclaration inattendu.', 409);
    }
    await client.query(
      `update ereporting_declarations
          set status='submitted',attempts=attempts+1,last_attempt_at=now(),submitted_at=now(),
              error_code=null,error_message=null,updated_at=now()
        where id=$1 and organization_id=$2`,
      [claimed.id, organizationId],
    );
    await journal(client, organizationId, 'ereporting.transmission_started', {
      declarationId: claimed.id,
      detail: { attempt: Number(claimed.attempts) + 1, transmissionIdStable: claimed.pa_transmission_id, kind: claimed.kind },
    });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // 2) Transport (hors transaction) : intégrité du flux scellé vérifiée avant chaque envoi.
  let bytes: Buffer;
  try { bytes = await readPrivateObject(String(claimed.payload_storage_key)); }
  catch {
    await failUnconfirmed(organizationId, claimed.id, 'EREPORTING_PAYLOAD_MISSING', 'Flux archivé illisible ; transmission non confirmée.', Number(claimed.attempts) + 1);
    return { kind: 'unconfirmed', id: claimed.id, errorCode: 'EREPORTING_PAYLOAD_MISSING', message: 'Flux archivé illisible ; transmission non confirmée.', attempts: Number(claimed.attempts) + 1 };
  }
  if (sha256Hex(bytes) !== String(claimed.payload_sha256)) {
    await failUnconfirmed(organizationId, claimed.id, 'EREPORTING_PAYLOAD_TAMPERED', 'Empreinte du flux archivé différente du sceau : transmission refusée.', Number(claimed.attempts) + 1);
    return { kind: 'unconfirmed', id: claimed.id, errorCode: 'EREPORTING_PAYLOAD_TAMPERED', message: 'Empreinte du flux archivé différente du sceau : transmission refusée.', attempts: Number(claimed.attempts) + 1 };
  }

  const result: PaOutgoingResult = await adapter.transmit(
    { baseUrl: endpoint.baseUrl, secret: endpoint.secret, identifier: endpoint.identifier },
    { transmissionId: String(claimed.pa_transmission_id), format: 'ereporting', filename: `ereporting-${claimed.period_start}-${claimed.period_end}.json`, bytes },
    config.AURION_PA_OUT_TIMEOUT_MS,
  );

  // 3) Règlement : seul un accusé authentifié change l'état réglementaire.
  const client2 = await db.connect();
  try {
    await client2.query('begin');
    await applyTenant(client2, organizationId);
    const current = (await client2.query(
      `select id,status,attempts from ereporting_declarations where id=$1 and organization_id=$2 for update`,
      [claimed.id, organizationId],
    )).rows[0];
    if (!current || current.status !== 'submitted') {
      await journal(client2, organizationId, 'ereporting.settle_skipped', {
        declarationId: claimed.id,
        detail: { currentStatus: current?.status ?? null, resultKind: result.kind },
      });
      await client2.query('commit');
      return { kind: 'unconfirmed', id: claimed.id, errorCode: 'EREPORTING_SETTLE_SKIPPED', message: 'État de déclaration modifié pendant l’appel ; vérifiez le journal.', attempts: Number(current?.attempts ?? claimed.attempts) };
    }

    const year = String(claimed.period_start).slice(0, 4);
    if (result.kind === 'accepted' || result.kind === 'rejected') {
      const ackBytes = result.raw;
      const ackSha = sha256Hex(ackBytes);
      const ackKey = `private/${organizationId}/pa-ereporting/${year}/${claimed.pa_transmission_id}-ack-${ackSha.slice(0, 10)}.json`;
      await writePrivateObject(ackKey, ackBytes, result.rawContentType || 'application/json');
      if (result.kind === 'accepted') {
        await client2.query(
          `update ereporting_declarations
              set status='accepted',pa_reference=$3,ack_storage_key=$4,ack_filename=$5,ack_mime=$6,ack_sha256=$7,
                  settled_at=now(),error_code=null,error_message=null,updated_at=now()
            where id=$2 and organization_id=$1`,
          [organizationId, claimed.id, result.paReference, ackKey, `${claimed.pa_transmission_id}-accuse.json`, result.rawContentType || 'application/json', ackSha],
        );
        await journal(client2, organizationId, 'ereporting.ack_accepted', {
          declarationId: claimed.id,
          detail: { paReference: result.paReference, ackSha256: ackSha, transmissionIdStable: claimed.pa_transmission_id, attempt: Number(claimed.attempts) + 1 },
        });
        await client2.query('commit');
        return { kind: 'accepted', id: claimed.id, paReference: result.paReference, attempts: Number(claimed.attempts) + 1 };
      }
      await client2.query(
        `update ereporting_declarations
            set status='rejected',rejection_code=$3,rejection_message=$4,ack_storage_key=$5,ack_filename=$6,
                ack_mime=$7,ack_sha256=$8,settled_at=now(),updated_at=now()
          where id=$2 and organization_id=$1`,
        [organizationId, claimed.id, result.code, result.message, ackKey, `${claimed.pa_transmission_id}-accuse.json`, result.rawContentType || 'application/json', ackSha],
      );
      await journal(client2, organizationId, 'ereporting.ack_rejected', {
        declarationId: claimed.id,
        detail: { code: result.code, message: result.message, ackSha256: ackSha, transmissionIdStable: claimed.pa_transmission_id, attempt: Number(claimed.attempts) + 1 },
      });
      await client2.query('commit');
      return { kind: 'rejected', id: claimed.id, code: result.code, message: result.message, attempts: Number(claimed.attempts) + 1 };
    }

    const errorCode = result.kind === 'transport_error'
      ? (result.timedOut ? 'PA_OUT_TIMEOUT' : 'PA_OUT_TRANSPORT_ERROR')
      : 'PA_OUT_INVALID_ACK';
    await client2.query(
      `update ereporting_declarations set status='timeout',error_code=$3,error_message=$4,updated_at=now()
        where id=$2 and organization_id=$1`,
      [organizationId, claimed.id, errorCode, result.message],
    );
    await journal(client2, organizationId, 'ereporting.issue_unconfirmed', {
      declarationId: claimed.id,
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

async function failUnconfirmed(organizationId: string, declarationId: string, code: string, message: string, attempts: number): Promise<void> {
  await withTenant(organizationId, () => query(
    `update ereporting_declarations set status='timeout',error_code=$3,updated_at=now() where id=$1 and organization_id=$2`,
    [declarationId, organizationId, code],
  ));
  await withTenant(organizationId, () => query(
    `insert into ereporting_events(organization_id,declaration_id,kind,detail)
     values($1,$2,'ereporting.issue_unconfirmed',$3::jsonb)`,
    [organizationId, declarationId, JSON.stringify({ code, message, attempts })],
  ));
}

// ------------------------------------------------------------------ consultation

export async function listEreportingDeclarations(organizationId: string, options: { status?: string | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
  const clauses = ['organization_id=$1'];
  const values: unknown[] = [organizationId];
  if (options.status) { clauses.push(`status=$${values.length + 1}`); values.push(options.status); }
  return (await query(
    `select id,kind,corrects_declaration_id,period_start,period_end,periodicity,status,pa_reference,
            payload_filename,payload_sha256,ack_filename,ack_sha256,rejection_code,error_code,error_message,
            transaction_count,payment_count,total_ht,total_vat,total_ttc,attempts,submitted_at,settled_at,created_at,updated_at
       from ereporting_declarations where ${clauses.join(' and ')} order by created_at desc limit ${limit}`,
    values,
  )).rows;
}

export async function getEreportingDeclaration(organizationId: string, id: string) {
  const row = (await query(
    `select * from ereporting_declarations where id=$1 and organization_id=$2`,
    [id, organizationId],
  )).rows[0];
  if (!row) return null;
  const lines = (await query(
    `select id,line_number,source_kind,quote_id,invoice_number,transaction_date,transaction_category,
            buyer_name,buyer_category,buyer_country,buyer_vat_number,vat_rate,amount_ht,amount_vat,amount_ttc,
            payment_date,payment_amount,payment_method,inclusion_reason
       from ereporting_lines where declaration_id=$1 and organization_id=$2 order by line_number`,
    [id, organizationId],
  )).rows;
  const events = (await query(
    `select id,kind,detail,created_at from ereporting_events
      where declaration_id=$1 and organization_id=$2 order by created_at,id`,
    [id, organizationId],
  )).rows;
  return { declaration: row, lines, events };
}

export async function readEreportingPayload(organizationId: string, id: string) {
  const row = (await query(
    `select payload_storage_key,payload_filename,payload_mime from ereporting_declarations
      where id=$1 and organization_id=$2`,
    [id, organizationId],
  )).rows[0];
  if (!row) return null;
  const bytes = await readPrivateObject(String(row.payload_storage_key));
  return { filename: String(row.payload_filename), mimeType: String(row.payload_mime), bytes };
}

export async function readEreportingAck(organizationId: string, id: string) {
  const row = (await query(
    `select ack_storage_key,ack_filename,ack_mime from ereporting_declarations
      where id=$1 and organization_id=$2 and ack_storage_key is not null`,
    [id, organizationId],
  )).rows[0];
  if (!row) return null;
  const bytes = await readPrivateObject(String(row.ack_storage_key));
  return { filename: String(row.ack_filename), mimeType: String(row.ack_mime), bytes };
}
