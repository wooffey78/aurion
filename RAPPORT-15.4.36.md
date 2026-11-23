# Aurion 15.4.36 — état d'avancement, anomalies et axes d'amélioration

Audit du 20 novembre 2026. **Source unique analysée et livrée : la branche `main` de
`wooffey78/aurion` (version 15.4.35 poussée), modifiée en 15.4.36.** Aucune version antérieure
n'est conservée ni utilisée.

## 1. Avancement pondéré

Grille conservée de l'audit 15.4.35 (poids 95, dimensions Play Store et paiement exclues).

| Domaine | Poids | 15.4.35 | 15.4.36 | État |
|---|---:|---:|---:|---|
| A. Calculs et fonctions métier | 12 | 90 % | **95 %** | TVA et cotisations corrigées et testées ; reste la confirmation par l'utilisateur de son CA réel |
| B. Synchronisation et mode hors ligne | 16 | 78 % | 78 % | inchangé |
| C. Documents, stockage et appareils | 7 | 71 % | **74 %** | plus aucun faux zéro sur les documents |
| D. Web/PWA/Windows/Android/iOS | 8 | 42 % | 42 % | builds natifs toujours non exécutés |
| E. Infrastructure, migrations, sauvegardes | 12 | 29 % | 29 % | cible non provisionnée |
| F. Sécurité, RLS, secrets, RGPD | 10 | 70 % | **78 %** | suppression de compte transactionnelle |
| G. Intégrations externes | 9 | 35 % | 35 % | fournisseurs non configurés |
| H. Juridique et commercial | 8 | 50 % | 50 % | identité éditeur et médiation toujours manquantes |
| I. Tests, accessibilité, bêta, support | 13 | 63 % | **68 %** | nouveaux contrats, CI corrigée sur le papier ; Playwright non rejoué |
| **Total** | **95** | **60,5 %** | **62,8 %** | |

Calcul : (12×0,95 + 16×0,78 + 7×0,74 + 8×0,42 + 12×0,29 + 10×0,78 + 9×0,35 + 8×0,50 + 13×0,68) / 95
= 59,69 / 95 = **62,8 %**. Progression : **+2,3 points**.

## 2. Anomalies de l'audit 15.4.35 — traitement

### P0 — TVA (`fiscal-detection.ts`)

