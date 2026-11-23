# Aurion 15.4.34 — rapport de consolidation comparative

## 1. Sources analysées

- `aurion-main-upgrade (1).zip` et `aurion-main-upgrade(1).zip` : mêmes octets, SHA-256 `8d45e74b91236656e5c864efde3b2c45f220da40388ca4e7dadde57012582af6`. Ils contiennent 14 patchs différentiels, et non une archive source autonome.
- `aurion-aurion-15.4.1-render-ready.zip` : code 15.4.0, 16 commits devant le `main` distant de départ. Il est plus ancien que la base retenue.
- `aurion-15.4.23(1).zip` : `VERSION.txt` et les deux `package.json` déclarent 15.4.23, mais le README annonce 15.4.4 et les lockfiles sont incohérents (15.4.0 / 15.4.20).
- `aurion-15.4.33-consolidee.zip` (Library) : base la plus récente et la plus aboutie, retenue pour le portage. 651 fichiers au départ, 84 migrations numérotées jusqu'à 087.
- GitHub `wooffey78/aurion:main`, relu au cours de la comparaison : `88226bca01f6191249cfc0a367d66995a0670b86`, version déclarée 15.4.0.

Les deux ZIP `main-upgrade` étant identiques, ils ne constituent pas deux lots d'améliorations supplémentaires.

## 2. Inventaire des améliorations absentes du `main` distant initial

### 2.1 Apports du lot 15.4.23, déjà intégrés dans la base 15.4.33

La comparaison des fichiers `backend/src/routes`, `backend/src/services` et `backend/migrations` montre que tous les fichiers présents dans 15.4.23 existent aussi dans 15.4.33. Les ajouts fonctionnels clés depuis le `main` 15.4.0 comprennent :

- migration 074 : isolation multi-tenant PostgreSQL par RLS ; rôles d'exécution et de migration distincts et accès administratif séparé ;
- migration 075 : boîte de réception des factures fournisseurs pour le flux PA ;
- migration 076 : émission de factures électroniques UBL 2.1 / CII D16B ;
- migration 077 : déclarations e-reporting, journalisation, idempotence et suivi des accusés ;
- migrations 078–079 : référentiel d'activités micro-entreprise et options fiscales ;
- migration 080 : liens de paiement ; cette fonction existante est conservée, sans ajout de nouveau système de paiement dans ce portage ;
- migration 081 : rôle comptable ;
- migration 082 : recherche tolérant les accents ;
- migration 083 : rapprochement bancaire ;
- services d'export comptable, calendrier fiscal, détection et référentiels micro, observabilité et transparence ;
- gestion des notes de frais et stockage cloud ; synchronisation de compte.

15.4.33 va plus loin que 15.4.23 : réplication hors ligne, outbox, compléments de synchronisation inter-appareils et migrations 084–086, puis migration 087 de suivi de livraison des invitations VIP. Les fichiers compilés `backend/dist` contenus dans 15.4.23 n'ont pas été copiés : ce sont des artefacts générés et ils doivent être régénérés lors du build.

### 2.2 Apports de la branche 15.4.1-render-ready déjà présents dans 15.4.33

- Accès administrateur permanent et contournement des limites d'abonnement pour l'administrateur ;
- invitations VIP, attribution aux comptes existants, gestion des invitations et statistiques ;
- migrations de synchronisation et améliorations du panneau d'administration ;
- chargement indépendant des sections du panneau, conservation des dernières données et relance individuelle ;
- améliorations du calcul HT du prévisionnel et harmonisation des entrées prévues TTC/SAV ;
- documents juridiques versionnés 4.0 dans la base 15.4.33, qui remplacent les anciens documents 2.3 ;
- wrapper Capacitor et structure Android/iOS déjà présents dans la base 15.4.33 : l'ancien wrapper Android/TWA du donor ne doit pas les remplacer.

### 2.3 Apports effectivement manquants et portés dans 15.4.34

