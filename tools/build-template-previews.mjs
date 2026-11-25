// V2 — régénère les 40 aperçus PDF statiques de la page « Modèles de documents »
// (assets/templates/{quote,invoice}-aurion-*.pdf) : 20 modèles × 2 types de documents.
// Chaque aperçu est produit par le moteur natif réel (backend/src/services/document-layout.ts)
// avec la variante correspondante, sur un jeu de données d'exemple : la page de choix montre
// ainsi les VRAIES différences de mise en page entre les trois modèles.
// Usage : node tools/build-template-previews.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildPdf } = await import(pathToFileURL(path.join(ROOT, 'backend/src/services/document-layout.ts')).href);

const baseModel = (kind) => ({
  kind,
  title: kind === 'invoice' ? 'FACTURE' : 'DEVIS',
  number: `${kind === 'invoice' ? 'FAC' : 'DEV'}-2026-0142`,
  date: '23/11/2026',
  company: { name: 'Atelier Lumière', activity: 'Réparation de smartphones & ordinateurs', siret: '', address: '12 rue des Lilas', postalCode: '75011', city: 'Paris', website: 'atelier-lumiere.fr' },
  client: { name: 'Camille Fournier', address: '48 avenue Gambetta\n75020 Paris', interventionAddress: '' },
  interventionLabel: 'Type de prestation',
  intervention: kind === 'invoice' ? 'Remplacement écran + batterie' : 'Diagnostic et remise en état',
  device: { serialNumber: 'F2LX9K3Q', imei: '356938035643809' },
  itemsLabel: 'Pièces',
  quantityLabel: 'Qté',
  items: [
    { label: 'Écran OLED compatible iPhone 13', quantity: '1' },
    { label: 'Batterie lithium 3 240 mAh', quantity: '1' },
    { label: 'Joint d’étanchéité + adhésif de remontage', quantity: '2' },
  ],
  warranty: kind === 'invoice' ? 'Garantie pièces 6 mois' : 'Garantie pièces et main-d’œuvre 6 mois',
  reminderLabel: kind === 'invoice' ? 'FACTURE' : 'DEVIS',
  reminderPenalty: '',
  mileage: { km: '18', rate: '0,55 €', total: '9,90 €', visible: true },
  totalTtc: '289,00 €',
  cgv: 'Acompte de 30 % à la commande pour les devis supérieurs à 500 €. Le solde est dû à la remise de l’appareil. Les pièces remplacées restent la propriété du client sur demande.',
  legal: ['Montants exprimés en euros TTC (TVA 20 %).', 'Assurance professionnelle : AXA France — contrat n° 1 204 558.'],
  theme: { accent: '#0b63ce', dark: '#0b1220', font: 'sans', radius: 'round', variant: 'classic', customized: false },
});

const variants = {
  'aurion-minimal': (t) => ({ ...t, theme: { ...t.theme, variant: 'minimal', radius: 'square', font: 'sans', dark: '#111827', accent: '#155e75' } }),
  'aurion-classic': (t) => t,
  'aurion-signature': (t) => ({ ...t, theme: { ...t.theme, variant: 'signature', radius: 'round', font: 'serif', dark: '#2b1f14', accent: '#a16207' } }),
  'aurion-horizon': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'square', font: 'sans', dark: '#042f2e', accent: '#0d9488' } }),
  'aurion-orchidee': (t) => ({ ...t, theme: { ...t.theme, variant: 'signature', radius: 'round', font: 'serif', dark: '#2e1065', accent: '#a855f7' } }),
  'aurion-encre': (t) => ({ ...t, theme: { ...t.theme, variant: 'minimal', radius: 'square', font: 'sans', dark: '#111827', accent: '#374151' } }),
  'aurion-corail': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'square', font: 'sans', dark: '#4c0519', accent: '#f43f5e' } }),
  'aurion-glacier': (t) => ({ ...t, theme: { ...t.theme, variant: 'minimal', radius: 'round', font: 'sans', dark: '#0c4a6e', accent: '#0369a1' } }),
  'aurion-ardoise': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'square', font: 'sans', dark: '#1f2937', accent: '#475569' } }),
  'aurion-azur': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'round', font: 'sans', dark: '#0c4a6e', accent: '#0284c7' } }),
  'aurion-terracotta': (t) => ({ ...t, theme: { ...t.theme, variant: 'signature', radius: 'round', font: 'serif', dark: '#431407', accent: '#c2410c' } }),
  'aurion-foret': (t) => ({ ...t, theme: { ...t.theme, variant: 'minimal', radius: 'square', font: 'sans', dark: '#052e16', accent: '#15803d' } }),
  // V2 — huit ambiances supplémentaires (catalogue à 20 modèles).
  'aurion-ivoire': (t) => ({ ...t, theme: { ...t.theme, variant: 'signature', radius: 'round', font: 'serif', dark: '#3b2f1b', accent: '#8a6a2f' } }),
  'aurion-ocean': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'round', font: 'sans', dark: '#082f49', accent: '#0e7490' } }),
  'aurion-menthe': (t) => ({ ...t, theme: { ...t.theme, variant: 'minimal', radius: 'square', font: 'sans', dark: '#042f2e', accent: '#0f766e' } }),
  'aurion-bordeaux': (t) => ({ ...t, theme: { ...t.theme, variant: 'signature', radius: 'round', font: 'serif', dark: '#4c0519', accent: '#9f1239' } }),
  'aurion-indigo': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'square', font: 'sans', dark: '#1e1b4b', accent: '#4338ca' } }),
  'aurion-ambre': (t) => ({ ...t, theme: { ...t.theme, variant: 'signature', radius: 'round', font: 'serif', dark: '#431407', accent: '#b45309' } }),
  'aurion-rubis': (t) => ({ ...t, theme: { ...t.theme, variant: 'classic', radius: 'round', font: 'sans', dark: '#4c0519', accent: '#be123c' } }),
  'aurion-carbone': (t) => ({ ...t, theme: { ...t.theme, variant: 'minimal', radius: 'square', font: 'sans', dark: '#0f172a', accent: '#334155' } }),
};

const outDir = path.join(ROOT, 'assets/templates');
fs.mkdirSync(outDir, { recursive: true });
for (const kind of ['quote', 'invoice']) {
  for (const [variant, apply] of Object.entries(variants)) {
    const model = apply(baseModel(kind));
    const pdf = await buildPdf(model);
    const out = path.join(outDir, `${kind}-${variant}.pdf`);
    fs.writeFileSync(out, pdf);
    console.log(`✔ ${path.relative(ROOT, out)} (${pdf.length} octets)`);
  }
}
console.log('Aperçus régénérés.');
