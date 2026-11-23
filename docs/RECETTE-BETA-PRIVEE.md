# Recette de la bêta privée — Aurion 15.4.23

> Cahier de recette pour la **bêta privée intégralement testée**, recommandée par l'évaluation du 14 novembre 2026 avant toute ouverture d'abonnement payant. Chaque cas est numéroté, décrit ses **étapes**, son **résultat attendu**, et laisse une zone de résultat à remplir pendant l'exécution réelle. **Règle : un cas sans résultat écrit n'est pas un cas réussi.** Les outils automatisés (`backend/scripts/`) font partie de la recette et sont cités avec leurs commandes exactes. Ce cahier ne modifie aucun comportement de l'application ; il formalise la validation des éléments existants.

## Suivi global

| Groupe | Cas | Réussis | En échec | Non exécutés |
|---|---|---|---|---|
| A. Installation Windows | A1-A6 | | | |
| B. Non-régression fonctionnelle | B1-B8 | | | |
| C. Navigateurs | C1-C4 | | | |
| D. Mobile | D1-D3 | | | |
| E. Accessibilité | E1-E4 | | | |
| F. Pré-vol intégrations | F1-F4 | | | |
| G. Sauvegarde et restauration | G1-G3 | | | |
| H. Sécurité pré-audit | H1-H4 | | | |

## A. Installation Windows

**A1 — Installation neuve depuis le paquet.** Étapes : exécuter l'installateur du paquet (`README-INSTALLATION.md`) sur une machine Windows sans installation préalable d'Aurion. Attendu : PostgreSQL installé et démarré ; migrations appliquées par le rôle migrateur (`aurion_admin`) ; l'application démarre ; `http://127.0.0.1:4000/health/db` répond que la base est joignable ; les 80 migrations sont notées appliquées. Résultat obtenu : ________________

**A2 — Séparation des rôles vérifiée.** Étapes : connecter à la base locale et vérifier que le propriétaire des tables est `aurion_admin` et que l'application utilise `aurion_runtime` (`AURION_RUNTIME_DB_ROLE`). Attendu : l'application ne se connecte jamais avec le propriétaire ; une lecture sans contexte tenant ne renvoie aucune ligne. Résultat obtenu : ________________

**A3 — Relance après redémarrage.** Étapes : redémarrer Windows, relancer Aurion (`START-AURION.bat`). Attendu : aucun fichier de verrou résiduel, les migrations rejouées répondent « déjà appliquée », l'application fonctionne sans nouvelle erreur. Résultat obtenu : ________________

**A4 — Mise à jour d'une installation existante.** Étapes : installer la version courante par-dessus une installation 15.4.20 conservant des données de test. Attendu : les données existantes restent lisibles, les migrations additives s'appliquent une seule fois, aucune perte de document joint. Résultat obtenu : ________________

**A5 — Idempotence des migrations.** Étapes : relancer deux fois l'installation/le démarrage. Attendu : second passage sans erreur ni duplication (`schema_migrations` inchangé). Résultat obtenu : ________________

**A6 — Désinstallation propre.** Étapes : désinstaller (si l'installateur le prévoit) puis réinstaller. Attendu : comportement conforme à `README-INSTALLATION.md`, aucune donnée résiduelle non documentée. Résultat obtenu : ________________

## B. Non-régression fonctionnelle

**B1 — Compte et première configuration.** Étapes : créer un compte, parcourir l'accueil guidé pour une entreprise existante (SIRET). Attendu : aucune étape de création d'entreprise n'est proposée ; les valeurs saisies sont conservées. Résultat obtenu : ________________

**B2 — Clients, fournisseurs, catalogue.** Étapes : créer un client, un fournisseur, un article ; fusionner des données de registre en préservant les valeurs manuelles. Attendu : enregistrements corrects, fusion sans perte des champs saisis manuellement. Résultat obtenu : ________________

**B3 — Devis → facture avec logo.** Étapes : créer un devis avec un logo PNG, convertir en facture, générer PDF puis DOCX et ODT. Attendu : les trois formats générés avec SIRET émetteur et pagination correcte ; un logo WebP est refusé avec message explicite (comportement livré, à confirmer inchangé). Résultat obtenu : ________________

**B4 — Import de données.** Étapes : importer clients/fournisseurs/articles puis des devis et factures de test. Attendu : aperçu et confirmation avant import, écritures réussies (transaction avec tenant — correction RLS livrée en 15.4.20). Résultat obtenu : ________________

**B5 — Rapprochement bancaire.** Étapes : importer un relevé CSV puis OFX. Attendu : opérations listées, rapprochement manuel fonctionnel, IBAN jamais journalisé en clair. Résultat obtenu : ________________

**B6 — Exports comptables.** Étapes : générer livre des recettes, journaux, FEC ; ouvrir l'accès « expert-comptable » en lecture seule sur un second compte. Attendu : fichiers cohérents ; l'invité ne peut que lire. Résultat obtenu : ________________

**B7 — Bordereaux.** Étapes : importer un bordereau professionnel. Attendu : brouillon de facture proposé, données du bordereau tracées. Résultat obtenu : ________________

**B8 — Export complet de l'organisation.** Étapes : `GET /documents/export-all.zip` depuis l'application. Attendu : archive contenant les données de l'organisation uniquement (aucune donnée d'une autre organisation), sans secret. Résultat obtenu : ________________

## C. Navigateurs

**C1 — Chrome.** Étapes : connexion, B3, impression PDF depuis le navigateur. Attendu : aucun défaut de mise en page ni erreur console. Résultat obtenu : ________________
**C2 — Edge.** Mêmes étapes que C1. Résultat obtenu : ________________
**C3 — Firefox.** Mêmes étapes que C1. Résultat obtenu : ________________
**C4 — Safari (si disponible).** Mêmes étapes que C1 + installation PWA. Résultat obtenu : ________________

