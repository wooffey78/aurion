# Parcours simplifié de bascule vers Francfort — Aurion 15.3.20

> **État réel vérifié le 30 octobre 2026 :** `main` demeure au commit 15.3.19 `8301e974`; les changements 15.3.20 sont sur une branche de travail et dans le PR #28, non fusionné. Render a encore deux services Free, auto-déployant `main` : `aurion-web` en Oregon et `aurion` à Frankfurt. Le dernier déploiement live constaté est 15.3.18 sur les deux services. La tentative d’actualisation manuelle 15.3.19 sur Oregon a échoué. Aucune migration production, copie de secrets, migration de fichiers ou bascule DNS n’a été effectuée pour 15.3.20. La CI du PR échoue avant ses étapes et ne fournit donc aucune preuve de build/tests. Ce guide est une procédure future, pas le compte rendu d’une bascule réalisée.


Ce guide prépare la cible choisie : le service Render `aurion` à Francfort, Neon en UE, OVH Object Storage `de` Francfort, sauvegarde chiffrée dans un autre emplacement UE. Au contrôle du 30 octobre 2026, `aurion` à Francfort n’avait pas sa configuration backend complète et redirigeait vers `aurion-web` en Oregon; l’Oregon répondait à `/health/db`. Les deux services étaient gratuits, reliés à `main` et en auto-déploiement. Le code source corrige la destination canonique et ferme Frankfurt en HTTP 503 s’il n’est pas configuré. Le connecteur ne permet ni de lire les secrets Render existants ni de changer le plan; la bascule nécessite la copie contrôlée des mêmes clés chiffrantes, des réglages DB et du stockage S3 avant de servir des utilisateurs. Le domaine canonique doit être vérifié dans les réglages DNS.

Depuis ce contrôle, le commit 15.3.20 (`c1bf397`) a été poussé sur GitHub `main`. Render a enregistré `commit_ignored`; aucun déploiement n’a été lancé.

## Avant de commencer

- Vérifier le domaine Aurion et l’accès DNS.
- Vérifier l’identité EI, SIREN/SIRET, adresse, régime TVA, tarifs, période payée et moyen de remboursement auprès des justificatifs et comptes réels.
- Dans Render, relever le service canonique, sa version, sa région, l’URL, les variables, la présence d’un disque persistant, le chemin de stockage et les journaux. Ne pas présumer de la conservation des fichiers locaux : Render précise que le système de fichiers est éphémère par défaut sans disque persistant.
- Dans Neon, relever branche, région, rôles, version de schéma, URL de connexion et politique de sauvegarde. Créer une branche de préparation et un point de restauration vérifié avant toute migration.
- Télécharger une sauvegarde des fichiers actuels et de la base. Le service Frankfurt n’est pas un substitut à cette sauvegarde.

## 1. Créer les comptes et les ressources

1. Utiliser le service Render `aurion` déjà en région Frankfurt. Le `render.yaml` reprend ce nom et demande le plan `starter`; il ne met pas automatiquement à niveau un service existant non géré par Blueprint. Ne pas créer un troisième service ni synchroniser le blueprint sans examiner la liste des changements que Render propose. Garder l’instance Oregon jusqu’à la fin de la bascule.
2. Choisir ou confirmer la branche Neon dans l’UE, idéalement la région commerciale souhaitée. Ne pas créer une autre base si la région actuelle convient; la région exacte doit être vérifiée dans la console.
3. Créer un bucket OVHcloud Object Storage dans `de` (Francfort), privé, sans accès public, et une clé dédiée au service Aurion avec droits minimum. Activer le chiffrement de stockage disponible au contrat et limiter les personnes ayant accès aux clés.
4. Préparer une seconde sauvegarde en UE, dans un emplacement indépendant et chiffrée avec une clé distincte. Définir les durées et tester la restauration.
5. Créer Brevo gratuit, valider un domaine expéditeur, configurer SPF/DKIM/DMARC puis tester des messages de vérification, support, facture et rétractation. Le quota gratuit annoncé est de 300 envois/jour et le pied de mail peut porter la marque Brevo.
6. Vérifier le compte Stripe, les prix, les liens de paiement, les remboursements et le webhook de production. Ne pas activer les paiements avant la revue juridique.

## 2. Compléter les variables du Render Frankfurt

Renseigner les secrets dans le tableau de bord Render, jamais dans Git ou dans le ZIP. La configuration cible indique déjà `AURION_STORAGE_BACKEND=s3`, l’endpoint OVH de Francfort et le port SMTP 587/STARTTLS. Renseigner au minimum :

- `DATABASE_URL` et `AURION_MIGRATION_DATABASE_URL` avec les rôles adaptés et la branche Neon cible;
- `AURION_RUNTIME_DB_ROLE`;
- `AURION_S3_BUCKET`, `AURION_S3_ACCESS_KEY` et `AURION_S3_SECRET_KEY`;
- `PLATFORM_SMTP_USER`, `PLATFORM_SMTP_PASS` et `PLATFORM_SMTP_FROM` avec l’expéditeur vérifié;
- `AURION_SUPPORT_EMAIL`, `APP_BASE_URL`, `CORS_ORIGIN` et l’URL OAuth Google uniquement si Google est activé;
- `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` uniquement après validation du compte et du parcours de paiement.

