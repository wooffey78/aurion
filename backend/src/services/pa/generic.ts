// Adaptateur PA « generic » — contrat de référence, documenté dans docs/PLATEFORME-AGREEE.md.
//
// ATTENTION (bloc 3 du cahier des charges) : cet adaptateur n'est connecté à AUCUNE plateforme
// agréée réelle. Il définit un contrat webhook générique, signé HMAC-SHA256, que les tests de
// contrat exercent de bout en bout. Toute connexion à une PA contractuelle exige un adaptateur
// dédié validé en sandbox — aucun endpoint ni identifiant réel n'est codé en dur ici.
//
// Contrat d'authentification entrante (miroir du schéma éprouvé de Stripe, comparaison à temps
// constant, tolérance horaire bornée contre le rejeu) :
//   En-tête  X-Aurion-PA-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secret, "<t>.<corpsBrut>))>
//   Secret   AURION_PA_WEBHOOK_SECRET (≥ 32 caractères, jamais journalisé).
//
// Enveloppe JSON :
//   { eventId, type, occurredAt,
//     invoice?: { invoiceId, number, issueDate, dueDate, currency,
//                 supplier: { name, siren, siret, email, vatNumber },
//                 totals: { net, tax, gross },
//                 items?: [{ label, quantity, unitPrice, total }],
//                 document: { filename, contentType, contentBase64 } } }
// Le fichier original est transmis en base64 dans l'enveloppe (limite AURION_PA_MAX_FILE_BYTES).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PaAdapter, PaEventParseResult, PaWebhookHeaders } from './types.js';

export const GENERIC_PA_PROVIDER = 'generic';
export const GENERIC_PA_EVENT_TYPES = ['invoice.received'] as const;
export const GENERIC_PA_SIGNATURE_TOLERANCE_SECONDS = 300;
export const GENERIC_PA_SIGNATURE_HEADER = 'x-aurion-pa-signature';

/** Types MIME acceptés pour l'original archivé (PDF factur-X/XML UBL-CII ou pièce scannée). */
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/xml',
  'text/xml',
  'application/octet-stream',
]);

function verifyGenericSignature(
  rawBody: Buffer,
  header: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = GENERIC_PA_SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const fields = header.split(',').map(part => part.trim().split('=', 2));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest();
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value || '');
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

// Schéma de l'enveloppe : strict mais lisible ; les champs hors contrat sont conservés tels
// quels dans payload (journal) plutôt que rejetés, afin de garder l'original traçable.
const envelopeSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(120),
  occurredAt: z.string().trim().min(1).max(60),
  invoice: z.unknown().optional(),
});

const invoiceSchema = z.object({
  invoiceId: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(80).nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  supplier: z.object({
    name: z.string().trim().min(1).max(180),
    siren: z.string().regex(/^\d{9}$/).nullable(),
    siret: z.string().regex(/^\d{14}$/).nullable(),
    email: z.string().trim().max(254).nullable(),
    vatNumber: z.string().trim().max(32).nullable(),
  }),
  totals: z.object({
    net: z.number().min(0).max(99_999_999.99),
    tax: z.number().min(0).max(99_999_999.99),
    gross: z.number().min(0).max(99_999_999.99),
  }),
  items: z.array(z.object({
    label: z.string().trim().min(1).max(400),
    quantity: z.number().min(0).max(1_000_000),
    unitPrice: z.number().min(0).max(99_999_999.99),
    total: z.number().min(0).max(99_999_999.99).nullable(),
  })).max(500).optional(),
  document: z.object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().toLowerCase().min(3).max(100),
    contentBase64: z.string().min(1),
  }),
});

