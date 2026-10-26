/**
 * Mise en page des devis et factures destinés au CLIENT.
 * Trois moteurs natifs (un par format, chacun avec ses propres styles) alimentés par le même modèle.
 * Le client ne voit que : le type de prestation, les pièces (type + quantité) et le total TTC.
 * Les coûts d'achat, la marge, la TVA détaillée et les cotisations restent internes.
 */
import type PDFKit from 'pdfkit';
const pdfkit=async()=>(await import('pdfkit')).default as unknown as typeof PDFKit;
import AdmZip from 'adm-zip';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  ShadingType, ImageRun, Footer, HeightRule, TableLayoutType, VerticalAlign,
} from 'docx';

import type { Theme } from './theme.js';
export interface DocModel {
  theme: Theme;
  legal: string[];
  kind: 'quote' | 'invoice';
  title: string; number: string; date: string;
  company: { name: string; activity: string; siret: string; address?: string; postalCode?: string; city?: string; website?: string; logo: { data: Buffer; type: 'png' | 'jpg' } | null };
  client: { name: string; address: string };
  interventionLabel: string; intervention: string;
  itemsLabel: string; quantityLabel: string; items: { label: string; quantity: string }[];
  warranty: string; reminderLabel?: string; reminderPenalty?: string; mileage: { km: string; rate: string; total: string; visible?: boolean }; totalTtc: string; cgv: string;
}

// ---------------------------------------------------------------- utilitaires
export function formatEuro(n: unknown) {
  const v = Number(n || 0);
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${i!.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')},${d}\u00A0€`;
}
export function formatQty(n: unknown) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}
const totalLabel = (m: DocModel) => (m.kind === 'invoice' ? 'TOTAL TTC À RÉGLER' : 'TOTAL TTC');
const footerText = (m: DocModel) => [m.company.name, m.company.siret ? `SIRET ${m.company.siret}` : ''].filter(Boolean).join('  ·  ');
const signatureText = 'Bon pour accord — date et signature du client';

