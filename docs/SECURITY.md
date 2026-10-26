# Modèle de sécurité Aurion

## Niveau développement local

Aurion utilise une authentification serveur avec cookie HttpOnly. Les données métier principales ne sont pas conservées comme source de vérité dans `localStorage`.

Ne mettez toutefois pas de données professionnelles sensibles dans cet environnement de développement.

## Mesures présentes

### Identité
- mots de passe hachés côté serveur avec Argon2id ;
- cookie HttpOnly ;
- JWT à durée courte ;
- limitation des tentatives ;
- aucun mot de passe dans le navigateur.

### Autorisation
- rôles owner/admin/member ;
- contrôle de l'organisation côté serveur ;
- requêtes métier filtrées par `organization_id`.

### Fichiers
- liste blanche de types ;
- taille maximale ;
- noms de stockage aléatoires ;
- stockage privé local ;
- statut initial `quarantined`.

### Web
- CORS configurable ;
- Helmet ;
- rate limiting ;
- validation serveur.

## Manques avant production

- HTTPS et cookies Secure ;
- révocation/rotation avancée des sessions ;
- vérification e-mail ;
- récupération de compte ;
- MFA/passkeys serveur ;
- protection CSRF selon l'architecture retenue ;
- inspection du type réel des fichiers ;
- antivirus ;
- stockage objet privé ;
- téléchargement avec autorisation et URLs temporaires ;
- CSP stricte ;
- audit complet ;
- sauvegardes et restauration testée ;
- monitoring et alertes ;
- tests E2E et tests d'isolation multi-tenant ;
- audit de sécurité.

« Parfaitement sécurisé » ne peut pas être garanti par cette archive seule : la sécurité de production dépend aussi de l'infrastructure, des secrets, des dépendances, des procédures et des audits.
