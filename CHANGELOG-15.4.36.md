# CHANGELOG — Aurion 15.4.36

Date : 20 novembre 2026.
Base unique : branche `main` de `wooffey78/aurion`, version 15.4.35 poussée. Aucune autre
version n'est conservée. Cette livraison corrige les anomalies P0/P1 de l'audit 15.4.35 et
applique les demandes éditeur.

## 1. P0 — TVA : la franchise n'est plus déduite du régime micro

`backend/src/services/fiscal-detection.ts`

- `vatFranchise = isMicro` **supprimé**. La franchise se constate sur le chiffre d'affaires de
  l'année précédente ou sur une option explicite.
- Nouveaux seuils 2026 (`VAT_FRANCHISE_THRESHOLDS_2026`) :
  - prestations de services : **37 500 €** (seuil majoré **41 250 €**) ;
  - vente de marchandises et fourniture de logement : **85 000 €** (seuil majoré **93 500 €**).
- `detectVatRegime()` : franchise confirmée, assujettissement, option volontaire, dépassement du
  seuil majoré et zone de tolérance (franchise maintenue l'année de dépassement).
- Sans chiffre d'affaires ni option : **TVA 20 % appliquée et état « À CONFIRMER »**. Une
  facture ne peut plus être émise sans TVA sur la seule foi du statut micro.
- L'API `/activities/detect-fiscal` accepte `annualRevenueHt`, `vatRegime` et `nafCode`.

## 2. P0 — Cotisations : CFP commerce/artisan et CIPAV

`backend/src/services/fiscal-detection.ts`

- `CONTRIBUTION_RATES_2026` distingue :
  - vente BIC : 12,30 % + **CFP 0,10 %** (commerçant) ;
  - services BIC artisanaux : 21,20 % + **CFP 0,30 %** ;
  - services BIC commerciaux : 21,20 % + **CFP 0,10 %** (option `commercial` explicite) ;
  - BNC : 25,60 % + CFP 0,20 % ;
  - **CIPAV : 23,20 %** + CFP 0,20 % (branche distincte, plus de passage à 25,60 %).
- `microCategoryFor()` : mots-clés CIPAV explicites (avocat, notaire, architecte, expert-comptable,
  médecin, kiné…) puis code APE au niveau code, puis commerce, puis BNC, puis catégorie du métier.
- Le titre du profil (« vente à la ferme »…) ne décide plus de la catégorie : seuls le nom et la
  description de l'activité font foi.
- Catégorie `specific` (agriculture, hébergement, immobilier, garde d'enfants) : cotisations
  **présentes mais variables**, aucun faux taux fixe.
- `PROFILE_MICRO_CATEGORY` couvre **les 30 métiers** : aucune activité ne reste sans cotisations.

## 3. P1 — Suppression de compte transactionnelle

`backend/src/db.ts`, `backend/src/services/account-deletion.ts`, migration `090`

- `adminTransaction()` : une connexion, BEGIN/COMMIT/ROLLBACK.
- **Réservation atomique** : `select … for update` + statut `processing` daté (`processing_started_at`),
  bail de 30 minutes, compteur `attempts`. Deux opérateurs ne peuvent plus traiter la même demande.
- **Effacement relationnel en une seule transaction** : espaces, secrets d'intégration, VIP,
  audit puis suppression du compte. Toute erreur annule l'ensemble.
- Les échecs de révocation de sessions et de suppression d'avatar **ne sont plus avalés** :
  la demande repasse en attente avec `last_step` et `last_error`.
- La console d'administration affiche tentatives, étape et dernière erreur.

## 4. P1 — CI et documentation

- `.github/workflows/aurion-ci.yml` : transfert de propriété au rôle d'administration après les
  migrations (`ALTER SCHEMA public OWNER`, `REASSIGN OWNED`) — parité avec la production exigée
  par le test `bloc3` de réexécution idempotente.
- `MISSION-ETAT.md` : version de référence **15.4.36**, sections antérieures marquées historiques.
- `docs/APPLICATIONS-NATIVES.md` : référence 15.4.36, assets Android générés par `cap sync`
  (plus d'affirmation qu'ils sont déjà présents).
- `docs/EXPLOITATION-SUPPORT.md` : chemin réel de rotation des secrets
  (`npm --prefix backend run secrets:rotate`, script dans `backend/scripts/`).
- `README.md` : distinction explicite entre détection de l'entreprise de l'utilisateur
  (SIRET/SIREN) et recherche de fournisseurs par nom (`/suppliers/lookup`).

## 5. Demandes éditeur

- **Métiers** : 30 profils (10 nouveaux : aide à la personne, bien-être, agriculture, hébergement,
  immobilier, sécurité, musique/son, rédaction/traduction, garde d'enfants, commerce de détail),
  chacun avec catalogue minuté, pièces, garanties et vocabulaire documentaire.
- **Suggestions** : catalogue enrichi pour les 30 métiers (+3 à +5 prestations et +2 à +5 pièces
  par métier) et vocabulaire de détection complémentaire (`EXTRA_KEYWORDS`).
- **Détection** : indices NAF étendus aux nouveaux métiers (55.20, 68.31, 80.10, 88.91, 01.13,
  47.11…) et catégorie micro déduite du code APE.
- **Cotisations** : 30/30 métiers couverts, CFP et CIPAV corrigées (voir §2).
- **Faux zéro** : frais kilométriques et coefficient des devis/factures restent à `''` avec
  placeholder ; le montant appliqué affiche « à renseigner » tant qu'aucune donnée n'est saisie.
  Les documents n'impriment jamais une ligne à 0,00 €.
- **Alertes** : la création/modification de devis et factures reste confirmée par le dialogue
  Aurion (`askConfirm`), aucun `alert/confirm/prompt` natif (contrat `native-dialogs`).
- **Curseur** : curseur quasi noir (`#02060c`) à contour blanc, I-beam quasi noir dans les champs.
- **Administration** : section présente et complète (statistiques, tickets, VIP, virements,
  rétractations, demandes de suppression) — vérifiée dans cette version, avec le nouveau
  diagnostic de reprise des suppressions.
- **Remise à zéro du temps** : bornée à l'activité affichée (API + interface), refus serveur
  explicite si la portée est ambiguë.

## 6. Tests

Nouveaux contrats (tous exécutés sans base, sur le code livré) :

- `backend/tests/fiscal-detection-2026.contract.test.mjs` — TVA 2026 (micro ≠ franchise, seuils
  vente/services, zone de tolérance, options) et cotisations (CFP 0,10/0,30, CIPAV 23,20/BNC 25,60,
  couverture des 30 métiers).
- `backend/tests/profiles-catalogue-15.4.36.contract.test.mjs` — 30 métiers, catalogues enrichis,
  détection des dix nouveaux métiers, indices NAF.
- `backend/tests/time-metrics-reset-scope.contract.test.mjs` — portée de la remise à zéro.
- `backend/tests/account-deletion-transactional.contract.test.mjs` — verrou, transaction, audit,
  reprise, migration 090.
- `backend/tests/no-fake-zero-vat-autofill.contract.test.mjs` — placeholders et TVA depuis le SIREN.

Contrats existants mis au niveau du nouveau comportement (sans affaiblissement) :
`merge-15.4.35.contract.test.mjs` (TVA, cotisations, versions 15.4.36).

Vérifications exécutées : `npm run test:frontend` (45 fichiers), `npm run lint:frontend`,
`npm run test:smoke` (118/118), `npm --prefix backend run typecheck`, `npm --prefix backend run build`,
`npm run sync-pricing`, `node tools/build-web-dist.mjs`, `git diff --check`.
