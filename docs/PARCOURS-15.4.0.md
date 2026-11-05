# Parcours d'accueil 15.4.0 — propagation champ par champ (D7)

Ordre : **Vous → Votre entreprise → Votre activité → Votre logo → Votre messagerie → Votre signature e-mail → Vos documents → Récapitulatif.**
Justification : chaque étape ne demande que ce que les précédentes ont permis de préremplir ; la signature arrive après l'identité, l'entreprise et le logo dont elle dépend ; le cloud est proposé une fois l'identité posée, avec l'adresse de connexion en `login_hint`. Messagerie (D10), logo, signature et cloud peuvent être reportés ; seuls prénom/nom et dénomination sont exigés.

Seul l'avancement (étape, étapes faites/reportées) est propre au parcours : `organizations.configuration_data.onboarding`. Aucune table « brouillon » métier.

| Étape | Champ | Table / colonne | Paramètres | Mon compte |
|---|---|---|---|---|
| Vous | Prénom + nom | `users.full_name` | Signature (préremplissage) | Profil → Nom complet |
| Vous | Téléphone | `users.phone_mobile` | Signature (préremplissage) | Téléphone mobile |
| Vous | Fonction | `users.job_title` (073) | Signature → Fonction | Profil → Fonction |
| Entreprise | Dénomination | `organizations.name` | Raison sociale | Mon entreprise |
| Entreprise | SIRET / SIREN | `organizations.siret`, `siren` | SIRET / SIREN | Mon entreprise |
| Entreprise | Forme juridique | `organizations.legal_form` | Forme juridique | Mon entreprise |
| Entreprise | Adresse, CP, ville | `organizations.address`, `postal_code`, `city` | Adresse du siège, CP, ville | Mon entreprise |
| Entreprise | Activité (registre) | `organizations.activity` | Activité / métier | Mon entreprise |
| Entreprise | Code NAF | `configuration_data.naf_code` | Code NAF | — |
| Entreprise | N° TVA | `configuration_data.vat_number` | N° de TVA intracommunautaire | Mon entreprise |
| Entreprise | Site internet | `organizations.website` | Site web | — |
| Activité | Métier | `activity_profile_overrides` (activité principale) | Activités → Métier | — |
| Activité | Activité précise | `organizations.custom_activity` | Activité précise | Mon entreprise |
| Activité | Modules | `configuration_data.questionnaire` + `organization_modules` | Configuration fonctionnelle | — |
| Logo | Image | `organizations.logo_key` (stockage privé existant) | Logo de l'entreprise | — |
| Messagerie | Compte d'envoi | `mail_accounts` (composant existant) | Messagerie & agenda | — |
| Signature | Tous champs | `settings` signature (route `/settings/email-signature`) | Signature e-mail | — |
| Documents | Connexion cloud | `cloud_connections` | Stockage | — |

Détection SIRET/SIREN : `assets/js/core/company-detect.js`, unique pour le parcours et Paramètres ; au clic, validation locale (Luhn, exception La Poste), délai 10 s, propositions « Appliquer / Ignorer ».
