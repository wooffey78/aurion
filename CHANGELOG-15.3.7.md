# Aurion 15.3.7

## Fiabilisation des fonctions métier

- Les règlements d’une facture verrouillent maintenant la ligne de facture dans la transaction avant de recalculer le solde. Deux demandes simultanées ne peuvent donc plus valider un même ancien solde.
- Le règlement, le cumul payé, le statut de facture, la date du dernier paiement et l’écriture comptable sont enregistrés dans la même transaction. Chaque écriture comptable référence désormais son règlement, y compris les acomptes.
- Une date de règlement invalide ou future de plus de 24 heures est signalée au lieu d’être silencieusement remplacée par la date du jour.
- La création et le remplacement d’un échéancier sont transactionnels. Les dates impossibles et les échéanciers dépassant 120 lignes sont refusés, les montants automatiques sont répartis au centime exact et les paiements déjà reçus sont réaffectés aux premières échéances.
- Les prochains numéros de devis et de factures sont attribués atomiquement par organisation et année. La conversion devis→facture verrouille le devis et refuse une seconde conversion concurrente avant tout second envoi.

## Améliorations rapides d’accessibilité

- Les notifications Aurion ont maintenant une région nommée et les erreurs sont annoncées comme alertes accessibles ; les autres messages restent des notifications de statut.
- Sur mobile, les notifications occupent la largeur disponible, respectent la zone sûre de l’écran et coupent les longs messages proprement.
- Cache PWA et cache-busting actualisés pour les nouveaux fichiers.

## Vérifications exécutées

- `npm run test:business` : 42 contrôles ciblés des paiements, échéanciers, numérotation, devis/factures, comptabilité, prévisionnel et SAV.
- `npm run test:ui-a11y` : notifications accessibles et règles de placement mobile.
- `npm run test:frontend`, `npm run test:smoke` et tests ciblés de boutons/clavier : réussis.
- La suite backend complète n’a pas pu être considérée comme une recette valide : le ZIP source ne contient pas les dépendances Node ni `backend/dist`, et aucun PostgreSQL/Docker de test n’est disponible ici.