function imageSize(b: Buffer): { w: number; h: number } {
  try {
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    let o = 2;
    while (o < b.length - 9) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
      o += 2 + b.readUInt16BE(o + 2);
    }
  } catch { /* image illisible : dimensions par défaut */ }
  return { w: 1, h: 1 };
}
function fitSize(b: Buffer, maxW: number, maxH: number) {
  const { w, h } = imageSize(b);
  const k = Math.min(maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// ================================================================ PDF (pdfkit) — A4, structuré et aéré
export async function buildPdf(m: DocModel): Promise<Buffer> {
  const PDFDocument = await pdfkit();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `${m.title} ${m.number}`, Author: m.company.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 56, R = 539, W = R - L;
    const NAVY = m.theme.dark, ink = '#0f172a', muted = '#64748b', accent = m.theme.accent, line = '#e2e8f0', card = '#f8fafc';
    const FR = m.theme.font === 'serif' ? 'Times-Roman' : 'Helvetica', FB = m.theme.font === 'serif' ? 'Times-Bold' : 'Helvetica-Bold';
    const rk = m.theme.radius === 'square' ? 0 : 1;
    const rr = (x: number, y: number, w: number, h: number, r: number) => doc.roundedRect(x, y, w, h, r * rk);
    const footer = () => {
      const sx = doc.x, sy = doc.y, bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font(FR).fontSize(8).fillColor('#94a3b8').text(footerText(m), L, 806, { width: W, align: 'center', lineBreak: false });
      doc.page.margins.bottom = bottom; doc.x = sx; doc.y = sy;
    };
    footer(); doc.on('pageAdded', footer);
    const label = (t: string, x: number, y: number, w: number) => doc.font(FB).fontSize(7.5).fillColor(muted).text(t.toUpperCase(), x, y, { width: w, characterSpacing: 1.3 });
    const need = (y: number, h: number) => { if (y + h > 770) { doc.addPage(); return 56; } return y; };

    // 1 — en-tête : logo + entreprise (gauche) ; type de document, numéro, date (droite) ; filet d'accent
    let tx = L;
    if (m.company.logo) { try { doc.image(m.company.logo.data, L, 52, { fit: [60.2, 60.2] }); tx = L + 74; } catch { /* logo illisible */ } }
    doc.font(FB).fontSize(17).fillColor(ink).text(m.company.name || 'Entreprise', tx, 56, { width: 270 });
    doc.font(FR).fontSize(9.5).fillColor(muted);
    if (m.company.activity) doc.text(m.company.activity, tx, doc.y + 2, { width: 270 });
    if (m.company.siret) doc.text(`SIRET ${m.company.siret}`, tx, doc.y + 1, { width: 270 });
    const hEnd = Math.max(doc.y, 116);
    doc.font(FB).fontSize(14).fillColor(accent).text(m.reminderLabel || m.title, R - 250, 56, { width: 250, align: 'right' });
    doc.font(FB).fontSize(11).fillColor(ink).text(`N° ${m.number}`, R - 250, 78, { width: 250, align: 'right' });
    doc.font(FR).fontSize(9.5).fillColor(muted).text(`Émis le ${m.date}`, R - 250, 94, { width: 250, align: 'right' });
    doc.rect(L, hEnd + 14, W, 3).fill(accent);

    // 2 — cartes Émetteur / Client
    let y = hEnd + 44;
    const cw = (W - 16) / 2, ch = 92;
    for (const [i, c] of [['Émetteur', [m.company.name || '', m.company.activity, m.company.siret ? `SIRET ${m.company.siret}` : '']], ['Client', [m.client.name || '—', ...(m.client.address ? m.client.address.split(/\r?\n/) : [])]]] as [string, string[]][] ) {
      const x = L + (i === 'Émetteur' ? 0 : cw + 16);
      rr(x, y, cw, ch, 8).fillAndStroke(card, line);
      label(i, x + 16, y + 14, cw - 32);
      doc.font(FB).fontSize(12).fillColor(ink).text(c[0] || '—', x + 16, y + 30, { width: cw - 32, lineBreak: false, ellipsis: true });
      doc.font(FR).fontSize(9.5).fillColor(muted).text(c.slice(1).filter(Boolean).join('\n'), x + 16, y + 48, { width: cw - 32, height: 40, lineGap: 2, ellipsis: true });
    }
    y += ch + 34;

    // 3 — prestation
    y = need(y, 60);
    doc.rect(L, y, 3, 40).fill(accent);
    label(m.interventionLabel, L + 16, y + 2, W - 16);
    doc.font(FB).fontSize(16).fillColor(ink).text(m.intervention || '—', L + 16, y + 16, { width: W - 16 });
    y = Math.max(doc.y, y + 44) + 30;

    // 4 — tableau des pièces : N° · désignation · quantité
    if (m.items.length) {
      y = need(y, 90);
      rr(L, y, W, 30, 6).fill(NAVY);
      doc.font(FB).fontSize(7.5).fillColor('#cbd5e1');
      doc.text('N°', L + 16, y + 11, { width: 28, characterSpacing: 1.2 });
      doc.text(m.itemsLabel.toUpperCase(), L + 52, y + 11, { width: W - 150, characterSpacing: 1.2 });
      doc.text(m.quantityLabel.toUpperCase(), R - 76, y + 11, { width: 60, align: 'right', characterSpacing: 1.2 });
      y += 30;
      m.items.forEach((it, i) => {
        doc.font(FR).fontSize(11.5);
        const h = Math.max(42, doc.heightOfString(it.label, { width: W - 150 }) + 26);
        if (y + h > 762) { doc.addPage(); y = 56; }
        if (i % 2 === 0) doc.rect(L, y, W, h).fill('#f8fafc');
        doc.fillColor(muted).font(FB).fontSize(10).text(String(i + 1).padStart(2, '0'), L + 16, y + 14, { width: 28 });
        doc.fillColor(ink).font(FR).fontSize(11.5).text(it.label, L + 52, y + 14, { width: W - 150 });
        doc.font(FB).text(it.quantity, R - 76, y + 14, { width: 60, align: 'right' });
        doc.moveTo(L, y + h).lineTo(R, y + h).lineWidth(0.5).strokeColor(line).stroke();
        y += h;
      });
      y += 32;
    }

    // 5 — frais kilométriques (si renseignés) + garantie + total
    if (m.mileage.visible !== false && m.mileage.total !== '0,00 €' && m.mileage.total !== '0 €') {
      y = need(y, 48);
      rr(L, y, W, 44, 8).fillAndStroke(card, line);
      label('Frais kilométriques', L + 16, y + 8, W - 32);
      doc.font(FR).fontSize(10.5).fillColor(ink).text(`${m.mileage.km} km × ${m.mileage.rate}/km`, L + 16, y + 23, { width: W - 180 });
      doc.font(FB).fontSize(11).fillColor(ink).text(m.mileage.total, R - 140, y + 22, { width: 124, align: 'right' });
      y += 44 + 16;
    }

    y = need(y, 110);
    if (m.reminderPenalty) {
      rr(L, y, W, 44, 8).fillAndStroke(card, line);
      label('Majoration de retard', L + 16, y + 8, W - 32);
      doc.font(FB).fontSize(11).fillColor(ink).text(m.reminderPenalty, R - 170, y + 20, { width: 154, align: 'right' });
      y += 44 + 16;
    }
    if (m.warranty) {
      rr(L, y, 200, 88, 8).fillAndStroke(card, line);
      label('Garantie', L + 16, y + 14, 170);
      doc.font(FR).fontSize(10.5).fillColor(ink).text(m.warranty, L + 16, y + 30, { width: 170, height: 52, lineGap: 2, ellipsis: true });
    }
    rr(R - 258, y, 258, 88, 10).fill(NAVY);
    doc.font(FB).fontSize(8).fillColor('#93c5fd').text(totalLabel(m), R - 258 + 22, y + 20, { width: 214, characterSpacing: 1.3 });
    doc.font(FB).fontSize(28).fillColor('#ffffff').text(m.totalTtc, R - 258 + 22, y + 40, { width: 214 });
    y += 88 + 36;

    // 6 — signature (devis)
    if (m.kind === 'quote') {
      y = need(y, 110);
      label('Bon pour accord', L, y, 200);
      doc.font(FR).fontSize(9).fillColor(muted).text('Date, mention « bon pour accord » et signature du client', L, y + 13, { width: 300 });
      rr(L, y + 32, 280, 66, 8).lineWidth(0.7).strokeColor('#cbd5e1').stroke();
      y += 98 + 30;
    }

    // 7 — mentions légales puis conditions (discrètes)
    if (m.legal.length) {
      doc.font(FR).fontSize(7.5);
      const lt = m.legal.join('\n');
      const h = doc.heightOfString(lt, { width: W, lineGap: 1.5 }) + 24;
      y = need(y, h);
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(line).stroke();
      label('Mentions légales', L, y + 10, 200);
      doc.font(FR).fontSize(7.5).fillColor(muted).text(lt, L, y + 24, { width: W, lineGap: 1.5 });
      y = doc.y + 16;
    }
    if (m.cgv) {
      doc.font(FR).fontSize(7.5);
      const h = doc.heightOfString(m.cgv, { width: W, lineGap: 1.5 }) + 24;
      y = need(y, h);
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(line).stroke();
      label('Conditions', L, y + 10, 200);
      doc.font(FR).fontSize(7.5).fillColor(muted).text(m.cgv, L, y + 24, { width: W, lineGap: 1.5 });
    }
    doc.end();
  });
}

