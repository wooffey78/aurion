// Prompt 01 — scénarios réels du service de détection SIRET/SIREN (fetcher injectable, sans
// appel réseau réel) : sans résultat, entreprise cessée, établissement fermé, établissement
// secondaire, homonymie, données incomplètes, erreur réseau, limiteur de débit, identifiants
// invalides (longueur, clé de contrôle, exception La Poste), recherche par nom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupFrenchCompany, searchFrenchCompaniesByName, normalizeSiret, normalizeSiren, isValidSiretChecksum, isValidSirenChecksum, frenchVatNumber, RegistryError } from '../dist/services/public-registry.js';

const json = (body, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// SIREN/SIRET de test à clé de contrôle valide (Luhn) : 552100554 (siège Xerox France, documenté
// comme exemple INSEE) ; SIRET secondaire fictif à clé valide calculée ci-dessous.
function luhnSiret(siren, suffix4) {
  // Construit un SIRET valide : clé = complément à 3 du contrôle Luhn sur 13 chiffres.
  let sum = 0;
  const digits = siren + suffix4;
  let parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === parity) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  const key = (10 - (sum % 10)) % 10;
  // La clé porte sur le 14e chiffre : on recalcule proprement.
  for (let candidate = 0; candidate <= 9; candidate++) {
    const full = siren + suffix4 + String(candidate);
    if (isValidSiretChecksum(full)) return full;
  }
  return null;
}

const SIREN = '552100554';
const SIRET_HQ = luhnSiret(SIREN, '0001') || '55210055400013';
// Vérifie que les identifiants de test sont valides (garde du corpus lui-même).
test('corpus : les identifiants de test sont valides (Luhn)', () => {
  assert.equal(isValidSirenChecksum(SIREN), true, 'SIREN de test invalide');
  assert.equal(isValidSiretChecksum(SIRET_HQ), true, 'SIRET de test invalide');
});

test('entreprise trouvée : établissements connus listés, siège repéré, TVA calculée', async () => {
  const secondary = { siret: SIRET_HQ === '55210055400013' ? '55210055400021' : '55210055400015', adresse: '12 rue de l’Atelier', code_postal: '69002', libelle_commune: 'Lyon', etat_administratif: 'A', est_siege: false };
  const fetcher = json({
    results: [{
      siren: SIREN, nom_complet: 'ATELIER DU CENTRE', nature_juridique: '1000', etat_administratif: 'A',
      activite_principale: '43.21A', activite_principale_libelle: 'Travaux de maçonnerie',
      siege: { siret: SIRET_HQ, adresse: '1 place Centrale', code_postal: '69001', libelle_commune: 'Lyon', etat_administratif: 'A', est_siege: true },
      matching_etablissements: [secondary],
    }],
  });
  const c = await lookupFrenchCompany(SIREN, fetcher);
  assert.ok(c);
  assert.equal(c.legalName, 'ATELIER DU CENTRE');
  assert.equal(c.isHeadOffice, true);
  assert.equal(c.legalFormCode, '1000');
  assert.equal(c.vatNumber, frenchVatNumber(SIREN));
  assert.ok(Array.isArray(c.establishments));
  assert.equal(c.establishments.length, 2);
  assert.equal(c.establishments.filter(e => e.isHeadOffice).length, 1);
  assert.equal(c.establishments[1].closed, false);
});

test('SIRET d’un établissement secondaire : l’établissement demandé est retenu, divergence visible', async () => {
  const sec = { siret: SIRET_HQ === '55210055400013' ? '55210055400021' : '55210055400015', adresse: '12 rue de l’Atelier', code_postal: '69002', libelle_commune: 'Lyon', etat_administratif: 'A', est_siege: false };
  const fetcher = json({
    results: [{
      siren: SIREN, nom_complet: 'ATELIER DU CENTRE', nature_juridique: '1000', etat_administratif: 'A',
      siege: { siret: SIRET_HQ, adresse: '1 place Centrale', code_postal: '69001', libelle_commune: 'Lyon', est_siege: true },
      matching_etablissements: [sec],
    }],
  });
  const c = await lookupFrenchCompany(sec.siret, fetcher);
  assert.ok(c);
  assert.equal(c.siret, sec.siret);
  assert.equal(c.isHeadOffice, false);
  assert.equal(c.city, 'Lyon');
  // Prompt 01 — divergence siège/secondaire visible : le siège figure dans la liste.
  assert.ok(c.establishments.some(e => e.isHeadOffice && e.siret !== c.siret));
});

