# RAPPORT BLOC 3 — Lecture locale dans les vues métier (14 novembre 2026)

Défaut §2.2-6 corrigé : les répliques sont désormais EFFECTIVEMENT consultables hors connexion dans les écrans.

## Modifications

1. **`assets/js/pages/dashboard.js` (fonction `load()`)** — couche de repli locale par dataset : si une vue métier échoue avec statut 0 (serveur injoignable), la vue lit ses RÉPLIQUES dans le même store que la réplication (`getLocalList`), sans dupliquer la logique métier :
   - clients, quotes (+ lignes `quote_items` réassemblées en `items`, noms/e-mails clients joints), appointments, suppliers, parts, interventions, supplies, warranties, policies (`warranty_policies`), devices, sav (`sav_cases`), templates (`document_templates`) ;
   - événement `aurion:offline-view` émis pour l'interface (Bloc 7 affiche « vues affichées hors connexion ») ;
   - les agrégats lourds (comptabilité, trésorerie, notes de frais agrégées, messagerie) conservent le dernier état connu en ligne — PARTIEL assumé et documenté (leur décomposition en entités répliquées viendrait avec le Bloc 17 selon usage réel).
2. Aucune donnée non autorisée consultable : le store est déjà cloisonné par compte/organisation/appareil (Bloc 1) et ne contient que les entités du registre (exclusions §2.2 auditées).

## Tests (exécutés)

- Le scénario Playwright hors connexion ouvre la vue clients en mode avion (données seedées par le parcours), crée un client, puis après rejeu la vue affiche la vérité serveur — `frontend-browser.e2e.mjs` étape 9.
- Recherche locale : le filtrage de la vue clients s'applique aux données affichées (même code de vue, données locales) — pas de second chemin de rendu.

## Limites

Vue par vue : les 12 datasets principaux sont raccordés ; les écrans d'agrégats restent « dernier état connu ». Aucune requête API privée n'est mise dans Cache Storage (aucun changement au service worker ; règle §3.4 respectée).
