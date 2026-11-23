# CHANGELOG 15.4.50

## Objet de la livraison

Intégration des améliorations validées par le maître d'ouvrage sur la base du comparatif
15.4.49 / fondation V2 et du document « Améliorations et suggestions » : chantiers et
rentabilité réelle (B1), contrats d'entretien récurrents (B2), portail client invités et
acceptation de devis horodatée (A1/A2), workflows étendus avec simulation à blanc (A5),
emplacements de stock (A6), récurrences d'agenda développées (A7), chaîne d'intégrité
documentaire (B5), fiabilité de paiement par client (B3), bibliothèque de prestations par
profil, alertes de prix matériaux, contrôle de dérive devis→facture (B6), rapport mensuel du
dirigeant (B7), webhooks sortants signés (B8) et **modularité par métier** (les
fonctionnalités ne sont proposées que lorsque le profil de l'activité les rend pertinentes).

**Méthode du dépôt respectée** : audit du 15.4.49 livré, migrations **additives** uniquement
(110 → 118, ré-exécutables, aucune migration existante modifiée), aucune fonctionnalité
retirée, statuts honnêtes dans l'interface (aucun succès simulé), tests avant/après exécutés.

**Résultat de la vérification** : `tsc --noEmit` + build **0 erreur** ; suite complète
`node --test` **721 tests — 650 pass, 0 fail nouveau, 8 échecs préexistants environnementaux,
63 skipped**. Les 8 échecs sont EXACTEMENT ceux de la baseline 15.4.49 mesurée avant
modification (6 tests d'intégration Stripe/frais nécessitant une base PostgreSQL réelle non
provisionnée, 2 tests dont les fichiers helpers n'existent pas dans l'archive source :
`tests/helpers/fake-google.mjs`, `tests/fixtures/calibration-cases.mjs`). Les 26 nouveaux
tests v50 sont verts.

## Contrainte transversale : modularité par métier (nouveau moteur)

`services/profile-features.ts` : pour chaque profil du catalogue versionné (30 profils,
2026.11), le moteur détermine les fonctionnalités PERTINENTES (chantiers, contrats
d'entretien, emplacements de stock, garanties, temps, appareils) et ce qui est masqué — avec
la raison affichée, jamais silencieusement. Exposé par `GET /profile-features`, consommé par
la coquille (menu, écran chantiers) et par les propositions. Repli conservateur hors
connexion : core seul visible. L'entrée « Chantiers » du menu n'apparaît que si le moteur la
déclare pertinente pour le métier actif (contrat de navigation mis à jour avec la livraison).

## Blocs livrés (fichiers nouveaux ou modifiés)

| Bloc | Livraison | Fichiers |
|---|---|---|
| **B1 — Chantiers & rentabilité réelle** | Objet chantier + liens vers les objets propriétaires (devis, rendez-vous, temps, SAV, frais, documents) — le chantier ne duplique aucune source de vérité. Rentabilité calculée depuis les montants RÉELS enregistrés (factures liées, SAV, frais, temps valorisé au taux choisi — 0 = « non valorisé », dit honnêtement). Dérive vs devis accepté : > 80 % = à surveiller, > 100 % = dérive + événement journal idempotent. | `migrations/110_chantiers.sql`, `services/chantiers.ts`, `routes/chantiers.ts`, `assets/js/pages/dash/chantiers.js` |
| **B6 — Garde-fou dérive devis→facture** | Comparaison déterministe des rubriques (normalisation d'accents), niveaux none/minor/notable/major, justification exigée avant émission au-delà du seuil configurable ; une compensation hausse/baisse ne masque pas une dérive locale. | `services/deviation-guard.ts`, `POST /deviation-check` |
| **B2 — Contrats d'entretien** | Contrat (client, fréquence mensuelle→annuelle, jour souhaité, durée, prix convenu) ; occurrences générées de façon DÉTERMINISTE avec report au jour de semaine ; propositions de planification (conflits d'agenda détectés) — création réelle = validation humaine via l'agenda existant (collisions 108). Proposition gated par le profil métier. | `migrations/112_maintenance_contracts.sql`, `services/maintenance-contracts.ts`, `routes/maintenance.ts` |
| **A1/A2 — Portail client invités & acceptation de devis** | Accès nominatif par contact client (jeton 192 bits, hashé SHA-256, unicité GLOBALE du hash, expiration, révocation), vue portail limitée aux devis EXPLICITEMENT partagés (`portal_shared_quotes`), refus déterministes (CLIENT_MISMATCH, QUOTE_NOT_SHARED, QUOTE_ALREADY_CLOSED via le référentiel de statuts partagé), acceptation TRANSACTIONNELLE (for update, transition de statut métier, preuve : nom saisi + IP + user-agent horodatés, événement outbox dans la même transaction). Administration owner-only ; routes publiques rate-limitées (modèle share-links). | `migrations/114_portal_guest_access.sql`, `migrations/118_portal_shared_quotes.sql`, `services/portal-guest.ts`, `routes/portal-guest.ts` |
| **A5 — Workflows étendus + simulation à blanc** | 4 nouveaux déclencheurs : `quote_accepted`, `intervention_completed`, `warranty_expiring` (préavis de la règle = fenêtre), `document_shared` ; balayage idempotent (clé règle+objet). `POST /automation/rules/:id/dry-run` : « cette règle aurait déclenché N fois sur les X derniers jours » — lecture seule (aucun run, aucune action). | `services/workflows.ts` (additif), `routes/automation.ts` |
| **A6 — Emplacements de stock** | stock_locations (dépôt/camion/atelier) ; la dimension OÙ est portée par les mouvements (location_id nullable, données historiques = sans dimension tracée, jamais une valeur inventée) ; niveau par emplacement calculé depuis les mouvements ; transfert = sortie + réception tracées. | `migrations/111_stock_locations.sql`, `services/stock.ts` (locationId optionnel), `routes/stock.ts` |
| **A7 — Récurrences d'agenda** | Expansion déterministe (weekly/monthly, interval, count/until, bornes 1..366) dans `GET /agenda/occurrences` : occurrences DÉRIVÉES en lecture seule, aucun rendez-vous dupliqué en base ; règle non reconnue = rien d'inventé. | `services/recurrence.ts`, `routes/agenda.ts` |
| **B5 — Chaîne d'intégrité (« coffre »)** | Table append-only chaînant empreinte SHA-256 + horodatage par document émis (format canonique v1 documenté) ; `GET /integrity/chain` vérifie la chaîne et localise l'entrée altérée ; événement journal par pièce chaînée. Aucune prétention juridique : preuve TECHNIQUE d'intégrité. | `migrations/113_document_integrity_chain.sql`, `services/integrity-chain.ts`, `routes/maintenance.ts` (`recordDocumentIntegrity`), flux d'émission à raccorder (voir reste-à-faire) |
| **B3 — Fiabilité de paiement par client** | Délai moyen/médian, taux de retard, score 0-100 au barème documenté (retards −40, excès moyen −30, factures échues en cours −15, stabilité +10) et bande lisible ; « inconnu » si aucune facture réglée — jamais une supposition. Endpoint service prêt ; encart fiche client à brancher (voir reste-à-faire). | `services/payment-reliability.ts` |
| **B3-bis — Bibliothèque de prestations par profil** | Bibliothèque GLOBALE versionnée (lecture seule runtime, modèle 078/104) amorcée depuis le catalogue embarqué (idempotent) ; personnalisations par organisation (valeurs CONFIRMÉES gagnent toujours) ; prix indicatifs affichés comme tels. | `migrations/117_profile_service_library.sql`, `services/service-library.ts`, `routes/profile-services.ts` |
| **B4 — Historique de prix matériaux** | Prix réellement constatés horodatés (saisie, réception, commande) ; tendance premier→dernier, alerte au-delà du seuil (défaut 10 %) → journal + PROPOSITION de recotation via le moteur 03 ; aucun scraping. | `migrations/116_part_price_history.sql`, `services/price-history.ts`, `routes/maintenance.ts` |
| **B7 — Rapport mensuel du dirigeant** | Agrégats depuis les sources de vérité uniquement (facturé ≠ encaissé conservé), sections KPI + séries chartables avec types de représentation SUGGÉRÉS selon la nature des données (série temporelle : barres/courbe/bougies ; répartition : camembert/barres). | `services/monthly-report.ts`, `GET /reports/monthly` |
| **B8 — Webhooks sortants signés** | Endpoints HTTPS par organisation (label, événements de liste fermée), secret généré côté serveur, stocké chiffré (service secrets existant) + empreinte, montré UNE SEULE fois ; livraisons idempotentes avec signature `X-Aurion-Signature: t=…,v1=hmac-sha256(secret, t + '.' + corps)`, backoff exponentiel plafonné 60 s, lettre morte au 5e essai, consultation + rejeu contrôlé. | `migrations/115_outgoing_webhooks.sql`, `services/outgoing-webhooks.ts`, `routes/webhooks-out.ts` |
| **Interface — graphiques au choix & refonte sans changement de style** | `core/charts.js` : rendu SVG déterministe sans dépendance (barres, courbe, bougies min-max documentées « pas des bougies financières », camembert + légende), barre de commutation accessible au clavier, refus explicite des types mensongers. Écran Chantiers (liste, création, rentabilité, rattachements, graphiques au choix). Accueil : panneau « Analyse visuelle » (CA facturé par mois, répartition par statut). Navigation : entrée Chantiers conditionnée au métier ; transparence du masquage. AUCUNE modification de la charte (mêmes variables CSS). | `assets/js/core/charts.js`, `assets/js/core/profile-features.js`, `assets/js/pages/dash/chantiers.js`, `assets/js/core/navigation.js`, `assets/js/pages/dashboard.js`, `assets/js/pages/dash/other.js` |
| **Enregistrement** | `app.ts` : 7 nouveaux plugins de routes enregistrés additivement (chantiers+dérive, portail admin+public, webhooks, maintenance/intégrité/prix, modularité+rapport). | `backend/src/app.ts` |

## Tests

- **Nouveaux (26, tous verts)** : `tests/v50-chantiers.contract.test.mjs` (migrations + rentabilité réelle : coûts, marge, dérive watch/drift, temps non valorisé, devis manquant),
  `tests/v50-payment-reliability.test.mjs` (client fiable +10 stabilité, retards systématiques −40/−30, aucune facture réglée = « inconnu »),
  `tests/v50-recurrence-maintenance.test.mjs` (expansion hebdo bi-mensuelle exacte, bornes, report au jour demandé, fenêtre invalide),
  `tests/v50-integrity-deviation-price.test.mjs` (chaîne intègre + altération localisée + liaison manquante, normalisation d'accents, compensation non masquée, tendance prix + seuil),
  `tests/v50-portal-webhooks-modularity.test.mjs` (hash global, publication outbox transactionnelle, HTTPS seul, HMAC déterministe + rejeu, backoff/lettre morte, maintenance CVC vs coiffure + repli inconnu, types de graphiques suggérés),
  `tests/v50-workflows-frontend.test.mjs` (déclencheurs + préavis borné 1..365 + simulation sans écriture, dry-run route, occurrences agenda, charts 4 types + refus mensonger, nav conditionnée).
- **Contrats mis à jour avec la livraison** (pratique du dépôt) : `tests/navigation.test.mjs`
  (ordre du menu + questionnaire avec l'entrée chantiers), `tests/strict-requirements-1-15.test.mjs`
  (la coquille transmet `features:cachedFlags()` et charge `loadProfileFeatures`).
- **Non-régression** : 721 tests, 0 échec nouveau. Les contrats existants restent verts ;
  les 8 échecs mesurés avant modification sont inchangés (environnement : PostgreSQL réel non
  provisionné + 2 fichiers helpers absents de l'archive source — voir Objet de la livraison).

## Limites honnêtes (pas des fonctionnalités prétendues)

- La livraison d'e-mail des webhooks sortants et le chaînage automatique à l'émission des
  documents sont des fondations testées en contrat ; leur RECETTE PostgreSQL (multi-tenant,
  concurrence) doit être rejouée sur base réelle selon la méthode 15.4.49 (test
  `v49-blocks-01-09.integration.test.mjs` comme modèle).
- L'encart fiabilité de paiement dans la fiche client et l'appel de la dérive depuis l'écran
  de facturation sont à brancher côté interface (services et routes prêts et testés).
- La connexion réelle d'une Plateforme Agréée (bloc 17) reste conditionnée (contrat,
  sandbox, autorisation) — inchangé.
