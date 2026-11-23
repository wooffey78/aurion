// Bloc 16 (prompt 16) — sécurité des fichiers du dépôt privé central.
// Détection de type par octets magiques (jamais confiance au MIME déclaré), empreinte
// SHA-256 systématique, catégories déterministes, refus explicite des formats dangereux.
// Les fonctions de détection sont PURES et testées sans base ; l'upload les applique avant
// toute écriture en base. Le scan antivirus n'est PAS revendiqué : aucune dépendance externe
// n'est disponible dans cette version, le refus est déterministe (formats liste blanche).
import { createHash } from 'node:crypto';

/** Catégories déterministes (bloc 16) : étiquetage contrôlé, jamais libre. */
export const DOCUMENT_CATEGORIES = [
  'justificatif-achat', 'justificatif-vente', 'facture-fournisseur', 'bon-de-commande',
  'livraison', 'contrat', 'photo-chantier', 'piece-identite', 'banque', 'fiscal',
  'assurance', 'correspondance', 'autre',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isKnownCategory(category: unknown): boolean {
  return DOCUMENT_CATEGORIES.includes(String(category ?? '') as DocumentCategory);
}

export interface SniffResult {
  /** Type MIME détecté par octets magiques (null si inconnu). */
  mime: string | null;
  /** true si le contenu est incompatible avec le MIME déclaré (usurpation). */
  mismatch: boolean;
  /** true si le contenu correspond à un format dangereux (exécutable, script). */
  dangerous: boolean;
  signature: string;
}

// Signatures d'en-tête : les formats acceptés (liste blanche documents.ts) et les refus explicites.
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number; dangerous?: boolean }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },               // %PDF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },         // RIFF....WEBP
  { mime: 'application/zip', bytes: [0x50, 0x4B, 0x03, 0x04] },               // conteneur DOCX/ODT
  { mime: 'text/plain', bytes: [] },                                           // repli texte
  // Formats dangereux : refus explicite même si le MIME déclaré est dans la liste blanche.
  { mime: 'application/x-msdownload', bytes: [0x4D, 0x5A], dangerous: true }, // PE/EXE (MZ)
  { mime: 'application/x-elf', bytes: [0x7F, 0x45, 0x4C, 0x46], dangerous: true }, // ELF
  { mime: 'application/x-sh', bytes: [0x23, 0x21], dangerous: true },          // shebang #!
  { mime: 'application/x-msi', bytes: [0xD0, 0xCF, 0x11, 0xE0], dangerous: true }, // OLE/MSI
];

/** Détecte le type réel d'un tampon par octets magiques. Fonction PURE — testée sans base. */
export function sniffMime(buffer: Buffer): SniffResult {
  const head = buffer.subarray(0, 16);
  const hex = head.toString('hex').toUpperCase();
  for (const sig of SIGNATURES) {
    if (!sig.bytes.length) continue;
    const offset = sig.offset ?? 0;
    const slice = buffer.subarray(offset, offset + sig.bytes.length);
    if (slice.length >= sig.bytes.length && sig.bytes.every((b, i) => slice[i] === b)) {
      // RIFF : confirmer WEBP à l'offset 8.
      let mime: string | null = sig.mime;
      if (sig.mime === 'image/webp' && buffer.subarray(8, 12).toString('ascii') !== 'WEBP') mime = null;
      return { mime, mismatch: false, dangerous: Boolean(sig.dangerous), signature: hex.slice(0, 16) };
    }
  }
  // Heuristique binaire : octets de contrôle en tête → contenu binaire non listé.
  let control = 0;
  for (const b of head) if (b < 0x09 || (b > 0x0D && b < 0x20)) control++;
  if (control >= 2) return { mime: null, mismatch: false, dangerous: true, signature: hex.slice(0, 16) };
  // Texte plausible (TXT/CSV).
  return { mime: 'text/plain', mismatch: false, dangerous: false, signature: hex.slice(0, 16) };
}

/**
 * Décision d'acceptation d'un upload du dépôt privé : le MIME déclaré doit être dans la liste
 * blanche, le contenu ne doit être ni dangereux ni incompatible. Fonction PURE — testée.
 */
export function decideUpload(declaredMime: string, sniff: SniffResult): { accepted: boolean; status: 'clean' | 'rejected'; reason: string | null; detectedMime: string | null } {
  if (sniff.dangerous) return { accepted: false, status: 'rejected', reason: 'FORMAT_DANGEROUS', detectedMime: sniff.mime };
  if (!sniff.mime) return { accepted: false, status: 'rejected', reason: 'MIME_UNDETECTED', detectedMime: null };
  // ZIP = conteneur des formats bureautiques de la liste blanche (DOCX/ODT) : compatible.
  const compatible = sniff.mime === declaredMime || (sniff.mime === 'application/zip' && /^(application\/vnd\.(openxmlformats|oasis))/.test(declaredMime));
  if (!compatible) return { accepted: false, status: 'rejected', reason: 'MIME_MISMATCH', detectedMime: sniff.mime };
  return { accepted: true, status: 'clean', reason: null, detectedMime: sniff.mime };
}

/** Empreinte SHA-256 hexadécimale du contenu (bloc 16 : intégrité systématique). */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Nom de fichier stocké : UUID + extension nettoyée (aucun caractère dangereux conservé). */
export function safeArchiveName(name: string): string {
  return String(name || 'document')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 150) || 'document';
}
