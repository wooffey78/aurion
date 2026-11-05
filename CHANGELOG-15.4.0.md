# Aurion 15.4.0

## Ajouts (cahier des charges « stockage documentaire cloud »)
- Stockage des documents dans le Google Drive de l'utilisateur (autorisation `drive.file`), arborescence « Aurion — Mon entreprise » créée une seule fois.
- File d'attente locale persistante (IndexedDB), reprise automatique, transferts idempotents, confirmation par MD5/taille, conflits sans écrasement, factures émises protégées.
- Quota affiché en permanence dans Paramètres → Stockage ; alertes 80/90/95/100 % dans le journal de bord (notification unique mise à jour).
- Archivage d'un devis ou d'une facture dans le cloud (bouton « Cloud » de Devis & factures).
- Notes de frais : ajout, modification, consultation, téléchargement, suppression, export CSV, transfert du justificatif vers le cloud ; prises en compte en achats HT, TVA déductible et sorties de trésorerie.
- Parcours d'accueil en 8 étapes (Vous, Entreprise, Activité, Logo, Messagerie, Signature, Documents, Récapitulatif) ; note « adresse e-mail dédiée » ; logo téléversable dès l'accueil (PNG/JPEG/WebP, type réel vérifié, SVG refusé).
- Rétractation dans « Mon compte » (formulaire prérempli + historique) ; route publique `/withdrawal` conservée.
- Fonction (poste) de l'utilisateur ; « Mon entreprise » visible dans Mon compte.
- Render : deux services (Frankfurt `aurion`, Oregon `aurion-web`), groupe de variables commun, déploiement automatique désactivé.

## Retraits
- Toute l'IA (routes `/ai/*`, service Ollama, variables, installateur, documentation). L'import de données reste disponible en mode déterministe (`/data-import/*`).
- Recherche d'entreprise par nom (outil dédié, menu, route `/suppliers/search`, bouton fournisseur « Détecter par nom »).
- Détection automatique pendant la saisie : la détection SIRET/SIREN se fait au clic.
- Code mort d'envoi administratif Gmail (parcours de création administrative).
- Lien de rétractation de la barre latérale et de l'écran d'accueil.
- Brevo codé en dur dans `render.yaml` et `.env.example`.

## Corrections
- `PATCH /activities/:id` n'efface plus la description, la forme juridique, les CGV ni le taux de cotisations quand ils ne sont pas transmis.
- L'interface servie par n'importe quel service Render appelle son propre backend (même origine) au lieu d'un service codé en dur.
- Liens « Commencer » / « Se connecter » de l'accueil alignés sur la page statique (test qui échouait déjà en 15.3.20).
- Registre public : SIRET d'établissement secondaire, unité ou établissement fermé signalés, exception La Poste, N° de TVA calculé, erreurs 429/indisponibilité distinguées, limitation de débit.
- Messagerie : recherche de préréglage robuste si la liste de domaines est absente.

## Migration
- `073_cloud_storage_expense_reports_onboarding.sql` (additive, idempotente, testée deux fois de suite sur PostgreSQL 16).
