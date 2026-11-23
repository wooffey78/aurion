# Aurion 15.4.37 — parité entre version locale et version déployée

Correctif de la version locale installée depuis les sources. Aucun changement de schéma
n'est requis : les migrations 090 et suivantes restent valables.

## Détection des cotisations

- Une organisation dont la **forme juridique n'est pas renseignée** ne perd plus la détection :
  le régime micro-entrepreneur est supposé, signalé comme hypothèse (`legalFormAssumed`), puis
  remplacé dès que la situation réelle est déclarée.
- Le **code NAF** continue d'orienter la catégorie (vente BIC, services BIC, BNC, CIPAV) et donc
  le taux de cotisations. Une ligne liée à une **pièce du catalogue** prend automatiquement la
  nature « bien » (vente BIC) ; une ligne de prestation revient à la catégorie de service du
  document. La catégorie reste modifiable ligne par ligne.
- Les activités créées avant ce correctif avec un taux nul et aucune cotisation enregistrée sont
  **réparées automatiquement** au prochain chargement : la détection est rejouée, sans jamais
  écraser un taux déclaré par l'utilisateur.

## Administration et essai

- Sur une installation locale neuve, le propriétaire de l'unique entreprise devient
  **administrateur plateforme** (amorçage borné : aucun administrateur existant et une seule
  entreprise). Une instance déployée multi-entreprises n'est pas concernée.
- Quand **Stripe n'est pas configuré**, aucune période d'essai de 60 jours n'est créée :
  l'instance démarre en accès complet. L'essai ne s'applique que si la facturation est active.

## Horloge et navigation

- L'horloge locale est **unique et placée dans la barre supérieure**, donc visible sur toutes les
  vues, aux couleurs Aurion. Elle a été retirée de l'accueil.
- La navigation de la sidebar passe par un point unique (`navigate`) : un échec de chargement
  affiche la vue cible avec les données disponibles au lieu de laisser le menu inactif.
- Une erreur d'initialisation d'un écran est isolée : elle ne bloque plus les clics suivants.
- Les boutons `data-go` sont délégués au document : les actions **injectées après le rendu**
  (prévisionnel, panneaux asynchrones) répondent désormais au clic.

## Calendrier fiscal

- Le panneau « Calendrier fiscal et seuils » est **retiré de l'interface**. L'API et le calcul
  restent disponibles en interne.
- Une échéance URSSAF à **moins de 7 jours** crée une entrée dans le **journal de bord**. Cette
  alerte n'est jamais résolue automatiquement : seul le clic « Supprimer l'alerte » la retire.

## Google Agenda et Drive en local

- Les messages sont désormais **actionnables** : variables manquantes nommées, emplacement du
  fichier d'environnement (`backend/.env` en local), nécessité de redémarrer, et rappel que la
  boîte mail (SMTP/IMAP) ne fournit pas les identifiants OAuth Google.
- La capacité de stockage est annoncée comme **indisponible avant connexion** au lieu d'un
  « non communiquée » ambigu.

## Vérifications

- `npm --prefix backend run typecheck` : OK
- `npm --prefix backend run build` : OK
- `npm run test:smoke` : 118/118
- `npm run test:frontend` : 45 fichiers, 44 modules
- `npm run lint:frontend` : OK
- `node --test backend/tests/local-parity-15.4.36.contract.test.mjs` : 7/7
- `node --test backend/tests/merge-15.4.35.contract.test.mjs` : 16/16
- `tools/build-web-dist.mjs` : OK

## Limites de cette livraison

- Pas de PostgreSQL dans l'environnement de préparation : les tests d'intégration et les
  migrations réelles n'ont pas été exécutés.
- Aucun navigateur : les parcours visuels (sidebar, boutons, horloge) sont corrigés par lecture
  de code et contrôlés par contrats, pas par clic réel.
- Google Agenda/Drive restent inutilisables sans identifiants OAuth propres à l'installation :
  c'est une configuration, pas un défaut du code.
