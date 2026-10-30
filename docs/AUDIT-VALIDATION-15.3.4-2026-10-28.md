# Aurion 15.3.4 — audit technique et validations

> Rapport historique du 28 octobre 2026 : ses résultats concernent la copie de travail et l’archive examinées à cette date. Ils ne décrivent pas `aurion-main.zip` reçu le 29 octobre ; pour cette remise, voir `FINALISATION-AURION-15.3.4.md`.

Date : 28 octobre 2026
Base de travail : Aurion 15.3.4, commit de référence `e8c14a559e25c828d65855c294d07081de6325a7` (`main`).
Statut : copie de travail locale, **aucun push GitHub et aucun déploiement Render réalisés**.

## 1. Corrections réalisées dans cette copie

1. **Installation Windows / LibreOffice** — conservation du correctif d'installation déjà fourni : progression du téléchargement, tentative BITS puis repli HTTP, délai borné, deux tentatives, contrôle de taille et signature du MSI. LibreOffice reste facultatif pour que son échec ne bloque pas l'installation du cœur d'Aurion.
2. **Journal d'installation** — correction d'un caractère de contrôle dans le chemin `logs\aurion.log` du message d'avertissement LibreOffice.
3. **Thème de l'interface** — rétablissement d'un thème clair bleu pâle (`#f1f6fc`) avec texte bleu foncé (`#173252`) et champs lisibles. La feuille CSS de base avait également une accolade fermante manquante autour de la couche responsive ; celle-ci a été ajoutée avant la couche de thème afin que les couches CSS soient correctement séparées.
4. **Cache statique** — mise à jour des versions de cache-busting dans `index.html` vers `15.3.4-r1`, cohérentes avec le cache du service worker `aurion-shell-v15.3.4-r1`.
5. **Synchronisation entre appareils** — période nominale ramenée à environ une seconde, avec temporisation adaptative en cas d'échec (jusqu'à 16 secondes) ; aucune interception globale de `fetch` ni rechargement complet ajouté.
6. **Vérification des imports front-end** — le vérificateur résout désormais les imports relatifs portant un paramètre de cache (`?v=...`) ou un fragment, comme le navigateur.
7. **Contrats de tests** — actualisation de plusieurs tests qui vérifiaient encore des versions de cache antérieures, l'ancien nombre de paramètres SQL, ou l'ancien prévisionnel manuel. Les tests reflètent désormais les contrats de la copie 15.3.4 : insertion de document à 52 colonnes/paramètres, mise à jour à 44 paramètres, et prévision automatique sans saisie manuelle d'hypothèses.

## 2. Résultats réellement exécutés

| Vérification | Résultat | Portée / limite |
|---|---|---|
| `npm run test:frontend` | **Réussi** | 34 fichiers vérifiés avec `node --check` ; imports relatifs et exports contrôlés dans 33 modules. |
| `npm run test:smoke` | **Réussi : 48/48** | Contrats de routes, catalogue replié, fournisseurs, documents, sécurité du service worker et autres tests de fumée ciblés. |
| `node --test backend/tests/*.test.mjs` | **249 réussis, 12 en échec, 2 ignorés** | Les 12 échecs observés proviennent de dépendances absentes/incomplètes et de tests qui chargent `backend/dist` sans avoir pu reconstruire celui-ci. Voir la section 3. |
| Contrôle structurel de `assets/css/app.css` | **Réussi** | Accolades équilibrées après correction. |
| Intégrité de l'archive d'origine | **Réussie avant modification** | La copie a été extraite de l'archive complète 15.3.4 avec correctif d'installation. |

## 3. Vérifications non validables dans cet environnement

