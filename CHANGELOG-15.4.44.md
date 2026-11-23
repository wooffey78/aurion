# CHANGELOG — Aurion 15.4.44

Version V2 (chantier 3) : **calibrage étendu du corpus** du moteur de propositions — le moteur reconnaît les formulations courantes des métiers micro, avec un **corpus de calibrage rejouable** et de nouveaux invariants épinglés. La 15.4.43 (écrans, origine non rétrogradable, export CSV) est conservée à l'identique.

## 1. Corpus de détection étendu (mots-clés et règles)

- **Vocabulaire étendu pour les 29 métiers indexés** (`EXTRA_KEYWORDS`, `services/profiles.ts`) : de 4-5 à environ 10-11 indices par métier (formulations clients courantes, synonymes métier — ex. « coiffure à domicile », « nettoyage de bureaux », « ravalement », « sonorisation », « biens immobiliers », « livraison de colis »…). Vocabulaire spécifique uniquement : chaque indice reste une preuve citable sans ambiguïté.
- **Règles de texte pour les dix profils restés sans indices** (`RULES`) : aide à la personne, bien-être, agriculture, hébergement, immobilier, sécurité, musique/son, rédaction/traduction, garde d'enfants, commerce de détail — rappel accru sur le vocabulaire de base (avec variantes sans accents).
- **Invariant de design épinglé** : le profil générique `generic-services` reste **sans aucun indice** (aucun mot-clé, aucune prestation, aucune pièce) — il ne peut jamais être proposé automatiquement ; c'est l'option explicitement humaine pour les métiers hors catalogue.

## 2. Indices NAF révision 2 : corrections et extension

- **Deux notes corrigées** (inversion factuelle) : 43.31 = travaux de **plâtrerie**, 43.34 = travaux de **peinture et vitrerie**.
- **33 hints NAF ajoutés** (préfixes disjoints des existants, divisions/sous-divisions révision 2 courantes du micro) : 41.20 et 43.32/43.33/43.91/43.99 (bâtiment), 45.20/45.31 (garage), 49.39/52.29 (transport), 55.30/55.90 (hébergement), 56.29 (restauration), 62.03/62.09/63.11 (informatique), 69.20/70.22/78.10 (conseil/gestion), 70.21/74.10 (communication/design), 80.30 (sécurité), 81.29 (entretien), 85.32/85.52 (enseignement), 85.53 (sport), 88.51 (crèches), 90.02 (spectacle), 95.22/95.23 (retouches/cuir), 01.11/01.47 (agriculture), 32.12 (bijouterie), 47.75/47.78 (commerce de détail). Les notes restent descriptives et indicatives (jamais une preuve des prestations réelles), avec prudence sur les régimes spécifiques (MSA, professions réglementées).
- Les résolutions déjà couvertes restent stables (re-testées : 62.01Z, 55.20Z, 68.31Z, 80.10Z, 88.91A, 01.13Z, 47.11F).

## 3. Corpus de calibrage rejouable (nouveauté de test)

- Nouveau fichier `backend/tests/v2-profile-calibration.contract.test.mjs` :
  - **24 combinaisons réalistes nom/description/NAF** → la bonne proposition arrive en tête (coiffure, plomberie, smartphone, couture, toilettage, maraîchage, hébergement, bâtiment, cours, web, bien-être, assistance administrative, moto, son, immobilier, sécurité, livraison, traiteur, artisanat, garde d'enfants, nettoyage, rédaction, électricité, commerce de détail) — niveaux de confiance attendus vérifiés selon la grille documentée ;
  - **hygiène du corpus** : chaque métier indexé a ≥ 4 indices, aucun mot-clé partagé entre deux métiers (citations non ambiguës), préfixes NAF valides, disjoints et résolus vers des profils existants ;
  - **précision conservée** : un texte sans vocabulaire connu reste `faible`/`requiresConfirmation`, rien n'est imaginé ;
  - **déterminisme** du moteur recalibré (profondeur d'égalité sur double exécution).
- Ce corpus doit être **rejoué à chaque extension du catalogue**, conformément à la conception V2 : c'est le filet de sécurité du chantier 3.

## 4. Compatibilité

- Moteur, routes et schéma **inchangés** : les extensions sont purement additives (listes de mots-clés, règles, hints). Le scoring, les quatre niveaux de confiance, `requiresConfirmation`, l'invariant de conservation des choix manuels et l'invariant d'écriture (1 insert / 1 delete) restent strictement identiques. Front, écrans et API : inchangés.

## 5. Tests et vérifications

- **77 tests rejoués, 73 passés, 0 échec** (4 skips contractuels : intégration PostgreSQL réelle hors base) — calibration V2 (nouveaux + existants épinglés : `web-development` tres-eleve sur 62.01Z, plumbing moyen sur catalogue seul), catalogue de profils 15.4.36, bloc 8, step18/29, versions harmonisées, suppression de compte, console d'administration, strict-requirements, bloc 3.
- `tsc --noEmit` (typecheck) et build : **0 erreur**.
- Doc de conception mise à jour (`docs/CONCEPTION-V2-MOTEUR-PROPOSITIONS.md`) : avancement des chantiers 2 et 3 et règle du profil générique.

## 6. Version

`VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, lockfiles, `index.html` et `sw.js` harmonisés en **15.4.44** (contrat générique de versions).
