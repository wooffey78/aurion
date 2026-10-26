# Aurion 13.0

## Installation et démarrage
- **Un seul fichier** `Aurion-Setup.bat` contenant tout le projet (auto-extractible) ; icônes Bureau + menu Démarrer ; proposition de lancement en fin d'installation.
- **Aucune saisie dans PowerShell** : plus de mot de passe PostgreSQL, plus d'adresse e-mail. PostgreSQL est **embarqué et dédié** à Aurion (`@embedded-postgres`), Node.js portable si absent. Aucun droit administrateur.
- Le lanceur **ferme le serveur puis PostgreSQL avant de les relancer** ; applique les migrations ; ouvre Aurion en **plein écran**.
- `Stop-Aurion`, diagnostic, journaux ; scripts testés sous PowerShell 7 / Linux (installation complète, démarrage, redémarrage, arrêt).

## Messagerie et agenda (encart Aurion, saisie unique)
- Adresse + mot de passe (mot de passe d'application pour Gmail, etc.) saisis dans Aurion ; chiffrés (AES-256-GCM) et vérifiés avant enregistrement.
- Devis, factures et rappels envoyés depuis l'adresse de l'entreprise (PDF joint).
- Agenda : invitation `.ics` (création, modification, annulation) envoyée à la messagerie ; API Google Agenda en option avancée.

## Calculateur
- Le **prix TTC voulu fixe la marge** ; la marge nette voulue recalcule le prix. Le champ « objectif net » ne bloque plus le calcul. Formule inverse corrigée. Vente à perte signalée.
- Calcul identique navigateur / serveur (test de parité sur 200 cas).

## Devis et factures
- Lignes de pièces avec **quantités** ; le client ne voit que : prestation, pièces (type + quantité), garantie, **total TTC**.
- Trois moteurs de mise en page natifs, aérés : **PDF**, **DOCX**, **ODT** (styles propres à chaque format).
- Consultation (aperçu PDF) et téléchargement fiables ; erreurs affichées dans Aurion (plus de page d'erreur du navigateur).
- Numérotation continue (DEV-2026-0001 / FA-2026-0001), même après suppression.

## À chaque métier son Aurion
- Profils smartphone, plomberie, web / logiciel, bâtiment, générique : vocabulaire, prestations, pièces, calculateur (livraison ou non), dossiers (Appareils / IMEI, Installations, Projets, Chantiers).
- « Ajouter les éléments proposés pour ce métier » sur chaque activité.

## Modifier / supprimer partout
- Prestations, pièces, prix fournisseurs, fournisseurs, garanties, appareils, clients, rendez-vous, devis, factures, documents, modèles, activités : boutons **Modifier** / **Supprimer** visibles (les « × » étaient masqués par le style).
- Après une action, on reste sur l'écran courant.

## Correctifs
- Limite de requêtes (120/min) qui provoquait « La requête a échoué » : portée à 1500/min et rechargements ciblés.
- Logo : PNG ou JPEG (formats pris en charge par les trois moteurs).
