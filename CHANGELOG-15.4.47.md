# CHANGELOG 15.4.47

## Objet de la livraison

Intégration de la **fiche d'exigence V2 « moteur de propositions de métiers »** formalisée par
l'éditeur le 20 novembre 2026 (classement multi-propositions, niveaux de confiance explicites
et expliqués, conservation systématique des choix manuels), après audit ligne à ligne du
socle 15.4.46 contre cette fiche et contre les exigences de développement V2 associées.

**Diagnostic de l'audit** : les fondations étaient déjà livrées et vérifiées (moteur
`proposeProfilesFromSignals`, échelle à quatre niveaux, invariant de conservation avec un seul
point d'écriture, journal RLS répliqué, écrans paramètres/parcours, export CSV d'exploitation).
Trois écarts réels ont été relevés et corrigés dans cette version ; aucun n'invalidait la
livraison 15.4.46.

## Fichiers modifiés ou ajoutés (rôle dans l'évolution)

| Fichier | Rôle dans l'évolution 15.4.47 |
|---|---|
| `backend/src/services/micro-detection.ts` | 1) **Seuils centralisés** (exigence §5 « centralisés et configurables ») : toutes les pondérations et plafonds migrent dans une constante exportée unique `PROPOSAL_TUNING` (NAF +50, description +10/mot-clé plafond 25, nom +15, catalogue +6/+4 plafond 30, secondaires +8 plafond 15, score plafond 100, 5 propositions max, seuil catalogue-seul, seuil de contradiction). 2) **Contradictions entre familles** (tableau 2 de la fiche) : le profil qui ressort le plus fort du texte hors NAF devient la référence de contradiction ; un candidat pointé par le code NAF mais contredit par le texte reçoit une raison « Signal contraire : … » et ne peut plus atteindre « très élevé » (critère « aucune contradiction ») ; expliquée, la contradiction ne rétrograde pas « élevé ». 3) **Données manquantes expliquées** (§5) : les propositions citent désormais « Donnée manquante : … » (pas de code APE, pas de description, catalogue vide). Comportement du classement inchangé pour tous les cas calibrés. |
| `backend/tests/v2-profile-proposals.contract.test.mjs` | Extension (jamais affaiblie) : 4 nouveaux tests — centralisation des seuils (plus aucun littéral dispersé, tous les champs de `PROPOSAL_TUNING` réellement lus), critères contradiction/données manquantes écrits dans le code, scénario unitaire de contradiction déterministe (NAF 43.21 vs texte plomberie : « électrique » plafonné à « élevé », contradiction citée, preuves du concurrent affichées), explication des données manquantes dans les raisons affichées. |
| `backend/tests/v2-profile-selection.integration.test.mjs` | **Nouveau** : test d'intégration PostgreSQL réel (exigence §11 « vérifier les résultats réellement enregistrés en base ») couvrant les tests 8-20 et 24 du développement V2 : choix manuel → détection ne l'écrase pas (vérifié en base) ; PATCH organisation (SIRET/SIREN) et PATCH activité (nom, description) → surcharge, origine et `chosen_at` inchangés ; re-choix du même métier → aucune rétrogradation ; changement volontaire confirmé → nouvelle décision datée et journalisée ; retrait volontaire → suppression et événement « removed » ; **écritures concurrentes** (Promise.all) → une seule ligne, aucune destruction, origine jamais rétrogradée ; **isolation A/B** → une organisation ne peut ni lire ni écrire le choix d'une autre (404) ; séquence complète du journal reconstruisible (`manual_change → proposed → manual_change → confirmed → removed`) avec contenu affiché conservé. |
| `docs/CONCEPTION-V2-FICHE-EXIGENCE-01-MOTEUR-PROPOSITIONS.md` | **Nouveau** : la fiche d'exigence de l'éditeur intégrée au dépôt (première fiche de la conception V2), avec ses dix chapitres, le tableau du socle 15.4.41, l'échelle de confiance et ses critères, les cinq invariants de conservation, les critères de validation/preuves et **l'annexe de traçabilité des 24 tests exigés → fichiers de tests réels**. Annexe B : points restants (fiche chantier 3 non transmise — titre seul ; recette OVH à planifier). |
| `VERSION.txt`, `backend/VERSION.txt` | Version 15.4.47. |
| `package.json`, `backend/package.json`, `package-lock.json`, `backend/package-lock.json` | Version 15.4.47. |
| `sw.js` | Cache shell `aurion-shell-v15.4.47-r1` (invalidation du cache PWA pour servir le moteur mis à jour). |
| `CHANGELOG-15.4.47.md` | Le présent fichier. |

