# AURION V2 — Fiche d'exigence 01 : moteur de propositions de métiers

> **Statut** : exigence fonctionnelle à part entière d'Aurion V2, rattachée aux chantiers 2
> (détection automatique et propositions de métiers) et 3 (catalogue métier enrichi) du
> backlog V2. Formalisée par l'éditeur le 20 novembre 2026 ; intégrée au dépôt en 15.4.47.
> Composantes indissociables : un classement de propositions assorti de niveaux de confiance
> explicites et expliqués, et la conservation systématique des choix manuels.

## 1. Objet et rattachement à la conception V2

La présente fiche inscrit dans la conception V2 d'Aurion le moteur de propositions de métiers
comme exigence fonctionnelle à part entière, avec ses deux composantes indissociables : un
classement de propositions assorti de niveaux de confiance explicites et expliqués, et la
conservation systématique des choix manuels de l'utilisateur. Elle formalise l'exigence telle
qu'énoncée par l'éditeur le 20 novembre 2026 et la rend vérifiable : chaque règle y est
traduite en composant concerné, en critère objectif et en test exigé. La fiche complète les
deux chantiers du backlog V2 auxquels l'exigence est rattachée : le chantier 2 (détection
automatique et propositions de métiers), qui en constitue le cœur, et le chantier 3 (catalogue
métier enrichi), qui en hérite la règle d'extension.

Point d'état vérifié le 20 novembre 2026 : aucun document de conception V2 n'existait encore
en fichier dans le projet. Cette fiche constitue donc la première fiche d'exigence de la
conception V2 ; elle est rédigée de façon autonome et directement intégrable dans le backlog
V2. Elle s'ancre volontairement dans le code réel de la 15.4.41 : le socle de détection existe
déjà (registre public SIREN/SIRET, proposition de catégorie par code APE/NAF avec confiance
déclarée, indices NAF vers les profils, trente profils métiers, table de surcharge par
activité), et la conception V2 consiste à faire évoluer ce socle, non à le reconstruire.

## 2. Socle existant en 15.4.41 et limites que la V2 lève

Le principe fondateur est déjà posé dans le code : « proposer une classification, mais ne pas
considérer le code APE comme preuve suffisante des prestations réellement réalisées ». La
proposition est toujours explicite, sourcée, avec une confiance déclarée et un rappel à
confirmer ; elle n'est jamais appliquée silencieusement (détection au clic, écran « appliquer /
ignorer », valeurs de l'utilisateur conservées).

| Composant existant (15.4.41) | Ce qu'il fait déjà | Ce que la V2 ajoute |
|---|---|---|
| `backend/src/services/public-registry.ts` | Détection SIREN/SIRET ou nom via recherche-entreprises.api.gouv.fr ; renvoie `activite_principale` ; limite 7 req/s avec gestion du 429 | Aucun changement : signal NAF/APE consommé en l'état |
| `backend/src/services/micro-detection.ts` | `proposeCategoryFromNaf` : catégorie micro avec confiance à deux niveaux (code ou section), note et source ; `proposeProfileFromNaf` : UN indice de profil par préfixe NAF | `proposeProfilesFromSignals` : liste classée de plusieurs profils, échelle à quatre niveaux de confiance, raisons sourcées |
| `backend/src/services/profiles.ts` | Trente profils métiers : vocabulaire, catalogue proposé, forme du calculateur | Métadonnées par profil : mots-clés, synonymes, préfixes NAF, notes de prudence (chantier 3) |
| `POST /activities/detect-profile` | Retourne le profil détecté et l'indice NAF, sans classement ni niveau gradué | Retourne 2 à 5 propositions classées avec confiance et raisons ; incertain = demande de confirmation |
| `activity_profile_overrides` (choix par activité) | Stocke le profil choisi manuellement (code validé parmi `PROFILE_CODES`) | Colonnes d'origine du choix (automatique, confirmé, manuel), horodatage et proposition d'origine ; jamais écrasé par la détection |
| Migrations 078 (référentiel micro versionné) | Taux par catégorie datés, sourcés et vérifiés | Aucun changement structurel ; le moteur renvoie aussi la catégorie micro correspondant à chaque proposition |

*Sources : archive Aurion-15.4.41 (`backend/src` cité ci-dessus), lecture du 20 novembre 2026.*

