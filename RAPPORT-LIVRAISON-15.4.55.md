# RAPPORT DE LIVRAISON — 15.4.55

Date : 23 novembre 2026 · Version : 15.4.55 (précédente : 15.4.54) · Objet : performance, fiabilité et sécurité de l'ensemble des moteurs — sans changement de périmètre fonctionnel ni de schéma.

## 1 · Objet

Demande : « prends 15.4.54 et améliore l'ensemble des moteurs et fonctionnalités pour les rendre plus performants — moteur de calcul, report des valeurs, placeholders dans les bons encarts, détection automatique, sécurité de l'ensemble du projet ». Chaque amélioration est vérifiée par les suites existantes (aucune régression) et par un nouveau contrat dédié.

## 2 · Améliorations réalisées

### 2.1 Moteur de calcul (performance, comportement inchangé)
- `computePricing` mémoïsé sur une sérialisation stable (clés triées récursivement) : les recalculs identiques de l'éditeur (input + change par frappe) et du serveur (rendu de documents) sont servis d'un créneau mémoire unique. Source unique `backend/src/services/pricing.ts`, copie navigateur régénérée (`npm run sync-pricing`) — arithmétique BigInt exacte inchangée.
- Contrat : `backend/tests/v55-engines-hardening.test.mjs` (même entrée → même objet ; ordre de clés insensible ; nouvelle entrée → recalcul).

### 2.2 Report des valeurs (fiabilité du round-trip)
- Tous les montants euro transmis au serveur et stockés dans le brouillon/instantanés sont arrondis au centime (`r2`) dans `assets/js/pages/dash/quote.js` : `partCost`, `finalPriceTtc`, livraison, main-d'œuvre vendue/coût interne, frais kilométriques, `total_ttc`, `labor_selling_ht`, etc. Fin des résidus binaires dans les instantanés ; un champ vide reste absent (`undefined`, jamais 0) — contrats `bloc15-16-accents-freefields`, `labor-cost-separation`, `quote-save-confirmation` alignés.

### 2.3 Placeholders dans les bons encarts
- `{{STATUS}}` : « Devis émis — en attente de décision du client » sur un devis ; envoi/relances/majorations uniquement sur une facture (avant : « Facture envoyée » affiché aussi sur les devis).
- `{{DOCUMENT_TITLE}}` : titre profilé réellement imprimé (ex. « DEVIS DE RÉPARATION ») au lieu de l'étiquette générique.
- Garde anti-dérive : contrat vérifiant que tout champ annoncé par `TEMPLATE_FIELDS` est alimenté dans `documentData` — aucun placeholder fantôme.

### 2.4 Détection automatique (robustesse + performance)
- Repli typographique : le texte d'activité est testé tel quel **et** replié (accents supprimés, apostrophes `'`→droites, espaces insécables) — « Chambres d'hôtes » (U+2019), « d'animaux »… reconnaissent le bon métier ; match sur le texte d'origine toujours conservé (aucune régression possible).
- `profileFor` mémoïsé (cache borné) — hot path serveur (documents, mentions, activités, propositions).
- `detectService`/`rankRelevantParts` : tokenisation du catalogue calculée une fois par référence de tableau (WeakMap) au lieu d'à chaque frappe ; classement identique.
- Réparation de livraison : fixture de calibrage perdue restaurée (`backend/tests/fixtures/calibration-cases.mjs`, 24 cas + 19 hints NAF vérifiés contre le moteur) — contrat + `tools/calibration-replay.mjs` rejouent (45/45) ; `npm test` ne s'interrompt plus sur ce fichier.

### 2.5 Sécurité de l'ensemble du projet
- HSTS explicite garantie en production (`max-age=31536000; includeSubDomains`) dans le plugin de sécurité ; désactivée hors production (tests HTTP en clair).
- Accueil servi depuis un cache mémoire (lecture disque unique ; recalcul si `APP_BASE_URL` change) — chemin public le plus chaud du service ; en-têtes `no-cache` navigateur conservés.
- Audit complet réalisé, posture existante conservée : argon2id, cookies httpOnly/secure/sameSite=strict, rate limits par route sensible, CSP stricte, RLS multi-tenant, uploads bornés, SQL dynamique via listes blanches et paramètres, allowlist de statique.

## 3 · Vérifications exécutées
- `npm --prefix backend run typecheck` + `build` : OK.
- Suites : smoke **174/174**, métier **50/50**, moteurs/détection/placeholders/accueil **4/4**, calibrage **4/4** + rejouage **45/45**, bloc15/labor-cost/save-confirmation alignés : 0 échec.
- ESLint (quote.js, recommendations.js) et `check-frontend` (50 modules) : OK.
- Détection mesurée : apostrophes typographiques reconnues ; 20 000 `profileFor` mémoïsés ≈ 7 ms.

## 4 · Périmètre strict
Fichiers : `backend/src/services/pricing.ts` (+ copie générée `assets/js/core/pricing.js`), `backend/src/services/profiles.ts`, `backend/src/services/document-renderer.ts`, `backend/src/plugins/security.ts`, `backend/src/app.ts`, `assets/js/core/recommendations.js`, `assets/js/pages/dash/quote.js`, tests (`v55-engines-hardening.test.mjs` nouveau ; `bloc15-16-accents-freefields`, `labor-cost-separation`, `quote-save-confirmation`, `v2-profile-calibration.contract` alignés ; `backend/tests/fixtures/calibration-cases.mjs` restauré), versions (`VERSION.txt`, `package.json`, `backend/package.json`, `sw.js`, `index.html`), documents (`CHANGELOG-15.4.55.md`, `RAPPORT-LIVRAISON-15.4.55.md`). Aucune autre route, calcul métier, migration ou interface touchée.
