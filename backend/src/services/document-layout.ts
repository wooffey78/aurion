/**
 * Mise en page des devis et factures destinés au CLIENT.
 * Trois moteurs natifs (un par format, chacun avec ses propres styles) alimentés par le même modèle.
 * 15.4.54 — les trois modèles natifs (Minimal, Classique, Signature) ont de VRAIES différences de
 * mise en page (structure, couleurs, typographie, encarts), pas seulement une teinte : voir les
 * branches `variant` dans buildPdf / buildDocx / buildOdt.
 * Le client ne voit que : le type de prestation, les pièces (type + quantité) et le total TTC.
 * Les coûts d'achat, la marge, la TVA détaillée et les cotisations restent internes.
 */
import type PDFKit from 'pdfkit';
const pdfkit=async()=>(await import('pdfkit')).default as unknown as typeof PDFKit;
import AdmZip from 'adm-zip';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle,
  ShadingType, Footer, HeightRule, TableLayoutType, VerticalAlign, ImageRun,
} from 'docx';

export type TemplateVariant = 'minimal' | 'classic' | 'signature';
type Theme = { accent: string; dark: string; font: 'sans' | 'serif'; radius: 'round' | 'square'; variant: TemplateVariant; customized: boolean };
export interface DocModel {
  theme: Theme;
  legal: string[];
  kind: 'quote' | 'invoice';
  title: string; number: string; date: string;
  company: { name: string; activity: string; siret: string; address?: string; postalCode?: string; city?: string; website?: string };
  client: { name: string; address: string; interventionAddress?: string };
  interventionLabel: string; intervention: string;
  device?: { serialNumber?: string; imei?: string };
  itemsLabel: string; quantityLabel: string; items: { label: string; quantity: string }[];
  warranty: string; reminderLabel?: string; reminderPenalty?: string; mileage: { km: string; rate: string; total: string; visible?: boolean }; totalTtc: string; cgv: string;
  /** Logo de l'entreprise téléversé par l'utilisateur : unique identité émettrice affichée sur les documents. */
  logo?: { data: Buffer; mime: string };
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
// Pied de page : nom commercial uniquement (l'identité légale de l'émetteur ne figure pas sur les documents).
const footerText = (m: DocModel) => m.company.name || 'Aurion';
/** Logo exploitable par les moteurs PDF/DOCX/ODT : PNG ou JPEG uniquement (le WebP est refusé au téléversement avec message depuis le correctif 078). */
const rasterLogo = (m: DocModel) => m.logo && (m.logo.mime === 'image/png' || m.logo.mime === 'image/jpeg') ? m.logo : null;
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
// 15.4.54 — trois variantes réellement distinctes :
//  · minimal    : monochrome encre, aucun encart ni fond coloré, filets fins, total aligné à droite ;
//  · classic    : cartes claires, en-tête de tableau navy, total dans un bloc navy (design historique) ;
//  · signature  : serif, bandeau d’en-tête foncé chaleureux, encarts crème bordés bronze, total sur fond accent.
export async function buildPdf(m: DocModel): Promise<Buffer> {
  const PDFDocument = await pdfkit();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `${m.title} ${m.number}`, Author: m.company.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 56, R = 539, W = R - L;
    const V = m.theme.variant || 'classic';
    const NAVY = m.theme.dark, ink = '#0f172a', muted = '#64748b', accent = m.theme.accent, line = '#e2e8f0';
    const CARD = V === 'signature' ? '#faf5ec' : '#f8fafc';                 // fond des encarts (variante)
    const CARDLINE = V === 'signature' ? '#e3d3b3' : line;                  // bordure des encarts
    const ROWFILL = V === 'minimal' ? null : V === 'signature' ? '#faf5ec' : '#f8fafc';
    const HEADTEXT = V === 'signature' ? '#e8c987' : '#cbd5e1';             // texte d’en-tête du tableau
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

    // 1 — en-tête : trois compositions distinctes.
    // · minimal : nom commercial en petites capitales grises, titre à droite à l’encre, simple filet fin ;
    // · classic : logo/nom à gauche, titre accentué à droite, barre accent sous l’en-tête ;
    // · signature : bandeau foncé pleine largeur (nom en blanc à gauche, titre doré à droite), logo au-dessus le cas échéant.
    const logo = rasterLogo(m);
    if (V === 'signature') {
      let bandTop = 56;
      if (logo) {
        const fit = fitSize(logo.data, 150, 40);
        doc.image(logo.data, L, 56, { fit: [fit.w, fit.h] });
        bandTop = 56 + fit.h + 12;
      }
      const bandH = 64;
      rr(L, bandTop, W, bandH, 10).fill(NAVY);
      if (!logo) {
        doc.font(FB).fontSize(16).fillColor('#ffffff').text(m.company.name || 'Entreprise', L + 20, bandTop + 12, { width: W - 300, lineBreak: false, ellipsis: true });
        doc.font(FR).fontSize(8).fillColor('#d8c39a').text(effectiveCompanyActivity(m), L + 20, bandTop + 34, { width: W - 300, lineBreak: false, ellipsis: true });
      } else {
        doc.font(FB).fontSize(15).fillColor('#ffffff').text(m.company.name || 'Entreprise', L + 20, bandTop + 10, { width: W - 300, lineBreak: false, ellipsis: true });
      }
      doc.font(FB).fontSize(14).fillColor(accent).text(m.reminderLabel || m.title, R - 250, bandTop + 12, { width: 230, align: 'right' });
      doc.font(FB).fontSize(10).fillColor('#ffffff').text(`N° ${m.number}`, R - 250, bandTop + 32, { width: 230, align: 'right' });
      doc.font(FR).fontSize(8.5).fillColor('#d8c39a').text(`Émis le ${m.date}`, R - 250, bandTop + 46, { width: 230, align: 'right' });
      var hEnd = bandTop + bandH + 12;
      doc.rect(L, hEnd, W, 1).fill(CARDLINE);
      var y = hEnd + 24;
    } else {
      const LEFT_W = W - 270;
      let leftY = 56;
      if (logo) {
        const fit = fitSize(logo.data, 150, 46);
        doc.image(logo.data, L, 56, { fit: [fit.w, fit.h] });
        leftY = 56 + fit.h + 14;
      }
      if (V === 'minimal') {
        doc.font(FB).fontSize(logo ? 13 : 15).fillColor(ink).text((m.company.name || 'Entreprise').toUpperCase(), L, leftY, { width: LEFT_W, characterSpacing: 2, lineBreak: false, ellipsis: true });
        doc.font(FB).fontSize(13).fillColor(ink).text(m.reminderLabel || m.title, R - 250, 58, { width: 250, align: 'right' });
        doc.font(FR).fontSize(9.5).fillColor(muted).text(`N° ${m.number} · émis le ${m.date}`, R - 250, 78, { width: 250, align: 'right' });
        var hEnd = Math.max(doc.y, 100);
        doc.rect(L, hEnd + 14, W, 0.75).fillColor('#94a3b8').stroke();
        var y = hEnd + 40;
      } else {
        doc.font(FB).fontSize(logo ? 15 : 17).fillColor(ink).text(m.company.name || 'Entreprise', L, leftY, { width: LEFT_W });
        var hEnd = Math.max(doc.y, 112);
        doc.font(FB).fontSize(14).fillColor(accent).text(m.reminderLabel || m.title, R - 250, 56, { width: 250, align: 'right' });
        doc.font(FB).fontSize(11).fillColor(ink).text(`N° ${m.number}`, R - 250, 78, { width: 250, align: 'right' });
        doc.font(FR).fontSize(9.5).fillColor(muted).text(`Émis le ${m.date}`, R - 250, 94, { width: 250, align: 'right' });
        doc.rect(L, hEnd + 14, W, 3).fill(accent);
        var y = hEnd + 44;
      }
    }

    // 2 — carte Client : classic = carte claire pleine largeur · signature = encart crème bordé ·
    // minimal = libellé + contenu à l’encre, sans encart.
    const clientLines = [m.client.name || '—', ...(m.client.address ? ['Facturation :', ...m.client.address.split(/\r?\n/)] : []), ...(m.client.interventionAddress ? [`Adresse d’intervention :`, ...m.client.interventionAddress.split(/\r?\n/)] : [])];
    if (V === 'minimal') {
      y = need(y, 60);
      label('Client', L, y, W);
      doc.font(FB).fontSize(12).fillColor(ink).text(String(clientLines[0] || '—'), L, y + 14, { width: W, lineBreak: false, ellipsis: true });
      doc.font(FR).fontSize(9.5).fillColor(muted).text(clientLines.slice(1).join('\n'), L, y + 32, { width: W, lineGap: 2 });
      y = Math.max(doc.y, y + 44);
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(line).stroke();
      y += 22;
    } else {
      const ch = Math.max(74, 52 + clientLines.length * 13);
      y = need(y, ch + 8);
      rr(L, y, W, ch, 8).fillAndStroke(CARD, CARDLINE);
      label('Client', L + 16, y + 14, W - 32);
      doc.font(FB).fontSize(12).fillColor(ink).text(String(clientLines[0] || '—'), L + 16, y + 30, { width: W - 32, lineBreak: false, ellipsis: true });
      doc.font(FR).fontSize(9.5).fillColor(muted).text(clientLines.slice(1).join('\n'), L + 16, y + 48, { width: W - 32, height: ch - 52, lineGap: 2 });
      y += ch + 26;
    }

    // 3 — prestation : minimal sans barre, classic barre accent, signature barre bronze + serif.
    y = need(y, 60);
    if (V !== 'minimal') doc.rect(L, y, 3, 40).fill(accent);
    label(m.interventionLabel, L + (V === 'minimal' ? 0 : 16), y + 2, W - 16);
    doc.font(FB).fontSize(V === 'minimal' ? 14 : 16).fillColor(ink).text(m.intervention || '—', L + (V === 'minimal' ? 0 : 16), y + 16, { width: W - (V === 'minimal' ? 0 : 16) });
    y = Math.max(doc.y, y + 44) + 30;
    const deviceLines = [
      m.device?.serialNumber ? `N° de série : ${m.device.serialNumber}` : '',
      m.device?.imei ? `IMEI : ${m.device.imei}` : '',
    ].filter(Boolean);
    if (deviceLines.length) {
      y = need(y, 42);
      label('Identification de l’appareil', L, y, W);
      doc.font(FR).fontSize(10.5).fillColor(ink).text(deviceLines.join(' · '), L, y + 14, { width: W });
      y = Math.max(doc.y, y + 34) + 18;
    }

    // 4 — tableau des pièces : N° · désignation · quantité.
    // minimal : filets horizontaux uniquement, en-tête à l’encre sans fond ; signature : en-tête
    // brun doré, lignes zébrées crème ; classic : en-tête navy, zébrage gris clair.
    if (m.items.length) {
      y = need(y, 90);
      if (V === 'minimal') {
        doc.rect(L, y, W, 0.75).fillColor('#94a3b8').stroke();
        doc.font(FB).fontSize(7.5).fillColor(muted);
        doc.text('N°', L + 16, y + 9, { width: 28, characterSpacing: 1.2 });
        doc.text(m.itemsLabel.toUpperCase(), L + 52, y + 9, { width: W - 150, characterSpacing: 1.2 });
        doc.text(m.quantityLabel.toUpperCase(), R - 76, y + 9, { width: 60, align: 'right', characterSpacing: 1.2 });
        y += 22;
      } else {
        rr(L, y, W, 30, 6).fill(NAVY);
        doc.font(FB).fontSize(7.5).fillColor(HEADTEXT);
        doc.text('N°', L + 16, y + 11, { width: 28, characterSpacing: 1.2 });
        doc.text(m.itemsLabel.toUpperCase(), L + 52, y + 11, { width: W - 150, characterSpacing: 1.2 });
        doc.text(m.quantityLabel.toUpperCase(), R - 76, y + 11, { width: 60, align: 'right', characterSpacing: 1.2 });
        y += 30;
      }
      m.items.forEach((it, i) => {
        doc.font(FR).fontSize(11.5);
        const h = Math.max(42, doc.heightOfString(it.label, { width: W - 150 }) + 26);
        if (y + h > 762) { doc.addPage(); y = 56; }
        if (ROWFILL && i % 2 === 0) doc.rect(L, y, W, h).fill(ROWFILL);
        doc.fillColor(muted).font(FB).fontSize(10).text(String(i + 1).padStart(2, '0'), L + 16, y + 14, { width: 28 });
        doc.fillColor(ink).font(FR).fontSize(11.5).text(it.label, L + 52, y + 14, { width: W - 150 });
        doc.font(FB).text(it.quantity, R - 76, y + 14, { width: 60, align: 'right' });
        doc.moveTo(L, y + h).lineTo(R, y + h).lineWidth(0.5).strokeColor(line).stroke();
        y += h;
      });
      if (V === 'minimal') { doc.rect(L, y, W, 0.75).fillColor('#94a3b8').stroke(); }
      y += 32;
    }

    // 5 — frais kilométriques (si renseignés) + garantie + total : chaque encart s’adapte au texte qu’il contient.
    if (m.mileage.visible !== false && m.mileage.total !== '0,00 €' && m.mileage.total !== '0 €') {
      y = need(y, 48);
      const kmText = `${m.mileage.km} km × ${m.mileage.rate}/km`;
      doc.font(FR).fontSize(10.5);
      const bh = Math.max(44, doc.heightOfString(kmText, { width: W - 200 }) + 30);
      if (V === 'minimal') {
        label('Frais kilométriques', L, y + 8, W - 32);
        doc.font(FR).fontSize(10.5).fillColor(ink).text(kmText, L, y + 23, { width: W - 200, lineGap: 1 });
        doc.font(FB).fontSize(11).fillColor(ink).text(m.mileage.total, R - 140, y + 22, { width: 124, align: 'right' });
        y += bh + 12;
        doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(line).stroke();
        y += 16;
      } else {
        rr(L, y, W, bh, 8).fillAndStroke(CARD, CARDLINE);
        label('Frais kilométriques', L + 16, y + 8, W - 32);
        doc.font(FR).fontSize(10.5).fillColor(ink).text(kmText, L + 16, y + 23, { width: W - 200, lineGap: 1 });
        doc.font(FB).fontSize(11).fillColor(ink).text(m.mileage.total, R - 140, y + 22, { width: 124, align: 'right' });
        y += bh + 16;
      }
    }

    y = need(y, 110);
    if (m.reminderPenalty) {
      doc.font(FB).fontSize(11);
      const bh = Math.max(44, doc.heightOfString(m.reminderPenalty, { width: 224 }) + 26);
      rr(L, y, W, bh, 8).fillAndStroke(CARD, CARDLINE);
      label('Majoration de retard', L + 16, y + 8, W - 32);
      doc.font(FB).fontSize(11).fillColor(ink).text(m.reminderPenalty, R - 240, y + 16, { width: 224, align: 'right', lineGap: 1 });
      y += bh + 16;
    }
    let rowH = 88;
    if (m.warranty) {
      doc.font(FR).fontSize(10.5);
      rowH = Math.max(rowH, doc.heightOfString(m.warranty, { width: 170, lineGap: 2 }) + 44);
    }
    y = need(y, rowH);
    // Bloc total : trois traitements radicalement différents.
    if (V === 'minimal') {
      // Total aligné à droite, à l’encre, entre deux filets (le double filet supérieur remplace l’encart).
      const tw = 300;
      doc.rect(R - tw, y, tw, 2).fillColor(ink).stroke();
      doc.rect(R - tw, y + 3, tw, 0.5).fillColor('#94a3b8').stroke();
      label(totalLabel(m), R - tw, y + 14, tw);
      let tSize = 30;
      doc.font(FB).fontSize(tSize).fillColor(ink);
      while (tSize > 13 && doc.widthOfString(m.totalTtc) > tw) { tSize -= 2; doc.fontSize(tSize); }
      doc.text(m.totalTtc, R - tw, y + 30, { width: tw, align: 'right' });
      if (m.warranty) {
        label('Garantie', L, y + 14, 200);
        doc.font(FR).fontSize(10.5).fillColor(ink).text(m.warranty, L, y + 30, { width: W - tw - 30, height: rowH, lineGap: 2 });
      }
      y += rowH + 36;
    } else if (V === 'signature') {
      // Total sur fond accent doré, texte brun : signature chaleureuse.
      if (m.warranty) {
        rr(L, y, 200, rowH, 8).fillAndStroke(CARD, CARDLINE);
        label('Garantie', L + 16, y + 14, 170);
        doc.font(FR).fontSize(10.5).fillColor(ink).text(m.warranty, L + 16, y + 30, { width: 170, height: rowH - 34, lineGap: 2 });
      }
      rr(R - 258, y, 258, rowH, 10).fill(accent);
      doc.font(FB).fontSize(8).fillColor('#fdf3df').text(totalLabel(m), R - 258 + 22, y + 20, { width: 214, characterSpacing: 1.3 });
      let tSize = 28;
      doc.font(FB).fontSize(tSize);
      while (tSize > 13 && doc.widthOfString(m.totalTtc) > 214) { tSize -= 2; doc.fontSize(tSize); }
      doc.fillColor('#2b1f14').text(m.totalTtc, R - 258 + 22, y + 40, { width: 214 });
      y += rowH + 36;
    } else {
      if (m.warranty) {
        rr(L, y, 200, rowH, 8).fillAndStroke(CARD, CARDLINE);
        label('Garantie', L + 16, y + 14, 170);
        doc.font(FR).fontSize(10.5).fillColor(ink).text(m.warranty, L + 16, y + 30, { width: 170, height: rowH - 34, lineGap: 2 });
      }
      rr(R - 258, y, 258, rowH, 10).fill(NAVY);
      doc.font(FB).fontSize(8).fillColor('#93c5fd').text(totalLabel(m), R - 258 + 22, y + 20, { width: 214, characterSpacing: 1.3 });
      // Le montant s’adapte à la largeur de l’encart : jamais de débordement ni de chevauchement.
      let tSize = 28;
      doc.font(FB).fontSize(tSize);
      while (tSize > 13 && doc.widthOfString(m.totalTtc) > 214) { tSize -= 2; doc.fontSize(tSize); }
      doc.fillColor('#ffffff').text(m.totalTtc, R - 258 + 22, y + 40, { width: 214 });
      y += rowH + 36;
    }

    // 6 — signature (devis) : minimal filet simple, classic encart gris, signature double bordure bronze.
    if (m.kind === 'quote') {
      y = need(y, 110);
      label('Bon pour accord', L, y, 200);
      doc.font(FR).fontSize(9).fillColor(muted).text('Date, mention « bon pour accord » et signature du client', L, y + 13, { width: 300 });
      if (V === 'minimal') {
        doc.moveTo(L, y + 98).lineTo(L + 280, y + 98).lineWidth(0.75).strokeColor('#64748b').stroke();
      } else if (V === 'signature') {
        rr(L, y + 32, 280, 66, 8).lineWidth(1.4).strokeColor(accent).stroke();
        rr(L + 3, y + 35, 274, 60, 6).lineWidth(0.5).strokeColor(CARDLINE).stroke();
      } else {
        rr(L, y + 32, 280, 66, 8).lineWidth(0.7).strokeColor('#cbd5e1').stroke();
      }
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

/** Activité affichée sous le nom commercial dans le bandeau Signature. */
function effectiveCompanyActivity(m: DocModel): string {
  return String((m as unknown as { company?: { activity?: string } }).company?.activity || '').slice(0, 120);
}

// ================================================================ DOCX (docx) — styles Word
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE } as const;
const hair = { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' } as const;
const boxed = { top: hair, bottom: hair, left: hair, right: hair } as const;

export async function buildDocx(m: DocModel): Promise<Buffer> {
  const V = m.theme.variant || 'classic';
  const ACC = m.theme.accent.slice(1).toUpperCase(), INK = '0F172A', MUTED = '64748B', NAVY = m.theme.dark.slice(1).toUpperCase();
  // 15.4.54 — chaque variante a ses propres fonds, bordures et compositions (voir buildPdf).
  const CARD = V === 'signature' ? 'FAF5EC' : 'F8FAFC';        // fond des encarts
  const CARDLINE = V === 'signature' ? 'E3D3B3' : 'E2E8F0';    // bordure des encarts (hex sans '#')
  const ROWFILL = V === 'minimal' ? undefined : V === 'signature' ? 'FAF5EC' : 'F8FAFC';
  const HEADTEXT = V === 'signature' ? 'E8C987' : 'CBD5E1';    // texte d'en-tête du tableau
  const PLAIN = V === 'minimal';                               // aucun encart ni fond coloré
  const boxedCard = V === 'signature'
    ? { top: { style: BorderStyle.SINGLE, size: 6, color: CARDLINE }, bottom: { style: BorderStyle.SINGLE, size: 6, color: CARDLINE }, left: { style: BorderStyle.SINGLE, size: 6, color: CARDLINE }, right: { style: BorderStyle.SINGLE, size: 6, color: CARDLINE } }
    : boxed;
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
  // 1 — en-tête : trois compositions (voir buildPdf). Logo (facultatif) puis nom commercial —
  // l'identité légale n'apparaît pas sur les documents.
  const logo = rasterLogo(m);
  if (V === 'signature') {
    if (logo) {
      const fit = fitSize(logo.data, 150, 40);
      kids.push(new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: logo.mime === 'image/png' ? 'png' : 'jpg', data: logo.data, transformation: { width: fit.w, height: fit.h } })] }));
    }
    kids.push(table([CW], [new TableRow({ cantSplit: true, children: [
      cell(!logo
        ? [p(m.company.name || 'Entreprise', { size: 30, bold: true, color: 'FFFFFF' }), p(m.company.activity || '', { size: 16, color: 'D8C39A', before: 40 })]
        : [p(m.company.name || 'Entreprise', { size: 30, bold: true, color: 'FFFFFF' })], 5600, { fill: NAVY, margins: 240 }),
      cell([p(m.reminderLabel || m.title, { size: 28, bold: true, color: ACC, align: AlignmentType.RIGHT }), p(`N° ${m.number}`, { size: 20, bold: true, color: 'FFFFFF', align: AlignmentType.RIGHT, before: 100 }), p(`Émis le ${m.date}`, { size: 17, color: 'D8C39A', align: AlignmentType.RIGHT, before: 30 })], CW - 5600, { fill: NAVY, margins: 240 }),
    ] })]));
    kids.push(new Paragraph({ spacing: { before: 200, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CARDLINE, space: 1 } }, children: [] }));
    kids.push(spacer(380));
  } else if (V === 'minimal') {
    const left: Paragraph[] = [];
    if (logo) {
      const fit = fitSize(logo.data, 150, 46);
      left.push(new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: logo.mime === 'image/png' ? 'png' : 'jpg', data: logo.data, transformation: { width: fit.w, height: fit.h } })] }));
    }
    left.push(p((m.company.name || 'Entreprise').toUpperCase(), { size: 26, bold: true, spacing: 30 }));
    kids.push(table([5600, CW - 5600], [new TableRow({ cantSplit: true, children: [
      cell(left, 5600),
      cell([p(m.reminderLabel || m.title, { size: 26, bold: true, align: AlignmentType.RIGHT }), p(`N° ${m.number} · émis le ${m.date}`, { size: 20, color: MUTED, align: AlignmentType.RIGHT, before: 60 })], CW - 5600),
    ] })]));
    kids.push(new Paragraph({ spacing: { before: 200, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8', space: 1 } }, children: [] }));
    kids.push(spacer(420));
  } else {
    const left: Paragraph[] = [];
    if (logo) {
      const fit = fitSize(logo.data, 150, 46);
      left.push(new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: logo.mime === 'image/png' ? 'png' : 'jpg', data: logo.data, transformation: { width: fit.w, height: fit.h } })] }));
    }
    left.push(p(m.company.name || 'Entreprise', { size: 32, bold: true }));
    kids.push(table([5600, CW - 5600], [new TableRow({ cantSplit: true, children: [
      cell(left, 5600),
      cell([p(m.reminderLabel || m.title, { size: 28, bold: true, color: ACC, align: AlignmentType.RIGHT }), p(`N° ${m.number}`, { bold: true, align: AlignmentType.RIGHT, before: 100 }), p(`Émis le ${m.date}`, { size: 20, color: MUTED, align: AlignmentType.RIGHT, before: 30 })], CW - 5600),
    ] })]));
    kids.push(new Paragraph({ spacing: { before: 240, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: ACC, space: 1 } }, children: [] }));
    kids.push(spacer(420));
  }

  // 2 — carte Client : minimal = libellé + contenu sans encart ; classic = carte claire ;
  // signature = encart crème bordé bronze.
  const addr = [...(m.client.address ? ['Facturation :', ...m.client.address.split(/\r?\n/)] : []), ...(m.client.interventionAddress ? ['Adresse d’intervention :', ...m.client.interventionAddress.split(/\r?\n/)] : [])];
  if (PLAIN) {
    kids.push(label('Client'));
    kids.push(p(m.client.name || '—', { size: 24, bold: true }));
    for (const l of addr) kids.push(p(l, { size: 20, color: MUTED, before: 30 }));
    kids.push(new Paragraph({ spacing: { before: 160, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0', space: 1 } }, children: [] }));
    kids.push(spacer(420));
  } else {
    kids.push(table([CW], [new TableRow({ cantSplit: true, children: [
      cell([label('Client'), p(m.client.name || '—', { size: 24, bold: true }), ...addr.map(l => p(l, { size: 20, color: MUTED, before: 30 }))], CW, { fill: CARD, margins: 220, borders: boxedCard }),
    ] })]));
    kids.push(spacer(460));
  }

  // 3 — prestation : barre accent (classic / signature), simple libellé (minimal).
  if (PLAIN) {
    kids.push(label(m.interventionLabel));
    kids.push(p(m.intervention || '—', { size: 28, bold: true }));
    kids.push(spacer(380));
  } else {
    kids.push(table([90, CW - 90], [new TableRow({ cantSplit: true, children: [
      cell([p('')], 90, { fill: ACC }),
      cell([label(m.interventionLabel), p(m.intervention || '—', { size: 32, bold: true })], CW - 90, { margins: 0 }),
    ] })]));
    kids.push(spacer(460));
  }
  const deviceLines = [
    m.device?.serialNumber ? `N° de série : ${m.device.serialNumber}` : '',
    m.device?.imei ? `IMEI : ${m.device.imei}` : '',
  ].filter(Boolean);
  if (deviceLines.length) {
    kids.push(label('Identification de l’appareil'));
    kids.push(p(deviceLines.join(' · '), { size: 20, color: MUTED, after: 120 }));
    kids.push(spacer(220));
  }

  // 4 — tableau des pièces : en-tête navy + zébrage (classic), en-tête brun doré + zébrage crème
  // (signature), filets seuls sans fond (minimal).
  if (m.items.length) {
    const cols = [800, 6612, 2000];
    const th = (t: string, w: number, right = false) => PLAIN
      ? cell([p(t.toUpperCase(), { size: 15, bold: true, color: MUTED, spacing: 24, align: right ? AlignmentType.RIGHT : undefined })], w, { margins: 170, v: 'center', borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' }, top: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' } } })
      : cell([p(t.toUpperCase(), { size: 15, bold: true, color: HEADTEXT, spacing: 24, align: right ? AlignmentType.RIGHT : undefined })], w, { fill: NAVY, margins: 170, v: 'center' });
    const head = new TableRow({ height: { value: 520, rule: HeightRule.ATLEAST }, cantSplit: true, children: [th('N°', cols[0]!), th(m.itemsLabel, cols[1]!), th(m.quantityLabel, cols[2]!, true)] });
    const rows = m.items.map((it, i) => {
      const fill = ROWFILL && i % 2 === 0 ? ROWFILL : undefined, b = { ...noBorders, bottom: hair };
      return new TableRow({ height: { value: 700, rule: HeightRule.ATLEAST }, cantSplit: true, children: [
        cell([p(String(i + 1).padStart(2, '0'), { size: 20, bold: true, color: MUTED })], cols[0]!, { fill, margins: 170, v: 'center', borders: b }),
        cell([p(it.label, { size: 23 })], cols[1]!, { fill, margins: 170, v: 'center', borders: b }),
        cell([p(it.quantity, { size: 23, bold: true, align: AlignmentType.RIGHT })], cols[2]!, { fill, margins: 170, v: 'center', borders: b }),
      ] });
    });
    kids.push(table(cols, [head, ...rows]));
    kids.push(spacer(520));
  }

  // 5 — frais kilométriques + garantie + total : minimal = lignes droites alignées à droite ;
  // classic = encarts clairs + bloc navy ; signature = encarts crème + bloc accent doré.
  if (m.mileage.visible !== false && m.mileage.total !== '0,00 €' && m.mileage.total !== '0 €') {
    if (PLAIN) {
      kids.push(label('Frais kilométriques'));
      kids.push(table([6500, CW - 6500], [new TableRow({ cantSplit: true, children: [
        cell([p(`${m.mileage.km} km × ${m.mileage.rate}/km`, { size: 21 })], 6500, { margins: 20 }),
        cell([p(m.mileage.total, { size: 24, bold: true, align: AlignmentType.RIGHT })], CW - 6500, { margins: 20 }),
      ] })]));
      kids.push(new Paragraph({ spacing: { before: 120, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0', space: 1 } }, children: [] }));
      kids.push(spacer(200));
    } else {
      kids.push(table([6500, CW - 6500], [new TableRow({ cantSplit: true, children: [
        cell([label('Frais kilométriques'), p(`${m.mileage.km} km × ${m.mileage.rate}/km`, { size: 21 })], 6500, { fill: CARD, margins: 180, borders: boxedCard }),
        cell([p(m.mileage.total, { size: 24, bold: true, align: AlignmentType.RIGHT })], CW - 6500, { margins: 180, borders: boxedCard }),
      ] })]));
      kids.push(spacer(220));
    }
  }
  if (V === 'minimal') {
    // Total : double filet au-dessus, libellé et montant à l'encre alignés à droite — aucun encart.
    kids.push(table([4000, CW - 4000], [new TableRow({ cantSplit: true, children: [
      m.warranty ? cell([label('Garantie'), p(m.warranty, { size: 21 })], 4000, { margins: 20 }) : cell([p('')], 4000),
      cell([new Paragraph({ spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: '0F172A', space: 1 } }, children: [] }), new Paragraph({ spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8', space: 1 } }, children: [] }), p(totalLabel(m), { size: 15, bold: true, color: MUTED, spacing: 24, align: AlignmentType.RIGHT, before: 120 }), p(m.totalTtc, { size: 52, bold: true, align: AlignmentType.RIGHT })], CW - 4000, { margins: 20 }),
    ] })]));
  } else {
    const totalCell = V === 'signature'
      ? cell([p(totalLabel(m), { size: 16, bold: true, color: 'FDF3DF', spacing: 24, after: 200 }), p(m.totalTtc, { size: 56, bold: true, color: '2B1F14', before: 60 })], CW - 4300, { fill: ACC, margins: 320 })
      : cell([p(totalLabel(m), { size: 16, bold: true, color: '93C5FD', spacing: 24, after: 200 }), p(m.totalTtc, { size: 56, bold: true, color: 'FFFFFF', before: 60 })], CW - 4300, { fill: NAVY, margins: 320 });
    kids.push(table([4000, 300, CW - 4300], [new TableRow({ cantSplit: true, children: [
      m.warranty ? cell([label('Garantie'), p(m.warranty, { size: 21 })], 4000, { fill: CARD, margins: 220, borders: boxedCard }) : cell([p('')], 4000),
      cell([p('')], 300),
      totalCell,
    ] })]));
  }

  // 6 — signature (devis) : minimal filet simple, classic encart gris, signature double bordure bronze.
  if (m.kind === 'quote') {
    kids.push(spacer(560));
    kids.push(label('Bon pour accord'));
    kids.push(p('Date, mention « bon pour accord » et signature du client', { size: 18, color: MUTED, after: 100 }));
    if (PLAIN) {
      kids.push(new Paragraph({ spacing: { before: 900, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '64748B', space: 1 } }, children: [] }));
    } else {
      const signBorders = V === 'signature'
        ? { top: { style: BorderStyle.SINGLE, size: 12, color: ACC }, bottom: { style: BorderStyle.SINGLE, size: 12, color: ACC }, left: { style: BorderStyle.SINGLE, size: 12, color: ACC }, right: { style: BorderStyle.SINGLE, size: 12, color: ACC } }
        : { top: hair, bottom: hair, left: hair, right: hair };
      kids.push(table([5200, CW - 5200], [new TableRow({ height: { value: 1300, rule: HeightRule.ATLEAST }, cantSplit: true, children: [cell([p('')], 5200, { borders: signBorders }), cell([p('')], CW - 5200)] })]));
    }
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
  const V = m.theme.variant || 'classic';
  const PLAIN = V === 'minimal';                       // aucun encart ni fond coloré
  const HEADTXTCOLOR = PLAIN ? '#64748b' : V === 'signature' ? '#e8c987' : '#cbd5e1';
  const TOTLABELCOLOR = PLAIN ? '#64748b' : V === 'signature' ? '#fdf3df' : '#93c5fd';
  const TOTALCOLOR = V === 'signature' ? '#2b1f14' : '#ffffff';
  const FN = m.theme.font === 'serif' ? 'Georgia' : 'Arial';
  const FONT = `style:font-name="${FN}"`;
  const para = (name: string, pp: string, tp: string) => `<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties ${pp}/><style:text-properties ${FONT} ${tp}/></style:style>`;
  const col = (n: string, w: number) => `<style:style style:name="Col${n}" style:family="table-column"><style:table-column-properties style:column-width="${w}cm"/></style:style>`;
  const cellStyle = (n: string, props: string) => `<style:style style:name="${n}" style:family="table-cell"><style:table-cell-properties ${props}/></style:style>`;
  // 15.4.54 — les cellules portent la variante : minimal = fond neutre sans encart (les styles
  // Ccard/Crowz/Cnavy deviennent transparents et c'est le corps qui porte les filets) ;
  // signature = crème #faf5ec bordé bronze ; classic = gris clair historique.
  const cardBg = PLAIN ? 'none' : V === 'signature' ? '#faf5ec' : '#f8fafc';
  const cardBorder = PLAIN ? 'none' : V === 'signature' ? '0.75pt solid #e3d3b3' : '0.5pt solid #e2e8f0';
  const zebraBg = PLAIN ? 'none' : V === 'signature' ? '#faf5ec' : '#f8fafc';
  const totalCellBg = V === 'signature' ? '#a16207' : '#0b1220';
  const styles = [
    para('Plogo', 'fo:margin-bottom="0.2cm"', ''),
    para('Pcompany', V === 'signature' ? 'fo:margin-bottom="0.03cm"' : 'fo:margin-bottom="0.05cm"', V === 'signature' ? 'fo:font-size="16pt" fo:font-weight="bold" fo:color="#ffffff"' : 'fo:font-size="16pt" fo:font-weight="bold"'),
    para('Pmeta', 'fo:margin-top="0.03cm"', `fo:font-size="9.5pt" fo:color="${V === 'signature' ? '#d8c39a' : '#64748b'}"`),
    para('Ptitle', 'fo:text-align="end"', `fo:font-size="14pt" fo:font-weight="bold" fo:color="${PLAIN ? '#0f172a' : V === 'signature' ? '#a16207' : '#0b63cd'}"`),
    para('Pnum', 'fo:text-align="end" fo:margin-top="0.18cm"', `fo:font-size="11pt" fo:font-weight="bold" fo:color="${V === 'signature' ? '#ffffff' : '#0f172a'}"`),
    para('Pdate', 'fo:text-align="end" fo:margin-top="0.05cm"', `fo:font-size="9.5pt" fo:color="${V === 'signature' ? '#d8c39a' : '#64748b'}"`),
    para('Plabel', 'fo:margin-bottom="0.1cm"', 'fo:font-size="7.5pt" fo:font-weight="bold" fo:color="#64748b" fo:letter-spacing="0.04cm" fo:text-transform="uppercase"'),
    para('Pname', 'fo:margin-bottom="0.04cm"', 'fo:font-size="12pt" fo:font-weight="bold"'),
    para('Pbody', 'fo:margin-top="0.03cm"', 'fo:font-size="9.5pt" fo:color="#64748b"'),
    para('Pwarr', 'fo:margin-top="0.03cm"', 'fo:font-size="10.5pt"'),
    para('Pprest', 'fo:margin-top="0cm"', 'fo:font-size="16pt" fo:font-weight="bold"'),
    para('Pitem', 'fo:margin-top="0cm"', 'fo:font-size="11.5pt"'),
    para('Pnumr', 'fo:margin-top="0cm"', 'fo:font-size="10pt" fo:font-weight="bold" fo:color="#64748b"'),
    para('Pqty', 'fo:text-align="end"', 'fo:font-size="11.5pt" fo:font-weight="bold"'),
    para('Phead', 'fo:margin-top="0cm"', `fo:font-size="7.5pt" fo:font-weight="bold" fo:color="${HEADTXTCOLOR}" fo:letter-spacing="0.04cm"`),
    para('Pheadr', 'fo:text-align="end"', `fo:font-size="7.5pt" fo:font-weight="bold" fo:color="${HEADTXTCOLOR}" fo:letter-spacing="0.04cm"`),
    para('Ptotlabel', PLAIN ? 'fo:margin-bottom="0.1cm" fo:text-align="end"' : 'fo:margin-bottom="0.15cm"', `fo:font-size="8pt" fo:font-weight="bold" fo:color="${TOTLABELCOLOR}" fo:letter-spacing="0.04cm"`),
    para('Ptotal', 'fo:margin-top="0cm"', `fo:font-size="26pt" fo:font-weight="bold" fo:color="${TOTALCOLOR}"`),
    para('Ptotalplain', 'fo:margin-top="0.1cm" fo:text-align="end"', 'fo:font-size="24pt" fo:font-weight="bold" fo:color="#0f172a"'),
    para('Psmall', 'fo:margin-top="0cm"', 'fo:font-size="7.5pt" fo:color="#64748b"'),
    para('Pspace', 'fo:margin-top="0.7cm" fo:margin-bottom="0cm"', 'fo:font-size="4pt"'),
    // Séparateur d'en-tête : classic/signature = barre accent 2,5 pt ; minimal = filet fin à l'encre.
    `<style:style style:name="Pbar" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.45cm" fo:margin-bottom="0.5cm" fo:border-bottom="${PLAIN ? '0.75pt solid #94a3b8' : '2.5pt solid #0b63cd'}"/><style:text-properties fo:font-size="2pt"/></style:style>`,
    '<style:style style:name="Tfull" style:family="table"><style:table-properties style:width="16.6cm" table:align="left"/></style:style>',
    '<style:style style:name="Pdouble" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.1cm" fo:margin-bottom="0.1cm" fo:border-bottom="2.5pt double #0f172a"/><style:text-properties fo:font-size="2pt"/></style:style>',
    '<style:style style:name="Psignline" style:family="paragraph"><style:paragraph-properties fo:margin-top="1.1cm" fo:margin-bottom="0.2cm" fo:border-bottom="0.75pt solid #64748b"/><style:text-properties fo:font-size="2pt"/></style:style>',
    ...[['H1', 9.6], ['H2', 7], ['F1', 16.6], ['C1', 8.1], ['C2', 0.4], ['C3', 8.1], ['B1', 0.25], ['B2', 16.35], ['N1', 1.6], ['N2', 11.8], ['N3', 3.2], ['W1', 7.4], ['W2', 0.5], ['W3', 8.7], ['S1', 9.2], ['S2', 7.4]].map(([n, w]) => col(String(n), Number(w))),
    cellStyle('Cplain', 'fo:padding="0cm" fo:border="none"'),
    cellStyle('Ccard', `fo:background-color="${cardBg}" fo:padding="0.45cm" fo:border="${cardBorder}"`),
    cellStyle('Cbar', PLAIN ? 'fo:padding="0cm" fo:border="none"' : 'fo:background-color="#0b63cd" fo:padding="0cm" fo:border="none"'),
    cellStyle('Chead', PLAIN ? 'fo:padding-top="0.3cm" fo:padding-bottom="0.3cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border="none"' : `fo:background-color="#0b1220" fo:padding-top="0.3cm" fo:padding-bottom="0.3cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border="none"`),
    cellStyle('Crow', 'fo:padding-top="0.4cm" fo:padding-bottom="0.4cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="0.5pt solid #e2e8f0"'),
    cellStyle('Crowz', `fo:background-color="${zebraBg}" fo:padding-top="0.4cm" fo:padding-bottom="0.4cm" fo:padding-left="0.4cm" fo:padding-right="0.4cm" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="0.5pt solid #e2e8f0"`),
    cellStyle('Cnavy', PLAIN ? 'fo:padding="0.2cm" fo:border="none"' : `fo:background-color="${totalCellBg}" fo:padding="0.55cm" fo:border="none"`),
    cellStyle('Cband', V === 'signature' ? `fo:background-color="#2b1f14" fo:padding-top="0.3cm" fo:padding-bottom="0.3cm" fo:padding-left="0.45cm" fo:padding-right="0.45cm" fo:border="none"` : 'fo:padding="0cm" fo:border="none"'),
    cellStyle('Csign', PLAIN ? 'fo:padding="0.3cm" fo:border="none"' : V === 'signature' ? 'fo:padding="0.3cm" fo:border="1.2pt solid #a16207"' : 'fo:padding="0.3cm" fo:border="0.7pt solid #cbd5e1"'),
  ].join('');

  // Logo (facultatif) : image PNG/JPEG embarquée dans l'archive ODT et affichée en en-tête.
  const odtLogo = rasterLogo(m);
  let logoXml = '';
  let logoPic: { name: string; data: Buffer; mime: string } | null = null;
  if (odtLogo) {
    const fit = fitSize(odtLogo.data, 150, 46);
    const ext = odtLogo.mime === 'image/png' ? 'png' : 'jpg';
    logoPic = { name: `Pictures/logo.${ext}`, data: odtLogo.data, mime: odtLogo.mime };
    const wCm = (fit.w / 96 * 2.54).toFixed(3), hCm = (fit.h / 96 * 2.54).toFixed(3);
    logoXml = `<text:p text:style-name="Plogo"><draw:frame draw:name="Logo" text:anchor-type="as-char" svg:width="${wCm}cm" svg:height="${hCm}cm" draw:z-index="0"><draw:image xlink:href="Pictures/logo.${ext}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`;
  }
  const P = (s: string, t: string) => `<text:p text:style-name="${s}">${x(t)}</text:p>`;
  const cell = (style: string, inner: string) => `<table:table-cell table:style-name="${style}" office:value-type="string">${inner}</table:table-cell>`;
  const tbl = (name: string, cols: string[], rows: string) => `<table:table table:name="${name}" table:style-name="Tfull">${cols.map(c => `<table:table-column table:style-name="Col${c}"/>`).join('')}${rows}</table:table>`;
  const tr = (cells: string) => `<table:table-row>${cells}</table:table-row>`;
  const addr = [...(m.client.address ? ['Facturation :', ...m.client.address.split(/\r?\n/)] : []), ...(m.client.interventionAddress ? ['Adresse d’intervention :', ...m.client.interventionAddress.split(/\r?\n/)] : [])].map(l => P('Pbody', l)).join('');

  const headerCell = V === 'signature' ? 'Cband' : 'Cplain';
  let body = tbl('Entete', ['H1', 'H2'], tr(cell(headerCell, logoXml + P('Pcompany', m.company.name || 'Entreprise')) + cell(headerCell, P('Ptitle', m.reminderLabel || m.title) + P('Pnum', `N° ${m.number}`) + P('Pdate', `Émis le ${m.date}`))));
  body += '<text:p text:style-name="Pbar"/>';
  body += tbl('Cartes', ['F1'], tr(cell('Ccard', P('Plabel', 'Client') + P('Pname', m.client.name || '—') + addr)));
  body += P('Pspace', '');
  body += tbl('Prestation', ['B1', 'B2'], tr(cell('Cbar', P('Pbody', '')) + cell('Cplain', `<text:p text:style-name="Plabel">${x(m.interventionLabel)}</text:p>${P('Pprest', m.intervention || '—')}`.replace('<text:p text:style-name="Plabel">', '<text:p text:style-name="Plabel">'))));
  body += P('Pspace', '');
  const deviceLines = [
    m.device?.serialNumber ? `N° de série : ${m.device.serialNumber}` : '',
    m.device?.imei ? `IMEI : ${m.device.imei}` : '',
  ].filter(Boolean);
  if (deviceLines.length) body += P('Plabel', 'Identification de l’appareil') + P('Pmeta', deviceLines.join(' · ')) + P('Pspace', '');
  if (m.items.length) {
    body += tbl('Pieces', ['N1', 'N2', 'N3'], tr(cell('Chead', P('Phead', 'N°')) + cell('Chead', P('Phead', m.itemsLabel.toUpperCase())) + cell('Chead', P('Pheadr', m.quantityLabel.toUpperCase()))) +
      m.items.map((it, i) => { const st = i % 2 === 0 ? 'Crowz' : 'Crow'; return tr(cell(st, P('Pnumr', String(i + 1).padStart(2, '0'))) + cell(st, P('Pitem', it.label)) + cell(st, P('Pqty', it.quantity))); }).join(''));
    body += P('Pspace', '');
  }
  if (m.mileage.visible !== false && m.mileage.total !== '0,00 €' && m.mileage.total !== '0 €') body += tbl('Kilometrage', ['S1', 'S2'], tr(cell('Ccard', P('Plabel', 'Frais kilométriques') + P('Pwarr', `${m.mileage.km} km × ${m.mileage.rate}/km`)) + cell('Ccard', P('Pqty', m.mileage.total))));
  body += P('Pspace', '');
  if(m.reminderPenalty) body += tbl('Majoration', ['S1','S2'], tr(cell('Ccard', P('Plabel','Majoration de retard')) + cell('Ccard', P('Pqty',m.reminderPenalty))));
  if (PLAIN) {
    body += tbl('Total', ['W1', 'W2', 'W3'], tr(cell('Cplain', m.warranty ? `<text:p text:style-name="Plabel">Garantie</text:p>${P('Pwarr', m.warranty)}` : P('Pbody', '')) + cell('Cplain', `<text:p text:style-name="Pdouble"/>${P('Ptotlabel', totalLabel(m))}${P('Ptotalplain', m.totalTtc)}`)));
  } else {
    body += tbl('Total', ['W1', 'W2', 'W3'], tr(cell('Cplain', m.warranty ? `<text:p text:style-name="Plabel">Garantie</text:p>${P('Pwarr', m.warranty)}` : P('Pbody', '')) + cell('Cplain', P('Pbody', '')) + cell('Cnavy', P('Ptotlabel', totalLabel(m)) + P('Ptotal', m.totalTtc))));
  }
  if (m.kind === 'quote') {
    body += P('Pspace', '') + P('Plabel', 'Bon pour accord') + P('Psmall', 'Date, mention « bon pour accord » et signature du client');
    if (PLAIN) {
      body += P('Pspace', '') + '<text:p text:style-name="Psignline"/>';
    } else {
      body += P('Pspace', '') + tbl('Signature', ['S1', 'S2'], tr(cell('Csign', P('Pbody', '\u00A0') + P('Pbody', '\u00A0') + P('Pbody', '\u00A0') + P('Pbody', '\u00A0')) + cell('Cplain', P('Pbody', ''))));
    }
  }
  if (m.legal.length) body += P('Pspace', '') + P('Plabel', 'Mentions légales') + m.legal.map(l => P('Psmall', l)).join('');
  if (m.cgv) body += P('Pspace', '') + P('Plabel', 'Conditions') + P('Psmall', m.cgv);

  const themed = styles.replaceAll('#0b63cd', m.theme.accent).replaceAll('#0b1220', m.theme.dark);
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.2"><office:automatic-styles>${themed}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.2"><office:font-face-decls><style:font-face style:name="${FN}" svg:font-family="${FN}" style:font-family-generic="${m.theme.font === 'serif' ? 'roman' : 'swiss'}"/></office:font-face-decls><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="135%"/><style:text-properties ${FONT} fo:font-size="10.5pt" fo:color="#0f172a" fo:language="fr" fo:country="FR"/></style:default-style><style:style style:name="Standard" style:family="paragraph" style:class="text"/><style:style style:name="Footer" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties ${FONT} fo:font-size="8pt" fo:color="#94a3b8"/></style:style></office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="1.9cm" fo:margin-left="2.2cm" fo:margin-right="2.2cm"/><style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.4cm"/></style:footer-style></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"><style:footer><text:p text:style-name="Footer">${x(footerText(m))}</text:p></style:footer></style:master-page></office:master-styles></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} office:version="1.2"><office:meta><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${x(`${m.title} ${m.number}`)}</dc:title></office:meta></office:document-meta>`;
  const pic = logoPic ? `<manifest:file-entry manifest:full-path="${logoPic.name}" manifest:media-type="${logoPic.mime}"/>` : '';
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${pic}</manifest:manifest>`;
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/vnd.oasis.opendocument.text'));
  zip.getEntry('mimetype')!.header.method = 0;
  zip.addFile('content.xml', Buffer.from(content, 'utf8'));
  zip.addFile('styles.xml', Buffer.from(stylesXml, 'utf8'));
  zip.addFile('meta.xml', Buffer.from(meta, 'utf8'));
  zip.addFile('META-INF/manifest.xml', Buffer.from(manifest, 'utf8'));
  if (logoPic) zip.addFile(logoPic.name, logoPic.data);
  return zip.toBuffer();
}

/** Modèle de départ : mêmes styles, mais chaque valeur est un champ {{...}} à remplacer par Aurion. */
export function starterModel(kind: 'quote' | 'invoice'): DocModel {
  return {
    kind, title: '{{DOCUMENT_TITLE}}', number: '{{DOCUMENT_NUMBER}}', date: '{{DATE}}',
    company: { name: '{{COMPANY_NAME}}', activity: '{{COMPANY_ACTIVITY}}', siret: '{{SIRET}}', address: '{{COMPANY_ADDRESS}}', postalCode: '{{COMPANY_POSTAL_CODE}}', city: '{{COMPANY_CITY}}', website: '{{COMPANY_WEBSITE}}' },
    client: { name: '{{CLIENT_NAME}}', address: '{{CLIENT_ADDRESS}}' },
    interventionLabel: 'Prestation', intervention: '{{INTERVENTION}}',
    device: { serialNumber: '{{SERIAL_NUMBER}}', imei: '{{IMEI}}' },
    itemsLabel: 'Désignation', quantityLabel: 'Qté', items: [{ label: '{{ITEMS}}', quantity: '' }],
    warranty: '{{WARRANTY}}', reminderLabel: '{{DOCUMENT_TITLE}}', reminderPenalty: '{{LATE_PENALTY}}', mileage: { km: '{{MILEAGE_KM}}', rate: '{{MILEAGE_RATE}}', total: '{{MILEAGE_TOTAL}}', visible: true }, totalTtc: '{{TOTAL_TTC}}', cgv: '{{CGV}}',
    legal: ['{{LEGAL_NOTES}}'], theme: { accent: '#0b63ce', dark: '#0b1220', font: 'sans', radius: 'round', variant: 'classic', customized: false },
  };
}