1. **Stockage S3 Neon en path-style** : option `AURION_S3_FORCE_PATH_STYLE=true`, qui garde l'hôte de l'endpoint et préfixe le bucket dans le chemin. Le mode virtual-host OVH reste le défaut. La validation binaire des logos PNG/JPEG/WebP de 15.4.33 est conservée.
2. **Administration — relance globale** : bouton « Tout réessayer » limité aux sections qui sont réellement en échec ; les demandes de rétractation sont incluses uniquement si cette section est en erreur. La relance individuelle et le cache de dernières données sont conservés.
3. **Retour e-mail fidèle** : la conversion devis → facture et l'envoi de PDF affichent le statut réel de l'API ; l'interface n'annonce plus un envoi qui n'a pas été confirmé. Les messages de mise en file hors ligne restent distincts.
4. **Diagnostic de configuration Render** : les scripts de démarrage et de pré-migration affichent les noms et formats de variables manquants/invalides sans révéler leurs valeurs. La garde de production continue à refuser le démarrage/la migration lorsque la configuration requise manque.
5. **Politique CI mutualisée** : extraction du parseur TAP, de l'évaluation du code de sortie et de la comparaison baseline dans `tools/ci-gate-policy.mjs`, réutilisés par `tools/verify-b0-baseline.mjs`.
6. **Contrats de non-régression** : tests alignés sur la logique 15.4.33 pour la carte du tableau de bord, la relance admin, l'envoi e-mail, les dialogues, la politique CI, la préparation Render et les deux modes d'adressage S3.
7. **Versionnement** : `package.json`, `backend/package.json`, `VERSION.txt`, les deux lockfiles et le README sont alignés sur 15.4.34. Les lockfiles d'origine de la base 15.4.33 étaient incohérents (15.4.29 et 15.4.20).

## 3. Éléments volontairement non fusionnés

- **Migrations 074/075 de l'ancienne branche 15.4.1** : leurs numéros sont déjà utilisés dans la lignée 15.4.33 par d'autres migrations. Les copier créerait une collision historique. L'invitation VIP est déjà couverte par la migration 087 de la base retenue.
- **Suppression de compte de 15.4.1** : son flux enregistre une demande à traiter manuellement ; il n'efface pas effectivement l'identité, les données métier, les documents, les fichiers, les sessions et les secrets. Il ne doit pas être présenté comme une suppression effective. C'est un chantier restant, pas une fonction aboutie à importer telle quelle.
- **TWA / Android Gradle / assetlinks de la branche 15.4.1** : architecture antérieure et concurrente du wrapper Capacitor d'15.4.33. Importer ces fichiers risquerait de remplacer ou de doubler la cible native actuelle. Les captures, icônes et textes de fiche Play Store du donor décrivent en outre l'ancienne version 15.4.0 ; ils ne sont pas considérés comme assets de sortie fiables pour 15.4.34.
- **Documents juridiques 2.3** : remplacés par les documents 4.0 plus récents de la base 15.4.33. La version 4.0 et son verrou d'approbation de publication sont conservés. Leur publication réelle en base et la complétude des mentions restent à vérifier avant vente.
- **Script Render permissif `-Branch`** : non repris. Le script 15.4.33, plus strict, limite la livraison au dépôt attendu, à `main`, au SHA distant vérifié et au service gratuit confirmé. Un test fige cette règle.
- **Test dashboard 15.4.1 de 551 lignes copié tel quel** : non repris car il contient des assertions anciennes sur les intitulés et bases de calcul ; il échoue avec les corrections déjà présentes dans 15.4.33. Il est remplacé par un contrat compact correspondant à l'implémentation actuelle.
- **`400771b` et `deploy/main-v2` communiqués précédemment** : ni le commit `400771b` ni la branche distante `deploy/main-v2` n'ont été retrouvés dans le dépôt GitHub connecté. Le lot de cotisations annoncé n'est donc pas prétendu intégré.

