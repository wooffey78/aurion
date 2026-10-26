# Aurion 14.2 — reprise depuis la sauvegarde

Cette version reprend la sauvegarde fournie et réapplique les évolutions validées sans repartir de zéro.

## Parcours et authentification
- `/login` ouvre directement le mode connexion ; « Commencer » reste dédié à la création de compte.
- Dernier e-mail utilisé proposé localement sur l'appareil ; aucun mot de passe n'est enregistré par cette fonction.
- Sessions natives : access token court de 30 min, refresh token rotatif de 30 jours, révocation, `session_version`, `/auth/refresh`, identification IP/user-agent.
- Authentification web par cookie conservée ; les clients futurs peuvent utiliser `Authorization: Bearer`.
- Déconnexion globale révoque également les refresh tokens.

## Onboarding
- Correction du formulaire de configuration de première ouverture.
- Ajout de « Configurer plus tard » pour accéder au tableau de bord sans terminer la messagerie.

## Documents
- Garantie laissée facultative, y compris vide ou valeur `0` côté interface.
- Création directe d'une facture sans passer par un devis.
- Trois mises en page natives Aurion pour les devis et trois pour les factures, choisies indépendamment.
- Aperçu visuel des six choix ; choix modifiable à tout moment.
- Les modèles natifs ne sont plus proposés en téléchargement comme fichiers modèles.
- Les modèles personnels DOCX/ODT restent importables.
- Logo natif agrandi d'environ 2 % dans les documents générés.

## Agenda
- Heure de début et heure de fin distinctes.
- Validation frontend et backend : la fin ne peut pas être antérieure au début.

## Temps économisé
- Mesure d'une prise en charge client : temps manuel estimé saisi par l'utilisateur + temps réel chronométré par Aurion.
- Compteurs cumulés et moyenne du temps économisé sur le tableau de bord.

## Support
- Module Support Aurion dans le tableau de bord.
- Catégories prédéfinies + description libre.
- Numérotation des tickets par entreprise et par année.
- Envoi vers l'adresse support configurée ; l'adresse du compte Aurion est utilisée comme Reply-To pour permettre une réponse directe.

## Interface
- « IMEI » retiré du libellé de navigation ; le module reste générique.
- Section logo renommée pour ne plus employer « compte ».
- Clic sur le logo Aurion du tableau de bord : retour au tableau de bord.

## Installation / documents
- LibreOffice préparé automatiquement pendant l'installation Windows et conservé dans le runtime privé d'Aurion.
- Vérification de la signature numérique du MSI téléchargé avant extraction.
- Configuration API centrale préparée pour `https://aurion-pt0l.onrender.com` tout en conservant le mode local/Live Server.