## Règles respectées (contraintes §13)

- V1 figée, aucun push/commit/déploiement, aucune migration existante modifiée (093/094
  inchangées ; aucune nouvelle migration nécessaire : les trois correctifs ne touchent pas le
  schéma).
- Aucune fonctionnalité retirée ; aucun second moteur parallèle ; scoring déterministe et
  local ; détection toujours déclenchée par une action explicite ; aucune détection par nom
  d'entreprise dans les paramètres (contrats 15.4.45 inchangés et verts).

## Fiches d'exigence réceptionnées le 21 novembre 2026 (complément d'intégration)

Le document éditeur transmis le 21 novembre (correction du document du 20 novembre) contient
cinq fiches complètes : les quatre du message initial plus le corps du « prompt technique
n° 7 », transmis séparément après son fragment titre-seul. Intégration au backlog de la
conception V2 :

| Fiche | Intégration | État |
|---|---|---|
| Chantier 3 — Enrichissement et structuration du catalogue métier | `docs/CONCEPTION-V2-FICHE-EXIGENCE-02-CATALOGUE-METIER.md` (corps complet, attendu depuis le 20 novembre) | Chantier en partie livré (métadonnées, corpus, personnalisation protégée, intégration moteur) ; annexe d'état de conformité incluse avec les points restants hiérarchisée |
| Référentiel fiscal, social, juridique et réglementaire intelligent | `docs/CONCEPTION-V2-FICHE-EXIGENCE-03-REFERENTIEL-REGLEMENTAIRE.md` | **Chantier futur, non démarré** : exigence réceptionnée uniquement |
| Socle transversal d'événements, alertes, confirmations et validations | `docs/CONCEPTION-V2-FICHE-EXIGENCE-04-SOCLE-EVENEMENTS-ALERTES-VALIDATIONS.md` | **Chantier futur, non démarré** : exigence réceptionnée uniquement |
| CRM avancé, gestion clients et historique relationnel unifié | `docs/CONCEPTION-V2-FICHE-EXIGENCE-05-CRM-CLIENTS.md` (corps complet reçu le 21 novembre, complément) | **Chantier futur, non démarré** : exigence réceptionnée uniquement ; annexe d'état du CRM V1 incluse (`clientSummary()`, adresses d'intervention, garanties, relances, import) |
| PROMPT TECHNIQUE N° 7 — Refonte et extension du cycle commercial | `docs/CONCEPTION-V2-FICHE-EXIGENCE-06-CYCLE-COMMERCIAL.md` (corps complet de 1316 lignes transmis le 21 novembre après son fragment titre-seul) | **Chantier futur, non démarré** : exigence réceptionnée uniquement ; annexe d'état du cycle commercial V1 incluse (`invoice-workflow.ts`, `pricing.ts`, paiements partiels/échéanciers, facturation électronique et récurrente) |

L'annexe B de la fiche 01 est mise à jour en conséquence : les cinq fiches réceptionnées le
21 novembre 2026 sont intégrées et aucun fragment de document éditeur n'est en attente.

## Vérifications de la livraison

- `tsc --noEmit` + build : 0 erreur.
- Corpus de calibrage rejoué : 45/45 (`tools/calibration-replay.mjs`), têtes inchangées.
- Contrats V2 : 11/11 verts (`v2-profile-proposals` étendu), calibration/secondaires/UX/a11y/e2e-fixes verts.
- Intégration PostgreSQL 17 réel provisionné (deux rôles, RLS) : batterie complète verte,
  dont les 3 nouveaux tests du cycle de vie du choix.
