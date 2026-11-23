# RAPPORT BLOC 0 — Audit de la 15.4.28, intégrité et baseline (14 novembre 2026)

Conforme au prompt maître §4-BLOC 0 : **aucun fichier métier modifié** dans ce bloc ; seule ajoutée la présente documentation.

## 1. Intégrité de la source et écart de SHA-256 (§1.1)

- Archive reçue : `aurion-15.4.28-blocs-4-6-8.zip` — SHA-256 `e3966a6f10b61ca4fb5beaedd2845d0ae0ebb914f48d1f2e3cc1f3c3c3128899` — `unzip -t` : **aucune erreur**.
- Le rapport embarqué annonçait `3470e621…`. **Explication vérifiée** : la 15.4.28 a été empaquetée deux fois le 14/11 à quelques minutes d'intervalle. La première archive (17:22, SHA `3470e621…`) ne contenait pas `RAPPORT-15.4.28.md` ; le rapport a ensuite été ajouté à l'arborescence et l'archive finale recompilée (17:24, SHA `e3966a6f…`) — c'est celle livrée et celle citée par l'évaluateur. L'objet haché du rapport interne était donc l'archive d'avant l'ajout du rapport. Les deux empreintes correspondent à des artefacts réels ; **l'empreinte de référence est `e3966a6f…`**. Aucun remplacement silencieux.
- Équivalence arborescence : `diff -rq` entre l'extraction du ZIP et la copie de travail (hors node_modules/dist/données) → **0 différence**. L'audit porte bien sur le contenu livré.

## 2. Matrice EXISTE / PARTIEL / ABSENT / NON TESTÉ

