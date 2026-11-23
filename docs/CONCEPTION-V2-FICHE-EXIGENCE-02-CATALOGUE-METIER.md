# AURION V2 — Fiche d'exigence 02 : enrichissement et structuration du catalogue métier

> **Statut** : exigence fonctionnelle de la conception V2, réceptionnée le 21 novembre 2026 et
> intégrée au dépôt en 15.4.47. Rattachement backlog V2 : chantier 3 (catalogue métier enrichi) ; dépend du chantier 2 (moteur de propositions, fiche 01).
> Le titre de niveau 1 de la fiche (présent dans le message du 20 novembre 2026, « AURION V2 —
> ENRICHISSEMENT ET STRUCTURATION DU CATALOGUE MÉTIER ») était resté sans contenu ; le corps
> complet a été fourni par l'éditeur le 21 novembre 2026.
> Le texte ci-dessous est la fiche de l'éditeur, reprise sans modification de fond ; seuls
> l'en-tête et les annexes de traçabilité sont ajoutés par la présente intégration.

## 1. OBJECTIF GÉNÉRAL

Faire évoluer le catalogue métier d'Aurion pour en faire un référentiel professionnel complet, structuré, évolutif et exploitable par l'ensemble des modules de l'application.

Le catalogue doit couvrir chacun des profils métiers déjà présents dans Aurion V1, mais également permettre l'intégration de nouveaux métiers sans devoir reconstruire ou modifier profondément l'architecture.

Il doit fournir des informations suffisamment détaillées pour aider une entreprise à configurer son activité, identifier ses prestations, construire ses devis, calculer ses prix, organiser ses interventions et piloter sa rentabilité.

Le catalogue ne doit pas être une simple liste de métiers accompagnés de quelques prestations.

Il doit devenir un véritable référentiel métier structuré, avec des informations opérationnelles, commerciales, techniques et économiques.

**Exigence fondamentale : enrichir l'existant sans supprimer les fonctionnalités, profils, personnalisations ou données déjà utilisés par les entreprises.**

---

## 2. AUDIT OBLIGATOIRE DU CATALOGUE EXISTANT

Avant toute modification, examiner intégralement :

- `backend/src/services/profiles.ts`
- Les services de détection métier.
- Les référentiels de prestations.
- Les modèles de devis et de factures.
- Le moteur de tarification.
- Les modèles de données associés aux profils et prestations.
- Les migrations PostgreSQL.
- Les composants frontend qui exploitent les profils.
- Les éventuels fichiers JSON, référentiels ou constantes complémentaires.

L'architecture V1 comprend déjà environ 30 définitions de profils métier dans `profiles.ts`, ainsi que des règles lexicales et des correspondances supplémentaires.

Ce nombre constitue un point de contrôle à vérifier sur le code réellement audité.

Établir un inventaire exhaustif indiquant, pour chaque profil :

1. Identifiant technique.
2. Nom du métier.
3. Catégorie.
4. Prestations disponibles.
5. Services complémentaires.
6. Durées d'intervention.
7. Pièces et consommables.
8. Paramètres de tarification.
9. Garanties et informations associées.
10. Modules Aurion concernés.
11. Informations manquantes.
12. Personnalisations ou dépendances existantes.

Ne pas se contenter d'examiner quelques profils représentatifs.

Chaque profil existant doit être audité.

Produire une matrice de couverture avant le développement.

---

## 3. STRUCTURATION GLOBALE DU RÉFÉRENTIEL

Mettre en place une organisation logique et homogène du catalogue.

Le référentiel devra pouvoir distinguer :

- Familles professionnelles.
- Catégories.
- Sous-catégories.
- Métiers.
- Spécialités.
- Compétences.
- Prestations.
- Services complémentaires.
- Options.
- Produits et consommables.
- Pièces détachées.
- Équipements et outils.
- Types d'intervention.

Prévoir un système permettant à un même service d'être rattaché à plusieurs profils lorsque cela est pertinent.

