# État de la mission — 14 novembre 2026 (session 6 : Blocs 6-bis, 7, 19-partiel + recherches 15/17/18)

Prompt maître « finalisation vers 100 % » (21 blocs). Base : chaîne de livraisons 15.4.30 → 15.4.31 → 15.4.32 → **15.4.33**.

## Livraison courante

**`aurion-15.4.33-blocs-6-7-offline.zip`** — SHA-256 consigné en fin de session — `unzip -t` sans erreur — VERSION 15.4.33 cohérente partout.

## Validation exécutée cette session (PostgreSQL 16 réel)

- Migrations 001→086 ×2 idempotentes ✓ (aucune nouvelle migration : routes ETag + code client uniquement).
- **Nouveaux tests verts** : `bloc6bis` (ETag téléchargement 200 → If-None-Match → 304 → nouvelle version → 200 avec ETag différent) ; `bloc7` (référentiel daté versionné, ETag/304, 401 sans auth).
- Suite intégrale + parcours hors connexion **rejoués en fin de session** : `npm run check` — 45 fichiers front, ESLint 0, fumée **79/79**, parcours Playwright complet **exit 0** (inscription, 8 étapes, 9 vues, déconnexion/reconnexion, scénario hors connexion : rejeu sans seconde confirmation, sans doublon) — **zéro 5xx, aucune erreur console** ; `npm test` **exit 0 : 471/471** (469 + bloc6bis + bloc7).

## Blocs de la session

| Bloc | Résultat |
|---|---|
| **6-bis — Documents récents** | ETag/304 serveur+client (fraîcheur sans retéléchargement), retéléchargement automatique des versions périmées, saturation de quota intelligente (libération hors épinglés), intégrité par échantillon, échecs bornés (5). **Découverte corrigée** : `documents` n'a pas de `updated_at` — première implémentation ETag 500-ait le téléchargement, révélé par le test dédié |
| **7 — Référentiels datés** | `/micro/referential` versionné (ETag/304) + `api.microReferential()` cache-through cloisonné par compte, repli hors connexion **daté et marqué périmé** (`_cachedAt`, `_stale`) ; vues inchangées |
| **19-partiel — Exploitation** | `db:backup` vérifié **fail-safe** (échec propre sans `pg_dump`, aucun fichier partiel) ; bases de drill créées/alimentées/nettoyées ; **drill de restauration non exécutable dans le bac à sable** (pg_dump/pg_restore absents, pas de root) — procédure exacte prête pour exécution conjointe |
| **15 (recherche)** | **Aucune PA confirmée « intégrale »** (entrepreneur + API partenaire gratuites) ; Flowie non éligible (gratuit sous 24 docs/mois puis payant) ; Henrri gratuit entrepreneur mais API partenaire indéterminée ; prochaine étape : conditions écrites de ces deux prestataires |
| **17 (recherche)** | Tarifs relevés : Abby 0/8,10/13,50/29,70 € HT/mois ; Tiime Initial 9,99 € HT/mois ; Indy 0/9 € HT/mois ; Henrri 100 % gratuit. **Proposition (jamais adoptée)** : Aurion 8-9,90 € HT/mois sans engagement, sous le concurrent comparable (Abby Plus/Tiime Initial) — décision éditeur exclusive |
| **18 (recherche)** | Médiation consommation : gratuit pour le consommateur (L.612-1), adhésion pro dès ~25 € HT/3 ans à revérifier ; choix du dispositif (CM2C ou clause B2B) = éditeur, toute adhésion = dépense à autoriser |

## Score pondéré après cette session (pondération fixe, règle 0/25/50/75/90/100)

| Domaine | Poids | Score | Points | Variation |
|---|---|---|---|---|
| A. Produit métier, calculs, non-régression | 12 | 90 % | 10,8 | = |
| B. Sync, réplication, outbox, conflits | 16 | **78 %** | **12,5** | +3 : référentiels datés versionnés (canal Bloc 7 clos) ; reste recalcul local complet des agrégats (décision de conception) |
| C. Documents locaux, stockage natif, appareils | 7 | **70 %** | **4,9** | +10 : fraîcheur/intégrité/quota/réprise bornée des documents locaux ; SQLite natif toujours au Bloc 9-10 |
| D. Web/Windows/Android/iOS buildés et testés | 10 | 42 % | 4,2 | = |
| E. OVH, migration, sauvegardes, restauration | 12 | **28 %** | **3,4** | +3 : script fail-safe vérifié, procédure de drill prête ; exécution réelle bloquée |
| F. Sécurité, RLS, secrets, RGPD technique, supervision | 10 | 70 % | 7,0 | = |
| G. Google, Brevo, Stripe, PA/e-reporting | 12 | 35 % | 4,2 | = (recherches : incertitude réduite, aucune intégration réelle) |
| H. Juridique, médiateur, tarification | 8 | 50 % | 4,0 | = |
| I. Tests réels, accessibilité, bêta, support, exploitation | 13 | 60 % | 7,8 | = |
| **TOTAL** | **100** | | **58,8 %** | **+1,6 point depuis la 15.4.32 (57,2 %)** |

**Trajectoire** : 54,2 % (Bloc 0) → 57,2 % (15.4.32) → **58,8 %** (15.4.33). Les blocs restants exigent des ressources éditeur (mobiles, OVH, comptes externes, contrats) — tous les travaux exécutables sans ces ressources sont faits ou documentés avec procédure exacte.

## Rapports de la session
`docs/RAPPORT-BLOC-06-07-19.md`, `docs/RECHERCHES-15-17-18.md`, CHANGELOG 15.4.33, MISSION-ETAT (ce document).

## Confirmation explicite
**Aucun push, aucun déploiement, aucune bascule DNS, aucune publication, aucune dépense, aucune donnée réelle.** Les recherches citent des sources publiques ; toute souscription/choix de prix/médiateur reste à l'éditeur.