Trois limites précises motivent la V2. Premièrement, la détection de profil ne renvoie qu'une
seule correspondance : l'utilisateur doit deviner qu'il existe d'autres métiers plausibles,
alors que plusieurs profils peuvent convenir à une même activité réelle. Deuxièmement, la
confiance côté profil est binaire (un indice est trouvé ou non), alors que la catégorie micro
bénéficie déjà d'une confiance graduée : l'échelle à quatre niveaux unifie les deux plans.
Troisièmement, l'origine du choix n'est pas conservée : la table de surcharge ne dit pas si le
profil a été proposé puis confirmé ou choisi entièrement à la main, et la mise à jour d'une
activité sans profil renseigné supprimait la surcharge existante (`business.ts`, mise à jour
d'activité), ce qui faisait retomber le profil sur la détection par le nom et la description —
précisément l'effet de bord que l'invariant de conservation interdit. **Cet effet de bord est
supprimé depuis la 15.4.42 et démontré par test d'intégration PostgreSQL depuis la 15.4.47.**

## 3. Fonctionnement attendu du moteur

Le moteur analyse toutes les informations disponibles au moment de la détection, sans en
inventer aucune. Cinq familles de signaux alimentent le classement : le code NAF/APE et les
données obtenues par SIRET/SIREN auprès du registre public ; la description de l'activité
renseignée par l'utilisateur ; les prestations et services effectivement proposés (prestations
du catalogue et pièces déjà créées pour l'activité) ; les mots-clés et éléments du catalogue
métier (vocabulaire propre à chaque profil) ; les éventuelles activités secondaires ou
complémentaires déclarées. Chaque famille produit des candidats avec une force de preuve
documentée ; le moteur fusionne ces candidats en une liste unique et ordonnée.

La sortie est une liste de deux à cinq propositions classées par pertinence, jamais une
correspondance unique imposée. Chaque proposition porte : le code et l'intitulé du profil
métier, la catégorie micro associée (vente BIC, services BIC, services BNC, CIPAV ou cas
spécifique) avec son libellé, un niveau de confiance parmi les quatre niveaux du chapitre 4,
et deux à quatre raisons courtes et sourcées qui justifient le résultat (« code APE 62.01Z :
programmation informatique », « description contient installation électrique », « trois
prestations du catalogue correspondent au profil électricité »). Le tri interne repose sur un
score entier calculé de façon déterministe à partir de pondérations documentées ; le score
n'est jamais affiché à l'utilisateur comme un pourcentage de certitude, qui serait une
précision artificielle.

La conception distingue trois états qui ne doivent jamais être confondus, ni dans les données
ni dans l'interface : le **métier détecté** (signal brut issu du registre ou de l'analyse), le
**métier proposé** (candidat classé présenté à l'utilisateur) et le **métier retenu** (celui
qui gouverne le vocabulaire, le catalogue et les calculs). Seul le troisième état fait
autorité ; les deux premiers sont des candidats, affichés comme tels. La catégorie micro suit
la même logique : elle peut être proposée avec le profil, mais une proposition ne modifie
jamais un réglage fiscal existant sans action explicite.

## 4. Niveaux de confiance : échelle, critères et calibrage

Chaque proposition comporte un niveau de confiance explicite, compréhensible par un
utilisateur non spécialiste et calculé à partir de critères documentés. L'échelle à quatre
niveaux reprend la spécification de l'éditeur et y attache des critères objectifs, vérifiables
par les tests :

| Niveau | Signification | Critères d'attribution (documentés) |
|---|---|---|
| Très élevé | Correspondance particulièrement forte | Règle de code NAF précis (niveau code) ET au moins deux autres signaux concordants (description, catalogue, prestations réelles) ; aucune contradiction |
| Élevé | Correspondance cohérente et bien étayée | Règle de code NAF précis ET un signal concordant ; ou au moins trois signaux concordants dont un au niveau code ; contradictions absentes **ou expliquées** |
| Moyen | Correspondance plausible, à confirmer | Concordance sans règle de code précis : section NAF seule, ou nom et description seuls, ou deux signaux d'égale force ; aucune contradiction nette |
| Faible | Correspondance incertaine, informations complémentaires nécessaires | Signaux contradictoires entre familles, ou un seul signal non étayé, ou hors des règles précédentes ; la proposition déclenche une demande de confirmation |