Éviter la duplication artificielle d'une même prestation dans plusieurs profils.

Les éléments communs doivent pouvoir être mutualisés tout en conservant les spécificités de chaque métier.

Prévoir une structure de données permettant d'ajouter de nouvelles familles et sous-catégories sans modifier systématiquement le code applicatif.

Les identifiants techniques doivent rester stables afin de ne pas casser les références utilisées dans les documents, les entreprises et les autres modules.

---

## 4. ENRICHISSEMENT OBLIGATOIRE DE CHAQUE PROFIL MÉTIER

Chaque profil existant doit être examiné et enrichi individuellement.

L'enrichissement doit couvrir les rubriques suivantes lorsque celles-ci sont pertinentes pour le métier concerné.

### A. Présentation professionnelle

- Nom usuel du métier.
- Description détaillée.
- Présentation synthétique.
- Catégorie professionnelle.
- Sous-catégories.
- Spécialités.
- Activités principales.
- Activités secondaires.
- Types de clients concernés.
- Types d'interventions habituelles.

Les descriptions doivent être professionnelles, précises et compréhensibles.

### B. Prestations et services

Pour chaque profil, identifier les prestations effectivement pertinentes.

Chaque prestation doit pouvoir contenir :

- Nom.
- Description.
- Catégorie.
- Sous-catégorie.
- Détail du travail effectué.
- Unité de facturation.
- Durée indicative.
- Niveau de complexité.
- Niveau de qualification requis lorsque pertinent.
- Matériel nécessaire.
- Consommables nécessaires.
- Pièces nécessaires.
- Options possibles.
- Conditions particulières.
- Garantie applicable lorsqu'elle est définie.
- Informations utiles au devis.
- Informations utiles à la facture.
- Éventuelles précautions avant intervention.

Ne pas remplir artificiellement toutes les rubriques avec des valeurs génériques.

Lorsqu'une donnée est inconnue, variable ou dépend de l'entreprise, elle doit être identifiée comme telle.

### C. Organisation des interventions

Décrire les types d'intervention rencontrés dans chaque métier :

- Intervention sur site client.
- Intervention en atelier.
- Intervention à distance.
- Déplacement.
- Installation.
- Maintenance.
- Diagnostic.
- Réparation.
- Remplacement.
- Contrôle.
- Entretien.
- Dépannage.
- Autres interventions spécifiques.

Ne proposer que les types adaptés au profil.

Prévoir des durées indicatives lorsque des données suffisamment fiables existent.

Les durées doivent être modifiables par l'entreprise.

Elles ne doivent jamais être présentées comme des engagements contractuels automatiques.

### D. Matériel, équipements et consommables

Identifier, selon le métier :

- Outillage courant.
- Équipements professionnels.
- Instruments de mesure.
- Matériel de sécurité.
- Consommables.
- Produits utilisés.
- Pièces détachées.
- Équipements spécifiques.

Distinguer les éléments nécessaires des éléments facultatifs.

Prévoir des liens avec le futur module de gestion de stock et d'achats, sans imposer l'utilisation de ce module.

Ne pas créer artificiellement des références fournisseurs ou des prix d'achat non vérifiés.

### E. Informations commerciales

Chaque profil doit pouvoir fournir des informations utiles à la création de documents commerciaux :

- Intitulés professionnels.
- Descriptions de prestations.
- Formulations adaptées aux devis.
- Formulations adaptées aux factures.
- Options commerciales.
- Conditions d'intervention.
- Informations préalables à communiquer au client.
- Éléments à vérifier avant acceptation d'un devis.

Les modèles doivent rester personnalisables.

Aucune mention commerciale ne doit être injectée automatiquement dans un document si elle contredit la configuration réelle de l'entreprise.

### F. Paramètres économiques

Prévoir les informations utiles au moteur de calcul existant :