const dateNotFutureLimit = (value: string) => {
  // Les dates sont validées syntaxiquement (schéma) ; une date d'échéance antérieure à la date
  // d'émission reste acceptée (cas réglementaires réels) mais une date d'émission invalide
  // (31 février, 0000) est rejetée par Date. Retourne true si parseable.
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

function validDate(value: string | null): boolean {
  return value === null ? true : dateNotFutureLimit(value);
}

export const genericPaAdapter: PaAdapter = {
  provider: GENERIC_PA_PROVIDER,
  eventTypes: GENERIC_PA_EVENT_TYPES,

  verifySignature(rawBody: Buffer, headers: PaWebhookHeaders, secret: string): boolean {
    const header = String(headers[GENERIC_PA_SIGNATURE_HEADER] || '');
    return verifyGenericSignature(rawBody, header, secret);
  },

  async parseEvent(rawBody: Buffer, maxFileBytes: number): Promise<PaEventParseResult> {
    let json: unknown;
    try { json = JSON.parse(rawBody.toString('utf8')); }
    catch { return { ok: false, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Corps JSON illisible.' }; }

    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
      return { ok: false, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Enveloppe d’événement invalide.' };
    }

    if (!GENERIC_PA_EVENT_TYPES.includes(envelope.data.type as (typeof GENERIC_PA_EVENT_TYPES)[number])) {
      // Type inconnu du contrat actuel : l'appelant l'acquitte sans traitement (pas de boucle
      // de re-tentatives) et le journal conserve l'événement pour audit.
      return { ok: true, event: { ...envelope.data, invoice: null } as never };
    }

    const invoice = invoiceSchema.safeParse(envelope.data.invoice);
    if (!invoice.success) {
      return { ok: false, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Charge utile facture invalide.' };
    }
    const data = invoice.data;
    if (!validDate(data.issueDate) || !validDate(data.dueDate)) {
      return { ok: false, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Date d’émission ou d’échéance invalide.' };
    }
    if (!ALLOWED_CONTENT_TYPES.has(data.document.contentType)) {
      return { ok: false, code: 'UNSUPPORTED_EVENT_CONTENT', message: `Type de document non pris en charge : ${data.document.contentType}` };
    }

    const bytes = Buffer.from(data.document.contentBase64, 'base64');
    // Décodage tolérant : Buffer.from n'échoue pas sur un base64 invalide ; on vérifie que la
    // ré-encodage canonique correspond (aucun caractère parasite ni padding fantôme).
    const canonical = bytes.length ? bytes.toString('base64') : '';
    const normalized = data.document.contentBase64.replace(/\s+/g, '');
    if (canonical !== normalized && canonical.replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
      return { ok: false, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Contenu base64 illisible.' };
    }
    if (bytes.length === 0) {
      return { ok: false, code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Fichier original vide.' };
    }
    if (bytes.length > maxFileBytes) {
      return { ok: false, code: 'UNSUPPORTED_EVENT_CONTENT', message: `Fichier original trop volumineux (max ${maxFileBytes} octets).` };
    }

    return {
      ok: true,
      event: {
        eventId: envelope.data.eventId,
        type: envelope.data.type,
        occurredAt: envelope.data.occurredAt,
        invoice: {
          invoiceId: data.invoiceId,
          number: data.number,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          currency: data.currency,
          supplier: {
            name: data.supplier.name,
            siren: data.supplier.siren,
            siret: data.supplier.siret,
            email: data.supplier.email,
            vatNumber: data.supplier.vatNumber,
          },
          totals: { net: data.totals.net, tax: data.totals.tax, gross: data.totals.gross },
          items: (data.items || []).map(item => ({
            label: item.label, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total,
          })),
          document: { filename: data.document.filename, contentType: data.document.contentType, bytes },
        },
      },
    };
  },
};

/** Génère une signature de test valide (usage : tests de contrat et intégration uniquement). */
export function signGenericPayload(secret: string, rawBody: Buffer, timestampSeconds?: number): string {
  const t = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.`, 'utf8').update(rawBody).digest('hex');
  return `t=${t},v1=${v1}`;
}

export { verifyGenericSignature };