- **Build TypeScript / typecheck : bloqué**, car l'installation des dépendances n'a pas pu être terminée. `npm ci --offline` s'est arrêté faute du paquet `zod` dans le cache local ; la tentative en ligne a expiré. Le build signale notamment l'absence des définitions de types `node`, `pg`, `pdfkit`, `nodemailer`, `adm-zip` et `smtp-server`.
- **12 tests backend restants : non concluants, pas assimilés à des régressions confirmées.** Plusieurs chargent `pg`, `nodemailer` ou `zod` manquants. Les tests de configuration de production chargent `backend/dist/config.js` alors que le build requis pour le régénérer n'a pas pu être exécuté.
- **Lint ESLint : non exécuté jusqu'au bout**, car `npx eslint@8.57.1` a expiré pendant la récupération du paquet.
- **Tests navigateur E2E : bloqués** : le script exige `DATABASE_URL` vers une base PostgreSQL de test déjà migrée. Aucune base de test dédiée n'était disponible ici.
- **Installation Windows réelle : non exécutée** ; cet environnement ne permet pas de valider le comportement de Windows PowerShell, BITS, UAC, MSI ou de LibreOffice sur le poste utilisateur.
- **Render / intégrations distantes : aucun changement effectué**. Les communications par e-mail distantes restent exclues des critères bloquants tant que Render Free est l'environnement de test.

## 4. Couverture fonctionnelle et statut

### Contrôles statiques et tests automatisés partiellement couverts

- Catalogue métier replié par défaut ; contrat des fournisseurs et sauvegarde du prix fournisseur.
- Routes et absence de routes dupliquées ; paramètres SQL de création et de mise à jour des devis/factures.
- Calculs de tarification et prévisionnel automatique ; séparation des coûts directs et du coefficient commercial.
- Relances, statuts de facture et protections contre certains doubles comptages via les tests disponibles.
- Journal de bord et parcours guidé administratif : contrats d'état, confirmation explicite des actions et distinction entre données détectées et état final.
- Authentification, passkeys/WebAuthn et repli par mot de passe : contrats statiques disponibles.
- Service worker : restrictions de cache et absence de mise en cache des réponses métier privées.

Ces résultats **ne remplacent pas** une recette complète avec base migrée, utilisateur de test et navigateur.

### Recette réelle encore nécessaire

1. Créer, modifier, rechercher, filtrer, importer/exporter et supprimer chaque type de donnée du catalogue ; enregistrer puis relire les prix fournisseurs.
2. Créer un devis, le modifier, le convertir en facture, vérifier les lignes, pièces, main-d'œuvre, frais, TVA et calculs ; générer, ouvrir et télécharger les PDF.
3. Tester paiements partiels et complets, échéances, relances 1 à 4, majorations, erreurs d'envoi et reprise après erreur, sans double comptabilisation.
4. Comparer comptabilité, trésorerie et prévisionnel à un jeu de données connu ; vérifier les exports.
5. Effectuer une sauvegarde puis une restauration dans une base isolée ; contrôler les permissions, sessions, organisations et cloisonnement des données.
6. Tester clients/fournisseurs, journal de bord, agenda, SAV/garanties, temps passé, tableaux de bord et téléchargements.
7. Tester inscription, connexion, déconnexion, récupération du mot de passe, expiration/révocation de session, passkeys sur appareils compatibles et chemins d'erreur/annulation.
8. Tester absorption de fichiers par l'IA : aperçu, correction avant validation, doublons/conflits, enregistrement au bon endroit, erreurs fournisseur et confirmation obligatoire avant action ayant des conséquences.
9. Tester l'interface sur ordinateur et sur smartphone en portrait et paysage ; mesurer les performances avec un protocole reproductible.
10. Vérifier la configuration et la connexion de chacun des deux services Render et confirmer explicitement quelle base de données chacun utilise ; ne pas supposer qu'ils partagent une base.

## 5. Décision de validation

**Cette copie est un candidat de correction à vérifier, pas une version certifiée à 100 %.** Les contrôles front-end et les tests de fumée passent, mais la compilation TypeScript, les tests backend complets, la recette E2E sur PostgreSQL et l'installation Windows réelle restent à valider dans un environnement disposant des dépendances et services nécessaires. Aucun push ni déploiement n'a été effectué.
