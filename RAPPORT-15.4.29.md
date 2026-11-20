# Rapport Aurion 15.4.29 — Blocs 0 à 8 de la continuation (14 novembre 2026)

Conforme au prompt maître « continuation » : audit Bloc 0 SANS modification, puis corrections des défauts réellement confirmés, bloc par bloc, sans reconstruire ce qui fonctionnait. Base : `aurion-15.4.28-blocs-4-6-8.zip` (SHA vérifié `e3966a6f…`).

## 1. Livrables par bloc (rapports détaillés dans docs/)

| Bloc | Contenu | Rapport |
|---|---|---|
| 0 | Audit sans modification : 11 défauts confirmés avec lignes de preuve, écart SHA expliqué (2 empaquetages le 14/11 : le rapport interne citait l'archive d'avant l'ajout du rapport ; l'archive livrée est `e3966a6f…`), baseline recalculée 44 % (pondération §7) | docs/RAPPORT-BLOC-0.md (aussi dans aurion-15.4.28-bloc0-audit.zip, SHA `15c7d8aa…`) |
| 1 | Identité partagée + bootstrap attendu + espaces de noms unifiés + file jamais « pas prête » silencieusement | docs/RAPPORT-BLOC-1.md |
| 2 | Curseur de départ AVANT snapshot + deltas de la course ; registre 28→33 entités ; migration 085 additive (quote_items avec tenant par document parent, journal, e-reporting) | docs/RAPPORT-BLOC-2.md |
| 3 | Lectures locales raccordées aux écrans : 12 datasets principaux + lignes de devis réassemblées + jointures clients | docs/RAPPORT-BLOC-3.md |
| 4 | Bail `sending` (récupération crash), dépendances `@ref:` payloads+chemins+dépôts séparés, backoff réactif au retour réseau, 2 bugs latents corrigés (Content-Type du POST moteur ; clé primaire `opId` de l'adaptateur IndexedDB) | docs/RAPPORT-BLOC-4.md |
| 5 | Intentions vérifiées contre les routes réelles (brouillon ≠ émission, numérotation 067 serveur, blocages explicites sans fausse confirmation) | docs/RAPPORT-BLOC-5.md |
| 6 | Politique documents configurable (90 j, quota, épinglés, priorité dossiers actifs, hash SHA-256, à la demande) | docs/RAPPORT-BLOC-6.md |
| 7 | Interface de synchronisation complète (statut global, progression, compteurs, détail opérations, relances) | docs/RAPPORT-BLOC-7.md |
| 8 | Projet **android/ réel** (Capacitor 6, interface embarquée, aucune URL en dur) + script reproductible ; iOS procédure exacte (macOS requis) — **builds signés NON exécutés** | docs/RAPPORT-BLOC-8.md |
| 12 (partie) | VIP sur compte EXISTANT sans doublon, sans rôle platform_admin, tracé — + test d'intégration | CHANGELOG + test bloc12 |

## 2. Preuve de bout en bout (nouvelle, exigée par le prompt)

`backend/tests/frontend-browser.e2e.mjs` — scénario hors connexion automatisé sur Chromium : connexion réelle → bootstrap attendu (indicateur visible) → **mode avion** → création client via l'INTERFACE → décision en file persistante (compteur vérifié dans la page) → statut affiché « Enregistré localement — en attente de synchronisation » → retour réseau → **rejeu automatique, aucun clic, aucune seconde confirmation** → client vérifié en PostgreSQL avec contexte tenant posé (preuve au passage : la RLS reste fail-closed — une lecture hors contexte ne voit rien) → visible dans la vue clients → **aucun doublon**. Aucune erreur console sur tout le parcours.

## 3. Validation exécutée (arbre final 15.4.29)

- Phase-H : cluster PostgreSQL vierge, migrations **001→085 ×2** (idempotence), `npm run check` exit 0, `npm test` exit 0 : **464/464** (463 historique + bloc12).
- Re-vérification finale sur l'arbre livré (après génération android/ et bump de version) : `npm run check` exit 0 (45 fichiers front, ESLint, fumée 79/79, parcours Playwright complet hors connexion).
- Fichiers touchés : listés dans chaque rapport de bloc ; aucune migration historique 001→084 modifiée (085 nouvelle, additive) ; aucune suppression ni affaiblissement de test (bloc3 : schémaVersion attendu 2 justifié par l'extension du registre).

## 4. Avancement recalculé (pondération §7 — interdiction d'inflation)

| Domaine (poids) | Bloc 0 | 15.4.29 | Justification |
|---|---|---|---|
| Produit métier et non-régression (15) | 90 % | 90 % | suites vertes, métier intact |
| Données locales, réplication, outbox (20) | 45 % | 75 % | défauts d'intégration corrigés + preuve e2e bout en bout + registre 33 entités + récupération crash |
| Documents offline, UI sync, conflits (8) | 25 % | 65 % | politique complète + UI réelle ; écran de conflit à deux versions restant |
| Natives Android/iOS (10) | 10 % | 25 % | android/ réel embarqué + script ; build signé et iOS non exécutés |
| OVH, migration, sauvegardes (12) | 30 % | 30 % | préparé, non provisionné (autorisation propriétaire requise) |
| Sécurité, RLS, RGPD, local (10) | 70 % | 75 % | RLS prouvée fail-closed par le test ; persistance IndexedDB à demander |
| Google, Brevo, Stripe, PA (10) | 20 % | 20 % | bouton Google à auditer (Bloc 11), rien de configuré |
| Juridique, médiation, tarifs (7) | 45 % | 45 % | revue ciblée des clauses offline restante |
| Tests multiplateformes, bêta, support (8) | 35 % | 45 % | scénario offline automatisé navigateur ; appareils réels et Windows update non testés |
| **TOTAL §7** | **44 %** | **≈ 56 %** | recalcul à pondération constante — la valeur 63 % de l'évaluateur reflète une pondération différente ; à pondération égale, la progression est de +12 points |

## 5. Palier suivant (75 %)

1. Bloc 11 — réparer le bouton Google (audit OIDC/state/PKCE/callback, sans reconstruction).
2. Bloc 12 complet — écran admin VIP + journal de consultation ; Bloc 13 — runbook OVH consolidé (exécution sur autorisation).
3. Bloc 17 partiel — recette hors connexion Windows (machine éditeur), premiers cas appareils.
4. Bloc 16 — revue ciblée des clauses (offline, chiffrement local, révocation d'appareils).

## 6. Limites déclarées (jamais « réussis » sans exécution)

Builds natifs signés (Android SDK/macOS manquants), iOS, recette appareils réels, mise à jour Windows par-dessus existante, provisionnement OVH, Google/Stripe/Brevo/PA, médiateur — procédures fournies, exécution bloquée sur ressources externes ou autorisations propriétaire.