// ================================================================ DOCX (docx) — styles Word
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE } as const;
const hair = { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' } as const;
const boxed = { top: hair, bottom: hair, left: hair, right: hair } as const;

export async function buildDocx(m: DocModel): Promise<Buffer> {
  const ACC = m.theme.accent.slice(1).toUpperCase(), INK = '0F172A', MUTED = '64748B', NAVY = m.theme.dark.slice(1).toUpperCase();
  const DFONT = m.theme.font === 'serif' ? 'Georgia' : 'Calibri';
  const p = (text: string, o: { size?: number; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; spacing?: number } = {}) =>
    new Paragraph({ alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 0, line: 290 }, children: [new TextRun({ text, bold: o.bold, size: o.size ?? 22, color: o.color ?? INK, characterSpacing: o.spacing })] });
  const label = (t: string, color = MUTED) => p(t.toUpperCase(), { size: 15, bold: true, color, spacing: 24, after: 70 });
  const cell = (children: Paragraph[], w: number, o: { fill?: string; margins?: number; borders?: any; v?: 'top' | 'center' } = {}) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA }, borders: o.borders ?? noBorders,
      shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
      margins: { top: o.margins ?? 0, bottom: o.margins ?? 0, left: o.margins ?? 0, right: o.margins ?? 0 },
      verticalAlign: o.v === 'center' ? VerticalAlign.CENTER : VerticalAlign.TOP, children,
    });
  const table = (cols: number[], rows: TableRow[]) => new Table({ width: { size: cols.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: cols, layout: TableLayoutType.FIXED, borders: { ...noBorders, insideHorizontal: NONE, insideVertical: NONE }, rows });
  const spacer = (h: number) => new Paragraph({ spacing: { before: h, after: 0 }, children: [] });
  const CW = 9412;

  const kids: (Paragraph | Table)[] = [];
  // 1 — en-tête
  const left: Paragraph[] = [];
  if (m.company.logo) { const s = fitSize(m.company.logo.data, 81.6, 81.6); left.push(new Paragraph({ spacing: { after: 100 }, children: [new ImageRun({ type: m.company.logo.type, data: m.company.logo.data, transformation: { width: s.w, height: s.h } })] })); }
  left.push(p(m.company.name || 'Entreprise', { size: 32, bold: true }));
  if (m.company.activity) left.push(p(m.company.activity, { size: 19, color: MUTED, before: 30 }));
  if (m.company.siret) left.push(p(`SIRET ${m.company.siret}`, { size: 19, color: MUTED }));
  kids.push(table([5600, CW - 5600], [new TableRow({ cantSplit: true, children: [
    cell(left, 5600),
    cell([p(m.reminderLabel || m.title, { size: 28, bold: true, color: ACC, align: AlignmentType.RIGHT }), p(`N° ${m.number}`, { bold: true, align: AlignmentType.RIGHT, before: 100 }), p(`Émis le ${m.date}`, { size: 20, color: MUTED, align: AlignmentType.RIGHT, before: 30 })], CW - 5600),
  ] })]));
  kids.push(new Paragraph({ spacing: { before: 240, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: ACC, space: 1 } }, children: [] }));
  kids.push(spacer(420));

  // 2 — cartes Émetteur / Client
  const addr = m.client.address ? m.client.address.split(/\r?\n/) : [];
  kids.push(table([4600, 212, 4600], [new TableRow({ cantSplit: true, children: [
    cell([label('Émetteur'), p(m.company.name || '—', { size: 24, bold: true }), ...(m.company.activity ? [p(m.company.activity, { size: 20, color: MUTED, before: 30 })] : []), ...(m.company.siret ? [p(`SIRET ${m.company.siret}`, { size: 20, color: MUTED })] : [])], 4600, { fill: 'F8FAFC', margins: 220, borders: boxed }),
    cell([p('')], 212),
    cell([label('Client'), p(m.client.name || '—', { size: 24, bold: true }), ...addr.map(l => p(l, { size: 20, color: MUTED, before: 30 }))], 4600, { fill: 'F8FAFC', margins: 220, borders: boxed }),
  ] })]));
  kids.push(spacer(460));

  // 3 — prestation
  kids.push(table([90, CW - 90], [new TableRow({ cantSplit: true, children: [
    cell([p('')], 90, { fill: ACC }),
    cell([label(m.interventionLabel), p(m.intervention || '—', { size: 32, bold: true })], CW - 90, { margins: 0 }),
  ] })]));
  kids.push(spacer(460));

  // 4 — tableau des pièces
  if (m.items.length) {
    const cols = [800, 6612, 2000];
    const th = (t: string, w: number, right = false) => cell([p(t.toUpperCase(), { size: 15, bold: true, color: 'CBD5E1', spacing: 24, align: right ? AlignmentType.RIGHT : undefined })], w, { fill: NAVY, margins: 170, v: 'center' });
    const head = new TableRow({ height: { value: 520, rule: HeightRule.ATLEAST }, cantSplit: true, children: [th('N°', cols[0]!), th(m.itemsLabel, cols[1]!), th(m.quantityLabel, cols[2]!, true)] });
    const rows = m.items.map((it, i) => {
      const fill = i % 2 === 0 ? 'F8FAFC' : undefined, b = { ...noBorders, bottom: hair };
      return new TableRow({ height: { value: 700, rule: HeightRule.ATLEAST }, cantSplit: true, children: [
        cell([p(String(i + 1).padStart(2, '0'), { size: 20, bold: true, color: MUTED })], cols[0]!, { fill, margins: 170, v: 'center', borders: b }),
        cell([p(it.label, { size: 23 })], cols[1]!, { fill, margins: 170, v: 'center', borders: b }),
        cell([p(it.quantity, { size: 23, bold: true, align: AlignmentType.RIGHT })], cols[2]!, { fill, margins: 170, v: 'center', borders: b }),
      ] });
    });
    kids.push(table(cols, [head, ...rows]));
    kids.push(spacer(520));
  }

  // 5 — frais kilométriques + garantie + total
  if (m.mileage.visible !== false && m.mileage.total !== '0,00 €' && m.mileage.total !== '0 €') {
    kids.push(table([6500, CW - 6500], [new TableRow({ cantSplit: true, children: [
      cell([label('Frais kilométriques'), p(`${m.mileage.km} km × ${m.mileage.rate}/km`, { size: 21 })], 6500, { fill: 'F8FAFC', margins: 180, borders: boxed }),
      cell([p(m.mileage.total, { size: 24, bold: true, align: AlignmentType.RIGHT })], CW - 6500, { margins: 180, borders: boxed }),
    ] })]));
    kids.push(spacer(220));
  }
  kids.push(table([4000, 300, CW - 4300], [new TableRow({ cantSplit: true, children: [
    m.warranty ? cell([label('Garantie'), p(m.warranty, { size: 21 })], 4000, { fill: 'F8FAFC', margins: 220, borders: boxed }) : cell([p('')], 4000),
    cell([p('')], 300),
    cell([p(totalLabel(m), { size: 16, bold: true, color: '93C5FD', spacing: 24, after: 200 }), p(m.totalTtc, { size: 56, bold: true, color: 'FFFFFF', before: 60 })], CW - 4300, { fill: NAVY, margins: 320 }),
  ] })]));

  // 6 — signature (devis)
  if (m.kind === 'quote') {
    kids.push(spacer(560));
    kids.push(label('Bon pour accord'));
    kids.push(p('Date, mention « bon pour accord » et signature du client', { size: 18, color: MUTED, after: 100 }));
    kids.push(table([5200, CW - 5200], [new TableRow({ height: { value: 1300, rule: HeightRule.ATLEAST }, cantSplit: true, children: [cell([p('')], 5200, { borders: { top: hair, bottom: hair, left: hair, right: hair } }), cell([p('')], CW - 5200)] })]));
  }
  // 7 — mentions légales puis conditions
  if (m.legal.length) { kids.push(spacer(520)); kids.push(new Paragraph({ border: { top: hair }, spacing: { before: 120, after: 60 }, children: [] })); kids.push(label('Mentions légales')); for (const l of m.legal) kids.push(p(l, { size: 14, color: MUTED, after: 40 })); }
  if (m.cgv) { kids.push(spacer(560)); kids.push(new Paragraph({ border: { top: hair }, spacing: { before: 120, after: 60 }, children: [] })); kids.push(label('Conditions')); kids.push(p(m.cgv, { size: 14, color: MUTED })); }

  const doc = new Document({
    creator: m.company.name || 'Aurion', title: `${m.title} ${m.number}`,
    styles: { default: { document: { run: { font: DFONT, size: 22, color: INK } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1247, bottom: 1280, left: 1247 } } },
      footers: { default: new Footer({ children: [p(footerText(m), { size: 16, color: '94A3B8', align: AlignmentType.CENTER })] }) },
      children: kids,
    }],
  });
  return Packer.toBuffer(doc);
}

