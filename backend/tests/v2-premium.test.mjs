// Contrats V2 « Aurion premium » — vérifications ciblées des corrections demandées.
// Ces tests n'ont besoin ni de PostgreSQL ni de LibreOffice : le décodeur PDF intégré est pur,
// et les contrats d'interface lisent les sources livrées.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPdf} from '../src/services/document-layout.ts';
import {extractPdfText, parseBordereau, extractText} from '../src/services/bordereau-parser.ts';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

function sampleModel(overrides = {}) {
  return {
    kind: 'quote', title: 'DEVIS', number: 'DEV-2026-0042', date: '25/11/2026',
    company: {name: 'Atelier Lumière', activity: 'Réparation', siret: '', address: '', postalCode: '', city: '', website: ''},
    client: {name: 'Camille Fournier', address: '12 rue des Lilas\n75011 Paris', interventionAddress: ''},
    interventionLabel: 'Prestation', intervention: 'Diagnostic et remise en état',
    itemsLabel: 'Pièces', quantityLabel: 'Qté',
    items: [{label: 'Écran OLED', quantity: '1'}, {label: 'Batterie', quantity: '1'}],
    warranty: 'Garantie 6 mois', mileage: {km: '0', rate: '0,00 €', total: '0,00 €', visible: false},
    totalTtc: '289,00 €', cgv: 'Acompte de 30 % à la commande.', legal: ['TVA 20 %.'],
    theme: {accent: '#0b63ce', dark: '#0b1220', font: 'sans', radius: 'round', variant: 'classic', customized: false},
    ...overrides,
  };
}

test('PDF : le texte est extractible sans LibreOffice et aucun champ vide n’affiche « null »', async () => {
  const pdf = await buildPdf(sampleModel());
  const text = extractPdfText(pdf);
  assert.match(text, /Atelier Lumière/);
  assert.match(text, /Camille Fournier/);
  assert.match(text, /Écran OLED/);
  assert.doesNotMatch(text, /\bnull\b/i);
  assert.doesNotMatch(text, /\bundefined\b/i);
  // Les champs laissés vides (SIRET, adresse d’intervention) restent absents, pas « null ».
  const email = await extractText('bordereau.pdf', 'application/pdf', pdf, async () => { throw Object.assign(new Error('spawnSync pdftotext ENOENT'), {code: 'ENOENT'}); });
  assert.match(email, /Atelier Lumière/);
});

test('bordereau : un PDF texte est lu par le décodeur intégré, même sans soffice/pdftotext', async () => {
  const pdf = await buildPdf(sampleModel({kind: 'invoice', title: 'FACTURE'}));
  const run = async () => { throw Object.assign(new Error('spawnSync soffice ENOENT'), {code: 'ENOENT'}); };
  const text = await extractText('facture.pdf', 'application/pdf', pdf, run);
  assert.match(text, /Atelier Lumière/);
  assert.match(text, /Camille Fournier/);
});

test('bordereau : l’analyse déterministe conserve les montants et la confiance des champs', () => {
  const parsed = parseBordereau(`BORDEREAU DE LIVRAISON\nClient : Atelier Lumière\nDate : 25/11/2026\nTotal HT : 120,00 €\nTVA : 24,00 €\nTotal TTC : 144,00 €\nÉcran OLED 2 x 45,00\n`);
  assert.equal(parsed.totals.ht, 120);
  assert.equal(parsed.totals.vat, 24);
  assert.equal(parsed.totals.ttc, 144);
  assert.ok(parsed.fields.some(f => f.key === 'client' && f.confidence === 'labeled'));
});

test('journal de bord : les actions sont empilées, alignées et espacées', () => {
  const css = read('assets/css/app.css');
  const other = read('assets/js/pages/dash/other.js');
  assert.match(other, /class="journal-links"/);
  assert.match(other, /class="journal-action-links"/);
  assert.match(css, /\.journal-links,\.journal-actions\{display:flex;flex-direction:column;align-items:flex-start;gap:6px/);
  assert.match(css, /\.journal-action-links\{display:flex;flex-direction:column;align-items:flex-start;gap:5px\}/);
  assert.doesNotMatch(other, /journal-actions"><span>[^<]*<\/span><button/);
});

test('accueil : les derniers documents s’ouvrent directement en PDF', () => {
  const other = read('assets/js/pages/dash/other.js');
  assert.match(other, /data-recent-doc=/);
  assert.match(other, /data-recent-kind=/);
  assert.match(other, /\[data-recent-doc\]'\)\.forEach\(btn=>btn\.addEventListener\('click',\(\)=>openDoc\(/);
});

test('carrousel : 20 lots numérotés, devis + facture ensemble, compteur de tours', () => {
  const styles = read('backend/src/services/document-styles.ts');
  const other = read('assets/js/pages/dash/other.js');
  assert.equal([...styles.matchAll(/id: '(aurion-[a-z]+)'/g)].length, 20);
  assert.equal([...other.matchAll(/\['aurion-[a-z]+',/g)].length, 20);
  assert.match(other, /String\(i\+1\)\.padStart\(2,'0'\)/);
  assert.match(other, /id="template-current"/);
  assert.match(other, /id="template-turns"/);
  assert.match(other, /saveDocumentTemplateChoices\(\{quote:style,invoice:style\}\)/);
});

test('calculs : la main-d’œuvre facturée est intégrée au TTC client et au brouillon', () => {
  const quote = read('assets/js/pages/dash/quote.js');
  assert.match(quote, /let lastLabourTtc=0/);
  assert.match(quote, /const labourTtc=\(\)=>/);
  assert.match(quote, /target\+next-lastLabourTtc/);
  assert.match(quote, /dont main-d’œuvre facturée \(TTC\)/);
  assert.match(quote, /labor_selling_ht:r2\(num\('#laborSellingHt'\)\)/);
});

test('administration : les données sont présentées en diagrammes au choix de l’utilisateur', () => {
  const other = read('assets/js/pages/dash/other.js');
  assert.match(other, /chartToolbar\('admin-chart'/);
  assert.match(other, /bindChartToolbar\(root, 'admin-chart'/);
  assert.match(other, /localStorage\.setItem\('aurion\.adminChartType'/);
  assert.match(other, /renderChart\('admin-chart', adminDataset, adminChartType\)/);
});

test('onboarding : les fonctions absentes sont proposées et recommandées automatiquement', () => {
  const onboarding = read('assets/js/pages/onboarding.js');
  assert.match(onboarding, /ADVANCED_QUESTIONS/);
  for (const key of ['chantiers', 'maintenance', 'warranty', 'time', 'device', 'portal', 'einvoice', 'forecast']) {
    assert.match(onboarding, new RegExp(`\\['${key}',`), `question absente : ${key}`);
  }
  assert.match(onboarding, /Détecter les modules recommandés/);
  assert.match(onboarding, /const modules=\{[\s\S]*chantiers:'chantiers'/);
  const migration = read('backend/migrations/126_module_catalog_v2.sql');
  assert.match(migration, /'maintenance'/);
  assert.match(migration, /'einvoice'/);
  assert.match(migration, /on conflict\(key\) do nothing/);
});
