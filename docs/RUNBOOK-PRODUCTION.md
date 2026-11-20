# Runbook de production — Aurion 15.4.30

> Procédure opérationnelle de mise en production, de sauvegarde et de restauration.
> **État au 14 novembre 2026 : procédure prête, exécution sur l'infrastructure réelle non effectuée** (les cases restent cochables au fil des opérations). Ce runbook complète `docs/CHECKLIST-PRE-PRODUCTION.md` (recette) et `docs/PLAN-BASCULE-FRANKFURT-15.3.20.md` (bascule DNS). Aucune opération de ce runbook ne peut être exécutée depuis le code : elle exige les accès Render, PostgreSQL et OVHcloud de l'éditeur.

## 0. Environnements : bêta privée, préproduction, production

- **Développement/démonstration** : Render gratuit temporaire + base PostgreSQL d'essai — interdit aux données clients réelles.
- **Bêta privée** : services OVH provisionnés pour bêta (dimensionnement réduit, cf. `docs/INFRA-OVH-COUTS.md`), comptes pilotes/VIP uniquement, sauvegarde avant chaque évolution.
- **Préproduction** : même architecture que la production, données fictives, répétition de migration à blanc (`docs/MIGRATION-RENDER-OVH.md`).
- **Production** : OVH définitif, bascule DNS contrôlée, fenêtre annoncée, rollback documenté ; Render n'y participe plus.

## 1. Provisionnement de l'infrastructure cible

Cible de production : **OVHcloud région Francfort/UE** — backend Node (VPS ou offre équivalente à confirmer au Bloc 12), PostgreSQL et bucket Object Storage privé région `de`, alignés géographiquement pour la résidence UE des données. **Décision éditeur : Render demeure GRATUIT et TEMPORAIRE** (développement/démonstration uniquement, `render.yaml` = `plan: free`, aucune formule payante) ; après la bascule et la fenêtre de retour, aucune donnée client réelle ne doit rester sur Render. Tant que les services OVH ne sont pas créés, ils sont à considérer « non provisionnés » ; cette procédure reste à exécuter avec les accès de l'éditeur.

- [ ] Créer (ou confirmer) la base PostgreSQL gérée en région européenne (Francfort) et noter son URL d'administration.
- [ ] Créer les rôles selon `docs/POSTGRES-ROLES.md` : rôle migrateur propriétaire (`AURION_MIGRATION_DATABASE_URL`), rôle applicatif runtime (`DATABASE_URL`, `AURION_RUNTIME_DB_ROLE=aurion_runtime`). Le bootstrap idempotent de `backend/src/migrate.ts` crée les rôles NOLOGIN référencés par les migrations si le migrateur en a le droit ; sinon, échec explicite `BOOTSTRAP_ROLE_IMPOSSIBLE` avant tout fichier.
- [ ] Créer le bucket OVHcloud Object Storage région `de` (Francfort), **privé**, sans accès public, avec une clé dédiée aux droits minimum (variables `AURION_S3_*`).
- [ ] Confirmer dans le tableau de bord Render que le service `aurion` est en région Frankfurt, **plan gratuit** (respect strict de la décision : jamais Starter/payant), auto-déploiement désactivé, et que le service historique `aurion-web` (Oregon) n'est plus géré par le blueprint (à supprimer uniquement après la bascule DNS et la fenêtre de retour arrière).
- [ ] Renseigner les secrets dans le tableau de bord Render (jamais dans Git ni dans un ZIP) : `DATABASE_URL`, `AURION_MIGRATION_DATABASE_URL`, `AURION_ADMIN_DATABASE_URL`, `AURION_RUNTIME_DB_ROLE`, `JWT_SECRET`, `AURION_ENCRYPTION_KEY`, `AURION_S3_*`, SMTP, Google, Stripe, PA (liste complète : `backend/.env.example`).
- [ ] Déployer une fois, vérifier `https://<url>/health` puis `/health/db`, et confirmer que les 85 migrations s'appliquent puis rejouent sans effet (idempotence).

## 2. Sauvegardes indépendantes

Deux niveaux indépendants : le fournisseur de base (snapshots automatiques du plan) **ne suffit pas** — une sauvegarde contrôlée par l'éditeur, stockée hors de la base de production, est obligatoire (règle 3-2-1 : 3 copies, 2 supports, 1 hors site).

- [ ] **Base de données** : avant chaque déploiement et quotidiennement, exporter un dump logique avec `pg_dump` (format `--format=custom` pour restauration sélective) depuis l'URL d'administration, puis le chiffrer et le copier vers un emplacement distinct du bucket applicatif (autre compte/autre région UE). Conserver au minimum 30 jours glissants.
- [ ] **Fichiers privés** : synchronisation périodique du bucket OVH applicatif vers un second emplacement (autre bucket/autre projet OVH ou export chiffré), car les documents clients ne vivent pas dans PostgreSQL.
- [ ] **Secrets de chiffrement** : `AURION_ENCRYPTION_KEY` (et `AURION_ENCRYPTION_KEY_PREVIOUS` pendant une rotation) sauvegardés dans le gestionnaire de secrets — **sans eux, les secrets chiffrés (SMTP, OAuth) et les fichiers chiffrés deviennent illisibles après restauration**. Ne jamais stocker ces clés dans la même sauvegarde que les données qu'elles chiffrent.
- [ ] **Journal des migrations** : `schema_migrations` est inclus dans les dumps ; noter la version applicative (`VERSION.txt`) du jour de chaque dump.

## 3. Test de restauration complète (à exécuter AVANT l'ouverture commerciale)

Un test de restauration est la seule preuve que les sauvegardes servent à quelque chose. L'exécuter sur un environnement jetable, jamais en écrasant la production :

- [ ] Restaurer le dernier dump sur une base PostgreSQL jetable (`pg_restore --format=custom`).
- [ ] Restaurer les fichiers privés du second emplacement vers un bucket jetable.
- [ ] Démarrer l'application sur cette base/bucket jetables avec les **mêmes** variables que la production (y compris `AURION_ENCRYPTION_KEY`) : `npm run build` puis `node dist/migrate.js` (doit répondre « déjà appliquée » pour les 80 migrations), puis `npm start`.
- [ ] Vérifier, sur un compte de test : connexion, lecture d'un client, d'une facture, d'un devis, d'un justificatif (le fichier s'ouvre depuis le bucket jetable), export complet `/documents/export-all.zip` cohérent, secrets SMTP/OAuth déchiffrables.
- [ ] Vérifier l'isolation : une requête sans contexte tenant ne renvoie aucune ligne (RLS active après restauration).
- [ ] Consigner la date, les vérifications et les écarts dans `docs/CHECKLIST-PRE-PRODUCTION.md`. Le test de restauration se rejoue après toute modification d'infrastructure, et au moins une fois par trimestre.

## 4. Retour arrière et incidents

- L'instance historique `aurion-web` (Oregon) reste la voie de retour arrière pendant la bascule ; après bascule DNS + fenêtre de retour, la supprimer dans Render (elle est hors blueprint, la synchronisation ne la touchera pas).
- Retour applicatif : redéployer l'image/commit précédent via « Manual Deploy » ; ne jamais revenir en arrière sur le schéma de base sans sauvegarde préalable et décision explicite (les migrations sont additives).
- Incident de données : figer les écritures, restaurer selon la section 3 sur l'environnement jetable, comparer, puis basculer. Toute suppression de données source est précédée d'un inventaire et respecte les durées de conservation comptables.