// ================================================================ ODT (OpenDocument) — styles ODF
const x = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';

export function buildOdt(m: DocModel): Buffer {
  const FN = m.theme.font === 'serif' ? 'Georgia' : 'Arial';
  const FONT = `style:font-name="${FN}"`;
  const para = (name: string, pp: string, tp: string) => `<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties ${pp}/><style:text-properties ${FONT} ${tp}/></style:style>`;
  const col = (n: string, w: number) => `<style:style style:name="Col${n}" style:family="table-column"><style:table-column-properties style:column-width="${w}cm"/></style:style>`;
  const cellStyle = (n: string, props: string) => `<style:style style:name="${n}" style:family="table-cell"><style:table-cell-properties ${props}/></style:style>`;
  const styles = [
    para('Pcompany', 'fo:margin-bottom="0.05cm"', 'fo:font-size="16pt" fo:font-weight="bold"'),
    para('Pmeta', 'fo:margin-top="0.03cm"', 'fo:font-size="9.5pt" fo:color="#64748b"'),
    para('Ptitle', 'fo:text-align="end"', 'fo:font-size="14pt" fo:font-weight="bold" fo:color="#0b63cd"'),
    para('Pnum', 'fo:text-align="end" fo:margin-top="0.18cm"', 'fo:font-size="11pt" fo:font-weight="bold"'),
    para('Pdate', 'fo:text-align="end" fo:margin-top="0.05cm"', 'fo:font-size="9.5pt" fo:color="#64748b"'),
    para('Plabel', 'fo:margin-bottom="0.1cm"', 'fo:font-size="7.5pt" fo:font-weight="bold" fo:color="#64748b" fo:letter-spacing="0.04cm" fo:text-transform="uppercase"'),
    para('Pname', 'fo:margin-bottom="0.04cm"', 'fo:font-size="12pt" fo:font-weight="bold"'),
    para('Pbody', 'fo:margin-top="0.03cm"', 'fo:font-size="9.5pt" fo:color="#64748b"'),
    para('Pwarr', 'fo:margin-top="0.03cm"', 'fo:font-size="10.5pt"'),
    para('Pprest', 'fo:margin-top="0cm"', 'fo:font-size="16pt" fo:font-weight="bold"'),
    para('Pitem', 'fo:margin-top="0cm"', 'fo:font-size="11.5pt"'),
    para('Pnumr', 'fo:margin-top="0cm"', 'fo:font-size="10pt" fo:font-weight="bold" fo:color="#64748b"'),
    para('Pqty', 'fo:text-align="end"', 'fo:font-size="11.5pt" fo:font-weight="bold"'),
    para('Phead', 'fo:margin-top="0cm"', 'fo:font-size="7.5pt" fo:font-weight="bold" fo:color="#cbd5e1" fo:letter-spacing="0.04cm"'),
    para('Pheadr', 'fo:text-align="end"', 'fo:font-size="7.5pt" fo:font-weight="bold" fo:color="#cbd5e1" fo:letter-spacing="0.04cm"'),
    para('Ptotlabel', 'fo:margin-bottom="0.15cm"', 'fo:font-size="8pt" fo:font-weight="bold" fo:color="#93c5fd" fo:letter-spacing="0.04cm"'),
    para('Ptotal', 'fo:margin-top="0cm"', 'fo:font-size="26pt" fo:font-weight="bold" fo:color="#ffffff"'),
    para('Psmall', 'fo:margin-top="0cm"', 'fo:font-size="7.5pt" fo:color="#64748b"'),
    para('Pspace', 'fo:margin-top="0.7cm" fo:margin-bottom="0cm"', 'fo:font-size="4pt"'),
    '<style:style style:name="Pbar" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.45cm" fo:margin-bottom="0.5cm" fo:border-bottom="2.5pt solid #0b63cd"/><style:text-properties fo:font-size="2pt"/></style:style>',
    '<style:style style:name="Tfull" style:family="table"><style:table-properties style:width="16.6cm" table:align="left"/></style:style>',
    ...[['H1', 9.6], ['H2', 7], ['C1', 8.1], ['C2', 0.4], ['C3', 8.1], ['B1', 0.25], ['B2', 16.35], ['N1', 1.6], ['N2', 11.8], ['N3', 3.2], ['W1', 7.4], ['W2', 0.5], ['W3', 8.7], ['S1', 9.2], ['S2', 7.4]].map(([n, w]) => col(String(n), Number(w))),
    cellStyle('Cplain', 'fo:padding="0cm" fo:border="none"'),
    cellStyle('Ccard', 'fo:background-color="#f8fafc" fo:padding="0.45cm" fo:border="0.5pt solid #e2e8f0"'),
    cellStyle('Cbar', 'fo:background-color="#0b63cd" fo:padding="0cm" fo:border="none"'),
    cellStyle('Chead', 'fo:background-color="#0b1220" fo:padding-top="0.3cm" fo:padding-bottom="0.3cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border="none"'),
    cellStyle('Crow', 'fo:padding-top="0.4cm" fo:padding-bottom="0.4cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="0.5pt solid #e2e8f0"'),
    cellStyle('Crowz', 'fo:background-color="#f8fafc" fo:padding-top="0.4cm" fo:padding-bottom="0.4cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="0.5pt solid #e2e8f0"'),
    cellStyle('Cnavy', 'fo:background-color="#0b1220" fo:padding="0.55cm" fo:border="none"'),
    cellStyle('Csign', 'fo:padding="0.3cm" fo:border="0.7pt solid #cbd5e1"'),
  ].join('');

  const logo = m.company.logo, ext = logo?.type === 'jpg' ? 'jpg' : 'png';
  const ls = logo ? fitSize(logo.data, 78, 78) : null;
  const logoXml = logo && ls ? `<text:p text:style-name="Pmeta"><draw:frame draw:name="Logo" text:anchor-type="as-char" svg:width="${(ls.w * 0.0265 * 1.02).toFixed(2)}cm" svg:height="${(ls.h * 0.0265 * 1.02).toFixed(2)}cm"><draw:image xlink:href="Pictures/logo.${ext}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>` : '';
  const P = (s: string, t: string) => `<text:p text:style-name="${s}">${x(t)}</text:p>`;
  const cell = (style: string, inner: string) => `<table:table-cell table:style-name="${style}" office:value-type="string">${inner}</table:table-cell>`;
  const tbl = (name: string, cols: string[], rows: string) => `<table:table table:name="${name}" table:style-name="Tfull">${cols.map(c => `<table:table-column table:style-name="Col${c}"/>`).join('')}${rows}</table:table>`;
  const tr = (cells: string) => `<table:table-row>${cells}</table:table-row>`;
  const addr = (m.client.address ? m.client.address.split(/\r?\n/) : []).map(l => P('Pbody', l)).join('');

  let body = tbl('Entete', ['H1', 'H2'], tr(cell('Cplain', logoXml + P('Pcompany', m.company.name || 'Entreprise') + (m.company.activity ? P('Pmeta', m.company.activity) : '') + (m.company.siret ? P('Pmeta', `SIRET ${m.company.siret}`) : '')) + cell('Cplain', P('Ptitle', m.reminderLabel || m.title) + P('Pnum', `N° ${m.number}`) + P('Pdate', `Émis le ${m.date}`))));
  body += '<text:p text:style-name="Pbar"/>';
  body += tbl('Cartes', ['C1', 'C2', 'C3'], tr(cell('Ccard', P('Plabel', 'Émetteur') + P('Pname', m.company.name || '—') + (m.company.activity ? P('Pbody', m.company.activity) : '') + (m.company.siret ? P('Pbody', `SIRET ${m.company.siret}`) : '')) + cell('Cplain', P('Pbody', '')) + cell('Ccard', P('Plabel', 'Client') + P('Pname', m.client.name || '—') + addr)));
  body += P('Pspace', '');
  body += tbl('Prestation', ['B1', 'B2'], tr(cell('Cbar', P('Pbody', '')) + cell('Cplain', `<text:p text:style-name="Plabel">${x(m.interventionLabel)}</text:p>${P('Pprest', m.intervention || '—')}`.replace('<text:p text:style-name="Plabel">', '<text:p text:style-name="Plabel">'))));
  body += P('Pspace', '');
  if (m.items.length) {
    body += tbl('Pieces', ['N1', 'N2', 'N3'], tr(cell('Chead', P('Phead', 'N°')) + cell('Chead', P('Phead', m.itemsLabel.toUpperCase())) + cell('Chead', P('Pheadr', m.quantityLabel.toUpperCase()))) +
      m.items.map((it, i) => { const st = i % 2 === 0 ? 'Crowz' : 'Crow'; return tr(cell(st, P('Pnumr', String(i + 1).padStart(2, '0'))) + cell(st, P('Pitem', it.label)) + cell(st, P('Pqty', it.quantity))); }).join(''));
    body += P('Pspace', '');
  }
  if (m.mileage.visible !== false && m.mileage.total !== '0,00 €' && m.mileage.total !== '0 €') body += tbl('Kilometrage', ['S1', 'S2'], tr(cell('Ccard', P('Plabel', 'Frais kilométriques') + P('Pwarr', `${m.mileage.km} km × ${m.mileage.rate}/km`)) + cell('Ccard', P('Pqty', m.mileage.total))));
  body += P('Pspace', '');
  if(m.reminderPenalty) body += tbl('Majoration', ['S1','S2'], tr(cell('Ccard', P('Plabel','Majoration de retard')) + cell('Ccard', P('Pqty',m.reminderPenalty))));
  body += tbl('Total', ['W1', 'W2', 'W3'], tr(cell('Cplain', m.warranty ? `<text:p text:style-name="Plabel">Garantie</text:p>${P('Pwarr', m.warranty)}` : P('Pbody', '')) + cell('Cplain', P('Pbody', '')) + cell('Cnavy', P('Ptotlabel', totalLabel(m)) + P('Ptotal', m.totalTtc))));
  if (m.kind === 'quote') {
    body += P('Pspace', '') + P('Plabel', 'Bon pour accord') + P('Psmall', 'Date, mention « bon pour accord » et signature du client');
    body += P('Pspace', '') + tbl('Signature', ['S1', 'S2'], tr(cell('Csign', P('Pbody', '\u00A0') + P('Pbody', '\u00A0') + P('Pbody', '\u00A0') + P('Pbody', '\u00A0')) + cell('Cplain', P('Pbody', ''))));
  }
  if (m.legal.length) body += P('Pspace', '') + P('Plabel', 'Mentions légales') + m.legal.map(l => P('Psmall', l)).join('');
  if (m.cgv) body += P('Pspace', '') + P('Plabel', 'Conditions') + P('Psmall', m.cgv);

  const themed = styles.replaceAll('#0b63cd', m.theme.accent).replaceAll('#0b1220', m.theme.dark);
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.2"><office:automatic-styles>${themed}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.2"><office:font-face-decls><style:font-face style:name="${FN}" svg:font-family="${FN}" style:font-family-generic="${m.theme.font === 'serif' ? 'roman' : 'swiss'}"/></office:font-face-decls><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="135%"/><style:text-properties ${FONT} fo:font-size="10.5pt" fo:color="#0f172a" fo:language="fr" fo:country="FR"/></style:default-style><style:style style:name="Standard" style:family="paragraph" style:class="text"/><style:style style:name="Footer" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties ${FONT} fo:font-size="8pt" fo:color="#94a3b8"/></style:style></office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="1.9cm" fo:margin-left="2.2cm" fo:margin-right="2.2cm"/><style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.4cm"/></style:footer-style></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"><style:footer><text:p text:style-name="Footer">${x(footerText(m))}</text:p></style:footer></style:master-page></office:master-styles></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} office:version="1.2"><office:meta><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${x(`${m.title} ${m.number}`)}</dc:title></office:meta></office:document-meta>`;
  const pic = logo ? `<manifest:file-entry manifest:full-path="Pictures/logo.${ext}" manifest:media-type="image/${ext === 'jpg' ? 'jpeg' : 'png'}"/>` : '';
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${pic}</manifest:manifest>`;
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/vnd.oasis.opendocument.text'));
  zip.getEntry('mimetype')!.header.method = 0;
  zip.addFile('content.xml', Buffer.from(content, 'utf8'));
  zip.addFile('styles.xml', Buffer.from(stylesXml, 'utf8'));
  zip.addFile('meta.xml', Buffer.from(meta, 'utf8'));
  if (logo) zip.addFile(`Pictures/logo.${ext}`, logo.data);
  zip.addFile('META-INF/manifest.xml', Buffer.from(manifest, 'utf8'));
  return zip.toBuffer();
}

