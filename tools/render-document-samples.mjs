// 15.4.69 — échantillons réels des trois moteurs natifs (PDF, DOCX, ODT) pour contrôle visuel
// et non-régression des encarts : variantes Classic / Minimal / Signature / Orchidée, liste
// longue (saut de page) et document sans frais kilométriques.
// Usage : node tools/render-document-samples.mjs [dossier-de-sortie]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { buildPdf, buildDocx, buildOdt, formatEuro } from '../backend/src/services/document-layout.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const AdmZip = require('adm-zip');

const out = path.resolve(process.argv[2] || path.join(process.cwd(), 'Aurion-samples'));
mkdirSync(out, { recursive: true });

const THEMES = {
  classic: { accent: '#0b63ce', dark: '#0b1220', font: 'sans', radius: 'round', variant: 'classic', customized: false },
  minimal: { accent: '#155e75', dark: '#111827', font: 'sans', radius: 'square', variant: 'minimal', customized: false },
  signature: { accent: '#a16207', dark: '#2b1f14', font: 'serif', radius: 'round', variant: 'signature', customized: false },
  orchidee: { accent: '#a855f7', dark: '#2e1065', font: 'serif', radius: 'round', variant: 'signature', customized: false },
  ardoise: { accent: '#475569', dark: '#1f2937', font: 'sans', radius: 'square', variant: 'classic', customized: false },
  azur: { accent: '#0284c7', dark: '#0c4a6e', font: 'sans', radius: 'round', variant: 'classic', customized: false },
  terracotta: { accent: '#c2410c', dark: '#431407', font: 'serif', radius: 'round', variant: 'signature', customized: false },
  foret: { accent: '#15803d', dark: '#052e16', font: 'sans', radius: 'square', variant: 'minimal', customized: false },
};

const ITEMS = [
  { label: 'Écran OLED complet — remplacement', quantity: '1' },
  { label: 'Batterie lithium-ion 4 500 mAh', quantity: '1' },
  { label: 'Nettoyage, test d’étanchéité et contrôle qualité', quantity: '1' },
];

function model(themeName, kind, overrides = {}) {
  return {
    theme: THEMES[themeName],
    legal: ['TVAC · Garantie 6 mois sur la main-d’œuvre et 3 mois sur les pièces.', 'Devis valable 30 jours à compter de sa date d’émission.'],
    kind,
    title: kind === 'invoice' ? 'FACTURE' : 'DEVIS',
    number: kind === 'invoice' ? 'FAC-2026-0042' : 'DEV-2026-0117',
    date: '25/11/2026',
    company: { name: 'Atelier Lumière', activity: 'Réparation de smartphones et tablettes', siret: '00000000000000' },
    client: { name: 'Camille Reynaud', address: '14 rue des Tilleuls\n69003 Lyon', interventionAddress: '14 rue des Tilleuls\n69003 Lyon' },
    interventionLabel: 'Réparation smartphone',
    intervention: 'Remplacement complet de l’écran et de la batterie sur iPhone 13 — remise en état esthétique incluse.',
    device: { serialNumber: 'SN-8F2K9LQ1', imei: '356789012345678' },
    itemsLabel: 'Pièces',
    quantityLabel: 'Qté',
    items: ITEMS,
    warranty: 'Garantie 6 mois — intervention couverte pièces et main-d’œuvre.',
    reminderLabel: undefined,
    reminderPenalty: '',
    mileage: { km: '12', rate: '0,80\u00A0€', total: formatEuro(9.6), visible: true },
    totalTtc: formatEuro(489.6),
    cgv: 'Paiement à réception. Passé ce délai, une pénalité de retard de 3 % par mois est applicable. Les pièces remplacées restent la propriété de l’atelier.',
    ...overrides,
  };
}

const files = [];
async function emit(name, data) {
  const file = path.join(out, name);
  writeFileSync(file, data);
  files.push({ name, bytes: data.length });
}

// Quatre ambiances en PDF (devis).
for (const theme of Object.keys(THEMES)) await emit(`devis-${theme}.pdf`, await buildPdf(model(theme, 'quote')));

// Les trois formats sur la facture Classique.
await emit('facture-classique.docx', await buildDocx(model('classic', 'invoice')));
await emit('facture-classique.odt', buildOdt(model('classic', 'invoice')));

