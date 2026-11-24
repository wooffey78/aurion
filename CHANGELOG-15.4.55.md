# CHANGELOG — 15.4.55

## Amélioration des moteurs et fonctionnalités (performance, fiabilité, sécurité)

### 1 · Moteur de calcul — mémoïsation pure (source unique conservée)
- `backend/src/services/pricing.ts` (source unique, copie navigateur régénérée par `sync-pricing`) : `computePricing` est mémoïsé sur une clé de sérialisation STABLE (clés triées récursivement, insensible à l'ordre d'insertion). L'éditeur recalcule à chaque frappe (input + change) et le serveur à chaque rendu de document : les appels identiques sont désormais servis depuis un créneau mémoire unique (jamais une table qui croît). Arithmétique BigInt exacte inchangée — aucun changement de résultat, vérifié par les suites de scénarios dorés.
- Nouveau contrat `backend/tests/v55-engines-hardening.test.mjs` : même entrée → même objet résultat, ordre de clés insensible, nouvelle entrée → recalcul, contributions strictement identiques.

### 2 · Report des valeurs — arrondi au centime systématique
- `assets/js/pages/dash/quote.js` : tout montant euro transmis au serveur ou stocké dans le brouillon est arrondi au centime (`r2`) — achats (`partCost`), TTC visé (`finalPriceTtc`), livraison, main-d'œuvre vendue et coût interne, frais kilométriques, instantanés du brouillon (`total_ttc`, `labor_selling_ht`…). Les résidus binaires (ex. `89.90000000000001`) ne partent plus dans les instantanés : le moteur serveur (arithmétique exacte) reçoit des valeurs propres et reproductibles, le round-trip éditeur ⇄ brouillon ⇄ reprise est fidèle.
- Un champ laissé VIDE reste ABSENT (`undefined`, jamais `0`) : contrat `bloc15-16-accents-freefields` mis à jour et conservé.

### 3 · Placeholders des modèles personnalisés — dans le bon encart
- `{{STATUS}}` ne dit plus « Facture envoyée » sur un DEVIS : texte selon le type réel (« Devis émis — en attente de décision du client » / facture : envoi, relances et majorations cumulées).
- `{{DOCUMENT_TITLE}}` porte désormais le titre profilé réellement imprimé par le moteur natif (ex. « DEVIS DE RÉPARATION »), pas l'étiquette générique DEVIS/FACTURE.
- Garde anti-dérive (contrat) : chaque champ annoncé par `TEMPLATE_FIELDS` doit exister dans la carte d'alimentation `values` — aucun placeholder fantôme possible.

### 4 · Détection automatique — robustesse typographique + performance
- `backend/src/services/profiles.ts` : le texte d'activité est testé TEL QUE SAISI **et** sous forme repliée (accents supprimés, apostrophes typographiques `'` droitifiées, espaces insécables normalisés). Les saisies réelles comme « Chambres d'hôtes » (apostrophe U+2019) ou « d'animaux » reconnaissent désormais le bon métier ; les cas historiques restent identiques (match d'origine toujours conservé → aucune régression possible).
- `profileFor` est mémoïsé (cache associatif borné, vidage au plafond) : il était appelé plusieurs fois par requête avec les mêmes entrées (rendu de document, mentions, listes d'activités, propositions). Mesuré : 20 000 appels mémoïsés ≈ 7 ms.
- `assets/js/core/recommendations.js` : la tokenisation du catalogue complet (prestations et pièces) était recalculée À CHAQUE FRAPPE dans l'éditeur — elle est désormais calculée une fois par référence de tableau (WeakMap, invalidation naturelle au changement de catalogue). Classement strictement identique.
- Réparation de la livraison : la fixture perdue `backend/tests/fixtures/calibration-cases.mjs` (corpus de calibrage 15.4.46 : 24 combinaisons + 19 hints NAF) est restaurée et vérifiée contre le moteur réel — le contrat de calibrage et l'outil `tools/calibration-replay.mjs` rejouent de nouveau (45/45 contrôles conformes). Le contrat posait aussi son environnement (pattern des autres tests) : `npm test` ne s'interrompt plus sur ce fichier.

### 5 · Sécurité du projet — durcissement ciblé
- `backend/src/plugins/security.ts` : HSTS explicite en production (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) — helmet ne l'émettait plus de façon garantie depuis l'adoption de `useDefaults:false` sur la CSP ; désactivée hors production (tests HTTP en clair).
- `backend/src/app.ts` : le HTML d'accueil est lu une fois puis servi depuis un cache mémoire (recalcul seulement si `APP_BASE_URL` change) — `/` est le chemin public le plus chaud du service ; plus aucune lecture disque par requête, à contenu identique (no-cache conservé côté navigateur).
- Existant vérifié lors de l'audit, inchangé : argon2id (64 Mo, t=3), cookies httpOnly/secure/sameSite=strict, rate limits dédiés (login 5/15 min, OAuth, VIP), CSP stricte sans tiers, RLS multi-tenant (AsyncLocalStorage), uploads multipart bornés, SQL dynamique uniquement via listes blanches/paramètres, allowlist de fichiers statiques avec dotfiles refusés.

## Version
- `VERSION.txt`, `package.json`, `backend/package.json`, `sw.js`, `index.html` : 15.4.55.
- Aucune migration de base de données : aucun changement de schéma.
- Vérifications : `typecheck` OK · smoke 174/174 · métier 50/50 · contrats moteurs/détection/placeholders 4/4 · calibrage 4/4 + rejouage 45/45 · ESLint/parse front OK.