## D. Mobile

**D1 — Android (Chrome).** Étapes : portrait et paysage, clavier virtuel sur les formulaires devis/facture. Attendu : cibles tactiles ≥ 44 px utilisables, aucun champ masqué par le clavier. Résultat obtenu : ________________
**D2 — iOS (Safari).** Mêmes étapes que D1. Résultat obtenu : ________________
**D3 — PWA installée.** Étapes : installer l'application web sur l'écran d'accueil puis l'ouvrir hors onglet. Attendu : lancement correct, session conservée. Résultat obtenu : ________________

## E. Accessibilité

**E1 — Navigation clavier complète.** Étapes : parcourir toutes les vues principales sans souris. Attendu : focus visible et annoncé (titre de la nouvelle vue), aucun piège de focus. Résultat obtenu : ________________
**E2 — Zoom 200 %.** Étapes : zoom navigateur 200 % sur dashboard, devis, facture. Attendu : aucun texte chevauché, défilement maîtrisé du calculateur et des encarts. Résultat obtenu : ________________
**E3 — Lecteur d'écran.** Étapes : NVDA (Windows) ou VoiceOver (macOS/iOS) sur connexion, devis, messagerie. Attendu : erreurs de formulaires annoncées, état du bouton mot de passe exposé. Résultat obtenu : ________________
**E4 — Contrastes et états.** Étapes : vérifier boutons primaires, liens, messages d'erreur sur les vues principales. Attendu : contrastes ≥ WCAG AA pour texte normal. Résultat obtenu : ________________

## F. Pré-vol intégrations (outils livrés)

**F1 — État des intégrations avant configuration.** Étapes : `npm run check:integrations` (dans `backend/`). Attendu : chaque contrôle « NON CONFIGURÉ » avec l'effet réel décrit ; code de sortie 0. Résultat obtenu : ________________

**F2 — SMTP configuré.** Étapes : renseigner `PLATFORM_SMTP_*` puis rejouer `npm run check:integrations`. Attendu : « ✔ SMTP plateforme : OK — authentification réussie (STARTTLS) » ; aucun e-mail envoyé par l'outil ; puis envoyer depuis l'application un e-mail réel de test et confirmer la réception. Résultat obtenu : ________________

**F3 — Stripe configuré.** Étapes : renseigner `STRIPE_SECRET_KEY` puis rejouer l'outil. Attendu : « ✔ clé valide, livemode=… » (selon la clé fournie) ; en cas de clé invalide, « ÉCHEC — clé refusée (401) » et code de sortie 1 avec `--strict`. Résultat obtenu : ________________

**F4 — Pré-vol juridique.** Étapes : `npm run check:legal`. Attendu : la liste exacte des blocages de publication (variables d'identité manquantes, placeholders `[À compléter]` avec numéros de ligne). Faire remplir ces blocages par l'éditeur, puis rejouer : « documents prêts ». Résultat obtenu : ________________

## G. Sauvegarde et restauration (outils livrés — RUNBOOK §2-§3)

**G1 — Sauvegarde locale.** Étapes : `npm run db:backup -- --out <répertoire> --prune-days 30`. Attendu : fichier `aurion-db-AAAAMMJJ-HHMMSS.dump` créé, taille > 0, « ✔ Sauvegarde lisible : N tables ». Résultat obtenu : ________________

**G2 — Exercice de restauration complet.** Étapes : créer une base jetable, exécuter `AURION_RESTORE_TARGET_URL=<url jetable> npm run db:restore:drill -- --from <dump> --confirm`. Attendu : restauration sans erreur, `schema_migrations` complet, tables restaurées ; **toute cible égale à `DATABASE_URL`/`AURION_MIGRATION_DATABASE_URL` est refusée** (vérifier ce refus avec une fausse égalité avant le vrai exercice). Résultat obtenu : ________________

**G3 — Application sur base restaurée.** Étapes : démarrer l'application sur la base restaurée avec les mêmes variables (y compris `AURION_ENCRYPTION_KEY`). Attendu : connexion, lecture d'un client et d'une facture, ouverture d'un justificatif, secrets SMTP déchiffrables. Résultat obtenu : ________________

## H. Sécurité pré-audit

**H1 — Limitation de débit et authentification.** Étapes : tenter des connexions erronées répétées. Attendu : blocage progressif selon la configuration livrée, aucun message révélant l'existence d'un compte. Résultat obtenu : ________________
**H2 — Cookies et en-têtes.** Étapes : inspecter les cookies en production (`COOKIE_SECURE=true`). Attendu : HttpOnly, SameSite=Strict, Secure ; CSP et en-têtes conformes à `docs/SECURITY.md`. Résultat obtenu : ________________
**H3 — Isolation multi-tenant.** Étapes : deux organisations de test ; tenter l'accès croisé. Attendu : aucune fuite (RLS + contrôles applicatifs ; la suite automatisée `tenant-isolation.rls.test.mjs` reste verte). Résultat obtenu : ________________
**H4 — Audit externe.** Étapes : commander le test de sécurité externe indépendant (case de la checklist pré-production). Attendu : rapport conservé, correctifs planifiés. Résultat obtenu : ________________

## Clôture de la bêta privée

La bêta privée est déclarée intégralement testée lorsque : tous les cas A-H sont remplis et conformes, les échecs éventuels sont corrigés puis rejoués, et le tableau de suivi global ci-dessus est renseigné. La clôture ne vaut **ni** ouverture commerciale (conditions de la checklist pré-production), **ni** publication des documents juridiques (pré-vol F4 + approbation de version), ni connexion d'un prestataire non décidé (médiateur, plateforme agréée, paiement client — décisions réservées à l'éditeur).