- Unité de tarification.
- Durée de main-d'œuvre.
- Coûts de consommables.
- Coûts de pièces.
- Frais de déplacement.
- Charges opérationnelles éventuelles.
- Complexité.
- Temps de préparation.
- Temps de déplacement.
- Temps de finition.
- Minimum de facturation éventuel.

Les valeurs par défaut doivent être des suggestions documentées, pas des prix imposés.

Le moteur de tarification existant doit rester la source de calcul des montants.

Le catalogue ne doit pas introduire un second moteur économique ou calculer des prix concurrents côté frontend.

### G. Garanties et suivi après intervention

Lorsque cela s'applique :

- Type de garantie.
- Durée indicative ou conditionnelle.
- Éléments couverts.
- Exclusions connues.
- Conditions de prise en charge.
- Informations à conserver.
- Suivi après intervention.
- Échéances éventuelles.

Les durées et règles juridiquement applicables doivent être vérifiées auprès de sources officielles avant leur intégration.

Ne pas confondre garantie commerciale, garantie légale, garantie contractuelle et responsabilité professionnelle.

Ne pas transformer une valeur indicative en obligation juridique.

---

## 5. ADAPTATION AUX SPÉCIFICITÉS DE CHAQUE MÉTIER

Le catalogue doit être réellement adapté aux professions.

Il ne faut pas appliquer un modèle uniforme de prestations à tous les métiers.

Exemples de différences à prendre en compte :

- Un réparateur électronique travaille avec des appareils, pièces détachées, diagnostics et numéros de série.
- Un plombier peut intervenir sur des installations, réseaux, équipements et pièces.
- Un électricien travaille avec des équipements, circuits, installations et contrôles.
- Un professionnel du nettoyage peut travailler à la surface, au volume, au forfait ou à la durée.
- Un développeur web peut facturer au forfait, au projet, à la journée ou à la maintenance récurrente.
- Un artisan du bâtiment peut travailler au métrage, à l'unité, au forfait ou au temps passé.

Ces exemples servent à illustrer la diversité du référentiel et ne doivent pas limiter le périmètre aux seuls métiers cités.

Chaque profil doit être construit selon les réalités de son activité.

---

## 6. GESTION DES ACTIVITÉS MIXTES ET SPÉCIALITÉS

Un entrepreneur peut exercer plusieurs métiers ou plusieurs spécialités.

Le référentiel doit permettre :

- Plusieurs profils associés à une même entreprise.
- Un métier principal.
- Des métiers secondaires.
- Des spécialités rattachées à un métier.
- Des prestations communes entre plusieurs profils.
- Des prestations spécifiques à une spécialité.
- Des activités complémentaires.

Le modèle doit respecter les choix de l'utilisateur.

Le catalogue ne doit pas imposer une activité unique à une entreprise qui en exerce plusieurs.

Les profils associés à l'entreprise doivent pouvoir être activés ou désactivés sans supprimer leurs données historiques.

La gestion du métier principal doit rester compatible avec le moteur de propositions de métiers du prompt technique n° 1.

Une proposition automatique ne peut jamais devenir un profil actif sans validation de l'utilisateur.

---

## 7. PERSONNALISATION DU CATALOGUE PAR L'ENTREPRISE

Le catalogue global Aurion doit constituer une base de départ, et non une configuration imposée.

L'entreprise doit pouvoir :

- Activer les prestations utiles.
- Désactiver les prestations non pratiquées.
- Modifier les libellés.
- Modifier les descriptions.
- Modifier les durées.
- Modifier les prix.
- Définir ses unités de facturation.
- Ajouter des options.
- Ajouter ses propres prestations.
- Créer des prestations personnalisées.
- Définir ses spécialités.
- Organiser son catalogue personnel.

Les personnalisations doivent être enregistrées indépendamment des définitions globales.

**Une mise à jour du catalogue Aurion ne doit jamais écraser les modifications personnelles de l'entreprise.**

Prévoir une séparation claire entre :

