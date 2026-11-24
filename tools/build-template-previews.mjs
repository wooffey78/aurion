// 15.4.54 — régénère les 6 aperçus PDF statiques de la page « Modèles de documents »
// (assets/templates/{quote,invoice}-aurion-{minimal,classic,signature}.pdf).
// Chaque aperçu est produit par le moteur natif réel (backend/src/services/document-layout.ts)
// avec la variante correspondante, sur un jeu de données d'exemple : la page de choix montre
// ainsi les VRAIES différences de mise en page entre les trois modèles.
// Usage : node tools/build-template-previews.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildPdf } = await import(path.join(ROOT, 'backend/src/services/document-layout.ts'));

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
