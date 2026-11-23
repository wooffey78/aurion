# Mentions obligatoires — référentiel des factures émises (15.4.53)

Ce document est la **référence unique** partagée par le code (`backend/src/services/mention-gate.ts`, constante `BLOCKING_MENTION_KEYS`) et par l'interface (fenêtre « Facturer »). Il répertorie les mentions légales appliquées aux factures et devis par le moteur de mentions (`backend/src/services/mentions.ts`), leur provenance et leur effet à l'émission. Sources internes : textes cités dans le moteur (Code de la consommation L217-3 s., Code civil 1641 s.), formulation des pénalités (taux légal ×3 + indemnité de recouvrement 40 € pour les professionnels) et documents juridiques du dépôt (docs/Aurion-15.4.22-Textes-juridiques-4.0.docx). **Toute nouvelle obligation est d'abord ajoutée au moteur, puis à ce tableau, puis à la constante de blocage — dans cet ordre, jamais l'inverse** (règle : Aurion n'invente pas une valeur juridique, il exige qu'elle soit saisie).

## Mentions BLOQUANTES à l'émission d'une facture (dès 15.4.53)

| Clé | Mention | Profils concernés | Où se saisit la valeur | Effet si manquante |
|---|---|---|---|---|
| `identity` | Dénomination, forme juridique, SIREN/SIRET de l'entreprise | Toutes | Paramètres → Identité légale (SIRET/SIREN de l'entreprise) | Émission refusée : `422 MENTIONS_INCOMPLETES` (clé `identity`) |
| `insurance` | Assurance professionnelle / décennale (assureur, n° de contrat, couverture) | Métiers travaux : plomberie, électricité, bâtiment, auto (liste `WORKS` du moteur) | Paramètres → Mentions légales de l'activité (`insurance_info`) | Émission refusée (clé `insurance`) |
| `mediator` | Médiateur de la consommation (vente aux clients particuliers) | Vente aux particuliers (liste `CONSUMER` du moteur) | Paramètres → Mentions légales de l'activité (`mediator_info`) | Émission refusée (clé `mediator`) |

La mention `identity` est calculée sur les données de l'**organisation** (SIRET/SIREN) ; `insurance` et `mediator` sur les paramètres de l'**activité** du document. Le verdict est calculé côté serveur à l'émission (source de vérité) ; la pré-vérification `GET /mentions/blocking?documentId=…` utilise le même moteur et n'est qu'une aide d'affichage.

## Mentions NON bloquantes (formulées automatiquement ou détectées)

| Clé | Mention | Comportement |
|---|---|---|
| `vat` | TVA au taux configuré, ou « TVA non applicable, article 293 B du CGI » | Auto (avec note de confirmation pour la franchise en base) — jamais `needs_confirmation` : ne bloque pas |
| `payment` | Conditions de paiement ; à défaut, formulation générale légale (pénalités au taux légal ×3, indemnité 40 € clients professionnels) | Auto — adaptée dans Paramètres → Mentions légales |
| `validity` | Validité du devis (30 jours par défaut, paramétrable) | Auto / saisie — concerne les devis, jamais bloquante |
| `legal-warranty` | Garanties légales (L217-3 s. C. conso ; 1641 s. C. civ.) pour la vente de biens | Auto pour les profils « biens » |
| `notes` | Notes légales libres de l'activité | Reproduites si saisies |

## Facturation électronique (bloc 4) — exigences distinctes, déjà implémentées

Les mentions propres au format électronique sont contrôlées par le module dédié et **ne passent pas** par la porte des mentions bloquantes (pas de double contrôle) : SIREN du client à 9 chiffres obligatoire pour les factures électroniques, catégorie d'opération (normalisation sans valeur inventée). Statut documentaire : fichier structuré « préparé, non transmis » tant qu'aucune plateforme agréée n'est souscrite (CGU art. 15-quater).

## Grandfathering et preuve

- Le contrôle bloquant s'applique à l'émission de **factures nouvelles** uniquement (transition devis → facture) : aucun re-contrôle rétroactif des documents émis avant 15.4.53, aucun impact sur les brouillons et les devis.
- À chaque émission réussie, l'instantané complet des mentions (provenance incluse) est conservé sur la facture (`quotes.mentions_snapshot`, migration 120) : le document reste reproductible à l'identique même si les paramètres évoluent ensuite.
- Cohérence document ↔ code vérifiable en continu : `npm --prefix backend run check:legal` compare ce tableau à `BLOCKING_MENTION_KEYS` et à la liste des documents contractuels.
