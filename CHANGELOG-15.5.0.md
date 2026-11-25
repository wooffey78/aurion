# Aurion 15.5.0 — fiabilité comptable, cohérence juridique et tarifaire

Base : arbre 15.4.70. Version **15.5.0** (VERSION.txt, package.json, lockfiles, index.html,
service worker). Aucun commit, push ou déploiement effectué.

## 1. Comptabilité : `voided_at` réellement créé

**Constat vérifié** : `business.ts` (annulation d’un règlement), `accounting-report.ts`,
`accounting.ts` et `accounting-export.ts` filtrent `voided_at is null`, mais aucune des
migrations 001–124 ne créait cette colonne sur `accounting_entries`. Une base neuve échouait
donc à l’annulation et à la lecture des rapports.

**Correctif** : migration strictement additive `125_accounting_entries_voided_at.sql`.

- `add column if not exists voided_at timestamptz` ;
- commentaire de colonne expliquant la sémantique (NULL = active, date = annulée) ;
- index partiel `idx_accounting_entries_active` sur `(organization_id, activity_id, entry_date desc)`
  limité aux écritures actives ;
- aucune donnée historique modifiée, aucun `delete`, aucun `drop`.

Contrat verrouillé par `backend/tests/v2-commercial-hardening.test.mjs` (migration + filtres
des quatre consommateurs).

## 2. Juridique : une seule version, 5.1

La porte applicative exigeait 5.1 (`account.ts`), mais le pré-vol et plusieurs documents
annonçaient encore 5.0.

Alignés sur **5.1** :

- `backend/scripts/check-legal-readiness.mjs` (`APPROVAL_EXPECTED`, messages) ;
- `docs/GO-LIVE-15.4.51.md`, `docs/CONTRAT-PILOTE.md`, `docs/CHECKLIST-PRE-PRODUCTION.md` ;
- en-tête et `APPROVAL` de `backend/.env.example` ;
- CGU/CGV, politique de confidentialité, cookies, mentions légales, déclaration
  d’accessibilité, DPA et registre des traitements (version produit 15.5.0).

Le pré-vol reste volontairement **bloquant** tant que les variables d’identité de l’éditeur,
le sous-traitant et le médiateur ne sont pas renseignés. Aucune valeur légale n’a été inventée.

## 3. Documents : catalogue unique des 12 modèles

Nouveau module `backend/src/services/document-styles.ts` : identifiants, libellés,
descriptions, palettes, polices, rayons et variante de mise en page des 12 modèles.

- `routes/documents.ts` expose le catalogue et valide les choix via `isDocumentStyle` ;
- `services/document-renderer.ts` déduit le thème via `themeForDocumentStyle` ;
- le carrousel 3D existant conserve ses 12 aperçus et son comportement (aucune régression
  visuelle voulue) ;
- test de contrat : chaque modèle possède ses PDF devis/facture et ses aperçus PNG.

## 4. Tarifs et modèle de paiement : une seule vérité

La grille commerciale annonçait 39 €/mois alors que les migrations 053/072, les CGU et le
code de checkout utilisent **14,00 € TTC/mois** et **151,20 € TTC/an**. Le contrat pilote
annonçait 19,50 €, soit −50 % d’un prix qui n’était plus le prix réel.

Décision retenue : conserver le prix effectivement stocké et facturé, puis aligner la
documentation.

- `docs/TARIFS-ABONNEMENT.md` : 14,00 € TTC/mois, 151,20 € TTC/an (−10 %), pilote à
  7,00 €/mois la première année, sans reconduction automatique ;
- `docs/CONTRAT-PILOTE.md` : 7,00 €/mois la première année ;
- Stripe Checkout reste en `mode=payment` : chaque période est commandée ponctuellement,
  aucun prélèvement récurrent n’est créé. Ce choix est désormais explicitement documenté et
  cohérent avec les CGU 5.1 ;
- le montant envoyé à Stripe provient de `plans.price_ht_cents` (`price_data`), pas d’un
  identifiant de prix externe : une seule source de vérité.

## 5. CSP et interface

Le carrousel utilisait `style="--i:…"` et le graphique de prévision `style="background:…"`,
alors que la CSP est `style-src 'self'`. Ces attributs ont été supprimés :

- les cartes du carrousel sont positionnées par le JavaScript existant (`element.style`),
  sans attribut inline dans le HTML ;
- les trois pastilles de légende utilisent les classes `.legend-entries`, `.legend-outputs`,
  `.legend-net` définies dans `app.css` ;
- aucun changement de couleurs, de contrastes ni d’esprit visuel Aurion.

## 6. Vérifications exécutées

Le test d’intégration Google Drive disposait d’un import vers `tests/helpers/fake-google.mjs`
qui n’existait pas dans l’arborescence : la CI PostgreSQL aurait échoué avant même d’exécuter
le scénario. Le double local a été ajouté (OAuth, dossiers, recherche par propriété, upload
multipart, MD5/taille, reprise, quota, révocation) et vérifié manuellement sur ses routes.

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm run build` | 0 erreur |
| `npm run test:frontend` | 50 fichiers vérifiés |
| `npm audit --prefix backend --omit=dev --audit-level=high` | 0 vulnérabilité |
| Suite backend complète (Node 24, chargeur Windows temporaire) | **850 tests, 758 réussis, 0 échec, 92 ignorés** |
| Contrat V2 (`v2-commercial-hardening.test.mjs`) | 5/5 |
| `npm --prefix backend run check:legal -- --strict` | 0/6 documents prêts — variables d’identité, hébergeur, sous-traitants et médiateur absents (blocage externe attendu) |

Les 92 tests ignorés sont des intégrations PostgreSQL/LibreOffice/Google réelles ou des
scénarios nécessitant des secrets de production ; ils ne sont jamais comptés comme réussis.
Aucun test PostgreSQL réel n’a été exécuté dans cet environnement.

## 7. Limites externes restantes (non masquées)

- Variables légales d’identité, hébergeur, sous-traitants et médiateur à fournir et valider
  juridiquement avant publication ;
- compte Stripe marchand réel, recette de paiement/remboursement/webhooks et décision
  commerciale finale à confirmer ;
- plateforme agréée de facturation électronique non connectée : la transmission
  réglementaire n’est pas opérationnelle ;
- provisionnement OVHcloud, rôles SQL, sauvegarde restaurée et supervision à exécuter ;
- pilote de 10 entreprises non démarré.

Ces points ne peuvent pas être levés par du code seul ; ils conditionnent la commercialisation
réelle et empêchent d’annoncer honnêtement 95 % de préparation commerciale.
