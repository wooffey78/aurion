// Bloc 12 — Lecture des bordereaux professionnels et préparation de facture.
//
// Chaîne 100 % DÉTERMINISTE (sans service d'IA distant, conformément au retrait
// annoncé en 15.4.0) : extraction de texte (pdftotext/soffice pour les PDF texte,
// lecture directe TXT/CSV), analyse de tableaux, formats numériques français, règles de
// correspondance catalogue. Aucune donnée n'est inventée : chaque valeur extraite porte sa
// SOURCE (étiquette explicite ou position) et sa CONFIANCE ; les champs manquants sont
// signalés. L'utilisateur peut modifier toutes les valeurs détectées — le module ne crée
// JAMAIS un document ni un client par lui-même.

export type BordereauConfidence = 'labeled' | 'inferred' | 'missing';

export interface BordereauField {
  key: string;
  label: string;
  value: string;
  confidence: BordereauConfidence;
  /** Ligne d'origine (1 = première ligne du texte) — traçabilité de chaque valeur. */
  line: number | null;
}

export interface BordereauItem {
  label: string;
  quantity: number;
  unitPrice: number;
  confidence: BordereauConfidence;
  line: number;
}

export interface BordereauParseResult {
  fields: BordereauField[];
  items: BordereauItem[];
  totals: { ht: number | null; vat: number | null; ttc: number | null };
  missing: string[];
  warnings: string[];
  /** Nombre de lignes analysées — indicateur de lisibilité du document source. */
  linesAnalyzed: number;
}

