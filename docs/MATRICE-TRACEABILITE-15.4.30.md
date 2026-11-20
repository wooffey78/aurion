# Matrice de traçabilité — demandes du prompt « fiabilisation » → bloc → fichier → test → résultat

Légende : ✅ implémenté + test exécuté vert ; 🔶 implémenté, limite documentée ; 📄 documentation.

| Demande | Bloc | Fichier(s) | Test | Résultat |
|---|---|---|---|---|
| Boutons Échéancier/Relance/Majoration masqués si réglée | 1 | docs.js | bloc1 (statique via conditions + intégration serveur) | ✅ |
| `next_reminder_at=NULL` au paiement complet (transaction) | 1 | business.ts | bloc1 | ✅ |
| Refus déterministe échéancier/relance/majoration sur réglée | 1 | business.ts | bloc1 (409 ALREADY_PAID ×3) | ✅ |
| Re-vérification payé juste avant envoi planifié | 1 | scheduler.ts | bloc1 (facture réglée → 0 relance) | ✅ |
| Paiement partiel ≠ complet (fonctions conservées) | 1 | — | bloc1 (partially_paid, échéancier OK) | ✅ |
| Historique paiements/relances/écritures conservé | 1 | — | bloc1 (2 paiements = 2 écritures) | ✅ |
| Sur-paiement refusé | 1 | — | bloc1 (409) | ✅ |
| Rafraîchissement immédiat sans rechargement | 1-2 | docs.js, other.js | parcours e2e | ✅ |
| Carte « Prochaine échéance » recalculée après chargement tardif | 2 | other.js | non-régression + garde vue/saisie | ✅ |
| 1re échéance à venir, reports, moteur unique | 2 | fiscal-calendar.ts (inchangé) | suite calendrier historique | ✅ |
| Carte « Impôt estimé (VL) » absente si non/inconnu | 3 | other.js | condition de rendu + bloc9 | ✅ |
| VL jamais charge effective hors option/période | 3 | moteur contrôlé | bloc9-fiscal-options | ✅ |
| Trésorerie : reste dû des factures partielles | 4 | business.ts | bloc4-treasury (150/300) | ✅ |
| Trésorerie : catégories séparées (potentiel/engagé/sorties) | 4 | business.ts, other.js | bloc4-treasury + step24 mis à jour | ✅ |
| Facture payée jamais encaissement futur ; devis converti non double-compté | 4 | business.ts | bloc4-treasury | ✅ |
| Notes de frais à rembourser = sortie engagée ; remboursée = réalisé | 4 | business.ts | bloc4-treasury | ✅ |
| Devis annulés exclus ; isolation A/B | 4 | business.ts | bloc4-treasury | ✅ |
| Flux manquants déclarés (avoirs, fournisseurs, TVA flux, charges fixes, bancaire) | 4 | business.ts (`excluded`) | bloc4-treasury | 🔶 (inventés jamais) |
| Historique mensuel : toutes composantes du moteur | 5 | other.js | présentation + suite comptable | ✅ |
| Mois sans mouvement explicités (zéro réel jamais masqué en mouvement) | 5 | other.js | présentation | ✅ |
| Exports = mêmes définitions temporelles que l'écran | 5 | moteur inchangé | bloc14-accounting-export | ✅ |
| Client sélectionné → coordonnées affichées automatiquement | 6 | quote.js | parcours | ✅ |
| Adresse facturation auto sans écraser une correction manuelle | 6 | quote.js | marqueur data-autofilled (comportement) | 🔶 (test dédié DOM à ajouter au Bloc 17) |
| Instantané serveur à l'émission (historique non réécrit) | 6 | inchangé | suite documents | ✅ |
| 4 horizons seulement (3 mois/6 mois/année en cours/365 j) | 7 | other.js | step24 mis à jour + options statiques | ✅ |
| Bornes centralisées et documentées | 7 | other.js (`forecastHorizonMonths`) | statique | 🔶 (granularité mensuelle documentée) |
| Chaque encart = définition vérifiable (matrice) | 8 | RAPPORT-AUDIT + rapports blocs | — | ✅ |
| Recalcul sans rechargement sur saisie calculateur | 8 | inchangé (existant) | parcours | ✅ |
| Course de navigation jamais en arrière | 8 | dashboard.js (pendingView) | dashboard-performance mis à jour + e2e | ✅ |
| API en échec ≠ zéro (dernier état connu libellé) | 8 | inchangé | step24/28 | ✅ |
| Landing sans image, une colonne | 10 | index.html, main.js | requirements-15 mis à jour + capture | ✅ |
| Titres accueil/connexion réduits ~50 % | 10 | app.css | capture (visuel) | ✅ |
| Landing sans défilement vertical à 1280×720 | 10 | app.css | capture (mesure 0 px) | ✅ |
| Avatar agrandi, cadré, visible plein écran | 10 | app.css | capture | ✅ |
| Windows : barre des tâches préservée, pas de Fullscreen API en natif | 10 | dashboard.js | bloc21-22 (lanceur inchangé) | 🔶 (poste réel requis) |
| Horloge sémantique élégante, sans fuite de timer | 11 | ui.js | bloc21-22 mis à jour | ✅ |
| Mentions de chantier supprimées des écrans | 12 | other.js, quote.js | recherche « Bloc [0-9] » = 0 | ✅ |
| Juridique : version réelle, Android non publié, IndexedDB décrit, hébergement honnête | 13 | 7 docs | vérification textuelle | 📄 |
| Non-régression complète (migrations ×2, check, test) | 14-15 | — | phase-H : 466/466 + check exit 0 | ✅ |
| ZIP final vérifié + SHA-256 + rapport | 16 | — | unzip -t | ✅ |
