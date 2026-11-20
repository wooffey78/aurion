// Bloc 25 — Import de relevés bancaires (CSV / OFX) et rapprochement avec les encaissements.
// Chaîne DÉTERMINISTE sans agrégateur bancaire ni ordre de paiement sortant (décision D5 :
// défaut = import de fichiers). Détection des doublons par empreinte (réimport sans
// duplication), suggestions par montant/date/libellé, chaque rapprochement validé par
// l'utilisateur et ANNULABLE ; les écarts sont listés, jamais résolus silencieusement.
import { createHash } from 'node:crypto';

export interface ParsedStatementRow { valueDate: string; amount: number; label: string; externalRef: string }

/** Empreinte de dédoublonnage : date + montant + libellé + référence (stable au réimport). */
export function fingerprint(row: ParsedStatementRow): string {
  return createHash('sha256').update(`${row.valueDate}|${row.amount.toFixed(2)}|${row.label}|${row.externalRef}`).digest('hex');
}

/** Parseur OFX déterministe : blocs STMTTRN (DTPOSTED, TRNAMT, NAME/MEMO/FITID/CHECKNUM). */
export function parseOfx(text: string): ParsedStatementRow[] {
  const rows: ParsedStatementRow[] = [];
  const blocks = String(text || '').split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const get = (tag: string) => new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block)?.[1]?.trim() || '';
    const rawDate = get('DTPOSTED').slice(0, 8);
    if (!/^\d{8}$/.test(rawDate)) continue;
    const valueDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const amount = Number(get('TRNAMT').replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    const label = (get('NAME') || get('MEMO') || get('PAYEE') || '').slice(0, 500);
    const externalRef = (get('FITID') || get('CHECKNUM') || get('REFNUM') || '').slice(0, 200);
    rows.push({ valueDate, amount, label, externalRef });
  }
  return rows;
}

/** Champs reconnus d'un CSV de relevé (mapping par nom d'en-tête français/anglais courant). */
export const CSV_FIELD_ALIASES: Record<string, string[]> = {
  valueDate: ['date', 'date operation', 'date de valeur', 'date valeur', 'valide', 'date doperation', 'date d’operation', 'posted date', 'date'],
  amount: ['montant', 'montant euro', 'debit', 'credit', 'amount', 'valeur', 'solde'],
  label: ['libelle', 'libelle operation', 'designation', 'description', 'label', 'name', 'nature'],
  externalRef: ['reference', 'ref', 'id operation', 'fitid', 'numoperation', 'numero operation'],
};

export function normalizeHeader(h: string): string {
  return String(h || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

/** Détection automatique du mapping colonnes → champs (sauvegarde possible ensuite). */
export function detectColumnMapping(header: string[]): Record<string, number> | null {
  const norm = header.map(normalizeHeader);
  const mapping: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = norm.findIndex(h => h === alias);
      if (idx >= 0) { mapping[field] = idx; break; }
    }
  }
  if (mapping.valueDate === undefined || mapping.amount === undefined) return null;
  return mapping;
}

/** Parseur CSV déterministe (séparateur ; ou , ou tabulation détecté, guillemets gérés). */
export function parseCsvStatement(text: string, mapping: Record<string, number> | null): { rows: ParsedStatementRow[]; mapping: Record<string, number> | null; header: string[] } {
  const raw = String(text || '').replace(/\r/g, '');
  const sep = [';', '\t', ','].map(s => ({ s, n: (raw.split('\n')[0].match(new RegExp(`\\${s}`, 'g')) || []).length })).sort((a, b) => b.n - a.n)[0].s;
  const lines = raw.split('\n').filter(l => l.trim());
  if (!lines.length) return { rows: [], mapping, header: [] };
  const parseLine = (line: string): string[] => {
    const cells: string[] = []; let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (ch === sep && !quoted) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  };
  const header = parseLine(lines[0]);
  let m = mapping && mapping.valueDate !== undefined ? mapping : detectColumnMapping(header);
  const rows: ParsedStatementRow[] = [];
  if (m) {
    for (const line of lines.slice(1)) {
      const cells = parseLine(line);
      const rawDate = cells[m.valueDate] || '';
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate
        : /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(rawDate) ? `${RegExp.$3}-${RegExp.$2.padStart(2, '0')}-${RegExp.$1.padStart(2, '0')}`
        : '';
      if (!iso) continue;
      const rawAmount = String(cells[m.amount] || '').replace(/\s/g, '').replace(/[€$]/g, '').replace(',', '.');
      // Format bancaire courant : crédit et débit dans deux colonnes séparées → montant signé.
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      const label = (m.label !== undefined ? cells[m.label] : '') || '';
      const externalRef = (m.externalRef !== undefined ? cells[m.externalRef] : '') || '';
      rows.push({ valueDate: iso, amount, label: String(label).slice(0, 500), externalRef: String(externalRef).slice(0, 200) });
    }
  }
  return { rows, mapping: m, header };
}

export interface PaymentCandidate { id: string; amount: number; paidAt: string; invoiceNumber: string; clientName: string; reference: string }

/**
 * Suggestions de rapprochement : montant ±0,01 (exact d'abord), proximité de date (≤ 7 jours),
 * libellé contenant le numéro de facture (fort signal). JAMAIS d'application automatique :
 * la liste est proposée, l'utilisateur valide.
 */
export function suggestMatches(row: ParsedStatementRow, payments: PaymentCandidate[]): Array<{ payment: PaymentCandidate; score: number; reasons: string[] }> {
  const norm = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rowDate = new Date(`${row.valueDate}T00:00:00Z`).getTime();
  const scored = payments.map(p => {
    const reasons: string[] = []; let score = 0;
    if (Math.abs(p.amount - row.amount) <= 0.01) { score += 3; reasons.push('montant exact'); }
    else if (Math.abs(p.amount - row.amount) <= 0.05) { score += 1; reasons.push('montant proche'); }
    const days = Math.abs(new Date(`${p.paidAt.slice(0, 10)}T00:00:00Z`).getTime() - rowDate) / 86400000;
    if (days <= 2) { score += 2; reasons.push('date ≤ 2 jours'); }
    else if (days <= 7) { score += 1; reasons.push('date ≤ 7 jours'); }
    if (p.invoiceNumber && norm(row.label).includes(norm(p.invoiceNumber))) { score += 3; reasons.push('numéro de facture dans le libellé'); }
    return { payment: p, score, reasons };
  }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 5);
  return scored;
}