- **Corrigé.** `vatFranchise = isMicro` supprimé. La franchise n'est retenue que si elle est
  confirmée (option ou chiffre d'affaires sous le seuil) ; sinon TVA à 20 % avec état
  « À CONFIRMER ». Seuils 2026 : 37 500 / 41 250 € (services) et 85 000 / 93 500 € (vente),
  avec gestion de la zone de tolérance (franchise maintenue l'année du dépassement).
- **Preuve** : `backend/tests/fiscal-detection-2026.contract.test.mjs` (4 contrats TVA).

### P0 — Cotisations (`fiscal-detection.ts`)

- **Corrigé.** CFP commerçant 0,10 % (vente et services commerciaux) vs artisan 0,30 % ;
  branche **CIPAV 23,20 %** distincte du BNC 25,60 % ; `services_bnc_cipav` réellement attribuée.
- **Couverture** : `PROFILE_MICRO_CATEGORY` couvre les 30 profils ; les activités à régime
  spécifique reçoivent des lignes variables, jamais un faux taux.
- **Preuve** : contrats « CFP commerçant/artisan », « CIPAV 23,20 », « chaque métier reçoit des
  lignes cohérentes ».

### P1 — Suppression de compte (`account-deletion.ts`, `db.ts`, migration 090)

- **Corrigé.** Réservation atomique (`FOR UPDATE` + bail de 30 min + `attempts`), effacement
  relationnel dans une transaction unique, audit avant suppression, erreurs de révocation et
  d'avatar remontées, reprise traçable (`last_step`, `last_error`) affichée dans la console.
- **Preuve** : `backend/tests/account-deletion-transactional.contract.test.mjs`.

### P1 — CI stricte

- **Traité côté cause identifiée** : le rôle d'administration devient propriétaire des tables en
  CI (parité production), ce que le test `bloc3` exige pour réexécuter les migrations.
- **Non vérifiable ici** : aucun PostgreSQL n'est disponible dans ce bac à sable. Le résultat
  réel de la CI ne peut être constaté qu'au premier run GitHub ; il n'est **pas** annoncé vert.

### P1 — Juridique 0/5 et intégrations 0/5

- **Non corrigeable sans données éditeur.** L'identité de l'éditeur, l'adresse, le médiateur, les
  sous-traitants et la validation de publication ne peuvent pas être inventés ; de même pour les
  identifiants SMTP, Stripe, Google, PA et paiement. Les contrôles `check:legal` et
  `check:integrations` restent donc à 0/5 tant que ces éléments ne sont pas fournis.
- **Aucun contournement n'a été ajouté** pour faire passer ces contrôles artificiellement.

### P1 — Infrastructure et reprise

- **Non traité** : création de la base PostgreSQL de production, bucket OVH S3, sauvegardes
  planifiées, restauration réelle et supervision alarmée ne peuvent pas être exécutées depuis ce
  bac à sable (pas de réseau cible, pas de secrets).

### P2 — Documentation

- `MISSION-ETAT.md` → version de référence 15.4.36, historique 15.4.33 clarifié.
- `docs/APPLICATIONS-NATIVES.md` → référence 15.4.36, assets Android générés par `cap sync`.
- `docs/EXPLOITATION-SUPPORT.md` → chemin réel `npm --prefix backend run secrets:rotate`.
- `README.md` → distinction détection propriétaire (SIRET/SIREN) / recherche fournisseurs par nom.

## 3. Demandes éditeur — état

| Demande | État |
|---|---|
| Augmenter la quantité de métiers | **20 → 30 profils** complets |
| Augmenter les suggestions pour tous les métiers | +3 à +5 prestations et +2 à +5 pièces par métier, vocabulaire de détection élargi |
| Détection automatique plus complète | NAF → catégorie micro, TVA depuis le SIREN, dix nouveaux métiers reconnus |
| Cotisations de toutes les activités | 30/30 catégorisés, CFP et CIPAV corrigées, régimes spécifiques signalés |
| Pas de faux zéro | frais kilométriques, tarifs €/km et coefficient en placeholder ; documents sans ligne à 0,00 € |
| Validation JS non native | dialogue Aurion (`askConfirm`) conservé et vérifié par contrat |
| Curseur plus sombre | curseur quasi noir à contour blanc, I-beam quasi noir dans les champs |
| Section administrateur | **présente et complète** (statistiques, tickets, VIP, virements, rétractations, suppressions) |
| Remise à zéro du temps | bornée à l'activité affichée, refus serveur si ambigu |

## 4. Axes d'amélioration restants (par ordre d'impact)

1. **Publier les documents juridiques** : renseigner les variables `AURION_LEGAL_PUBLISHER_*`,
   le médiateur et la déclaration d'accessibilité, puis exécuter `npm --prefix backend run check:legal`
   jusqu'à 5/5.
2. **Activer les intégrations** : SMTP, Stripe (clés + webhook), Google OAuth, PA/e-reporting,
   paiement client — puis `check:integrations` et essais bout en bout.
3. **Recette PostgreSQL réelle** : appliquer les migrations 001→090 sur la cible, rejouer la suite
   complète et Playwright, viser un run CI strict **vert** (aucun échec résiduel).
4. **Infrastructure** : base et bucket de production, sauvegarde planifiée, exercice de restauration
   documenté, supervision avec alerte reçue.
5. **Applications natives** : `cap sync`, builds AAB/APK signés et recette sur appareil ; projet iOS
   à générer sous macOS.
6. **Aller au-delà de 90 % sur le métier** : confirmation du chiffre d'affaires N-1 dans le parcours
   (pour figer la franchise TVA sans « à confirmer ») et ventilation multi-catégories guidée.

## 5. Limites de cette livraison (non masquées)

- **Aucun test nécessitant PostgreSQL n'a été exécuté ici** : `npm --prefix backend test` ne peut pas
  aboutir sans base. Les 118 tests de fumée, les contrôles frontend, le lint, le typecheck et le build
  passent ; les 5 nouveaux fichiers de contrats passent (25 assertions).
- **Playwright/Chromium non exécuté** dans ce bac à sable.
- **Aucun déploiement, aucun push, aucune publication** n'a été effectué.
- La CI n'est **pas déclarée verte** : seules les causes identifiées ont été corrigées.