test('sans résultat / entreprise cessée / établissement fermé', async () => {
  assert.equal(await lookupFrenchCompany(SIREN, json({ results: [] })), null);
  const closed = await lookupFrenchCompany(SIREN, json({ results: [{ siren: SIREN, nom_complet: 'CESSÉE', nature_juridique: '1000', etat_administratif: 'C', siege: { siret: SIRET_HQ, etat_administratif: 'A', est_siege: true } }] }));
  assert.equal(closed?.closed, true);
  const etabClosed = await lookupFrenchCompany(SIRET_HQ, json({ results: [{ siren: SIREN, nom_complet: 'CESSÉE ÉTAB', nature_juridique: '1000', etat_administratif: 'A', siege: { siret: SIRET_HQ, etat_administratif: 'F', est_siege: true } }] }));
  assert.equal(etabClosed?.establishmentClosed, true);
  // SIRET demandé absent des établissements renvoyés → null (jamais d’invention).
  assert.equal(await lookupFrenchCompany(SIRET_HQ, json({ results: [{ siren: SIREN, nom_complet: 'X', siege: { siret: '99999999900011' } }] })), null);
});

test('homonymie : la recherche par nom retourne plusieurs choix, l’utilisateur tranche', async () => {
  const fetcher = json({ results: [
    { siren: SIREN, nom_complet: 'DUPONT SARL', nature_juridique: '5410', siege: { siret: SIRET_HQ, est_siege: true } },
    { siren: '443000166', nom_complet: 'DUPONT EI', nature_juridique: '1000', siege: { siret: '44300016600012' } },
  ] });
  const rows = await searchFrenchCompaniesByName('dupont', fetcher);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.legalName).sort(), ['DUPONT EI', 'DUPONT SARL']);
});

test('données incomplètes : les champs absents restent vides, rien n’est inventé', async () => {
  const c = await lookupFrenchCompany(SIREN, json({ results: [{ siren: SIREN, nom_complet: '', siege: {} }] }));
  assert.ok(c);
  assert.equal(c.legalName, '');
  assert.equal(c.address, '');
  assert.equal(c.city, '');
  // Un établissement sans SIRET n'est jamais affiché comme établissement connu.
  assert.equal(c.establishments.length, 0);
});

test('erreur réseau → REGISTRY_UNAVAILABLE ; HTTP 429 → REGISTRY_RATE_LIMITED', async () => {
  await assert.rejects(() => lookupFrenchCompany(SIREN, async () => { throw new Error('down'); }), (e) => e instanceof RegistryError && e.code === 'REGISTRY_UNAVAILABLE');
  await assert.rejects(() => lookupFrenchCompany(SIREN, json({}, 429)), (e) => e instanceof RegistryError && e.code === 'REGISTRY_RATE_LIMITED');
  await assert.rejects(() => lookupFrenchCompany(SIREN, json({}, 500)), (e) => e instanceof RegistryError && e.code === 'REGISTRY_UNAVAILABLE');
});

test('identifiants invalides : longueur, clé de contrôle, exception La Poste', async () => {
  await assert.rejects(() => lookupFrenchCompany('123', async () => ({})), /9 chiffres et un SIRET 14 chiffres/);
  await assert.rejects(() => lookupFrenchCompany('552100555', async () => ({})), /clé de contrôle/);
  await assert.rejects(() => lookupFrenchCompany('abcdefghi', async () => ({})), /9 chiffres et un SIRET 14 chiffres/);
  // La Poste : Luhn peut échouer, la clé « somme multiple de 5 » est acceptée (INSEE).
  assert.equal(isValidSiretChecksum('35600000012341'), true);
  assert.throws(() => normalizeSiren('552100555'), /invalide/);
  assert.equal(normalizeSiren('552 100 554'), SIREN);
});

test('recherche par nom invalide : chiffres seuls ou saisie trop courte refusés', async () => {
  await assert.rejects(() => searchFrenchCompaniesByName('12345', async () => ({})), /au moins deux caractères/);
  await assert.rejects(() => searchFrenchCompaniesByName('a', async () => ({})), /au moins deux caractères/);
});