1. Référentiel global Aurion.
2. Profil métier retenu par l'entreprise.
3. Catalogue personnalisé de l'entreprise.
4. Modifications propres à chaque prestation.

---

## 8. VERSIONNEMENT ET ÉVOLUTION DU CATALOGUE

Prévoir un mécanisme de versionnement du référentiel.

Chaque profil et prestation doit pouvoir être rattaché à une version ou à un historique d'évolution.

Le système doit pouvoir distinguer :

- Création d'un profil.
- Modification d'une définition.
- Ajout d'une prestation.
- Retrait d'une proposition du catalogue global.
- Modification d'une catégorie.
- Modification d'une correspondance métier.
- Évolution d'un paramètre.

Les mises à jour doivent être non destructives.

Une prestation utilisée dans un ancien devis ou une ancienne facture doit rester compréhensible même si le catalogue évolue.

Les documents historiques doivent conserver leurs propres libellés et données figés.

Une nouvelle définition du catalogue ne doit pas modifier rétroactivement les documents déjà émis.

Prévoir un mécanisme de migration des profils et prestations sans perte de données.

---

## 9. INTÉGRATION AU MOTEUR DE PROPOSITIONS DE MÉTIERS

Le catalogue doit fonctionner avec le moteur décrit dans le prompt technique n° 1.

Il doit lui fournir :

- Les catégories.
- Les profils métiers.
- Les spécialités.
- Les mots-clés.
- Les synonymes.
- Les prestations.
- Les correspondances professionnelles.
- Les éléments permettant d'évaluer la cohérence d'une activité.

Chaque profil doit disposer d'un ensemble de termes de correspondance adapté à la réalité professionnelle.

Prévoir notamment :

- Synonymes.
- Appellations courantes.
- Termes techniques.
- Anciennes appellations lorsque pertinentes.
- Expressions régionales ou professionnelles.
- Services associés.
- Spécialisations.

Éviter les correspondances trop larges qui provoqueraient des détections injustifiées.

Les données du catalogue doivent améliorer le moteur de détection sans introduire de correspondances artificielles.

La mise à jour du catalogue ne doit jamais remplacer les sélections manuelles des entreprises.

---

## 10. INTÉGRATION AUX MODULES AURION

Le catalogue enrichi doit alimenter les modules suivants :

### Clients et CRM
Permettre d'identifier les prestations réalisées pour chaque client.

### Devis et factures
Proposer des prestations structurées et leurs descriptions adaptées.

### Tarification
Transmettre les paramètres nécessaires au moteur existant.

### Ordres de travail et interventions
Fournir les informations techniques et opérationnelles utiles.

### Agenda
Permettre d'estimer les durées d'intervention lorsque ces informations sont disponibles.

### Gestion des stocks
Relier les pièces et consommables aux prestations concernées.

### Achats et fournisseurs
Permettre d'identifier les produits ou fournitures utilisés par métier.

### Comptabilité et rentabilité
Fournir des catégories cohérentes pour analyser les prestations et leur rentabilité.

### Tableau de bord
Permettre une analyse par métier, spécialité et type de prestation.

Les interfaces doivent exploiter un référentiel commun afin d'éviter des définitions différentes d'un même métier selon les modules.

---

## 11. INTERFACE UTILISATEUR

L'interface du catalogue doit rester simple, rapide et cohérente avec l'identité visuelle d'Aurion.

Prévoir :

- Recherche par métier.
- Recherche par prestation.
- Navigation par catégories.
- Navigation par spécialités.
- Filtres.
- Consultation des informations détaillées.
- Activation et désactivation des prestations.
- Ajout de prestations personnalisées.
- Modification des paramètres.
- Consultation des informations globales et personnalisées.

Ne pas afficher toutes les informations techniques simultanément.

Utiliser une présentation progressive : informations essentielles en premier, détails accessibles à la demande.

Le catalogue doit être utilisable sur ordinateur, tablette et smartphone.

Préserver l'accessibilité, la lisibilité et la cohérence graphique de la V1.

