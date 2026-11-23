// 15.4.50 (suggestion B5) — Chaîne d'intégrité documentaire (« coffre » à valeur probante).
// Chaque document ÉMIS (devis accepté, facture envoyée) est chaîné : hash = SHA-256 du hash
// de chaîne précédent concaténé aux données de l'entrée courante (format canonique documenté
// ci-dessous). Toute altération d'une pièce passée casse la chaîne à l'endroit exact.
// Aucune prétention juridique : c'est une preuve TECHNIQUE d'intégrité depuis l'émission.
import { createHash } from 'node:crypto';

export interface ChainEntry {
  documentId: string;
  documentKind: 'quote' | 'invoice';
  documentNumber: string | null;
  sha256: string;
  recordedAt: string;
  prevChainHash: string | null;
  chainHash: string;
}

/** Format canonique documenté : `v1|docId|kind|number|sha256|recordedAt|prevHash`. */
export function canonicalChainInput(documentId: string, documentKind: string, documentNumber: string | null, sha256: string, recordedAt: string, prevChainHash: string | null): string {
  return `v1|${documentId}|${documentKind}|${documentNumber ?? '-'}|${sha256}|${recordedAt}|${prevChainHash ?? '-'}`;
}

/** Calcule l'entrée de chaîne. Fonction PURE — testée sans base. */
export function computeChainEntry(documentId: string, documentKind: 'quote' | 'invoice', documentNumber: string | null, sha256: string, recordedAt: string, prevChainHash: string | null): ChainEntry {
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('La SHA-256 du document doit être une empreinte hexadécimale de 64 caractères.');
  const input = canonicalChainInput(documentId, documentKind, documentNumber, sha256.toLowerCase(), recordedAt, prevChainHash);
  return {
    documentId, documentKind, documentNumber,
    sha256: sha256.toLowerCase(),
    recordedAt,
    prevChainHash,
    chainHash: createHash('sha256').update(input).digest('hex'),
  };
}

export interface ChainVerification {
  checked: number;
  valid: boolean;
  brokenAtDocumentId: string | null;
  reason: string;
}

/** Vérifie une séquence d'entrées (ordre chronologique). Fonction PURE — testée sans base. */
export function verifyChain(entries: ChainEntry[]): ChainVerification {
  if (entries.length === 0) return { checked: 0, valid: true, brokenAtDocumentId: null, reason: 'Chaîne vide : rien à vérifier.' };
  let prev: string | null = null;
  for (const e of entries) {
    if (e.prevChainHash !== prev) {
      return { checked: entries.length, valid: false, brokenAtDocumentId: e.documentId, reason: `Liaison cassée : l'entrée du document ${e.documentId} ne référence pas le hash de chaîne précédent.` };
    }
    const expected = computeChainEntry(e.documentId, e.documentKind, e.documentNumber, e.sha256, e.recordedAt, e.prevChainHash);
    if (expected.chainHash !== e.chainHash) {
      return { checked: entries.length, valid: false, brokenAtDocumentId: e.documentId, reason: `Empreinte de chaîne invalide pour le document ${e.documentId} : une donnée de l'entrée a été altérée.` };
    }
    prev = e.chainHash;
  }
  return { checked: entries.length, valid: true, brokenAtDocumentId: null, reason: `Chaîne intègre sur ${entries.length} entrée(s).` };
}

// 15.4.51 (PROMPT B3) — enregistrement de l'empreinte du CONTENU CANONIQUE d'une facture émise.
// La facture émise est chaînée À L'ÉMISSION (dans la transaction métier) : l'empreinte porte sur
// une sérialisation canonique et stable du document (identifiant, numéro, client, totaux, lignes,
// échéance) — le PDF restant un rendu à la demande. Clé unique (organization_id, document_id) :
// le rejeu ou un double appel n'écrit jamais deux maillons (idempotence append-only).
export interface CanonicalInvoiceInput {
  documentId: string;
  number: string;
  clientId: string | null;
  totalHt: string | number | null;
  totalVat: string | number | null;
  totalTtc: string | number | null;
  dueAt: string | null;
  items: Array<{ label: string; quantity: string | number; unitPrice: string | number | null }>;
}
/** Fonction PURE : sérialisation canonique stable (ordre des clés fixé, montants normalisés). */
export function canonicalInvoiceContent(i: CanonicalInvoiceInput): string {
  const n = (v: string | number | null | undefined) => v == null ? '-' : String(v);
  const items = (i.items || []).map(x => `${x.label}|${n(x.quantity)}|${n(x.unitPrice)}`).join(';;');
  return `invoice-v1|${i.documentId}|${i.number}|${n(i.clientId)}|${n(i.totalHt)}|${n(i.totalVat)}|${n(i.totalTtc)}|${n(i.dueAt)}|${items}`;
}
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// 15.4.51 (PROMPT B3) — enregistrement de l'entrée d'intégrité d'un document ÉMIS (fonction
// déplacée de routes/maintenance.ts vers le service pour être appelée par les flux d'émission).
// Append-only, idempotent : clé unique (organization_id, document_id), jamais de réécriture.
import { emitOrgEvent } from './events.js';
import type { SqlExecutor } from './sql-executor.js';

export async function recordDocumentIntegrity(exec: SqlExecutor, organizationId: string, documentId: string, documentKind: 'quote' | 'invoice', documentNumber: string | null, sha256: string): Promise<void> {
  const prev = (await exec.query(
    `select chain_hash from document_integrity_chain where organization_id=$1 order by recorded_at desc limit 1`,
    [organizationId],
  )).rows[0];
  const entry = computeChainEntry(documentId, documentKind, documentNumber, sha256, new Date().toISOString(), prev ? String(prev.chain_hash) : null);
  await exec.query(
    `insert into document_integrity_chain(organization_id,document_id,document_kind,document_number,sha256,chain_hash,prev_chain_hash)
     values($1,$2,$3,$4,$5,$6,$7) on conflict (organization_id,document_id) do nothing`,
    [organizationId, documentId, documentKind, documentNumber, entry.sha256, entry.chainHash, entry.prevChainHash],
  );
  await emitOrgEvent(organizationId, {
    type: 'integrity_chain_recorded',
    title: `Pièce chaînée : ${documentNumber ?? documentId}`,
    description: 'Empreinte et horodatage enregistrés dans la chaîne d\'intégrité (append-only) — vérifiable à tout moment dans le coffre.',
    severity: 'action', source: 'integrity', internalPath: '/docs', dedupeKey: `integrity:${documentId}`,
  });
}
