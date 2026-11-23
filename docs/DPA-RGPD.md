# DPA — Contrat de sous-traitance de traitement des données personnelles (article 28 RGPD)

Version **5.0**, révision du 23 novembre 2026 pour Aurion 15.4.51. Ce document est un document contractuel du service : il est accepté avec les conditions générales (bannière de re-acceptation versionnée) et publié en consultation libre à l'adresse légale du service. Les éléments entre crochets `{{…}}` sont complétés par la configuration d'édition au moment de la publication ; un document contenant un champ non résolu reste en brouillon et n'est jamais présenté comme publié.

> Statut de rédaction : ce contrat repose exclusivement sur des réalités techniques du produit (RLS multi-tenant, chiffrement, journaux d'audit, réversibilité testée). Il reste soumis à la **validation juridique externe** prévue avant l'ouverture commerciale (docs/GO-LIVE-15.4.51.md, section légale).

## 1. Parties et objet

{{AURION_LEGAL_PUBLISHER_NAME}}, {{AURION_LEGAL_PUBLISHER_FORM}}, SIREN {{AURION_LEGAL_PUBLISHER_SIREN}}, adresse {{AURION_LEGAL_PUBLISHER_ADDRESS}}, contact {{AURION_LEGAL_PUBLISHER_EMAIL}} (« le Sous-traitant »), éditeur du logiciel Aurion, agit en qualité de sous-traitant au sens de l'article 28 du Règlement (UE) 2016/679 pour le compte du client professionnel abonné (« le Responsable de traitement »), qui détermine les finalités et les moyens des traitements qu'il réalise avec le service sur les données de ses propres clients et prospects. Le présent contrat complète les conditions générales ; en cas de contradiction sur le seul traitement des données personnelles, le présent contrat prime.

## 2. Nature, finalités et catégories de données

Le Sous-traitant traite, pour le seul compte du Responsable de traitement, les données que celui-ci saisit ou importe dans son espace Aurion : identités et coordonnées de ses clients et fournisseurs, documents commerciaux (devis, factures, relances), pièces justificatives, rendez-vous, échanges de messagerie configurés, données comptables et de trésorerie. Aucune finalité propre n'est poursuivie par le Sous-traitant : ni publicité, ni profilage, ni entraînement de modèle d'apprentissage (le produit n'intègre aucune IA : règles explicites et calculs déterministes). Les personnes concernées sont les clients, prospects, fournisseurs et contacts du Responsable de traitement, leurs salariés éventuels, et les signataires des devis acceptés via le portail (nom saisi et horodatage d'acceptation — article 14-bis de la politique de confidentialité).

## 3. Obligations du Sous-traitant

- **Instruction** : traiter uniquement sur instruction documentée du Responsable de traitement (utilisation du service, paramétrages, demandes de support) ; toute demande d'un tiers ou d'une personne concernée transmise au Sous-traitant est redirigée vers le Responsable de traitement, sauf obligation légale.
- **Personnel** : soumettre le personnel autorisé à une obligation de confidentialité contractuelle ; accès limité aux personnes dont l'intervention l'exige (support sur ticket, exploitation supervisée), chaque accès administratif transverse étant journalisé (audit d'accès).
- **Sécurité** : mesures documentées dans docs/SECURITY.md et docs/SECURITE-RLS.md — isolation multi-entreprise par politiques RLS PostgreSQL, chiffrement au repos des secrets et fichiers privés (clé dédiée, gestion de rotation), authentification avec protection des sessions, journalisation des événements sensibles, chaîne d'intégrité des documents émis, sauvegardes avec test de restauration tracé (runbook), limitation de débit des accès publics.
- **Violation** : notifier le Responsable de traitement sans délai injustifié après connaissance d'une violation susceptible d'entraîner un risque, avec les éléments disponibles (nature, catégories, mesures prises) ; le journal d'exploitation et la supervision (lettres mortes, contrôle de disponibilité) contribuent à la détection.
- **Assistance** : assister le Responsable de traitement pour les demandes d'exercice de droits portant sur les données hébergées (export complet disponible dans le service : `/documents/export-all.zip`, suppression de compte encadrée) ; le service fournit les outils, le Responsable de traitement reste décideur.

## 4. Sous-traitants subséquents

Les sous-traitants subséquents autorisés sont ceux réellement actifs dans la configuration du service, publiés à jour dans docs/SOUS-TRAITANTS.md et servis dynamiquement par l'endpoint public `/transparency` : {{AURION_SUBPROCESSORS}}. Tout ajout ultérieur est porté à connaissance (mise à jour de la page et des documents, acceptation re-déclenchée si substantielle) ; le Responsable de traitement conserve le droit de s'opposer dans les conditions de l'article 28-3-d. Un sous-traitant subséquent n'est jamais « actif » tant que sa configuration réelle n'existe pas — la plateforme agréée de facturation électronique est mentionnée « à venir, aucune donnée transmise avant contrat ».

## 5. Transferts hors Union européenne

Aucun transfert hors UE n'est opéré par conception : hébergement applicatif, base PostgreSQL et stockage objet sont situés en région Francfort (UE). Si un sous-traitant subséquent venait à opérer hors UE, le chapitre V du RGPD s'applique (garanties appropriées documentées et portées à connaissance avant activation).

## 6. Retour et suppression en fin de contrat

À la fin du service (résiliation, expiration et fin de la fenêtre de conservation de 60 jours), les données de l'abonné deviennent inaccessibles puis sont supprimées conformément à la procédure de suppression de compte encadrée ; l'export intégral reste disponible tant que les données sont consultables. La réversibilité est une fonction testée du produit (exports comptables, archive complète des documents, portail de suppression) et non une simple promesse contractuelle.

## 7. Registre et documentation

Le registre des traitements opérés par la plateforme pour le compte des abonnés est décrit dans docs/REGISTRE-TRAITEMENTS.md. Le Responsable de traitement demeure seul responsable de son propre registre et de ses déclarations (CNIL) le concernant.

## 8. Durée

Le présent contrat s'applique pendant toute la durée de l'abonnement, puis jusqu'au terme effectif du retour et de la suppression des données (article 6).
