# Direction visuelle Aurion

Aurion évite le kit SaaS générique. Le langage visuel part du produit : un outil professionnel configurable, calme et dense, qui doit pouvoir accueillir des métiers très différents.

## Palette
- Encre forêt `#10231f`
- Papier minéral `#f5f3ec`
- Surface ivoire `#fffdf8`
- Or fonctionnel `#d7a84b`
- Sauge `#8bb7a5`
- Ligne `#d8ddd4`

## Typographie
Système sans-serif pour éviter une dépendance externe et garder une interface rapide. Les grandes tailles, la chasse et l'espacement donnent la personnalité plutôt qu'un effet « landing page » décoratif.

## Mise en page
Grille asymétrique sur l'accueil, puis interface d'application plus dense. Les contours et séparations indiquent la structure réelle : entreprise, activité, documents, modules, paramètres.

## Principe distinctif
Le premier écran parle de l'entreprise avant de parler de l'IA. EasyFixit n'occupe aucune place privilégiée dans le noyau : il apparaît comme un module parmi d'autres.


## Aurion 15.2.40 — principes de l'interface professionnelle

- Palette graphite, gris neutre et vert sauge discret ; le bleu vif, les lueurs et les grilles décoratives ne sont plus les accents dominants.
- Les surfaces sont opaques et sobres pour améliorer la lisibilité des champs métier et limiter les effets décoratifs.
- Le Catalogue métier présente les catégories avec des compteurs, une recherche globale, des filtres visibles, des cartes homogènes et un dialogue de consultation explicite.
- Le responsive passe d'une grille sur deux colonnes au mobile à une colonne ; les contrôles ont des zones tactiles suffisantes et des états de focus clavier.
- Les imports sont additifs, limités en taille/nombre, réservés au schéma JSON Aurion versionné et ignorent les doublons par nom normalisé. Ils n'écrasent ni ne suppriment les données existantes.
- Les méthodes de connexion restent alternatives : mot de passe, clé d'accès WebAuthn ou Google OpenID Connect, ce dernier uniquement si son client OAuth est configuré.
- Les calculs de devis/factures, les routes métier existantes et les documents déjà émis ne doivent pas être modifiés par une refonte purement visuelle.


## Aurion 15.2.41 — thème clair et prévisionnel d’activité
- L’interface applicative utilise un fond blanc, des surfaces blanches, des bordures bleu clair et un bleu fonctionnel réservé aux actions, aux états actifs et aux points importants. Les dégradés, lueurs et mouvements décoratifs sont neutralisés dans les zones principales.
- Les catégories du Catalogue métier commencent repliées et possèdent des contrôles de déploiement/rétraction accessibles au clavier ; une recherche ouvre les catégories qui contiennent des résultats.
- Le prévisionnel est une simulation d’activité hypothétique distincte des flux des documents existants. Ses hypothèses (clients/réparations potentiels par mois, ticket moyen TTC, coût variable, frais fixes et provision complémentaire) sont conservées par activité.
- L’affichage projette entrées, sorties et solde sur 1, 3, 6 et 12 mois. La provision complémentaire est uniquement une hypothèse ajustable, jamais une détermination fiscale ou sociale. Les flux de documents déjà identifiés restent dans un bloc séparé pour limiter le double comptage.
