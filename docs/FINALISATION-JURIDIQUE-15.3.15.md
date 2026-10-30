# Informations requises pour finaliser les documents Aurion

Les projets de documents juridiques sont intégrés dans `docs/` et reproduits dans `legal/`. Ils sont volontairement conservés en brouillon. Les variables d’environnement présentes dans Render ne suffisent pas à prouver qu’un texte est complet : le code garde en brouillon tout document contenant un marqueur de projet ou un champ à compléter.

## Identité de l’éditeur

- Raison sociale complète, forme juridique, adresse du siège et capital social si applicable.
- SIREN, SIRET du siège, immatriculation RCS/RM lorsque applicable et numéro de TVA intracommunautaire ou motif légal de non-attribution.
- Nom du directeur ou de la directrice de publication.
- Adresse e-mail de contact juridique, support, confidentialité et accessibilité.
- Confirmation du périmètre commercial : professionnels exclusivement ou également consommateurs.

## Prestataires et localisation

Pour chaque service effectivement activé : nom de l’entité contractante, fonction, catégorie de données, pays/région d’hébergement, durée de conservation, DPA, éventuels transferts hors EEE et mécanisme applicable. Pour les mentions légales, relever aussi l’adresse postale et le numéro de téléphone de chaque hébergeur.

- Render : hébergement applicatif et région du service.
- Neon : base PostgreSQL, région, calendrier de sauvegarde et durée de rétention.
- Stripe : paiement par carte, uniquement si activé.
- Google : préciser les fonctions OAuth, Gmail ou Calendar réellement activées.
- Service SMTP : nommer le fournisseur réellement utilisé pour les courriels Aurion et/ou la messagerie connectée.
- IA distante : nommer le fournisseur configuré, les champs ou fichiers transmis, les régions, la conservation et l’usage éventuel pour l’entraînement. Distinguer cette voie du mode Ollama exécuté localement.
- Tout autre service de journaux, suivi d’erreurs, support, stockage objet ou analyse réellement en production.

## Données, sécurité et conservation

- Durées exactes par catégorie : comptes, journaux, courriels, fichiers, factures, support, données après expiration et sauvegardes.
- Procédure testée de restitution et suppression incluant base, fichiers, sauvegardes et systèmes des sous-traitants.
- Configuration de stockage durable privé, sauvegardes chiffrées, restauration testée et procédure de violation de données.
- Vérification de la liste des cookies et stockages sur le site déployé; confirmer l’absence de traceurs non essentiels ou ajouter une interface de consentement appropriée.
- Registre des traitements et annexe technique RGPD réconciliés avec le fonctionnement de production.

## Offre commerciale et conformité produit

- Confirmer prix affichés, taxes, mode de paiement, activation Stripe/virement, remboursement, durée d’accès, résiliation, export et assistance.
- Si l’offre est B2B seulement, ajouter et vérifier la déclaration de qualité professionnelle au parcours d’inscription et de commande.
- Si des consommateurs peuvent souscrire, ajouter les informations précontractuelles, droit et formulaire de rétractation lorsqu’applicable, médiateur de la consommation réellement choisi, médiation et parcours de résiliation requis.
- Faire qualifier l’assujettissement d’Aurion aux obligations d’accessibilité, puis réaliser l’audit RGAA lorsqu’il s’applique; renseigner le résultat réel, le plan d’action et les voies de recours.
- Intégrer une plateforme agréée ou un partenaire compatible pour l’acheminement réglementaire des factures si cette conformité est revendiquée.
- Faire relire la version datée des CGV, mentions, politique de confidentialité et annexe de traitement par un avocat/juriste français; publier les versions approuvées et vérifier l’historique des acceptations.

## Variables utilisées par l’application

- `AURION_LEGAL_PUBLISHER_NAME`
- `AURION_LEGAL_PUBLISHER_FORM`
- `AURION_LEGAL_PUBLISHER_SIREN`
- `AURION_LEGAL_PUBLISHER_SIRET`
- `AURION_LEGAL_PUBLISHER_ADDRESS`
- `AURION_LEGAL_PUBLISHER_VAT` (indiquer une valeur justifiée ou « non applicable » avec motif)
- `AURION_LEGAL_DIRECTOR`
- `AURION_LEGAL_PUBLISHER_EMAIL`
- `AURION_PRIVACY_CONTACT_EMAIL`
- `AURION_HOST_NAME`, `AURION_HOST_ADDRESS`, `AURION_HOST_CONTACT`
- `AURION_SUBPROCESSORS` (liste réellement vérifiée, rôles et lieux)
- `AURION_ACCESSIBILITY_CONTACT_EMAIL`, `AURION_ACCESSIBILITY_AUDIT_DATE`, `AURION_ACCESSIBILITY_AUDIT_RESULT`

Le remplissage de ces paramètres ne publie pas un document à lui seul si son texte contient encore un marqueur ou un champ à compléter. Après chaque modification, vérifier dans Aurion que la bonne version courante est affichée, que son statut n’est plus brouillon uniquement après validation, et que la preuve d’acceptation référence cette version.