/** Nombre français : « 1 234,56 », « 1234.56 », « 1.234,56 » → nombre. Retourne null si absent. */
export function parseFrenchNumber(raw: string): number | null {
  const s = String(raw || '').replace(/\u00a0/g, ' ').trim();
  if (!s) return null;
  let normalized = s.replace(/[\s\u202f]/g, '').replace(/€/g, '');
  if (!/^[\d.,+-]+$/.test(normalized)) return null;
  if (normalized.includes(',') && normalized.includes('.')) {
    // Le séparateur le plus à droite est le séparateur décimal.
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');
    // « 1,234 » (3 décimales après la virgule et plusieurs groupes) est ambigu :
    // convention française par défaut = séparateur décimal à 2 chiffres.
    normalized = parts[parts.length - 1].length === 2 || parts.length === 2 ? normalized.replace(',', '.') : normalized.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const HEADER_KEYWORDS = /^(bordereau|bon de (livraison|commande|travail)|facture|devis|récapitulatif|recapitulatif)\b/i;

/** Extrait le texte d'un bordereau : TXT/CSV en lecture directe, PDF texte via pdftotext ou LibreOffice. */
export async function extractText(filename: string, mime: string, buffer: Buffer, run: (cmd: string, args: string[], input: Buffer) => Promise<string>): Promise<string> {
  const lower = String(filename || '').toLowerCase();
  if (mime.includes('text/plain') || mime.includes('csv') || /\.(txt|csv|md)$/.test(lower)) {
    const text = buffer.toString('utf8');
    if (/\ufffd/.test(text) && !buffer.includes(0x0a)) return buffer.toString('latin1');
    return text;
  }
  if (mime.includes('pdf') || lower.endsWith('.pdf')) {
    try { return await run('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], buffer); }
    catch { return await run('soffice', ['--headless', '--convert-to', 'txt:Text', '--stdout'], buffer); }
  }
  throw new Error('Format non pris en charge pour l\'extraction déterministe : fournissez un PDF texte, un TXT ou un CSV. Les scans image nécessitent un OCR local non inclus dans cette livraison.');
}

/** Analyse déterministe d'un bordereau en texte — pure, sans effet de bord. */
export function parseBordereau(text: string): BordereauParseResult {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const warnings: string[] = [];
  const fields: BordereauField[] = [];
  const items: BordereauItem[] = [];
  const push = (key: string, label: string, value: string, confidence: BordereauConfidence, line: number | null) => {
    fields.push({ key, label, value: String(value || '').trim(), confidence, line });
  };

  let client: { value: string; confidence: BordereauConfidence; line: number | null } | null = null;
  let siret: BordereauField | null = null, email: BordereauField | null = null, phone: BordereauField | null = null;
  let date: BordereauField | null = null, reference: BordereauField | null = null, orderRef: BordereauField | null = null;
  let address: { value: string; line: number | null } | null = null;
  const totals: { ht: number | null; vat: number | null; ttc: number | null } = { ht: null, vat: null, ttc: null };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const labeled = (key: string, re: RegExp, label: string, clean?: (v: string) => string): BordereauField | null => {
      const m = trimmed.match(re);
      if (!m) return null;
      const value = clean ? clean(m[1]) : m[1];
      const f: BordereauField = { key, label, value: String(value || '').trim(), confidence: 'labeled', line: i + 1 };
      fields.push(f);
      return f;
    };
    // Étiquettes explicites (confiance « labeled ») :
    siret = siret || labeled('siret', /siret?\s*[:#]?\s*((?:\d[\s.]*){9,14})/i, 'SIRET/SIREN', v => v.replace(/[\s.]/g, ''));
    email = email || labeled('email', /e-?mail\s*[:#]?\s*([\w.+-]+@[\w.-]+\.\w{2,})/i, 'E-mail');
    phone = phone || labeled('phone', /t[ée]l(?:[ée]phone)?\s*[:#]?\s*((?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4})/i, 'Téléphone', v => v.replace(/[\s.-]/g, ''));
    date = date || labeled('date', /date\s*[:#]?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|\d{4}-\d{2}-\d{2})/i, 'Date');
    reference = reference || labeled('reference', /(?:réf(?:érence)?|reference|n°?\s*bordereau)\s*[:#]?\s*([A-Za-z0-9\u00c0-\u017f/-]+)/i, 'Référence');
    orderRef = orderRef || labeled('orderRef', /(?:bon de commande|commande\s*n°?|cde)\s*[:#]?\s*([A-Za-z0-9/-]+)/i, 'Bon de commande');
    const clientLabeled = trimmed.match(/(?:client|destinataire|raison sociale)\s*[:#]\s*(.{2,240})/i);
    if (clientLabeled && !client) client = { value: clientLabeled[1].trim(), confidence: 'labeled', line: i + 1 };
    if (!address) {
      const addrMatch = trimmed.match(/adresse\s*[:#]\s*(.{5,500})/i);
      if (addrMatch) address = { value: addrMatch[1].trim(), line: i + 1 };
    }
    // Totaux :
    const ht = trimmed.match(/total\s*(?:ht|hors taxe)\s*[:#]?\s*([\d\s\u00a0.,]+)\s*€?/i);
    if (ht && totals.ht === null) totals.ht = parseFrenchNumber(ht[1]);
    const tva = trimmed.match(/(?:total\s*)?(?:tva|montant\s*tva)\s*[:#]?\s*([\d\s\u00a0.,]+)\s*€?/i);
    if (tva && totals.vat === null) totals.vat = parseFrenchNumber(tva[1]);
    const ttc = trimmed.match(/total\s*(?:ttc|toutes taxes)\s*[:#]?\s*([\d\s\u00a0.,]+)\s*€?/i);
    if (ttc && totals.ttc === null) totals.ttc = parseFrenchNumber(ttc[1]);

    // Lignes de tableau : « étiquette … qté … prix unitaire » (formats français).
    const itemMatch = trimmed.match(/^(.{2,240}?)\s+(\d+(?:[.,]\d+)?)\s*(?:x|×)\s*(\d[\d\s\u00a0]*[.,]\d{2})\s*€?$/)
      || trimmed.match(/^(.{2,240}?)\s*\|\s*(\d+(?:[.,]\d+)?)\s*\|\s*(\d[\d\s\u00a0]*[.,]\d{2})\s*€?$/)
      || trimmed.match(/^(.{2,240}?)\s{2,}(\d+(?:[.,]\d+)?)\s+(\d[\d\s\u00a0]*[.,]\d{2})\s*€?$/);
    if (itemMatch && !HEADER_KEYWORDS.test(itemMatch[1])) {
      const quantity = parseFrenchNumber(itemMatch[2]);
      const unitPrice = parseFrenchNumber(itemMatch[3]);
      if (quantity !== null && quantity > 0 && unitPrice !== null && unitPrice >= 0) {
        items.push({ label: itemMatch[1].trim().replace(/;+$/,''), quantity, unitPrice, confidence: 'inferred', line: i + 1 });
      }
    }
    // Nom du client implicite : première ligne utile qui n'est pas une étiquette connue.
    if (!client && !HEADER_KEYWORDS.test(trimmed) && !siret && trimmed.length >= 2 && trimmed.length <= 240 && !/[:#]/.test(trimmed)) {
      client = { value: trimmed, confidence: 'inferred', line: i + 1 };
    }
  }

  // Champs restants (sourcés ou manquants — jamais inventés) :
  if (client) push('client', 'Client', client.value, client.confidence, client.line);
  if (address) push('address', 'Adresse', address.value, 'inferred', address.line);
  if (date) { /* déjà poussé (labeled) */ } else push('date', 'Date', '', 'missing', null);
  if (reference) { /* déjà poussé */ } else push('reference', 'Référence', '', 'missing', null);
  if (!siret) push('siret', 'SIRET/SIREN', '', 'missing', null);
  if (!email) push('email', 'E-mail', '', 'missing', null);
  if (!phone) push('phone', 'Téléphone', '', 'missing', null);

  const missing = fields.filter(f => f.confidence === 'missing').map(f => f.label);
  if (!items.length) warnings.push('Aucune ligne de pièce/prestation détectée : vérifiez le format (étiquette, quantité, prix unitaire) ou saisissez les lignes manuellement.');
  if (totals.ht !== null && totals.ttc !== null && totals.vat === null) warnings.push('Total TVA absent : laissez-le vide ou corrigez-le manuellement.');
  if (client?.confidence === 'inferred') warnings.push('Nom du client déduit de la première ligne : vérifiez-le.');
  // Cohérence arithmétique signalée (jamais corrigée silencieusement) :
  const itemsHt = items.reduce((t, x) => t + x.quantity * x.unitPrice, 0);
  if (items.length && totals.ht !== null && Math.abs(itemsHt - totals.ht) > 0.02) {
    warnings.push(`Somme des lignes (${itemsHt.toFixed(2)} €) différente du total HT affiché (${totals.ht.toFixed(2)} €) : vérifiez les quantités et prix.`);
  }
  return {
    fields,
    items,
    totals,
    missing,
    warnings,
    linesAnalyzed: lines.filter(l => l.trim()).length,
  };
}

/** Correspondance catalogue déterministe : libellés normalisés (sans accents, casse, ponctuation) — exact ou inclusion. */
export function matchCatalogItems(parsed: BordereauItem[], catalog: Array<{ name: string }>): Array<{ item: BordereauItem; partId: string | null; matchKind: 'exact' | 'partial' | 'none' }> {
  const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
  return parsed.map(item => {
    const n = norm(item.label);
    const exact = catalog.find(c => norm(c.name) === n);
    if (exact) return { item, partId: exact.name ? (exact as any).id || null : null, matchKind: 'exact' as const };
    const partial = catalog.find(c => norm(c.name).includes(n) || n.includes(norm(c.name)));
    if (partial) return { item, partId: (partial as any).id || null, matchKind: 'partial' as const };
    return { item, partId: null, matchKind: 'none' as const };
  });
}