Ne pas réaliser prématurément la refonte complète de l'interface V2 : la structure définitive sera déterminée après stabilisation du périmètre fonctionnel de l'ensemble des modules.

---

## 12. QUALITÉ ET FIABILITÉ DES DONNÉES

Le catalogue doit faire l'objet d'un contrôle de qualité.

Prévoir :

- Vérification de l'unicité des identifiants.
- Détection des doublons.
- Contrôle des catégories.
- Vérification des références croisées.
- Contrôle des prestations orphelines.
- Contrôle des unités.
- Contrôle des durées.
- Contrôle des champs obligatoires.
- Détection des descriptions génériques ou insuffisantes.
- Vérification des règles spécifiques à chaque profil.

Chaque donnée doit pouvoir être identifiée comme :

- Référentiel Aurion vérifié.
- Information indicative.
- Information à confirmer.
- Personnalisation de l'entreprise.
- Information issue d'une source externe.

Les informations fiscales et juridiques ne doivent pas être considérées comme fiables simplement parce qu'elles figurent dans le catalogue.

Elles doivent relever des référentiels réglementaires versionnés et sourcés.

---

## 13. GESTION DES NOUVEAUX MÉTIERS

Le système doit permettre l'intégration de nouveaux métiers sans refonte de l'architecture.

Créer une procédure technique d'ajout comprenant :

1. Création du profil.
2. Définition de la catégorie.
3. Définition des spécialités.
4. Ajout des prestations.
5. Définition des unités.
6. Ajout des mots-clés.
7. Définition des paramètres techniques.
8. Définition des paramètres économiques indicatifs.
9. Définition des correspondances de détection.
10. Vérification de la compatibilité avec les modules.
11. Validation de la qualité.
12. Publication d'une nouvelle version du référentiel.

Un nouveau métier ne doit pas être déclaré opérationnel simplement parce qu'il a été ajouté à une liste.

Il doit disposer des données nécessaires à ses usages réels.

Prévoir un statut permettant de distinguer les profils complets, partiellement renseignés et expérimentaux.

---

## 14. SOURCES ET FIABILITÉ PROFESSIONNELLE

Les informations professionnelles doivent être documentées lorsque leur exactitude est importante.

Pour les caractéristiques techniques, réglementaires ou professionnelles spécifiques :

- Privilégier les sources officielles.
- Privilégier les organismes professionnels reconnus.
- Identifier les données qui nécessitent une vérification.
- Conserver la date de vérification lorsque cela est pertinent.
- Distinguer les pratiques courantes des obligations légales.
- Ne pas inventer de certifications, qualifications ou autorisations.

Les références réglementaires doivent être reliées au chantier V2 consacré aux connaissances fiscales et réglementaires.

Ne pas introduire de règles juridiques non vérifiées dans les profils métier.

---

## 15. TESTS OBLIGATOIRES

Les tests doivent couvrir tous les profils existants.

### Tests de couverture
1. Chaque profil existant est présent.
2. Chaque profil possède un identifiant stable.
3. Chaque profil est rattaché à une catégorie valide.
4. Les prestations référencées existent.
5. Les paramètres sont cohérents.
6. Les profils incomplets sont identifiés.

### Tests de personnalisation
7. Une entreprise personnalise une prestation.
8. La personnalisation est conservée après actualisation du catalogue.
9. Une autre entreprise ne voit pas cette personnalisation.
10. Une prestation personnalisée reste disponible dans les anciens documents.

### Tests de versionnement
11. Une prestation globale est modifiée.
12. Les documents historiques ne changent pas.
13. Les nouveaux documents utilisent la nouvelle définition selon les règles prévues.
14. Les profils désactivés restent traçables lorsqu'ils sont utilisés historiquement.

### Tests d'intégration
15. Le moteur de propositions retrouve les profils pertinents.
16. Les prestations apparaissent dans les devis.
17. Le moteur de tarification reçoit les paramètres attendus.
18. Les ordres de travail peuvent exploiter les données métier.
19. Les données de stock restent cohérentes.
20. Les statistiques peuvent être regroupées par métier.

