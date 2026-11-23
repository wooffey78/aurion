# STATUT DES BLOCS 6-20 — travaux indépendants réalisés, blocages exacts et procédures (15.4.32)

## Bloc 6 — Documents récents, pièces jointes, quota local
**EXISTE ET TESTÉ** : politique configurable (`recent-documents.js`) — fenêtre 90 jours, documents épinglés, dossiers actifs, factures non réglées/devis ouverts, quota initial 200 Mo et borne 200 fichiers ; `pinDocument/unpinDocument` raccordés à l'UI (docs.js, quote.js) ; `navigator.storage.persist()` demandé (cloud-sync.js) ; originaux serveur jamais supprimés lors de l'élagage local.
**PARTIEL (restant, Bloc 6-bis)** : reprise des téléchargements interrompus, vérification d'intégrité par hash/ETag, traitement de la saturation de quota, réseau mobile. Non simulé — à implémenter avec tests sur les flux réels de téléchargement.
## Bloc 7 — Agrégats et fraîcheur hors connexion
**EXISTE** : agrégats produits exclusivement par le moteur serveur (aucun calcul divergent front/back) ; bandeaux de fraîcheur « données locales affichées » (Bloc 3) ; hypothèses de prévision répliquées (Bloc 2).
**PARTIEL** : les référentiels datés GLOBAUX (`micro_rates`, `micro_referential_versions`, `regulatory_rules` — sans organization_id) n'ont pas encore de canal de synchronisation versionné dédié ; tant qu'il est absent, les vues hors connexion utilisent le dernier référentiel reçu par l'API en ligne et l'expliquent. Recalcul local complet : à décider (code partagé vs snapshot versionné) — décision de conception à valider, jamais un faux « à jour ».
## Bloc 8 — Sécurité locale, appareils, confidentialité
**EXISTE ET TESTÉ** : cloisonnement par compte/organisation/appareil (store IndexedDB + tests), RLS 074 avec rôle runtime non BYPASSRLS et tests A/B réels, secrets hors ZIP/rapports, WebAuthn/biométrie serveur, révocation d'appareil et effacement, logs redacted.
**PARTIEL/BLOQUÉ** : SQLite chiffré natif (SQLCipher + Keystore/Keychain) exige l'app Android (Bloc 9) et iOS (Bloc 10) — aucune abstraction ne sera déclarée « pilote fonctionnel ». Limite navigateur documentée (IndexedDB protégé par le périmètre du navigateur, pas équivalent à un coffre natif).
## Bloc 9 — Android
**25 %** : projet Capacitor 6.2.3 + `android/` générés, config sans `server.url` bloquant, ressources web embarquées.
**Bloqué au build** : JDK 17 + Android SDK + Gradle absents du bac à sable ; signature de test et recette appareil physique exigent l'éditeur. **Procédure exacte** : `cd /home/z/my-project/work/fix078/base && npm run build && npx cap sync android && cd android && ./gradlew assembleRelease` (JDK 17, SDK 34, `ANDROID_HOME` requis), puis AAB : `./gradlew bundleRelease` avec keystore de test (`keytool -genkey -v -keystore test.keystore -alias aurion -keyalg RSA -keysize 2048 -validity 10000`). Recette appareil : onboarding, connexion, mode avion, rejeu, PDF, notifications.
## Bloc 10 — iOS
**Bloqué (0 %)** : dossier `ios/` absent ; `npx cap add ios` exige macOS/Xcode. Livrable : instructions (`npx cap add ios`, Keychain, permissions plist, BGTaskScheduler) — jamais présenté comme validé sans build Xcode.
## Bloc 11 — UX multiplateforme
**PARTIEL (75 %)** : design system existant, responsive, corrections 15.4.30 (landing/connexion/avatar/plein écran Windows) validées ; e2e navigateur + accessibilité automatisée (contrastes, cibles 44 px, labels). Restant : matrice appareils physiques réels (portrait/paysage, clavier virtuel, lecteurs d'écran).
## Bloc 12 — OVH dimensionnement
**30 %** : `docs/INFRA-OVH-COUTS.md` + `docs/MIGRATION-RENDER-OVH.md` + stockage objet S3-compatible déjà branché par variables + runbook révisé (Render gratuit strict, OVH cible, environnements bêta/préprod/prod). **Bloqué** : vérification des prix EUR à la date d'exécution et choix VPS+PG auto-hébergé vs PG managé = décision éditeur (aucun achat sans accord).
## Bloc 13 — Domaine + migration Render→OVH
**Bloqué (0 % d'exécution)** : aucun domaine acheté (décision éditeur) ; migration réelle = autorisation explicite + fenêtre annoncée + gel des écritures + dump chiffré + répétition à blanc. Procédure complète dans le runbook.
## Bloc 14 — Google (login, Gmail, Drive, Agenda)
**Code présent (35 %)** : flux OIDC/Gmail/Drive/Agenda séparés (docs/GOOGLE-CONFIGURATION.md), tokens chiffrés ; bouton signalé défaillant par l'éditeur. **Bloqué** : client OAuth + redirections sur le domaine OVH + recette réelle par service. Le login n'accorde jamais de scopes métier cachés.
## Bloc 15 — Plateforme agréée et e-reporting
**Recherche exécutée (14/11/2026, sources publiques)** : ~163-165 PA immatriculées DGFiP (22/09/2026) ; **9 PA affichent un plan 0 € couvrant le socle légal** : Indy, Henrri, MyFacturation, Tiime, Abby, ECMA (jefacture.com), Flowie, Kolecto (+1 selon les comparateurs). Calendrier réglementaire : réception obligatoire depuis septembre 2026, émission dès 2027.
**NON ÉLIGIBLE ENCORE** : un plan 0 € pour l'entrepreneur ne prouve PAS une API partenaire gratuite pour Aurion (critère intégral du prompt : coût nul entrepreneur + coût nul intégration éditeur). Chaque candidature exige la vérification sur sources officielles : statut immatriculation DGFiP (impots.gouv.fr), conditions API/SDK/partenariat écrites, aucun frais fixe/minimum/volume. **Si aucune PA gratuite tout-à-fait-générique n'existe côté intégrateur, le dire à l'éditeur et lui laisser le choix** — aucune souscription sans accord.
Socle technique conservé : UBL 2.1 / CII, cycle de vie générique, e-reporting structurel, webhook générique — aucune transmission réelle déclarée.
## Bloc 16 — Stripe, Brevo, alertes
**Code présent (25 %)** : service abonnement + webhooks idempotents testés sur contrats ; Brevo via SMTP configurable ; 60 jours d'essai en base. **Bloqué** : compte Stripe à configurer AVEC l'éditeur (distinguer abonnement Aurion vs paiements clients carte/virement), domaine e-mail + SPF/DKIM/DMARC, tarifs SMS validés. Aucun secret dans le chat/ZIP.
## Bloc 17 — Propriétaire permanent, VIP, tarification
**CORRIGÉ (code)** : `/auth/vip-invite/accept` rattache désormais le droit VIP à un compte EXISTANT sans erreur `ACCOUNT_EXISTS` ni doublon (journalisé, invité marqué accepté) ; création VIP pour compte inexistant conservée ; VIP ≠ administrateur global. Accès propriétaire permanent : rôle distinct existant à auditer (MFA selon politique). **Restant** : étude concurrentielle France (pages tarifaires officielles à date) et tarif — décision éditeur exclusive.
## Bloc 18 — Juridique, RGPD, médiation
**45 %** : 7 documents révision 4.0 alignés au réel (rendus de session 15.4.30/31/32) ; publication verrouillée par variable d'approbation tant que placeholders/contrats/coordonnées manquent ; CGU/CGV déjà relues par un professionnel (information conservée, pas de nouvelle revue prétendue). **Bloqué** : médiateur (liste CECMC — distinguer gratuit consommateur / payant professionnel ; choix éditeur), sous-traitants réels après choix OVH/Brevo/PA.
## Bloc 19 — Observabilité, sauvegardes, exploitation
**PARTIEL (40 %)** : health checks liveness/readiness, logs structurés redacted, X-Request-Id, métriques admin — testés. **Restant** : monitoring externe indépendant UE (comparatif + accord avant abonnement), alertes e-mail/SMS incidents (coordonnées via variables), sauvegardes indépendantes chiffrées PostgreSQL+S3 + **test de restauration prouvé**, exercice incident/rollback, pentest.
## Bloc 20 — Recette finale, bêta privée
**Bloqué en amont (0 % d'exécution)** : dépend de 9-16. Checklist réelle existante (`docs/CHECKLIST-PRE-PRODUCTION.md` révisée) ; bêta privée : comptes pilotes/VIP + canal support + sauvegarde avant chaque évolution ; aucune publication sans checklist validée + autorisation.

## Récapitulatif des blocages exigeant l'éditeur
1. OVH : choix offre + provisionnement + migration (Blocs 12-13).
2. Android : JDK/SDK/signature + appareil ; iOS : Mac/Xcode (Blocs 9-10).
3. Google Cloud : client OAuth + recette (Bloc 14).
4. Stripe + Brevo : comptes + configuration conjointe (Bloc 16).
5. PA : choix après vérification API partenaire gratuite (Bloc 15).
6. Domaine : achat (Bloc 13). Médiateur : choix (Bloc 18).