/** Modèle de départ : mêmes styles, mais chaque valeur est un champ {{...}} à remplacer par Aurion. */
export function starterModel(kind: 'quote' | 'invoice'): DocModel {
  return {
    kind, title: '{{DOCUMENT_TITLE}}', number: '{{DOCUMENT_NUMBER}}', date: '{{DATE}}',
    company: { name: '{{COMPANY_NAME}}', activity: '{{COMPANY_ACTIVITY}}', siret: '{{SIRET}}', address: '{{COMPANY_ADDRESS}}', postalCode: '{{COMPANY_POSTAL_CODE}}', city: '{{COMPANY_CITY}}', website: '{{COMPANY_WEBSITE}}', logo: null },
    client: { name: '{{CLIENT_NAME}}', address: '{{CLIENT_ADDRESS}}' },
    interventionLabel: 'Prestation', intervention: '{{INTERVENTION}}',
    itemsLabel: 'Désignation', quantityLabel: 'Qté', items: [{ label: '{{ITEMS}}', quantity: '' }],
    warranty: '{{WARRANTY}}', reminderLabel: '{{DOCUMENT_TITLE}}', reminderPenalty: '{{LATE_PENALTY}}', mileage: { km: '{{MILEAGE_KM}}', rate: '{{MILEAGE_RATE}}', total: '{{MILEAGE_TOTAL}}', visible: true }, totalTtc: '{{TOTAL_TTC}}', cgv: '{{CGV}}',
    legal: ['{{LEGAL_NOTES}}'], theme: { accent: '#0b63ce', dark: '#0b1220', font: 'sans', radius: 'round', customized: false },
  };
}