### Tests de compatibilité
21. Les profils existants continuent de fonctionner.
22. Les personnalisations V1 importées restent intactes.
23. Les API existantes ne connaissent pas de régression.
24. Les données restent isolées par entreprise.

Exécuter les tests sur des données représentatives et fournir les résultats réels.

---

## 16. LIVRABLES ATTENDUS

Fournir :

1. Inventaire complet des profils existants.
2. Matrice d'audit de chaque profil.
3. Diagnostic des lacunes.
4. Architecture cible du référentiel.
5. Modèle de données.
6. Migrations nécessaires.
7. Enrichissement de tous les profils existants.
8. Mécanisme d'ajout de nouveaux métiers.
9. Gestion des personnalisations.
10. Gestion du versionnement.
11. Intégration avec le moteur de détection.
12. Intégration avec les modules Aurion.
13. Interface utilisateur.
14. Tests automatisés.
15. Rapport des résultats.
16. Documentation de maintenance du catalogue.

Fournir également un tableau de couverture permettant de mesurer la complétude de chaque profil.

---

## 17. CONTRAINTES ABSOLUES

- Ne pas modifier Aurion V1.
- Ne pas toucher à la branche GitHub `main`.
- Ne pas effectuer de commit.
- Ne pas effectuer de push.
- Ne pas effectuer de déploiement.
- Ne pas créer ou modifier de branche sans autorisation explicite.
- Travailler uniquement dans un environnement V2 isolé, après autorisation de sa mise en place.
- Ne supprimer aucune fonctionnalité existante.
- Ne pas remplacer `profiles.ts` sans avoir vérifié toutes ses dépendances.
- Ne pas recréer un moteur de tarification concurrent.
- Ne pas dupliquer les référentiels déjà existants.
- Ne pas écraser les personnalisations des entreprises.
- Ne pas modifier rétroactivement les documents historiques.
- Ne pas considérer une information indicative comme une obligation professionnelle ou légale.
- Ne pas déclarer un métier complet sans contrôle de couverture.

---

## 18. CRITÈRES DE VALIDATION FINALE

Le chantier est validé uniquement lorsque :

- Tous les profils existants ont été inventoriés et enrichis.
- Les éventuelles lacunes sont identifiées et documentées.
- Les nouveaux métiers peuvent être intégrés sans refonte de l'architecture.
- Les activités mixtes sont prises en charge.
- Les prestations sont structurées et exploitables par les autres modules.
- Les paramètres économiques sont compatibles avec le moteur existant.
- Les personnalisations sont protégées.
- Les versions du catalogue sont traçables.
- Les documents historiques sont préservés.
- Le moteur de détection exploite correctement le référentiel.
- Les tests automatisés passent.
- La documentation permet de maintenir et enrichir le catalogue.

Ne pas considérer le chantier terminé sur la seule base de l'ajout de nouvelles prestations : l'ensemble du référentiel doit être cohérent, exploitable et validé.

## Annexe A (intégration 15.4.47) — État de conformité au 21 novembre 2026

Conformément au §2 (audit obligatoire avant modification) et au §16 (livrables), voici l'état
réel du chantier 3 dans le code audité, établi à partir de la base 15.4.36-15.4.47 :

**Déjà livré et vérifié par la batterie automatisée (667/667 sur PostgreSQL 17 réel) :**

- **§2 inventaire des 30 profils** : les 30 identifiants techniques stables (`PROFILE_CODES`)
  sont audités profil par profil par contrat (`profiles-catalogue-15.4.36.contract.test.mjs`) :
  nom, présentation synthétique, catégorie micro obligatoire, prestations minutées (durée
  documentée par prestation), pièces et consommables, garanties ; le corpus de calibrage
  documente mots-clés et synonymes par profil (`v2-profile-calibration.contract.test.mjs`,
  hygiène du corpus : aucun mot-clé partagé entre deux profils, vocabulaire non vide sauf le
  profil générique qui n'est jamais proposé automatiquement — statut « non opérationnel pour
  la détection »).
