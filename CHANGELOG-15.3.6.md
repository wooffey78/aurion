# Aurion 15.3.6

## Fiabilité de distribution Windows

- Le constructeur du setup exclut maintenant tout fichier `.env` privé, y compris `.env.local`, `.env.production` et leurs variantes, tout en conservant `.env.example`.
- Ajout de `npm run test:setup-package`, une recette Windows reproductible qui construit le setup, injecte deux fichiers secrets temporaires pour vérifier leur exclusion, contrôle les fichiers requis et exécute l’extraction dans un dossier isolé.
- La recette vérifie la version extraite et nettoie ses fichiers temporaires après une exécution réussie.

## Validation de cette livraison

Le setup a été construit puis extrait réellement avec succès : 388 fichiers, version 15.3.6. Un document DOCX de contrôle a également été converti en PDF par le LibreOffice installé, avec une signature PDF valide. Cette vérification couvre le paquet autonome, son extraction et le moteur de conversion local. Elle ne valide pas l’installation complète avec téléchargements réseau, PostgreSQL, lancement applicatif, comptes SMTP/OAuth ni le parcours documentaire de bout en bout dans Aurion.