## 4. Modifications dans la source 15.4.34

- 16 fichiers modifiés ; 12 fichiers ajoutés ; aucun fichier supprimé ; aucune migration historique modifiée ; aucune nouvelle migration introduite.
- 663 fichiers source/configuration/docs/tests dans l'archive finale.
- 155 fichiers de test backend dans l'arborescence finale.
- 84 migrations présentes, maximum 087 ; les anciens doublons de préfixe 042 et 044 étaient déjà dans la base et n'ont pas été modifiés.

## 5. Vérifications fraîchement exécutées

- `npm run test:smoke` : **118/118 réussis**.
- `npm run test:business` : **42/42 réussis**.
- `npm run test:frontend` : **45 fichiers contrôlés** par `node --check`, imports relatifs et exports vérifiés dans 44 modules.
- Tests syntaxiques Node sur les fichiers JS/MJS et TypeScript modifiés : réussis.
- Version des deux manifestes, deux lockfiles et des deux fichiers VERSION : 15.4.34.
- Suite backend complète `npm --prefix backend test` : 440 tests découverts, 341 passés, 28 échoués, 71 ignorés. **La même base 15.4.33 intacte, testée dans le même environnement, avait 417 tests, 318 réussis, 28 échoués et 71 ignorés : les 28 échecs sont identiques, aucun nouvel échec n'a été introduit.** Les échecs hérités sont notamment liés à l'absence de `pg`, à `backend/dist` non compilé et à quelques contrats historiques qui attendent des libellés précédents.
- Le build complet, le typecheck, ESLint, les tests navigateur, l'intégration PostgreSQL/RLS et la recette réelle S3 n'ont pas été validés ici : `node_modules`, `backend/dist`, serveur PostgreSQL et service S3 de test ne sont pas disponibles dans cet environnement.

## 6. État de publication

Cette archive est la source cumulative 15.4.34 à utiliser comme version candidate unique. **GitHub `main` n'a pas été modifié et Render n'a pas été déployé dans cette opération.** Le connecteur GitHub disponible ne permet pas de transférer en une opération contrôlée l'arborescence complète de 663 fichiers à partir du ZIP local ; un patch partiel sur le `main` 15.4.0 serait dangereux et ne constituerait pas la consolidation demandée. Le push et le déploiement doivent être effectués à partir de cette archive dans un clone Git complet, après build/typecheck et validation PostgreSQL.

## 7. État d'avancement avant commercialisation

Grille inchangée, avec retrait des poids Play Store (2 points) et systèmes de paiement (3 points), total retenu 95 :

| Domaine | Poids | 15.4.33 de référence | 15.4.34 |
|---|---:|---:|---:|
| Produit métier, calculs, non-régression | 12 | 90 % | 90 % |
| Synchronisation, réplication, hors ligne | 16 | 78 % | 78 % |
| Documents locaux, stockage, appareils | 7 | 70 % | 71 % |
| Web/PWA/Windows/Android/iOS, hors stores | 8 | 42 % | 42 % |
| Infrastructure, migrations, sauvegardes, restauration | 12 | 28 % | 29 % |
| Sécurité, RLS, secrets, RGPD technique, supervision | 10 | 70 % | 70 % |
| Google, Brevo, PA et facturation électronique, hors paiements | 9 | 35 % | 35 % |
| Juridique, médiateur, tarification | 8 | 50 % | 50 % |
| Tests, accessibilité, bêta, support, exploitation | 13 | 60 % | 62 % |
| **Total pondéré normalisé** | **95** | **59,8 %** | **60,3 %** |

Ces scores restent des estimations prudentes de préparation commerciale : ils ne remplacent pas les preuves d'un build complet, d'une migration répétée sur PostgreSQL, d'une restauration testée, de la recette de stockage objet, de la validation des mentions juridiques et d'une bêta avec utilisateurs/appareils réels.
