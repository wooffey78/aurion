# RAPPORT AURION 15.4.30 — Fiabilisation métier, calculs, échéances, ergonomie et documentation juridique (14 novembre 2026)

Base unique : `aurion-15.4.29-blocs-0-8.zip` (SHA vérifié `7eb5ca58…`, `unzip -t` sans erreur ; le ZIP `(1)` annoncé absent d'`upload/` — contenu identique confirmé). Prompt maître « fiabilisation » appliqué bloc par bloc, sans reconstruire ce qui fonctionnait. **Aucun push, aucun déploiement, aucune donnée réelle.**

## 1. Blocs livrés (constats → corrections → tests)

| Bloc | Demande | Livraison | Test exécuté |
|---|---|---|---|
| 0 | Audit sans modification | `docs/RAPPORT-AUDIT-15.4.29-METIER-DESIGN.md` — 13 constats confirmés avec preuves, matrice cartes/champs | audit seul |
| 1 | Facture réglée : plus d'échéancier ni relance | `next_reminder_at=NULL` dans la transaction de paiement ; refus 409 échéancier sur facture réglée ; re-vérification payé juste avant chaque relance planifiée ; boutons UI conditionnés au statut serveur ; rafraîchissement coordonné après paiement | `bloc1-paid-invoice-actions.test.mjs` **1/1** |
| 2 | Échéances en direct | calendrier fiscal chargé en retard → re-rendu par le cycle existant avec les protections anti-course du tableau de bord (vue inchangée, pas de saisie active, pas de modale) | non-régression + parcours |
| 3 | VL : carte absente si non exercé | carte « Impôt estimé (VL) » rendue seulement si `vlOption==='oui'` ; distinction déclaré/vérifié ; moteur : VL jamais en charge effective hors option (garde existante contrôlée) | condition DOM + bloc9 historique |
| 4 | Trésorerie complète | `potentialIn` (devis) ≠ `committedIn` (**reste dû** : TTC+majorations−paiements) ≠ `committedOut` (notes de frais à rembourser) ; SAV séparé ; `committedNet` ; exclusions explicites ; absent = déclaré (avoirs, fournisseurs, TVA flux, charges fixes, bancaire) jamais inventé | `bloc4-treasury.test.mjs` **1/1** |
| 5 | Historique mensuel complet | chaque mois dépliable : CA HT, TVA collectée, achats, TVA déductible, cotisations, kilométrique, notes de frais, nb factures, solde net ; mois sans mouvement explicités | agrégations par la suite comptable historique |
| 6 | Client existant : remplissage auto | résumé client alimenté à la sélection (nom, e-mail, téléphone, SIRET) ; adresses rechargées ; adresse facturation auto sans jamais écraser une correction manuelle (`data-autofilled`) ; instantané serveur à l'émission inchangé | parcours Playwright |
| 7 | Prévision : 4 horizons | sélections 1-10 ans et `années×12` supprimées ; **3 mois / 6 mois / Année en cours / 365 jours** ; conversion centralisée `forecastHorizonMonths` documentée | options statiques + step24/step8 mis à jour au nouveau contrat |
| 8 | Cohérence transversale | matrice Bloc 0 → corrections 1-7 ; garde `pendingView` dans `refresh()` (une course de navigation ne ramène jamais en arrière — règle 10) | `dashboard-performance-regression` mis à jour |
| 9 | Design harmonisé | règles ciblées (tokens existants) : historique dépliable, résumé client, cartes trésorerie — sobres, responsive | captures + parcours |
| 10 | Accueil/connexion/avatar/Windows | image de la page publique SUPPRIMÉE (index.html **et** rendu SPA `main.js`) ; titres accueil et connexion réduits ~50 % ; landing **0 px de défilement à 1280×720** (mesuré) ; avatar 46/40 px cadré `cover` ; plein écran jamais déclenché en mode application Windows (barre des tâches préservée) ; lanceur intouché | `capture-public-screens.mjs` (mesures) + tests mis à jour |
| 11 | Horloge | `<time datetime>` sémantique, HH:MM tabulaire dominant, secondes discrètes ; veille/drift/nettoyage préservés | `bloc21-22` mis à jour |
| 12 | Nettoyage | mentions « Bloc 8/9/10/11 » supprimées des écrans ; états honnêtes conservés | recherche `Bloc [0-9]` pages = 0 |
| 13 | Juridique à la réalité | 7 documents révisés à 15.4.30 (révision 4.0 maintenue, coordonnées inchangées) ; Android généré mais NON publié ; IndexedDB décrit (répliques, file, documents, cloisonnement, effacement) ; hébergement honnête (Render temporaire / OVH objet / migration non effectuée) | vérification textuelle |
| 14-15 | Revue + non-régression | matrice complète + suite intégrale | voir §2 |
| 16 | Livraison | version 15.4.30 cohérente, ZIP final vérifié | `unzip -t` + SHA-256 |

## 2. Validation exécutée (arbre final)

- **Migrations 001→085 ×2** sur base PostgreSQL neuve (idempotence).
- **`npm run check` exit 0** : syntaxe/imports (45 fichiers), ESLint 0 erreur, fumée, parcours Playwright complet : inscription, 8 étapes, 9 vues, déconnexion/reconnexion **PLUS scénario hors connexion** (création → file → rejeu automatique sans seconde confirmation, sans doublon) — **aucune erreur console**.
- **`npm test` : 466/466** (464 historiques + bloc1 facture réglée + bloc4 trésorerie). Les 6 tests mis à jour au nouveau contrat sont documentés dans chaque bloc (jamais affaiblis : ils ENCADRENT les nouvelles règles — refus réglés, catégories séparées, 4 horizons, horloge sémantique, landing sans image).

## 3. Corrections structurantes découvertes au passage

- **Course de navigation** : `refresh()` re-rendait toujours la vue demandée au départ — un rafraîchissement asynchrone pouvait ramener l'utilisateur sur l'écran précédent (manifesté par le parcours automatisé). Garde `S.pendingView` : seule la dernière navigation demandée rend la vue.
- **Adaptateur IndexedDB / Content-Type** (déjà corrigés en 15.4.29) restent en place.
- Suite rejouable : e-mails de test de bloc14 rendus uniques (collision au re-run sur base non neuve).

## 4. Limites et éléments non exécutés (déclarés, jamais « réussis »)

- Barre des tâches Windows réelle : poste Windows requis (le lanceur est inchangé et le mode natif ne déclenche plus le plein écran navigateur).
- Écran de connexion : le mode inscription conserve ~360 px de défilement à 720 px (tous les contrôles intacts, comportement préexistant) ; le mode connexion via « Se connecter » est compact (validé par le parcours).
- VL : aucune date d'effet stockée en base (l'option est déclarée sans date) — point de vigilance matricé.
- Bloc 13 : la relecture juridique reste celle du propriétaire ; aucune promesse non démontrée ajoutée.
- Hors périmètre exécutable ici : builds natifs signés, provisionnement OVH, Google/Stripe/Brevo/PA, médiateur.

## 5. Avancement (pondération constante §7 de la continuation)

44 % (Bloc 0) → 56 % (15.4.29) → **≈ 61 %** : +5 points pour la fiabilisation métier (factures/échéances/trésorerie/historique testés), l'ergonomie mesurée et la documentation juridique alignée. Les intégrations externes et les natives publiées restent les principaux manques avant commercialisation.

## 6. Base du travail suivant

**`aurion-15.4.30-blocs-metier-design.zip`** — détails par bloc dans `docs/RAPPORTS-BLOCS-METIER-DESIGN-15.4.30.md`, audit initial dans `docs/RAPPORT-AUDIT-15.4.29-METIER-DESIGN.md`.
