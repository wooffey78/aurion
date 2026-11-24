# CHANGELOG — 15.4.57

## Correctifs ciblés sur la base 15.4.56

### 1 · Synchronisation des encarts — cloisonnement par activité
- `assets/js/account-sync.js` : les trois appels de rafraîchissement (`/dashboard/summary`, `/accounting/summary`, `/treasury/summary`) transmettent désormais l'activité active via `x-aurion-activity-id`, comme les appels de l'API principale.
- Une bascule d'activité ne peut plus laisser les encarts de l'accueil, de la comptabilité ou de la trésorerie afficher les montants de l'activité précédente ; la valeur transmise vient de `aurion.activeActivityId`, seule source utilisée par `core/api.js`.

### 2 · Montants — robustesse des valeurs non numériques
- `assets/js/core/ui.js` : `formatMoney` convertit toute valeur non finie (`NaN`, `Infinity`, texte invalide) en `0` avant formatage, au lieu de laisser `Number(n||0)` propager `NaN`. Les encarts restent lisibles même si une réponse partielle ou ancienne contient une valeur inattendue.

### 3 · Version
- `VERSION.txt`, `backend/VERSION.txt`, `package.json`, `backend/package.json`, les deux `package-lock.json`, `index.html`, `sw.js` et les liens d'assets : **15.4.57**.
- Aucun changement de schéma de base de données ; migrations et dépendances inchangées.