// ODT : contrôle des accents de thème (Signature bronze et Orchidée violet).
await emit('devis-minimal.odt', buildOdt(model('minimal', 'quote')));
await emit('devis-signature.odt', buildOdt(model('signature', 'quote')));
await emit('devis-orchidee.odt', buildOdt(model('orchidee', 'quote')));

// Liste longue : l'en-tête du tableau doit être répété en page 2.
const longItems = Array.from({ length: 45 }, (_, i) => ({ label: `Ligne de pièce ${String(i + 1).padStart(2, '0')} — référence interne ATL-${1000 + i}`, quantity: String((i % 3) + 1) }));
await emit('devis-liste-longue.pdf', await buildPdf(model('classic', 'quote', { items: longItems })));

// Aucun frais kilométrique facturé : l'encart doit disparaître (montant réellement nul).
const noMileage = { mileage: { km: '0', rate: '0,00\u00A0€', total: formatEuro(0), visible: true } };
await emit('devis-sans-km.pdf', await buildPdf(model('classic', 'quote', noMileage)));
await emit('devis-sans-km.odt', buildOdt(model('classic', 'quote', noMileage)));

// ---------------------------------------------------------------- contrôles automatiques
const checks = [];
const pdfPages = file => (file.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;
const odtXml = data => new AdmZip(data).getEntry('content.xml').getData().toString('utf8');
const docxXml = data => new AdmZip(data).getEntry('word/document.xml').getData().toString('utf8');

for (const entry of files) {
  const data = require('node:fs').readFileSync(path.join(out, entry.name));
  if (entry.name.endsWith('.pdf')) checks.push([entry.name, 'pages', pdfPages(data)]);
  if (entry.name.endsWith('.odt')) {
    const xml = odtXml(data);
    checks.push([entry.name, 'encart km', xml.includes('Kilometrage') ? 'présent' : 'absent']);
  }
  if (entry.name.endsWith('.docx')) {
    const xml = docxXml(data);
    checks.push([entry.name, 'client', xml.includes('Camille Reynaud') ? 'ok' : 'MANQUANT']);
    // 15.4.70 — bandeau DOCX : les trois informations du bandeau doivent être présentes et
    // dans la même table d'en-tête (nom commercial, numéro, date), sans variable non résolue.
    const banner = ['Atelier Lumière', 'FAC-2026-0042', '25/11/2026'].every(value => xml.includes(value));
    checks.push([entry.name, 'bandeau DOCX', banner && !xml.includes('{{') ? 'ok' : 'KO']);
  }
}
const orchid = odtXml(require('node:fs').readFileSync(path.join(out, 'devis-orchidee.odt')));
const signature = odtXml(require('node:fs').readFileSync(path.join(out, 'devis-signature.odt')));
checks.push(['devis-orchidee.odt', 'accent violet', orchid.includes('#a855f7') && !orchid.includes('#a16207') ? 'ok' : 'KO']);
checks.push(['devis-signature.odt', 'accent bronze', signature.includes('#a16207') ? 'ok' : 'KO']);

// Bandeau Signature : vérifie que les trois lignes du bandeau compacté (56 pt) ne se chevauchent
// pas, avec les métriques réelles des polices utilisées par le PDF.
const PDFDocument = require('pdfkit');
const probe = new PDFDocument({ size: 'A4', margin: 56 });
const lineHeight = (font, size) => { probe.font(font).fontSize(size); return probe.currentLineHeight(); };
const band = {
  titre: 9 + lineHeight('Helvetica-Bold', 14),
  numero: 27 + lineHeight('Helvetica-Bold', 10),
  date: 40 + lineHeight('Times-Roman', 8.5),
};
const bandOk = band.titre <= 27 && band.numero <= 40 && band.date <= 54;
checks.push(['bandeau-signature', 'bas des lignes', bandOk ? 'ok' : 'KO']);
console.log('\nBandeau Signature (56 pt) — bas de ligne : titre ' + band.titre.toFixed(1) +
  ', numéro ' + band.numero.toFixed(1) + ', date ' + band.date.toFixed(1) + ' → ' + (bandOk ? 'OK' : 'KO'));

console.log(`Échantillons générés dans ${out}`);
for (const f of files) console.log(`  ${f.name.padEnd(28)} ${(f.bytes / 1024).toFixed(1)} Kio`);
console.log('\nContrôles :');
for (const [file, label, value] of checks) console.log(`  ${file.padEnd(28)} ${label.padEnd(14)} ${value}`);
