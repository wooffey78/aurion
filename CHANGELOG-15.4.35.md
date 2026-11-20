# CHANGELOG — Aurion 15.4.35 (fusion complète)

Date : 20 novembre 2026.
Sources fusionnées : `aurion-15.4.34-consolidee.zip` (base retenue, la plus aboutie :
réplication hors ligne, Capacitor, CI GitHub, 84 migrations, contrats renforcés) et
`Aurion-15.4.25.zip` (ligne 15.4.24-main corrigée). Objectif : **une seule version
complète**, configurée pour GitHub + Render, documents juridiques mis à jour et
package.json harmonisé.

## 1. Porté depuis la 15.4.25 dans la 15.4.34

- **Suppression de compte complète (§5)** :
  - migrations renumérotées `088_account_deletion_requests.sql` et
    `089_account_deletion_processing.sql` (la séquence 084-086 de la 15.4.34 =
    réplication hors ligne, `087` = invitations ; dérogation documentée en tête de
    fichier, contenu inchangé, strictement additif) ;
  - service `backend/src/services/account-deletion.ts` : traitement réel, idempotent
    et relançable (sessions et jetons révoqués, secrets d'intégration supprimés pour
    les espaces mono-utilisateur, espaces multi-membres préservés, avatar supprimé,
    trace d'audit écrite AVANT l'effacement du compte, références VIP réattribuées) ;
  - routes compte : demande avec **confirmation forte par mot de passe** (argon2),
    annulation, page publique `/legal/suppression-compte` servie par le backend et
    endpoint public neutre anti-énumération (`POST /public/account-deletion-requests`) ;
  - console administrateur : section « Demandes de suppression de compte » branchée
    sur l'architecture à chargement indépendant et réessai par section de la 15.4.34
    (`adminLoaders.deletions`), traitement, rejet motivé, historique d'audit ;
  - page publique autonome CSP-conforme (`public/account-deletion.html/.css/.js`).
- **assetlinks** (`backend/src/routes/assetlinks.ts`) : Digital Asset Links pour
  l'association Android/TWA, complément de la configuration Capacitor de la 15.4.34.
- **Runner de migrations (§3.4)** : échec explicite sur toute NOUVELLE collision de
  préfixe (`MIGRATION_PREFIX_COLLISION`), dérogations historiques 042/044 seulement ;
  et grant `USAGE, CREATE ON SCHEMA public` à `aurion_admin` pour permettre la
  réexécution idempotente par le rôle d'administration (PostgreSQL 15+, intention
  documentée du test bloc3).

## 2. Apports de la 15.4.34 conservés (déjà présents, vérifiés)

Réplication hors ligne + outbox + delta + tombstones (migrations 084-086, services
`sync-replication`/`sync-ops`, `sync-manager`/`sync-ui`/`outbox`/`local-store` côté
interface), Capacitor + projet Android, CI GitHub avec PostgreSQL 17 et rôles séparés,
conversion essai → payant par cohorte, ventilation admin/VIP/mixtes, résiliations
programmées comptées séparément, fiches client enrichies (émis/encaissé/reste à payer),
adressage S3 path-style, statut réel des e-mails, pré-vol Render des variables
manquantes, module partagé de comparaison de baseline CI.

## 3. Consignes éditeur appliquées (15.4.35)

1. **Métiers élargis** : 8 nouveaux profils complets (traiteur/pâtisserie, couture/
   retouches, transport/livraison, services animaliers, cours et soutien, coaching
   sportif, artisanat/création, événementiel) — **20 profils** au total, chacun avec
   catalogue de prestations minutées, pièces, garanties, vocabulaire documents.
2. **Suggestions métier élargies** : mots-clés enrichis pour les 20 profils
   (synonymes d'intitulés réels) + correction d'ordre (coaching sportif avant conseil
   générique, `artisan` avec frontière de mot pour ne plus avaler « artisanaux »).
3. **Détection automatique améliorée** : indice `NAF_PROFILE_HINTS` (30 préfixes de
   code APE → métier) appliqué à `/activities/detect-profile` avec note de source ;
   le code NAF détecté est transmis par Paramètres et le parcours d'accueil ; la TVA
   intracommunautaire dérivée du SIREN remplit désormais le champ vide côté interface
   (`registry-fill.js`). Aucune détection n'écrase une donnée saisie (contrats
   existants conservés).