- **§7 personnalisation protégée** : le catalogue est instancié par activité
  (`POST /activities/:id/seed-catalog`, `backend/src/routes/business.ts`) avec des insertions
  conditionnées par `where not exists` : ré-exécuter le seed ou actualiser le profil ne
  modifie ni les libellés, ni les durées, ni les prix saisis par l'entreprise ; les
  personnalisations vivent dans des tables par organisation sous RLS (isolation démontrée par
  les tests d'intégration, y compris la fiche 01 : une entreprise ne lit ni n'écrit le
  catalogue d'une autre). Les documents historiques portent leurs propres libellés et prix
  figés (lignes de documents, jamais recalculées).
- **§9 intégration au moteur de propositions** : le moteur consomme directement les
  métadonnées des profils (mots-clés, synonymes, préfixes NAF, prestations, pièces) ;
  l'ajout d'un métier au catalogue étend automatiquement la détection et le corpus de
  calibrage (`tools/calibration-replay.mjs`, 45/45 conformes) ; la règle fondamentale de la
  fiche 01 s'applique de plein droit : la mise à jour du catalogue ne remplace jamais les
  sélections manuelles (`v2-profile-selection.integration.test.mjs`).
- **§10 intégration aux modules** : prestations → devis/factures (lignes de documents),
  durées → agenda et interventions (`serviceMinutes`, modifiables et jamais présentées comme
  contractuelles), pièces → stock par activité, paramètres économiques → moteur de calcul
  existant (aucun second moteur ; mémoire de prix d'apprentissage par activité,
  `POST /pricing/learn`).
- **§12 fiabilité des données** : unicité des identifiants, doublons de mots-clés
  inter-profils et champs obligatoires contrôlés par contrats bloquants ; les informations
  fiscales sont hors du catalogue métier et relèvent du référentiel versionné, daté et sourcé
  (migration 078, `micro_referential_versions`).
- **§15 tests** : couverture (1-6) par les contrats catalogue et hygiène du corpus ;
  personnalisation (7-10) par `seed-catalog` conditionnel + isolation RLS + documents figés ;
  intégration (15-20) par le calibrage, les lignes de devis et la batterie ; compatibilité
  (21-24) par la régression complète et l'isolation.

**Points restants du chantier 3 (documentés, non masqués) :**

1. **§3 hiérarchie familles/sous-catégories/spécialités** avec rattachement d'un même service
   à plusieurs profils : la structure actuelle est un catalogue de 30 profils plats + catégories
   micro + catalogues par activité ; la hiérarchie complète et la mutualisation sont à
   concevoir (structure additive visée, identifiants stables).
2. **§8 versionnement intégral du catalogue métier** : le référentiel fiscal est déjà
   versionné, daté et sourcé (078) ; l'historique d'évolution par prestation du catalogue
   métier (création, modification, retrait) reste à bâtir sur le même modèle.
3. **§13 statut de complétude par métier** (complet / partiellement renseigné / expérimental)
   : partiellement couvert par le cas du profil générique ; à formaliser et à afficher.
4. **§11 interface de navigation du catalogue** (recherche par métier/prestation, navigation
   par catégories, présentation progressive) : l'existant est la proposition de catalogue par
   profil + activation ; la navigation complète est à concevoir avec la refonte UI V2, après
   stabilisation du périmètre fonctionnel (§11 dernier alinéa).
5. **§4.B rubriques détaillées par prestation** (matériel, consommables, qualification, niveau
   de complexité, précautions) : couvertes à des degrés variables selon les profils ; la
   matrice de couverture demandée (§16.2) doit être produite au démarrage effectif du chantier
   et comblée profil par profil sans remplissage artificiel.