**Mapping déterministe** : les mêmes entrées produisent toujours les mêmes niveaux ; le
critère complet est écrit dans le code (`PROPOSAL_TUNING` et le mapping de
`proposeProfilesFromSignals`) et testé par contrat.

Le calibrage se fait sur des cas réels et reste vivant. À l'ouverture du chantier 2, un corpus
de référence a été constitué à partir des trente profils métiers et des combinaisons
NAF/description les plus courantes du micro-entrepreneur ; chaque règle du moteur est calibrée
sur ce corpus et les niveaux obtenus sont revus par l'éditeur avant publication. À chaque
extension du catalogue (chantier 3), le corpus est étendu et le calibrage rejoué
(`tools/calibration-replay.mjs`) : un nouveau métier ne peut pas entrer dans les propositions
avec des pondérations non testées.

Enfin, la confiance est toujours accompagnée d'une explication brève : l'interface affiche le
niveau, les raisons qui le composent, les éventuelles contradictions entre familles
(« signal contraire ») et les données manquantes, avec la source des signaux, conformément au
principe déjà écrit dans `micro-detection.ts` (proposition sourcée, jamais une preuve des
prestations réellement réalisées).

## 5. Conservation systématique des choix manuels : invariant fondamental

La règle énoncée par l'éditeur est transposée mot pour mot dans la conception : un métier
choisi ou corrigé manuellement devient la référence retenue par l'utilisateur ; une nouvelle
détection automatique ne peut jamais remplacer ce choix ; une modification des données SIRET,
NAF ou de la description d'activité ne réinitialise pas la sélection manuelle ; si le moteur
découvre une correspondance potentiellement meilleure, il peut afficher une nouvelle
suggestion, mais uniquement comme proposition ; seul l'utilisateur décide de modifier son
métier retenu ; l'origine du choix est conservée (automatique, confirmé par l'utilisateur ou
sélectionné manuellement). Ces règles valent pour le profil métier, pour la catégorie micro
associée et pour toute extension future du catalogue.

La traduction technique fixe cinq invariants vérifiables par les tests :

