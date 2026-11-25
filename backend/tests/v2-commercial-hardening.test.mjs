// Contrats de la livraison V2 (15.6.0) — vérifications statiques ciblées.
//
// Ces tests ne remplacent pas les tests PostgreSQL : ils empêchent une régression silencieuse
// des contrats qui ont déjà bloqué la commercialisation (colonne comptable manquante, porte
// juridique désalignée, catalogue de modèles incomplet, prix divergents).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('comptabilité : la migration additive fournit voided_at et l’index des écritures actives', () => {
  const migration = read('../migrations/125_accounting_entries_voided_at.sql');
  assert.match(migration, /alter table if exists accounting_entries[\s\S]*add column if not exists voided_at timestamptz/i);
  assert.match(migration, /create index if not exists idx_accounting_entries_active[\s\S]*where voided_at is null/i,
    'les rapports ne doivent parcourir que les écritures actives');
  assert.doesNotMatch(migration, /delete from accounting_entries|update accounting_entries set voided_at/i,
    'la migration ne doit annuler aucune écriture historique');
});

test('comptabilité : l’annulation et les exports utilisent le même contrat voided_at', () => {
  const business = read('../src/routes/business.ts');
  const report = read('../src/services/accounting-report.ts');
  const exportService = read('../src/services/accounting-export.ts');
  assert.match(business, /update accounting_entries set voided_at=now\(\)[\s\S]*voided_at is null/);
  assert.match(report, /from accounting_entries[\s\S]*voided_at is null/);
  assert.match(exportService, /voided_at is null/);
});

test('juridique : la porte applicative et le pré-vol annoncent la même version 5.1', () => {
  const account = read('../src/services/account.ts');
  const verifier = read('../scripts/check-legal-readiness.mjs');
  assert.match(account, /AURION_LEGAL_PUBLICATION_APPROVAL === '5\.1'/);
  assert.match(account, /legalDocumentsReadyForContracts\(requiredVersion = '5\.1'\)/);
  assert.match(verifier, /APPROVAL_EXPECTED = '5\.1'/);
  assert.doesNotMatch(verifier, /APPROVAL_EXPECTED = '5\.0'|porte de publication 5\.0/);
  for (const doc of ['../../docs/GO-LIVE-15.4.51.md', '../../docs/CONTRAT-PILOTE.md']) {
    assert.doesNotMatch(read(doc), /v5\.0|5\.0\)/, `${doc} ne doit plus figer l’ancienne version`);
  }
});

test('documents : les 20 modèles annoncés sont tous rendus et exposés par l’API', () => {
  const styles = read('../src/services/document-styles.ts');
  const ids = [...styles.matchAll(/id: '(aurion-[a-z]+)'/g)].map(m => m[1]);
  assert.equal(ids.length, 20);
  assert.equal(new Set(ids).size, 20);
  for (const id of ids) {
    assert.ok(existsSync(new URL(`../../assets/templates/quote-${id}.pdf`, import.meta.url)), `PDF devis manquant : ${id}`);
    assert.ok(existsSync(new URL(`../../assets/templates/invoice-${id}.pdf`, import.meta.url)), `PDF facture manquant : ${id}`);
    assert.ok(existsSync(new URL(`../../assets/templates/previews/quote-${id}.png`, import.meta.url)), `aperçu devis manquant : ${id}`);
    assert.ok(existsSync(new URL(`../../assets/templates/previews/invoice-${id}.png`, import.meta.url)), `aperçu facture manquant : ${id}`);
  }
  const routes = read('../src/routes/documents.ts');
  const renderer = read('../src/services/document-renderer.ts');
  assert.match(routes, /DOCUMENT_STYLE_IDS/);
  assert.match(routes, /catalog:DOCUMENT_STYLES/);
  assert.match(renderer, /themeForDocumentStyle\(selectedStyle\)/);
  const ui = read('../../assets/js/pages/dash/other.js');
  assert.match(ui, /const TEMPLATE_STYLES=\[/);
  assert.equal([...ui.matchAll(/\['aurion-[a-z]+',/g)].length, 20, 'le carrousel doit afficher les 20 modèles');
});

test('tarification : une seule grille de 14 € / 151,20 € dans les plans et les CGU', () => {
  const migration = read('../migrations/072_micro_enterprise_subscription_prices.sql');
  const cgu = read('../../docs/CGU-CGV.md');
  const tarifs = read('../../docs/TARIFS-ABONNEMENT.md');
  const pilot = read('../../docs/CONTRAT-PILOTE.md');
  assert.match(migration, /when 'monthly' then 1400/);
  assert.match(migration, /when 'yearly' then 15120/);
  assert.match(cgu, /14,00 € par mois/);
  assert.match(cgu, /151,20 € par an/);
  assert.doesNotMatch(migration, /3900|1950/);
  // La grille commerciale ne doit plus annoncer 39 € : c'était une documentation contradictoire.
  assert.match(tarifs, /14,00 € TTC \/ mois/);
  assert.match(tarifs, /151,20 € TTC \/ an/);
  assert.doesNotMatch(tarifs, /39 €|19,50/);
  // Le pilote est une remise de 50 % sur la grille réelle, pas un tarif indépendant.
  assert.match(pilot, /7,00 €\/mois/);
  assert.doesNotMatch(pilot, /19,50/);
  // Le modèle livré est un paiement ponctuel : les CGU et le runbook doivent le dire.
  assert.match(cgu, /sans reconduction automatique/);
  assert.match(tarifs, /mode=payment/);
});
