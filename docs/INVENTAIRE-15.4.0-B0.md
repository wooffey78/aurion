# Aurion 15.4.0 — Inventaire initial B0 (fichier:ligne)

Date du relevé : 31 octobre 2026. Base : archive 15.3.20, commit `eba2a831d9a37a194bef266cf6c57985d7c29787`.

Cet inventaire localise les points d'ancrage à revérifier avant chaque retrait. Il ne vaut pas décision de suppression. Les lignes indiquées sont celles de l'archive examinée.

## 1. IA — D3

| Zone | Fichier:ligne | Constat B0 |
|---|---|---|
| Enregistrement backend | `backend/src/app.ts:24,80` | Import puis enregistrement de `aiAssistanceRoutes`. |
| Routes IA | `backend/src/routes/ai-assistance.ts:238,378-410` | Appel fournisseur OpenAI et endpoints `/ai/status`, `/ai/data-absorption/preview`, `/ai/data-absorption/commit`. |
| IA locale | `backend/src/services/local-ai.ts:4-18,58` | Choix du fournisseur local, URL Ollama et modèle. |
| API front | `assets/js/core/api.js:9,11` | Méthodes de prévisualisation/validation d'absorption et état du fournisseur IA. |
| Import de données | `assets/js/pages/data-import.js:48,67` | Écran d'import qui utilise la prévisualisation et la validation. L'import métier doit rester ; isoler la partie IA avant retrait. |
| Installateur Windows | `scripts/Install-Aurion.ps1:9-18,24-39,57,178` | Détection, démarrage, téléchargement et variables Ollama. |
| Variables | `backend/.env.example:39-48`, `render.yaml:21` | Fournisseur local, URL/modèle Ollama, clés fournisseurs gérés et variable Render IA. |
| Documentation | `CONFIGURATION-ASSISTANTS-IA.md` (racine), `docs/IA-LOCALE.md:1-10` | Documentation de configuration et de fonctionnement local. |

**Précaution B1 :** `assets/js/core/suggest.js`, `assets/js/core/recommendations.js` et `assets/js/core/forecast.js` existent. Leur présence ne prouve pas une dépendance à un modèle ; vérifier leurs appels et conserver les heuristiques déterministes. Les historiques et documents juridiques citant l'IA doivent être conservés et répertoriés conformément à D3.

## 2. Recherche d'entreprise par nom — D4/D5

| Zone | Fichier:ligne | Constat B0 |
|---|---|---|
| Écran de recherche publique | `assets/js/pages/company-lookup.js:26-34,114` | Formulaire de recherche par nom/dénomination ; appel `api.companySearch(query)`. |
| Enregistrement dans le tableau de bord | `assets/js/pages/dashboard.js:14,16-17,45,54` | Import du module, entrée `companyLookup` dans VIEWS/NAV, dataset et chargement de configuration. |
| Recherche publique par nom | `backend/src/services/public-registry.ts:67`, `backend/src/routes/business.ts:570` | `searchFrenchCompanies` et route `GET /suppliers/search`. |
| Détection par identifiant | `backend/src/services/public-registry.ts:32`, `backend/src/routes/business.ts:569` | `lookupFrenchCompany` et route `GET /suppliers/lookup` avec identifiant. À conserver et améliorer pour SIREN/SIRET. |
| Recherche interne globale | `backend/src/routes/business.ts:670` | `GET /search/all` parcourt les clients, fournisseurs, devis/factures et SAV de l'organisation. Ce n'est pas la recherche publique par nom ; ne pas la retirer au seul motif qu'elle cherche des noms internes. |
| Tests | `backend/tests/company-directory.contract.test.mjs:8,11,20`, `backend/tests/company-existing-onboarding.contract.test.mjs` | Contrats associés au module et à la configuration existante ; revoir leur portée avec D4/D5. |

**Précaution B2 :** la route SIREN/SIRET `/suppliers/lookup` est distincte de la recherche par nom `/suppliers/search`. La recherche interne `/search/all` a des consommateurs métier différents et ne doit pas être supprimée sans preuve de consommateurs.

## 3. Rétractation — D8

| Zone | Fichier:ligne | Constat B0 |
|---|---|---|
| Lien dans la barre latérale | `assets/js/pages/dashboard.js:208` | Lien `withdrawal-nav-link` vers `#/withdrawal`. |
| Page publique | `assets/js/pages/legal.js:37-48` | `renderWithdrawal` et formulaire public. |
| Client API | `assets/js/core/api.js:13` | `requestWithdrawal` vers `POST /billing/withdrawal`. |
| Route de demande | `backend/src/routes/account.ts:64-97` | Enregistrement de la demande et accusé de réception. |
| Administration | `backend/src/routes/admin.ts:49-67` | Liste, statut et renvoi de l'accusé de réception. |
| Données | `backend/migrations/070_contract_withdrawal_requests.sql` | Migration existante à préserver. |
| Mon compte | `assets/js/pages/dash/account.js` | Aucun point d'ancrage « withdrawal/rétractation » trouvé dans le fichier au relevé B0 ; la section D8 est à ajouter en réutilisant les routes existantes. |

**Précaution B6 :** retirer uniquement le lien latéral ; conserver la route publique `/withdrawal` et réutiliser la logique d'enregistrement et d'accusé de réception. La qualification juridique de l'accès direct reste à confirmer.

## 4. Logo — D6 et B5.1

| Zone | Fichier:ligne | Constat B0 |
|---|---|---|
| Colonne de stockage | `backend/migrations/001_initial.sql:10` | La table `organizations` possède le champ `logo_key`. |
| Export comptable | `backend/src/services/accounting-report.ts:11-12,46` | Lit l'objet privé référencé par `organizations.logo_key` et l'insère dans le PDF. |
| Signature e-mail | `backend/src/services/signature.ts:95-108` | Lit le logo privé et l'attache au message par CID quand un logo est présent. |
| Route documents | `backend/src/routes/documents.ts` | Aucun endpoint `GET/POST /documents/logo` retrouvé dans l'archive. |
| Service de marque | `backend/src/services/brand-assets.ts` | Fichier absent de l'archive. |
| Onboarding existant | `assets/js/pages/onboarding.js:18-22` | Parcours actuel « Entreprise / Personnalisation / Tableau de bord », sans étape logo visible dans cet ancrage. |

**À CONFIRMER avant B5.1 :** la colonne et les consommateurs de lecture existent, mais le chemin actuel de téléversement/écriture du logo de l'organisation n'a pas été identifié dans l'archive. Ne pas choisir ni créer un endpoint avant d'avoir identifié le stockage et ses autorisations. Le `logo_url` des fournisseurs est un champ distinct.

## 5. Périmètres à protéger pendant les blocs

- Recherche interne globale de clients/fournisseurs/devis/factures/SAV : `backend/src/routes/business.ts:670`.
- Import de données métier : `assets/js/pages/data-import.js` (retirer uniquement la dépendance IA si confirmée).
- Heuristiques candidates à conserver après audit : `assets/js/core/suggest.js`, `assets/js/core/recommendations.js`, `assets/js/core/forecast.js`.
- Rétractation publique et migration 070.
- Données historiques de configuration IA et changements historiques : ne pas supprimer en base ; conserver les références historiques demandées par D3.
