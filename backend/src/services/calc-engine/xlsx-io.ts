import AdmZip from 'adm-zip';
/**
 * E/S du classeur moteur — manipulation XML directe (adm-zip, déjà dépendance du projet).
 * Pourquoi du XML plutôt qu'une bibliothèque de réécriture xlsx : la copie de calcul doit
 * CONSERVER INTACTES les formules, plages nommées et styles du modèle — seules les cellules
 * d'entrée changent. Les valeurs sont écrites en nombres/inlineStr (jamais en formules) :
 * une saisie utilisateur ne peut pas injecter de formule dans le classeur.
 */

const COL_RE = /^([A-Z]+)(\d+)$/;
export type CellValue = number | string;

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function colLetters(index: number): string {
  let s = '';
  let n = index;
  while (n > 0) {
    const rest = (n - 1) % 26;
    s = String.fromCharCode(65 + rest) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function parseAddr(addr: string): { col: number; row: number } {
  const m = COL_RE.exec(addr.trim().toUpperCase());
  if (!m) throw new Error(`Adresse de cellule invalide : ${addr}`);
  return { col: colIndex(m[1]), row: Number(m[2]) };
}
const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function worksheetPath(zip: AdmZip, sheetName: string): string {
  const workbook = zip.readAsText('xl/workbook.xml');
  const sheetMatch = new RegExp(`<sheet[^>]*name="${escapeRe(sheetName)}"[^>]*r:id="(rId\\d+)"`).exec(workbook)
    ?? new RegExp(`<sheet[^>]*r:id="(rId\\d+)"[^>]*name="${escapeRe(sheetName)}"`).exec(workbook);
  if (!sheetMatch) throw new Error(`Feuille introuvable dans le classeur : ${sheetName}`);
  const rels = zip.readAsText('xl/_rels/workbook.xml.rels');
  const relMatch = new RegExp(`<Relationship[^>]*Id="${escapeRe(sheetMatch[1])}"[^>]*Target="([^"]+)"`).exec(rels)
    ?? new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${escapeRe(sheetMatch[1])}"`).exec(rels);
  if (!relMatch) throw new Error(`Relation introuvable pour la feuille ${sheetName}`);
  const target = relMatch[1].replace(/^\//, '').replace(/^worksheets\//, 'worksheets/');
  return target.startsWith('xl/') ? target : `xl/${target}`;
}
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildCell(addr: string, value: CellValue): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valeur non finie pour ${addr}`);
    return `<c r="${addr}"><v>${JSON.stringify(value)}</v></c>`;
  }
  return `<c r="${addr}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

/** Écrit (ou remplace) des cellules dans une feuille, en conservant l'ordre des lignes/colonnes. */
export function writeCells(zip: AdmZip, sheetName: string, values: Record<string, CellValue>): void {
  const path = worksheetPath(zip, sheetName);
  let xml = zip.readAsText(path);
  for (const [addr, value] of Object.entries(values)) {
    const { col, row } = parseAddr(addr);
    const cellXml = buildCell(addr, value);
    const cellRe = new RegExp(`<c r="${escapeRe(addr)}"(?:[^>/]*)?(?:/>|>(?:(?!<c r=).)*?</c>)`, 's');
    if (cellRe.test(xml)) {
      xml = xml.replace(cellRe, cellXml);
      continue;
    }
    // Cellule absente : insertion triée dans la ligne (créée si nécessaire).
    const rowRe = new RegExp(`(<row r="${row}"[^>]*>)(.*?)(</row>)`, 's');
    const rowMatch = rowRe.exec(xml);
    if (rowMatch) {
      const inner = rowMatch[2];
      const cells = [...inner.matchAll(/<c r="([A-Z]+)(\d+)"/g)];
      let insertAt = inner.length;
      for (const m of cells) {
        if (colIndex(m[1]) > col) { insertAt = m.index; break; }
      }
      xml = xml.replace(rowRe, `${rowMatch[1]}${inner.slice(0, insertAt)}${cellXml}${inner.slice(insertAt)}${rowMatch[3]}`);
    } else {
      const newRow = `<row r="${row}">${cellXml}</row>`;
      // Insertion avant </sheetData> en respectant l'ordre des lignes.
      const sheetDataEnd = xml.lastIndexOf('</sheetData>');
      const before = xml.slice(0, sheetDataEnd);
      const rows = [...before.matchAll(/<row r="(\d+)"/g)];
      let insertPos = sheetDataEnd;
      for (const m of rows) {
        if (Number(m[1]) > row) { insertPos = m.index; break; }
      }
      xml = `${xml.slice(0, insertPos)}${newRow}${xml.slice(insertPos)}`;
    }
  }
  zip.updateFile(path, Buffer.from(xml, 'utf8'));
}

function sharedStrings(zip: AdmZip): string[] {
  const entry = zip.getEntry('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = entry.getData().toString('utf8');
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>(.*?)<\/si>/gs)) {
    const texts = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]);
    out.push(texts.join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'));
  }
  return out;
}

/** Lit les valeurs (résultats de formules après recalcul) d'une feuille. */
export function readCells(zip: AdmZip, sheetName: string, addrs: string[]): Record<string, number | string> {
  const path = worksheetPath(zip, sheetName);
  const xml = zip.readAsText(path);
  const strings = sharedStrings(zip);
  const out: Record<string, number | string> = {};
  for (const addr of addrs) {
    const cellRe = new RegExp(`<c r="${escapeRe(addr)}"[^>]*?(?:/>|>(?:(?!<c r=).)*?</c>)`, 's');
    const m = cellRe.exec(xml);
    if (!m) continue;
    const raw = m[0];
    const vMatch = /<v(?:[^>]*?)(?:\/>|>(.*?)<\/v>)/s.exec(raw);
    if (!vMatch) {
      const isMatch = /<is><t[^>]*>(.*?)<\/t><\/is>/s.exec(raw);
      if (isMatch) out[addr] = decodeXml(isMatch[1]);
      continue;
    }
    const body = vMatch[1] ?? '';
    const typeMatch = /t="([a-z]+)"/.exec(raw);
    const type = typeMatch?.[1] ?? 'n';
    if (type === 's') out[addr] = strings[Number(body)] ?? '';
    else if (type === 'inlineStr') out[addr] = decodeXml(/<t[^>]*>(.*?)<\/t>/s.exec(raw)?.[1] ?? '');
    else if (type === 'str') out[addr] = decodeXml(body);
    else if (type === 'b') out[addr] = body === '1' ? 1 : 0;
    else if (body === '') continue;
    else {
      const n = Number(body);
      if (!Number.isFinite(n)) continue;
      out[addr] = n;
    }
  }
  return out;
}
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