1. **Aucun chemin d'écriture automatique n'aboutit à la sélection retenue** : les propositions
   ne peuplent que la liste affichée et le journal, jamais la table de surcharge (un seul
   point d'écriture, le helper volontaire, démontré par balayage de contrat).
2. **L'actualisation des données d'entreprise (SIRET, NAF, description) conserve la sélection
   et son origine** ; l'effet de bord de suppression de la surcharge lors d'une mise à jour
   sans profil renseigné est supprimé (démontré en base par le test d'intégration 15.4.47).
3. **Une meilleure correspondance détectée est présentée comme suggestion distincte**, sans
   jamais préselectionner le champ dans l'interface.
4. **L'origine ne régresse jamais** : une sélection manuelle ne peut être rétrogradée en
   sélection confirmée ou automatique par un traitement quelconque (règle SQL dans le point
   d'écriture unique).
5. **Seule une action utilisateur explicite (confirmer, changer, retirer) écrit dans la
   sélection**, et cette action est journalisée.

L'interface reflète ces trois états sans ambiguïté : le métier retenu est affiché comme tel
avec son origine et sa date, les propositions apparaissent dans une zone clairement séparée
(« suggestions — rien n'a été modifié »), et toute action de l'utilisateur sur une suggestion
est un geste volontaire (bouton dédié, jamais une case cochée par défaut). Les correspondances
incertaines (niveau faible) ne sont pas appliquées même sur demande implicite : elles
déclenchent une demande de confirmation explicite, conformément au critère de validation
numéro trois de la spécification.

## 6. Intégration technique dans le socle existant

Le chantier enrichit les systèmes existants sans les reconstruire. Dans
`backend/src/services/micro-detection.ts`, la fonction `proposeProfilesFromSignals(signals)`
produit la liste classée de propositions ; elle réutilise telles quelles les règles
existantes (`CODE_RULES` par code NAF précis, `SECTION_RULES` par section, `NAF_PROFILE_HINTS`
vers les profils) et y ajoute les signaux texte et catalogue, les pondérations documentées
(constante unique `PROPOSAL_TUNING`) et la fusion multi-candidats. Dans
`backend/src/services/profiles.ts`, les trente codes `PROFILE_CODES` restent la seule liste
valide ; chaque profil dispose de métadonnées d'indice (mots-clés, synonymes, notes de
prudence réglementaire) sans changer le contrat public des profils. Le registre public
(`public-registry.ts`) est consommé en l'état : sa limite de sept requêtes par seconde et sa
gestion du 429 sont déjà traitées.

Les routes de `backend/src/routes/business.ts` ont évolué de façon compatible. `POST
/activities/detect-profile` retourne la liste classée (propositions, niveaux, raisons) en plus
des éléments actuels, pour ne pas casser les clients existants. `GET /activities/:id/profile`
expose le triplet attendu : le métier retenu avec son origine et sa date, et les propositions
en cours le cas échéant. La route explicite `POST /activities/:id/profile-choice`
(confirmer une proposition avec `confirmProposalId`, sélectionner un métier de la liste
complète avec `profileCode`, retirer avec `remove`) est la seule écriture possible dans la
sélection retenue ; elle valide le code contre `PROFILE_CODES` comme l'exige déjà le code
actuel et journalise l'opération. La mise à jour d'une activité cesse de supprimer la
surcharge en l'absence de profil transmis : le retrait du profil est une action dédiée,
volontaire et journalisée.

Le modèle de données a évolué par migrations additives et idempotentes, dans la discipline des
migrations 078 à 092 : ajout sur `activity_profile_overrides` d'une colonne d'origine
contrainte (`automatique`→`auto`, `confirmé`→`confirmed`, `manuel`→`manual` — valeur par
défaut « manual » pour les surcharges existantes afin de ne jamais rétrograder un choix déjà
présent), d'une colonne de proposition d'origine (référence de la proposition acceptée) et
d'un horodatage de décision (migration **093**) ; ajout d'une table de journal des
propositions (`profile_proposal_events` : organisation, activité, événement, contenu de la
proposition, horodatage) sous l'isolation RLS 074 héritée, avec clé étrangère cascade vers
`organizations` et réplication orgkey 086 (migration **094**). Le scoring reste déterministe
et local : aucun service d'IA distante, conformément au retrait annoncé en 15.4.0 et au
précédent du lecteur de bordereaux (`bordereau-parser.ts`), qui établit le standard du projet
pour toute extraction automatisée. Les tests existants du bloc 8 et les contrats des tables de
surcharge sont étendus, jamais affaiblis.

## 7. Traçabilité des propositions et des décisions

Chaque étape du cycle de vie d'une proposition est datée et traçable : proposition calculée
(avec les signaux et les niveaux), affichée à l'utilisateur, ignorée, appliquée depuis une
suggestion, confirmée après proposition, changée manuellement, retirée. Le journal des
propositions porte, pour chaque événement, la source des signaux, la liste des raisons
affichées et le niveau de confiance tel que présenté : on peut donc reconstruire a posteriori
ce que l'utilisateur a vu et ce qu'il a décidé, ce qui est la condition de la règle « seul
l'utilisateur décide ». Le journal respecte le cloisonnement par organisation (RLS) et
n'expose jamais les données de devis ou de clients : il ne trace que le cycle de vie du choix
de métier.

L'exploitation s'appuie sur l'existant : le journal est visible côté support et console
d'administration dans les sections prévues, exportable en CSV
(`GET /admin/profile-proposal-journal.csv`, plafonné à 5 000 événements, filtre facultatif par
organisation) avec les filtres de période du chantier exploitation V2, et couvert par la purge
associée à la suppression de compte transactionnelle (migration 090) afin d'honorer le droit
à l'effacement. La rétention des événements de proposition suit la politique des journaux
fonctionnels du produit ; les événements ne contiennent aucune donnée sensible au-delà du
contexte d'activité.

## 8. Critères de validation V2 et tests exigés

La fonctionnalité est considérée comme validée lorsque les sept critères suivants sont réunis
et démontrés par des tests automatisés. Aucun critère ne peut être déclaré franchi sur une
simple démonstration manuelle.

| Critère (spécification éditeur) | Preuve exigée | Livrée par |
|---|---|---|
| Plusieurs profils peuvent être proposés et classés | Contrat : detect-profile retourne 2 à 5 propositions triées ; cas où le meilleur candidat n'est pas premier à l'entrée brute | `v2-profile-proposals.contract.test.mjs` (statique + unitaire build), `v2-secondary-signals.contract.test.mjs` |
| Chaque proposition comporte un niveau de confiance compréhensible et explicable | Contrat : chaque proposition porte un niveau parmi les quatre et 2 à 4 raisons sourcées ; mapping entrées-niveaux déterministe | `v2-profile-proposals.contract.test.mjs` |
| Les correspondances incertaines déclenchent une demande de confirmation plutôt qu'une affectation automatique | Contrat : niveau faible = aucune écriture dans la sélection, réponse portant un marqueur de confirmation requise | `v2-profile-proposals.contract.test.mjs` (requiresConfirmation), `v2-profile-calibration.contract.test.mjs` |
| Un choix manuel résiste aux nouvelles détections, actualisations et modifications des données | Contrat intégration : surcharge préexistante + mise à jour SIRET/NAF/description rejouée = surcharge et origine inchangées ; aucun endpoint d'écriture automatique | `v2-profile-selection.integration.test.mjs` (15.4.47, PostgreSQL réel), `v2-profile-proposals.contract.test.mjs` (balayage des routes) |
| L'utilisateur peut modifier volontairement son choix à tout moment | Contrat + parcours navigateur : changer puis revenir ; l'origine repasse à manuel et est journalisée | `v2-profile-selection.integration.test.mjs`, `v2-profile-ux.contract.test.mjs`, `v2-e2e-fixes.contract.test.mjs` |
| Les propositions, confirmations et changements manuels sont traçables | Contrat : un événement daté par action, contenant niveau, raisons et source ; purge liée à la suppression de compte | `v2-profile-selection.integration.test.mjs` (séquence du journal), migrations 093/094 |
| Les tests démontrent qu'aucune automatisation ne peut écraser une sélection manuelle | Contrat balayage : toutes les routes d'écriture d'activité exécutées avec surcharge préexistante ; aucune ne modifie `activity_profile_overrides` sans action explicite | `v2-profile-proposals.contract.test.mjs` (un seul insert, un seul delete volontaire), `v2-profile-selection.integration.test.mjs` (concurrence + isolation) |

Ces critères rejoignent la discipline du projet : skips interdits, contrats bloquants,
parcours navigateur inclus dans la porte d'intégration.

Le parcours navigateur exigé reproduit le scénario utilisateur complet : création d'activité
avec SIRET détecté, proposition affichée avec niveau et raisons, choix manuel d'un autre
métier dans la liste complète, modification ultérieure de la description et du SIRET, retour
sur l'écran : le métier retenu est inchangé avec son origine « manuel », un bandeau distinct
signale la nouvelle suggestion, aucun champ n'a été prérempli à l'insu de l'utilisateur. Ce
scénario a été rejoué au navigateur aux versions 15.4.45 et 15.4.46
(`docs/RECETTE-NAVIGATEUR-15.4.45.md`, captures dans le paquet de recette).

## 9. Application aux futures extensions du catalogue métier

La règle de l'éditeur est générale : l'automatisation assiste l'utilisateur, elle ne décide
jamais à sa place lorsqu'il a exprimé un choix explicite. Elle s'applique donc de plein droit
aux extensions du catalogue. Concrètement, chaque nouveau métier ajouté au catalogue (chantier
3) doit livrer avec lui ses métadonnées d'indice — préfixes de codes NAF au niveau code,
mots-clés et synonymes de description, notes de prudence réglementaires à afficher — et
hériter automatiquement du moteur, de l'échelle de confiance et des invariants de
conservation, sans développement spécifique ni contournement possible. Un métier sans
métadonnées complètes ne peut pas entrer dans les propositions : il reste sélectionnable
manuellement dans la liste complète, ce qui garantit que l'extension du catalogue n'élargit
jamais la surface de détection au détriment de la fiabilité (contrat d'hygiène du corpus :
vocabulaire non vide pour tout profil sauf le profil générique, qui n'est jamais proposé
automatiquement ; aucun mot-clé partagé entre deux profils).

Le corpus de calibrage est étendu à chaque ajout : les combinaisons NAF/description du
nouveau métier sont intégrées au corpus (`backend/tests/fixtures/calibration-cases.mjs`),
les niveaux produits sont revus avant publication, et les contrats de mapping sont mis à jour
dans la même livraison (`tools/calibration-replay.mjs` rejoue l'ensemble en une commande).
Ainsi, la promesse faite à l'utilisateur (des propositions explicables, jamais imposées)
reste vraie quand le catalogue grandit, et le chantier 3 reste aligné avec le chantier 2 sans
coordination supplémentaire.

## 10. Répartition entre les chantiers 2 et 3 du backlog V2

L'exigence est rattachée aux deux chantiers du backlog V2 sans en créer un troisième : le
chantier 2 porte le moteur et ses invariants, le chantier 3 porte la matière métier qui
l'alimente.

| Chantier | Porte cette exigence | Livrables associés |
|---|---|---|
| Chantier 2 — Détection automatique et propositions de métiers | Le cœur : moteur multi-signaux, liste classée, échelle à quatre niveaux, invariants de conservation, routes, migrations, journal, tests de non-écrasement | `proposeProfilesFromSignals` ; `detect-profile` et profil d'activité enrichis ; migration 093 d'origine du choix ; journal des propositions ; contrats et parcours navigateur ; test d'intégration PostgreSQL |
| Chantier 3 — Catalogue métier enrichi | La matière : métadonnées d'indice par métier, corpus de calibrage, notes de prudence, héritage automatique des invariants pour tout nouveau métier | Métadonnées des trente profils puis des futurs profils ; corpus de référence ; revue de calibrage à chaque extension (`calibration-replay`) |

L'ordre recommandé a été suivi : invariants et journal d'abord (chantier 2), enrichissement
du classement ensuite, métadonnées du catalogue en continu (chantier 3). Cet ordre protège
l'utilisateur dès la première livraison : les invariants de conservation et la traçabilité ont
été posés avant même que le classement multi-propositions soit complet, puisqu'ils portent sur
l'écriture de la sélection et non sur sa suggestion. Le classement et les niveaux sont arrivés
ensuite par itérations de calibrage, sans jamais modifier les garanties déjà en place. La
présente fiche sert de référence commune aux deux chantiers : toute évolution future du moteur
ou du catalogue se mesure aux critères de validation du chapitre 8 et aux invariants du
chapitre 5.

## Annexe A — Traçabilité des 24 tests exigés par le développement V2 (§11)

| # | Situation exigée | Test qui la couvre |
|---|---|---|
| 1 | Un code NAF correspond clairement à un profil | `v2-profile-proposals.contract.test.mjs` (62.01Z → web-development) + corpus de calibrage (24 combinaisons NAF/description) |
| 2 | Le code NAF correspond imparfaitement aux prestations déclarées | `v2-profile-proposals.contract.test.mjs` 15.4.47 (contradiction : NAF 43.21 vs texte plomberie) |
| 3 | Les prestations correspondent mieux à un autre profil que le code NAF | Idem : le candidat texte concurrent est classé avec ses preuves citées |
| 4 | Plusieurs activités sont réellement exercées | `v2-secondary-signals.contract.test.mjs` (signal secondaire hisse le métier secondaire) |
| 5 | Aucune correspondance suffisamment fiable | `v2-profile-proposals.contract.test.mjs` (requiresConfirmation = true, propositions « faible ») |
| 6 | Des informations contradictoires sont détectées | `v2-profile-proposals.contract.test.mjs` 15.4.47 (champ `contradictions`, « très élevé » bloqué) |
| 7 | Un nouveau profil est ajouté au catalogue | `v2-profile-calibration.contract.test.mjs` (hygiène du corpus) + `tools/calibration-replay.mjs` (45/45) |
| 8-10 | Choix manuel + nouvelle détection → choix inchangé | `v2-profile-selection.integration.test.mjs` (vérifié en base) |
| 11-12 | Actualisation SIRET/SIREN → choix inchangé | `v2-profile-selection.integration.test.mjs` (PATCH /organization, vérifié en base) |
| 13-14 | Modification du NAF / de la description → choix inchangé | `v2-profile-selection.integration.test.mjs` (PATCH /activities/:id, vérifié en base) |
| 15-16 | Modification volontaire → nouveau choix enregistré | `v2-profile-selection.integration.test.mjs` (origine « confirmed », datée, journalisée) |
| 17-18 | Reconnexion / synchronisation entre appareils → choix conservé | Le choix est lu en base (`GET /activities/:id/profile`) jamais recalculé ; table dans la réplication orgkey (`bloc3-sync-replication.test.mjs`), journal répliqué (migration 094) |
| 19-20 | Deux modifications concurrentes → aucune mise à jour automatique ne remplace le choix | `v2-profile-selection.integration.test.mjs` (écritures simultanées, une seule ligne, non-régression de l'origine) |
| 21 | Le catalogue métier utilise le profil retenu | Route `seed-catalog` consomme la surcharge ; `v2-profile-ux.contract.test.mjs` |
| 22 | Les propositions non confirmées ne modifient pas la tarification | Le moteur est pur (aucune écriture) — `v2-profile-proposals.contract.test.mjs` |
| 23 | Les personnalisations existantes sont conservées | PATCH sans profil ne touche pas la surcharge (contrat + intégration) |
| 24 | Les données d'une entreprise ne sont pas accessibles à une autre | `v2-profile-selection.integration.test.mjs` (isolation A/B, 404) + RLS 074 sur le journal (migration 093) |

## Annexe B — Points restant à traiter

- **Fiche chantier 3** : RÉCEPTIONNÉE le 21 novembre 2026 et intégrée au dépôt en tant que
  [fiche d'exigence 02](CONCEPTION-V2-FICHE-EXIGENCE-02-CATALOGUE-METIER.md) (corps complet,
  avec annexe d'état de conformité du chantier). Elle confirme le rattachement du moteur à ce
  chantier (§6 et §9 de la présente fiche) et reprend mot pour mot l'invariant de conservation
  : « la mise à jour du catalogue ne doit jamais remplacer les sélections manuelles des
  entreprises ».
- **Nouvelles exigences réceptionnées le 21 novembre 2026** : deux fiches de chantiers V2
  futurs ont été intégrées au backlog de la conception — [fiche 03 : référentiel fiscal,
  social, juridique et réglementaire intelligent](CONCEPTION-V2-FICHE-EXIGENCE-03-REFERENTIEL-REGLEMENTAIRE.md)
  et [fiche 04 : socle transversal d'événements, alertes, confirmations et validations](CONCEPTION-V2-FICHE-EXIGENCE-04-SOCLE-EVENEMENTS-ALERTES-VALIDATIONS.md).
  Aucune fonctionnalité de ces deux chantiers n'est développée en 15.4.47 : les fiches sont
  réceptionnées, traçables, et non démarrées. À noter pour la fiche 04 : elle porte le moteur
  transversal auquel la présente fiche se réfère pour la traçabilité (chapitre 7) — le journal
  des propositions de métiers en sera un producteur d'événements le moment venu.
- **Fiche « CRM avancé, gestion clients et historique relationnel unifié »** : RÉCEPTIONNÉE
  le 21 novembre 2026 (corps complet) et intégrée en tant que
  [fiche d'exigence 05](CONCEPTION-V2-FICHE-EXIGENCE-05-CRM-CLIENTS.md), avec une annexe d'état
  du CRM V1 existant (`clientSummary()`, adresses d'intervention, garanties par activité,
  relances, import de données). Chantier futur, non démarré ; exigence réceptionnée
  uniquement.
- **Fiche « PROMPT TECHNIQUE N° 7 — REFONTE ET EXTENSION DU CYCLE COMMERCIAL D'AURION V2 »** :
  RÉCEPTIONNÉE le 21 novembre 2026 (corps complet transmis après le fragment titre-seul) et
  intégrée en tant que
  [fiche d'exigence 06](CONCEPTION-V2-FICHE-EXIGENCE-06-CYCLE-COMMERCIAL.md), avec une annexe
  d'état du cycle commercial V1 (`invoice-workflow.ts`, `pricing.ts`, paiements partiels et
  échéanciers existants, facturation électronique, facturation récurrente). Chantier futur,
  non démarré ; exigence réceptionnée uniquement. Sa §26 (intelligence commerciale) devra
  être alignée sur le principe directeur de la présente fiche : propositions explicables,
  basées sur des données vérifiables, jamais appliquées sans validation. Aucun fragment de
  document éditeur n'est en attente à ce stade.
- **Recette OVH cible** : rejouer la batterie et la recette navigateur sur le PostgreSQL de
  production cible (OVH) avant bascule — la 15.4.47 a été validée sur PostgreSQL 17 réel
  provisionné (mode CI à deux rôles), pas sur l'instance OVH.