`AURION_LEGAL_PUBLICATION_APPROVAL` n’est volontairement pas fourni : les documents 2.3 sont des projets et l’application doit continuer de bloquer inscriptions et paiements tant qu’ils ne sont pas validés. Les valeurs de publication juridique ne doivent pas servir à contourner ce blocage.

## 3. Préparer la base et les fichiers

1. Restaurer la sauvegarde sur une branche de préparation Neon et y démarrer la version 15.3.20. Examiner les migrations `070`, `071` et `072`, les résultats et les tarifs affichés avant de choisir une fenêtre de production.
2. La migration 072 règle les prix enregistrés à 14,00 € mensuel et 151,20 € annuel sous le taux TVA configuré à 0 %. Vérifier ces montants et le régime fiscal réel avant de l’appliquer à la production. Les migrations 070–072 ne sont pas présentes dans le schéma Neon observé au 30 octobre; elles s’exécutent automatiquement au démarrage production. Préparer l’aperçu sur une branche temporaire et obtenir l’accord explicite avant le déploiement qui les applique. Ne pas les exécuter manuellement en parallèle du démarrage serveur.
3. Migrer les fichiers privés de la région source vers le bucket OVH avant de basculer les utilisateurs. Si le service Oregon contient des fichiers locaux, garder ce service et son disque disponibles pendant l’export. Utiliser la migration prévue par le code (`AURION_AUTO_MIGRATE_LOCAL_STORAGE=true`) uniquement sur l’instance/source qui a accès à ces fichiers, puis vérifier nombre, tailles et ouverture des objets. Si le volume est éphémère ou sans disque, exporter les objets depuis l’instance active avant arrêt.
4. Après vérification, retirer le drapeau de migration automatique et s’assurer que les écritures se font seulement vers S3.

## 4. Déployer et basculer sans perdre le retour arrière

1. Les deux services auto-déploient `main`. Pour publier sans déclencher l’Oregon, utiliser le marqueur `[skip render]` dans le commit, puis déclencher uniquement le service Frankfurt depuis Render. Cela ne doit être fait qu’après copie des secrets de chiffrement existants et configuration de la base, du rôle de migration, du bucket S3 et des migrations approuvées. Sans ces valeurs, le code Frankfurt reste fermé et l’Oregon continue de servir l’application.
2. Vérifier le démarrage, `/health`, `/health/db`, journaux sans secrets, création de compte bloquée, stockage S3 privé, lecture/téléchargement d’un document, e-mail SMTP, Stripe en mode test et requête de rétractation avec accusé. Ne pas utiliser de vraies données client pendant cette vérification.
3. Vérifier les alertes, limites et le coût du plan Render. Configurer les DNS pour faire pointer le domaine sur le service Frankfurt et vérifier certificats HTTPS, origine CORS, OAuth, cookies et service worker.
4. Observer le service en production contrôlée. Désactiver l’auto-déploiement et le trafic de l’instance Oregon seulement après confirmation que PostgreSQL et tous les fichiers lisent/écrivent depuis Frankfurt, que les webhooks arrivent et qu’un retour arrière est encore faisable. N’effectuer aucune suppression de données source avant l’expiration de la fenêtre de retour.

## 5. Ouvrir la commercialisation

1. Copier les entités contractantes, régions, DPA, sous-traitants, coordonnées et garanties de transfert depuis les contrats réellement signés.
2. Fixer des durées par catégorie et vérifier export, suppression, restauration et clôture de compte.
3. Adhérer au médiateur choisi et insérer ses coordonnées officielles dans les CGV et l’interface B2C.
4. Retenir Tiime Free pour émettre et recevoir les factures de l’entreprise de l’éditeur : l’offre officielle affiche la facturation et l’accès PA gratuits, et « TIIME PDP » figure dans la liste DGFiP des opérateurs satisfaisant aux conditions, tests d’interopérabilité inclus (immatriculation datée du 18 décembre 2025 au relevé du 30 octobre 2026). Créer le compte et vérifier les conditions en vigueur lors de l’inscription. Ce choix ne rend pas Aurion compatible : le code Aurion n’est pas relié à Tiime ni à une autre PA. Il faut concevoir plus tard un connecteur conforme ou continuer à gérer les factures d’Aurion dans l’interface Tiime.
5. Faire relire les documents et valider fiscalité, TVA, mentions de facture et parcours de vente. Effectuer un achat, une facture, un remboursement et une rétractation de bout en bout.
6. Publier les documents juridiques finalisés avec une version de publication approuvée, puis ouvrir les inscriptions et paiements. Pour commencer en B2B seulement, le blocage juridique commun reste à lever; ne pas laisser un lien public de paiement B2C actif par inadvertance.

## Retour arrière

Avant le changement de DNS, revenir au service Oregon si Frankfurt échoue et si l’ancienne base/fichiers restent intacts. Après bascule, les écritures peuvent se répartir; figer les écritures ou restaurer une sauvegarde cohérente avant de router de nouveau. Ne pas faire de retour arrière de schéma destructif sans sauvegarde et décision explicite. Garder l’ancienne région en lecture seule ou hors trafic pendant la fenêtre convenue, puis supprimer uniquement après inventaire, validation et conservation requise.