4. **Cotisations** : table `PROFILE_MICRO_CATEGORY` — chaque profil métier a une
   catégorie micro par défaut (vente BIC 12,30 %, services BIC 21,20 %, BNC 25,60 %,
   CIPAV 23,20 %, CFP et versement libératoire selon l'option) : **toutes les
   activités reçoivent des cotisations présentes et correctement configurées**, y
   compris quand leur nom ne contient aucun mot-clé typique ; +24 codes NAF ajoutés
   au mapping de proposition (proposition indicative, jamais imposée).
5. **Pas de faux zéro** : les encarts comptables affichent « à renseigner » au lieu
   de « 0,00 € » tant qu'aucune donnée n'a été saisie ; les frais kilométriques des
   devis/factures restaient déjà en placeholder (champs vides + exemples) — contrats
   vérifiés.
6. **Validation Aurion des devis/factures** : la création comme la modification sont
   confirmées par un dialogue Aurion récapitulant client, HT, TVA et TTC (jamais
   `alert()` natif) ; contrat ajouté interdisant tout dialogue natif dans le code.
7. **Curseur** : curseur sombre à contour clair (SVG en data URI) sur toute la
   coquille + I-beam sombre dans les champs de saisie — visible sur les champs clairs
   ET sur le fond sombre.
8. **Section administrateur** : présente et complétée (statistiques, tickets, VIP,
   virements, rétractations, **demandes de suppression**) — accessible au compte
   plateforme, chargement indépendant par section.
9. **GitHub + Render** : `autoDeploy: true` dans `render.yaml` (décision éditeur —
   chaque push `main` après CI verte déploie), CI `.github/workflows/aurion-ci.yml`
   conservée (PostgreSQL 17, rôles séparés, audit npm, mode strict), procédure
   première publication documentée (`docs/RENDER-GITHUB.md`, README).
10. **Documents juridiques** : les cinq documents publiés portent la révision
    technique 4.0 du 20 novembre 2026 ; la politique de confidentialité décrit le
    droit à l'effacement en ligne (page publique, délai 30 jours, trace minimale).
11. **package.json harmonisé** : 15.4.35 dans les deux manifestes, les deux
    lockfiles (champ racine + packages), `VERSION.txt`, `sw.js` et les cache-busting
    de `index.html` — un seul numéro partout, aligné à chaque livraison.

## 4. Tests

- Nouveau fichier `backend/tests/merge-15.4.35.contract.test.mjs` : **16 contrats**
  (séquence de migrations fusionnée, collision runner, suppression de compte, console
  admin, métiers/cotisations/détection, dialogue de validation, curseur, autodeploy,
  juridique, versions harmonisées).
- Six contrats mis au niveau du comportement corrigé (sans affaiblissement) :
  step9, instant-refresh, strict-requirements (detect-profile), bloc8 (précision
  code-level pour 47.11), dashboard-summary-parallel (11ᵉ requête parallèle),
  home-delete (versions de cache alignées sur VERSION.txt).
- **Recette locale sur PostgreSQL 17 réel** (PostgreSQL embarqué jetable, rôles
  identiques à la CI, migrations 001→089 appliquées puis suite complète) :
  **517 tests — 513 pass, 0 skipped, 4 échecs** dont 3 sont des échecs de référence
  listés dans la baseline B0 du dépôt (`docs/BASELINE-TESTS-B0-15.3.20.json`) et 1
  (`bloc3`, réexécution des migrations par le rôle administré) hérité de la
  15.4.34 — vérifié à l'identique sur la base 15.4.34 pure, il dépend de la
  propriété des tables dans l'environnement local, non du code fusionné.
- Typecheck `tsc --noEmit` : OK. Build : OK. Frontend : 45 fichiers vérifiés.
  ESLint assets/js : OK.