| Composant | État | Preuve d'audit |
|---|---|---|
| Frontend natif servi par Fastify, PWA, manifest, sw.js | EXISTE | arborescence + check |
| Installation Windows (neuve + lancement) | EXISTE (déclaré propriétaire) ; mise à jour par-dessus existante | NON TESTÉ ici |
| File documentaire `aurion-cloud-queue` (séparée) | EXISTE, non fusionnée | cloud-sync.js intact |
| account-sync (056-059, /sync/version) | EXISTE | réutilisé, non recréé |
| Brouillons (054, /settings/draft) | EXISTE | dans la liste blanche outbox |
| local-store.js (Memory/IndexedDB/SQLite à driver) | EXISTE (défaut nsKey corrigé en 15.4.28) | bloc2 6/6 |
| sync-manager.js (registre, snapshot, delta, curseur) | PARTIEL — curseur posé APRÈS snapshot (course) | sync-manager.js:64 |
| routes /sync/* + sync-replication.ts + migration 084 | EXISTE | bloc3 1/1 |
| outbox.js (file, rejeu, statuts) | PARTIEL — init sans identité ; `sending` non récupéré ; dependsOn non transmis par l'interception | outbox.js:29,81 ; api.js |
| sync-ops.ts (rejeu routes réelles, idempotence, liste blanche) | EXISTE (corrigé 15.4.28 : DELETE sans corps, chemins localRef) | bloc4 2/2 |
| recent-documents.js | PARTIEL — KEEP=20 fixe, pas de politique récence/priorité/quota/hash | recent-documents.js:9 |
| api.js interception offline | PARTIEL — enregistre sans attendre l'initialisation de la file | api.js offlineQueue |
| Lectures locales dans les vues | ABSENT — 0 consommateur de getLocalList/getLocalEntity | grep pages = 0 |
| Interface de synchronisation (événements → UI) | ABSENT — 0 consommateur des événements | grep pages = 0 |
| Capacitor android/ios | ABSENT — gabarit + docs seulement | aucun dossier natif |
| VIP pour compte existant | ABSENT — 409 ACCOUNT_EXISTS si e-mail connu | admin.ts:100 |
| Cohérence des versions | PARTIEL — backend/VERSION.txt = 15.4.27 | VERSION.txt fichiers |
| Registre de réplication | PARTIEL — 28 entités ; manquent au moins : dashboard_journal_events, ereporting_declarations/events/lines (toutes avec id+organization_id) ; exclues à raison : OAuth/états (cloud_oauth_states, administrative_mail_oauth_states, google_connections, cloud_connections), billing_*, tables admin, tables sans identifiant stable (activity_contributions, activity_profile_overrides, activity_regulatory_ack, activity_forecast_assumptions, document_number_sequences, document_themes, electronic_invoice_profiles) | audit migrations vs registre |
| Tests exécutés (ici, cluster PostgreSQL réel) | 463/463 verts, check exit 0, migrations 001→084 ×2 — **affirmations du rapport reconfirmées** | journaux phase-H |

## 3. Les dix risques §2.2 — tous confirmés (lignes de preuve)

1. **Init outbox bloquante** — dashboard.js:220 `setOutboxOwner()` sans argument ; outbox.js:29 retourne immédiatement sans `organizationId`/`userId` → `OUTBOX_NOT_READY` garanti à l'écriture offline.
2. **Espaces de noms** — recent-documents.js:19 ouvre le store avec `deviceId: undefined` → nsKey différent de outbox/sync-manager → cloisonnement non garanti entre modules.
3. **`sending` interrompu** — outbox.js:81 ne sélectionne que `pending` → crash pendant `sending` = opération jamais rejouée.
4. **Course snapshot/curseur** — le curseur est récupéré après la boucle de snapshot → changement pendant le snapshot potentiellement perdu.
5. **Dépendances** — orderOps topologique déterministe côté moteur, mais l'interception api.js ne transmet jamais `dependsOn` (seul `kind` est rempli) → graphe réel incomplet.
6. **Lectures locales** — aucune vue métier n'utilise getLocalList/getLocalEntity (0 occurrence).
7. **UI de synchronisation** — aucun consommateur de `aurion:sync-status`/`aurion:outbox-changed` (0 occurrence).
8. **Politique documents** — plafond fixe KEEP=20, pas de récence/priorité/quota/vérification par hash.
9. **Capacitor** — aucun dossier android/ ou ios/, aucune dépendance, aucun build.
10. **VIP compte existant** — admin.ts:100 refuse avec 409 si l'e-mail existe déjà.
11. *(bonus)* **Versions** — backend/VERSION.txt = 15.4.27 contre 15.4.28 ailleurs.

## 4. État de préparation recalculé (pondération §7, interdiction d'inflation)

| Domaine (poids) | % réel | Justification |
|---|---|---|
| Produit métier et non-régression (15) | 90 % | suites vertes reproduites ici ; métier historique intact |
| Données locales, réplication, outbox (20) | 45 % | moteurs présents mais 4 défauts d'intégration P0 + registre incomplet |
| Documents offline, UI sync, conflits (8) | 25 % | moteur seul, aucune UI, politique fixe |
| Natives Android/iOS (10) | 10 % | gabarit + docs, aucun projet ni build |
| OVH, migration, sauvegardes (12) | 30 % | procédures et coûts documentés, rien de provisionné |
| Sécurité, RLS, RGPD, confidentialité locale (10) | 70 % | RLS 074 + isolation testée ; persistance IndexedDB non demandée, révocation à compléter |
| Google, Brevo, Stripe, PA (10) | 20 % | bouton Google signalé défaillant, rien de configuré |
| Juridique, médiation, tarifs (7) | 45 % | CGU relues (déclaré propriétaire) ; clauses offline/notifications à cibler ; médiateur et tarifs ouverts |
| Tests multiplateformes, bêta, support (8) | 35 % | navigateur + PostgreSQL verts ; scénario offline e2e à ajouter ; aucun appareil réel |
| **TOTAL §7** | **≈ 44 %** | recalcul Bloc 0, pondération imposée — la valeur 63 % de l'évaluateur reflète une pondération différente ; ce chiffre n'est pas une régression mais un recalibrage à la pondération du prompt |

## 5. Classement des corrections

**P0 (cette livraison)** : bootstrap identité partagé + espaces de noms unifiés (B1) ; curseur initial avant snapshot + deltas (B2) ; récupération `sending` par bail + dépendances transmises (B4) ; lectures locales raccordées aux vues principales (B3) ; interface de synchronisation et gestion des blocages (B7) ; politique documents configurable 90 j + priorité + quota + hash (B6) ; intentions de rejeu vérifiées contre les routes réelles (B5, contrôle) ; VIP sur compte existant sans doublon (B12 anticipé) ; registre complété (4 entités) + migration 085 additive ; cohérence des versions ; scénario e2e hors connexion→rejeu.

**P1** : projet android/ généré réellement (build impossible ici — pas d'Android SDK/Xcode) ; demande de persistance IndexedDB (`navigator.storage.persist`) ; audit bouton Google (nécessite environnement propriétaire) ; mise à jour Windows par-dessus existante (machine propriétaire).

**P2** : boutiques (comptes, Data Safety), PA (réutilisation de la veille), médiateur, tarification, surveillance externe, SMS — décisions/souscriptions propriétaire.

## 6. Blocages externes (non exécutables ici)

Comptes développeur Google/Apple, Android SDK/Xcode (builds natifs), provisionnement OVH réel, Stripe/Brevo (configuration conjointe), médiateur, appareils réels — déclarés NON EXÉCUTÉS, jamais « réussis ».
